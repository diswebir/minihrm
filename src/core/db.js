/**
 * لایه ذخیره‌سازی داده — پایگاه‌داده فایلی JSON
 * ------------------------------------------------------------------
 * هدف: اجرای ساده روی هاست اشتراکی cPanel بدون نیاز به MySQL/داکر.
 * هر «مجموعه (collection)» یک فایل JSON در data/db/*.json است که در حافظه کش می‌شود
 * و هر تغییر به‌صورت atomic (نوشتن در فایل موقت + rename) ذخیره می‌شود.
 *
 * برای مهاجرت آینده به دیتابیس واقعی، فقط همین فایل باید بازنویسی شود.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { uid } = require('./utils');

class Collection {
  constructor(db, name) {
    this.db = db;
    this.name = name;
    this.file = path.join(db.dir, `${name}.json`);
    this.rows = null;
  }

  _load() {
    if (this.rows) return this.rows;
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.rows = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      this.rows = [];
    }
    return this.rows;
  }

  _persist() {
    return this.db._write(this.file, this.rows || []);
  }

  /** همه رکوردها (کپی سطحی برای جلوگیری از تغییر ناخواسته) */
  all() {
    return this._load().slice();
  }

  count() { return this._load().length; }

  /** یافتن یک رکورد با تابع شرط */
  find(fn) {
    return this._load().find(fn) || null;
  }

  /** فیلتر رکوردها */
  filter(fn) {
    return this._load().filter(fn);
  }

  byId(id) {
    if (!id) return null;
    return this._load().find((r) => r.id === id) || null;
  }

  by(field, value) {
    return this._load().find((r) => r[field] === value) || null;
  }

  /** درج رکورد جدید */
  insert(data) {
    this._load();
    const row = Object.assign({ id: data.id || uid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, data);
    this.rows.push(row);
    this._persist();
    this.db._emit(this.name, 'insert', row);
    return row;
  }

  /** درج چند رکورد */
  insertMany(list) {
    return list.map((d) => this.insert(d));
  }

  /** بروزرسانی رکورد (patch) */
  update(id, patch) {
    const rows = this._load();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    const next = Object.assign({}, rows[idx], patch, { updatedAt: new Date().toISOString() });
    rows[idx] = next;
    this._persist();
    this.db._emit(this.name, 'update', next);
    return next;
  }

  /** درج یا بروزرسانی بر اساس id */
  upsert(data) {
    if (data.id && this.byId(data.id)) return this.update(data.id, data);
    return this.insert(data);
  }

  /** حذف رکورد */
  remove(id) {
    const rows = this._load();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    const [removed] = rows.splice(idx, 1);
    this._persist();
    this.db._emit(this.name, 'remove', removed);
    return true;
  }

  /** حذف بر اساس شرط */
  removeWhere(fn) {
    const rows = this._load();
    const keep = rows.filter((r) => !fn(r));
    const removed = rows.length - keep.length;
    this.rows = keep;
    if (removed) this._persist();
    return removed;
  }

  setAll(list) {
    this.rows = Array.isArray(list) ? list.slice() : [];
    this._persist();
    return this.rows;
  }

  /** جایگزینی کامل مجموعه (برای بازیابی پشتیبان) */
  replaceAll(list) { return this.setAll(list); }
}

class Database {
  constructor({ root, logger }) {
    this.root = root;
    this.dir = path.join(root, 'data', 'db');
    this.logger = logger;
    this.collections = {};
    this.listeners = [];
    this.writeQueue = Promise.resolve();
    try { fs.mkdirSync(this.dir, { recursive: true }); } catch (e) { /* ignore */ }
  }

  /** دسترسی به یک مجموعه (در صورت نبود، ساخته می‌شود) */
  col(name) {
    if (!this.collections[name]) this.collections[name] = new Collection(this, name);
    return this.collections[name];
  }

  _write(file, data) {
    // نوشتن اتمیک: ابتدا فایل موقت، سپس جایگزینی
    this.writeQueue = this.writeQueue.then(() => new Promise((resolve) => {
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tmp = file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data, null, 1), 'utf8');
        fs.renameSync(tmp, file);
      } catch (e) {
        if (this.logger) this.logger.error('خطا در ذخیره‌سازی', file, e.message);
      }
      resolve();
    }));
    return this.writeQueue;
  }

  /** رویدادهای تغییر داده (برای وب‌هوک/اتوماسیون آینده) */
  onChange(fn) { this.listeners.push(fn); }
  _emit(col, action, row) {
    for (const fn of this.listeners) {
      try { fn({ col, action, row }); } catch (e) { /* ignore */ }
    }
  }

  /** آمار مجموعه‌ها */
  stats() {
    const out = {};
    for (const name of Object.keys(this.collections)) out[name] = this.collections[name].count();
    return out;
  }

  /** خروجی گرفتن کل داده‌ها (پشتیبان‌گیری) */
  exportAll() {
    const out = { version: 1, exportedAt: new Date().toISOString(), collections: {} };
    for (const name of Object.keys(this.collections)) out.collections[name] = this.collections[name].all();
    return out;
  }

  /** بازگرداندن داده‌ها از پشتیبان */
  importAll(bundle, { replace = true } = {}) {
    if (!bundle || !bundle.collections) throw new Error('فایل پشتیبان نامعتبر است');
    for (const name of Object.keys(bundle.collections)) {
      const col = this.col(name);
      if (replace) col.replaceAll(bundle.collections[name]);
      else for (const row of bundle.collections[name]) col.upsert(row);
    }
    return true;
  }
}

module.exports = { Database };
