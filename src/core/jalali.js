/**
 * تبدیل و قالب‌بندی تاریخ شمسی (بدون وابستگی خارجی)
 * الگوریتم: تبدیل دقیق تقویم جلالی (پورت‌شده از jalaali-js، لایسنس MIT)
 */
'use strict';

const div = (a, b) => ~~(a / b);
const mod = (a, b) => a - ~~(a / b) * b;

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060,
  2097, 2192, 2262, 2324, 2394, 2456, 3178
];

const MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

const WEEKDAYS = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

function jalCal(jy, withoutLeap) {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jm = 0;
  let jump = 0;
  let leap = 0;

  if (jy < jp || jy >= BREAKS[bl - 1]) throw new Error('سال جلالی نامعتبر: ' + jy);

  for (let i = 1; i < bl; i += 1) {
    jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (!withoutLeap) {
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
  }
  return { leap, gy, march };
}

function g2d(gy, gm, gd) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy, jm, jd) {
  const r = jalCal(jy, true);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy, false);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  let jm; let jd;
  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31);
      jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + div(k, 30);
  jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

/** میلادی → شمسی */
function toJalaali(gy, gm, gd) {
  if (gy instanceof Date) {
    return d2j(g2d(gy.getFullYear(), gy.getMonth() + 1, gy.getDate()));
  }
  return d2j(g2d(gy, gm, gd));
}

/** شمسی → میلادی */
function toGregorian(jy, jm, jd) {
  return d2g(j2d(jy, jm, jd));
}

/** آیا سال شمسی کبیسه است؟ */
function isLeapJalaali(jy) {
  return jalCal(jy, false).leap === 0;
}

/** تعداد روزهای ماه شمسی */
function jalaaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaali(jy) ? 30 : 29;
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

/** تاریخ شمسی به شکل 1404/08/25 */
function formatJalali(date = new Date(), opts = {}) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const j = d2j(g2d(d.getFullYear(), d.getMonth() + 1, d.getDate()));
  const sep = opts.sep === undefined ? '/' : opts.sep;
  return `${j.jy}${sep}${pad2(j.jm)}${sep}${pad2(j.jd)}`;
}

/** تاریخ و ساعت شمسی: 1404/08/25 - 14:30 */
function formatJalaliTime(date = new Date(), opts = {}) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const sep = opts.sep === undefined ? '/' : opts.sep;
  return `${formatJalali(d, { sep })} - ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** تاریخ شمسی خوانا: دوشنبه 25 آبان 1404 */
function formatJalaliLong(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const j = d2j(g2d(d.getFullYear(), d.getMonth() + 1, d.getDate()));
  const wd = WEEKDAYS[(d.getDay() + 1) % 7];
  return `${wd} ${j.jd} ${MONTHS[j.jm - 1]} ${j.jy}`;
}

/** بخش‌های تاریخ شمسی */
function jalaaliParts(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const j = d2j(g2d(d.getFullYear(), d.getMonth() + 1, d.getDate()));
  return { year: j.jy, month: j.jm, day: j.jd, monthName: MONTHS[j.jm - 1], weekday: WEEKDAYS[(d.getDay() + 1) % 7] };
}

/** تبدیل رشته تاریخ شمسی (1404/08/25) به Date میلادی */
function parseJalali(str) {
  if (!str) return null;
  const m = String(str).replace(/[۰-۹]/g, (c) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c))
    .match(/^\s*(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (!m) return null;
  const g = toGregorian(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
  const d = new Date(g.gy, g.gm - 1, g.gd, 12, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

/** ارقام فارسی */
function faDigits(input) {
  if (input === null || input === undefined) return '';
  return String(input).replace(/[0-9]/g, (c) => '۰۱۲۳۴۵۶۷۸۹'[+c]);
}

/** ارقام انگلیسی (نرمال‌سازی ورودی کاربر) */
function enDigits(input) {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
}

/** عدد با جداکننده هزارگان فارسی */
function faNumber(n, { digits = true } = {}) {
  if (n === null || n === undefined || n === '') return '';
  const num = Number(n);
  if (isNaN(num)) return String(n);
  const s = num.toLocaleString('en-US');
  return digits ? faDigits(s) : s;
}

/** فاصله زمانی خوانا: «۳ روز پیش» */
function timeAgo(date) {
  const d = date instanceof Date ? date : new Date(date);
  const diff = Date.now() - d.getTime();
  if (isNaN(diff)) return '';
  const min = 60 * 1000, hour = 60 * min, day = 24 * hour;
  if (diff < min) return 'همین حالا';
  if (diff < hour) return `${faDigits(Math.floor(diff / min))} دقیقه پیش`;
  if (diff < day) return `${faDigits(Math.floor(diff / hour))} ساعت پیش`;
  if (diff < 30 * day) return `${faDigits(Math.floor(diff / day))} روز پیش`;
  if (diff < 365 * day) return `${faDigits(Math.floor(diff / (30 * day)))} ماه پیش`;
  return `${faDigits(Math.floor(diff / (365 * day)))} سال پیش`;
}

module.exports = {
  toJalaali, toGregorian, isLeapJalaali, jalaaliMonthLength,
  formatJalali, formatJalaliTime, formatJalaliLong, jalaaliParts, parseJalali,
  faDigits, enDigits, faNumber, timeAgo,
  MONTHS, WEEKDAYS
};
