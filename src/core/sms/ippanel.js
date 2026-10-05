/**
 * سرویس پیامک IPPanel — بر پایه مستندات Edge API
 * https://ippanelcom.github.io/Edge-Document/docs/
 * ------------------------------------------------------------------
 *   POST {base}/api/send            → ارسال (pattern / webservice)
 *   GET  {base}/api/payment/credit/mine  → اعتبار حساب
 *   GET  {base}/api/patterns/{code}      → بررسی پترن
 *
 * احراز هویت: هدر  Authorization: <API_KEY>
 * شماره فرستنده و گیرنده در قالب E.164 (مثال: +983000505)
 */
'use strict';

const DEFAULT_BASE = 'https://edge.ippanel.com/v1';

class IPPanelError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'IPPanelError';
    this.status = status;
    this.body = body;
  }
}

class IPPanel {
  constructor({ apiKey, senderNumber, baseUrl, logger, timeoutMs = 15000 }) {
    this.apiKey = (apiKey || '').trim();
    this.senderNumber = (senderNumber || '').trim();
    this.baseUrl = (baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
    this.logger = logger;
    this.timeoutMs = timeoutMs;
  }

  get configured() { return !!this.apiKey; }

  /** فراخوانی HTTP با تایم‌اوت */
  async request(method, pathname, body) {
    const url = this.baseUrl + pathname;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Authorization': this.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
      if (!res.ok || (json && json.meta && json.meta.status === false)) {
        const msg = (json && json.meta && (json.meta.message || json.meta.message_code)) || `خطای HTTP ${res.status}`;
        throw new IPPanelError(`IPPanel: ${msg}`, { status: res.status, body: json || text });
      }
      return json;
    } catch (err) {
      if (err.name === 'AbortError') throw new IPPanelError('IPPanel: زمان انتظار پاسخ سرور پیامک به پایان رسید', { status: 408 });
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * ارسال پیامک الگو (Pattern) — روش پیشنهادی برای OTP
   * @param {string} recipient شماره گیرنده (09xxxxxxxxx یا +98...)
   * @param {string} patternCode کد پترن ثبت‌شده در پنل IPPanel
   * @param {object} params مقادیر جایگذاری‌شده در پترن
   */
  async sendPattern(recipient, patternCode, params = {}) {
    const payload = {
      sending_type: 'pattern',
      from_number: this.senderNumber,
      code: patternCode,
      recipients: [normalizeE164(recipient)],
      params: params || {}
    };
    const res = await this.request('POST', '/api/send', payload);
    return { messageId: (res && res.data && res.data.message_outbox_ids && res.data.message_outbox_ids[0]) || null, raw: res };
  }

  /** ارسال پیامک متنی ساده (Webservice) */
  async sendText(recipients, message, { sendTime } = {}) {
    const list = (Array.isArray(recipients) ? recipients : [recipients]).map(normalizeE164);
    const payload = {
      sending_type: 'webservice',
      from_number: this.senderNumber,
      message,
      params: { recipients: list }
    };
    if (sendTime) payload.send_time = sendTime;
    const res = await this.request('POST', '/api/send', payload);
    return { messageId: (res && res.data && res.data.message_outbox_ids && res.data.message_outbox_ids[0]) || null, raw: res };
  }

  /** اعتبار حساب */
  async credit() {
    const res = await this.request('GET', '/api/payment/credit/mine');
    return res && res.data ? res.data : null;
  }

  /** بررسی وجود/وضعیت یک پترن */
  async pattern(patternCode) {
    const res = await this.request('GET', `/api/patterns/${encodeURIComponent(patternCode)}`);
    return res && res.data ? res.data : null;
  }
}

/** تبدیل شماره ایرانی به قالب بین‌المللی */
function normalizeE164(number) {
  let s = String(number || '').replace(/[\u06F0-\u06F9]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[^\d+]/g, '');
  if (s.startsWith('+')) return s;
  if (s.startsWith('0098')) return '+98' + s.slice(4);
  if (s.startsWith('98') && s.length >= 12) return '+98' + s.slice(2);
  if (s.startsWith('0')) return '+98' + s.slice(1);
  if (s.startsWith('9')) return '+98' + s;
  return '+' + s;
}

module.exports = { IPPanel, IPPanelError, normalizeE164, DEFAULT_BASE };
