'use strict';
/** MiniHRM — اپلیکیشن اصلی */
const express = require('express');
const session = require('express-session');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const config = require('./src/config');
const db = require('./src/db');
const helpers = require('./src/lib/helpers');
const permissions = require('./src/lib/permissions');
const moduleSystem = require('./src/lib/modules');

function createApp() {
  const app = express();

  // ---- view engine ----
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.set('view cache', process.env.NODE_ENV === 'production');

  // ---- security headers ----
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-XSS-Protection', '0');
    next();
  });

  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0 }));

  // ---- sessions (ذخیره در SQLite — امن برای چندپردازشی) ----
  const SqliteSessionStore = require('./src/lib/session-store')(session);
  app.use(session({
    store: new SqliteSessionStore(),
    secret: config.ensureSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      secure: false
    }
  }));

  helpers.attachLocals(app);

  // ---- هدرهای کاربر فعلی در res.locals ----
  app.use((req, res, next) => {
    if (req.session && req.session.userId && !req.session.user) {
      const u = db.prepare(`
        SELECT u.id, u.username, u.full_name, u.email, u.phone, u.is_super_admin, u.status, u.avatar_path,
               u.role_id, r.code AS role_code, r.name AS role_name
        FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?
      `).get(req.session.userId);
      if (u && u.status === 'active') req.session.user = u;
    }
    res.locals.sessionUser = req.session && req.session.user ? req.session.user : null;
    next();
  });

  // ---- نصب نشده؟ همه چیز به ویزارد نصب ----
  app.use((req, res, next) => {
    const installed = config.isInstalled();
    const p = req.path || '/';
    const isInstallPath = p === '/install' || p.startsWith('/install/');
    const isStatic = p.startsWith('/css/') || p.startsWith('/js/') || p.startsWith('/img/') || p.startsWith('/uploads/');
    if (!installed && !isInstallPath && !isStatic) {
      return res.redirect('/install');
    }
    if (installed && isInstallPath && process.env.MINIHRM_ALLOW_REINSTALL !== '1') {
      return res.status(404).render('pages/error', {
        title: 'یافت نشد', status: 404,
        message: 'سامانه قبلاً نصب شده است. برای نصب مجدد، فایل data/config.json را حذف کنید.'
      });
    }
    next();
  });

  // ---- routes ----
  app.use('/install', require('./src/routes/install'));
  app.use('/', require('./src/routes/auth'));
  app.use('/', require('./src/routes/dashboard'));
  app.use('/admin', require('./src/routes/admin'));
  app.use('/me', require('./src/routes/me'));
  moduleSystem.register(app);

  // ---- 404 ----
  app.use((req, res) => {
    res.status(404).render('pages/error', {
      title: 'صفحه یافت نشد', status: 404,
      message: 'صفحه مورد نظر وجود ندارد.'
    });
  });

  // ---- error handler ----
  app.use((err, req, res, next) => {
    console.error('[error]', err.message);
    if (res.headersSent) return next(err);
    const msg = process.env.NODE_ENV === 'production' ? 'خطای داخلی سامانه رخ داد.' : err.message;
    if (req.xhr || (req.headers.accept || '').includes('json')) {
      return res.status(500).json({ ok: false, message: msg });
    }
    res.status(500).render('pages/error', { title: 'خطای سامانه', status: 500, message: msg });
  });

  return app;
}

module.exports = { createApp };
