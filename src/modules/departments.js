// ═══════════════════════════════════════════════════════════
//  Departments Module
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { getDb } = require('../database/connection');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { moduleGuard } = require('../middleware/moduleGuard');

router.use(isAuthenticated);
router.use(moduleGuard('departments'));

// List departments
router.get('/', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  const departments = db.prepare(`
    SELECT d.*, u.first_name || ' ' || u.last_name as manager_name,
    (SELECT COUNT(*) FROM users WHERE department_id = d.id) as employee_count
    FROM departments d
    LEFT JOIN users u ON d.manager_id = u.id
    ORDER BY d.created_at DESC
  `).all();

  res.render('departments/index', {
    title: 'مدیریت بخش‌ها',
    departments
  });
});

// New department form
router.get('/new', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  const managers = db.prepare("SELECT id, first_name, last_name FROM users WHERE role IN ('super_admin','hr_manager','employee') AND is_active = 1").all();

  res.render('departments/form', {
    title: 'بخش جدید',
    department: null,
    managers
  });
});

// Create department
router.post('/', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { name, description, manager_id } = req.body;

  if (!name) {
    req.flash('error', 'نام بخش الزامی است');
    return res.redirect('/departments/new');
  }

  const db = getDb();
  db.prepare('INSERT INTO departments (name, description, manager_id) VALUES (?, ?, ?)').run(name, description || '', manager_id || null);

  req.flash('success', 'بخش با موفقیت ایجاد شد');
  return res.redirect('/departments');
});

// Edit department form
router.get('/:id/edit', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  const department = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);

  if (!department) {
    req.flash('error', 'بخش یافت نشد');
    return res.redirect('/departments');
  }

  const managers = db.prepare("SELECT id, first_name, last_name FROM users WHERE role IN ('super_admin','hr_manager','employee') AND is_active = 1").all();

  res.render('departments/form', {
    title: `ویرایش بخش: ${department.name}`,
    department,
    managers
  });
});

// Update department
router.post('/:id', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { name, description, manager_id, is_active } = req.body;
  const db = getDb();

  db.prepare("UPDATE departments SET name=?, description=?, manager_id=?, is_active=?, created_at=created_at WHERE id=?")
    .run(name, description || '', manager_id || null, is_active ? 1 : 0, req.params.id);

  req.flash('success', 'بخش بروزرسانی شد');
  return res.redirect('/departments');
});

// Delete department
router.post('/:id/delete', requireRole('super_admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM departments WHERE id = ?').run(req.params.id);

  req.flash('success', 'بخش حذف شد');
  return res.redirect('/departments');
});

module.exports = router;