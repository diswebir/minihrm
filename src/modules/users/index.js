/**
 * ماژول کاربران سامانه و نقش‌ها
 */
'use strict';

const utils = require('../../core/utils');
const { paginate, sortRows } = require('../../core/domain');

module.exports = {
  key: 'users',
  title: 'کاربران و دسترسی‌ها',
  description: 'مدیریت کاربران، نقش‌ها، دعوت‌نامه‌ها و سطوح دسترسی.',
  icon: 'users',
  order: 20,
  core: true,
  defaultEnabled: true,

  permissions: [
    { key: 'users.view', title: 'مشاهده فهرست کاربران', group: 'کاربران' },
    { key: 'users.create', title: 'ایجاد کاربر جدید', group: 'کاربران' },
    { key: 'users.update', title: 'ویرایش کاربران', group: 'کاربران' },
    { key: 'users.delete', title: 'غیرفعال/حذف کاربر', group: 'کاربران' },
    { key: 'users.reset_password', title: 'بازنشانی رمز عبور کاربران', group: 'کاربران' },
    { key: 'users.impersonate', title: 'ورود به حساب کاربر (پشتیبانی)', group: 'کاربران' },
    { key: 'roles.manage', title: 'مدیریت نقش‌ها و مجوزها', group: 'کاربران' }
  ],

  settings: [
    { key: 'allowSelfInvite', title: 'امکان ساخت لینک دعوت توسط مدیر منابع انسانی', type: 'bool', default: true },
    { key: 'defaultRole', title: 'نقش پیش‌فرض کاربران جدید', type: 'select', default: 'employee', options: [
      { value: 'employee', label: 'کارمند شرکت' },
      { value: 'hr_staff', label: 'کارمند منابع انسانی' },
      { value: 'interviewer', label: 'مصاحبه‌کننده' }
    ] },
    { key: 'inviteExpiryHours', title: 'اعتبار لینک دعوت (ساعت)', type: 'number', default: 72 }
  ],

  nav: [
    { path: '/users', title: 'کاربران', icon: 'users', perm: 'users.view', order: 40 },
    { path: '/roles', title: 'نقش‌ها و دسترسی‌ها', icon: 'shield-check', perm: 'roles.manage', order: 41 }
  ],

  api(api, app) {
    const modules = app.modules;

    /** خلاصه کاربر برای خروجی */
    const userOut = (u, rbac) => {
      const roles = rbac.rolesOf(u);
      return {
        id: u.id, name: u.name, mobile: u.mobile, email: u.email, username: u.username || '',
        status: u.status, roleIds: u.roleIds || [],
        roles: roles.map((r) => ({ id: r.id, key: r.key, name: r.name, color: r.color })),
        employee: u.employee || null,
        avatar: u.avatar || null,
        mustChangePassword: !!u.mustChangePassword,
        lastLoginAt: u.lastLoginAt || null,
        createdAt: u.createdAt,
        isSuperAdmin: roles.some((r) => r.key === 'super_admin')
      };
    };

    api.get('/users', { perm: 'users.view', module: 'users' }, (ctx) => {
      let rows = ctx.col('users').all().map((u) => userOut(u, ctx.rbac));
      const { q, roleId, status, sortBy, dir } = ctx.query;
      if (q) {
        const n = String(q).toLowerCase();
        rows = rows.filter((u) => [u.name, u.mobile, u.email, u.username, u.employee && u.employee.code].join(' ').toLowerCase().includes(n));
      }
      if (roleId) rows = rows.filter((u) => u.roleIds.includes(roleId));
      if (status) rows = rows.filter((u) => u.status === status);
      rows = sortRows(rows, sortBy || 'createdAt', dir || 'desc', ['createdAt', 'name', 'lastLoginAt', 'status']);
      const paged = paginate(rows, ctx.query, 20);
      return {
        ...paged,
        roles: ctx.rbac.roles().map((r) => ({ id: r.id, key: r.key, name: r.name, color: r.color, description: r.description || '', system: !!r.system })),
        stats: {
          total: rows.length,
          active: rows.filter((u) => u.status === 'active').length,
          disabled: rows.filter((u) => u.status !== 'active').length,
          online: rows.filter((u) => u.lastLoginAt && new Date(u.lastLoginAt) > utils.addDays(new Date(), -1)).length
        }
      };
    });

    api.get('/users/:id', { perm: 'users.view', module: 'users' }, (ctx) => {
      const u = ctx.col('users').byId(ctx.params.id);
      if (!u) ctx.notFound('کاربر یافت نشد');
      const sessions = ctx.col('sessions').filter((s) => s.subjectType === 'user' && s.subjectId === u.id)
        .map((s) => ({ id: s.id, createdAt: s.createdAt, expiresAt: s.expiresAt, ip: s.ip, ua: s.ua }));
      const activity = ctx.audit.list({ actorId: u.id, perPage: 15 }).rows;
      return { user: userOut(u, ctx.rbac), sessions, activity };
    });

    api.post('/users', { perm: 'users.create', module: 'users', validate: (body) => {
      const errors = {};
      if (!utils.cleanText(body.name)) errors.name = 'نام کاربر الزامی است';
      if (!body.mobile && !body.email) errors.mobile = 'شماره موبایل یا ایمیل الزامی است';
      if (body.mobile && !utils.isValidMobile(body.mobile)) errors.mobile = 'شماره موبایل نامعتبر است';
      if (body.email && !utils.isEmail(body.email)) errors.email = 'ایمیل نامعتبر است';
      if (body.password && !utils.passwordStrength(body.password).ok) errors.password = 'رمز عبور ضعیف است (حداقل ۸ کاراکتر شامل حروف و ارقام)';
      return { errors };
    } }, (ctx) => {
      const b = ctx.body;
      // فقط مدیر ارشد می‌تواند نقش super_admin بدهد
      const requestedRoles = Array.isArray(b.roleIds) ? b.roleIds : [];
      let roleIds = requestedRoles;
      if (!ctx.isSuperAdmin()) {
        const superRole = ctx.rbac.roleByKey('super_admin');
        roleIds = requestedRoles.filter((id) => !superRole || id !== superRole.id);
      }
      if (!roleIds.length) {
        const def = modules.s('users', 'defaultRole', 'employee');
        const role = ctx.rbac.roleByKey(def);
        if (role) roleIds = [role.id];
      }
      const { user, plainPassword } = ctx.auth.createUser({
        name: b.name, mobile: b.mobile, email: b.email, username: b.username,
        password: b.password, roleIds, status: b.status || 'active',
        createdBy: ctx.user.id, employee: b.employee || null,
        autoPassword: !b.password
      });
      ctx.log('user.create', `ایجاد کاربر «${user.name}»`, { entity: 'user', entityId: user.id });
      const invite = ctx.auth.createInvite({
        userId: user.id, type: 'set-password',
        hours: Number(modules.s('users', 'inviteExpiryHours', 72)), createdBy: ctx.user.id
      });
      return {
        user: userOut(ctx.col('users').byId(user.id), ctx.rbac),
        plainPassword,
        inviteUrl: ctx.baseUrl(`/invite/${invite.id}`)
      };
    });

    api.put('/users/:id', { perm: 'users.update', module: 'users' }, (ctx) => {
      const u = ctx.col('users').byId(ctx.params.id);
      if (!u) ctx.notFound('کاربر یافت نشد');
      const b = ctx.body;
      const patch = {};
      if (b.name !== undefined) patch.name = utils.cleanText(b.name, 120);
      if (b.mobile !== undefined) {
        const mobile = utils.normalizeMobile(b.mobile);
        if (!utils.isValidMobile(mobile)) ctx.fail('شماره موبایل نامعتبر است');
        const dup = ctx.col('users').find((x) => x.id !== u.id && utils.normalizeMobile(x.mobile) === mobile);
        if (dup) ctx.fail('کاربر دیگری با این شماره موبایل ثبت شده است');
        patch.mobile = mobile;
      }
      if (b.email !== undefined) {
        if (b.email && !utils.isEmail(b.email)) ctx.fail('ایمیل نامعتبر است');
        patch.email = utils.cleanText(b.email, 160);
      }
      if (b.username !== undefined) patch.username = utils.cleanText(b.username, 60);
      if (b.status !== undefined) {
        if (u.id === ctx.user.id && b.status !== 'active') ctx.fail('نمی‌توانید حساب کاربری خودتان را غیرفعال کنید');
        patch.status = b.status === 'active' ? 'active' : 'disabled';
      }
      if (b.employee !== undefined) patch.employee = b.employee;
      if (b.roleIds !== undefined) {
        let roleIds = Array.isArray(b.roleIds) ? b.roleIds : [];
        if (!ctx.isSuperAdmin()) {
          const superRole = ctx.rbac.roleByKey('super_admin');
          roleIds = roleIds.filter((id) => !superRole || id !== superRole.id);
          // کاربر غیرمدیر ارشد نمی‌تواند نقش کاربر مدیر ارشد را تغییر دهد
          const targetRoles = ctx.rbac.rolesOf(u);
          if (targetRoles.some((r) => r.key === 'super_admin')) ctx.fail('فقط مدیر ارشد می‌تواند حساب مدیران ارشد را تغییر دهد');
        }
        patch.roleIds = roleIds;
      }
      const updated = ctx.col('users').update(u.id, patch);
      ctx.log('user.update', `ویرایش کاربر «${updated.name}»`, { entity: 'user', entityId: u.id, meta: patch });
      return { user: userOut(updated, ctx.rbac) };
    });

    api.delete('/users/:id', { perm: 'users.delete', module: 'users' }, (ctx) => {
      const u = ctx.col('users').byId(ctx.params.id);
      if (!u) ctx.notFound('کاربر یافت نشد');
      if (u.id === ctx.user.id) ctx.fail('نمی‌توانید حساب خودتان را حذف کنید');
      const roles = ctx.rbac.rolesOf(u);
      if (roles.some((r) => r.key === 'super_admin') && !ctx.isSuperAdmin()) ctx.fail('دسترسی کافی ندارید');
      if (ctx.query.hard === '1' && ctx.isSuperAdmin()) {
        ctx.auth.destroyUserSessions(u.id);
        ctx.col('users').remove(u.id);
        ctx.log('user.delete', `حذف کامل کاربر «${u.name}»`, { entity: 'user', entityId: u.id, level: 'warn' });
        return { deleted: true };
      }
      ctx.col('users').update(u.id, { status: 'disabled' });
      ctx.auth.destroyUserSessions(u.id);
      ctx.log('user.disable', `غیرفعال‌سازی کاربر «${u.name}»`, { entity: 'user', entityId: u.id, level: 'warn' });
      return { disabled: true };
    });

    api.post('/users/:id/reset-password', { perm: 'users.reset_password', module: 'users' }, (ctx) => {
      const u = ctx.col('users').byId(ctx.params.id);
      if (!u) ctx.notFound('کاربر یافت نشد');
      const password = ctx.body.password || utils.generatePassword(10);
      ctx.auth.setPassword(u.id, password);
      ctx.log('user.reset_password', `بازنشانی رمز عبور «${u.name}»`, { entity: 'user', entityId: u.id, level: 'warn' });
      return { password, mustChangePassword: !ctx.body.password };
    });

    api.post('/users/:id/invite', { perm: 'users.update', module: 'users' }, (ctx) => {
      const u = ctx.col('users').byId(ctx.params.id);
      if (!u) ctx.notFound('کاربر یافت نشد');
      const invite = ctx.auth.createInvite({
        userId: u.id, type: 'set-password',
        hours: Number(modules.s('users', 'inviteExpiryHours', 72)), createdBy: ctx.user.id
      });
      const url = ctx.baseUrl(`/invite/${invite.id}`);
      ctx.log('user.invite', `ساخت لینک دعوت برای «${u.name}»`, { entity: 'user', entityId: u.id });
      return { url, expiresAt: invite.expiresAt };
    });

    api.post('/users/:id/sms-invite', { perm: 'users.update', module: 'users' }, async (ctx) => {
      const u = ctx.col('users').byId(ctx.params.id);
      if (!u) ctx.notFound('کاربر یافت نشد');
      const invite = ctx.auth.createInvite({ userId: u.id, type: 'set-password', hours: 72, createdBy: ctx.user.id });
      const url = ctx.baseUrl(`/invite/${invite.id}`);
      const res = await ctx.sms.sendRaw({
        to: u.mobile, templateKey: 'invite',
        text: `${u.name} عزیز، برای ورود به سامانه ${ctx.config.get('app.name')} از این لینک استفاده کنید: ${url}`,
        params: { name: u.name, link: url, company: ctx.config.get('app.companyName', '') }
      });
      return { url, sent: res.ok, simulated: res.simulated, error: res.error || null };
    });

    // ---- نقش‌ها
    api.get('/roles', { perm: 'users.view', module: 'users' }, (ctx) => {
      const roles = ctx.rbac.roles().map((r) => ({
        id: r.id, key: r.key, name: r.name, description: r.description,
        color: r.color, system: !!r.system, permissions: r.permissions || [],
        userCount: ctx.col('users').filter((u) => (u.roleIds || []).includes(r.id)).length
      }));
      const groups = Object.entries(ctx.rbac.permissionGroups()).map(([name, permissions]) => ({ key: name, name, permissions }));
      return { roles, permissions: groups };
    });

    api.post('/roles', { perm: 'roles.manage', module: 'users' }, (ctx) => {
      const role = ctx.rbac.createRole({
        name: utils.cleanText(ctx.body.name, 80),
        description: utils.cleanText(ctx.body.description, 300),
        permissions: Array.isArray(ctx.body.permissions) ? ctx.body.permissions : [],
        color: ctx.body.color || 'sky'
      });
      ctx.log('role.create', `ایجاد نقش «${role.name}»`, { entity: 'role', entityId: role.id, meta: { permissions: role.permissions } });
      return { role };
    });

    api.put('/roles/:id', { perm: 'roles.manage', module: 'users' }, (ctx) => {
      const role = ctx.col('roles').byId(ctx.params.id);
      if (!role) ctx.notFound('نقش یافت نشد');
      if (role.key === 'super_admin' && !ctx.isSuperAdmin()) ctx.fail('تغییر نقش مدیر ارشد مجاز نیست');
      const patch = {};
      if (ctx.body.name !== undefined) patch.name = utils.cleanText(ctx.body.name, 80);
      if (ctx.body.description !== undefined) patch.description = utils.cleanText(ctx.body.description, 300);
      if (ctx.body.color !== undefined) patch.color = ctx.body.color;
      if (Array.isArray(ctx.body.permissions)) patch.permissions = ctx.body.permissions;
      const updated = ctx.rbac.updateRole(role.id, patch);
      ctx.log('role.update', `ویرایش نقش «${updated.name}»`, { entity: 'role', entityId: role.id, meta: patch });
      return { role: updated };
    });

    api.delete('/roles/:id', { perm: 'roles.manage', module: 'users' }, (ctx) => {
      const role = ctx.col('roles').byId(ctx.params.id);
      if (!role) ctx.notFound('نقش یافت نشد');
      ctx.rbac.removeRole(role.id);
      ctx.log('role.delete', `حذف نقش «${role.name}»`, { entity: 'role', entityId: role.id, level: 'warn' });
      return { deleted: true };
    });
  }
};
