/**
 * خودآزمایی و عیب‌یابی سامانه
 * ------------------------------------------------------------------
 * مشکلات رایج نصب روی هاست اشتراکی (cPanel) را قبل از رسیدن به کاربر
 * پیدا می‌کند: نبودن فایل‌ها، اشتباه بودن مسیر دارایی‌ها، نبودن پیشوند
 * زیرمسیر، نبودن داده‌های اولیه ماژول‌ها و نبودن دسترسی نوشتن.
 *
 * دو نوع بررسی انجام می‌شود:
 *   ۱) بررسی فایل‌ها روی دیسک
 *   ۲) درخواست واقعی HTTP به خود سامانه (سوکت یا پورت) برای اطمینان از
 *      درست سرو شدن CSS/JS/فونت/CSS پیشونددار
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

/** فایل‌های ضروری که نبودن هرکدام باعث خرابی ظاهر یا کارکرد می‌شود */
const REQUIRED_FILES = [
  { label: 'ورودی برنامه', rel: 'app.js', critical: true },
  { label: 'مسیریاب', rel: 'src/core/http/router.js', critical: true },
  { label: 'چیدمان پنل', rel: 'views/admin/shell.html', critical: true },
  { label: 'چیدمان عمومی', rel: 'views/layouts/site.html', critical: true },
  { label: 'چیدمان ساده', rel: 'views/layouts/plain.html', critical: true },
  { label: 'ویزارد نصب', rel: 'views/install/wizard.html', critical: true },
  { label: 'استایل پنل (CSS)', rel: 'public/css/app.css', critical: true },
  { label: 'استایل پورتال (CSS)', rel: 'public/css/portal.css', critical: true },
  { label: 'شیم پیشوند مسیر', rel: 'public/js/base.js', critical: true },
  { label: 'هسته کلاینت', rel: 'public/js/app.js', critical: true },
  { label: 'راه‌انداز پنل', rel: 'public/js/admin-boot.js', critical: true },
  { label: 'اسکریپت پورتال', rel: 'public/js/portal.js', critical: true },
  { label: 'اسکریپت ورود', rel: 'public/js/login.js', critical: false },
  { label: 'اسکریپت دعوت', rel: 'public/js/invite.js', critical: false },
  { label: 'کتابخانه QR', rel: 'public/vendor/qrcode.min.js', critical: true },
  { label: 'فونت وزیرمتن (Regular)', rel: 'public/fonts/Vazirmatn-Regular.woff2', critical: false },
  { label: 'فونت وزیرمتن (Bold)', rel: 'public/fonts/Vazirmatn-Bold.woff2', critical: false },
  { label: 'آیکون سایت', rel: 'public/favicon.svg', critical: false }
];

/** درخواست‌های واقعی HTTP که مرورگر برای هر صفحه انجام می‌دهد */
const HTTP_CHECKS = [
  { label: 'استایل پنل', url: '/assets/css/app.css', expect: 'css', minSize: 5000, mustContain: '/fonts/' },
  { label: 'استایل پورتال', url: '/assets/css/portal.css', expect: 'css', minSize: 2000 },
  { label: 'شیم پیشوند مسیر', url: '/assets/js/base.js', expect: 'javascript', minSize: 500 },
  { label: 'هسته کلاینت', url: '/assets/js/app.js', expect: 'javascript', minSize: 5000 },
  { label: 'راه‌انداز پنل', url: '/assets/js/admin-boot.js', expect: 'javascript', minSize: 200 },
  { label: 'اسکریپت پورتال', url: '/assets/js/portal.js', expect: 'javascript', minSize: 500 },
  { label: 'فونت وزیرمتن', url: '/fonts/Vazirmatn-Regular.woff2', expect: 'font', minSize: 1000 },
  { label: 'کتابخانه QR', url: '/vendor/qrcode.min.js', expect: 'javascript', minSize: 1000 },
  { label: 'آیکون سایت', url: '/favicon.svg', expect: 'svg', minSize: 100 },
  { label: 'صفحه اصلی', url: '/', expect: 'html|redirect', minSize: 0 },
  { label: 'صفحه مشاغل', url: '/careers', expect: 'html', minSize: 500 },
  { label: 'وضعیت سامانه', url: '/_health', expect: 'json', minSize: 20 }
];

/** داده‌های اولیه هر ماژول: کدام مجموعه‌ها باید پر باشند */
const MODULE_RECORDS = {
  jobs: ['jobs'],
  recruitment: ['applications', 'form_schemas'],
  portal: ['applicants'],
  assessments: ['mbti_meta'],
  interviews: ['interview_questions'],
  users: ['users', 'roles'],
  sms: ['sms_logs'],
  audit: ['audit_logs']
};

const COLLECTION_LABELS = {
  jobs: 'موقعیت شغلی', applications: 'پرونده', form_schemas: 'نسخه فرم', applicants: 'متقاضی',
  mbti_meta: 'فرا‌داده آزمون', interview_questions: 'سؤال مصاحبه', users: 'کاربر', roles: 'نقش',
  sms_logs: 'پیامک', audit_logs: 'رویداد'
};

function fileReport(root) {
  const rows = [];
  for (const item of REQUIRED_FILES) {
    const abs = path.join(root, item.rel);
    let size = 0; let ok = false;
    try { const st = fs.statSync(abs); ok = st.isFile(); size = st.size; } catch (e) { ok = false; }
    rows.push({ label: item.label, rel: item.rel, ok, size, critical: item.critical });
  }
  return rows;
}

/** یک درخواست HTTP واقعی به خود برنامه (پورت TCP یا سوکت یونیکس) */
function selfRequest(listenInfo, urlPath, timeoutMs = 5000, basePath = '') {
  return new Promise((resolve) => {
    if (!listenInfo) { resolve({ status: 0, error: 'اطلاعات شنونده در دسترس نیست' }); return; }
    const headers = { Host: listenInfo.hostHeader || 'localhost', 'User-Agent': 'HRM-SelfTest' };
    // وقتی سامانه زیرمسیر است، درخواست مستقیم به خودِ برنامه باید مثل پروکسی
    // (cPanel/Passenger) هدر پیشوند را داشته باشد تا مسیر واقعیِ مرورگر سنجیده شود.
    if (basePath) headers['X-Forwarded-Prefix'] = basePath;
    const options = {
      path: urlPath,
      method: 'GET',
      timeout: timeoutMs,
      headers
    };
    if (listenInfo.socketPath) options.socketPath = listenInfo.socketPath;
    else { options.host = listenInfo.host || '127.0.0.1'; options.port = listenInfo.port; }
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };
    const req = http.request(options, (r) => {
      let size = 0; const chunks = [];
      r.on('data', (c) => { size += c.length; if (chunks.length < 8 && size < 400000) chunks.push(c); });
      r.on('end', () => done({
        status: r.statusCode,
        type: String(r.headers['content-type'] || ''),
        location: String(r.headers.location || ''),
        size,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.on('timeout', () => { req.destroy(); done({ status: 0, error: 'پاسخی در زمان مقرر نرسید' }); });
    req.on('error', (e) => done({ status: 0, error: e.message }));
    req.end();
  });
}

async function httpReport(app, req) {
  const base = (req && req.basePath) || '';
  const rows = [];
  for (const item of HTTP_CHECKS) {
    const target = base + item.url;
    const res = await selfRequest(app.listenInfo, target, 5000, base);
    let ok = false; let note = '';
    if (res.status === 0) {
      note = res.error || 'بدون پاسخ';
    } else if (item.expect.indexOf('redirect') >= 0 && (res.status === 301 || res.status === 302)) {
      ok = true; note = `ریدایرکت به ${res.location}`;
      if (base && res.location && res.location.indexOf(base) !== 0) { ok = false; note += ' — پیشوند مسیر در ریدایرکت نیست!'; }
    } else if (res.status !== 200) {
      note = `کد پاسخ ${res.status}`;
    } else if (item.minSize && res.size < item.minSize) {
      note = `حجم کم: ${res.size} بایت`;
    } else if (item.expect.indexOf('css') >= 0 && res.type.indexOf('css') < 0) {
      note = `نوع محتوا: ${res.type || 'نامشخص'}`;
    } else if (item.expect.indexOf('javascript') >= 0 && res.type.indexOf('javascript') < 0) {
      note = `نوع محتوا: ${res.type || 'نامشخص'}`;
    } else if (item.expect.indexOf('font') >= 0 && res.type.indexOf('font') < 0 && !/woff/.test(res.type)) {
      note = `نوع محتوا: ${res.type || 'نامشخص'}`;
    } else if (item.expect.indexOf('html') >= 0 && res.type.indexOf('html') < 0) {
      note = `نوع محتوا: ${res.type || 'نامشخص'}`;
    } else if (item.expect.indexOf('json') >= 0 && res.type.indexOf('json') < 0) {
      note = `نوع محتوا: ${res.type || 'نامشخص'}`;
    } else {
      ok = true; note = `${res.size} بایت`;
      if (item.mustContain && res.body.indexOf(item.mustContain) < 0) { ok = false; note += ` — «${item.mustContain}» در فایل نیست`; }
      if (item.url === '/assets/css/app.css' && base) {
        // آدرس فونت داخل CSS باید پیشوند داشته باشد (با یا بدون نقل‌قول)
        const fontRe = new RegExp('url\\(\\s*[\'"]?' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/fonts/');
        if (!fontRe.test(res.body)) { ok = false; note += ' — آدرس فونت پیشوند زیرمسیر را ندارد!'; }
      }
    }
    rows.push({ label: item.label, url: target, ok, note, status: res.status });
  }
  return rows;
}

/** بررسی داده‌های اولیه ماژول‌ها */
function moduleReport(app) {
  const rows = [];
  for (const def of app.modules.all()) {
    const enabled = app.modules.isEnabled(def.key);
    const installed = !!app.config.get(`modules.${def.key}.installed`, false);
    const records = [];
    let empty = false;
    for (const col of MODULE_RECORDS[def.key] || []) {
      let n = 0;
      try { n = app.db.col(col).count(); } catch (e) { n = -1; }
      records.push({ key: col, label: COLLECTION_LABELS[col] || col, value: n });
      if (n === 0 && ['form_schemas', 'mbti_meta', 'interview_questions', 'roles'].indexOf(col) >= 0) empty = true;
    }
    rows.push({
      key: def.key, title: def.title, enabled, installed, core: !!def.core,
      hasSeed: typeof def.install === 'function', records, missingSeed: enabled && empty
    });
  }
  return rows;
}

/** گردآوری گزارش کامل */
async function collect(app, req) {
  const root = app.root;
  const cfg = app.config;
  const env = {
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    root,
    port: process.env.PORT || process.env.NODE_PORT || '3000',
    passenger: process.env.PASSENGER_BASE_URI || '',
    basePath: (req && req.basePath) || '',
    baseUrl: cfg.get('app.baseUrl', '') || '',
    installed: !!cfg.get('installed', false),
    appName: cfg.get('app.name', ''),
    companyName: cfg.get('app.companyName', ''),
    time: new Date().toISOString(),
    logLevel: cfg.get ? process.env.HRM_LOG_LEVEL || 'info' : ''
  };

  // دسترسی نوشتن در پوشه data
  let dataWritable = false; let dataError = '';
  try {
    const probe = path.join(root, 'data', '.diag-write-test');
    fs.mkdirSync(path.join(root, 'data'), { recursive: true });
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    dataWritable = true;
  } catch (e) { dataError = e.message; }
  env.dataWritable = dataWritable;
  env.dataError = dataError;

  const files = fileReport(root);
  const httpChecks = await httpReport(app, req);
  const modules = moduleReport(app);

  const counts = {};
  for (const col of ['users', 'roles', 'jobs', 'applicants', 'applications', 'form_schemas', 'mbti_meta', 'interview_questions', 'assessment_results', 'sms_logs', 'audit_logs']) {
    try { counts[col] = app.db.col(col).count(); } catch (e) { counts[col] = -1; }
  }

  const warnings = [];
  const missingCritical = files.filter((f) => !f.ok && f.critical);
  if (missingCritical.length) warnings.push(`فایل‌های ضروری موجود نیستند: ${missingCritical.map((f) => f.rel).join('، ')} — کل محتوای پروژه را کامل آپلود کنید.`);
  if (!dataWritable) warnings.push('پوشه data قابل نوشتن نیست؛ مجوز آن را 755 (یا 775) کنید.');
  const badHttp = httpChecks.filter((c) => !c.ok);
  if (badHttp.length) warnings.push(`${badHttp.length} مورد از بررسی‌های HTTP ناموفق بود (ستون «بررسی زنده»).`);
  if (env.installed && !env.baseUrl) warnings.push('«آدرس پایه سایت» در تنظیمات خالی است؛ لینک QR و پیامک بدون دامنه ساخته می‌شود.');
  const noSeed = modules.filter((m) => m.missingSeed);
  if (noSeed.length) warnings.push(`داده‌های اولیه این ماژول‌ها ناقص است: ${noSeed.map((m) => m.title).join('، ')} — دکمه «ترمیم داده‌های اولیه» را بزنید.`);

  return {
    env, files, httpChecks, modules, counts, warnings,
    ok: warnings.length === 0
  };
}

/** اجرای مجدد داده‌های اولیه ماژول‌ها (ترمیم) */
async function repair(app, actor) {
  const results = await app.modules.installAll(actor, { reason: 'repair' });
  return results.map((r) => ({
    key: r.key,
    title: (app.modules.get(r.key) || {}).title || r.key,
    ok: !!r.ok,
    error: r.error || ''
  }));
}

module.exports = { collect, repair, REQUIRED_FILES, HTTP_CHECKS, fileReport };
