// ═══════════════════════════════════════════════════════════
//  Training Module - Courses, Assignments, Progress
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { getDb } = require('../database/connection');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { moduleGuard } = require('../middleware/moduleGuard');

router.use(isAuthenticated);
router.use(moduleGuard('training'));

// ─── Courses List ────────────────────────────────────────
router.get('/', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();
  const courses = db.prepare(`
    SELECT tc.*, d.name as department_name,
    (SELECT COUNT(*) FROM training_assignments WHERE course_id = tc.id) as assigned_count,
    (SELECT COUNT(*) FROM training_assignments WHERE course_id = tc.id AND status = 'completed') as completed_count
    FROM training_courses tc
    LEFT JOIN departments d ON tc.department_id = d.id
    ORDER BY tc.created_at DESC
  `).all();

  res.render('training/index', { title: 'دوره‌های آموزشی', courses });
});

// ─── New Course Form ─────────────────────────────────────
router.get('/new', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  const departments = db.prepare('SELECT * FROM departments WHERE is_active = 1').all();
  res.render('training/course-form', { title: 'دوره جدید', course: null, departments });
});

// ─── Create Course ───────────────────────────────────────
router.post('/', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { title, description, category, content_type, content_url, content_text, duration_hours, is_mandatory, department_id } = req.body;
  const db = getDb();

  db.prepare(`
    INSERT INTO training_courses (title, description, category, content_type, content_url, content_text, duration_hours, is_mandatory, department_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, description || '', category || 'general', content_type || 'video', content_url || '', content_text || '', parseFloat(duration_hours) || 0, is_mandatory ? 1 : 0, department_id || null, req.session.user.id);

  req.flash('success', 'دوره آموزشی ایجاد شد');
  res.redirect('/training');
});

// ─── Edit Course Form ────────────────────────────────────
router.get('/:id/edit', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  const course = db.prepare('SELECT * FROM training_courses WHERE id = ?').get(req.params.id);
  if (!course) { req.flash('error', 'دوره یافت نشد'); return res.redirect('/training'); }
  const departments = db.prepare('SELECT * FROM departments WHERE is_active = 1').all();
  res.render('training/course-form', { title: `ویرایش: ${course.title}`, course, departments });
});

// ─── Update Course ───────────────────────────────────────
router.post('/:id', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { title, description, category, content_type, content_url, content_text, duration_hours, is_mandatory, department_id, is_active } = req.body;
  const db = getDb();

  db.prepare(`
    UPDATE training_courses SET title=?, description=?, category=?, content_type=?, content_url=?, content_text=?, duration_hours=?, is_mandatory=?, department_id=?, is_active=? WHERE id=?
  `).run(title, description || '', category || 'general', content_type || 'video', content_url || '', content_text || '', parseFloat(duration_hours) || 0, is_mandatory ? 1 : 0, department_id || null, is_active ? 1 : 0, req.params.id);

  req.flash('success', 'دوره بروزرسانی شد');
  res.redirect('/training');
});

// ─── Assign Course ───────────────────────────────────────
router.get('/:id/assign', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();
  const course = db.prepare('SELECT * FROM training_courses WHERE id = ?').get(req.params.id);
  if (!course) { req.flash('error', 'دوره یافت نشد'); return res.redirect('/training'); }

  const employees = db.prepare("SELECT id, first_name, last_name FROM users WHERE role IN ('employee','hr_employee','hr_manager') AND is_active = 1").all();
  const assigned = db.prepare('SELECT user_id FROM training_assignments WHERE course_id = ?').all(req.params.id);
  const assignedIds = assigned.map(a => a.user_id);

  res.render('training/assign', { title: `اختصاص دوره: ${course.title}`, course, employees, assignedIds });
});

// ─── Submit Assignments ──────────────────────────────────
router.post('/:id/assign', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const { user_ids, due_date } = req.body;
  const db = getDb();

  const ids = Array.isArray(user_ids) ? user_ids : [user_ids];
  const upsert = db.prepare(`
    INSERT INTO training_assignments (course_id, user_id, assigned_by, due_date) VALUES (?, ?, ?, ?)
    ON CONFLICT(course_id, user_id) DO UPDATE SET assigned_by=?, due_date=?
  `);

  const assignAll = db.transaction(() => {
    for (const uid of ids) {
      if (uid) upsert.run(req.params.id, parseInt(uid), req.session.user.id, due_date || null, req.session.user.id, due_date || null);
    }
  });
  assignAll();

  req.flash('success', `${ids.length} نفر به دوره اختصاص داده شدند`);
  res.redirect('/training');
});

// ─── Employee's Training Dashboard ───────────────────────
router.get('/my-courses', (req, res) => {
  const db = getDb();
  const assignments = db.prepare(`
    SELECT ta.*, tc.title, tc.description, tc.content_type, tc.content_url, tc.content_text, tc.duration_hours, tc.category
    FROM training_assignments ta
    JOIN training_courses tc ON ta.course_id = tc.id
    WHERE ta.user_id = ?
    ORDER BY ta.status, ta.due_date
  `).all(req.session.user.id);

  res.render('training/my-courses', { title: 'دوره‌های من', assignments });
});

// ─── View Course Content ─────────────────────────────────
router.get('/my-courses/:assignmentId', (req, res) => {
  const db = getDb();
  const assignment = db.prepare(`
    SELECT ta.*, tc.title, tc.description, tc.content_type, tc.content_url, tc.content_text, tc.duration_hours
    FROM training_assignments ta
    JOIN training_courses tc ON ta.course_id = tc.id
    WHERE ta.id = ? AND ta.user_id = ?
  `).get(req.params.assignmentId, req.session.user.id);

  if (!assignment) { req.flash('error', 'دوره یافت نشد'); return res.redirect('/training/my-courses'); }

  // Mark as in_progress
  if (assignment.status === 'assigned') {
    db.prepare("UPDATE training_assignments SET status = 'in_progress', started_at = datetime('now') WHERE id = ?").run(assignment.id);
  }

  res.render('training/course-view', { title: assignment.title, assignment });
});

// ─── Complete Course ─────────────────────────────────────
router.post('/my-courses/:assignmentId/complete', (req, res) => {
  const db = getDb();
  db.prepare("UPDATE training_assignments SET status = 'completed', completed_at = datetime('now') WHERE id = ? AND user_id = ?")
    .run(req.params.assignmentId, req.session.user.id);

  req.flash('success', 'دوره با موفقیت تکمیل شد!');
  res.redirect('/training/my-courses');
});

// ─── Training Reports ────────────────────────────────────
router.get('/reports', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  const stats = {
    totalCourses: db.prepare('SELECT COUNT(*) as c FROM training_courses WHERE is_active = 1').get().c,
    totalAssignments: db.prepare('SELECT COUNT(*) as c FROM training_assignments').get().c,
    completed: db.prepare("SELECT COUNT(*) as c FROM training_assignments WHERE status = 'completed'").get().c,
    inProgress: db.prepare("SELECT COUNT(*) as c FROM training_assignments WHERE status = 'in_progress'").get().c,
    mandatoryPending: db.prepare(`
      SELECT COUNT(*) as c FROM training_assignments ta
      JOIN training_courses tc ON ta.course_id = tc.id
      WHERE tc.is_mandatory = 1 AND ta.status != 'completed'
    `).get().c,
  };

  const byCategory = db.prepare(`
    SELECT category, COUNT(*) as count FROM training_courses WHERE is_active = 1 GROUP BY category
  `).all();

  res.render('training/reports', { title: 'گزارش آموزش', stats, byCategory });
});

// ─── Delete Course ───────────────────────────────────────
router.post('/:id/delete', requireRole('super_admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM training_courses WHERE id = ?').run(req.params.id);
  req.flash('success', 'دوره حذف شد');
  res.redirect('/training');
});

module.exports = router;