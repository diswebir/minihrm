/**
 * لایه API سامانه (/api/*)
 * ------------------------------------------------------------------
 * - قالب پاسخ یکسان: { ok: true, data } یا { ok: false, error, fields }
 * - بررسی احراز هویت و مجوز (RBAC) به‌صورت متمرکز
 * - اعتبارسنجی ورودی، محدودیت نرخ درخواست، ثبت لاگ حسابرسی
 */
'use strict';

const { Router, HttpError } = require('./http/router');
const utils = require('./utils');

/** محدودکننده نرخ درخواست در حافظه */
class RateLimiter {
  constructor() { this.hits = new Map(); }
  check(key, max, windowSec) {
    const now = Date.now();
    const windowMs = windowSec * 1000;
    const list = (this.hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      this.hits.set(key, list);
      const resetIn = Math.ceil((windowMs - (now - list[0])) / 1000);
      return { ok: false, resetIn };
    }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 2000) {
      for (const [k, v] of this.hits) if (!v.length || now - v[v.length - 1] > windowMs * 2) this.hits.delete(k);
    }
    return { ok: true };
  }
}

class Api {
  constructor(app) {
    this.app = app;                 // context برنامه
    this.router = new Router();
    this.limiter = new RateLimiter();
    this.definitions = [];          // برای مستندات/جدول مجوزها
  }

  /** ثبت مسیر با تنظیمات */
  route(method, path, opts, handler) {
    if (typeof opts === 'function') { handler = opts; opts = {}; }
    opts = opts || {};
    this.definitions.push({ method: method.toUpperCase(), path, perm: opts.perm || null, module: opts.module || null });
    this.router.add(method, path, async (req, res, ctx, params) => {
      const started = Date.now();
      try {
        await this._run(req, res, opts, handler, params);
      } catch (err) {
        this._handleError(err, req, res, opts);
      } finally {
        const ms = Date.now() - started;
        if (ms > 1500 && this.app.logger) this.app.logger.warn(`پاسخ کند: ${req.method} ${req.url} (${ms}ms)`);
      }
    }, opts);
  }

  get(p, o, h) { return this.route('GET', p, o, h); }
  post(p, o, h) { return this.route('POST', p, o, h); }
  put(p, o, h) { return this.route('PUT', p, o, h); }
  patch(p, o, h) { return this.route('PATCH', p, o, h); }
  delete(p, o, h) { return this.route('DELETE', p, o, h); }

  async _run(req, res, opts, handler, params) {
    const app = this.app;

    // --- ماژول باید فعال باشد (خاموش/روشن کردن بی‌درنگ از پنل اثر می‌کند)
    if (opts.module && app.modules && !app.modules.isEnabled(opts.module)) {
      const def = app.modules.get(opts.module) || {};
      throw new HttpError(404, `ماژول «${def.title || opts.module}» غیرفعال است. برای فعال‌سازی به تنظیمات ← ماژول‌ها بروید.`, { code: 'module_disabled' });
    }

    // --- محافظت CSRF برای درخواست‌های تغییردهنده (هدر اختصاصی لازم است)
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const hasAuthCookie = !!(this.app.auth.parseCookies(req).hrm_sid || this.app.auth.parseCookies(req).hrm_apply);
      const requestedWith = req.headers['x-requested-with'] || '';
      if (hasAuthCookie && requestedWith !== 'HRM') {
        throw HttpError.forbidden('درخواست معتبر نیست (شناسه امنیتی ارسال نشده است). صفحه را دوباره بارگذاری کنید.');
      }
    }

    // --- محدودیت نرخ
    if (opts.rateLimit) {
      const { max = 60, windowSec = 60 } = opts.rateLimit;
      const key = `${req.method}:${req.pathname}:${app.auth.parseCookies(req).hrm_sid || req.ip}`;
      const r = this.limiter.check(key, max, windowSec);
      if (!r.ok) throw HttpError.tooMany(`تعداد درخواست‌های شما زیاد است. ${r.resetIn} ثانیه دیگر تلاش کنید.`);
    }

    // --- بدنه درخواست
    let body = {};
    if (!['GET', 'HEAD'].includes(req.method)) {
      const parsed = await require('./upload').parseBody(req, { maxBytes: (app.config.get('publicPortal.maxFileSizeMB', 5) + 1) * 1024 * 1024 * 4 });
      req.files = parsed.files || [];
      body = parsed.fields || {};
    }
    req.body = body;

    // --- احراز هویت
    let user = null;
    let applicant = null;
    if (opts.auth !== false) {
      user = app.auth.currentUser(req, app.rbac);
      const appSession = app.auth.currentApplicant(req);
      if (appSession) applicant = appSession.applicant;
      req.user = user;
      req.applicant = applicant;
      if (!user && !(opts.allowApplicant && applicant)) {
        if (opts.auth === 'optional') { /* بدون کاربر ادامه می‌دهیم */ }
        else throw HttpError.unauthorized();
      }
      // تغییر اجباری رمز عبور
      if (user && user.mustChangePassword && !opts.allowPasswordChangePending && !String(req.pathname).startsWith('/api/me')) {
        throw new HttpError(428, 'برای ادامه باید رمز عبور خود را تغییر دهید', { code: 'must_change_password' });
      }
      // --- مجوز
      if (opts.perm && !app.rbac.can(user, opts.perm)) {
        throw HttpError.forbidden(`دسترسی لازم برای این عملیات را ندارید (${opts.perm})`);
      }
      if (opts.permsAny && !app.rbac.canAny(user, opts.permsAny)) {
        throw HttpError.forbidden('دسترسی لازم برای این عملیات را ندارید');
      }
    } else {
      req.user = null;
      req.applicant = null;
    }

    // --- اعتبارسنجی
    if (opts.validate) {
      const result = opts.validate(body, req);
      if (result && result.errors && Object.keys(result.errors).length) {
        throw new HttpError(400, result.message || 'اطلاعات ورودی نامعتبر است', { fields: result.errors });
      }
    }

    // --- اجرا
    const context = this.context(req, params);
    const data = await handler(context, req);
    if (res.writableEnded) return;            // هندلر خودش پاسخ داده (دانلود فایل)
    res.json(200, { ok: true, data: data === undefined ? null : data });
  }

  /** ساخت شیء context برای هندلرها */
  context(req, params) {
    const app = this.app;
    const user = req.user;
    const api = this;
    return {
      app,
      req,
      user,
      applicant: req.applicant,
      params: params || req.params || {},
      query: req.query || {},
      body: req.body || {},
      files: req.files || [],
      ip: req.ip,
      now: new Date(),
      db: app.db,
      col: (name) => app.db.col(name),
      config: app.config,
      audit: app.audit,
      auth: app.auth,
      rbac: app.rbac,
      sms: app.sms,
      otp: app.otp,
      logger: app.logger,
      utils,
      modules: app.modules,
      view: app.view,
      baseUrl: (p) => app.config.baseUrl(req) + (p ? String(p).startsWith('/') ? p : '/' + p : ''),
      can: (perm) => app.rbac.can(user, perm),
      isSuperAdmin: () => app.rbac.can(user, '*'),
      /** ثبت لاگ حسابرسی */
      log: (action, title, { entity, entityId, meta, level } = {}) =>
        app.audit.log({ actor: user, action, title, entity, entityId, meta, req, level }),
      settings: (key, fallback) => {
        const mod = req.__moduleKey;
        const val = app.config.get(`modules.${mod}.settings.${key}`, undefined);
        return val === undefined ? fallback : val;
      },
      /** خطای HTTP با پیام فارسی */
      fail: (msg, status = 400, extra) => { throw new HttpError(status, msg, extra); },
      notFound: (msg) => { throw HttpError.notFound(msg); }
    };
  }

  _handleError(err, req, res, opts) {
    const app = this.app;
    if (err && err.isHttpError) {
      if (err.status >= 500) app.logger.error(`API ${req.method} ${req.url}:`, err.message);
      res.json(err.status, {
        ok: false,
        error: err.message,
        code: (err.extra && err.extra.code) || undefined,
        fields: (err.extra && err.extra.fields) || undefined
      });
      return;
    }
    app.logger.error(`API ${req.method} ${req.url} →`, err && err.stack ? err.stack : err);
    const msg = err && err.message ? `خطا: ${err.message}` : 'خطای داخلی سرور رخ داد';
    res.json(500, { ok: false, error: app.config.get('app.debug', false) ? msg : 'خطای داخلی سرور رخ داد. لطفاً با پشتیبانی تماس بگیرید.' });
  }

  /** هندل درخواست /api/* */
  async handle(req, res) {
    const handled = await this.router.handle(req, res, this.app, req.pathname);
    if (!handled) {
      res.json(404, { ok: false, error: `مسیر API یافت نشد: ${req.method} ${req.pathname}` });
    }
  }

  /** فهرست مسیرها (برای صفحه وضعیت سامانه) */
  list() { return this.definitions.slice(); }
}

module.exports = { Api, RateLimiter, HttpError };
