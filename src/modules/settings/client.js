/* ── کلاینت تنظیمات سامانه ─────────────────────────────────────── */
(function () {
  'use strict';
  const h = HRM.h;

  async function render(params, query) {
    const data = await HRM.get('/settings');
    const page = h`<div></div>`;
    const can = (p) => HRM.can(p);

    page.appendChild(h`<div class="page-head">
      <div><div class="title">تنظیمات سامانه</div><div class="desc">پیکربندی اطلاعات سازمان، پورتال استخدام، امنیت، پیامک و ماژول‌ها</div></div>
      <div class="actions">
        ${can('settings.backup') ? h`<button class="btn btn-ghost" data-backup>${HRM.raw(HRM.icon('download', 16))} پشتیبان‌گیری</button>` : ''}
        ${can('settings.backup') ? h`<button class="btn btn-ghost" data-restore>${HRM.raw(HRM.icon('upload', 16))} بازیابی از پشتیبان</button>` : ''}
      </div>
    </div>`);

    const TABS = [
      { key: 'general', title: 'اطلاعات سازمان', icon: 'settings' },
      { key: 'branding', title: 'برندینگ', icon: 'image' },
      { key: 'portal', title: 'پورتال استخدام', icon: 'globe' },
      { key: 'security', title: 'امنیت و ورود', icon: 'lock' },
      { key: 'modules', title: 'ماژول‌ها', icon: 'puzzle' },
      { key: 'system', title: 'سیستم و نگهداری', icon: 'cpu' }
    ].filter((t) => (t.key === 'modules' ? can('settings.view') : can('settings.view')));

    const tabs = HRM.tabs(TABS.map((t) => ({ title: t.title, icon: t.icon })), {
      onChange(i, panel) {
        const key = TABS[i].key;
        if (key === 'general') panel.appendChild(generalTab(data));
        if (key === 'branding') panel.appendChild(brandingTab(data));
        if (key === 'portal') panel.appendChild(portalTab(data));
        if (key === 'security') panel.appendChild(securityTab(data));
        if (key === 'modules') panel.appendChild(modulesTab(data));
        if (key === 'system') panel.appendChild(systemTab(data));
      }
    });
    page.appendChild(tabs.el);

    const backup = page.querySelector('[data-backup]');
    if (backup) backup.addEventListener('click', () => HRM.download('/api/settings/backup?download=1', 'minihrm-backup-' + HRM.jalali.format(new Date(), '-') + '.json'));
    const restore = page.querySelector('[data-restore]');
    if (restore) restore.addEventListener('click', () => restoreModal());
    return page;
  }

  /* --------------------------------------- عمومی */
  function generalTab(data) {
    const a = data.app || {};
    const form = HRM.form([
      { name: 'name', label: 'نام سامانه', type: 'text', required: true, col: 6, default: a.name },
      { name: 'companyName', label: 'نام سازمان', type: 'text', required: true, col: 6, default: a.companyName },
      { name: 'companyLegalName', label: 'نام حقوقی کامل سازمان', type: 'text', col: 6, default: a.companyLegalName },
      { name: 'baseUrl', label: 'آدرس پایه سایت', type: 'text', col: 6, default: a.baseUrl, placeholder: 'https://hr.example.com', help: 'برای ساخت لینک QR و پیامک‌ها استفاده می‌شود.' },
      { name: 'supportEmail', label: 'ایمیل پشتیبانی', type: 'email', col: 6, default: a.supportEmail },
      { name: 'supportPhone', label: 'تلفن پشتیبانی', type: 'text', col: 6, default: a.supportPhone },
      { name: 'timezone', label: 'منطقه زمانی', type: 'select', col: 6, default: a.timezone || 'Asia/Tehran', options: ['Asia/Tehran'] },
      { name: 'locale', label: 'زبان سامانه', type: 'select', col: 6, default: a.locale || 'fa-IR', options: [{ value: 'fa-IR', label: 'فارسی' }] }
    ]);
    const card = HRM.card({ title: 'اطلاعات سازمان و پشتیبانی', body: form.el });
    const save = h`<button class="btn btn-primary mt-2">${HRM.raw(HRM.icon('check', 16))} ذخیره اطلاعات</button>`;
    card.querySelector('.card-body').appendChild(save);
    save.addEventListener('click', async () => {
      const v = form.validate();
      if (!v.valid) return form.setErrors(v.errors);
      await HRM.put('/settings/general', v.values);
      HRM.toast('اطلاعات سازمان ذخیره شد.', 'success');
      HRM.loadApp();
    });
    return card;
  }

  /* --------------------------------------- برندینگ */
  function brandingTab(data) {
    const a = data.app || {};
    const wrap = h`<div class="grid grid-2">
      ${HRM.card({
        title: 'لوگو و رنگ سازمانی',
        body: h`<div>
          <div class="row gap-3 mb-3">
            <div class="brand-logo" style="width:72px;height:72px;border-radius:22px" data-logo-preview>${a.logo ? h`<img src="${a.logo}">` : (a.companyName || a.name || 'HR').slice(0, 2)}</div>
            <div class="grow">
              <div class="text-sm bold mb-1">لوگوی سازمان</div>
              <input type="file" class="input" accept="image/png,image/jpeg,image/svg+xml,image/webp" data-logo-file>
              <div class="hint">حداکثر ۵۱۲ کیلوبایت — PNG، JPG یا SVG</div>
            </div>
          </div>
          <div class="field"><label class="label">رنگ اصلی سامانه</label>
            <div class="row gap-2 wrap">
              ${['#7C6CF0', '#43bda0', '#4fa8dc', '#fb8a52', '#f7b731', '#ef6a97'].map((c) => h`<button class="btn" data-color="${c}" style="background:${c};color:#fff;min-width:70px">${c}</button>`)}
            </div>
            <div class="row gap-2 mt-2"><input class="input ltr" data-color-custom value="${a.primaryColor || '#7C6CF0'}" style="max-width:180px">
              <button class="btn btn-soft" data-color-save>اعمال رنگ</button></div>
          </div>
          ${a.logo ? h`<button class="btn btn-danger btn-sm" data-logo-remove>حذف لوگو</button>` : ''}
        </div>`
      })}
      ${HRM.card({
        title: 'پیش‌نمایش',
        body: h`<div class="card" style="background:linear-gradient(135deg,var(--violet-50),#fff)">
          <div class="row gap-2">
            <div class="brand-logo" data-preview-logo>${a.logo ? h`<img src="${a.logo}">` : (a.companyName || a.name || 'HR').slice(0, 2)}</div>
            <div><div class="bold" data-preview-name>${a.companyName || a.name}</div>
            <div class="text-xs muted">سامانه منابع انسانی</div></div>
          </div>
          <div class="divider"></div>
          <div class="row gap-2"><span class="btn btn-primary btn-sm">دکمه اصلی</span><span class="btn btn-soft btn-sm">دکمه ثانویه</span></div>
        </div>`
      })}
    </div>`;

    const fileInput = wrap.querySelector('[data-logo-file]');
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (file.size > 512 * 1024) return HRM.toast('حجم لوگو باید کمتر از ۵۱۲ کیلوبایت باشد.', 'error');
      const fd = new FormData();
      fd.append('logo', file);
      fd.append('kind', 'logo');
      try {
        const res = await HRM.post('/settings/logo', fd);
        HRM.toast('لوگو ذخیره شد.', 'success');
        const url = typeof res.logo === 'string' ? res.logo : (res.logo && res.logo.path);
        [wrap.querySelector('[data-logo-preview]'), wrap.querySelector('[data-preview-logo]')].forEach((el) => { if (el && url) el.innerHTML = `<img src="${url}">`; });
        HRM.loadApp();
      } catch (e) { fileInput.value = ''; }
    });
    const removeBtn = wrap.querySelector('[data-logo-remove]');
    if (removeBtn) removeBtn.addEventListener('click', async () => {
      const ok = await HRM.confirm({ title: 'حذف لوگو', message: 'لوگوی سازمان حذف شود؟', danger: true, confirmText: 'حذف' });
      if (!ok) return;
      await HRM.del('/settings/logo');
      HRM.toast('لوگو حذف شد.', 'success');
      HRM.loadApp();
    });
    wrap.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => {
      wrap.querySelector('[data-color-custom]').value = b.dataset.color;
      HRM.toast('برای اعمال، دکمه «اعمال رنگ» را بزنید.', 'info');
    }));
    wrap.querySelector('[data-color-save]').addEventListener('click', async () => {
      const color = wrap.querySelector('[data-color-custom]').value.trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) return HRM.toast('کد رنگ معتبر وارد کنید (مثال: ‎#7C6CF0).', 'error');
      await HRM.put('/settings/general', { primaryColor: color });
      HRM.toast('رنگ سازمانی ذخیره شد.', 'success');
      document.documentElement.style.setProperty('--primary', color);
    });
    return wrap;
  }

  /* --------------------------------------- پورتال */
  function portalTab(data) {
    const p = data.publicPortal || {};
    const form = HRM.form([
      { name: 'careersEnabled', label: 'صفحه فرصت‌های شغلی فعال باشد', type: 'switch', col: 12, default: p.careersEnabled !== false },
      { name: 'pageTitle', label: 'عنوان صفحه فرصت‌ها', type: 'text', col: 12, default: p.pageTitle },
      { name: 'welcomeText', label: 'متن خوش‌آمدگویی', type: 'textarea', col: 12, rows: 3, default: p.welcomeText },
      { name: 'aboutCompany', label: 'درباره سازمان', type: 'textarea', col: 12, rows: 4, default: p.aboutCompany },
      { name: 'showSalary', label: 'نمایش بازه حقوق در آگهی‌ها', type: 'switch', col: 6, default: p.showSalary !== false },
      { name: 'showApplyCount', label: 'نمایش تعداد متقاضیان', type: 'switch', col: 6, default: !!p.showApplyCount },
      { name: 'allowResumeUpload', label: 'امکان بارگذاری رزومه/مدارک', type: 'switch', col: 6, default: p.allowResumeUpload !== false },
      { name: 'maxFileSizeMB', label: 'حداکثر حجم فایل (مگابایت)', type: 'number', col: 6, default: p.maxFileSizeMB || 5 },
      { name: 'requireJobSelection', label: 'الزام انتخاب موقعیت شغلی قبل از فرم', type: 'switch', col: 12, default: p.requireJobSelection !== false },
      { name: 'contactEmail', label: 'ایمیل تماس', type: 'email', col: 6, default: p.contactEmail },
      { name: 'contactPhone', label: 'تلفن تماس', type: 'text', col: 6, default: p.contactPhone },
      { name: 'address', label: 'نشانی', type: 'text', col: 12, default: p.address },
      { name: 'addressMapUrl', label: 'لینک نقشه', type: 'text', col: 6, default: p.addressMapUrl },
      { name: 'footerText', label: 'متن پاورقی سایت', type: 'text', col: 12, default: p.footerText }
    ]);
    const card = HRM.card({
      title: 'پورتال استخدام (سایت عمومی)', subtitle: 'این اطلاعات در صفحه فرصت‌های شغلی متقاضیان نمایش داده می‌شود.',
      actions: h`<a class="btn btn-sm btn-ghost" target="_blank" href="/careers">${HRM.raw(HRM.icon('external-link', 14))} مشاهده سایت</a>`,
      body: form.el
    });
    const save = h`<button class="btn btn-primary mt-2">${HRM.raw(HRM.icon('check', 16))} ذخیره تنظیمات پورتال</button>`;
    card.querySelector('.card-body').appendChild(save);
    save.addEventListener('click', async () => {
      await HRM.put('/settings/portal', form.values());
      HRM.toast('تنظیمات پورتال ذخیره شد.', 'success');
    });
    return card;
  }

  /* --------------------------------------- امنیت */
  function securityTab(data) {
    const s = data.security || {};
    const form = HRM.form([
      { name: 'allowPasswordLogin', label: 'ورود با رمز عبور مجاز باشد', type: 'switch', col: 6, default: s.allowPasswordLogin !== false },
      { name: 'allowOtpLogin', label: 'ورود با کد پیامکی مجاز باشد', type: 'switch', col: 6, default: s.allowOtpLogin !== false },
      { name: 'requireStrongPassword', label: 'الزام رمز عبور قوی', type: 'switch', col: 12, default: s.requireStrongPassword !== false, placeholder: 'حداقل ۸ کاراکتر شامل حرف و رقم' },
      { name: 'sessionHours', label: 'مدت اعتبار نشست کارکنان (ساعت)', type: 'number', col: 4, default: s.sessionHours || 72 },
      { name: 'applySessionHours', label: 'مدت اعتبار نشست متقاضیان (ساعت)', type: 'number', col: 4, default: s.applySessionHours || 72 },
      { name: 'magicLinkHours', label: 'اعتبار لینک دعوت/فرم (ساعت)', type: 'number', col: 4, default: s.magicLinkHours || 72 },
      { name: 'maxLoginAttempts', label: 'حداکثر تلاش ناموفق ورود', type: 'number', col: 4, default: s.maxLoginAttempts || 5 },
      { name: 'lockMinutes', label: 'مدت قفل حساب (دقیقه)', type: 'number', col: 4, default: s.lockMinutes || 15 },
      { name: 'otpLength', label: 'طول کد پیامکی', type: 'number', col: 4, default: s.otpLength || 5 },
      { name: 'otpTtlSec', label: 'اعتبار کد پیامکی (ثانیه)', type: 'number', col: 4, default: s.otpTtlSec || 120 },
      { name: 'otpMaxPerHour', label: 'حداکثر کد ارسالی در ساعت برای هر شماره', type: 'number', col: 4, default: s.otpMaxPerHour || 5 },
      { name: 'otpPerMinute', label: 'حداکثر کد ارسالی در دقیقه برای هر شماره', type: 'number', col: 4, default: s.otpPerMinute || 1 }
    ]);
    const card = HRM.card({ title: 'امنیت و ورود', subtitle: 'این تنظیمات روی ورود کارکنان و متقاضیان اعمال می‌شود.', body: form.el });
    const save = h`<button class="btn btn-primary mt-2">${HRM.raw(HRM.icon('shield-check', 16))} ذخیره تنظیمات امنیتی</button>`;
    card.querySelector('.card-body').appendChild(save);
    save.addEventListener('click', async () => {
      await HRM.put('/settings/security', form.values());
      HRM.toast('تنظیمات امنیتی ذخیره شد.', 'success');
    });
    return card;
  }

  /* --------------------------------------- ماژول‌ها */
  function modulesTab(data) {
    const wrap = h`<div></div>`;
    wrap.appendChild(h`<div class="insight sky mb-3"><span class="ic">${HRM.raw(HRM.icon('info', 16))}</span>
      <div class="text-sm">هر ماژول به‌صورت مستقل قابل فعال/غیرفعال‌سازی است. با غیرفعال‌کردن یک ماژول، منو و دسترسی‌های آن پنهان می‌شود اما داده‌های ثبت‌شده حذف نمی‌شوند.</div></div>`);
    (data.modules || []).forEach((m) => {
      const settings = m.settings || [];
      const card = h`<div class="card mb-2" data-module="${m.key}">
        <div class="row between wrap gap-2">
          <div class="row gap-2" style="align-items:flex-start">
            <span class="avatar ${m.enabled ? 'mint' : ''}">${HRM.raw(HRM.icon(m.icon || 'puzzle', 16))}</span>
            <div>
              <div class="bold">${m.title} ${m.core ? HRM.badge('ماژول پایه', 'violet') : ''} ${m.installed ? '' : HRM.badge('نصب‌نشده', 'lemon')}</div>
              <div class="text-sm muted">${m.description || ''}</div>
              ${m.depends && m.depends.length ? h`<div class="text-xs muted mt-1">پیش‌نیاز: ${m.depends.join('، ')}</div>` : ''}
              ${m.error ? h`<div class="text-xs trend-down mt-1">خطای بارگذاری: ${m.error}</div>` : ''}
            </div>
          </div>
          <div class="row gap-2">
            ${settings.length && HRM.can('settings.modules') ? h`<button class="btn btn-sm btn-soft" data-settings="${m.key}">تنظیمات ماژول</button>` : ''}
            ${HRM.can('settings.modules') ? h`<label class="switch">
              <input type="checkbox" data-toggle="${m.key}" ${m.enabled ? 'checked' : ''} ${m.core ? 'disabled' : ''}>
              <span class="track"></span>
            </label>` : (m.enabled ? HRM.badge('فعال', 'mint') : HRM.badge('غیرفعال', 'outline'))}
          </div>
        </div>
        ${m.permissions && m.permissions.length ? h`<div class="row gap-1 wrap mt-2">${m.permissions.map((p) => HRM.badge(p.title, 'outline'))}</div>` : ''}
      </div>`;
      wrap.appendChild(card);
    });
    wrap.querySelectorAll('[data-toggle]').forEach((inp) => inp.addEventListener('change', async () => {
      const key = inp.dataset.toggle;
      try {
        const res = await HRM.post('/settings/modules/' + key + '/toggle', { enabled: inp.checked });
        HRM.toast(res.enabled ? 'ماژول فعال شد.' : 'ماژول غیرفعال شد.', 'success');
        HRM.loadApp();
      } catch (e) { inp.checked = !inp.checked; }
    }));
    wrap.querySelectorAll('[data-settings]').forEach((b) => b.addEventListener('click', () => {
      const m = data.modules.find((x) => x.key === b.dataset.settings);
      moduleSettingsModal(m, () => HRM.render());
    }));
    return wrap;
  }

  function moduleSettingsModal(m, onDone) {
    const form = HRM.form((m.settings || []).map((s) => {
      if (s.type === 'bool') return { name: s.key, label: s.title, type: 'switch', col: 6, default: s.value, help: s.help };
      if (s.type === 'number') return { name: s.key, label: s.title, type: 'number', col: 6, default: s.value, help: s.help };
      if (s.type === 'select') return { name: s.key, label: s.title, type: 'select', col: 6, default: s.value, options: (s.options || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o)), help: s.help };
      if (s.type === 'textarea') return { name: s.key, label: s.title, type: 'textarea', col: 12, default: s.value, help: s.help };
      return { name: s.key, label: s.title, type: 'text', col: 6, default: s.value, help: s.help };
    }));
    const modal = HRM.modal({
      title: `تنظیمات ماژول «${m.title}»`, size: '',
      body: form.el,
      footer: h`<button class="btn btn-primary" data-save>ذخیره تنظیمات</button>`
    });
    modal.el.querySelector('[data-save]').addEventListener('click', async () => {
      await HRM.put('/settings/modules/' + m.key, { settings: form.values() });
      HRM.toast('تنظیمات ماژول ذخیره شد.', 'success');
      modal.close(); if (onDone) onDone();
    });
  }

  /* --------------------------------------- سیستم */
  function systemTab(data) {
    const s = data.system || {};
    const wrap = h`<div>
      <div class="grid grid-4 mb-3">
        ${HRM.statCard({ label: 'نسخه سامانه', value: HRM.num(s.version), icon: 'tag', color: 'violet' })}
        ${HRM.statCard({ label: 'نسخه Node.js', value: h`<span class="ltr">${s.node}</span>`, icon: 'cpu', color: 'sky' })}
        ${HRM.statCard({ label: 'زمان فعالیت', value: HRM.num(Math.round((s.uptimeSec || 0) / 60)) + ' دقیقه', icon: 'clock', color: 'mint' })}
        ${HRM.statCard({ label: 'حجم داده‌ها', value: s.dataSize || '—', icon: 'folder', color: 'lemon', hint: `${HRM.num(s.dataFiles || 0)} فایل در ${HRM.num(COLLECTION_COUNT(s))} مجموعه داده` })}
      </div>
      ${HRM.card({
        title: 'وضعیت پیامک', className: 'mb-3',
        body: h`<div class="grid grid-2">
          ${HRM.fieldRow('ارائه‌دهنده', s.smsProvider || '—', { icon: 'message-square' })}
          ${HRM.fieldRow('حالت آزمایشی', s.smsTestMode ? h`<span class="badge badge-lemon">فعال — پیام واقعی ارسال نمی‌شود</span>` : HRM.badge('غیرفعال', 'mint'), { icon: 'alert' })}
          ${HRM.fieldRow('تاریخ نصب', s.installedAt ? HRM.jtime(s.installedAt) : '—', { icon: 'calendar' })}
          ${HRM.fieldRow('شناسه اجرا', h`<span class="ltr text-xs">${s.nodeEnv || 'production'} — ${HRM.num(s.port || 3000)}</span>`, { icon: 'monitor' })}
        </div>`
      })}
      ${HRM.card({
        title: 'نگهداری و پاک‌سازی داده‌ها', subtitle: 'حذف داده‌های قدیمی برای کاهش حجم و افزایش سرعت',
        body: h`<div class="grid grid-3">
          ${maintenanceBox('لاگ فعالیت‌ها', 'حذف لاگ‌های قدیمی‌تر از مدت نگهداری', 'prune_audit')}
          ${maintenanceBox('لاگ پیامک‌ها', 'حذف پیامک‌های قدیمی‌تر از مدت نگهداری', 'prune_sms')}
          ${maintenanceBox('نشست‌ها و کدهای منقضی', 'حذف نشست‌ها و کدهای یکبارمصرف منقضی‌شده', 'prune_sessions')}
        </div>`
      })}
      ${HRM.card({
        title: 'مجموعه‌های داده', className: 'mt-3',
        body: HRM.table({
          columns: [
            { title: 'مجموعه', render: (r) => h`<code>${r.name}</code>` },
            { title: 'تعداد رکورد', render: (r) => HRM.num(r.count) }
          ],
          rows: Object.entries(s.collections || {}).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
          empty: HRM.empty('داده‌ای یافت نشد', '')
        })
      })}
    </div>`;

    wrap.querySelectorAll('[data-prune]').forEach((b) => b.addEventListener('click', async () => {
      const task = b.dataset.prune;
      const labels = { prune_audit: 'لاگ فعالیت‌ها', prune_sms: 'لاگ پیامک‌ها', prune_sessions: 'نشست‌های منقضی‌شده' };
      const ok = await HRM.confirm({ title: 'پاک‌سازی', message: `${labels[task]} قدیمی حذف شود؟ این عملیات بازگشت‌پذیر نیست.`, danger: true, confirmText: 'پاک‌سازی کن' });
      if (!ok) return;
      const res = await HRM.post('/settings/maintenance', { task });
      HRM.toast(`پاک‌سازی انجام شد (${HRM.num(res.removed || 0)} مورد حذف شد).`, 'success');
      HRM.render();
    }));
    return wrap;
  }

  function maintenanceBox(title, desc, task) {
    return h`<div class="card pad-sm" style="box-shadow:none">
      <div class="bold text-sm">${title}</div>
      <div class="text-xs muted mb-2">${desc}</div>
      <button class="btn btn-sm btn-soft" data-prune="${task}">${HRM.raw(HRM.icon('trash', 14))} پاک‌سازی</button>
    </div>`;
  }

  function COLLECTION_COUNT(s) { return Object.keys(s.collections || {}).length; }

  function restoreModal() {
    const body = h`<div>
      <div class="insight rose mb-2"><span class="ic">${HRM.raw(HRM.icon('alert', 16))}</span>
        <div class="text-sm">بازیابی از پشتیبان، <span class="bold">همه داده‌های فعلی</span> (متقاضیان، موقعیت‌ها، کاربران و تنظیمات) را با محتوای فایل پشتیبان جایگزین می‌کند. پیش از ادامه، از وضعیت فعلی پشتیبان بگیرید.</div></div>
      <input type="file" class="input" accept="application/json" data-backup-file>
    </div>`;
    const m = HRM.modal({
      title: 'بازیابی از فایل پشتیبان', body,
      footer: h`<button class="btn btn-danger" data-do>بازیابی داده‌ها</button>`
    });
    m.el.querySelector('[data-do]').addEventListener('click', async () => {
      const file = m.el.querySelector('[data-backup-file]').files[0];
      if (!file) return HRM.toast('فایل پشتیبان را انتخاب کنید.', 'warning');
      const ok = await HRM.confirm({ title: 'تأیید نهایی', message: 'داده‌های فعلی با فایل پشتیبان جایگزین شود؟', danger: true, confirmText: 'بله، بازیابی کن' });
      if (!ok) return;
      const fd = new FormData();
      fd.append('backup', file);
      try {
        const res = await HRM.post('/settings/restore', fd);
        HRM.toast(`بازیابی انجام شد (${HRM.num(res.collections || 0)} مجموعه داده).`, 'success');
        m.close();
        setTimeout(() => location.reload(), 900);
      } catch (e) { /* پیام خطا */ }
    });
  }

  HRM.registerModule({
    key: 'settings', title: 'تنظیمات', order: 90,
    routes: { '/settings': (ctx) => render(null, ctx.query) }
  });
})();
