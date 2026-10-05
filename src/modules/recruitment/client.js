/* ── کلاینت متقاضیان و استخدام ─────────────────────────────────── */
(function () {
  'use strict';
  const h = HRM.h;

  /* ============================================================ فهرست */
  async function renderList(params, query) {
    const qs = new URLSearchParams();
    ['page', 'q', 'status', 'jobId', 'rating', 'tag', 'sort'].forEach((k) => { if (query[k]) qs.set(k, query[k]); });
    const data = await HRM.get('/applications?' + qs.toString());
    const page = h`<div></div>`;
    const selected = new Set();

    page.appendChild(h`<div class="page-head">
      <div><div class="title">متقاضیان</div><div class="desc">مدیریت پرونده‌های استخدامی، ارزیابی و پیگیری متقاضیان</div></div>
      <div class="actions">
        ${HRM.can('applications.export') ? h`<button class="btn btn-ghost" data-export>${HRM.raw(HRM.icon('download', 16))} خروجی CSV</button>` : ''}
        ${HRM.can('applications.view') ? h`<button class="btn btn-soft" data-kanban>${HRM.raw(HRM.icon('kanban', 16))} نمای قیف</button>` : ''}
      </div>
    </div>`);

    page.appendChild(h`<div class="grid grid-kpi mb-3">
      ${HRM.statCard({ label: 'کل متقاضیان', value: HRM.num(data.stats.total), icon: 'users', color: 'violet' })}
      ${HRM.statCard({ label: 'دارای آزمون', value: HRM.num(data.stats.withAssessment), icon: 'brain', color: 'lemon', hint: 'آزمون شخصیت تکمیل‌شده' })}
      ${HRM.statCard({ label: 'میانگین امتیاز', value: data.stats.avgRating === null || data.stats.avgRating === undefined ? '—' : HRM.num(data.stats.avgRating), icon: 'star', color: 'sky', hint: 'امتیاز ثبت‌شده منابع انسانی' })}
      ${HRM.statCard({ label: 'معطل بیش از ۱۴ روز', value: HRM.num(data.stats.overdue), icon: 'clock', color: data.stats.overdue ? 'peach' : 'mint', hint: 'نیازمند پیگیری' })}
    </div>`);

    /* فیلترها */
    page.appendChild(h`<div class="card mb-3"><div class="row gap-2 wrap">
      <div class="search-box grow" style="min-width:220px">${HRM.raw(HRM.icon('search', 16))}
        <input data-search placeholder="جست‌وجوی نام، موبایل، کد رهگیری…" value="${query.q || ''}"></div>
      <select class="select" data-status style="max-width:180px">
        <option value="">همه وضعیت‌ها</option>
        ${(data.statuses || []).map((s) => h`<option value="${s.key}" ${query.status === s.key ? 'selected' : ''}>${s.title}</option>`)}
      </select>
      <select class="select" data-job style="max-width:220px">
        <option value="">همه موقعیت‌ها</option>
        ${(data.jobs || []).map((j) => h`<option value="${j.id}" ${query.jobId === j.id ? 'selected' : ''}>${j.title}</option>`)}
      </select>
      <select class="select" data-rating style="max-width:150px">
        <option value="">همه امتیازها</option>
        ${[1, 2, 3, 4, 5].map((n) => h`<option value="${n}" ${query.rating === String(n) ? 'selected' : ''}>${HRM.num(n)} ستاره</option>`)}
      </select>
      ${(query.q || query.status || query.jobId || query.rating) ? h`<a class="btn btn-ghost" href="#/applications">حذف فیلترها</a>` : ''}
    </div></div>`);

    /* نوار عملیات گروهی */
    const bulkBar = h`<div class="card mb-2 hidden" data-bulk-bar style="border-color:var(--violet-200);background:var(--violet-50)">
      <div class="row between wrap gap-2">
        <div class="row gap-2"><span class="bold text-sm" data-bulk-count>۰</span><span class="text-sm">پرونده انتخاب شده</span></div>
        <div class="row gap-2">
          <select class="select" data-bulk-status style="max-width:220px">
            <option value="">تغییر وضعیت به…</option>
            ${(data.statuses || []).map((s) => h`<option value="${s.key}">${s.title}</option>`)}
          </select>
          <button class="btn btn-sm btn-primary" data-bulk-apply>اعمال</button>
          <button class="btn btn-sm btn-ghost" data-bulk-clear>لغو انتخاب</button>
        </div>
      </div>
    </div>`;
    page.appendChild(bulkBar);

    const table = HRM.table({
      columns: [
        { title: '', class: 'check-cell', render: (r) => h`<input type="checkbox" data-check="${r.id}">` },
        { title: 'متقاضی', render: (r) => h`<div class="user-cell">${HRM.avatar(r.name, { size: 'sm' })}<div>
            <div class="text-sm bold">${r.name}</div><div class="text-xs muted ltr">${r.mobile || '—'}</div></div></div>` },
        { title: 'موقعیت شغلی', render: (r) => h`<div class="text-sm">${r.jobTitle || '—'}</div><div class="text-xs muted">${r.education || ''}</div>` },
        { title: 'وضعیت', render: (r) => HRM.statusBadge(r.status, r.statusTitle, r.statusColor) },
        { title: 'آزمون', render: (r) => (r.hasAssessment ? HRM.badge(r.assessmentType || 'تکمیل‌شده', 'mint', true) : HRM.badge('—', 'outline')) },
        { title: 'مصاحبه', render: (r) => (r.nextInterviewAt ? h`<div class="text-xs">${HRM.jdate(r.nextInterviewAt)}</div><div class="text-xs muted">${HRM.jtime(r.nextInterviewAt)}</div>` : h`<span class="text-xs muted">—</span>`) },
        { title: 'امتیاز', render: (r) => (r.rating ? h`<span class="badge badge-lemon">${'★'.repeat(r.rating)}</span>` : h`<span class="text-xs muted">—</span>`) },
        { title: 'ثبت', render: (r) => h`<div class="text-xs">${HRM.jdate(r.submittedAt || r.createdAt)}</div><div class="text-xs muted">${HRM.ago(r.createdAt)}</div>` },
        { title: '', class: 'actions-cell', render: (r) => h`<button class="btn btn-sm btn-soft" data-open="${r.id}">پرونده</button>` }
      ],
      rows: data.rows,
      empty: HRM.empty('متقاضی‌ای یافت نشد', 'با تغییر فیلترها دوباره جست‌وجو کنید یا آگهی‌های شغلی را بازنگری کنید.')
    });
    page.appendChild(HRM.card({ title: 'فهرست متقاضیان', subtitle: `${HRM.num(data.total)} پرونده`, body: table }));
    if (data.pages > 1) page.appendChild(HRM.pagination({ page: data.page, pages: data.pages, total: data.total, perPage: data.perPage, onChange: (p) => go({ page: p }) }));

    /* رفتارها */
    const go = (patch) => {
      const merged = Object.assign({}, query, patch);
      const q = new URLSearchParams();
      Object.keys(merged).forEach((k) => { if (merged[k]) q.set(k, merged[k]); });
      const s = q.toString();
      HRM.go('/applications' + (s ? '?' + s : ''));
    };
    const search = page.querySelector('[data-search]');
    search.addEventListener('input', HRM.debounce(() => go({ q: search.value.trim(), page: 1 }), 500));
    page.querySelector('[data-status]').addEventListener('change', (e) => go({ status: e.target.value, page: 1 }));
    page.querySelector('[data-job]').addEventListener('change', (e) => go({ jobId: e.target.value, page: 1 }));
    page.querySelector('[data-rating]').addEventListener('change', (e) => go({ rating: e.target.value, page: 1 }));
    page.querySelector('[data-kanban]').addEventListener('click', () => HRM.go('/pipeline'));
    page.querySelector('[data-export]').addEventListener('click', () => {
      const q = new URLSearchParams();
      ['q', 'status', 'jobId', 'rating'].forEach((k) => { if (query[k]) q.set(k, query[k]); });
      HRM.download('/api/applications/export/csv?' + q.toString(), 'applications.csv');
    });
    page.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => HRM.go('/applications/' + b.dataset.open)));
    const updateBulk = () => {
      bulkBar.classList.toggle('hidden', selected.size === 0);
      bulkBar.querySelector('[data-bulk-count]').textContent = HRM.num(selected.size);
    };
    page.querySelectorAll('[data-check]').forEach((cb) => cb.addEventListener('change', () => {
      if (cb.checked) selected.add(cb.dataset.check); else selected.delete(cb.dataset.check);
      updateBulk();
    }));
    page.querySelector('[data-bulk-clear]').addEventListener('click', () => { selected.clear(); page.querySelectorAll('[data-check]').forEach((c) => { c.checked = false; }); updateBulk(); });
    page.querySelector('[data-bulk-apply]').addEventListener('click', async () => {
      const status = page.querySelector('[data-bulk-status]').value;
      if (!status) return HRM.toast('وضعیت مقصد را انتخاب کنید.', 'warning');
      const ok = await HRM.confirm({ title: 'تغییر گروهی وضعیت', message: `وضعیت ${HRM.num(selected.size)} پرونده به «${(data.statuses.find((s) => s.key === status) || {}).title}» تغییر کند؟`, confirmText: 'تغییر بده' });
      if (!ok) return;
      const res = await HRM.post('/applications/bulk-status', { ids: Array.from(selected), status });
      HRM.toast(`وضعیت ${HRM.num(res.updated)} پرونده تغییر کرد.`, 'success');
      HRM.render();
    });
    return page;
  }

  /* ============================================================ پرونده */
  async function renderDetail(params) {
    const d = await HRM.get('/applications/' + params.id);
    const a = d.application;
    const page = h`<div></div>`;
    let answersFlat = d.answersFlat.slice();

    page.appendChild(h`<div class="page-head">
      <div class="row gap-3">
        ${HRM.avatar(a.name, { size: 'lg' })}
        <div>
          <div class="row gap-2 wrap" style="align-items:center">
            <span class="title" style="font-size:1.15rem">${a.name || 'بدون نام'}</span>
            ${HRM.statusBadge(a.status, (d.statuses.find((s) => s.key === a.status) || {}).title, (d.statuses.find((s) => s.key === a.status) || {}).color)}
          </div>
          <div class="text-sm muted mt-1">
            <span class="ltr">${a.code || '—'}</span> — ${a.jobTitle || ''}
            ${a.mobile ? h` — <span class="ltr">${a.mobile}</span>` : ''}
            ${a.email ? h` — <span class="ltr">${a.email}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-ghost" data-back>بازگشت</button>
        ${HRM.can('applications.note') ? h`<button class="btn btn-soft" data-sms>${HRM.raw(HRM.icon('message-square', 16))} پیامک</button>` : ''}
        ${HRM.can('applications.view') ? h`<button class="btn btn-soft" data-print>${HRM.raw(HRM.icon('printer', 16))} چاپ پرونده</button>` : ''}
        ${HRM.can('applications.delete') ? h`<button class="btn btn-ghost danger" data-del>${HRM.raw(HRM.icon('trash', 16))} حذف</button>` : ''}
      </div>
    </div>`);

    /* نوار وضعیت و اقدام سریع */
    const statusSelect = h`<select class="select" style="max-width:230px">
      ${(d.statuses || []).map((s) => h`<option value="${s.key}" ${s.key === a.status ? 'selected' : ''}>${s.title}</option>`)}
    </select>`;
    const actionBar = h`<div class="card mb-3" style="background:linear-gradient(135deg,var(--violet-50),#fff)">
      <div class="row between wrap gap-2">
        <div class="row gap-2 wrap">
          ${HRM.can('applications.update') ? h`<div class="row gap-1">${statusSelect}<button class="btn btn-primary btn-sm" data-status-apply>تغییر وضعیت</button></div>` : ''}
          ${HRM.can('applications.note') ? h`<label class="checkline text-xs"><input type="checkbox" data-send-sms> ارسال پیامک اطلاع‌رسانی</label>` : ''}
        </div>
        <div class="row gap-2 wrap">
          ${HRM.can('interviews.schedule') ? h`<button class="btn btn-sm btn-soft" data-schedule>${HRM.raw(HRM.icon('calendar-plus', 14))} زمان‌بندی مصاحبه</button>` : ''}
          ${HRM.can('applications.note') ? h`<button class="btn btn-sm btn-ghost" data-resend>ارسال مجدد لینک فرم</button>` : ''}
          ${a.assessment ? h`<a class="btn btn-sm btn-ghost" href="#/assessments">آزمون‌ها</a>` : ''}
        </div>
      </div>
      <div class="row gap-3 wrap mt-2 text-xs muted">
        <span>ثبت: ${HRM.jdateTime ? HRM.jdateTime(a.createdAt) : HRM.jdate(a.createdAt) + ' ' + HRM.jtime(a.createdAt)}</span>
        <span>آخرین تغییر: ${HRM.ago(a.updatedAt)}</span>
        <span>منبع: ${a.source || '—'}</span>
        ${a.rating ? h`<span>امتیاز: ${'★'.repeat(a.rating)}</span>` : ''}
      </div>
      <div class="row gap-2 mt-2" data-tags-row>
        ${(a.tags || []).map((t) => HRM.badge(t, 'sky'))}
        ${HRM.can('applications.update') ? h`<button class="btn btn-sm btn-ghost" data-tags-edit>ویرایش برچسب‌ها</button>` : ''}
      </div>
    </div>`;
    page.appendChild(actionBar);

    /* زبانه‌ها */
    const tabs = HRM.tabs([
      { title: 'اطلاعات فرم', icon: 'file-text', count: answersFlat.length },
      { title: 'آزمون شخصیتی', icon: 'brain', count: d.assessmentResults.length },
      { title: 'مصاحبه‌ها', icon: 'message-circle', count: (d.interviews || []).length },
      { title: 'ارزیابی‌ها', icon: 'check-square' },
      { title: 'یادداشت‌ها', icon: 'sticky-note', count: (a.notes || []).length },
      { title: 'تاریخچه', icon: 'history', count: (d.timeline || []).length }
    ], {
      onChange(i, panel) {
        if (i === 0) panel.appendChild(formDataCard());
        if (i === 1) panel.appendChild(assessmentCard());
        if (i === 2) panel.appendChild(interviewsCard());
        if (i === 3) panel.appendChild(evaluationsCard());
        if (i === 4) panel.appendChild(notesCard());
        if (i === 5) panel.appendChild(timelineCard());
      }
    });
    page.appendChild(tabs.el);

    /* ---------------------------------------------------- فرم */
    function formDataCard() {
      const wrap = h`<div></div>`;
      const grouped = {};
      answersFlat.forEach((f) => { (grouped[f.stepKey] = grouped[f.stepKey] || { step: f.step, items: [] }).items.push(f); });
      const steps = (d.schema.steps || []).filter((s) => grouped[s.key]);
      wrap.appendChild(h`<div class="insight sky mb-2"><span class="ic">${HRM.raw(HRM.icon('info', 14))}</span>
        <div class="text-xs">برای ویرایش سریع، روی مقدار فیلد کلیک کنید.${HRM.can('applications.update') ? '' : ' (دسترسی ویرایش ندارید)'}</div></div>`);
      steps.forEach((step) => {
        const body = h`<div class="grid grid-2"></div>`;
        grouped[step.key].items.forEach((f) => {
          const editable = HRM.can('applications.update') && !['table', 'file'].includes(f.type);
          const row = h`<div class="field" style="padding:6px 0;border-bottom:1px dashed var(--border)">
            <div class="text-xs muted">${f.name}</div>
            <div class="text-sm" data-val>${valueHtml(f.value)}</div>
          </div>`;
          if (editable) {
            row.classList.add('pointer');
            row.title = 'کلیک برای ویرایش';
            row.addEventListener('click', () => {
              if (row.querySelector('input,textarea,select')) return;
              const input = h`<input class="input" value="${f.value === undefined || f.value === null ? '' : fmt(f.value)}">`;
              const valBox = row.querySelector('[data-val]');
              valBox.innerHTML = '';
              valBox.appendChild(input);
              input.focus();
              const commit = async () => {
                const v = input.value;
                await HRM.put('/applications/' + a.id, { answers: { [step.key]: { [f.name]: v } } });
                f.value = v;
                valBox.innerHTML = valueHtml(v);
                HRM.toast('ذخیره شد.', 'success');
              };
              input.addEventListener('blur', commit);
              input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { input.blur(); } if (e.key === 'Escape') { valBox.innerHTML = valueHtml(f.value); } });
            });
          }
          body.appendChild(row);
        });
        wrap.appendChild(h`<div class="mb-2">${HRM.card({ title: step.title, className: '', body })}</div>`);
      });
      return wrap;
    }

    function valueHtml(v) {
      if (v === undefined || v === null || v === '') return '<span class="muted">—</span>';
      if (Array.isArray(v)) {
        if (v.length && typeof v[0] === 'object') {
          return v.map((r, i) => h`<div class="muted-box text-xs mb-1">ردیف ${HRM.num(i + 1)}: ${Object.entries(r).filter(([, x]) => x).map(([k, x]) => k + ': ' + x).join(' — ')}</div>`);
        }
        return v.map((x) => HRM.badge(String(x), 'sky')).join(' ');
      }
      if (typeof v === 'object') return h`<span class="text-xs">${Object.entries(v).map(([k, x]) => k + ': ' + x).join(' — ')}</span>`;
      return HRM.esc(String(v));
    }
    function fmt(v) { return Array.isArray(v) ? v.join('، ') : (typeof v === 'object' ? JSON.stringify(v) : String(v)); }

    /* ---------------------------------------------------- آزمون */
    function assessmentCard() {
      if (!d.assessmentResults.length) {
        return HRM.empty('آزمون شخصیتی ثبت نشده', a.assessment && a.assessment.status === 'invited'
          ? 'متقاضی به آزمون دعوت شده اما هنوز آن را تکمیل نکرده است. می‌توانید لینک آزمون را دوباره ارسال کنید.'
          : 'برای این موقعیت شغلی آزمون شخصیتی فعال نبوده است.');
      }
      const wrap = h`<div class="col gap-2"></div>`;
      d.assessmentResults.forEach((r) => {
        wrap.appendChild(HRM.card({
          title: `${r.profileName || ''} ${r.type ? '(' + r.type + ')' : ''}`,
          subtitle: `تکمیل: ${HRM.jdate(r.completedAt)} — پاسخ ${HRM.num(r.answered)} از ${HRM.num(r.total)}${(r.borderline || []).length ? ' — ابعاد مرزی: ' + r.borderline.join('، ') : ''}`,
          actions: HRM.can('assessments.view') ? h`<button class="btn btn-sm btn-soft" data-full="${r.id}">گزارش کامل</button>` : '',
          body: h`<div class="row gap-3 wrap">
            ${r.dimensions && r.dimensions.length ? HRM.charts.radar(r.dimensions.map((x) => ({ label: x.winnerLabel || x.pair, value: x.dominantPercent || 50 })), { size: 220 }) : ''}
            <div class="grow">
              ${HRM.fieldRow('تناسب شغلی', r.fitScore === null || r.fitScore === undefined ? '—' : HRM.num(r.fitScore) + '٪')}
              ${(r.dimensions || []).map((x) => HRM.fieldRow(x.title || x.pair, `${x.winnerLabel || '—'} (${HRM.num(x.dominantPercent || 50)}٪)`))}
            </div>
          </div>`
        }));
      });
      wrap.querySelectorAll('[data-full]').forEach((b) => b.addEventListener('click', () => HRM.go('/assessments/' + b.dataset.full)));
      return wrap;
    }

    /* ---------------------------------------------------- مصاحبه‌ها */
    function interviewsCard() {
      const list = d.interviews || [];
      const wrap = h`<div>
        ${HRM.can('interviews.schedule') ? h`<div class="row justify-end mb-2"><button class="btn btn-primary btn-sm" data-schedule2>${HRM.raw(HRM.icon('calendar-plus', 14))} زمان‌بندی مصاحبه جدید</button></div>` : ''}
        ${list.length ? h`<div class="col gap-2">${list.map((i) => h`<div class="card pad-sm" style="box-shadow:none">
          <div class="row between wrap gap-2">
            <div><div class="text-sm bold">${i.type || 'مصاحبه'} — ${i.mode || ''}</div>
              <div class="text-xs muted">${HRM.jdate(i.scheduledAt)} ساعت ${HRM.jtime(i.scheduledAt)} ${i.location ? '— ' + i.location : ''}</div></div>
            <div class="row gap-2">
              ${HRM.badge(i.statusTitle || i.status, i.status === 'completed' ? 'mint' : i.status === 'canceled' ? 'rose' : 'sky')}
              ${i.scorecard && i.scorecard.percent !== undefined ? HRM.badge(HRM.num(i.scorecard.percent) + '٪', 'lemon') : ''}
              ${HRM.can('interviews.score') && i.status !== 'canceled' ? h`<button class="btn btn-sm btn-soft" data-score="${i.id}">ثبت امتیاز</button>` : ''}
            </div>
          </div>
          ${(i.interviewers || []).length ? h`<div class="row gap-1 mt-1">${i.interviewers.map((x) => HRM.badge(x.name || x, 'outline'))}</div>` : ''}
          ${i.summary ? h`<div class="text-xs muted mt-1">${i.summary}</div>` : ''}
        </div>`)}</div>` : HRM.empty('مصاحبه‌ای ثبت نشده', 'برای این متقاضی هنوز مصاحبه‌ای زمان‌بندی نشده است.')}
      </div>`;
      wrap.querySelectorAll('[data-schedule], [data-schedule2]').forEach((b) => b.addEventListener('click', openSchedule));
      wrap.querySelectorAll('[data-score]').forEach((b) => b.addEventListener('click', () => openScore(b.dataset.score)));
      return wrap;
    }

    /* ---------------------------------------------------- ارزیابی‌ها */
    function evaluationsCard() {
      const evals = a.evaluations || {};
      const wrap = h`<div class="col gap-2"></div>`;
      (d.evaluationRoles || []).forEach((role) => {
        const e = evals[role.key];
        const canEdit = HRM.can('applications.interview') && (role.key !== 'manager' || HRM.can('applications.update'));
        wrap.appendChild(HRM.card({
          title: role.title, subtitle: role.key === 'manager' ? 'نظر مدیریت (تأیید/رد نهایی)' : '',
          actions: canEdit ? h`<button class="btn btn-sm btn-soft" data-eval="${role.key}">${e ? 'ویرایش ارزیابی' : 'ثبت ارزیابی'}</button>` : '',
          body: e ? h`<div>
            <div class="row gap-2 mb-1">${HRM.badge(e.decisionTitle || e.decision, e.decision === 'approve' ? 'mint' : e.decision === 'reject' ? 'rose' : 'sky')}
              <span class="text-xs muted">${e.byName} — ${HRM.jdate(e.at)}</span></div>
            <div class="text-sm" style="white-space:pre-line">${e.text || '—'}</div>
          </div>` : h`<div class="text-sm muted">هنوز ارزیابی ثبت نشده است.</div>`
        }));
      });
      wrap.querySelectorAll('[data-eval]').forEach((b) => b.addEventListener('click', () => openEvaluation(b.dataset.eval)));
      return wrap;
    }

    /* ---------------------------------------------------- یادداشت‌ها */
    function notesCard() {
      const notes = (a.notes || []).slice().reverse();
      const wrap = h`<div>
        ${HRM.can('applications.note') ? h`<div class="card mb-2">
          <textarea class="textarea" rows="3" data-note-text placeholder="یادداشت خود را بنویسید… (برای همکاران منابع انسانی)"></textarea>
          <div class="row between mt-1">
            <label class="checkline text-xs"><input type="checkbox" data-note-private> یادداشت خصوصی (فقط برای شما)</label>
            <button class="btn btn-primary btn-sm" data-note-add>ثبت یادداشت</button>
          </div>
        </div>` : ''}
        ${notes.length ? h`<div class="col gap-2">${notes.map((n) => h`<div class="card pad-sm" style="box-shadow:none">
          <div class="row between"><div class="text-sm bold">${n.byName} ${n.private ? HRM.badge('خصوصی', 'lemon') : ''}</div>
            <div class="row gap-2"><span class="text-xs muted">${HRM.jdateTime ? HRM.jdateTime(n.at) : HRM.jdate(n.at)}</span>
            ${(HRM.can('applications.note') && (n.byId === (HRM.state.user && HRM.state.user.id) || HRM.state.user && HRM.state.user.isSuperAdmin)) ? h`<button class="btn btn-sm btn-ghost danger" data-note-del="${n.id}">✕</button>` : ''}</div></div>
          <div class="text-sm mt-1" style="white-space:pre-line">${n.text}</div>
        </div>`)}</div>` : HRM.empty('یادداشتی ثبت نشده', 'اولین یادداشت را برای این پرونده ثبت کنید.')}
      </div>`;
      const addBtn = wrap.querySelector('[data-note-add]');
      if (addBtn) addBtn.addEventListener('click', async () => {
        const text = wrap.querySelector('[data-note-text]').value.trim();
        if (!text) return HRM.toast('متن یادداشت را بنویسید.', 'warning');
        await HRM.post('/applications/' + a.id + '/notes', { text, private: wrap.querySelector('[data-note-private]').checked });
        HRM.toast('یادداشت ثبت شد.', 'success');
        HRM.render();
      });
      wrap.querySelectorAll('[data-note-del]').forEach((b) => b.addEventListener('click', async () => {
        const ok = await HRM.confirm({ title: 'حذف یادداشت', message: 'این یادداشت حذف شود؟', danger: true, confirmText: 'حذف' });
        if (!ok) return;
        await HRM.del('/applications/' + a.id + '/notes/' + b.dataset.noteDel);
        HRM.toast('یادداشت حذف شد.', 'success');
        HRM.render();
      }));
      return wrap;
    }

    /* ---------------------------------------------------- تاریخچه */
    function timelineCard() {
      const list = d.timeline || [];
      return list.length ? h`<div class="card"><div class="timeline">${list.map((t) => h`<div class="timeline-item">
        <div class="dot ${t.type === 'status' ? 'warn' : ''}"></div>
        <div><div class="text-sm">${t.title}</div><div class="text-xs muted">${t.actorName || 'سیستم'} — ${HRM.jdateTime ? HRM.jdateTime(t.at) : HRM.jdate(t.at)}</div></div>
      </div>`)}</div></div>` : HRM.empty('تاریخچه‌ای ثبت نشده', '');
    }

    /* ---------------------------------------------------- تعامل‌ها */
    page.querySelector('[data-back]').addEventListener('click', () => HRM.go('/applications'));
    page.querySelector('[data-print]').addEventListener('click', () => printRecord());
    page.querySelector('[data-status-apply]') && page.querySelector('[data-status-apply]').addEventListener('click', async () => {
      const status = statusSelect.value;
      const sendSms = !!page.querySelector('[data-send-sms]').checked;
      const reason = await promptReason();
      await HRM.post('/applications/' + a.id + '/status', { status, sendSms, reason });
      HRM.toast('وضعیت پرونده به‌روزرسانی شد.', 'success');
      HRM.render();
    });
    page.querySelector('[data-resend]') && page.querySelector('[data-resend]').addEventListener('click', async () => {
      const res = await HRM.post('/applications/' + a.id + '/resend-link', {});
      HRM.modal({
        title: 'ارسال لینک تکمیل فرم', size: 'narrow',
        body: h`<div>
          ${HRM.fieldRow('نتیجه ارسال', res.sent ? (res.simulated ? HRM.badge('ثبت در حالت آزمایشی', 'lemon') : HRM.badge('ارسال شد', 'mint')) : HRM.badge('ناموفق', 'rose'))}
          ${res.error ? h`<div class="insight rose mt-2"><span class="ic">⚠️</span><div class="text-xs">${res.error}</div></div>` : ''}
          <div class="muted-box mt-2 text-xs ltr" style="word-break:break-all">${res.link}</div>
        </div>`,
        footer: h`<button class="btn btn-soft" data-copy>کپی لینک</button>`
      }).el.querySelector('[data-copy]').addEventListener('click', () => HRM.copy(res.link, 'لینک کپی شد.'));
    });
    page.querySelector('[data-sms]') && page.querySelector('[data-sms]').addEventListener('click', openSms);
    page.querySelector('[data-schedule]') && page.querySelector('[data-schedule]').addEventListener('click', openSchedule);
    page.querySelector('[data-tags-edit]') && page.querySelector('[data-tags-edit]').addEventListener('click', async () => {
      const form = HRM.form([{ name: 'tags', label: 'برچسب‌ها (با کاما جدا کنید)', type: 'text', col: 12, default: (a.tags || []).join('، ') }]);
      const m = HRM.modal({ title: 'برچسب‌های پرونده', body: form.el, footer: h`<button class="btn btn-primary" data-save>ذخیره</button>` });
      m.el.querySelector('[data-save]').addEventListener('click', async () => {
        const tags = String(form.values().tags || '').split(/[,،]/).map((s) => s.trim()).filter(Boolean);
        await HRM.put('/applications/' + a.id, { tags });
        HRM.toast('برچسب‌ها ذخیره شد.', 'success');
        m.close(); HRM.render();
      });
    });
    page.querySelector('[data-del]') && page.querySelector('[data-del]').addEventListener('click', async () => {
      const ok = await HRM.confirm({ title: 'حذف پرونده', message: 'این پرونده همراه با آزمون‌ها و مصاحبه‌های مرتبط حذف شود؟ این عملیات بازگشت‌پذیر نیست.', danger: true, confirmText: 'حذف کن' });
      if (!ok) return;
      await HRM.del('/applications/' + a.id);
      HRM.toast('پرونده حذف شد.', 'success');
      HRM.go('/applications');
    });

    async function promptReason() {
      // دلیل اختیاری تغییر وضعیت با یک دیالوگ کوچک
      return new Promise((resolve) => {
        const form = HRM.form([{ name: 'reason', label: 'دلیل/توضیح تغییر وضعیت (اختیاری)', type: 'text', col: 12, placeholder: 'مثال: عدم تناسب مهارت‌ها' }]);
        const m = HRM.modal({
          title: 'توضیح تغییر وضعیت', size: 'narrow', body: form.el,
          footer: h`<div class="row gap-2"><button class="btn btn-ghost" data-skip>بدون توضیح</button><button class="btn btn-primary" data-ok>تأیید</button></div>`
        });
        const done = (v) => { m.close(); resolve(v); };
        m.el.querySelector('[data-ok]').addEventListener('click', () => done(form.values().reason));
        m.el.querySelector('[data-skip]').addEventListener('click', () => done(''));
        m.el.querySelector('[data-close]').addEventListener('click', () => done(''));
      });
    }

    function openSms() {
      const form = HRM.form([
        { name: 'templateKey', label: 'قالب آماده', type: 'select', col: 12, options: [
          { value: '', label: 'متن آزاد' },
          { value: 'interview', label: 'دعوت به مصاحبه' },
          { value: 'offers', label: 'پیشنهاد شغلی' },
          { value: 'rejected', label: 'نتیجه منفی' }
        ] },
        { name: 'text', label: 'متن پیام', type: 'textarea', required: true, col: 12, rows: 4, default: `${a.name} عزیز، ` }
      ]);
      const m = HRM.modal({
        title: 'ارسال پیامک به متقاضی', subtitle: a.mobile ? 'شماره: ' + a.mobile : '',
        body: h`<div>${form.el}<div class="hint mt-1">متغیرهای قابل استفاده: {name}، {job}، {company}</div></div>`,
        footer: h`<button class="btn btn-primary" data-send>ارسال پیامک</button>`
      });
      m.el.querySelector('[data-send]').addEventListener('click', async () => {
        const v = form.validate();
        if (!v.valid) return form.setErrors(v.errors);
        const res = await HRM.post('/applications/' + a.id + '/sms', { text: v.values.text, templateKey: v.values.templateKey || 'custom' });
        HRM.toast(res.sent ? (res.simulated ? 'پیامک در حالت آزمایشی ثبت شد.' : 'پیامک ارسال شد.') : ('ارسال ناموفق: ' + (res.error || '')), res.sent ? 'success' : 'error');
        if (res.sent) { m.close(); HRM.render(); }
      });
    }

    async function openSchedule() {
      const meta = await HRM.get('/interviews?perPage=1').catch(() => null);
      const options = (meta && meta.options) || null;
      const modes = (options && options.modes) || ['حضوری', 'تلفنی', 'آنلاین'];
      const types = (options && options.types) || ['استخدامی', 'فنی', 'منابع انسانی'];
      const form = HRM.form([
        { name: 'scheduledDate', label: 'تاریخ', type: 'date', required: true, col: 4 },
        { name: 'scheduledTime', label: 'ساعت', type: 'text', required: true, col: 4, placeholder: '۱۰:۳۰' },
        { name: 'duration', label: 'مدت (دقیقه)', type: 'number', col: 4, default: 45 },
        { name: 'type', label: 'نوع مصاحبه', type: 'select', col: 4, options: types },
        { name: 'mode', label: 'نحوه برگزاری', type: 'select', col: 4, options: modes },
        { name: 'location', label: 'محل/لینک', type: 'text', col: 4, default: '' },
        { name: 'interviewerIds', label: 'مصاحبه‌کنندگان', type: 'checkbox', col: 12, options: (d.users || []).map((u) => ({ value: u.id, label: u.name })) }
      ]);
      const m = HRM.modal({
        title: 'زمان‌بندی مصاحبه', subtitle: a.name + ' — ' + (a.jobTitle || ''),
        body: form.el,
        footer: h`<button class="btn btn-primary" data-save>ثبت مصاحبه</button>`
      });
      m.el.querySelector('[data-save]').addEventListener('click', async () => {
        const v = form.validate();
        if (!v.valid) return form.setErrors(v.errors);
        const [hh, mm] = String(v.values.scheduledTime).replace(/[^\d:]/g, '').split(':');
        const dt = HRM.jalali.parse(v.values.scheduledDate);
        if (!dt) return HRM.toast('تاریخ مصاحبه را به‌صورت ۱۴۰۴/۰۱/۰۱ وارد کنید.', 'error');
        dt.setHours(Number(hh) || 9, Number(mm) || 0, 0, 0);
        await HRM.post('/interviews', {
          applicationId: a.id, scheduledAt: dt.toISOString(),
          duration: Number(v.values.duration) || 45,
          type: v.values.type, mode: v.values.mode, location: v.values.location,
          interviewerIds: v.values.interviewerIds || []
        });
        HRM.toast('مصاحبه ثبت شد.', 'success');
        m.close(); HRM.render();
      });
    }

    async function openScore(interviewId) {
      const meta = await HRM.get('/interviews?perPage=1').catch(() => null);
      const options = (meta && meta.options) || null;
      const criteria = (options && options.criteria) || [];
      const scale = (options && options.scoreScale) || [{ value: 1, label: 'ضعیف' }, { value: 2, label: 'متوسط' }, { value: 3, label: 'خوب' }, { value: 4, label: 'بسیار خوب' }, { value: 5, label: 'عالی' }];
      const body = h`<div class="col gap-2"></div>`;
      criteria.forEach((c) => {
        const row = h`<div class="field"><label class="label">${c.label}${c.weight ? h` <span class="text-xs muted">(وزن ${HRM.num(c.weight)})</span>` : ''}</label>
          <div class="row gap-1 wrap" data-crit="${c.key}">${scale.map((s) => h`<button type="button" class="btn btn-sm btn-ghost" data-score="${s.value}" title="${s.label}">${HRM.num(s.value)}</button>`)}</div>
        </div>`;
        row.querySelectorAll('[data-score]').forEach((b) => b.addEventListener('click', () => {
          row.querySelectorAll('[data-score]').forEach((x) => x.classList.remove('btn-primary'));
          b.classList.add('btn-primary');
          body.dataset[c.key] = b.dataset.score;
        }));
        body.appendChild(row);
      });
      body.appendChild(h`<div class="field"><label class="label">خلاصه مصاحبه</label><textarea class="textarea" rows="3" data-summary></textarea></div>`);
      const m = HRM.modal({ title: 'ثبت امتیاز مصاحبه', body, footer: h`<button class="btn btn-primary" data-save>ثبت امتیاز</button>` });
      m.el.querySelector('[data-save]').addEventListener('click', async () => {
        const scores = {};
        criteria.forEach((c) => { if (body.dataset[c.key]) scores[c.key] = Number(body.dataset[c.key]); });
        if (!Object.keys(scores).length) return HRM.toast('حداقل یک معیار را امتیاز دهید.', 'warning');
        await HRM.post('/interviews/' + interviewId + '/score', { criteria: scores, summary: m.el.querySelector('[data-summary]').value });
        HRM.toast('امتیاز مصاحبه ثبت شد.', 'success');
        m.close(); HRM.render();
      });
    }

    function openEvaluation(roleKey) {
      const existing = (a.evaluations || {})[roleKey] || {};
      const form = HRM.form([
        { name: 'decision', label: 'نتیجه ارزیابی', type: 'radio', required: true, col: 12, default: existing.decision || 'review', options: (d.decisions || []).map((x) => ({ value: x.key, label: x.title })) },
        { name: 'text', label: 'توضیحات ارزیابی', type: 'textarea', col: 12, rows: 5, default: existing.text || '' }
      ]);
      const m = HRM.modal({
        title: 'ثبت ارزیابی', size: '',
        subtitle: (d.evaluationRoles.find((r) => r.key === roleKey) || {}).title,
        body: form.el,
        footer: h`<button class="btn btn-primary" data-save>ثبت ارزیابی</button>`
      });
      m.el.querySelector('[data-save]').addEventListener('click', async () => {
        const v = form.validate();
        if (!v.valid) return form.setErrors(v.errors);
        const res = await HRM.post('/applications/' + a.id + '/evaluation', { role: roleKey, decision: v.values.decision, text: v.values.text });
        HRM.toast('ارزیابی ثبت شد.', 'success');
        m.close(); HRM.render();
      });
    }

    async function printRecord() {
      const data = await HRM.get('/applications/' + a.id + '/print');
      const grouped = {};
      (data.answersFlat || []).forEach((f) => { (grouped[f.step] = grouped[f.step] || []).push(f); });
      const win = window.open('', '_blank', 'width=900,height=1000');
      win.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>پرونده ${a.code || a.name}</title>
        <style>
          body{font-family:Tahoma,Vazirmatn,sans-serif;color:#222;padding:28px;line-height:1.9}
          h1{font-size:19px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px;color:#555;border-bottom:1px solid #ddd;padding-bottom:4px}
          table{width:100%;border-collapse:collapse;font-size:12px}td{border:1px solid #e3e3e3;padding:6px 8px;vertical-align:top}
          td.k{background:#f7f7fb;width:26%;font-weight:bold}
          .head{display:flex;justify-content:space-between;border-bottom:2px solid #7C6CF0;padding-bottom:10px;margin-bottom:14px}
          .muted{color:#777;font-size:11px}
          @media print{ .noprint{display:none} }
        </style></head><body>
        <div class="head">
          <div><h1>${data.brand.company || ''}</h1><div class="muted">پرونده استخدامی — ${data.job ? data.job.title : ''}</div></div>
          <div class="muted" style="text-align:left">کد رهگیری: <b>${data.application.code || '—'}</b><br>
          تاریخ چاپ: ${new Date().toLocaleDateString('fa-IR')}<br>چاپ توسط: ${data.printedBy || ''}</div>
        </div>
        <div><b>نام متقاضی:</b> ${a.name || '—'} &nbsp; <b>موبایل:</b> ${a.mobile || '—'} &nbsp; <b>وضعیت:</b> ${(d.statuses.find((s) => s.key === a.status) || {}).title || a.status}</div>
        ${Object.keys(grouped).map((step) => `<h2>${step}</h2><table>${grouped[step].map((f) => {
          let v = f.value;
          if (Array.isArray(v)) v = v.map((r) => typeof r === 'object' ? Object.entries(r).filter(([, x]) => x).map(([k, x]) => k + ': ' + x).join(' | ') : r).join(' ؛ ');
          else if (v && typeof v === 'object') v = Object.entries(v).map(([k, x]) => k + ': ' + x).join(' | ');
          return `<tr><td class="k">${f.name}</td><td>${v === undefined || v === null || v === '' ? '—' : String(v)}</td></tr>`;
        }).join('')}</table>`).join('')}
        <div class="noprint" style="margin-top:24px"><button onclick="window.print()">چاپ</button></div>
        </body></html>`);
      win.document.close();
    }

    return page;
  }

  /* ============================================================ فرم‌ساز */
  async function renderFormBuilder() {
    const data = await HRM.get('/form');
    let schema = JSON.parse(JSON.stringify(data.schema));
    const page = h`<div></div>`;
    page.appendChild(h`<div class="page-head">
      <div><div class="title">فرم‌ساز استخدام</div><div class="desc">ویرایش مراحل، فیلدها و گزینه‌های فرم استخدام (نسخه ${HRM.num(schema.version || 1)})</div></div>
      <div class="actions">
        ${HRM.can('form.manage') ? h`<button class="btn btn-ghost" data-reset>بازگردانی به فرم پیش‌فرض</button>
          <button class="btn btn-primary" data-save>${HRM.raw(HRM.icon('check', 16))} ذخیره تغییرات</button>` : ''}
      </div>
    </div>`);

    page.appendChild(h`<div class="grid grid-kpi mb-3">
      ${HRM.statCard({ label: 'مراحل فرم', value: HRM.num((schema.steps || []).length), icon: 'layout-template', color: 'violet' })}
      ${HRM.statCard({ label: 'کل فیلدها', value: HRM.num((schema.steps || []).reduce((s, x) => s + (x.fields || []).filter((f) => !['heading', 'note'].includes(f.type)).length, 0)), icon: 'list-checks', color: 'sky' })}
      ${HRM.statCard({ label: 'فرم‌های تکمیل‌شده', value: HRM.num(data.stats.completed), icon: 'check-circle', color: 'mint' })}
      ${HRM.statCard({ label: 'پیش‌نویس‌های ناتمام', value: HRM.num(data.stats.draft), icon: 'edit', color: 'lemon' })}
    </div>`);

    if ((data.jobs || []).some((j) => ((j.overrides || {}).required || []).length || ((j.overrides || {}).hidden || []).length)) {
      page.appendChild(h`<div class="insight sky mb-2"><span class="ic">${HRM.raw(HRM.icon('info', 14))}</span>
        <div class="text-xs">برخی موقعیت‌های شغلی تنظیمات اختصاصی دارند: ${data.jobs.filter((j) => ((j.overrides || {}).required || []).length || ((j.overrides || {}).hidden || []).length).map((j) => j.title).join('، ')}</div></div>`);
    }

    const list = h`<div class="col gap-2"></div>`;
    const rerender = () => { list.innerHTML = ''; renderSteps(); };
    page.appendChild(list);

    function renderSteps() {
      schema.steps.forEach((step, si) => {
        const fieldsBox = h`<div class="col gap-1"></div>`;
        (step.fields || []).forEach((f, fi) => {
          const row = h`<div class="row between wrap gap-2" style="padding:8px 10px;border:1px solid var(--border);border-radius:12px">
            <div class="row gap-2" style="align-items:flex-start">
              <span class="badge badge-outline">${FIELD_ICONS[f.type] || '•'}</span>
              <div>
                <div class="text-sm bold">${f.label} ${f.required ? HRM.badge('اجباری', 'rose') : ''}</div>
                <div class="text-xs muted">${f.name}${f.type === 'table' ? h` — ${HRM.num((f.columns || []).length)} ستون` : ''}${(f.options || []).length ? h` — ${HRM.num(f.options.length)} گزینه` : ''}</div>
              </div>
            </div>
            <div class="row gap-1">
              <button class="btn btn-sm btn-ghost" data-up="${fi}" title="بالا">↑</button>
              <button class="btn btn-sm btn-ghost" data-down="${fi}" title="پایین">↓</button>
              <button class="btn btn-sm btn-soft" data-edit="${fi}">ویرایش</button>
              <button class="btn btn-sm btn-ghost danger" data-del="${fi}">✕</button>
            </div>
          </div>`;
          row.querySelector('[data-up]').addEventListener('click', () => { if (fi > 0) { const arr = step.fields; [arr[fi - 1], arr[fi]] = [arr[fi], arr[fi - 1]]; rerender(); } });
          row.querySelector('[data-down]').addEventListener('click', () => { const arr = step.fields; if (fi < arr.length - 1) { [arr[fi + 1], arr[fi]] = [arr[fi], arr[fi + 1]]; rerender(); } });
          row.querySelector('[data-edit]').addEventListener('click', () => editField(step, fi, rerender));
          row.querySelector('[data-del]').addEventListener('click', async () => {
            const ok = await HRM.confirm({ title: 'حذف فیلد', message: `فیلد «${f.label}» از فرم حذف شود؟ پاسخ‌های ثبت‌شده حذف نمی‌شوند.`, danger: true, confirmText: 'حذف' });
            if (!ok) return;
            step.fields.splice(fi, 1);
            rerender();
          });
          fieldsBox.appendChild(row);
        });
        const card = HRM.card({
          title: `${HRM.num(si + 1)}. ${step.title}`,
          subtitle: step.description || '',
          actions: h`<div class="row gap-1">
            <button class="btn btn-sm btn-ghost" data-step-up>↑</button>
            <button class="btn btn-sm btn-ghost" data-step-down>↓</button>
            <button class="btn btn-sm btn-soft" data-step-edit>ویرایش مرحله</button>
            <button class="btn btn-sm btn-soft" data-add-field>افزودن فیلد</button>
          </div>`,
          body: fieldsBox
        });
        card.querySelector('[data-step-up]').addEventListener('click', () => { if (si > 0) { const s = schema.steps; [s[si - 1], s[si]] = [s[si], s[si - 1]]; rerender(); } });
        card.querySelector('[data-step-down]').addEventListener('click', () => { const s = schema.steps; if (si < s.length - 1) { [s[si + 1], s[si]] = [s[si], s[si + 1]]; rerender(); } });
        card.querySelector('[data-step-edit]').addEventListener('click', () => editStep(step, rerender));
        card.querySelector('[data-add-field]').addEventListener('click', () => addField(step, data.fieldTemplates, rerender));
        list.appendChild(card);
      });
      const addStep = h`<button class="btn btn-soft">+ افزودن مرحله جدید</button>`;
      addStep.addEventListener('click', () => {
        const form = HRM.form([{ name: 'title', label: 'عنوان مرحله', type: 'text', required: true, col: 12 }]);
        const m = HRM.modal({ title: 'افزودن مرحله', body: form.el, footer: h`<button class="btn btn-primary" data-save>افزودن</button>` });
        m.el.querySelector('[data-save]').addEventListener('click', () => {
          const v = form.validate();
          if (!v.valid) return form.setErrors(v.errors);
          schema.steps.push({ key: 'step' + (schema.steps.length + 1) + '_' + Math.random().toString(36).slice(2, 6), title: v.values.title, icon: 'file-text', description: '', fields: [] });
          m.close(); rerender();
        });
      });
      list.appendChild(addStep);
    }
    renderSteps();

    function editStep(step, done) {
      const form = HRM.form([
        { name: 'title', label: 'عنوان مرحله', type: 'text', required: true, col: 6, default: step.title },
        { name: 'icon', label: 'آیکون', type: 'text', col: 6, default: step.icon || 'file-text' },
        { name: 'description', label: 'توضیح مرحله', type: 'textarea', col: 12, rows: 2, default: step.description || '' }
      ]);
      const m = HRM.modal({ title: 'ویرایش مرحله', body: form.el, footer: h`<button class="btn btn-primary" data-save>ذخیره</button>` });
      m.el.querySelector('[data-save]').addEventListener('click', () => {
        const v = form.values();
        Object.assign(step, { title: v.title, icon: v.icon, description: v.description });
        m.close(); done();
      });
    }

    function fieldForm(f) {
      return HRM.form([
        { name: 'label', label: 'عنوان فیلد', type: 'text', required: true, col: 8, default: f.label || '' },
        { name: 'required', label: 'اجباری باشد', type: 'switch', col: 4, default: !!f.required, placeholder: 'اجباری' },
        { name: 'placeholder', label: 'متن راهنما داخل فیلد', type: 'text', col: 6, default: f.placeholder || '' },
        { name: 'col', label: 'عرض (از ۱۲)', type: 'number', col: 3, default: f.col || 6 },
        { name: 'help', label: 'توضیح زیر فیلد', type: 'text', col: 12, default: f.help || '' },
        { name: 'optionsText', label: 'گزینه‌ها (هر خط یک گزینه)', type: 'textarea', col: 12, rows: 4, default: (f.options || []).join('\n') }
      ]);
    }

    function editField(step, index, done) {
      const f = step.fields[index];
      const form = fieldForm(f);
      const m = HRM.modal({
        title: `ویرایش فیلد «${f.label}»`, size: '',
        body: h`<div>${form.el}<div class="hint mt-1">نوع فیلد: ${f.type} — نام فنی: ${f.name}</div></div>`,
        footer: h`<button class="btn btn-primary" data-save>ذخیره فیلد</button>`
      });
      m.el.querySelector('[data-save]').addEventListener('click', () => {
        const v = form.validate();
        if (!v.valid) return form.setErrors(v.errors);
        Object.assign(f, {
          label: v.values.label, required: !!v.values.required, placeholder: v.values.placeholder,
          col: Number(v.values.col) || 12, help: v.values.help
        });
        if (['select', 'radio', 'checkbox'].includes(f.type)) {
          f.options = String(v.values.optionsText || '').split('\n').map((s) => s.trim()).filter(Boolean);
        }
        m.close(); done();
      });
    }

    function addField(step, templates, done) {
      const options = (templates || []).filter((t) => !['heading', 'note'].includes(t.type));
      const form = HRM.form([
        { name: 'type', label: 'نوع فیلد', type: 'select', required: true, col: 12, default: 'text', options: options.map((t) => ({ value: t.type, label: t.label })) },
        { name: 'label', label: 'عنوان فیلد', type: 'text', required: true, col: 8 },
        { name: 'required', label: 'اجباری باشد', type: 'switch', col: 4, default: false, placeholder: 'اجباری' },
        { name: 'col', label: 'عرض (از ۱۲)', type: 'number', col: 4, default: 6 },
        { name: 'help', label: 'توضیح زیر فیلد', type: 'text', col: 8 },
        { name: 'optionsText', label: 'گزینه‌ها (برای فیلدهای انتخابی؛ هر خط یک گزینه)', type: 'textarea', col: 12, rows: 3 }
      ]);
      const m = HRM.modal({ title: 'افزودن فیلد', size: '', body: form.el, footer: h`<button class="btn btn-primary" data-save>افزودن فیلد</button>` });
      m.el.querySelector('[data-save]').addEventListener('click', () => {
        const v = form.validate();
        if (!v.valid) return form.setErrors(v.errors);
        const type = v.values.type;
        const name = 'f_' + (type === 'table' ? 'table' : type) + '_' + Math.random().toString(36).slice(2, 6);
        const field = { name, label: v.values.label, type, required: !!v.values.required, col: Number(v.values.col) || 6, help: v.values.help, placeholder: '' };
        if (['select', 'radio', 'checkbox'].includes(type)) field.options = String(v.values.optionsText || '').split('\n').map((s) => s.trim()).filter(Boolean);
        if (type === 'table') field.columns = [{ name: 'col1', label: 'ستون یک', type: 'text', required: true }];
        step.fields.push(field);
        m.close(); done();
      });
    }

    page.querySelector('[data-save]') && page.querySelector('[data-save]').addEventListener('click', async () => {
      await HRM.put('/form', { schema });
      HRM.toast('فرم استخدام ذخیره شد. تغییرات در فرم متقاضیان اعمال می‌شود.', 'success');
    });
    page.querySelector('[data-reset]') && page.querySelector('[data-reset]').addEventListener('click', async () => {
      const ok = await HRM.confirm({ title: 'بازگردانی فرم', message: 'فرم استخدام به نسخه پیش‌فرض بازگردانده شود؟ تغییرات فعلی از دست می‌رود.', danger: true, confirmText: 'بازگردان' });
      if (!ok) return;
      await HRM.post('/form/reset', {});
      HRM.toast('فرم به نسخه پیش‌فرض بازگشت.', 'success');
      HRM.render();
    });
    return page;
  }

  const FIELD_ICONS = { text: 'متن', textarea: 'پاراگراف', number: 'عدد', currency: 'مبلغ', tel: 'تلفن', email: 'ایمیل', date: 'تاریخ', select: 'لیست', radio: 'تک‌گزینه', checkbox: 'چندگزینه', switch: 'بله/خیر', file: 'فایل', table: 'جدول', rating: 'امتیاز', url: 'پیوند', heading: 'تیتر', note: 'یادداشت' };

  /* ============================================================ کانبان */
  async function renderPipeline(params, query) {
    const jobId = query.jobId || '';
    const data = await HRM.get('/applications/kanban' + (jobId ? '?jobId=' + jobId : ''));
    const jobs = await HRM.get('/applications?perPage=1').then((r) => r.jobs).catch(() => []);
    const page = h`<div></div>`;
    page.appendChild(h`<div class="page-head">
      <div><div class="title">قیف جذب (کانبان)</div><div class="desc">پرونده‌ها را با کشیدن و رهاکردن بین مراحل جابه‌جا کنید — تغییر وضعیت به‌صورت خودکار ثبت می‌شود.</div></div>
      <div class="actions">
        <select class="select" style="max-width:240px" data-job>
          <option value="">همه موقعیت‌ها</option>
          ${jobs.map((j) => h`<option value="${j.id}" ${jobId === j.id ? 'selected' : ''}>${j.title}</option>`)}
        </select>
        <a class="btn btn-ghost" href="#/applications">نمای فهرست</a>
      </div>
    </div>`);
    page.appendChild(h`<div class="text-sm muted mb-2">${HRM.num(data.total)} پرونده در ${HRM.num(data.columns.length)} مرحله</div>`);

    const board = h`<div class="kanban"></div>`;
    data.columns.forEach((col) => {
      const items = h`<div class="kanban-col-body" data-drop="${col.key}">${(col.items || []).map((it) => kanbanCard(it))}</div>`;
      const column = h`<div class="kanban-col" data-col="${col.key}">
        <div class="kanban-col-head">
          <span class="dot-color bg-${col.color}"></span>
          <span class="grow text-sm bold">${col.title}</span>
          <span class="badge badge-outline">${HRM.num(col.total)}</span>
        </div>
        ${items}
      </div>`;
      board.appendChild(column);
    });
    page.appendChild(board);

    page.querySelector('[data-job]').addEventListener('change', (e) => HRM.go('/pipeline' + (e.target.value ? '?jobId=' + e.target.value : '')));
    page.querySelectorAll('.kanban-card').forEach((card) => {
      card.setAttribute('draggable', 'true');
      card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', card.dataset.id); card.classList.add('dragging'); });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      card.addEventListener('click', (e) => { if (!moveHappened) HRM.go('/applications/' + card.dataset.id); });
    });
    let moveHappened = false;
    board.querySelectorAll('[data-drop]').forEach((zone) => {
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('over'));
      zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.classList.remove('over');
        const id = e.dataTransfer.getData('text/plain');
        const status = zone.dataset.drop;
        if (!id) return;
        moveHappened = true;
        setTimeout(() => { moveHappened = false; }, 300);
        try {
          await HRM.post('/applications/' + id + '/status', { status });
          HRM.toast('وضعیت پرونده به‌روزرسانی شد.', 'success');
          HRM.render();
        } catch (err) { /* پیام خطا */ }
      });
    });
    return page;
  }

  function kanbanCard(it) {
    return HRM.raw(`<div class="kanban-card" data-id="${it.id}" draggable="true">
      <div class="row between gap-2">
        <span class="text-sm bold">${HRM.esc(it.name || '—')}</span>
        <span class="text-xs muted">${HRM.esc(it.code || '')}</span>
      </div>
      <div class="text-xs muted mt-1">${HRM.esc(it.jobTitle || '')}</div>
      <div class="row gap-1 wrap mt-2">
        ${it.hasAssessment ? `<span class="badge badge-mint">${HRM.esc(it.mbti || 'آزمون')}</span>` : ''}
        ${it.rating ? `<span class="badge badge-lemon">${'★'.repeat(it.rating)}</span>` : ''}
      </div>
      <div class="text-xs muted mt-1">${HRM.ago(it.createdAt)}</div>
    </div>`);
  }

  HRM.registerModule({
    key: 'recruitment', title: 'استخدام', order: 25,
    routes: {
      '/applications': (ctx) => renderList(ctx.params, ctx.query),
      '/applications/:id': (ctx) => renderDetail(ctx.params),
      '/form-builder': () => renderFormBuilder(),
      '/pipeline': (ctx) => renderPipeline(ctx.params, ctx.query)
    }
  });
})();
