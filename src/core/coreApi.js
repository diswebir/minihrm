/**
 * مسیرهای پایه API (بوت‌استرپ پنل، جست‌وجوی سراسری، اطلاعات عمومی)
 */
'use strict';

const utils = require('./utils');
const jalali = require('./jalali');
const domain = require('./domain');

function registerCoreApi(api, app) {
  /** داده‌های راه‌اندازی پنل مدیریت */
  api.get('/bootstrap', { auth: true, allowPasswordChangePending: true }, (ctx) => {
    const user = ctx.user;
    const roles = ctx.rbac.rolesOf(user);
    return {
      user: {
        id: user.id, name: user.name, mobile: user.mobile, email: user.email || '',
        avatar: user.avatar || null,
        mustChangePassword: !!user.mustChangePassword,
        employee: user.employee || null,
        roles: roles.map((r) => ({ id: r.id, key: r.key, name: r.name, color: r.color })),
        isSuperAdmin: roles.some((r) => r.key === 'super_admin')
      },
      permissions: ctx.rbac.effectivePermissions(user),
      modules: app.modules.clientModules(),
      nav: app.modules.nav(),
      branding: {
        name: ctx.config.get('app.name', 'مینی HRM'),
        companyName: ctx.config.get('app.companyName', ''),
        logo: ctx.config.get('app.logo', null),
        primaryColor: ctx.config.get('app.primaryColor', '#7C6CF0')
      },
      publicPortal: {
        careersEnabled: ctx.config.get('publicPortal.careersEnabled', true) !== false,
        baseUrl: ctx.baseUrl('')
      },
      sms: { testMode: app.sms.testMode, provider: app.sms.provider },
      version: app.version,
      serverTime: new Date().toISOString(),
      jalaliToday: jalali.formatJalaliLong(new Date())
    };
  });

  /** تغییر رمز عبور اجباری در اولین ورود (مسیر ویژه) */
  api.post('/bootstrap/change-password', { auth: true, allowPasswordChangePending: true, rateLimit: { max: 10, windowSec: 300 } }, (ctx) => {
    const { newPassword, confirmPassword } = ctx.body;
    if (newPassword !== confirmPassword) ctx.fail('تکرار رمز عبور مطابقت ندارد');
    ctx.auth.setPassword(ctx.user.id, newPassword);
    const session = ctx.auth.createSession({ subjectType: 'user', subjectId: ctx.user.id, req: ctx.req });
    ctx.req.__res.setCookie(ctx.auth.cookieHeader(session));
    ctx.log('user.password_first_login', 'تغییر رمز عبور در اولین ورود', { entity: 'user', entityId: ctx.user.id });
    return { changed: true };
  });

  /** جست‌وجوی سراسری */
  api.get('/search', { auth: true }, (ctx) => {
    const q = utils.cleanText(ctx.query.q, 60);
    if (!q || q.length < 2) return { query: q, results: [] };
    const needle = q.toLowerCase();
    const results = [];
    const push = (type, id, title, subtitle, url, meta) => results.push({ type, id, title, subtitle, url, meta });

    if (ctx.can('applications.view')) {
      for (const a of ctx.col('applications').all()) {
        if (results.filter((r) => r.type === 'application').length >= 6) break;
        const name = domain.fullName(a);
        if ([name, a.code, domain.mobile(a), a.jobTitle].join(' ').toLowerCase().includes(needle)) {
          push('application', a.id, name, `${a.code || ''} — ${a.jobTitle || ''}`, `#/applications/${a.id}`, { status: domain.statusInfo(a.status).title });
        }
      }
    }
    if (ctx.can('jobs.view')) {
      for (const j of ctx.col('jobs').all()) {
        if (results.filter((r) => r.type === 'job').length >= 5) break;
        if ([j.title, j.department, j.location].join(' ').toLowerCase().includes(needle)) {
          push('job', j.id, j.title, `${j.department || ''} — ${j.location || ''}`, `#/jobs/${j.id}`, { status: j.status });
        }
      }
    }
    if (ctx.can('users.view')) {
      for (const u of ctx.col('users').all()) {
        if (results.filter((r) => r.type === 'user').length >= 5) break;
        if ([u.name, u.mobile, u.email].join(' ').toLowerCase().includes(needle)) {
          push('user', u.id, u.name, u.mobile, `#/users/${u.id}`, {});
        }
      }
    }

    return {
      query: q,
      results: results.map((r) => Object.assign(r, {
        typeTitle: { application: 'متقاضی', job: 'موقعیت شغلی', user: 'کاربر' }[r.type]
      }))
    };
  });

  /** اطلاعات عمومی سامانه (برای فوتر/صفحه ورود) */
  api.get('/public/info', { auth: false }, (ctx) => ({
    name: ctx.config.get('app.name'),
    companyName: ctx.config.get('app.companyName'),
    logo: ctx.config.get('app.logo'),
    primaryColor: ctx.config.get('app.primaryColor'),
    careersEnabled: ctx.config.get('publicPortal.careersEnabled', true) !== false,
    loginMethods: {
      password: ctx.config.get('security.allowPasswordLogin', true) !== false,
      otp: ctx.config.get('security.allowOtpLogin', true) !== false
    },
    installed: !!ctx.config.get('installed', false),
    version: app.version
  }));

  /** ورود با رمز عبور (API) */
  api.post('/auth/login', { auth: false, rateLimit: { max: 10, windowSec: 300 } }, (ctx) => {
    const allowPassword = ctx.config.get('security.allowPasswordLogin', true) !== false;
    if (!allowPassword) ctx.fail('ورود با رمز عبور در این سامانه غیرفعال است؛ از ورود با کد پیامکی استفاده کنید.');
    const login = ctx.body.login || ctx.body.username || ctx.body.mobile;
    const result = ctx.auth.loginWithPassword({ login, password: ctx.body.password, req: ctx.req });
    if (!result.ok) {
      ctx.audit.log({ action: 'auth.login_failed', entity: 'user', title: `تلاش ناموفق ورود با نام کاربری «${utils.truncate(login, 30)}»`, req: ctx.req, level: 'warn' });
      ctx.fail(result.error, 401, { code: result.code });
    }
    const session = ctx.auth.createSession({ subjectType: 'user', subjectId: result.user.id, req: ctx.req });
    ctx.req.__res.setCookie(ctx.auth.cookieHeader(session));
    ctx.audit.log({ actor: result.user, action: 'auth.login', entity: 'user', entityId: result.user.id, title: `ورود «${result.user.name}» با رمز عبور`, req: ctx.req });
    return {
      sessionId: session.id,
      mustChangePassword: !!result.user.mustChangePassword,
      user: { id: result.user.id, name: result.user.name }
    };
  });

  /** درخواست کد یکبارمصرف برای ورود کارکنان */
  api.post('/auth/otp/request', { auth: false, rateLimit: { max: 12, windowSec: 300 } }, async (ctx) => {
    const allowOtp = ctx.config.get('security.allowOtpLogin', true) !== false;
    if (!allowOtp) ctx.fail('ورود با کد پیامکی غیرفعال است.');
    const mobile = utils.normalizeMobile(ctx.body.mobile);
    if (!utils.isValidMobile(mobile)) ctx.fail('شماره موبایل نامعتبر است', 400, { fields: { mobile: 'شماره موبایل نامعتبر است' } });
    // فقط کاربران سامانه اجازه ورود با OTP دارند
    const user = ctx.auth.findUserByLogin(mobile);
    if (!user) ctx.fail('کاربری با این شماره موبایل در سامانه ثبت نشده است. با مدیر سامانه تماس بگیرید.', 404);
    if (user.status === 'disabled') ctx.fail('حساب کاربری شما غیرفعال است.');
    const result = await ctx.otp.request({ mobile, purpose: 'login', ip: ctx.ip });
    if (!result.ok) ctx.fail(result.error);
    return { sent: true, ttlSec: result.ttlSec, devCode: result.devCode, simulated: result.simulated };
  });

  /** تأیید کد و ورود */
  api.post('/auth/otp/verify', { auth: false, rateLimit: { max: 20, windowSec: 300 } }, (ctx) => {
    const mobile = utils.normalizeMobile(ctx.body.mobile);
    const verify = ctx.otp.verify({ mobile, purpose: 'login', code: ctx.body.code });
    if (!verify.ok) ctx.fail(verify.error, 400, { fields: { code: verify.error } });
    const result = ctx.auth.loginByMobile(mobile, { req: ctx.req });
    if (!result.ok) ctx.fail(result.error, 401);
    const session = ctx.auth.createSession({ subjectType: 'user', subjectId: result.user.id, req: ctx.req });
    ctx.req.__res.setCookie(ctx.auth.cookieHeader(session));
    ctx.audit.log({ actor: result.user, action: 'auth.login_otp', entity: 'user', entityId: result.user.id, title: `ورود «${result.user.name}» با کد پیامکی`, req: ctx.req });
    return { sessionId: session.id, mustChangePassword: !!result.user.mustChangePassword, user: { id: result.user.id, name: result.user.name } };
  });

  api.post('/auth/logout', { auth: 'optional' }, (ctx) => {
    const session = ctx.auth.sessionFromRequest(ctx.req);
    if (session) ctx.auth.destroySession(session.id);
    ctx.req.__res.setCookie(ctx.auth.clearCookieHeader('user'));
    if (ctx.user) ctx.audit.log({ actor: ctx.user, action: 'auth.logout', entity: 'user', entityId: ctx.user.id, title: `خروج «${ctx.user.name}»`, req: ctx.req });
    return { loggedOut: true };
  });

  /** فعال‌سازی حساب با لینک دعوت (تعیین رمز عبور) */
  api.post('/auth/accept-invite', { auth: false, rateLimit: { max: 10, windowSec: 300 } }, (ctx) => {
    const token = ctx.body.token;
    const invite = ctx.auth.getInvite(token);
    if (!invite) ctx.fail('این لینک دعوت معتبر نیست یا منقضی شده است.', 410);
    const user = ctx.col('users').byId(invite.userId);
    if (!user) ctx.fail('کاربر مربوط به این دعوت یافت نشد.', 404);
    const password = ctx.body.password;
    if (password !== ctx.body.confirmPassword) ctx.fail('تکرار رمز عبور مطابقت ندارد');
    ctx.auth.setPassword(user.id, password);
    ctx.auth.useInvite(token);
    const session = ctx.auth.createSession({ subjectType: 'user', subjectId: user.id, req: ctx.req });
    ctx.req.__res.setCookie(ctx.auth.cookieHeader(session));
    ctx.audit.log({ actor: user, action: 'user.accept_invite', entity: 'user', entityId: user.id, title: `فعال‌سازی حساب «${user.name}» از طریق لینک دعوت`, req: ctx.req });
    return { accepted: true, user: { id: user.id, name: user.name } };
  });

  api.get('/auth/invite/:token', { auth: false }, (ctx) => {
    const invite = ctx.auth.getInvite(ctx.params.token);
    if (!invite) ctx.fail('این لینک دعوت معتبر نیست یا منقضی شده است.', 410);
    const user = ctx.col('users').byId(invite.userId);
    return { valid: true, name: user ? user.name : '', mobile: user ? user.mobile : '', expiresAt: invite.expiresAt };
  });
}

module.exports = { registerCoreApi };
