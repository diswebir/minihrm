'use strict';
/**
 * درایور پیامک — IPPanel Edge API (مطابق مستندات رسمی) + درایور آزمایشی
 * مستندات: https://ippanelcom.github.io/Edge-Document/docs/
 * ارسال OTP با الگو (Pattern):  POST {base}/api/send   sending_type=pattern
 * ارسال متن ساده (Webservice):  POST {base}/api/send   sending_type=webservice
 */
const db = require('../db');
const https = require('https');
const { URL } = require('url');

const BASE_URL = 'https://edge.ippanel.com/v1';

function getSmsConfig() {
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'sms_%' OR key IN ('otp_length','otp_expiry_seconds','otp_resend_seconds','otp_max_attempts','company_name')").all();
  const cfg = {};
  for (const r of rows) cfg[r.key] = r.value;
  return cfg;
}

function requestJson(method, urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method,
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': payload ? Buffer.byteLength(payload) : 0
      }, headers || {})
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) { /* ignore */ }
        resolve({ status: res.statusCode, body: json, raw: data });
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(new Error('timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

/** شماره موبایل به فرمت E.164 (+98...) */
function normalizePhone(phone) {
  let p = String(phone || '').replace(/[^\d+]/g, '');
  p = p.replace(/^\+?00/, '+');
  if (p.startsWith('0')) p = '+98' + p.slice(1);
  else if (p.startsWith('98') && !p.startsWith('+')) p = '+' + p;
  else if (/^\d{10}$/.test(p)) p = '+98' + p;
  if (!/^\+989\d{9}$/.test(p)) return null;
  return p;
}

/**
 * نرمال‌سازی نام متغیر پترن (جای‌نگهدار کد OTP در پیامک الگو)
 * کاربر ممکن است در پترن خود متغیر را «otp» یا هر نام دیگری گذاشته باشد؛
 * مقدار مجاز: حروف/اعداد/زیرخط بدون فاصله و بدون آکولاد — پیش‌فرض: code
 */
function sanitizePatternVar(v) {
  let s = String(v || '').trim();
  // اگر کاربر مقدار را با آکولاد وارد کرده ({otp}) فقط آکولادهای احاطه‌گر حذف می‌شوند
  s = s.replace(/^\{(.+)\}$/, '$1').trim();
  return /^[a-zA-Z0-9_]{1,40}$/.test(s) ? s : 'code';
}

/**
 * «نمایش کد OTP در حالت آزمایشی» (sms_mock_show) کلید قطع ارسال پیامک از پنل است:
 * وقتی فعال باشد (پیش‌فرض)، هیچ پیامکی — کد تایید، اطلاع‌رسانی یا تاییدیه —
 * از طریق پنل پیامکی ارسال نمی‌شود و همه ارسال‌ها به‌صورت آزمایشی انجام می‌شوند.
 */
function isTestMode(cfg) {
  return (cfg.sms_mock_show === undefined ? '1' : String(cfg.sms_mock_show)) === '1';
}

/**
 * ارسال عمومی پیامک الگو (Pattern) با نگاشت متغیرها به نام‌های تعریف‌شده کاربر
 * @param {string} phone شماره مقصد
 * @param {string} patternCode کد الگوی تأییدشده در پنل پیامکی
 * @param {object} params نگاشت {نام‌متغیر-پیش‌فرض: مقدار} مثلاً {code:'12345'}
 * @param {object} varMap نگاشت نام متغیرها در پترن کاربر {code:'otp'}
 */
async function sendPattern(phone, patternCode, params, varMap) {
  const cfg = getSmsConfig();
  // حالت آزمایشی ⇒ مسیر درگاه کلاً قطع می‌شود
  const driver = isTestMode(cfg) ? 'mock' : (cfg.sms_driver || 'mock');
  const to = normalizePhone(phone);
  if (!to) throw new Error('شماره موبایل نامعتبر است');

  const mapped = {};
  for (const [k, v] of Object.entries(params || {})) {
    mapped[sanitizePatternVar((varMap || {})[k] || k)] = String(v);
  }

  if (driver === 'ippanel') {
    const apikey = (cfg.sms_ippanel_apikey || '').trim();
    const from = (cfg.sms_ippanel_from || '').trim();
    const pattern = String(patternCode || '').trim();
    if (!apikey || !from || !pattern) {
      throw new Error('تنظیمات پیامک IPPanel کامل نیست (کلید API، شماره فرستنده و کد الگو)');
    }
    const res = await requestJson('POST', BASE_URL + '/api/send', { Authorization: apikey }, {
      sending_type: 'pattern',
      from_number: from,
      code: pattern,
      recipients: [to],
      params: mapped
    });
    if (res.status === 401) throw new Error('کلید دسترسی IPPanel نامعتبر است');
    if (!res.body || res.body.meta?.status !== true) {
      const msg = res.body?.meta?.message || ('خطا در ارسال پیامک (کد ' + res.status + ')');
      throw new Error(msg);
    }
    return { ok: true, driver: 'ippanel', outbox: res.body.data?.message_outbox_ids || [] };
  }

  // ---- درایور آزمایشی (mock) ----
  return {
    ok: true,
    driver: 'mock',
    params: mapped,
    message: 'پیامک آزمایشی: ' + JSON.stringify(mapped)
  };
}

/**
 * ارسال پیامک OTP با الگوی IPPanel (Pattern SMS)
 * @param {string} phone شماره موبایل
 * @param {string} code کد یکبار مصرف
 */
async function sendOtp(phone, code) {
  const cfg = getSmsConfig();
  const pattern = (cfg.sms_ippanel_pattern_code || '').trim();
  const patternVar = sanitizePatternVar(cfg.sms_pattern_var);
  const res = await sendPattern(phone, pattern, { [patternVar]: String(code) }, {});
  if (res.driver === 'mock') {
    // در حالت آزمایشی/درایور تست، کد OTP برای نمایش روی صفحه برمی‌گردد
    res.code = String(code);
    res.message = 'پیامک آزمایشی (درایور تست). کد OTP: ' + code;
  }
  return res;
}

/**
 * اطلاع‌رسانی «متقاضی جدید» به شماره‌های تیم منابع انسانی (پترن مجزا)
 * @returns {Promise<{sent: number, failed: number, messages: string[]}>}
 */
async function notifyNewApplicant(applicant, positionTitle) {
  const cfg = getSmsConfig();
  const out = { sent: 0, failed: 0, messages: [] };
  if (cfg.sms_notify_enabled !== '1') return out;
  const pattern = (cfg.sms_notify_pattern || '').trim();
  const recipients = String(cfg.sms_notify_recipients || '')
    .split(/[,،\n]/).map(s => s.trim()).filter(Boolean);
  if (!pattern || recipients.length === 0) return out;

  const params = {
    name: ((applicant.first_name || '') + ' ' + (applicant.last_name || '')).trim() || applicant.tracking_code,
    position: positionTitle || '—',
    tracking: applicant.tracking_code
  };
  const varMap = {
    name: cfg.sms_notify_var_name,
    position: cfg.sms_notify_var_position,
    tracking: cfg.sms_notify_var_tracking
  };
  for (const r of recipients) {
    try {
      await sendPattern(r, pattern, params, varMap);
      out.sent++;
    } catch (e) {
      out.failed++;
      out.messages.push(String(r) + ': ' + e.message);
    }
  }
  return out;
}

/** پیام تأیید ثبت‌نام فرم به خود متقاضی (پترن مجزا) */
async function notifyApplicantConfirmation(applicant, positionTitle) {
  const cfg = getSmsConfig();
  if (cfg.sms_confirm_enabled !== '1') return { sent: 0, failed: 0, messages: [] };
  const pattern = (cfg.sms_confirm_pattern || '').trim();
  if (!pattern) return { sent: 0, failed: 0, messages: [] };
  const params = {
    name: ((applicant.first_name || '') + ' ' + (applicant.last_name || '')).trim() || applicant.tracking_code,
    tracking: applicant.tracking_code
  };
  const varMap = { name: cfg.sms_confirm_var_name, tracking: cfg.sms_confirm_var_tracking };
  try {
    await sendPattern(applicant.phone, pattern, params, varMap);
    return { sent: 1, failed: 0, messages: [] };
  } catch (e) {
    return { sent: 0, failed: 1, messages: [e.message] };
  }
}

/** ارسال پیامک متن ساده (اعلان‌ها) */
async function sendText(phone, text) {
  const cfg = getSmsConfig();
  // حالت آزمایشی ⇒ مسیر درگاه کلاً قطع می‌شود
  const driver = isTestMode(cfg) ? 'mock' : (cfg.sms_driver || 'mock');
  const to = normalizePhone(phone);
  if (!to) throw new Error('شماره موبایل نامعتبر است');
  if (driver === 'ippanel') {
    const apikey = (cfg.sms_ippanel_apikey || '').trim();
    const from = (cfg.sms_ippanel_from || '').trim();
    if (!apikey || !from) throw new Error('تنظیمات پیامک IPPanel کامل نیست');
    const res = await requestJson('POST', BASE_URL + '/api/send', { Authorization: apikey }, {
      sending_type: 'webservice',
      from_number: from,
      message: String(text),
      params: { recipients: [to] }
    });
    if (!res.body || res.body.meta?.status !== true) {
      throw new Error(res.body?.meta?.message || 'خطا در ارسال پیامک');
    }
    return { ok: true, driver: 'ippanel' };
  }
  return { ok: true, driver: 'mock', message: text };
}

module.exports = { sendOtp, sendText, sendPattern, notifyNewApplicant, notifyApplicantConfirmation, normalizePhone, getSmsConfig, sanitizePatternVar };
