'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { analyze, publicQuestions, getQuestions, DEFAULT_QUESTIONS } = require('./lib/psychology');
const { FORM_FIELDS, DEFAULT_REQUIRED_FIELDS, PERMISSION_DEFINITIONS, initialSettings } = require('./lib/config');

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.MINIHRM_DATA_DIR ? path.resolve(process.env.MINIHRM_DATA_DIR) : path.join(ROOT, 'storage');
const STORE_PATH = path.join(DATA_DIR, 'data.json');
const APP_BASE_RAW = (process.env.APP_BASE_PATH || '').trim().replace(/^\/+|\/+$/g, '');
const APP_BASE_ENV = APP_BASE_RAW ? `/${APP_BASE_RAW}` : '';
const STAFF_COOKIE = 'minihrm_session';
const CANDIDATE_COOKIE = 'minihrm_applicant';
const STAFF_SESSION_MS = 8 * 60 * 60 * 1000;
const CANDIDATE_SESSION_MS = 4 * 60 * 60 * 1000;
const OTP_TTL_MS = 5 * 60 * 1000;
const SESSION_SECRET = crypto.randomBytes(32);

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || 'request_error';
  }
}

function freshStore() {
  return {
    schemaVersion: 1,
    installed: false,
    installedAt: null,
    users: [],
    jobs: [],
    candidates: [],
    applications: [],
    audit: [],
    settings: initialSettings()
  };
}

let store = freshStore();
let writeQueue = Promise.resolve();
const staffSessions = new Map();
const candidateSessions = new Map();
const otpChallenges = new Map();
const otpCooldowns = new Map();
const loginAttempts = new Map();
const requestLimits = new Map();

async function atomicWriteStore() {
  await fsp.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  const tmp = `${STORE_PATH}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
  await fsp.rename(tmp, STORE_PATH);
  try { await fsp.chmod(STORE_PATH, 0o600); } catch (_) {}
}

async function loadStore() {
  await fsp.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  try {
    const raw = await fsp.readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.users)) throw new Error('Invalid storage format');
    store = { ...freshStore(), ...parsed, settings: { ...initialSettings(), ...(parsed.settings || {}) } };
    store.settings.modules = { ...initialSettings().modules, ...(store.settings.modules || {}) };
    store.settings.otp = { ...initialSettings().otp, ...(store.settings.otp || {}) };
    store.settings.rolePermissions = { ...initialSettings().rolePermissions, ...(store.settings.rolePermissions || {}) };
    if (!Array.isArray(store.settings.formRequired)) store.settings.formRequired = DEFAULT_REQUIRED_FIELDS.slice();
    if (!Array.isArray(store.settings.questionOverrides)) store.settings.questionOverrides = [];
    if (!Array.isArray(store.settings.customRoles)) store.settings.customRoles = [];
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    store = freshStore();
    await atomicWriteStore();
  }
}

async function mutate(fn) {
  const previous = writeQueue;
  let release;
  writeQueue = new Promise((resolve) => { release = resolve; });
  await previous;
  try {
    const result = fn(store);
    await atomicWriteStore();
    return result;
  } finally {
    release();
  }
}

function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('hex'); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const digest = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${digest}`;
}
function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [method, salt, digest] = stored.split('$');
  if (method !== 'scrypt' || !salt || !digest) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function safeString(value, max = 4000) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}
function bool(value) { return value === true || value === 'true' || value === 1; }
function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const cookies = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    cookies[key] = val;
  }
  return cookies;
}
function isSecure(req) {
  return Boolean(req.socket.encrypted || process.env.NODE_ENV === 'production' || (req.headers['x-forwarded-proto'] || '').toLowerCase().includes('https'));
}
function setCookie(res, req, name, value, maxAgeSeconds, pathValue = '/') {
  const parts = [`${name}=${value}`, `Path=${pathValue}`, `Max-Age=${maxAgeSeconds}`, 'HttpOnly', 'SameSite=Lax'];
  if (isSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
function clearCookie(res, req, name, pathValue = '/') {
  const parts = [`${name}=`, `Path=${pathValue}`, 'Max-Age=0', 'HttpOnly', 'SameSite=Lax'];
  if (isSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
function json(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders });
  res.end(body);
}
function htmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function readJson(req, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      length += chunk.length;
      if (length > maxBytes) { tooLarge = true; chunks.length = 0; return; }
      if (!tooLarge) chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => {
      if (tooLarge) return reject(new HttpError(413, 'حجم اطلاعات ارسالی بیش از حد مجاز است.'));
      const body = Buffer.concat(chunks).toString('utf8');
      if (!body.trim()) return resolve({});
      try { resolve(JSON.parse(body)); } catch (_) { reject(new HttpError(400, 'ساختار درخواست معتبر نیست.')); }
    });
    req.on('error', reject);
  });
}
function appRouteAndBase(pathname) {
  let p = decodeURIComponent(pathname || '/');
  if (!p.startsWith('/')) p = `/${p}`;
  if (APP_BASE_ENV && (p === APP_BASE_ENV || p.startsWith(`${APP_BASE_ENV}/`))) {
    const base = `${APP_BASE_ENV}/`.replace(/\/+/g, '/');
    const route = p.slice(APP_BASE_ENV.length) || '/';
    return { route: route.startsWith('/') ? route : `/${route}`, base };
  }
  const apiIndex = p.indexOf('/api/');
  if (apiIndex >= 0) return { route: p.slice(apiIndex), base: `${p.slice(0, apiIndex)}/`.replace(/\/+/g, '/') };
  if (p.endsWith('/api')) {
    const idx = p.lastIndexOf('/api');
    return { route: '/api', base: `${p.slice(0, idx)}/`.replace(/\/+/g, '/') };
  }
  const assetsIndex = p.indexOf('/assets/');
  if (assetsIndex >= 0) return { route: p.slice(assetsIndex), base: `${p.slice(0, assetsIndex)}/`.replace(/\/+/g, '/') };
  if (p.endsWith('/apply')) return { route: '/apply', base: `${p.slice(0, -6) || ''}/`.replace(/\/+/g, '/') };
  if (p === '/') return { route: '/', base: '/' };
  if (p.includes('.')) return { route: p, base: '/' };
  return { route: '/', base: `${p.replace(/\/$/, '')}/`.replace(/\/+/g, '/') };
}
function renderHtml(filePath, basePath, res) {
  try {
    let html = fs.readFileSync(filePath, 'utf8');
    const safeBase = JSON.stringify(basePath);
    html = html.replaceAll('__APP_BASE_PATH__', safeBase).replaceAll('__APP_BASE_PATH_HTML__', htmlEscape(basePath));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' });
    res.end(html);
  } catch (error) {
    console.error('HTML load error:', error.message);
    json(res, 500, { error: 'صفحه سامانه در دسترس نیست.' });
  }
}
function sendStatic(route, res) {
  let pathname;
  try { pathname = decodeURIComponent(route); } catch (_) { return json(res, 400, { error: 'نشانی معتبر نیست.' }); }
  const target = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (!target.startsWith(`${PUBLIC_DIR}${path.sep}`)) return json(res, 403, { error: 'دسترسی مجاز نیست.' });
  fs.stat(target, (error, stat) => {
    if (error || !stat.isFile()) return json(res, 404, { error: 'فایل پیدا نشد.' });
    const ext = path.extname(target).toLowerCase();
    const types = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': ext === '.js' || ext === '.css' ? 'no-cache' : 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(target).pipe(res);
  });
}
function getStaffSession(req) {
  const token = parseCookies(req)[STAFF_COOKIE];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = staffSessions.get(token);
  if (!session || session.expiresAt < Date.now()) { staffSessions.delete(token); return null; }
  const user = store.users.find((item) => item.id === session.userId && item.active);
  if (!user) { staffSessions.delete(token); return null; }
  return { token, session, user };
}
function getCandidateSession(req) {
  const token = parseCookies(req)[CANDIDATE_COOKIE];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = candidateSessions.get(token);
  if (!session || session.expiresAt < Date.now()) { candidateSessions.delete(token); return null; }
  return { token, session };
}
function permissionsFor(user) {
  if (user.role === 'admin') return Object.fromEntries(PERMISSION_DEFINITIONS.map((p) => [p.key, true]));
  const role = store.settings.rolePermissions?.[user.role] || {};
  return Object.fromEntries(PERMISSION_DEFINITIONS.map((p) => [p.key, role[p.key] === true]));
}
function requireStaff(req, permission) {
  const auth = getStaffSession(req);
  if (!auth) throw new HttpError(401, 'برای ادامه وارد حساب کاربری شوید.', 'unauthorized');
  if (permission && !permissionsFor(auth.user)[permission]) throw new HttpError(403, 'شما به این بخش دسترسی ندارید.', 'forbidden');
  return auth;
}
function requireModule(name) {
  if (!store.settings.modules?.[name]) throw new HttpError(403, 'این ماژول در حال حاضر غیرفعال است.', 'module_disabled');
}
function audit(actor, action, target, summary) {
  if (!store.settings.modules?.auditLog) return;
  store.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), actor: actor ? actor.name : 'متقاضی', action, target: safeString(target, 120), summary: safeString(summary, 300) });
  if (store.audit.length > 500) store.audit.length = 500;
}
function asciiDigits(value) { return String(value ?? '').replace(/[۰-۹٠-٩]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩'.indexOf(digit) < 10 ? '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit) : '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))); }
function validIranNationalId(input) {
  const code = asciiDigits(input).replace(/\D/g, '');
  if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) return false;
  const sum = code.slice(0, 9).split('').reduce((total, digit, index) => total + Number(digit) * (10 - index), 0);
  const remainder = sum % 11;
  return Number(code[9]) === (remainder < 2 ? remainder : 11 - remainder);
}
function normalizeIranPhone(input) {
  let value = asciiDigits(safeString(input, 40)).replace(/[\s()\-]/g, '');
  if (value.startsWith('0098')) value = `+${value.slice(2)}`;
  if (value.startsWith('98') && !value.startsWith('+')) value = `+${value}`;
  if (/^09\d{9}$/.test(value)) value = `+98${value.slice(1)}`;
  if (!/^\+989\d{9}$/.test(value)) return null;
  return value;
}
function maskPhone(phone) { return phone.replace(/^(\+98\d{3})\d{5}(\d{2})$/, '$1•••••$2'); }
function e164(phone) { return phone; }
function getJob(id) { return store.jobs.find((job) => job.id === id); }
function activeApplications() { return store.applications.filter((app) => app.status !== 'rejected' && app.status !== 'hired'); }
function passwordRequirements(password) {
  return typeof password === 'string' && password.length >= 10 && password.length <= 200;
}
function validateJobInput(body, existing) {
  const title = safeString(body.title, 120);
  if (title.length < 2) throw new HttpError(400, 'عنوان موقعیت شغلی را وارد کنید.');
  const employmentTypes = ['full_time', 'part_time', 'remote', 'project'];
  const statuses = ['open', 'paused', 'closed'];
  return {
    title,
    department: safeString(body.department, 100),
    location: safeString(body.location, 120),
    employmentType: employmentTypes.includes(body.employmentType) ? body.employmentType : 'full_time',
    description: safeString(body.description, 5000),
    requirements: safeString(body.requirements, 3000),
    status: statuses.includes(body.status) ? body.status : 'open',
    closesAt: safeString(body.closesAt, 30),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
function safeSummary(app, includePsych = false) {
  const candidate = store.candidates.find((c) => c.id === app.candidateId) || {};
  const job = getJob(app.jobId) || {};
  const result = {
    id: app.id,
    candidateId: app.candidateId,
    name: candidate.name || 'بدون نام',
    phone: candidate.phone || '',
    email: candidate.email || '',
    nationalId: candidate.nationalId || '',
    jobTitle: job.title || 'موقعیت حذف‌شده',
    jobId: app.jobId,
    status: app.status,
    appliedAt: app.appliedAt,
    updatedAt: app.updatedAt,
    hasPsychology: Boolean(app.psychology?.analysis),
    noteCount: app.notes?.length || 0
  };
  if (includePsych && app.psychology?.analysis) result.personalityCode = app.psychology.analysis.code;
  return result;
}
function validateApplicantData(data, phone) {
  const input = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const scalarKeys = [
    'firstName', 'lastName', 'fatherName', 'nationalId', 'identityNumber', 'birthDate', 'placeOfIssue', 'religion', 'denomination', 'landline', 'email', 'insuranceHistory', 'insuranceYears', 'insuranceNumber', 'address', 'postalCode', 'militaryService', 'maritalStatus', 'spouseName', 'spousePhone', 'spouseJob', 'childrenCount', 'satisfaction', 'dissatisfaction', 'employmentType', 'availabilityHours', 'expectedSalary', 'startAvailability', 'referral', 'overtime', 'healthStatus', 'healthDetails', 'referenceName', 'referenceRelation', 'referencePhone'
  ];
  const result = {};
  for (const key of scalarKeys) result[key] = safeString(input[key], key === 'address' || key === 'satisfaction' || key === 'dissatisfaction' || key === 'healthDetails' ? 1500 : 240);
  result.nationalId = asciiDigits(result.nationalId).replace(/\D/g, '');
  result.phone = phone;
  const arrayFields = {
    workHistory: ['company', 'position', 'period', 'duration', 'lastSalary', 'reason', 'workPhone'],
    education: ['degree', 'major', 'institute', 'year'],
    languages: ['language', 'level'],
    softwareSkills: ['software', 'level'],
    training: ['title', 'institute', 'duration', 'certificate']
  };
  for (const [key, keys] of Object.entries(arrayFields)) {
    const items = Array.isArray(input[key]) ? input[key].slice(0, 12) : [];
    result[key] = items.map((item) => Object.fromEntries(keys.map((field) => [field, safeString(item?.[field], 220)]))).filter((item) => Object.values(item).some(Boolean));
  }
  result.missions = Array.isArray(input.missions) ? input.missions.filter((x) => ['short_domestic', 'long_domestic', 'short_foreign', 'long_foreign', 'unavailable'].includes(x)).slice(0, 5) : [];
  const photoData = safeString(input.photoData, 700000);
  result.photoData = /^data:image[.]jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photoData) ? photoData : '';
  result.declaredAccurate = bool(input.declaredAccurate);
  result.assessmentConsent = bool(input.assessmentConsent);
  const choices = {
    insuranceHistory: ['yes', 'no'], militaryService: ['completed', 'exempt', 'subject', 'not_applicable'],
    maritalStatus: ['single', 'married', 'other'], employmentType: ['full_time', 'part_time', 'remote', 'project'],
    overtime: ['yes_full', 'yes_notice', 'no'], healthStatus: ['yes', 'no']
  };
  for (const [key, allowed] of Object.entries(choices)) if (result[key] && !allowed.includes(result[key])) throw new HttpError(400, `گزینه فیلد «${key}» معتبر نیست.`);
  for (const key of ['insuranceYears', 'childrenCount']) if (result[key]) {
    result[key] = asciiDigits(result[key]).replace(/\D/g, '');
    if (!/^\d{1,2}$/.test(result[key])) throw new HttpError(400, `مقدار فیلد «${key}» معتبر نیست.`);
  }
  return result;
}
function validateRequiredForm(data) {
  const required = [...new Set(['firstName', 'lastName', ...(store.settings.formRequired || [])])];
  for (const key of required) {
    if (['workHistory', 'education', 'languages', 'softwareSkills', 'training'].includes(key)) {
      if (!Array.isArray(data[key]) || data[key].length === 0) {
        const label = FORM_FIELDS.find((f) => f.key === key)?.label || 'این بخش';
        throw new HttpError(400, `حداقل یک مورد برای «${label}» وارد کنید.`);
      }
    } else if (key === 'missions') {
      if (!data.missions.length) throw new HttpError(400, 'گزینه آمادگی مأموریت را انتخاب کنید.');
    } else if (!safeString(data[key], 2000)) {
      const label = FORM_FIELDS.find((f) => f.key === key)?.label || key;
      throw new HttpError(400, `تکمیل فیلد «${label}» الزامی است.`);
    }
  }
  if (!validIranNationalId(data.nationalId || '')) throw new HttpError(400, 'کد ملی معتبر وارد کنید؛ ۱۰ رقم را بررسی کنید.');
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new HttpError(400, 'نشانی ایمیل معتبر نیست.');
  if (data.referencePhone && !normalizeIranPhone(data.referencePhone) && !/^0\d{10}$/.test(data.referencePhone.replace(/\D/g, ''))) throw new HttpError(400, 'شماره تماس معرف معتبر نیست.');
  if (!data.declaredAccurate) throw new HttpError(400, 'برای ارسال فرم، تأیید صحت اطلاعات را علامت بزنید.');
  if (store.settings.modules.psychology && store.settings.psychologyRequired !== false && !data.assessmentConsent) {
    throw new HttpError(400, 'برای تکمیل ارزیابی، رضایت آگاهانه را تأیید کنید.');
  }
}
function hasLimit(key, limit, windowMs) {
  const now = Date.now();
  const data = requestLimits.get(key);
  if (!data || data.until <= now) {
    requestLimits.set(key, { count: 1, until: now + windowMs });
    return true;
  }
  if (data.count >= limit) return false;
  data.count += 1;
  return true;
}
function clientIp(req) {
  // With a reverse proxy, its final appended address is safer than a caller-supplied first X-Forwarded-For value.
  const forwarded = safeString(req.headers['x-forwarded-for'] || '', 300).split(',').map((part) => part.trim()).filter(Boolean);
  return safeString(forwarded.at(-1) || req.socket.remoteAddress || 'unknown', 80);
}
function csrfCheck(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  try {
    const originUrl = new URL(origin);
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
    if (host && originUrl.host.toLowerCase() !== host) throw new HttpError(403, 'درخواست از مبدأ نامعتبر رد شد.', 'csrf');
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(403, 'درخواست از مبدأ نامعتبر رد شد.', 'csrf');
  }
}
function roleLabel(role) {
  return ({ admin: 'مدیر کل سامانه', hr_manager: 'مدیر منابع انسانی', hr_staff: 'کارمند منابع انسانی', employee: 'کارمند شرکت' })[role] || store.settings.customRoles?.find((item) => item.key === role)?.name || 'کاربر';
}
function assignableRoleKeys() {
  return ['hr_manager', 'hr_staff', 'employee', ...(store.settings.customRoles || []).map((item) => item.key)];
}
function cleanUser(user, viewer = null) {
  return { id: user.id, name: user.name, username: user.username, role: user.role, roleLabel: roleLabel(user.role), active: user.active, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt || null, isSelf: viewer?.id === user.id };
}
function csvCell(value) {
  let text = value === undefined || value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
function listToCsv(rows) {
  const headers = ['نام و نام خانوادگی', 'عنوان شغلی', 'مرحله', 'تاریخ ثبت', 'شماره موبایل', 'ایمیل', 'کد ملی', 'شناسه پروفایل روان‌شناسی'];
  const lines = [headers, ...rows.map((row) => [row.name, row.jobTitle, statusLabel(row.status), row.appliedAt, row.phone, row.email, row.nationalId, row.personalityCode || ''])];
  return `\uFEFF${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}`;
}
function statusLabel(status) {
  return ({ new: 'جدید', screening: 'در بررسی', interview: 'مصاحبه', offer: 'پیشنهاد همکاری', hired: 'استخدام‌شده', rejected: 'رد شده', on_hold: 'در انتظار' })[status] || status;
}
function computeDashboard(user) {
  const permissions = permissionsFor(user);
  const applications = permissions['candidates.view'] ? store.applications : [];
  const jobs = permissions['jobs.view'] ? store.jobs : [];
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastSeven = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(dayStart);
    day.setDate(dayStart.getDate() - (6 - i));
    const key = day.toISOString().slice(0, 10);
    const count = applications.filter((a) => (a.appliedAt || '').slice(0, 10) === key).length;
    return { key, label: new Intl.DateTimeFormat('fa-IR', { weekday: 'short' }).format(day), count };
  });
  const stages = ['new', 'screening', 'interview', 'offer', 'hired', 'rejected', 'on_hold'].map((status) => ({ status, label: statusLabel(status), count: applications.filter((a) => a.status === status).length }));
  const latest = applications.slice().sort((a, b) => b.appliedAt.localeCompare(a.appliedAt)).slice(0, 6).map((a) => safeSummary(a, permissions['psychology.view']));
  const topJobs = jobs.map((job) => ({ id: job.id, title: job.title, status: job.status, applicants: applications.filter((a) => a.jobId === job.id).length })).sort((a, b) => b.applicants - a.applicants).slice(0, 5);
  const activeJobs = jobs.filter((job) => job.status === 'open');
  return {
    metrics: {
      openJobs: activeJobs.length,
      totalApplicants: applications.length,
      newApplicants: applications.filter((a) => a.status === 'new').length,
      interviews: applications.filter((a) => a.status === 'interview').length,
      assessments: permissions['psychology.view'] ? applications.filter((a) => a.psychology?.analysis).length : null
    },
    stages, lastSeven, latest, topJobs,
    organizationName: store.settings.organizationName,
    canSeeCandidates: permissions['candidates.view'],
    canManageJobs: permissions['jobs.manage'],
    updatedAt: new Date().toISOString()
  };
}
function sanitizeApplication(app, permissions) {
  const candidate = store.candidates.find((c) => c.id === app.candidateId) || {};
  const job = getJob(app.jobId) || {};
  const safe = {
    id: app.id, candidateId: app.candidateId,
    profile: { ...candidate },
    job: { id: app.jobId, title: job.title || 'موقعیت حذف‌شده', department: job.department || '', location: job.location || '' },
    status: app.status, appliedAt: app.appliedAt, updatedAt: app.updatedAt,
    formData: app.formData,
    notes: app.notes || [], timeline: app.timeline || [],
    assessment: null
  };
  if (!permissions['candidates.manage']) safe.notes = [];
  if (permissions['psychology.view'] && app.psychology?.analysis) safe.assessment = app.psychology.analysis;
  return safe;
}
function guessPublicBase(reqBase) { return reqBase || '/'; }

async function handlePublicApi(req, res, route, url) {
  if (route === '/api/public/init' && req.method === 'GET') {
    const modules = store.settings.modules || {};
    const jobs = modules.recruitment && modules.publicPortal ? store.jobs.filter((j) => j.status === 'open').map((j) => ({ id: j.id, title: j.title, department: j.department, location: j.location, employmentType: j.employmentType, description: j.description, requirements: j.requirements, closesAt: j.closesAt })) : [];
    return json(res, 200, {
      installed: store.installed,
      organizationName: store.settings.organizationName,
      portalEnabled: Boolean(modules.publicPortal && modules.recruitment),
      psychologyEnabled: Boolean(modules.psychology),
      psychologyRequired: store.settings.psychologyRequired !== false,
      otpMode: store.settings.otp?.mode || 'demo',
      demoCodeWillBeShown: process.env.NODE_ENV !== 'production' && store.settings.otp?.mode === 'demo',
      jobs,
      formFields: FORM_FIELDS,
      requiredFields: store.settings.formRequired || DEFAULT_REQUIRED_FIELDS,
      questions: modules.psychology ? publicQuestions(store.settings.questionOverrides) : []
    });
  }

  if (!store.installed) throw new HttpError(503, 'سامانه هنوز راه‌اندازی نشده است.');
  requireModule('publicPortal');
  requireModule('recruitment');

  if (route === '/api/public/otp/send' && req.method === 'POST') {
    if (!hasLimit(`otp-ip:${clientIp(req)}`, 8, 60 * 60 * 1000)) throw new HttpError(429, 'تعداد درخواست‌ها از این نشانی زیاد است؛ کمی بعد دوباره تلاش کنید.');
    const body = await readJson(req, 12 * 1024);
    const phone = normalizeIranPhone(body.phone);
    const jobId = safeString(body.jobId, 80);
    if (!phone) throw new HttpError(400, 'شماره موبایل معتبر وارد کنید؛ نمونه: 09123456789.');
    const job = getJob(jobId);
    if (!job || job.status !== 'open') throw new HttpError(404, 'موقعیت شغلی انتخاب‌شده فعال نیست.');
    const key = `${phone}:${jobId}`;
    const cooldown = otpCooldowns.get(key) || 0;
    if (cooldown > Date.now()) throw new HttpError(429, `برای ارسال دوباره کد، ${Math.ceil((cooldown - Date.now()) / 1000)} ثانیه صبر کنید.`);
    const code = String(crypto.randomInt(100000, 1000000));
    const hash = crypto.createHmac('sha256', SESSION_SECRET).update(`${phone}:${jobId}:${code}`).digest('hex');
    let demoCode;
    if (store.settings.otp.mode === 'ippanel') {
      const token = store.settings.otp.token;
      const fromNumber = store.settings.otp.fromNumber;
      if (!token || !fromNumber) throw new HttpError(503, 'ارسال پیامک آماده نیست. مدیر سامانه باید تنظیمات IPPanel را کامل کند.');
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        const response = await fetch('https://edge.ippanel.com/v1/api/send', {
          method: 'POST', signal: controller.signal,
          headers: { Authorization: token, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ sending_type: 'webservice', from_number: fromNumber, message: `کد تأیید ورود به فرم استخدام: ${code}\n${store.settings.organizationName}`, params: { recipients: [e164(phone)] } })
        }).finally(() => clearTimeout(timer));
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.meta?.status === false) {
          console.error('IPPanel rejected OTP request:', response.status, payload?.meta?.message_code || 'no_code');
          throw new HttpError(502, 'ارسال پیامک انجام نشد. شماره فرستنده و اعتبار حساب IPPanel را بررسی کنید.');
        }
      } catch (error) {
        if (error instanceof HttpError) throw error;
        console.error('IPPanel OTP request failed:', error.message);
        throw new HttpError(502, 'ارتباط با سرویس پیامک برقرار نشد؛ کمی بعد دوباره تلاش کنید.');
      }
    } else {
      if (process.env.NODE_ENV === 'production') throw new HttpError(503, 'حالت آزمایشی پیامک در محیط عملیاتی غیرفعال است؛ IPPanel را پیکربندی کنید.');
      demoCode = code;
      console.info(`[Mini HRM demo OTP] ${maskPhone(phone)}: ${code}`);
    }
    otpChallenges.set(key, { hash, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
    otpCooldowns.set(key, Date.now() + 60 * 1000);
    return json(res, 200, { sent: true, phone: maskPhone(phone), expiresIn: 300, ...(demoCode ? { demoCode } : {}) });
  }

  if (route === '/api/public/otp/verify' && req.method === 'POST') {
    if (!hasLimit(`otp-verify:${clientIp(req)}`, 25, 15 * 60 * 1000)) throw new HttpError(429, 'تعداد تلاش‌های تأیید زیاد است؛ کمی بعد دوباره تلاش کنید.');
    const body = await readJson(req, 12 * 1024);
    const phone = normalizeIranPhone(body.phone);
    const jobId = safeString(body.jobId, 80);
    const code = safeString(body.code, 10);
    if (!phone || !/^\d{6}$/.test(code)) throw new HttpError(400, 'شماره موبایل یا کد واردشده معتبر نیست.');
    const key = `${phone}:${jobId}`;
    const challenge = otpChallenges.get(key);
    if (!challenge || challenge.expiresAt < Date.now()) { otpChallenges.delete(key); throw new HttpError(400, 'کد تأیید منقضی شده است؛ کد تازه بگیرید.'); }
    challenge.attempts += 1;
    if (challenge.attempts > 5) { otpChallenges.delete(key); throw new HttpError(429, 'تعداد تلاش مجاز تمام شد؛ کد تازه بگیرید.'); }
    const candidateHash = crypto.createHmac('sha256', SESSION_SECRET).update(`${phone}:${jobId}:${code}`).digest('hex');
    const a = Buffer.from(challenge.hash, 'hex');
    const b = Buffer.from(candidateHash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(400, 'کد تأیید نادرست است.');
    otpChallenges.delete(key);
    const token = randomToken();
    candidateSessions.set(token, { phone, jobId, expiresAt: Date.now() + CANDIDATE_SESSION_MS });
    setCookie(res, req, CANDIDATE_COOKIE, token, Math.floor(CANDIDATE_SESSION_MS / 1000));
    const alreadyApplied = store.applications.some((a) => a.jobId === jobId && store.candidates.find((c) => c.id === a.candidateId)?.phone === phone);
    return json(res, 200, { verified: true, phone: maskPhone(phone), expiresIn: Math.floor(CANDIDATE_SESSION_MS / 1000), alreadyApplied });
  }

  if (route === '/api/public/apply' && req.method === 'POST') {
    const auth = getCandidateSession(req);
    if (!auth) throw new HttpError(401, 'نشست شما منقضی شده است؛ شماره موبایل را دوباره تأیید کنید.', 'candidate_session_expired');
    const body = await readJson(req);
    const job = getJob(auth.session.jobId);
    if (!job || job.status !== 'open') throw new HttpError(409, 'این موقعیت دیگر برای دریافت درخواست فعال نیست.');
    if (store.applications.some((a) => a.jobId === job.id && store.candidates.find((c) => c.id === a.candidateId)?.phone === auth.session.phone)) throw new HttpError(409, 'برای این موقعیت قبلاً درخواست ثبت کرده‌اید.');
    const formData = validateApplicantData(body.formData, auth.session.phone);
    validateRequiredForm(formData);
    let psychology = null;
    if (store.settings.modules.psychology) {
      if (store.settings.psychologyRequired !== false && !formData.assessmentConsent) throw new HttpError(400, 'برای تکمیل ارزیابی، رضایت آگاهانه را تأیید کنید.');
      if (body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) && Object.keys(body.answers).length) {
        const cleanAnswers = {};
        for (const question of DEFAULT_QUESTIONS) {
          const answer = body.answers[String(question.id)] ?? body.answers[question.id];
          if (answer === 'a' || answer === 'b') cleanAnswers[String(question.id)] = answer;
        }
        try { psychology = { answers: cleanAnswers, analysis: analyze(cleanAnswers, store.settings.questionOverrides) }; }
        catch (error) { throw new HttpError(400, error.message); }
      } else if (store.settings.psychologyRequired !== false) {
        throw new HttpError(400, 'پاسخ به همه پرسش‌های ارزیابی الزامی است.');
      }
    }
    const now = new Date().toISOString();
    const application = {
      id: crypto.randomUUID(), candidateId: null, jobId: job.id, status: 'new', appliedAt: now, updatedAt: now,
      formData, psychology, notes: [], timeline: [{ status: 'new', at: now, actor: 'سامانه', note: 'درخواست استخدام ثبت شد.' }]
    };
    await mutate((db) => {
      const candidate = db.candidates.find((c) => c.phone === auth.session.phone);
      if (db.applications.some((item) => item.jobId === job.id && (candidate ? item.candidateId === candidate.id : db.candidates.find((c) => c.id === item.candidateId)?.phone === auth.session.phone))) throw new HttpError(409, 'برای این موقعیت قبلاً درخواست ثبت کرده‌اید.');
      const candidateId = candidate?.id || crypto.randomUUID();
      const fullName = `${formData.firstName} ${formData.lastName}`.trim();
      const candidateRecord = {
        ...(candidate || {}), id: candidateId, name: fullName, firstName: formData.firstName, lastName: formData.lastName,
        phone: auth.session.phone, email: formData.email, nationalId: formData.nationalId,
        createdAt: candidate?.createdAt || now, updatedAt: now
      };
      application.candidateId = candidateId;
      if (candidate) {
        const idx = db.candidates.findIndex((c) => c.id === candidateId);
        if (idx >= 0) db.candidates[idx] = candidateRecord;
      } else db.candidates.push(candidateRecord);
      db.applications.push(application);
      audit(null, 'application.created', application.id, `ثبت درخواست برای موقعیت «${job.title}»`);
    });
    const ref = application.id.slice(0, 8).toUpperCase();
    return json(res, 201, { submitted: true, reference: ref, message: 'درخواست شما با موفقیت ثبت شد. نتیجه بررسی از طریق اطلاعات تماس اعلام می‌شود.' });
  }

  if (route === '/api/public/logout' && req.method === 'POST') {
    const auth = getCandidateSession(req);
    if (auth) candidateSessions.delete(auth.token);
    clearCookie(res, req, CANDIDATE_COOKIE);
    return json(res, 200, { ok: true });
  }
  throw new HttpError(404, 'نشانی درخواستی پیدا نشد.');
}

async function handleApi(req, res, route, url) {
  if (route === '/api/setup-status' && req.method === 'GET') return json(res, 200, { installed: store.installed, organizationName: store.settings.organizationName });
  if (route.startsWith('/api/public/')) return handlePublicApi(req, res, route, url);
  if (route === '/api/setup' && req.method === 'POST') {
    const body = await readJson(req, 32 * 1024);
    if (store.installed) throw new HttpError(409, 'ویزارد نصب قبلاً تکمیل شده است.');
    const username = safeString(body.username, 50).toLowerCase();
    const name = safeString(body.name, 120);
    const password = body.password;
    if (!/^[a-z0-9_.-]{3,50}$/.test(username)) throw new HttpError(400, 'نام کاربری باید ۳ تا ۵۰ کاراکتر و شامل حروف انگلیسی، عدد یا . _ - باشد.');
    if (name.length < 2) throw new HttpError(400, 'نام مدیر سامانه را وارد کنید.');
    if (!passwordRequirements(password)) throw new HttpError(400, 'رمز عبور باید دست‌کم ۱۰ کاراکتر باشد.');
    if (store.users.some((u) => u.username === username)) throw new HttpError(409, 'این نام کاربری قبلاً ثبت شده است.');
    const organizationName = safeString(body.organizationName, 120) || 'مینی HRM';
    const user = { id: crypto.randomUUID(), name, username, passwordHash: hashPassword(password), role: 'admin', active: true, createdAt: new Date().toISOString(), lastLoginAt: null };
    await mutate((db) => {
      if (db.installed) throw new HttpError(409, 'ویزارد نصب قبلاً تکمیل شده است.');
      db.installed = true;
      db.installedAt = new Date().toISOString();
      db.settings.organizationName = organizationName;
      db.users.push(user);
      audit(user, 'system.installed', user.id, 'نصب اولیه سامانه و ایجاد مدیر کل');
    });
    return json(res, 201, { installed: true, message: 'راه‌اندازی انجام شد. اکنون وارد سامانه شوید.' });
  }
  if (route === '/api/auth/login' && req.method === 'POST') {
    if (!store.installed) throw new HttpError(409, 'ابتدا ویزارد نصب را تکمیل کنید.');
    const ip = clientIp(req);
    const attempt = loginAttempts.get(ip) || { count: 0, until: 0 };
    if (attempt.until > Date.now() && attempt.count >= 7) throw new HttpError(429, 'تلاش‌های ورود زیاد است؛ ۱۵ دقیقه دیگر دوباره تلاش کنید.');
    const body = await readJson(req, 16 * 1024);
    const username = safeString(body.username, 80).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const user = store.users.find((u) => u.username.toLowerCase() === username && u.active);
    const passwordOk = user ? verifyPassword(password, user.passwordHash) : false;
    if (!user || !passwordOk) {
      const next = attempt.until > Date.now() ? attempt : { count: 0, until: Date.now() + 15 * 60 * 1000 };
      next.count += 1;
      loginAttempts.set(ip, next);
      throw new HttpError(401, 'نام کاربری یا رمز عبور صحیح نیست.', 'invalid_credentials');
    }
    loginAttempts.delete(ip);
    const token = randomToken();
    const expiresAt = Date.now() + STAFF_SESSION_MS;
    staffSessions.set(token, { userId: user.id, expiresAt });
    await mutate((db) => {
      const target = db.users.find((u) => u.id === user.id);
      if (target) target.lastLoginAt = new Date().toISOString();
      audit(user, 'auth.login', user.id, 'ورود موفق به سامانه');
    });
    setCookie(res, req, STAFF_COOKIE, token, Math.floor(STAFF_SESSION_MS / 1000));
    return json(res, 200, { user: cleanUser(user), permissions: permissionsFor(user) });
  }
  if (route === '/api/auth/logout' && req.method === 'POST') {
    const auth = getStaffSession(req);
    if (auth) { staffSessions.delete(auth.token); audit(auth.user, 'auth.logout', auth.user.id, 'خروج از سامانه'); await mutate(() => {}); }
    clearCookie(res, req, STAFF_COOKIE);
    return json(res, 200, { ok: true });
  }
  if (route === '/api/me' && req.method === 'GET') {
    const auth = requireStaff(req);
    return json(res, 200, { user: cleanUser(auth.user), permissions: permissionsFor(auth.user), organizationName: store.settings.organizationName, modules: store.settings.modules });
  }

  if (route === '/api/dashboard' && req.method === 'GET') {
    const auth = requireStaff(req, 'dashboard.view');
    return json(res, 200, computeDashboard(auth.user));
  }

  if (route === '/api/jobs' && req.method === 'GET') {
    const auth = requireStaff(req, 'jobs.view');
    requireModule('recruitment');
    const jobs = store.jobs.map((job) => ({ ...job, applicants: store.applications.filter((a) => a.jobId === job.id).length, canManage: permissionsFor(auth.user)['jobs.manage'] }));
    return json(res, 200, { jobs });
  }
  if (route === '/api/jobs' && req.method === 'POST') {
    const auth = requireStaff(req, 'jobs.manage'); requireModule('recruitment');
    const body = await readJson(req, 24 * 1024);
    const job = { id: crypto.randomUUID(), ...validateJobInput(body) };
    await mutate((db) => { db.jobs.unshift(job); audit(auth.user, 'job.created', job.id, `ایجاد موقعیت «${job.title}»`); });
    return json(res, 201, { job });
  }
  const jobMatch = route.match(/^\/api\/jobs\/([a-f0-9-]+)$/i);
  if (jobMatch && req.method === 'PUT') {
    const auth = requireStaff(req, 'jobs.manage'); requireModule('recruitment');
    const body = await readJson(req, 24 * 1024);
    let updated;
    await mutate((db) => {
      const idx = db.jobs.findIndex((job) => job.id === jobMatch[1]);
      if (idx < 0) throw new HttpError(404, 'موقعیت شغلی پیدا نشد.');
      updated = { ...db.jobs[idx], ...validateJobInput(body, db.jobs[idx]) };
      db.jobs[idx] = updated;
      audit(auth.user, 'job.updated', updated.id, `ویرایش موقعیت «${updated.title}»`);
    });
    return json(res, 200, { job: updated });
  }
  if (jobMatch && req.method === 'DELETE') {
    const auth = requireStaff(req, 'jobs.manage'); requireModule('recruitment');
    await mutate((db) => {
      const job = db.jobs.find((item) => item.id === jobMatch[1]);
      if (!job) throw new HttpError(404, 'موقعیت شغلی پیدا نشد.');
      // Keep historic applications attached to their job; only close the public listing.
      job.status = 'closed'; job.updatedAt = new Date().toISOString();
      audit(auth.user, 'job.closed', job.id, `بستن موقعیت «${job.title}»`);
    });
    return json(res, 200, { closed: true });
  }

  if (route === '/api/applications' && req.method === 'GET') {
    const auth = requireStaff(req, 'candidates.view'); requireModule('recruitment');
    const search = safeString(url.searchParams.get('q') || '', 120).toLowerCase();
    const status = safeString(url.searchParams.get('status') || '', 30);
    const jobId = safeString(url.searchParams.get('jobId') || '', 80);
    const permissions = permissionsFor(auth.user);
    let applications = store.applications;
    if (status && status !== 'all') applications = applications.filter((a) => a.status === status);
    if (jobId && jobId !== 'all') applications = applications.filter((a) => a.jobId === jobId);
    const rows = applications.map((app) => safeSummary(app, permissions['psychology.view']));
    const filtered = search ? rows.filter((row) => [row.name, row.phone, row.email, row.nationalId, row.jobTitle].some((value) => String(value || '').toLowerCase().includes(search))) : rows;
    filtered.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
    return json(res, 200, { applications: filtered, jobs: store.jobs.map((j) => ({ id: j.id, title: j.title })), canManage: permissions['candidates.manage'], canExport: permissions['candidates.export'], canSeePsychology: permissions['psychology.view'] });
  }
  const appMatch = route.match(/^\/api\/applications\/([a-f0-9-]+)(?:\/(status|notes))?$/i);
  if (appMatch && req.method === 'GET' && !appMatch[2]) {
    const auth = requireStaff(req, 'candidates.view'); requireModule('recruitment');
    const app = store.applications.find((item) => item.id === appMatch[1]);
    if (!app) throw new HttpError(404, 'پرونده متقاضی پیدا نشد.');
    return json(res, 200, { application: sanitizeApplication(app, permissionsFor(auth.user)) });
  }
  if (appMatch && appMatch[2] === 'status' && req.method === 'PATCH') {
    const auth = requireStaff(req, 'candidates.manage'); requireModule('recruitment');
    const body = await readJson(req, 12 * 1024);
    const allowed = ['new', 'screening', 'interview', 'offer', 'hired', 'rejected', 'on_hold'];
    if (!allowed.includes(body.status)) throw new HttpError(400, 'مرحله انتخاب‌شده معتبر نیست.');
    let updated;
    await mutate((db) => {
      const app = db.applications.find((item) => item.id === appMatch[1]);
      if (!app) throw new HttpError(404, 'پرونده متقاضی پیدا نشد.');
      app.status = body.status; app.updatedAt = new Date().toISOString();
      app.timeline = app.timeline || [];
      app.timeline.push({ status: body.status, at: app.updatedAt, actor: auth.user.name, note: safeString(body.note, 300) });
      updated = app;
      audit(auth.user, 'application.status', app.id, `تغییر مرحله به «${statusLabel(body.status)}»`);
    });
    return json(res, 200, { status: updated.status, updatedAt: updated.updatedAt });
  }
  if (appMatch && appMatch[2] === 'notes' && req.method === 'POST') {
    const auth = requireStaff(req, 'candidates.manage'); requireModule('recruitment');
    const body = await readJson(req, 12 * 1024);
    const text = safeString(body.text, 1500);
    if (text.length < 2) throw new HttpError(400, 'یادداشت را وارد کنید.');
    let note;
    await mutate((db) => {
      const app = db.applications.find((item) => item.id === appMatch[1]);
      if (!app) throw new HttpError(404, 'پرونده متقاضی پیدا نشد.');
      app.notes = app.notes || [];
      note = { id: crypto.randomUUID(), text, author: auth.user.name, at: new Date().toISOString() };
      app.notes.push(note); app.updatedAt = note.at;
      audit(auth.user, 'application.note', app.id, 'ثبت یادداشت داخلی برای پرونده');
    });
    return json(res, 201, { note });
  }
  if (route === '/api/export/applications.csv' && req.method === 'GET') {
    const auth = requireStaff(req, 'candidates.export'); requireModule('recruitment');
    const canPsych = permissionsFor(auth.user)['psychology.view'];
    const rows = store.applications.map((app) => safeSummary(app, canPsych)).sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
    const text = listToCsv(rows);
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': "attachment; filename*=UTF-8''minihrm-applications.csv", 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.end(text);
  }

  if (route === '/api/users' && req.method === 'GET') {
    const auth = requireStaff(req, 'users.manage');
    return json(res, 200, { users: store.users.map((user) => cleanUser(user, auth.user)), roles: assignableRoleKeys().map((role) => ({ key: role, label: roleLabel(role) })) });
  }
  if (route === '/api/users' && req.method === 'POST') {
    const auth = requireStaff(req, 'users.manage');
    const body = await readJson(req, 16 * 1024);
    const username = safeString(body.username, 50).toLowerCase();
    const name = safeString(body.name, 120);
    const role = assignableRoleKeys().includes(body.role) ? body.role : null;
    const password = body.password;
    if (!/^[a-z0-9_.-]{3,50}$/.test(username)) throw new HttpError(400, 'نام کاربری باید ۳ تا ۵۰ کاراکتر انگلیسی یا عدد باشد.');
    if (name.length < 2 || !role) throw new HttpError(400, 'نام و نقش معتبر انتخاب کنید.');
    if (!passwordRequirements(password)) throw new HttpError(400, 'رمز عبور باید دست‌کم ۱۰ کاراکتر باشد.');
    if (store.users.some((u) => u.username === username)) throw new HttpError(409, 'این نام کاربری قبلاً ثبت شده است.');
    const user = { id: crypto.randomUUID(), name, username, role, passwordHash: hashPassword(password), active: true, createdAt: new Date().toISOString(), lastLoginAt: null };
    await mutate((db) => { db.users.push(user); audit(auth.user, 'user.created', user.id, `ایجاد کاربر «${name}» با نقش ${roleLabel(role)}`); });
    return json(res, 201, { user: cleanUser(user, auth.user) });
  }
  const userMatch = route.match(/^\/api\/users\/([a-f0-9-]+)$/i);
  if (userMatch && req.method === 'PUT') {
    const auth = requireStaff(req, 'users.manage');
    const body = await readJson(req, 16 * 1024);
    let result;
    await mutate((db) => {
      const user = db.users.find((u) => u.id === userMatch[1]);
      if (!user) throw new HttpError(404, 'کاربر پیدا نشد.');
      if (user.role === 'admin') throw new HttpError(403, 'تغییر حساب مدیر کل از این بخش مجاز نیست.');
      if (user.id === auth.user.id && ((body.active !== undefined && !bool(body.active)) || (body.role && body.role !== user.role))) throw new HttpError(403, 'برای جلوگیری از قفل‌شدن حساب، نقش یا وضعیت حساب جاری را تغییر ندهید.');
      if (body.name !== undefined) {
        const name = safeString(body.name, 120);
        if (name.length < 2) throw new HttpError(400, 'نام معتبر وارد کنید.');
        user.name = name;
      }
      if (body.role !== undefined) {
        if (!assignableRoleKeys().includes(body.role)) throw new HttpError(400, 'نقش انتخاب‌شده معتبر نیست.');
        user.role = body.role;
      }
      if (body.active !== undefined) user.active = bool(body.active);
      if (body.password) {
        if (!passwordRequirements(body.password)) throw new HttpError(400, 'رمز عبور باید دست‌کم ۱۰ کاراکتر باشد.');
        user.passwordHash = hashPassword(body.password);
      }
      result = user;
      audit(auth.user, 'user.updated', user.id, `ویرایش حساب «${user.name}»`);
    });
    // Revoke all sessions for the account when changed or disabled.
    for (const [token, session] of staffSessions) if (session.userId === result.id) staffSessions.delete(token);
    return json(res, 200, { user: cleanUser(result, auth.user) });
  }
  if (userMatch && req.method === 'DELETE') {
    const auth = requireStaff(req, 'users.manage');
    await mutate((db) => {
      const user = db.users.find((u) => u.id === userMatch[1]);
      if (!user) throw new HttpError(404, 'کاربر پیدا نشد.');
      if (user.role === 'admin' || user.id === auth.user.id) throw new HttpError(403, 'حذف حساب مدیر کل یا حساب جاری مجاز نیست.');
      user.active = false;
      audit(auth.user, 'user.disabled', user.id, `غیرفعال‌سازی حساب «${user.name}»`);
    });
    for (const [token, session] of staffSessions) if (session.userId === userMatch[1]) staffSessions.delete(token);
    return json(res, 200, { disabled: true });
  }

  if (route === '/api/forms/config' && req.method === 'GET') {
    requireStaff(req, 'forms.manage');
    return json(res, 200, { formRequired: store.settings.formRequired, psychologyRequired: store.settings.psychologyRequired !== false, formFields: FORM_FIELDS, psychologyEnabled: Boolean(store.settings.modules.psychology) });
  }
  if (route === '/api/forms/config' && req.method === 'PUT') {
    const auth = requireStaff(req, 'forms.manage');
    const body = await readJson(req, 24 * 1024);
    const allowedFields = new Set(FORM_FIELDS.map((field) => field.key));
    const formRequired = [...new Set((Array.isArray(body.formRequired) ? body.formRequired : []).filter((field) => allowedFields.has(field)))];
    await mutate((db) => {
      db.settings.formRequired = formRequired;
      if (typeof body.psychologyRequired === 'boolean') db.settings.psychologyRequired = body.psychologyRequired;
      audit(auth.user, 'forms.config.updated', 'application-form', 'ویرایش الزامات فرم استخدام');
    });
    return json(res, 200, { saved: true });
  }

  if (route === '/api/settings' && req.method === 'GET') {
    requireStaff(req, 'settings.manage');
    const otp = store.settings.otp || {};
    return json(res, 200, {
      organizationName: store.settings.organizationName,
      modules: store.settings.modules,
      formRequired: store.settings.formRequired,
      psychologyRequired: store.settings.psychologyRequired !== false,
      otp: { mode: otp.mode || 'demo', configured: Boolean(otp.token && otp.fromNumber), tokenConfigured: Boolean(otp.token), fromNumber: otp.fromNumber || '' },
      formFields: FORM_FIELDS,
      warnings: { demoMode: process.env.NODE_ENV === 'production' }
    });
  }
  if (route === '/api/settings' && req.method === 'PUT') {
    const auth = requireStaff(req, 'settings.manage');
    const body = await readJson(req, 30 * 1024);
    const org = safeString(body.organizationName, 120);
    if (org.length < 2) throw new HttpError(400, 'نام سازمان را وارد کنید.');
    const modulesInput = body.modules && typeof body.modules === 'object' ? body.modules : {};
    const otpInput = body.otp && typeof body.otp === 'object' ? body.otp : {};
    const mode = ['demo', 'ippanel'].includes(otpInput.mode) ? otpInput.mode : 'demo';
    const fromNumber = safeString(otpInput.fromNumber, 40);
    const token = safeString(otpInput.token, 500);
    const allowedFields = new Set(FORM_FIELDS.map((field) => field.key));
    const formRequired = [...new Set((Array.isArray(body.formRequired) ? body.formRequired : []).filter((field) => allowedFields.has(field)))];
    const modules = { ...store.settings.modules };
    for (const key of ['recruitment', 'psychology', 'publicPortal', 'auditLog']) if (typeof modulesInput[key] === 'boolean') modules[key] = modulesInput[key];
    const psychRequired = body.psychologyRequired !== false;
    await mutate((db) => {
      db.settings.organizationName = org;
      db.settings.modules = modules;
      db.settings.formRequired = formRequired;
      db.settings.psychologyRequired = psychRequired;
      db.settings.otp = { mode, fromNumber, token: token || db.settings.otp?.token || '' };
      audit(auth.user, 'settings.updated', 'settings', 'ویرایش تنظیمات، ماژول‌ها و الزامات فرم');
    });
    return json(res, 200, { saved: true });
  }

  if (route === '/api/permissions' && req.method === 'GET') {
    requireStaff(req, 'permissions.manage');
    const roleLabels = Object.fromEntries(assignableRoleKeys().map((role) => [role, roleLabel(role)]));
    return json(res, 200, { roles: store.settings.rolePermissions, customRoles: store.settings.customRoles || [], definitions: PERMISSION_DEFINITIONS, roleLabels });
  }
  if (route === '/api/permissions' && req.method === 'PUT') {
    const auth = requireStaff(req, 'permissions.manage');
    const body = await readJson(req, 30 * 1024);
    const input = body.roles && typeof body.roles === 'object' ? body.roles : {};
    const permissionKeys = new Set(PERMISSION_DEFINITIONS.map((p) => p.key));
    const builtInRoles = ['hr_manager', 'hr_staff', 'employee'];
    const reservedRoles = new Set(['admin', ...builtInRoles]);
    const incomingCustom = Array.isArray(body.customRoles) ? body.customRoles.slice(0, 20) : (store.settings.customRoles || []);
    const customRoles = [];
    const seenKeys = new Set();
    const seenNames = new Set();
    for (const item of incomingCustom) {
      const key = safeString(item?.key, 40);
      const name = safeString(item?.name, 60);
      if (!/^custom_[a-z0-9_]{2,32}$/.test(key) || reservedRoles.has(key)) throw new HttpError(400, 'شناسه نقش سفارشی معتبر نیست.');
      if (name.length < 2) throw new HttpError(400, 'نام نقش سفارشی باید دست‌کم ۲ نویسه باشد.');
      if (seenKeys.has(key) || seenNames.has(name.toLowerCase())) throw new HttpError(400, 'شناسه یا نام نقش تکراری است.');
      seenKeys.add(key); seenNames.add(name.toLowerCase()); customRoles.push({ key, name });
    }
    // Keep existing role records so a missing UI field cannot orphan accounts.
    for (const oldRole of (store.settings.customRoles || [])) if (!seenKeys.has(oldRole.key)) customRoles.push(oldRole);
    const roles = { ...store.settings.rolePermissions };
    for (const role of [...builtInRoles, ...customRoles.map((item) => item.key)]) {
      if (input[role] && typeof input[role] === 'object') roles[role] = Object.fromEntries([...permissionKeys].map((key) => [key, bool(input[role][key])]));
      else if (!roles[role]) roles[role] = Object.fromEntries([...permissionKeys].map((key) => [key, false]));
      // Permission administration is reserved for the super-admin account.
      roles[role]['permissions.manage'] = false;
    }
    await mutate((db) => { db.settings.rolePermissions = roles; db.settings.customRoles = customRoles; audit(auth.user, 'permissions.updated', 'roles', 'به‌روزرسانی نقش‌ها و سطح دسترسی'); });
    const roleLabels = Object.fromEntries(assignableRoleKeys().map((role) => [role, roleLabel(role)]));
    return json(res, 200, { saved: true, roles, customRoles, roleLabels });
  }

  if (route === '/api/psychology/questions' && req.method === 'GET') {
    requireStaff(req, 'psychology.manage'); requireModule('psychology');
    const questions = getQuestions(store.settings.questionOverrides).map(({ id, axis, text, a, b }) => ({ id, axis, text, a, b }));
    return json(res, 200, { questions, total: DEFAULT_QUESTIONS.length, note: 'نگاشت امتیازدهی و کلید هر گزینه ثابت است تا نتیجه آزمون در طول زمان قابل مقایسه بماند.' });
  }
  if (route === '/api/psychology/questions/reset' && req.method === 'POST') {
    const auth = requireStaff(req, 'psychology.manage'); requireModule('psychology');
    await mutate((db) => { db.settings.questionOverrides = []; audit(auth.user, 'psychology.questions.reset', 'psychology', 'بازگردانی متن و گزینه‌ها به نسخه اولیه'); });
    return json(res, 200, { saved: true });
  }
  if (route === '/api/psychology/questions' && req.method === 'PUT') {
    const auth = requireStaff(req, 'psychology.manage'); requireModule('psychology');
    const body = await readJson(req, 40 * 1024);
    if (!Array.isArray(body.questions) || body.questions.length !== DEFAULT_QUESTIONS.length) throw new HttpError(400, 'ساختار پرسش‌نامه معتبر نیست.');
    const byId = new Map(body.questions.map((q) => [Number(q.id), q]));
    const overrides = DEFAULT_QUESTIONS.map((q) => {
      const item = byId.get(q.id);
      if (!item) throw new HttpError(400, 'همه ۲۸ پرسش باید در فهرست باشند.');
      return { id: q.id, text: safeString(item.text, 320) || q.text, a: safeString(item.a, 220) || q.a, b: safeString(item.b, 220) || q.b };
    });
    await mutate((db) => { db.settings.questionOverrides = overrides; audit(auth.user, 'psychology.questions.updated', 'psychology', 'ویرایش متن پرسش‌ها و گزینه‌ها'); });
    return json(res, 200, { saved: true });
  }

  if (route === '/api/audit' && req.method === 'GET') {
    requireStaff(req, 'audit.view');
    requireModule('auditLog');
    return json(res, 200, { events: store.audit.slice(0, 100) });
  }
  throw new HttpError(404, 'نشانی درخواستی پیدا نشد.');
}

async function handleRequest(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let routeInfo;
  try { routeInfo = appRouteAndBase(requestUrl.pathname); }
  catch (_) { return json(res, 400, { error: 'نشانی معتبر نیست.' }); }
  const route = routeInfo.route;
  const base = guessPublicBase(routeInfo.base);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Allow': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'Cache-Control': 'no-store' });
    return res.end();
  }
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') {
    try { csrfCheck(req); } catch (error) { return json(res, error.status || 403, { error: error.message, code: error.code }); }
  }
  if (route.startsWith('/api/')) {
    try { return await handleApi(req, res, route, requestUrl); }
    catch (error) {
      const status = error.status || 500;
      if (status >= 500) console.error('API error:', error.stack || error.message);
      return json(res, status, { error: status >= 500 ? 'خطای داخلی رخ داد؛ دوباره تلاش کنید.' : error.message, code: error.code || 'request_error' });
    }
  }
  if (route === '/assets' || route.startsWith('/assets/')) return sendStatic(route, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'روش درخواست پشتیبانی نمی‌شود.' });
  if (route === '/apply') return renderHtml(path.join(PUBLIC_DIR, 'apply.html'), base, res);
  if (route === '/' || (!route.includes('.') && !route.startsWith('/api'))) return renderHtml(path.join(PUBLIC_DIR, 'index.html'), base, res);
  return json(res, 404, { error: 'صفحه پیدا نشد.' });
}

async function start() {
  await loadStore();
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      console.error('Unhandled request error:', error.stack || error.message);
      if (!res.headersSent) json(res, 500, { error: 'خطای داخلی رخ داد.' });
      else res.destroy();
    });
  });
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  server.listen(PORT, HOST, () => console.log(`Mini HRM listening on ${HOST}:${PORT}; store: ${STORE_PATH}`));
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, session] of staffSessions) if (session.expiresAt < now) staffSessions.delete(key);
    for (const [key, session] of candidateSessions) if (session.expiresAt < now) candidateSessions.delete(key);
    for (const [key, challenge] of otpChallenges) if (challenge.expiresAt < now) otpChallenges.delete(key);
    for (const [key, expiresAt] of otpCooldowns) if (expiresAt < now) otpCooldowns.delete(key);
    for (const [key, record] of requestLimits) if (record.until < now) requestLimits.delete(key);
  }, 10 * 60 * 1000);
  cleanup.unref();
}

start().catch((error) => { console.error('Could not start Mini HRM:', error); process.exit(1); });
