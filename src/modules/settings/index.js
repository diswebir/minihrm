/**
 * ماژول تنظیمات سامانه (عمومی، برندینگ، ماژول‌ها، پشتیبان‌گیری، وضعیت سیستم)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const utils = require('../../core/utils');

module.exports = {
  key: 'settings',
  title: 'تنظیمات سامانه',
  description: 'تنظیمات عمومی، برندینگ، ماژول‌ها، پشتیبان‌گیری و وضعیت سیستم.',
  icon: 'settings',
  order: 90,
  core: true,
  defaultEnabled: true,

  permissions: [
    { key: 'settings.view', title: 'مشاهده تنظیمات', group: 'تنظیمات' },
    { key: 'settings.manage', title: 'ویرایش تنظیمات عمومی و امنیتی', group: 'تنظیمات' },
    { key: 'settings.modules', title: 'فعال/غیرفعال‌سازی و تنظیم ماژول‌ها', group: 'تنظیمات' },
    { key: 'settings.branding', title: 'ویرایش برندینگ و لوگو', group: 'تنظیمات' },
    { key: 'settings.portal', title: 'تنظیمات پورتال استخدام', group: 'تنظیمات' },
    { key: 'settings.backup', title: 'پشتیبان‌گیری و بازیابی داده‌ها', group: 'تنظیمات' },
    { key: 'settings.system', title: 'مشاهده وضعیت و نگهداری سیستم', group: 'تنظیمات' }
  ],

  nav: [
    { path: '/settings', title: 'تنظیمات', icon: 'settings', perm: 'settings.view', order: 90 }
  ],

  api(api, app) {
    const modules = app.modules;

    const maskSms = (sms) => Object.assign({}, sms, {
      apiKey: sms.apiKey ? `${String(sms.apiKey).slice(0, 4)}••••••${String(sms.apiKey).slice(-4)}` : '',
      hasApiKey: !!sms.apiKey
    });

    api.get('/settings', { perm: 'settings.view', module: 'settings' }, (ctx) => {
      const cfg = ctx.config.load();
      return {
        app: cfg.app,
        publicPortal: cfg.publicPortal,
        security: Object.assign({}, cfg.security, { secret: undefined }),
        sms: maskSms(cfg.sms),
        modules: modules.info(),
        system: systemInfo(app)
      };
    });

    api.put('/settings/general', { perm: 'settings.manage', module: 'settings' }, (ctx) => {
      const b = ctx.body;
      const patch = {};
      const check = (key, val, label) => { if (val !== undefined) patch[key] = utils.cleanText(val, 200); };
      check('name', b.name); check('companyName', b.companyName); check('companyLegalName', b.companyLegalName);
      check('baseUrl', b.baseUrl); check('supportEmail', b.supportEmail); check('supportPhone', b.supportPhone);
      if (b.timezone !== undefined) {
        const tz = utils.cleanText(b.timezone, 60);
        if (/^[A-Za-z]+\/[A-Za-z_+\-0-9]+$/.test(tz)) patch.timezone = tz;
      }
      if (b.locale !== undefined) {
        const loc = utils.cleanText(b.locale, 12);
        if (['fa-IR', 'fa', 'en-US', 'en-GB', 'en'].includes(loc)) patch.locale = loc;
      }
      if (b.primaryColor !== undefined) patch.primaryColor = /^#[0-9a-fA-F]{6}$/.test(b.primaryColor) ? b.primaryColor : '#7C6CF0';
      if (patch.baseUrl) patch.baseUrl = patch.baseUrl.replace(/\/+$/, '');
      ctx.config.set('app', patch);
      ctx.log('settings.update', 'به‌روزرسانی تنظیمات عمومی سامانه', { entity: 'settings', meta: patch });
      return { app: ctx.config.get('app') };
    });

    api.put('/settings/security', { perm: 'settings.manage', module: 'settings' }, (ctx) => {
      const b = ctx.body;
      const patch = {};
      const num = (key, min, max) => {
        if (b[key] === undefined) return;
        const v = Number(b[key]);
        if (!isNaN(v)) patch[key] = Math.min(max, Math.max(min, v));
      };
      num('sessionHours', 1, 720); num('maxLoginAttempts', 3, 20); num('lockMinutes', 1, 1440);
      num('otpLength', 4, 8); num('otpTtlSec', 60, 900); num('otpMaxPerHour', 1, 50); num('otpPerMinute', 0, 10);
      num('applySessionHours', 1, 720); num('magicLinkHours', 1, 720);
      for (const key of ['allowPasswordLogin', 'allowOtpLogin', 'requireStrongPassword']) {
        if (b[key] !== undefined) patch[key] = !!b[key];
      }
      if (patch.allowPasswordLogin === false && patch.allowOtpLogin === false) ctx.fail('حداقل یکی از روش‌های ورود باید فعال باشد');
      ctx.config.set('security', patch);
      ctx.log('settings.security', 'به‌روزرسانی تنظیمات امنیتی', { entity: 'settings', meta: patch, level: 'warn' });
      return { security: Object.assign({}, ctx.config.get('security'), { secret: undefined }) };
    });

    api.put('/settings/portal', { perm: 'settings.portal', module: 'settings' }, (ctx) => {
      const b = ctx.body;
      const patch = {};
      const str = ['pageTitle', 'welcomeText', 'aboutCompany', 'contactEmail', 'contactPhone', 'address', 'addressMapUrl', 'footerText'];
      for (const key of str) if (b[key] !== undefined) patch[key] = utils.cleanText(b[key], 4000);
      for (const key of ['careersEnabled', 'showSalary', 'showApplyCount', 'allowResumeUpload']) {
        if (b[key] !== undefined) patch[key] = !!b[key];
      }
      if (b.maxFileSizeMB !== undefined) patch.maxFileSizeMB = Math.min(20, Math.max(1, Number(b.maxFileSizeMB) || 5));
      if (b.socials) patch.socials = Object.assign({}, ctx.config.get('publicPortal.socials', {}), utils.pick(b.socials, ['linkedin', 'instagram', 'telegram', 'website']));
      ctx.config.set('publicPortal', patch);
      ctx.log('settings.portal', 'به‌روزرسانی تنظیمات پورتال استخدام', { entity: 'settings', meta: patch });
      return { publicPortal: ctx.config.get('publicPortal') };
    });

    /** آپلود لوگو (multipart) */
    api.post('/settings/logo', { perm: 'settings.branding', module: 'settings' }, (ctx) => {
      const file = ctx.files.find((f) => f.field === 'logo') || ctx.files[0];
      if (!file) ctx.fail('فایلی ارسال نشده است');
      const saved = ctx.app.upload.saveUpload(file, {
        root: app.root, dir: 'branding', allowed: ['png', 'jpg', 'jpeg', 'webp', 'svg'], maxBytes: 2 * 1024 * 1024, prefix: 'logo'
      });
      ctx.config.set('app.logo', saved.path);
      ctx.log('settings.logo', 'به‌روزرسانی لوگوی سامانه', { entity: 'settings' });
      return { logo: saved.path };
    });

    api.delete('/settings/logo', { perm: 'settings.branding', module: 'settings' }, (ctx) => {
      ctx.config.set('app.logo', null);
      return { logo: null };
    });

    // ---------------------------------------------------------- ماژول‌ها
    api.get('/settings/modules', { perm: 'settings.view', module: 'settings' }, (ctx) => ({
      modules: modules.info(),
      errors: modules.errors
    }));

    api.post('/settings/modules/:key/toggle', { perm: 'settings.modules', module: 'settings' }, async (ctx) => {
      const { key } = ctx.params;
      const enabled = ctx.body.enabled !== undefined ? !!ctx.body.enabled : !modules.isEnabled(key);
      const res = await modules.toggle(key, enabled, ctx.user);
      ctx.log(enabled ? 'module.enable' : 'module.disable', `${enabled ? 'فعال‌سازی' : 'غیرفعال‌سازی'} ماژول ${key}`, { entity: 'module', entityId: key, level: 'warn' });
      return { key, enabled, modules: modules.info(), installResult: res.installResult };
    });

    api.put('/settings/modules/:key', { perm: 'settings.modules', module: 'settings' }, (ctx) => {
      const values = modules.setSettings(ctx.params.key, ctx.body.settings || {}, ctx.user);
      return { settings: values, modules: modules.info() };
    });

    // ---------------------------------------------------------- سیستم و نگهداری
    api.get('/settings/system', { perm: 'settings.system', module: 'settings' }, () => systemInfo(app));

    api.post('/settings/maintenance', { perm: 'settings.system', module: 'settings' }, (ctx) => {
      const task = ctx.body.task;
      let result = {};
      if (task === 'prune_audit') result.removed = ctx.audit.prune(Number(ctx.body.days || 180));
      else if (task === 'prune_sms') result.removed = ctx.sms.prune();
      else if (task === 'prune_sessions') result.removed = ctx.col('sessions').removeWhere((s) => new Date(s.expiresAt).getTime() < Date.now());
      else if (task === 'prune_otp') result.removed = ctx.col('otp_codes').removeWhere((r) => new Date(r.expiresAt).getTime() < Date.now() - 3600000);
      else ctx.fail('عملیات نگهداری نامعتبر است');
      ctx.log('system.maintenance', `اجرای نگهداری: ${task}`, { entity: 'system', meta: result });
      return result;
    });

    // ---------------------------------------------------------- پشتیبان‌گیری
    api.get('/settings/backup', { perm: 'settings.backup', module: 'settings' }, (ctx) => {
      const bundle = ctx.db.exportAll();
      bundle.meta = {
        app: ctx.config.get('app.name'),
        company: ctx.config.get('app.companyName'),
        version: app.version,
        node: process.version,
        createdBy: ctx.user.name,
        counts: ctx.db.stats()
      };
      ctx.log('backup.create', 'تهیه فایل پشتیبان از داده‌ها', { entity: 'system' });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      ctx.req.__res.jsonDownload(bundle, `minihrm-backup-${stamp}.json`);
      return undefined;
    });

    api.post('/settings/restore', { perm: 'settings.backup', module: 'settings' }, (ctx) => {
      const file = ctx.files.find((f) => f.field === 'backup') || ctx.files[0];
      let bundle = null;
      if (file) {
        try { bundle = JSON.parse(file.buffer.toString('utf8')); }
        catch (e) { ctx.fail('فایل پشتیبان معتبر نیست'); }
      } else if (ctx.body.bundle) {
        bundle = typeof ctx.body.bundle === 'string' ? JSON.parse(ctx.body.bundle) : ctx.body.bundle;
      }
      if (!bundle || !bundle.collections) ctx.fail('ساختار فایل پشتیبان نامعتبر است');
      const mode = ctx.body.mode === 'merge' ? 'merge' : 'replace';
      ctx.db.importAll(bundle, { replace: mode === 'replace' });
      ctx.log('backup.restore', `بازیابی داده‌ها (${mode === 'replace' ? 'جایگزینی کامل' : 'ادغام'})`, { entity: 'system', meta: { counts: Object.fromEntries(Object.entries(bundle.collections).map(([k, v]) => [k, v.length])) }, level: 'warn' });
      return { restored: true, mode, collections: Object.keys(bundle.collections).length };
    });

    // ---------------------------------------------------------- اطلاعات پایه برای UI
    api.get('/settings/options', { perm: 'settings.view', module: 'settings' }, (ctx) => ({
      modules: modules.info(),
      roles: ctx.rbac.roleOptions(),
      permissions: ctx.rbac.permissionGroups(),
      statuses: require('../../core/domain').APPLICATION_STATUSES,
      fieldTemplates: require('../../core/seed/form').FIELD_TEMPLATES,
      smsTemplates: Object.entries(ctx.config.get('sms.templates', {})).map(([key, t]) => ({
        key, title: t.title, text: t.text, patternCode: t.patternCode, enabled: t.enabled !== false, editable: t.editable !== false
      }))
    }));
  }
};

/** اطلاعات وضعیت سیستم */
function systemInfo(app) {
  let dataSize = 0;
  let files = 0;
  const walk = (dir) => {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else { try { dataSize += fs.statSync(p).size; files++; } catch (e) { /* ignore */ } }
      }
    } catch (e) { /* ignore */ }
  };
  walk(path.join(app.root, 'data'));
  const mem = process.memoryUsage();
  return {
    version: app.version,
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    uptimeSec: Math.round(process.uptime()),
    memoryMB: Math.round(mem.rss / 1048576),
    dataSize: utils.formatBytes(dataSize),
    dataFiles: files,
    collections: app.db.stats(),
    installedAt: app.config.get('installedAt'),
    smsProvider: app.config.get('sms.provider'),
    smsTestMode: !!app.config.get('sms.testMode'),
    time: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV || 'production',
    port: process.env.PORT || process.env.NODE_PORT || '3000'
  };
}
