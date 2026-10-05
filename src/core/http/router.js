/**
 * مسیریاب سبک (Router) با پشتیبانی از پارامترهای مسیر مانند /jobs/:slug
 */
'use strict';

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message || 'خطای ناشناخته');
    this.name = 'HttpError';
    this.status = status || 500;
    this.extra = extra;
    this.isHttpError = true;
  }
  static badRequest(msg, extra) { return new HttpError(400, msg || 'درخواست نامعتبر است', extra); }
  static unauthorized(msg) { return new HttpError(401, msg || 'برای ادامه باید وارد سامانه شوید'); }
  static forbidden(msg) { return new HttpError(403, msg || 'دسترسی شما به این بخش مجاز نیست'); }
  static notFound(msg) { return new HttpError(404, msg || 'موردی یافت نشد'); }
  static conflict(msg) { return new HttpError(409, msg || 'تضاد در داده‌ها'); }
  static tooMany(msg) { return new HttpError(429, msg || 'تعداد درخواست‌ها بیش از حد مجاز است'); }
  static server(msg) { return new HttpError(500, msg || 'خطای داخلی سرور'); }
}

class Router {
  constructor() {
    this.routes = [];
    this.middlewares = [];
  }

  use(fn) { this.middlewares.push(fn); return this; }

  add(method, pattern, handler, opts = {}) {
    const keys = [];
    const regexSource = String(pattern)
      .replace(/\/+$/, '')
      .split('/')
      .map((seg) => {
        if (!seg) return '';
        if (seg.startsWith(':')) {
          keys.push(seg.slice(1));
          return '([^/]+)';
        }
        if (seg === '*') { keys.push('wildcard'); return '(.*)'; }
        return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    const route = {
      method: method.toUpperCase(),
      pattern,
      keys,
      regex: new RegExp(`^${regexSource || '/'}/?$`),
      handler,
      opts
    };
    this.routes.push(route);
    return route;
  }

  get(p, h, o) { return this.add('GET', p, h, o); }
  post(p, h, o) { return this.add('POST', p, h, o); }
  put(p, h, o) { return this.add('PUT', p, h, o); }
  patch(p, h, o) { return this.add('PATCH', p, h, o); }
  delete(p, h, o) { return this.add('DELETE', p, h, o); }

  /** یافتن مسیر منطبق */
  match(method, pathname) {
    const m = method.toUpperCase();
    let pathMatch = null;
    for (const route of this.routes) {
      const res = route.regex.exec(pathname);
      if (!res) continue;
      const params = {};
      route.keys.forEach((k, i) => { params[k] = decodeURIComponent(res[i + 1] || ''); });
      if (route.method === m || route.method === 'ALL') return { route, params };
      if (route.method === 'GET' && m === 'HEAD') return { route, params };
      if (!pathMatch) pathMatch = { route, params, methodMismatch: true };
    }
    return pathMatch;
  }

  /** اجرای مسیر (با پشتیبانی از هندلرهای async) */
  async handle(req, res, ctx, pathname = req.pathname) {
    const found = this.match(req.method, pathname);
    if (!found) return false;
    if (found.methodMismatch) throw HttpError.badRequest('متد درخواست برای این آدرس پشتیبانی نمی‌شود', { status: 405 });
    req.params = found.params;
    req.route = found.route;
    await found.route.handler(req, res, ctx, found.params);
    return true;
  }

  list() {
    return this.routes.map((r) => ({ method: r.method, pattern: r.pattern }));
  }
}

module.exports = { Router, HttpError };
