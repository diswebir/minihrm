/**
 * ماژول پیامک — تنظیمات IPPanel، قالب‌ها، صندوق خروجی و ارسال دستی
 */
'use strict';

const utils = require('../../core/utils');
const { paginate } = require('../../core/domain');

module.exports = {
  key: 'sms',
  title: 'سامانه پیامک',
  description: 'تنظیمات پنل پیامک (IPPanel)، قالب‌های پیام، ارسال گروهی و صندوق خروجی.',
  icon: 'message-square',
  order: 70,
  defaultEnabled: true,

  permissions: [
    { key: 'sms.view', title: 'مشاهده صندوق خروجی و وضعیت پیامک', group: 'پیامک' },
    { key: 'sms.send', title: 'ارسال پیامک به متقاضیان', group: 'پیامک' },
    { key: 'sms.settings', title: 'تنظیمات پنل پیامک و قالب‌ها', group: 'پیامک' }
  ],

  settings: [
    { key: 'allowBulkSend', title: 'امکان ارسال گروهی', type: 'bool', default: true },
    { key: 'signature', title: 'امضای انتهای پیام‌ها', type: 'text', default: '', help: 'در صورت پر بودن، به انتهای پیام‌های دستی اضافه می‌شود.' }
  ],

  nav: [
    { path: '/sms', title: 'پیامک', icon: 'message-square', perm: 'sms.view', order: 50 }
  ],

  api(api, app) {
    const modules = app.modules;

    const mask = (key) => (key ? `${String(key).slice(0, 4)}••••${String(key).slice(-4)}` : '');

    api.get('/sms/logs', { perm: 'sms.view', module: 'sms' }, (ctx) => {
      const data = ctx.sms.list({
        page: Number(ctx.query.page || 1),
        perPage: Number(ctx.query.perPage || 30),
        status: ctx.query.status,
        to: ctx.query.to,
        templateKey: ctx.query.templateKey,
        q: ctx.query.q
      });
      return Object.assign(data, {
        settings: {
          provider: ctx.sms.provider,
          testMode: ctx.sms.testMode,
          senderNumber: ctx.config.get('sms.senderNumber', ''),
          hasApiKey: !!ctx.config.get('sms.apiKey', ''),
          apiKeyMasked: mask(ctx.config.get('sms.apiKey', '')),
          baseUrl: ctx.config.get('sms.baseUrl', '')
        }
      });
    });

    api.get('/sms/templates', { perm: 'sms.view', module: 'sms' }, (ctx) => {
      const templates = ctx.config.get('sms.templates', {});
      return {
        templates: Object.entries(templates).map(([key, t]) => ({
          key, title: t.title, text: t.text, patternCode: t.patternCode || '',
          enabled: t.enabled !== false, editable: t.editable !== false
        })),
        variables: [
          { key: '{{name}}', title: 'نام متقاضی' },
          { key: '{{job}}', title: 'عنوان موقعیت شغلی' },
          { key: '{{company}}', title: 'نام شرکت' },
          { key: '{{code}}', title: 'کد (OTP یا کد رهگیری)' },
          { key: '{{date}}', title: 'تاریخ' },
          { key: '{{time}}', title: 'ساعت' },
          { key: '{{link}}', title: 'لینک' },
          { key: '{{location}}', title: 'محل برگزاری' }
        ],
        settings: {
          provider: ctx.sms.provider, testMode: ctx.sms.testMode,
          senderNumber: ctx.config.get('sms.senderNumber', ''),
          defaultPatternCode: ctx.config.get('sms.defaultPatternCode', ''),
          baseUrl: ctx.config.get('sms.baseUrl', ''),
          apiKeyMasked: mask(ctx.config.get('sms.apiKey', '')),
          logRetentionDays: ctx.config.get('sms.logRetentionDays', 90)
        }
      };
    });

    api.put('/sms/templates/:key', { perm: 'sms.settings', module: 'sms' }, (ctx) => {
      const key = ctx.params.key;
      const templates = ctx.config.get('sms.templates', {});
      if (!templates[key]) ctx.notFound('قالب پیام یافت نشد');
      if (templates[key].editable === false) ctx.fail('این قالب قابل ویرایش نیست');
      const patch = {
        text: utils.cleanText(ctx.body.text, 700),
        patternCode: utils.cleanText(ctx.body.patternCode, 80),
        enabled: ctx.body.enabled !== false
      };
      if (!patch.text) ctx.fail('متن پیام نمی‌تواند خالی باشد');
      ctx.config.set(`sms.templates.${key}`, Object.assign({}, templates[key], patch));
      ctx.log('sms.template', `ویرایش قالب پیام «${templates[key].title}»`, { entity: 'sms_template', entityId: key });
      return { template: ctx.config.get(`sms.templates.${key}`) };
    });

    api.put('/sms/settings', { perm: 'sms.settings', module: 'sms' }, (ctx) => {
      const b = ctx.body;
      const patch = {};
      if (b.provider !== undefined) patch.provider = ['ippanel', 'console'].includes(b.provider) ? b.provider : 'console';
      if (b.senderNumber !== undefined) patch.senderNumber = utils.cleanText(b.senderNumber, 40);
      if (b.defaultPatternCode !== undefined) patch.defaultPatternCode = utils.cleanText(b.defaultPatternCode, 80);
      if (b.baseUrl !== undefined) patch.baseUrl = utils.cleanText(b.baseUrl, 200) || 'https://edge.ippanel.com/v1';
      if (b.testMode !== undefined) patch.testMode = !!b.testMode;
      if (b.logRetentionDays !== undefined) patch.logRetentionDays = Math.min(3650, Math.max(7, Number(b.logRetentionDays) || 90));
      // کلید API فقط در صورت ارسال مقدار جدید تغییر می‌کند (مقدار ماسک‌شده پذیرفته نمی‌شود)
      if (b.apiKey !== undefined && b.apiKey !== '' && !String(b.apiKey).includes('•')) {
        patch.apiKey = utils.cleanText(b.apiKey, 400);
      }
      if (b.clearApiKey) patch.apiKey = '';
      ctx.config.set('sms', patch);
      ctx.log('sms.settings', 'به‌روزرسانی تنظیمات پیامک', { entity: 'settings', meta: Object.assign({}, patch, { apiKey: patch.apiKey ? 'تغییر کرد' : undefined }), level: 'warn' });
      return {
        settings: {
          provider: ctx.sms.provider, testMode: ctx.sms.testMode,
          senderNumber: ctx.config.get('sms.senderNumber', ''),
          defaultPatternCode: ctx.config.get('sms.defaultPatternCode', ''),
          baseUrl: ctx.config.get('sms.baseUrl', ''),
          apiKeyMasked: mask(ctx.config.get('sms.apiKey', ''))
        }
      };
    });

    api.get('/sms/credit', { perm: 'sms.view', module: 'sms' }, async (ctx) => {
      const credit = await ctx.sms.credit();
      return { credit, provider: ctx.sms.provider, testMode: ctx.sms.testMode };
    });

    api.post('/sms/test', { perm: 'sms.settings', module: 'sms', rateLimit: { max: 10, windowSec: 120 } }, async (ctx) => {
      const mobileNumber = utils.normalizeMobile(ctx.body.mobile || '');
      if (!utils.isValidMobile(mobileNumber)) ctx.fail('شماره موبایل معتبر وارد کنید');
      const conn = await ctx.sms.testConnection();
      if (!conn.ok && ctx.sms.provider === 'ippanel' && !ctx.sms.testMode) return { connection: false, error: conn.error };
      const result = await ctx.sms.sendRaw({
        to: mobileNumber,
        templateKey: 'test',
        text: ctx.body.text || `پیام آزمایشی سامانه ${ctx.config.get('app.name')} — تنظیمات پیامک صحیح است.`,
        params: { company: ctx.config.get('app.companyName', ''), date: require('../../core/jalali').formatJalali(new Date()) },
        force: true
      });
      ctx.log('sms.test', `ارسال پیام آزمایشی به ${mobileNumber}`, { entity: 'sms', meta: { ok: result.ok } });
      return { connection: conn.ok, credit: conn.credit || null, sent: result.ok, simulated: result.simulated, error: result.error || null };
    });

    api.post('/sms/send', { perm: 'sms.send', module: 'sms', rateLimit: { max: 30, windowSec: 60 } }, async (ctx) => {
      const b = ctx.body;
      const signature = modules.s('sms', 'signature', '');
      let numbers = [];
      if (Array.isArray(b.recipients)) numbers = b.recipients;
      else if (b.recipients) numbers = String(b.recipients).split(/[\s,،;]+/).filter(Boolean);

      if (b.applicationIds && Array.isArray(b.applicationIds) && b.applicationIds.length) {
        numbers = b.applicationIds.map((id) => {
          const a = ctx.col('applications').byId(id);
          return a ? require('../../core/domain').mobile(a) : '';
        }).filter(Boolean);
      }
      if (b.jobId && b.status && modules.s('sms', 'allowBulkSend', true)) {
        const list = ctx.col('applications').filter((a) => a.jobId === b.jobId && (!b.status || a.status === b.status));
        numbers = list.map((a) => require('../../core/domain').mobile(a)).filter(Boolean);
      }

      const unique = Array.from(new Set(numbers.map((n) => utils.normalizeMobile(n)).filter((n) => utils.isValidMobile(n))));
      if (!unique.length) ctx.fail('گیرنده معتبری انتخاب نشده است');
      if (unique.length > 200) ctx.fail('حداکثر ۲۰۰ گیرنده در هر ارسال مجاز است');

      let text = utils.cleanText(b.text, 500);
      if (!text) ctx.fail('متن پیام الزامی است');
      if (signature && !text.includes(signature)) text += ` ${signature}`;

      const results = [];
      for (const to of unique) {
        const r = await ctx.sms.sendRaw({ to, text, templateKey: 'manual' });
        results.push({ to, ok: r.ok, simulated: r.simulated, error: r.error || null });
      }
      ctx.log('sms.send', `ارسال پیامک گروهی به ${unique.length} گیرنده`, { entity: 'sms', meta: { sent: results.filter((r) => r.ok).length } });
      return {
        total: unique.length,
        sent: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        simulated: results.some((r) => r.simulated),
        results
      };
    });

    api.post('/sms/prune', { perm: 'sms.settings', module: 'sms' }, (ctx) => {
      const removed = ctx.sms.prune();
      ctx.log('sms.prune', `پاک‌سازی ${removed} پیام قدیمی از صندوق خروجی`, { entity: 'sms' });
      return { removed };
    });
  }
};
