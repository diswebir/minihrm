'use strict';
/** ثبت تاریخچه فعالیت‌ها */
const db = require('../db');

function log(reqOrUser, action, entity, entityId, detail) {
  let userId = null;
  let ip = '';
  if (reqOrUser && reqOrUser.session) {
    userId = reqOrUser.session.userId || null;
    ip = (reqOrUser.headers && reqOrUser.headers['x-forwarded-for']) || (reqOrUser.connection && reqOrUser.connection.remoteAddress) || '';
  } else if (reqOrUser && reqOrUser.id) {
    userId = reqOrUser.id;
  }
  try {
    db.prepare('INSERT INTO audit_log (user_id, action, entity, entity_id, detail, ip) VALUES (?,?,?,?,?,?)')
      .run(userId, action, entity || '', String(entityId === undefined ? '' : entityId), typeof detail === 'string' ? detail : JSON.stringify(detail || {}), String(ip).slice(0, 64));
  } catch (_) { /* ignore */ }
}

function list(limit = 100, offset = 0) {
  return db.prepare(`
    SELECT a.*, u.full_name AS user_name, u.username AS user_username
    FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.id DESC LIMIT ? OFFSET ?
  `).all(limit, offset);
}

module.exports = { log, list };
