/**
 * ابزارهای عمومی سامانه (سمت سرور)
 */
'use strict';

const crypto = require('crypto');

/** شناسه یکتا و خوانا */
function uid(prefix = '') {
  const t = Date.now().toString(36);
  const r = crypto.randomBytes(5).toString('hex');
  return (prefix ? prefix + '_' : '') + t + r;
}

/** توکن تصادفی امن */
function token(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** کد عددی تصادفی (برای OTP) */
function numericCode(len = 5) {
  let out = '';
  const buf = crypto.randomBytes(len * 2);
  for (let i = 0; i < len; i++) out += String(buf[i] % 10);
  return out;
}

/** هش رمز عبور با scrypt */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$16384$8$1$${salt}$${hash}`;
}

/** بررسی رمز عبور */
function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, salt, hash] = parts;
  try {
    const calc = crypto.scryptSync(String(password), salt, 64, { N: +N, r: +r, p: +p }).toString('hex');
    const a = Buffer.from(calc, 'hex');
    const b = Buffer.from(hash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

/** رمز عبور تولیدی خوانا (برای کاربران جدید) */
function generatePassword(len = 10) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789@#%';
  let out = '';
  const buf = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += chars[buf[i] % chars.length];
  return out;
}

/** بررسی قدرت رمز عبور */
function passwordStrength(pw) {
  pw = String(pw || '');
  const checks = {
    length: pw.length >= 8,
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    digit: /[0-9۰-۹]/.test(pw),
    symbol: /[^A-Za-z0-9۰-۹\s]/.test(pw)
  };
  const score = Object.values(checks).filter(Boolean).length;
  return { checks, score, ok: checks.length && score >= 3 };
}

// ---------------------------------------------------------------- رشته‌ها

function esc(str) {
  return String(str === null || str === undefined ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function slugify(str) {
  return String(str || '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'item';
}

function truncate(str, len = 80) {
  str = String(str || '');
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

// ---------------------------------------------------------------- اعداد و تاریخ

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
function faDigits(v) { return String(v === null || v === undefined ? '' : v).replace(/[0-9]/g, (c) => FA_DIGITS[+c]); }
function enDigits(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
}
/** نرمال‌سازی شماره موبایل ایران به شکل 09xxxxxxxxx */
function normalizeMobile(input) {
  let s = enDigits(input).replace(/[^\d+]/g, '');
  s = s.replace(/^\+?98/, '0').replace(/^0098/, '0');
  if (/^9\d{9}$/.test(s)) s = '0' + s;
  return s;
}
function isValidMobile(input) {
  return /^09\d{9}$/.test(normalizeMobile(input));
}
/** تبدیل به شماره بین‌المللی E.164 برای IPPanel */
function toE164(input) {
  const s = normalizeMobile(input);
  return /^09\d{9}$/.test(s) ? '+98' + s.slice(1) : '+98' + s.replace(/\D/g, '');
}

// ---------------------------------------------------------------- اشیاء

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) return override === undefined ? base : override;
  if (!isPlainObject(base) || !isPlainObject(override)) return override === undefined ? base : override;
  const out = Object.assign({}, base);
  for (const k of Object.keys(override)) {
    out[k] = isPlainObject(base[k]) && isPlainObject(override[k])
      ? deepMerge(base[k], override[k])
      : override[k];
  }
  return out;
}

function getPath(obj, path, fallback) {
  const parts = String(path).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return fallback;
    cur = cur[p];
  }
  return cur === undefined ? fallback : cur;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function omit(obj, keys) {
  const out = Object.assign({}, obj);
  for (const k of keys) delete out[k];
  return out;
}

/** پاک‌سازی ورودی متنی (جلوگیری از XSS در ذخیره‌سازی) */
function cleanText(v, maxLen = 5000) {
  if (v === null || v === undefined) return '';
  let s = String(v).replace(/\u0000/g, '').trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

/** حذف تگ‌های HTML از ورودی کاربر */
function stripTags(v) {
  return String(v === null || v === undefined ? '' : v).replace(/<[^>]*>/g, '');
}

/** اعتبارسنجی ایمیل */
function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
}

/** اعتبارسنجی کد ملی ایران */
function isValidNationalId(v) {
  const s = enDigits(v).replace(/\D/g, '');
  if (!/^\d{10}$/.test(s)) return false;
  if (/^(\d)\1{9}$/.test(s)) return false;
  const check = +s[9];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += +s[i] * (10 - i);
  const r = sum % 11;
  return (r < 2 && check === r) || (r >= 2 && check === 11 - r);
}

/** اعتبارسنجی کد پستی ایران */
function isValidPostalCode(v) {
  return /^\d{10}$/.test(enDigits(v).replace(/\D/g, ''));
}

/** قالب‌بندی حجم فایل */
function formatBytes(bytes) {
  const b = Number(bytes) || 0;
  const units = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
  let i = 0; let v = b;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** گروه‌بندی آرایه بر اساس کلید */
function groupBy(arr, fn) {
  const key = typeof fn === 'function' ? fn : (x) => x[fn];
  const out = {};
  for (const item of arr || []) {
    const k = key(item);
    (out[k] = out[k] || []).push(item);
  }
  return out;
}

/** تعداد بر اساس کلید */
function countBy(arr, fn) {
  const out = {};
  for (const item of arr || []) {
    const k = (typeof fn === 'function' ? fn : (x) => x[fn])(item);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

/** مرتب‌سازی امن بر اساس تاریخ */
function sortByDateDesc(arr, field = 'createdAt') {
  return (arr || []).slice().sort((a, b) => new Date(b[field] || 0) - new Date(a[field] || 0));
}

/** روزهای ابتدای روز (تایم‌زون سرور) */
function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** درصد امن */
function percent(part, total, decimals = 1) {
  if (!total) return 0;
  return +( (part / total) * 100 ).toFixed(decimals);
}

module.exports = {
  uid, token, numericCode, hashPassword, verifyPassword, generatePassword, passwordStrength,
  esc, slugify, truncate, faDigits, enDigits, normalizeMobile, isValidMobile, toE164,
  isPlainObject, deepMerge, getPath, pick, omit, cleanText, stripTags, isEmail,
  isValidNationalId, isValidPostalCode, formatBytes, groupBy, countBy, sortByDateDesc,
  startOfDay, addDays, percent
};
