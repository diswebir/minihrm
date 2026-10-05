/**
 * سرور HTTP سامانه مینی HRM
 * ------------------------------------------------------------------
 * - بدون هیچ وابستگی خارجی (فقط ماژول‌های داخلی Node) تا نصب روی cPanel ساده باشد
 * - سرو فایل‌های استاتیک، API، پورتال عمومی، پنل مدیریت و ویزارد نصب
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { URL } = require('url');

const { ConfigStore } = require('../config');
const { Logger } = require('../logger');
const { Database } = require('../db');
const { Audit } = require('../audit');
const { RBAC } = require('../rbac');
const { Auth } = require('../auth');
const { SmsService } = require('../sms');
const { OtpService } = require('../otp');
const { View } = require('../view');
const { Api, HttpError } = require('../api');
const { Router } = require('./router');
const { ModuleRegistry } = require('../moduleRegistry');
const installer = require('../installer');
const upload = require('../upload');
const utils = require('../utils');
const jalali = require('../jalali');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip',
  '.map': 'application/json'
};

const COMPRESSIBLE = ['.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt', '.xml', '.csv'];

function createServer({ root }) {
  return new Promise((resolve, reject) => {
    try {
      const logger = new Logger({ root, level: process.env.HRM_LOG_LEVEL || 'info' });
      const config = new ConfigStore({ root, logger });
      config.load();

      const db = new Database({ root, logger });
      const audit = new Audit({ db, logger });
      const rbac = new RBAC({ db, config, logger });
      const auth = new Auth({ db, config, logger, audit });
      const sms = new SmsService({ config, db, logger });
      const otp = new OtpService({ db, config, sms, logger, audit });
      const view = new View({ root, cache: false, logger });
      // مقادیر پیش‌فرض قالب‌ها: app و brand در همه صفحات قابل استفاده باشند
      view.setDefaults(() => {
        const appCfg = config.get('app', {});
        return {
          app: appCfg,
          brand: {
            name: appCfg.name || 'مینی HRM',
            companyName: appCfg.companyName || '',
            logo: appCfg.logo || null,
            primaryColor: appCfg.primaryColor || '#7C6CF0'
          }
        };
      });

      const app = {
        root, logger, config, db, audit, rbac, auth, sms, otp, view, utils, jalali, upload,
        version: require(path.join(root, 'package.json')).version
      };

      // --- ماژول‌ها
      const modules = new ModuleRegistry(app);
      modules.discover();
      app.modules = modules;
      rbac.registerPermissions(modules.permissions());
      if (config.get('installed', false)) rbac.seedSystemRoles();

      // --- API
      const api = new Api(app);
      app.api = api;
      require('../coreApi').registerCoreApi(api, app);
      modules.initApi(api);

      // --- مسیرهای عمومی
      const router = new Router();
      app.router = router;
      modules.initRoutes(router);
      installer.registerRoutes(router, app);
      registerCoreRoutes(router, app);

      const server = http.createServer((req, res) => {
        handleRequest(app, req, res).catch((err) => {
          logger.error('خطای پیش‌بینی‌نشده در پردازش درخواست:', err && err.stack ? err.stack : err);
          try {
            if (!res.writableEnded) {
              if (req.pathname && req.pathname.startsWith('/api/')) res.json(500, { ok: false, error: 'خطای داخلی سرور' });
              else res.html(renderErrorPage(app, req, 500, 'خطای داخلی سرور'), 500);
            }
          } catch (e) { /* ignore */ }
        });
      });

      server.headersTimeout = 60000;
      server.requestTimeout = 120000;
      resolve(server);
    } catch (err) {
      reject(err);
    }
  });
}

// ------------------------------------------------------------------ درخواست

async function handleRequest(app, req, res) {
  const { logger, config } = app;

  // --- آماده‌سازی درخواست
  const parsed = new URL(req.url, 'http://localhost');
  req.pathname = decodeURIComponent(parsed.pathname).replace(/\/{2,}/g, '/');
  req.query = Object.fromEntries(parsed.searchParams.entries());
  req.ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
  req.isSecure = (req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https' || !!req.socket.encrypted;

  // --- هدرهای امنیتی (بدون محدودسازی iframe تا پیش‌نمایش/جاسازی مشکلی نداشته باشد)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "font-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "frame-ancestors *"
  ].join('; '));

  req.__res = res;
  attachResponseHelpers(app, req, res);

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // --- سرو فایل‌های استاتیک
  if (await tryStatic(app, req, res)) return;

  // --- بررسی نصب
  const installed = !!config.get('installed', false);
  const isInstallPath = req.pathname === '/install' || req.pathname.startsWith('/install/');
  const isAssetPath = /^\/(assets|fonts|vendor|uploads)\//.test(req.pathname);

  if (!installed && !isInstallPath && !isAssetPath) {
    if (req.pathname.startsWith('/api/')) {
      res.json(503, { ok: false, error: 'سامانه هنوز نصب نشده است', code: 'not_installed', installUrl: '/install' });
      return;
    }
    res.redirect('/install');
    return;
  }

  // --- API
  if (req.pathname === '/api' || req.pathname.startsWith('/api/')) {
    const sub = req.pathname === '/api' ? '/' : req.pathname.slice(4);
    req.pathname = sub || '/';
    if (sub === '/' || sub === '') {
      res.json(200, { ok: true, data: { name: config.get('app.name'), version: app.version, time: new Date().toISOString() } });
      return;
    }
    await app.api.handle(req, res);
    return;
  }

  // --- مسیرهای عمومی (پورتال، نصب، ...)
  const handled = await app.router.handle(req, res, app, req.pathname);
  if (handled) return;

  // --- پنل مدیریت (SPA)
  if (req.pathname === '/admin' || req.pathname.startsWith('/admin/')) {
    return serveAdminShell(app, req, res);
  }

  // --- ۴۰۴
  res.statusCode = 404;
  res.html(renderErrorPage(app, req, 404, 'صفحه‌ای که دنبال آن هستید پیدا نشد'), 404);
}

// ------------------------------------------------------------------ پاسخ‌ها

function attachResponseHelpers(app, req, res) {
  const { config } = app;
  res.json = (status, payload) => {
    if (res.writableEnded) return;
    const body = Buffer.from(JSON.stringify(payload === undefined ? null : payload), 'utf8');
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
  res.html = (html, status = 200) => {
    if (res.writableEnded) return;
    sendBody(app, req, res, status, Buffer.from(html, 'utf8'), 'text/html; charset=utf-8', 'no-store');
  };
  res.text = (text, status = 200, type = 'text/plain; charset=utf-8') => {
    sendBody(app, req, res, status, Buffer.from(String(text), 'utf8'), type, 'no-store');
  };
  res.csv = (csv, filename = 'export.csv') => {
    const body = Buffer.from('\uFEFF' + csv, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Length': body.length,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store'
    });
    res.end(body);
  };
  res.jsonDownload = (obj, filename = 'export.json') => {
    const body = Buffer.from(JSON.stringify(obj, null, 2), 'utf8');
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Cache-Control': 'no-store'
    });
    res.end(body);
  };
  res.redirect = (location, status = 302) => {
    if (res.writableEnded) return;
    res.writeHead(status, { Location: location, 'Cache-Control': 'no-store' });
    res.end();
  };
  res.setCookie = (cookie) => {
    const prev = res.getHeader('Set-Cookie');
    const list = prev ? (Array.isArray(prev) ? prev.slice() : [prev]) : [];
    list.push(cookie);
    res.setHeader('Set-Cookie', list);
  };
  /** امکان استفاده زنجیره‌ای: res.status(404).html(...) */
  res.status = (code) => ({
    json: (payload) => { res.statusCode = code; return res.json(code, payload); },
    html: (html) => res.html(html, code),
    text: (text, type) => res.text(text, code, type),
    redirect: (location) => res.redirect(location, code),
    csv: (csv, filename) => res.csv(csv, filename)
  });
  res.render = (template, data, layout = 'layouts/site') => {
    try {
      return app.view.render(template, data, layout);
    } catch (err) {
      app.logger.error(`خطا در رندر قالب ${template}:`, err.message);
      throw err;
    }
  };
}

function sendBody(app, req, res, status, buffer, type, cacheControl = 'no-store') {
  if (res.writableEnded) return;
  const headers = {
    'Content-Type': type,
    'Cache-Control': cacheControl
  };
  const etag = `W/"${buffer.length}-${require('crypto').createHash('sha1').update(buffer).digest('hex').slice(0, 16)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': cacheControl });
    res.end();
    return;
  }
  headers.ETag = etag;

  if (COMPRESSIBLE.some((ext) => type.includes(ext.replace('.', ''))) || /text|json|xml|javascript|svg/.test(type)) {
    const accept = String(req.headers['accept-encoding'] || '');
    if (accept.includes('gzip') && buffer.length > 1024) {
      const gz = zlib.gzipSync(buffer, { level: 6 });
      headers['Content-Encoding'] = 'gzip';
      headers.Vary = 'Accept-Encoding';
      headers['Content-Length'] = gz.length;
      res.writeHead(status, headers);
      res.end(req.method === 'HEAD' ? undefined : gz);
      return;
    }
  }
  headers['Content-Length'] = buffer.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : buffer);
}

function renderErrorPage(app, req, status, message) {
  try {
    return app.view.render('errors/error', {
      status,
      message,
      app: app.config.get('app', {}),
      installed: !!app.config.get('installed', false),
      backUrl: '/',
      title: `خطای ${utils.faDigits(status)}`
    }, 'layouts/plain');
  } catch (e) {
    return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>خطا ${status}</title>` +
      `<meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
      `<body style="font-family:Tahoma,sans-serif;background:#f6f7fb;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">` +
      `<div style="background:#fff;padding:40px;border-radius:24px;box-shadow:0 10px 40px rgba(80,80,140,.08);text-align:center;max-width:420px">` +
      `<div style="font-size:44px">${status}</div><p style="color:#555">${utils.esc(message)}</p>` +
      `<a href="/" style="display:inline-block;margin-top:12px;padding:10px 18px;border-radius:14px;background:#7C6CF0;color:#fff;text-decoration:none">بازگشت به خانه</a>` +
      `</div></body></html>`;
  }
}

// ------------------------------------------------------------------ فایل استاتیک

async function tryStatic(app, req, res) {
  const urlPath = req.pathname;
  let file = null;
  let cacheControl = 'public, max-age=3600';

  if (urlPath.startsWith('/assets/admin/modules/')) {
    // فایل‌های کلاینت ماژول‌ها (از پوشه هر ماژول سرو می‌شوند)
    const key = urlPath.replace('/assets/admin/modules/', '').replace(/\.js$/, '').replace(/[^a-z0-9_-]/gi, '');
    const mod = app.modules && app.modules.get(key);
    if (!mod || !mod.clientFile) { res.json(404, { ok: false, error: 'ماژول یافت نشد' }); return true; }
    const buffer = fs.readFileSync(mod.clientFile);
    sendBody(app, req, res, 200, buffer, 'application/javascript; charset=utf-8', 'public, max-age=300');
    return true;
  }
  if (/^\/(assets|vendor|fonts)\//.test(urlPath)) {
    const rel = urlPath.startsWith('/assets/') ? urlPath.replace(/^\/assets\//, '') : urlPath.replace(/^\//, '');
    file = path.join(app.root, 'public', rel);
    cacheControl = 'public, max-age=86400';
  } else if (urlPath.startsWith('/uploads/')) {
    file = path.join(app.root, 'data', urlPath);
    cacheControl = 'private, max-age=600';
  } else if (urlPath === '/favicon.ico' || urlPath === '/favicon.svg') {
    file = path.join(app.root, 'public', 'favicon.svg');
    cacheControl = 'public, max-age=86400';
  } else if (urlPath === '/robots.txt') {
    res.text(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n`, 200);
    return true;
  } else if (urlPath === '/_health') {
    res.json(200, { ok: true, status: 'up', installed: !!app.config.get('installed', false), time: new Date().toISOString(), node: process.version });
    return true;
  } else {
    return false;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.json(405, { ok: false, error: 'متد مجاز نیست' });
    return true;
  }

  // جلوگیری از خروج از مسیر مجاز
  const rootDir = file.startsWith(path.join(app.root, 'data')) ? path.join(app.root, 'data') : path.join(app.root, 'public');
  const resolved = path.resolve(file);
  if (!resolved.startsWith(path.resolve(rootDir))) {
    res.statusCode = 403;
    res.html(renderErrorPage(app, req, 403, 'دسترسی به این مسیر مجاز نیست'), 403);
    return true;
  }

  let stat;
  try { stat = fs.statSync(resolved); } catch (e) { return false; }
  if (stat.isDirectory()) return false;

  const ext = path.extname(resolved).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': cacheControl });
    res.end();
    return true;
  }
  const buffer = fs.readFileSync(resolved);
  const isHashed = /-[0-9a-f]{8}\.\w+$/.test(resolved);
  sendBody(app, req, res, 200, buffer, type, isHashed ? 'public, max-age=31536000, immutable' : cacheControl);
  return true;
}

// ------------------------------------------------------------------ پوسته پنل

function serveAdminShell(app, req, res) {
  const user = app.auth.currentUser(req, app.rbac);
  const brand = {
    name: app.config.get('app.name', 'مینی HRM'),
    companyName: app.config.get('app.companyName', ''),
    logo: app.config.get('app.logo', null),
    primaryColor: app.config.get('app.primaryColor', '#7C6CF0')
  };

  if (!user) {
    // صفحه ورود (سمت سرور، بدون نیاز به JS؛ بهبود تجربه با JS)
    const html = app.view.render('admin/login', {
      brand,
      app: app.config.get('app', {}),
      otpEnabled: app.config.get('security.allowOtpLogin', true) !== false,
      passwordEnabled: app.config.get('security.allowPasswordLogin', true) !== false,
      next: req.query.next || '/admin',
      title: 'ورود به سامانه'
    }, 'layouts/plain');
    res.html(html);
    return;
  }

  const html = app.view.render('admin/shell', {
    brand,
    user: { id: user.id, name: user.name, mobile: user.mobile, email: user.email },
    app: app.config.get('app', {}),
    version: app.version,
    title: 'پنل مدیریت'
  }, 'layouts/plain');
  res.html(html);
}

// ------------------------------------------------------------------ مسیرهای پایه

function registerCoreRoutes(router, app) {
  /** صفحه فعال‌سازی حساب با لینک دعوت (تعیین رمز عبور) */
  router.get('/invite/:token', (req, res) => {
    const invite = app.auth.getInvite(req.params.token);
    const brand = {
      name: app.config.get('app.name', 'مینی HRM'),
      companyName: app.config.get('app.companyName', ''),
      logo: app.config.get('app.logo', null),
      primaryColor: app.config.get('app.primaryColor', '#7C6CF0')
    };
    if (!invite) {
      return res.status(410).html(app.view.render('errors/error', {
        status: 410, message: 'این لینک دعوت معتبر نیست یا منقضی شده است. برای دریافت لینک جدید با مدیر سامانه تماس بگیرید.',
        brand, title: 'لینک نامعتبر'
      }, 'layouts/plain'));
    }
    const user = app.db.col('users').byId(invite.userId);
    res.html(app.view.render('admin/invite', {
      brand, token: invite.id, user: user ? { name: user.name, mobile: user.mobile, email: user.email } : null,
      type: invite.type, title: 'فعال‌سازی حساب کاربری'
    }, 'layouts/plain'));
  });

  router.get('/login', (req, res) => res.redirect('/admin'));
  router.get('/logout', (req, res) => {
    const session = app.auth.sessionFromRequest(req);
    if (session) app.auth.destroySession(session.id);
    res.setCookie(app.auth.clearCookieHeader('user'));
    res.redirect('/admin');
  });

  router.get('/sitemap.xml', (req, res) => {
    const base = app.config.baseUrl(req);
    const jobs = app.db.col('jobs').all().filter((j) => j.status === 'open' && j.showInPortal !== false);
    const urls = [`${base}/careers`, ...jobs.map((j) => `${base}/careers/jobs/${j.slug}`)];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n') + `\n</urlset>`;
    res.text(xml, 200, 'application/xml; charset=utf-8');
  });
}

module.exports = { createServer, MIME };
