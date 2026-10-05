#!/usr/bin/env node
/**
 * مینی HRM — نقطه ورود برنامه
 * ------------------------------------------------------------------
 * نصب روی هاست cPanel (بدون SSH):  Setup Node.js App → Application startup file = app.js
 * نصب روی سرور شخصی:               node app.js
 *
 * تمام تنظیمات از طریق «ویزارد نصب» در آدرس /install انجام می‌شود.
 */
'use strict';

const path = require('path');
const ROOT = __dirname;

// مسیر ریشه پروژه برای همه ماژول‌ها
process.env.HRM_ROOT = ROOT;

const { createServer } = require(path.join(ROOT, 'src', 'core', 'http', 'server.js'));

const PORT = parseInt(process.env.PORT || process.env.NODE_PORT || '3000', 10);
const HOST = process.env.HOST || process.env.NODE_HOST || '0.0.0.0';

(async function main() {
  try {
    const server = await createServer({ root: ROOT });
    server.listen(PORT, HOST, () => {
      const url = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
      console.log('');
      console.log('  ┌──────────────────────────────────────────────┐');
      console.log('  │            مینی HRM — سامانه منابع انسانی     │');
      console.log('  └──────────────────────────────────────────────┘');
      console.log(`   آدرس اجرا      : ${url}`);
      console.log(`   پنل مدیریت     : ${url}/admin`);
      console.log(`   ویزارد نصب     : ${url}/install`);
      console.log(`   پورتال استخدام : ${url}/careers`);
      console.log(`   محیط اجرا      : Node ${process.version}`);
      console.log('');
    });
  } catch (err) {
    console.error('راه‌اندازی برنامه با خطا مواجه شد:', err);
    process.exit(1);
  }
})();

// در برابر خطاهای پیش‌بینی‌نشده، سرور نباید از کار بیفتد
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err && err.stack ? err.stack : err);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.stack ? err.stack : err);
});
