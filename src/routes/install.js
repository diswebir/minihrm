'use strict';
/** ویزارد نصب سامانه */
const express = require('express');
const router = express.Router();
const db = require('../db');
const config = require('../config');
const auth = require('../lib/auth');
const helpers = require('../lib/helpers');
const sms = require('../lib/sms');
const audit = require('../lib/audit');

function reqCheck() {
  const nodeOk = parseInt(process.versions.node.split('.')[0], 10) >= 18;
  let dbOk = true, dataOk = true;
  try { db.prepare('SELECT 1').get(); } catch (_) { dbOk = false; }
  try {
    const fs = require('fs');
    const testFile = require('path').join(config.DATA_DIR, '.write-test');
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
  } catch (_) { dataOk = false; }
  return {
    node: { ok: nodeOk, value: process.versions.node },
    db: { ok: dbOk, value: db.getEngine() === 'node-sqlite' ? 'SQLite داخلی Node.js' : 'SQLite (WebAssembly)' },
    data: { ok: dataOk, value: config.DATA_DIR }
  };
}

router.get('/', (req, res) => {
  res.render('pages/install', {
    title: 'نصب سامانه',
    layout: false,
    step: 1,
    checks: reqCheck(),
    error: null,
    form: {}
  });
});

router.post('/company', (req, res) => {
  const { company_name, app_title, tracking_prefix } = req.body;
  if (!company_name || !company_name.trim()) {
    return res.render('pages/install', {
      title: 'نصب سامانه', layout: false, step: 1, checks: reqCheck(),
      error: 'نام شرکت الزامی است', form: req.body
    });
  }
  req.session.installDraft = Object.assign({}, req.session.installDraft, {
    company_name: company_name.trim().slice(0, 120),
    app_title: (app_title || 'سامانه مدیریت منابع انسانی').trim().slice(0, 120),
    tracking_prefix: (tracking_prefix || 'ERF').trim().toUpperCase().slice(0, 8)
  });
  res.render('pages/install', {
    title: 'نصب سامانه', layout: false, step: 2, checks: reqCheck(),
    error: null, form: req.session.installDraft
  });
});

router.post('/admin', (req, res) => {
  const { full_name, username, password, password2, email, phone } = req.body;
  const draft = req.session.installDraft || {};
  const back = (msg) => res.render('pages/install', {
    title: 'نصب سامانه', layout: false, step: 2, checks: reqCheck(),
    error: msg, form: Object.assign({}, draft, req.body)
  });
  if (!full_name || !full_name.trim()) return back('نام و نام خانوادگی الزامی است');
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username || '')) return back('نام کاربری باید ۳ تا ۳۲ کاراکتر انگلیسی باشد');
  if (!password || password.length < 8) return back('رمز عبور باید حداقل ۸ کاراکتر باشد');
  if (password !== password2) return back('تکرار رمز عبور مطابقت ندارد');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return back('ایمیل معتبر نیست');

  req.session.installDraft = Object.assign({}, draft, {
    full_name: full_name.trim().slice(0, 100),
    username: username.trim(),
    password,
    email: (email || '').trim(),
    phone: (phone || '').trim()
  });
  res.render('pages/install', {
    title: 'نصب سامانه', layout: false, step: 3, checks: reqCheck(),
    error: null, form: req.session.installDraft
  });
});

router.post('/sms', async (req, res) => {
  const draft = req.session.installDraft || {};
  const { sms_driver, sms_ippanel_apikey, sms_ippanel_from, sms_ippanel_pattern_code, test_phone } = req.body;
  req.session.installDraft = Object.assign({}, draft, {
    sms_driver: sms_driver === 'ippanel' ? 'ippanel' : 'mock',
    sms_ippanel_apikey: (sms_ippanel_apikey || '').trim(),
    sms_ippanel_from: (sms_ippanel_from || '').trim(),
    sms_ippanel_pattern_code: (sms_ippanel_pattern_code || '').trim(),
    sms_test_result: null
  });

  // تست ارسال پیامک (اختیاری) — پس از نهایی‌سازی نصب در «تنظیمات › پیامک» قابل تست است
  if (test_phone && sms_driver === 'ippanel') {
    const phone = sms.normalizePhone(test_phone);
    req.session.installDraft.sms_test_result = phone
      ? { ok: true, message: 'تنظیمات پس از نهایی‌سازی نصب قابل تست است. می‌توانید در «تنظیمات › پیامک» آزمایش کنید.' }
      : { ok: false, message: 'شماره تست معتبر نیست' };
  }
  res.render('pages/install', {
    title: 'نصب سامانه', layout: false, step: 4, checks: reqCheck(),
    error: null, form: req.session.installDraft
  });
});

router.post('/finish', async (req, res) => {
  const draft = req.session.installDraft || {};
  if (!draft.username || !draft.password || !draft.company_name) {
    return res.redirect('/install');
  }
  try {
    // تنظیمات
    helpers.setSetting('company_name', draft.company_name);
    helpers.setSetting('app_title', draft.app_title);
    helpers.setSetting('tracking_prefix', draft.tracking_prefix || 'ERF');
    helpers.setSetting('sms_driver', draft.sms_driver || 'mock');
    helpers.setSetting('sms_ippanel_apikey', draft.sms_ippanel_apikey || '');
    helpers.setSetting('sms_ippanel_from', draft.sms_ippanel_from || '+983000505');
    helpers.setSetting('sms_ippanel_pattern_code', draft.sms_ippanel_pattern_code || '');
    helpers.setSetting('install_done', '1');

    // کاربر سوپرادمین
    const role = db.prepare("SELECT id FROM roles WHERE code = 'super_admin'").get();
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(draft.username);
    if (exists) throw new Error('این نام کاربری قبلاً ثبت شده است');
    const info = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, email, phone, role_id, is_super_admin, status)
      VALUES (?,?,?,?,?,?,1,'active')
    `).run(draft.username, auth.hashPassword(draft.password), draft.full_name, draft.email || '', draft.phone || '', role ? role.id : null);

    const cfg = config.loadConfig() || {};
    cfg.installed = true;
    cfg.installedAt = new Date().toISOString();
    config.saveConfig(cfg);

    // ورود خودکار
    req.session.userId = info.lastInsertRowid;
    const u = db.prepare('SELECT id, username, full_name, is_super_admin, role_id FROM users WHERE id = ?').get(info.lastInsertRowid);
    req.session.user = Object.assign({}, u, { role_code: 'super_admin', role_name: 'مدیر کل سامانه' });

    audit.log(req, 'install.finish', 'system', '', { username: draft.username, company: draft.company_name });
    delete req.session.installDraft;

    res.redirect('/dashboard');
  } catch (e) {
    res.render('pages/install', {
      title: 'نصب سامانه', layout: false, step: 4, checks: reqCheck(),
      error: 'خطا در نهایی‌سازی نصب: ' + e.message, form: draft
    });
  }
});

module.exports = router;
