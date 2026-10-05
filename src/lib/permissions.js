'use strict';
/** سیستم مجوزها: نقش + بازنویسی سطح کاربر (grant/deny) */
const db = require('../db');

const cache = new Map(); // userId -> Map(permission -> bool)

function invalidate(userId) {
  if (userId === undefined) cache.clear();
  else cache.delete(Number(userId));
}

function compute(userId) {
  const map = new Map();
  const rows = db.prepare(`
    SELECT p.code AS code, up.mode AS mode
    FROM permissions p
    LEFT JOIN user_permissions up ON up.permission_id = p.id AND up.user_id = ?
  `).all(Number(userId));
  const rolePerms = new Set(
    db.prepare(`
      SELECT p.code AS code
      FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      JOIN users u ON u.role_id = rp.role_id
      WHERE u.id = ?
    `).all(Number(userId)).map(r => r.code)
  );
  for (const r of rows) {
    if (r.mode === 'grant') map.set(r.code, true);
    else if (r.mode === 'deny') map.set(r.code, false);
    else map.set(r.code, rolePerms.has(r.code));
  }
  return map;
}

function can(user, code) {
  if (!user) return false;
  if (user.is_super_admin) return true;
  const id = Number(user.id);
  if (!cache.has(id)) cache.set(id, compute(id));
  return cache.get(id).get(code) === true;
}

function canAll(user, codes) {
  return (codes || []).every(c => can(user, c));
}

function canAny(user, codes) {
  return (codes || []).some(c => can(user, c));
}

function listUserPermissions(user) {
  const id = Number(user.id);
  if (!cache.has(id)) cache.set(id, compute(id));
  return cache.get(id);
}

/** میان‌بر middleware */
function requirePerm(code) {
  return function (req, res, next) {
    if (req.session && req.session.userId && can(req.session.user, code)) return next();
    if (req.xhr || (req.headers.accept || '').includes('json')) {
      return res.status(403).json({ ok: false, message: 'دسترسی غیرمجاز' });
    }
    return res.status(403).render('pages/error', {
      title: 'دسترسی غیرمجاز',
      status: 403,
      message: 'شما به این بخش دسترسی ندارید. با مدیر سامانه تماس بگیرید.'
    });
  };
}

module.exports = { can, canAll, canAny, requirePerm, invalidate, listUserPermissions };
