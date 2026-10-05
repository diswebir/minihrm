/**
 * فرم استخدام پیش‌فرض — استخراج‌شده از فایل «فرم استخدام.xlsx» شرکت
 * ------------------------------------------------------------------
 * این ساختار کاملاً قابل ویرایش در پنل (فرم‌ساز) است و مدیر می‌تواند
 * مراحل، فیلدها و اجباری‌بودن هر مورد را تغییر دهد.
 *
 * انواع فیلد: text | textarea | number | currency | tel | email | date | select |
 *             radio | checkbox | switch | file | table | heading | note | rating | url
 */
'use strict';

const OPTIONS = {
  religion: ['اسلام', 'مسیحیت', 'زرتشتی', 'سایر'],
  mazhab: ['شیعه', 'سنی', 'سایر'],
  marital: ['مجرد', 'متاهل', 'سایر'],
  military: ['پایان خدمت', 'معافیت', 'مشمول', 'مشمول / در حال خدمت'],
  yesNo: ['بله', 'خیر'],
  insurance: ['دارد', 'ندارد'],
  degree: ['دیپلم', 'کاردانی', 'کارشناسی', 'کارشناسی ارشد', 'دکتری', 'سایر'],
  languageLevel: ['بسیار خوب', 'خوب', 'متوسط', 'ضعیف'],
  softwareLevel: ['عالی', 'خوب', 'متوسط', 'ضعیف'],
  certificate: ['مدرک دارد', 'مدرک ندارد'],
  cooperation: ['تمام‌وقت', 'پاره‌وقت', 'دورکاری', 'پروژه‌ای'],
  overtime: [
    'بله، آمادگی کامل دارم',
    'بله، در شرایط خاص و با اطلاع قبلی',
    'خیر، امکان اضافه‌کاری ندارم'
  ],
  missions: [
    'فقط مأموریت‌های کوتاه‌مدت داخلی (چند روز تا چند هفته)',
    'مأموریت‌های کوتاه‌مدت و بلندمدت داخلی (چند روز تا چند ماه)',
    'فقط مأموریت‌های کوتاه‌مدت خارجی (چند روز تا چند هفته)',
    'مأموریت‌های کوتاه‌مدت و بلندمدت خارجی (چند روز تا چند ماه)',
    'امکان انجام مأموریت کاری را ندارم'
  ],
  howFound: ['معرفی دوستان و آشنایان', 'کارمندان شرکت', 'آگهی اینترنتی', 'شبکه‌های اجتماعی', 'سایت شرکت', 'نمایشگاه و رویداد', 'سایر'],
  relation: ['پدر', 'مادر', 'همسر', 'خواهر', 'برادر', 'همکار سابق', 'استاد', 'دوست', 'سایر']
};

function defaultForm() {
  return {
    key: 'default',
    title: 'فرم استخدام',
    code: 'OF-FR-01-03',
    version: 1,
    isDefault: true,
    description: 'فرم جامع استخدام شرکت — مطابق مستند OF-FR-01-03',
    updatedAt: new Date().toISOString(),
    steps: [
      {
        key: 'personal',
        title: 'مشخصات فردی',
        icon: 'user',
        description: 'اطلاعات هویتی خود را دقیقاً مطابق مدارک وارد کنید.',
        fields: [
          { name: 'firstName', label: 'نام', type: 'text', required: true, col: 6, placeholder: 'مثال: علی' },
          { name: 'lastName', label: 'نام خانوادگی', type: 'text', required: true, col: 6, placeholder: 'مثال: محمدی' },
          { name: 'fatherName', label: 'نام پدر', type: 'text', required: true, col: 6 },
          { name: 'nationalId', label: 'کد ملی', type: 'text', required: true, col: 6, help: '۱۰ رقم بدون خط تیره', validate: 'nationalId', inputMode: 'numeric' },
          { name: 'idNumber', label: 'شماره شناسنامه', type: 'text', required: false, col: 6, inputMode: 'numeric' },
          { name: 'birthDate', label: 'تاریخ تولد', type: 'date', required: true, col: 6, help: 'تاریخ شمسی — مثال: 1375/05/12' },
          { name: 'birthPlace', label: 'محل صدور شناسنامه', type: 'text', required: false, col: 6 },
          { name: 'religion', label: 'دین', type: 'select', required: false, col: 3, options: OPTIONS.religion },
          { name: 'mazhab', label: 'مذهب', type: 'select', required: false, col: 3, options: OPTIONS.mazhab },
          { name: 'photo', label: 'عکس پرسنلی', type: 'file', required: false, col: 6, accept: 'image', help: 'فرمت jpg یا png — حداکثر ۵ مگابایت' }
        ]
      },
      {
        key: 'contact',
        title: 'اطلاعات تماس',
        icon: 'phone',
        description: 'شماره‌هایی که در دسترس شماست را وارد کنید.',
        fields: [
          { name: 'mobile', label: 'تلفن همراه', type: 'tel', required: true, col: 4, locked: true, system: true, help: 'این شماره با کد پیامکی تأیید شده است.' },
          { name: 'phone', label: 'تلفن ثابت', type: 'tel', required: false, col: 4, help: 'با کد شهر — مثال: 03136665544' },
          { name: 'email', label: 'ایمیل', type: 'email', required: false, col: 4, placeholder: 'name@example.com' },
          { name: 'address', label: 'نشانی محل سکونت', type: 'textarea', required: false, col: 8, rows: 2 },
          { name: 'postalCode', label: 'کد پستی', type: 'text', required: false, col: 4, validate: 'postalCode', inputMode: 'numeric' }
        ]
      },
      {
        key: 'family',
        title: 'وضعیت خانوادگی و خدمت',
        icon: 'home',
        fields: [
          { name: 'maritalStatus', label: 'وضعیت تأهل', type: 'radio', required: true, col: 6, options: OPTIONS.marital },
          { name: 'militaryStatus', label: 'وضعیت نظام وظیفه', type: 'radio', required: false, col: 6, options: OPTIONS.military, visibleIf: { field: 'gender', op: 'neq', value: 'زن' } },
          { name: 'spouseName', label: 'نام و نام خانوادگی همسر', type: 'text', required: false, col: 4, visibleIf: { field: 'maritalStatus', op: 'eq', value: 'متاهل' } },
          { name: 'spousePhone', label: 'تلفن تماس همسر', type: 'tel', required: false, col: 4, visibleIf: { field: 'maritalStatus', op: 'eq', value: 'متاهل' } },
          { name: 'spouseJob', label: 'شغل و محل کار همسر', type: 'text', required: false, col: 4, visibleIf: { field: 'maritalStatus', op: 'eq', value: 'متاهل' } },
          { name: 'childrenCount', label: 'تعداد فرزند', type: 'number', required: false, col: 3, visibleIf: { field: 'maritalStatus', op: 'eq', value: 'متاهل' } },
          { name: 'insuranceHistory', label: 'سابقه بیمه', type: 'radio', required: false, col: 4, options: OPTIONS.insurance },
          { name: 'insuranceYears', label: 'سنوات بیمه (سال)', type: 'number', required: false, col: 3, visibleIf: { field: 'insuranceHistory', op: 'eq', value: 'دارد' } },
          { name: 'insuranceNumber', label: 'شماره بیمه', type: 'text', required: false, col: 5, visibleIf: { field: 'insuranceHistory', op: 'eq', value: 'دارد' } }
        ]
      },
      {
        key: 'work',
        title: 'سوابق کاری',
        icon: 'briefcase',
        description: 'آخرین تجربه‌های کاری خود را از جدید به قدیم وارد کنید.',
        fields: [
          {
            name: 'workHistory', label: 'سوابق کاری', type: 'table', required: false, minRows: 0, maxRows: 8,
            addLabel: 'افزودن سابقه کاری',
            columns: [
              { name: 'company', label: 'نام شرکت', type: 'text', required: true, width: 200 },
              { name: 'position', label: 'سمت سازمانی', type: 'text', required: true, width: 160 },
              { name: 'startDate', label: 'تاریخ شروع', type: 'date', width: 120 },
              { name: 'endDate', label: 'تاریخ پایان', type: 'date', width: 120 },
              { name: 'duration', label: 'مدت همکاری', type: 'text', width: 110 },
              { name: 'lastSalary', label: 'آخرین حقوق', type: 'currency', width: 130 },
              { name: 'leaveReason', label: 'علت قطع همکاری', type: 'text', width: 180 },
              { name: 'companyPhone', label: 'تلفن محل کار', type: 'tel', width: 130 }
            ]
          },
          { name: 'totalExperience', label: 'جمع سابقه کار مفید (سال)', type: 'number', required: false, col: 4 },
          { name: 'currentJob', label: 'شغل فعلی / وضعیت اشتغال', type: 'text', required: false, col: 8, placeholder: 'مثال: شاغل در شرکت الف / بیکار / دانشجو' }
        ]
      },
      {
        key: 'education',
        title: 'تحصیلات',
        icon: 'book',
        fields: [
          {
            name: 'education', label: 'سوابق تحصیلی', type: 'table', required: true, minRows: 1, maxRows: 6,
            addLabel: 'افزودن مقطع تحصیلی',
            columns: [
              { name: 'degree', label: 'مقطع تحصیلی', type: 'select', options: OPTIONS.degree, required: true, width: 150 },
              { name: 'field', label: 'رشته یا گرایش', type: 'text', required: true, width: 200 },
              { name: 'institute', label: 'محل تحصیل', type: 'text', required: true, width: 220 },
              { name: 'graduationYear', label: 'سال اخذ مدرک', type: 'text', width: 120 },
              { name: 'gpa', label: 'معدل', type: 'text', width: 90 }
            ]
          }
        ]
      },
      {
        key: 'languages',
        title: 'زبان‌های خارجی',
        icon: 'globe',
        fields: [
          {
            name: 'languages', label: 'زبان‌های خارجی', type: 'table', required: false, minRows: 0, maxRows: 5,
            addLabel: 'افزودن زبان',
            columns: [
              { name: 'language', label: 'عنوان زبان خارجی', type: 'text', required: true, width: 180 },
              { name: 'level', label: 'سطح تسلط', type: 'radio', options: OPTIONS.languageLevel, required: true, width: 320 }
            ]
          }
        ]
      },
      {
        key: 'software',
        title: 'مهارت‌های نرم‌افزاری',
        icon: 'monitor',
        fields: [
          {
            name: 'softwareSkills', label: 'نرم‌افزارها و مهارت‌ها', type: 'table', required: false, minRows: 0, maxRows: 8,
            addLabel: 'افزودن مهارت',
            columns: [
              { name: 'software', label: 'نام نرم‌افزار / مهارت', type: 'text', required: true, width: 240 },
              { name: 'level', label: 'سطح تسلط', type: 'radio', options: OPTIONS.softwareLevel, required: true, width: 300 }
            ]
          }
        ]
      },
      {
        key: 'courses',
        title: 'دوره‌های آموزشی',
        icon: 'award',
        fields: [
          {
            name: 'courses', label: 'دوره‌های آموزشی گذرانده‌شده', type: 'table', required: false, minRows: 0, maxRows: 8,
            addLabel: 'افزودن دوره',
            columns: [
              { name: 'title', label: 'نام دوره آموزشی', type: 'text', required: true, width: 220 },
              { name: 'institute', label: 'نام موسسه آموزشی', type: 'text', width: 200 },
              { name: 'duration', label: 'مدت دوره', type: 'text', width: 120 },
              { name: 'certificate', label: 'وضعیت مدرک', type: 'radio', options: OPTIONS.certificate, width: 240 }
            ]
          }
        ]
      },
      {
        key: 'aspirations',
        title: 'دیدگاه‌ها و انتظارات',
        icon: 'heart',
        description: 'پاسخ‌های شما به شناخت بهتر ما از شما کمک می‌کند.',
        fields: [
          { name: 'satisfactionFactors', label: 'عواملی که موجب رضایت شما از محیط کار می‌شود', type: 'textarea', required: true, col: 6, rows: 3 },
          { name: 'dissatisfactionFactors', label: 'عواملی که موجب عدم رضایت شما از محیط کار می‌شود', type: 'textarea', required: false, col: 6, rows: 3 },
          { name: 'cooperationType', label: 'نوع همکاری مورد نظر', type: 'checkbox', required: true, col: 12, options: OPTIONS.cooperation },
          { name: 'partTimeDetails', label: 'در صورت انتخاب پاره‌وقت، روزها و ساعات مورد نظر', type: 'textarea', required: false, col: 12, rows: 2, visibleIf: { field: 'cooperationType', op: 'includes', value: 'پاره‌وقت' } },
          { name: 'expectedSalary', label: 'حقوق و دستمزد مورد انتظار (تومان)', type: 'currency', required: false, col: 6 },
          { name: 'startAvailability', label: 'تاریخ و زمان آمادگی برای شروع کار', type: 'text', required: false, col: 6, placeholder: 'مثال: از اول ماه آینده' },
          { name: 'howFound', label: 'نحوه آشنایی با شرکت', type: 'select', required: false, col: 6, options: OPTIONS.howFound },
          { name: 'howFoundOther', label: 'توضیح بیشتر (در صورت انتخاب سایر)', type: 'text', required: false, col: 6, visibleIf: { field: 'howFound', op: 'eq', value: 'سایر' } }
        ]
      },
      {
        key: 'conditions',
        title: 'شرایط و الزامات شغل',
        icon: 'shield',
        fields: [
          { name: 'overtime', label: 'آمادگی برای اضافه‌کاری در روزهای عادی و تعطیل', type: 'radio', required: true, col: 12, options: OPTIONS.overtime },
          { name: 'missions', label: 'میزان آمادگی برای مأموریت‌های کاری (می‌توانید چند مورد انتخاب کنید)', type: 'checkbox', required: false, col: 12, options: OPTIONS.missions },
          { name: 'healthStatus', label: 'آیا از نظر سلامت جسمی و روانی در وضعیت مطلوب برای انجام وظایف شغلی هستید؟', type: 'radio', required: true, col: 6, options: OPTIONS.yesNo },
          { name: 'illnessDetails', label: 'در صورت ابتلا به بیماری خاص، نوع آن را ذکر کنید', type: 'textarea', required: false, col: 6, rows: 2, visibleIf: { field: 'healthStatus', op: 'eq', value: 'خیر' } }
        ]
      },
      {
        key: 'references',
        title: 'معرف‌ها',
        icon: 'users',
        description: 'مشخصات افرادی که در صورت نیاز می‌توانیم با آن‌ها تماس بگیریم.',
        fields: [
          {
            name: 'references', label: 'اطلاعات معرف', type: 'table', required: true, minRows: 1, maxRows: 4,
            addLabel: 'افزودن معرف',
            columns: [
              { name: 'fullName', label: 'نام و نام خانوادگی', type: 'text', required: true, width: 220 },
              { name: 'relation', label: 'نسبت فرد با شما', type: 'select', options: OPTIONS.relation, required: true, width: 160 },
              { name: 'phone', label: 'تلفن تماس', type: 'tel', required: true, width: 160 }
            ]
          }
        ]
      },
      {
        key: 'confirm',
        title: 'تأیید و ثبت نهایی',
        icon: 'check',
        description: 'پس از تأیید، فرم شما به‌صورت نهایی ثبت می‌شود.',
        fields: [
          { name: 'confirmAccuracy', label: 'اینجانب صحت کلیه اطلاعات مندرج در این فرم را تأیید و گواهی می‌نمایم.', type: 'switch', required: true, col: 12 },
          { name: 'signatureName', label: 'نام و نام خانوادگی (به منزله امضا)', type: 'text', required: true, col: 6 },
          { name: 'signatureDate', label: 'تاریخ تکمیل فرم', type: 'date', required: false, col: 6, autoNow: true },
          { name: 'coverLetter', label: 'در صورت تمایل، توضیح مختصری درباره خودتان و انگیزه همکاری', type: 'textarea', required: false, col: 12, rows: 3, visibleIf: { field: 'coverLetterToggle', op: 'truthy', value: true } },
          { name: 'coverLetterToggle', label: 'تمایل به نوشتن توضیح تکمیلی دارم', type: 'switch', required: false, col: 12, hiddenInWizard: true }
        ]
      }
    ]
  };
}

/** فیلدهای پیشنهادی برای افزودن سریع توسط مدیر */
const FIELD_TEMPLATES = [
  { type: 'text', label: 'متن یک‌خطی', icon: 'type' },
  { type: 'textarea', label: 'متن چندخطی', icon: 'align-right' },
  { type: 'number', label: 'عدد', icon: 'hash' },
  { type: 'currency', label: 'مبلغ (تومان)', icon: 'coins' },
  { type: 'tel', label: 'تلفن', icon: 'phone' },
  { type: 'email', label: 'ایمیل', icon: 'mail' },
  { type: 'date', label: 'تاریخ (شمسی)', icon: 'calendar' },
  { type: 'select', label: 'لیست انتخابی', icon: 'list' },
  { type: 'radio', label: 'تک‌انتخابی', icon: 'circle-dot' },
  { type: 'checkbox', label: 'چندانتخابی', icon: 'check-square' },
  { type: 'switch', label: 'بله/خیر', icon: 'toggle' },
  { type: 'rating', label: 'امتیازدهی', icon: 'star' },
  { type: 'file', label: 'فایل پیوست', icon: 'paperclip' },
  { type: 'table', label: 'جدول تکرارشونده', icon: 'table' },
  { type: 'heading', label: 'تیتر بخش', icon: 'heading' },
  { type: 'note', label: 'یادداشت / راهنما', icon: 'info' }
];

module.exports = { defaultForm, FIELD_TEMPLATES, OPTIONS };
