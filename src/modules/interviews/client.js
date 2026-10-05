/* ── کلاینت مصاحبه‌ها ──────────────────────────────────────────── */
(function () {
  'use strict';
  const h = HRM.h;

  /* ============================================================ فهرست */
  async function renderList(params, query) {
    const qs = new URLSearchParams();
    ['page', 'q', 'status', 'jobId', 'from', 'to'].forEach((k) => { if (query[k]) qs.set(k, query[k]); });
    const data = await HRM.get('/interviews?' + qs.toString());
    const page = h`<div></div>`;
    const st = data.stats || {};
    const options = data.options || {};

    page.appendChild(h`<div class="page-head">
      <div><div class="title">مصاحبه‌ها</div><div class="desc">زمان‌بندی، امتیازدهی و پیگیری مصاحبه‌های استخدامی</div></div>
      <div class="actions">
        ${HRM.can('interviews.schedule') ? h`<button class="btn btn-primary" data-new>${HRM.raw(HRM.icon('calendar-plus', 16))} زمان‌بندی مصاحبه</button>` : ''}
      </div>
    </div>`);

    page.appendChild(h`<div class="grid grid-kpi mb-3">
      ${HRM.statCard({ label: 'کل مصاحبه‌ها', value: HRM.num(st.total), icon: 'message-circle', color: 'violet' })}
      ${HRM.statCard({ label: 'برنامه‌ریزی‌شده', value: HRM.num(st.scheduled), icon: 'calendar', color: 'sky', hint: st.today ? HRM.num(st.today) + ' مورد امروز' : '' })}
      ${HRM.statCard({ label: 'پیش‌رو', value: HRM.num(st.upcoming), icon: 'clock', color: 'lemon' })}
      ${HRM.statCard({ label: 'انجام‌شده', value: HRM.num(st.completed), icon: 'check-circle', color: 'mint', hint: st.avgScore === null || st.avgScore === undefined ? '' : 'میانگین امتیاز: ' + HRM.num(st.avgScore) + '٪' })}
      ${HRM.statCard({ label: 'لغوشده', value: HRM.num(st.canceled), icon: 'x-circle', color: 'rose' })}
    </div>`);

    page.appendChild(h`<div class="card mb-3"><div class="row gap-2 wrap">
      <div class="search-box grow" style="min-width:200px">${HRM.raw(HRM.icon('search', 16))}
        <input data-search placeholder="جست‌وجوی نام متقاضی یا مصاحبه‌گر…" value="${query.q || ''}"></div>
      <select class="select" data-status style="max-width:170px">
        <option value="">همه وضعیت‌ها</option>
        ${(options.statuses || []).map((s) => h`<option value="${s.key}" ${query.status === s.key ? 'selected' : ''}>${s.title}</option>`)}
      </select>
      <select class="select" data-job style="max-width:220px">
        <option value="">همه موقعیت‌ها</option>
        ${(data.jobs || []).map((j) => h`<option value="${j.id}" ${query.jobId === j.id ? 'selected' : ''}>${j.title}</option>`)}
      </select>
      ${(query.q || query.status || query.jobId || query.from) ? h`<a class="btn btn-ghost" href="#/interviews">حذف فیلترها</a>` : ''}
    </div></div>`);

    page.appendChild(HRM.card({
      title: 'فهرست مصاحبه‌ها', subtitle: `${HRM.num(data.total)} مورد`,
      body: HRM.table({
        columns: [
          { title: 'متقاضی', render: (r) => h`<div class="user-cell">${HRM.avatar(r.applicantName || '—', { size: 'sm' })}<div>
            <div class="text-sm bold">${r.applicantName || '—'}</div><div class="text-xs muted">${r.jobTitle || ''}</div></div></div>` },
          { title: 'زمان', render: (r) => h`<div class="text-sm">${HRM.jdate(r.scheduledAt)}</div><div class="text-xs muted">${HRM.jtime(r.scheduledAt)} — ${HRM.num(r.duration || 0)} دقیقه</div>` },
          { title: 'نوع / نحوه', render: (r) => h`<div class="text-sm">${r.type || '—'}</div><div class="text-xs muted">${r.mode || ''}${r.location ? ' — ' + r.location : ''}</div>` },
          { title: 'مصاحبه‌گران', render: (r) => ((r.interviewers || []).length ? h`<div class="row gap-1 wrap">${r.interviewers.map((x) => HRM.badge(x.name || x, 'outline'))}</div>` : h`<span class="text-xs muted">—</span>`) },
          { title: 'وضعیت', render: (r) => HRM.badge(r.statusTitle || r.status, r.status === 'completed' ? 'mint' : r.status === 'canceled' ? 'rose' : 'sky') },
          { title: 'امتیاز', render: (r) => (r.scorecard && r.scorecard.percent !== undefined ? h`<div><span class="bold">${HRM.num(r.scorecard.percent)}٪</span><div class="text-xs muted">${r.scorecard.level || ''}</div></div>` : h`<span class="text-xs muted">ثبت نشده</span>`) },
          { title: '', class: 'actions-cell', render: (r) => h`<div class="row gap-1">
            ${HRM.can('interviews.score') && r.status !== 'canceled' ? h`<button class="btn btn-sm btn-soft" data-score="${r.id}">امتیاز</button>` : ''}
            <button class="btn btn-sm btn-ghost" data-view="${r.id}">${HRM.raw(HRM.icon('eye', 14))}</button>
          </div>` }
        ],
        rows: data.rows,
        empty: HRM.empty('مصاحبه‌ای ثبت نشده', 'از پرونده متقاضی یا دکمه «زمان‌بندی مصاحبه» اولین مصاحبه را ثبت کنید.')
      })
    }));
    if (data.pages > 1) page.appendChild(HRM.pagination({ page: data.page, pages: data.pages, total: data.total, perPage: data.perPage, onChange: (p) => go({ page: p }) }));

    const go = (patch) => {
      const merged = Object.assign({}, query, patch);
      const q = new URLSearchParams();
      Object.keys(merged).forEach((k) => { if (merged[k]) q.set(k, merged[k]); });
      const s = q.toString();
      HRM.go('/interviews' + (s ? '?' + s : ''));
    };
    const search = page.querySelector('[data-search]');
    search.addEventListener('input', HRM.debounce(() => go({ q: search.value.trim(), page: 1 }), 500));
    page.querySelector('[data-status]').addEventListener('change', (e) => go({ status: e.target.value, page: 1 }));
    page.querySelector('[data-job]').addEventListener('change', (e) => go({ jobId: e.target.value, page: 1 }));
    page.querySelector('[data-new]') && page.querySelector('[data-new]').addEventListener('click', () => openScheduleModal(options, () => HRM.render()));
    page.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => openDetail(b.dataset.view, options)));
    page.querySelectorAll('[data-score]').forEach((b) => b.addEventListener('click', () => openScoreModal(b.dataset.score, options, () => HRM.render())));
    return page;
  }

  /* ============================================================ زمان‌بندی */
  async function openScheduleModal(options, onDone) {
    const apps = await HRM.get('/applications?perPage=200&status=interview').catch(() => ({ rows: [] }));
    let all = apps.rows || [];
    if (!all.length) all = (await HRM.get('/applications?perPage=200').catch(() => ({ rows: [] }))).rows || [];
    const form = HRM.form([
      { name: 'applicationId', label: 'متقاضی', type: 'select', required: true, col: 12, options: all.map((a) => ({ value: a.id, label: `${a.name} — ${a.jobTitle || ''} (${a.statusTitle || ''})` })) },
      { name: 'scheduledDate', label: 'تاریخ', type: 'date', required: true, col: 4 },
      { name: 'scheduledTime', label: 'ساعت', type: 'text', required: true, col: 4, placeholder: '۱۰:۳۰' },
      { name: 'duration', label: 'مدت (دقیقه)', type: 'number', col: 4, default: 45 },
      { name: 'type', label: 'نوع مصاحبه', type: 'select', col: 4, options: options.types || [], default: (options.types || [])[0] },
      { name: 'mode', label: 'نحوه برگزاری', type: 'select', col: 4, options: options.modes || [], default: (options.modes || [])[0] },
      { name: 'location', label: 'محل / لینک جلسه', type: 'text', col: 4 },
      { name: 'interviewerIds', label: 'مصاحبه‌کنندگان', type: 'checkbox', col: 12, options: (options.users || []).map((u) => ({ value: u.id, label: u.name })) }
    ]);
    const m = HRM.modal({
      title: 'زمان‌بندی مصاحبه', size: '',
      body: h`<div>${form.el}<div class="hint mt-1">پس از ثبت، پیامک دعوت به مصاحبه برای متقاضی ارسال می‌شود (در صورت فعال بودن).</div></div>`,
      footer: h`<button class="btn btn-primary" data-save>ثبت مصاحبه</button>`
    });
    m.el.querySelector('[data-save]').addEventListener('click', async () => {
      const v = form.validate();
      if (!v.valid) return form.setErrors(v.errors);
      const dt = HRM.jalali.parse(v.values.scheduledDate);
      if (!dt) return HRM.toast('تاریخ را به‌صورت ۱۴۰۴/۰۱/۰۱ وارد کنید.', 'error');
      const [hh, mm] = String(v.values.scheduledTime).replace(/[^\d:]/g, '').split(':');
      dt.setHours(Number(hh) || 9, Number(mm) || 0, 0, 0);
      await HRM.post('/interviews', {
        applicationId: v.values.applicationId, scheduledAt: dt.toISOString(),
        duration: Number(v.values.duration) || 45, type: v.values.type, mode: v.values.mode,
        location: v.values.location, interviewerIds: v.values.interviewerIds || []
      });
      HRM.toast('مصاحبه ثبت شد و پیامک دعوت ارسال گردید.', 'success');
      m.close(); if (onDone) onDone();
    });
  }

  /* ============================================================ جزئیات */
  async function openDetail(id, options) {
    const d = await HRM.get('/interviews/' + id);
    const iv = d.interview;
    const sc = iv.scorecard;
    const modal = HRM.modal({
      title: `${iv.type || 'مصاحبه'} — ${iv.applicantName || ''}`,
      subtitle: `${HRM.jdate(iv.scheduledAt)} ساعت ${HRM.jtime(iv.scheduledAt)} | ${iv.mode || ''}${iv.location ? ' — ' + iv.location : ''}`,
      size: '',
      body: h`<div>
        <div class="row gap-2 wrap mb-2">
          ${HRM.badge(iv.statusTitle || iv.status, iv.status === 'completed' ? 'mint' : iv.status === 'canceled' ? 'rose' : 'sky')}
          ${iv.jobTitle ? HRM.badge(iv.jobTitle, 'outline') : ''}
          ${HRM.badge(HRM.num(iv.duration || 0) + ' دقیقه', 'outline')}
          ${iv.smsSent ? HRM.badge('پیامک دعوت ارسال شد' + (iv.smsSimulated ? ' (آزمایشی)' : ''), 'lemon') : ''}
        </div>
        ${(iv.interviewers || []).length ? h`<div class="row gap-1 wrap mb-2">${iv.interviewers.map((x) => HRM.badge(x.name || x, 'violet'))}</div>` : ''}
        ${iv.notes ? h`<div class="muted-box text-sm mb-2">${iv.notes}</div>` : ''}
        ${(d.suggestedQuestions || []).length ? h`<div>
          <div class="text-sm bold mb-1">پرسش‌های پیشنهادی برای این متقاضی</div>
          ${d.suggestedQuestions.map((q) => h`<div class="card pad-sm mb-1" style="box-shadow:none">
            <div class="text-sm">${q.question || q.text}</div>
            <div class="text-xs muted mt-1">${q.purpose || ''} ${q.reason ? '— ' + q.reason : ''}</div>
          </div>`)}
        </div>` : ''}
        ${sc ? h`<div class="divider"></div>
          <div class="text-sm bold mb-1">کارنامه امتیازدهی</div>
          <div class="row between"><span class="bold" style="font-size:1.4rem">${HRM.num(sc.percent)}٪</span>${HRM.badge(sc.level || '', sc.percent >= 85 ? 'mint' : sc.percent >= 70 ? 'sky' : sc.percent >= 55 ? 'lemon' : 'rose')}</div>
          <div class="bar-track mt-1"><div class="bar-fill mint" style="width:${sc.percent}%"></div></div>
          <div class="grid grid-2 mt-2">${(options.criteria || []).map((c) => (sc.criteria && sc.criteria[c.key] ? HRM.fieldRow(c.label, HRM.num(sc.criteria[c.key]) + ' از ۵') : ''))}</div>
          ${sc.strengths ? h`<div class="text-sm mt-2"><span class="bold">نقاط قوت: </span>${sc.strengths}</div>` : ''}
          ${sc.weaknesses ? h`<div class="text-sm mt-1"><span class="bold">نقاط ضعف: </span>${sc.weaknesses}</div>` : ''}
          ${sc.summary ? h`<div class="text-sm mt-1" style="white-space:pre-line">${sc.summary}</div>` : ''}
          <div class="mt-2">${HRM.fieldRow('جمع‌بندی', HRM.badge(sc.decisionTitle || sc.decision || '—', sc.decision === 'approve' ? 'mint' : sc.decision === 'reject' ? 'rose' : 'sky'))}</div>
        ` : ''}
      </div>`,
      footer: h`<div class="row gap-2">
        ${iv.applicationId ? h`<button class="btn btn-soft" data-app>مشاهده پرونده</button>` : ''}
        ${HRM.can('interviews.score') ? h`<button class="btn btn-primary" data-score>${sc ? 'ویرایش امتیاز' : 'ثبت امتیاز'}</button>` : ''}
        ${HRM.can('interviews.schedule') ? h`<button class="btn btn-ghost danger" data-cancel>${iv.status === 'canceled' ? 'حذف' : 'لغو مصاحبه'}</button>` : ''}
      </div>`
    });
    const el = modal.el;
    el.querySelector('[data-app]') && el.querySelector('[data-app]').addEventListener('click', () => { modal.close(); HRM.go('/applications/' + iv.applicationId); });
    el.querySelector('[data-score]') && el.querySelector('[data-score]').addEventListener('click', () => { modal.close(); openScoreModal(id, options, () => HRM.render()); });
    el.querySelector('[data-cancel]') && el.querySelector('[data-cancel]').addEventListener('click', async () => {
      const ok = await HRM.confirm({ title: 'لغو مصاحبه', message: 'این مصاحبه لغو شود؟', danger: true, confirmText: 'لغو کن' });
      if (!ok) return;
      await HRM.del('/interviews/' + id);
      HRM.toast('مصاحبه لغو شد.', 'success');
      modal.close(); HRM.render();
    });
  }

  /* ============================================================ امتیازدهی */
  async function openScoreModal(id, options, onDone) {
    const d = await HRM.get('/interviews/' + id);
    const iv = d.interview;
    const existing = iv.scorecard || {};
    const criteria = options.criteria || [];
    const scale = options.scoreScale || [1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }));
    const body = h`<div>
      <div class="text-sm muted mb-2">${iv.applicantName || ''} — ${HRM.jdate(iv.scheduledAt)}</div>
      <div class="col gap-2" data-criteria></div>
      <div class="field mt-2"><label class="label">نقاط قوت</label><textarea class="textarea" rows="2" data-strengths>${existing.strengths || ''}</textarea></div>
      <div class="field"><label class="label">نقاط ضعف / دغدغه‌ها</label><textarea class="textarea" rows="2" data-weaknesses>${existing.weaknesses || ''}</textarea></div>
      <div class="field"><label class="label">خلاصه مصاحبه</label><textarea class="textarea" rows="3" data-summary>${existing.summary || ''}</textarea></div>
      <div class="field"><label class="label">جمع‌بندی نهایی</label>
        <select class="select" data-decision>
          <option value="approve" ${existing.decision === 'approve' ? 'selected' : ''}>تأیید و ادامه فرآیند</option>
          <option value="review" ${!existing.decision || existing.decision === 'review' ? 'selected' : ''}>نیازمند بررسی بیشتر</option>
          <option value="reject" ${existing.decision === 'reject' ? 'selected' : ''}>عدم تأیید</option>
        </select>
      </div>
    </div>`;
    const critBox = body.querySelector('[data-criteria]');
    criteria.forEach((c) => {
      const cur = (existing.criteria || {})[c.key] || 0;
      const row = h`<div class="field"><label class="label">${c.label} <span class="text-xs muted">(وزن ${HRM.num(c.weight || 1)})</span></label>
        <div class="row gap-1 wrap" data-crit="${c.key}">
          ${scale.map((s) => h`<button type="button" class="btn btn-sm ${Number(s.value) === cur ? 'btn-primary' : 'btn-ghost'}" data-val="${s.value}" title="${s.label}">${HRM.num(s.value)}</button>`)}
          <span class="text-xs muted self-center" data-label>${(scale.find((s) => Number(s.value) === cur) || {}).label || ''}</span>
        </div>
      </div>`;
      row.querySelectorAll('[data-val]').forEach((b) => b.addEventListener('click', () => {
        row.querySelectorAll('[data-val]').forEach((x) => { x.classList.remove('btn-primary'); x.classList.add('btn-ghost'); });
        b.classList.add('btn-primary'); b.classList.remove('btn-ghost');
        row.dataset.value = b.dataset.val;
        row.querySelector('[data-label]').textContent = (scale.find((s) => String(s.value) === b.dataset.val) || {}).label || '';
      }));
      if (cur) row.dataset.value = String(cur);
      critBox.appendChild(row);
    });
    const m = HRM.modal({
      title: 'ثبت امتیاز مصاحبه', size: '',
      subtitle: iv.applicantName + ' — ' + (iv.type || ''),
      body,
      footer: h`<button class="btn btn-primary" data-save>ثبت کارنامه</button>`
    });
    m.el.querySelector('[data-save]').addEventListener('click', async () => {
      const criteriaScores = {};
      critBox.querySelectorAll('[data-crit]').forEach((row) => { if (row.dataset.value) criteriaScores[row.dataset.crit] = Number(row.dataset.value); });
      if (!Object.keys(criteriaScores).length) return HRM.toast('حداقل یک معیار را امتیاز دهید.', 'warning');
      await HRM.post('/interviews/' + id + '/score', {
        criteria: criteriaScores,
        strengths: body.querySelector('[data-strengths]').value,
        weaknesses: body.querySelector('[data-weaknesses]').value,
        summary: body.querySelector('[data-summary]').value,
        decision: body.querySelector('[data-decision]').value
      });
      HRM.toast('کارنامه مصاحبه ثبت شد.', 'success');
      m.close(); if (onDone) onDone();
    });
  }

  /* ============================================================ بانک سؤالات */
  async function renderQuestions(params, query) {
    const data = await HRM.get('/interview-questions?' + new URLSearchParams({ q: query.q || '', category: query.category || '', type: query.type || '' }).toString());
    const page = h`<div></div>`;
    page.appendChild(h`<div class="page-head">
      <div><div class="title">بانک سؤالات مصاحبه</div><div class="desc">${HRM.num(data.stats.total)} سؤال در ${HRM.num((data.categories || []).length)} دسته — ${HRM.num(data.stats.custom)} سؤال اختصاصی</div></div>
      <div class="actions">
        <a class="btn btn-ghost" href="#/interviews">بازگشت به مصاحبه‌ها</a>
        ${HRM.can('interviews.manage') ? h`<button class="btn btn-soft" data-reset>بازگردانی سؤالات پیش‌فرض</button>
          <button class="btn btn-primary" data-new>${HRM.raw(HRM.icon('plus', 16))} سؤال جدید</button>` : ''}
      </div>
    </div>`);

    page.appendChild(h`<div class="card mb-3"><div class="row gap-2 wrap">
      <div class="search-box grow" style="min-width:200px">${HRM.raw(HRM.icon('search', 16))}
        <input data-search placeholder="جست‌وجو در متن سؤال یا هدف…" value="${query.q || ''}"></div>
      <select class="select" data-category style="max-width:220px">
        <option value="">همه دسته‌ها</option>
        ${(data.categories || []).map((c) => h`<option value="${c.key}" ${query.category === c.key ? 'selected' : ''}>${c.title} (${HRM.num(c.count)})</option>`)}
      </select>
      <select class="select" data-type style="max-width:200px">
        <option value="">همه انواع</option>
        ${(data.options.types || []).map((t) => h`<option value="${t}" ${query.type === t ? 'selected' : ''}>${t}</option>`)}
      </select>
    </div></div>`);

    page.appendChild(h`<div class="grid grid-2 mb-3">
      ${HRM.card({
        title: 'پوشش دسته‌ها',
        body: HRM.charts.bars((data.categories || []).map((c) => ({ label: `${c.icon || ''} ${c.title}`, value: c.count, color: c.color || 'violet' })))
      })}
      ${HRM.card({
        title: 'راهنمای استفاده',
        body: h`<div class="col gap-2">
          <div class="insight sky"><span class="ic">ℹ️</span><div class="text-xs">در زمان‌بندی مصاحبه، سامانه بر اساس تیپ شخصیتی و موقعیت شغلی متقاضی، پرسش‌های مناسب را پیشنهاد می‌دهد.</div></div>
          <div class="insight mint"><span class="ic">✓</span><div class="text-xs">«نشانه‌های خوب» و «هشدارها» را هنگام ارزیابی پاسخ‌ها در نظر بگیرید.</div></div>
        </div>`
      })}
    </div>`);

    page.appendChild(HRM.card({
      title: 'سؤالات', subtitle: `${HRM.num(data.total)} مورد`,
      body: HRM.table({
        columns: [
          { title: 'سؤال', render: (q) => h`<div class="text-sm bold">${q.question}</div><div class="text-xs muted">${q.purpose || ''}</div>` },
          { title: 'دسته', render: (q) => HRM.badge((data.categories.find((c) => c.key === q.category) || {}).title || q.category, 'sky') },
          { title: 'نوع', render: (q) => HRM.badge(q.type || '—', 'outline') },
          { title: 'وزن', render: (q) => HRM.num(q.weight || 1) },
          { title: 'منبع', render: (q) => (q.system ? HRM.badge('پیش‌فرض', 'lemon') : HRM.badge('اختصاصی', 'mint')) },
          { title: 'وضعیت', render: (q) => (q.active === false ? HRM.badge('غیرفعال', 'outline') : HRM.badge('فعال', 'mint')) },
          { title: '', class: 'actions-cell', render: (q) => (HRM.can('interviews.manage') ? h`<div class="row gap-1">
            <button class="btn btn-sm btn-soft" data-edit="${q.id}">ویرایش</button>
            <button class="btn btn-sm btn-ghost danger" data-del="${q.id}">✕</button>
          </div>` : '') }
        ],
        rows: data.rows,
        empty: HRM.empty('سؤالی یافت نشد', 'با فیلترها جست‌وجو کنید یا سؤال جدید بسازید.')
      })
    }));

    const go = (patch) => {
      const merged = Object.assign({}, query, patch);
      const q = new URLSearchParams();
      Object.keys(merged).forEach((k) => { if (merged[k]) q.set(k, merged[k]); });
      const s = q.toString();
      HRM.go('/interview-questions' + (s ? '?' + s : ''));
    };
    const search = page.querySelector('[data-search]');
    search.addEventListener('input', HRM.debounce(() => go({ q: search.value.trim() }), 500));
    page.querySelector('[data-category]').addEventListener('change', (e) => go({ category: e.target.value }));
    page.querySelector('[data-type]').addEventListener('change', (e) => go({ type: e.target.value }));
    page.querySelector('[data-new]') && page.querySelector('[data-new]').addEventListener('click', () => openQuestionModal(null, data, () => HRM.render()));
    page.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openQuestionModal(data.rows.find((q) => q.id === b.dataset.edit), data, () => HRM.render())));
    page.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const ok = await HRM.confirm({ title: 'حذف سؤال', message: 'این سؤال حذف شود؟', danger: true, confirmText: 'حذف' });
      if (!ok) return;
      await HRM.del('/interview-questions/' + b.dataset.del);
      HRM.toast('سؤال حذف شد.', 'success');
      HRM.render();
    }));
    page.querySelector('[data-reset]') && page.querySelector('[data-reset]').addEventListener('click', async () => {
      const ok = await HRM.confirm({ title: 'بازگردانی بانک سؤالات', message: 'سؤالات پیش‌فرض بازسازی شوند؟ سؤالات اختصاصی شما حفظ می‌شوند.', confirmText: 'بازگردان' });
      if (!ok) return;
      const res = await HRM.post('/interview-questions/reset', {});
      HRM.toast(`بانک سؤالات بازگردانی شد (${HRM.num(res.restored || 0)} سؤال).`, 'success');
      HRM.render();
    });
    return page;
  }

  function openQuestionModal(q, data, onDone) {
    const form = HRM.form([
      { name: 'category', label: 'دسته‌بندی', type: 'select', required: true, col: 6, default: q ? q.category : '', options: (data.categories || []).map((c) => ({ value: c.key, label: c.title })) },
      { name: 'type', label: 'نوع سؤال', type: 'select', col: 6, default: q ? q.type : '', options: (data.options.types || []).map((t) => ({ value: t, label: t })) },
      { name: 'question', label: 'متن سؤال', type: 'textarea', required: true, col: 12, rows: 2, default: q ? q.question : '' },
      { name: 'purpose', label: 'هدف سؤال', type: 'text', col: 12, default: q ? q.purpose : '' },
      { name: 'goodSignals', label: 'نشانه‌های خوب (هر خط یک مورد)', type: 'textarea', col: 6, rows: 3, default: q ? (q.goodSignals || []).join('\n') : '' },
      { name: 'redFlags', label: 'هشدارها (هر خط یک مورد)', type: 'textarea', col: 6, rows: 3, default: q ? (q.redFlags || []).join('\n') : '' },
      { name: 'weight', label: 'وزن (۱ تا ۵)', type: 'number', col: 6, default: q ? q.weight : 3 },
      { name: 'active', label: 'سؤال فعال باشد', type: 'switch', col: 6, default: q ? q.active !== false : true }
    ]);
    const m = HRM.modal({
      title: q ? 'ویرایش سؤال' : 'افزودن سؤال مصاحبه', size: '',
      body: form.el,
      footer: h`<button class="btn btn-primary" data-save>ذخیره سؤال</button>`
    });
    m.el.querySelector('[data-save]').addEventListener('click', async () => {
      const v = form.validate();
      if (!v.valid) return form.setErrors(v.errors);
      const payload = {
        category: v.values.category, type: v.values.type, question: v.values.question, purpose: v.values.purpose,
        goodSignals: String(v.values.goodSignals || '').split('\n').map((s) => s.trim()).filter(Boolean),
        redFlags: String(v.values.redFlags || '').split('\n').map((s) => s.trim()).filter(Boolean),
        weight: Number(v.values.weight) || 3, active: v.values.active
      };
      if (q) await HRM.put('/interview-questions/' + q.id, payload);
      else await HRM.post('/interview-questions', payload);
      HRM.toast('سؤال ذخیره شد.', 'success');
      m.close(); if (onDone) onDone();
    });
  }

  HRM.registerModule({
    key: 'interviews', title: 'مصاحبه‌ها', order: 35,
    routes: {
      '/interviews': (ctx) => renderList(ctx.params, ctx.query),
      '/interview-questions': (ctx) => renderQuestions(ctx.params, ctx.query)
    }
  });
})();
