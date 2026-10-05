'use strict';

const FORM_FIELDS = [
  { key: 'firstName', label: 'نام', group: 'مشخصات فردی' },
  { key: 'lastName', label: 'نام خانوادگی', group: 'مشخصات فردی' },
  { key: 'fatherName', label: 'نام پدر', group: 'مشخصات فردی' },
  { key: 'nationalId', label: 'کد ملی', group: 'مشخصات فردی' },
  { key: 'identityNumber', label: 'شماره شناسنامه', group: 'مشخصات فردی' },
  { key: 'birthDate', label: 'تاریخ تولد', group: 'مشخصات فردی' },
  { key: 'placeOfIssue', label: 'محل صدور', group: 'مشخصات فردی' },
  { key: 'religion', label: 'دین', group: 'مشخصات فردی' },
  { key: 'denomination', label: 'مذهب', group: 'مشخصات فردی' },
  { key: 'landline', label: 'تلفن ثابت', group: 'مشخصات فردی' },
  { key: 'email', label: 'ایمیل', group: 'مشخصات فردی' },
  { key: 'insuranceHistory', label: 'سابقه بیمه', group: 'مشخصات فردی' },
  { key: 'insuranceYears', label: 'سنوات بیمه (سال)', group: 'مشخصات فردی' },
  { key: 'insuranceNumber', label: 'شماره بیمه', group: 'مشخصات فردی' },
  { key: 'address', label: 'نشانی محل سکونت', group: 'مشخصات فردی' },
  { key: 'postalCode', label: 'کد پستی', group: 'مشخصات فردی' },
  { key: 'militaryService', label: 'وضعیت نظام‌وظیفه', group: 'مشخصات فردی' },
  { key: 'maritalStatus', label: 'وضعیت تأهل', group: 'مشخصات فردی' },
  { key: 'spouseName', label: 'نام همسر', group: 'مشخصات فردی' },
  { key: 'spousePhone', label: 'تلفن همسر', group: 'مشخصات فردی' },
  { key: 'spouseJob', label: 'شغل و محل کار همسر', group: 'مشخصات فردی' },
  { key: 'childrenCount', label: 'تعداد فرزند', group: 'مشخصات فردی' },
  { key: 'workHistory', label: 'حداقل یک سابقه کاری', group: 'سوابق و مهارت‌ها' },
  { key: 'education', label: 'حداقل یک سابقه تحصیلی', group: 'سوابق و مهارت‌ها' },
  { key: 'languages', label: 'حداقل یک زبان خارجی', group: 'سوابق و مهارت‌ها' },
  { key: 'softwareSkills', label: 'حداقل یک مهارت نرم‌افزاری', group: 'سوابق و مهارت‌ها' },
  { key: 'training', label: 'حداقل یک دوره آموزشی', group: 'سوابق و مهارت‌ها' },
  { key: 'satisfaction', label: 'عوامل رضایت از محیط کار', group: 'انتظارات و شرایط' },
  { key: 'dissatisfaction', label: 'عوامل نارضایتی از محیط کار', group: 'انتظارات و شرایط' },
  { key: 'employmentType', label: 'نوع همکاری', group: 'انتظارات و شرایط' },
  { key: 'availabilityHours', label: 'روزها و ساعات همکاری پاره‌وقت', group: 'انتظارات و شرایط' },
  { key: 'expectedSalary', label: 'حقوق مورد انتظار', group: 'انتظارات و شرایط' },
  { key: 'startAvailability', label: 'زمان آمادگی برای شروع', group: 'انتظارات و شرایط' },
  { key: 'referral', label: 'نحوه آشنایی با شرکت', group: 'انتظارات و شرایط' },
  { key: 'overtime', label: 'آمادگی اضافه‌کاری', group: 'شرایط شغل' },
  { key: 'missions', label: 'آمادگی مأموریت', group: 'شرایط شغل' },
  { key: 'healthStatus', label: 'وضعیت سلامت برای وظایف شغلی', group: 'شرایط شغل' },
  { key: 'healthDetails', label: 'توضیح بیماری خاص (در صورت تمایل)', group: 'شرایط شغل' },
  { key: 'referenceName', label: 'نام معرف اضطراری', group: 'اطلاعات معرف' },
  { key: 'referenceRelation', label: 'نسبت معرف', group: 'اطلاعات معرف' },
  { key: 'referencePhone', label: 'تلفن معرف اضطراری', group: 'اطلاعات معرف' }
];

const DEFAULT_REQUIRED_FIELDS = [
  'firstName', 'lastName', 'nationalId', 'birthDate', 'email', 'address',
  'education', 'employmentType', 'expectedSalary', 'startAvailability',
  'overtime', 'healthStatus', 'referenceName', 'referencePhone'
];

const PERMISSION_DEFINITIONS = [
  { key: 'dashboard.view', label: 'مشاهده داشبورد', category: 'داشبورد' },
  { key: 'jobs.view', label: 'مشاهده موقعیت‌های شغلی', category: 'استخدام' },
  { key: 'jobs.manage', label: 'ایجاد و ویرایش موقعیت‌ها', category: 'استخدام' },
  { key: 'candidates.view', label: 'مشاهده پرونده متقاضیان', category: 'استخدام' },
  { key: 'candidates.manage', label: 'تغییر مرحله و ثبت یادداشت', category: 'استخدام' },
  { key: 'candidates.export', label: 'خروجی‌گرفتن از اطلاعات', category: 'استخدام' },
  { key: 'psychology.view', label: 'مشاهده تحلیل روان‌شناختی', category: 'ارزیابی' },
  { key: 'psychology.manage', label: 'مدیریت پرسش‌های ارزیابی', category: 'ارزیابی' },
  { key: 'forms.manage', label: 'تنظیم فرم استخدام و الزامات', category: 'فرم‌ها' },
  { key: 'users.manage', label: 'مدیریت کاربران داخلی', category: 'مدیریت سامانه' },
  { key: 'settings.manage', label: 'تنظیمات و ماژول‌ها', category: 'مدیریت سامانه' },
  { key: 'permissions.manage', label: 'مدیریت سطح دسترسی نقش‌ها', category: 'مدیریت سامانه' },
  { key: 'audit.view', label: 'مشاهده رویدادهای امنیتی', category: 'مدیریت سامانه' }
];

function defaultRolePermissions() {
  const all = Object.fromEntries(PERMISSION_DEFINITIONS.map((p) => [p.key, true]));
  return {
    admin: all,
    hr_manager: { ...all, 'users.manage': true, 'settings.manage': true, 'permissions.manage': false, 'audit.view': true },
    hr_staff: {
      'dashboard.view': true, 'jobs.view': true, 'jobs.manage': true,
      'candidates.view': true, 'candidates.manage': true, 'candidates.export': false,
      'psychology.view': true, 'psychology.manage': true, 'forms.manage': true,
      'users.manage': false, 'settings.manage': false, 'permissions.manage': false, 'audit.view': false
    },
    employee: { 'dashboard.view': true, 'jobs.view': false, 'jobs.manage': false, 'candidates.view': false, 'candidates.manage': false, 'candidates.export': false, 'psychology.view': false, 'psychology.manage': false, 'forms.manage': false, 'users.manage': false, 'settings.manage': false, 'permissions.manage': false, 'audit.view': false }
  };
}

function initialSettings() {
  return {
    organizationName: 'مینی HRM',
    modules: { recruitment: true, psychology: true, publicPortal: true, auditLog: true },
    formRequired: DEFAULT_REQUIRED_FIELDS.slice(),
    psychologyRequired: true,
    questionOverrides: [],
    customRoles: [],
    otp: { mode: 'demo', token: '', fromNumber: '' },
    rolePermissions: defaultRolePermissions()
  };
}

module.exports = { FORM_FIELDS, DEFAULT_REQUIRED_FIELDS, PERMISSION_DEFINITIONS, defaultRolePermissions, initialSettings };
