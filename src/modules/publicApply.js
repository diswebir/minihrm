// ═══════════════════════════════════════════════════════════
//  Public Apply Module - Candidate-facing Recruitment Flow
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../database/connection');
const { sendOTP, verifyOTP } = require('../services/sms');
const { validateQR } = require('../services/qr');

// File upload for candidate resumes
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', '..', 'uploads', 'resumes');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `resume-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Landing page - with or without QR code (hex pattern to avoid catching route names)
router.get('/:qrCode([a-f0-9]{32})?', (req, res) => {
  const db = getDb();

  // Check if registration is enabled
  const regSetting = db.prepare("SELECT setting_value FROM settings WHERE setting_key = 'registration_enabled'").get();
  if (regSetting && regSetting.setting_value === '0') {
    return res.render('candidates/closed', {
      title: 'ثبت‌نام بسته است',
      layout: 'layouts/candidate'
    });
  }

  let position = null;
  let qrCode = null;

  if (req.params.qrCode) {
    qrCode = validateQR(req.params.qrCode);
    if (qrCode && qrCode.job_position_id) {
      position = db.prepare('SELECT * FROM job_positions WHERE id = ? AND is_active = 1').get(qrCode.job_position_id);
    }
  }

  // Get all active positions for selection
  const positions = db.prepare(`
    SELECT jp.*, d.name as department_name
    FROM job_positions jp
    LEFT JOIN departments d ON jp.department_id = d.id
    WHERE jp.is_active = 1
    ORDER BY jp.created_at DESC
  `).all();

  // Get company name
  const companyName = db.prepare("SELECT setting_value FROM settings WHERE setting_key = 'company_name'").get();

  res.render('candidates/landing', {
    title: 'فرم استخدام',
    layout: 'layouts/candidate',
    position,
    positions,
    qrCode,
    companyName: companyName?.setting_value || 'شرکت',
    step: 'landing'
  });
});

// Step 1: Phone & OTP
router.post('/verify-phone', async (req, res) => {
  const { phone, job_position_id, qr_code } = req.body;

  if (!phone) {
    req.flash('error', 'شماره موبایل الزامی است');
    return res.redirect(`/apply/${qr_code || ''}`);
  }

  // Normalize phone
  let normalizedPhone = phone.replace(/\D/g, '');
  if (normalizedPhone.startsWith('0')) {
    normalizedPhone = '+98' + normalizedPhone.substring(1);
  } else if (!normalizedPhone.startsWith('+')) {
    normalizedPhone = '+98' + normalizedPhone;
  }

  // Validate Iranian mobile
  if (!/^\+989\d{9}$/.test(normalizedPhone)) {
    req.flash('error', 'شماره موبایل معتبر نیست');
    return res.redirect(`/apply/${qr_code || ''}`);
  }

  try {
    const result = await sendOTP(normalizedPhone);

    if (result.success) {
      req.session.candidatePhone = normalizedPhone;
      req.session.candidatePosition = job_position_id || null;
      req.session.candidateQR = qr_code || null;

      if (result.devMode) {
        req.flash('info', `کد تأیید (حالت توسعه): ${result.code}`);
      }

      return res.render('candidates/otp-verify', {
        title: 'تأیید شماره موبایل',
        layout: 'layouts/candidate',
        phone: normalizedPhone,
        step: 'otp'
      });
    } else {
      req.flash('error', result.error || 'خطا در ارسال کد تأیید');
      return res.redirect(`/apply/${qr_code || ''}`);
    }
  } catch (error) {
    console.error('OTP send error:', error);
    req.flash('error', 'خطا در ارسال کد تأیید');
    return res.redirect(`/apply/${qr_code || ''}`);
  }
});

// Step 2: Verify OTP
router.post('/verify-otp', (req, res) => {
  const { otp } = req.body;
  const phone = req.session.candidatePhone;

  if (!phone) {
    req.flash('error', 'لطفاً ابتدا شماره موبایل خود را وارد کنید');
    return res.redirect('/apply');
  }

  if (!otp) {
    req.flash('error', 'کد تأیید الزامی است');
    return res.render('candidates/otp-verify', {
      title: 'تأیید شماره موبایل',
      layout: 'layouts/candidate',
      phone,
      step: 'otp'
    });
  }

  const result = verifyOTP(phone, otp);

  if (!result.success) {
    req.flash('error', result.message);
    return res.render('candidates/otp-verify', {
      title: 'تأیید شماره موبایل',
      layout: 'layouts/candidate',
      phone,
      step: 'otp'
    });
  }

  // OTP verified - create or get candidate
  const db = getDb();
  let candidate = db.prepare('SELECT * FROM candidates WHERE phone = ?').get(phone);

  if (!candidate) {
    // Create new candidate
    const templateId = db.prepare("SELECT setting_value FROM settings WHERE setting_key = 'default_form_template'").get();

    db.prepare(`
      INSERT INTO candidates (phone, otp_verified, job_position_id, form_template_id, status, qr_scan_date, source)
      VALUES (?, 1, ?, ?, 'form_started', datetime('now'), ?)
    `).run(phone, req.session.candidatePosition || null, templateId?.setting_value || 1, req.session.candidateQR ? 'qr' : 'direct');

    candidate = db.prepare('SELECT * FROM candidates WHERE phone = ?').get(phone);
  } else {
    // Update existing candidate
    db.prepare("UPDATE candidates SET otp_verified = 1, updated_at = datetime('now') WHERE id = ?").run(candidate.id);

    if (!candidate.job_position_id && req.session.candidatePosition) {
      db.prepare('UPDATE candidates SET job_position_id = ? WHERE id = ?').run(req.session.candidatePosition, candidate.id);
    }
  }

  // Set candidate session
  req.session.candidate = {
    id: candidate.id,
    phone: phone
  };

  // Check if form is already completed
  if (candidate.form_completed) {
    // Check MBTI
    const mbtiEnabled = db.prepare("SELECT setting_value FROM settings WHERE setting_key = 'mbti_enabled'").get();
    if (mbtiEnabled?.setting_value === '1' && !candidate.mbti_completed) {
      return res.redirect('/apply/mbti');
    }
    return res.redirect('/apply/success');
  }

  return res.redirect('/apply/form');
});

// Step 3: Position selection (if not from QR)
router.get('/select-position', (req, res) => {
  if (!req.session.candidate) {
    return res.redirect('/apply');
  }

  const db = getDb();
  const positions = db.prepare(`
    SELECT jp.*, d.name as department_name
    FROM job_positions jp
    LEFT JOIN departments d ON jp.department_id = d.id
    WHERE jp.is_active = 1
    ORDER BY jp.created_at DESC
  `).all();

  res.render('candidates/select-position', {
    title: 'انتخاب موقعیت شغلی',
    layout: 'layouts/candidate',
    positions,
    step: 'position'
  });
});

// Select position
router.post('/select-position', (req, res) => {
  if (!req.session.candidate) {
    return res.redirect('/apply');
  }

  const { position_id } = req.body;
  const db = getDb();

  if (position_id) {
    db.prepare('UPDATE candidates SET job_position_id = ? WHERE id = ?')
      .run(position_id, req.session.candidate.id);
  }

  return res.redirect('/apply/form');
});

// Step 4: Multi-step form
router.get('/form', (req, res) => {
  if (!req.session.candidate) {
    return res.redirect('/apply');
  }

  const db = getDb();
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.session.candidate.id);

  if (!candidate) {
    req.session.candidate = null;
    return res.redirect('/apply');
  }

  // Get form template
  const templateId = candidate.form_template_id || 1;
  const template = db.prepare('SELECT * FROM form_templates WHERE id = ?').get(templateId);

  if (!template) {
    req.flash('error', 'فرم استخدام یافت نشد');
    return res.redirect('/apply');
  }

  // Get fields for current step
  const currentStep = candidate.form_step || 1;
  const fields = db.prepare(`
    SELECT * FROM form_fields WHERE template_id = ? AND step_number = ? ORDER BY order_num
  `).all(templateId, currentStep);

  // Get existing responses
  const existingResponses = db.prepare(`
    SELECT * FROM candidate_responses WHERE candidate_id = ?
  `).all(candidate.id);

  const responseMap = {};
  for (const r of existingResponses) {
    responseMap[r.field_key] = r.field_value;
  }

  // Update status if needed
  if (candidate.status === 'new') {
    db.prepare("UPDATE candidates SET status = 'form_started' WHERE id = ?").run(candidate.id);
  }

  const position = candidate.job_position_id ?
    db.prepare('SELECT title FROM job_positions WHERE id = ?').get(candidate.job_position_id) : null;

  res.render('candidates/form-wizard', {
    title: 'فرم استخدام',
    layout: 'layouts/candidate',
    candidate,
    template,
    fields,
    currentStep,
    totalSteps: template.total_steps,
    responseMap,
    position,
    step: 'form'
  });
});

// Submit form step
router.post('/form/submit', upload.single('resume_file'), (req, res) => {
  if (!req.session.candidate) {
    return res.redirect('/apply');
  }

  const db = getDb();
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.session.candidate.id);
  const templateId = candidate.form_template_id || 1;
  const template = db.prepare('SELECT * FROM form_templates WHERE id = ?').get(templateId);

  if (!candidate || !template) {
    return res.redirect('/apply');
  }

  const { step, action } = req.body;
  const currentStep = parseInt(step) || candidate.form_step || 1;

  // Save responses for this step
  const fields = db.prepare('SELECT * FROM form_fields WHERE template_id = ? AND step_number = ?').all(templateId, currentStep);

  const upsertResponse = db.prepare(`
    INSERT INTO candidate_responses (candidate_id, field_key, field_value, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(candidate_id, field_key) DO UPDATE SET field_value = ?, updated_at = datetime('now')
  `);

  const saveResponses = db.transaction(() => {
    for (const field of fields) {
      let value = req.body[field.field_key] || '';

      // Handle file uploads
      if (field.field_type === 'file' && req.file) {
        value = req.file.filename;
      }

      // Save name fields to candidate table too
      if (field.field_key === 'first_name') {
        db.prepare("UPDATE candidates SET first_name = ? WHERE id = ?").run(value, candidate.id);
      }
      if (field.field_key === 'last_name') {
        db.prepare("UPDATE candidates SET last_name = ? WHERE id = ?").run(value, candidate.id);
      }
      if (field.field_key === 'email') {
        db.prepare("UPDATE candidates SET email = ? WHERE id = ?").run(value, candidate.id);
      }
      if (field.field_key === 'national_code') {
        db.prepare("UPDATE candidates SET national_code = ? WHERE id = ?").run(value, candidate.id);
      }

      upsertResponse.run(candidate.id, field.field_key, value, value);
    }
  });

  saveResponses();

  // Determine next step
  if (action === 'next' && currentStep < template.total_steps) {
    db.prepare('UPDATE candidates SET form_step = ? WHERE id = ?').run(currentStep + 1, candidate.id);
    return res.redirect('/apply/form');
  } else if (action === 'prev' && currentStep > 1) {
    db.prepare('UPDATE candidates SET form_step = ? WHERE id = ?').run(currentStep - 1, candidate.id);
    return res.redirect('/apply/form');
  } else {
    // Form completed
    db.prepare("UPDATE candidates SET form_completed = 1, form_step = ?, status = 'form_completed', updated_at = datetime('now') WHERE id = ?")
      .run(currentStep, candidate.id);

    // Check if MBTI is enabled
    const mbtiEnabled = db.prepare("SELECT setting_value FROM settings WHERE setting_key = 'mbti_enabled'").get();
    if (mbtiEnabled?.setting_value === '1') {
      return res.redirect('/apply/mbti');
    }

    return res.redirect('/apply/success');
  }
});

// Step 5: MBTI Test
router.get('/mbti', (req, res) => {
  if (!req.session.candidate) {
    return res.redirect('/apply');
  }

  const db = getDb();
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.session.candidate.id);

  if (candidate.mbti_completed) {
    return res.redirect('/apply/success');
  }

  const questions = db.prepare('SELECT * FROM mbti_questions WHERE is_active = 1 ORDER BY question_number').all();

  // Get existing responses
  const existingResponses = db.prepare('SELECT * FROM mbti_responses WHERE candidate_id = ?').all(candidate.id);
  const responseMap = {};
  for (const r of existingResponses) {
    responseMap[r.question_id] = r.selected_option;
  }

  res.render('candidates/mbti-test', {
    title: 'آزمون شخصیت‌شناسی',
    layout: 'layouts/candidate',
    candidate,
    questions,
    responseMap,
    step: 'mbti'
  });
});

// Submit MBTI
router.post('/mbti/submit', (req, res) => {
  if (!req.session.candidate) {
    return res.redirect('/apply');
  }

  const db = getDb();
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.session.candidate.id);
  const questions = db.prepare('SELECT * FROM mbti_questions WHERE is_active = 1').all();

  const upsertResponse = db.prepare(`
    INSERT INTO mbti_responses (candidate_id, question_id, selected_option)
    VALUES (?, ?, ?)
    ON CONFLICT(candidate_id, question_id) DO UPDATE SET selected_option = ?
  `);

  const scores = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };

  const saveResponses = db.transaction(() => {
    for (const q of questions) {
      const answer = req.body[`q_${q.id}`];
      if (answer) {
        upsertResponse.run(candidate.id, q.id, answer, answer);

        // Score
        if (answer === 'A') {
          scores[q.option_a_value]++;
        } else {
          scores[q.option_b_value]++;
        }
      }
    }
  });

  saveResponses();

  // Calculate type
  const type =
    (scores.E >= scores.I ? 'E' : 'I') +
    (scores.S >= scores.N ? 'S' : 'N') +
    (scores.T >= scores.F ? 'T' : 'F') +
    (scores.J >= scores.P ? 'J' : 'P');

  // Generate analysis
  const typeDescriptions = {
    'INTJ': 'استراتژیست - فردی متفکر، تحلیلگر و با برنامه',
    'INTP': 'متفکر - فردی کنجکاو، نوآور و مستقل',
    'ENTJ': 'فرمانده - رهبری قاطع، استراتژیک و هدفمند',
    'ENTP': 'مناظره‌گر - فردی خلاق، کنجکاو و چالش‌گر',
    'INFJ': 'حامی - فردی آرمان‌گرا، همدل و با بصیرت',
    'INFP': 'میانجی - فردی ایده‌آل‌گرا، خلاق و وفادار',
    'ENFJ': 'قهرمان - رهبری کاریزماتیک، الهام‌بخش و مسئول',
    'ENFP': 'فعال - فردی مشتاق، خلاق و اجتماعی',
    'ISTJ': 'بازرس - فردی مسئول، قابل اعتماد و منظم',
    'ISFJ': 'مدافع - فردی فداکار، گرم و دقیق',
    'ESTJ': 'مدیر - فردی سازمان‌ده، قاطع و عمل‌گرا',
    'ESFJ': 'مراقب - فردی اجتماعی، مراقب و وفادار',
    'ISTP': 'ماهر - فردی عمل‌گرا، تحلیلگر و انعطاف‌پذیر',
    'ISFP': 'ماجراجو - فردی حساس، هنرمند و صلح‌جو',
    'ESTP': 'کارآفرین - فردی عمل‌گرا، پرانرژی و مستقیم',
    'ESFP': 'سرگرم‌کننده - فردی مشتاق، خودجوش و اجتماعی',
  };

  let analysis = `نوع شخصیت: ${type}\n`;
  analysis += `${typeDescriptions[type] || ''}\n\n`;
  analysis += `ابعاد:\n`;
  analysis += `برون‌گرایی(E):${scores.E} / درون‌گرایی(I):${scores.I}\n`;
  analysis += `حسی(S):${scores.S} / شهودی(N):${scores.N}\n`;
  analysis += `فکری(T):${scores.T} / احساسی(F):${scores.F}\n`;
  analysis += `قضاوتی(J):${scores.J} / ادراکی(P):${scores.P}\n`;

  // Save to candidate
  db.prepare(`
    UPDATE candidates SET mbti_completed = 1, mbti_type = ?, mbti_scores = ?, mbti_analysis = ?, status = 'mbti_completed', updated_at = datetime('now') WHERE id = ?
  `).run(type, JSON.stringify(scores), analysis, candidate.id);

  return res.redirect('/apply/assessments');
});

// ─── Assessment Selection Page ───────────────────────────
router.get('/assessments', (req, res) => {
  if (!req.session.candidate) {
    return res.redirect('/apply');
  }

  const db = getDb();
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.session.candidate.id);

  const tests = db.prepare('SELECT * FROM assessment_tests WHERE is_active = 1 ORDER BY id').all();

  // Get completed assessments
  const completed = db.prepare(`
    SELECT test_id, result_type FROM assessment_results WHERE candidate_id = ?
  `).all(candidate.id);
  const completedMap = {};
  for (const c of completed) {
    completedMap[c.test_id] = c.result_type;
  }

  res.render('candidates/assessments', {
    title: 'آزمون‌های استخدامی',
    layout: 'layouts/candidate',
    candidate,
    tests,
    completedMap,
    step: 'assessments'
  });
});

// ─── Take Assessment ─────────────────────────────────────
router.get('/assessment/:testSlug', (req, res) => {
  if (!req.session.candidate) {
    return res.redirect('/apply');
  }

  const db = getDb();
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.session.candidate.id);
  const test = db.prepare('SELECT * FROM assessment_tests WHERE slug = ? AND is_active = 1').get(req.params.testSlug);

  if (!test) {
    req.flash('error', 'آزمون یافت نشد');
    return res.redirect('/apply/assessments');
  }

  // Check if already completed
  const existing = db.prepare('SELECT * FROM assessment_results WHERE candidate_id = ? AND test_id = ?').get(candidate.id, test.id);
  if (existing) {
    return res.redirect(`/apply/assessment/${test.slug}/result`);
  }

  const questions = db.prepare('SELECT * FROM assessment_questions WHERE test_id = ? AND is_active = 1 ORDER BY question_number').all(test.id);

  // Get existing responses
  const existingResponses = db.prepare('SELECT * FROM assessment_responses WHERE candidate_id = ? AND test_id = ?').all(candidate.id, test.id);
  const responseMap = {};
  for (const r of existingResponses) {
    responseMap[r.question_id] = r.selected_option;
  }

  res.render('candidates/assessment-test', {
    title: test.name,
    layout: 'layouts/candidate',
    candidate,
    test,
    questions,
    responseMap,
    step: 'assessment'
  });
});

// ─── Submit Assessment ───────────────────────────────────
router.post('/assessment/:testSlug/submit', (req, res) => {
  if (!req.session.candidate) {
    return res.redirect('/apply');
  }

  const db = getDb();
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.session.candidate.id);
  const test = db.prepare('SELECT * FROM assessment_tests WHERE slug = ? AND is_active = 1').get(req.params.testSlug);

  if (!test) {
    req.flash('error', 'آزمون یافت نشد');
    return res.redirect('/apply/assessments');
  }

  const questions = db.prepare('SELECT * FROM assessment_questions WHERE test_id = ? AND is_active = 1').all(test.id);

  // Save responses and calculate scores
  const scores = {};
  const upsertResponse = db.prepare(`
    INSERT INTO assessment_responses (candidate_id, test_id, question_id, selected_option, score)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(candidate_id, test_id, question_id) DO UPDATE SET selected_option = ?, score = ?
  `);

  const saveResponses = db.transaction(() => {
    for (const q of questions) {
      const answer = req.body[`q_${q.id}`];
      if (answer) {
        let score = 0;
        if (answer === 'A') {
          score = parseInt(q.option_a_value) || 1;
          // Track dimension scores
          if (q.option_a_value && isNaN(parseInt(q.option_a_value))) {
            const dim = q.option_a_value;
            scores[dim] = (scores[dim] || 0) + 1;
          } else {
            scores[q.dimension] = (scores[q.dimension] || 0) + score;
          }
        } else if (answer === 'B') {
          score = parseInt(q.option_b_value) || 1;
          if (q.option_b_value && isNaN(parseInt(q.option_b_value))) {
            const dim = q.option_b_value;
            scores[dim] = (scores[dim] || 0) + 1;
          } else {
            scores[q.dimension] = (scores[q.dimension] || 0) + score;
          }
        }
        upsertResponse.run(candidate.id, test.id, q.id, answer, score, answer, score);
      }
    }
  });

  saveResponses();

  // Analyze results
  const { analyzeDISC, analyzeBigFive, analyzeEQ, analyzeRIASEC } = require('../services/assessmentAnalysis');
  let result;

  switch (test.slug) {
    case 'disc':
      result = analyzeDISC(scores);
      break;
    case 'bigfive':
      result = analyzeBigFive(scores);
      break;
    case 'eq':
      result = analyzeEQ(scores);
      break;
    case 'riasec':
      result = analyzeRIASEC(scores);
      break;
    default:
      result = { type: 'N/A', scores, analysis: 'تحلیل موجود نیست', recommendations: '' };
  }

  // Save result
  db.prepare(`
    INSERT INTO assessment_results (candidate_id, test_id, result_type, scores, analysis, recommendations)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(candidate_id, test_id) DO UPDATE SET result_type=?, scores=?, analysis=?, recommendations=?
  `).run(candidate.id, test.id, result.type, JSON.stringify(result.scores), result.analysis, result.recommendations,
         result.type, JSON.stringify(result.scores), result.analysis, result.recommendations);

  return res.redirect(`/apply/assessment/${test.slug}/result`);
});

// ─── Assessment Result (Candidate view - limited) ────────
router.get('/assessment/:testSlug/result', (req, res) => {
  if (!req.session.candidate) {
    return res.redirect('/apply');
  }

  const db = getDb();
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.session.candidate.id);
  const test = db.prepare('SELECT * FROM assessment_tests WHERE slug = ?').get(req.params.testSlug);

  if (!test) {
    req.flash('error', 'آزمون یافت نشد');
    return res.redirect('/apply/assessments');
  }

  const result = db.prepare('SELECT * FROM assessment_results WHERE candidate_id = ? AND test_id = ?').get(candidate.id, test.id);

  if (!result) {
    return res.redirect(`/apply/assessment/${test.slug}`);
  }

  const scores = JSON.parse(result.scores || '{}');

  res.render('candidates/assessment-result', {
    title: `نتیجه ${test.name}`,
    layout: 'layouts/candidate',
    candidate,
    test,
    result,
    scores,
    step: 'assessment'
  });
});

// Success page
router.get('/success', (req, res) => {
  if (!req.session.candidate) {
    return res.redirect('/apply');
  }

  const db = getDb();
  const candidate = db.prepare(`
    SELECT c.*, jp.title as position_title
    FROM candidates c
    LEFT JOIN job_positions jp ON c.job_position_id = jp.id
    WHERE c.id = ?
  `).get(req.session.candidate.id);

  res.render('candidates/success', {
    title: 'ثبت‌نام موفق',
    layout: 'layouts/candidate',
    candidate,
    step: 'success'
  });
});

module.exports = router;