/**
 * موتور تحلیل آزمون شخصیت‌شناسی (MBTI)
 * ------------------------------------------------------------------
 * - نمره‌گذاری دقیق ۲۸ سؤال (مطابق ستون تحلیل فایل اصلی)
 * - تحلیل بُعدبه‌بُعد، تشخیص ابعاد مرزی، تعیین تیپ
 * - تحلیل تیپ در بستر محیط کار و منابع انسانی
 * - محاسبه «تناسب با موقعیت شغلی» بر پایه تیپ‌های مطلوب آگهی
 */
'use strict';

const seed = require('./seed/mbti');
const { PROFILES, GROUPS, DIMENSION_INSIGHTS, REPORT_GUIDELINES } = require('./seed/mbtiProfiles');
const utils = require('./utils');

/** سؤالات آزمون با اعمال ویرایش‌های مدیر */
function questions(app) {
  const overrides = app.db.col('mbti_questions').all();
  const map = Object.fromEntries(overrides.map((o) => [String(o.no), o]));
  return seed.QUESTIONS
    .filter((q) => {
      const ov = map[String(q.no)];
      return !ov || ov.active !== false;
    })
    .map((q) => {
      const ov = map[String(q.no)] || {};
      return Object.assign({}, q, {
        text: ov.text || q.text,
        options: q.options.map((o, i) => Object.assign({}, o, {
          label: (ov.options && ov.options[i] && ov.options[i].label) || o.label
        })),
        edited: !!(ov.text || ov.options)
      });
    });
}

/** همه سؤالات (شامل غیرفعال‌ها) برای صفحه مدیریت */
function allQuestions(app) {
  const overrides = app.db.col('mbti_questions').all();
  const map = Object.fromEntries(overrides.map((o) => [String(o.no), o]));
  return seed.QUESTIONS.map((q) => {
    const ov = map[String(q.no)] || {};
    return Object.assign({}, q, {
      text: ov.text || q.text,
      options: q.options.map((o, i) => Object.assign({}, o, {
        label: (ov.options && ov.options[i] && ov.options[i].label) || o.label
      })),
      active: ov.active !== false,
      edited: !!(ov.text || ov.options)
    });
  });
}

/** نمره‌گذاری خام */
function score(answers) {
  return seed.score(answers);
}

/**
 * تحلیل کامل یک نتیجه آزمون
 * @param {object} app
 * @param {object} answers نقشه شماره سؤال → پاسخ
 * @param {object|null} job موقعیت شغلی (برای تحلیل تناسب)
 */
function analyze(app, answers, job = null, options = {}) {
  const raw = score(answers);
  const qs = questions(app);
  const activeTotal = qs.length;

  // تحلیل ابعاد با متن تفسیری
  const dimensions = raw.dimensions.map((d) => {
    const winnerKey = d.winner || (d.aScore >= d.bScore ? d.a : d.b);
    const loserKey = winnerKey === d.a ? d.b : d.a;
    return Object.assign({}, d, {
      winnerKey,
      winnerLabel: seed.DIMENSIONS[winnerKey].short,
      winnerPole: seed.DIMENSIONS[winnerKey].pole,
      winnerColor: seed.DIMENSIONS[winnerKey].color,
      winnerIcon: seed.DIMENSIONS[winnerKey].icon,
      loserKey,
      loserLabel: seed.DIMENSIONS[loserKey].short,
      winnerInsight: DIMENSION_INSIGHTS[winnerKey],
      loserInsight: DIMENSION_INSIGHTS[loserKey],
      dominantPercent: Math.max(d.aPercent, d.bPercent),
      confidence: d.borderline ? 'کم' : d.strength === 'قوی' ? 'بالا' : 'متوسط',
      interpretation: buildDimensionInterpretation(d, winnerKey, loserKey)
    });
  });

  const profile = raw.type ? PROFILES[raw.type] : null;
  const group = profile ? GROUPS[profile.group] : null;

  const result = {
    type: raw.type,
    profileName: profile ? profile.name : '',
    profileTagline: profile ? profile.tagline : '',
    group: profile ? { key: group.key, name: group.name, color: group.color, description: group.description } : null,
    scores: raw.scores,
    dimensions,
    answered: raw.answered,
    total: activeTotal,
    complete: raw.answered >= activeTotal,
    completenessPercent: Math.round((raw.answered / activeTotal) * 100),
    borderline: raw.borderline,
    borderlineNote: raw.borderlineNote,
    perQuestion: raw.perQuestion,
    confidence: confidenceOf(raw),
    guideLines: REPORT_GUIDELINES,
    analyzedAt: new Date().toISOString()
  };

  if (profile) {
    result.analysis = buildProfileAnalysis(profile);
    result.roleSuggestions = profile.idealRoles;
    result.roleClusters = profile.roleClusters || [];
  }

  if (job) {
    result.jobFit = jobFit(result, job);
  }

  return result;
}

function confidenceOf(raw) {
  const borderline = raw.borderline.length;
  const answeredRatio = raw.answered / seed.TOTAL;
  if (answeredRatio < 0.8) return { level: 'پایین', color: 'rose', note: 'تعداد پاسخ‌ها کم است؛ نتیجه قابل اتکا نیست.' };
  if (borderline >= 3) return { level: 'پایین', color: 'rose', note: 'در سه بُعد یا بیشتر اختلاف امتیاز حداقلی است؛ تفسیر با احتیاط انجام شود.' };
  if (borderline === 2) return { level: 'متوسط', color: 'lemon', note: 'دو بُعد مرزی است؛ توصیه می‌شود در مصاحبه راستی‌آزمایی شود.' };
  if (borderline === 1) return { level: 'خوب', color: 'mint', note: 'تنها یک بُعد مرزی است؛ نتیجه نسبتاً قابل اتکاست.' };
  return { level: 'بالا', color: 'violet', note: 'همه ابعاد با اختلاف امتیاز قابل توجه مشخص شده‌اند.' };
}

function buildDimensionInterpretation(d, winnerKey, loserKey) {
  const w = seed.DIMENSIONS[winnerKey] || { short: winnerKey };
  const winnerInsight = DIMENSION_INSIGHTS[winnerKey] || {};
  const loserInsight = DIMENSION_INSIGHTS[loserKey] || {};
  if (!d.total) return 'برای این بُعد پاسخی ثبت نشده است.';
  if (d.borderline) {
    return `این بُعد مرزی است (${utils.faDigits(d.aScore)} در برابر ${utils.faDigits(d.bScore)})؛ فرد می‌تواند بسته به موقعیت، رفتار هر دو قطب را نشان دهد. در مصاحبه با مثال‌های واقعی بررسی شود.`;
  }
  const pct = Math.max(d.aPercent || 0, d.bPercent || 0);
  const inWork = winnerInsight.inWork ? ` ${winnerInsight.inWork}` : '';
  const watchOut = loserInsight.watchOut ? ` در مقابل، ${loserInsight.watchOut}` : '';
  return `تمایل غالب به سمت «${w.short}» است (${utils.faDigits(pct)}٪ پاسخ‌های این بُعد).${inWork}${watchOut}`;
}

function buildProfileAnalysis(profile) {
  return {
    code: profile.code,
    name: profile.name,
    group: profile.group,
    tagline: profile.tagline,
    summary: profile.summary,
    strengths: profile.strengths,
    weaknesses: profile.weaknesses,
    workStyle: profile.workStyle,
    communication: profile.communication,
    motivation: profile.motivation,
    stressors: profile.stressors,
    decisionMaking: profile.decisionMaking,
    underPressure: profile.underPressure,
    leadership: profile.leadership,
    teamwork: profile.teamwork,
    idealRoles: profile.idealRoles,
    riskyRoles: profile.riskyRoles,
    careerTips: profile.careerTips,
    interviewProbes: profile.interviewProbes,
    manageTips: profile.manageTips,
    developTips: profile.developTips,
    compatibleWith: profile.compatibleWith,
    challengingWith: profile.challengingWith,
    roleClusters: profile.roleClusters
  };
}

/**
 * محاسبه تناسب با موقعیت شغلی
 * بر پایه تیپ‌های مطلوب تعریف‌شده در آگهی + تحلیل شخصیت
 */
function jobFit(result, job) {
  const ideal = (job.idealTypes || []).filter(Boolean);
  const type = result.type;
  const out = {
    jobId: job.id,
    jobTitle: job.title,
    idealTypes: ideal,
    hasIdealTypes: ideal.length > 0,
    score: null,
    level: null,
    color: null,
    reasons: [],
    cautions: [],
    suggestions: []
  };

  if (!type) {
    out.level = 'نامشخص';
    out.color = 'sky';
    out.reasons.push('نتیجه آزمون قابل تعیین نیست (پاسخ‌ها ناقص است).');
    return out;
  }

  const profile = PROFILES[type];
  if (!ideal.length) {
    out.level = 'بدون معیار';
    out.color = 'sky';
    out.reasons.push('برای این موقعیت شغلی، تیپ شخصیتی مطلوبی تعریف نشده است.');
    out.suggestions = (profile ? profile.idealRoles : []).slice(0, 4);
    return out;
  }

  // بالاترین شباهت با تیپ‌های مطلوب
  let best = null;
  for (const target of ideal) {
    const shared = type.split('').filter((c, i) => target[i] === c).length;
    const diffLetters = type.split('').map((c, i) => (target[i] === c ? null : `${c}→${target[i]}`)).filter(Boolean);
    const similarity = shared / 4;
    if (!best || similarity > best.similarity) best = { target, similarity, shared, diffLetters };
  }

  let score = 50 + Math.round(best.similarity * 45);      // ۵۰ تا ۹۵
  if (type === best.target) score = 96;                    // انطباق کامل
  // کاهش ناشی از ابعاد مرزی (اطمینان کمتر)
  score -= result.borderline.length * 3;
  score = Math.max(30, Math.min(98, score));

  out.bestMatchType = best.target;
  out.sharedLetters = best.shared;
  out.score = score;
  out.level = score >= 85 ? 'تناسب بالا' : score >= 70 ? 'تناسب خوب' : score >= 55 ? 'تناسب متوسط' : 'تناسب پایین';
  out.color = score >= 85 ? 'mint' : score >= 70 ? 'sky' : score >= 55 ? 'lemon' : 'rose';

  if (out.score >= 85) out.reasons.push(`تیپ «${type}» با تیپ‌های مطلوب این موقعیت (${ideal.join('، ')}) هم‌راستایی بالایی دارد.`);
  else if (out.bestMatchType) out.reasons.push(`نزدیک‌ترین تیپ مطلوب برای این فرد «${best.target}» است؛ ${utils.faDigits(best.shared)} مؤلفه از ۴ مؤلفه مشترک است.`);

  if (best.diffLetters.length) {
    out.reasons.push(`تفاوت‌های کلیدی با تیپ مطلوب: ${best.diffLetters.join('، ')}`);
    for (const pair of best.diffLetters) {
      const from = pair.split('→')[0];
      const to = pair.split('→')[1];
      const insight = DIMENSION_INSIGHTS[from];
      if (insight) out.cautions.push(`تمایل به «${insight.title}»: ${insight.watchOut}`);
      const target = DIMENSION_INSIGHTS[to];
      if (target) out.suggestions.push(`انتظار نقش از سمت «${target.title}»: ${target.inWork}`);
    }
  }

  for (const pair of result.borderline) {
    out.cautions.push(`بُعد ${pair} مرزی است؛ نتیجه ممکن است در شرایط مختلف تغییر کند — در مصاحبه راستی‌آزمایی شود.`);
  }

  const probes = [];
  if (profile) {
    probes.push(...profile.interviewProbes);
    if (out.score < 70) probes.push(...profile.interviewProbes.slice(0, 3));
  }
  out.interviewFocus = Array.from(new Set(probes)).slice(0, 6);
  return out;
}

/** ساخت متن خلاصه برای پیامک/فهرست */
function brief(result) {
  if (!result || !result.type) return '';
  return `${result.type} — ${result.profileName || ''}`.trim();
}

module.exports = {
  questions, allQuestions, score, analyze, jobFit, brief,
  PROFILES, GROUPS, DIMENSION_INSIGHTS, REPORT_GUIDELINES,
  TOTAL: seed.TOTAL, PAIRS: seed.PAIRS, DIMENSIONS: seed.DIMENSIONS, SEED_QUESTIONS: seed.QUESTIONS
};
