'use strict';
/** ماژول استخدام — موقعیت‌های شغلی، فرم‌ساز، متقاضیان، ویزارد عمومی (QR/OTP) */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');

const db = require('../../db');
const helpers = require('../../lib/helpers');
const permissions = require('../../lib/permissions');
const audit = require('../../lib/audit');
const { requirePerm } = require('../../lib/permissions');
const { rateLimit } = require('../../lib/ratelimit');
const { cleanText } = require('../../lib/validate');
const dates = require('../../lib/dates');
const mbtiEngine = require('../../lib/mbti');
const seedData = require('../../seed-data');
const moduleSystem = require('../../lib/modules');
const { uploadPhoto } = require('../../lib/upload');

const router = express.Router();

/** محافظت زمان اجرا: اگر ماژول غیرفعال شد، مسیرهای آن پاسخ ندهند */
router.use((req, res, next) => {
  if (!moduleSystem.isEnabled('recruitment')) {
    return res.status(404).render('pages/error', {
      title: 'یافت نشد', status: 404,
      message: 'ماژول استخدام غیرفعال است.'
    });
  }
  next();
});

function trackingCode() {
  const prefix = helpers.getSetting('tracking_prefix', 'ERF');
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomInt(100000, 999999)}`;
}

function loadFields() {
  return db.prepare('SELECT * FROM form_fields ORDER BY sort, id').all();
}
function loadSteps() {
  return db.prepare('SELECT * FROM form_steps ORDER BY sort').all();
}

/* ============================================================
   HR — موقعیت‌های شغلی
   ============================================================ */
router.get('/hr/positions', requirePerm('positions.view'), (req, res) => {
  const positions = db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM applicants a WHERE a.position_id = p.id AND a.status != 'draft') AS applicants_count
    FROM positions p ORDER BY p.sort, p.id
  `).all();
  res.render('modules/recruitment/positions', { title: 'موقعیت‌های شغلی', activeMenu: 'positions', positions });
});

router.get('/hr/positions/new', requirePerm('positions.manage'), (req, res) => {
  res.render('modules/recruitment/position-form', { title: 'موقعیت شغلی جدید', activeMenu: 'positions', position: null, error: null });
});

router.post('/hr/positions/new', requirePerm('positions.manage'), (req, res) => {
  const { title, department, employment_type, description, requirements, benefits, min_salary, max_salary, status } = req.body;
  if (!title || !title.trim()) {
    return res.render('modules/recruitment/position-form', { title: 'موقعیت شغلی جدید', activeMenu: 'positions', position: req.body, error: 'عنوان موقعیت شغلی الزامی است' });
  }
  const code = 'POS' + Date.now().toString(36).toUpperCase();
  db.prepare(`
    INSERT INTO positions (code, title, department, employment_type, description, requirements, benefits, min_salary, max_salary, status)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(code, title.trim(), cleanText(department, 80), employment_type || 'full_time',
    cleanText(description, 4000), cleanText(requirements, 4000), cleanText(benefits, 2000),
    cleanText(min_salary, 20), cleanText(max_salary, 20), status === 'draft' ? 'draft' : (status === 'closed' ? 'closed' : 'open'));
  audit.log(req, 'position.create', 'position', code, { title });
  res.redirect('/hr/positions');
});

router.get('/hr/positions/:id/edit', requirePerm('positions.manage'), (req, res) => {
  const position = db.prepare('SELECT * FROM positions WHERE id = ?').get(req.params.id);
  if (!position) return res.status(404).render('pages/error', { title: 'یافت نشد', status: 404, message: 'موقعیت شغلی یافت نشد' });
  res.render('modules/recruitment/position-form', { title: 'ویرایش موقعیت شغلی', activeMenu: 'positions', position, error: null });
});

router.post('/hr/positions/:id/edit', requirePerm('positions.manage'), (req, res) => {
  const position = db.prepare('SELECT * FROM positions WHERE id = ?').get(req.params.id);
  if (!position) return res.status(404).render('pages/error', { title: 'یافت نشد', status: 404, message: 'موقعیت شغلی یافت نشد' });
  const { title, department, employment_type, description, requirements, benefits, min_salary, max_salary, status } = req.body;
  if (!title || !title.trim()) {
    return res.render('modules/recruitment/position-form', { title: 'ویرایش موقعیت شغلی', activeMenu: 'positions', position: req.body, error: 'عنوان موقعیت شغلی الزامی است' });
  }
  db.prepare(`
    UPDATE positions SET title=?, department=?, employment_type=?, description=?, requirements=?, benefits=?,
    min_salary=?, max_salary=?, status=?, updated_at=datetime('now') WHERE id=?
  `).run(title.trim(), cleanText(department, 80), employment_type || 'full_time',
    cleanText(description, 4000), cleanText(requirements, 4000), cleanText(benefits, 2000),
    cleanText(min_salary, 20), cleanText(max_salary, 20),
    status === 'draft' ? 'draft' : (status === 'closed' ? 'closed' : 'open'), position.id);
  audit.log(req, 'position.update', 'position', position.id, { title });
  res.redirect('/hr/positions');
});

router.post('/hr/positions/:id/delete', requirePerm('positions.manage'), (req, res) => {
  const position = db.prepare('SELECT * FROM positions WHERE id = ?').get(req.params.id);
  if (!position) return res.status(404).json({ ok: false, message: 'یافت نشد' });
  const used = db.prepare('SELECT COUNT(*) c FROM applicants WHERE position_id = ?').get(position.id).c;
  if (used > 0) {
    db.prepare("UPDATE positions SET status = 'closed', updated_at = datetime('now') WHERE id = ?").run(position.id);
    return res.json({ ok: true, message: 'این موقعیت دارای متقاضی است؛ به‌جای حذف، بسته شد.' });
  }
  db.prepare('DELETE FROM positions WHERE id = ?').run(position.id);
  audit.log(req, 'position.delete', 'position', position.id, {});
  res.json({ ok: true, message: 'حذف شد' });
});

router.get('/hr/positions/:id/qr', requirePerm('positions.view'), async (req, res) => {
  const position = db.prepare('SELECT * FROM positions WHERE id = ?').get(req.params.id);
  if (!position) return res.status(404).render('pages/error', { title: 'یافت نشد', status: 404, message: 'موقعیت شغلی یافت نشد' });
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const base = `${proto}://${req.get('host')}`;
  const url = `${base}/apply?pos=${encodeURIComponent(position.code)}`;
  const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 320, color: { dark: '#2E3452', light: '#FFFFFF' } });
  res.render('modules/recruitment/position-qr', {
    title: 'QR موقعیت شغلی', activeMenu: 'positions',
    position, url, qrSvg, layout: false, company: helpers.getSetting('company_name')
  });
});

/* ============================================================
   HR — متقاضیان
   ============================================================ */
router.get('/hr/applicants', requirePerm('applicants.view'), (req, res) => {
  const { status, position_id, q } = req.query;
  let sql = `
    SELECT a.*, p.title AS position_title,
      (SELECT COUNT(*) FROM applicant_notes n WHERE n.applicant_id = a.id) AS notes_count
    FROM applicants a LEFT JOIN positions p ON p.id = a.position_id
    WHERE a.status != 'draft'
  `;
  const params = [];
  if (status && seedData.APPLICANT_STATUSES[status]) { sql += ' AND a.status = ?'; params.push(status); }
  if (position_id) { sql += ' AND a.position_id = ?'; params.push(position_id); }
  if (q) {
    sql += ' AND (a.first_name LIKE ? OR a.last_name LIKE ? OR a.phone LIKE ? OR a.tracking_code LIKE ? OR a.national_id LIKE ?)';
    const like = '%' + q + '%';
    params.push(like, like, like, like, like);
  }
  sql += ' ORDER BY a.id DESC LIMIT 200';
  const applicants = db.prepare(sql).all(...params);
  const positions = db.prepare("SELECT id, title FROM positions ORDER BY title").all();
  const counts = db.prepare("SELECT status, COUNT(*) c FROM applicants WHERE status != 'draft' GROUP BY status").all();
  const countMap = {};
  for (const c of counts) countMap[c.status] = c.c;

  res.render('modules/recruitment/applicants', {
    title: 'متقاضیان استخدام', activeMenu: 'applicants',
    applicants, positions, countMap,
    filters: { status: status || '', position_id: position_id || '', q: q || '' }
  });
});

router.get('/hr/applicants/:id', requirePerm('applicants.view'), (req, res) => {
  const applicant = db.prepare(`
    SELECT a.*, p.title AS position_title, p.department AS position_department
    FROM applicants a LEFT JOIN positions p ON p.id = a.position_id WHERE a.id = ?
  `).get(req.params.id);
  if (!applicant) return res.status(404).render('pages/error', { title: 'یافت نشد', status: 404, message: 'متقاضی یافت نشد' });

  const fields = loadFields();
  const steps = loadSteps();
  const data = helpers.parseJson(applicant.data, {});
  const notes = db.prepare(`
    SELECT n.*, u.full_name AS user_name FROM applicant_notes n
    LEFT JOIN users u ON u.id = n.user_id WHERE n.applicant_id = ? ORDER BY n.id DESC
  `).all(applicant.id);
  const events = db.prepare(`
    SELECT e.*, u.full_name AS user_name FROM applicant_events e
    LEFT JOIN users u ON u.id = e.user_id WHERE e.applicant_id = ? ORDER BY e.id DESC LIMIT 40
  `).all(applicant.id);

  let mbtiResult = null;
  if (applicant.mbti_type && moduleSystem.isEnabled('mbti') && permissions.can(req.session.user, 'mbti.view')) {
    const questions = db.prepare('SELECT * FROM mbti_questions WHERE enabled = 1 ORDER BY sort').all();
    const answers = helpers.parseJson(applicant.mbti_answers, []);
    mbtiResult = mbtiEngine.score(answers, questions);
    const fit = mbtiEngine.jobFitScore(applicant.mbti_type, (applicant.position_title || '') + ' ' + (applicant.position_department || ''));
    mbtiResult.jobFit = fit;
    // تفسیر کامل تیپ از دیتابیس
    mbtiResult.typeRow = db.prepare('SELECT * FROM mbti_types WHERE code = ?').get(applicant.mbti_type) || null;
    if (mbtiResult.typeRow) {
      for (const key of ['strengths', 'weaknesses', 'ideal_jobs', 'interview_tips', 'red_flags']) {
        mbtiResult.typeRow[key + '_parsed'] = helpers.parseJson(mbtiResult.typeRow[key], []);
      }
    }
  }

  res.render('modules/recruitment/applicant-profile', {
    title: 'پرونده متقاضی', activeMenu: 'applicants',
    applicant, fields, steps, data, notes, events, mbtiResult,
    statuses: seedData.APPLICANT_STATUSES,
    canViewMbti: permissions.can(req.session.user, 'mbti.view'),
    canNotes: permissions.can(req.session.user, 'applicants.notes'),
    canDecide: permissions.can(req.session.user, 'applicants.decision'),
    canEdit: permissions.can(req.session.user, 'applicants.edit')
  });
});

router.post('/hr/applicants/:id/status', requirePerm('applicants.edit'), (req, res) => {
  const applicant = db.prepare('SELECT * FROM applicants WHERE id = ?').get(req.params.id);
  if (!applicant) return res.status(404).json({ ok: false, message: 'متقاضی یافت نشد' });
  const { status } = req.body;
  if (!seedData.APPLICANT_STATUSES[status]) return res.status(400).json({ ok: false, message: 'وضعیت نامعتبر است' });
  const old = applicant.status;
  db.prepare("UPDATE applicants SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, applicant.id);
  db.prepare('INSERT INTO applicant_events (applicant_id, user_id, event, detail) VALUES (?,?,?,?)')
    .run(applicant.id, req.session.userId, 'status_change', JSON.stringify({ from: old, to: status }));
  audit.log(req, 'applicant.status', 'applicant', applicant.id, { from: old, to: status });
  res.json({ ok: true, message: 'وضعیت بروزرسانی شد' });
});

router.post('/hr/applicants/:id/note', requirePerm('applicants.notes'), (req, res) => {
  const applicant = db.prepare('SELECT * FROM applicants WHERE id = ?').get(req.params.id);
  if (!applicant) return res.status(404).json({ ok: false, message: 'متقاضی یافت نشد' });
  const { kind, note, decision } = req.body;
  const allowedKinds = ['interview', 'hr', 'management', 'general'];
  if (!allowedKinds.includes(kind)) return res.status(400).json({ ok: false, message: 'نوع نظر نامعتبر است' });
  if (kind !== 'general' && decision && !permissions.can(req.session.user, 'applicants.decision')) {
    return res.status(403).json({ ok: false, message: 'برای ثبت تصمیم نهایی به مجوز «تصمیم نهایی استخدام» نیاز دارید' });
  }
  db.prepare('INSERT INTO applicant_notes (applicant_id, user_id, kind, note, decision) VALUES (?,?,?,?,?)')
    .run(applicant.id, req.session.userId, kind, cleanText(note, 4000), cleanText(decision, 20));
  db.prepare('INSERT INTO applicant_events (applicant_id, user_id, event, detail) VALUES (?,?,?,?)')
    .run(applicant.id, req.session.userId, 'note_' + kind, cleanText(note, 200));
  audit.log(req, 'applicant.note', 'applicant', applicant.id, { kind });
  res.json({ ok: true, message: 'نظر ثبت شد' });
});

router.post('/hr/applicants/:id/delete', requirePerm('applicants.delete'), (req, res) => {
  const applicant = db.prepare('SELECT * FROM applicants WHERE id = ?').get(req.params.id);
  if (!applicant) return res.status(404).json({ ok: false, message: 'یافت نشد' });
  db.prepare('DELETE FROM applicants WHERE id = ?').run(applicant.id);
  audit.log(req, 'applicant.delete', 'applicant', applicant.id, {});
  res.json({ ok: true, message: 'پرونده حذف شد' });
});

/* ============================================================
   HR — فرم‌ساز
   ============================================================ */
router.get('/hr/form-builder', requirePerm('formbuilder.manage'), (req, res) => {
  const fields = loadFields();
  const steps = loadSteps();
  const repeaterCols = seedData.REPEATER_COLUMNS;
  res.render('modules/recruitment/form-builder', {
    title: 'طراحی فرم استخدام', activeMenu: 'form-builder',
    fields, steps, repeaterCols, saved: req.query.saved || null
  });
});

router.post('/hr/form-builder/save', requirePerm('formbuilder.manage'), (req, res) => {
  const updField = db.prepare('UPDATE form_fields SET label = ?, required = ?, visible = ? WHERE id = ?');
  const updStep = db.prepare('UPDATE form_steps SET enabled = ? WHERE id = ?');
  const fields = loadFields();
  for (const f of fields) {
    const label = req.body['label_' + f.id];
    const required = req.body['required_' + f.id] === 'on' ? 1 : 0;
    const visible = req.body['visible_' + f.id] === 'on' ? 1 : 0;
    updField.run(label ? label.trim().slice(0, 200) : f.label, f.builtin && f.field_key === 'consent' ? 1 : required, visible, f.id);
  }
  const steps = loadSteps();
  for (const s of steps) {
    const enabled = req.body['step_' + s.key] === 'on' ? 1 : 0;
    updStep.run(enabled, s.id);
  }
  audit.log(req, 'formbuilder.save', 'form', '', {});
  res.redirect('/hr/form-builder?saved=1');
});

router.post('/hr/form-builder/field', requirePerm('formbuilder.manage'), (req, res) => {
  const { label, type, step_key, options, help, width } = req.body;
  if (!label || !label.trim()) return res.status(400).json({ ok: false, message: 'برچسب فیلد الزامی است' });
  const step = db.prepare('SELECT key FROM form_steps WHERE key = ?').get(step_key);
  if (!step) return res.status(400).json({ ok: false, message: 'مرحله نامعتبر است' });
  const key = 'custom_' + Date.now().toString(36);
  const opts = String(options || '').split('\n').map(s => s.trim()).filter(Boolean).map(s => ({ value: s, label: s }));
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort),0) m FROM form_fields WHERE step_key = ?').get(step_key).m;
  const info = db.prepare(`
    INSERT INTO form_fields (field_key, step_key, label, type, options, required, visible, builtin, grp, width, help, sort)
    VALUES (?,?,?,?,?,1,1,0,'custom',?,?,?)
  `).run(key, step_key, label.trim().slice(0, 200), type || 'text', JSON.stringify(opts), width === 'full' ? 'full' : 'half', cleanText(help, 300), maxSort + 1);
  audit.log(req, 'formbuilder.field_add', 'form', key, { label });
  res.json({ ok: true, message: 'فیلد اضافه شد', id: info.lastInsertRowid, key });
});

router.post('/hr/form-builder/field/:id/delete', requirePerm('formbuilder.manage'), (req, res) => {
  const f = db.prepare('SELECT * FROM form_fields WHERE id = ?').get(req.params.id);
  if (!f) return res.status(404).json({ ok: false, message: 'یافت نشد' });
  if (f.builtin) return res.status(400).json({ ok: false, message: 'فیلدهای پیش‌فرض قابل حذف نیستند (فقط می‌توانید آن‌ها را مخفی کنید)' });
  db.prepare('DELETE FROM form_fields WHERE id = ?').run(f.id);
  audit.log(req, 'formbuilder.field_delete', 'form', f.field_key, {});
  res.json({ ok: true, message: 'حذف شد' });
});

/* ============================================================
   HR — گزارش استخدام
   ============================================================ */
router.get('/hr/reports', requirePerm('reports.view'), (req, res) => {
  const total = db.prepare("SELECT COUNT(*) c FROM applicants WHERE status != 'draft'").get().c;
  const byStatus = db.prepare("SELECT status, COUNT(*) c FROM applicants WHERE status != 'draft' GROUP BY status").all();
  const byPosition = db.prepare(`
    SELECT p.title, COUNT(a.id) c FROM positions p
    LEFT JOIN applicants a ON a.position_id = p.id AND a.status != 'draft'
    GROUP BY p.id ORDER BY c DESC
  `).all();
  const trend = db.prepare(`
    SELECT date(submitted_at) AS d, COUNT(*) c FROM applicants
    WHERE submitted_at IS NOT NULL GROUP BY date(submitted_at) ORDER BY d DESC LIMIT 30
  `).all().reverse();
  const mbtiDist = permissions.can(req.session.user, 'mbti.view')
    ? db.prepare("SELECT mbti_type, COUNT(*) c FROM applicants WHERE mbti_type != '' AND status != 'draft' GROUP BY mbti_type ORDER BY c DESC").all()
    : [];
  const funnel = [
    { label: 'ارسال شده', value: db.prepare("SELECT COUNT(*) c FROM applicants WHERE status IN ('submitted','reviewing','interview','accepted','rejected','on_hold')").get().c },
    { label: 'در بررسی', value: db.prepare("SELECT COUNT(*) c FROM applicants WHERE status IN ('reviewing','interview','accepted','rejected','on_hold')").get().c },
    { label: 'مصاحبه', value: db.prepare("SELECT COUNT(*) c FROM applicants WHERE status IN ('interview','accepted','rejected')").get().c },
    { label: 'استخدام', value: db.prepare("SELECT COUNT(*) c FROM applicants WHERE status = 'accepted'").get().c }
  ];
  res.render('modules/recruitment/reports', {
    title: 'گزارش استخدام', activeMenu: 'reports',
    total, byStatus, byPosition, trend, mbtiDist, funnel,
    statuses: seedData.APPLICANT_STATUSES
  });
});

/* ============================================================
   ویزارد عمومی متقاضی (QR / OTP)
   ============================================================ */
function getCandidate(req) {
  if (!req.session.candidateApplicantId) return null;
  return db.prepare('SELECT * FROM applicants WHERE id = ?').get(req.session.candidateApplicantId);
}

router.get('/apply', async (req, res) => {
  const posCode = req.query.pos || '';
  const positions = db.prepare("SELECT * FROM positions WHERE status = 'open' ORDER BY sort, id").all();
  let preselect = null;
  if (posCode) {
    preselect = db.prepare("SELECT * FROM positions WHERE code = ? AND status = 'open'").get(posCode);
  }
  // اگر قبلاً وارد شده و پیش‌نویس دارد
  const draft = getCandidate(req);
  res.render('modules/recruitment/apply-landing', {
    title: 'درخواست همکاری', layout: false,
    positions, preselect, draft,
    company: helpers.getSetting('company_name'),
    error: null
  });
});

router.post('/apply/start', rateLimit({ windowMs: 60 * 1000, max: 10 }), (req, res) => {
  const { position_id } = req.body;
  const position = db.prepare("SELECT * FROM positions WHERE id = ? AND status = 'open'").get(position_id);
  if (!position) return res.status(400).render('pages/error', { title: 'خطا', status: 400, message: 'موقعیت شغلی انتخاب‌شده معتبر نیست یا بسته شده است', layout: false });
  req.session.applyPositionId = position.id;
  if (req.session.candidatePhone && req.session.candidateApplicantId) {
    return res.redirect('/apply/wizard/personal');
  }
  res.render('modules/recruitment/apply-phone', {
    title: 'تایید شماره موبایل', layout: false,
    position, company: helpers.getSetting('company_name')
  });
});

router.post('/apply/verified', (req, res) => {
  if (!req.session.candidatePhone) {
    return res.redirect('/apply');
  }
  const positionId = req.session.applyPositionId;
  const phone = req.session.candidatePhone;

  // اگر پیش‌نویس فعال داریم از همان استفاده می‌کنیم
  let applicant = db.prepare("SELECT * FROM applicants WHERE phone = ? AND status = 'draft' ORDER BY id DESC LIMIT 1").get(phone);
  if (!applicant) {
    const position = db.prepare('SELECT * FROM positions WHERE id = ?').get(positionId);
    if (!position) return res.redirect('/apply');
    const code = trackingCode();
    const info = db.prepare(`
      INSERT INTO applicants (tracking_code, phone, position_id, status, step, data, created_ip)
      VALUES (?,?,?,'draft','personal','{}',?)
    `).run(code, phone, position.id, (req.headers['x-forwarded-for'] || req.ip || '').toString().slice(0, 64));
    applicant = db.prepare('SELECT * FROM applicants WHERE id = ?').get(info.lastInsertRowid);
    db.prepare('INSERT INTO applicant_events (applicant_id, event, detail) VALUES (?,?,?)')
      .run(applicant.id, 'draft_created', JSON.stringify({ position: position.title }));
  } else if (positionId) {
    db.prepare('UPDATE applicants SET position_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(positionId, applicant.id);
  }
  req.session.candidateApplicantId = applicant.id;
  res.redirect('/apply/wizard/personal');
});

const STEP_ORDER = ['personal', 'experience', 'education', 'skills', 'expectations', 'conditions', 'mbti', 'review'];

function nextStep(current) {
  const enabledSteps = loadSteps().filter(s => s.enabled).map(s => s.key);
  const order = STEP_ORDER.filter(k => enabledSteps.includes(k) || k === 'review');
  const idx = order.indexOf(current);
  return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : 'review';
}
function prevStep(current) {
  const enabledSteps = loadSteps().filter(s => s.enabled).map(s => s.key);
  const order = STEP_ORDER.filter(k => enabledSteps.includes(k) || k === 'review');
  const idx = order.indexOf(current);
  return idx > 0 ? order[idx - 1] : order[0];
}

router.get('/apply/wizard/:step', (req, res) => {
  const applicant = getCandidate(req);
  if (!applicant) return res.redirect('/apply');
  const stepKey = req.params.step;
  const steps = loadSteps().filter(s => s.enabled);
  const step = steps.find(s => s.key === stepKey);
  if (!step && stepKey !== 'review') return res.redirect('/apply/wizard/personal');

  const fields = loadFields().filter(f => f.visible && (f.step_key === stepKey || (stepKey === 'review' && false)));
  const data = helpers.parseJson(applicant.data, {});
  const questions = stepKey === 'mbti' && moduleSystem.isEnabled('mbti')
    ? db.prepare('SELECT * FROM mbti_questions WHERE enabled = 1 ORDER BY sort').all() : [];
  const answers = helpers.parseJson(applicant.mbti_answers, []);

  res.render('modules/recruitment/apply-wizard', {
    title: 'فرم استخدام', layout: false,
    applicant, step: step || { key: 'review', title: 'بررسی و تایید نهایی', description: 'اطلاعات خود را مرور و تایید کنید', icon: 'check' },
    steps, fields, data, questions, answers,
    stepOrder: STEP_ORDER.filter(k => steps.some(s => s.key === k) || k === 'review'),
    nextStep: nextStep(stepKey), prevStep: prevStep(stepKey),
    repeaterCols: seedData.REPEATER_COLUMNS,
    company: helpers.getSetting('company_name'),
    error: null
  });
});

/** جمع‌آوری و ذخیره پاسخ‌های هر مرحله */
function collectStepData(stepKey, body, existing) {
  const data = Object.assign({}, existing);
  const fields = loadFields().filter(f => f.step_key === stepKey);
  for (const f of fields) {
    if (f.type === 'repeater') {
      // داده‌های ردیفی: rows[0][col] ...
      const rows = [];
      const raw = body.rows || {};
      const indexes = Object.keys(raw).filter(k => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
      const cols = seedData.REPEATER_COLUMNS[f.field_key] || [];
      for (const i of indexes) {
        const row = {};
        let hasValue = false;
        for (const col of cols) {
          const v = cleanText((raw[i] || {})[col.key], 500);
          row[col.key] = v;
          if (v) hasValue = true;
        }
        if (hasValue) rows.push(row);
      }
      data[f.field_key] = rows;
    } else if (f.type === 'checkbox') {
      const val = body['f_' + f.field_key];
      data[f.field_key] = Array.isArray(val) ? val.map(v => cleanText(v, 100)) : (val ? [cleanText(val, 100)] : []);
    } else if (f.type === 'switch') {
      data[f.field_key] = body['f_' + f.field_key] === 'on' || body['f_' + f.field_key] === '1';
    } else if (f.type === 'file') {
      // جداگانه پردازش می‌شود
    } else {
      data[f.field_key] = cleanText(body['f_' + f.field_key], 2000);
    }
  }
  return data;
}

function validateStep(stepKey, data) {
  const errors = [];
  const fields = loadFields().filter(f => f.step_key === stepKey && f.visible);
  for (const f of fields) {
    if (!f.required) continue;
    if (f.type === 'repeater') {
      const rows = data[f.field_key];
      if (!Array.isArray(rows) || rows.length === 0) {
        // الزامی بودن کل ردیف: حداقل یک ردیف
        if (f.field_key === 'experiences' || f.field_key === 'educations') {
          errors.push({ field: f.field_key, label: f.label, message: 'حداقل یک ردیف وارد کنید' });
        }
        continue;
      }
      const cols = (seedData.REPEATER_COLUMNS[f.field_key] || []).filter(c => c.required);
      rows.forEach((row, i) => {
        for (const c of cols) {
          if (!row[c.key]) errors.push({ field: f.field_key, label: f.label, message: `ردیف ${i + 1}: ${c.label} الزامی است` });
        }
      });
    } else if (f.type === 'switch') {
      if (data[f.field_key] !== true) errors.push({ field: f.field_key, label: f.label, message: 'تاییدیه الزامی است' });
    } else if (f.type === 'checkbox') {
      if (!Array.isArray(data[f.field_key]) || data[f.field_key].length === 0) {
        errors.push({ field: f.field_key, label: f.label, message: 'حداقل یک گزینه انتخاب کنید' });
      }
    } else {
      const v = data[f.field_key];
      if (v === undefined || v === null || String(v).trim() === '') {
        errors.push({ field: f.field_key, label: f.label, message: 'این فیلد الزامی است' });
      }
    }
    // اعتبارسنجی نوع
    const v = data[f.field_key];
    if (f.type === 'phone' && v && !/^0?9\d{9}$/.test(String(v).replace(/[^\d]/g, ''))) {
      errors.push({ field: f.field_key, label: f.label, message: 'شماره موبایل معتبر نیست' });
    }
    if (f.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))) {
      errors.push({ field: f.field_key, label: f.label, message: 'ایمیل معتبر نیست' });
    }
    if (f.type === 'date' && v && !dates.isValidJalali(v)) {
      errors.push({ field: f.field_key, label: f.label, message: 'تاریخ شمسی معتبر وارد کنید (مثال: 1370/05/12)' });
    }
  }
  return errors;
}

router.post('/apply/wizard/:step', uploadPhoto.single('f_photo'), (req, res) => {
  const applicant = getCandidate(req);
  if (!applicant) return res.redirect('/apply');
  const stepKey = req.params.step;

  if (stepKey === 'mbti') {
    // پاسخ‌های آزمون
    const questions = db.prepare('SELECT * FROM mbti_questions WHERE enabled = 1 ORDER BY sort').all();
    const answers = [];
    let missing = 0;
    for (const q of questions) {
      const choice = req.body['q_' + q.number];
      if (choice === 'a' || choice === 'b') answers.push({ number: q.number, choice });
      else missing++;
    }
    if (missing > 0) {
      return res.render('modules/recruitment/apply-wizard', {
        title: 'فرم استخدام', layout: false,
        applicant, step: { key: 'mbti', title: 'آزمون شخصیت‌شناسی', description: '' },
        steps: loadSteps().filter(s => s.enabled),
        fields: [], data: helpers.parseJson(applicant.data, {}), questions, answers,
        stepOrder: STEP_ORDER, nextStep: nextStep('mbti'), prevStep: prevStep('mbti'),
        repeaterCols: seedData.REPEATER_COLUMNS,
        company: helpers.getSetting('company_name'),
        error: `به ${missing} سوال پاسخ داده نشده است. لطفاً به همه سوالات پاسخ دهید.`
      });
    }
    db.prepare("UPDATE applicants SET mbti_answers = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(answers), applicant.id);
    // امتیازدهی بلافاصله (نتیجه فقط برای منابع انسانی ذخیره می‌شود)
    const result = mbtiEngine.score(answers, questions);
    db.prepare("UPDATE applicants SET mbti_type = ?, mbti_scores = ?, updated_at = datetime('now') WHERE id = ?")
      .run(result.typeCode, JSON.stringify({ counts: result.counts, dimensions: result.dimensions }), applicant.id);
    return res.redirect('/apply/wizard/' + nextStep('mbti'));
  }

  if (stepKey === 'review') {
    return res.redirect('/apply/wizard/review');
  }

  // سایر مراحل
  const existing = helpers.parseJson(applicant.data, {});
  let data = collectStepData(stepKey, req.body, existing);

  // آپلود عکس
  if (req.file) {
    const rel = '/uploads/photos/' + path.basename(req.file.path);
    db.prepare('UPDATE applicants SET photo_path = ? WHERE id = ?').run(rel, applicant.id);
    data.photo = rel;
  }

  const errors = validateStep(stepKey, data);
  if (errors.length) {
    const fields = loadFields().filter(f => f.visible && f.step_key === stepKey);
    return res.render('modules/recruitment/apply-wizard', {
      title: 'فرم استخدام', layout: false,
      applicant, step: loadSteps().find(s => s.key === stepKey) || { key: stepKey, title: stepKey, description: '' },
      steps: loadSteps().filter(s => s.enabled),
      fields, data, questions: [], answers: [],
      stepOrder: STEP_ORDER, nextStep: nextStep(stepKey), prevStep: prevStep(stepKey),
      repeaterCols: seedData.REPEATER_COLUMNS,
      company: helpers.getSetting('company_name'),
      error: errors[0].message,
      errors
    });
  }

  // بروزرسانی ستون‌های کلیدی برای جستجو
  const upd = db.prepare(`UPDATE applicants SET data = ?, first_name = ?, last_name = ?, national_id = ?,
    birth_date = ?, email = ?, gender = ?, step = ?, updated_at = datetime('now') WHERE id = ?`);
  upd.run(JSON.stringify(data),
    cleanText(data.first_name, 50), cleanText(data.last_name, 80), cleanText(data.national_id, 15),
    cleanText(data.birth_date, 15), cleanText(data.email, 100), cleanText(data.gender, 10),
    nextStep(stepKey), applicant.id);

  res.redirect('/apply/wizard/' + nextStep(stepKey));
});

router.post('/apply/submit', (req, res) => {
  const applicant = getCandidate(req);
  if (!applicant) return res.redirect('/apply');
  const data = helpers.parseJson(applicant.data, {});

  // اعتبارسنجی نهایی همه مراحل
  const steps = loadSteps().filter(s => s.enabled && s.key !== 'review' && s.key !== 'mbti');
  for (const s of steps) {
    const errors = validateStep(s.key, data);
    if (errors.length) return res.redirect('/apply/wizard/' + s.key);
  }
  if (moduleSystem.isEnabled('mbti') && !applicant.mbti_type) {
    return res.redirect('/apply/wizard/mbti');
  }
  // تاییدیه صحت اطلاعات (از فرم مرور نهایی)
  const consentOk = req.body.consent === 'on' || req.body.consent === '1' || req.body.consent === 'true' || data.consent === true;
  if (!consentOk) {
    return res.redirect('/apply/wizard/review');
  }
  data.consent = true;
  db.prepare('UPDATE applicants SET data = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(JSON.stringify(data), applicant.id);

  db.prepare(`UPDATE applicants SET status = 'submitted', consent_at = datetime('now'),
    submitted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(applicant.id);
  db.prepare('INSERT INTO applicant_events (applicant_id, event, detail) VALUES (?,?,?)')
    .run(applicant.id, 'submitted', 'ارسال نهایی فرم استخدام');

  // اعلان به منابع انسانی
  const hrUsers = helpers.usersWithPermission('applicants.view');
  helpers.notify(hrUsers,
    'درخواست استخدام جدید',
    `${data.first_name || ''} ${data.last_name || ''} — ${applicant.tracking_code}`,
    '/hr/applicants/' + applicant.id
  );
  audit.log(req, 'applicant.submit', 'applicant', applicant.id, { tracking: applicant.tracking_code });

  req.session.candidateApplicantId = null;
  req.session.lastTracking = applicant.tracking_code;
  res.redirect('/apply/done');
});

router.get('/apply/done', (req, res) => {
  const tracking = req.session.lastTracking || '';
  res.render('modules/recruitment/apply-done', {
    title: 'ثبت موفق', layout: false,
    tracking, company: helpers.getSetting('company_name')
  });
});

/** وضعیت پرونده متقاضی (پس از تایید مجدد موبایل) */
router.get('/apply/status', (req, res) => {
  const phone = req.session.candidatePhone;
  if (!phone) return res.redirect('/apply');
  const rows = db.prepare('SELECT * FROM applicants WHERE phone = ? ORDER BY id DESC').all(phone);
  res.render('modules/recruitment/apply-status', {
    title: 'وضعیت درخواست‌ها', layout: false,
    rows, company: helpers.getSetting('company_name'),
    statuses: seedData.APPLICANT_STATUSES
  });
});

/** فرم چاپی پرونده (A4) */
router.get('/hr/applicants/:id/print', requirePerm('applicants.export'), (req, res) => {
  const applicant = db.prepare(`
    SELECT a.*, p.title AS position_title FROM applicants a
    LEFT JOIN positions p ON p.id = a.position_id WHERE a.id = ?
  `).get(req.params.id);
  if (!applicant) return res.status(404).render('pages/error', { title: 'یافت نشد', status: 404, message: 'متقاضی یافت نشد' });
  const fields = loadFields();
  const data = helpers.parseJson(applicant.data, {});
  res.render('modules/recruitment/applicant-print', {
    title: 'چاپ پرونده', layout: false,
    applicant, fields, data,
    repeaterCols: seedData.REPEATER_COLUMNS,
    company: helpers.getSetting('company_name'),
    statuses: seedData.APPLICANT_STATUSES
  });
});

module.exports = router;
