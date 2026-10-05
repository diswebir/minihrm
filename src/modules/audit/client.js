/* ── کلاینت لاگ فعالیت‌ها (حسابرسی) ────────────────────────────── */
(function () {
  'use strict';
  const h = HRM.h;
  const LEVELS = { info: { title: 'عادی', color: 'sky' }, warn: { title: 'هشدار', color: 'lemon' }, error: { title: 'خطا', color: 'rose' } };

  async function render(params, query) {
    const qs = new URLSearchParams({
      page: query.page || 1, q: query.q || '', action: query.action || '',
      entity: query.entity || '', actorId: query.actorId || '',
      from: query.from || '', to: query.to || ''
    });
    const data = await HRM.get('/audit?' + qs.toString());
    const page = h`<div></div>`;

    page.appendChild(h`<div class="page-head">
      <div><div class="title">لاگ فعالیت‌ها</div><div class="desc">ثبت کامل اقدامات کاربران جهت پیگیری و پاسخ‌گویی</div></div>
      <div class="actions">
        ${HRM.can('audit.manage') ? h`<button class="btn btn-ghost" data-prune>${HRM.raw(HRM.icon('trash', 16))} پاک‌سازی قدیمی</button>` : ''}
      </div>
    </div>`);

    page.appendChild(h`<div class="grid grid-kpi mb-3">
      ${HRM.statCard({ label: 'کل رویدادها', value: HRM.num(data.stats.total), icon: 'list', color: 'violet' })}
      ${HRM.statCard({ label: 'رویدادهای امروز', value: HRM.num(data.stats.today), icon: 'calendar', color: 'sky' })}
      ${HRM.statCard({ label: 'هشدارها', value: HRM.num(data.stats.warnings), icon: 'alert', color: 'lemon', hint: 'اقدامات حساس مانند تغییر دسترسی' })}
      ${HRM.statCard({ label: 'نتیجه فیلتر', value: HRM.num(data.total), icon: 'filter', color: 'mint' })}
    </div>`);

    /* فیلترها */
    const entityOptions = [{ value: '', label: 'همه بخش‌ها' }].concat((data.stats.byEntity || []).map((e) => ({ value: e.entity, label: ENTITY_TITLES[e.entity] || e.entity })));
    const actorOptions = [{ value: '', label: 'همه کاربران' }].concat((data.users || []).map((u) => ({ value: u.id, label: u.name })));
    const filters = h`<div class="card mb-3"><div class="row gap-2 wrap">
      <div class="search-box grow" style="min-width:200px">${HRM.raw(HRM.icon('search', 16))}
        <input data-search placeholder="جست‌وجو در عنوان، کاربر یا اقدام…" value="${query.q || ''}"></div>
      <select class="select" data-entity style="max-width:200px">
        ${entityOptions.map((o) => h`<option value="${o.value}" ${query.entity === o.value ? 'selected' : ''}>${o.label}</option>`)}
      </select>
      <select class="select" data-actor style="max-width:200px">
        ${actorOptions.map((o) => h`<option value="${o.value}" ${query.actorId === o.value ? 'selected' : ''}>${o.label}</option>`)}
      </select>
      <select class="select" data-action style="max-width:220px">
        <option value="">همه اقدامات</option>
        ${(data.actions || []).map((a) => h`<option value="${a}" ${query.action === a ? 'selected' : ''}>${a}</option>`)}
      </select>
      <input type="text" class="input" data-from placeholder="از تاریخ (۱۴۰۴/۰۱/۰۱)" value="${query.from || ''}" style="max-width:190px">
      <input type="text" class="input" data-to placeholder="تا تاریخ" value="${query.to || ''}" style="max-width:190px">
      <button class="btn btn-ghost" data-clear>حذف فیلترها</button>
    </div></div>`;
    page.appendChild(filters);

    /* جدول */
    page.appendChild(HRM.card({
      title: 'رویدادها', subtitle: `${HRM.num(data.total)} رویداد`,
      body: HRM.table({
        columns: [
          { title: 'زمان', render: (r) => h`<div class="text-sm">${HRM.jtime(r.at)}</div><div class="text-xs muted">${HRM.ago(r.at)}</div>` },
          { title: 'کاربر', render: (r) => h`<div class="user-cell">${HRM.avatar(r.actorName || 'سیستم', { size: 'sm', color: r.actorId ? 'violet' : 'sky' })}<div><div class="text-sm">${r.actorName || 'سیستم'}</div><div class="text-xs muted">${r.actorRole || ''}</div></div></div>` },
          { title: 'رویداد', render: (r) => h`<div class="text-sm">${r.title}</div><code class="text-xs muted ltr">${r.action}</code>` },
          { title: 'بخش', render: (r) => HRM.badge(ENTITY_TITLES[r.entity] || r.entity || '—', 'outline') },
          { title: 'سطح', render: (r) => HRM.badge((LEVELS[r.level] || LEVELS.info).title, (LEVELS[r.level] || LEVELS.info).color) },
          { title: 'آی‌پی', render: (r) => h`<span class="text-xs ltr muted">${r.ip || '—'}</span>` },
          { title: '', class: 'actions-cell', render: (r) => h`<button class="btn btn-sm btn-ghost" data-view="${r.id}">${HRM.raw(HRM.icon('eye', 14))}</button>` }
        ],
        rows: data.rows,
        empty: HRM.empty('رویدادی یافت نشد', 'با تغییر فیلترها دوباره جست‌وجو کنید.')
      })
    }));
    if (data.pages > 1) page.appendChild(HRM.pagination({ page: data.page, pages: data.pages, total: data.total, perPage: data.perPage, onChange: (p) => go(query, { page: p }) }));

    /* تعامل */
    const set = (patch) => go(query, Object.assign({ page: 1 }, patch));
    const search = filters.querySelector('[data-search]');
    search.addEventListener('input', HRM.debounce(() => set({ q: search.value.trim() }), 500));
    filters.querySelector('[data-entity]').addEventListener('change', (e) => set({ entity: e.target.value }));
    filters.querySelector('[data-actor]').addEventListener('change', (e) => set({ actorId: e.target.value }));
    filters.querySelector('[data-action]').addEventListener('change', (e) => set({ action: e.target.value }));
    filters.querySelector('[data-clear]').addEventListener('click', () => HRM.go('/audit'));
    [['[data-from]', 'from'], ['[data-to]', 'to']].forEach(([sel, key]) => {
      const input = filters.querySelector(sel);
      HRM.attachDatePicker(input);
      input.addEventListener('change', () => set({ [key]: input.value }));
    });
    page.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', async () => {
      const btn = b;
      btn.disabled = true;
      try {
        const res = await HRM.get('/audit/' + btn.dataset.view);
        detailModal(res.entry);
      } finally { btn.disabled = false; }
    }));
    const prune = page.querySelector('[data-prune]');
    if (prune) prune.addEventListener('click', async () => {
      const form = HRM.form([{ name: 'days', label: 'حذف رویدادهای قدیمی‌تر از (روز)', type: 'number', col: 12, default: 365 }]);
      const m = HRM.modal({
        title: 'پاک‌سازی لاگ حسابرسی', size: 'narrow', body: form.el,
        footer: h`<button class="btn btn-danger" data-do>پاک‌سازی کن</button>`
      });
      m.el.querySelector('[data-do]').addEventListener('click', async () => {
        const v = form.validate();
        if (!v.valid) return form.setErrors(v.errors);
        const ok = await HRM.confirm({ title: 'تأیید', message: 'رویدادهای قدیمی حذف شوند؟ این عملیات بازگشت‌پذیر نیست.', danger: true, confirmText: 'حذف کن' });
        if (!ok) return;
        const res = await HRM.post('/audit/prune', { days: Number(v.values.days) });
        HRM.toast(`${HRM.num(res.removed)} رویداد قدیمی‌تر از ${HRM.num(res.days)} روز حذف شد.`, 'success');
        m.close(); HRM.render();
      });
    });
    return page;
  }

  function go(query, patch) {
    const merged = Object.assign({}, query, patch);
    const qs = new URLSearchParams();
    Object.keys(merged).forEach((k) => { if (merged[k] !== undefined && merged[k] !== '' && merged[k] !== null) qs.set(k, merged[k]); });
    const s = qs.toString();
    HRM.go('/audit' + (s ? '?' + s : ''));
  }

  function detailModal(entry) {
    if (!entry) return HRM.toast('رکورد یافت نشد.', 'error');
    HRM.modal({
      title: 'جزئیات رویداد', size: '',
      body: h`<div>
        ${HRM.fieldRow('عنوان', entry.title)}
        ${HRM.fieldRow('اقدام', h`<code class="ltr text-xs">${entry.action}</code>`)}
        ${HRM.fieldRow('کاربر', `${entry.actorName} ${entry.actorRole ? '— ' + entry.actorRole : ''}`)}
        ${HRM.fieldRow('بخش', ENTITY_TITLES[entry.entity] || entry.entity || '—')}
        ${entry.entityId ? HRM.fieldRow('شناسه مورد', h`<code class="ltr text-xs">${entry.entityId}</code>`) : ''}
        ${HRM.fieldRow('زمان', HRM.jtime(entry.at) + ' — ' + HRM.jdate(entry.at))}
        ${HRM.fieldRow('سطح', HRM.badge((LEVELS[entry.level] || LEVELS.info).title, (LEVELS[entry.level] || LEVELS.info).color))}
        ${HRM.fieldRow('آی‌پی', h`<span class="ltr text-xs">${entry.ip || '—'}</span>`)}
        ${entry.ua ? HRM.fieldRow('مرورگر', h`<span class="text-xs muted ltr" style="word-break:break-all">${entry.ua}</span>`) : ''}
        ${entry.meta ? h`<div class="mt-2"><div class="text-sm muted mb-1">جزئیات فنی</div>
          <pre class="muted-box text-xs ltr" style="white-space:pre-wrap;direction:ltr;max-height:260px;overflow:auto">${JSON.stringify(entry.meta, null, 2)}</pre></div>` : ''}
      </div>`
    });
  }

  const ENTITY_TITLES = {
    application: 'درخواست استخدام', applicant: 'متقاضی', job: 'موقعیت شغلی', assessment: 'آزمون شخصیتی',
    interview: 'مصاحبه', user: 'کاربر', role: 'نقش و دسترسی', settings: 'تنظیمات', module: 'ماژول',
    sms: 'پیامک', sms_template: 'قالب پیامک', form: 'فرم استخدام', system: 'سیستم', report: 'گزارش', auth: 'احراز هویت', portal: 'پورتال'
  };

  HRM.registerModule({
    key: 'audit', title: 'لاگ فعالیت‌ها', order: 80,
    routes: { '/audit': (ctx) => render(null, ctx.query) }
  });
})();
