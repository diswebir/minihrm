/**
 * آزمون روان‌شناسی شخصیتی (MBTI) — ۲۸ سؤال
 * ------------------------------------------------------------------
 * استخراج‌شده از فایل «آزمون روانشناسی شخصیتی.docx» شرکت.
 *
 * شیوه نمره‌گذاری (مطابق ستون «تحلیل» فایل اصلی):
 *   گزینه «الف» → حرف اول ستون تحلیل، گزینه «ب» → حرف دوم.
 *   مثال سؤال ۱۵: الف→T و ب→F  (سؤال ۱۵ در متن اصلی برعکس سایر سؤالات است
 *   و همین کدها در این فایل رعایت شده‌اند.)
 *   سؤال ۲۵: الف→I و ب→E
 *
 * شیوه امتیازدهی: در هر بُعد، حرفی که امتیاز بیشتری بگیرد تیپ نهایی را می‌سازد.
 * نزدیکی امتیازها (اختلاف ۱ یا ۲) به‌عنوان «مرزی» علامت‌گذاری می‌شود.
 */
'use strict';

const DIMENSIONS = {
  E: { key: 'E', pair: 'E/I', pole: 'برون‌گرا (Extrovert)', short: 'برون‌گرا', color: 'peach', icon: 'sun' },
  I: { key: 'I', pair: 'E/I', pole: 'درون‌گرا (Introvert)', short: 'درون‌گرا', color: 'sky', icon: 'moon' },
  S: { key: 'S', pair: 'S/N', pole: 'واقع‌گرا (Sensing)', short: 'واقع‌گرا', color: 'mint', icon: 'eye' },
  N: { key: 'N', pair: 'S/N', pole: 'خلاق / شهودی (Intuitive)', short: 'شهودی', color: 'violet', icon: 'sparkles' },
  T: { key: 'T', pair: 'T/F', pole: 'متفکر (Thinking)', short: 'متفکر', color: 'lemon', icon: 'brain' },
  F: { key: 'F', pair: 'T/F', pole: 'احساسی (Feeling)', short: 'احساسی', color: 'rose', icon: 'heart' },
  J: { key: 'J', pair: 'J/P', pole: 'منضبط (Judging)', short: 'منضبط', color: 'violet', icon: 'calendar-check' },
  P: { key: 'P', pair: 'J/P', pole: 'ملاحظه‌کار (Perceiving)', short: 'ملاحظه‌کار', color: 'sky', icon: 'compass' }
};

const PAIRS = [
  { a: 'E', b: 'I', title: 'منبع انرژی (برون‌گرایی / درون‌گرایی)', description: 'اینکه انرژی خود را از تعامل با دیگران می‌گیرید یا از تنهایی و دنیای درون.' },
  { a: 'S', b: 'N', title: 'دریافت اطلاعات (واقع‌گرایی / شهود)', description: 'اینکه به داده‌های ملموس و تجربه اتکا می‌کنید یا به الگوها، ایده‌ها و آینده.' },
  { a: 'T', b: 'F', title: 'تصمیم‌گیری (تفکر / احساس)', description: 'اینکه تصمیم‌ها را بر پایه منطق و تحلیل می‌گیرید یا بر پایه ارزش‌ها و تأثیر بر انسان‌ها.' },
  { a: 'J', b: 'P', title: 'سبک زندگی (انضباط / انعطاف)', description: 'اینکه ترجیح می‌دهید برنامه‌ریزی‌شده پیش بروید یا انعطاف‌پذیر و در لحظه.' }
];

/** ۲۸ سؤال آزمون با کدهای تحلیلی */
const QUESTIONS = [
  {
    no: 1,
    text: 'من علاقه به توسعه عقایدم از طریق ................ دارم.',
    options: [
      { label: 'گفت‌وگو و تبادل نظر', code: 'E' },
      { label: 'تأمل و بررسی فردی', code: 'I' }
    ]
  },
  {
    no: 2,
    text: 'معمولاً با چه نوع افرادی راحت‌تر ارتباط برقرار می‌کنم؟',
    options: [
      { label: 'کسانی که خلاق و آینده‌نگرند', code: 'N' },
      { label: 'کسانی که واقع‌گرا و عمل‌گرا هستند', code: 'S' }
    ]
  },
  {
    no: 3,
    text: 'در تعامل با دیگران، بیشتر به چه چیزی توجه می‌کنم؟',
    options: [
      { label: 'احساسات و نیازهای عاطفی افراد', code: 'F' },
      { label: 'اصول، قوانین و حقوق هر فرد', code: 'T' }
    ]
  },
  {
    no: 4,
    text: 'وقتی از من درخواست شود پروژه‌ای را انجام دهم، ترجیح می‌دهم:',
    options: [
      { label: 'به اتمام و تکمیل پروژه فکر کنم', code: 'J' },
      { label: 'روی فرآیند و یا مراحل عملیاتی پروژه تمرکز کنم', code: 'P' }
    ]
  },
  {
    no: 5,
    text: 'محیط کاری مطلوبم محیطی است که:',
    options: [
      { label: 'متنوع، پرتحرک و پویا باشد', code: 'E' },
      { label: 'آرام و مناسب تمرکز باشد', code: 'I' }
    ]
  },
  {
    no: 6,
    text: 'در انجام کار گروهی معمولاً:',
    options: [
      { label: 'روش پذیرفته‌شده گروه را دنبال می‌کنم', code: 'S' },
      { label: 'ترجیح می‌دهم روش خود را ارائه و اجرا کنم', code: 'N' }
    ]
  },
  {
    no: 7,
    text: 'تصمیم‌گیری‌هایم معمولاً بیشتر تحت تأثیر کدام مورد است؟',
    options: [
      { label: 'ملاحظات شخصی و انسانی', code: 'F' },
      { label: 'تحلیل منطقی و واقع‌بینانه', code: 'T' }
    ]
  },
  {
    no: 8,
    text: 'در تصمیم‌گیری:',
    options: [
      { label: 'سریع نتیجه‌گیری می‌کنم', code: 'J' },
      { label: 'تصمیم را عقب می‌اندازم تا گزینه‌های بیشتری را بررسی کنم', code: 'P' }
    ]
  },
  {
    no: 9,
    text: 'هنگام کار کردن ترجیح می‌دهم:',
    options: [
      { label: 'دیگران در اطرافم باشند', code: 'E' },
      { label: 'تنها باشم و کسی نزدیکم نشود', code: 'I' }
    ]
  },
  {
    no: 10,
    text: 'چه عاملی بیشتر باعث ناخشنودی شما می‌شود؟',
    options: [
      { label: 'نظریه‌ها و ایده‌های بسیار انتزاعی', code: 'S' },
      { label: 'کار با افرادی که به مفاهیم نظری توجه نمی‌کنند', code: 'N' }
    ]
  },
  {
    no: 11,
    text: 'در بسیاری از موقعیت‌ها:',
    options: [
      { label: 'احساساتم تصمیمم را جهت می‌دهد', code: 'F' },
      { label: 'تحلیل‌های ذهنی‌ام تصمیم را تعیین می‌کند', code: 'T' }
    ]
  },
  {
    no: 12,
    text: 'احساس راحت‌تری دارم اگر:',
    options: [
      { label: 'موضوعات را هرچه زودتر تجزیه و تحلیل کرده و به نتیجه‌گیری برسم', code: 'J' },
      { label: 'موضوعات را در لحظه‌های آخر تصمیم‌گیری کنم تا بتوانم تغییرات مورد نیاز را ایجاد کنم', code: 'P' }
    ]
  },
  {
    no: 13,
    text: 'من موضوعات جدید را از طریق ................ یاد می‌گیرم.',
    options: [
      { label: 'صحبت کردن و انجام دادن', code: 'E' },
      { label: 'مطالعه و تفکر کردن', code: 'I' }
    ]
  },
  {
    no: 14,
    text: 'کدام ویژگی برایم ارزشمندتر است؟',
    options: [
      { label: 'رویاپردازی و نگاه بلندمدت', code: 'N' },
      { label: 'واقع‌گرایی و توجه به امور ملموس', code: 'S' }
    ]
  },
  {
    no: 15,
    text: 'کدام‌یک از دو عمل زیر کمتر اهمیت دارد؟',
    options: [
      { label: 'ابراز صمیمیت زیاد', code: 'T' },
      { label: 'حفظ فاصله احساسی و عدم همدلی', code: 'F' }
    ]
  },
  {
    no: 16,
    text: 'بهترین عملکردم زمانی است که:',
    options: [
      { label: 'کار خود را برنامه‌ریزی کرده و طبق آن عمل کنم', code: 'J' },
      { label: 'امکان تغییر و انعطاف همراه کار وجود داشته باشد', code: 'P' }
    ]
  },
  {
    no: 17,
    text: 'اغلب اوقات من:',
    options: [
      { label: 'اول صحبت می‌کنم و بعداً راجع به آن فکر می‌کنم', code: 'E' },
      { label: 'قبل از صحبت یا عمل، ابتدا راجع به آن فکر می‌کنم', code: 'I' }
    ]
  },
  {
    no: 18,
    text: 'اگر معلم بودم، ترجیح می‌دادم تدریس موضوعاتی را بر عهده بگیرم که:',
    options: [
      { label: 'شامل مفاهیم و نظریه‌ها هستند', code: 'N' },
      { label: 'مبتنی بر اطلاعات واقعی و قابل مشاهده‌اند', code: 'S' }
    ]
  },
  {
    no: 19,
    text: 'کدام مفهوم برایم مهم‌تر است؟',
    options: [
      { label: 'همدلی', code: 'F' },
      { label: 'دورنگری و تحلیل آینده', code: 'T' }
    ]
  },
  {
    no: 20,
    text: 'بیشتر اوقات:',
    options: [
      { label: 'تلاش می‌کنم کارها را قبل از موعد انجام دهم', code: 'J' },
      { label: 'معمولاً در فشار زمان بهتر عمل می‌کنم', code: 'P' }
    ]
  },
  {
    no: 21,
    text: 'ترجیح می‌دهم با دیگران از طریق ................ ارتباط برقرار کنم.',
    options: [
      { label: 'صحبت کردن', code: 'E' },
      { label: 'نامه نوشتن', code: 'I' }
    ]
  },
  {
    no: 22,
    text: 'کدام واژه برایم جذاب‌تر است؟',
    options: [
      { label: 'تولید و اجرا', code: 'S' },
      { label: 'طراحی و ابداع', code: 'N' }
    ]
  },
  {
    no: 23,
    text: 'کدام ارزش برایم مهم‌تر است؟',
    options: [
      { label: 'عدالت', code: 'T' },
      { label: 'دل‌رحمی', code: 'F' }
    ]
  },
  {
    no: 24,
    text: 'اغلب اوقات من ................ هستم.',
    options: [
      { label: 'رسمی و جدی', code: 'J' },
      { label: 'غیررسمی و خودمانی', code: 'P' }
    ]
  },
  {
    no: 25,
    text: 'در یک محفل اجتماعی با کسانی معاشرت می‌کنم که:',
    options: [
      { label: 'از قبل آن‌ها را می‌شناسم', code: 'I' },
      { label: 'قبلاً با آن‌ها آشنایی نداشته‌ام', code: 'E' }
    ]
  },
  {
    no: 26,
    text: 'کدام مورد برایم بنیادی‌تر است؟',
    options: [
      { label: 'ایده‌ها و امکانات', code: 'N' },
      { label: 'واقعیات و داده‌های ملموس', code: 'S' }
    ]
  },
  {
    no: 27,
    text: 'کدام لغت اهمیت بیشتری دارد؟',
    options: [
      { label: 'انعطاف‌پذیری', code: 'F' },
      { label: 'قاطع بودن', code: 'T' }
    ]
  },
  {
    no: 28,
    text: 'قبل از رفتن به سفر:',
    options: [
      { label: 'مایل هستم همه چیز برنامه‌ریزی شده باشد', code: 'J' },
      { label: 'مایل هستم انعطاف‌پذیر باشم و در لحظه‌های آخر تصمیم بگیرم', code: 'P' }
    ]
  }
];

/**
 * محاسبه نتیجه آزمون
 * @param {object} answers نقشه‌ای از شماره سؤال → «الف» یا «ب» یا کد حرف
 */
function score(answers) {
  const scores = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
  const perQuestion = [];
  let answered = 0;

  for (const q of QUESTIONS) {
    const raw = answers[String(q.no)] !== undefined ? answers[String(q.no)] : answers[q.no];
    let code = null;
    if (raw === undefined || raw === null || raw === '') {
      perQuestion.push({ no: q.no, answered: false, code: null });
      continue;
    }
    const val = String(raw).trim();
    if (val === 'a' || val === 'الف' || val === 'الف)' || val === '1' || val === 'گزینه الف') code = q.options[0].code;
    else if (val === 'b' || val === 'ب' || val === 'ب)' || val === '2' || val === 'گزینه ب') code = q.options[1].code;
    else if (scores[val] !== undefined) code = val;
    else {
      // اگر متن گزینه ذخیره شده باشد
      const idx = q.options.findIndex((o) => o.label === val);
      if (idx > -1) code = q.options[idx].code;
    }
    if (code && scores[code] !== undefined) {
      scores[code] += 1;
      answered += 1;
    }
    perQuestion.push({ no: q.no, answered: !!code, code });
  }

  const dimensions = PAIRS.map((pair) => {
    const aScore = scores[pair.a];
    const bScore = scores[pair.b];
    const total = aScore + bScore;
    const winner = aScore === bScore ? null : (aScore > bScore ? pair.a : pair.b);
    const margin = Math.abs(aScore - bScore);
    return {
      pair: `${pair.a}/${pair.b}`,
      title: pair.title,
      description: pair.description,
      a: pair.a, b: pair.b,
      aScore, bScore, total,
      winner,
      margin,
      // درصد تمایل به قطب اول
      aPercent: total ? Math.round((aScore / total) * 100) : 50,
      bPercent: total ? 100 - Math.round((aScore / total) * 100) : 50,
      strength: margin >= 4 ? 'قوی' : margin >= 2 ? 'متوسط' : 'مرزی',
      borderline: margin <= 1
    };
  });

  let type = '';
  for (const d of dimensions) {
    if (d.winner) type += d.winner;
    else type += d.a; // در حالت تساوی، قطب اول
  }

  const borderlineDims = dimensions.filter((d) => d.borderline && d.total > 0);
  return {
    type: type.length === 4 ? type : null,
    scores,
    dimensions,
    perQuestion,
    answered,
    total: QUESTIONS.length,
    complete: answered === QUESTIONS.length,
    borderline: borderlineDims.map((d) => d.pair),
    borderlineNote: borderlineDims.length
      ? `در ${borderlineDims.map((d) => d.pair).join('، ')} اختلاف امتیاز حداکثر یک پاسخ است؛ تفسیر این ابعاد باید با احتیاط انجام شود.`
      : 'در هیچ بُعدی اختلاف امتیاز مرزی مشاهده نشد.'
  };
}

module.exports = { QUESTIONS, DIMENSIONS, PAIRS, score, TOTAL: QUESTIONS.length };
