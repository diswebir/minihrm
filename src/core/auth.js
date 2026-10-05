/**
 * احراز هویت و مدیریت نشست‌ها
 * ------------------------------------------------------------------
 * دو نوع نشست داریم:
 *   1) کاربران سامانه (پنل مدیریت/کارمندی)  subjectType: 'user'
 *   2) متقاضیان استخدام (پورتال عمومی)       subjectType: 'applicant'
 * ورود با «رمز عبور» یا «کد یکبارمصرف پیامکی (OTP)» یا «لینک دعوت/شروع فرم».
 */
'use strict';

const { uid, token, hashPassword, verifyPassword, normalizeMobile, isValidMobile, isEmail, passwordStrength, cleanText } = require('./utils');

const COOKIE_ADMIN = 'hrm_sid';
const COOKIE_APPLY = 'hrm_apply';

class Auth {
  constructor({ db, config, logger, audit }) {
    this.db = db;
    this.config = config;
    this.logger = logger;
    this.audit = audit;
    this._lastCleanup = 0;
  }

  // ------------------------------------------------------------ نشست‌ها

  parseCookies(req) {
    const header = req.headers.cookie || '';
    const out = {};
    header.split(';').forEach((part) => {
      const idx = part.indexOf('=');
      if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    });
    return out;
  }

  createSession({ subjectType, subjectId, req, hours = null, meta = {} }) {
    const cfg = this.config.get('security', {});
    const ttlHours = hours || (subjectType === 'applicant' ? (cfg.applySessionHours || 72) : (cfg.sessionHours || 12));
    const session = {
      id: token(24),
      subjectType,
      subjectId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlHours * 3600 * 1000).toISOString(),
      ip: req ? (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress : '',
      ua: req ? String(req.headers['user-agent'] || '').slice(0, 200) : '',
      meta
    };
    this.db.col('sessions').insert(session);
    this._cleanup();
    return session;
  }

  /** خواندن نشست از درخواست */
  sessionFromRequest(req) {
    if (req.__session !== undefined) return req.__session;
    const cookies = this.parseCookies(req);
    const raw = cookies[COOKIE_ADMIN] || cookies[COOKIE_APPLY];
    const explicit = req.query && (req.query._sid || req.query.sid);
    const sid = raw || explicit;
    if (!sid) { req.__session = null; return null; }
    const s = this.db.col('sessions').byId(sid);
    if (!s) { req.__session = null; return null; }
    if (new Date(s.expiresAt).getTime() < Date.now()) {
      this.db.col('sessions').remove(s.id);
      req.__session = null;
      return null;
    }
    req.__session = s;
    req.__sessionId = s.id;
    return s;
  }

  sessionCookie(subjectType) {
    return subjectType === 'applicant' ? COOKIE_APPLY : COOKIE_ADMIN;
  }

  cookieHeader(session) {
    const name = this.sessionCookie(session.subjectType);
    const maxAge = Math.max(0, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
    const secure = this.config.get('app.baseUrl', '').startsWith('https') ? '; Secure' : '';
    return `${name}=${encodeURIComponent(session.id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
  }

  clearCookieHeader(subjectType) {
    const name = this.sessionCookie(subjectType);
    return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }

  destroySession(sid) {
    const col = this.db.col('sessions');
    if (col.byId(sid)) col.remove(sid);
  }

  destroyUserSessions(userId) {
    this.db.col('sessions').removeWhere((s) => s.subjectType === 'user' && s.subjectId === userId);
  }

  _cleanup() {
    if (Date.now() - this._lastCleanup < 5 * 60 * 1000) return;
    this._lastCleanup = Date.now();
    const col = this.db.col('sessions');
    const now = Date.now();
    col.removeWhere((s) => new Date(s.expiresAt).getTime() < now);
  }

  // ------------------------------------------------------------ کاربران

  users() { return this.db.col('users'); }

  /** کاربر جاری به‌همراه نقش‌ها/مجوزها */
  currentUser(req, rbac) {
    const session = this.sessionFromRequest(req);
    if (!session || session.subjectType !== 'user') return null;
    const user = this.users().byId(session.subjectId);
    if (!user || user.status === 'disabled') return null;
    return this.decorate(user, rbac);
  }

  /** متقاضی جاری (پورتال استخدام) */
  currentApplicant(req) {
    const session = this.sessionFromRequest(req);
    if (!session || session.subjectType !== 'applicant') return null;
    const applicant = this.db.col('applicants').byId(session.subjectId);
    if (!applicant) return null;
    return { applicant, session };
  }

  decorate(user, rbac) {
    const out = Object.assign({}, user);
    out._roles = rbac ? rbac.rolesOf(user) : [];
    out._perms = rbac ? rbac.effectivePermissions(user) : [];
    out.isSuperAdmin = out._roles.some((r) => r.key === 'super_admin') || (user.roleKeys || []).includes('super_admin');
    return out;
  }

  findUserByLogin(login) {
    const col = this.users();
    const raw = String(login || '').trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    const mobile = normalizeMobile(raw);
    return col.find((u) =>
      (u.mobile && normalizeMobile(u.mobile) === mobile && isValidMobile(raw)) ||
      (u.username && String(u.username).toLowerCase() === lower) ||
      (u.email && String(u.email).toLowerCase() === lower)
    ) || null;
  }

  /** ورود با رمز عبور */
  loginWithPassword({ login, password, req }) {
    const sec = this.config.get('security', {});
    const user = this.findUserByLogin(login);
    if (!user) return { ok: false, error: 'نام کاربری یا رمز عبور نادرست است.', code: 'invalid' };
    if (user.status === 'disabled') return { ok: false, error: 'حساب کاربری شما غیرفعال است. با مدیر سامانه تماس بگیرید.', code: 'disabled' };
    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      const mins = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
      return { ok: false, error: `به دلیل تلاش‌های ناموفق، حساب کاربری موقتاً قفل است. ${mins} دقیقه دیگر تلاش کنید.`, code: 'locked' };
    }
    if (!verifyPassword(password, user.passwordHash)) {
      const attempts = (user.failedAttempts || 0) + 1;
      const patch = { failedAttempts: attempts, lastFailedAt: new Date().toISOString() };
      if (attempts >= (sec.maxLoginAttempts || 5)) {
        patch.lockedUntil = new Date(Date.now() + (sec.lockMinutes || 15) * 60000).toISOString();
        patch.failedAttempts = 0;
      }
      this.users().update(user.id, patch);
      if (this.audit) this.audit.log({ action: 'auth.login_failed', entity: 'user', entityId: user.id, title: `تلاش ناموفق ورود برای «${user.name || user.mobile}»`, req, level: 'warn' });
      return { ok: false, error: 'نام کاربری یا رمز عبور نادرست است.', code: 'invalid' };
    }
    this.users().update(user.id, { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date().toISOString(), lastLoginIp: req ? req.socket.remoteAddress : '' });
    return { ok: true, user: this.users().byId(user.id) };
  }

  /** ورود/ورود خودکار بر اساس موبایل تأییدشده (بعد از OTP) */
  loginByMobile(mobile, { req }) {
    const user = this.findUserByLogin(mobile);
    if (!user) return { ok: false, error: 'کاربری با این شماره موبایل در سامانه ثبت نشده است.', code: 'notfound' };
    if (user.status === 'disabled') return { ok: false, error: 'حساب کاربری شما غیرفعال است.', code: 'disabled' };
    this.users().update(user.id, { lastLoginAt: new Date().toISOString(), failedAttempts: 0, lockedUntil: null });
    return { ok: true, user: this.users().byId(user.id) };
  }

  /** ثبت نام کاربر جدید */
  createUser({ name, mobile, email, username, password, roleIds, status = 'active', mustChangePassword = false, createdBy = null, employee = null, autoPassword = false }, rbac) {
    name = cleanText(name, 120);
    mobile = normalizeMobile(mobile);
    if (!name) throw new Error('نام و نام خانوادگی الزامی است');
    if (!mobile && !email && !username) throw new Error('برای کاربر باید شماره موبایل، ایمیل یا نام کاربری وارد کنید');
    if (mobile && !isValidMobile(mobile)) throw new Error('شماره موبایل نامعتبر است (نمونه صحیح: 09123456789)');
    if (email && !isEmail(email)) throw new Error('ایمیل نامعتبر است');
    const col = this.users();
    if (mobile && col.find((u) => normalizeMobile(u.mobile) === mobile)) throw new Error('کاربری با این شماره موبایل از قبل ثبت شده است');
    if (email && col.find((u) => (u.email || '').toLowerCase() === email.toLowerCase())) throw new Error('کاربری با این ایمیل از قبل ثبت شده است');
    if (username && col.find((u) => (u.username || '').toLowerCase() === username.toLowerCase())) throw new Error('این نام کاربری قبلاً استفاده شده است');
    const sec = this.config.get('security', {});
    let plainPassword = password;
    if (!plainPassword && autoPassword) {
      plainPassword = require('./utils').generatePassword(10);
      mustChangePassword = true;
    }
    if (plainPassword && sec.requireStrongPassword) {
      const st = passwordStrength(plainPassword);
      if (!st.ok) throw new Error('رمز عبور ضعیف است؛ حداقل ۸ کاراکتر شامل حروف و ارقام انتخاب کنید.');
    }
    const user = col.insert({
      name, mobile, email: email || '', username: username || '',
      passwordHash: plainPassword ? hashPassword(plainPassword) : null,
      roleIds: roleIds || [], status, mustChangePassword,
      createdBy, employee: employee || null,
      avatar: null, lastLoginAt: null
    });
    return { user, plainPassword: autoPassword ? plainPassword : (password || null) };
  }

  setPassword(userId, password, { requireStrong = true } = {}) {
    const sec = this.config.get('security', {});
    if (requireStrong && sec.requireStrongPassword) {
      const st = passwordStrength(password);
      if (!st.ok) throw new Error('رمز عبور ضعیف است؛ حداقل ۸ کاراکتر شامل حروف و ارقام انتخاب کنید.');
    }
    this.users().update(userId, { passwordHash: hashPassword(password), mustChangePassword: false, failedAttempts: 0, lockedUntil: null });
    this.destroyUserSessions(userId);
    return true;
  }

  isSuperAdmin(user, rbac) {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    const roles = rbac ? rbac.rolesOf(user) : [];
    return roles.some((r) => r.key === 'super_admin');
  }

  // ------------------------------------------------------------ دعوت‌نامه‌ها

  createInvite({ userId, type = 'set-password', hours = 72, createdBy = null }) {
    const invite = {
      id: token(24),
      userId, type,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + hours * 3600 * 1000).toISOString(),
      usedAt: null,
      createdBy
    };
    this.db.col('invites').insert(invite);
    return invite;
  }

  getInvite(tokenStr) {
    const inv = this.db.col('invites').byId(tokenStr);
    if (!inv || inv.usedAt) return null;
    if (new Date(inv.expiresAt).getTime() < Date.now()) return null;
    return inv;
  }

  useInvite(tokenStr) {
    const inv = this.getInvite(tokenStr);
    if (!inv) return null;
    this.db.col('invites').update(inv.id, { usedAt: new Date().toISOString() });
    return inv;
  }
}

module.exports = { Auth, COOKIE_ADMIN, COOKIE_APPLY };
