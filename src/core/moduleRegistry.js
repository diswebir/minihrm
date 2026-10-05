/**
 * رجیستری ماژول‌ها — قلب معماری ماژولار سامانه
 * ------------------------------------------------------------------
 * هر ماژول یک پوشه در src/modules/<key>/index.js است و می‌تواند شامل:
 *   key, title, description, icon, order, core, defaultEnabled, depends
 *   permissions[]         مجوزهای قابل تخصیص به نقش‌ها
 *   settings[]            تنظیمات قابل ویرایش در پنل
 *   nav[]                 آیتم‌های منوی سمت کاربر
 *   client                مسیر فایل کلاینت (public/admin/modules/*.js)
 *   api(api, app)         ثبت مسیرهای API
 *   routes(router, app)   ثبت مسیرهای عمومی (غیر API)
 *   install(app, ctx)     داده‌های اولیه (idempotent)
 *   widgets                ? (سمت کلاینت)
 *
 * فعال/غیرفعال کردن هر ماژول از پنل → تنظیمات → ماژول‌ها انجام می‌شود.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { deepMerge } = require('./utils');

/** خطای قابل‌نمایش برای کاربر (لایه API آن را با پیام روشن برمی‌گرداند) */
function userError(message, status = 400) {
  const err = new Error(message);
  err.isHttpError = true;
  err.status = status;
  return err;
}

class ModuleRegistry {
  constructor(app) {
    this.app = app;
    this.map = new Map();
    this.order = [];
    this.errors = [];
  }

  discover() {
    const dir = path.join(this.app.root, 'src', 'modules');
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    for (const name of entries) {
      const file = path.join(dir, name, 'index.js');
      if (!fs.existsSync(file)) continue;
      try {
        delete require.cache[require.resolve(file)];
        const def = require(file);
        if (!def || !def.key) throw new Error('ماژول باید دارای key باشد');
        this.register(def);
      } catch (err) {
        this.errors.push({ module: name, error: err.message });
        if (this.app.logger) this.app.logger.error(`بارگذاری ماژول «${name}» ناموفق بود:`, err.message);
      }
    }
    this.order = Array.from(this.map.keys()).sort((a, b) => (this.map.get(a).order || 100) - (this.map.get(b).order || 100));
  }

  register(def) {
    const moduleDir = path.join(this.app.root, 'src', 'modules', def.key);
    const clientInModule = fs.existsSync(path.join(moduleDir, 'client.js')) ? path.join(moduleDir, 'client.js') : null;
    const clientInPublic = fs.existsSync(path.join(this.app.root, 'public', 'admin', 'modules', `${def.key}.js`)) ? `${def.key}.js` : null;
    const normalized = Object.assign({
      key: def.key,
      title: def.title || def.key,
      description: def.description || '',
      icon: def.icon || 'grid',
      order: def.order === undefined ? 100 : def.order,
      core: !!def.core,
      defaultEnabled: def.defaultEnabled !== false,
      depends: def.depends || [],
      permissions: def.permissions || [],
      settings: def.settings || [],
      nav: def.nav || [],
      clientFile: def.clientFile || clientInModule,
      client: def.client || (clientInModule ? `${def.key}.js` : clientInPublic),
      api: def.api || null,
      routes: def.routes || null,
      install: def.install || null,
      badge: def.badge || null
    }, def);
    this.map.set(normalized.key, normalized);
    return normalized;
  }

  /** آیا ماژول فعال است؟ (با در نظر گرفتن وابستگی‌ها) */
  isEnabled(key) {
    const def = this.map.get(key);
    if (!def) return false;
    const cfgValue = this.app.config.get(`modules.${key}.enabled`, undefined);
    const enabled = cfgValue === undefined ? def.defaultEnabled : !!cfgValue;
    if (!enabled) return false;
    // وابستگی‌های غیرفعال → ماژول هم غیرفعال
    for (const dep of def.depends || []) {
      if (!this.isEnabled(dep)) return false;
    }
    return true;
  }

  /** ماژول فعال + تنظیمات ادغام‌شده */
  get(key) {
    const def = this.map.get(key);
    if (!def) return null;
    return Object.assign({}, def, {
      enabled: this.isEnabled(key),
      settingsValues: this.settings(key)
    });
  }

  active() {
    return this.order.map((k) => this.map.get(k)).filter((m) => m && this.isEnabled(m.key));
  }

  all() { return this.order.map((k) => this.map.get(k)); }

  /** تنظیمات جاری ماژول (مقادیر پیش‌فرض + ذخیره‌شده) */
  settings(key) {
    const def = this.map.get(key);
    if (!def) return {};
    const defaults = {};
    for (const s of def.settings || []) defaults[s.key] = s.default;
    const saved = this.app.config.get(`modules.${key}.settings`, {}) || {};
    return deepMerge(defaults, saved);
  }

  /** همه مجوزهای فعال سامانه */
  permissions() {
    const out = [];
    for (const def of this.all()) {
      for (const p of def.permissions || []) {
        out.push(Object.assign({}, p, { module: def.key, moduleTitle: def.title }));
      }
    }
    return out;
  }

  /** آیتم‌های منو برای کلاینت (فیلتر بر اساس مجوز در سمت کلاینت هم انجام می‌شود) */
  nav() {
    return this.active().map((m) => ({ module: m.key, title: m.title, items: m.nav || [] }))
      .filter((g) => g.items.length);
  }

  /** اطلاعات ماژول‌ها برای صفحه تنظیمات */
  info() {
    const cfgModules = this.app.config.get('modules', {}) || {};
    return this.all().map((m) => ({
      key: m.key,
      title: m.title,
      description: m.description,
      icon: m.icon,
      order: m.order,
      core: m.core,
      defaultEnabled: m.defaultEnabled,
      depends: m.depends,
      enabled: this.isEnabled(m.key),
      explicitlySet: cfgModules[m.key] !== undefined,
      installed: !!(cfgModules[m.key] && cfgModules[m.key].installed),
      permissions: (m.permissions || []).map((p) => ({ key: p.key, title: p.title, group: p.group })),
      settings: (m.settings || []).map((s) => ({
        key: s.key, title: s.title, type: s.type || 'text',
        help: s.help || '', options: s.options || null,
        value: this.settings(m.key)[s.key]
      })),
      hasClient: !!(m.client || m.clientFile),
      error: (this.errors.find((e) => e.module === m.key) || {}).error || null
    }));
  }

  /** فایل‌های کلاینت ماژول‌های فعال */
  clientModules() {
    return this.active().filter((m) => m.client).map((m) => ({
      key: m.key, title: m.title, icon: m.icon, file: m.client, order: m.order
    }));
  }

  initApi(api) {
    // همه ماژول‌ها ثبت می‌شوند تا فعال/غیرفعال‌سازی در زمان اجرا (بدون ری‌استارت) اثر کند؛
    // غیرفعال بودن ماژول در لایه API بررسی و پاسخ روشن برگردانده می‌شود.
    for (const def of this.all()) {
      if (typeof def.api === 'function') {
        try {
          def.api(api, this.app);
        } catch (err) {
          this.app.logger.error(`ثبت API ماژول «${def.key}» ناموفق بود:`, err.message);
        }
      }
    }
  }

  initRoutes(router) {
    for (const def of this.all()) {
      if (typeof def.routes === 'function') {
        try {
          def.routes(this.guardedRouter(router, def), this.app);
        } catch (err) {
          this.app.logger.error(`ثبت مسیرهای ماژول «${def.key}» ناموفق بود:`, err.message);
        }
      }
    }
  }

  /**
   * روتری که پیش از هر هندلر بررسی می‌کند ماژول فعال است یا نه.
   * این‌گونه خاموش/روشن کردن ماژول از پنل، بی‌درنگ و بدون ری‌استارت اثر می‌کند.
   */
  guardedRouter(router, def) {
    const self = this;
    const guard = (handler) => async (req, res, app, params) => {
      if (!self.isEnabled(def.key)) {
        throw userError(`ماژول «${def.title}» غیرفعال است. برای فعال‌سازی به تنظیمات ← ماژول‌ها بروید.`, 404);
      }
      return handler(req, res, app, params);
    };
    const api = {};
    for (const m of ['get', 'post', 'put', 'patch', 'delete', 'all']) {
      if (typeof router[m] === 'function') api[m] = (p, h, o) => router[m](p, guard(h), o);
    }
    return api;
  }

  /** اجرای داده‌های اولیه همه ماژول‌های فعال */
  async installAll(actor = null, { reason = 'install' } = {}) {
    const results = [];
    for (const def of this.active()) {
      if (typeof def.install !== 'function') continue;
      try {
        const res = await def.install(this.app, { actor, reason });
        this.app.config.setModule(def.key, { enabled: true });
        const cur = this.app.config.get(`modules.${def.key}`, {});
        this.app.config.set(`modules.${def.key}`, Object.assign({}, cur, { installed: true, installedAt: new Date().toISOString() }));
        results.push({ key: def.key, ok: true, result: res || null });
      } catch (err) {
        this.app.logger.error(`نصب داده‌های اولیه ماژول «${def.key}» ناموفق بود:`, err.message);
        results.push({ key: def.key, ok: false, error: err.message });
      }
    }
    return results;
  }

  /** فعال/غیرفعال کردن ماژول */
  async toggle(key, enabled, actor = null) {
    const def = this.map.get(key);
    if (!def) throw userError('ماژول یافت نشد', 404);
    if (def.core && !enabled) throw userError(`ماژول «${def.title}» پایه است و قابل غیرفعال‌سازی نیست`);
    if (enabled) {
      for (const dep of def.depends || []) {
        if (!this.isEnabled(dep)) {
          const depDef = this.map.get(dep);
          throw userError(`برای فعال‌سازی این ماژول ابتدا ماژول «${depDef ? depDef.title : dep}» را فعال کنید`);
        }
      }
    }
    this.app.config.setModule(key, { enabled: !!enabled });
    let installResult = null;
    if (enabled && typeof def.install === 'function') {
      const done = this.app.config.get(`modules.${key}.installed`, false);
      if (!done) {
        installResult = await def.install(this.app, { actor, reason: 'enable' });
        const cur = this.app.config.get(`modules.${key}`, {});
        this.app.config.set(`modules.${key}`, Object.assign({}, cur, { installed: true, installedAt: new Date().toISOString() }));
      }
    }
    if (this.app.audit) {
      this.app.audit.log({
        actor, action: enabled ? 'module.enable' : 'module.disable', entity: 'module', entityId: key,
        title: `${enabled ? 'فعال‌سازی' : 'غیرفعال‌سازی'} ماژول «${def.title}»`
      });
    }
    return { enabled, installResult };
  }

  setSettings(key, values, actor = null) {
    const def = this.map.get(key);
    if (!def) throw userError('ماژول یافت نشد', 404);
    const allowed = {};
    for (const s of def.settings || []) {
      if (values[s.key] === undefined) continue;
      let v = values[s.key];
      if (s.type === 'bool') v = !!v;
      if (s.type === 'number') v = Number(v);
      if (s.type === 'select' && s.options && !s.options.some((o) => (o.value === undefined ? o : o.value) === v)) continue;
      allowed[s.key] = v;
    }
    this.app.config.setModule(key, { settings: allowed });
    if (this.app.audit) {
      this.app.audit.log({ actor, action: 'module.settings', entity: 'module', entityId: key, title: `تغییر تنظیمات ماژول «${def.title}»`, meta: allowed });
    }
    return this.settings(key);
  }

  /** دسترسی مستقیم به تنظیمات یک ماژول */
  s(key, settingKey, fallback) {
    const val = this.settings(key)[settingKey];
    return val === undefined ? fallback : val;
  }
}

module.exports = { ModuleRegistry };
