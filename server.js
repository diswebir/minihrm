'use strict';
/** MiniHRM — نقطه شروع سرور (سازگار با Passenger هاست cPanel و اجرای مستقیم) */

// حذف هشدار آزمایشی بودن SQLite داخلی Node (فقط همان هشدار خاص)
const origEmitWarning = process.emitWarning;
process.emitWarning = function (warning, ...args) {
  if (String(warning).includes('SQLite is an experimental feature')) return;
  return origEmitWarning.call(process, warning, ...args);
};

const config = require('./src/config');
const db = require('./src/db');
const seed = require('./src/seed');

async function main() {
  // راه‌اندازی پایگاه داده
  const { engine } = await db.init(config.DB_PATH);
  console.log(`[db] engine: ${engine} — path: ${config.DB_PATH}`);
  seed.run();
  console.log('[db] schema & seed ready');

  const { createApp } = require('./app');
  const app = createApp();

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '0.0.0.0';

  const server = app.listen(port, host, () => {
    console.log(`[minihrm] listening on http://${host}:${port}`);
  });

  const shutdown = () => {
    console.log('\n[minihrm] shutting down...');
    try { db.close(); } catch (_) { /* ignore */ }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
