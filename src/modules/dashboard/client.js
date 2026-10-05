/* ── کلاینت داشبورد مدیریتی ────────────────────────────────────── */
(function () {
  'use strict';
  const h = HRM.h;

  async function render() {
    const d = await HRM.get('/dashboard');
    const k = d.kpis || {};
    const page = h`<div></div>`;

    page.appendChild(h`<div class="page-head">
      <div>
        <div class="title">${d.greeting || 'داشبورد مدیریتی'}</div>
        <div class="desc">نمای کلی وضعیت جذب و استخدام ${d.trendDays ? 'در ' + HRM.num(d.trendDays) + ' روز گذشته' : ''}</div>
      </div>
      <div class="actions">
        ${HRM.can('jobs.create') ? h`<button class="btn btn-ghost" data-new-job>${HRM.raw(HRM.icon('plus', 16))} موقعیت شغلی جدید</button>` : ''}
        ${HRM.can('applications.view') ? h`<button class="btn btn-primary" data-apps>${HRM.raw(HRM.icon('user-plus', 16))} فهرست متقاضیان</button>` : ''}
      </div>
    </div>`);

    /* KPI ها */
    const delta = k.weekDelta || {};
    const trend = (key) => (typeof delta[key] === 'number' && delta[key] !== 0
      ? h`<span class="${delta[key] > 0 ? 'trend-up' : 'trend-down'}">${delta[key] > 0 ? '▲' : '▼'} ${HRM.num(Math.abs(delta[key]))}٪ هفته گذشته</span>` : null);
    page.appendChild(h`<div class="grid grid-kpi mb-3">
      ${HRM.statCard({ label: 'موقعیت‌های باز', value: HRM.num(k.openJobs), icon: 'briefcase', color: 'violet', hint: `از ${HRM.num(k.totalJobs)} موقعیت` })}
      ${HRM.statCard({ label: 'کل درخواست‌ها', value: HRM.num(k.totalApplications), icon: 'inbox', color: 'sky', hint: trend('applications') })}
      ${HRM.statCard({ label: 'در حال بررسی', value: HRM.num(k.activeApplications), icon: 'activity', color: 'peach', hint: `${HRM.num(k.newApplications)} درخواست جدید` })}
      ${HRM.statCard({ label: 'استخدام‌شده', value: HRM.num(k.hired), icon: 'user-check', color: 'mint', hint: k.hireRate ? 'نرخ استخدام: ' + HRM.num(k.hireRate) + '٪' : null })}
      ${HRM.statCard({ label: 'مصاحبه‌های پیش‌رو', value: HRM.num(k.upcomingInterviews), icon: 'calendar-clock', color: 'lemon', hint: k.interviewStage ? HRM.num(k.interviewStage) + ' در مرحله مصاحبه' : null })}
      ${HRM.statCard({ label: 'آزمون شخصیتی', value: HRM.num(k.assessmentsCompleted), icon: 'brain', color: 'violet', hint: k.assessmentsPending ? HRM.num(k.assessmentsPending) + ' در انتظار تکمیل' : 'همه تکمیل شده' })}
      ${HRM.statCard({ label: 'ثبت‌شده این هفته', value: HRM.num(k.submittedThisWeek), icon: 'trending-up', color: 'sky', hint: trend('applications') })}
      ${HRM.statCard({ label: 'میانگین زمان جذب', value: k.avgTimeToHire === null || k.avgTimeToHire === undefined ? '—' : HRM.num(k.avgTimeToHire) + ' روز', icon: 'clock', color: 'mint', hint: k.screening ? HRM.num(k.screening) + ' در غربالگری' : null })}
    </div>`);

    /* روند + قیف */
    const trendData = d.trend || [];
    const funnelSteps = [
      { label: 'ثبت درخواست', value: (d.funnel.reached || {}).new || 0, color: 'violet' },
      { label: 'غربالگری', value: (d.funnel.reached || {}).screening || 0, color: 'sky' },
      { label: 'آزمون', value: (d.funnel.reached || {}).assessment || 0, color: 'lemon' },
      { label: 'مصاحبه', value: (d.funnel.reached || {}).interview || 0, color: 'peach' },
      { label: 'ارزیابی', value: (d.funnel.reached || {}).evaluation || 0, color: 'rose' },
      { label: 'پیشنهاد شغلی', value: (d.funnel.reached || {}).offer || 0, color: 'mint' },
      { label: 'استخدام', value: (d.funnel.reached || {}).hired || 0, color: 'mint' }
    ];
    page.appendChild(h`<div class="grid grid-2 mb-3">
      ${HRM.card({
        title: 'روند ورود متقاضیان', subtitle: (d.trendDays || 30) + ' روز گذشته',
        actions: h`<div class="row gap-2">${HRM.charts.sparkline(trendData.map((t) => t.count), { width: 140, height: 34 })}</div>`,
        body: trendData.length ? HRM.charts.columns(trendData.slice(-14).map((t) => ({ label: t.date.slice(8) + '/' + t.date.slice(5, 7), value: t.count })), { height: 170 }) : HRM.empty('داده‌ای برای نمایش نیست', '')
      })}
      ${HRM.card({
        title: 'قیف جذب', subtitle: 'عبور متقاضیان از مراحل',
        body: HRM.charts.funnel(funnelSteps)
      })}
    </div>`);

    /* جدول موقعیت‌ها + منابع/تیپ */
    const jobPerf = d.jobPerformance || [];
    page.appendChild(h`<div class="grid grid-2 mb-3">
      ${HRM.card({
        title: 'عملکرد موقعیت‌های شغلی',
        body: jobPerf.length ? HRM.table({
          columns: [
            { title: 'موقعیت', render: (r) => h`<div class="text-sm bold">${r.title}</div><div class="text-xs muted">${r.department || ''}</div>` },
            { title: 'ظرفیت', render: (r) => HRM.num(r.openings) },
            { title: 'متقاضی', render: (r) => HRM.num(r.total) },
            { title: 'در جریان', render: (r) => HRM.num(r.inProgress) },
            { title: 'استخدام', render: (r) => HRM.badge(HRM.num(r.hired), r.hired ? 'mint' : 'outline') },
            { title: 'نرخ', render: (r) => HRM.num(r.conversion) + '٪' }
          ],
          rows: jobPerf,
          onRowClick: (r) => HRM.go('/applications?jobId=' + r.id)
        }) : HRM.empty('موقعیتی ثبت نشده', '')
      })}
      ${HRM.card({
        title: 'منابع جذب', subtitle: 'بر اساس پاسخ «نحوه آشنایی با شرکت»',
        body: (d.sources || []).length ? HRM.charts.donut(d.sources.map((s) => ({ label: s.name, value: s.count }))) : HRM.empty('داده‌ای ثبت نشده', '')
      })}
    </div>`);

    /* توزیع تیپ شخصیتی + توزیع وضعیت */
    const mbtiEntries = Object.entries(d.mbtiDistribution || {}).sort((a, b) => b[1] - a[1]);
    const statuses = (d.statuses || []).filter((s) => s.count > 0);
    page.appendChild(h`<div class="grid grid-2 mb-3">
      ${HRM.card({
        title: 'توزیع تیپ شخصیتی متقاضیان',
        actions: HRM.can('assessments.view') ? h`<a class="btn btn-sm btn-ghost" href="#/assessments/analytics">تحلیل کامل</a>` : '',
        body: mbtiEntries.length ? h`<div>
          ${HRM.charts.donut(mbtiEntries.map(([type, count]) => ({ label: type, value: count })), { centerLabel: 'آزمون', centerValue: mbtiEntries.reduce((s, e) => s + e[1], 0) })}
          <div class="row gap-1 wrap mt-2 center">${mbtiEntries.slice(0, 8).map(([type]) => HRM.badge(type, 'violet'))}</div>
        </div>` : HRM.empty('آزمونی تکمیل نشده', '')
      })}
      ${HRM.card({
        title: 'وضعیت درخواست‌ها',
        body: statuses.length ? HRM.charts.bars(statuses.map((s) => ({ label: s.title, value: s.count, color: s.color })), { onClick: () => HRM.go('/applications') }) : HRM.empty('داده‌ای ثبت نشده', '')
      })}
    </div>`);

    /* مصاحبه‌های پیش‌رو + فعالیت‌های اخیر */
    const ivs = d.upcomingInterviews || [];
    page.appendChild(h`<div class="grid grid-2">
      ${HRM.card({
        title: 'مصاحبه‌های پیش‌رو',
        actions: HRM.can('interviews.view') ? h`<a class="btn btn-sm btn-ghost" href="#/interviews">همه مصاحبه‌ها</a>` : '',
        body: ivs.length ? h`<div class="col gap-2">${ivs.map((i) => h`<div class="row between gap-2" style="padding:10px;border:1px solid var(--border);border-radius:14px">
          <div class="row gap-2">
            ${HRM.avatar(i.candidateName || i.name || 'متقاضی', { size: 'sm' })}
            <div><div class="text-sm bold">${i.candidateName || i.name || '—'}</div>
              <div class="text-xs muted">${i.jobTitle || ''} — ${i.type || ''}</div></div>
          </div>
          <div class="text-left"><div class="text-sm">${HRM.jdate(i.scheduledAt)}</div><div class="text-xs muted">${HRM.jtime(i.scheduledAt)}</div></div>
        </div>`)}</div>` : HRM.empty('مصاحبه‌ای برنامه‌ریزی نشده', 'برای متقاضیان واجد شرایط، از پرونده متقاضی مصاحبه ثبت کنید.')
      })}
      ${HRM.card({
        title: 'فعالیت‌های اخیر سامانه',
        actions: HRM.can('audit.view') ? h`<a class="btn btn-sm btn-ghost" href="#/audit">لاگ کامل</a>` : '',
        body: (d.recentActivity || []).length ? h`<div class="timeline">${(d.recentActivity || []).map((a) => h`<div class="timeline-item">
          <div class="dot ${a.level === 'warn' ? 'warn' : ''}"></div>
          <div><div class="text-sm">${a.title}</div><div class="text-xs muted">${a.actorName} — ${HRM.ago(a.at)}</div></div>
        </div>`)}</div>` : HRM.empty('فعالیتی ثبت نشده', '')
      })}
    </div>`);

    page.querySelector('[data-apps]') && page.querySelector('[data-apps]').addEventListener('click', () => HRM.go('/applications'));
    page.querySelector('[data-new-job]') && page.querySelector('[data-new-job]').addEventListener('click', () => HRM.go('/jobs/new'));
    return page;
  }

  HRM.registerModule({
    key: 'dashboard', title: 'داشبورد', order: 10,
    routes: { '/dashboard': () => render() }
  });
})();
