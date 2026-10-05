'use strict';
/** ماژول آزمون شخصیت MBTI — مدیریت سوالات و تحلیل حرفه‌ای */
const express = require('express');
const db = require('../../db');
const helpers = require('../../lib/helpers');
const permissions = require('../../lib/permissions');
const audit = require('../../lib/audit');
const { requirePerm } = require('../../lib/permissions');
const { cleanText } = require('../../lib/validate');
const mbtiEngine = require('../../lib/mbti');

const router = express.Router();

/** محافظت زمان اجرا: اگر ماژول غیرفعال شد، مسیرهای آن پاسخ ندهند */
router.use((req, res, next) => {
  const moduleSystem = require('../../lib/modules');
  if (!moduleSystem.isEnabled('mbti')) {
    return res.status(404).render('pages/error', {
      title: 'یافت نشد', status: 404,
      message: 'ماژول آزمون شخصیت غیرفعال است.'
    });
  }
  next();
});

/* ---- سوالات آزمون‌ها (قابل تنظیم توسط منابع انسانی — انتخاب آزمون) ---- */
const TEST_CODES = ['mbti', 'disc', 'eq', 'holland'];

function loadTestCtx(code) {
  const test = code === 'mbti'
    ? db.prepare("SELECT * FROM tests WHERE code = 'mbti'").get()
    : db.prepare('SELECT * FROM tests WHERE code = ?').get(code);
  return test || null;
}

router.get('/hr/mbti/questions', requirePerm('mbti.manage'), (req, res) => {
  const code = TEST_CODES.includes(String(req.query.test)) ? String(req.query.test) : 'mbti';
  const test = loadTestCtx(code);
  const allTests = db.prepare("SELECT code, title, short_title, required, enabled FROM tests ORDER BY sort").all();

  let questions = [];
  let dimensions = [];
  if (code === 'mbti') {
    questions = db.prepare('SELECT * FROM mbti_questions ORDER BY sort, number').all();
    dimensions = [
      { key: 'E', name: 'برون‌گرایی' }, { key: 'I', name: 'درون‌گرایی' },
      { key: 'S', name: 'حسی' }, { key: 'N', name: 'شهودی' },
      { key: 'T', name: 'منطقی' }, { key: 'F', name: 'احساسی' },
      { key: 'J', name: 'منظم' }, { key: 'P', name: 'منعطف' }
    ];
  } else {
    questions = db.prepare('SELECT * FROM test_questions WHERE test_code = ? ORDER BY sort, number').all(code);
    dimensions = helpers.parseJson((test && test.dimensions) || '[]', []);
  }

  res.render('modules/mbti/questions', {
    title: 'مدیریت سوالات آزمون‌ها', activeMenu: 'mbti-questions',
    test, code, questions, dimensions, allTests,
    types: code === 'mbti' ? db.prepare('SELECT code, title, nickname FROM mbti_types ORDER BY code').all() : [],
    saved: req.query.saved || null
  });
});

router.post('/hr/mbti/questions/save', requirePerm('mbti.manage'), (req, res) => {
  const code = TEST_CODES.includes(String(req.body.test)) ? String(req.body.test) : 'mbti';

  if (code === 'mbti') {
    const upd = db.prepare('UPDATE mbti_questions SET text = ?, option_a = ?, option_b = ?, trait_a = ?, trait_b = ?, enabled = ? WHERE id = ?');
    const questions = db.prepare('SELECT * FROM mbti_questions ORDER BY id').all();
    const validTraits = ['E', 'I', 'S', 'N', 'T', 'F', 'J', 'P'];
    for (const q of questions) {
      const text = req.body['text_' + q.id];
      const option_a = req.body['oa_' + q.id];
      const option_b = req.body['ob_' + q.id];
      const trait_a = (req.body['ta_' + q.id] || q.trait_a).toUpperCase();
      const trait_b = (req.body['tb_' + q.id] || q.trait_b).toUpperCase();
      const enabled = req.body['en_' + q.id] === 'on' ? 1 : 0;
      if (!validTraits.includes(trait_a) || !validTraits.includes(trait_b)) continue;
      upd.run(
        text ? text.trim().slice(0, 500) : q.text,
        option_a ? option_a.trim().slice(0, 300) : q.option_a,
        option_b ? option_b.trim().slice(0, 300) : q.option_b,
        trait_a, trait_b, enabled, q.id
      );
    }
    audit.log(req, 'mbti.questions_save', 'mbti', code, {});
    return res.redirect('/hr/mbti/questions?test=' + code + '&saved=1');
  }

  // آزمون‌های لیکرت (DISC / EQ / Holland): متن، بُعد، معکوس‌نمره، فعال
  const upd = db.prepare('UPDATE test_questions SET text = ?, dimension = ?, reverse = ?, enabled = ? WHERE id = ?');
  const questions = db.prepare('SELECT * FROM test_questions WHERE test_code = ? ORDER BY id').all(code);
  const validDims = helpers.parseJson((loadTestCtx(code) || {}).dimensions || '[]', []).map(d => d.key);
  for (const q of questions) {
    const text = req.body['text_' + q.id];
    const dim = (req.body['dim_' + q.id] || q.dimension).toUpperCase();
    const reverse = req.body['rev_' + q.id] === 'on' ? 1 : 0;
    const enabled = req.body['en_' + q.id] === 'on' ? 1 : 0;
    if (validDims.length && !validDims.includes(dim)) continue;
    upd.run(
      text ? text.trim().slice(0, 500) : q.text,
      dim, reverse, enabled, q.id
    );
  }
  audit.log(req, 'mbti.questions_save', 'mbti', code, {});
  res.redirect('/hr/mbti/questions?test=' + code + '&saved=1');
});

router.post('/hr/mbti/questions/add', requirePerm('mbti.manage'), (req, res) => {
  const code = TEST_CODES.includes(String(req.body.test)) ? String(req.body.test) : 'mbti';
  const text = cleanText(req.body.text, 500);
  if (!text) return res.status(400).json({ ok: false, message: 'متن سوال الزامی است' });

  if (code === 'mbti') {
    const ta = String(req.body.trait_a || 'E').toUpperCase();
    const tb = String(req.body.trait_b || 'I').toUpperCase();
    const validTraits = ['E', 'I', 'S', 'N', 'T', 'F', 'J', 'P'];
    if (!validTraits.includes(ta) || !validTraits.includes(tb) || ta === tb) {
      return res.status(400).json({ ok: false, message: 'صفات بُعد نامعتبر است' });
    }
    const num = db.prepare('SELECT COALESCE(MAX(number),0) n FROM mbti_questions').get().n + 1;
    const info = db.prepare('INSERT INTO mbti_questions (number, text, option_a, option_b, trait_a, trait_b, enabled, sort) VALUES (?,?,?,?,?,?  ,1,?)')
      .run(num, text, cleanText(req.body.option_a, 300) || 'گزینه الف', cleanText(req.body.option_b, 300) || 'گزینه ب', ta, tb, num);
    audit.log(req, 'mbti.question_add', 'mbti', code, { number: num });
    return res.json({ ok: true, message: 'سوال اضافه شد', id: info.lastInsertRowid, number: num });
  }

  const test = loadTestCtx(code);
  const validDims = helpers.parseJson((test && test.dimensions) || '[]', []).map(d => d.key);
  const dim = String(req.body.dimension || '').toUpperCase();
  if (!validDims.includes(dim)) return res.status(400).json({ ok: false, message: 'بُعد سوال نامعتبر است' });
  const num = db.prepare('SELECT COALESCE(MAX(number),0) n FROM test_questions WHERE test_code = ?').get(code).n + 1;
  const info = db.prepare('INSERT INTO test_questions (test_code, number, text, dimension, reverse, enabled, sort) VALUES (?,?,?,?,?,?,?)')
    .run(code, num, text, dim, req.body.reverse === 'on' || req.body.reverse === '1' ? 1 : 0, 1, num);
  audit.log(req, 'mbti.question_add', 'mbti', code, { number: num, dimension: dim });
  res.json({ ok: true, message: 'سوال اضافه شد', id: info.lastInsertRowid, number: num });
});

router.post('/hr/mbti/questions/:id/delete', requirePerm('mbti.manage'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const mq = db.prepare('SELECT id FROM mbti_questions WHERE id = ?').get(id);
  if (mq) {
    db.prepare('DELETE FROM mbti_questions WHERE id = ?').run(id);
    audit.log(req, 'mbti.question_delete', 'mbti', 'mbti', { id });
    return res.json({ ok: true, message: 'سوال حذف شد' });
  }
  const tq = db.prepare('SELECT id, test_code FROM test_questions WHERE id = ?').get(id);
  if (tq) {
    db.prepare('DELETE FROM test_questions WHERE id = ?').run(id);
    audit.log(req, 'mbti.question_delete', 'mbti', tq.test_code, { id });
    return res.json({ ok: true, message: 'سوال حذف شد' });
  }
  return res.status(404).json({ ok: false, message: 'یافت نشد' });
});

/** الزامی/پیشنهادی بودن آزمون برای فرم استخدام */
router.post('/hr/mbti/tests/:code/required', requirePerm('mbti.manage'), (req, res) => {
  const code = String(req.params.code);
  const test = loadTestCtx(code);
  if (!test) return res.status(404).json({ ok: false, message: 'آزمون یافت نشد' });
  const newState = test.required ? 0 : 1;
  db.prepare('UPDATE tests SET required = ? WHERE code = ?').run(newState, code);
  audit.log(req, 'mbti.test_required', 'mbti', code, { required: newState });
  res.json({ ok: true, required: newState, message: newState ? 'آزمون الزامی شد' : 'آزمون پیشنهادی (اختیاری) شد' });
});

router.post('/hr/mbti/questions/reset', requirePerm('mbti.manage'), (req, res) => {
  // بازگردانی سوالات به حالت پیش‌فرض (از فایل اصلی آزمون)
  const code = TEST_CODES.includes(String(req.body.test)) ? String(req.body.test) : 'mbti';

  if (code === 'mbti') {
    const data = require('../../seed-data');
    const upd = db.prepare('UPDATE mbti_questions SET text = ?, option_a = ?, option_b = ?, trait_a = ?, trait_b = ?, enabled = 1 WHERE number = ?');
    for (const q of data.MBTI_QUESTIONS) {
      upd.run(q.text, q.option_a, q.option_b, q.trait_a, q.trait_b, q.number);
    }
    audit.log(req, 'mbti.questions_reset', 'mbti', code, {});
    return res.redirect('/hr/mbti/questions?test=' + code + '&saved=reset');
  }

  const testData = require('../../test-data');
  const src = testData.TESTS.find(t => t.code === code);
  if (src) {
    db.prepare('DELETE FROM test_questions WHERE test_code = ?').run(code);
    const insTQ = db.prepare('INSERT INTO test_questions (test_code, number, text, dimension, reverse, enabled, sort) VALUES (?,?,?,?,?,1,?)');
    for (const q of src.questions) insTQ.run(code, q.number, q.text, q.dimension, q.reverse ? 1 : 0, q.number);
  }
  audit.log(req, 'mbti.questions_reset', 'mbti', code, {});
  res.redirect('/hr/mbti/questions?test=' + code + '&saved=reset');
});

/* ---- تحلیل کامل نتیجه (فقط منابع انسانی/مدیریت) ---- */
router.get('/hr/mbti/analysis/:applicantId', requirePerm('mbti.view'), (req, res) => {
  const applicant = db.prepare(`
    SELECT a.*, p.title AS position_title, p.department AS position_department
    FROM applicants a LEFT JOIN positions p ON p.id = a.position_id WHERE a.id = ?
  `).get(req.params.applicantId);
  if (!applicant) return res.status(404).render('pages/error', { title: 'یافت نشد', status: 404, message: 'متقاضی یافت نشد' });

  const questions = db.prepare('SELECT * FROM mbti_questions WHERE enabled = 1 ORDER BY sort').all();
  const answers = helpers.parseJson(applicant.mbti_answers, []);
  if (!answers.length || !applicant.mbti_type) {
    return res.status(400).render('pages/error', {
      title: 'بدون نتیجه', status: 400,
      message: 'این متقاضی هنوز آزمون شخصیت را تکمیل نکرده است.'
    });
  }

  const result = mbtiEngine.score(answers, questions);
  const typeRow = db.prepare('SELECT * FROM mbti_types WHERE code = ?').get(applicant.mbti_type) || null;
  if (typeRow) {
    for (const key of ['strengths', 'weaknesses', 'ideal_jobs', 'interview_tips', 'red_flags']) {
      typeRow[key + '_parsed'] = helpers.parseJson(typeRow[key], []);
    }
  }
  const fit = mbtiEngine.jobFitScore(applicant.mbti_type, (applicant.position_title || '') + ' ' + (applicant.position_department || ''));

  res.render('modules/mbti/analysis', {
    title: 'تحلیل شخصیت متقاضی', activeMenu: 'applicants',
    applicant, result, typeRow, fit,
    questions, answers
  });
});

/* ---- راهنمای تفسیر آزمون‌ها (مرجع — انتخاب آزمون) ---- */
router.get('/hr/mbti/types', requirePerm('mbti.view'), (req, res) => {
  const cards = [{
    code: 'mbti', title: 'آزمون شخصیت‌شناسی MBTI', icon: 'brain',
    description: 'راهنمای ۱۶ تیپ شخصیتی — توضیح کامل هر تیپ، نقاط قوت، سبک کاری و نکات مصاحبه',
    link: '/hr/mbti/types/mbti'
  }];
  const testData = require('../../test-data');
  for (const t of testData.TESTS) {
    cards.push({
      code: t.code, title: t.title, icon: t.icon || 'target',
      description: t.description,
      link: '/hr/mbti/types/' + t.code
    });
  }
  res.render('modules/mbti/guide-hub', {
    title: 'راهنمای تفسیر آزمون‌ها', activeMenu: 'mbti-types',
    cards
  });
});

router.get('/hr/mbti/types/:code', requirePerm('mbti.view'), (req, res) => {
  const raw = String(req.params.code);
  const testCodes = ['disc', 'eq', 'holland'];

  // راهنمای تفسیر آزمون‌های DISC / EQ / Holland
  if (testCodes.includes(raw.toLowerCase())) {
    const testData = require('../../test-data');
    const t = testData.TESTS.find(x => x.code === raw.toLowerCase());
    const row = db.prepare('SELECT * FROM tests WHERE code = ?').get(t.code);
    return res.render('modules/mbti/test-guide', {
      title: 'راهنمای تفسیر ' + t.short_title, activeMenu: 'mbti-types',
      guide: t.guide, test: Object.assign({}, t, row || {})
    });
  }

  // شبکه ۱۶ تیپ MBTI
  if (raw.toLowerCase() === 'mbti') {
    const types = db.prepare('SELECT code, title, nickname, group_title, one_liner FROM mbti_types ORDER BY code').all();
    return res.render('modules/mbti/types', {
      title: 'راهنمای ۱۶ تیپ شخصیتی MBTI', activeMenu: 'mbti-types',
      types
    });
  }

  // جزئیات یک تیپ MBTI
  const typeRow = db.prepare('SELECT * FROM mbti_types WHERE code = ?').get(raw.toUpperCase());
  if (!typeRow) return res.status(404).render('pages/error', { title: 'یافت نشد', status: 404, message: 'تیپ یافت نشد' });
  for (const key of ['strengths', 'weaknesses', 'ideal_jobs', 'interview_tips', 'red_flags']) {
    typeRow[key + '_parsed'] = helpers.parseJson(typeRow[key], []);
  }
  res.render('modules/mbti/type-detail', {
    title: 'تیپ ' + typeRow.code, activeMenu: 'mbti-types',
    typeRow
  });
});

/* ============================================================
   آزمون‌های روان‌شناختی — هاب و تحلیل حرفه‌ای (فقط منابع انسانی)
   ============================================================ */
const assessments = require('../../lib/assessments');

/** هاب آزمون‌ها: وضعیت تکمیل هر آزمون + دسترسی سریع */
router.get('/hr/tests', requirePerm('mbti.view'), (req, res) => {
  const total = db.prepare("SELECT COUNT(*) c FROM applicants WHERE status != 'draft'").get().c;
  const cards = [];

  // MBTI
  const mbtiDone = db.prepare("SELECT COUNT(*) c FROM applicants WHERE mbti_type != ''").get().c;
  cards.push({
    code: 'mbti', title: 'آزمون شخصیت‌شناسی MBTI', icon: 'brain',
    description: '۲۸ سوال اجباری، تحلیل ۱۶ تیپ شخصیتی با تحلیل ترکیبی و سازگاری شغلی',
    done: mbtiDone, total,
    link: '/hr/tests/mbti', analyzeLink: ''
  });

  // آزمون‌های جدید
  const tests = db.prepare("SELECT * FROM tests WHERE enabled = 1 AND code != 'mbti' ORDER BY sort").all();
  for (const t of tests) {
    const done = db.prepare('SELECT COUNT(*) c FROM test_results WHERE test_code = ?').get(t.code).c;
    cards.push({
      code: t.code, title: t.title, icon: t.icon || 'target',
      description: t.description,
      done, total,
      link: '/hr/tests/' + t.code, analyzeLink: ''
    });
  }

  res.render('modules/mbti/tests-hub', {
    title: 'آزمون‌های روان‌شناختی', activeMenu: 'tests',
    cards, total
  });
});

/** لیست نتایج هر آزمون */
router.get('/hr/tests/:code', requirePerm('mbti.view'), (req, res) => {
  const code = String(req.params.code);
  const rows = [];

  if (code === 'mbti') {
    const list = db.prepare(`
      SELECT a.id, a.first_name, a.last_name, a.tracking_code, a.mbti_type, a.mbti_scores, a.status,
             p.title AS position_title
      FROM applicants a LEFT JOIN positions p ON p.id = a.position_id
      WHERE a.mbti_type != '' ORDER BY a.updated_at DESC
    `).all();
    for (const r of list) {
      rows.push({
        applicant: r, label: r.mbti_type, percent: null, extra: '',
        link: '/hr/mbti/analysis/' + r.id
      });
    }
    return res.render('modules/mbti/tests-list', {
      title: 'نتایج آزمون MBTI', activeMenu: 'tests',
      test: { code: 'mbti', title: 'آزمون شخصیت‌شناسی MBTI', description: 'تیپ‌های شناسایی‌شده متقاضیان' },
      rows
    });
  }

  const test = db.prepare('SELECT * FROM tests WHERE code = ?').get(code);
  if (!test) return res.status(404).render('pages/error', { title: 'یافت نشد', status: 404, message: 'آزمون یافت نشد' });
  const list = db.prepare(`
    SELECT tr.*, a.first_name, a.last_name, a.tracking_code, a.status, p.title AS position_title
    FROM test_results tr
    JOIN applicants a ON a.id = tr.applicant_id
    LEFT JOIN positions p ON p.id = a.position_id
    WHERE tr.test_code = ? ORDER BY tr.completed_at DESC
  `).all(code);
  for (const r of list) {
    const summary = helpers.parseJson(r.summary, {});
    rows.push({
      applicant: r, label: summary.label || '', percent: summary.percent, extra: summary.extra || '',
      link: '/hr/tests/' + code + '/analysis/' + r.applicant_id
    });
  }
  res.render('modules/mbti/tests-list', {
    title: 'نتایج ' + test.title, activeMenu: 'tests',
    test, rows
  });
});

/** تحلیل حرفه‌ای نتیجه یک آزمون برای متقاضی */
router.get('/hr/tests/:code/analysis/:applicantId', requirePerm('mbti.view'), (req, res) => {
  const code = String(req.params.code);
  if (code === 'mbti') return res.redirect('/hr/mbti/analysis/' + req.params.applicantId);

  const test = db.prepare('SELECT * FROM tests WHERE code = ?').get(code);
  if (!test) return res.status(404).render('pages/error', { title: 'یافت نشد', status: 404, message: 'آزمون یافت نشد' });

  const applicant = db.prepare(`
    SELECT a.*, p.title AS position_title FROM applicants a
    LEFT JOIN positions p ON p.id = a.position_id WHERE a.id = ?
  `).get(req.params.applicantId);
  if (!applicant) return res.status(404).render('pages/error', { title: 'یافت نشد', status: 404, message: 'متقاضی یافت نشد' });

  const row = db.prepare('SELECT * FROM test_results WHERE applicant_id = ? AND test_code = ?').get(applicant.id, code);
  if (!row) {
    return res.status(400).render('pages/error', {
      title: 'بدون نتیجه', status: 400,
      message: 'این متقاضی هنوز این آزمون را تکمیل نکرده است.'
    });
  }

  const questions = db.prepare('SELECT * FROM test_questions WHERE test_code = ? AND enabled = 1 ORDER BY sort, number').all(code);
  const answers = helpers.parseJson(row.answers, []);
  const scored = assessments.score(answers, questions);
  const analysis = assessments.analyze(code, scored, questions, (applicant.position_title || ''));

  res.render('modules/mbti/test-analysis', {
    title: 'تحلیل ' + test.short_title + ' — ' + (applicant.first_name || '') + ' ' + (applicant.last_name || ''),
    activeMenu: 'tests',
    applicant, test, analysis, answeredAt: row.completed_at
  });
});

module.exports = router;
