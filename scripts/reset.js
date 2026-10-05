'use strict';
/**
 * ری‌ست سامانه — حذف داده‌ها و بازگشت به ویزارد نصب
 * اجرا: node scripts/reset.js
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DATA_DIR = process.env.MINIHRM_DATA || path.join(__dirname, '..', 'data');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('⚠️ همه داده‌های سامانه حذف و به ویزارد نصب بازمی‌گردد. ادامه می‌دهید؟ (yes/no) ', (answer) => {
  rl.close();
  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('لغو شد.');
    process.exit(0);
  }
  for (const f of ['app.db', 'app.db-wal', 'app.db-shm', 'config.json']) {
    const p = path.join(DATA_DIR, f);
    if (fs.existsSync(p)) { fs.unlinkSync(p); console.log('حذف شد:', f); }
  }
  const uploads = path.join(DATA_DIR, 'uploads');
  if (fs.existsSync(uploads)) {
    fs.rmSync(uploads, { recursive: true, force: true });
    console.log('حذف شد: uploads/');
  }
  console.log('✅ ری‌ست انجام شد. سرور را دوباره اجرا کنید تا ویزارد نصب نمایش داده شود.');
});
