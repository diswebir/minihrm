// ═══════════════════════════════════════════════════════════
//  Assessment Analysis Engine
//  Professional analysis for DISC, Big Five, EQ, RIASEC
// ═══════════════════════════════════════════════════════════

// ─── DISC Analysis ──────────────────────────────────────
function analyzeDISC(scores) {
  const D = scores.D || 0, I = scores.I || 0, S = scores.S || 0, C = scores.C || 0;
  const total = D + I + S + C;

  // Find dominant and secondary types
  const sorted = Object.entries({ D, I, S, C }).sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0][0];
  const secondary = sorted[1][0];

  const profiles = {
    D: {
      name: 'تسلط‌گرا (Dominance)',
      traits: 'نتیجه‌محور، قاطع، مستقیم، رقابتی',
      strengths: 'تصمیم‌گیری سریع، رهبری قوی، پذیرش چالش',
      challenges: 'ممکن است بی‌صبر باشد، نیاز به کنترل بیش از حد',
      communication: 'مستقیم و خلاصه صحبت کنید، روی نتایج تمرکز کنید',
      jobs: 'مدیرعامل، مدیر پروژه، کارآفرین، مدیر فروش'
    },
    I: {
      name: 'تأثیرگذار (Influence)',
      traits: 'اجتماعی، مشتاق، متقاعدکننده، خوش‌بین',
      strengths: 'ارتباطات عالی، انگیزه‌دهی به تیم، خلاقیت',
      challenges: 'ممکن است جزئیات را نادیده بگیرد، نیاز به تأیید دیگران',
      communication: 'فضای دوستانه ایجاد کنید، از او نظر بخواهید',
      jobs: 'بازاریابی، روابط عمومی، فروش، آموزش'
    },
    S: {
      name: 'ثابت‌قدم (Steadiness)',
      traits: 'صبور، قابل اعتماد، تیم‌محور، سازگار',
      strengths: 'وفاداری، ثبات، گوش دادن عالی، حمایت از تیم',
      challenges: 'مقاومت در برابر تغییر، نیاز به زمان برای تصمیم‌گیری',
      communication: 'صبور باشید، امنیت شغلی را تضمین کنید',
      jobs: 'منابع انسانی، خدمات مشتری، مشاوره، مدیریت عملیات'
    },
    C: {
      name: 'وجدان‌گرا (Conscientiousness)',
      traits: 'دقیق، تحلیلگر، منظم، استانداردمحور',
      strengths: 'دقت بالا، تحلیل قوی، کیفیت‌محوری',
      challenges: ' perfectionism، نیاز به اطلاعات زیاد قبل از تصمیم',
      communication: 'داده و مدرک ارائه دهید، جزئیات را رعایت کنید',
      jobs: 'حسابداری، مهندسی، تحلیل داده، کنترل کیفیت'
    }
  };

  const analysis = `📊 تحلیل پروفایل DISC

🏆 سبک غالب: ${profiles[dominant].name}
📈 سبک فرعی: ${profiles[secondary].name}

━━━━━━━━━━━━━━━━━━━━━━━━

🔹 ویژگی‌های کلیدی:
${profiles[dominant].traits}

✅ نقاط قوت:
${profiles[dominant].strengths}

⚠️ نکات قابل توجه:
${profiles[dominant].challenges}

💬 نحوه ارتباط مؤثر:
${profiles[dominant].communication}

💼 موقعیت‌های شغلی مناسب:
${profiles[dominant].jobs}

━━━━━━━━━━━━━━━━━━━━━━━━

امتیازات:
تسلط‌گرایی (D): ${D} (${Math.round(D/total*100)}%)
تأثیرگذاری (I): ${I} (${Math.round(I/total*100)}%)
ثبات (S): ${S} (${Math.round(S/total*100)}%)
وجدان‌گرایی (C): ${C} (${Math.round(C/total*100)}%)`;

  return {
    type: `${dominant}-${secondary}`,
    scores: { D, I, S, C },
    analysis,
    recommendations: `این فرد سبک ${profiles[dominant].name} دارد. ${profiles[dominant].jobs} مناسب‌ترین موقعیت‌ها هستند.`
  };
}

// ─── Big Five (OCEAN) Analysis ──────────────────────────
function analyzeBigFive(scores) {
  const O = scores.O || 0, C = scores.C || 0, E = scores.E || 0, A = scores.A || 0, N = scores.N || 0;

  const levels = (score) => {
    if (score <= 20) return 'پایین';
    if (score <= 30) return 'متوسط';
    if (score <= 40) return 'بالا';
    return 'بسیار بالا';
  };

  const dims = {
    O: {
      name: 'گشودگی به تجربه (Openness)',
      high: 'خلاق، کنجکاو، نوآور، پذیرای ایده‌های جدید',
      low: 'عملگرا، سنتی، ترجیح روش‌های اثبات شده'
    },
    C: {
      name: 'وظیفه‌شناسی (Conscientiousness)',
      high: 'منظم، مسئول، قابل اعتماد، هدفمند',
      low: 'انعطاف‌پذیر، خودجوش، اما ممکن است بی‌نظم باشد'
    },
    E: {
      name: 'برون‌گرایی (Extraversion)',
      high: 'اجتماعی، پرانرژی، رهبر، ارتباطی',
      low: 'درون‌گرا، تأملی، مستقل، متمرکز'
    },
    A: {
      name: 'توافق‌پذیری (Agreeableness)',
      high: 'همدل، همکار، اعتمادکننده، حامی',
      low: 'رقابتی، مستقل، مستقیم، منتقد'
    },
    N: {
      name: 'روان‌رنجوری (Neuroticism)',
      high: 'حساس، نگران، تحت تأثیر استرس',
      low: 'آرام، مقاوم، با ثبات عاطفی بالا'
    }
  };

  let analysis = `🧠 تحلیل پنج عامل بزرگ شخصیت (OCEAN)\n\n`;

  for (const [key, dim] of Object.entries(dims)) {
    const score = { O, C, E, A, N }[key];
    const level = levels(score);
    const desc = score > 25 ? dim.high : dim.low;
    analysis += `━━━ ${dim.name} ━━━\n`;
    analysis += `امتیاز: ${score} | سطح: ${level}\n`;
    analysis += `${desc}\n\n`;
  }

  // Workplace recommendations
  analysis += `💼 پیشنهادات شغلی:\n`;
  if (C >= 30 && A >= 25) analysis += `• مدیریت پروژه، حسابداری، عملیات\n`;
  if (O >= 30 && E >= 25) analysis += `• بازاریابی، طراحی، نوآوری\n`;
  if (E >= 30 && A >= 25) analysis += `• منابع انسانی، فروش، مشاوره\n`;
  if (C >= 30 && O >= 25) analysis += `• تحقیق و توسعه، مهندسی، تحلیل\n`;
  if (N <= 20 && E >= 25) analysis += `• رهبری، مدیریت بحران، فروش\n`;

  const primaryTrait = Object.entries({ O, C, E, A, N }).sort((a, b) => b[1] - a[1])[0][0];
  const typeNames = { O: 'نوآور', C: 'منظم', E: 'اجتماعی', A: 'همدل', N: 'حساس' };

  return {
    type: typeNames[primaryTrait],
    scores: { O, C, E, A, N },
    analysis,
    recommendations: `ویژگی برجسته: ${typeNames[primaryTrait]}. ${dims[primaryTrait].high}`
  };
}

// ─── EQ (Emotional Intelligence) Analysis ───────────────
function analyzeEQ(scores) {
  const SA = scores.SA || 0;  // Self-Awareness
  const SR = scores.SR || 0;  // Self-Regulation
  const MO = scores.MO || 0;  // Motivation
  const EM = scores.EM || 0;  // Empathy
  const SS = scores.SS || 0;  // Social Skills

  const total = SA + SR + MO + EM + SS;
  const maxPossible = 200; // 40 questions * 5
  const percentage = Math.round((total / maxPossible) * 100);

  let level, color;
  if (percentage >= 80) { level = 'بسیار بالا'; }
  else if (percentage >= 60) { level = 'بالا'; }
  else if (percentage >= 40) { level = 'متوسط'; }
  else { level = 'نیاز به بهبود'; }

  const dims = {
    SA: { name: 'خودآگاهی', max: 40, desc: 'شناخت احساسات، نقاط قوت و ضعف' },
    SR: { name: 'خودمدیریتی', max: 40, desc: 'کنترل احساسات و رفتار' },
    MO: { name: 'انگیزش', max: 40, desc: 'انگیزه درونی و پشتکار' },
    EM: { name: 'همدلی', max: 40, desc: 'درک احساسات دیگران' },
    SS: { name: 'مهارت اجتماعی', max: 40, desc: 'ارتباطات و رهبری' }
  };

  let analysis = `💡 تحلیل هوش هیجانی (EQ)\n\n`;
  analysis += `📊 نمره کل: ${total} از ${maxPossible} (${percentage}%)\n`;
  analysis += `🎯 سطح: ${level}\n\n`;

  const weakest = Object.entries({ SA, SR, MO, EM, SS }).sort((a, b) => a[1] - b[1])[0];
  const strongest = Object.entries({ SA, SR, MO, EM, SS }).sort((a, b) => b[1] - a[1])[0];

  for (const [key, dim] of Object.entries(dims)) {
    const score = { SA, SR, MO, EM, SS }[key];
    const pct = Math.round((score / dim.max) * 100);
    analysis += `━━━ ${dim.name} ━━━\n`;
    analysis += `${dim.desc}\n`;
    analysis += `امتیاز: ${score}/${dim.max} (${pct}%)\n\n`;
  }

  analysis += `🏆 قوی‌ترین بُعد: ${dims[strongest[0]].name} (${strongest[1]})\n`;
  analysis += `📈 نیاز به بهبود: ${dims[weakest[0]].name} (${weakest[1]})\n\n`;

  analysis += `💼 توصیه‌ها:\n`;
  if (SA >= 30) analysis += `✓ خودآگاهی عالی - درک خوبی از خود دارد\n`;
  if (SR < 25) analysis += `⚠ نیاز به تقویت خودمدیریتی - مدیریت استرس و احساسات\n`;
  if (EM >= 30) analysis += `✓ همدلی بالا - مناسب نقش‌های تیمی و رهبری\n`;
  if (SS >= 30) analysis += `✓ مهارت اجتماعی قوی - مناسب نقش‌های ارتباطی\n`;
  if (MO >= 30) analysis += `✓ انگیزه بالا - فردی خودانگیخته و هدفمند\n`;

  // Leadership potential
  const leadershipScore = Math.round((SA + SR + MO + EM + SS) / 5);
  analysis += `\n🎯 پتانسیل رهبری: ${leadershipScore >= 30 ? 'بسیار بالا' : leadershipScore >= 25 ? 'بالا' : leadershipScore >= 20 ? 'متوسط' : 'نیاز به توسعه'}`;

  return {
    type: level,
    scores: { SA, SR, MO, EM, SS },
    analysis,
    recommendations: `هوش هیجانی ${level}. ${strongest[0] === 'EM' || strongest[0] === 'SS' ? 'مناسب نقش‌های تیمی و رهبری.' : 'نیاز به تقویت مهارت‌های ارتباطی.'}`
  };
}

// ─── RIASEC Analysis ────────────────────────────────────
function analyzeRIASEC(scores) {
  const R = scores.R || 0, I = scores.I || 0, A = scores.A || 0;
  const S = scores.S || 0, E = scores.E || 0, C = scores.C || 0;

  // Sort to find top 3
  const sorted = Object.entries({ R, I, A, S, E, C }).sort((a, b) => b[1] - a[1]);
  const top3 = sorted.slice(0, 3);
  const code = top3.map(t => t[0]).join('');

  const profiles = {
    R: {
      name: 'واقع‌گرا (Realistic)',
      icon: '🔧',
      traits: 'عملگرا، فنی، عملیاتی',
      jobs: 'مهندسی، فنی، تعمیرات، کشاورزی، معماری'
    },
    I: {
      name: 'پژوهشگر (Investigative)',
      icon: '🔬',
      traits: 'تحلیلگر، کنجکاو، علمی',
      jobs: 'تحقیق، برنامه‌نویسی، پزشکی، علوم داده'
    },
    A: {
      name: 'هنری (Artistic)',
      icon: '🎨',
      traits: 'خلاق، نوآور، بیانگر',
      jobs: 'طراحی، نویسندگی، موسیقی، بازاریابی خلاق'
    },
    S: {
      name: 'اجتماعی (Social)',
      icon: '👥',
      traits: 'همدل، آموزشی، حمایتی',
      jobs: 'آموزش، مشاوره، منابع انسانی، پرستاری'
    },
    E: {
      name: 'پیشرو (Enterprising)',
      icon: '🚀',
      traits: 'رهبر، متقاعدکننده، جاه‌طلب',
      jobs: 'مدیریت، فروش، کارآفرینی، حقوق'
    },
    C: {
      name: 'قراردادی (Conventional)',
      icon: '📋',
      traits: 'منظم، دقیق، سازمان‌یافته',
      jobs: 'حسابداری، بانکداری، اداری، مدیریت داده'
    }
  };

  let analysis = `🎯 تحلیل کد شغلی RIASEC (هالند)\n\n`;
  analysis += `🏆 کد شغلی شما: ${code}\n\n`;

  analysis += `📊 امتیازات:\n`;
  for (const [key, profile] of Object.entries(profiles)) {
    const score = { R, I, A, S, E, C }[key];
    const bar = '█'.repeat(Math.round(score / 2)) + '░'.repeat(Math.max(0, 10 - Math.round(score / 2)));
    analysis += `${profile.icon} ${profile.name}: ${bar} ${score}\n`;
  }

  analysis += `\n━━━ ۳ بُعد برتر شما ━━━\n\n`;
  for (let i = 0; i < top3.length; i++) {
    const [key, score] = top3[i];
    const p = profiles[key];
    analysis += `${i + 1}. ${p.icon} ${p.name} (${score})\n`;
    analysis += `   ویژگی‌ها: ${p.traits}\n`;
    analysis += `   مشاغل مناسب: ${p.jobs}\n\n`;
  }

  analysis += `💼 پیشنهادات شغلی بر اساس کد ${code}:\n`;
  const combinedJobs = top3.map(t => profiles[t[0]].jobs.split('،')).flat();
  const uniqueJobs = [...new Set(combinedJobs)].slice(0, 8);
  analysis += uniqueJobs.map(j => `• ${j.trim()}`).join('\n');

  return {
    type: code,
    scores: { R, I, A, S, E, C },
    analysis,
    recommendations: `کد شغلی ${code}: ${top3.map(t => profiles[t[0]].name).join('، ')}. مشاغل پیشنهادی: ${uniqueJobs.slice(0, 4).map(j => j.trim()).join('، ')}.`
  };
}

module.exports = { analyzeDISC, analyzeBigFive, analyzeEQ, analyzeRIASEC };