'use strict';
/** ورود / خروج کاربران */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const auth = require('../lib/auth');
const helpers = require('../lib/helpers');
const sms = require('../lib/sms');
const audit = require('../lib/audit');
const { rateLimit } = require('../lib/ratelimit');

const loginLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 15, message: 'تعداد تلاش‌های ورود زیاد است. ۵ دقیقه دیگر تلاش کنید.' });

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('pages/login', {
    title: 'ورود به سامانه', layout: false,
    error: null, username: '',
    demoHint: process.env.NODE_ENV !== 'production' ? null : null
  });
});

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const fail = (msg) => res.status(401).render('pages/login', {
    title: 'ورود به سامانه', layout: false, error: msg, username: username || ''
  });
  if (!username || !password) return fail('نام کاربری و رمز عبور را وارد کنید');
  const u = db.prepare(`
    SELECT u.*, r.code AS role_code, r.name AS role_name
    FROM users u LEFT JOIN roles r ON r.id = u.role_id
    WHERE u.username = ?
  `).get(String(username).trim());
  if (!u || !auth.verifyPassword(password, u.password_hash)) {
    audit.log(req, 'auth.login_failed', 'user', '', { username });
    return fail('نام کاربری یا رمز عبور اشتباه است');
  }
  if (u.status !== 'active') return fail('حساب کاربری شما غیرفعال است. با مدیر سامانه تماس بگیرید.');

  req.session.regenerate((err) => {
    if (err) return fail('خطای داخلی در ورود');
    req.session.userId = u.id;
    req.session.user = {
      id: u.id, username: u.username, full_name: u.full_name, email: u.email,
      phone: u.phone, is_super_admin: u.is_super_admin, role_id: u.role_id,
      role_code: u.role_code, role_name: u.role_name, status: u.status, avatar_path: u.avatar_path
    };
    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(u.id);
    audit.log(req, 'auth.login', 'user', u.id, { username: u.username });
    res.redirect('/dashboard');
  });
});

router.post('/logout', (req, res) => {
  audit.log(req, 'auth.logout', 'user', req.session.userId || '', {});
  req.session.destroy(() => res.redirect('/login'));
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

/* ================= ورود متقاضیان با OTP (QR) ================= */

function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

function makeTrackingCode() {
  const prefix = helpers.getSetting('tracking_prefix', 'ERF');
  const rand = crypto.randomInt(100000, 999999);
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

router.post('/api/otp/send', rateLimit({
  windowMs: 2 * 60 * 1000, max: 5,
  keyFn: (req) => (req.body && req.body.phone) || req.ip,
  message: 'ارسال کد بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.'
}), async (req, res) => {
  try {
    const phone = sms.normalizePhone(req.body.phone);
    if (!phone) return res.status(400).json({ ok: false, message: 'شماره موبایل معتبر وارد کنید (مثال: 09123456789)' });

    // محدودیت ارسال مجدد
    const last = db.prepare("SELECT created_at FROM otp_codes WHERE phone = ? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1").get(phone);
    const resendSec = parseInt(helpers.getSetting('otp_resend_seconds', '120'), 10);
    if (last) {
      const elapsed = (Date.now() - new Date(last.created_at + 'Z').getTime()) / 1000;
      if (elapsed < resendSec) {
        return res.status(429).json({ ok: false, message: `کمی صبر کنید. ارسال مجدد تا ${Math.ceil(resendSec - elapsed)} ثانیه دیگر امکان‌پذیر است.` });
      }
    }

    const len = parseInt(helpers.getSetting('otp_length', '5'), 10) || 5;
    const code = String(crypto.randomInt(0, 10 ** len)).padStart(len, '0');
    const expiry = parseInt(helpers.getSetting('otp_expiry_seconds', '300'), 10) || 300;

    db.prepare("INSERT INTO otp_codes (phone, code_hash, purpose, expires_at) VALUES (?,?,?,datetime('now', ?))")
      .run(phone, sha256(code), 'candidate_login', `+${expiry} seconds`);

    const result = await sms.sendOtp(phone, code);
    audit.log(req, 'otp.send', 'otp', phone, { driver: result.driver });

    const payload = { ok: true, message: 'کد تایید ارسال شد.', driver: result.driver };
    // در حالت آزمایشی، کد برای تست نمایش داده می‌شود
    if (result.driver === 'mock' && result.code) {
      payload.devCode = result.code;
    }
    res.json(payload);
  } catch (e) {
    res.status(400).json({ ok: false, message: e.message });
  }
});

router.post('/api/otp/verify', rateLimit({ windowMs: 5 * 60 * 1000, max: 20, message: 'تعداد تلاش‌ها بیش از حد مجاز است.' }), (req, res) => {
  try {
    const phone = sms.normalizePhone(req.body.phone);
    const code = String(req.body.code || '').trim();
    if (!phone || !code) return res.status(400).json({ ok: false, message: 'شماره موبایل و کد تایید الزامی است' });

    const row = db.prepare(`
      SELECT * FROM otp_codes
      WHERE phone = ? AND consumed_at IS NULL AND expires_at > datetime('now')
      ORDER BY id DESC LIMIT 1
    `).get(phone);
    if (!row) return res.status(400).json({ ok: false, message: 'کد تایید نامعتبر یا منقضی شده است. کد جدید درخواست کنید.' });

    const maxAttempts = parseInt(helpers.getSetting('otp_max_attempts', '5'), 10) || 5;
    if (row.attempts >= maxAttempts) {
      return res.status(429).json({ ok: false, message: 'تعداد تلاش‌های مجاز تمام شد. کد جدید درخواست کنید.' });
    }
    db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);

    if (sha256(code) !== row.code_hash) {
      return res.status(400).json({ ok: false, message: 'کد تایید اشتباه است.' });
    }
    db.prepare('UPDATE otp_codes SET consumed_at = datetime(\'now\') WHERE id = ?').run(row.id);

    // یافتن/ایجاد پرونده متقاضی
    let applicant = db.prepare("SELECT * FROM applicants WHERE phone = ? AND status = 'draft' ORDER BY id DESC LIMIT 1").get(phone);
    if (!applicant) {
      applicant = db.prepare("SELECT * FROM applicants WHERE phone = ? ORDER BY id DESC LIMIT 1").get(phone);
    }
    req.session.candidatePhone = phone;
    if (applicant && applicant.status === 'draft') {
      req.session.candidateApplicantId = applicant.id;
      res.json({ ok: true, message: 'تایید شد.', status: applicant.status, hasDraft: true });
    } else if (applicant) {
      req.session.candidateApplicantId = null;
      res.json({ ok: true, message: 'تایید شد.', status: applicant.status, hasDraft: false, alreadySubmitted: true });
    } else {
      res.json({ ok: true, message: 'تایید شد.', status: null, hasDraft: false });
    }
    audit.log(req, 'otp.verify', 'otp', phone, {});
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

module.exports = router;
module.exports.makeTrackingCode = makeTrackingCode;
module.exports.sha256 = sha256;
