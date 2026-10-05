/* ── کلاینت گزارش‌ها و تحلیل‌ها ────────────────────────────────── */
(function () {
  'use strict';
  const h = HRM.h;
  const pct = (v) => (v === null || v === undefined ? '—' : HRM.num(v) + '٪');

  async function render(params, query) {
    const days = Number(query.days || 90);
    const data = await HRM.get('/reports/overview?days=' + days);
    const k = data.kpis;
    const page = h`<div></div>`;

    page.appendChild(h`<div class="page-head">
      <div><div class="title">گزارش‌ها و تحلیل‌ها</div><div class="desc">بازه: ${data.range.label} (${HRM.num(days)} روز)</div></div>
      <div class="actions">
        <select class="select" data-range style="max-width:200px">
          ${[{ d: 7, t: '۷ روز اخیر' }, { d: 30, t: '۳۰ روز اخیر' }, { d: 90, t: '۹۰ روز اخیر' }, { d: 180, t: '۶ ماه اخیر' }, { d: 365, t: 'یک سال اخیر' }].map((o) => h`<option value="${o.d}" ${days === o.d ? 'selected' : ''}>${o.t}</option>`)}
        </select>
        ${HRM.can('reports.export') ? h`<button class="btn btn-soft" data-export>${HRM.raw(HRM.icon('download', 16))} خروجی CSV</button>` : ''}
      </div>
    </div>`);

    /* KPI */
    const cmp = (key) => {
      const c = data.compare[key];
      if (!c) return null;
      const up = c.delta >= 0;
      return h`<span class="${up ? 'trend-up' : 'trend-down'}">${up ? '▲' : '▼'} ${pct(Math.abs(c.delta))} نسبت به دوره قبل</span>`;
    };
    page.appendChild(h`<div class="grid grid-kpi mb-3">
      ${HRM.statCard({ label: 'کل درخواست‌ها', value: HRM.num(k.applications), icon: 'inbox', color: 'violet', hint: cmp('applications') })}
      ${HRM.statCard({ label: 'درخواست‌های فعال', value: HRM.num(k.activeApplications), icon: 'activity', color: 'sky' })}
      ${HRM.statCard({ label: 'استخدام‌شده', value: HRM.num(k.hires), icon: 'user-check', color: 'mint', hint: cmp('hires') })}
      ${HRM.statCard({ label: 'نرخ استخدام', value: pct(k.hireRate), icon: 'target', color: k.hireRate >= k.targetHireRate ? 'mint' : 'lemon', hint: 'هدف: ' + pct(k.targetHireRate) })}
      ${HRM.statCard({ label: 'میانگین زمان جذب', value: k.avgTimeToHire === null ? '—' : HRM.num(k.avgTimeToHire) + ' روز', icon: 'clock', color: k.avgTimeToHire === null || k.avgTimeToHire <= k.targetTimeToHire ? 'mint' : 'peach', hint: 'هدف: ' + HRM.num(k.targetTimeToHire) + ' روز' })}
      ${HRM.statCard({ label: 'مصاحبه‌ها', value: HRM.num(k.interviews), icon: 'users', color: 'peach', hint: `${HRM.num(k.completedInterviews)} انجام‌شده${k.avgInterviewScore !== null ? ' — میانگین ' + HRM.num(k.avgInterviewScore) + '٪' : ''}` })}
      ${HRM.statCard({ label: 'آزمون‌های شخصیتی', value: HRM.num(k.assessments), icon: 'brain', color: 'lemon', hint: k.avgFit === null ? null : 'میانگین تناسب: ' + HRM.num(k.avgFit) + '٪' })}
      ${HRM.statCard({ label: 'موقعیت‌های باز', value: HRM.num(k.openJobs), icon: 'briefcase', color: 'violet', hint: HRM.num(k.rejected) + ' رد‌شده در بازه' })}
    </div>`);

    /* بینش‌های خودکار */
    const insights = buildInsights(data);
    if (insights.length) {
      page.appendChild(HRM.card({
        title: 'بینش‌های کلیدی', subtitle: 'تحلیل خودکار وضعیت جذب در این بازه', className: 'mb-3',
        body: h`<div class="col gap-2">${insights.map((i) => h`<div class="insight ${i.color}">
          <span class="ic">${HRM.raw(HRM.icon(i.icon, 16))}</span>
          <div class="text-sm"><span class="bold">${i.title}: </span>${i.text}</div>
        </div>`)}</div>`
      }));
    }

    /* قیف و روند */
    const funnelSteps = [
      { label: 'ثبت درخواست', value: data.funnel.reached.new, color: 'violet' },
      { label: 'غربالگری', value: data.funnel.reached.screening, color: 'sky' },
      { label: 'آزمون شخصیتی', value: data.funnel.reached.assessment, color: 'lemon' },
      { label: 'مصاحبه', value: data.funnel.reached.interview, color: 'peach' },
      { label: 'ارزیابی نهایی', value: data.funnel.reached.evaluation, color: 'rose' },
      { label: 'پیشنهاد شغلی', value: data.funnel.reached.offer, color: 'mint' },
      { label: 'استخدام', value: data.funnel.reached.hired, color: 'mint' }
    ];
    page.appendChild(h`<div class="grid grid-2 mb-3">
      ${HRM.card({
        title: 'قیف جذب', subtitle: 'تعداد متقاضیانی که هر مرحله را رد کرده‌اند',
        body: h`<div>${HRM.charts.funnel(funnelSteps)}<div class="divider"></div>
          <div class="grid grid-2">${Object.entries(data.funnel.rates).map(([key, v]) => {
            const labels = { toScreening: 'نرخ عبور به غربالگری', toAssessment: 'نرخ شرکت در آزمون', toInterview: 'نرخ دعوت به مصاحبه', toEvaluation: 'نرخ ارزیابی نهایی', toOffer: 'نرخ پیشنهاد شغلی', toHire: 'نرخ استخدام' };
            return HRM.fieldRow(labels[key] || key, pct(v));
          })}</div></div>`
      })}
      ${HRM.card({
        title: 'روند ثبت درخواست‌ها', subtitle: `روزانه در ${HRM.num(days)} روز گذشته`,
        body: (() => {
          const trend = data.trend || [];
          const total = trend.reduce((s, d) => s + d.count, 0);
          const max = Math.max(1, ...trend.map((d) => d.count));
          return h`<div>
            <div class="row between mb-2"><div><div style="font-size:1.6rem" class="bold">${HRM.num(total)}</div><div class="text-xs muted">درخواست در بازه</div></div>
              <div class="row gap-2">${HRM.charts.sparkline(trend.map((d) => d.count), { width: 160, height: 40 })}
              <div class="text-xs muted">اوج روزانه: ${HRM.num(max)}</div></div></div>
            ${HRM.charts.columns(trend.slice(-14).map((d) => ({ label: d.date.slice(5).replace('-', '/'), value: d.count })), { height: 150 })}
            <div class="text-xs muted center mt-1">۱۴ روز اخیر</div>
          </div>`;
        })()
      })}
    </div>`);

    /* شخصیت و جمعیت‌شناسی */
    const p = data.personality || {};
    const demo = data.demographics || {};
    page.appendChild(h`<div class="grid grid-2 mb-3">
      ${HRM.card({
        title: 'تحلیل شخصیتی متقاضیان', subtitle: `${HRM.num(p.total)} آزمون تکمیل‌شده`,
        body: (p.typeDistribution && p.typeDistribution.length) ? h`<div>
          <div class="row gap-3 wrap mb-2">
            ${HRM.charts.donut(p.typeDistribution.map((t) => ({ label: t.name + ' (' + t.type + ')', value: t.count })), { centerLabel: 'آزمون', centerValue: p.total })}
            <div class="grow">${HRM.charts.bars(p.typeDistribution.slice(0, 8).map((t) => ({ label: `${t.name} (${t.type})`, value: t.count, color: t.color })))}</div>
          </div>
          <div class="divider"></div>
          <div class="text-sm bold mb-1">توزیع گروه‌های شخصیتی</div>
          ${HRM.charts.bars((p.groupDistribution || []).map((g) => ({ label: g.name, value: g.count, color: g.color })))}
          <div class="divider"></div>
          <div class="text-sm bold mb-1">میزان تناسب شغلی آزمون‌ها</div>
          ${HRM.charts.bars((p.fitBuckets || []).map((b, i) => ({ label: b.label, value: b.count, color: ['mint', 'sky', 'lemon', 'rose'][i] })))}
        </div>` : HRM.empty('آزمون شخصیتی تکمیل نشده', 'پس از تکمیل آزمون توسط متقاضیان، تحلیل‌ها اینجا نمایش داده می‌شود.')
      })}
      ${HRM.card({
        title: 'جمعیت‌شناسی متقاضیان',
        body: h`<div>
          <div class="text-sm bold mb-1">مدرک تحصیلی</div>
          ${demo.education && demo.education.length ? HRM.charts.bars(demo.education.map((e) => ({ label: e.label, value: e.count, color: 'violet' }))) : h`<div class="text-xs muted mb-2">داده‌ای ثبت نشده</div>`}
          <div class="divider"></div>
          <div class="text-sm bold mb-1">نوع همکاری درخواستی</div>
          ${demo.cooperation && demo.cooperation.length ? HRM.charts.bars(demo.cooperation.map((e) => ({ label: e.label, value: e.count, color: 'sky' }))) : h`<div class="text-xs muted mb-2">داده‌ای ثبت نشده</div>`}
          ${demo.marital ? h`<div class="divider"></div><div class="text-sm bold mb-1">وضعیت تأهل</div>${HRM.charts.bars(demo.marital.map((e) => ({ label: e.label, value: e.count, color: 'peach' })))}` : ''}
          ${demo.military ? h`<div class="divider"></div><div class="text-sm bold mb-1">وضعیت خدمت سربازی</div>${HRM.charts.bars(demo.military.map((e) => ({ label: e.label, value: e.count, color: 'lemon' })))}` : ''}
          <div class="divider"></div>
          ${HRM.fieldRow('میانگین حقوق درخواستی', demo.avgExpectedSalary ? HRM.num(demo.avgExpectedSalary) + ' تومان' : '—')}
        </div>`
      })}
    </div>`);

    /* عملکرد موقعیت‌ها + منابع جذب */
    page.appendChild(h`<div class="grid grid-2 mb-3">
      ${HRM.card({
        title: 'منابع جذب متقاضیان',
        body: (data.sources || []).length ? HRM.charts.donut(data.sources.map((s) => ({ label: s.name, value: s.count })), { centerLabel: 'درخواست', centerValue: k.applications })
          : HRM.empty('منبعی ثبت نشده', '')
      })}
      ${HRM.card({
        title: 'وضعیت درخواست‌ها', subtitle: 'توزیع فعلی بر اساس مرحله',
        body: HRM.charts.bars((data.statuses || []).filter((s) => s.count > 0).map((s) => ({ label: s.title, value: s.count, color: s.color })))
      })}
    </div>`);

    page.appendChild(HRM.card({
      title: 'عملکرد موقعیت‌های شغلی', className: 'mb-3',
      body: HRM.table({
        columns: [
          { title: 'موقعیت شغلی', render: (r) => h`<div class="bold text-sm">${r.title}</div><div class="text-xs muted">${r.department || ''}</div>` },
          { title: 'وضعیت', render: (r) => HRM.statusBadge(r.status, r.status === 'open' ? 'در حال جذب' : r.status, r.status === 'open' ? 'mint' : 'outline') },
          { title: 'ظرفیت', render: (r) => HRM.num(r.openings) },
          { title: 'متقاضی', render: (r) => HRM.num(r.applications) },
          { title: 'مصاحبه‌شده', render: (r) => HRM.num(r.interviewed) },
          { title: 'استخدام', render: (r) => HRM.num(r.hired) },
          { title: 'نرخ تبدیل به استخدام', render: (r) => pct(r.conversionToHire) },
          { title: 'میانگین امتیاز HR', render: (r) => (r.avgRating === null ? '—' : HRM.num(r.avgRating)) },
          { title: 'روز تا تکمیل', render: (r) => (r.avgDaysToFill === null ? '—' : HRM.num(r.avgDaysToFill)) }
        ],
        rows: data.jobPerformance || [],
        empty: HRM.empty('موقعیتی یافت نشد', '')
      })
    }));

    /* کهنگی و بهره‌وری */
    page.appendChild(h`<div class="grid grid-2">
      ${HRM.card({
        title: 'درخواست‌های معطل‌مانده', subtitle: 'بیش از ۱۴ روز بدون تغییر وضعیت',
        body: (data.aging || []).length ? HRM.table({
          columns: [
            { title: 'متقاضی', render: (r) => h`<div class="text-sm bold">${r.name}</div><div class="text-xs muted ltr">${r.code}</div>` },
            { title: 'موقعیت', render: (r) => r.jobTitle },
            { title: 'وضعیت', render: (r) => HRM.statusBadge(r.status, r.statusTitle, 'sky') },
            { title: 'روز', render: (r) => h`<span class="badge badge-${r.days > 30 ? 'rose' : 'lemon'}">${HRM.num(r.days)} روز</span>` },
            { title: '', class: 'actions-cell', render: (r) => h`<button class="btn btn-sm btn-ghost" data-app="${r.id}">${HRM.raw(HRM.icon('eye', 14))}</button>` }
          ],
          rows: data.aging
        }) : HRM.empty('موردی وجود ندارد', 'هیچ درخواستی بیش از ۱۴ روز معطل نمانده است. ✨')
      })}
      ${HRM.card({
        title: 'بهره‌وری تیم منابع انسانی', subtitle: 'بر اساس فعالیت‌های ثبت‌شده در سامانه',
        body: data.productivity === null ? HRM.empty('دسترسی محدود', 'برای مشاهده این گزارش، مجوز «بهره‌وری منابع انسانی» لازم است.')
          : (data.productivity.length ? HRM.table({
            columns: [
              { title: 'کاربر', render: (r) => h`<div class="user-cell">${HRM.avatar(r.name, { size: 'sm' })}<span>${r.name}</span></div>` },
              { title: 'فعالیت', render: (r) => HRM.num(r.actions) },
              { title: 'تغییر وضعیت', render: (r) => HRM.num(r.statusChanges) },
              { title: 'یادداشت', render: (r) => HRM.num(r.notes) },
              { title: 'ارزیابی', render: (r) => HRM.num(r.evaluations) },
              { title: 'پیامک', render: (r) => HRM.num(r.sms) }
            ],
            rows: data.productivity
          }) : HRM.empty('فعالیتی ثبت نشده', ''))
      })}
    </div>`);

    /* تعامل */
    const rangeSel = page.querySelector('[data-range]');
    rangeSel.addEventListener('change', () => HRM.go('/reports?days=' + rangeSel.value));
    const exportBtn = page.querySelector('[data-export]');
    if (exportBtn) exportBtn.addEventListener('click', async () => {
      const type = await HRM.confirm({ title: 'خروجی CSV', message: 'کدام گزارش خروجی گرفته شود؟ (تأیید = درخواست‌ها، انصراف = موقعیت‌های شغلی)', confirmText: 'درخواست‌ها', cancelText: 'موقعیت‌های شغلی' });
      HRM.download('/api/reports/export/csv?type=' + (type ? 'applications' : 'jobs') + '&days=' + days, 'report-' + days + 'd.csv');
    });
    page.querySelectorAll('[data-app]').forEach((b) => b.addEventListener('click', () => HRM.go('/applications/' + b.dataset.app)));
    return page;
  }

  /* بینش‌های خودکار ساده بر اساس داده‌ها */
  function buildInsights(data) {
    const out = [];
    const k = data.kpis;
    const f = data.funnel;
    if (k.applications === 0) {
      out.push({ color: 'sky', icon: 'info', title: 'بازه بدون داده', text: 'در این بازه درخواستی ثبت نشده است؛ بازه بزرگ‌تری را انتخاب کنید یا آگهی‌های شغلی را بازنگری کنید.' });
      return out;
    }
    if (f.rates.toAssessment < 35) out.push({ color: 'lemon', icon: 'alert', title: 'نرخ پایین شرکت در آزمون', text: `تنها ${pct(f.rates.toAssessment)} متقاضیان آزمون شخصیتی را کامل کرده‌اند. ارسال پیامک یادآوری می‌تواند این نرخ را افزایش دهد.` });
    if (f.rates.toInterview < 20) out.push({ color: 'lemon', icon: 'users', title: 'دعوت کم به مصاحبه', text: `نرخ عبور به مرحله مصاحبه ${pct(f.rates.toInterview)} است. بازبینی معیارهای غربالگری یا آزمون‌ها پیشنهاد می‌شود.` });
    if (k.hireRate >= k.targetHireRate && k.hires > 0) out.push({ color: 'mint', icon: 'check-circle', title: 'عملکرد مطلوب جذب', text: `نرخ استخدام ${pct(k.hireRate)} است که از هدف ${pct(k.targetHireRate)} فراتر رفته است.` });
    else if (k.hires === 0) out.push({ color: 'rose', icon: 'x-circle', title: 'بدون استخدام در بازه', text: 'در این بازه هیچ استخدامی ثبت نشده است؛ در صورت نیاز، مراحل میانی قیف را بررسی کنید.' });
    if (k.avgTimeToHire !== null && k.avgTimeToHire > k.targetTimeToHire) out.push({ color: 'peach', icon: 'clock', title: 'کندی فرآیند جذب', text: `میانگین زمان جذب ${HRM.num(k.avgTimeToHire)} روز است (هدف: ${HRM.num(k.targetTimeToHire)} روز). کوتاه‌کردن زمان بین مصاحبه و ارزیابی مؤثر است.` });
    if (k.avgFit !== null && k.avgFit >= 70) out.push({ color: 'mint', icon: 'target', title: 'تناسب شخصیتی مناسب', text: `میانگین تناسب شغلی آزمون‌های تکمیل‌شده ${pct(k.avgFit)} است که نشان‌دهنده تطابق خوب تیپ‌های شخصیتی با موقعیت‌هاست.` });
    else if (k.avgFit !== null && k.avgFit < 55) out.push({ color: 'rose', icon: 'alert', title: 'تناسب شخصیتی پایین', text: `میانگین تناسب شغلی ${pct(k.avgFit)} است؛ بازنگری «تیپ‌های آرمانی» موقعیت‌های شغلی را در نظر بگیرید.` });
    if (data.compare.applications.delta > 20) out.push({ color: 'mint', icon: 'trending-up', title: 'رشد ورودی درخواست‌ها', text: `درخواست‌ها نسبت به دوره قبل ${pct(data.compare.applications.delta)} رشد داشته است.` });
    else if (data.compare.applications.delta < -20) out.push({ color: 'lemon', icon: 'trending-down', title: 'کاهش ورودی درخواست‌ها', text: `درخواست‌ها نسبت به دوره قبل ${pct(Math.abs(data.compare.applications.delta))} کاهش یافته است؛ بازنشر آگهی‌ها کمک‌کننده است.` });
    if ((data.aging || []).length >= 5) out.push({ color: 'peach', icon: 'clock', title: 'درخواست‌های راکد', text: `${HRM.num(data.aging.length)} درخواست بیش از ۱۴ روز بدون تغییر وضعیت مانده‌اند.` });
    return out.slice(0, 6);
  }

  HRM.registerModule({
    key: 'reports', title: 'گزارش‌ها', order: 60,
    routes: { '/reports': (ctx) => render(null, ctx.query) }
  });
})();
