/* ── کلاینت آزمون‌های شخصیت‌شناسی ──────────────────────────────── */
(function () {
  'use strict';
  const h = HRM.h;
  const FIT_JUDGEMENTS = ['عالی', 'مناسب', 'مشروط', 'نامناسب'];
  const PAIRS = [{ key: 'E/I', a: 'E', b: 'I', title: 'منبع انرژی' }, { key: 'S/N', a: 'S', b: 'N', title: 'دریافت اطلاعات' }, { key: 'T/F', a: 'T', b: 'F', title: 'تصمیم‌گیری' }, { key: 'J/P', a: 'J', b: 'P', title: 'سبک زندگی' }];

  /* ============================================================ فهرست نتایج */
  async function renderList(params, query) {
    const qs = new URLSearchParams();
    ['page', 'q', 'type', 'group', 'jobId', 'fit', 'borderline'].forEach((k) => { if (query[k]) qs.set(k, query[k]); });
    const data = await HRM.get('/assessments?' + qs.toString());
    const page = h`<div></div>`;
    const distEntries = Object.entries(data.distribution || {}).sort((a, b) => b[1] - a[1]);
    const groupEntries = Object.entries(data.groupDistribution || {});

    page.appendChild(h`<div class="page-head">
      <div><div class="title">آزمون‌های شخصیت‌شناسی</div><div class="desc">نتایج آزمون متقاضیان (MBTI) — این اطلاعات فقط برای کارشناسان و مدیران منابع انسانی قابل مشاهده است.</div></div>
      <div class="actions">
        ${HRM.can('assessments.export') ? h`<button class="btn btn-ghost" data-export>${HRM.raw(HRM.icon('download', 16))} خروجی CSV</button>` : ''}
        <a class="btn btn-soft" href="#/assessments/analytics">${HRM.raw(HRM.icon('pie-chart', 16))} تحلیل آزمون‌ها</a>
        ${HRM.can('assessments.manage') ? h`<button class="btn btn-soft" data-manual>${HRM.raw(HRM.icon('plus', 16))} ثبت دستی آزمون</button>
        <a class="btn btn-ghost" href="#/assessments/questions">بانک سؤالات</a>` : ''}
      </div>
    </div>`);

    page.appendChild(h`<div class="grid grid-kpi mb-3">
      ${HRM.statCard({ label: 'کل نتایج', value: HRM.num(data.stats.total), icon: 'clipboard-list', color: 'violet' })}
      ${HRM.statCard({ label: 'تکمیل‌شده', value: HRM.num(data.stats.completed), icon: 'check-circle', color: 'mint' })}
      ${HRM.statCard({ label: 'میانگین تناسب شغلی', value: data.stats.avgFit === null || data.stats.avgFit === undefined ? '—' : HRM.num(data.stats.avgFit) + '٪', icon: 'target', color: 'sky' })}
      ${HRM.statCard({ label: 'ابعاد مرزی', value: HRM.num(data.stats.borderlineCount), icon: 'alert', color: 'lemon', hint: 'نیازمند دقت در تفسیر' })}
    </div>`);

    page.appendChild(h`<div class="card mb-3"><div class="row gap-2 wrap">
      <div class="search-box grow" style="min-width:200px">${HRM.raw(HRM.icon('search', 16))}
        <input data-search placeholder="جست‌وجوی نام متقاضی، موبایل یا کد…" value="${query.q || ''}"></div>
      <select class="select" data-type style="max-width:170px">
        <option value="">همه تیپ‌ها</option>
        ${(data.profileList || []).map((p) => h`<option value="${p.code}" ${query.type === p.code ? 'selected' : ''}>${p.code} — ${p.name}</option>`)}
      </select>
      <select class="select" data-group style="max-width:190px">
        <option value="">همه گروه‌ها</option>
        ${(data.groups || []).map((g) => h`<option value="${g.key}" ${query.group === g.key ? 'selected' : ''}>${g.name}</option>`)}
      </select>
      <select class="select" data-job style="max-width:200px">
        <option value="">همه موقعیت‌ها</option>
        ${(data.jobs || []).map((j) => h`<option value="${j.id}" ${query.jobId === j.id ? 'selected' : ''}>${j.title}</option>`)}
      </select>
      <label class="checkline text-xs" style="padding:0 6px"><input type="checkbox" data-borderline ${query.borderline === '1' ? 'checked' : ''}> فقط نتایج دارای بُعد مرزی</label>
    </div></div>`);

    page.appendChild(h`<div class="grid grid-2 mb-3">
      ${HRM.card({
        title: 'توزیع تیپ‌های شخصیتی',
        body: distEntries.length ? h`<div class="row gap-3 wrap">
          ${HRM.charts.donut(distEntries.map(([type, count]) => ({ label: (data.profileList.find((p) => p.code === type) || {}).name ? type + ' — ' + data.profileList.find((p) => p.code === type).name : type, value: count })), { centerLabel: 'آزمون', centerValue: data.stats.total })}
        </div>` : HRM.empty('نتیجه‌ای ثبت نشده', '')
      })}
      ${HRM.card({
        title: 'توزیع گروه‌های شخصیتی',
        body: groupEntries.length ? HRM.charts.bars(groupEntries.map(([name, count], i) => ({ label: name, value: count, color: ['violet', 'sky', 'peach', 'mint'][i % 4] }))) : HRM.empty('داده‌ای ثبت نشده', '')
      })}
    </div>`);

    page.appendChild(HRM.card({
      title: 'نتایج آزمون', subtitle: `${HRM.num(data.total)} نتیجه`,
      body: HRM.table({
        columns: [
          { title: 'متقاضی', render: (r) => h`<div class="user-cell">${HRM.avatar(r.applicantName || '—', { size: 'sm' })}<div>
            <div class="text-sm bold">${r.applicantName || '—'}</div><div class="text-xs muted ltr">${r.mobile || ''}</div></div></div>` },
          { title: 'موقعیت', render: (r) => h`<div class="text-sm">${r.jobTitle || '—'}</div>` },
          { title: 'تیپ', render: (r) => h`<div class="row gap-1">${HRM.badge(r.type || '—', r.group === 'NF' ? 'rose' : r.group === 'NT' ? 'violet' : r.group === 'SJ' ? 'sky' : 'mint')}
            <span class="text-xs muted">${r.profileName || ''}</span></div>` },
          { title: 'تناسب', render: (r) => (r.fitScore === null || r.fitScore === undefined ? h`<span class="muted">—</span>` : h`<span class="bold">${HRM.num(r.fitScore)}٪</span> <span class="text-xs muted">${r.fitLevel || ''}</span>`) },
          { title: 'ابعاد مرزی', render: (r) => ((r.borderline || []).length ? h`<span class="badge badge-lemon">${r.borderline.join('، ')}</span>` : h`<span class="text-xs muted">—</span>`) },
          { title: 'اطمینان', render: (r) => HRM.badge((r.confidence || {}).level || '—', (r.confidence || {}).color || 'sky') },
          { title: 'تکمیل', render: (r) => h`<div class="text-xs">${HRM.jdate(r.completedAt)}</div><div class="text-xs muted">${HRM.ago(r.completedAt)}</div>` },
          { title: 'تفسیر HR', render: (r) => (r.hasHrNotes ? HRM.badge('ثبت‌شده', 'mint', true) : HRM.badge('ثبت نشده', 'outline')) },
          { title: '', class: 'actions-cell', render: (r) => h`<button class="btn btn-sm btn-soft" data-open="${r.id}">${HRM.raw(HRM.icon('eye', 14))} گزارش</button>` }
        ],
        rows: data.rows,
        empty: HRM.empty('نتیجه‌ای یافت نشد', 'پس از تکمیل آزمون توسط متقاضیان، نتایج اینجا نمایش داده می‌شود.')
      })
    }));
    if (data.pages > 1) page.appendChild(HRM.pagination({ page: data.page, pages: data.pages, total: data.total, perPage: data.perPage, onChange: (p) => go({ page: p }) }));

    const go = (patch) => {
      const merged = Object.assign({}, query, patch);
      const q = new URLSearchParams();
      Object.keys(merged).forEach((k) => { if (merged[k]) q.set(k, merged[k]); });
      const s = q.toString();
      HRM.go('/assessments' + (s ? '?' + s : ''));
    };
    const search = page.querySelector('[data-search]');
    search.addEventListener('input', HRM.debounce(() => go({ q: search.value.trim(), page: 1 }), 500));
    page.querySelector('[data-type]').addEventListener('change', (e) => go({ type: e.target.value, page: 1 }));
    page.querySelector('[data-group]').addEventListener('change', (e) => go({ group: e.target.value, page: 1 }));
    page.querySelector('[data-job]').addEventListener('change', (e) => go({ jobId: e.target.value, page: 1 }));
    page.querySelector('[data-borderline]').addEventListener('change', (e) => go({ borderline: e.target.checked ? 1 : '', page: 1 }));
    page.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => HRM.go('/assessments/' + b.dataset.open)));
    page.querySelector('[data-export]').addEventListener('click', () => HRM.download('/api/assessments/export/csv', 'assessments.csv'));
    page.querySelector('[data-manual]') && page.querySelector('[data-manual]').addEventListener('click', () => manualEntry(go));
    return page;
  }

  /* ثبت دستی آزمون کاغذی */
  async function manualEntry(done) {
    const apps = await HRM.get('/applications?perPage=100').catch(() => ({ rows: [] }));
    const form = HRM.form([
      { name: 'applicationId', label: 'پرونده متقاضی', type: 'select', col: 12, options: (apps.rows || []).map((a) => ({ value: a.id, label: `${a.name} — ${a.jobTitle || ''} (${a.code || ''})` })) },
      { name: 'applicantName', label: 'نام متقاضی (در صورت نبود پرونده)', type: 'text', col: 6 },
      { name: 'mobile', label: 'موبایل', type: 'tel', col: 6 },
      { name: 'answersText', label: 'پاسخ‌ها: هر خط «شماره سؤال=گزینه» (مثال: 1=a)', type: 'textarea', required: true, col: 12, rows: 8, help: 'گزینه‌ها: a یا b (الف/ب نیز پذیرفته می‌شود)' }
    ]);
    const m = HRM.modal({
      title: 'ثبت دستی نتیجه آزمون', size: '',
      subtitle: 'برای متقاضیانی که آزمون را روی کاغذ تکمیل کرده‌اند',
      body: form.el,
      footer: h`<button class="btn btn-primary" data-save>ثبت و تحلیل آزمون</button>`
    });
    m.el.querySelector('[data-save]').addEventListener('click', async () => {
      const v = form.validate();
      if (!v.valid) return form.setErrors(v.errors);
      const answers = {};
      String(v.values.answersText).split('\n').forEach((line) => {
        const mm = line.split(/[=:،]/);
        if (mm.length >= 2) {
          const no = String(mm[0]).replace(/\D/g, '');
          const val = String(mm[1]).trim().replace(/[اب]\s*\)?/, (x) => (x.startsWith('ا') ? 'a' : 'b')).trim();
          if (no) answers[no] = /^a|الف/i.test(val) ? 'a' : /^b|ب/i.test(val) ? 'b' : val;
        }
      });
      if (!Object.keys(answers).length) return HRM.toast('حداقل یک پاسخ معتبر وارد کنید.', 'warning');
      const res = await HRM.post('/assessments/manual', { applicationId: v.values.applicationId || null, applicantName: v.values.applicantName, mobile: v.values.mobile, answers });
      HRM.toast('نتیجه آزمون ثبت و تحلیل شد.', 'success');
      m.close();
      HRM.go('/assessments/' + (res.result ? res.result.id : ''));
      if (done) done();
    });
  }

  /* ============================================================ گزارش کامل */
  async function renderDetail(params) {
    const d = await HRM.get('/assessments/' + params.id);
    const r = d.result;
    const full = d.full;
    const p = d.insight.profile;
    const page = h`<div></div>`;

    page.appendChild(h`<div class="page-head">
      <div>
        <div class="row gap-2 wrap" style="align-items:center">
          <span class="title" style="font-size:1.2rem">گزارش آزمون شخصیت‌شناسی — ${r.applicantName || ''}</span>
          ${HRM.badge(r.type || '—', r.group === 'NF' ? 'rose' : r.group === 'NT' ? 'violet' : r.group === 'SJ' ? 'sky' : 'mint')}
          ${r.fitLevel ? HRM.badge(r.fitLevel, (d.jobFit || {}).color || 'sky') : ''}
        </div>
        <div class="desc">${p.name || ''} — ${p.tagline || ''} | موقعیت: ${r.jobTitle || '—'} | آزمون: ${HRM.jdate(full.completedAt)}</div>
      </div>
      <div class="actions">
        <button class="btn btn-ghost" data-back>بازگشت</button>
        ${d.application ? h`<a class="btn btn-soft" href="#/applications/${d.application.id}">پرونده متقاضی</a>` : ''}
        ${HRM.can('assessments.manage') ? h`<button class="btn btn-ghost danger" data-del>حذف نتیجه</button>` : ''}
      </div>
    </div>`);

    if (d.application && d.application.status === 'new') {
      page.appendChild(h`<div class="insight lemon mb-2"><span class="ic">${HRM.raw(HRM.icon('alert', 14))}</span>
        <div class="text-sm">وضعیت این پرونده هنوز «ثبت جدید» است. پس از بررسی نتیجه آزمون، وضعیت را از پرونده متقاضی به مرحله بعد تغییر دهید.</div></div>`);
    }

    /* خلاصه بالای گزارش */
    page.appendChild(h`<div class="grid grid-kpi mb-3">
      ${HRM.statCard({ label: 'تیپ شخصیتی', value: r.type || '—', icon: 'brain', color: 'violet', hint: p.name || '' })}
      ${HRM.statCard({ label: 'گروه شخصیتی', value: (d.insight.group || {}).name || '—', icon: 'users', color: 'sky', hint: (d.insight.group || {}).description || '' })}
      ${HRM.statCard({ label: 'تناسب شغلی', value: r.fitScore === null || r.fitScore === undefined ? '—' : HRM.num(r.fitScore) + '٪', icon: 'target', color: (d.jobFit || {}).color || 'mint', hint: d.jobFit && d.jobFit.hasIdealTypes ? 'تیپ‌های آرمانی: ' + (d.jobFit.idealTypes || []).join('، ') : 'تیپ آرمانی تعریف نشده' })}
      ${HRM.statCard({ label: 'اعتبار تفسیر', value: (r.confidence || {}).level || '—', icon: 'shield-check', color: (r.confidence || {}).color || 'lemon', hint: (r.confidence || {}).note || '' })}
    </div>`);

    /* ابعاد + پرتره */
    const dims = d.insight.dimensions || [];
    const radarAxes = dims.map((x) => ({ label: (x.winnerLabel || x.pair), value: x.dominantPercent || 50 }));
    page.appendChild(h`<div class="grid grid-2 mb-3">
      ${HRM.card({
        title: 'نیم‌رخ چهار بُعد شخصیتی',
        body: h`<div>
          <div class="row gap-3 wrap mb-2">
            ${HRM.charts.radar(radarAxes, { size: 250 })}
            <div class="grow col gap-1">
              ${dims.map((x) => h`<div>
                <div class="row between text-sm"><span>${x.title}</span><span class="bold">${x.winnerLabel} (${HRM.num(x.dominantPercent || 50)}٪)</span></div>
                <div class="dim-bar"><div class="dim-track"><div class="dim-a ${x.borderline ? 'dim-b' : ''}" style="width:${x.aPercent}%"></div><div class="dim-b" style="width:${x.bPercent}%"></div></div></div>
                <div class="text-xs muted">${x.a} ${HRM.num(x.aScore)} — ${x.b} ${HRM.num(x.bScore)} ${x.borderline ? '• بُعد مرزی (اختلاف کم)' : ''}</div>
              </div>`)}
            </div>
          </div>
          ${full.borderlineNote ? h`<div class="insight lemon"><span class="ic">${HRM.raw(HRM.icon('alert', 14))}</span><div class="text-xs">${full.borderlineNote}</div></div>` : ''}
        </div>`
      })}
      ${HRM.card({
        title: 'خلاصه تیپ شخصیتی',
        body: h`<div>
          <div class="text-sm" style="line-height:2">${p.summary || ''}</div>
          <div class="divider"></div>
          <div class="text-sm bold mb-1">نقاط قوت</div>
          <div class="row gap-1 wrap">${(p.strengths || []).map((s) => HRM.badge(s, 'mint'))}</div>
          <div class="text-sm bold mb-1 mt-2">نقاط قابل توجه / چالش‌ها</div>
          <div class="row gap-1 wrap">${(p.weaknesses || []).map((s) => HRM.badge(s, 'lemon'))}</div>
          <div class="divider"></div>
          ${HRM.fieldRow('سبک کاری', p.workStyle || '—')}
          ${HRM.fieldRow('سبک ارتباطی', p.communication || '—')}
          ${HRM.fieldRow('تصمیم‌گیری', p.decisionMaking || '—')}
          ${HRM.fieldRow('زیر فشار', p.underPressure || '—')}
          ${HRM.fieldRow('رهبری و کار تیمی', [p.leadership, p.teamwork].filter(Boolean).join(' — ') || '—')}
        </div>`
      })}
    </div>`);

    /* تفسیر ابعاد */
    page.appendChild(HRM.card({
      title: 'تفسیر تفصیلی هر بُعد', subtitle: 'نقطه قوت، نکات احتیاطی و توصیه مدیریتی',
      className: 'mb-3',
      body: h`<div class="col gap-2">${dims.map((x) => h`<div class="card pad-sm" style="box-shadow:none">
        <div class="row between wrap gap-2">
          <div class="bold text-sm">${x.title}</div>
          <div class="row gap-1">${HRM.badge(x.winnerLabel, x.winnerColor || 'violet')}${x.borderline ? HRM.badge('مرزی', 'lemon') : HRM.badge(x.strength || '', 'sky')}</div>
        </div>
        <div class="text-xs muted mt-1">${x.interpretation || x.description || ''}</div>
        ${x.winnerInsight ? h`<div class="grid grid-2 mt-2">
          <div class="insight mint"><span class="ic">✓</span><div class="text-xs"><span class="bold">در کار: </span>${x.winnerInsight.inWork || ''}</div></div>
          <div class="insight lemon"><span class="ic">!</span><div class="text-xs"><span class="bold">نکته مدیریتی: </span>${x.winnerInsight.managerTip || x.winnerInsight.watchOut || ''}</div></div>
        </div>` : ''}
      </div>`)}</div>`
    }));

    /* تناسب شغلی */
    if (d.jobFit) {
      const jf = d.jobFit;
      page.appendChild(HRM.card({
        title: 'تحلیل تناسب با موقعیت شغلی', subtitle: jf.jobTitle || '',
        className: 'mb-3',
        body: h`<div>
          <div class="row between wrap gap-2">
            <div class="row gap-2"><span class="bold" style="font-size:1.6rem">${jf.score === null || jf.score === undefined ? '—' : HRM.num(jf.score) + '٪'}</span>${HRM.badge(jf.level || '', jf.color || 'sky')}</div>
            <div class="row gap-1 wrap">${(jf.idealTypes || []).map((t) => HRM.badge(t, t === (r.type || '') ? 'mint' : 'outline'))}</div>
          </div>
          ${jf.bestMatchType ? HRM.fieldRow('نزدیک‌ترین تیپ آرمانی', `${jf.bestMatchType} — ${HRM.num(jf.sharedLetters || 0)} مؤلفه از ۴ مؤلفه مشترک`) : ''}
          <div class="bar-track mt-2"><div class="bar-fill ${jf.color || 'violet'}" style="width:${jf.score || 0}%"></div></div>
          <div class="grid grid-2 mt-2">
            <div>${(jf.reasons || []).length ? h`<div class="text-sm bold mb-1">دلایل تناسب</div>${jf.reasons.map((t) => h`<div class="checkline text-sm"><span>✓</span><span>${t}</span></div>`)}` : ''}
              ${(jf.suggestions || []).length ? h`<div class="text-sm bold mb-1 mt-2">پیشنهادها</div>${jf.suggestions.map((t) => h`<div class="text-sm muted">• ${t}</div>`)}` : ''}</div>
            <div>${(jf.cautions || []).length ? h`<div class="text-sm bold mb-1">نکات احتیاطی</div>${jf.cautions.map((t) => h`<div class="insight lemon"><span class="ic">!</span><div class="text-xs">${t}</div></div>`)}` : ''}
              ${(jf.interviewFocus || []).length ? h`<div class="text-sm bold mb-1 mt-2">محورهای پیشنهادی مصاحبه</div>${jf.interviewFocus.map((t) => h`<div class="text-sm">• ${t}</div>`)}` : ''}</div>
          </div>
        </div>`
      }));
    }

    /* راهنمای تفسیر و کاربرد در مصاحبه */
    page.appendChild(h`<div class="grid grid-2 mb-3">
      ${HRM.card({ title: 'راهنمای تفسیر حرفه‌ای', body: h`<div class="col gap-1">${(d.insight.guidelines || []).map((g) => h`<div class="insight sky"><span class="ic">ℹ️</span><div class="text-xs">${g}</div></div>`)}</div>` })}
      ${HRM.card({
        title: 'توصیه‌های مدیریت و توسعه',
        body: h`<div>
          ${(p.manageTips || []).length ? h`<div class="text-sm bold mb-1">توصیه به مدیر</div>${p.manageTips.map((t) => h`<div class="text-sm">• ${t}</div>`)}<div class="divider"></div>` : ''}
          ${(p.developTips || []).length ? h`<div class="text-sm bold mb-1">مسیر توسعه فردی</div>${p.developTips.map((t) => h`<div class="text-sm">• ${t}</div>`)}<div class="divider"></div>` : ''}
          ${(p.idealRoles || []).length ? h`<div class="text-sm bold mb-1">نقش‌های مناسب</div><div class="row gap-1 wrap">${p.idealRoles.map((t) => HRM.badge(t, 'mint'))}</div>` : ''}
          ${(p.riskyRoles || []).length ? h`<div class="text-sm bold mb-1 mt-2">نقش‌های پرچالش</div><div class="row gap-1 wrap">${p.riskyRoles.map((t) => HRM.badge(t, 'rose'))}</div>` : ''}
          ${(p.interviewProbes || []).length ? h`<div class="divider"></div><div class="text-sm bold mb-1">پرسش‌های پیشنهادی مصاحبه</div>${p.interviewProbes.map((t) => h`<div class="text-sm">• ${t}</div>`)}` : ''}
        </div>`
      })}
    </div>`);

    /* پاسخ‌ها */
    page.appendChild(HRM.card({
      title: 'تحلیل پاسخ‌ها (سؤال به سؤال)',
      subtitle: `${HRM.num(full.answered)} از ${HRM.num(full.total)} پاسخ — ابعاد مرزی: ${(full.borderline || []).join('، ') || 'ندارد'}`,
      className: 'mb-3',
      body: h`<div class="row gap-1 wrap">${(full.perQuestion || []).map((q) => h`<span class="badge ${q.answered ? 'badge-mint' : 'badge-outline'}" title="سؤال ${q.no}">${HRM.num(q.no)}${q.code ? '·' + q.code : ''}</span>`)}</div>`
    }));

    /* تفسیر منابع انسانی */
    const notes = d.hrNotes || {};
    const noteCard = HRM.card({
      title: 'تفسیر و جمع‌بندی منابع انسانی',
      subtitle: notes.byName ? `آخرین ویرایش: ${notes.byName} — ${HRM.jdate(notes.at)}` : 'نظر حرفه‌ای کارشناس منابع انسانی روی این نتیجه',
      actions: HRM.can('assessments.review') ? h`<button class="btn btn-sm btn-soft" data-notes>${notes.text ? 'ویرایش' : 'ثبت'} تفسیر</button>` : '',
      body: h`<div>
        ${notes.fitJudgement ? h`<div class="mb-2">${HRM.fieldRow('جمع‌بندی تناسب', HRM.badge(notes.fitJudgement, notes.fitJudgement === 'عالی' ? 'mint' : notes.fitJudgement === 'مناسب' ? 'sky' : notes.fitJudgement === 'مشروط' ? 'lemon' : 'rose'))}</div>` : ''}
        <div class="text-sm" style="white-space:pre-line">${notes.text || 'هنوز تفسیری ثبت نشده است.'}</div>
      </div>`
    });
    page.appendChild(noteCard);
    noteCard.querySelector('[data-notes]') && noteCard.querySelector('[data-notes]').addEventListener('click', () => {
      const form = HRM.form([
        { name: 'fitJudgement', label: 'جمع‌بندی تناسب', type: 'select', col: 6, default: notes.fitJudgement || '', options: FIT_JUDGEMENTS },
        { name: 'text', label: 'تفسیر و توضیحات', type: 'textarea', col: 12, rows: 5, default: notes.text || '' }
      ]);
      const m = HRM.modal({ title: 'تفسیر منابع انسانی', size: '', body: form.el, footer: h`<button class="btn btn-primary" data-save>ذخیره تفسیر</button>` });
      m.el.querySelector('[data-save]').addEventListener('click', async () => {
        const v = form.values();
        await HRM.put('/assessments/' + r.id + '/notes', { text: v.text, fitJudgement: v.fitJudgement || null });
        HRM.toast('تفسیر ثبت شد.', 'success');
        m.close(); HRM.render();
      });
    });

    page.querySelector('[data-back]').addEventListener('click', () => HRM.go('/assessments'));
    page.querySelector('[data-del]') && page.querySelector('[data-del]').addEventListener('click', async () => {
      const ok = await HRM.confirm({ title: 'حذف نتیجه آزمون', message: 'این نتیجه آزمون حذف شود؟ این عملیات بازگشت‌پذیر نیست.', danger: true, confirmText: 'حذف کن' });
      if (!ok) return;
      await HRM.del('/assessments/' + r.id);
      HRM.toast('نتیجه آزمون حذف شد.', 'success');
      HRM.go('/assessments');
    });
    return page;
  }

  /* ============================================================ تحلیل آزمون‌ها */
  async function renderAnalytics() {
    const d = await HRM.get('/assessments/analytics/overview');
    const page = h`<div></div>`;
    page.appendChild(h`<div class="page-head">
      <div><div class="title">تحلیل آزمون‌های شخصیت‌شناسی</div><div class="desc">نگاه تجمعی به تیپ‌ها، گروه‌ها و تناسب شغلی متقاضیان</div></div>
      <div class="actions"><a class="btn btn-ghost" href="#/assessments">بازگشت به نتایج</a></div>
    </div>`);
    page.appendChild(h`<div class="grid grid-kpi mb-3">
      ${HRM.statCard({ label: 'نتایج ثبت‌شده', value: HRM.num(d.totals.results), icon: 'clipboard-list', color: 'violet' })}
      ${HRM.statCard({ label: 'متقاضیان یکتا', value: HRM.num(d.totals.uniqueApplicants), icon: 'users', color: 'sky' })}
      ${HRM.statCard({ label: 'تیپ‌های مشاهده‌شده', value: HRM.num(d.totals.types), icon: 'brain', color: 'lemon' })}
      ${HRM.statCard({ label: 'میانگین تناسب', value: d.totals.avgFit === null ? '—' : HRM.num(d.totals.avgFit) + '٪', icon: 'target', color: 'mint' })}
      ${HRM.statCard({ label: 'نرخ استخدام آزمون‌داده‌ها', value: HRM.num(d.totals.assessmentToHireRate) + '٪', icon: 'user-check', color: 'peach' })}
    </div>`);

    page.appendChild(h`<div class="grid grid-2 mb-3">
      ${HRM.card({
        title: 'توزیع تیپ‌های شخصیتی',
        body: (d.typeDistribution || []).length ? h`<div class="row gap-3 wrap">
          ${HRM.charts.donut((d.typeDistribution || []).map((t) => ({ label: `${t.type} — ${t.name}`, value: t.count })), { centerLabel: 'آزمون', centerValue: d.totals.results })}
          <div class="grow">${HRM.charts.bars((d.typeDistribution || []).slice(0, 8).map((t) => ({ label: `${t.name} (${t.type})`, value: t.count, color: t.color })))}</div>
        </div>` : HRM.empty('داده‌ای ثبت نشده', '')
      })}
      ${HRM.card({
        title: 'توزیع گروه‌های شخصیتی',
        body: (d.groupDistribution || []).length ? h`<div class="col gap-2">
          ${(d.groupDistribution || []).map((g) => h`<div><div class="row between text-sm"><span>${g.name}</span><span class="muted">${HRM.num(g.count)} نفر</span></div>
            <div class="bar-track"><div class="bar-fill ${g.color}" style="width:${Math.round((g.count / Math.max(1, d.totals.results)) * 100)}%"></div></div>
            <div class="text-xs muted">${g.description || ''}</div></div>`)}
        </div>` : HRM.empty('داده‌ای ثبت نشده', '')
      })}
    </div>`);

    page.appendChild(HRM.card({
      title: 'تمایل قطبی در چهار بُعد', subtitle: 'درصد پاسخ‌های هر قطب میان همه متقاضیان',
      className: 'mb-3',
      body: HRM.table({
        columns: [
          { title: 'بُعد', render: (x) => h`<div class="text-sm bold">${x.pair}</div>` },
          { title: (d.pairDistribution[0] || {}).a ? (d.pairDistribution[0].a.key || '') : '', render: (x) => h`<div class="row gap-2"><div class="grow"><div class="bar-track"><div class="bar-fill violet" style="width:${x.a.percent}%"></div></div></div><div class="text-sm">${x.a.key}: ${HRM.num(x.a.percent)}٪ (${HRM.num(x.a.count)})</div></div>` },
          { title: '', render: (x) => h`<div class="row gap-2"><div class="grow"><div class="bar-track"><div class="bar-fill sky" style="width:${x.b.percent}%"></div></div></div><div class="text-sm">${x.b.key}: ${HRM.num(x.b.percent)}٪ (${HRM.num(x.b.count)})</div></div>` }
        ],
        rows: d.pairDistribution || [],
        empty: HRM.empty('داده‌ای ثبت نشده', '')
      })
    }));

    page.appendChild(HRM.card({
      title: 'عملکرد شخصیتی به تفکیک موقعیت شغلی',
      className: 'mb-3',
      body: HRM.table({
        columns: [
          { title: 'موقعیت', render: (x) => h`<div class="text-sm bold">${x.title}</div><div class="text-xs muted">تیپ‌های آرمانی: ${(x.idealTypes || []).join('، ') || 'تعریف نشده'}</div>` },
          { title: 'آزمون‌داده', render: (x) => HRM.num(x.total) },
          { title: 'میانگین تناسب', render: (x) => (x.avgFit === null || x.avgFit === undefined ? '—' : HRM.num(x.avgFit) + '٪') },
          { title: 'تناسب بالا', render: (x) => HRM.badge(HRM.num(x.highFit), x.highFit ? 'mint' : 'outline') },
          { title: 'پرتکرارترین تیپ', render: (x) => { const t = (x.topTypes || [])[0]; return t ? h`<div class="row gap-1">${HRM.badge(t.type, 'violet')}<span class="text-xs muted">${HRM.num(t.count)} نفر</span></div>` : '—'; } }
        ],
        rows: d.byJob || [],
        empty: HRM.empty('داده‌ای ثبت نشده', '')
      })
    }));

    page.appendChild(HRM.card({
      title: 'آخرین نتایج آزمون',
      body: HRM.table({
        columns: [
          { title: 'متقاضی', render: (r) => h`<div class="text-sm">${r.applicantName}</div><div class="text-xs muted">${r.jobTitle || ''}</div>` },
          { title: 'تیپ', render: (r) => HRM.badge(r.type || '—', 'violet') },
          { title: 'تناسب', render: (r) => (r.fitScore === null ? '—' : HRM.num(r.fitScore) + '٪') },
          { title: 'زمان', render: (r) => HRM.ago(r.completedAt) },
          { title: '', class: 'actions-cell', render: (r) => h`<button class="btn btn-sm btn-ghost" data-open="${r.id}">${HRM.raw(HRM.icon('eye', 14))}</button>` }
        ],
        rows: d.recentResults || []
      })
    }));
    page.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => HRM.go('/assessments/' + b.dataset.open)));
    return page;
  }

  /* ============================================================ بانک سؤالات */
  async function renderQuestions() {
    const data = await HRM.get('/assessments/questions/bank');
    const page = h`<div></div>`;
    const pairOf = (no) => ((no - 1) % 4) + 1;
    page.appendChild(h`<div class="page-head">
      <div><div class="title">بانک سؤالات آزمون</div><div class="desc">${HRM.num(data.questions.length)} سؤال دوگزینه‌ای — تغییر متن سؤال و گزینه‌ها</div></div>
      <div class="actions">
        <a class="btn btn-ghost" href="#/assessments">بازگشت به نتایج</a>
        ${HRM.can('assessments.manage') ? h`<button class="btn btn-soft" data-reset>بازگردانی سؤالات پیش‌فرض</button>` : ''}
      </div>
    </div>`);
    const pairs = data.pairs || [];
    const groups = {};
    data.questions.forEach((q) => { const k = pairOf(q.no); (groups[k] = groups[k] || []).push(q); });
    [1, 2, 3, 4].forEach((k) => {
      const pair = pairs[k - 1] || {};
      const list = groups[k] || [];
      if (!list.length) return;
      const body = h`<div class="col gap-1"></div>`;
      list.forEach((q) => {
        const row = h`<div class="row between wrap gap-2" style="padding:8px 10px;border:1px solid var(--border);border-radius:12px" data-q="${q.no}">
          <div class="row gap-2" style="align-items:flex-start">
            <span class="badge badge-violet">${HRM.num(q.no)}</span>
            <div>
              <div class="text-sm">${q.text}</div>
              <div class="row gap-1 mt-1 wrap">
                ${q.options.map((o) => HRM.badge((o.key || '') + '. ' + (o.label || ''), 'sky'))}
                ${q.active === false ? HRM.badge('غیرفعال', 'outline') : ''}
                ${q.edited ? HRM.badge('ویرایش‌شده', 'lemon') : ''}
              </div>
            </div>
          </div>
          ${HRM.can('assessments.manage') ? h`<button class="btn btn-sm btn-soft" data-edit="${q.no}">ویرایش</button>` : ''}
        </div>`;
        if (HRM.can('assessments.manage')) {
          row.querySelector('[data-edit]').addEventListener('click', () => {
            const form = HRM.form([
              { name: 'text', label: 'متن سؤال', type: 'textarea', required: true, col: 12, rows: 2, default: q.text },
              { name: 'optionA', label: 'گزینه الف', type: 'text', required: true, col: 6, default: (q.options[0] || {}).label || '' },
              { name: 'optionB', label: 'گزینه ب', type: 'text', required: true, col: 6, default: (q.options[1] || {}).label || '' },
              { name: 'active', label: 'سؤال فعال باشد', type: 'switch', col: 12, default: q.active !== false }
            ]);
            const m = HRM.modal({ title: 'ویرایش سؤال ' + q.no, size: '', body: form.el, footer: h`<button class="btn btn-primary" data-save>ذخیره</button>` });
            m.el.querySelector('[data-save]').addEventListener('click', async () => {
              const v = form.validate();
              if (!v.valid) return form.setErrors(v.errors);
              await HRM.put('/assessments/questions/' + q.no, {
                text: v.values.text,
                options: [{ key: 'a', label: v.values.optionA }, { key: 'b', label: v.values.optionB }],
                active: v.values.active
              });
              HRM.toast('سؤال ذخیره شد. تغییرات روی آزمون‌های جدید اعمال می‌شود.', 'success');
              m.close(); HRM.render();
            });
          });
        }
        body.appendChild(row);
      });
      page.appendChild(HRM.card({
        title: `بُعد ${k}: ${pair.title || ''}`,
        subtitle: `${pair.description || ''} — (${(pair.a || '')} در برابر ${(pair.b || '')})`,
        className: 'mb-2',
        body
      }));
    });
    page.querySelector('[data-reset]') && page.querySelector('[data-reset]').addEventListener('click', async () => {
      const ok = await HRM.confirm({ title: 'بازگردانی سؤالات', message: 'همه سؤالات به متن پیش‌فرض بازگردانده شوند؟ ویرایش‌های شما از دست می‌رود.', danger: true, confirmText: 'بازگردان' });
      if (!ok) return;
      await HRM.post('/assessments/questions/reset', {});
      HRM.toast('سؤالات به نسخه پیش‌فرض بازگشت.', 'success');
      HRM.render();
    });
    return page;
  }

  HRM.registerModule({
    key: 'assessments', title: 'آزمون‌ها', order: 30,
    routes: {
      '/assessments': (ctx) => renderList(ctx.params, ctx.query),
      '/assessments/analytics': () => renderAnalytics(),
      '/assessments/questions': () => renderQuestions(),
      '/assessments/:id': (ctx) => renderDetail(ctx.params)
    }
  });
})();
