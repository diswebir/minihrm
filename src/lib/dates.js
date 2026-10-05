'use strict';
/** تاریخ شمسی — نمایش به وقت تهران (UTC+3:30) و اعتبارسنجی با jalaali-js */
const jalaali = require('jalaali-js');

const FA_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const FA_DAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];

/** ایران از سال ۱۴۰۱ ساعت تابستانی ندارد — اختلاف ثابت ۳:۳۰+ */
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

function parseDate(dateInput) {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;
  let s = String(dateInput).trim();
  // خروجی SQLite: 'YYYY-MM-DD HH:MM:SS' (UTC)
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) s = s.replace(' ', 'T') + 'Z';
  else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = s + 'T00:00:00Z';
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** تاریخ/زمان میلادی -> شمسی '1404/07/14' (به وقت تهران) */
function toJalali(dateInput) {
  if (!dateInput) return '';
  // اگر از قبل شمسی بود
  const str = String(dateInput);
  if (/^\d{4}\/\d{2}\/\d{2}/.test(str)) return str.slice(0, 10);

  const d = parseDate(dateInput);
  if (!d) return '';
  const t = new Date(d.getTime() + TEHRAN_OFFSET_MS);
  const j = jalaali.toJalaali(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
}

/** تاریخ شمسی '1404/07/14' -> ISO میلادی '2025-10-06' (در صورت نامعتبر بودن null) */
function toGregorian(jalaliStr) {
  const m = String(jalaliStr || '').match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (!m) return null;
  const jy = +m[1], jm = +m[2], jd = +m[3];
  if (!jalaali.isValidJalaaliDate(jy, jm, jd)) return null;
  const g = jalaali.toGregorian(jy, jm, jd);
  return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
}

function isValidJalali(jalaliStr) {
  return toGregorian(jalaliStr) !== null;
}

/** تاریخ و زمان کامل شمسی برای نمایش: '1404/07/14 11:05' */
function toJalaliFull(dateInput) {
  const d = parseDate(dateInput);
  if (!d) return toJalali(dateInput);
  const t = new Date(d.getTime() + TEHRAN_OFFSET_MS);
  const time = `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`;
  return toJalali(d) + ' ' + time;
}

/** تاریخ امروز شمسی (به وقت تهران) */
function todayJalali() {
  return toJalali(new Date());
}

module.exports = { toJalali, toGregorian, isValidJalali, toJalaliFull, todayJalali, FA_MONTHS, FA_DAYS };
