'use strict';
/** Session Store سفارشی روی SQLite (سازگار با چندپردازشی) */
const db = require('../db');

module.exports = function makeStore(session) {
  const Store = session.Store;

  class SqliteStore extends Store {
    constructor(options) {
      super(options);
    }
    get(sid, cb) {
      try {
        const row = db.prepare('SELECT sess FROM sessions WHERE sid = ? AND expired_at > ?').get(sid, Date.now());
        if (!row) return cb(null, null);
        cb(null, JSON.parse(row.sess));
      } catch (e) { cb(e); }
    }
    set(sid, sess, cb) {
      try {
        const maxAge = sess.cookie && sess.cookie.maxAge ? sess.cookie.maxAge : 86400000;
        db.prepare('INSERT INTO sessions (sid, sess, expired_at) VALUES (?,?,?) ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expired_at = excluded.expired_at')
          .run(sid, JSON.stringify(sess), Date.now() + maxAge);
        cb && cb(null);
      } catch (e) { cb && cb(e); }
    }
    destroy(sid, cb) {
      try {
        db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
        cb && cb(null);
      } catch (e) { cb && cb(e); }
    }
    touch(sid, sess, cb) {
      try {
        const maxAge = sess.cookie && sess.cookie.maxAge ? sess.cookie.maxAge : 86400000;
        db.prepare('UPDATE sessions SET expired_at = ? WHERE sid = ?').run(Date.now() + maxAge, sid);
        cb && cb(null);
      } catch (e) { cb && cb(e); }
    }
    clear(cb) {
      try {
        db.prepare('DELETE FROM sessions').run();
        cb && cb(null);
      } catch (e) { cb && cb(e); }
    }
  }

  // پاک‌سازی دوره‌ای سشن‌های منقضی
  setInterval(() => {
    try { db.prepare('DELETE FROM sessions WHERE expired_at <= ?').run(Date.now()); } catch (_) { /* ignore */ }
  }, 30 * 60 * 1000).unref?.();

  return SqliteStore;
};
