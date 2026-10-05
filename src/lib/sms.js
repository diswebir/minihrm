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
 * ارسال پیامک OTP با الگوی IPPanel (Pattern SMS)
 * @param {string} phone شماره موبایل
 * @param {string} code کد یکبار مصرف
 * @param {object} opts آپشن‌ها {templateName}
 */
async function sendOtp(phone, code) {
  const cfg = getSmsConfig();
  const driver = cfg.sms_driver || 'mock';
  const to = normalizePhone(phone);
  if (!to) throw new Error('شماره موبایل نامعتبر است');

  if (driver === 'ippanel') {
    const apikey = (cfg.sms_ippanel_apikey || '').trim();
    const from = (cfg.sms_ippanel_from || '').trim();
    const pattern = (cfg.sms_ippanel_pattern_code || '').trim();
    if (!apikey || !from || !pattern) {
      throw new Error('تنظیمات پیامک IPPanel کامل نیست (کلید API، شماره فرستنده و کد الگو)');
    }
    // الگوی تایید شده در پنل IPPanel باید حداقل یک متغیر (مثلاً code) داشته باشد
    const res = await requestJson('POST', BASE_URL + '/api/send', { Authorization: apikey }, {
      sending_type: 'pattern',
      from_number: from,
      code: pattern,
      recipients: [to],
      params: { code: String(code) }
    });
    if (res.status === 401) throw new Error('کلید دسترسی IPPanel نامعتبر است');
    if (!res.body || res.body.meta?.status !== true) {
      const msg = res.body?.meta?.message || ('خطا در ارسال پیامک (کد ' + res.status + ')');
      throw new Error(msg);
    }
    return { ok: true, driver: 'ippanel', outbox: res.body.data?.message_outbox_ids || [] };
  }

  // ---- درایور آزمایشی (mock) ----
  const show = cfg.sms_mock_show === '1';
  return {
    ok: true,
    driver: 'mock',
    code: show ? String(code) : undefined,
    message: 'پیامک آزمایشی (درایور تست). کد OTP: ' + code
  };
}

/** ارسال پیامک متن ساده (اعلان‌ها) */
async function sendText(phone, text) {
  const cfg = getSmsConfig();
  const driver = cfg.sms_driver || 'mock';
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

module.exports = { sendOtp, sendText, normalizePhone, getSmsConfig };
