/**
 * پشتیبانی از نصب در زیرمسیر (cPanel / Passenger / پروکسی معکوس)
 * ------------------------------------------------------------------
 * اگر سامانه در آدرسی مانند https://example.com/hrm نصب شود، cPanel متغیر
 * PASSENGER_BASE_URI=/hrm را تنظیم می‌کند و همه درخواست‌ها با پیشوند /hrm
 * به برنامه می‌رسند. این ماژول پیشوند را تشخیص می‌دهد، از مسیر ورودی حذف
 * می‌کند و برای ساخت لینک‌های خروجی (ریدایرکت، دارایی‌ها، QR، پیامک) برمی‌گرداند.
 *
 * ترتیب اولویت تشخیص:
 *   ۱) متغیر محیطی HRM_BASE_PATH (تنظیم دستی؛ خالی = اجرا روی ریشه)
 *   ۲) PASSENGER_BASE_URI (cPanel / Passenger)
 *   ۳) هدر X-Forwarded-Prefix (پروکسی معکوس مانند Nginx/Traefik)
 *   ۴) بخش مسیرِ app.baseUrl (مثلاً https://example.com/hrm → /hrm)
 */
'use strict';

const SAFE = /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/;

/** نرمال‌سازی پیشوند: اسلش ابتدایی، بدون اسلش انتهایی، «/» → '' */
function normalizeBasePath(value) {
  let v = String(value === undefined || value === null ? '' : value).trim();
  if (!v) return '';
  // اگر آدرس کامل داده شده باشد، فقط مسیر آن را برمی‌داریم
  if (/^https?:\/\//i.test(v)) {
    try { v = new URL(v).pathname || ''; } catch (e) { return ''; }
  }
  if (v.includes('?') || v.includes('#')) v = v.split(/[?#]/)[0];
  v = v.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  if (!v.startsWith('/')) v = '/' + v;
  v = v.replace(/\/+$/, '');
  if (v === '' || v === '/') return '';
  if (!SAFE.test(v) || v.includes('..')) return '';   // مقدار مشکوک → نادیده
  return v;
}

/** آخرین مقدار یک هدر چندمقداری (زنجیره پروکسی) */
function lastHeaderValue(raw) {
  const s = Array.isArray(raw) ? raw.join(',') : String(raw || '');
  const parts = s.split(',').map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

/**
 * تشخیص پیشوند نصب.
 * @param {object} [req] درخواست (برای هدرهای پروکسی)
 * @param {object} [config] ConfigStore برای خواندن app.baseUrl
 */
function detectBasePath(req, config) {
  if (process.env.HRM_BASE_PATH !== undefined) return normalizeBasePath(process.env.HRM_BASE_PATH);

  const passenger = normalizeBasePath(process.env.PASSENGER_BASE_URI || '');
  if (passenger) return passenger;

  if (req && req.headers) {
    const forwarded = normalizeBasePath(lastHeaderValue(req.headers['x-forwarded-prefix']));
    if (forwarded) return forwarded;
    // برخی پروکسی‌ها پیشوند را در X-Forwarded-Path/X-Script-Name می‌گذارند
    const alt = normalizeBasePath(lastHeaderValue(req.headers['x-forwarded-path']) || lastHeaderValue(req.headers['x-script-name']));
    if (alt) return alt;
  }

  if (config && typeof config.get === 'function') {
    const configured = normalizeBasePath(config.get('app.baseUrl', '') || '');
    if (configured) return configured;
  }
  return '';
}

/** حذف پیشوند از مسیر ورودی (اگر وجود داشته باشد) */
function stripBasePath(pathname, basePath) {
  if (!basePath) return pathname;
  const p = String(pathname || '/');
  if (p === basePath || p === basePath + '/') return '/';
  if (p.startsWith(basePath + '/')) return p.slice(basePath.length);
  return p;   // درخواست بدون پیشوند (مثلاً تست مستقیم) دست‌نخورده می‌ماند
}

/** افزودن پیشوند به یک مسیر خروجی (لینک، ریدایرکت، دارایی) */
function withBasePath(url, basePath) {
  const s = String(url === undefined || url === null ? '' : url);
  if (!basePath) return s;
  if (!s.startsWith('/')) return s;            // آدرس کامل یا نسبی
  if (s.startsWith('//')) return s;            // پروتکل-نسبی
  if (s === basePath || s.startsWith(basePath + '/')) return s;  // از قبل پیشوند دارد
  return basePath + s;
}

module.exports = { detectBasePath, stripBasePath, withBasePath, normalizeBasePath };
