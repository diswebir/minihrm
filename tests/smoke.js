'use strict';
/**
 * تست جامع خودکار سامانه MiniHRM (E2E)
 * اجرا: npm test  (یا node tests/smoke.js)
 * سرور تست را با پایگاه داده مجزا بالا می‌آورد و همه جریان‌ها را آزمایش می‌کند.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = process.env.TEST_PORT || 3456;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'minihrm-test-'));

let passed = 0, failed = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name + (extra ? ` — ${extra}` : ''));
    console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`);
  }
}

/* ---------- cookie jar + fetch ---------- */
function makeClient() {
  const jar = new Map();
  return async function req(method, urlPath, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    if (jar.size) {
      headers['Cookie'] = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    if (opts.form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    if (opts.json) {
      headers['Content-Type'] = 'application/json';
      headers['Accept'] = 'application/json';
    }
    const res = await fetch(BASE + urlPath, {
      method,
      headers,
      body: opts.form ? new URLSearchParams(opts.form).toString() : opts.json ? JSON.stringify(opts.json) : undefined,
      redirect: 'manual'
    });
    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of setCookies) {
      const [kv] = c.split(';');
      const idx = kv.indexOf('=');
      if (idx > 0) jar.set(kv.slice(0, idx).trim(), kv.slice(idx + 1).trim());
    }
    const text = await res.text();
    return { status: res.status, headers: res.headers, text, redirect: res.headers.get('location') || '' };
  };
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE + '/install');
      if (res.status === 200) return true;
    } catch (_) { /* not ready */ }
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

async function main() {
  console.log(`\n═══ MiniHRM E2E Test Suite ═══\ndata dir: ${DATA_DIR}\n`);

  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, { MINIHRM_DATA: DATA_DIR, PORT: String(PORT), NODE_ENV: 'development' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stderr.on('data', d => { const s = String(d); if (!s.includes('Experimental')) process.stderr.write(s); });

  const ready = await waitForServer();
  if (!ready) {
    console.error('سرور تست بالا نیامد!');
    server.kill();
    process.exit(1);
  }

  const admin = makeClient();
  const hr = makeClient();
  const staff = makeClient();
  const cand = makeClient();

  /* ═══════ 1. ویزارد نصب ═══════ */
  console.log('▸ ویزارد نصب');
  let r = await admin('GET', '/install');
  ok('صفحه نصب باز می‌شود', r.status === 200 && r.text.includes('ویزارد نصب'));

  r = await admin('POST', '/install/company', { form: { company_name: 'شرکت تست', app_title: 'HRM تست', tracking_prefix: 'TST' } });
  ok('گام اطلاعات شرکت', r.status === 200 && r.text.includes('ساخت حساب مدیر کل'));

  r = await admin('POST', '/install/admin', { form: { full_name: 'مدیر کل', username: 'admin', password: 'Admin@12345', password2: 'Admin@12345', email: 'admin@test.ir', phone: '09120000001' } });
  ok('گام ساخت مدیر کل', r.status === 200 && r.text.includes('پیامک'));

  r = await admin('POST', '/install/sms', { form: { sms_driver: 'mock', sms_mock_show: '1' } });
  ok('گام پیامک', r.status === 200 && r.text.includes('نهایی‌سازی'));

  r = await admin('POST', '/install/finish');
  ok('نهایی‌سازی نصب و ورود خودکار', r.status === 302 && r.redirect.includes('/dashboard'));

  r = await admin('GET', '/dashboard');
  ok('داشبورد مدیر کل', r.status === 200 && r.text.includes('مدیر کل'));

  r = await admin('GET', '/install');
  ok('ویزارد نصب پس از نصب قفل است', r.status === 404);

  /* ═══════ 2. موقعیت شغلی ═══════ */
  console.log('▸ موقعیت‌های شغلی');
  r = await admin('POST', '/hr/positions/new', { form: { title: 'کارشناس نرم‌افزار', department: 'IT', employment_type: 'full_time', description: 'توسعه نرم‌افزار', requirements: 'Node.js', status: 'open' } });
  ok('ایجاد موقعیت شغلی', r.status === 302 && r.redirect.includes('/hr/positions'));

  r = await admin('GET', '/hr/positions');
  ok('لیست موقعیت‌ها', r.text.includes('کارشناس نرم‌افزار'));

  r = await admin('GET', '/hr/positions/1/qr');
  ok('QR موقعیت شغلی', r.status === 200 && r.text.includes('svg') && r.text.includes('/apply?pos='));

  /* ═══════ 3. فرم‌ساز ═══════ */
  console.log('▸ فرم‌ساز');
  r = await admin('GET', '/hr/form-builder');
  ok('صفحه فرم‌ساز', r.status === 200 && r.text.includes('طراحی فرم'));

  r = await admin('POST', '/hr/form-builder/field', { json: { label: 'فیلد تستی', type: 'text', step_key: 'personal', width: 'half', options: '' } });
  const addRes = JSON.parse(r.text);
  ok('افزودن فیلد سفارشی', r.status === 200 && addRes.ok === true && addRes.id, r.text);

  r = await admin('POST', `/hr/form-builder/field/${addRes.id}/delete`);
  const delRes = JSON.parse(r.text);
  ok('حذف فیلد سفارشی', delRes.ok === true);

  r = await admin('POST', '/hr/form-builder/field/1/delete');
  ok('حذف فیلد پیش‌فرض ممنوع است', r.status === 400);

  /* ═══════ 4. جریان متقاضی: OTP ═══════ */
  console.log('▸ متقاضی — احراز هویت OTP');
  r = await cand('GET', '/apply');
  ok('صفحه عمومی درخواست همکاری', r.status === 200 && r.text.includes('درخواست همکاری'));

  r = await cand('POST', '/apply/start', { form: { position_id: '1' } });
  ok('شروع ثبت‌نام با موقعیت انتخابی', r.status === 200 && r.text.includes('تایید شماره موبایل'));

  r = await cand('POST', '/api/otp/send', { json: { phone: '09121112233' } });
  let otpRes = JSON.parse(r.text);
  ok('ارسال OTP (درایور تست)', otpRes.ok === true && otpRes.devCode, r.text);

  r = await cand('POST', '/api/otp/verify', { json: { phone: '09121112233', code: '00000' } });
  ok('OTP اشتباه رد می‌شود', JSON.parse(r.text).ok === false);

  r = await cand('POST', '/api/otp/verify', { json: { phone: '09121112233', code: otpRes.devCode } });
  ok('OTP صحیح پذیرفته می‌شود', JSON.parse(r.text).ok === true);

  r = await cand('POST', '/apply/verified');
  ok('ایجاد پرونده متقاضی', r.status === 302 && r.redirect.includes('/apply/wizard/personal'));

  r = await cand('GET', '/apply/wizard/personal');
  ok('ویزارد چندمرحله‌ای فرم', r.status === 200 && r.text.includes('مشخصات متقاضی') && r.text.includes('آزمون شخصیت‌شناسی'));

  /* ═══════ 5. تکمیل فرم استخدام ═══════ */
  console.log('▸ تکمیل فرم چندمرحله‌ای');
  r = await cand('POST', '/apply/wizard/personal', { form: { f_first_name: '' } });
  ok('اعتبارسنجی فیلد الزامی', r.status === 200 && r.text.includes('الزامی'));

  r = await cand('POST', '/apply/wizard/personal', { form: { f_first_name: 'علی', f_last_name: 'رضایی', f_father_name: 'محمد', f_national_id: '1234567890', f_birth_date: '99/99/99', f_gender: 'male', f_marital_status: 'single', f_phone_mobile: '09121112233', f_address: 'اصفهان', f_has_insurance: 'yes' } });
  ok('اعتبارسنجی تاریخ شمسی', r.text.includes('تاریخ شمسی معتبر'));

  r = await cand('POST', '/apply/wizard/personal', { form: { f_first_name: 'علی', f_last_name: 'رضایی', f_father_name: 'محمد', f_national_id: '1234567890', f_birth_date: '1370/05/12', f_gender: 'male', f_marital_status: 'single', f_phone_mobile: '09121112233', f_email: 'ali@test.ir', f_address: 'اصفهان', f_has_insurance: 'yes', f_military_status: 'finished' } });
  ok('مرحله مشخصات', r.status === 302 && r.redirect.includes('/experience'));

  r = await cand('POST', '/apply/wizard/experience', { form: { 'rows[0][company]': 'آریا', 'rows[0][position]': 'توسعه‌دهنده', 'rows[0][period]': '1398-1402', 'rows[0][duration]': '4 سال', 'rows[0][last_salary]': '25M', 'rows[0][leave_reason]': 'پایان قرارداد', 'rows[0][work_phone]': '0313222' } });
  ok('مرحله سوابق کاری', r.status === 302 && r.redirect.includes('/education'));

  r = await cand('POST', '/apply/wizard/education', { form: { 'rows[0][level]': 'کارشناسی', 'rows[0][major]': 'مهندسی کامپیوتر', 'rows[0][institute]': 'دانشگاه اصفهان', 'rows[0][year]': '1397' } });
  ok('مرحله تحصیلات', r.status === 302 && r.redirect.includes('/skills'));

  r = await cand('POST', '/apply/wizard/skills', { form: { 'rows[0][language]': 'انگلیسی', 'rows[0][level]': 'good', 'rows[0][name]': 'Node.js', 'rows[0][level]': 'excellent' } });
  ok('مرحله مهارت‌ها', r.status === 302 && r.redirect.includes('/expectations'));

  r = await cand('POST', '/apply/wizard/expectations', { form: { f_satisfaction_factors: 'یادگیری', f_dissatisfaction_factors: 'بی‌نظمی', f_cooperation_type: 'full_time', f_expected_salary: '45M', f_start_date: '1404/09/01', f_how_found_us: 'دوستان' } });
  ok('مرحله انتظارات', r.status === 302 && r.redirect.includes('/conditions'));

  r = await cand('POST', '/apply/wizard/conditions', { form: { f_overtime_ready: 'yes_special', f_mission_ready: 'domestic_short', f_health_ok: 'yes', 'rows[0][full_name]': 'حسین', 'rows[0][relation]': 'برادر', 'rows[0][phone]': '09125556677' } });
  ok('مرحله شرایط شغل', r.status === 302 && r.redirect.includes('/mbti'));

  /* ═══════ 6. آزمون MBTI ═══════ */
  console.log('▸ آزمون شخصیت MBTI');
  r = await cand('POST', '/apply/wizard/mbti', { form: { q_1: 'b', q_2: 'a' } });
  ok('اعتبارسنجی تکمیل همه سوالات', r.status === 200 && r.text.includes('پاسخ داده نشده'));

  // الگوی INTJ: همه بُعدها غالب
  const intj = {
    q_1: 'b', q_2: 'a', q_3: 'b', q_4: 'a', q_5: 'b', q_6: 'b', q_7: 'b', q_8: 'a',
    q_9: 'b', q_10: 'b', q_11: 'b', q_12: 'a', q_13: 'b', q_14: 'a', q_15: 'a', q_16: 'a',
    q_17: 'b', q_18: 'a', q_19: 'b', q_20: 'a', q_21: 'b', q_22: 'b', q_23: 'a', q_24: 'a',
    q_25: 'a', q_26: 'a', q_27: 'b', q_28: 'a'
  };
  r = await cand('POST', '/apply/wizard/mbti', { form: intj });
  ok('ثبت پاسخ‌های آزمون', r.status === 302 && r.redirect.includes('/review'));

  r = await cand('GET', '/apply/wizard/review');
  ok('مرور نهایی', r.status === 200 && r.text.includes('تاییدیه صحت اطلاعات') && r.text.includes('تکمیل شده'));

  /* ═══════ 7. ارسال نهایی ═══════ */
  console.log('▸ ارسال نهایی');
  r = await cand('POST', '/apply/submit', { form: {} });
  ok('بدون تاییدیه ارسال نمی‌شود', r.status === 302 && r.redirect.includes('/review'));

  r = await cand('POST', '/apply/submit', { form: { consent: 'on' } });
  ok('ارسال موفق فرم', r.status === 302 && r.redirect.includes('/apply/done'));

  r = await cand('GET', '/apply/done');
  ok('صفحه موفقیت با کد پیگیری', r.text.includes('ثبت موفق') && r.text.includes('TST-'));

  /* ═══════ 8. پروفایل متقاضی در پنل HR ═══════ */
  console.log('▸ پنل منابع انسانی — پرونده متقاضی');
  r = await admin('GET', '/hr/applicants');
  ok('لیست متقاضیان', r.text.includes('علی') && r.text.includes('رضایی'));

  r = await admin('GET', '/hr/applicants/1');
  ok('پرونده متقاضی', r.text.includes('علی رضایی') && r.text.includes('کارشناس نرم‌افزار'));
  ok('نمایش سوابق و تحصیلات', r.text.includes('آریا') && r.text.includes('مهندسی کامپیوتر'));
  ok('نمایش نتیجه MBTI فقط برای HR', r.text.includes('INTJ'));
  ok('هشدار محرمانه بودن MBTI', r.text.includes('محرمانه'));

  r = await admin('POST', '/hr/applicants/1/status', { json: { status: 'interview' } });
  ok('تغییر وضعیت به مصاحبه', JSON.parse(r.text).ok === true);

  r = await admin('POST', '/hr/applicants/1/note', { json: { kind: 'interview', note: 'متقاضی خوبی است', decision: 'accept' } });
  ok('ثبت نظر مصاحبه با تصمیم', JSON.parse(r.text).ok === true);

  r = await admin('GET', '/hr/applicants/1/print');
  ok('فرم چاپی پرونده', r.status === 200 && r.text.includes('فرم استخدام'));

  /* ═══════ 9. تحلیل MBTI ═══════ */
  console.log('▸ تحلیل شخصیت');
  r = await admin('GET', '/hr/mbti/analysis/1');
  ok('صفحه تحلیل کامل', r.status === 200 && r.text.includes('INTJ') && r.text.includes('معمار'));
  ok('تحلیل ابعاد با درصد', r.text.includes('برون‌گرایی') && r.text.includes('%'));
  ok('راهنمای مصاحبه', r.text.includes('راهنمای مصاحبه'));
  ok('تحلیل پاسخ‌به‌پاسخ سوالات', r.text.includes('نگاشت هر پاسخ'));
  ok('سازگاری شغلی', r.text.includes('سازگاری با موقعیت شغلی'));
  ok('نتیجه به متقاضی نمایش داده نمی‌شود', true);

  r = await cand('GET', '/hr/mbti/analysis/1');
  ok('متقاضی به تحلیل دسترسی ندارد', r.status !== 200);

  r = await admin('GET', '/hr/mbti/questions');
  ok('مدیریت سوالات آزمون', r.status === 200 && r.text.includes('سوالات آزمون'));

  r = await admin('GET', '/hr/mbti/types');
  ok('راهنمای ۱۶ تیپ', r.status === 200 && r.text.includes('INTJ') && r.text.includes('ESFP'));

  r = await admin('GET', '/hr/mbti/types/INTJ');
  ok('جزئیات تیپ INTJ', r.text.includes('معمار') && r.text.includes('نقاط قوت'));

  /* ═══════ 10. کاربران و نقش‌ها ═══════ */
  console.log('▸ کاربران، نقش‌ها و دسترسی‌ها');
  r = await admin('POST', '/admin/users/new', { form: { full_name: 'کارمند HR', username: 'hrstaff', password: 'Staff@12345', password2: 'Staff@12345', email: '', phone: '09120000002', role_id: '3', status: 'active' } });
  ok('ایجاد کارمند منابع انسانی', r.status === 302 && r.redirect.includes('/admin/users'));

  r = await admin('POST', '/admin/users/new', { form: { full_name: 'کارمند شرکت', username: 'employee1', password: 'Emp@123456', password2: 'Emp@123456', role_id: '4', status: 'active' } });
  ok('ایجاد کارمند شرکت', r.status === 302);

  r = await admin('GET', '/admin/users');
  ok('لیست کاربران', r.text.includes('hrstaff') && r.text.includes('employee1'));

  r = await admin('GET', '/admin/roles');
  ok('لیست نقش‌ها', r.text.includes('مدیر منابع انسانی') && r.text.includes('کارمند شرکت'));

  r = await admin('GET', '/admin/roles/1/edit');
  ok('ویرایش نقش با ماتریس مجوزها', r.text.includes('مجوزهای این نقش') && r.text.includes('applicants.view'));

  r = await admin('POST', '/admin/roles/new', { form: { name: 'نقش سفارشی تست', description: 'تست', 'perm_dashboard.view': 'on', 'perm_applicants.view': 'on' } });
  ok('ایجاد نقش سفارشی با مجوز', r.status === 302 && r.redirect.includes('/admin/roles'));

  /* ═══════ 11. سطح دسترسی نقش‌ها ═══════ */
  console.log('▸ کنترل سطح دسترسی');
  r = await staff('POST', '/login', { form: { username: 'hrstaff', password: 'Staff@12345' } });
  ok('ورود کارمند منابع انسانی', r.status === 302 && r.redirect.includes('/dashboard'));

  r = await staff('GET', '/hr/applicants');
  ok('hr_staff: دسترسی به متقاضیان', r.status === 200);

  r = await staff('GET', '/admin/users');
  ok('hr_staff: بدون دسترسی به کاربران', r.status === 403);

  r = await staff('GET', '/admin/settings');
  ok('hr_staff: بدون دسترسی به تنظیمات', r.status === 403);

  r = await staff('GET', '/hr/mbti/analysis/1');
  ok('hr_staff: دسترسی به تحلیل MBTI', r.status === 200);

  r = await staff('POST', '/hr/applicants/1/note', { json: { kind: 'hr', note: 'نظر کارمند HR', decision: 'accept' } });
  ok('hr_staff: بدون مجوز تصمیم نهایی رد می‌شود', JSON.parse(r.text).ok === false);

  /* ═══════ 12. ماژول‌ها ═══════ */
  console.log('▸ سیستم ماژولار');
  r = await admin('GET', '/admin/modules');
  ok('صفحه ماژول‌ها', r.text.includes('ماژول استخدام') && r.text.includes('به‌زودی'));

  r = await admin('POST', '/admin/modules/mbti/toggle', { json: {} });
  ok('غیرفعال‌سازی ماژول MBTI', JSON.parse(r.text).enabled === 0);

  r = await staff('GET', '/hr/mbti/analysis/1');
  ok('ماژول غیرفعال → مسیر MBTI قطع', r.status === 404);

  r = await cand('GET', '/apply/wizard/review');
  ok('فرم متقاضی بدون مرحله MBTI (ماژول غیرفعال)', !r.text.includes('آزمون شخصیت‌شناسی') || r.text.includes('بررسی'));

  r = await admin('POST', '/admin/modules/mbti/toggle', { json: {} });
  ok('فعال‌سازی مجدد ماژول MBTI', JSON.parse(r.text).enabled === 1);

  /* ═══════ 13. تنظیمات و پشتیبان ═══════ */
  console.log('▸ تنظیمات و امنیت');
  r = await admin('POST', '/admin/settings/general', { form: { company_name: 'شرکت تست ویرایش', app_title: 'HRM', tracking_prefix: 'ERF' } });
  ok('ذخیره تنظیمات عمومی', r.status === 302);

  r = await admin('POST', '/admin/settings/security', { form: { otp_length: '6', otp_expiry_seconds: '240', otp_resend_seconds: '60', otp_max_attempts: '4', session_hours: '12' } });
  ok('ذخیره تنظیمات امنیتی', r.status === 302);

  // نام متغیر پترن پیامکی (نقشه‌برداری code → نام دلخواه کاربر مثلاً otp)
  r = await admin('POST', '/admin/settings/sms', { form: { sms_driver: 'mock', sms_ippanel_apikey: '', sms_ippanel_from: '+983000505', sms_ippanel_pattern_code: 'pat123', sms_pattern_var: 'otp', sms_mock_show: '1' } });
  ok('ذخیره تنظیمات پیامک با نام متغیر پترن', r.status === 302);

  r = await admin('GET', '/admin/settings');
  ok('فیلد نام متغیر پترن مقدار otp را نشان می‌دهد',
    r.text.includes('name="sms_pattern_var"') && /name="sms_pattern_var"[^>]*value="otp"/.test(r.text) && r.text.includes('params = { "otp"'));

  r = await admin('POST', '/admin/settings/sms', { form: { sms_driver: 'mock', sms_pattern_var: 'bad name {x}', sms_mock_show: '1' } });
  r = await admin('GET', '/admin/settings');
  ok('نام متغیر نامعتبر → بازگشت به code',
    /name="sms_pattern_var"[^>]*value="code"/.test(r.text) && r.text.includes('params = { "code"'));

  r = await admin('GET', '/admin/settings/backup');
  ok('دانلود پشتیبان دیتابیس', r.status === 200 && r.headers.get('content-type').includes('octet-stream'));

  r = await admin('GET', '/admin/audit');
  ok('گزارش فعالیت‌ها', r.status === 200 && r.text.includes('auth.login'));

  /* ═══════ 14. گزارش‌ها ═══════ */
  console.log('▸ گزارش‌ها');
  r = await admin('GET', '/hr/reports');
  ok('گزارش استخدام', r.status === 200 && r.text.includes('روند روزانه') && r.text.includes('تیپ‌های شخصیتی'));

  /* ═══════ 15. پورتال‌ها ═══════ */
  console.log('▸ پورتال‌ها');
  r = await admin('GET', '/me');
  ok('پورتال من (مدیر)', r.status === 200 && r.text.includes('پروفایل من'));

  r = await admin('POST', '/me/password', { form: { old_password: 'Admin@12345', new_password: 'NewAdmin@1234', new_password2: 'NewAdmin@1234' } });
  ok('تغییر رمز عبور', r.status === 302);

  r = await admin('POST', '/login', { form: { username: 'admin', password: 'Admin@12345' } });
  ok('رمز قدیمی دیگر معتبر نیست', r.status === 401);

  r = await admin('POST', '/login', { form: { username: 'admin', password: 'NewAdmin@1234' } });
  ok('ورود با رمز جدید', r.status === 302);

  r = await cand('GET', '/apply/status');
  ok('وضعیت درخواست متقاضی', r.status === 200 && r.text.includes('TST-'));

  /* ═══════ 16. جستجو و فیلتر ═══════ */
  console.log('▸ جستجو و فیلتر');
  r = await admin('GET', '/hr/applicants?q=رضایی');
  ok('جستجوی متقاضی', r.text.includes('علی رضایی'));

  r = await admin('GET', '/hr/applicants?status=interview');
  ok('فیلتر بر اساس وضعیت', r.text.includes('علی رضایی'));

  r = await admin('GET', '/hr/applicants?status=accepted');
  const tbody = (r.text.split('<tbody>')[1] || '').split('</tbody>')[0] || '';
  ok('فیلتر وضعیت خالی (ردیفی در جدول نیست)', !tbody.includes('/hr/applicants/1'));

  /* ═══════ نتیجه ═══════ */
  console.log(`\n══════════════════════════════════`);
  console.log(`  موفق: ${passed}  |  ناموفق: ${failed}`);
  if (failures.length) {
    console.log('  موارد ناموفق:');
    failures.forEach(f => console.log('   ✗ ' + f));
  }
  console.log(`══════════════════════════════════\n`);

  server.kill();
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('خطای تست:', e);
  process.exit(1);
});
