// ═══════════════════════════════════════════════════════════
//  Employees Module
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { getDb } = require('../database/connection');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { moduleGuard } = require('../middleware/moduleGuard');

router.use(isAuthenticated);
router.use(moduleGuard('employees'));

// List employees
router.get('/', requireRole('super_admin', 'hr_manager', 'hr_employee', 'employee'), (req, res) => {
  const db = getDb();
  const user = req.session.user;

  let employees;
  if (user.role === 'employee') {
    // Employee sees only their own profile
    employees = db.prepare(`
      SELECT u.*, d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = ?
    `).all(user.id);
  } else {
    // HR and admin see all employees
    const { search, department, page = 1 } = req.query;
    const limit = 20;
    const offset = (page - 1) * limit;

    let where = "WHERE u.role IN ('employee','hr_employee','hr_manager','super_admin')";
    const params = [];

    if (search) {
      where += ' AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.phone LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    employees = db.prepare(`
      SELECT u.*, d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      ${where}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
  }

  res.render('employees/index', {
    title: user.role === 'employee' ? 'پروفایل من' : 'مدیریت کارمندان',
    employees,
    userRole: user.role
  });
});

// Employee profile
router.get('/:id', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();
  const employee = db.prepare(`
    SELECT u.*, d.name as department_name
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    WHERE u.id = ?
  `).get(req.params.id);

  if (!employee) {
    req.flash('error', 'کارمند یافت نشد');
    return res.redirect('/employees');
  }

  res.render('employees/profile', {
    title: `پروفایل: ${employee.first_name} ${employee.last_name}`,
    employee
  });
});

module.exports = router;