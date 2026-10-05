/**
 * ماژول پروفایل کاربر (اطلاعات شخصی، رمز عبور، نشست‌های فعال)
 */
'use strict';

const utils = require('../../core/utils');

module.exports = {
  key: 'profile',
  title: 'پروفایل من',
  description: 'اطلاعات شخصی، تغییر رمز عبور و مدیریت نشست‌های فعال.',
  icon: 'user-circle',
  order: 15,
  core: true,
  defaultEnabled: true,

  permissions: [
    { key: 'profile.view', title: 'مشاهده پروفایل خود', group: 'پروفایل' },
    { key: 'profile.edit', title: 'ویرایش پروفایل خود', group: 'پروفایل' }
  ],

  nav: [
    { path: '/profile', title: 'پروفایل من', icon: 'user-circle', perm: 'profile.view', order: 95 }
  ],

  api(api, app) {
    const meOut = (u, rbac) => ({
      id: u.id, name: u.name, mobile: u.mobile, email: u.email, username: u.username || '',
      avatar: u.avatar || null,
      employee: u.employee || null,
      roles: rbac.rolesOf(u).map((r) => ({ id: r.id, key: r.key, name: r.name, color: r.color, description: r.description })),
      permissions: rbac.effectivePermissions(u),
      isSuperAdmin: rbac.rolesOf(u).some((r) => r.key === 'super_admin'),
      lastLoginAt: u.lastLoginAt || null,
      mustChangePassword: !!u.mustChangePassword,
      createdAt: u.createdAt
    });

    api.get('/me', { auth: 'optional', allowPasswordChangePending: true, module: 'profile' }, (ctx) => {
      if (!ctx.user) return { authenticated: false };
      return { authenticated: true, user: meOut(ctx.user, ctx.rbac) };
    });

    api.put('/me', { perm: 'profile.edit', allowPasswordChangePending: true, module: 'profile' }, (ctx) => {
      const patch = {};
      if (ctx.body.name !== undefined) {
        const name = utils.cleanText(ctx.body.name, 120);
        if (!name) ctx.fail('نام نمی‌تواند خالی باشد');
        patch.name = name;
      }
      if (ctx.body.email !== undefined) {
        if (ctx.body.email && !utils.isEmail(ctx.body.email)) ctx.fail('ایمیل نامعتبر است');
        patch.email = utils.cleanText(ctx.body.email, 160);
      }
      const updated = ctx.col('users').update(ctx.user.id, patch);
      ctx.log('profile.update', 'به‌روزرسانی پروفایل شخصی', { entity: 'user', entityId: ctx.user.id });
      return { user: meOut(updated, ctx.rbac) };
    });

    api.post('/me/password', { auth: true, allowPasswordChangePending: true, module: 'profile', rateLimit: { max: 10, windowSec: 300 } }, (ctx) => {
      const { currentPassword, newPassword, confirmPassword } = ctx.body;
      if (!ctx.user.passwordHash && currentPassword) ctx.fail('رمز عبور فعلی نامعتبر است');
      if (ctx.user.passwordHash) {
        if (!utils.verifyPassword(currentPassword, ctx.user.passwordHash)) ctx.fail('رمز عبور فعلی نادرست است');
      }
      if (newPassword !== confirmPassword) ctx.fail('تکرار رمز عبور جدید مطابقت ندارد');
      ctx.auth.setPassword(ctx.user.id, newPassword);
      ctx.log('profile.password', 'تغییر رمز عبور', { entity: 'user', entityId: ctx.user.id, level: 'warn' });
      // نشست‌ها باطل شده‌اند → نشست جدید برای کاربر جاری
      const session = ctx.auth.createSession({ subjectType: 'user', subjectId: ctx.user.id, req: ctx.req });
      ctx.req.__res.setCookie(ctx.auth.cookieHeader(session));
      return { changed: true, sessionId: session.id };
    });

    api.post('/me/avatar', { perm: 'profile.edit', module: 'profile' }, (ctx) => {
      const file = ctx.files.find((f) => f.field === 'avatar') || ctx.files[0];
      if (!file) ctx.fail('فایلی ارسال نشده است');
      const saved = ctx.app.upload.saveUpload(file, {
        root: app.root, dir: 'avatars', allowed: ['png', 'jpg', 'jpeg', 'webp'], maxBytes: 2 * 1024 * 1024, prefix: 'avatar'
      });
      ctx.col('users').update(ctx.user.id, { avatar: saved.path });
      return { avatar: saved.path };
    });

    api.get('/me/sessions', { perm: 'profile.view', module: 'profile' }, (ctx) => {
      const sessions = ctx.col('sessions').filter((s) => s.subjectType === 'user' && s.subjectId === ctx.user.id)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map((s) => ({ id: s.id, createdAt: s.createdAt, expiresAt: s.expiresAt, ip: s.ip, ua: s.ua, current: s.id === (ctx.req.__sessionId || null) }));
      return { sessions };
    });

    api.delete('/me/sessions/:id', { perm: 'profile.view', module: 'profile' }, (ctx) => {
      ctx.col('sessions').removeWhere((s) => s.id === ctx.params.id && s.subjectId === ctx.user.id);
      return { removed: true };
    });
  }
};
