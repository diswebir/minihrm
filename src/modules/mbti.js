// ═══════════════════════════════════════════════════════════
//  MBTI Module - Myers-Briggs Type Indicator Test
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { getDb } = require('../database/connection');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { moduleGuard } = require('../middleware/moduleGuard');

router.use(isAuthenticated);
router.use(moduleGuard('mbti'));

// MBTI Results overview
router.get('/', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();

  const results = db.prepare(`
    SELECT c.id, c.first_name, c.last_name, c.phone, c.mbti_type, c.mbti_scores,
           c.mbti_completed, c.status, jp.title as position_title
    FROM candidates c
    LEFT JOIN job_positions jp ON c.job_position_id = jp.id
    WHERE c.mbti_completed = 1
    ORDER BY c.updated_at DESC
  `).all();

  // Type distribution
  const typeDistribution = db.prepare(`
    SELECT mbti_type, COUNT(*) as count
    FROM candidates
    WHERE mbti_completed = 1 AND mbti_type != ''
    GROUP BY mbti_type
    ORDER BY count DESC
  `).all();

  res.render('mbti/index', {
    title: 'آزمون MBTI',
    results,
    typeDistribution
  });
});

// View individual MBTI result
router.get('/result/:candidateId', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();

  const candidate = db.prepare(`
    SELECT c.*, jp.title as position_title
    FROM candidates c
    LEFT JOIN job_positions jp ON c.job_position_id = jp.id
    WHERE c.id = ?
  `).get(req.params.candidateId);

  if (!candidate) {
    req.flash('error', 'متقاضی یافت نشد');
    return res.redirect('/mbti');
  }

  if (!candidate.mbti_completed) {
    req.flash('warning', 'این متقاضی هنوز آزمون MBTI را تکمیل نکرده است');
    return res.redirect('/mbti');
  }

  // Get detailed responses
  const responses = db.prepare(`
    SELECT mr.*, mq.question_text, mq.dimension, mq.option_a_text, mq.option_b_text
    FROM mbti_responses mr
    JOIN mbti_questions mq ON mr.question_id = mq.id
    WHERE mr.candidate_id = ?
    ORDER BY mq.question_number
  `).all(req.params.candidateId);

  const scores = JSON.parse(candidate.mbti_scores || '{}');

  res.render('mbti/result', {
    title: `نتیجه MBTI - ${candidate.first_name} ${candidate.last_name}`,
    candidate,
    responses,
    scores,
    analysis: candidate.mbti_analysis
  });
});

// MBTI Analysis Engine
function analyzeMBTI(responses) {
  const scores = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };

  for (const r of responses) {
    if (r.selected_option === 'A') {
      scores[r.option_a_value]++;
    } else {
      scores[r.option_b_value]++;
    }
  }

  const type =
    (scores.E >= scores.I ? 'E' : 'I') +
    (scores.S >= scores.N ? 'S' : 'N') +
    (scores.T >= scores.F ? 'T' : 'F') +
    (scores.J >= scores.P ? 'J' : 'P');

  const percentages = {
    EI: { dimension: 'EI', left: scores.E, right: scores.I, total: scores.E + scores.I },
    SN: { dimension: 'SN', left: scores.S, right: scores.N, total: scores.S + scores.N },
    TF: { dimension: 'TF', left: scores.T, right: scores.F, total: scores.T + scores.F },
    JP: { dimension: 'JP', left: scores.J, right: scores.P, total: scores.J + scores.P },
  };

  // Generate analysis text
  const analysis = generateAnalysis(type, percentages);

  return { type, scores, percentages, analysis };
}

function generateAnalysis(type, percentages) {
  const typeDescriptions = {
    'INTJ': 'استراتژیست - فردی متفکر، تحلیلگر و با برنامه. قابلیت تبدیل ایده‌ها به برنامه‌های عملی را دارد.',
    'INTP': 'متفکر - فردی کنجکاو، نوآور و مستقل. در تحلیل مسائل پیچیده مهارت دارد.',
    'ENTJ': 'فرمانده - رهبری قاطع، استراتژیک و هدفمند. در هدایت تیم‌ها موفق است.',
    'ENTP': 'مناظره‌گر - فردی خلاق، کنجکاو و چالش‌گر. در حل مسائل خلاقانه مهارت دارد.',
    'INFJ': 'حامی - فردی آرمان‌گرا، همدل و با بصیرت. در درک دیگران قوی است.',
    'INFP': 'میانجی - فردی ایده‌آل‌گرا، خلاق و وفادار. ارزش‌های شخصی قوی دارد.',
    'ENFJ': 'قهرمان - رهبری کاریزماتیک، الهام‌بخش و مسئول. در انگیزه‌دهی به دیگران ماهر است.',
    'ENFP': 'فعال - فردی مشتاق، خلاق و اجتماعی. در ایجاد ارتباطات موفق است.',
    'ISTJ': 'بازرس - فردی مسئول، قابل اعتماد و منظم. در اجرای دقیق وظایف موفق است.',
    'ISFJ': 'مدافع - فردی فداکار، گرم و دقیق. در حمایت از دیگران قوی است.',
    'ESTJ': 'مدیر - فردی سازمان‌ده، قاطع و عمل‌گرا. در مدیریت عملیات موفق است.',
    'ESFJ': 'مراقب - فردی اجتماعی، مراقب و وفادار. در ایجاد محیط هماهنگ مهارت دارد.',
    'ISTP': 'virtuoso - فردی عمل‌گرا، تحلیلگر و انعطاف‌پذیر. در حل مشکلات فوری ماهر است.',
    'ISFP': 'ماجراجو - فردی حساس، هنرمند و صلح‌جو. در کارهای خلاقانه موفق است.',
    'ESTP': 'کارآفرین - فردی عمل‌گرا، پرانرژی و مستقیم. در محیط‌های پویا موفق است.',
    'ESFP': 'سرگرم‌کننده - فردی مشتاق، خودجوش و اجتماعی. در ایجاد فضای مثبت مهارت دارد.',
  };

  let analysis = `نوع شخصیت: ${type}\n\n`;
  analysis += `${typeDescriptions[type] || 'نوع شخصیتی منحصر به فرد'}\n\n`;

  analysis += 'تحلیل ابعاد:\n';
  analysis += `- برون‌گرایی/درون‌گرایی: ${percentages.EI.left} به ${percentages.EI.right} (${percentages.EI.left >= percentages.EI.right ? 'برون‌گرا' : 'درون‌گرا'})\n`;
  analysis += `- حسی/شهودی: ${percentages.SN.left} به ${percentages.SN.right} (${percentages.SN.left >= percentages.SN.right ? 'حسی' : 'شهودی'})\n`;
  analysis += `- فکری/احساسی: ${percentages.TF.left} به ${percentages.TF.right} (${percentages.TF.left >= percentages.TF.right ? 'فکری' : 'احساسی'})\n`;
  analysis += `- قضاوتی/ادراکی: ${percentages.JP.left} به ${percentages.JP.right} (${percentages.JP.left >= percentages.JP.right ? 'قضاوتی' : 'ادراکی'})\n`;

  analysis += '\nپیشنهادات شغلی:\n';
  const jobSuggestions = {
    'I': ['کارهای تحقیقاتی', 'برنامه‌نویسی', 'نویسندگی', 'تحلیل داده'],
    'E': ['فروش', 'مدیریت تیم', 'بازاریابی', 'روابط عمومی'],
    'S': ['حسابداری', 'مدیریت پروژه', 'کنترل کیفیت', 'عملیات'],
    'N': ['طراحی', 'استراتژی', 'نوآوری', 'تحقیق و توسعه'],
    'T': ['مهندسی', 'تحلیل مالی', 'برنامه‌نویسی', 'مدیریت عملیات'],
    'F': ['منابع انسانی', 'آموزش', 'مشاوره', 'خدمات مشتری'],
    'J': ['مدیریت', 'برنامه‌ریزی', 'حسابرسی', 'مدیریت پروژه'],
    'P': ['خلاقیت', 'فروش', 'روابط عمومی', 'کارآفرینی'],
  };

  const suggestions = new Set();
  for (const letter of type) {
    (jobSuggestions[letter] || []).forEach(s => suggestions.add(s));
  }
  analysis += Array.from(suggestions).slice(0, 6).map(s => `- ${s}`).join('\n');

  return analysis;
}

// Export analyzeMBTI for use in publicApply module
router.analyzeMBTI = analyzeMBTI;

module.exports = router;