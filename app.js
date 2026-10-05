#!/usr/bin/env node
/**
 * مینی HRM — نقطه ورود برنامه
 * ------------------------------------------------------------------
 * نصب روی هاست cPanel (بدون SSH):  Setup Node.js App → Application startup file = app.js
 * نصب روی سرور شخصی:               node app.js
 *
 * متغیرهای محیطی:
 *   PORT / NODE_PORT   شماره پورت یا مسیر سوکت (cPanel/Passenger مسیر سوکت می‌دهد)
 *   HOST / NODE_HOST   پیش‌فرض 0.0.0.0
 *   HRM_BASE_PATH      اگر در زیرمسیر اجرا می‌شود، مثلاً /hrm (خودکار هم تشخیص داده می‌شود)
 *   HRM_LOG_LEVEL      info | warn | error
 */
'use strict';

const path = require('path');
const ROOT = __dirname;

// مسیر ریشه پروژه برای همه ماژول‌ها
process.env.HRM_ROOT = ROOT;

const net = require('net');
const fs = require('fs');
const { createServer } = require(path.join(ROOT, 'src', 'core', 'http', 'server.js'));
const { detectBasePath } = require(path.join(ROOT, 'src', 'core', 'http', 'basePath.js'));

// --- پورت: ممکن است عدد باشد یا مسیر سوکت یونیکس (cPanel/Passenger)
const RAW_PORT = String(process.env.PORT || process.env.NODE_PORT || '3000').trim();
const IS_TCP = /^\d+$/.test(RAW_PORT);
const PORT = IS_TCP ? parseInt(RAW_PORT, 10) : RAW_PORT;
const HOST = process.env.HOST || process.env.NODE_HOST || '0.0.0.0';

/**
 * اگر PORT یک مسیر سوکت باشد و فایل سوکت از اجرای قبلی باقی مانده ولی کسی
 * گوش نمی‌دهد، آن را پاک می‌کنیم تا اجرا با خطای EADDRINUSE متوقف نشود.
 */
function cleanupStaleSocket(socketPath) {
  return new Promise((resolve) => {
    try {
      if (!fs.existsSync(socketPath)) return resolve();
      const probe = net.connect(socketPath);
      const done = (alive) => { probe.destroy(); if (!alive) { try { fs.unlinkSync(socketPath); } catch (e) { /* ignore */ } } resolve(); };
      probe.once('connect', () => done(true));
      probe.once('error', () => done(false));
      setTimeout(() => done(false), 500);
    } catch (e) { resolve(); }
  });
}

(async function main() {
  try {
    if (!IS_TCP) await cleanupStaleSocket(PORT);
    const server = await createServer({ root: ROOT });
    const app = server.hrmApp;

    const listenArgs = IS_TCP ? [PORT, HOST] : [PORT];
    server.listen(...listenArgs, () => {
      const addr = server.address();
      const isSocket = typeof addr === 'string';

      // اطلاعات شنونده برای خودآزمایی داخلی (/diag) و ابزارها
      app.listenInfo = isSocket
        ? { socketPath: addr, hostHeader: 'localhost' }
        : { port: addr.port, host: (addr.address === '::' || addr.address === '0.0.0.0') ? '127.0.0.1' : addr.address, hostHeader: `localhost:${addr.port}` };
      const basePath = detectBasePath(null, app.config);
      const shownPort = isSocket ? '' : `:${addr.port}`;
      const label = isSocket ? 'سوکت (cPanel/Passenger)' : `${addr.address}${shownPort}`;
      const url = isSocket ? `http://localhost (سوکت)` : `http://${addr.address === '0.0.0.0' ? 'localhost' : addr.address}${shownPort}`;

      console.log('');
      console.log('  ┌──────────────────────────────────────────────┐');
      console.log('  │            مینی HRM — سامانه منابع انسانی     │');
      console.log('  └──────────────────────────────────────────────┘');
      console.log(`   آدرس اجرا      : ${label}`);
      console.log(`   پنل مدیریت     : ${url}${basePath}/admin`);
      console.log(`   ویزارد نصب     : ${url}${basePath}/install`);
      console.log(`   پورتال استخدام : ${url}${basePath}/careers`);
      console.log(`   عیب‌یابی سامانه : ${url}${basePath}/diag`);
      console.log(`   پیشوند مسیر    : ${basePath || '— (اجرا روی ریشه)'}`);
      console.log(`   محیط اجرا      : Node ${process.version}`);
      console.log('');

      // --- بررسی فایل‌های ضروری (نتیجه در لاگ، برای هاست بدون SSH)
      try { app.logBootCheck(); } catch (e) { /* بی‌خطر */ }

      // --- ترمیم خودکار داده‌های اولیه ماژول‌ها
      app.runBootRepair().catch(() => {});
    });

    server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        console.error(IS_TCP
          ? `\n  ✘ پورت ${PORT} قبلاً استفاده شده است. مقدار PORT را تغییر دهید یا برنامه قبلی را ببندید.\n`
          : `\n  ✘ مسیر سوکت ${PORT} در اختیار برنامه دیگری است.\n`);
      } else {
        console.error('\n  ✘ خطای سرور:', err && err.message ? err.message : err, '\n');
      }
      process.exit(1);
    });
  } catch (err) {
    console.error('راه‌اندازی برنامه با خطا مواجه شد:', err && err.stack ? err.stack : err);
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
