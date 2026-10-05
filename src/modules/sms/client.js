/* ── کلاینت پیامک ──────────────────────────────────────────────── */
(function () {
  'use strict';
  const h = HRM.h;

  async function render(params, query) {
    const tab = query.tab || 'logs';
    const canSend = HRM.can('sms.send');
    const canSettings = HRM.can('sms.settings');
    const page = h`<div></div>`;

    const tabs = HRM.tabs([
      { title: 'صندوق خروجی', icon: 'list' },
      { title: 'قالب‌های پیام', icon: 'layout-template' },
      { title: 'تنظیمات سرویس', icon: 'settings' }
    ], {
      initial: tab === 'templates' ? 1 : tab === 'settings' ? 2 : 0,
      onChange(i, panel) {
        panel.appendChild(HRM.skeleton(3, 48));
        const pending = i === 0 ? logsTab(query) : i === 1 ? templatesTab(canSettings) : settingsTab(canSettings);
        Promise.resolve(pending).then((node) => {
          panel.innerHTML = '';
          if (node) panel.appendChild(node);
        }).catch((err) => {
          panel.innerHTML = '';
          panel.appendChild(HRM.empty('خطا در بارگذاری', err.message || ''));
        });
      }
    });

    page.appendChild(h`<div class="page-head">
      <div><div class="title">پیامک</div><div class="desc">ارسال پیام به متقاضیان، قالب‌های پیامک و تنظیمات سرویس IPPanel</div></div>
      <div class="actions" data-head-actions></div>
    </div>`);

    const actions = page.querySelector('[data-head-actions]');
    if (canSend) {
      const b = h`<button class="btn btn-primary">${HRM.raw(HRM.icon('message-square', 16))} ارسال پیام</button>`;
      b.addEventListener('click', () => bulkModal(() => HRM.render()));
      actions.appendChild(b);
    }
    if (canSettings) {
      const b = h`<button class="btn btn-ghost">${HRM.raw(HRM.icon('coins', 16))} اعتبار حساب</button>`;
      b.addEventListener('click', () => creditModal(b));
      actions.appendChild(b);
    }
    page.appendChild(tabs.el);
    return page;
  }

  /* ------------------------------------------------ صندوق خروجی */
  async function logsTab(query) {
    const wrap = h`<div></div>`;
    const data = await HRM.get('/sms/logs?' + new URLSearchParams({ page: query.page || 1, q: query.q || '', status: query.status || '' }).toString());
    const st = data.settings || {};

    if (st.testMode) {
      wrap.appendChild(h`<div class="insight lemon mb-3"><span class="ic">${HRM.raw(HRM.icon('alert', 16))}</span>
        <div class="text-sm"><span class="bold">حالت آزمایشی پیامک فعال است</span> — پیام‌ها ارسال واقعی نمی‌شوند و فقط در این لاگ ثبت می‌گردند. برای ارسال واقعی، از زبانه «تنظیمات سرویس» اطلاعات IPPanel را وارد و حالت آزمایشی را غیرفعال کنید.</div></div>`);
    }
    wrap.appendChild(h`<div class="grid grid-kpi mb-3">
      ${HRM.statCard({ label: 'کل پیام‌ها', value: HRM.num(data.stats.total), icon: 'message-square', color: 'violet' })}
      ${HRM.statCard({ label: 'ارسال موفق', value: HRM.num(data.stats.sent), icon: 'check-circle', color: 'mint' })}
      ${HRM.statCard({ label: 'ناموفق', value: HRM.num(data.stats.failed), icon: 'x-circle', color: 'rose' })}
      ${HRM.statCard({ label: 'شبیه‌سازی‌شده', value: HRM.num(data.stats.simulated), icon: 'cpu', color: 'lemon', hint: 'در حالت آزمایشی' })}
      ${HRM.statCard({ label: 'امروز', value: HRM.num(data.stats.today), icon: 'calendar', color: 'sky' })}
    </div>`);

    wrap.appendChild(h`<div class="card mb-3"><div class="row gap-2 wrap">
      <div class="search-box grow" style="min-width:200px">${HRM.raw(HRM.icon('search', 16))}
        <input data-search placeholder="جست‌وجوی شماره یا متن پیام…" value="${query.q || ''}"></div>
      <select class="select" data-status style="max-width:180px">
        <option value="">همه وضعیت‌ها</option>
        <option value="sent" ${query.status === 'sent' ? 'selected' : ''}>موفق</option>
        <option value="failed" ${query.status === 'failed' ? 'selected' : ''}>ناموفق</option>
        <option value="simulated" ${query.status === 'simulated' ? 'selected' : ''}>آزمایشی</option>
      </select>
      ${HRM.can('sms.settings') ? h`<button class="btn btn-ghost" data-prune>${HRM.raw(HRM.icon('trash', 16))} پاک‌سازی لاگ</button>` : ''}
      ${HRM.can('sms.settings') ? h`<button class="btn btn-soft" data-test>${HRM.raw(HRM.icon('send', 16))} ارسال آزمایشی</button>` : ''}
    </div></div>`);

    wrap.appendChild(HRM.card({
      title: 'لاگ پیام‌ها', subtitle: `${HRM.num(data.total)} پیام`,
      body: HRM.table({
        columns: [
          { title: 'گیرنده', render: (r) => h`<div class="text-sm ltr">${r.to || '—'}</div><div class="text-xs muted">${r.recipientName || ''}</div>` },
          { title: 'قالب', render: (r) => HRM.badge(r.templateTitle || r.templateKey || 'دستی', 'sky') },
          { title: 'متن پیام', render: (r) => h`<div class="text-sm clamp-2" style="max-width:360px">${r.text}</div>` },
          { title: 'وضعیت', render: (r) => HRM.badge(r.statusTitle || r.status, r.status === 'sent' ? 'mint' : r.status === 'failed' ? 'rose' : 'lemon', true) },
          { title: 'زمان', render: (r) => h`<div class="text-xs">${HRM.jtime(r.createdAt)}</div><div class="text-xs muted">${HRM.ago(r.createdAt)}</div>` },
          { title: '', class: 'actions-cell', render: (r) => h`<button class="btn btn-sm btn-ghost" data-view="${r.id}">${HRM.raw(HRM.icon('eye', 14))}</button>` }
        ],
        rows: data.rows,
        empty: HRM.empty('پیامی ارسال نشده', 'پس از ارسال پیامک، لاگ آن در این بخش نمایش داده می‌شود.')
      })
    }));
    if (data.pages > 1) wrap.appendChild(HRM.pagination({ page: data.page, pages: data.pages, total: data.total, perPage: data.perPage, onChange: (p) => HRM.go('/sms?page=' + p) }));

    const search = wrap.querySelector('[data-search]');
    search.addEventListener('input', HRM.debounce(() => HRM.go('/sms?q=' + encodeURIComponent(search.value.trim())), 500));
    wrap.querySelector('[data-status]').addEventListener('change', (e) => HRM.go('/sms?status=' + e.target.value));
    wrap.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
      const r = data.rows.find((x) => x.id === b.dataset.view);
      HRM.modal({
        title: 'جزئیات پیام', size: 'narrow',
        body: h`<div>
          ${HRM.fieldRow('گیرنده', h`<span class="ltr">${r.to}</span>`)}
          ${HRM.fieldRow('قالب', r.templateTitle || r.templateKey)}
          ${HRM.fieldRow('وضعیت', HRM.badge(r.statusTitle || r.status, r.status === 'sent' ? 'mint' : r.status === 'failed' ? 'rose' : 'lemon'))}
          ${HRM.fieldRow('زمان', HRM.jtime(r.createdAt))}
          <div class="mt-2"><div class="text-sm muted mb-1">متن پیام</div>
            <div class="muted-box text-sm" style="white-space:pre-line">${r.text}</div></div>
          ${r.error ? h`<div class="insight rose mt-2"><span class="ic">${HRM.raw(HRM.icon('alert', 14))}</span><div class="text-xs">${r.error}</div></div>` : ''}
        </div>`
      });
    }));
    const pruneBtn = wrap.querySelector('[data-prune]');
    if (pruneBtn) pruneBtn.addEventListener('click', async () => {
      const days = st.logRetentionDays || 90;
      const ok = await HRM.confirm({ title: 'پاک‌سازی لاگ پیامک', message: `پیامک‌های قدیمی‌تر از ${HRM.num(days)} روز حذف شوند؟`, danger: true, confirmText: 'پاک‌سازی' });
      if (!ok) return;
      const res = await HRM.post('/sms/prune', {});
      HRM.toast(`پاک‌سازی انجام شد (${HRM.num(res.removed || 0)} مورد).`, 'success');
      HRM.render();
    });
    const testBtn = wrap.querySelector('[data-test]');
    if (testBtn) testBtn.addEventListener('click', () => testModal((res) => {
      if (res && res.simulated) HRM.toast('پیام در حالت آزمایشی ثبت شد (ارسال واقعی انجام نشد).', 'info');
      HRM.render();
    }));
    return wrap;
  }

  /* ------------------------------------------------ قالب‌ها */
  async function templatesTab(canSettings) {
    const wrap = h`<div></div>`;
    const tpl = await HRM.get('/sms/templates');
    if (!canSettings) wrap.appendChild(h`<div class="insight sky mb-3"><span class="ic">${HRM.raw(HRM.icon('info', 16))}</span><div class="text-sm">برای ویرایش قالب‌ها به مجوز «مدیریت پیامک» نیاز دارید.</div></div>`);
    wrap.appendChild(HRM.card({
      title: 'قالب‌های پیامک',
      subtitle: 'متغیرهای قابل استفاده در متن پیام: ' + (tpl.variables || []).map((v) => v.key).join('، '),
      body: h`<div class="grid grid-2">${(tpl.templates || []).map((t) => h`<div class="card pad-sm" style="box-shadow:none;border-color:var(--border)">
        <div class="row between mb-1">
          <div class="bold text-sm">${t.title}</div>
          <div class="row gap-1">
            ${HRM.badge(t.enabled ? 'فعال' : 'غیرفعال', t.enabled ? 'mint' : 'outline')}
            ${canSettings && t.editable !== false ? h`<button class="btn btn-sm btn-soft" data-tpl="${t.key}">${HRM.raw(HRM.icon('edit', 14))} ویرایش</button>` : ''}
          </div>
        </div>
        <div class="text-xs muted" style="white-space:pre-line">${t.text}</div>
        ${t.patternCode ? h`<div class="text-xs mt-1">کد پترن: <code class="ltr">${t.patternCode}</code></div>` : h`<div class="text-xs muted mt-1">بدون کد پترن — به‌صورت متن آزاد ارسال می‌شود</div>`}
      </div>`)}</div>`
    }));
    wrap.querySelectorAll('[data-tpl]').forEach((b) => b.addEventListener('click', () => {
      const t = tpl.templates.find((x) => x.key === b.dataset.tpl);
      tplModal(t, () => HRM.render());
    }));
    return wrap;
  }

  /* ------------------------------------------------ تنظیمات سرویس */
  async function settingsTab(canSettings) {
    const data = await HRM.get('/sms/templates');
    const s = data.settings || {};
    const wrap = h`<div></div>`;
    if (!canSettings) {
      wrap.appendChild(HRM.empty('دسترسی محدود', 'برای مشاهده و تغییر تنظیمات سرویس پیامک به مجوز «مدیریت پیامک» نیاز دارید.'));
      return wrap;
    }
    wrap.appendChild(h`<div class="insight sky mb-3"><span class="ic">${HRM.raw(HRM.icon('info', 16))}</span>
      <div class="text-sm">این سامانه با سرویس <span class="bold">IPPanel Edge</span> (آدرس پایه <code class="ltr">https://edge.ippanel.com/v1</code>) یکپارچه است. کلید API را از پنل IPPanel خود دریافت کنید. تا زمانی که «حالت آزمایشی» فعال است، هیچ پیام واقعی ارسال نمی‌شود.</div></div>`);

    const form = HRM.form([
      { name: 'provider', label: 'ارائه‌دهنده پیامک', type: 'select', col: 6, default: s.provider || 'console', options: [{ value: 'ippanel', label: 'IPPanel (Edge)' }, { value: 'console', label: 'کنسول (بدون ارسال واقعی)' }] },
      { name: 'testMode', label: 'حالت آزمایشی (عدم ارسال واقعی)', type: 'switch', col: 6, default: s.testMode !== false, placeholder: 'پیام‌ها فقط ثبت می‌شوند' },
      { name: 'apiKey', label: 'کلید API', type: 'text', col: 8, default: s.apiKeyMasked || '', help: s.apiKeyMasked ? 'برای تغییر، کلید جدید را وارد کنید؛ در غیر این صورت خالی بگذارید.' : 'از پنل IPPanel → بخش وب‌سرویس‌ها → کلیدهای دسترسی', placeholder: 'نمونه: abcdef123456…' },
      { name: 'clearApiKey', label: 'حذف کلید ذخیره‌شده', type: 'switch', col: 4, default: false },
      { name: 'senderNumber', label: 'شماره فرستنده', type: 'text', col: 6, default: s.senderNumber || '', placeholder: '+983000505' },
      { name: 'defaultPatternCode', label: 'کد پترن پیش‌فرض', type: 'text', col: 6, default: s.defaultPatternCode || '', help: 'برای ارسال قالب‌محور (پترن) در IPPanel' },
      { name: 'baseUrl', label: 'آدرس پایه سرویس', type: 'text', col: 6, default: s.baseUrl || 'https://edge.ippanel.com/v1' },
      { name: 'logRetentionDays', label: 'مدت نگهداری لاگ (روز)', type: 'number', col: 6, default: s.logRetentionDays || 90 }
    ]);
    const card = HRM.card({
      title: 'تنظیمات سرویس پیامک', subtitle: 'اتصال به IPPanel و مدیریت کلید دسترسی',
      actions: h`<button class="btn btn-sm btn-soft" data-conn-test>${HRM.raw(HRM.icon('plug', 14))} بررسی اتصال</button>`,
      body: form.el
    });
    const save = h`<button class="btn btn-primary mt-2">${HRM.raw(HRM.icon('check', 16))} ذخیره تنظیمات پیامک</button>`;
    card.querySelector('.card-body').appendChild(save);
    save.addEventListener('click', async () => {
      const v = form.values();
      await HRM.put('/sms/settings', {
        provider: v.provider, testMode: v.testMode, apiKey: v.apiKey, clearApiKey: v.clearApiKey,
        senderNumber: v.senderNumber, defaultPatternCode: v.defaultPatternCode, baseUrl: v.baseUrl,
        logRetentionDays: Number(v.logRetentionDays) || 90
      });
      HRM.toast('تنظیمات پیامک ذخیره شد.', 'success');
      HRM.render();
    });
    card.querySelector('[data-conn-test]').addEventListener('click', async () => {
      const btn = card.querySelector('[data-conn-test]');
      btn.disabled = true;
      try {
        const res = await HRM.get('/sms/credit');
        if (res.credit === null || res.credit === undefined) {
          HRM.toast(res.testMode ? 'حالت آزمایشی فعال است؛ اتصال واقعی بررسی نشد.' : 'اتصال برقرار نشد یا کلید API تنظیم نشده است.', res.testMode ? 'info' : 'error');
        } else {
          HRM.toast('اتصال برقرار است — اعتبار: ' + HRM.num(Math.floor(res.credit)) + ' ریال', 'success');
        }
      } catch (e) { /* پیام خطا نمایش داده شد */ } finally { btn.disabled = false; }
    });
    wrap.appendChild(card);
    return wrap;
  }

  /* ------------------------------------------------ دیالوگ‌ها */
  function tplModal(t, onDone) {
    const form = HRM.form([
      { name: 'patternCode', label: 'کد پترن (IPPanel)', type: 'text', col: 12, default: t.patternCode, help: 'در صورت خالی بودن، پیام به‌صورت متن آزاد ارسال می‌شود.' },
      { name: 'text', label: 'متن پیام', type: 'textarea', required: true, col: 12, rows: 4, default: t.text },
      { name: 'enabled', label: 'این قالب فعال باشد', type: 'switch', col: 12, default: t.enabled !== false }
    ]);
    const m = HRM.modal({
      title: 'ویرایش قالب «' + t.title + '»',
      body: form.el,
      footer: h`<button class="btn btn-primary" data-save>ذخیره قالب</button>`
    });
    m.el.querySelector('[data-save]').addEventListener('click', async () => {
      const v = form.validate();
      if (!v.valid) return form.setErrors(v.errors);
      await HRM.put('/sms/templates/' + t.key, { text: v.values.text, patternCode: v.values.patternCode, enabled: v.values.enabled });
      HRM.toast('قالب پیامک ذخیره شد.', 'success');
      m.close(); if (onDone) onDone();
    });
  }

  function testModal(onDone) {
    const form = HRM.form([
      { name: 'mobile', label: 'شماره موبایل', type: 'tel', required: true, col: 12, placeholder: '09123456789' },
      { name: 'text', label: 'متن پیام آزمایشی', type: 'textarea', col: 12, rows: 3, default: 'این یک پیام آزمایشی از سامانه منابع انسانی است.' }
    ]);
    const m = HRM.modal({
      title: 'ارسال پیام آزمایشی', subtitle: 'برای اطمینان از صحت تنظیمات سرویس پیامک',
      body: form.el,
      footer: h`<button class="btn btn-primary" data-send>ارسال پیام آزمایشی</button>`
    });
    m.el.querySelector('[data-send]').addEventListener('click', async () => {
      const v = form.validate();
      if (!v.valid) return form.setErrors(v.errors);
      try {
        const res = await HRM.post('/sms/test', v.values);
        if (res.error) HRM.toast('ارسال انجام نشد: ' + res.error, 'error');
        else HRM.toast(res.simulated ? 'پیام در حالت آزمایشی ثبت شد.' : 'پیام آزمایشی ارسال شد.', 'success');
        m.close(); if (onDone) onDone(res);
      } catch (e) { /* پیام خطا */ }
    });
  }

  async function creditModal(btn) {
    btn.disabled = true;
    try {
      const res = await HRM.get('/sms/credit');
      HRM.modal({
        title: 'اعتبار حساب پیامک', size: 'narrow',
        body: h`<div>
          ${HRM.fieldRow('ارائه‌دهنده', res.provider || '—')}
          ${HRM.fieldRow('حالت آزمایشی', res.testMode ? HRM.badge('فعال', 'lemon') : HRM.badge('غیرفعال', 'mint'))}
          ${res.credit === null || res.credit === undefined ? h`<div class="insight lemon mt-2"><span class="ic">${HRM.raw(HRM.icon('alert', 14))}</span><div class="text-xs">اعتبار حساب در دسترس نیست (کلید API تنظیم نشده یا حالت آزمایشی فعال است).</div></div>`
            : HRM.fieldRow('اعتبار باقی‌مانده', HRM.num(Math.floor(res.credit)) + ' ریال')}
        </div>`
      });
    } finally { btn.disabled = false; }
  }

  async function bulkModal(onDone) {
    const [jobs, templates] = await Promise.all([
      HRM.get('/jobs?perPage=100').catch(() => ({ rows: [] })),
      HRM.get('/sms/templates').catch(() => ({ templates: [] }))
    ]);
    const form = HRM.form([
      { name: 'mode', label: 'مخاطبان', type: 'radio', required: true, col: 12, default: 'job', options: [
        { value: 'job', label: 'متقاضیان یک موقعیت شغلی' },
        { value: 'custom', label: 'شماره‌های دستی' }
      ] },
      { name: 'jobId', label: 'موقعیت شغلی', type: 'select', col: 6, options: (jobs.rows || []).map((j) => ({ value: j.id, label: j.title })) },
      { name: 'status', label: 'فیلتر وضعیت (اختیاری)', type: 'select', col: 6, options: [
        { value: '', label: 'همه وضعیت‌ها' },
        { value: 'new', label: 'ثبت جدید' }, { value: 'screening', label: 'غربالگری' }, { value: 'assessment', label: 'آزمون' },
        { value: 'interview', label: 'مصاحبه' }, { value: 'evaluation', label: 'ارزیابی' }, { value: 'offer', label: 'پیشنهاد شغلی' }, { value: 'hired', label: 'استخدام‌شده' }
      ] },
      { name: 'recipients', label: 'شماره‌ها', type: 'textarea', col: 12, rows: 3, placeholder: '۰۹۱۲۳۴۵۶۷۸۹، ۰۹۳۵۱۱۱۲۲۳۳', help: 'با کاما، فاصله یا خط جدید جدا کنید.' },
      { name: 'templateKey', label: 'قالب پیام (اختیاری)', type: 'select', col: 12, options: (templates.templates || []).map((t) => ({ value: t.key, label: t.title })) },
      { name: 'text', label: 'متن پیام', type: 'textarea', required: true, col: 12, rows: 4, help: 'متغیرها: {name}، {job}، {company}، {code}' }
    ]);
    const m = HRM.modal({
      title: 'ارسال پیامک', size: '',
      body: h`<div>${form.el}<div class="insight lemon mt-2"><span class="ic">${HRM.raw(HRM.icon('alert', 14))}</span>
        <div class="text-xs">حداکثر ۲۰۰ گیرنده در هر ارسال. شماره‌های تکراری و نامعتبر نادیده گرفته می‌شوند.</div></div></div>`,
      footer: h`<button class="btn btn-primary" data-send>ارسال پیامک‌ها</button>`
    });
    const sel = m.el.querySelector('[name="templateKey"]');
    sel.addEventListener('change', () => {
      const t = (templates.templates || []).find((x) => x.key === sel.value);
      const ta = m.el.querySelector('[name="text"]');
      if (t && ta) ta.value = t.text;
    });
    m.el.querySelector('[data-send]').addEventListener('click', async () => {
      const v = form.validate();
      if (!v.valid) return form.setErrors(v.errors);
      const payload = { text: v.values.text };
      if (v.values.mode === 'job') {
        if (!v.values.jobId) return HRM.toast('موقعیت شغلی را انتخاب کنید.', 'warning');
        payload.jobId = v.values.jobId;
        if (v.values.status) payload.status = v.values.status;
      } else {
        const list = String(v.values.recipients || '').split(/[,،\s\n;]+/).map((x) => x.trim()).filter(Boolean);
        if (!list.length) return HRM.toast('حداقل یک شماره موبایل وارد کنید.', 'warning');
        payload.recipients = list;
      }
      const btn = m.el.querySelector('[data-send]');
      btn.disabled = true; btn.textContent = 'در حال ارسال…';
      try {
        const res = await HRM.post('/sms/send', payload);
        HRM.toast(`ارسال انجام شد — موفق: ${HRM.num(res.sent || 0)}${res.failed ? '، ناموفق: ' + HRM.num(res.failed) : ''}${res.simulated ? ' (حالت آزمایشی)' : ''}`, res.sent ? 'success' : 'warning');
        m.close(); if (onDone) onDone();
      } catch (e) { btn.disabled = false; btn.textContent = 'ارسال پیامک‌ها'; }
    });
  }

  HRM.registerModule({
    key: 'sms', title: 'پیامک', order: 50,
    routes: { '/sms': (ctx) => render(null, ctx.query) }
  });
})();
