/* ── کلاینت موقعیت‌های شغلی ────────────────────────────────────── */
(function () {
  'use strict';
  const h = HRM.h;
  const MBTI_TYPES = ['ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP', 'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'];

  async function renderList(params, query) {
    const qs = new URLSearchParams({ page: query.page || 1, q: query.q || '', status: query.status || '', department: query.department || '' });
    const data = await HRM.get('/jobs?' + qs.toString());
    const page = h`<div></div>`;

    page.appendChild(h`<div class="page-head">
      <div><div class="title">موقعیت‌های شغلی</div><div class="desc">تعریف و مدیریت موقعیت‌های استخدامی سازمان</div></div>
      <div class="actions">
        ${HRM.can('jobs.create') ? h`<button class="btn btn-primary" data-new>${HRM.raw(HRM.icon('plus', 16))} موقعیت شغلی جدید</button>` : ''}
      </div>
    </div>`);

    page.appendChild(h`<div class="grid grid-kpi mb-3">
      ${HRM.statCard({ label: 'کل موقعیت‌ها', value: HRM.num(data.stats.total), icon: 'briefcase', color: 'violet' })}
      ${HRM.statCard({ label: 'در حال جذب', value: HRM.num(data.stats.open), icon: 'radio', color: 'mint' })}
      ${HRM.statCard({ label: 'پیش‌نویس', value: HRM.num(data.stats.draft), icon: 'edit', color: 'lemon' })}
      ${HRM.statCard({ label: 'بسته‌شده', value: HRM.num(data.stats.closed), icon: 'archive', color: 'sky' })}
    </div>`);

    page.appendChild(h`<div class="card mb-3"><div class="row gap-2 wrap">
      <div class="search-box grow" style="min-width:200px">${HRM.raw(HRM.icon('search', 16))}
        <input data-search placeholder="جست‌وجوی عنوان، واحد یا مهارت…" value="${query.q || ''}"></div>
      <select class="select" data-status style="max-width:170px">
        <option value="">همه وضعیت‌ها</option>
        ${(data.options.statuses || []).map((s) => h`<option value="${s.key}" ${query.status === s.key ? 'selected' : ''}>${s.title}</option>`)}
      </select>
      <select class="select" data-dept style="max-width:190px">
        <option value="">همه واحدها</option>
        ${(data.stats.departments || []).map((dep) => h`<option value="${dep}" ${query.department === dep ? 'selected' : ''}>${dep}</option>`)}
      </select>
    </div></div>`);

    page.appendChild(HRM.card({
      title: 'فهرست موقعیت‌ها', subtitle: `${HRM.num(data.total)} مورد`,
      body: HRM.table({
        columns: [
          { title: 'عنوان موقعیت', render: (r) => h`<div class="text-sm bold">${r.title}</div><div class="text-xs muted">${r.department || ''}${r.location ? ' — ' + r.location : ''}</div>` },
          { title: 'نوع', render: (r) => HRM.badge(r.type || '—', 'sky') },
          { title: 'ظرفیت', render: (r) => HRM.num(r.openings) },
          { title: 'وضعیت', render: (r) => HRM.statusBadge(r.status, r.statusTitle, r.statusColor) },
          { title: 'متقاضیان', render: (r) => h`<div class="text-sm">${HRM.num((r.counts || {}).total || 0)} نفر</div><div class="text-xs muted">${HRM.num((r.counts || {}).active || 0)} در جریان</div>` },
          { title: 'آزمون', render: (r) => (r.assessment && r.assessment.mbti && r.assessment.mbti.enabled ? HRM.badge('فعال', 'mint') : HRM.badge('غیرفعال', 'outline')) },
          { title: 'در پورتال', render: (r) => (r.showInPortal && r.status === 'open' ? HRM.badge('منتشرشده', 'sky', true) : HRM.badge('منتشر نشده', 'outline')) },
          { title: 'مهلت', render: (r) => (r.deadline ? HRM.jdate(r.deadline) : '—') },
          { title: '', class: 'actions-cell', render: (r) => h`<div class="row gap-1">
            <button class="btn btn-sm btn-ghost" data-view="${r.id}" title="مشاهده و ویرایش">${HRM.raw(HRM.icon('eye', 14))}</button>
            ${HRM.can('jobs.qr') ? h`<button class="btn btn-sm btn-ghost" data-qr="${r.id}" title="کد QR">${HRM.raw(HRM.icon('qr', 14))}</button>` : ''}
            ${HRM.can('jobs.create') ? h`<button class="btn btn-sm btn-ghost" data-dup="${r.id}" title="کپی موقعیت">${HRM.raw(HRM.icon('copy', 14))}</button>` : ''}
          </div>` }
        ],
        rows: data.rows,
        empty: HRM.empty('موقعیت شغلی‌ای یافت نشد', 'با دکمه «موقعیت شغلی جدید» اولین موقعیت را تعریف کنید.')
      })
    }));
    if (data.pages > 1) page.appendChild(HRM.pagination({ page: data.page, pages: data.pages, total: data.total, perPage: data.perPage, onChange: (p) => HRM.go('/jobs?page=' + p) }));

    const search = page.querySelector('[data-search]');
    search.addEventListener('input', HRM.debounce(() => HRM.go('/jobs?q=' + encodeURIComponent(search.value.trim())), 500));
    page.querySelector('[data-status]').addEventListener('change', (e) => HRM.go('/jobs?status=' + e.target.value));
    page.querySelector('[data-dept]').addEventListener('change', (e) => HRM.go('/jobs?department=' + encodeURIComponent(e.target.value)));
    page.querySelector('[data-new]') && page.querySelector('[data-new]').addEventListener('click', () => HRM.go('/jobs/new'));
    page.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => HRM.go('/jobs/' + b.dataset.view)));
    page.querySelectorAll('[data-qr]').forEach((b) => b.addEventListener('click', () => openQr(b.dataset.qr)));
    page.querySelectorAll('[data-dup]').forEach((b) => b.addEventListener('click', async () => {
      const ok = await HRM.confirm({ title: 'کپی موقعیت شغلی', message: 'یک نسخه پیش‌نویس از این موقعیت ساخته شود؟', confirmText: 'کپی کن' });
      if (!ok) return;
      const res = await HRM.post('/jobs/' + b.dataset.dup + '/duplicate', {});
      HRM.toast('نسخه کپی ایجاد شد.', 'success');
      HRM.go('/jobs/' + res.job.id);
    }));
    return page;
  }

  async function renderEditor(params) {
    const isNew = !params.id || params.id === 'new';
    let job = null, formSchema = null, counts = {};
    if (!isNew) {
      const data = await HRM.get('/jobs/' + params.id);
      job = data.job; formSchema = data.formSchema; counts = job.counts || {};
    }
    const options = await HRM.get('/jobs/meta/options');
    const schema = formSchema || (await HRM.get('/form')).schema;
    const ja = (job && job.assessment && job.assessment.mbti) || {};
    const overrides = (job && job.formOverrides) || {};
    let overridesForJob = { required: (overrides.required || []).slice(), hidden: (overrides.hidden || []).slice(), steps: (overrides.steps || []).slice() };

    const form = HRM.form([
      { name: 'title', label: 'عنوان موقعیت شغلی', type: 'text', required: true, col: 8, default: job ? job.title : '', placeholder: 'مثال: کارشناس فروش' },
      { name: 'department', label: 'واحد سازمانی', type: 'text', required: true, col: 4, default: job ? job.department : '', placeholder: 'مثال: فروش' },
      { name: 'location', label: 'محل کار', type: 'text', col: 4, default: job ? job.location : '', placeholder: 'تهران / دورکاری' },
      { name: 'type', label: 'نوع همکاری', type: 'select', col: 4, default: job ? job.type : '', options: options.types || [] },
      { name: 'level', label: 'سطح', type: 'select', col: 4, default: job ? job.level : '', options: options.levels || [] },
      { name: 'openings', label: 'ظرفیت جذب', type: 'number', col: 4, default: job ? job.openings : 1 },
      { name: 'status', label: 'وضعیت', type: 'select', col: 4, default: job ? job.status : 'open', options: (options.statuses || []).map((s) => ({ value: s.key, label: s.title })) },
      { name: 'salaryRange', label: 'بازه حقوق', type: 'text', col: 4, default: job ? job.salaryRange : '', placeholder: 'مثال: ۱۵ تا ۲۵ میلیون' },
      { name: 'deadline', label: 'مهلت دریافت درخواست', type: 'date', col: 4, default: job && job.deadline ? String(job.deadline).slice(0, 10) : '' },
      { name: 'summary', label: 'خلاصه آگهی', type: 'textarea', col: 12, rows: 2, default: job ? job.summary : '', placeholder: 'یک پاراگراف کوتاه که در کارت آگهی نمایش داده می‌شود' },
      { name: 'description', label: 'شرح موقعیت شغلی', type: 'textarea', col: 12, rows: 4, default: job ? job.description : '' },
      { name: 'requirements', label: 'شرایط احراز (هر مورد در یک خط)', type: 'textarea', col: 6, rows: 4, default: job ? (job.requirements || []).join('\n') : '' },
      { name: 'responsibilities', label: 'شرح وظایف (هر مورد در یک خط)', type: 'textarea', col: 6, rows: 4, default: job ? (job.responsibilities || []).join('\n') : '' },
      { name: 'tags', label: 'برچسب‌ها (با کاما)', type: 'text', col: 6, default: job ? (job.tags || []).join('، ') : '' },
      { name: 'showInPortal', label: 'نمایش در پورتال استخدام', type: 'switch', col: 6, default: job ? job.showInPortal !== false : true, placeholder: 'در صفحه فرصت‌های شغلی منتشر شود' },
      { name: 'mbtiEnabled', label: 'آزمون شخصیت‌شناسی برای این موقعیت', type: 'switch', col: 6, default: ja.enabled !== false, placeholder: 'متقاضیان به آزمون هدایت شوند' },
      { name: 'mbtiRequired', label: 'تکمیل آزمون الزامی باشد', type: 'switch', col: 6, default: !!ja.required },
      { name: 'idealTypes', label: 'تیپ‌های شخصیتی آرمانی', type: 'checkbox', col: 12, default: job ? (job.idealTypes || []) : [], options: MBTI_TYPES }
    ]);

    const page = h`<div></div>`;
    page.appendChild(h`<div class="page-head">
      <div>
        <div class="title">${isNew ? 'موقعیت شغلی جدید' : job.title}</div>
        <div class="desc">${isNew ? 'اطلاعات موقعیت شغلی و تنظیمات آزمون را تعیین کنید.' : 'ویرایش مشخصات، تنظیمات فرم و آگهی این موقعیت'}</div>
      </div>
      <div class="actions">
        <button class="btn btn-ghost" data-back>بازگشت به فهرست</button>
        ${!isNew && HRM.can('jobs.publish') ? h`<button class="btn btn-soft" data-toggle-status>${job.status === 'open' ? 'بستن موقعیت' : 'بازکردن موقعیت'}</button>` : ''}
        ${!isNew && HRM.can('jobs.qr') ? h`<button class="btn btn-soft" data-qr>${HRM.raw(HRM.icon('qr', 16))} کد QR</button>` : ''}
        ${!isNew && HRM.can('jobs.delete') ? h`<button class="btn btn-ghost danger" data-del>حذف</button>` : ''}
        ${HRM.can(isNew ? 'jobs.create' : 'jobs.update') ? h`<button class="btn btn-primary" data-save>ذخیره</button>` : ''}
      </div>
    </div>`);

    if (!isNew) {
      page.appendChild(h`<div class="grid grid-kpi mb-3">
        ${HRM.statCard({ label: 'کل متقاضیان', value: HRM.num(counts.total || 0), icon: 'users', color: 'violet' })}
        ${HRM.statCard({ label: 'در جریان', value: HRM.num(counts.active || 0), icon: 'activity', color: 'sky' })}
        ${HRM.statCard({ label: 'درخواست جدید', value: HRM.num(counts.new || 0), icon: 'inbox', color: 'lemon' })}
        ${HRM.statCard({ label: 'استخدام‌شده', value: HRM.num(counts.hired || 0), icon: 'user-check', color: 'mint' })}
      </div>`);
    }

    const tabs = HRM.tabs([
      { title: 'مشخصات موقعیت', icon: 'briefcase' },
      { title: 'تنظیمات فرم استخدام', icon: 'layout-template' },
      { title: 'آگهی و پورتال', icon: 'globe' }
    ], {
      onChange(i, panel) {
        if (i === 0) panel.appendChild(HRM.card({ title: 'مشخصات پایه', body: form.el }));
        if (i === 1) panel.appendChild(formOverridesCard(schema, overridesForJob, (v) => { overridesForJob = v; }));
        if (i === 2) panel.appendChild(portalCard(job, isNew));
      }
    });
    page.appendChild(tabs.el);

    const save = async () => {
      const v = form.validate();
      if (!v.valid) { form.setErrors(v.errors); tabs.select(0); return; }
      const extra = overridesForJob || {};
      const payload = {
        title: v.values.title, department: v.values.department, location: v.values.location,
        type: v.values.type, level: v.values.level, openings: Number(v.values.openings) || 1,
        status: v.values.status, salaryRange: v.values.salaryRange, deadline: v.values.deadline || null,
        summary: v.values.summary, description: v.values.description,
        requirements: String(v.values.requirements || '').split('\n').map((s) => s.trim()).filter(Boolean),
        responsibilities: String(v.values.responsibilities || '').split('\n').map((s) => s.trim()).filter(Boolean),
        tags: String(v.values.tags || '').split(/[,،]/).map((s) => s.trim()).filter(Boolean),
        showInPortal: !!v.values.showInPortal,
        idealTypes: v.values.idealTypes || [],
        assessment: { mbti: { enabled: !!v.values.mbtiEnabled, required: !!v.values.mbtiRequired } },
        formOverrides: { required: extra.required || [], hidden: extra.hidden || [], steps: extra.steps || [] }
      };
      const res = isNew ? await HRM.post('/jobs', payload) : await HRM.put('/jobs/' + job.id, payload);
      HRM.toast('موقعیت شغلی ذخیره شد.', 'success');
      if (isNew) HRM.go('/jobs/' + res.job.id);
      else HRM.go('/jobs');
    };
    page.querySelector('[data-save]').addEventListener('click', save);
    page.querySelector('[data-back]').addEventListener('click', () => HRM.go('/jobs'));
    page.querySelector('[data-qr]') && page.querySelector('[data-qr]').addEventListener('click', () => openQr(job.id));
    page.querySelector('[data-del]') && page.querySelector('[data-del]').addEventListener('click', async () => {
      const ok = await HRM.confirm({ title: 'حذف موقعیت شغلی', message: 'این موقعیت حذف شود؟ درخواست‌های ثبت‌شده حفظ می‌شوند اما ارتباط آن‌ها با موقعیت قطع می‌شود.', danger: true, confirmText: 'حذف کن' });
      if (!ok) return;
      await HRM.del('/jobs/' + job.id);
      HRM.toast('موقعیت حذف شد.', 'success');
      HRM.go('/jobs');
    });
    page.querySelector('[data-toggle-status]') && page.querySelector('[data-toggle-status]').addEventListener('click', async () => {
      const next = job.status === 'open' ? 'closed' : 'open';
      await HRM.post('/jobs/' + job.id + '/status', { status: next });
      HRM.toast(next === 'open' ? 'موقعیت باز شد.' : 'موقعیت بسته شد.', 'success');
      HRM.render();
    });
    return page;
  }

  /* تنظیمات فرم استخدام برای این موقعیت */
  function formOverridesCard(schema, current, onChange) {
    const required = new Set(current.required || []);
    const hidden = new Set(current.hidden || []);
    const wrapper = h`<div class="card">
      <div class="row between wrap gap-2 mb-2">
        <div><div class="card-title">تنظیمات اختصاصی فرم استخدام</div>
          <div class="text-sm muted">برای این موقعیت می‌توانید برخی فیلدها را اجباری یا پنهان کنید. فرم پایه در «فرم‌ساز استخدام» قابل ویرایش است.</div></div>
      </div>
      <div data-overrides class="col gap-2"></div>
    </div>`;
    const box = wrapper.querySelector('[data-overrides]');
    (schema.steps || []).forEach((step) => {
      const card = h`<div class="card pad-sm" style="box-shadow:none">
        <div class="bold text-sm mb-1">${step.title}</div>
        <div class="row gap-2 wrap">
          ${(step.fields || []).filter((f) => !['heading', 'note'].includes(f.type)).map((f) => h`<div class="row gap-2" style="padding:6px 10px;border:1px solid var(--border);border-radius:12px;align-items:center">
            <span class="text-xs">${f.label}</span>
            <label class="text-xs nowrap"><input type="checkbox" data-req="${step.key}.${f.name}" ${required.has(step.key + '.' + f.name) ? 'checked' : ''}> اجباری</label>
            <label class="text-xs nowrap"><input type="checkbox" data-hide="${step.key}.${f.name}" ${hidden.has(step.key + '.' + f.name) ? 'checked' : ''}> پنهان</label>
          </div>`)}
        </div>
      </div>`;
      box.appendChild(card);
    });
    wrapper.addEventListener('change', () => {
      if (onChange) onChange({
        required: Array.from(wrapper.querySelectorAll('[data-req]')).filter((i) => i.checked).map((i) => i.dataset.req),
        hidden: Array.from(wrapper.querySelectorAll('[data-hide]')).filter((i) => i.checked).map((i) => i.dataset.hide),
        steps: []
      });
    });
    return wrapper;
  }

  function portalCard(job, isNew) {
    if (isNew) return HRM.card({ title: 'آگهی و پورتال', body: HRM.empty('پس از ذخیره', 'لینک آگهی و کد QR پس از ایجاد موقعیت نمایش داده می‌شود.') });
    const base = location.origin;
    const applyUrl = base + (job.applyUrl || '');
    const publicUrl = base + (job.publicUrl || '');
    const card = HRM.card({
      title: 'انتشار در پورتال استخدام',
      body: h`<div>
        ${HRM.fieldRow('وضعیت انتشار', job.showInPortal !== false && job.status === 'open' ? HRM.badge('منتشرشده در پورتال', 'mint', true) : HRM.badge('منتشر نشده', 'outline'))}
        ${HRM.fieldRow('صفحه آگهی', h`<a class="ltr text-sm" href="${publicUrl}" target="_blank">${publicUrl}</a>`)}
        ${HRM.fieldRow('لینک مستقیم فرم', h`<a class="ltr text-sm" href="${applyUrl}" target="_blank">${applyUrl}</a>`)}
        <div class="row gap-2 mt-2">
          <button class="btn btn-soft btn-sm" data-copy-apply>کپی لینک فرم</button>
          <button class="btn btn-soft btn-sm" data-copy-public>کپی لینک آگهی</button>
          ${HRM.can('jobs.qr') ? h`<button class="btn btn-soft btn-sm" data-qr>نمایش کد QR</button>` : ''}
        </div>
        <div class="mt-3" data-qr-box></div>
      </div>`
    });
    card.querySelector('[data-copy-apply]').addEventListener('click', () => HRM.copy(applyUrl, 'لینک فرم کپی شد.'));
    card.querySelector('[data-copy-public]').addEventListener('click', () => HRM.copy(publicUrl, 'لینک آگهی کپی شد.'));
    card.querySelector('[data-qr]') && card.querySelector('[data-qr]').addEventListener('click', () => openQr(job.id));
    return card;
  }

  async function openQr(jobId) {
    const data = await HRM.get('/jobs/' + jobId + '/qr');
    const url = location.origin + (data.applyUrl || '');
    const modal = HRM.modal({
      title: 'کد QR فرم استخدام',
      subtitle: data.qrTitle || '',
      size: 'narrow',
      body: h`<div class="text-center">
        <div class="qr-box" data-qr style="display:inline-block;padding:12px;background:#fff;border-radius:18px;border:1px solid var(--border)"></div>
        <div class="mt-2 text-sm bold">${data.job.title}</div>
        <div class="text-xs muted">${data.job.department || ''}</div>
        <div class="muted-box mt-3 text-xs ltr" style="word-break:break-all">${url}</div>
        <div class="col gap-1 mt-3 text-start">${(data.instructions || []).map((t) => h`<div class="row gap-1 text-sm"><span>•</span><span>${t}</span></div>`)}</div>
      </div>`,
      footer: h`<div class="row gap-2">
        <button class="btn btn-soft" data-copy>کپی لینک</button>
        <button class="btn btn-soft" data-download>دانلود تصویر QR</button>
        <button class="btn btn-primary" data-print>چاپ</button>
      </div>`
    });
    const box = modal.el.querySelector('[data-qr]');
    const qr = HRM.qr(url, { size: 240 });
    box.appendChild(qr);
    modal.el.querySelector('[data-copy]').addEventListener('click', () => HRM.copy(url, 'لینک فرم کپی شد.'));
    modal.el.querySelector('[data-download]').addEventListener('click', () => {
      const canvas = box.querySelector('canvas');
      const img = box.querySelector('img');
      const href = canvas ? canvas.toDataURL('image/png') : (img ? img.src : null);
      if (!href) return HRM.toast('تصویر QR در دسترس نیست.', 'error');
      const a = document.createElement('a');
      a.href = href; a.download = 'qr-' + (data.job.slug || data.job.id) + '.png'; a.click();
    });
    modal.el.querySelector('[data-print]').addEventListener('click', () => {
      const win = window.open('', '_blank', 'width=420,height=620');
      win.document.write(`<html dir="rtl"><head><title>${data.job.title}</title>
        <style>body{font-family:Tahoma,sans-serif;text-align:center;padding:28px}h1{font-size:18px;margin:12px 0 4px}p{color:#666;font-size:12px}</style></head>
        <body><div>${box.innerHTML}</div><h1>${data.job.title}</h1><p>${data.job.department || ''}</p>
        <p>برای تکمیل فرم استخدام، کد QR را با دوربین گوشی اسکن کنید.</p><p style="direction:ltr;font-size:11px">${url}</p></body></html>`);
      win.document.close();
      setTimeout(() => win.print(), 400);
    });
  }

  HRM.registerModule({
    key: 'jobs', title: 'موقعیت‌های شغلی', order: 20,
    routes: {
      '/jobs': (ctx) => renderList(null, ctx.query),
      '/jobs/:id': (ctx) => renderEditor(ctx.params)
    }
  });
})();
