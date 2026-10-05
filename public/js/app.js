/* ==========================================================================
   مینی HRM — کیت کلاینت پنل مدیریت
   شامل: ابزارها، تقویم شمسی، API، کامپوننت‌ها، نمودارها، مسیریاب و ماژول‌ها
   ========================================================================== */
(function () {
  'use strict';

  const HRM = window.HRM = {
    version: '1.0.0',
    modules: [],
    routes: [],
    state: { user: null, permissions: [], nav: [], branding: {}, config: {}, moduleMap: {} }
  };

  /* ========================= ابزارهای عمومی ========================= */
  const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  function fa(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[0-9]/g, (c) => FA_DIGITS[+c]);
  }
  function en(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
      .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
  }
  function num(v, digits = true) {
    const n = Number(v);
    if (isNaN(n)) return digits ? fa(v) : String(v === null || v === undefined ? '' : v);
    const s = n.toLocaleString('en-US');
    return digits ? fa(s) : s;
  }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function debounce(fn, ms = 300) {
    let t;
    return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  }
  function uid(p = 'x') { return p + Math.random().toString(36).slice(2, 9); }
  function get(obj, path, fallback) {
    const parts = String(path).split('.');
    let cur = obj;
    for (const p of parts) { if (cur === null || cur === undefined) return fallback; cur = cur[p]; }
    return cur === undefined ? fallback : cur;
  }
  function deepGetFn(obj, path) {
    const fn = path.split('.').reduce((acc, part) => acc && acc[part], obj);
    return typeof fn === 'function' ? fn.bind(path.split('.').slice(0, -1).reduce((a, p) => a && a[p], obj)) : undefined;
  }

  /* ========================= تقویم شمسی (کلاینت) ========================= */
  const J = (function () {
    const div = (a, b) => ~~(a / b);
    const mod = (a, b) => a - ~~(a / b) * b;
    const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
    function jalCal(jy) {
      const bl = BREAKS.length, gy = jy + 621;
      let leapJ = -14, jp = BREAKS[0], jm = 0, jump = 0, leap = 0;
      for (let i = 1; i < bl; i += 1) {
        jm = BREAKS[i]; jump = jm - jp;
        if (jy < jm) break;
        leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
        jp = jm;
      }
      let n = jy - jp;
      leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
      if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
      const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
      const march = 20 + leapJ - leapG;
      if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
      leap = mod(mod(n + 1, 33) - 1, 4);
      if (leap === -1) leap = 4;
      return { leap, gy, march };
    }
    function g2d(gy, gm, gd) {
      let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
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
      const r = jalCal(jy);
      return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
    }
    function d2j(jdn) {
      const gy = d2g(jdn).gy;
      let jy = gy - 621;
      const r = jalCal(jy);
      const jdn1f = g2d(gy, 3, r.march);
      let k = jdn - jdn1f, jm, jd;
      if (k >= 0) {
        if (k <= 185) { jm = 1 + div(k, 31); jd = mod(k, 31) + 1; return { jy, jm, jd }; }
        k -= 186;
      } else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
      jm = 7 + div(k, 30); jd = mod(k, 30) + 1;
      return { jy, jm, jd };
    }
    const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
    const WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
    const WEEKDAYS_FULL = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
    const toJalaali = (d) => d2j(g2d(d.getFullYear(), d.getMonth() + 1, d.getDate()));
    const toGregorian = (jy, jm, jd) => d2g(j2d(jy, jm, jd));
    function monthLength(jy, jm) {
      if (jm <= 6) return 31;
      if (jm <= 11) return 30;
      return jalCal(jy).leap === 0 ? 30 : 29;
    }
    function parse(str) {
      if (!str) return null;
      const m = en(str).match(/^\s*(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
      if (!m) return null;
      const g = toGregorian(+m[1], +m[2], +m[3]);
      const d = new Date(g.gy, g.gm - 1, g.gd, 12, 0, 0);
      return isNaN(d.getTime()) ? null : d;
    }
    function format(date, sep = '/') {
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return '';
      const j = toJalaali(d);
      return `${j.jy}${sep}${String(j.jm).padStart(2, '0')}${sep}${String(j.jd).padStart(2, '0')}`;
    }
    function formatTime(date) {
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return '';
      return `${format(d)} - ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    function formatLong(date) {
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return '';
      const j = toJalaali(d);
      return `${WEEKDAYS_FULL[(d.getDay() + 1) % 7]} ${j.jd} ${MONTHS[j.jm - 1]} ${j.jy}`;
    }
    function ago(date) {
      const d = date instanceof Date ? date : new Date(date);
      const diff = Date.now() - d.getTime();
      if (isNaN(diff)) return '';
      const min = 60000, hour = 60 * min, day = 24 * hour;
      if (diff < min) return 'همین حالا';
      if (diff < hour) return `${fa(Math.floor(diff / min))} دقیقه پیش`;
      if (diff < day) return `${fa(Math.floor(diff / hour))} ساعت پیش`;
      if (diff < 30 * day) return `${fa(Math.floor(diff / day))} روز پیش`;
      if (diff < 365 * day) return `${fa(Math.floor(diff / (30 * day)))} ماه پیش`;
      return `${fa(Math.floor(diff / (365 * day)))} سال پیش`;
    }
    function relative(date) {
      const d = date instanceof Date ? date : new Date(date);
      const days = Math.round((d - new Date()) / 86400000);
      if (days === 0) return 'امروز';
      if (days === 1) return 'فردا';
      if (days === -1) return 'دیروز';
      if (days > 0 && days < 30) return `${fa(days)} روز آینده`;
      if (days < 0 && days > -30) return `${fa(-days)} روز پیش`;
      return format(d);
    }
    return { toJalaali, toGregorian, monthLength, parse, format, formatTime, formatLong, ago, relative, MONTHS, WEEKDAYS, WEEKDAYS_FULL };
  })();

  HRM.fa = fa; HRM.en = en; HRM.num = num; HRM.esc = esc; HRM.jalali = J;
  HRM.jdate = (d) => J.format(d); HRM.jtime = (d) => J.formatTime(d); HRM.ago = (d) => J.ago(d);
  HRM.debounce = debounce; HRM.uid = uid; HRM.get = get;

  /* ========================= آیکون‌ها ========================= */
  const ICONS = {
    'layout-dashboard': '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    'user-plus': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    'user-check': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M16 11l2 2 4-4"/>',
    'user-circle': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 19a6 6 0 0 1 11 0"/>',
    briefcase: '<rect x="2" y="7" width="20" height="14" rx="3"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    brain: '<path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3 3 0 0 0 7 17a3 3 0 0 0 5 2V3.5A3 3 0 0 0 9 3z"/><path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8A3 3 0 0 1 17 17a3 3 0 0 1-5 2"/>',
    'message-circle': '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.7 9.7 0 0 1-3.8-.7L3 21l1.9-4.5A8.3 8.3 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/>',
    'message-square': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    'bar-chart': '<path d="M12 20V10M18 20V4M6 20v-4"/>',
    'pie-chart': '<path d="M21.2 15.9A9 9 0 1 1 8 2.8"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
    'trending-up': '<path d="M22 7l-8.5 8.5-4-4L2 19"/><path d="M16 7h6v6"/>',
    history: '<path d="M3 3v6h6"/><path d="M3.5 9a9 9 0 1 0 2.5-4"/><path d="M12 8v4l3 2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11.5 4.4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 19.4 11a2 2 0 1 1 0 4z"/>',
    'shield-check': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    filter: '<path d="M4 4h16l-6 8v6l-4 2v-8z"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
    printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 17h10v4H7z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
    'check-square': '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    'x-circle': '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
    'chevron-down': '<path d="M6 9l6 6 6-6"/>',
    'chevron-up': '<path d="M18 15l-6-6-6 6"/>',
    'chevron-left': '<path d="M15 18l-6-6 6-6"/>',
    'chevron-right': '<path d="M9 18l6-6-6-6"/>',
    'chevrons-left': '<path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/>',
    'chevrons-right': '<path d="M13 17l5-5-5-5M6 17l5-5-5-5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 11h18"/>',
    'calendar-check': '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 11h18M9 16l2 2 4-4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M3 7l9 6 9-6"/>',
    'map-pin': '<path d="M21 10c0 6-9 12-9 12S3 16 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    star: '<path d="M12 3l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18l-5.9 3 1.2-6.5L2.5 9.9 9.1 9z"/>',
    tag: '<path d="M20.6 13.4L12 22l-9-9V4a1 1 0 0 1 1-1h9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
    'arrow-up': '<path d="M12 19V5M5 12l7-7 7 7"/>',
    'arrow-down': '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    'arrow-left': '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    sparkles: '<path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M19 15l.9 2.1 2.1.9-2.1.9L19 21l-.9-2.1-2.1-.9 2.1-.9z"/>',
    heart: '<path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21.4l8.8-8.7a5 5 0 0 0 0-7.1z"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2.2 5-4.8 2.2 2.2-5z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    puzzle: '<path d="M10 3a2 2 0 0 1 4 0v1h3a2 2 0 0 1 2 2v3h1a2 2 0 0 1 0 4h-1v3a2 2 0 0 1-2 2h-3v1a2 2 0 0 1-4 0v-1H7a2 2 0 0 1-2-2v-3H4a2 2 0 0 1 0-4h1V6a2 2 0 0 1 2-2h3z"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    crown: '<path d="M3 18h18l-1.5-9-4.5 4-3-6-3 6-4.5-4z"/>',
    award: '<circle cx="12" cy="9" r="6"/><path d="M9 14l-1.5 7L12 19l4.5 2L15 14"/>',
    book: '<path d="M4 4a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2z"/><path d="M6 16h13"/>',
    monitor: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    home: '<path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    paperclip: '<path d="M21 12.5l-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8L13 5a3.5 3.5 0 0 1 5 5l-8.3 8.3a1.5 1.5 0 0 1-2.1-2.1l7.8-7.8"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10M15 10v10"/>',
    type: '<path d="M4 6V4h16v2M12 4v16M9 20h6"/>',
    'align-right': '<path d="M21 6H3M21 12H9M21 18H6"/>',
    hash: '<path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/>',
    coins: '<circle cx="8" cy="8" r="5"/><path d="M18 9a5 5 0 1 1-8 4"/><path d="M15 14c2.5.5 4.5 2 4.5 4a4 4 0 0 1-7 2.6"/>',
    'circle-dot': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
    toggle: '<rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="15" cy="12" r="3" fill="currentColor"/>',
    heading: '<path d="M6 4v16M18 4v16M6 12h12"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    'list-checks': '<path d="M11 6h10M11 12h10M11 18h10M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
    'layout-template': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
    kanban: '<rect x="3" y="3" width="5" height="14" rx="1.5"/><rect x="10" y="3" width="5" height="10" rx="1.5"/><rect x="17" y="3" width="4" height="18" rx="1.5"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
    send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
    'pause-circle': '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
    archive: '<rect x="3" y="3" width="18" height="5" rx="1.5"/><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
    'clipboard-check': '<rect x="8" y="3" width="8" height="4" rx="1.5"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/><path d="M9 13l2 2 4-4"/>',
    clipboard: '<rect x="8" y="3" width="8" height="4" rx="1.5"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/>',
    'help-circle': '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.7-2.5 2-2.5 3.5"/><path d="M12 17h.01"/>',
    'file-text': '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-6 6-3-3-4 4"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    smartphone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9 2 2-2 2 2 2-3 3-2-2-3 3"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    activity: '<path d="M22 12h-4l-3 8-4-16-3 8H2"/>',
    zap: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM20 14h1M14 20h3M20 20h1"/>',
    'calendar-plus': '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 11h18M12 14v5M9.5 16.5h5"/>',
    camera: '<path d="M4 8h2.5l1.5-2.5h8L17.5 8H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z"/><circle cx="12" cy="14" r="3.5"/>',
    plug: '<path d="M9 3v6M15 3v6M6 9h12v2a6 6 0 0 1-6 6 6 6 0 0 1-6-6z"/><path d="M12 17v4"/>',
    percent: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
    'external-link': '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14L21 3"/>'
  };

  function icon(name, size = 18, cls = '') {
    const path = ICONS[name] || ICONS['circle-dot'] || ICONS.grid;
    return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  }
  HRM.icon = icon;
  HRM.icons = ICONS;

  /* ========================= ساخت DOM ========================= */
  const RAW = Symbol('raw');
  function raw(str) { return { [RAW]: true, str }; }
  HRM.raw = raw;

  function toNode(value) {
    if (value === null || value === undefined || value === false) return document.createTextNode('');
    if (value instanceof Node) return value;
    if (Array.isArray(value)) {
      const frag = document.createDocumentFragment();
      value.forEach((v) => frag.appendChild(toNode(v)));
      return frag;
    }
    if (typeof value === 'object' && value[RAW]) {
      const tpl = document.createElement('template');
      tpl.innerHTML = value.str;
      return tpl.content;
    }
    return document.createTextNode(String(value));
  }

  /** قالب امن: مقادیر به‌صورت پیش‌فرض escape می‌شوند
   *  نکته مهم: گره‌های DOM (Node) به‌صورت «همان گره» جای‌گذاری می‌شوند، نه کپی سریال‌شده؛
   *  بنابراین ارجاع‌های بعدی کد کلاینت (مثل فرم‌ها و selectها) به عنصر زنده صفحه اشاره می‌کنند. */
  function h(strings, ...values) {
    const anchors = [];            // گره‌های واقعی که باید جای نشانه‌ها بنشینند
    const used = new Set();        // یک گره چندبار استفاده شود → کپی
    const anchor = (node) => {
      anchors.push(node);
      return '<!--hph' + (anchors.length - 1) + '-->';
    };
    const flat = (v) => {
      if (v === null || v === undefined) return '';
      if (v instanceof Node) return anchor(v);
      if (Array.isArray(v)) return v.map(flat).join('');
      if (typeof v === 'object' && v[RAW]) return v.str;
      if (typeof v === 'object' && v.__path) return esc(get2(v.obj, v.__path));
      if (typeof v === 'object') return esc(JSON.stringify(v));
      return esc(v);
    };
    let out = '';
    strings.forEach((s, i) => {
      out += s;
      if (i < values.length) out += flat(values[i]);
    });
    const tpl = document.createElement('template');
    tpl.innerHTML = out.trim();
    const frag = tpl.content;
    if (anchors.length) {
      const marks = [];
      const walker = document.createTreeWalker(frag, NodeFilter.SHOW_COMMENT, null);
      let n;
      while ((n = walker.nextNode())) {
        const m = /^hph(\d+)$/.exec(n.nodeValue || '');
        if (m) marks.push([n, +m[1]]);
      }
      if (marks.length === anchors.length) {
        marks.forEach(([comment, idx]) => {
          const node = anchors[idx];
          const out2 = used.has(node) ? node.cloneNode(true) : node;
          used.add(node);
          if (comment.parentNode) comment.parentNode.replaceChild(out2, comment);
        });
      } else {
        // اگر HTML رندر نشانه‌ها را حذف کرد (زمینه‌های خاص مثل <select>)، به روش سریال‌سازی برمی‌گردیم
        const fallback = out.replace(/<!--hph(\d+)-->/g, (all, i2) => {
          const node = anchors[+i2];
          return node ? nodeToHtml(node) : '';
        });
        const tpl2 = document.createElement('template');
        tpl2.innerHTML = fallback.trim();
        const frag2 = tpl2.content;
        if (frag2.childElementCount === 1) return frag2.firstElementChild;
        const wrap2 = document.createElement('div');
        wrap2.appendChild(frag2);
        return wrap2;
      }
    }
    if (frag.childElementCount === 1) return frag.firstElementChild;
    const wrap = document.createElement('div');
    wrap.appendChild(frag);
    return wrap;
  }
  function nodeToHtml(node) {
    if (typeof node === 'string') return esc(node);
    const div = document.createElement('div');
    div.appendChild(node.cloneNode(true));
    return div.innerHTML;
  }
  function get2(obj, path) { return get(obj, path, ''); }
  HRM.h = h;
  HRM.el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
    });
    children.forEach((c) => node.appendChild(toNode(c)));
    return node;
  };
  HRM.frag = (...nodes) => { const f = document.createDocumentFragment(); nodes.forEach((n) => f.appendChild(toNode(n))); return f; };
  HRM.mount = (parent, node) => { parent.innerHTML = ''; parent.appendChild(toNode(node)); return parent.firstElementChild; };

  /* ========================= API ========================= */
  async function api(path, options = {}) {
    const opts = Object.assign({ method: 'GET' }, options);
    const url = '/api' + (path.startsWith('/') ? path : '/' + path);
    const headers = Object.assign({ 'X-Requested-With': 'HRM' }, opts.headers || {});
    let body = opts.body;
    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(url, { method: opts.method, headers, body, credentials: 'same-origin' });
    } catch (e) {
      throw Object.assign(new Error('ارتباط با سرور برقرار نشد. اتصال اینترنت یا وضعیت سرور را بررسی کنید.'), { network: true });
    }
    let json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    if (res.status === 401) {
      if (!opts.silent) window.location.href = '/admin?next=' + encodeURIComponent(location.hash || '');
      throw Object.assign(new Error('نشست شما منقضی شده است'), { status: 401 });
    }
    if (res.status === 428 && json && json.code === 'must_change_password') {
      HRM.requirePasswordChange();
      throw Object.assign(new Error(json.error), { status: 428, mustChange: true });
    }
    if (!res.ok || (json && json.ok === false)) {
      const err = Object.assign(new Error((json && json.error) || `خطای ${res.status}`), {
        status: res.status, fields: json && json.fields, code: json && json.code, json
      });
      if (!opts.silent) HRM.toast(err.message, 'error');
      throw err;
    }
    return json ? json.data : null;
  }
  HRM.api = api;
  HRM.get = (p, o) => api(p, Object.assign({ method: 'GET' }, o));
  HRM.post = (p, body, o) => api(p, Object.assign({ method: 'POST', body }, o));
  HRM.put = (p, body, o) => api(p, Object.assign({ method: 'PUT', body }, o));
  HRM.patch = (p, body, o) => api(p, Object.assign({ method: 'PATCH', body }, o));
  HRM.del = (p, o) => api(p, Object.assign({ method: 'DELETE' }, o));
  HRM.can = (perm) => {
    const perms = HRM.state.permissions || [];
    if (perms.includes('*')) return true;
    if (!perm) return true;
    if (perms.includes(perm)) return true;
    const parts = perm.split('.');
    if (perms.includes(parts[0] + '.*')) return true;
    if (parts.length > 2 && perms.includes(parts[0] + '.' + parts[1] + '.*')) return true;
    return false;
  };

  /* ========================= توست ========================= */
  function toastWrap() {
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
    return wrap;
  }
  HRM.toast = (message, type = 'info', title = '') => {
    const wrap = toastWrap();
    const titles = { success: 'انجام شد', error: 'خطا', warning: 'توجه', info: 'اطلاع' };
    const node = h`<div class="toast ${type}">
      <span class="t-icon">${raw(icon(type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : type === 'warning' ? 'alert' : 'info', 20))}</span>
      <div class="t-body"><div class="t-title">${title || titles[type]}</div><div>${message}</div></div>
      <button class="icon-btn" style="width:28px;height:28px;border-radius:9px" data-close>${raw(icon('x', 14))}</button>
    </div>`;
    wrap.appendChild(node);
    const remove = () => { node.classList.add('fade-out'); setTimeout(() => node.remove(), 250); };
    node.querySelector('[data-close]').addEventListener('click', remove);
    setTimeout(remove, type === 'error' ? 7000 : 4200);
    return node;
  };

  /* ========================= مودال / دراور ========================= */
  HRM.modal = function ({ title, subtitle, body, footer, size = '' }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const bodyNode = toNode(body);
    const modal = h`<div class="modal ${size}">
      <div class="modal-head">
        <div><div class="modal-title">${title || ''}</div>${subtitle ? h`<div class="modal-sub">${subtitle}</div>` : ''}</div>
        <button class="icon-btn" data-close>${raw(icon('x', 16))}</button>
      </div>
      <div class="modal-body"></div>
      ${footer ? h`<div class="modal-foot"></div>` : ''}
    </div>`;
    modal.querySelector('.modal-body').appendChild(bodyNode);
    if (footer) modal.querySelector('.modal-foot').appendChild(toNode(typeof footer === 'function' ? footer(() => close()) : footer));
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    document.body.style.overflow = 'hidden';

    function close() {
      backdrop.remove();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    modal.querySelector('[data-close]').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    const first = modal.querySelector('input,select,textarea,button.btn-primary');
    if (first) setTimeout(() => first.focus(), 60);
    return { close, el: modal, backdrop };
  };

  HRM.confirm = function ({ title = 'تأیید عملیات', message, confirmText = 'تأیید', cancelText = 'انصراف', danger = false }) {
    return new Promise((resolve) => {
      const m = HRM.modal({
        title,
        size: 'narrow',
        body: h`<p class="mb-0">${message || 'آیا از انجام این عملیات مطمئن هستید؟'}</p>`,
        footer: h`<button class="btn btn-ghost" data-no>${cancelText}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${confirmText}</button>`
      });
      m.el.querySelector('[data-yes]').addEventListener('click', () => { m.close(); resolve(true); });
      m.el.querySelector('[data-no]').addEventListener('click', () => { m.close(); resolve(false); });
    });
  };

  HRM.drawer = function ({ title, subtitle, body, footer, size }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'drawer-backdrop';
    const drawer = h`<div class="drawer" ${size === 'lg' ? 'style="width:min(980px,100%)"' : ''}>
      <div class="drawer-head">
        <div><div class="modal-title">${title || ''}</div>${subtitle ? h`<div class="modal-sub">${subtitle}</div>` : ''}</div>
        <button class="icon-btn" data-close>${raw(icon('x', 16))}</button>
      </div>
      <div class="drawer-body"></div>
      ${footer ? h`<div class="modal-foot" style="margin:0"></div>` : ''}
    </div>`;
    drawer.querySelector('.drawer-body').appendChild(toNode(body));
    if (footer) drawer.querySelector('.modal-foot').appendChild(toNode(footer));
    backdrop.appendChild(drawer);
    document.body.appendChild(backdrop);
    document.body.style.overflow = 'hidden';
    function close() { backdrop.remove(); drawer.remove(); document.body.style.overflow = ''; }
    backdrop.addEventListener('click', close);
    drawer.querySelector('[data-close]').addEventListener('click', close);
    return { close, el: drawer };
  };

  /* ========================= کامپوننت‌های کوچک ========================= */
  HRM.badge = (text, color = 'sky', withDot = false) =>
    h`<span class="badge badge-${color}">${withDot ? raw('<span class="dot-s"></span>') : ''}${text}</span>`;
  HRM.avatar = (name, { size = '', color = 'violet', src = null } = {}) => {
    const cls = `avatar ${size} ${color}`;
    if (src) return h`<div class="${cls}"><img src="${src}" alt="${name || ''}"></div>`;
    const initials = String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('');
    return h`<div class="${cls}">${initials}</div>`;
  };
  HRM.empty = (title, description, actionHtml) => h`<div class="empty">
    <div class="icon-wrap">${raw(icon('inbox', 34))}</div>
    <h3>${title || 'موردی یافت نشد'}</h3>
    <p>${description || 'هنوز داده‌ای برای نمایش وجود ندارد.'}</p>
    ${actionHtml ? raw(actionHtml) : ''}
  </div>`;
  HRM.skeleton = (rows = 4, height = 46) => h`<div class="col gap-2">${raw(new Array(rows).fill(`<div class="skeleton" style="height:${height}px"></div>`).join(''))}</div>`;
  HRM.spinner = (size = 20) => h`<span class="spinner" style="width:${size}px;height:${size}px"></span>`;
  HRM.loading = (parent) => {
    const node = h`<div class="loading-overlay">${raw(HRM.spinner(28))}</div>`;
    parent.style.position = 'relative';
    parent.appendChild(node);
    return () => node.remove();
  };
  HRM.statCard = ({ label, value, icon: iconName = 'activity', color = 'violet', trend = null, hint = null, action = null }) =>
    h`<div class="kpi ${color}">
      <div class="kpi-icon">${raw(icon(iconName, 22))}</div>
      <div class="grow">
        <div class="kpi-value">${value}</div>
        <div class="kpi-label">${label}</div>
        ${trend !== null && trend !== undefined ? h`<div class="kpi-trend ${trend > 0 ? 'trend-up' : trend < 0 ? 'trend-down' : 'trend-flat'}">
          ${raw(icon(trend > 0 ? 'arrow-up' : trend < 0 ? 'arrow-down' : 'activity', 13))}
          ${trend > 0 ? '+' : ''}${num(trend)}٪ ${hint ? h`<span class="muted">${hint}</span>` : ''}
        </div>` : (hint ? h`<div class="kpi-trend muted">${hint}</div>` : '')}
      </div>
      ${action ? action : ''}
    </div>`;

  HRM.card = ({ title, subtitle, actions, body, className = '', icon: iconName }) =>
    h`<div class="card ${className}">
      ${title || actions ? h`<div class="card-head">
        <div>${h`<div class="card-title">${iconName ? raw(icon(iconName, 18)) : ''}${title || ''}</div>`}${subtitle ? h`<div class="card-sub">${subtitle}</div>` : ''}</div>
        ${actions ? h`<div class="actions">${actions}</div>` : ''}
      </div>` : ''}
      <div class="card-body">${body}</div>
    </div>`;

  /** جدول داده با ستون‌های پویا */
  HRM.table = ({ columns, rows, empty, onRowClick, size = '' }) => {
    if (!rows || !rows.length) return toNode(empty || HRM.empty('موردی یافت نشد', 'با فیلترهای فعلی داده‌ای برای نمایش وجود ندارد.'));
    const table = h`<div class="table-wrap"><table class="table">
      <thead><tr>${columns.map((c) => h`<th ${c.width ? `style="width:${c.width}"` : ''}>${c.title}</th>`)}</tr></thead>
      <tbody>${rows.map((row, i) => h`<tr data-index="${i}" class="${onRowClick ? 'row-click' : ''}">
        ${columns.map((c) => h`<td class="${c.class || ''}">${colValue(c, row, i)}</td>`)}
      </tr>`)}</tbody>
    </table></div>`;
    if (onRowClick) {
      table.querySelectorAll('tbody tr').forEach((tr) => {
        tr.addEventListener('click', (e) => {
          if (e.target.closest('button, a, input, select, [data-stop]')) return;
          onRowClick(rows[+tr.dataset.index], +tr.dataset.index);
        });
      });
    }
    return table;
  };
  function colValue(c, row, i) {
    if (typeof c.render === 'function') {
      const v = c.render(row, i);
      return v instanceof Node || (v && v[RAW]) ? v : toNode(v === undefined ? '' : v);
    }
    if (typeof c.get === 'function') return toNode(c.get(row, i));
    const v = get(row, c.key, '');
    if (v instanceof Node) return v;
    return c.raw ? raw(String(v === null || v === undefined ? '' : v)) : (v === null || v === undefined ? '' : v);
  }

  HRM.pagination = ({ page, pages, total, perPage, onChange }) => {
    if (!total) return h`<div></div>`;
    const buttons = [];
    const push = (p, label, active = false, disabled = false) => buttons.push(
      h`<button class="btn btn-sm ${active ? 'btn-primary' : 'btn-ghost'}" ${disabled ? 'disabled' : ''} data-page="${p}">${label}</button>`);
    push(page - 1, raw(icon('chevron-right', 14)), false, page <= 1);
    const start = Math.max(1, Math.min(page - 2, pages - 4));
    const end = Math.min(pages, start + 4);
    for (let p = start; p <= end; p++) push(p, num(p), p === page);
    push(page + 1, raw(icon('chevron-left', 14)), false, page >= pages);
    const node = h`<div class="row between wrap mt-2" style="gap:8px">
      <div class="text-xs muted">نمایش ${num((page - 1) * perPage + 1)} تا ${num(Math.min(page * perPage, total))} از ${num(total)} مورد</div>
      <div class="row gap-1">${buttons}</div>
    </div>`;
    node.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => {
      const p = +b.dataset.page;
      if (p >= 1 && p <= pages && p !== page) onChange(p);
    }));
    return node;
  };

  /* ========================= فرم‌ساز رندر ========================= */
  /**
   * ساخت فرم از تعریف فیلدها
   * fields: [{name, label, type, required, options, help, placeholder, col, ...}]
   */
  HRM.form = function (fields, values = {}, opts = {}) {
    const container = document.createElement('div');
    container.className = 'form-grid';
    const controls = {};
    fields.forEach((f) => {
      if (f.type === 'heading') {
        container.appendChild(h`<div class="col-12 mt-2"><div class="divider"></div><h4>${f.label}</h4>${f.help ? h`<small class="muted">${f.help}</small>` : ''}</div>`);
        return;
      }
      if (f.type === 'note') {
        container.appendChild(h`<div class="col-12"><div class="insight sky"><span class="ic">${raw(icon('info', 16))}</span><div class="text-sm">${f.label}</div></div></div>`);
        return;
      }
      const value = values[f.name] !== undefined ? values[f.name] : (f.default !== undefined ? f.default : '');
      const wrap = h`<div class="field col-${f.col || 6}" data-field="${f.name}">
        <label class="label">${f.label}${f.required ? raw(' <span class="req">*</span>') : ''}</label>
      </div>`;
      let control;
      if (f.type === 'textarea') {
        control = h`<textarea class="textarea" name="${f.name}" rows="${f.rows || 3}" placeholder="${f.placeholder || ''}">${value || ''}</textarea>`;
      } else if (f.type === 'select') {
        control = h`<select class="select" name="${f.name}">
          <option value="">${f.placeholder || 'انتخاب کنید…'}</option>
          ${(f.options || []).map((o) => h`<option value="${o.value !== undefined ? o.value : o}" ${String(value) === String(o.value !== undefined ? o.value : o) ? 'selected' : ''}>${o.label !== undefined ? o.label : o}</option>`)}
        </select>`;
      } else if (f.type === 'switch') {
        wrap.className = `field col-${f.col || 12}`;
        control = h`<label class="checkline ${value ? 'checked' : ''}" style="align-items:center">
          <input type="checkbox" name="${f.name}" ${value ? 'checked' : ''}>
          <span class="text-sm grow">${f.placeholder || f.help || 'فعال'}</span>
        </label>`;
      } else if (f.type === 'radio') {
        const group = h`<div class="radio-cards">${(f.options || []).map((o) => {
          const val = o.value !== undefined ? o.value : o;
          return h`<label class="radio-card ${String(value) === String(val) ? 'selected' : ''}">
            <input type="radio" name="${f.name}" value="${val}" ${String(value) === String(val) ? 'checked' : ''}>
            <span class="text-sm">${o.label !== undefined ? o.label : o}</span></label>`;
        })}</div>`;
        control = group;
      } else if (f.type === 'checkbox') {
        const list = Array.isArray(value) ? value : (value ? [value] : []);
        control = h`<div class="radio-cards">${(f.options || []).map((o) => {
          const val = o.value !== undefined ? o.value : o;
          return h`<label class="radio-card ${list.includes(val) ? 'selected' : ''}">
            <input type="checkbox" name="${f.name}" value="${val}" ${list.includes(val) ? 'checked' : ''}>
            <span class="text-sm">${o.label !== undefined ? o.label : o}</span></label>`;
        })}</div>`;
      } else if (f.type === 'date') {
        control = h`<input class="input" name="${f.name}" placeholder="1404/01/01" inputmode="numeric" value="${value || ''}" autocomplete="off">`;
      } else if (f.type === 'currency') {
        control = h`<input class="input ltr" name="${f.name}" inputmode="numeric" placeholder="${f.placeholder || '0'}" value="${value || ''}">`;
      } else if (f.type === 'number') {
        control = h`<input class="input ltr" type="number" name="${f.name}" placeholder="${f.placeholder || ''}" value="${value === null || value === undefined ? '' : value}">`;
      } else {
        control = h`<input class="input" type="${f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'}" name="${f.name}"
          placeholder="${f.placeholder || ''}" value="${value === null || value === undefined ? '' : value}" ${f.type === 'tel' ? 'inputmode="numeric"' : ''}>`;
      }
      if (f.help && f.type !== 'switch') wrap.appendChild(h`<div class="hint">${f.help}</div>`);
      wrap.appendChild(control);
      controls[f.name] = { field: f, wrap, control };
      container.appendChild(wrap);

      // رفتار تعاملی
      if (f.type === 'switch') {
        const cb = control.querySelector('input');
        cb.addEventListener('change', () => control.classList.toggle('checked', cb.checked));
      }
      if (f.type === 'radio' || f.type === 'checkbox') {
        control.querySelectorAll('input').forEach((inp) => inp.addEventListener('change', () => {
          if (f.type === 'radio') control.querySelectorAll('.radio-card').forEach((c) => c.classList.remove('selected'));
          inp.closest('.radio-card').classList.toggle('selected', inp.checked);
        }));
      }
      if (f.type === 'date') HRM.attachDatePicker(control);
    });

    const api = {
      el: container,
      fields,
      values() {
        const out = {};
        fields.forEach((f) => {
          const c = controls[f.name];
          if (!c) return;
          if (f.type === 'switch') out[f.name] = c.control.querySelector('input').checked;
          else if (f.type === 'checkbox') {
            out[f.name] = Array.from(c.control.querySelectorAll('input:checked')).map((i) => i.value);
          } else if (f.type === 'radio') {
            const checked = c.control.querySelector('input:checked');
            out[f.name] = checked ? checked.value : '';
          } else if (f.type === 'number') {
            const v = c.control.value;
            out[f.name] = v === '' ? '' : Number(en(v));
          } else out[f.name] = en(c.control.value).trim();
        });
        return out;
      },
      setValues(values = {}) {
        Object.entries(values).forEach(([k, v]) => {
          const c = controls[k];
          if (!c) return;
          if (c.field.type === 'switch') c.control.querySelector('input').checked = !!v;
          else if (c.field.type === 'checkbox') {
            const list = Array.isArray(v) ? v : (v ? [v] : []);
            c.control.querySelectorAll('input').forEach((i) => { i.checked = list.includes(i.value); i.closest('.radio-card').classList.toggle('selected', i.checked); });
          } else if (c.field.type === 'radio') {
            c.control.querySelectorAll('input').forEach((i) => { i.checked = String(i.value) === String(v); i.closest('.radio-card').classList.toggle('selected', i.checked); });
          } else c.control.value = v === null || v === undefined ? '' : v;
        });
      },
      clearErrors() { Object.values(controls).forEach((c) => { c.wrap.classList.remove('invalid'); const e = c.wrap.querySelector('.error-text'); if (e) e.remove(); }); },
      setErrors(errors = {}) {
        api.clearErrors();
        let first = null;
        Object.entries(errors).forEach(([key, msg]) => {
          const name = key.includes('.') ? key.split('.').pop() : key;
          const c = controls[name];
          if (!c) return;
          c.wrap.classList.add('invalid');
          c.wrap.appendChild(h`<div class="error-text">${msg}</div>`);
          if (!first) first = c.wrap;
        });
        if (first && typeof first.scrollIntoView === 'function') first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return Object.keys(errors).length === 0;
      },
      validate() {
        const v = api.values();
        const errors = {};
        fields.forEach((f) => {
          const val = v[f.name];
          const empty = val === undefined || val === null || val === '' || (Array.isArray(val) && !val.length);
          if (f.required && empty && f.type !== 'switch') errors[f.name] = 'تکمیل این فیلد الزامی است';
          if (f.required && f.type === 'switch' && !val) errors[f.name] = 'تأیید این مورد الزامی است';
          if (f.type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val)) errors[f.name] = 'ایمیل نامعتبر است';
          if (f.type === 'tel' && val && !/^0?\d{9,11}$/.test(en(val).replace(/\D/g, ''))) errors[f.name] = 'شماره تماس نامعتبر است';
        });
        return { valid: Object.keys(errors).length === 0, errors, values: v };
      },
      control: (name) => (controls[name] ? controls[name].control : null),
      setError(name, msg) {
        const c = controls[name];
        if (!c) return;
        c.wrap.classList.add('invalid');
        c.wrap.appendChild(h`<div class="error-text">${msg}</div>`);
      }
    };
    return api;
  };

  /* ========================= انتخابگر تاریخ شمسی ========================= */
  HRM.attachDatePicker = function (input) {
    if (input.dataset.dpAttached) return;
    input.dataset.dpAttached = '1';
    const wrap = document.createElement('div');
    wrap.style.position = 'relative';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    let pop = null;
    let view = null;

    function currentViewDate() {
      const parsed = J.parse(input.value);
      return parsed || new Date();
    }
    function close() { if (pop) { pop.remove(); pop = null; } document.removeEventListener('mousedown', onDoc, true); }
    function onDoc(e) { if (pop && !pop.contains(e.target) && e.target !== input) close(); }

    function render() {
      view = view || J.toJalaali(currentViewDate());
      const firstG = J.toGregorian(view.jy, view.jm, 1);
      const firstDay = new Date(firstG.gy, firstG.gm - 1, firstG.gd);
      const startWeekday = (firstDay.getDay() + 1) % 7;   // ۰ = شنبه
      const len = J.monthLength(view.jy, view.jm);
      const selected = J.parse(input.value);
      const todayJ = J.toJalaali(new Date());
      const cells = [];
      for (let i = 0; i < startWeekday; i++) cells.push(null);
      for (let d = 1; d <= len; d++) cells.push(d);

      pop = h`<div class="card pad-sm" style="position:absolute;z-index:50;top:calc(100% + 6px);inset-inline-start:0;width:286px;box-shadow:var(--shadow-lg);padding:12px">
        <div class="row between mb-2">
          <button type="button" class="icon-btn" style="width:32px;height:32px" data-prev>${raw(icon('chevron-right', 14))}</button>
          <div class="row gap-1">
            <strong>${J.MONTHS[view.jm - 1]}</strong><span class="muted">${num(view.jy)}</span>
          </div>
          <button type="button" class="icon-btn" style="width:32px;height:32px" data-next>${raw(icon('chevron-left', 14))}</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;font-size:.72rem;color:var(--text-3)">
          ${J.WEEKDAYS.map((w) => h`<div style="padding:4px 0">${w}</div>`)}
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-top:4px">
          ${cells.map((d) => {
            if (!d) return h`<div></div>`;
            const isSel = selected && J.toJalaali(selected).jy === view.jy && J.toJalaali(selected).jm === view.jm && J.toJalaali(selected).jd === d;
            const isToday = todayJ.jy === view.jy && todayJ.jm === view.jm && todayJ.jd === d;
            return h`<button type="button" data-day="${d}" style="border:0;background:${isSel ? 'var(--violet-500)' : isToday ? 'var(--violet-50)' : 'transparent'};
              color:${isSel ? '#fff' : 'var(--text)'};border-radius:10px;padding:7px 0;font-family:inherit;font-size:.82rem;cursor:pointer">${num(d)}</button>`;
          })}
        </div>
        <div class="row between mt-2">
          <button type="button" class="btn btn-sm btn-soft" data-today>امروز</button>
          <button type="button" class="btn btn-sm btn-ghost" data-clear>پاک کردن</button>
        </div>
      </div>`;
      wrap.appendChild(pop);
      pop.querySelector('[data-prev]').addEventListener('click', () => { view.jm--; if (view.jm < 1) { view.jm = 12; view.jy--; } rerender(); });
      pop.querySelector('[data-next]').addEventListener('click', () => { view.jm++; if (view.jm > 12) { view.jm = 1; view.jy++; } rerender(); });
      pop.querySelector('[data-today]').addEventListener('click', () => {
        input.value = J.format(new Date());
        input.dispatchEvent(new Event('change', { bubbles: true }));
        close();
      });
      pop.querySelector('[data-clear]').addEventListener('click', () => {
        input.value = '';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        close();
      });
      pop.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => {
        const g = J.toGregorian(view.jy, view.jm, +b.dataset.day);
        input.value = J.format(new Date(g.gy, g.gm - 1, g.gd));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        close();
      }));
      document.addEventListener('mousedown', onDoc, true);
    }
    function rerender() { if (pop) { pop.remove(); pop = null; } render(); }

    input.addEventListener('focus', render);
    input.addEventListener('input', () => { const p = J.parse(input.value); if (p) view = J.toJalaali(p); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  };

  /* ========================= نمودارها ========================= */
  const charts = {
    colors: ['#7C6CF0', '#43bda0', '#4fa8dc', '#fb8a52', '#f7b731', '#ef6a97', '#9c88f7', '#6ed0b8'],
    /** نمودار خطی/سطحی */
    line(data, { height = 220, labels = null, color = '#7C6CF0', showArea = true, formatValue = (v) => num(v), labelFor = null } = {}) {
      if (!data || !data.length) return h`<div class="empty text-sm">داده‌ای برای نمایش نیست</div>`;
      const w = 720, h2 = height, padTop = 18, padBottom = 30, padSide = 34;
      const values = data.map((d) => d.value !== undefined ? d.value : d.count || 0);
      const max = Math.max(1, ...values);
      const stepX = (w - padSide * 2) / Math.max(1, data.length - 1);
      const y = (v) => h2 - padBottom - (v / max) * (h2 - padTop - padBottom);
      const pts = values.map((v, i) => [padSide + i * stepX, y(v)]);
      const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
      const areaPath = `${linePath} L${pts[pts.length - 1][0].toFixed(1)},${h2 - padBottom} L${pts[0][0].toFixed(1)},${h2 - padBottom} Z`;
      const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => h`<line class="grid-line" x1="${padSide}" x2="${w - padSide}" y1="${y(max * f).toFixed(1)}" y2="${y(max * f).toFixed(1)}"/>`);
      const xLabels = data.map((d, i) => {
        if (data.length > 12 && i % Math.ceil(data.length / 8) !== 0) return '';
        const label = labelFor ? labelFor(d) : (labels ? labels[i] : J.format(d.date || d.x));
        return `<text class="axis-label" x="${(padSide + i * stepX).toFixed(1)}" y="${h2 - 10}" text-anchor="middle">${esc(label)}</text>`;
      }).join('');
      return h`<svg class="chart" viewBox="0 0 ${w} ${h2}" preserveAspectRatio="none" style="height:${height}px">
        <defs><linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/><stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
        </linearGradient></defs>
        ${raw(gridLines.map((g) => g.outerHTML).join(''))}
        <text class="axis-label" x="${padSide - 8}" y="${y(max) + 4}" text-anchor="end">${formatValue(max)}</text>
        <text class="axis-label" x="${padSide - 8}" y="${h2 - padBottom}" text-anchor="end">۰</text>
        ${showArea ? raw(`<path class="area" d="${areaPath}" fill="url(#areaGradient)"/>`) : ''}
        ${raw(`<path class="line" d="${linePath}" stroke="${color}"/>`)}
        ${pts.length <= 40 ? raw(pts.map((p, i) => `<circle class="dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" stroke="${color}"><title>${esc((labelFor ? labelFor(data[i]) : J.format(data[i].date || data[i].x)) + ' — ' + formatValue(values[i]))}</title></circle>`).join('')) : ''}
        ${raw(xLabels)}
      </svg>`;
    },
    /** نمودار میله‌ای افقی */
    bars(items, { color = 'violet', max = null, formatValue = (v) => num(v), onClick = null } = {}) {
      if (!items || !items.length) return h`<div class="empty text-sm">داده‌ای برای نمایش نیست</div>`;
      const maxV = max || Math.max(1, ...items.map((i) => i.value || i.count || 0));
      const wrap = h`<div>${items.map((it) => {
        const v = it.value !== undefined ? it.value : it.count;
        const percent = Math.max(2, Math.round((v / maxV) * 100));
        return h`<div class="bar-row ${onClick ? 'pointer' : ''}" ${onClick ? `data-key="${it.key || it.label || ''}"` : ''}>
          <div class="bar-label ellipsis" title="${it.label}">${it.label}</div>
          <div class="bar-track"><div class="bar-fill ${it.color || color}" style="width:${percent}%"></div></div>
          <div class="bar-value">${formatValue(v)}</div>
        </div>`;
      })}</div>`;
      if (onClick) wrap.querySelectorAll('[data-key]').forEach((row) => row.addEventListener('click', () => onClick(row.dataset.key)));
      return wrap;
    },
    /** نمودار دونات */
    donut(items, { size = 190, thickness = 24, centerLabel = null, centerValue = null } = {}) {
      const total = items.reduce((s, i) => s + (i.value || i.count || 0), 0);
      if (!total) return h`<div class="empty text-sm">داده‌ای برای نمایش نیست</div>`;
      const r = (size - thickness) / 2;
      const c = size / 2;
      const circ = 2 * Math.PI * r;
      let offset = 0;
      const segments = items.map((it, idx) => {
        const v = it.value || it.count || 0;
        const frac = v / total;
        const seg = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${it.colorHex || charts.colors[idx % charts.colors.length]}"
          stroke-width="${thickness}" stroke-dasharray="${(frac * circ).toFixed(2)} ${circ.toFixed(2)}"
          stroke-dashoffset="${(-offset * circ + circ / 4).toFixed(2)}" stroke-linecap="butt"><title>${esc(it.label)}: ${num(v)}</title></circle>`;
        offset += frac;
        return seg;
      }).join('');
      return h`<div class="row gap-3 wrap" style="align-items:center">
        <div style="position:relative;width:${size}px;height:${size}px;flex:0 0 ${size}px">
          <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${raw(segments)}</svg>
          <div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center">
            <div><div class="bold" style="font-size:1.3rem">${centerValue !== null ? centerValue : num(total)}</div>
            <div class="text-xs muted">${centerLabel || 'مجموع'}</div></div>
          </div>
        </div>
        <div class="grow">${items.slice(0, 8).map((it, idx) => h`<div class="row between text-sm" style="padding:3px 0">
          <span class="row gap-1"><span style="width:10px;height:10px;border-radius:3px;background:${it.colorHex || charts.colors[idx % charts.colors.length]};display:inline-block"></span>${it.label}</span>
          <span class="muted">${num(it.value || it.count)} (${num(Math.round(((it.value || it.count) / total) * 100))}٪)</span>
        </div>`)}</div>
      </div>`;
    },
    /** نمودار راداری (برای ابعاد شخصیتی) */
    radar(axes, { size = 320, max = 100, color = '#7C6CF0' } = {}) {
      if (!axes || axes.length < 3) return h`<div class="empty text-sm">داده کافی برای نمودار نیست</div>`;
      const c = size / 2;
      const radius = c - 46;
      const n = axes.length;
      const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
      const point = (i, value) => [c + Math.cos(angle(i)) * radius * (value / max), c + Math.sin(angle(i)) * radius * (value / max)];
      const rings = [0.25, 0.5, 0.75, 1].map((f) => {
        const pts = axes.map((_, i) => point(i, max * f).map((x) => x.toFixed(1)).join(',')).join(' ');
        return `<polygon points="${pts}" fill="none" stroke="#ececf5" stroke-width="1"/>`;
      }).join('');
      const spokes = axes.map((_, i) => {
        const p = point(i, max).map((x) => x.toFixed(1));
        return `<line x1="${c}" y1="${c}" x2="${p[0]}" y2="${p[1]}" stroke="#ececf5"/>`;
      }).join('');
      const shape = axes.map((a, i) => point(i, Math.max(4, a.value)).map((x) => x.toFixed(1)).join(',')).join(' ');
      const dots = axes.map((a, i) => { const p = point(i, Math.max(4, a.value)); return `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="#fff" stroke="${color}" stroke-width="2"/>`; }).join('');
      const labels = axes.map((a, i) => {
        const p = point(i, max + 14);
        const anchor = Math.abs(p[0] - c) < 12 ? 'middle' : (p[0] > c ? 'start' : 'end');
        return `<text class="axis-label" x="${p[0].toFixed(1)}" y="${(p[1] + 4).toFixed(1)}" text-anchor="${anchor}" style="font-size:10.5px">${esc(a.label)}</text>`;
      }).join('');
      return h`<svg class="chart" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        ${raw(rings)}${raw(spokes)}
        <polygon points="${shape}" fill="${color}22" stroke="${color}" stroke-width="2"/>
        ${raw(dots)}${raw(labels)}
      </svg>`;
    },
    /** قیف */
    funnel(steps) {
      if (!steps || !steps.length) return h`<div class="empty text-sm">داده‌ای برای نمایش نیست</div>`;
      const max = Math.max(1, ...steps.map((s) => s.value));
      const colors = { violet: 'linear-gradient(90deg,#9c88f7,#6552e6)', mint: 'linear-gradient(90deg,#6ed0b8,#2c9d84)', sky: 'linear-gradient(90deg,#7ec1e8,#3289bb)', peach: 'linear-gradient(90deg,#ffab7d,#e5703a)', lemon: 'linear-gradient(90deg,#ffcd6b,#d99a15)', rose: 'linear-gradient(90deg,#f890b4,#d44c7b)' };
      return h`<div class="funnel">${steps.map((s, i) => {
        const width = Math.max(14, Math.round((s.value / max) * 100));
        const prev = i > 0 ? steps[i - 1].value : s.value;
        const drop = prev ? Math.round(((prev - s.value) / (prev || 1)) * 100) : 0;
        return h`<div class="funnel-step">
          <div class="funnel-bar" style="width:${width}%;background:${colors[s.color] || colors.violet}">${s.label}</div>
          <div class="funnel-meta nowrap">${num(s.value)}${i > 0 && drop > 0 ? h` <span class="trend-down">(-${num(drop)}٪)</span>` : ''}</div>
        </div>`;
      })}</div>`;
    },
    /** میله‌های کوچک درون‌خطی */
    sparkline(values, { width = 110, height = 30, color = '#7C6CF0' } = {}) {
      if (!values || values.length < 2) return h`<span></span>`;
      const max = Math.max(...values, 1);
      const step = width / (values.length - 1);
      const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - (v / max) * height).toFixed(1)}`).join(' ');
      return h`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/></svg>`;
    },
    /** نمودار ستونی عمودی */
    columns(items, { height = 180, color = 'violet', formatValue = (v) => num(v) } = {}) {
      if (!items || !items.length) return h`<div class="empty text-sm">داده‌ای برای نمایش نیست</div>`;
      const max = Math.max(1, ...items.map((i) => i.value || i.count || 0));
      const palette = { violet: '#7C6CF0', mint: '#43bda0', sky: '#4fa8dc', peach: '#fb8a52', lemon: '#f7b731', rose: '#ef6a97' };
      return h`<div class="row gap-2" style="align-items:flex-end;height:${height}px">${items.map((it) => {
        const v = it.value !== undefined ? it.value : it.count;
        const hpx = Math.max(6, Math.round((v / max) * (height - 42)));
        return h`<div class="col center grow" style="gap:4px;justify-content:flex-end">
          <div class="text-xs muted">${formatValue(v)}</div>
          <div style="width:100%;max-width:44px;height:${hpx}px;border-radius:10px 10px 4px 4px;background:${palette[it.color || color]}" title="${it.label}"></div>
          <div class="text-xs muted ellipsis" style="max-width:70px">${it.label}</div>
        </div>`;
      })}</div>`;
    }
  };
  HRM.charts = charts;

  /* ========================= مسیریاب ========================= */
  function parseHash() {
    const hash = location.hash.replace(/^#/, '') || '/dashboard';
    const [path, queryStr] = hash.split('?');
    const query = Object.fromEntries(new URLSearchParams(queryStr || ''));
    return { path: path || '/dashboard', query };
  }
  HRM.parseHash = parseHash;
  HRM.go = (path) => { location.hash = path.startsWith('#') ? path : '#' + path; };
  HRM.replace = (path) => { history.replaceState(null, '', '#' + path.replace(/^#/, '')); };
  HRM.route = HRM.go;

  function matchRoute(path) {
    for (const r of HRM.routes) {
      const keys = [];
      const regex = new RegExp('^' + r.path.split('/').map((seg) => {
        if (!seg) return '';
        if (seg.startsWith(':')) { keys.push(seg.slice(1)); return '([^/]+)'; }
        return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }).join('/') + '/?$');
      const m = regex.exec(path);
      if (m) {
        const params = {};
        keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { route: r, params };
      }
    }
    return null;
  }

  HRM.registerModule = function (def) {
    if (!def || !def.key) return;
    HRM.modules.push(def);
    HRM.state.moduleMap[def.key] = def;
    for (const [path, handler] of Object.entries(def.routes || {})) {
      HRM.routes.push({ path, handler, module: def.key, title: def.title });
    }
    HRM.modules.sort((a, b) => (a.order || 100) - (b.order || 100));
  };

  async function render() {
    const { path, query } = parseHash();
    const found = matchRoute(path);
    const outlet = document.getElementById('outlet');
    if (!outlet) return;
    if (!found) {
      HRM.mount(outlet, HRM.empty('صفحه یافت نشد', `مسیر «${path}» در سامانه تعریف نشده است.`, h`<button class="btn btn-primary mt-2" id="go-home">بازگشت به داشبورد</button>`.outerHTML));
      const btn = outlet.querySelector('#go-home');
      if (btn) btn.addEventListener('click', () => HRM.go('/dashboard'));
      return;
    }
    // بررسی مجوز مسیر
    if (found.route.perm && !HRM.can(found.route.perm)) {
      HRM.mount(outlet, HRM.empty('دسترسی مجاز نیست', 'برای مشاهده این بخش با مدیر سامانه تماس بگیرید.'));
      return;
    }
    highlightNav(path);
    updatePageTitle(found.route.title);
    outlet.classList.add('fade-out');
    outlet.innerHTML = '';
    const loader = HRM.skeleton(5, 60);
    outlet.appendChild(loader);
    try {
      const node = await found.route.handler({ params: found.params, query, path });
      outlet.classList.remove('fade-out');
      outlet.innerHTML = '';
      if (node) outlet.appendChild(toNode(node));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      outlet.classList.remove('fade-out');
      outlet.innerHTML = '';
      outlet.appendChild(h`<div class="card" style="border-color:var(--rose-200);background:var(--rose-50)">
        <div class="row gap-2"><span style="color:var(--rose-600)">${raw(icon('alert', 22))}</span>
        <div><div class="bold">خطا در بارگذاری صفحه</div><div class="text-sm">${err.message || 'خطای ناشناخته'}</div></div></div>
      </div>`);
    }
  }
  HRM.render = render;
  window.addEventListener('hashchange', render);

  function highlightNav(path) {
    document.querySelectorAll('.nav-item').forEach((a) => {
      const target = a.dataset.path || '';
      const active = path === target || (target !== '/dashboard' && path.startsWith(target));
      a.classList.toggle('active', active);
    });
  }
  function updatePageTitle(title) {
    const el = document.getElementById('page-title');
    if (el && title) el.textContent = title;
    document.title = `${title ? title + ' | ' : ''}${(HRM.state.branding.name || 'مینی HRM')}`;
  }

  /* ========================= ساخت پوسته ========================= */
  function buildSidebar() {
    const nav = HRM.state.nav || [];
    const groups = [];
    for (const g of nav) {
      const items = (g.items || []).filter((i) => !i.perm || HRM.can(i.perm)).sort((a, b) => (a.order || 50) - (b.order || 50));
      if (items.length) groups.push({ title: g.title, items });
    }
    const sidebar = document.getElementById('sidebar');
    const navHtml = groups.map((g) => h`<div class="nav-group">
      <div class="nav-title">${g.title}</div>
      ${g.items.map((i) => h`<a class="nav-item" data-path="${i.path}" href="#${i.path}">
        ${raw(icon(i.icon || 'circle-dot', 18))}<span>${i.title}</span>
        ${i.badge ? h`<span class="nav-badge">${i.badge}</span>` : ''}
      </a>`)}
    </div>`);
    const navWrap = document.getElementById('sidebar-nav');
    navWrap.innerHTML = '';
    navHtml.forEach((n) => navWrap.appendChild(toNode(n)));
    navWrap.querySelectorAll('.nav-item').forEach((a) => a.addEventListener('click', () => {
      const sidebarEl = document.getElementById('sidebar');
      sidebarEl.classList.remove('open');
      document.querySelector('.sidebar-scrim')?.classList.remove('show');
    }));
  }

  function buildTopbar() {
    const topbarUser = document.getElementById('topbar-user');
    const user = HRM.state.user || {};
    topbarUser.innerHTML = '';
    const menu = h`<div class="rel">
      <button class="icon-btn" data-user-btn>${HRM.avatar(user.name, { size: 'sm', color: 'violet' })}</button>
    </div>`;
    topbarUser.appendChild(menu);
    menu.querySelector('[data-user-btn]').addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = menu.getBoundingClientRect();
      const dropdown = h`<div class="card pad-sm" style="position:fixed;top:${rect.bottom + 8}px;inset-inline-start:auto;right:${Math.max(12, window.innerWidth - rect.right)}px;width:260px;z-index:120;padding:10px">
        <div class="row gap-2 mb-2" style="padding:6px 4px">
          ${HRM.avatar(user.name, { color: 'violet' })}
          <div class="grow"><div class="bold text-sm ellipsis">${user.name}</div>
          <div class="text-xs muted">${(user.roles || []).map((r) => r.name).join('، ') || 'کاربر'}</div></div>
        </div>
        <div class="divider" style="margin:8px 0"></div>
        <a class="nav-item" href="#/profile">${raw(icon('user-circle', 16))}<span>پروفایل من</span></a>
        ${user.isSuperAdmin ? h`<a class="nav-item" href="#/settings">${raw(icon('settings', 16))}<span>تنظیمات سامانه</span></a>` : ''}
        ${HRM.can('applications.view') ? h`<a class="nav-item" href="/careers" target="_blank">${raw(icon('globe', 16))}<span>مشاهده سایت استخدام</span></a>` : ''}
        <div class="divider" style="margin:8px 0"></div>
        <a class="nav-item" href="#" data-logout style="color:var(--rose-600)">${raw(icon('log-out', 16))}<span>خروج از حساب</span></a>
      </div>`;
      document.body.appendChild(dropdown);
      const close = (ev) => { if (!dropdown.contains(ev.target)) { dropdown.remove(); document.removeEventListener('click', close); } };
      setTimeout(() => document.addEventListener('click', close), 10);
      dropdown.querySelector('[data-logout]').addEventListener('click', async (e) => {
        e.preventDefault();
        await HRM.post('/auth/logout').catch(() => {});
        location.href = '/admin';
      });
    });
  }

  function initGlobalSearch() {
    const input = document.getElementById('global-search');
    if (!input) return;
    const results = document.getElementById('search-results');
    let box = null;
    const search = debounce(async () => {
      const q = input.value.trim();
      if (box) { box.remove(); box = null; }
      if (q.length < 2) return;
      try {
        const data = await HRM.get('/search?q=' + encodeURIComponent(q), { silent: true });
        if (!data.results.length) return;
        const rect = input.getBoundingClientRect();
        box = h`<div class="card" style="position:fixed;top:${rect.bottom + 8}px;right:${Math.max(12, window.innerWidth - rect.right)}px;width:min(460px,90vw);z-index:120;padding:8px;max-height:60vh;overflow:auto">
          ${data.results.map((r) => h`<a class="nav-item" href="${r.url}">
            <span class="badge badge-${r.type === 'application' ? 'violet' : r.type === 'job' ? 'mint' : 'sky'}">${r.typeTitle || r.type}</span>
            <span class="grow ellipsis">${r.title}<span class="muted text-xs"> — ${r.subtitle || ''}</span></span>
          </a>`)}
        </div>`;
        document.body.appendChild(box);
        box.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => { box.remove(); input.value = ''; }));
        const close = (ev) => { if (box && !box.contains(ev.target) && ev.target !== input) { box.remove(); box = null; document.removeEventListener('click', close); } };
        setTimeout(() => document.addEventListener('click', close), 10);
      } catch (e) { /* ignore */ }
    }, 320);
    input.addEventListener('input', search);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { input.value = ''; if (box) { box.remove(); box = null; } }
    });
  }

  HRM.requirePasswordChange = function () {
    if (document.getElementById('force-pw')) return;
    const form = HRM.form([
      { name: 'newPassword', label: 'رمز عبور جدید', type: 'password', required: true, col: 12, help: 'حداقل ۸ کاراکتر شامل حروف و ارقام' },
      { name: 'confirmPassword', label: 'تکرار رمز عبور جدید', type: 'password', required: true, col: 12 }
    ]);
    const m = HRM.modal({
      title: 'تغییر رمز عبور الزامی',
      subtitle: 'برای ادامه کار، رمز عبور خود را تغییر دهید.',
      body: h`<div id="force-pw">${form.el}</div>`,
      footer: h`<button class="btn btn-primary" data-save>ذخیره رمز عبور جدید</button>`
    });
    m.el.querySelector('[data-save]').addEventListener('click', async () => {
      const v = form.validate();
      if (!v.valid) return form.setErrors(v.errors);
      try {
        const data = await form_submit(v.values);
        if (data) { m.close(); HRM.toast('رمز عبور جدید ثبت شد.', 'success'); HRM.loadApp(); }
      } catch (err) { form.setErrors(err.fields || { newPassword: err.message }); }
    });
    async function form_submit(values) {
      if (values.newPassword !== values.confirmPassword) { form.setErrors({ confirmPassword: 'تکرار رمز عبور مطابقت ندارد' }); return null; }
      return HRM.post('/bootstrap/change-password', values);
    }
  };

  /* ========================= راه‌اندازی ========================= */
  HRM.loadApp = async function () {
    const splash = document.getElementById('splash');
    try {
      const data = await HRM.get('/bootstrap');
      HRM.state = {
        user: data.user,
        permissions: data.permissions,
        nav: data.nav,
        branding: data.branding,
        config: data,
        moduleMap: HRM.state.moduleMap
      };
      document.documentElement.style.setProperty('--primary', data.branding.primaryColor || '#7C6CF0');
      // برندینگ پوسته
      const brandName = document.querySelector('.brand-name');
      if (brandName) brandName.textContent = data.branding.companyName || data.branding.name;
      const brandSub = document.querySelector('.brand-sub');
      if (brandSub) brandSub.textContent = data.branding.name;
      const brandLogo = document.querySelector('.brand-logo');
      if (brandLogo) {
        brandLogo.innerHTML = data.branding.logo
          ? `<img src="${esc(data.branding.logo)}" alt="لوگو">`
          : esc((data.branding.companyName || data.branding.name || 'HR').trim().slice(0, 2));
      }
      const todayEl = document.getElementById('topbar-date');
      if (todayEl) todayEl.textContent = data.jalaliToday || '';
      const userNameEl = document.getElementById('topbar-username');
      if (userNameEl) userNameEl.textContent = data.user.name;

      // بارگذاری ماژول‌های سمت کلاینت
      const files = (data.modules || []).map((m) => m.file);
      await Promise.all(files.map(loadScript));

      buildSidebar();
      buildTopbar();
      initGlobalSearch();
      document.body.addEventListener('click', (e) => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('open') && !e.target.closest('#sidebar') && !e.target.closest('[data-menu]')) {
          sidebar.classList.remove('open');
          document.querySelector('.sidebar-scrim')?.classList.remove('show');
        }
      });
      const menuBtn = document.querySelector('[data-menu]');
      if (menuBtn) menuBtn.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
        document.querySelector('.sidebar-scrim')?.classList.toggle('show');
      });
      if (data.user.mustChangePassword) HRM.requirePasswordChange();
      await render();
      if (splash) { splash.classList.add('fade-out'); setTimeout(() => splash.remove(), 320); }
    } catch (err) {
      if (splash) splash.innerHTML = `<div class="text-center"><div class="logo-big">!</div>
        <h3>خطا در بارگذاری سامانه</h3><p class="muted">${esc(err.message)}</p>
        <button class="btn btn-primary" onclick="location.reload()">تلاش مجدد</button></div>`;
    }
  };

  function loadScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = '/assets/admin/modules/' + src;
      s.onload = resolve;
      s.onerror = () => { console.warn('ماژول کلاینت بارگذاری نشد:', src); resolve(); };
      document.head.appendChild(s);
    });
  }

  /* ========================= ابزارهای تکمیلی ========================= */
  HRM.copy = async (text, message = 'کپی شد') => {
    try {
      await navigator.clipboard.writeText(text);
      HRM.toast(message, 'success');
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
      HRM.toast(message, 'success');
    }
  };
  HRM.download = (url, filename) => {
    const a = document.createElement('a');
    a.href = url; a.download = filename || '';
    document.body.appendChild(a); a.click(); a.remove();
  };
  HRM.tabs = function (items, { onChange, initial = 0 } = {}) {
    let active = initial;
    const bar = h`<div class="tabs">${items.map((it, i) => h`<button class="tab ${i === initial ? 'active' : ''}" data-tab="${i}">
      ${it.icon ? raw(icon(it.icon, 16)) : ''}<span>${it.title}</span>
      ${it.count !== undefined ? h`<span class="count">${num(it.count)}</span>` : ''}
    </button>`)}</div>`;
    const panel = h`<div></div>`;
    function select(i) {
      active = i;
      bar.querySelectorAll('.tab').forEach((t, idx) => t.classList.toggle('active', idx === i));
      panel.innerHTML = '';
      if (onChange) onChange(i, panel);
    }
    bar.querySelectorAll('[data-tab]').forEach((t) => t.addEventListener('click', () => select(+t.dataset.tab)));
    // نکته: ساخت با DOM تا «panel» همان گره حاضر در صفحه باشد (نه یک کپی)
    const wrap = document.createElement('div');
    wrap.appendChild(bar);
    wrap.appendChild(panel);
    setTimeout(() => select(initial), 0);
    return { el: wrap, panel, select, active: () => active };
  };
  HRM.statusBadge = (key, title, color) => HRM.badge(title || key, color || 'sky', true);
  HRM.fieldRow = (label, value, { icon: iconName } = {}) =>
    h`<div class="row between" style="padding:8px 0;border-bottom:1px dashed var(--border)">
      <span class="text-sm muted row gap-1">${iconName ? raw(icon(iconName, 14)) : ''}${label}</span>
      <span class="text-sm bold">${value === null || value === undefined || value === '' ? '—' : value}</span>
    </div>`;

  HRM.qr = function (text, { size = 220, margin = 0 } = {}) {
    // استفاده از کتابخانه محلی qrcode.js (بدون اینترنت)
    if (typeof window.QRCode === 'undefined') {
      return h`<div class="empty text-sm">کتابخانه QR بارگذاری نشده است.</div>`;
    }
    const el = document.createElement('div');
    el.style.cssText = `width:${size}px;height:${size}px;background:#fff;border-radius:16px;padding:8px;box-sizing:border-box`;
    try {
      const qr = new window.QRCode(el, {
        text, width: size - 16, height: size - 16,
        colorDark: '#2c2a40', colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
      });
      el.__qr = qr;
      // هماهنگی با سایر ماژول‌ها: متد دانلود
      el.download = (filename = 'qr.png') => {
        const canvas = el.querySelector('canvas');
        if (!canvas) return;
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = filename;
        a.click();
      };
    } catch (e) {
      el.appendChild(h`<div class="text-sm" style="color:var(--rose-600)">خطا در ساخت QR: ${e.message}</div>`);
    }
    return el;
  };
})();
