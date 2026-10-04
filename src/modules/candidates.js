// ═══════════════════════════════════════════════════════════
//  Candidates Module - Recruitment Management
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../database/connection');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { moduleGuard } = require('../middleware/moduleGuard');

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', '..', 'uploads', 'resumes');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.use(isAuthenticated);
router.use(moduleGuard('recruitment'));

// List candidates
router.get('/', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();
  const { status, position, search, page = 1 } = req.query;
  const limit = 20;
  const offset = (page - 1) * limit;

  let where = 'WHERE 1=1';
  const params = [];

  if (status) {
    where += ' AND c.status = ?';
    params.push(status);
  }
  if (position) {
    where += ' AND c.job_position_id = ?';
    params.push(parseInt(position));
  }
  if (search) {
    where += ' AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.phone LIKE ? OR c.national_code LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  const total = db.prepare(`SELECT COUNT(*) as c FROM candidates c ${where}`).get(...params).c;
  const candidates = db.prepare(`
    SELECT c.*, jp.title as position_title
    FROM candidates c
    LEFT JOIN job_positions jp ON c.job_position_id = jp.id
    ${where}
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const positions = db.prepare('SELECT id, title FROM job_positions WHERE is_active = 1').all();

  res.render('candidates/index', {
    title: 'متقاضیان استخدام',
    candidates,
    positions,
    pagination: { page: parseInt(page), limit, total, pages: Math.ceil(total / limit) },
    filters: { status, position, search }
  });
});

// Candidate profile
router.get('/:id', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();
  const candidate = db.prepare(`
    SELECT c.*, jp.title as position_title
    FROM candidates c
    LEFT JOIN job_positions jp ON c.job_position_id = jp.id
    WHERE c.id = ?
  `).get(req.params.id);

  if (!candidate) {
    req.flash('error', 'متقاضی یافت نشد');
    return res.redirect('/recruitment');
  }

  // Get form responses
  const responses = db.prepare(`
    SELECT cr.*, ff.field_label, ff.field_type, ff.step_number
    FROM candidate_responses cr
    LEFT JOIN form_fields ff ON ff.field_key = cr.field_key AND ff.template_id = ?
    WHERE cr.candidate_id = ?
    ORDER BY ff.step_number, ff.order_num
  `).all(candidate.form_template_id || 1, req.params.id);

  // Group by step
  const formSteps = {};
  for (const r of responses) {
    const step = r.step_number || 1;
    if (!formSteps[step]) formSteps[step] = [];
    formSteps[step].push(r);
  }

  // Get MBTI data if completed
  let mbtiData = null;
  if (candidate.mbti_completed && candidate.mbti_type) {
    mbtiData = {
      type: candidate.mbti_type,
      scores: JSON.parse(candidate.mbti_scores || '{}'),
      analysis: candidate.mbti_analysis
    };
  }

  // Status history
  const history = db.prepare(`
    SELECT csh.*, u.first_name || ' ' || u.last_name as changed_by_name
    FROM candidate_status_history csh
    LEFT JOIN users u ON csh.changed_by = u.id
    WHERE csh.candidate_id = ?
    ORDER BY csh.created_at DESC
  `).all(req.params.id);

  // Notes
  const notes = db.prepare(`
    SELECT cn.*, u.first_name || ' ' || u.last_name as author_name
    FROM candidate_notes cn
    LEFT JOIN users u ON cn.user_id = u.id
    WHERE cn.candidate_id = ?
    ORDER BY cn.created_at DESC
  `).all(req.params.id);

  res.render('candidates/profile', {
    title: `${candidate.first_name} ${candidate.last_name}`,
    candidate,
    formSteps,
    mbtiData,
    history,
    notes
  });
});

// Update candidate status
router.post('/:id/status', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const { status, note } = req.body;
  const db = getDb();
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id);

  if (!candidate) {
    req.flash('error', 'متقاضی یافت نشد');
    return res.redirect('/recruitment');
  }

  const validStatuses = ['new','form_started','form_completed','mbti_completed','under_review','interview','approved','rejected','hired'];
  if (!validStatuses.includes(status)) {
    req.flash('error', 'وضعیت نامعتبر');
    return res.redirect(`/recruitment/${req.params.id}`);
  }

  // Update candidate
  db.prepare("UPDATE candidates SET status=?, reviewed_by=?, reviewed_at=datetime('now'), updated_at=datetime('now') WHERE id=?")
    .run(status, req.session.user.id, candidate.id);

  // Save history
  db.prepare(`
    INSERT INTO candidate_status_history (candidate_id, old_status, new_status, changed_by, note) VALUES (?, ?, ?, ?, ?)
  `).run(candidate.id, candidate.status, status, req.session.user.id, note || '');

  // Save note if provided
  if (note) {
    db.prepare(`
      INSERT INTO candidate_notes (candidate_id, user_id, note) VALUES (?, ?, ?)
    `).run(candidate.id, req.session.user.id, note);
  }

  db.prepare(`
    INSERT INTO activity_logs (user_id, action, module, description, ip_address) VALUES (?, 'status_change', 'recruitment', ?, ?)
  `).run(req.session.user.id, `تغییر وضعیت متقاضی ${candidate.first_name} ${candidate.last_name}: ${status}`, req.ip);

  req.flash('success', 'وضعیت متقاضی بروزرسانی شد');
  return res.redirect(`/recruitment/${req.params.id}`);
});

// Add note to candidate
router.post('/:id/notes', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const { note } = req.body;
  if (!note) {
    req.flash('error', 'متن یادداشت الزامی است');
    return res.redirect(`/recruitment/${req.params.id}`);
  }

  const db = getDb();
  db.prepare('INSERT INTO candidate_notes (candidate_id, user_id, note) VALUES (?, ?, ?)')
    .run(req.params.id, req.session.user.id, note);

  req.flash('success', 'یادداشت اضافه شد');
  return res.redirect(`/recruitment/${req.params.id}`);
});

// Export candidates as CSV
router.get('/export/csv', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  const candidates = db.prepare(`
    SELECT c.*, jp.title as position_title
    FROM candidates c
    LEFT JOIN job_positions jp ON c.job_position_id = jp.id
    ORDER BY c.created_at DESC
  `).all();

  // Build CSV
  const headers = ['شناسه','نام','نام خانوادگی','موبایل','ایمیل','کد ملی','موقعیت شغلی','وضعیت','فرم تکمیل','MBTI','تاریخ ثبت‌نام'];
  const rows = candidates.map(c => [
    c.id, c.first_name, c.last_name, c.phone, c.email, c.national_code,
    c.position_title || '', c.status, c.form_completed ? 'بله' : 'خیر',
    c.mbti_type || '', c.created_at
  ]);

  let csv = '\uFEFF'; // BOM for Excel
  csv += headers.join(',') + '\n';
  for (const row of rows) {
    csv += row.map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(',') + '\n';
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=candidates.csv');
  res.send(csv);
});

module.exports = router;