/**
 * مدیریت تنظیمات سامانه — data/config.json
 * ------------------------------------------------------------------
 * همه تنظیمات (سازمان، امنیت، پیامک، ماژول‌ها، پورتال) در یک فایل JSON
 * نگه‌داری می‌شود تا روی هاست اشتراکی بدون دیتابیس هم کار کند.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { deepMerge, uid, token } = require('./utils');

const DEFAULT_TEMPLATES = {
  otp: {
    title: 'کد ورود (OTP)',
    text: '{{code}} کد ورود شما به سامانه {{company}} است. این کد را در اختیار دیگران قرار ندهید.',
    patternCode: '',
    enabled: true,
    editable: false
  },
  applied: {
    title: 'تشکر از ارسال فرم استخدامی',
    text: '{{name}} عزیز، فرم استخدام شما برای موقعیت «{{job}}» با کد رهگیری {{code}} ثبت شد. با تشکر از {{company}}',
    patternCode: '',
    enabled: true
  },
  interview: {
    title: 'دعوت به مصاحبه',
    text: '{{name}} عزیز، برای مصاحبه موقعیت «{{job}}» در {{date}} ساعت {{time}} دعوت می‌شوید. {{company}}',
    patternCode: '',
    enabled: true
  },
  offers: {
    title: 'تأیید نهایی / پیشنهاد همکاری',
    text: '{{name}} عزیز، خوشحالیم که اعلام کنیم برای موقعیت «{{job}}» در {{company}} پذیرفته شدید. کارشناسان ما با شما تماس می‌گیرند.',
    patternCode: '',
    enabled: true
  },
  rejected: {
    title: 'عدم پذیرش',
    text: '{{name}} عزیز، با تشکر از زمانی که برای {{company}} گذاشتید، در این مرحله شرایط برای همکاری فراهم نشد. برای شما آرزوی موفقیت داریم.',
    patternCode: '',
    enabled: true
  },
  test: {
    title: 'پیام آزمایشی',
    text: 'پیام آزمایشی سامانه {{company}} در تاریخ {{date}} — اگر این پیام را دریافت کردید، تنظیمات پیامک درست است.',
    patternCode: '',
    enabled: false
  }
};

function defaultConfig() {
  return {
    version: 1,
    installed: false,
    installStep: 0,
    installedAt: null,
    installToken: uid('inst'),
    app: {
      name: 'مینی HRM',
      companyName: '',
      companyLegalName: '',
      logo: null,
      favicon: null,
      primaryColor: '#7C6CF0',
      baseUrl: '',
      timezone: 'Asia/Tehran',
      locale: 'fa',
      supportEmail: '',
      supportPhone: ''
    },
    security: {
      secret: token(32),
      sessionHours: 12,
      maxLoginAttempts: 5,
      lockMinutes: 15,
      otpLength: 5,
      otpTtlSec: 120,
      otpMaxPerHour: 5,
      otpPerMinute: 1,
      allowPasswordLogin: true,
      allowOtpLogin: true,
      applySessionHours: 72,
      magicLinkHours: 96,
      requireStrongPassword: true
    },
    sms: {
      provider: 'console',           // console | ippanel
      apiKey: '',
      senderNumber: '',
      defaultPatternCode: '',
      baseUrl: 'https://edge.ippanel.com/v1',
      testMode: true,                 // در حالت آزمایشی پیام واقعی ارسال نمی‌شود
      logRetentionDays: 90,
      templates: JSON.parse(JSON.stringify(DEFAULT_TEMPLATES))
    },
    modules: {},                      // { moduleKey: { enabled: bool, settings: {} } }
    publicPortal: {
      careersEnabled: true,
      pageTitle: 'فرصت‌های شغلی',
      welcomeText: 'به صفحه فرصت‌های شغلی ما خوش آمدید. می‌توانید موقعیت‌های باز را ببینید و در چند دقیقه فرایند استخدام را آغاز کنید.',
      aboutCompany: '',
      showSalary: true,
      showApplyCount: false,
      contactEmail: '',
      contactPhone: '',
      address: '',
      addressMapUrl: '',
      socials: { linkedin: '', instagram: '', telegram: '', website: '' },
      allowResumeUpload: true,
      maxFileSizeMB: 5,
      requireJobSelection: true,
      footerText: ''
    },
    updatedAt: new Date().toISOString()
  };
}

class ConfigStore {
  constructor({ root, logger }) {
    this.root = root;
    this.logger = logger;
    this.file = path.join(root, 'data', 'config.json');
    this.data = null;
  }

  load() {
    if (this.data) return this.data;
    let fileData = null;
    try {
      fileData = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (e) {
      fileData = null;
    }
    this.data = deepMerge(defaultConfig(), fileData || {});
    if (!fileData) this.save();     // ایجاد فایل پیش‌فرض
    return this.data;
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (e) {
      if (this.logger) this.logger.error('ذخیره تنظیمات ناموفق بود:', e.message);
      throw e;
    }
    return this.data;
  }

  get(key, fallback) {
    const cfg = this.load();
    if (!key) return cfg;
    const parts = String(key).split('.');
    let cur = cfg;
    for (const p of parts) {
      if (cur === null || cur === undefined) return fallback;
      cur = cur[p];
    }
    return cur === undefined ? fallback : cur;
  }

  set(key, value) {
    const cfg = this.load();
    if (typeof key === 'object' && key !== null) {
      this.data = deepMerge(cfg, key);
    } else {
      const parts = String(key).split('.');
      let cur = cfg;
      for (let i = 0; i < parts.length - 1; i++) {
        if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
    }
    this.data.updatedAt = new Date().toISOString();
    this.save();
    return this.data;
  }

  /** تنظیمات یک ماژول */
  moduleSettings(key) {
    const m = this.get(`modules.${key}`, {});
    return m.settings || {};
  }

  isModuleEnabled(key, fallback = true) {
    const m = this.get(`modules.${key}`, null);
    if (!m || m.enabled === undefined) return fallback;
    return !!m.enabled;
  }

  setModule(key, { enabled, settings }) {
    const cur = this.get(`modules.${key}`, {}) || {};
    const next = Object.assign({}, cur);
    if (enabled !== undefined) next.enabled = !!enabled;
    if (settings) next.settings = deepMerge(cur.settings || {}, settings);
    this.set(`modules.${key}`, next);
    return this.get(`modules.${key}`);
  }

  get smsTemplates() {
    return this.get('sms.templates', {});
  }

  /** آدرس پایه سایت (برای لینک‌های QR و پیامک) */
  baseUrl(req) {
    const configured = String(this.get('app.baseUrl', '') || '').trim().replace(/\/+$/, '');
    if (configured) return configured;
    if (req) {
      const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0] || (req.socket && req.socket.encrypted ? 'https' : 'http');
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
      return `${proto}://${host}`;
    }
    return '';
  }
}

module.exports = { ConfigStore, defaultConfig, DEFAULT_TEMPLATES };
