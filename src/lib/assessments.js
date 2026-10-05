'use strict';
/**
 * موتور امتیازدهی و تحلیل آزمون‌های روان‌شناختی (DISC / EQ / Holland)
 * خروجی: ساختار یکپارچه analysis برای رندر «گزارش تحلیل حرفه‌ای»
 * نتایج صرفاً برای تیم منابع انسانی/مدیریت نمایش داده می‌شود.
 */
const testData = require('../test-data');

/* ─────────────── امتیازدهی ─────────────── */
function score(answers, questions) {
  const byNum = new Map(questions.map(q => [q.number, q]));
  const dims = {};
  const answerList = [];
  for (const a of answers) {
    const q = byNum.get(a.number);
    if (!q) continue;
    let v = Math.max(1, Math.min(5, Number(a.value) || 0));
    const eff = q.reverse ? 6 - v : v;
    if (!dims[q.dimension]) dims[q.dimension] = { raw: 0, max: 0, count: 0 };
    dims[q.dimension].raw += eff;
    dims[q.dimension].max += 5;
    dims[q.dimension].count++;
    answerList.push({ number: q.number, value: v, effective: eff, dimension: q.dimension, reverse: !!q.reverse });
  }
  const percents = {};
  for (const k of Object.keys(dims)) {
    percents[k] = dims[k].max ? Math.round((dims[k].raw / dims[k].max) * 100) : 0;
  }
  return { dims, percents, answers: answerList };
}

const levelOf = (p) => (p >= 75 ? 'high' : p >= 55 ? 'good' : p >= 40 ? 'mid' : 'low');
const LEVEL_FA = { high: 'بالا', good: 'خوب', mid: 'متوسط', low: 'پایین' };

/* ─────────────── DISC ─────────────── */
const DISC_META = {
  D: {
    nickname: 'رهبر نتیجه‌گرا',
    work: 'سریع عمل می‌کند، مسئولیت می‌پذیرد و با چالش‌ها روبرو می‌شود. در محیط‌های پرفشار و هدف‌محور می‌درخشد.',
    comm: 'مستقیم، کوتاه و نتیجه‌محور صحبت می‌کند و انتظار همین سبک را از دیگران دارد.',
    decide: 'با سرعت و جسارت تصمیم می‌گیرد؛ گاهی برای سرعت، از جزئیات می‌گذرد.',
    stress: 'زیر فشار کنترل‌گر و بی‌صبر می‌شود؛ ممکن است نظرات دیگران را نادیده بگیرد.',
    ideal: 'محیط با آزادی عمل، اهداف چالشی، سرعت در تصمیم‌گیری و پاداش بر اساس نتیجه.',
    strength: ['قاطعیت در تصمیم‌گیری', 'پذیرش ریسک حساب‌شده', 'تمرکز بر نتیجه و اجرا', 'رهبری در بحران'],
    risk: ['بی‌صبری در فرایندهای کند', 'کم‌توجهی به جزئیات و احساسات تیم', 'لحن تند در تعارضات'],
    fitRoles: 'مدیریت پروژه، رهبری تیم، فروش تهاجمی، کارآفرینی، مدیریت بحران',
    fitNote: 'نقش‌هایی با هدف‌گذاری شفاف و اختیار تصمیم‌گیری بالا.'
  },
  I: {
    nickname: 'تأثیرگذار اجتماعی',
    work: 'با انرژی و اشتیاق کار می‌کند، ارتباط می‌سازد و فضای تیم را گرم می‌کند.',
    comm: 'پرانرژی، داستان‌گو و متقاعدکننده؛ در ارائه و مذاکره قوی است.',
    decide: 'بر اساس احساس و نظرات افراد تصمیم می‌گیرد؛ گاهی خوش‌بینی بیش از حد دارد.',
    stress: 'زیر فشار از تمرکز خارج می‌شود یا مسائل را ساده‌تر از واقع می‌بیند.',
    ideal: 'محیط پویا با تعامل زیاد، آزادی بیان، کار تیمی و فرصت ارائه.',
    strength: ['انرژی و روحیه تیمی', 'متقاعدسازی و فروش', 'شبکه‌سازی سریع', 'خوش‌بینی و امیدآفرینی'],
    risk: ['بی‌نظمی و عدم پیگیری جزئیات', 'تصمیم‌گیری احساسی', 'صحبت بیش از حد و شنیدن کم'],
    fitRoles: 'فروش و بازاریابی، روابط عمومی، آموزش و سخنرانی، مدیریت برند، جذب نیرو',
    fitNote: 'نقش‌هایی با تعامل بالای انسانی و فضای ابراز وجود.'
  },
  S: {
    nickname: 'همراه پایدار',
    work: 'قابل‌اعتماد، صبور و حمایت‌گر؛ ستون ثبات تیم در فرایندهای بلندمدت.',
    comm: 'شنونده خوب، آرام و همدل؛ از تنش و رویارویی پرهیز می‌کند.',
    decide: 'محتاطانه و با مشورت تصمیم می‌گیرد؛ در برابر تغییر ناگهانی مقاومت دارد.',
    stress: 'زیر فشار منزوی یا سازشی می‌شود و ابراز مخالفت برایش سخت است.',
    ideal: 'محیط باثبات با تیم هماهنگ، برنامه‌ریزی مشخص و امنیت شغلی.',
    strength: ['وفاداری و پایداری', 'حمایت از تیم', 'صبر در فرایندهای طولانی', 'اجرای قابل‌اتکای وظایف'],
    risk: ['مقاومت در برابر تغییر', 'دیر تصمیم گرفتن', 'اجابت بیش از حد درخواست‌ها و فرسودگی'],
    fitRoles: 'پشتیبانی مشتریان، منابع انسانی، عملیات و خدمات، مربی‌گری، امور اداری پایدار',
    fitNote: 'نقش‌هایی با تیم ثابت، فرایندهای روشن و تعامل حمایتی.'
  },
  C: {
    nickname: 'تحلیل‌گر کیفیت‌محور',
    work: 'دقیق، منظم و استانداردمحور؛ کیفیت را فدای سرعت نمی‌کند.',
    comm: 'مستند، منطقی و مبتنی بر داده؛ کمتر اظهارنظر احساسی می‌کند.',
    decide: 'تحلیلی و مبتنی بر شواهد؛ پیش از تصمیم همه زوایا را می‌سنجد.',
    stress: 'زیر فشار انتقادی و وسواسی می‌شود؛ در برابر تغییر بی‌برنامه آشفته می‌شود.',
    ideal: 'محیط استانداردمحور با نقش‌های مشخص، داده‌های قابل‌اتکا و فرصت تخصصی شدن.',
    strength: ['دقت و توجه به جزئیات', 'تحلیل منطقی مسائل', 'پایبندی به استاندارد و کیفیت', 'نظم در مستندسازی'],
    risk: ['کمال‌گرایی و کندی در تحویل', 'دشواری در واگذاری کار', 'انتقاد بیش از حد از خود و دیگران'],
    fitRoles: 'کنترل کیفیت، مالی و حسابداری، تحلیل داده، برنامه‌نویسی، ممیزی و انطباق',
    fitNote: 'نقش‌هایی با استانداردهای روشن و نیاز به دقت بالا.'
  }
};

const DISC_BLENDS = {
  DI: 'قاطع و پرانرژی — ترکیب رهبری و متقاعدسازی؛ برای راه‌اندازی و رشد کسب‌وکار عالی است.',
  DS: 'قاطع و پایدار — تصمیم‌گیرنده‌ای که تا پایان کار می‌ایستد؛ مناسب پروژه‌های بلندمدت.',
  DC: 'قاطع و دقیق — ترکیب نتیجه‌گرایی با استاندارد بالا؛ برای نقش‌های حساس و فنی مناسب است.',
  ID: 'اجتماعی و هدایت‌گر — در فروش و توسعه بازار می‌درخشد.',
  IS: 'اجتماعی و حمایت‌گر — فضای تیم را گرم و هماهنگ نگه می‌دارد.',
  IC: 'اجتماعی و تحلیلی — ارتباط‌گیری همراه با آمادگی دقیق.',
  SD: 'پایدار و قاطع — ترکیب نادرِ صبر با اراده نتیجه‌گرایی.',
  SI: 'پایدار و اجتماعی — هسته اعتماد هر تیم خدماتی.',
  SC: 'پایدار و دقیق — ستون اجرای قابل‌اتکا و بی‌حاشیه.',
  CD: 'دقیق و قاطع — استانداردهای سخت‌گیرانه با پیگیری نتیجه.',
  CI: 'دقیق و اجتماعی — تحلیل‌گری که می‌تواند یافته‌ها را خوب ارائه دهد.',
  CS: 'دقیق و پایدار — ترکیب کیفیت‌محوری با وفاداری سازمانی.'
};

function analyzeDisc(result, questions, positionText) {
  const p = result.percents;
  const order = ['D', 'I', 'S', 'C'].sort((a, b) => (p[b] || 0) - (p[a] || 0));
  const dom = order[0], sec = order[1];
  const meta = DISC_META[dom];
  const domP = p[dom] || 0, secP = p[sec] || 0;
  const blendKey = (dom + sec).split('').sort().join('');
  const blend = DISC_BLENDS[dom + sec] || DISC_BLENDS[blendKey] || '';

  const dimensions = ['D', 'I', 'S', 'C'].map(k => ({
    key: k,
    name: DISC_META[k].nickname + ' (' + k + ')',
    percent: p[k] || 0,
    level: levelOf(p[k] || 0),
    levelLabel: LEVEL_FA[levelOf(p[k] || 0)],
    desc: (testData.TESTS[0].dimensions.find(d => d.key === k) || {}).desc || '',
    note: k === dom ? 'سبک غالب شما' : (k === sec ? 'سبک ثانویه' : '')
  }));

  const sections = [
    {
      title: 'سبک غالب: ' + meta.nickname + ' (' + dom + ')',
      paragraphs: [meta.work],
      bullets: secP >= 45 ? ['سبک ثانویه شما «' + DISC_META[sec].nickname + '» است؛ ' + blend] : ['ترکیب رفتاری شما نسبتاً تک‌بعدی است؛ تقویت سبک ثانویه (' + sec + ') انعطاف شما را بالا می‌برد.']
    },
    { title: 'سبک ارتباطی', paragraphs: [meta.comm], bullets: [] },
    { title: 'تصمیم‌گیری', paragraphs: [meta.decide], bullets: [] },
    { title: 'رفتار زیر فشار', paragraphs: [meta.stress], bullets: [] },
    { title: 'محیط کاری ایده‌آل', paragraphs: [meta.ideal], bullets: [] },
    { title: 'نقاط قوت کلیدی', paragraphs: [], bullets: meta.strength },
    { title: 'ریسک‌های رفتاری', paragraphs: [], bullets: meta.risk }
  ];

  const fit = jobFitDisc(dom, domP, positionText);
  return {
    hero: {
      badge: 'آزمون DISC',
      title: 'سبک رفتاری: ' + meta.nickname,
      subtitle: 'الگوی غالب رفتار سازمانی شما بر اساس پاسخ‌های ۲۸ سوال',
      scoreText: 'شاخص غالب: ' + dom + ' — ' + domP + '٪',
      levelLabel: LEVEL_FA[levelOf(domP)]
    },
    dimensions, sections, fit,
    tips: [
      'در جلسات، ابتدا سبک ارتباطی مخاطب را شناسایی کنید و سپس با همان سبک گفت‌وگو کنید.',
      'برای سبک ' + dom + '، تعریف نقش و اختیار شفاف در بهره‌وری شما تعیین‌کننده است.',
      'نقاط ریسک (' + meta.risk[0] + ') را با یک همکار معتمد در میان بگذارید تا بازخورد بگیرید.'
    ],
    redFlags: meta.risk,
    questionMap: result.answers.map(a => {
      const q = questions.find(x => x.number === a.number) || {};
      return {
        number: a.number, text: q.text || '', value: a.value,
        answerLabel: (testData.LIKERT5[a.value - 1] || ''),
        dimension: a.dimension, dimName: DISC_META[a.dimension].nickname,
        reversed: a.reverse
      };
    }),
    counts: ['D', 'I', 'S', 'C'].map(k => ({ key: k, name: DISC_META[k].nickname, raw: result.dims[k] ? result.dims[k].raw : 0, percent: p[k] || 0 }))
  };
}

function jobFitDisc(dom, domP, positionText) {
  const t = (positionText || '').toLowerCase();
  const map = [
    { re: /(مدیر|سرپرست|رهبر|مدیریت)/, d: 'D', note: 'نقش‌های مدیریتی با سبک D هماهنگی بالایی دارند.' },
    { re: /(فروش|بازاریاب|بازاریابی|روابط عمومی|برند)/, d: 'I', note: 'فروش و بازاریابی به سبک I نیاز دارد.' },
    { re: /(پشتیبانی|خدمات|منابع انسانی|آموزش|مربی|امور اداری)/, d: 'S', note: 'خدمات و حمایت با سبک S سازگار است.' },
    { re: /(مالی|حسابدار|کیفیت|داده|برنامه‌نویس|تحلیل|ممیزی|انطباق|فنی|نرم‌افزار)/, d: 'C', note: 'نقش‌های تخصصی/دقیق با سبک C هم‌خوان است.' }
  ];
  const hit = map.find(m => m.re.test(t));
  const score = hit ? (hit.d === dom ? 88 : (domP >= 55 ? 62 : 48)) : 65;
  return {
    score,
    levelLabel: score >= 80 ? 'سازگاری بالا' : score >= 60 ? 'سازگاری نسبی' : 'نیازمند بررسی',
    position: positionText || '—',
    bullets: [
      hit ? hit.note : 'برای این موقعیت شغلی، سبک ' + dom + ' شما ' + (domP >= 55 ? 'مزیت محسوب می‌شود' : 'قابل قبول است') + '.',
      'مشاغل هماهنگ با سبک شما: ' + DISC_META[dom].fitRoles + '.',
      DISC_META[dom].fitNote
    ]
  };
}

/* ─────────────── EQ ─────────────── */
const EQ_META = {
  SA: {
    high: 'شناخت دقیقی از هیجان‌ها و واکنش‌های خود دارید و این خودآگاهی، پایه تصمیم‌های سالم شماست.',
    mid: 'خودآگاهی قابل قبولی دارید؛ گاهی در لحظه، احساس واقعی خود را دیر تشخیص می‌دهید.',
    low: 'تشخیص به‌موقع هیجان‌ها برایتان دشوار است؛ ژورنال روزانه هیجان می‌تواند کمک‌کننده باشد.',
    dev: 'هر شب ۵ دقیقه هیجان غالب روز و دلیل آن را یادداشت کنید.'
  },
  SR: {
    high: 'در مدیریت خشم، استرس و تکانه‌ها توانمندید و در بحران‌ها آرامش خود را حفظ می‌کنید.',
    mid: 'معمولاً خود را کنترل می‌کنید؛ در فشارهای شدید ممکن است کنترل کاهش یابد.',
    low: 'واکنش‌های هیجانی شدید گاهی بر تصمیم‌ها و روابط‌تان سایه می‌اندازد.',
    dev: 'تکنیک مکث ۱۰ ثانیه‌ای پیش از پاسخ در موقعیت‌های تنش‌زا را تمرین کنید.'
  },
  M: {
    high: 'انگیزه درونی قوی، پشتکار و خوش‌بینی از ویژگی‌های بارز شماست.',
    mid: 'انگیزه خوبی دارید؛ در پروژه‌های بلندمدت بدون بازخورد، ممکن است افت کنید.',
    low: 'پشتکار در برابر موانع نیازمند تقویت است؛ اهداف کوچک و قابل‌اندازه‌گیری تعریف کنید.',
    dev: 'یک هدف ۳۰ روزه با معیار سنجش مشخص تعریف و پیشرفت آن را ثبت کنید.'
  },
  EM: {
    high: 'درک احساسات دیگران و همدلی از نقاط قوت برجسته شما در کار تیمی است.',
    mid: 'همدلی متعادلی دارید؛ در شرایط پرفشار ممکن است کمتر به اطرافیان توجه کنید.',
    low: 'درک احساسات دیگران نیازمند توجه آگاهانه‌تری است.',
    dev: 'در گفت‌وگوها، پیش از پاسخ دادن، احساس طرف مقابل را بازتاب دهید.'
  },
  SS: {
    high: 'مهارت ارتباط‌سازی، مذاکره و مدیریت تعارض در سطح بالایی قرار دارد.',
    mid: 'تعاملات اجتماعی خوبی دارید؛ در تعارض‌های پیچیده ممکن است نیاز به مهارت بیشتر باشد.',
    low: 'ارتباط‌سازی و همکاری گروهی نیازمند تمرین بیشتر است.',
    dev: 'در جلسات تیمی، فعالانه نظر یک نفر را جویا شوید و بازخورد سازنده بدهید.'
  }
};
const EQ_NAMES = { SA: 'خودآگاهی', SR: 'خودتنظیمی', M: 'انگیزه درونی', EM: 'همدلی', SS: 'مهارت اجتماعی' };

function analyzeEq(result, questions, positionText) {
  const p = result.percents;
  const overall = Math.round(['SA', 'SR', 'M', 'EM', 'SS'].reduce((s, k) => s + (p[k] || 0), 0) / 5);
  const oLevel = levelOf(overall);
  const order = ['SA', 'SR', 'M', 'EM', 'SS'].sort((a, b) => (p[b] || 0) - (p[a] || 0));
  const best = order[0], weak = order[order.length - 1];

  const dimensions = order.map(k => {
    const lv = levelOf(p[k] || 0);
    return {
      key: k, name: EQ_NAMES[k], percent: p[k] || 0, level: lv, levelLabel: LEVEL_FA[lv],
      desc: (testData.TESTS[1].dimensions.find(d => d.key === k) || {}).desc || '',
      note: k === best ? 'قوی‌ترین مؤلفه' : (k === weak ? 'نیازمند توجه' : '')
    };
  });

  const sections = [
    {
      title: 'برداشت کلی',
      paragraphs: [
        overall >= 75 ? 'هوش هیجانی شما در سطح بالایی قرار دارد؛ در کار تیمی، مدیریت فشار و ارتباط با مشتری مزیت بزرگی محسوب می‌شود.' :
        overall >= 60 ? 'هوش هیجانی خوبی دارید و در اکثر موقعیت‌های سازمانی عملکرد سالمی خواهید داشت.' :
        overall >= 45 ? 'هوش هیجانی شما در مسیر رشد است؛ تقویت مؤلفه‌های ضعیف‌تر تأثیر محسوسی در عملکرد حرفه‌ای دارد.' :
        'برای عملکرد بهتر در محیط‌های کاری تیمی، تقویت هوش هیجانی پیشنهاد جدی می‌شود.'
      ],
      bullets: ['قوی‌ترین مؤلفه: ' + EQ_NAMES[best] + ' (' + (p[best] || 0) + '٪)', 'مؤلفه نیازمند توجه: ' + EQ_NAMES[weak] + ' (' + (p[weak] || 0) + '٪)']
    },
    { title: 'تحلیل مؤلفه‌ها', paragraphs: order.map(k => EQ_NAMES[k] + ': ' + EQ_META[k][levelOf(p[k] || 0) === 'high' ? 'high' : levelOf(p[k] || 0) === 'low' ? 'low' : 'mid']), bullets: [] },
    { title: 'برنامه توسعه فردی', paragraphs: [], bullets: order.slice(-2).reverse().map(k => EQ_NAMES[k] + ' — ' + EQ_META[k].dev) },
    {
      title: 'کاربرد در محیط کار',
      paragraphs: ['از مؤلفه «' + EQ_NAMES[best] + '» به‌عنوان مزیت رقابتی خود در تیم استفاده کنید و مسئولیت‌هایی متناسب با آن بپذیرید.'],
      bullets: []
    }
  ];

  return {
    hero: {
      badge: 'هوش هیجانی (EQ)',
      title: 'سطح هوش هیجانی: ' + LEVEL_FA[oLevel] + ' — ' + overall + '٪',
      subtitle: 'بر اساس ۵ مؤلفه مدل ترکیبی هوش هیجانی (۲۵ سوال)',
      scoreText: 'شاخص کلی: ' + overall + ' از ۱۰۰',
      levelLabel: LEVEL_FA[oLevel]
    },
    dimensions, sections,
    fit: {
      score: overall,
      levelLabel: overall >= 75 ? 'سازگاری بالا' : overall >= 55 ? 'سازگاری نسبی' : 'نیازمند بررسی',
      position: positionText || '—',
      bullets: [
        'هوش هیجانی بالا در نقش‌های تعاملی (فروش، خدمات، منابع انسانی، مدیریت تیم) ارزش ویژه‌ای دارد.',
        'برای موقعیت «' + (positionText || '—') + '»، مؤلفه ' + EQ_NAMES[best] + ' شما مزیت محسوب می‌شود.',
        'با تقویت ' + EQ_NAMES[weak] + '، آمادگی شما برای سطوح بالاتر شغلی افزایش می‌یابد.'
      ]
    },
    tips: [EQ_META[weak].dev, 'در مصاحبه، مثال واقعی از مدیریت یک موقعیت هیجانی سخت در کار تعریف کنید.', 'برای حفظ تعادل، الگوی خواب و استراحت خود را جدی بگیرید.'],
    redFlags: overall < 45 ? ['احتمال بروز تنش در کارهای تیمی پرفشار', 'نیاز به پایش رشد مهارت‌های ارتباطی در دوره آزمایشی'] : [],
    questionMap: result.answers.map(a => {
      const q = questions.find(x => x.number === a.number) || {};
      return {
        number: a.number, text: q.text || '', value: a.value,
        answerLabel: (testData.LIKERT5[a.value - 1] || ''),
        dimension: a.dimension, dimName: EQ_NAMES[a.dimension], reversed: a.reverse
      };
    }),
    counts: ['SA', 'SR', 'M', 'EM', 'SS'].map(k => ({ key: k, name: EQ_NAMES[k], raw: result.dims[k] ? result.dims[k].raw : 0, percent: p[k] || 0 }))
  };
}

/* ─────────────── Holland ─────────────── */
const HOLLAND_META = {
  R: { name: 'واقع‌گرا', env: 'کارگاه، طبیعت، فضای فنی و عملی', jobs: 'مهندسی، تعمیرات، تولید، کشاورزی، اجرا و نصب', style: 'عمل‌گرا، مستقیم و کم‌حاشیه' },
  I: { name: 'پژوهشگر', env: 'آزمایشگاه، فضای تحقیق و تحلیل', jobs: 'پژوهش، تحلیل داده، برنامه‌نویسی، پزشکی، مشاوره تخصصی', style: 'کنجکاو، تحلیل‌گر و مستقل' },
  A: { name: 'هنری', env: 'استودیو، فضای خلاق و منعطف', jobs: 'طراحی، محتوا، معماری داخلی، رسانه، آموزش هنر', style: 'خلاق، آزاداندیش و بیان‌گر' },
  S: { name: 'اجتماعی', env: 'تیم‌های انسانی، فضای آموزش و مشاوره', jobs: 'آموزش، مشاوره، منابع انسانی، مراقبت سلامت، خدمات مشتری', style: 'همدل، حمایت‌گر و ارتباطی' },
  E: { name: 'کارآفرین', env: 'کسب‌وکار، فروش و فضای رقابتی', jobs: 'مدیریت، فروش، بازاریابی، کارآفرینی، حقوقی-مذاکره', style: 'پرانرژی، متقاعدکننده و هدف‌محور' },
  C: { name: 'سازمان‌یافته', env: 'دفاتر منظم، فرایندهای استاندارد', jobs: 'امور مالی، اداری، کنترل کیفیت، داده‌کاوی اداری، ممیزی', style: 'منظم، دقیق و قابل‌اتکا' }
};
const HOLLAND_ORDER = ['R', 'I', 'A', 'S', 'E', 'C'];

function analyzeHolland(result, questions, positionText) {
  const p = result.percents;
  const order = [...HOLLAND_ORDER].sort((a, b) => (p[b] || 0) - (p[a] || 0));
  const code = order.slice(0, 3).join('');
  const top = order[0];

  const dimensions = HOLLAND_ORDER.map(k => {
    const lv = levelOf(p[k] || 0);
    return {
      key: k, name: HOLLAND_META[k].name + ' (' + k + ')', percent: p[k] || 0, level: lv, levelLabel: LEVEL_FA[lv],
      desc: (testData.TESTS[2].dimensions.find(d => d.key === k) || {}).desc || '',
      note: k === top ? 'قوی‌ترین علاقه' : ''
    };
  });

  const sections = [
    {
      title: 'کد علایق شغلی شما: ' + code,
      paragraphs: ['ترکیب سه علاقه برتر شما (' + order.slice(0, 3).map(k => HOLLAND_META[k].name).join('، ') + ') نشان می‌دهد در محیط‌هایی رشد می‌کنید که ' + HOLLAND_META[order[0]].env + ' را با عناصری از ' + HOLLAND_META[order[1]].env + ' ترکیب کنند.'],
      bullets: order.slice(0, 3).map((k, i) => (i + 1) + '. ' + HOLLAND_META[k].name + ' (' + k + '): ' + (p[k] || 0) + '٪ — ' + HOLLAND_META[k].style)
    },
    {
      title: 'محیط کاری هماهنگ با شما',
      paragraphs: ['شما در ' + HOLLAND_META[top].env + ' بیشترین انگیزه و رضایت شغلی را تجربه می‌کنید.'],
      bullets: order.slice(0, 3).map(k => HOLLAND_META[k].env)
    },
    {
      title: 'مشاغل پیشنهادی',
      paragraphs: [],
      bullets: order.slice(0, 3).map(k => HOLLAND_META[k].name + ': ' + HOLLAND_META[k].jobs)
    },
    {
      title: 'علایق کم‌تر',
      paragraphs: ['حوزه‌های ' + order.slice(-2).map(k => HOLLAND_META[k].name).join(' و ') + ' علاقه کمتری در شما ایجاد می‌کنند؛ مسئولیت‌های سنگین در این حوزه‌ها می‌تواند به مرور انگیزه شما را کاهش دهد.'],
      bullets: []
    }
  ];

  return {
    hero: {
      badge: 'علایق شغلی هالند',
      title: 'کد RIASEC شما: ' + code,
      subtitle: HOLLAND_META[top].name + ' — ' + HOLLAND_META[top].style,
      scoreText: 'قوی‌ترین علاقه: ' + HOLLAND_META[top].name + ' (' + (p[top] || 0) + '٪)',
      levelLabel: LEVEL_FA[levelOf(p[top] || 0)]
    },
    dimensions, sections,
    fit: {
      score: Math.round(((p[order[0]] || 0) + (p[order[1]] || 0)) / 2),
      levelLabel: 'بر اساس علایق',
      position: positionText || '—',
      bullets: [
        'موقعیت «' + (positionText || '—') + '» ' + hollandFitLine(code, positionText),
        'مشاغل هماهنگ: ' + HOLLAND_META[top].jobs + '.',
        'در مصاحبه، از تجربه‌هایی بگویید که در آن‌ها از علاقه «' + HOLLAND_META[top].name + '» استفاده کرده‌اید.'
      ]
    },
    tips: ['در انتخاب مسیر شغلی، هم‌پوشانی علایق سه‌گانه (' + code + ') را معیار قرار دهید نه فقط یک علاقه.', 'برای رشد، سالی یک مهارت در حوزه ' + HOLLAND_META[top].name + ' بیاموزید.'],
    redFlags: [],
    questionMap: result.answers.map(a => {
      const q = questions.find(x => x.number === a.number) || {};
      return {
        number: a.number, text: q.text || '', value: a.value,
        answerLabel: (testData.INTEREST5[a.value - 1] || ''),
        dimension: a.dimension, dimName: HOLLAND_META[a.dimension].name, reversed: a.reverse
      };
    }),
    counts: HOLLAND_ORDER.map(k => ({ key: k, name: HOLLAND_META[k].name, raw: result.dims[k] ? result.dims[k].raw : 0, percent: p[k] || 0 }))
  };
}

function hollandFitLine(code, positionText) {
  const t = (positionText || '').toLowerCase();
  const expect = [];
  if (/(نرم‌افزار|برنامه|داده|تحلیل|فنی|IT)/.test(t)) expect.push('I', 'C');
  if (/(فروش|بازاریاب|کارآفرین|مدیر)/.test(t)) expect.push('E', 'I');
  if (/(منابع انسانی|آموزش|پشتیبانی|خدمات)/.test(t)) expect.push('S', 'E');
  if (/(طراح|محتوا|رسانه|گرافیک)/.test(t)) expect.push('A', 'E');
  if (/(مالی|حسابدار|اداری|کیفیت)/.test(t)) expect.push('C', 'I');
  if (!expect.length) return 'با کد علایق شما قابل بررسی است.';
  const match = expect.some(e => code.includes(e));
  return match
    ? 'با کد علایق شما (' + code + ') هم‌خوانی دارد؛ چون علاقه‌های ' + expect.map(e => HOLLAND_META[e].name).join(' و ') + ' در پروفایل شما دیده می‌شود.'
    : 'هم‌پوشانی محدودی با کد علایق شما (' + code + ') دارد؛ پیش از تصمیم نهایی، جزئیات نقش را بررسی کنید.';
}

/* ─────────────── تحلیل‌گر یکپارچه ─────────────── */
function analyze(testCode, result, questions, positionText) {
  if (testCode === 'disc') return analyzeDisc(result, questions, positionText);
  if (testCode === 'eq') return analyzeEq(result, questions, positionText);
  if (testCode === 'holland') return analyzeHolland(result, questions, positionText);
  return null;
}

/** خلاصه کوتاه نتیجه برای نمایش در لیست‌ها و کارت‌ها */
function quickSummary(testCode, result) {
  const p = result.percents;
  if (testCode === 'disc') {
    const order = ['D', 'I', 'S', 'C'].sort((a, b) => (p[b] || 0) - (p[a] || 0));
    return { label: DISC_META[order[0]].nickname + ' (' + order[0] + ')', percent: p[order[0]] || 0, extra: 'ثانویه: ' + order[1] };
  }
  if (testCode === 'eq') {
    const overall = Math.round(['SA', 'SR', 'M', 'EM', 'SS'].reduce((s, k) => s + (p[k] || 0), 0) / 5);
    return { label: 'هوش هیجانی ' + LEVEL_FA[levelOf(overall)], percent: overall, extra: '' };
  }
  if (testCode === 'holland') {
    const order = [...HOLLAND_ORDER].sort((a, b) => (p[b] || 0) - (p[a] || 0));
    return { label: 'کد RIASEC: ' + order.slice(0, 3).join(''), percent: p[order[0]] || 0, extra: HOLLAND_META[order[0]].name };
  }
  return { label: '', percent: 0, extra: '' };
}

module.exports = { score, analyze, quickSummary, LEVEL_FA, levelOf };
