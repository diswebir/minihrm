// ═══════════════════════════════════════════════════════════
//  Auth Module - Login/Logout
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../database/connection');
const { isGuest, isInstalled } = require('../middleware/auth');

// Login Page
router.get('/login', isInstalled, isGuest, (req, res) => {
  res.render('auth/login', {
    title: 'ورود به سامانه',
    layout: 'layouts/auth'
  });
});

// Login Handler
router.post('/login', isInstalled, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    req.flash('error', 'نام کاربری و رمز عبور الزامی است');
    return res.redirect('/login');
  }

  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);

    if (!user) {
      req.flash('error', 'نام کاربری یا رمز عبور اشتباه است');
      return res.redirect('/login');
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      req.flash('error', 'نام کاربری یا رمز عبور اشتباه است');
      return res.redirect('/login');
    }

    // Update last login
    db.prepare('UPDATE users SET last_login = datetime("now") WHERE id = ?').run(user.id);

    // Set session
    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name,
      avatar: user.avatar,
      phone: user.phone,
      email: user.email
    };

    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, module, description, ip_address) VALUES (?, 'login', 'auth', 'ورود به سامانه', ?)
    `).run(user.id, req.ip);

    req.flash('success', `${user.first_name} ${user.last_name} خوش آمدید`);
    return res.redirect('/dashboard');

  } catch (error) {
    console.error('Login error:', error);
    req.flash('error', 'خطا در ورود. لطفاً دوباره تلاش کنید');
    return res.redirect('/login');
  }
});

// Logout
router.get('/logout', (req, res) => {
  if (req.session.user) {
    const db = getDb();
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, module, description, ip_address) VALUES (?, 'logout', 'auth', 'خروج از سامانه', ?)
    `).run(req.session.user.id, req.ip);
  }

  req.session.destroy((err) => {
    if (err) console.error('Logout error:', err);
    res.redirect('/login');
  });
});

module.exports = router;