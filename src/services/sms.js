// ═══════════════════════════════════════════════════════════
//  SMS Service - IPPanel Integration (Fixed)
//  Pattern-based OTP with configurable variable names
// ═══════════════════════════════════════════════════════════

const fetch = require('node-fetch');
const { getDb } = require('../database/connection');

const IPPANEL_BASE = 'https://edge.ippanel.com/v1';

// Get SMS settings from database
function getSettings() {
  const db = getDb();
  const getKey = db.prepare("SELECT setting_value FROM settings WHERE setting_key = ?");

  return {
    apiKey: getKey.get('ippanel_api_key')?.setting_value || process.env.IPPANEL_API_KEY || '',
    fromNumber: getKey.get('ippanel_from_number')?.setting_value || process.env.IPPANEL_FROM_NUMBER || '+983000505',
    patternCode: getKey.get('ippanel_pattern_code')?.setting_value || process.env.IPPANEL_PATTERN_CODE || '',
    patternVariable: getKey.get('ippanel_pattern_variable')?.setting_value || 'code',
    otpExpiry: parseInt(getKey.get('otp_expiry_minutes')?.setting_value || '3'),
    otpLength: parseInt(getKey.get('otp_length')?.setting_value || '5'),
    maxAttempts: parseInt(getKey.get('max_otp_attempts')?.setting_value || '3'),
  };
}

// Normalize Iranian phone number to E.164 format
function normalizePhone(phone) {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '98' + cleaned.substring(1);
  } else if (!cleaned.startsWith('98')) {
    cleaned = '98' + cleaned;
  }
  return '+' + cleaned;
}

// Generate OTP code
function generateOTP(length = 5) {
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  return code;
}

// Send OTP via IPPanel
async function sendOTP(phone) {
  const db = getDb();
  const settings = getSettings();

  const normalizedPhone = normalizePhone(phone);
  const code = generateOTP(settings.otpLength);
  const expiresAt = new Date(Date.now() + settings.otpExpiry * 60 * 1000).toISOString();

  db.prepare(`INSERT INTO otp_codes (phone, code, expires_at, is_used, attempts) VALUES (?, ?, ?, 0, 0)`)
    .run(normalizedPhone, code, expiresAt);

  if (!settings.apiKey) {
    console.log(`\n🔑 OTP for ${normalizedPhone}: ${code}\n`);
    return { success: true, devMode: true, code };
  }

  if (settings.patternCode) {
    try {
      const params = {};
      params[settings.patternVariable] = code;

      const requestBody = {
        sending_type: 'pattern',
        from_number: settings.fromNumber,
        code: settings.patternCode,
        recipients: [normalizedPhone],
        params: params,
      };

      console.log('📱 IPPanel Pattern SMS:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(`${IPPANEL_BASE}/api/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': settings.apiKey },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      console.log('📱 IPPanel Response:', JSON.stringify(data, null, 2));

      if (data.meta && data.meta.status) {
        return { success: true };
      } else {
        console.error('❌ IPPanel Error:', data);
        return { success: false, error: data.meta?.message || 'خطا در ارسال پیامک' };
      }
    } catch (error) {
      console.error('❌ SMS Error:', error.message);
      return { success: false, error: error.message };
    }
  }

  return await sendViaWebservice(normalizedPhone, code, settings);
}

async function sendViaWebservice(phone, code, settings) {
  try {
    const message = `کد تأیید شما: ${code}\nاین کد ${settings.otpExpiry} دقیقه معتبر است.`;
    const response = await fetch(`${IPPANEL_BASE}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': settings.apiKey },
      body: JSON.stringify({ sending_type: 'webservice', from_number: settings.fromNumber, message, params: { recipients: [phone] } }),
    });
    const data = await response.json();
    if (data.meta && data.meta.status) return { success: true };
    return { success: false, error: data.meta?.message || 'خطا در ارسال پیامک' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Verify OTP
function verifyOTP(phone, inputCode) {
  const db = getDb();
  const normalizedPhone = normalizePhone(phone);
  const settings = getSettings();

  const otp = db.prepare(`SELECT * FROM otp_codes WHERE phone = ? AND is_used = 0 ORDER BY created_at DESC LIMIT 1`).get(normalizedPhone);

  if (!otp) return { success: false, message: 'کد تأییدی برای این شماره ارسال نشده است' };
  if (otp.attempts >= settings.maxAttempts) {
    db.prepare('UPDATE otp_codes SET is_used = 1 WHERE id = ?').run(otp.id);
    return { success: false, message: 'تعداد تلاش‌های مجاز تمام شده' };
  }

  db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(otp.id);
  if (new Date(otp.expires_at) < new Date()) return { success: false, message: 'کد تأیید منقضی شده است' };
  if (otp.code !== inputCode) return { success: false, message: 'کد تأیید اشتباه است' };

  db.prepare('UPDATE otp_codes SET is_used = 1 WHERE id = ?').run(otp.id);
  return { success: true, message: 'تأیید با موفقیت انجام شد' };
}

module.exports = { sendOTP, verifyOTP, generateOTP, getSettings, normalizePhone };