// ═══════════════════════════════════════════════════════════
//  SMS Service - IPPanel Integration
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
    otpExpiry: parseInt(getKey.get('otp_expiry_minutes')?.setting_value || '3'),
    otpLength: parseInt(getKey.get('otp_length')?.setting_value || '5'),
    maxAttempts: parseInt(getKey.get('max_otp_attempts')?.setting_value || '3'),
  };
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

// Send OTP via IPPanel Pattern SMS
async function sendOTP(phone) {
  const db = getDb();
  const settings = getSettings();

  // Normalize phone number
  let normalizedPhone = phone.replace(/\D/g, '');
  if (normalizedPhone.startsWith('0')) {
    normalizedPhone = '+98' + normalizedPhone.substring(1);
  } else if (!normalizedPhone.startsWith('+')) {
    normalizedPhone = '+98' + normalizedPhone;
  }

  // Generate OTP
  const code = generateOTP(settings.otpLength);
  const expiresAt = new Date(Date.now() + settings.otpExpiry * 60 * 1000).toISOString();

  // Save OTP to database
  db.prepare(`
    INSERT INTO otp_codes (phone, code, expires_at, is_used, attempts) VALUES (?, ?, ?, 0, 0)
  `).run(normalizedPhone, code, expiresAt);

  // Check if we have API key configured
  if (!settings.apiKey) {
    // Development mode - log OTP
    console.log(`\n🔑 OTP for ${normalizedPhone}: ${code}\n`);
    return { success: true, devMode: true, code };
  }

  // Send via IPPanel Pattern SMS
  try {
    if (settings.patternCode) {
      // Use pattern SMS
      const response = await fetch(`${IPPANEL_BASE}/api/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': settings.apiKey,
        },
        body: JSON.stringify({
          sending_type: 'pattern',
          from_number: settings.fromNumber,
          code: settings.patternCode,
          recipients: [normalizedPhone],
          params: { code: code },
        }),
      });

      const data = await response.json();

      if (data.meta && data.meta.status) {
        return { success: true };
      } else {
        console.error('IPPanel Pattern SMS Error:', data);
        // Fallback to webservice
        return await sendViaWebservice(normalizedPhone, code, settings);
      }
    } else {
      // Use webservice SMS
      return await sendViaWebservice(normalizedPhone, code, settings);
    }
  } catch (error) {
    console.error('SMS send error:', error);
    // In case of error, still save the OTP for dev/testing
    return { success: true, devMode: true, code, error: error.message };
  }
}

// Send via Webservice SMS (fallback)
async function sendViaWebservice(phone, code, settings) {
  try {
    const message = `کد تأیید شما: ${code}\nاین کد ${settings.otpExpiry} دقیقه معتبر است.\n${settings.companyName || 'سامانه استخدام'}`;

    const response = await fetch(`${IPPANEL_BASE}/api/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': settings.apiKey,
      },
      body: JSON.stringify({
        sending_type: 'webservice',
        from_number: settings.fromNumber,
        message: message,
        params: {
          recipients: [phone],
        },
      }),
    });

    const data = await response.json();

    if (data.meta && data.meta.status) {
      return { success: true };
    } else {
      console.error('IPPanel Webservice SMS Error:', data);
      return { success: false, error: data.meta?.message || 'خطا در ارسال پیامک' };
    }
  } catch (error) {
    console.error('Webservice SMS error:', error);
    return { success: false, error: error.message };
  }
}

// Verify OTP
function verifyOTP(phone, inputCode) {
  const db = getDb();

  // Normalize phone
  let normalizedPhone = phone.replace(/\D/g, '');
  if (normalizedPhone.startsWith('0')) {
    normalizedPhone = '+98' + normalizedPhone.substring(1);
  } else if (!normalizedPhone.startsWith('+')) {
    normalizedPhone = '+98' + normalizedPhone;
  }

  const settings = getSettings();

  // Find latest unused OTP for this phone
  const otp = db.prepare(`
    SELECT * FROM otp_codes
    WHERE phone = ? AND is_used = 0
    ORDER BY created_at DESC LIMIT 1
  `).get(normalizedPhone);

  if (!otp) {
    return { success: false, message: 'کد تأییدی برای این شماره ارسال نشده است' };
  }

  // Check attempts
  if (otp.attempts >= settings.maxAttempts) {
    db.prepare('UPDATE otp_codes SET is_used = 1 WHERE id = ?').run(otp.id);
    return { success: false, message: 'تعداد تلاش‌های مجاز تمام شده. لطفاً کد جدید دریافت کنید' };
  }

  // Increment attempts
  db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(otp.id);

  // Check expiry
  if (new Date(otp.expires_at) < new Date()) {
    return { success: false, message: 'کد تأیید منقضی شده است' };
  }

  // Check code
  if (otp.code !== inputCode) {
    return { success: false, message: 'کد تأیید اشتباه است' };
  }

  // Mark as used
  db.prepare('UPDATE otp_codes SET is_used = 1 WHERE id = ?').run(otp.id);

  return { success: true, message: 'تأیید با موفقیت انجام شد' };
}

module.exports = { sendOTP, verifyOTP, generateOTP, getSettings };