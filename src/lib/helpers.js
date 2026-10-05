'use strict';
/** توابع کمکی قالب‌ها (locals) */
const db = require('../db');
const permissions = require('./permissions');
const dates = require('./dates');
const seedData = require('../seed-data');

function settingsMap() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const m = {};
  for (const r of rows) m[r.key] = r.value;
  return m;
}

function getSetting(key, def = '') {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return r ? r.value : def;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value === undefined ? '' : value));
}

function parseJson(s, fallback) {
  try { return JSON.parse(s); } catch (_) { return fallback; }
}

function faNum(n) {
  // اعداد لاتین برای خوانایی ورودی‌ها نگه داشته می‌شوند؛ فقط جداکننده هزارگان
  if (n === '' || n === null || n === undefined) return '';
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function statusBadge(status) {
  const s = seedData.APPLICANT_STATUSES[status] || { label: status, color: 'gray' };
  return s;
}

function jalali(d) { return dates.toJalali(d); }
function jalaliFull(d) { return dates.toJalaliFull(d); }

/* ---- آیکون‌های خطی (SVG) ---- */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16 14.5c3 .4 5.5 2.4 5.5 5.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8 7V5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7"/><path d="M3 12h18"/>',
  brain: '<path d="M9.5 3.5A3 3 0 0 0 6.6 6a3 3 0 0 0-2 5.2A3 3 0 0 0 6 16.5a3 3 0 0 0 3.5 3.8c.6.2 1.3.2 2 .1V4.9a4.6 4.6 0 0 0-2-1.4z"/><path d="M14.5 3.5A3 3 0 0 1 17.4 6a3 3 0 0 1 2 5.2 3 3 0 0 1-1.4 5.3 3 3 0 0 1-3.5 3.8c-.6.2-1.3.2-2 .1"/>',
  form: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.06-.4.1-.8.1-1.2z"/>',
  shield: '<path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.2"/>',
  academic: '<path d="m12 4 10 5-10 5L2 9z"/><path d="M6 11.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5"/>',
  puzzle: '<path d="M9 4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4h-4a2 2 0 1 0-4 0H5v-4a2 2 0 1 0 0-4V4z"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  bell: '<path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14h1M14 20h3M20 17v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6v14h12V6"/><path d="M10 11v6M14 11v6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  arrow: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
  arrowLeft: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  building: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
  key: '<circle cx="8" cy="14" r="4"/><path d="m11 11 9-9 2 2-2 2 2 2-3 3-2-2-2 2"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>'
};

function icon(name, size) {
  const body = ICONS[name] || ICONS.puzzle;
  const s = size || 20;
  return `<svg class="icon" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** تنظیم locals عمومی برای همه قالب‌ها */
function attachLocals(app) {
  app.use((req, res, next) => {
    res.locals.currentUrl = req.originalUrl;
    res.locals.query = req.query;
    res.locals.user = req.session && req.session.user ? req.session.user : null;
    res.locals.can = (code) => permissions.can(req.session && req.session.user, code);
    res.locals.settings = settingsMap();
    res.locals.parseJson = parseJson;
    res.locals.faNum = faNum;
    res.locals.statusBadge = statusBadge;
    res.locals.jalali = jalali;
    res.locals.jalaliFull = jalaliFull;
    res.locals.icon = icon;
    res.locals.notifications = [];
    res.locals.unreadCount = 0;
    if (req.session && req.session.userId) {
      try {
        res.locals.notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 8').all(req.session.userId);
        res.locals.unreadCount = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL').get(req.session.userId).c;
      } catch (_) { /* ignore */ }
    }
    // ماژول‌های فعال برای منو
    try {
      res.locals.enabledModules = db.prepare('SELECT * FROM modules WHERE enabled = 1 AND installed = 1 ORDER BY sort').all();
    } catch (_) {
      res.locals.enabledModules = [];
    }
    next();
  });
}

function notify(userIds, title, body, link) {
  const ins = db.prepare('INSERT INTO notifications (user_id, title, body, link) VALUES (?,?,?,?)');
  for (const uid of userIds) {
    if (uid) ins.run(uid, title, body || '', link || '');
  }
}

/** کاربرانی که مجوز مشخصی دارند (برای اعلان) */
function usersWithPermission(code) {
  const rows = db.prepare(`
    SELECT DISTINCT u.id FROM users u
    LEFT JOIN role_permissions rp ON rp.role_id = u.role_id
    LEFT JOIN permissions p ON p.id = rp.permission_id
    LEFT JOIN user_permissions up ON up.user_id = u.id AND up.permission_id = p.id
    WHERE u.status = 'active' AND (p.code = ? OR u.is_super_admin = 1 OR up.mode = 'grant' AND up.permission_id = (SELECT id FROM permissions WHERE code = ?))
  `).all(code, code);
  return rows.map(r => r.id);
}

module.exports = {
  settingsMap, getSetting, setSetting, parseJson, faNum,
  statusBadge, jalali, jalaliFull, attachLocals, notify, usersWithPermission, icon
};
