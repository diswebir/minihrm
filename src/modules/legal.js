// ═══════════════════════════════════════════════════════════
//  Legal & Licensing Module - Permits, Shareholders, Registration
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { getDb } = require('../database/connection');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { moduleGuard } = require('../middleware/moduleGuard');

router.use(isAuthenticated);
router.use(moduleGuard('legal'));

// ─── Legal Dashboard ─────────────────────────────────────
router.get('/', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  const stats = {
    permits: db.prepare('SELECT COUNT(*) as c FROM company_permits WHERE status = "active"').get().c,
    expiringPermits: db.prepare("SELECT COUNT(*) as c FROM company_permits WHERE expiry_date <= date('now', '+30 days') AND status = 'active'").get().c,
    shareholders: db.prepare('SELECT COUNT(*) as c FROM shareholders WHERE is_active = 1').get().c,
    registrations: db.prepare('SELECT COUNT(*) as c FROM company_registrations WHERE status = "active"').get().c,
  };
  res.render('legal/index', { title: 'امور حقوقی و مجوزها', stats });
});

// ═══════════ PERMITS ══════════════════════════════════════
router.get('/permits', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  const permits = db.prepare('SELECT * FROM company_permits ORDER BY expiry_date DESC').all();
  res.render('legal/permits', { title: 'مجوزها', permits });
});

router.post('/permits', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { permit_type, permit_number, issuing_authority, issue_date, expiry_date, renewal_required, notes } = req.body;
  const db = getDb();
  db.prepare(`
    INSERT INTO company_permits (permit_type, permit_number, issuing_authority, issue_date, expiry_date, renewal_required, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(permit_type, permit_number || '', issuing_authority || '', issue_date || '', expiry_date || '', renewal_required ? 1 : 0, notes || '');
  req.flash('success', 'مجوز ثبت شد');
  res.redirect('/legal/permits');
});

router.post('/permits/:id/delete', requireRole('super_admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM company_permits WHERE id = ?').run(req.params.id);
  res.redirect('/legal/permits');
});

// ═══════════ SHAREHOLDERS ═════════════════════════════════
router.get('/shareholders', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  const shareholders = db.prepare('SELECT * FROM shareholders WHERE is_active = 1 ORDER BY share_percentage DESC').all();
  const totalShares = shareholders.reduce((sum, s) => sum + s.share_percentage, 0);
  res.render('legal/shareholders', { title: 'سهامداران', shareholders, totalShares });
});

router.post('/shareholders', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { full_name, national_code, share_percentage, share_amount, role, phone, email, address, notes } = req.body;
  const db = getDb();
  db.prepare(`
    INSERT INTO shareholders (full_name, national_code, share_percentage, share_amount, role, phone, email, address, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(full_name, national_code || '', parseFloat(share_percentage) || 0, parseFloat(share_amount) || 0, role || 'shareholder', phone || '', email || '', address || '', notes || '');
  req.flash('success', 'سهامدار اضافه شد');
  res.redirect('/legal/shareholders');
});

router.post('/shareholders/:id/delete', requireRole('super_admin'), (req, res) => {
  const db = getDb();
  db.prepare('UPDATE shareholders SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.redirect('/legal/shareholders');
});

// ═══════════ REGISTRATIONS ════════════════════════════════
router.get('/registration', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  const registrations = db.prepare('SELECT * FROM company_registrations ORDER BY created_at DESC').all();
  res.render('legal/registration', { title: 'امور ثبتی', registrations });
});

router.post('/registration', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { registration_number, economic_code, company_type, registered_capital, paid_capital, registration_date, registration_office, address, notes } = req.body;
  const db = getDb();
  db.prepare(`
    INSERT INTO company_registrations (registration_number, economic_code, company_type, registered_capital, paid_capital, registration_date, registration_office, address, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(registration_number, economic_code || '', company_type || 'llc', parseFloat(registered_capital) || 0, parseFloat(paid_capital) || 0, registration_date || '', registration_office || '', address || '', notes || '');
  req.flash('success', 'اطلاعات ثبتی ذخیره شد');
  res.redirect('/legal/registration');
});

module.exports = router;