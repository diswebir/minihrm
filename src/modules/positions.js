// ═══════════════════════════════════════════════════════════
//  Positions Module - Job Positions Management
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { getDb } = require('../database/connection');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { moduleGuard } = require('../middleware/moduleGuard');
const { generateQR } = require('../services/qr');

router.use(isAuthenticated);
router.use(moduleGuard('positions'));

// List positions
router.get('/', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();
  const positions = db.prepare(`
    SELECT jp.*, d.name as department_name,
    (SELECT COUNT(*) FROM candidates WHERE job_position_id = jp.id) as candidate_count
    FROM job_positions jp
    LEFT JOIN departments d ON jp.department_id = d.id
    ORDER BY jp.created_at DESC
  `).all();

  res.render('positions/index', {
    title: 'موقعیت‌های شغلی',
    positions
  });
});

// New position form
router.get('/new', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  const departments = db.prepare('SELECT * FROM departments WHERE is_active = 1').all();

  res.render('positions/form', {
    title: 'موقعیت شغلی جدید',
    position: null,
    departments
  });
});

// Create position
router.post('/', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { title, department_id, description, requirements, employment_type, salary_range } = req.body;

  if (!title) {
    req.flash('error', 'عنوان شغلی الزامی است');
    return res.redirect('/positions/new');
  }

  const db = getDb();
  db.prepare(`
    INSERT INTO job_positions (title, department_id, description, requirements, employment_type, salary_range, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(title, department_id || null, description || '', requirements || '', employment_type || 'full_time', salary_range || '', req.session.user.id);

  req.flash('success', 'موقعیت شغلی با موفقیت ایجاد شد');
  return res.redirect('/positions');
});

// Edit position form
router.get('/:id/edit', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  const position = db.prepare('SELECT * FROM job_positions WHERE id = ?').get(req.params.id);
  if (!position) {
    req.flash('error', 'موقعیت شغلی یافت نشد');
    return res.redirect('/positions');
  }

  const departments = db.prepare('SELECT * FROM departments WHERE is_active = 1').all();

  res.render('positions/form', {
    title: `ویرایش: ${position.title}`,
    position,
    departments
  });
});

// Update position
router.post('/:id', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { title, department_id, description, requirements, employment_type, salary_range, is_active } = req.body;
  const db = getDb();

  db.prepare(`
    UPDATE job_positions SET title=?, department_id=?, description=?, requirements=?, employment_type=?, salary_range=?, is_active=?, updated_at=datetime('now') WHERE id=?
  `).run(title, department_id || null, description || '', requirements || '', employment_type || 'full_time', salary_range || '', is_active ? 1 : 0, req.params.id);

  req.flash('success', 'موقعیت شغلی بروزرسانی شد');
  return res.redirect('/positions');
});

// Generate QR for position
router.post('/:id/qr', requireRole('super_admin', 'hr_manager', 'hr_employee'), async (req, res) => {
  const db = getDb();
  const position = db.prepare('SELECT * FROM job_positions WHERE id = ?').get(req.params.id);

  if (!position) {
    req.flash('error', 'موقعیت شغلی یافت نشد');
    return res.redirect('/positions');
  }

  try {
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const qrResult = await generateQR(position.id, baseUrl);

    res.render('positions/qr', {
      title: `QR Code - ${position.title}`,
      position,
      qr: qrResult,
      baseUrl
    });
  } catch (error) {
    console.error('QR generation error:', error);
    req.flash('error', 'خطا در تولید QR Code');
    return res.redirect('/positions');
  }
});

// Toggle position status
router.post('/:id/toggle', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  const pos = db.prepare('SELECT * FROM job_positions WHERE id = ?').get(req.params.id);
  if (pos) {
    db.prepare("UPDATE job_positions SET is_active = ?, updated_at = datetime('now') WHERE id = ?").run(pos.is_active ? 0 : 1, pos.id);
  }
  req.flash('success', 'وضعیت موقعیت شغلی تغییر کرد');
  return res.redirect('/positions');
});

// Delete position
router.post('/:id/delete', requireRole('super_admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM job_positions WHERE id = ?').run(req.params.id);
  req.flash('success', 'موقعیت شغلی حذف شد');
  return res.redirect('/positions');
});

module.exports = router;