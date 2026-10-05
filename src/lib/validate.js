'use strict';
/** اعتبارسنجی ورودی‌ها */
const dates = require('./dates');

const rules = {
  required: (v) => v !== undefined && v !== null && String(v).trim() !== '',
  phone: (v) => /^0?9\d{9}$/.test(String(v || '').replace(/[^\d]/g, '')) || /^\+989\d{9}$/.test(String(v || '')),
  nationalId: (v) => /^\d{10}$/.test(String(v || '').replace(/[^\d]/g, '')),
  email: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)),
  date: (v) => !v || dates.isValidJalali(v),
  number: (v) => v === '' || v === undefined || !isNaN(Number(v)),
  username: (v) => /^[a-zA-Z0-9_.-]{3,32}$/.test(String(v || '')),
  password: (v) => String(v || '').length >= 8
};

const messages = {
  required: 'این فیلد الزامی است',
  phone: 'شماره موبایل معتبر وارد کنید (مثال: 09123456789)',
  nationalId: 'کد ملی باید ۱۰ رقم باشد',
  email: 'ایمیل معتبر وارد کنید',
  date: 'تاریخ معتبر شمسی وارد کنید (مثال: 1370/05/12)',
  number: 'فقط عدد وارد کنید',
  username: 'نام کاربری باید ۳ تا ۳۲ کاراکتر انگلیسی (حرف، عدد، _ ، . ، -) باشد',
  password: 'رمز عبور باید حداقل ۸ کاراکتر باشد'
};

/** validate(body, schema) => {ok, errors}  | schema: {field: ['required','phone']} */
function validate(body, schema) {
  const errors = {};
  for (const [field, ruleList] of Object.entries(schema)) {
    const value = body[field];
    for (const rule of ruleList) {
      const fn = rules[rule];
      if (!fn) continue;
      if (!fn(value)) {
        errors[field] = messages[rule] || 'مقدار نامعتبر';
        break;
      }
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

function cleanText(v, max = 500) {
  return String(v === undefined || v === null ? '' : v).trim().slice(0, max);
}

module.exports = { validate, rules, messages, cleanText };
