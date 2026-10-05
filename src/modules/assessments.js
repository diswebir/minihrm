// ═══════════════════════════════════════════════════════════
//  Assessment Module - Professional Hiring Tests
//  DISC, Big Five (OCEAN), EQ, RIASEC, MBTI
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { getDb } = require('../database/connection');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { moduleGuard } = require('../middleware/moduleGuard');

// ─── Admin/HR Routes ────────────────────────────────────
router.use('/results', isAuthenticated);
router.use('/results', moduleGuard('mbti'));

// Assessment results overview
router.get('/results', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();

  const tests = db.prepare('SELECT * FROM assessment_tests WHERE is_active = 1 ORDER BY id').all();
  const results = db.prepare(`
    SELECT ar.*, at.name as test_name, at.slug as test_slug,
           c.first_name, c.last_name, c.phone,
           jp.title as position_title
    FROM assessment_results ar
    JOIN assessment_tests at ON ar.test_id = at.id
    JOIN candidates c ON ar.candidate_id = c.id
    LEFT JOIN job_positions jp ON c.job_position_id = jp.id
    ORDER BY ar.completed_at DESC
  `).all();

  // Stats per test
  const testStats = {};
  for (const test of tests) {
    testStats[test.slug] = db.prepare(`
      SELECT COUNT(*) as count FROM assessment_results WHERE test_id = ?
    `).get(test.id).count;
  }

  res.render('assessments/index', {
    title: 'آزمون‌های استخدامی',
    tests,
    results,
    testStats
  });
});

// View individual result
router.get('/results/:candidateId/:testSlug', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();

  const test = db.prepare('SELECT * FROM assessment_tests WHERE slug = ?').get(req.params.testSlug);
  if (!test) {
    req.flash('error', 'آزمون یافت نشد');
    return res.redirect('/assessments/results');
  }

  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.candidateId);
  if (!candidate) {
    req.flash('error', 'متقاضی یافت نشد');
    return res.redirect('/assessments/results');
  }

  const result = db.prepare('SELECT * FROM assessment_results WHERE candidate_id = ? AND test_id = ?').get(candidate.id, test.id);
  if (!result) {
    req.flash('warning', 'این متقاضی هنوز این آزمون را انجام نداده');
    return res.redirect('/assessments/results');
  }

  const responses = db.prepare(`
    SELECT ar.*, aq.question_text, aq.dimension, aq.option_a_text, aq.option_b_text
    FROM assessment_responses ar
    JOIN assessment_questions aq ON ar.question_id = aq.id
    WHERE ar.candidate_id = ? AND ar.test_id = ?
    ORDER BY aq.question_number
  `).all(candidate.id, test.id);

  const scores = JSON.parse(result.scores || '{}');

  res.render('assessments/result', {
    title: `نتیجه ${test.name} - ${candidate.first_name} ${candidate.last_name}`,
    test,
    candidate,
    result,
    responses,
    scores
  });
});

// View candidate's all assessments
router.get('/candidate/:candidateId', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();

  const candidate = db.prepare(`
    SELECT c.*, jp.title as position_title
    FROM candidates c LEFT JOIN job_positions jp ON c.job_position_id = jp.id
    WHERE c.id = ?
  `).get(req.params.candidateId);

  if (!candidate) {
    req.flash('error', 'متقاضی یافت نشد');
    return res.redirect('/assessments/results');
  }

  const results = db.prepare(`
    SELECT ar.*, at.name as test_name, at.slug as test_slug
    FROM assessment_results ar
    JOIN assessment_tests at ON ar.test_id = at.id
    WHERE ar.candidate_id = ?
    ORDER BY ar.completed_at
  `).all(candidate.id);

  const tests = db.prepare('SELECT * FROM assessment_tests WHERE is_active = 1').all();

  res.render('assessments/candidate-assessments', {
    title: `آزمون‌های ${candidate.first_name} ${candidate.last_name}`,
    candidate,
    results,
    tests
  });
});

module.exports = router;