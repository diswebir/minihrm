/* ── کلاینت پروفایل کاربر ──────────────────────────────────────── */
(function () {
  'use strict';
  const h = HRM.h;

  async function render() {
    const data = await HRM.get('/me');
    if (!data.authenticated) return HRM.empty('وارد نشده‌اید', 'برای مشاهده پروفایل ابتدا وارد شوید.');
    const u = data.user;
    const page = h`<div></div>`;

    page.appendChild(h`<div class="page-head">
      <div><div class="title">پروفایل من</div><div class="desc">اطلاعات شخصی، رمز عبور و نشست‌های فعال شما</div></div>
    </div>`);

    page.appendChild(HRM.card({
      className: 'mb-3',
      body: h`<div class="row between wrap gap-3">
        <div class="row gap-3">
          <div class="avatar-wrap" style="position:relative">
            ${HRM.avatar(u.name, { size: 'xl', src: u.avatar, color: 'violet' })}
            ${HRM.can('profile.edit') ? h`<label class="avatar-edit" title="تغییر تصویر">${HRM.raw(HRM.icon('camera', 14))}
              <input type="file" accept="image/png,image/jpeg,image/webp" data-avatar hidden></label>` : ''}
          </div>
          <div>
            <div class="row gap-2" style="align-items:center"><span class="bold" style="font-size:1.15rem">${u.name}</span>
              ${u.isSuperAdmin ? HRM.badge('مدیر ارشد سامانه', 'violet') : ''}</div>
            <div class="text-sm muted ltr mt-1">${u.mobile}${u.email ? ' — ' + u.email : ''}</div>
            <div class="row gap-1 wrap mt-2">${(u.roles || []).map((r) => HRM.badge(r.name, r.color || 'sky'))}</div>
          </div>
        </div>
        <div class="col gap-1" style="min-width:220px">
          ${u.employee ? HRM.fieldRow('کد پرسنلی', u.employee.code || '—', { icon: 'hash' }) : ''}
          ${u.employee && u.employee.department ? HRM.fieldRow('واحد سازمانی', u.employee.department, { icon: 'building' }) : ''}
          ${u.employee && u.employee.position ? HRM.fieldRow('سمت', u.employee.position, { icon: 'briefcase' }) : ''}
          ${HRM.fieldRow('آخرین ورود', u.lastLoginAt ? HRM.jtime(u.lastLoginAt) + ' — ' + HRM.ago(u.lastLoginAt) : '—', { icon: 'clock' })}
          ${HRM.fieldRow('عضویت از', HRM.jdate(u.createdAt), { icon: 'calendar' })}
        </div>
      </div>`
    }));

    const grid = h`<div class="grid grid-2"></div>`;

    /* اطلاعات شخصی */
    const form = HRM.form([
      { name: 'name', label: 'نام و نام خانوادگی', type: 'text', required: true, col: 12, default: u.name },
      { name: 'email', label: 'ایمیل', type: 'email', col: 12, default: u.email }
    ]);
    const infoCard = HRM.card({
      title: 'اطلاعات شخصی',
      body: h`<div>${form.el}
        <div class="mt-2">
          ${HRM.fieldRow('شماره موبایل', h`<span class="ltr">${u.mobile}</span>`, { icon: 'smartphone' })}
          ${HRM.fieldRow('نام کاربری', h`<span class="ltr">${u.username || '—'}</span>`, { icon: 'user' })}
          <div class="hint mt-1">تغییر شماره موبایل و نام کاربری توسط مدیر سامانه انجام می‌شود.</div>
        </div>
      </div>`
    });
    if (HRM.can('profile.edit')) {
      const save = h`<button class="btn btn-primary mt-2">${HRM.raw(HRM.icon('check', 16))} ذخیره تغییرات</button>`;
      infoCard.querySelector('.card-body').appendChild(save);
      save.addEventListener('click', async () => {
        const v = form.validate();
        if (!v.valid) return form.setErrors(v.errors);
        const res = await HRM.put('/me', { name: v.values.name, email: v.values.email });
        HRM.toast('اطلاعات پروفایل ذخیره شد.', 'success');
        HRM.loadApp();
        return res;
      });
    }
    grid.appendChild(infoCard);

    /* تغییر رمز عبور */
    const pw = HRM.form([
      { name: 'currentPassword', label: 'رمز عبور فعلی', type: 'password', col: 12 },
      { name: 'newPassword', label: 'رمز عبور جدید', type: 'password', required: true, col: 6 },
      { name: 'confirmPassword', label: 'تکرار رمز عبور جدید', type: 'password', required: true, col: 6 }
    ]);
    const pwCard = HRM.card({
      title: 'تغییر رمز عبور', subtitle: 'پس از تغییر، سایر نشست‌های شما بسته می‌شود.',
      body: h`<div>${pw.el}
        <div class="insight lemon mt-2"><span class="ic">${HRM.raw(HRM.icon('shield-check', 14))}</span>
          <div class="text-xs">رمز عبور قوی حداقل ۸ کاراکتر و شامل حرف بزرگ، حرف کوچک و رقم است.</div></div>
        <button class="btn btn-primary mt-2" data-pw>${HRM.raw(HRM.icon('lock', 16))} تغییر رمز عبور</button></div>`
    });
    pwCard.querySelector('[data-pw]').addEventListener('click', async () => {
      const v = pw.validate();
      if (!v.valid) return pw.setErrors(v.errors);
      if (v.values.newPassword !== v.values.confirmPassword) return HRM.toast('تکرار رمز عبور جدید مطابقت ندارد.', 'error');
      const res = await HRM.post('/me/password', v.values);
      if (res.changed) {
        HRM.toast('رمز عبور با موفقیت تغییر کرد.', 'success');
        pw.reset();
      }
    });
    grid.appendChild(pwCard);
    page.appendChild(grid);

    /* نشست‌ها */
    try {
      const sess = await HRM.get('/me/sessions');
      page.appendChild(h`<div class="mt-3">${HRM.card({
        title: 'نشست‌های فعال', subtitle: 'دستگاه‌ها و مرورگرهایی که با حساب شما وارد شده‌اند',
        body: HRM.table({
          columns: [
            { title: 'وضعیت', render: (r) => (r.current ? HRM.badge('نشست فعلی', 'mint', true) : HRM.badge('فعال', 'sky')) },
            { title: 'زمان ورود', render: (r) => h`<div class="text-sm">${HRM.jtime(r.createdAt)}</div><div class="text-xs muted">${HRM.ago(r.createdAt)}</div>` },
            { title: 'انقضا', render: (r) => HRM.jtime(r.expiresAt) },
            { title: 'آی‌پی', render: (r) => h`<span class="text-xs ltr muted">${r.ip || '—'}</span>` },
            { title: 'مرورگر', render: (r) => h`<span class="text-xs muted ltr" style="word-break:break-all">${shortUa(r.ua)}</span>` },
            { title: '', class: 'actions-cell', render: (r) => (r.current ? '' : h`<button class="btn btn-sm btn-ghost" data-kill="${r.id}" title="بستن نشست">${HRM.raw(HRM.icon('x', 14))}</button>`) }
          ],
          rows: sess.sessions || [],
          empty: HRM.empty('نشست دیگری وجود ندارد', '')
        })
      })}</div>`);
      page.querySelectorAll('[data-kill]').forEach((b) => b.addEventListener('click', async () => {
        const ok = await HRM.confirm({ title: 'بستن نشست', message: 'این نشست بسته شود؟', danger: true, confirmText: 'بستن' });
        if (!ok) return;
        await HRM.del('/me/sessions/' + b.dataset.kill);
        HRM.toast('نشست بسته شد.', 'success');
        HRM.render();
      }));
    } catch (e) { /* دسترسی ندارد */ }

    /* ویرایش آواتار */
    const avatarInput = page.querySelector('[data-avatar]');
    if (avatarInput) avatarInput.addEventListener('change', async () => {
      const file = avatarInput.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) return HRM.toast('حجم تصویر باید کمتر از ۲ مگابایت باشد.', 'error');
      const fd = new FormData();
      fd.append('avatar', file);
      try {
        await HRM.post('/me/avatar', fd);
        HRM.toast('تصویر پروفایل به‌روزرسانی شد.', 'success');
        HRM.loadApp();
        HRM.render();
      } catch (e) { avatarInput.value = ''; }
    });
    return page;
  }

  function shortUa(ua) {
    if (!ua) return '—';
    const m = String(ua).match(/(Chrome|Firefox|Safari|Edge|OPR|SamsungBrowser)\/[\d.]+/);
    const os = /Windows/.test(ua) ? 'ویندوز' : /Android/.test(ua) ? 'اندروید' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac/.test(ua) ? 'مک' : /Linux/.test(ua) ? 'لینوکس' : '';
    return (m ? m[0] : 'مرورگر') + (os ? ' — ' + os : '');
  }

  HRM.registerModule({
    key: 'profile', title: 'پروفایل من', order: 95,
    routes: { '/profile': () => render() }
  });
})();
