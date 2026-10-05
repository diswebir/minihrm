'use strict';
/**
 * داده‌های پایه (Seed) — مجوزها، نقش‌ها، ماژول‌ها، سوالات MBTI و فیلدهای فرم استخدام
 * سوالات MBTI دقیقاً از فایل «آزمون روانشناسی شخصیتی.docx» استخراج شده‌اند.
 * فیلدهای فرم دقیقاً از فایل «فرم استخدام.xlsx» استخراج شده‌اند.
 */

/* ================= مجوزها (Permissions) ================= */
const PERMISSIONS = [
  // داشبورد
  { code: 'dashboard.view', name: 'مشاهده داشبورد', grp: 'دسترسی‌های پایه', desc: 'دسترسی به داشبورد اختصاصی نقش' },
  { code: 'notifications.view', name: 'مشاهده اعلان‌ها', grp: 'دسترسی‌های پایه', desc: 'مشاهده و مدیریت اعلان‌های شخصی' },
  // متقاضیان
  { code: 'applicants.view', name: 'مشاهده متقاضیان', grp: 'استخدام', desc: 'مشاهده لیست و پروفایل متقاضیان' },
  { code: 'applicants.edit', name: 'ویرایش متقاضیان', grp: 'استخدام', desc: 'ویرایش اطلاعات و تغییر وضعیت متقاضیان' },
  { code: 'applicants.notes', name: 'ثبت نظر و مصاحبه', grp: 'استخدام', desc: 'ثبت نظر مصاحبه‌کننده، منابع انسانی و مدیریت' },
  { code: 'applicants.decision', name: 'تصمیم نهایی استخدام', grp: 'استخدام', desc: 'ثبت تصمیم نهایی (مناسب / بررسی بیشتر / رد صلاحیت)' },
  { code: 'applicants.export', name: 'خروجی و چاپ', grp: 'استخدام', desc: 'چاپ و خروجی گرفتن از پرونده متقاضیان' },
  { code: 'applicants.delete', name: 'حذف متقاضیان', grp: 'استخدام', desc: 'حذف پرونده متقاضیان' },
  // موقعیت‌های شغلی
  { code: 'positions.view', name: 'مشاهده موقعیت‌های شغلی', grp: 'استخدام', desc: 'مشاهده لیست موقعیت‌های شغلی' },
  { code: 'positions.manage', name: 'مدیریت موقعیت‌های شغلی', grp: 'استخدام', desc: 'ایجاد، ویرایش و حذف موقعیت شغلی و QR' },
  // فرم استخدام
  { code: 'formbuilder.manage', name: 'طراحی فرم استخدام', grp: 'استخدام', desc: 'تنظیم فیلدها، الزامی‌ها و مراحل فرم استخدام' },
  // MBTI
  { code: 'mbti.view', name: 'مشاهده تحلیل شخصیت', grp: 'روانشناسی', desc: 'مشاهده نتیجه و تحلیل MBTI متقاضیان (مخصوص منابع انسانی)' },
  { code: 'mbti.manage', name: 'مدیریت آزمون شخصیت', grp: 'روانشناسی', desc: 'ویرایش سوالات و تنظیمات آزمون MBTI' },
  // گزارش‌ها
  { code: 'reports.view', name: 'مشاهده گزارش‌ها', grp: 'گزارش‌ها', desc: 'دسترسی به گزارش‌ها و آمار استخدام' },
  // مدیریت کاربران
  { code: 'users.view', name: 'مشاهده کاربران', grp: 'مدیریت سامانه', desc: 'مشاهده لیست کاربران' },
  { code: 'users.manage', name: 'مدیریت کاربران', grp: 'مدیریت سامانه', desc: 'ایجاد، ویرایش و غیرفعال‌سازی کاربران' },
  { code: 'roles.manage', name: 'مدیریت نقش‌ها و دسترسی‌ها', grp: 'مدیریت سامانه', desc: 'ایجاد نقش و تعریف سطح دسترسی کامل' },
  { code: 'modules.manage', name: 'مدیریت ماژول‌ها', grp: 'مدیریت سامانه', desc: 'فعال/غیرفعال‌سازی ماژول‌های سامانه' },
  { code: 'settings.manage', name: 'مدیریت تنظیمات', grp: 'مدیریت سامانه', desc: 'تنظیمات عمومی، پیامک، امنیت و پشتیبان‌گیری' },
  { code: 'audit.view', name: 'مشاهده گزارش فعالیت‌ها', grp: 'مدیریت سامانه', desc: 'مشاهده تاریخچه فعالیت کاربران' }
];

/* ================= نقش‌ها (Roles) ================= */
const ROLES = [
  {
    code: 'super_admin',
    name: 'مدیر کل سامانه',
    description: 'دسترسی کامل به تمام بخش‌ها، تنظیمات، ماژول‌ها و سطوح دسترسی',
    is_system: 1,
    permissions: PERMISSIONS.map(p => p.code)
  },
  {
    code: 'hr_manager',
    name: 'مدیر منابع انسانی',
    description: 'مدیریت کامل فرایند استخدام، متقاضیان، تحلیل‌ها، گزارش‌ها و مشاهده کاربران',
    is_system: 1,
    permissions: [
      'dashboard.view', 'notifications.view',
      'applicants.view', 'applicants.edit', 'applicants.notes', 'applicants.decision', 'applicants.export', 'applicants.delete',
      'positions.view', 'positions.manage',
      'formbuilder.manage',
      'mbti.view', 'mbti.manage',
      'reports.view',
      'users.view', 'audit.view'
    ]
  },
  {
    code: 'hr_staff',
    name: 'کارمند منابع انسانی',
    description: 'بررسی متقاضیان، ثبت نظر، تنظیم فرم و سوالات آزمون',
    is_system: 1,
    permissions: [
      'dashboard.view', 'notifications.view',
      'applicants.view', 'applicants.edit', 'applicants.notes', 'applicants.export',
      'positions.view',
      'formbuilder.manage',
      'mbti.view', 'mbti.manage',
      'reports.view'
    ]
  },
  {
    code: 'employee',
    name: 'کارمند شرکت',
    description: 'پورتال شخصی کارمندان شرکت',
    is_system: 1,
    permissions: ['dashboard.view', 'notifications.view']
  },
  {
    code: 'candidate',
    name: 'متقاضی استخدام',
    description: 'دسترسی موقت متقاضیان استخدام از طریق تایید موبایل (OTP)',
    is_system: 1,
    permissions: []
  }
];

/* ================= ماژول‌ها ================= */
const MODULES = [
  { code: 'recruitment', name: 'ماژول استخدام', icon: 'briefcase', version: '1.0.0', enabled: 1, installed: 1, sort: 1,
    description: 'موقعیت‌های شغلی، فرم چندمرحله‌ای استخدام، QR متقاضیان و مدیریت پرونده‌ها' },
  { code: 'mbti', name: 'ماژول آزمون شخصیت MBTI', icon: 'brain', version: '1.0.0', enabled: 1, installed: 1, sort: 2,
    description: 'آزمون ۲۸ سوالی شخصیت‌شناسی و تحلیل حرفه‌ای نتایج (فقط برای منابع انسانی)' },
  { code: 'attendance', name: 'حضور و غیاب', icon: 'clock', version: '0.0.0', enabled: 0, installed: 0, sort: 3,
    description: 'ثبت ساعت ورود و خروج، مرخصی‌ها و اضافه‌کاری — به‌زودی' },
  { code: 'payroll', name: 'حقوق و دستمزد', icon: 'wallet', version: '0.0.0', enabled: 0, installed: 0, sort: 4,
    description: 'محاسبه حقوق، فیش حقوقی و مزایا — به‌زودی' },
  { code: 'performance', name: 'ارزیابی عملکرد', icon: 'chart', version: '0.0.0', enabled: 0, installed: 0, sort: 5,
    description: 'ارزیابی دوره‌ای عملکرد کارکنان — به‌زودی' },
  { code: 'training', name: 'آموزش و توسعه', icon: 'academic', version: '0.0.0', enabled: 0, installed: 0, sort: 6,
    description: 'دوره‌های آموزشی و برنامه‌های توسعه کارکنان — به‌زودی' }
];

/* ================= سوالات آزمون MBTI =================
 * منبع: فایل «آزمون روانشناسی شخصیتی.docx» — ۲۸ سوال، ۷ سوال در هر بُعد
 * trait_a/trait_b حرف متناظر هر گزینه است.
 */
const MBTI_QUESTIONS = [
  { number: 1, text: 'من علاقه به توسعه عقایدم از طریق ..... دارم.', option_a: 'گفت‌وگو و تبادل نظر', option_b: 'تأمل و بررسی فردی', trait_a: 'E', trait_b: 'I' },
  { number: 2, text: 'معمولاً با چه نوع افرادی راحت‌تر ارتباط برقرار می‌کنم؟', option_a: 'کسانی که خلاق و آینده‌نگرند', option_b: 'کسانی که واقع‌گرا و عمل‌گرا هستند', trait_a: 'N', trait_b: 'S' },
  { number: 3, text: 'در تعامل با دیگران، بیشتر به چه چیزی توجه می‌کنم؟', option_a: 'احساسات و نیازهای عاطفی افراد', option_b: 'اصول، قوانین و حقوق هر فرد', trait_a: 'F', trait_b: 'T' },
  { number: 4, text: 'وقتی از من درخواست شود پروژه‌ای را انجام دهم، ترجیح می‌دهم:', option_a: 'به اتمام و تکمیل پروژه فکر کنم', option_b: 'روی فرآیند و یا مراحل عملیاتی پروژه تمرکز کنم', trait_a: 'J', trait_b: 'P' },
  { number: 5, text: 'محیط کاری مطلوبم محیطی است که:', option_a: 'متنوع، پرتحرک و پویا باشد', option_b: 'آرام و مناسب تمرکز باشد', trait_a: 'E', trait_b: 'I' },
  { number: 6, text: 'در انجام کار گروهی معمولاً:', option_a: 'روش پذیرفته‌شده گروه را دنبال می‌کنم', option_b: 'ترجیح می‌دهم روش خود را ارائه و اجرا کنم', trait_a: 'S', trait_b: 'N' },
  { number: 7, text: 'تصمیم‌گیری‌هایم معمولاً بیشتر تحت تأثیر کدام مورد است؟', option_a: 'ملاحظات شخصی و انسانی', option_b: 'تحلیل منطقی و واقع‌بینانه', trait_a: 'F', trait_b: 'T' },
  { number: 8, text: 'در تصمیم‌گیری:', option_a: 'سریع نتیجه‌گیری می‌کنم', option_b: 'تصمیم را عقب می‌اندازم تا گزینه‌های بیشتری را بررسی کنم', trait_a: 'J', trait_b: 'P' },
  { number: 9, text: 'هنگام کار کردن ترجیح می‌دهم:', option_a: 'دیگران در اطرافم باشند', option_b: 'تنها باشم و کسی نزدیکم نشود', trait_a: 'E', trait_b: 'I' },
  { number: 10, text: 'چه عاملی بیشتر باعث ناخشنودی شما می‌شود؟', option_a: 'نظریه‌ها و ایده‌های بسیار انتزاعی', option_b: 'کار با افرادی که به مفاهیم نظری توجه نمی‌کنند', trait_a: 'S', trait_b: 'N' },
  { number: 11, text: 'در بسیاری از موقعیت‌ها:', option_a: 'احساساتم تصمیمم را جهت می‌دهد', option_b: 'تحلیل‌های ذهنی‌ام تصمیم را تعیین می‌کند', trait_a: 'F', trait_b: 'T' },
  { number: 12, text: 'احساس راحت‌تری دارم اگر:', option_a: 'موضوعات را هرچه زودتر تجزیه و تحلیل کرده و به نتیجه‌گیری برسم', option_b: 'موضوعات را لحظه‌های آخر تصمیم‌گیری کنم تا بتوانم تغییرات مورد نیاز را ایجاد کنم', trait_a: 'J', trait_b: 'P' },
  { number: 13, text: 'من موضوعات جدید را از طریق ..... یاد می‌گیرم.', option_a: 'صحبت کردن و انجام دادن', option_b: 'مطالعه و تفکر کردن', trait_a: 'E', trait_b: 'I' },
  { number: 14, text: 'کدام ویژگی برایم ارزشمندتر است؟', option_a: 'رویاپردازی و نگاه بلندمدت', option_b: 'واقع‌گرایی و توجه به امور ملموس', trait_a: 'N', trait_b: 'S' },
  { number: 15, text: 'کدام‌یک از دو عمل زیر کمتر اهمیت دارد؟', option_a: 'ابراز صمیمیت زیاد', option_b: 'حفظ فاصله احساسی و عدم همدلی', trait_a: 'T', trait_b: 'F' },
  { number: 16, text: 'بهترین عملکردم زمانی است که:', option_a: 'کار خود را برنامه‌ریزی کرده و طبق آن عمل کنم', option_b: 'امکان تغییر و انعطاف همراه کار وجود داشته باشد', trait_a: 'J', trait_b: 'P' },
  { number: 17, text: 'اغلب اوقات من:', option_a: 'اول صحبت می‌کنم و بعداً راجع به آن فکر می‌کنم', option_b: 'قبل از صحبت یا عمل، ابتدا راجع به آن فکر می‌کنم', trait_a: 'E', trait_b: 'I' },
  { number: 18, text: 'اگر معلم بودم، ترجیح می‌دادم تدریس موضوعاتی را بر عهده بگیرم که:', option_a: 'شامل مفاهیم و نظریه‌ها هستند', option_b: 'مبتنی بر اطلاعات واقعی و قابل مشاهده‌اند', trait_a: 'N', trait_b: 'S' },
  { number: 19, text: 'کدام مفهوم برایم مهم‌تر است؟', option_a: 'همدلی', option_b: 'دورنگری و تحلیل آینده', trait_a: 'F', trait_b: 'T' },
  { number: 20, text: 'بیشتر اوقات:', option_a: 'تلاش می‌کنم کارها را قبل از موعد انجام دهم', option_b: 'معمولاً در فشار زمان بهتر عمل می‌کنم', trait_a: 'J', trait_b: 'P' },
  { number: 21, text: 'ترجیح می‌دهم با دیگران از طریق ..... ارتباط برقرار کنم.', option_a: 'صحبت کردن', option_b: 'نامه نوشتن', trait_a: 'E', trait_b: 'I' },
  { number: 22, text: 'کدام واژه برایم جذاب‌تر است؟', option_a: 'تولید و اجرا', option_b: 'طراحی و ابداع', trait_a: 'S', trait_b: 'N' },
  { number: 23, text: 'کدام ارزش برایم مهم‌تر است؟', option_a: 'عدالت', option_b: 'دل‌رحمی', trait_a: 'T', trait_b: 'F' },
  { number: 24, text: 'اغلب اوقات من ..... هستم.', option_a: 'رسمی و جدی', option_b: 'غیررسمی و خودمانی', trait_a: 'J', trait_b: 'P' },
  { number: 25, text: 'در یک محفل اجتماعی با کسانی معاشرت می‌کنم که:', option_a: 'از قبل آن‌ها را می‌شناسم', option_b: 'قبلاً با آن‌ها آشنایی نداشته‌ام', trait_a: 'I', trait_b: 'E' },
  { number: 26, text: 'کدام مورد برایم بنیادی‌تر است؟', option_a: 'ایده‌ها و امکانات', option_b: 'واقعیات و داده‌های ملموس', trait_a: 'N', trait_b: 'S' },
  { number: 27, text: 'کدام لغت اهمیت بیشتری دارد؟', option_a: 'انعطاف‌پذیری', option_b: 'قاطع بودن', trait_a: 'F', trait_b: 'T' },
  { number: 28, text: 'قبل از رفتن به سفر:', option_a: 'مایل هستم همه چیز برنامه‌ریزی شده باشد', option_b: 'مایل هستم انعطاف‌پذیر باشم و در لحظه‌های آخر تصمیم بگیرم', trait_a: 'J', trait_b: 'P' }
];

/* ================= مراحل و فیلدهای فرم استخدام =================
 * منبع: فایل «فرم استخدام.xlsx» (برگ p1 و p2)
 */
const FORM_STEPS = [
  { key: 'personal', title: 'مشخصات متقاضی', icon: 'user', sort: 1,
    description: 'اطلاعات هویتی و تماس خود را دقیق وارد کنید.' },
  { key: 'experience', title: 'سوابق کاری', icon: 'briefcase', sort: 2,
    description: 'سوابق حرفه‌ای خود را از آخرین شغل به ترتیب وارد کنید.' },
  { key: 'education', title: 'تحصیلات', icon: 'academic', sort: 3,
    description: 'سوابق تحصیلی خود را ثبت کنید.' },
  { key: 'skills', title: 'زبان‌ها و مهارت‌ها', icon: 'star', sort: 4,
    description: 'زبان‌های خارجی، مهارت‌های نرم‌افزاری و دوره‌های آموزشی.' },
  { key: 'expectations', title: 'دیدگاه‌ها و انتظارات', icon: 'chat', sort: 5,
    description: 'انتظارات شغلی و شرایط همکاری مورد نظر شما.' },
  { key: 'conditions', title: 'شرایط شغل و معرف', icon: 'shield', sort: 6,
    description: 'آمادگی برای شرایط کاری و اطلاعات فرد معرف.' },
  { key: 'mbti', title: 'آزمون شخصیت‌شناسی', icon: 'brain', sort: 7,
    description: 'آزمون کوتاه شخصیت‌شناسی؛ پاسخ درست یا غلط وجود ندارد.' },
  { key: 'review', title: 'بررسی و تایید نهایی', icon: 'check', sort: 8,
    description: 'مرور اطلاعات و تایید صحت آن‌ها.' }
];

const FA_LEVELS = [
  { value: 'very_good', label: 'بسیار خوب' },
  { value: 'good', label: 'خوب' },
  { value: 'average', label: 'متوسط' },
  { value: 'weak', label: 'ضعیف' }
];

const SKILL_LEVELS = [
  { value: 'excellent', label: 'عالی' },
  { value: 'good', label: 'خوب' },
  { value: 'average', label: 'متوسط' }
];

const FORM_FIELDS = [
  // ---------- مشخصات متقاضی (p1) ----------
  { field_key: 'photo', step_key: 'personal', label: 'عکس پرسنلی', type: 'file', width: 'full', required: 0, grp: 'identity', sort: 1, help: 'تصویر واضح با پس‌زمینه ساده (اختیاری)' },
  { field_key: 'first_name', step_key: 'personal', label: 'نام', type: 'text', width: 'half', required: 1, grp: 'identity', sort: 2 },
  { field_key: 'last_name', step_key: 'personal', label: 'نام خانوادگی', type: 'text', width: 'half', required: 1, grp: 'identity', sort: 3 },
  { field_key: 'father_name', step_key: 'personal', label: 'نام پدر', type: 'text', width: 'half', required: 1, grp: 'identity', sort: 4 },
  { field_key: 'national_id', step_key: 'personal', label: 'کد ملی', type: 'text', width: 'half', required: 1, grp: 'identity', sort: 5 },
  { field_key: 'birth_serial', step_key: 'personal', label: 'شماره شناسنامه', type: 'text', width: 'half', required: 0, grp: 'identity', sort: 6 },
  { field_key: 'birth_date', step_key: 'personal', label: 'تاریخ تولد', type: 'date', width: 'half', required: 1, grp: 'identity', sort: 7, help: 'مثال: 1370/05/12' },
  { field_key: 'issue_place', step_key: 'personal', label: 'محل صدور', type: 'text', width: 'half', required: 0, grp: 'identity', sort: 8 },
  { field_key: 'gender', step_key: 'personal', label: 'جنسیت', type: 'radio', width: 'half', required: 1, grp: 'identity', sort: 9,
    options: [{ value: 'male', label: 'مرد' }, { value: 'female', label: 'زن' }] },
  { field_key: 'religion', step_key: 'personal', label: 'دین', type: 'text', width: 'half', required: 0, grp: 'identity', sort: 10 },
  { field_key: 'sect', step_key: 'personal', label: 'مذهب', type: 'text', width: 'half', required: 0, grp: 'identity', sort: 11 },
  { field_key: 'phone_mobile', step_key: 'personal', label: 'تلفن همراه', type: 'phone', width: 'half', required: 1, grp: 'contact', sort: 12 },
  { field_key: 'phone_landline', step_key: 'personal', label: 'تلفن ثابت', type: 'text', width: 'half', required: 0, grp: 'contact', sort: 13 },
  { field_key: 'email', step_key: 'personal', label: 'ایمیل', type: 'email', width: 'half', required: 0, grp: 'contact', sort: 14 },
  { field_key: 'address', step_key: 'personal', label: 'آدرس محل سکونت', type: 'textarea', width: 'full', required: 1, grp: 'contact', sort: 15 },
  { field_key: 'postal_code', step_key: 'personal', label: 'کد پستی', type: 'text', width: 'half', required: 0, grp: 'contact', sort: 16 },
  { field_key: 'has_insurance', step_key: 'personal', label: 'سابقه بیمه', type: 'radio', width: 'half', required: 1, grp: 'insurance', sort: 17,
    options: [{ value: 'yes', label: 'دارد' }, { value: 'no', label: 'ندارد' }] },
  { field_key: 'insurance_years', step_key: 'personal', label: ' سنوات بیمه', type: 'text', width: 'half', required: 0, grp: 'insurance', sort: 18 },
  { field_key: 'insurance_number', step_key: 'personal', label: 'شماره بیمه', type: 'text', width: 'half', required: 0, grp: 'insurance', sort: 19 },
  { field_key: 'military_status', step_key: 'personal', label: 'وضعیت نظام وظیفه', type: 'select', width: 'half', required: 0, grp: 'status', sort: 20,
    options: [{ value: 'finished', label: 'پایان خدمت' }, { value: 'exempt', label: 'معافیت' }, { value: 'included', label: 'مشمول' }, { value: 'na', label: 'خانم (موضوعیت ندارد)' }] },
  { field_key: 'marital_status', step_key: 'personal', label: 'وضعیت تاهل', type: 'select', width: 'half', required: 1, grp: 'status', sort: 21,
    options: [{ value: 'single', label: 'مجرد' }, { value: 'married', label: 'متاهل' }, { value: 'other', label: 'سایر' }] },
  { field_key: 'spouse_name', step_key: 'personal', label: 'نام و نام خانوادگی همسر', type: 'text', width: 'half', required: 0, grp: 'status', sort: 22 },
  { field_key: 'spouse_phone', step_key: 'personal', label: 'تلفن تماس همسر', type: 'text', width: 'half', required: 0, grp: 'status', sort: 23 },
  { field_key: 'spouse_job', step_key: 'personal', label: 'شغل و محل کار همسر', type: 'text', width: 'half', required: 0, grp: 'status', sort: 24 },
  { field_key: 'children_count', step_key: 'personal', label: 'تعداد فرزند', type: 'number', width: 'half', required: 0, grp: 'status', sort: 25 },

  // ---------- سوابق کاری (p1) ----------
  { field_key: 'experiences', step_key: 'experience', label: 'سوابق کاری', type: 'repeater', width: 'full', required: 0, grp: 'experience', sort: 1,
    help: 'نام شرکت، سمت سازمانی، تاریخ شروع/پایان، مدت همکاری، آخرین حقوق، علت قطع همکاری و تلفن تماس محل کار' },

  // ---------- تحصیلات (p1) ----------
  { field_key: 'educations', step_key: 'education', label: 'سوابق تحصیلی', type: 'repeater', width: 'full', required: 0, grp: 'education', sort: 1,
    help: 'مقطع تحصیلی، رشته یا گرایش، محل تحصیل و سال اخذ مدرک' },

  // ---------- زبان‌ها و مهارت‌ها (p1) ----------
  { field_key: 'languages', step_key: 'skills', label: 'زبان‌های خارجی', type: 'repeater', width: 'full', required: 0, grp: 'languages', sort: 1,
    help: 'عنوان زبان و سطح تسلط: بسیار خوب / خوب / متوسط / ضعیف' },
  { field_key: 'skills', step_key: 'skills', label: 'مهارت‌های نرم‌افزاری', type: 'repeater', width: 'full', required: 0, grp: 'software', sort: 2,
    help: 'نام نرم‌افزار و سطح تسلط: عالی / خوب / متوسط' },
  { field_key: 'courses', step_key: 'skills', label: 'دوره‌های آموزشی', type: 'repeater', width: 'full', required: 0, grp: 'courses', sort: 3,
    help: 'نام دوره، نام موسسه آموزشی، مدت دوره و وضعیت مدرک' },

  // ---------- دیدگاه‌ها و انتظارات (p2) ----------
  { field_key: 'satisfaction_factors', step_key: 'expectations', label: 'عواملی که موجب رضایت شما از محیط کار می‌شود را ذکر کنید', type: 'textarea', width: 'full', required: 1, grp: 'views', sort: 1 },
  { field_key: 'dissatisfaction_factors', step_key: 'expectations', label: 'عواملی که موجب عدم رضایت شما از محیط کار می‌شود را ذکر کنید', type: 'textarea', width: 'full', required: 1, grp: 'views', sort: 2 },
  { field_key: 'cooperation_type', step_key: 'expectations', label: 'نوع همکاری', type: 'radio', width: 'full', required: 1, grp: 'job', sort: 3,
    options: [
      { value: 'full_time', label: 'تمام وقت' },
      { value: 'part_time', label: 'پاره وقت' },
      { value: 'remote', label: 'دورکاری' },
      { value: 'project', label: 'پروژه‌ای' }
    ] },
  { field_key: 'part_time_hours', step_key: 'expectations', label: 'در صورت انتخاب پاره‌وقت، روزها و ساعات مورد نظر برای همکاری', type: 'textarea', width: 'full', required: 0, grp: 'job', sort: 4 },
  { field_key: 'expected_salary', step_key: 'expectations', label: 'میزان حقوق و دستمزد مورد انتظار', type: 'text', width: 'half', required: 1, grp: 'job', sort: 5 },
  { field_key: 'desired_position', step_key: 'expectations', label: 'تمایل به اخذ چه سمتی در شرکت دارید؟', type: 'text', width: 'half', required: 0, grp: 'job', sort: 6 },
  { field_key: 'start_date', step_key: 'expectations', label: 'تاریخ و زمان آمادگی جهت شروع کار', type: 'text', width: 'half', required: 1, grp: 'job', sort: 7 },
  { field_key: 'how_found_us', step_key: 'expectations', label: 'نحوه آشنایی شما با شرکت چگونه بوده است؟', type: 'text', width: 'half', required: 0, grp: 'job', sort: 8 },

  // ---------- شرایط و الزامات شغل (p2) ----------
  { field_key: 'overtime_ready', step_key: 'conditions', label: 'آیا آمادگی لازم جهت انجام اضافه‌کاری در روزهای عادی و تعطیل را دارید؟', type: 'radio', width: 'full', required: 1, grp: 'conditions', sort: 1,
    options: [
      { value: 'yes_full', label: 'بله، آمادگی کامل دارم.' },
      { value: 'yes_special', label: 'بله، در شرایط خاص و با اطلاع قبلی' },
      { value: 'no', label: 'خیر، امکان اضافه‌کاری ندارم.' }
    ] },
  { field_key: 'mission_ready', step_key: 'conditions', label: 'در صورت نیاز شرکت، میزان آمادگی شما برای انجام مأموریت‌های کاری در داخل و خارج از کشور چقدر است؟ (امکان انتخاب چند گزینه)', type: 'checkbox', width: 'full', required: 1, grp: 'conditions', sort: 2,
    options: [
      { value: 'domestic_short', label: 'فقط مأموریت‌های کوتاه‌مدت داخلی (چند روز تا چند هفته)' },
      { value: 'domestic_long', label: 'مأموریت‌های کوتاه‌مدت و بلندمدت داخلی (چند روز تا چند ماه)' },
      { value: 'foreign_short', label: 'فقط مأموریت‌های کوتاه‌مدت خارجی (چند روز تا چند هفته)' },
      { value: 'foreign_long', label: 'مأموریت‌های کوتاه‌مدت و بلندمدت خارجی (چند روز تا چند ماه)' },
      { value: 'none', label: 'امکان انجام مأموریت کاری را ندارم' }
    ] },
  { field_key: 'health_ok', step_key: 'conditions', label: 'آیا در حال حاضر از نظر سلامت جسمی و روانی در وضعیت مطلوب برای انجام وظایف شغلی هستید؟', type: 'radio', width: 'full', required: 1, grp: 'health', sort: 3,
    options: [{ value: 'yes', label: 'بله' }, { value: 'no', label: 'خیر' }] },
  { field_key: 'illness', step_key: 'conditions', label: 'در صورت ابتلا به بیماری خاص، نوع بیماری را ذکر نمایید', type: 'textarea', width: 'full', required: 0, grp: 'health', sort: 4 },
  { field_key: 'references', step_key: 'conditions', label: 'اطلاعات معرف', type: 'repeater', width: 'full', required: 0, grp: 'reference', sort: 5,
    help: 'مشخصات فردی که در صورت نیاز یا عدم دسترسی به شما، امکان برقراری تماس با ایشان وجود داشته باشد (نام، نسبت، تلفن تماس)' },

  // ---------- تایید نهایی ----------
  { field_key: 'consent', step_key: 'review', label: 'تاییدیه صحت اطلاعات', type: 'switch', width: 'full', required: 1, grp: 'consent', sort: 1,
    help: 'اینجانب صحت کلیه اطلاعات مندرج در این فرم را تایید و گواهی می‌نمایم.' }
];

/* ستون‌های تکرارشونده (repeater) هر بخش */
const REPEATER_COLUMNS = {
  experiences: [
    { key: 'company', label: 'نام شرکت', type: 'text', required: 1 },
    { key: 'position', label: 'سمت سازمانی', type: 'text', required: 1 },
    { key: 'period', label: 'تاریخ شروع / پایان', type: 'text', required: 0 },
    { key: 'duration', label: 'مدت همکاری', type: 'text', required: 0 },
    { key: 'last_salary', label: 'آخرین حقوق', type: 'text', required: 0 },
    { key: 'leave_reason', label: 'علت قطع همکاری', type: 'text', required: 0 },
    { key: 'work_phone', label: 'تلفن تماس محل کار', type: 'text', required: 0 }
  ],
  educations: [
    { key: 'level', label: 'مقطع تحصیلی', type: 'text', required: 1 },
    { key: 'major', label: 'رشته یا گرایش', type: 'text', required: 1 },
    { key: 'institute', label: 'محل تحصیل', type: 'text', required: 0 },
    { key: 'year', label: 'سال اخذ مدرک', type: 'text', required: 0 }
  ],
  languages: [
    { key: 'language', label: 'عنوان زبان خارجی', type: 'text', required: 1 },
    { key: 'level', label: 'سطح تسلط', type: 'select', required: 1, options: FA_LEVELS }
  ],
  skills: [
    { key: 'name', label: 'نام نرم‌افزار', type: 'text', required: 1 },
    { key: 'level', label: 'سطح تسلط', type: 'select', required: 1, options: SKILL_LEVELS }
  ],
  courses: [
    { key: 'title', label: 'نام دوره آموزشی', type: 'text', required: 1 },
    { key: 'institute', label: 'نام موسسه آموزشی', type: 'text', required: 0 },
    { key: 'duration', label: 'مدت دوره', type: 'text', required: 0 },
    { key: 'certificate', label: 'وضعیت مدرک', type: 'select', required: 0,
      options: [{ value: 'yes', label: 'مدرک دارد' }, { value: 'no', label: 'مدرک ندارد' }] }
  ],
  references: [
    { key: 'full_name', label: 'نام و نام خانوادگی', type: 'text', required: 1 },
    { key: 'relation', label: 'نسبت فرد با شما', type: 'text', required: 1 },
    { key: 'phone', label: 'تلفن تماس', type: 'text', required: 1 }
  ]
};

/* وضعیت‌های متقاضی */
const APPLICANT_STATUSES = {
  draft: { label: 'پیش‌نویس', color: 'gray', desc: 'فرم هنوز تکمیل و ارسال نشده است' },
  submitted: { label: 'ارسال شده', color: 'blue', desc: 'متقاضی فرم را ارسال کرده و در انتظار بررسی اولیه است' },
  reviewing: { label: 'در حال بررسی', color: 'violet', desc: 'پرونده توسط منابع انسانی در حال بررسی است' },
  interview: { label: 'مصاحبه', color: 'amber', desc: 'متقاضی به مرحله مصاحبه دعوت شده است' },
  accepted: { label: 'استخدام شده', color: 'green', desc: 'متقاضی تایید نهایی و استخدام شد' },
  rejected: { label: 'رد صلاحیت', color: 'rose', desc: 'متقاضی در این مرحله پذیرفته نشد' },
  on_hold: { label: 'متوقف', color: 'gray', desc: 'بررسی پرونده به تعویق افتاده است' }
};

module.exports = {
  PERMISSIONS, ROLES, MODULES,
  MBTI_QUESTIONS,
  FORM_STEPS, FORM_FIELDS, REPEATER_COLUMNS,
  FA_LEVELS, SKILL_LEVELS,
  APPLICANT_STATUSES
};
