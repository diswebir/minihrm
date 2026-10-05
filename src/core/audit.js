/**
 * لاگ حسابرسی (Audit Log) — ثبت همه اقدامات مهم کاربران
 */
'use strict';

const { uid, cleanText, truncate } = require('./utils');

class Audit {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  /** ثبت یک رویداد */
  log({ actor, action, entity, entityId, title, meta, req, level = 'info' }) {
    try {
      const ip = req ? (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress : '';
      const entry = {
        id: uid('log'),
        at: new Date().toISOString(),
        actorId: actor ? actor.id : null,
        actorName: actor ? (actor.name || actor.mobile || actor.email || 'ناشناس') : 'سیستم',
        actorRole: actor && actor._roles ? actor._roles.map((r) => r.name).join('، ') : '',
        action: cleanText(action, 100),
        entity: cleanText(entity, 60),
        entityId: entityId || null,
        title: cleanText(title, 300),
        level,
        meta: meta ? JSON.parse(JSON.stringify(meta)) : null,
        ip: cleanText(ip, 60),
        ua: truncate(req ? req.headers['user-agent'] || '' : '', 200)
      };
      this.db.col('audit_logs').insert(entry);
      return entry;
    } catch (e) {
      if (this.logger) this.logger.warn('ثبت لاگ حسابرسی ناموفق بود:', e.message);
      return null;
    }
  }

  /** فهرست با فیلتر و صفحه‌بندی */
  list({ page = 1, perPage = 50, action, entity, actorId, q, from, to } = {}) {
    let rows = this.db.col('audit_logs').all();
    if (action) rows = rows.filter((r) => (r.action || '').includes(action));
    if (entity) rows = rows.filter((r) => r.entity === entity);
    if (actorId) rows = rows.filter((r) => r.actorId === actorId);
    if (from) rows = rows.filter((r) => r.at >= from);
    if (to) rows = rows.filter((r) => r.at <= to);
    if (q) {
      const needle = String(q).toLowerCase();
      rows = rows.filter((r) => [r.title, r.actorName, r.action, r.entity].join(' ').toLowerCase().includes(needle));
    }
    rows.sort((a, b) => (a.at < b.at ? 1 : -1));
    const total = rows.length;
    const start = (Math.max(1, page) - 1) * perPage;
    return { total, page: Number(page), perPage, rows: rows.slice(start, start + perPage) };
  }

  /** یک رکورد مشخص */
  get(id) { return this.db.col('audit_logs').byId(id); }

  /** پاک‌سازی قدیمی‌تر از N روز */
  prune(days = 180) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    return this.db.col('audit_logs').removeWhere((r) => r.at < cutoff);
  }

  /** فعالیت‌های اخیر برای داشبورد */
  recent(limit = 8) {
    return this.db.col('audit_logs').all()
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, limit);
  }
}

module.exports = { Audit };
