'use strict';
/**
 * موتور امتیازدهی و تحلیل آزمون شخصیت MBTI
 * امتیازدهی: هر ۴ بُعد ۷ سوال دارد (E/I، S/N، T/F، J/P)
 */
const TYPES = require('../mbti-types');

const DIMENSIONS = [
  { key: 'EI', a: 'E', b: 'I', aName: 'برون‌گرایی (E)', bName: 'درون‌گرایی (I)',
    aDesc: 'انرژی از تعامل با دیگران، محیط‌های پویا و گفت‌وگو',
    bDesc: 'انرژی از تأمل فردی، تمرکز و محیط‌های آرام' },
  { key: 'SN', a: 'N', b: 'S', aName: 'شهود (N)', bName: 'حسی (S)',
    aDesc: 'توجه به الگوها، ایده‌ها و احتمالات آینده',
    bDesc: 'توجه به واقعیات، جزئیات ملموس و تجربه عملی' },
  { key: 'TF', a: 'T', b: 'F', aName: 'تفکر (T)', bName: 'احساس (F)',
    aDesc: 'تصمیم‌گیری بر پایه منطق، تحلیل و عدالت',
    bDesc: 'تصمیم‌گیری بر پایه ارزش‌ها، همدلی و انسان‌ها' },
  { key: 'JP', a: 'J', b: 'P', aName: 'قضاوت (J)', bName: 'ادراک (P)',
    aDesc: 'برنامه‌ریزی، نظم و تصمیم‌گیری سریع',
    bDesc: 'انعطاف‌پذیری، گشودگی و نگه داشتن گزینه‌ها' }
];

/**
 * @param {Array} answers - [{number, choice: 'a'|'b'}] یا آرایه‌ای از 'a'/'b' به ترتیب شماره سوال
 * @param {Array} questions - سوالات از دیتابیس
 * @returns {object} نتیجه تحلیلی کامل
 */
function score(answers, questions) {
  // نگاشت شماره سوال -> انتخاب
  const choiceMap = new Map();
  if (Array.isArray(answers) && answers.length && typeof answers[0] === 'object') {
    for (const a of answers) choiceMap.set(Number(a.number), String(a.choice || '').toLowerCase());
  } else if (Array.isArray(answers)) {
    questions.forEach((q, i) => choiceMap.set(Number(q.number), String(answers[i] || '').toLowerCase()));
  }

  const counts = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
  const detail = [];
  for (const q of questions) {
    const choice = choiceMap.get(Number(q.number));
    if (choice !== 'a' && choice !== 'b') continue;
    const trait = choice === 'a' ? q.trait_a : q.trait_b;
    if (counts[trait] !== undefined) counts[trait] += 1;
    detail.push({ number: q.number, choice, trait });
  }

  const dimensions = [];
  const typeLetters = [];
  for (const d of DIMENSIONS) {
    const aScore = counts[d.a];
    const bScore = counts[d.b];
    const total = aScore + bScore;
    const pctA = total ? Math.round((aScore / total) * 100) : 50;
    const pctB = total ? 100 - pctA : 50;
    const winner = aScore >= bScore ? d.a : d.b;
    typeLetters.push(winner);
    dimensions.push({
      key: d.key,
      a: d.a, b: d.b,
      aName: d.aName, bName: d.bName,
      aDesc: d.aDesc, bDesc: d.bDesc,
      aScore, bScore, total,
      pctA, pctB,
      winner,
      winnerName: winner === d.a ? d.aName : d.bName,
      // اختلاف کمتر یا مساوی ۲ => بُعد مرزی (نتیجه قطعی نیست)
      borderline: Math.abs(aScore - bScore) <= 2
    });
  }

  const typeCode = typeLetters.join('');
  const typeInfo = TYPES.find(t => t.code === typeCode) || null;

  // شدت وضوح هر بُعد (از خفیف تا بسیار مشخص)
  const clarity = dimensions.map(d => {
    const diff = Math.abs(d.aScore - d.bScore);
    let level = 'متعادل';
    if (diff >= 6) level = 'بسیار مشخص';
    else if (diff >= 4) level = 'مشخص';
    else if (diff >= 2) level = 'نسبتاً مشخص';
    else level = 'مرزی';
    return { key: d.key, diff, level };
  });

  // تحلیل ترکیبی میان‌بُعدی
  const interactions = buildInteractions(dimensions);

  // سازگاری شغلی (مبتنی بر گروه تیپ)
  const groupMap = {
    NT: ['INTJ', 'INTP', 'ENTJ', 'ENTP'],
    NF: ['INFJ', 'INFP', 'ENFJ', 'ENFP'],
    SJ: ['ISTJ', 'ISFJ', 'ESTJ', 'ESFJ'],
    SP: ['ISTP', 'ISFP', 'ESTP', 'ESFP']
  };
  let group = '';
  for (const [g, codes] of Object.entries(groupMap)) {
    if (codes.includes(typeCode)) { group = g; break; }
  }
  const groupTitles = {
    NT: 'تحلیلگران — منطق، استراتژی و نوآوری',
    NF: 'دیپلمات‌ها — ارزش‌ها، ارتباط انسانی و الهام',
    SJ: 'نگهبانان — نظم، تعهد و اجرا',
    SP: 'کاشفان — عمل، انعطاف و مهارت'
  };

  return {
    typeCode,
    typeInfo,
    group,
    groupTitle: groupTitles[group] || '',
    counts,
    dimensions,
    clarity,
    interactions,
    detail,
    answeredCount: detail.length,
    totalQuestions: questions.length
  };
}

/** تحلیل ترکیبی بُعدها (حرفه‌ای‌تر از صرفاً ۴ حرف) */
function buildInteractions(dimensions) {
  const w = {};
  dimensions.forEach(d => { w[d.key] = d.winner; });
  const out = [];

  // انرژی + تصمیم‌گیری
  if (w.EI === 'E' && w.TF === 'T') {
    out.push('ترکیب برون‌گرایی و تفکر: در بحث‌ها سریع، صریح و نتیجه‌محور است؛ در جلسات با استدلال منطقی صحبت می‌کند و از تعارف پرهیز می‌کند.');
  } else if (w.EI === 'E' && w.TF === 'F') {
    out.push('ترکیب برون‌گرایی و احساس: ارتباط‌گیری گرم و فعال دارد، به فضای تیم اهمیت می‌دهد و در نقش‌های مردمی می‌درخشد.');
  } else if (w.EI === 'I' && w.TF === 'T') {
    out.push('ترکیب درون‌گرایی و تفکر: تحلیل‌گری عمیق و مستقل دارد؛ پیش از اظهار نظر فکر می‌کند و در تصمیم‌گیری‌های فنی قوی است.');
  } else if (w.EI === 'I' && w.TF === 'F') {
    out.push('ترکیب درون‌گرایی و احساس: شنونده‌ای عمیق و متفکر است؛ در روابط یک‌به‌یک بسیار قابل‌اعتماد و همدل ظاهر می‌شود.');
  }

  // ادراک اطلاعات + برنامه‌ریزی
  if (w.SN === 'S' && w.JP === 'J') {
    out.push('ترکیب حسی-قضاوتی: در اجرای دقیق برنامه‌ها، رعایت استانداردها و تحویل به‌موقع کارها بسیار قوی عمل می‌کند.');
  } else if (w.SN === 'S' && w.JP === 'P') {
    out.push('ترکیب حسی-ادراکی: در حل مسائل عملی لحظه‌ای و سازگاری با شرایط واقعی چابک و مؤثر است.');
  } else if (w.SN === 'N' && w.JP === 'J') {
    out.push('ترکیب شهودی-قضاوتی: توانایی بالایی در تبدیل چشم‌انداز به برنامه اجرایی و پیگیری اهداف بلندمدت دارد.');
  } else if (w.SN === 'N' && w.JP === 'P') {
    out.push('ترکیب شهودی-ادراکی: ذهنی ایده‌پرداز و منعطف دارد که در مراحل اولیه نوآوری و کشف فرصت‌ها درخشان است.');
  }

  // هشدارهای ترکیبی
  if (w.EI === 'E' && w.JP === 'P') {
    out.push('نکته مدیریتی: انرژی اجتماعی بالا همراه با انعطاف‌پذیری ممکن است به پراکندگی کارها بینجامد؛ زمان‌بندی روشن به او کمک می‌کند.');
  }
  if (w.EI === 'I' && w.JP === 'J') {
    out.push('نکته مدیریتی: نظم و درون‌گرایی او نیازمند محیط آرام و احترام به زمان تمرکز است؛ جلسات غیرضروری را کاهش دهید.');
  }
  return out;
}

/** امتیاز سازگاری تیپ با عنوان/توضیح یک موقعیت شغلی (راهنمایی اولیه برای HR) */
function jobFitScore(typeCode, positionText) {
  const typeInfo = TYPES.find(t => t.code === typeCode);
  if (!typeInfo || !positionText) return { score: null, matched: [], note: '' };
  const text = String(positionText).toLowerCase();
  const matched = [];
  for (const job of typeInfo.ideal_jobs || []) {
    const words = String(job).replace(/[()]/g, ' ').split(/[\s،و/]+/).filter(w => w.length > 2);
    if (words.some(w => text.includes(w.toLowerCase()))) matched.push(job);
  }
  const score = Math.min(100, 45 + matched.length * 15);
  let note = 'سازگاری عمومی متوسط؛ پیشنهاد می‌شود در مصاحبه به نقاط قوت تیپ توجه شود.';
  if (score >= 75) note = 'سازگاری بالا: این تیپ شخصیتی معمولاً در این نوع موقعیت‌های شغلی عملکرد خوبی دارد.';
  else if (score < 55) note = 'سازگاری نسبی: تیپ شخصیتی لزوماً مانع موفقیت نیست؛ انگیزه، مهارت و تجربه را نیز در نظر بگیرید.';
  return { score, matched, note };
}

module.exports = { score, jobFitScore, DIMENSIONS, TYPES };
