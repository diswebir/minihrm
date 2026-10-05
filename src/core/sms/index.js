/**
 * سرویس پیامک سامانه
 * ------------------------------------------------------------------
 * - پشتیبانی از IPPanel Edge و حالت «آزمایشی/کنسول» (بدون ارسال واقعی)
 * - همه ارسال‌ها در مجموعه sms_logs ثبت می‌شوند (صندوق خروجی)
 * - قالب‌های پیام با متغیرهایی مثل {{name}} و {{code}} قابل ویرایش در پنل هستند
 */
'use strict';

const { uid, esc, toE164, normalizeMobile } = require('../utils');
const { IPPanel } = require('./ippanel');

/** جایگذاری متغیرها در متن قالب */
function renderTemplate(text, params = {}) {
  return String(text || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key) => {
    const parts = key.split('.');
    let cur = params;
    for (const p of parts) {
      if (cur === null || cur === undefined) return '';
      cur = cur[p];
    }
    return cur === null || cur === undefined ? '' : String(cur);
  });
}

class SmsService {
  constructor({ config, db, logger }) {
    this.config = config;
    this.db = db;
    this.logger = logger;
  }

  get settings() { return this.config.get('sms', {}); }
  get templates() { return this.config.get('sms.templates', {}) || {}; }
  get provider() { return this.settings.provider || 'console'; }
  get testMode() { return this.settings.testMode !== false; }
  get isReal() { return this.provider === 'ippanel' && !!this.settings.apiKey && !this.testMode; }

  client(overrides = {}) {
    const s = Object.assign({}, this.settings, overrides);
    return new IPPanel({
      apiKey: s.apiKey,
      senderNumber: s.senderNumber,
      baseUrl: s.baseUrl,
      logger: this.logger
    });
  }

  /** متن نهایی یک قالب با جایگذاری متغیرها */
  buildText(templateKey, params = {}) {
    const tpl = this.templates[templateKey] || {};
    return renderTemplate(tpl.text || '', params);
  }

  /**
   * ارسال پیام بر اساس قالب
   * @returns {Promise<{ok:boolean, simulated:boolean, logId:string, error?:string}>}
   */
  async sendTemplate({ to, templateKey, params = {}, fallbackText = null, force = false }) {
    const tpl = this.templates[templateKey] || {};
    const text = renderTemplate(tpl.text || fallbackText || '', params);
    const patternCode = tpl.patternCode || this.settings.defaultPatternCode || '';
    return this.sendRaw({ to, text, patternCode, params, templateKey, force });
  }

  /** ارسال خام */
  async sendRaw({ to, text, patternCode = '', params = {}, templateKey = 'custom', force = false }) {
    const mobile = normalizeMobile(to);
    const log = {
      id: uid('sms'),
      to: mobile,
      toE164: toE164(mobile),
      templateKey,
      text,
      patternCode,
      params,
      provider: this.provider,
      status: 'pending',
      simulated: false,
      messageId: null,
      error: null,
      createdAt: new Date().toISOString()
    };

    if (!/^09\d{9}$/.test(mobile)) {
      log.status = 'failed';
      log.error = 'شماره گیرنده نامعتبر است';
      this.db.col('sms_logs').insert(log);
      return { ok: false, simulated: false, logId: log.id, error: log.error };
    }

    // حالت آزمایشی: بدون ارسال واقعی
    if (!force && this.testMode) {
      log.status = 'simulated';
      log.simulated = true;
      log.error = null;
      this.db.col('sms_logs').insert(log);
      if (this.logger) this.logger.info(`[پیامک-آزمایشی] به ${mobile}: ${text}`);
      return { ok: true, simulated: true, logId: log.id, text };
    }

    if (this.provider !== 'ippanel') {
      log.status = 'failed';
      log.error = 'سرویس‌دهنده پیامک تنظیم نشده است';
      this.db.col('sms_logs').insert(log);
      return { ok: false, simulated: false, logId: log.id, error: log.error };
    }

    try {
      const client = this.client();
      let result;
      if (patternCode) {
        result = await client.sendPattern(mobile, patternCode, params);
      } else {
        result = await client.sendText([mobile], text, {});
      }
      log.status = 'sent';
      log.messageId = result.messageId;
      this.db.col('sms_logs').insert(log);
      return { ok: true, simulated: false, logId: log.id, messageId: log.messageId, text };
    } catch (err) {
      log.status = 'failed';
      log.error = String(err.message || err);
      this.db.col('sms_logs').insert(log);
      if (this.logger) this.logger.warn('ارسال پیامک ناموفق:', log.error);
      return { ok: false, simulated: false, logId: log.id, error: log.error };
    }
  }

  /** ارسال کد یکبارمصرف */
  async sendOtp(mobile, code) {
    return this.sendTemplate({
      to: mobile,
      templateKey: 'otp',
      params: { code, company: this.config.get('app.companyName', '') || this.config.get('app.name', '') },
      fallbackText: `${code} کد ورود شما است.`
    });
  }

  /** اعتبار حساب پیامک (فقط IPPanel) */
  async credit() {
    if (this.provider !== 'ippanel' || !this.settings.apiKey) return null;
    try { return await this.client().credit(); } catch (e) { return { error: e.message }; }
  }

  /** تست اتصال و تنظیمات پیامک */
  async testConnection(overrides = {}) {
    const client = this.client(overrides);
    if (!client.apiKey) return { ok: false, error: 'کلید API وارد نشده است' };
    try {
      const credit = await client.credit();
      return { ok: true, credit };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /** صندوق خروجی (لاگ ارسال‌ها) */
  list({ page = 1, perPage = 30, status, to, templateKey, q } = {}) {
    let rows = this.db.col('sms_logs').all();
    if (status) rows = rows.filter((r) => r.status === status);
    if (to) rows = rows.filter((r) => String(r.to).includes(String(to)));
    if (templateKey) rows = rows.filter((r) => r.templateKey === templateKey);
    if (q) {
      const n = String(q).toLowerCase();
      rows = rows.filter((r) => [r.text, r.to, r.templateKey].join(' ').toLowerCase().includes(n));
    }
    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const total = rows.length;
    const start = (Math.max(1, page) - 1) * perPage;
    return { total, page: Number(page), perPage, rows: rows.slice(start, start + perPage), stats: this.stats() };
  }

  stats() {
    const rows = this.db.col('sms_logs').all();
    return {
      total: rows.length,
      sent: rows.filter((r) => r.status === 'sent').length,
      failed: rows.filter((r) => r.status === 'failed').length,
      simulated: rows.filter((r) => r.status === 'simulated').length,
      today: rows.filter((r) => r.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length
    };
  }

  /** پاک‌سازی لاگ قدیمی */
  prune() {
    const days = this.settings.logRetentionDays || 90;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    return this.db.col('sms_logs').removeWhere((r) => r.createdAt < cutoff);
  }
}

module.exports = { SmsService, renderTemplate };
