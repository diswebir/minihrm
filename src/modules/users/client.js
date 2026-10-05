/* ── کلاینت کاربران و نقش‌ها ───────────────────────────────────── */
(function () {
  'use strict';
  const h = HRM.h;
  const roleColor = (c) => ({ violet: 'violet', mint: 'mint', sky: 'sky', peach: 'peach', lemon: 'lemon', rose: 'rose' }[c] || 'sky');

  /* --------------------------------------------------- کاربران */
  async function users(params, query) {
    const state = { page: +query.page || 1, q: query.q || '', status: query.status || '', roleId: query.roleId || '' };
    const page = h`<div></div>`;
    async function load() {
      const data = await HRM.get('/users?' + new URLSearchParams(state).toString());
      page.querySelector('[data-body]').replaceChildren(body(data));
    }
    page.appendChild(h`<div class="page-head">
      <div><div class="title">کاربران سامانه</div><div class="desc">مدیریت کارکنان، نقش‌ها و سطوح دسترسی</div></div>
      <div class="actions">
        ${HRM.can('roles.manage') ? h`<a class="btn btn-ghost" href="#/roles">${HRM.raw(HRM.icon('shield-check', 16))} نقش‌ها و دسترسی‌ها</a>` : ''}
        ${HRM.can('users.create') ? h`<button class="btn btn-primary" data-new>${HRM.raw(HRM.icon('user-plus', 16))} کاربر جدید</button>` : ''}
      </div>
    </div><div data-body></div>`);

    function body(data) {
      const wrap = h`<div></div>`;
      wrap.appendChild(h`<div class="grid grid-kpi mb-3">
        ${HRM.statCard({ label: 'کل کاربران', value: HRM.num(data.stats.total), icon: 'users', color: 'violet' })}
        ${HRM.statCard({ label: 'فعال', value: HRM.num(data.stats.active), icon: 'check-circle', color: 'mint' })}
        ${HRM.statCard({ label: 'غیرفعال', value: HRM.num(data.stats.disabled), icon: 'pause-circle', color: 'rose' })}
        ${HRM.statCard({ label: 'در انتظار فعال‌سازی', value: HRM.num(data.stats.invited || 0), icon: 'mail', color: 'lemon' })}
      </div>`);
      wrap.appendChild(h`<div class="card mb-3"><div class="row gap-2 wrap">
        <div class="search-box grow" style="min-width:200px">${HRM.raw(HRM.icon('search', 16))}
          <input data-search placeholder="نام، موبایل یا ایمیل…" value="${state.q}"></div>
        <select class="select" data-role style="max-width:200px"><option value="">همه نقش‌ها</option>
          ${(data.roles || []).map((r) => h`<option value="${r.id}" ${state.roleId === r.id ? 'selected' : ''}>${r.name}</option>`)}</select>
        <select class="select" data-status style="max-width:170px">
          <option value="">همه وضعیت‌ها</option>
          <option value="active" ${state.status === 'active' ? 'selected' : ''}>فعال</option>
          <option value="disabled" ${state.status === 'disabled' ? 'selected' : ''}>غیرفعال</option>
          <option value="invited" ${state.status === 'invited' ? 'selected' : ''}>در انتظار فعال‌سازی</option>
        </select>
      </div></div>`);

      wrap.appendChild(HRM.card({
        title: 'فهرست کاربران', subtitle: `${HRM.num(data.total)} کاربر`,
        body: HRM.table({
          columns: [
            {
              title: 'کاربر', render: (r) => h`<div class="user-cell">${HRM.avatar(r.name, { color: r.isSuperAdmin ? 'lemon' : 'violet' })}
                <div><div class="name">${r.name}</div><div class="meta ltr">${r.mobile}${r.email ? ' — ' + r.email : ''}</div></div></div>`
            },
            { title: 'نقش‌ها', render: (r) => h`<div class="row gap-1 wrap">${(r.roles || []).map((role) => HRM.badge(role.name, roleColor(role.color)))}</div>` },
            { title: 'واحد / سمت', render: (r) => h`<div class="text-sm">${(r.employee || {}).department || '—'}</div><div class="text-xs muted">${(r.employee || {}).position || ''}</div>` },
            { title: 'وضعیت', render: (r) => r.status === 'active' ? HRM.badge('فعال', 'mint', true) : r.status === 'invited' ? HRM.badge('در انتظار فعال‌سازی', 'lemon', true) : HRM.badge('غیرفعال', 'rose', true) },
            { title: 'آخرین ورود', render: (r) => r.lastLoginAt ? h`<div class="text-xs">${HRM.jtime(r.lastLoginAt)}</div><div class="text-xs muted">${HRM.ago(r.lastLoginAt)}</div>` : h`<span class="muted text-xs">—</span>` },
            {
              title: 'عملیات', class: 'actions-cell', render: (r) => h`<div class="row gap-1" data-stop>
                ${HRM.can('users.update') ? h`<button class="btn btn-sm btn-soft" data-edit="${r.id}">${HRM.raw(HRM.icon('edit', 14))} ویرایش</button>` : ''}
                ${HRM.can('users.reset_password') ? h`<button class="btn btn-sm btn-ghost" data-reset-pw="${r.id}" title="بازنشانی رمز عبور">${HRM.raw(HRM.icon('key', 14))}</button>` : ''}
                ${HRM.can('users.update') ? h`<button class="btn btn-sm btn-ghost" data-invite="${r.id}" title="ارسال لینک دعوت">${HRM.raw(HRM.icon('send', 14))}</button>` : ''}
                ${HRM.can('users.delete') && !r.isSuperAdmin ? h`<button class="btn btn-sm btn-danger" data-del="${r.id}">${HRM.raw(HRM.icon('trash', 14))}</button>` : ''}
              </div>`
            }
          ],
          rows: data.rows,
          empty: HRM.empty('کاربری یافت نشد', 'با فیلترهای فعلی کاربری وجود ندارد.')
        })
      }));
      if (data.pages > 1) wrap.appendChild(HRM.pagination({ page: data.page, pages: data.pages, total: data.total, perPage: data.perPage, onChange: (p) => { state.page = p; load(); } }));

      const search = wrap.querySelector('[data-search]');
      search.addEventListener('input', HRM.debounce(() => { state.q = search.value.trim(); state.page = 1; load(); }, 400));
      const rSel = wrap.querySelector('[data-role]');
      rSel.addEventListener('change', () => { state.roleId = rSel.value; state.page = 1; load(); });
      const sSel = wrap.querySelector('[data-status]');
      sSel.addEventListener('change', () => { state.status = sSel.value; state.page = 1; load(); });
      wrap.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
        const d = await HRM.get('/users/' + b.dataset.edit);
        editor(d, load);
      }));
      wrap.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        const ok = await HRM.confirm({ title: 'حذف کاربر', message: 'این کاربر حذف شود؟ دسترسی او به سامانه به‌طور کامل قطع می‌شود.', danger: true, confirmText: 'حذف' });
        if (!ok) return;
        await HRM.del('/users/' + b.dataset.del);
        HRM.toast('کاربر حذف شد.', 'success');
        load();
      }));
      wrap.querySelectorAll('[data-reset-pw]').forEach((b) => b.addEventListener('click', () => resetPasswordModal(b.dataset.resetPw, load)));
      wrap.querySelectorAll('[data-invite]').forEach((b) => b.addEventListener('click', async () => {
        const res = await HRM.post('/users/' + b.dataset.invite + '/invite', {});
        HRM.toast('لینک دعوت ساخته شد.', 'success');
        if (res.link) HRM.copy(res.link, 'لینک دعوت کپی شد — برای کاربر ارسال کنید');
      }));
      wrap.__roles = data.roles;
      return wrap;
    }

    page.querySelector('[data-new]')?.addEventListener('click', async () => {
      const d = await HRM.get('/users');
      editor({ roles: d.roles, user: null }, load);
    });
    await load();
    return page;
  }

  /* --------------------------------------------------- ویرایشگر کاربر */
  async function editor(data, onDone) {
    const isNew = !data.user;
    const u = data.user || {};
    const roles = data.roles || [];
    const form = HRM.form([
      { type: 'heading', label: 'اطلاعات فردی' },
      { name: 'name', label: 'نام و نام خانوادگی', type: 'text', required: true, col: 6, default: u.name },
      { name: 'mobile', label: 'شماره موبایل', type: 'tel', required: true, col: 6, default: u.mobile, help: 'با این شماره وارد سامانه می‌شود.' },
      { name: 'email', label: 'ایمیل', type: 'email', col: 6, default: u.email },
      { name: 'status', label: 'وضعیت حساب', type: 'select', col: 6, options: [{ value: 'active', label: 'فعال' }, { value: 'disabled', label: 'غیرفعال' }], default: u.status || 'active' },
      { type: 'heading', label: 'نقش‌ها و دسترسی‌ها' },
      { name: 'roleIds', label: 'نقش‌های کاربر', type: 'checkbox', required: true, col: 12, options: roles.map((r) => ({ value: r.id, label: `${r.name}${r.description ? ' — ' + r.description : ''}` })), default: u.roleIds },
      { type: 'heading', label: 'اطلاعات پرسنلی' },
      { name: 'empCode', label: 'کد پرسنلی', type: 'text', col: 4, default: (u.employee || {}).code },
      { name: 'empDepartment', label: 'واحد سازمانی', type: 'text', col: 4, default: (u.employee || {}).department },
      { name: 'empPosition', label: 'سمت', type: 'text', col: 4, default: (u.employee || {}).position },
      ...(isNew ? [{ name: 'password', label: 'رمز عبور اولیه', type: 'text', col: 6, help: 'در صورت خالی بودن، رمز پیش‌فرض برای کاربر تنظیم می‌شود و می‌تواند با بازنشانی تغییرش دهد.' }] : [])
    ]);

    const drawer = HRM.drawer({
      title: isNew ? 'افزودن کاربر جدید' : `ویرایش «${u.name}»`,
      subtitle: isNew ? 'برای کاربر، نقش و دسترسی‌های مورد نیاز را انتخاب کنید.' : 'تغییرات بلافاصله اعمال می‌شود.',
      body: form.el,
      footer: h`<div class="row between w-100 wrap gap-2">
        <div class="row gap-1">
          ${isNew ? '' : (HRM.can('users.reset_password') ? h`<button class="btn btn-soft" data-reset>${HRM.raw(HRM.icon('key', 16))} بازنشانی رمز</button>` : '')}
          ${isNew ? '' : (HRM.can('users.update') ? h`<button class="btn btn-ghost" data-invite>${HRM.raw(HRM.icon('send', 16))} لینک دعوت</button>` : '')}
        </div>
        <div class="row gap-2">
          <button class="btn btn-ghost" data-cancel>انصراف</button>
          <button class="btn btn-primary" data-save>${isNew ? 'ایجاد کاربر' : 'ذخیره تغییرات'}</button>
        </div>
      </div>`
    });
    drawer.el.querySelector('[data-cancel]').addEventListener('click', () => drawer.close());
    drawer.el.querySelector('[data-reset]')?.addEventListener('click', () => resetPasswordModal(u.id, null));
    drawer.el.querySelector('[data-invite]')?.addEventListener('click', async () => {
      const res = await HRM.post('/users/' + u.id + '/invite', {});
      HRM.toast('لینک دعوت ساخته شد.', 'success');
      if (res.link) HRM.copy(res.link, 'لینک دعوت کپی شد');
    });
    drawer.el.querySelector('[data-save]').addEventListener('click', async () => {
      const v = form.validate();
      if (!v.valid) return form.setErrors(v.errors);
      const payload = {
        name: v.values.name, mobile: v.values.mobile, email: v.values.email,
        status: v.values.status, roleIds: v.values.roleIds || [],
        employee: { code: v.values.empCode, department: v.values.empDepartment, position: v.values.empPosition }
      };
      if (isNew && v.values.password) payload.password = v.values.password;
      try {
        if (isNew) await HRM.post('/users', payload);
        else await HRM.put('/users/' + u.id, payload);
        HRM.toast(isNew ? 'کاربر ایجاد شد.' : 'تغییرات ذخیره شد.', 'success');
        drawer.close(); if (onDone) onDone();
      } catch (e) { form.setErrors(e.fields || {}); }
    });
  }

  function resetPasswordModal(userId, onDone) {
    const form = HRM.form([
      { name: 'password', label: 'رمز عبور جدید', type: 'text', required: true, col: 12, help: 'رمز به‌صورت متن ساده ذخیره نمی‌شود، اما برای انتقال به کاربر باید آن را کپی کنید.' },
      { name: 'mustChange', label: 'کاربر در اولین ورود رمز را تغییر دهد', type: 'switch', col: 12, default: true }
    ]);
    const m = HRM.modal({
      title: 'بازنشانی رمز عبور', size: 'narrow', body: form.el,
      footer: h`<button class="btn btn-primary" data-save>بازنشانی رمز</button>`
    });
    m.el.querySelector('[data-save]').addEventListener('click', async () => {
      const v = form.validate();
      if (!v.valid) return form.setErrors(v.errors);
      const res = await HRM.post('/users/' + userId + '/reset-password', { password: v.values.password, mustChange: !!v.values.mustChange });
      HRM.toast('رمز عبور بازنشانی شد.', 'success');
      if (res.password) HRM.copy(res.password, 'رمز جدید کپی شد');
      m.close(); if (onDone) onDone();
    });
  }

  /* --------------------------------------------------- نقش‌ها */
  async function roles() {
    const data = await HRM.get('/roles');
    const page = h`<div></div>`;
    page.appendChild(h`<div class="page-head">
      <div><div class="title">نقش‌ها و دسترسی‌ها</div>
        <div class="desc">تعریف نقش‌های سازمانی و تعیین دقیق دسترسی‌ها — ${HRM.num(data.roles.length)} نقش، ${HRM.num(data.permissions.reduce((s, g) => s + g.permissions.length, 0))} مجوز</div></div>
      <div class="actions">
        <a class="btn btn-ghost" href="#/users">${HRM.raw(HRM.icon('users', 16))} کاربران</a>
        ${HRM.can('roles.manage') ? h`<button class="btn btn-primary" data-new>${HRM.raw(HRM.icon('plus', 16))} نقش جدید</button>` : ''}
      </div>
    </div>`);

    data.roles.forEach((role) => {
      const count = (role.permissions || []).includes('*') ? data.permissions.reduce((s, g) => s + g.permissions.length, 0) : (role.permissions || []).length;
      page.appendChild(h`<div class="card mb-3">
        <div class="row between wrap gap-2">
          <div class="row gap-2" style="align-items:flex-start">
            <span class="avatar ${roleColor(role.color)}">${HRM.raw(HRM.icon(role.system ? 'shield-check' : 'puzzle', 16))}</span>
            <div>
              <div class="bold">${role.name} ${role.system ? HRM.badge('سیستمی', 'violet') : ''} ${role.key === 'super_admin' ? HRM.badge('دسترسی کامل', 'lemon') : ''}</div>
              <div class="text-sm muted">${role.description || ''}</div>
              <div class="row gap-1 wrap mt-1">
                ${HRM.badge(HRM.num(count) + ' مجوز', 'sky')}
                ${HRM.badge(HRM.num(role.userCount) + ' کاربر', 'outline')}
                <span class="text-xs muted ltr">${role.key}</span>
              </div>
            </div>
          </div>
          ${HRM.can('roles.manage') ? h`<div class="row gap-1">
            <button class="btn btn-sm btn-soft" data-edit="${role.id}">${HRM.raw(HRM.icon('edit', 14))} ویرایش دسترسی‌ها</button>
            ${role.system ? '' : h`<button class="btn btn-sm btn-danger" data-del="${role.id}">${HRM.raw(HRM.icon('trash', 14))}</button>`}
          </div>` : ''}
        </div>
      </div>`);
    });

    page.querySelector('[data-new]')?.addEventListener('click', () => roleEditor(null, data, () => HRM.render()));
    page.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      roleEditor(data.roles.find((r) => r.id === b.dataset.edit), data, () => HRM.render());
    }));
    page.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const ok = await HRM.confirm({ title: 'حذف نقش', message: 'این نقش حذف می‌شود. کاربرانی که این نقش را دارند، دسترسی مربوطه را از دست می‌دهند.', danger: true, confirmText: 'حذف' });
      if (!ok) return;
      await HRM.del('/roles/' + b.dataset.del);
      HRM.toast('نقش حذف شد.', 'success');
      HRM.render();
    }));
    return page;
  }

  function roleEditor(role, data, onDone) {
    const allPerms = data.permissions;
    const selected = new Set(role ? role.permissions || [] : []);
    const isSuper = role && role.key === 'super_admin';

    const wrap = h`<div>
      <div class="grid grid-2 mb-2">
        <div class="field"><label class="label">نام نقش <span class="req">*</span></label>
          <input class="input" data-role-name value="${role ? role.name : ''}" placeholder="مثال: کارشناس جذب"></div>
        <div class="field"><label class="label">رنگ</label>
          <select class="select" data-role-color>${['violet', 'mint', 'sky', 'peach', 'lemon', 'rose'].map((c) => `<option value="${c}" ${role && role.color === c ? 'selected' : ''}>${({ violet: 'بنفش', mint: 'سبز', sky: 'آبی', peach: 'نارنجی', lemon: 'زرد', rose: 'صورتی' })[c]}</option>`).join('')}</select></div>
        <div class="field" style="grid-column:span 2"><label class="label">توضیح نقش</label>
          <input class="input" data-role-desc value="${role ? (role.description || '') : ''}" placeholder="این نقش برای چه کسانی مناسب است؟"></div>
      </div>
      ${isSuper ? `<div class="insight lemon mb-2"><span class="ic">${HRM.raw(HRM.icon('alert', 16))}</span><div class="text-sm">نقش «مدیر ارشد سامانه» به‌طور خودکار به همه بخش‌ها دسترسی دارد و قابل محدودسازی نیست.</div></div>` : ''}
      <div class="card" style="box-shadow:none;background:var(--surface-2)">
        <div class="row between mb-2">
          <div><div class="bold text-sm">مجوزها</div><div class="text-xs muted">دسترسی‌های این نقش را انتخاب کنید.</div></div>
          <div class="row gap-1">
            <button class="btn btn-sm btn-ghost" data-all>انتخاب همه</button>
            <button class="btn btn-sm btn-ghost" data-none>حذف همه</button>
          </div>
        </div>
        <div data-perms class="col gap-2">${allPerms.map((g) => h`<div>
          <div class="row between"><span class="bold text-xs">${g.title || g.group || g.module}</span>
            <button class="btn btn-sm btn-ghost" data-group-toggle="${g.key || g.module || g.title}">همه</button></div>
          <div class="grid grid-2" style="gap:4px">
            ${(g.permissions || []).map((p) => h`<label class="checkline ${selected.has(p.key) || isSuper ? 'checked' : ''}" style="padding:7px 10px">
              <input type="checkbox" data-perm="${p.key}" ${selected.has(p.key) || isSuper ? 'checked' : ''} ${isSuper ? 'disabled' : ''}>
              <span class="text-xs grow">${p.title}</span></label>`)}
          </div>
        </div>`)}</div>
      </div>
    </div>`;

    const m = HRM.modal({
      title: role ? `ویرایش نقش «${role.name}»` : 'ایجاد نقش جدید',
      size: 'wide', body: wrap,
      footer: h`<button class="btn btn-primary" data-save>${role ? 'ذخیره تغییرات' : 'ایجاد نقش'}</button>`
    });

    const syncChecked = () => wrap.querySelectorAll('.checkline input').forEach((inp) => inp.closest('.checkline').classList.toggle('checked', inp.checked));
    wrap.querySelectorAll('[data-perm]').forEach((inp) => inp.addEventListener('change', syncChecked));
    wrap.querySelector('[data-all]')?.addEventListener('click', () => { wrap.querySelectorAll('[data-perm]:not(:disabled)').forEach((i) => { i.checked = true; }); syncChecked(); });
    wrap.querySelector('[data-none]')?.addEventListener('click', () => { wrap.querySelectorAll('[data-perm]:not(:disabled)').forEach((i) => { i.checked = false; }); syncChecked(); });
    wrap.querySelectorAll('[data-group-toggle]').forEach((b) => b.addEventListener('click', () => {
      const group = b.closest('div');
      const inputs = Array.from(group.querySelectorAll('[data-perm]')).filter((i) => !i.disabled);
      const allOn = inputs.every((i) => i.checked);
      inputs.forEach((i) => { i.checked = !allOn; });
      syncChecked();
    }));

    m.el.querySelector('[data-save]').addEventListener('click', async () => {
      const name = wrap.querySelector('[data-role-name]').value.trim();
      if (!name) return HRM.toast('نام نقش را وارد کنید.', 'warning');
      const perms = Array.from(wrap.querySelectorAll('[data-perm]:checked')).map((i) => i.dataset.perm);
      const payload = { name, description: wrap.querySelector('[data-role-desc]').value.trim(), color: wrap.querySelector('[data-role-color]').value, permissions: perms };
      try {
        if (role) await HRM.put('/roles/' + role.id, payload);
        else await HRM.post('/roles', payload);
        HRM.toast('نقش ذخیره شد.', 'success');
        m.close(); if (onDone) onDone();
      } catch (e) { /* پیام خطا */ }
    });
  }

  HRM.registerModule({
    key: 'users', title: 'کاربران', order: 40,
    routes: {
      '/users': (ctx) => users(null, ctx.query),
      '/roles': () => roles()
    }
  });
})();
