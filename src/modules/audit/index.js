/**
 * ماژول لاگ حسابرسی
 */
'use strict';

const { paginate } = require('../../core/domain');

module.exports = {
  key: 'audit',
  title: 'لاگ فعالیت‌ها',
  description: 'ثبت و بررسی همه فعالیت‌های کاربران سامانه برای شفافیت و امنیت.',
  icon: 'history',
  order: 95,
  defaultEnabled: true,

  permissions: [
    { key: 'audit.view', title: 'مشاهده لاگ فعالیت‌ها', group: 'لاگ و امنیت' },
    { key: 'audit.manage', title: 'پاک‌سازی لاگ‌ها', group: 'لاگ و امنیت' }
  ],

  settings: [
    { key: 'retentionDays', title: 'مدت نگهداری لاگ (روز)', type: 'number', default: 365 },
    { key: 'logReads', title: 'ثبت فعالیت‌های مشاهده‌ای (حجم بیشتر)', type: 'bool', default: false }
  ],

  nav: [
    { path: '/audit', title: 'لاگ فعالیت‌ها', icon: 'history', perm: 'audit.view', order: 93 }
  ],

  api(api, app) {
    const modules = app.modules;

    api.get('/audit', { perm: 'audit.view', module: 'audit' }, (ctx) => {
      const data = ctx.audit.list({
        page: Number(ctx.query.page || 1),
        perPage: Number(ctx.query.perPage || 40),
        action: ctx.query.action,
        entity: ctx.query.entity,
        actorId: ctx.query.actorId,
        q: ctx.query.q,
        from: ctx.query.from,
        to: ctx.query.to ? new Date(new Date(ctx.query.to).getTime() + 86399999).toISOString() : undefined
      });

      const all = ctx.col('audit_logs').all();
      const stats = {
        total: all.length,
        today: all.filter((l) => l.at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length,
        warnings: all.filter((l) => l.level === 'warn').length,
        byEntity: Object.entries(all.reduce((acc, l) => { acc[l.entity || 'other'] = (acc[l.entity || 'other'] || 0) + 1; return acc; }, {}))
          .map(([entity, count]) => ({ entity, count })).sort((a, b) => b.count - a.count).slice(0, 10),
        byAction: Object.entries(all.reduce((acc, l) => { acc[l.action] = (acc[l.action] || 0) + 1; return acc; }, {}))
          .map(([action, count]) => ({ action, count })).sort((a, b) => b.count - a.count).slice(0, 10)
      };

      const users = ctx.col('users').all().map((u) => ({ id: u.id, name: u.name }));
      return Object.assign(data, { stats, users, actions: stats.byAction.map((a) => a.action) });
    });

    api.get('/audit/:id', { perm: 'audit.view', module: 'audit' }, (ctx) => {
      const entry = ctx.audit.get(ctx.params.id);
      if (!entry) ctx.notFound('رکورد لاگ یافت نشد');
      return { entry };
    });

    api.post('/audit/prune', { perm: 'audit.manage', module: 'audit' }, (ctx) => {
      const days = Number(ctx.body.days || modules.s('audit', 'retentionDays', 365));
      const removed = ctx.audit.prune(days);
      ctx.log('audit.prune', `پاک‌سازی ${removed} رکورد لاگ قدیمی‌تر از ${days} روز`, { entity: 'audit', level: 'warn' });
      return { removed, days };
    });
  }
};
