/**
 * ویزارد نصب سامانه
 * ------------------------------------------------------------------
 * مسیر /install در اولین اجرا فعال است و شامل مراحل زیر می‌شود:
 *   ۱) بررسی پیش‌نیازها
 *   ۲) اطلاعات سازمان و ساخت حساب «مدیر ارشد سامانه»
 *   ۳) انتخاب ماژول‌های فعال
 *   ۴) تنظیمات پیامک (IPPanel) + تست
 *   ۵) نصب نهایی و ساخت داده‌های اولیه
 *
 * پس از نصب، اجرای مجدد ویزارد فقط با ورود مدیر ارشد امکان‌پذیر است.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const utils = require('./utils');
const { HttpError } = require('./http/router');

const STEPS = ['requirements', 'organization', 'modules', 'sms', 'finish'];

/** بررسی پیش‌نیازهای نصب */
function checkRequirementsFor(app) {
  const checks = [];
  const nodeMajor = parseInt(process.version.replace(/^v/, '').split('.')[0], 10);
  checks.push({ key: 'node', title: `نسخه Node.js (${process.version})`, ok: nodeMajor >= 18, hint: 'حداقل نسخه ۱۸ لازم است. در cPanel از بخش Setup Node.js App نسخه ۱۸ یا بالاتر را انتخاب کنید.', required: true });
  let dataWritable = false;
  try {
    const testFile = path.join(app.root, 'data', '.write-test');
    fs.mkdirSync(path.join(app.root, 'data'), { recursive: true });
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    dataWritable = true;
  } catch (e) { dataWritable = false; }
  checks.push({ key: 'data', title: 'قابلیت نوشتن در پوشه data', ok: dataWritable, hint: 'مجوز پوشه data را روی 755 (یا 775) تنظیم کنید.', required: true });
  const viewsOk = fs.existsSync(path.join(app.root, 'views', 'layouts', 'site.html'));
  checks.push({ key: 'views', title: 'فایل‌های قالب (views)', ok: viewsOk, hint: 'محتوای مخزن را کامل آپلود کنید.', required: true });
  checks.push({ key: 'public', title: 'فایل‌های عمومی (public)', ok: fs.existsSync(path.join(app.root, 'public', 'css', 'app.css')), hint: 'پوشه public را کامل آپلود کنید.', required: true });
  checks.push({ key: 'deps', title: 'بدون وابستگی خارجی (تأیید اجرا)', ok: true, hint: 'این سامانه فقط با ماژول‌های داخلی Node اجرا می‌شود؛ نیازی به npm install نیست.', required: false });
  checks.push({ key: 'https', title: 'اتصال امن (HTTPS)', ok: true, hint: 'برای استفاده از پیامک و پورتال استخدام، دامنه SSL دار توصیه می‌شود. اگر SSL دارید، آدرس پایه را با https وارد کنید.', required: false });
  return { checks, ok: checks.filter((c) => c.required).every((c) => c.ok) };
}

function registerRoutes(router, app) {
  const checkRequirements = () => checkRequirementsFor(app);



  /** خواندن وضعیت ویزارد */
  const getState = () => {
    const col = app.db.col('install_state');
    let state = col.all()[0];
    if (!state) state = col.insert({ step: 0, data: {} });
    return state;
  };
  const saveState = (patch) => {
    const col = app.db.col('install_state');
    const state = getState();
    return col.update(state.id, patch);
  };

  const requireFresh = (req, res) => {
    const installed = !!app.config.get('installed', false);
    if (installed) {
      const user = app.auth.currentUser(req, app.rbac);
      if (!user || !app.rbac.can(user, '*')) {
        res.redirect('/admin');
        return false;
      }
    }
    return true;
  };

  /** صفحه ویزارد */
  const renderWizard = (req, res, step, extra = {}) => {
    const state = getState();
    const modules = app.modules.info().map((m) => Object.assign({}, m, {
      enabled: state.data.modules && state.data.modules[m.key] !== undefined ? !!state.data.modules[m.key] : m.defaultEnabled
    }));
    const html = app.view.render('install/wizard', Object.assign({
      step,
      stepIndex: STEPS.indexOf(step),
      STEPS,
      state: state.data,
      modules,
      requirements: checkRequirements(),
      app: app.config.get('app', {}),
      version: app.version,
      error: null,
      title: 'نصب سامانه'
    }, extra), 'layouts/plain');
    res.html(html);
  };

  router.get('/install', (req, res) => {
    if (!requireFresh(req, res)) return;
    if (app.config.get('installed', false)) {
      return renderWizard(req, res, 'done', { installed: true });
    }
    const state = getState();
    const step = req.query.step && STEPS.includes(req.query.step) ? req.query.step : STEPS[Math.min(state.step || 0, STEPS.length - 1)];
    renderWizard(req, res, step);
  });

  /** تست اتصال پیامک (AJAX) */
  router.post('/install/test-sms', async (req, res) => {
    if (!requireFresh(req, res)) return;
    const body = await readForm(req);
    const apiKey = utils.cleanText(body.smsApiKey || '', 200);
    const sender = utils.cleanText(body.smsSender || '', 40);
    const baseUrl = utils.cleanText(body.smsBaseUrl || '', 200) || undefined;
    if (!body.testMobile || !utils.isValidMobile(body.testMobile)) {
      return res.json(400, { ok: false, error: 'برای تست، شماره موبایل معتبر وارد کنید' });
    }
    const result = await app.sms.testConnection({ apiKey, senderNumber: sender, baseUrl });
    if (!result.ok) return res.json(400, { ok: false, error: result.error });
    // ارسال پیامک آزمایشی واقعی (force) برای اطمینان از تنظیمات
    const send = await app.sms.sendRaw({
      to: body.testMobile,
      text: `پیام آزمایشی سامانه ${app.config.get('app.name', 'مینی HRM')} — تنظیمات پیامک صحیح است.`,
      patternCode: utils.cleanText(body.smsPatternCode || '', 80),
      params: { code: 'TEST', company: app.config.get('app.companyName', '') },
      templateKey: 'test',
      force: true
    });
    return res.json(200, {
      ok: true,
      data: { credit: result.credit, sent: send.ok, error: send.error || null }
    });
  });

  /** پردازش هر مرحله (فرم‌های HTML) */
  router.post('/install', async (req, res) => {
    if (!requireFresh(req, res)) return;
    const body = await readForm(req);
    const step = String(body._step || '');
    const state = getState();
    const data = Object.assign({}, state.data);

    try {
      if (step === 'requirements') {
        const reqs = checkRequirements();
        if (!reqs.ok) throw new HttpError(400, 'برخی پیش‌نیازها تأمین نشده است.');
        saveState({ step: 1, data });
        return res.redirect('/install?step=organization');
      }

      if (step === 'organization') {
        const companyName = utils.cleanText(body.companyName, 120);
        const appName = utils.cleanText(body.appName, 80) || 'مینی HRM';
        const baseUrl = utils.cleanText(body.baseUrl, 200).replace(/\/+$/, '');
        const adminName = utils.cleanText(body.adminName, 120);
        const adminMobile = utils.normalizeMobile(body.adminMobile);
        const adminEmail = utils.cleanText(body.adminEmail, 160);
        const password = String(body.adminPassword || '');
        const password2 = String(body.adminPassword2 || '');

        const errors = {};
        if (!companyName) errors.companyName = 'نام سازمان را وارد کنید';
        if (!adminName) errors.adminName = 'نام و نام خانوادگی مدیر را وارد کنید';
        if (!utils.isValidMobile(adminMobile)) errors.adminMobile = 'شماره موبایل معتبر وارد کنید (مثال: 09123456789)';
        if (adminEmail && !utils.isEmail(adminEmail)) errors.adminEmail = 'ایمیل نامعتبر است';
        if (password !== password2) errors.adminPassword2 = 'تکرار رمز عبور مطابقت ندارد';
        const strength = utils.passwordStrength(password);
        if (!strength.ok) errors.adminPassword = 'رمز عبور باید حداقل ۸ کاراکتر و شامل حروف و ارقام باشد';
        if (Object.keys(errors).length) throw new HttpError(400, 'لطفاً خطاهای فرم را اصلاح کنید', { fields: errors });

        data.organization = { companyName, appName, baseUrl };
        data.admin = { name: adminName, mobile: adminMobile, email: adminEmail };
        data.adminPassword = utils.hashPassword(password);
        saveState({ step: 2, data });
        return res.redirect('/install?step=modules');
      }

      if (step === 'modules') {
        const selected = {};
        for (const m of app.modules.all()) {
          if (m.core) { selected[m.key] = true; continue; }
          selected[m.key] = body[`module_${m.key}`] !== undefined && body[`module_${m.key}`] !== '';
        }
        // وابستگی‌ها
        for (const m of app.modules.all()) {
          if (!selected[m.key]) continue;
          for (const dep of m.depends || []) selected[dep] = true;
        }
        data.modules = selected;
        saveState({ step: 3, data });
        return res.redirect('/install?step=sms');
      }

      if (step === 'sms') {
        data.sms = {
          provider: body.smsProvider === 'ippanel' ? 'ippanel' : 'console',
          apiKey: utils.cleanText(body.smsApiKey, 300),
          senderNumber: utils.cleanText(body.smsSender, 40),
          defaultPatternCode: utils.cleanText(body.smsPatternCode, 80),
          testMode: body.smsTestMode !== undefined && body.smsTestMode !== '' ? true : body.smsProvider !== 'ippanel'
        };
        saveState({ step: 4, data });
        return res.redirect('/install?step=finish');
      }

      if (step === 'finish') {
        // ---- بررسی نهایی
        if (!data.admin || !data.adminPassword) throw new HttpError(400, 'اطلاعات مدیر ارشد ناقص است؛ به مرحله قبل بازگردید.');

        // ---- ذخیره تنظیمات
        app.config.set({
          app: {
            name: (data.organization && data.organization.appName) || 'مینی HRM',
            companyName: (data.organization && data.organization.companyName) || '',
            baseUrl: (data.organization && data.organization.baseUrl) || ''
          },
          publicPortal: {
            contactEmail: (data.admin && data.admin.email) || '',
            pageTitle: `فرصت‌های شغلی ${(data.organization && data.organization.companyName) || ''}`.trim()
          },
          sms: Object.assign({}, data.sms || {}),
          modules: Object.fromEntries(app.modules.all().map((m) => [m.key, {
            enabled: data.modules ? data.modules[m.key] !== false : m.defaultEnabled
          }]))
        });

        // ---- نقش‌های سیستمی
        app.rbac.seedSystemRoles();

        // ---- حساب مدیر ارشد
        const superRole = app.rbac.roleByKey('super_admin');
        const existing = app.auth.findUserByLogin(data.admin.mobile);
        let created = existing;
        if (!existing) {
          const { user } = app.auth.createUser({
            name: data.admin.name,
            mobile: data.admin.mobile,
            email: data.admin.email || '',
            roleIds: [superRole.id],
            status: 'active',
            employee: { code: 'HR-001', department: 'منابع انسانی', position: 'مدیر ارشد سامانه', startDate: new Date().toISOString().slice(0, 10) }
          });
          created = user;
          app.db.col('users').update(user.id, { passwordHash: data.adminPassword, mustChangePassword: false });
        } else {
          app.db.col('users').update(existing.id, { passwordHash: data.adminPassword, roleIds: [superRole.id], status: 'active', mustChangePassword: false });
        }

        // ---- نصب ماژول‌ها (داده‌های اولیه)
        await app.modules.installAll(created, { reason: 'install' });

        // ---- داده نمونه (اختیاری)
        if (body.demoData !== undefined && body.demoData !== '') {
          seedDemoData(app, created);
        }

        // ---- علامت‌گذاری نصب
        app.config.set({ installed: true, installedAt: new Date().toISOString(), installStep: STEPS.length });
        app.db.col('install_state').removeWhere(() => true);

        app.audit.log({
          actor: created, action: 'system.install', entity: 'system', entityId: null,
          title: 'نصب سامانه و ایجاد حساب مدیر ارشد', req
        });

        return renderWizard(req, res, 'done', { installed: true, adminMobile: data.admin.mobile });
      }

      throw new HttpError(400, 'مرحله ناشناخته');
    } catch (err) {
      const fieldErrors = err.extra && err.extra.fields ? err.extra.fields : {};
      const values = Object.assign({}, data, { form: body });
      return renderWizardValues(req, res, step || 'requirements', values, err.message, fieldErrors);
    }
  });

  const renderWizardValues = (req, res, step, values, error, fieldErrors) => {
    const modules = app.modules.info().map((m) => Object.assign({}, m, {
      enabled: values.modules && values.modules[m.key] !== undefined ? !!values.modules[m.key] : m.defaultEnabled
    }));
    const html = app.view.render('install/wizard', {
      step,
      stepIndex: Math.max(0, STEPS.indexOf(step)),
      STEPS,
      state: values,
      modules,
      requirements: checkRequirements(),
      app: app.config.get('app', {}),
      version: app.version,
      error: error || null,
      fieldErrors: fieldErrors || {},
      title: 'نصب سامانه'
    }, 'layouts/plain');
    res.html(html);
  };
}

/** خواندن بدنه فرم (x-www-form-urlencoded) */
function readForm(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1024 * 512) req.destroy(); });
    req.on('end', () => {
      try {
        resolve(Object.fromEntries(new URLSearchParams(data).entries()));
      } catch (e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

/** داده‌های نمونه برای تست سریع سامانه */
function seedDemoData(app, actor) {
  const jobs = app.db.col('jobs');
  if (!jobs.count()) {
    const samples = [
      {
        title: 'کارشناس منابع انسانی', department: 'منابع انسانی', location: 'اصفهان', type: 'تمام‌وقت',
        level: 'کارشناس', openings: 1, status: 'open',
        description: 'جذب کارشناس منابع انسانی برای مدیریت فرایند جذب، مصاحبه و امور پرسنلی.',
        requirements: ['کارشناسی مدیریت/روان‌شناسی', 'حداقل ۲ سال سابقه جذب و استخدام', 'تسلط بر Excel و نرم‌افزارهای HR'],
        responsibilities: ['غربالگری رزومه‌ها', 'هماهنگی و برگزاری مصاحبه', 'تهیه گزارش‌های جذب'],
        idealTypes: ['ENFJ', 'ESFJ', 'ENFP', 'ENTJ']
      },
      {
        title: 'برنامه‌نویس بک‌اند Node.js', department: 'فناوری اطلاعات', location: 'اصفهان / دورکاری', type: 'تمام‌وقت',
        level: 'کارشناس ارشد', openings: 2, status: 'open',
        description: 'توسعه سرویس‌های بک‌اند و API برای محصولات شرکت.',
        requirements: ['تسلط بر JavaScript/Node.js', 'آشنایی با دیتابیس‌های SQL و NoSQL', 'تجربه طراحی REST API'],
        responsibilities: ['توسعه و نگهداری سرویس‌ها', 'نوشتن تست و مستندسازی', 'همکاری با تیم محصول'],
        idealTypes: ['INTJ', 'INTP', 'ISTJ', 'ENTP']
      },
      {
        title: 'کارشناس فروش و پشتیبانی', department: 'فروش', location: 'اصفهان', type: 'تمام‌وقت',
        level: 'کارشناس', openings: 3, status: 'open',
        description: 'ارتباط با مشتریان، ارائه راهکار و پیگیری فرصت‌های فروش.',
        requirements: ['مهارت ارتباطی بالا', 'آشنایی با اصول مذاکره', 'روحیه کار تیمی'],
        responsibilities: ['پاسخ‌گویی به مشتریان', 'پیگیری سفارش‌ها', 'تهیه گزارش فروش'],
        idealTypes: ['ESFP', 'ENFJ', 'ESTP', 'ENTJ']
      }
    ];
    for (const s of samples) {
      jobs.insert(Object.assign({
        slug: utils.slugify(s.title) || 'job',
        salaryRange: '', tags: [], deadline: null, assessment: { mbti: { enabled: true, required: false } },
        formOverrides: { required: [], hidden: [], extra: [], steps: [] },
        showInPortal: true, createdBy: actor ? actor.id : null, createdAt: new Date().toISOString()
      }, s));
    }
  }
  app.logger.info('داده نمونه ایجاد شد.');
}

module.exports = { registerRoutes, checkRequirements: checkRequirementsFor };
