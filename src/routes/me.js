'use strict';
/** پورتال شخصی کارمندان و متقاضیان */
const express = require('express');
const router = express.Router();
const db = require('../db');
const helpers = require('../lib/helpers');
const seedData = require('../seed-data');

function requireUser(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

router.get('/', requireUser, (req, res) => {
  const user = req.session.user;
  const myNotifs = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(user.id);
  res.render('pages/me', {
    title: 'پورتال من', activeMenu: 'me',
    user, myNotifs,
    draft: null
  });
});

router.post('/profile', requireUser, (req, res) => {
  const { full_name, email, phone } = req.body;
  db.prepare("UPDATE users SET full_name=?, email=?, phone=?, updated_at=datetime('now') WHERE id=?")
    .run(String(full_name || '').trim(), String(email || '').trim(), String(phone || '').trim(), req.session.userId);
  req.session.user.full_name = String(full_name || '').trim();
  req.session.user.email = String(email || '').trim();
  req.session.user.phone = String(phone || '').trim();
  res.redirect('/me?saved=1');
});

router.post('/password', requireUser, (req, res) => {
  const auth = require('../lib/auth');
  const { old_password, new_password, new_password2 } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!u || !auth.verifyPassword(old_password, u.password_hash)) {
    return res.status(400).render('pages/error', { title: 'خطا', status: 400, message: 'رمز عبور فعلی اشتباه است' });
  }
  if (!new_password || new_password.length < 8 || new_password !== new_password2) {
    return res.status(400).render('pages/error', { title: 'خطا', status: 400, message: 'رمز عبور جدید باید حداقل ۸ کاراکتر باشد و با تکرار آن مطابقت داشته باشد' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(new_password), u.id);
  res.redirect('/me?saved=1');
});

module.exports = router;
