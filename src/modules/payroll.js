// ═══════════════════════════════════════════════════════════
//  Payroll Module - Salary, Payslips, Loans
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { getDb } = require('../database/connection');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { moduleGuard } = require('../middleware/moduleGuard');

router.use(isAuthenticated);
router.use(moduleGuard('payroll'));

// ─── Salary Structures List ──────────────────────────────
router.get('/', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();
  const structures = db.prepare(`
    SELECT ss.*, u.first_name, u.last_name, u.phone
    FROM salary_structures ss
    JOIN users u ON ss.user_id = u.id
    ORDER BY u.last_name
  `).all();

  const employees = db.prepare("SELECT id, first_name, last_name FROM users WHERE role IN ('employee','hr_employee','hr_manager') AND is_active = 1 ORDER BY last_name").all();

  res.render('payroll/index', { title: 'مدیریت حقوق و دستمزد', structures, employees });
});

// ─── Set/Update Salary Structure ─────────────────────────
router.post('/structure', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { user_id, base_salary, housing_allowance, transport_allowance, food_allowance, children_allowance, marriage_allowance, job_title_allowance, overtime_rate, insurance_employee_share, insurance_employer_share, tax_rate } = req.body;
  const db = getDb();

  db.prepare(`
    INSERT INTO salary_structures (user_id, base_salary, housing_allowance, transport_allowance, food_allowance, children_allowance, marriage_allowance, job_title_allowance, overtime_rate, insurance_employee_share, insurance_employer_share, tax_rate, effective_from, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'), datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET base_salary=?, housing_allowance=?, transport_allowance=?, food_allowance=?, children_allowance=?, marriage_allowance=?, job_title_allowance=?, overtime_rate=?, insurance_employee_share=?, insurance_employer_share=?, tax_rate=?, updated_at=datetime('now')
  `).run(
    parseInt(user_id), parseFloat(base_salary)||0, parseFloat(housing_allowance)||0, parseFloat(transport_allowance)||0, parseFloat(food_allowance)||0, parseFloat(children_allowance)||0, parseFloat(marriage_allowance)||0, parseFloat(job_title_allowance)||0, parseFloat(overtime_rate)||0, parseFloat(insurance_employee_share)||0, parseFloat(insurance_employer_share)||0, parseFloat(tax_rate)||0,
    parseFloat(base_salary)||0, parseFloat(housing_allowance)||0, parseFloat(transport_allowance)||0, parseFloat(food_allowance)||0, parseFloat(children_allowance)||0, parseFloat(marriage_allowance)||0, parseFloat(job_title_allowance)||0, parseFloat(overtime_rate)||0, parseFloat(insurance_employee_share)||0, parseFloat(insurance_employer_share)||0, parseFloat(tax_rate)||0
  );

  req.flash('success', 'ساختار حقوق بروزرسانی شد');
  res.redirect('/payroll');
});

// ─── Generate Payslips ───────────────────────────────────
router.get('/generate', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  const employees = db.prepare(`
    SELECT ss.*, u.first_name, u.last_name
    FROM salary_structures ss
    JOIN users u ON ss.user_id = u.id
    ORDER BY u.last_name
  `).all();

  res.render('payroll/generate', { title: 'صدور فیش حقوقی', employees, year: new Date().getFullYear(), month: new Date().getMonth() + 1 });
});

// ─── Create Payslips ─────────────────────────────────────
router.post('/generate', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { year, month, user_ids, overtime_hours } = req.body;
  const db = getDb();
  const ids = Array.isArray(user_ids) ? user_ids : [user_ids];
  const hrs = Array.isArray(overtime_hours) ? overtime_hours : [overtime_hours];

  const createPayslip = db.transaction(() => {
    for (let i = 0; i < ids.length; i++) {
      const uid = parseInt(ids[i]);
      const otHours = parseFloat(hrs[i]) || 0;
      if (!uid) continue;

      const ss = db.prepare('SELECT * FROM salary_structures WHERE user_id = ?').get(uid);
      if (!ss) continue;

      // Check if already exists
      const existing = db.prepare('SELECT id FROM payslips WHERE user_id = ? AND period_year = ? AND period_month = ?').get(uid, parseInt(year), parseInt(month));
      if (existing) continue;

      const allowances = ss.housing_allowance + ss.transport_allowance + ss.food_allowance + ss.children_allowance + ss.marriage_allowance + ss.job_title_allowance;
      const overtimePay = otHours * ss.overtime_rate;
      const gross = ss.base_salary + allowances + overtimePay;
      const insuranceDeduction = ss.insurance_employee_share;
      const taxDeduction = Math.round(gross * ss.tax_rate / 100);
      const totalDeductions = insuranceDeduction + taxDeduction;
      const net = gross - totalDeductions;

      db.prepare(`
        INSERT INTO payslips (user_id, period_year, period_month, base_salary, allowances_total, overtime_hours, overtime_pay, additions_total, insurance_deduction, tax_deduction, deductions_total, gross_salary, net_salary, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
      `).run(uid, parseInt(year), parseInt(month), ss.base_salary, allowances, otHours, overtimePay, overtimePay, insuranceDeduction, taxDeduction, totalDeductions, gross, net, req.session.user.id);
    }
  });

  createPayslip();
  req.flash('success', 'فیش‌های حقوقی صادر شدند');
  res.redirect('/payroll/payslips');
});

// ─── Payslips List ───────────────────────────────────────
router.get('/payslips', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();
  const { year, month } = req.query;

  let where = 'WHERE 1=1';
  const params = [];
  if (year) { where += ' AND p.period_year = ?'; params.push(parseInt(year)); }
  if (month) { where += ' AND p.period_month = ?'; params.push(parseInt(month)); }

  // Employees see only their own
  if (req.session.user.role === 'employee') {
    where += ' AND p.user_id = ?';
    params.push(req.session.user.id);
  }

  const payslips = db.prepare(`
    SELECT p.*, u.first_name, u.last_name
    FROM payslips p
    JOIN users u ON p.user_id = u.id
    ${where}
    ORDER BY p.period_year DESC, p.period_month DESC, u.last_name
  `).all(...params);

  res.render('payroll/payslips', { title: 'فیش‌های حقوقی', payslips, filters: { year, month } });
});

// ─── View Payslip ────────────────────────────────────────
router.get('/payslips/:id', (req, res) => {
  const db = getDb();
  const payslip = db.prepare(`
    SELECT p.*, u.first_name, u.last_name, u.phone, u.national_code
    FROM payslips p
    JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `).get(req.params.id);

  if (!payslip) { req.flash('error', 'فیش یافت نشد'); return res.redirect('/payroll/payslips'); }

  // Employees can only see their own
  if (req.session.user.role === 'employee' && payslip.user_id !== req.session.user.id) {
    req.flash('error', 'دسترسی ندارید');
    return res.redirect('/payroll/payslips');
  }

  const items = db.prepare('SELECT * FROM payslip_items WHERE payslip_id = ?').all(req.params.id);
  const company = db.prepare("SELECT setting_value FROM settings WHERE setting_key = 'company_name'").get();

  res.render('payroll/payslip-detail', { title: `فیش حقوقی - ${payslip.first_name} ${payslip.last_name}`, payslip, items, company: company?.setting_value || '' });
});

// ─── Add Custom Item to Payslip ──────────────────────────
router.post('/payslips/:id/items', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { item_type, title, amount, description } = req.body;
  const db = getDb();

  db.prepare('INSERT INTO payslip_items (payslip_id, item_type, title, amount, description) VALUES (?, ?, ?, ?, ?)')
    .run(req.params.id, item_type, title, parseFloat(amount) || 0, description || '');

  // Recalculate totals
  const payslip = db.prepare('SELECT * FROM payslips WHERE id = ?').get(req.params.id);
  const additions = db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM payslip_items WHERE payslip_id = ? AND item_type = 'addition'").get(req.params.id).total;
  const deductions = db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM payslip_items WHERE payslip_id = ? AND item_type = 'deduction'").get(req.params.id).total;

  const gross = payslip.base_salary + payslip.allowances_total + payslip.overtime_pay + additions;
  const net = gross - payslip.insurance_deduction - payslip.tax_deduction - deductions;

  db.prepare('UPDATE payslips SET additions_total=?, deductions_total=?, gross_salary=?, net_salary=? WHERE id=?')
    .run(paylip.additions_total + (item_type === 'addition' ? parseFloat(amount) : 0), payslip.deductions_total + (item_type === 'deduction' ? parseFloat(amount) : 0), gross, net, req.params.id);

  req.flash('success', 'آیتم اضافه شد');
  res.redirect(`/payroll/payslips/${req.params.id}`);
});

// ─── Delete Payslip Item ─────────────────────────────────
router.post('/payslips/:payslipId/items/:itemId/delete', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM payslip_items WHERE id = ? AND payslip_id = ?').run(req.params.itemId, req.params.payslipId);
  req.flash('success', 'آیتم حذف شد');
  res.redirect(`/payroll/payslips/${req.params.payslipId}`);
});

// ─── Approve Payslip ─────────────────────────────────────
router.post('/payslips/:id/approve', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  db.prepare("UPDATE payslips SET status = 'approved' WHERE id = ?").run(req.params.id);
  req.flash('success', 'فیش حقوقی تأیید شد');
  res.redirect(`/payroll/payslips/${req.params.id}`);
});

// ─── Mark as Paid ────────────────────────────────────────
router.post('/payslips/:id/pay', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  db.prepare("UPDATE payslips SET status = 'paid', paid_at = datetime('now') WHERE id = ?").run(req.params.id);
  req.flash('success', 'فیش حقوقی پرداخت شد');
  res.redirect(`/payroll/payslips/${req.params.id}`);
});

// ─── Loans ───────────────────────────────────────────────
router.get('/loans', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();
  let loans;
  if (req.session.user.role === 'employee') {
    loans = db.prepare(`
      SELECT l.*, u.first_name, u.last_name FROM loans l JOIN users u ON l.user_id = u.id WHERE l.user_id = ? ORDER BY l.created_at DESC
    `).all(req.session.user.id);
  } else {
    loans = db.prepare(`
      SELECT l.*, u.first_name, u.last_name FROM loans l JOIN users u ON l.user_id = u.id ORDER BY l.created_at DESC
    `).all();
  }
  const employees = db.prepare("SELECT id, first_name, last_name FROM users WHERE is_active = 1 ORDER BY last_name").all();
  res.render('payroll/loans', { title: 'مدیریت وام‌ها', loans, employees });
});

// ─── Create Loan ─────────────────────────────────────────
router.post('/loans', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { user_id, loan_type, amount, monthly_installment, total_installments, start_date, description } = req.body;
  const db = getDb();

  db.prepare(`
    INSERT INTO loans (user_id, loan_type, amount, monthly_installment, total_installments, start_date, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(parseInt(user_id), loan_type || 'cash', parseFloat(amount), parseFloat(monthly_installment), parseInt(total_installments), start_date || null, description || '');

  req.flash('success', 'وام ثبت شد');
  res.redirect('/payroll/loans');
});

module.exports = router;