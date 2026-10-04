// ═══════════════════════════════════════════════════════════
//  Install Module - First-time Setup Wizard
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../database/connection');
const { isNotInstalled } = require('../middleware/auth');

// Check if already installed - redirect to login
router.get('/', (req, res) => {
  const db = getDb();
  const admin = db.prepare("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1").get();
  if (admin) {
    return res.redirect('/login');
  }
  res.render('install/index', {
    title: 'نصب و راه‌اندازی MiniHRM',
    layout: 'layouts/auth',
    step: 1
  });
});

// Step 1: Company Info
router.post('/step1', isNotInstalled, (req, res) => {
  const { company_name, company_phone, company_email, company_address } = req.body;

  if (!company_name) {
    req.flash('error', 'نام شرکت الزامی است');
    return res.redirect('/install');
  }

  // Save company info temporarily in session
  req.session.installData = {
    company_name,
    company_phone: company_phone || '',
    company_email: company_email || '',
    company_address: company_address || '',
  };

  res.render('install/index', {
    title: 'نصب و راه‌اندازی MiniHRM',
    layout: 'layouts/auth',
    step: 2,
    installData: req.session.installData
  });
});

// Step 2: Admin Account
router.post('/step2', isNotInstalled, async (req, res) => {
  const { username, password, password_confirm, first_name, last_name, phone } = req.body;

  if (!username || !password || !first_name || !last_name) {
    req.flash('error', 'تمام فیلدهای الزامی را پر کنید');
    return res.render('install/index', {
      title: 'نصب و راه‌اندازی MiniHRM',
      layout: 'layouts/auth',
      step: 2,
      installData: req.session.installData
    });
  }

  if (password.length < 6) {
    req.flash('error', 'رمز عبور باید حداقل ۶ کاراکتر باشد');
    return res.render('install/index', {
      title: 'نصب و راه‌اندازی MiniHRM',
      layout: 'layouts/auth',
      step: 2,
      installData: req.session.installData
    });
  }

  if (password !== password_confirm) {
    req.flash('error', 'رمز عبور و تکرار آن مطابقت ندارند');
    return res.render('install/index', {
      title: 'نصب و راه‌اندازی MiniHRM',
      layout: 'layouts/auth',
      step: 2,
      installData: req.session.installData
    });
  }

  try {
    const db = getDb();
    const passwordHash = await bcrypt.hash(password, 12);

    // Create super admin
    db.prepare(`
      INSERT INTO users (username, password_hash, role, first_name, last_name, phone) VALUES (?, ?, 'super_admin', ?, ?, ?)
    `).run(username, passwordHash, first_name, last_name, phone || '');

    // Save company settings
    const updateSetting = db.prepare("UPDATE settings SET setting_value = ? WHERE setting_key = ?");
    const installData = req.session.installData || {};
    updateSetting.run(installData.company_name || '', 'company_name');
    updateSetting.run(installData.company_phone || '', 'company_phone');
    updateSetting.run(installData.company_email || '', 'company_email');
    updateSetting.run(installData.company_address || '', 'company_address');

    // Clear install session data
    delete req.session.installData;

    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, module, description, ip_address) VALUES (?, 'install', 'system', ?, ?)
    `).run(
      db.prepare("SELECT last_insert_rowid() as id").get().id,
      'نصب و راه‌اندازی سامانه',
      req.ip
    );

    res.render('install/index', {
      title: 'نصب و راه‌اندازی MiniHRM',
      layout: 'layouts/auth',
      step: 3,
      success: true
    });

  } catch (error) {
    console.error('Install error:', error);
    req.flash('error', 'خطا در نصب. لطفاً دوباره تلاش کنید');
    return res.render('install/index', {
      title: 'نصب و راه‌اندازی MiniHRM',
      layout: 'layouts/auth',
      step: 2,
      installData: req.session.installData
    });
  }
});

module.exports = router;