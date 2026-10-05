#!/usr/bin/env node
/**
 * بررسی سریع مسیرهای عمومی و ایستا (بدون مرورگر)
 *   node scripts/dev/routes.js [baseUrl]
 * پیش‌نیاز: سرور در حال اجرا باشد.
 */
'use strict';

const B = process.argv[2] || 'http://localhost:3000';

const ROUTES = [
  ['/', 302],
  ['/careers', 200],
  ['/careers?q=%D8%AE%D8%A7%D9%86%D9%87', 200],
  ['/careers/jobs/nope', 404],
  ['/apply', 200],
  ['/track', 200],
  ['/sitemap.xml', 200],
  ['/robots.txt', 200],
  ['/admin', 200],          // بدون نشست: صفحه ورود
  ['/login', 302],
  ['/install', 302],        // نصب‌شده → هدایت
  ['/invite/nope', 410],
  ['/apply/invite/nope', 410],
  ['/assets/css/app.css', 200],
  ['/assets/css/portal.css', 200],
  ['/assets/js/app.js', 200],
  ['/assets/js/portal.js', 200],
  ['/assets/admin/modules/dashboard.js', 200],
  ['/vendor/qrcode.min.js', 200],
  ['/favicon.svg', 200],
  ['/_health', 200],
  ['/nope', 404]
];

(async () => {
  let bad = 0;
  for (const [path, expected] of ROUTES) {
    let status = 0;
    let note = '';
    try {
      const res = await fetch(B + path, { redirect: 'manual' });
      status = res.status;
      const type = res.headers.get('content-type') || '';
      if (res.status === 200 && /text\/html/.test(type)) {
        const body = await res.text();
        note = ' | ' + body.length + ' بایت';
        if (/\[object |Cannot read prop/.test(body)) { note += ' ⚠ خروجی مشکوک'; bad++; }
      }
    } catch (e) {
      status = 0;
      note = ' | خطای شبکه: ' + e.message;
    }
    const ok = status === expected;
    if (!ok) bad++;
    console.log((ok ? ' ok ' : 'FAIL') + ' ' + path + ' → ' + status + ' (انتظار ' + expected + ')' + note);
  }
  console.log('---');
  console.log(bad ? bad + ' مسیر نامطابق' : 'همه ' + ROUTES.length + ' مسیر مطابق انتظار');
  process.exit(bad ? 1 : 0);
})();
