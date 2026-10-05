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

/* ---- سوالات آزمون (قابل تنظیم توسط منابع انسانی) ---- */
router.get('/hr/mbti/questions', requirePerm('mbti.manage'), (req, res) => {
  const questions = db.prepare('SELECT * FROM mbti_questions ORDER BY sort, number').all();
  const types = db.prepare('SELECT code, title, nickname FROM mbti_types ORDER BY code').all();
  res.render('modules/mbti/questions', {
    title: 'سوالات آزمون شخصیت', activeMenu: 'mbti-questions',
    questions, types, saved: req.query.saved || null
  });
});

router.post('/hr/mbti/questions/save', requirePerm('mbti.manage'), (req, res) => {
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
  audit.log(req, 'mbti.questions_save', 'mbti', '', {});
  res.redirect('/hr/mbti/questions?saved=1');
});

router.post('/hr/mbti/questions/reset', requirePerm('mbti.manage'), (req, res) => {
  // بازگردانی سوالات به حالت پیش‌فرض (از فایل اصلی)
  const data = require('../../seed-data');
  const upd = db.prepare('UPDATE mbti_questions SET text = ?, option_a = ?, option_b = ?, trait_a = ?, trait_b = ?, enabled = 1 WHERE number = ?');
  for (const q of data.MBTI_QUESTIONS) {
    upd.run(q.text, q.option_a, q.option_b, q.trait_a, q.trait_b, q.number);
  }
  audit.log(req, 'mbti.questions_reset', 'mbti', '', {});
  res.redirect('/hr/mbti/questions?saved=reset');
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

/* ---- راهنمای تیپ‌ها (مرجع) ---- */
router.get('/hr/mbti/types', requirePerm('mbti.view'), (req, res) => {
  const types = db.prepare('SELECT code, title, nickname, group_title, one_liner FROM mbti_types ORDER BY code').all();
  res.render('modules/mbti/types', {
    title: 'راهنمای تیپ‌های شخصیتی', activeMenu: 'mbti-types',
    types
  });
});

router.get('/hr/mbti/types/:code', requirePerm('mbti.view'), (req, res) => {
  const typeRow = db.prepare('SELECT * FROM mbti_types WHERE code = ?').get(String(req.params.code).toUpperCase());
  if (!typeRow) return res.status(404).render('pages/error', { title: 'یافت نشد', status: 404, message: 'تیپ یافت نشد' });
  for (const key of ['strengths', 'weaknesses', 'ideal_jobs', 'interview_tips', 'red_flags']) {
    typeRow[key + '_parsed'] = helpers.parseJson(typeRow[key], []);
  }
  res.render('modules/mbti/type-detail', {
    title: 'تیپ ' + typeRow.code, activeMenu: 'mbti-types',
    typeRow
  });
});

module.exports = router;
