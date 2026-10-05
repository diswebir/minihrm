#!/usr/bin/env node
/**
 * پاک‌سازی داده‌های آزمایشی که اسکریپت‌های توسعه ساخته‌اند
 * ------------------------------------------------------------------
 *   node scripts/dev/cleanup-test-data.js          → فقط گزارش (بدون حذف)
 *   node scripts/dev/cleanup-test-data.js --yes    → حذف واقعی
 *
 * ملاک تشخیص: پرونده‌هایی که نام متقاضی آن‌ها «متن آزمایشی» است یا موبایل‌شان
 * با الگوی ۰۹۱۲۷xxxxxxx (ساخته‌شده توسط e2e-portal.js) مطابقت دارد.
 * قبل از حذف از پایگاه‌داده، یک پشتیبان JSON گرفته می‌شود.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DB = path.join(ROOT, 'data', 'db');
const apply = process.argv.includes('--yes');
const TEST_NAME = /متن آزمایشی/;
const TEST_MOBILE = /^0912[7-9]\d{6}$/;

function readCol(name) {
  try { return JSON.parse(fs.readFileSync(path.join(DB, name + '.json'), 'utf8')); } catch (e) { return null; }
}
function writeCol(name, rows) {
  const file = path.join(DB, name + '.json');
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 1), 'utf8');
  fs.renameSync(tmp, file);
}

const apps = readCol('applications') || [];
const applicants = readCol('applicants') || [];
const results = readCol('assessment_results') || [];

const testApps = apps.filter((a) => TEST_NAME.test(String(a.name || '')) || TEST_MOBILE.test(String(a.mobile || '')));
const testApplicantIds = new Set(testApps.map((a) => a.applicantId).filter(Boolean));
const testApplicants = applicants.filter((a) => testApplicantIds.has(a.id) || TEST_NAME.test(String(a.name || '')) || TEST_MOBILE.test(String(a.mobile || '')));
const appIds = new Set(testApps.map((a) => a.id));
const testResults = results.filter((r) => appIds.has(r.applicationId));
const keepApps = apps.filter((a) => !appIds.has(a.id));
const keepApplicants = applicants.filter((a) => !testApplicants.some((t) => t.id === a.id));
const keepResults = results.filter((r) => !appIds.has(r.applicationId));

console.log('پرونده‌های آزمایشی:', testApps.length, testApps.slice(0, 12).map((a) => a.code).join(', ') + (testApps.length > 12 ? ' …' : ''));
console.log('حساب‌های متقاضی آزمایشی:', testApplicants.length);
console.log('نتایج آزمون آزمایشی:', testResults.length);
console.log('باقی‌مانده → پرونده‌ها:', keepApps.length, '| متقاضیان:', keepApplicants.length, '| نتایج آزمون:', keepResults.length);

if (!testApps.length && !testApplicants.length && !testResults.length) {
  console.log('\nچیزی برای پاک‌سازی نیست.');
  process.exit(0);
}
if (!apply) {
  console.log('\n(حالت گزارش — برای حذف واقعی: node scripts/dev/cleanup-test-data.js --yes)');
  process.exit(0);
}

const backupDir = path.join(ROOT, 'data', 'logs');
fs.mkdirSync(backupDir, { recursive: true });
const backup = path.join(backupDir, 'test-data-backup-' + Date.now() + '.json');
fs.writeFileSync(backup, JSON.stringify({ applications: testApps, applicants: testApplicants, assessment_results: testResults }, null, 1), 'utf8');
console.log('\nپشتیبان:', path.relative(ROOT, backup));

writeCol('applications', keepApps);
writeCol('applicants', keepApplicants);
writeCol('assessment_results', keepResults);
console.log('پاک‌سازی انجام شد.');
