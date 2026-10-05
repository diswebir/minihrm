'use strict';
/** پنل مدیریت: کاربران، نقش‌ها و سطوح دسترسی، ماژول‌ها، تنظیمات، گزارش فعالیت */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const upload = require('../lib/upload');
const db = require('../db');
const auth = require('../lib/auth');
const helpers = require('../lib/helpers');
const permissions = require('../lib/permissions');
const audit = require('../lib/audit');
const moduleSystem = require('../lib/modules');
const sms = require('../lib/sms');
const config = require('../config');
const { requirePerm } = require('../lib/permissions');

/** گروه‌بندی مجوزها برای فرم‌ها (باید قبل از مسیرها ثبت شود) */
router.use((req, res, next) => {
  res.locals.permissionGroups = (() => {
    const perms = db.prepare('SELECT * FROM permissions ORDER BY id').all();
    const groups = {};
    for (const p of perms) {
      if (!groups[p.grp]) groups[p.grp] = [];
      groups[p.grp].push(p);
    }
    return groups;
  })();
  next();
});

/* ================= کاربران ================= */
router.get('/users', requirePerm('users.view'), (req, res) => {
  const users = db.prepare(`
    SELECT u.*, r.name AS role_name, r.code AS role_code
    FROM users u LEFT JOIN roles r ON r.id = u.role_id ORDER BY u.id
  `).all();
  res.render('pages/admin/users', { title: 'مدیریت کاربران', activeMenu: 'users', users });
});

router.get('/users/new', requirePerm('users.manage'), (req, res) => {
  const roles = db.prepare('SELECT * FROM roles ORDER BY id').all();
  res.render('pages/admin/user-form', {
    title: 'کاربر جدید', activeMenu: 'users',
    target: null, roles, error: null,
    userPerms: {}
  });
});

router.post('/users/new', requirePerm('users.manage'), (req, res) => {
  const roles = db.prepare('SELECT * FROM roles ORDER BY id').all();
  const { full_name, username, password, password2, email, phone, role_id, status } = req.body;
  const fail = (msg) => res.render('pages/admin/user-form', {
    title: 'کاربر جدید', activeMenu: 'users', target: null, roles, error: msg,
    old: req.body, userPerms: {}
  });
  if (!full_name || !full_name.trim()) return fail('نام و نام خانوادگی الزامی است');
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username || '')) return fail('نام کاربری نامعتبر است');
  if (!password || password.length < 8) return fail('رمز عبور باید حداقل ۸ کاراکتر باشد');
  if (password !== password2) return fail('تکرار رمز عبور مطابقت ندارد');
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) return fail('نام کاربری تکراری است');
  try {
    const info = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, email, phone, role_id, status)
      VALUES (?,?,?,?,?,?,?)
    `).run(username.trim(), auth.hashPassword(password), full_name.trim(), (email || '').trim(), (phone || '').trim(), role_id || null, status === 'disabled' ? 'disabled' : 'active');
    saveUserPerms(req.body, info.lastInsertRowid);
    audit.log(req, 'user.create', 'user', info.lastInsertRowid, { username });
    helpers.notify([req.session.userId], 'کاربر جدید ثبت شد', full_name + ' به سامانه اضافه شد.', '/admin/users');
    return res.redirect('/admin/users');
  } catch (e) {
    return fail('خطا در ثبت کاربر: ' + e.message);
  }
});

router.get('/users/:id/edit', requirePerm('users.manage'), (req, res) => {
  const target = db.prepare(`
    SELECT u.*, r.code AS role_code FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?
  `).get(req.params.id);
  if (!target) return res.status(404).render('pages/error', { title: 'یافت نشد', status: 404, message: 'کاربر یافت نشد' });
  const roles = db.prepare('SELECT * FROM roles ORDER BY id').all();
  const userPerms = {};
  for (const r of db.prepare('SELECT permission_id, mode FROM user_permissions WHERE user_id = ?').all(target.id)) {
    userPerms[r.permission_id] = r.mode;
  }
  res.render('pages/admin/user-form', {
    title: 'ویرایش کاربر', activeMenu: 'users', target, roles, error: null, userPerms
  });
});

router.post('/users/:id/edit', requirePerm('users.manage'), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).render('pages/error', { title: 'یافت نشد', status: 404, message: 'کاربر یافت نشد' });
  const roles = db.prepare('SELECT * FROM roles ORDER BY id').all();
  const { full_name, email, phone, role_id, status, password, password2 } = req.body;
  const fail = (msg) => res.render('pages/admin/user-form', {
    title: 'ویرایش کاربر', activeMenu: 'users', target, roles, error: msg, old: req.body, userPerms: req.body.__perms || {}
  });
  if (!full_name || !full_name.trim()) return fail('نام و نام خانوادگی الزامی است');
  if (password && password.length < 8) return fail('رمز عبور باید حداقل ۸ کاراکتر باشد');
  if (password && password !== password2) return fail('تکرار رمز عبور مطابقت ندارد');
  if (target.is_super_admin && status === 'disabled') return fail('حساب مدیر کل قابل غیرفعال‌سازی نیست');
  try {
    if (password) {
      db.prepare('UPDATE users SET full_name=?, email=?, phone=?, role_id=?, status=?, password_hash=?, updated_at=datetime(\'now\') WHERE id=?')
        .run(full_name.trim(), (email || '').trim(), (phone || '').trim(), role_id || null, status === 'disabled' ? 'disabled' : 'active', auth.hashPassword(password), target.id);
    } else {
      db.prepare("UPDATE users SET full_name=?, email=?, phone=?, role_id=?, status=?, updated_at=datetime('now') WHERE id=?")
        .run(full_name.trim(), (email || '').trim(), (phone || '').trim(), role_id || null, status === 'disabled' ? 'disabled' : 'active', target.id);
    }
    saveUserPerms(req.body, target.id);
    permissions.invalidate(target.id);
    audit.log(req, 'user.update', 'user', target.id, { username: target.username });
    return res.redirect('/admin/users');
  } catch (e) {
    return fail('خطا در ویرایش: ' + e.message);
  }
});

function saveUserPerms(body, userId) {
  db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(userId);
  const ins = db.prepare('INSERT OR REPLACE INTO user_permissions (user_id, permission_id, mode) VALUES (?,?,?)');
  const perms = db.prepare('SELECT id, code FROM permissions').all();
  for (const p of perms) {
    const mode = body['perm_' + p.code];
    if (mode === 'grant' || mode === 'deny') ins.run(userId, p.id, mode);
  }
}

/* ================= نقش‌ها و سطوح دسترسی ================= */
router.get('/roles', requirePerm('roles.manage'), (req, res) => {
  const roles = db.prepare('SELECT * FROM roles ORDER BY id').all();
  const counts = {};
  for (const r of roles) {
    counts[r.id] = db.prepare('SELECT COUNT(*) c FROM users WHERE role_id = ?').get(r.id).c;
  }
  res.render('pages/admin/roles', { title: 'نقش‌ها و سطوح دسترسی', activeMenu: 'roles', roles, counts });
});

router.get('/roles/new', requirePerm('roles.manage'), (req, res) => {
  res.render('pages/admin/role-form', { title: 'نقش جدید', activeMenu: 'roles', role: null, rolePerms: {}, error: null });
});

router.post('/roles/new', requirePerm('roles.manage'), (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) {
    return res.render('pages/admin/role-form', { title: 'نقش جدید', activeMenu: 'roles', role: null, rolePerms: {}, error: 'نام نقش الزامی است' });
  }
  const code = 'role_' + Date.now().toString(36);
  const info = db.prepare('INSERT INTO roles (code, name, description, is_system) VALUES (?,?,?,0)').run(code, name.trim(), (description || '').trim());
  saveRolePerms(req.body, info.lastInsertRowid);
  audit.log(req, 'role.create', 'role', info.lastInsertRowid, { name });
  res.redirect('/admin/roles');
});

router.get('/roles/:id/edit', requirePerm('roles.manage'), (req, res) => {
  const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
  if (!role) return res.status(404).render('pages/error', { title: 'یافت نشد', status: 404, message: 'نقش یافت نشد' });
  const rolePerms = {};
  for (const r of db.prepare('SELECT permission_id FROM role_permissions WHERE role_id = ?').all(role.id)) {
    rolePerms[r.permission_id] = true;
  }
  res.render('pages/admin/role-form', { title: 'ویرایش نقش', activeMenu: 'roles', role, rolePerms, error: null });
});

router.post('/roles/:id/edit', requirePerm('roles.manage'), (req, res) => {
  const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
  if (!role) return res.status(404).render('pages/error', { title: 'یافت نشد', status: 404, message: 'نقش یافت نشد' });
  const { name, description } = req.body;
  if (!name || !name.trim()) {
    return res.render('pages/admin/role-form', { title: 'ویرایش نقش', activeMenu: 'roles', role, rolePerms: {}, error: 'نام نقش الزامی است' });
  }
  db.prepare('UPDATE roles SET name = ?, description = ? WHERE id = ?').run(name.trim(), (description || '').trim(), role.id);
  saveRolePerms(req.body, role.id);
  permissions.invalidate();
  audit.log(req, 'role.update', 'role', role.id, { name });
  res.redirect('/admin/roles');
});

router.post('/roles/:id/delete', requirePerm('roles.manage'), (req, res) => {
  const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
  if (!role || role.is_system) {
    return res.status(400).render('pages/error', { title: 'خطا', status: 400, message: 'نقش‌های سیستمی قابل حذف نیستند' });
  }
  const used = db.prepare('SELECT COUNT(*) c FROM users WHERE role_id = ?').get(role.id).c;
  if (used > 0) {
    return res.status(400).render('pages/error', { title: 'خطا', status: 400, message: 'این نقش به کاربران اختصاص دارد و قابل حذف نیست' });
  }
  db.prepare('DELETE FROM roles WHERE id = ?').run(role.id);
  audit.log(req, 'role.delete', 'role', role.id, { name: role.name });
  res.redirect('/admin/roles');
});

function saveRolePerms(body, roleId) {
  db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId);
  const ins = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?,?)');
  const perms = db.prepare('SELECT id, code FROM permissions').all();
  for (const p of perms) {
    if (body['perm_' + p.code] === 'on' || body['perm_' + p.code] === '1') ins.run(roleId, p.id);
  }
}

/* ================= ماژول‌ها ================= */
router.get('/modules', requirePerm('modules.manage'), (req, res) => {
  const dbMods = db.prepare('SELECT * FROM modules ORDER BY sort').all();
  const discovered = moduleSystem.discover();
  const merged = dbMods.map(m => {
    const d = discovered.find(x => x.code === m.code);
    return Object.assign({}, m, { nav: d ? d.nav || [] : [] });
  });
  res.render('pages/admin/modules', { title: 'ماژول‌های سامانه', activeMenu: 'modules', modules: merged });
});

router.post('/modules/:code/toggle', requirePerm('modules.manage'), (req, res) => {
  const mod = db.prepare('SELECT * FROM modules WHERE code = ?').get(req.params.code);
  if (!mod) return res.status(404).json({ ok: false, message: 'ماژول یافت نشد' });
  if (!mod.installed) return res.status(400).json({ ok: false, message: 'این ماژول هنوز نصب نشده است (به‌زودی)' });
  const newState = mod.enabled ? 0 : 1;
  db.prepare('UPDATE modules SET enabled = ? WHERE id = ?').run(newState, mod.id);
  audit.log(req, 'module.toggle', 'module', mod.code, { enabled: newState });
  res.json({ ok: true, enabled: newState, message: newState ? 'ماژول فعال شد' : 'ماژول غیرفعال شد' });
});

/* ================= تنظیمات ================= */
router.get('/settings', requirePerm('settings.manage'), (req, res) => {
  res.render('pages/admin/settings', {
    title: 'تنظیمات سامانه', activeMenu: 'settings',
    saved: req.query.saved || null,
    activeTab: req.query.tab || null,
    testResult: null
  });
});

router.post('/settings/general', requirePerm('settings.manage'), (req, res) => {
  const { company_name, app_title, tracking_prefix } = req.body;
  helpers.setSetting('company_name', (company_name || '').trim().slice(0, 120));
  helpers.setSetting('app_title', (app_title || '').trim().slice(0, 120));
  helpers.setSetting('tracking_prefix', (tracking_prefix || 'ERF').trim().toUpperCase().slice(0, 8));
  audit.log(req, 'settings.general', 'settings', '', {});
  res.redirect('/admin/settings?saved=general');
});

router.post('/settings/sms', requirePerm('settings.manage'), (req, res) => {
  const {
    sms_driver, sms_ippanel_apikey, sms_ippanel_from, sms_ippanel_pattern_code, sms_pattern_var, sms_mock_show,
    sms_notify_enabled, sms_notify_recipients, sms_notify_pattern, sms_notify_var_name, sms_notify_var_position, sms_notify_var_tracking,
    sms_confirm_enabled, sms_confirm_pattern, sms_confirm_var_name, sms_confirm_var_tracking
  } = req.body;
  helpers.setSetting('sms_driver', sms_driver === 'ippanel' ? 'ippanel' : 'mock');
  helpers.setSetting('sms_ippanel_apikey', (sms_ippanel_apikey || '').trim());
  helpers.setSetting('sms_ippanel_from', (sms_ippanel_from || '').trim());
  helpers.setSetting('sms_ippanel_pattern_code', (sms_ippanel_pattern_code || '').trim());
  helpers.setSetting('sms_pattern_var', sms.sanitizePatternVar(sms_pattern_var));
  helpers.setSetting('sms_mock_show', sms_mock_show === '0' ? '0' : '1');

  // اطلاع‌رسانی متقاضی جدید به تیم منابع انسانی
  helpers.setSetting('sms_notify_enabled', sms_notify_enabled === '0' ? '0' : '1');
  helpers.setSetting('sms_notify_recipients', String(sms_notify_recipients || '').replace(/[^\d\n,،+ ]/g, '').slice(0, 2000));
  helpers.setSetting('sms_notify_pattern', (sms_notify_pattern || '').trim());
  helpers.setSetting('sms_notify_var_name', sms.sanitizePatternVar(sms_notify_var_name));
  helpers.setSetting('sms_notify_var_position', sms.sanitizePatternVar(sms_notify_var_position));
  helpers.setSetting('sms_notify_var_tracking', sms.sanitizePatternVar(sms_notify_var_tracking));

  // پیام تأیید ثبت‌نام به متقاضی
  helpers.setSetting('sms_confirm_enabled', sms_confirm_enabled === '0' ? '0' : '1');
  helpers.setSetting('sms_confirm_pattern', (sms_confirm_pattern || '').trim());
  helpers.setSetting('sms_confirm_var_name', sms.sanitizePatternVar(sms_confirm_var_name));
  helpers.setSetting('sms_confirm_var_tracking', sms.sanitizePatternVar(sms_confirm_var_tracking));

  audit.log(req, 'settings.sms', 'settings', '', {});
  res.redirect('/admin/settings?saved=sms');
});

/** آپلود / تغییر لوگوی شرکت */
router.post('/settings/logo', requirePerm('settings.manage'), upload.uploadLogo.single('logo'), (req, res) => {
  if (req.file) {
    const rel = '/uploads/brand/' + path.basename(req.file.path);
    helpers.setSetting('company_logo', rel);
    audit.log(req, 'settings.logo_update', 'settings', '', {});
  }
  res.redirect('/admin/settings?saved=general');
});

/** حذف لوگوی شرکت */
router.post('/settings/logo/remove', requirePerm('settings.manage'), (req, res) => {
  upload.removeLogo();
  helpers.setSetting('company_logo', '');
  audit.log(req, 'settings.logo_remove', 'settings', '', {});
  res.redirect('/admin/settings?saved=general');
});

router.post('/settings/sms/test', requirePerm('settings.manage'), async (req, res) => {
  const render = (testResult) => res.render('pages/admin/settings', {
    title: 'تنظیمات سامانه', activeMenu: 'settings', saved: null,
    activeTab: 'sms', testResult
  });
  try {
    const phone = req.body.test_phone;
    const result = await sms.sendOtp(phone, '12345');
    render({ ok: true, message: 'پیامک تستی با موفقیت ارسال شد (درایور: ' + result.driver + ')' });
  } catch (e) {
    render({ ok: false, message: 'خطا در ارسال تست: ' + e.message });
  }
});

router.post('/settings/security', requirePerm('settings.manage'), (req, res) => {
  const { otp_length, otp_expiry_seconds, otp_resend_seconds, otp_max_attempts, session_hours } = req.body;
  helpers.setSetting('otp_length', Math.min(8, Math.max(4, parseInt(otp_length, 10) || 5)));
  helpers.setSetting('otp_expiry_seconds', Math.min(1800, Math.max(60, parseInt(otp_expiry_seconds, 10) || 300)));
  helpers.setSetting('otp_resend_seconds', Math.min(900, Math.max(30, parseInt(otp_resend_seconds, 10) || 120)));
  helpers.setSetting('otp_max_attempts', Math.min(10, Math.max(1, parseInt(otp_max_attempts, 10) || 5)));
  helpers.setSetting('session_hours', Math.min(168, Math.max(1, parseInt(session_hours, 10) || 24)));
  audit.log(req, 'settings.security', 'settings', '', {});
  res.redirect('/admin/settings?saved=security');
});

router.get('/settings/backup', requirePerm('settings.manage'), (req, res) => {
  try {
    const data = db.snapshot();
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="minihrm-backup-${stamp}.db"`);
    audit.log(req, 'settings.backup', 'settings', '', {});
    res.send(data);
  } catch (e) {
    res.status(500).render('pages/error', { title: 'خطا', status: 500, message: e.message });
  }
});

/* ================= گزارش فعالیت‌ها ================= */
router.get('/audit', requirePerm('audit.view'), (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const per = 40;
  const logs = audit.list(per, (page - 1) * per);
  const total = db.prepare('SELECT COUNT(*) c FROM audit_log').get().c;
  res.render('pages/admin/audit', {
    title: 'گزارش فعالیت‌ها', activeMenu: 'audit',
    logs, page, totalPages: Math.max(1, Math.ceil(total / per))
  });
});

module.exports = router;
