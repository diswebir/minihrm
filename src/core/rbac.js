/**
 * کنترل دسترسی مبتنی بر نقش (RBAC)
 * ------------------------------------------------------------------
 * - مجوزها (permissions) توسط ماژول‌ها معرفی می‌شوند.
 * - هر نقش مجموعه‌ای از مجوزهاست (با پشتیبانی از * برای همه مجوزها و prefix.* ).
 * - هر کاربر می‌تواند چند نقش داشته باشد.
 */
'use strict';

const WILDCARD = '*';

/** نقش‌های پیش‌فرض سامانه (قابل ویرایش در پنل) */
const SYSTEM_ROLES = [
  {
    key: 'super_admin',
    name: 'مدیر ارشد سامانه',
    description: 'دسترسی کامل به تمام بخش‌ها، تنظیمات، ماژول‌ها و کاربران. دسترسی این نقش قابل محدودسازی نیست.',
    permissions: [WILDCARD],
    system: true,
    locked: true,
    color: 'violet'
  },
  {
    key: 'hr_manager',
    name: 'مدیر منابع انسانی',
    description: 'مدیریت کامل فرایند استخدام، موقعیت‌های شغلی، فرم استخدام، آزمون‌ها، مصاحبه‌ها و گزارش‌های تحلیلی.',
    permissions: [
      'dashboard.view',
      'jobs.*',
      'applications.*',
      'form.*',
      'assessments.*',
      'interviews.*',
      'reports.*',
      'users.view', 'users.create', 'users.update',
      'sms.view', 'sms.send',
      'settings.view', 'settings.modules', 'settings.portal',
      'audit.view'
    ],
    system: true,
    color: 'mint'
  },
  {
    key: 'hr_staff',
    name: 'کارمند منابع انسانی',
    description: 'بررسی درخواست‌های استخدامی، برگزاری مصاحبه، ثبت نظر و امتیاز. بدون دسترسی به تنظیمات و مدیریت کاربران.',
    permissions: [
      'dashboard.view',
      'jobs.view',
      'applications.view', 'applications.update', 'applications.note', 'applications.interview',
      'form.view',
      'assessments.view', 'assessments.review',
      'interviews.*',
      'reports.view',
      'sms.view', 'sms.send'
    ],
    system: true,
    color: 'sky'
  },
  {
    key: 'interviewer',
    name: 'مصاحبه‌کننده (مدیر فنی)',
    description: 'فقط مشاهده پرونده متقاضیان ارجاع‌شده به خود و ثبت امتیاز مصاحبه فنی.',
    permissions: [
      'dashboard.view',
      'applications.view', 'applications.interview',
      'interviews.view', 'interviews.score',
      'jobs.view'
    ],
    system: true,
    color: 'peach'
  },
  {
    key: 'employee',
    name: 'کارمند شرکت',
    description: 'دسترسی به پروفایل شخصی، مشاهده کارنامه استخدامی خود و معرفی متقاضی جدید.',
    permissions: [
      'dashboard.view',
      'profile.view', 'profile.edit',
      'jobs.view',
      'applications.refer'
    ],
    system: true,
    color: 'lemon'
  }
];

class RBAC {
  constructor({ db, config, logger }) {
    this.db = db;
    this.config = config;
    this.logger = logger;
    this.permissions = new Map();   // key -> definition
  }

  /** ثبت مجوزهای معرفی‌شده توسط ماژول‌ها */
  registerPermissions(list) {
    for (const p of list || []) {
      if (!p || !p.key) continue;
      this.permissions.set(p.key, {
        key: p.key,
        title: p.title || p.key,
        group: p.group || 'عمومی',
        description: p.description || ''
      });
    }
  }

  allPermissions() {
    return Array.from(this.permissions.values()).sort((a, b) =>
      (a.group || '').localeCompare(b.group || '', 'fa') || (a.title || '').localeCompare(b.title || '', 'fa'));
  }

  permissionGroups() {
    const groups = {};
    for (const p of this.allPermissions()) (groups[p.group] = groups[p.group] || []).push(p);
    return groups;
  }

  roles() { return this.db.col('roles').all(); }

  roleByKey(key) { return this.db.col('roles').by('key', key); }

  /** نقش‌های پیش‌فرض را ایجاد/به‌روزرسانی می‌کند (فقط نقش‌های سیستم) */
  seedSystemRoles() {
    const col = this.db.col('roles');
    for (const role of SYSTEM_ROLES) {
      const existing = col.by('key', role.key);
      if (!existing) {
        col.insert(Object.assign({}, role, { id: role.key }));
      } else {
        // عنوان و توضیح سیستمی را بروز می‌کنیم، ولی تغییرات مدیر روی مجوزها حفظ می‌شود
        col.update(existing.id, { name: role.name, description: role.description, system: true, color: role.color });
      }
    }
  }

  /** آیا این نقش مجوز موردنظر را دارد؟ (با پشتیبانی از * و prefix.*) */
  roleHas(role, perm) {
    if (!role || !perm) return false;
    const list = role.permissions || [];
    if (list.includes(WILDCARD)) return true;
    if (list.includes(perm)) return true;
    const prefix = perm.split('.')[0] + '.*';
    if (list.includes(prefix)) return true;
    const groupPrefix = perm.split('.')[0] + '.' + perm.split('.')[1] + '.*';
    return list.includes(groupPrefix);
  }

  /** مجوزهای مؤثر کاربر */
  effectivePermissions(user) {
    if (!user) return [];
    const roles = (user.roleIds || []).map((id) => this.db.col('roles').byId(id)).filter(Boolean);
    if (roles.some((r) => (r.permissions || []).includes(WILDCARD))) return [WILDCARD];
    const set = new Set();
    for (const role of roles) for (const p of role.permissions || []) set.add(p);
    // گسترش prefix ها به مجوزهای معلوم
    const out = new Set();
    for (const p of set) {
      if (p.endsWith('.*')) {
        const prefix = p.slice(0, -1);
        for (const known of this.permissions.keys()) if (known.startsWith(prefix)) out.add(known);
        out.add(p);
      } else out.add(p);
    }
    return Array.from(out);
  }

  rolesOf(user) {
    return (user.roleIds || []).map((id) => this.db.col('roles').byId(id)).filter(Boolean);
  }

  /** بررسی مجوز برای یک کاربر */
  can(user, perm) {
    if (!user || user.status === 'disabled') return false;
    if (user.isSuperAdmin) return true;
    if (!perm) return true;
    const perms = user._perms || this.effectivePermissions(user);
    if (perms.includes(WILDCARD)) return true;
    if (perms.includes(perm)) return true;
    const parts = perm.split('.');
    if (perms.includes(parts[0] + '.*')) return true;
    if (parts.length > 2 && perms.includes(parts[0] + '.' + parts[1] + '.*')) return true;
    return false;
  }

  /** آیا کاربر حداقل یکی از مجوزها را دارد؟ */
  canAny(user, perms) {
    return (perms || []).some((p) => this.can(user, p));
  }

  /** نقش‌های آماده برای انتخاب‌های سریع */
  roleOptions() {
    return this.roles().map((r) => ({ id: r.id, key: r.key, name: r.name, color: r.color, permissions: r.permissions }));
  }

  /** ایجاد نقش سفارشی */
  createRole({ name, description, permissions, color }) {
    if (!name) throw new Error('نام نقش الزامی است');
    const col = this.db.col('roles');
    const base = require('./utils').slugify(name) || 'role';
    let key = base; let i = 2;
    while (col.by('key', key)) { key = `${base}-${i++}`; }
    return col.insert({ key, name, description: description || '', permissions: permissions || [], system: false, color: color || 'sky' });
  }

  /** بروزرسانی نقش (نقش مدیر ارشد قفل است) */
  updateRole(id, patch) {
    const col = this.db.col('roles');
    const role = col.byId(id);
    if (!role) throw new Error('نقش یافت نشد');
    if (role.key === 'super_admin') {
      const allowed = { name: patch.name || role.name, description: patch.description || role.description, color: patch.color || role.color };
      return col.update(id, allowed);
    }
    if (role.key === 'employee' && patch.permissions) {
      // نقش کارمند شرکت نباید مجوزهای غیرپروفایل بگیرد (محافظت پایه)
      const allowed = ['dashboard.view', 'profile.view', 'profile.edit', 'jobs.view', 'applications.refer'];
      patch.permissions = patch.permissions.filter((p) => allowed.includes(p) || p.endsWith('.*') === false);
    }
    return col.update(id, patch);
  }

  removeRole(id) {
    const col = this.db.col('roles');
    const role = col.byId(id);
    if (!role) throw new Error('نقش یافت نشد');
    if (role.system) throw new Error('نقش‌های سیستمی قابل حذف نیستند');
    const users = this.db.col('users').filter((u) => (u.roleIds || []).includes(id));
    if (users.length) throw new Error(`این نقش به ${users.length} کاربر اختصاص یافته است؛ ابتدا نقش کاربران را تغییر دهید.`);
    return col.remove(id);
  }

  /** نقش‌هایی که یک مجوز مشخص دارند (برای هشدار در UI) */
  rolesWith(perm) {
    return this.roles().filter((r) => this.roleHas(r, perm));
  }
}

module.exports = { RBAC, SYSTEM_ROLES, WILDCARD };
