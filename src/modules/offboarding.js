// ═══════════════════════════════════════════════════════════
//  Offboarding Module - Resignation, Termination, Settlement
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { getDb } = require('../database/connection');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { moduleGuard } = require('../middleware/moduleGuard');

router.use(isAuthenticated);
router.use(moduleGuard('offboarding'));

// ─── List ────────────────────────────────────────────────
router.get('/', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();
  const requests = db.prepare(`
    SELECT o.*, u.first_name, u.last_name, u.phone,
    a.first_name || ' ' || a.last_name as approver_name
    FROM offboarding_requests o
    JOIN users u ON o.user_id = u.id
    LEFT JOIN users a ON o.approved_by = a.id
    ORDER BY o.created_at DESC
  `).all();

  const employees = db.prepare("SELECT id, first_name, last_name FROM users WHERE role IN ('employee','hr_employee') AND is_active = 1").all();
  res.render('offboarding/index', { title: 'تسویه حساب و ترک کار', requests, employees });
});

// ─── Create Request ──────────────────────────────────────
router.post('/', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { user_id, request_type, reason, last_working_day, notes } = req.body;
  const db = getDb();

  db.prepare(`
    INSERT INTO offboarding_requests (user_id, request_type, reason, last_working_day, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(parseInt(user_id), request_type, reason || '', last_working_day || '', notes || '');

  req.flash('success', 'درخواست تسویه ثبت شد');
  res.redirect('/offboarding');
});

// ─── View Request ────────────────────────────────────────
router.get('/:id', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();
  const request = db.prepare(`
    SELECT o.*, u.first_name, u.last_name, u.phone, u.national_code
    FROM offboarding_requests o JOIN users u ON o.user_id = u.id WHERE o.id = ?
  `).get(req.params.id);

  if (!request) { req.flash('error', 'درخواست یافت نشد'); return res.redirect('/offboarding'); }

  // Get salary info for settlement
  const salary = db.prepare('SELECT * FROM salary_structures WHERE user_id = ?').get(request.user_id);
  const loans = db.prepare("SELECT * FROM loans WHERE user_id = ? AND status = 'active'").all(request.user_id);

  res.render('offboarding/detail', { title: 'جزئیات تسویه', request, salary, loans });
});

// ─── Update Settlement ───────────────────────────────────
router.post('/:id/settlement', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { settlement_amount, severance_pay, unused_leave_pay, loan_remaining } = req.body;
  const db = getDb();

  db.prepare(`
    UPDATE offboarding_requests SET settlement_amount=?, severance_pay=?, unused_leave_pay=?, loan_remaining=?, status='in_progress' WHERE id=?
  `).run(parseFloat(settlement_amount)||0, parseFloat(severance_pay)||0, parseFloat(unused_leave_pay)||0, parseFloat(loan_remaining)||0, req.params.id);

  req.flash('success', 'مبلغ تسویه بروزرسانی شد');
  res.redirect(`/offboarding/${req.params.id}`);
});

// ─── Update Checklist ────────────────────────────────────
router.post('/:id/checklist', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { equipment_returned, access_revoked, knowledge_transferred, exit_interview_done } = req.body;
  const db = getDb();

  db.prepare(`
    UPDATE offboarding_requests SET equipment_returned=?, access_revoked=?, knowledge_transferred=?, exit_interview_done=? WHERE id=?
  `).run(equipment_returned ? 1 : 0, access_revoked ? 1 : 0, knowledge_transferred ? 1 : 0, exit_interview_done ? 1 : 0, req.params.id);

  req.flash('success', 'چک‌لیست بروزرسانی شد');
  res.redirect(`/offboarding/${req.params.id}`);
});

// ─── Approve ─────────────────────────────────────────────
router.post('/:id/approve', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  db.prepare("UPDATE offboarding_requests SET status = 'approved', approved_by = ? WHERE id = ?").run(req.session.user.id, req.params.id);
  req.flash('success', 'درخواست تأیید شد');
  res.redirect(`/offboarding/${req.params.id}`);
});

// ─── Complete ────────────────────────────────────────────
router.post('/:id/complete', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  const request = db.prepare('SELECT * FROM offboarding_requests WHERE id = ?').get(req.params.id);

  db.prepare("UPDATE offboarding_requests SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(req.params.id);

  // Deactivate user
  if (request) {
    db.prepare("UPDATE users SET is_active = 0 WHERE id = ?").run(request.user_id);
  }

  req.flash('success', 'تسویه حساب تکمیل شد و کاربر غیرفعال شد');
  res.redirect('/offboarding');
});

module.exports = router;