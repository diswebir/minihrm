/**
 * کد یکبارمصرف (OTP) پیامکی با محدودیت نرخ ارسال
 */
'use strict';

const crypto = require('crypto');
const { uid, numericCode, normalizeMobile, isValidMobile } = require('./utils');

function hashCode(code, secret) {
  return crypto.createHmac('sha256', String(secret || 'hrm')).update(String(code)).digest('hex');
}

class OtpService {
  constructor({ db, config, sms, logger, audit }) {
    this.db = db;
    this.config = config;
    this.sms = sms;
    this.logger = logger;
    this.audit = audit;
  }

  get col() { return this.db.col('otp_codes'); }

  /** پاک‌سازی کدهای منقضی */
  cleanup() {
    const now = Date.now();
    this.col.removeWhere((r) => new Date(r.expiresAt).getTime() < now - 3600 * 1000);
  }

  /**
   * درخواست کد جدید
   * @param {object} opts { mobile, purpose: 'login'|'apply'|'verify', ip }
   */
  async request({ mobile, purpose = 'login', ip = '' }) {
    const sec = this.config.get('security', {});
    mobile = normalizeMobile(mobile);
    if (!isValidMobile(mobile)) return { ok: false, error: 'شماره موبایل نامعتبر است. نمونه صحیح: ۰۹۱۲۳۴۵۶۷۸۹' };

    this.cleanup();
    const now = Date.now();
    const rows = this.col.filter((r) => r.mobile === mobile && r.purpose === purpose);

    // فاصله حداقلی بین دو درخواست
    const last = rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
    const perMinute = sec.otpPerMinute === undefined ? 1 : sec.otpPerMinute;
    if (last && perMinute > 0) {
      const gap = (now - new Date(last.createdAt).getTime()) / 1000;
      const wait = Math.ceil(perMinute * 60 - gap);
      if (wait > 0) return { ok: false, error: `لطفاً ${wait} ثانیه دیگر دوباره تلاش کنید.`, wait };
    }

    // سقف ارسال در ساعت
    const hourAgo = now - 3600 * 1000;
    const recent = rows.filter((r) => new Date(r.createdAt).getTime() > hourAgo).length;
    const maxPerHour = sec.otpMaxPerHour || 5;
    if (recent >= maxPerHour) {
      return { ok: false, error: 'تعداد درخواست‌های شما بیش از حد مجاز است. یک ساعت دیگر تلاش کنید.' };
    }

    const code = numericCode(sec.otpLength || 5);
    const ttl = (sec.otpTtlSec || 120) * 1000;
    // کدهای قبلی همان شماره/کاربرد باطل می‌شوند
    this.col.removeWhere((r) => r.mobile === mobile && r.purpose === purpose && !r.usedAt);

    const record = this.col.insert({
      id: uid('otp'),
      mobile,
      purpose,
      codeHash: hashCode(code, sec.secret),
      expiresAt: new Date(now + ttl).toISOString(),
      attempts: 0,
      usedAt: null,
      ip,
      createdAt: new Date().toISOString()
    });

    const result = await this.sms.sendOtp(mobile, code);
    if (!result.ok) {
      this.col.remove(record.id);
      return { ok: false, error: `ارسال پیامک ناموفق بود: ${result.error || 'خطای نامشخص'}` };
    }

    return {
      ok: true,
      ttlSec: Math.round(ttl / 1000),
      // در حالت آزمایشی، کد برای تست نمایش داده می‌شود
      devCode: result.simulated ? code : undefined,
      simulated: !!result.simulated
    };
  }

  /** بررسی کد */
  verify({ mobile, purpose = 'login', code }) {
    mobile = normalizeMobile(mobile);
    code = String(code || '').replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).trim();
    const sec = this.config.get('security', {});
    const rows = this.col.filter((r) => r.mobile === mobile && r.purpose === purpose && !r.usedAt);
    const rec = rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
    if (!rec) return { ok: false, error: 'کدی برای این شماره صادر نشده است. دوباره درخواست کد کنید.' };
    if (new Date(rec.expiresAt).getTime() < Date.now()) return { ok: false, error: 'کد وارد‌شده منقضی شده است. کد جدید درخواست کنید.' };
    if ((rec.attempts || 0) >= 5) return { ok: false, error: 'تعداد تلاش‌های ناموفق زیاد است. کد جدید درخواست کنید.' };
    if (hashCode(code, sec.secret) !== rec.codeHash) {
      this.col.update(rec.id, { attempts: (rec.attempts || 0) + 1 });
      return { ok: false, error: 'کد وارد‌شده نادرست است.' };
    }
    this.col.update(rec.id, { usedAt: new Date().toISOString() });
    return { ok: true };
  }
}

module.exports = { OtpService, hashCode };
