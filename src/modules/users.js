// ═══════════════════════════════════════════════════════════
//  Users Module - User Management
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../database/connection');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { moduleGuard } = require('../middleware/moduleGuard');

router.use(isAuthenticated);
router.use(moduleGuard('users'));

// List users
router.get('/', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  const { role, search, page = 1 } = req.query;
  const limit = 20;
  const offset = (page - 1) * limit;

  let where = 'WHERE 1=1';
  const params = [];

  if (role) {
    where += ' AND role = ?';
    params.push(role);
  }
  if (search) {
    where += ' AND (first_name LIKE ? OR last_name LIKE ? OR username LIKE ? OR phone LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  const total = db.prepare(`SELECT COUNT(*) as c FROM users ${where}`).get(...params).c;
  const users = db.prepare(`SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

  res.render('users/index', {
    title: 'مدیریت کاربران',
    users,
    pagination: { page: parseInt(page), limit, total, pages: Math.ceil(total / limit) },
    filters: { role, search }
  });
});

// New user form
router.get('/new', requireRole('super_admin', 'hr_manager'), (req, res) => {
  res.render('users/form', {
    title: 'کاربر جدید',
    editUser: null
  });
});

// Create user
router.post('/', requireRole('super_admin', 'hr_manager'), async (req, res) => {
  const { username, password, role, first_name, last_name, phone, email, national_code } = req.body;

  if (!username || !password || !role || !first_name || !last_name) {
    req.flash('error', 'تمام فیلدهای الزامی را پر کنید');
    return res.redirect('/users/new');
  }

  try {
    const db = getDb();

    // Check duplicate username
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (exists) {
      req.flash('error', 'این نام کاربری قبلاً ثبت شده است');
      return res.redirect('/users/new');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    db.prepare(`
      INSERT INTO users (username, password_hash, role, first_name, last_name, phone, email, national_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(username, passwordHash, role, first_name, last_name, phone || '', email || '', national_code || '');

    db.prepare(`
      INSERT INTO activity_logs (user_id, action, module, description, ip_address) VALUES (?, 'create', 'users', ?, ?)
    `).run(req.session.user.id, `ایجاد کاربر: ${first_name} ${last_name}`, req.ip);

    req.flash('success', 'کاربر با موفقیت ایجاد شد');
    return res.redirect('/users');

  } catch (error) {
    console.error('Create user error:', error);
    req.flash('error', 'خطا در ایجاد کاربر');
    return res.redirect('/users/new');
  }
});

// Edit user form
router.get('/:id/edit', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

  if (!user) {
    req.flash('error', 'کاربر یافت نشد');
    return res.redirect('/users');
  }

  res.render('users/form', {
    title: `ویرایش کاربر: ${user.first_name} ${user.last_name}`,
    editUser: user
  });
});

// Update user
router.post('/:id', requireRole('super_admin', 'hr_manager'), async (req, res) => {
  const { username, password, role, first_name, last_name, phone, email, national_code, is_active } = req.body;
  const db = getDb();
  const userId = req.params.id;

  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!existing) {
    req.flash('error', 'کاربر یافت نشد');
    return res.redirect('/users');
  }

  try {
    let updateQuery = `UPDATE users SET username=?, role=?, first_name=?, last_name=?, phone=?, email=?, national_code=?, is_active=?, updated_at=datetime('now')`;
    const params = [username || existing.username, role || existing.role, first_name || existing.first_name, last_name || existing.last_name, phone || '', email || '', national_code || '', is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active];

    if (password) {
      const hash = await bcrypt.hash(password, 12);
      updateQuery += ', password_hash=?';
      params.push(hash);
    }

    updateQuery += ' WHERE id=?';
    params.push(userId);

    db.prepare(updateQuery).run(...params);

    db.prepare(`
      INSERT INTO activity_logs (user_id, action, module, description, ip_address) VALUES (?, 'update', 'users', ?, ?)
    `).run(req.session.user.id, `ویرایش کاربر: ${first_name} ${last_name}`, req.ip);

    req.flash('success', 'کاربر با موفقیت بروزرسانی شد');
    return res.redirect('/users');

  } catch (error) {
    console.error('Update user error:', error);
    req.flash('error', 'خطا در بروزرسانی کاربر');
    return res.redirect(`/users/${userId}/edit`);
  }
});

// Toggle user active status
router.post('/:id/toggle', requireRole('super_admin'), (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

  if (!user) {
    req.flash('error', 'کاربر یافت نشد');
    return res.redirect('/users');
  }

  db.prepare("UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?").run(user.is_active ? 0 : 1, user.id);

  req.flash('success', `کاربر ${user.is_active ? 'غیرفعال' : 'فعال'} شد`);
  return res.redirect('/users');
});

// Delete user
router.post('/:id/delete', requireRole('super_admin'), (req, res) => {
  const db = getDb();

  if (parseInt(req.params.id) === req.session.user.id) {
    req.flash('error', 'نمی‌توانید خودتان را حذف کنید');
    return res.redirect('/users');
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);

  req.flash('success', 'کاربر حذف شد');
  return res.redirect('/users');
});

module.exports = router;