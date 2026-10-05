/* ── کلاینت مدیریت حساب متقاضیان (پورتال) ─────────────────────── */
(function () {
  'use strict';
  const h = HRM.h;

  async function render(params, query) {
    const data = await HRM.get('/portal/applicants?' + new URLSearchParams({ q: query.q || '' }).toString());
    const rows = data.rows || [];
    const page = h`<div></div>`;

    page.appendChild(h`<div class="page-head">
      <div><div class="title">حساب‌های متقاضیان</div><div class="desc">کاربرانی که با تأیید شماره موبایل در سایت استخدام ثبت‌نام کرده‌اند</div></div>
      <div class="actions"><a class="btn btn-soft" href="/careers" target="_blank">${HRM.raw(HRM.icon('external-link', 16))} مشاهده سایت استخدام</a></div>
    </div>`);

    const withApps = rows.filter((r) => r.applications > 0).length;
    const totalApps = rows.reduce((s, r) => s + r.applications, 0);
    page.appendChild(h`<div class="grid grid-kpi mb-3">
      ${HRM.statCard({ label: 'کل حساب‌ها', value: HRM.num(rows.length), icon: 'users', color: 'violet' })}
      ${HRM.statCard({ label: 'دارای درخواست', value: HRM.num(withApps), icon: 'user-check', color: 'mint' })}
      ${HRM.statCard({ label: 'کل درخواست‌های ثبت‌شده', value: HRM.num(totalApps), icon: 'inbox', color: 'sky' })}
      ${HRM.statCard({ label: 'بدون درخواست', value: HRM.num(rows.length - withApps), icon: 'user-x', color: 'lemon', hint: 'ثبت‌نام کرده اما فرمی تکمیل نکرده‌اند' })}
    </div>`);

    page.appendChild(h`<div class="card mb-3"><div class="search-box" style="max-width:340px">${HRM.raw(HRM.icon('search', 16))}
      <input data-search placeholder="جست‌وجوی نام یا شماره موبایل…" value="${query.q || ''}"></div></div>`);

    page.appendChild(HRM.card({
      title: 'فهرست متقاضیان', subtitle: `${HRM.num(rows.length)} حساب کاربری`,
      body: HRM.table({
        columns: [
          { title: 'متقاضی', render: (r) => h`<div class="user-cell">${HRM.avatar(r.name, { size: 'sm' })}<div><div class="text-sm bold">${r.name}</div><div class="text-xs muted ltr">${r.mobile}</div></div></div>` },
          { title: 'تأیید شماره', render: (r) => (r.verifiedAt ? HRM.badge('تأییدشده', 'mint', true) : HRM.badge('تأیید نشده', 'lemon')) },
          { title: 'منبع', render: (r) => HRM.badge(SOURCE_TITLES[r.source] || r.source || 'سایت', 'outline') },
          { title: 'درخواست‌ها', render: (r) => h`<span class="bold">${HRM.num(r.applications)}</span> <span class="text-xs muted">(${HRM.num(r.submitted)} ثبت‌شده)</span>` },
          { title: 'آخرین فعالیت', render: (r) => h`<div class="text-xs">${HRM.jtime(r.lastActivityAt)}</div><div class="text-xs muted">${HRM.ago(r.lastActivityAt)}</div>` },
          { title: 'عضویت', render: (r) => h`<span class="text-xs muted">${HRM.jdate(r.createdAt)}</span>` },
          { title: '', class: 'actions-cell', render: (r) => h`<button class="btn btn-sm btn-soft" data-view="${r.id}">مشاهده پرونده</button>` }
        ],
        rows,
        empty: HRM.empty('متقاضی‌ای ثبت نشده', 'به‌محض ثبت‌نام متقاضیان در سایت استخدام، فهرست آن‌ها اینجا نمایش داده می‌شود.')
      })
    }));

    const search = page.querySelector('[data-search]');
    search.addEventListener('input', HRM.debounce(() => HRM.go('/applicants?q=' + encodeURIComponent(search.value.trim())), 500));

    page.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => applicantModal(rows.find((r) => r.id === b.dataset.view))));
    return page;
  }

  async function applicantModal(applicant) {
    if (!applicant) return;
    const modal = HRM.modal({
      title: 'پرونده متقاضی', size: '',
      body: h`<div>
        <div class="row gap-3 mb-3">
          ${HRM.avatar(applicant.name, { size: 'lg' })}
          <div>
            <div class="bold">${applicant.name}</div>
            <div class="text-sm muted ltr">${applicant.mobile}</div>
            <div class="row gap-1 mt-1">${applicant.verifiedAt ? HRM.badge('شماره تأییدشده', 'mint') : HRM.badge('تأیید نشده', 'lemon')}
              ${HRM.badge(SOURCE_TITLES[applicant.source] || applicant.source || 'سایت', 'outline')}</div>
          </div>
        </div>
        ${HRM.fieldRow('تاریخ عضویت', HRM.jdate(applicant.createdAt))}
        ${HRM.fieldRow('آخرین فعالیت', applicant.lastActivityAt ? HRM.jtime(applicant.lastActivityAt) : '—')}
        <div class="mt-3" data-apps>${HRM.skeleton(3, 40)}</div>
      </div>`
    });
    const box = modal.el.querySelector('[data-apps]');
    try {
      const res = await HRM.get('/applications?' + new URLSearchParams({ q: applicant.mobile, perPage: 50 }).toString());
      const list = (res.rows || []).filter((r) => String(r.mobile || '').includes(applicant.mobile) || r.applicantId === applicant.id);
      if (!list.length) {
        box.innerHTML = '';
        box.appendChild(HRM.empty('درخواستی ثبت نشده', 'این متقاضی هنوز فرم استخدامی تکمیل نکرده است.'));
        return;
      }
      box.innerHTML = '';
      box.appendChild(h`<div class="text-sm bold mb-2">درخواست‌های استخدام (${HRM.num(list.length)})</div>`);
      box.appendChild(HRM.table({
        columns: [
          { title: 'کد', render: (r) => h`<span class="ltr text-xs">${r.code}</span>` },
          { title: 'موقعیت', render: (r) => h`<div class="text-sm">${r.jobTitle}</div>` },
          { title: 'وضعیت', render: (r) => HRM.statusBadge(r.status, r.statusTitle, r.statusColor) },
          { title: 'تاریخ', render: (r) => h`<span class="text-xs">${HRM.jdate(r.createdAt)}</span>` },
          { title: '', class: 'actions-cell', render: (r) => h`<div class="row gap-1">
            <button class="btn btn-sm btn-ghost" data-open="${r.id}" title="پرونده کامل">${HRM.raw(HRM.icon('eye', 14))}</button>
            ${HRM.can('applications.delete') ? h`<button class="btn btn-sm btn-ghost danger" data-del="${r.id}" title="حذف درخواست">${HRM.raw(HRM.icon('trash', 14))}</button>` : ''}
          </div>` }
        ],
        rows: list
      }));
      box.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => { modal.close(); HRM.go('/applications/' + b.dataset.open); }));
      box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        const ok = await HRM.confirm({ title: 'حذف درخواست', message: 'این درخواست و آزمون‌های مرتبط با آن حذف شود؟ این عملیات بازگشت‌پذیر نیست.', danger: true, confirmText: 'حذف کن' });
        if (!ok) return;
        await HRM.del('/applications/' + b.dataset.del);
        HRM.toast('درخواست حذف شد.', 'success');
        modal.close();
        HRM.render();
      }));
    } catch (e) {
      box.innerHTML = '';
      box.appendChild(HRM.empty('خطا در دریافت درخواست‌ها', e.message || ''));
    }
  }

  const SOURCE_TITLES = { portal: 'سایت استخدام', careers: 'سایت استخدام', referral: 'معرفی کارکنان', agency: 'آژانس', manual: 'ثبت توسط HR', qr: 'اسکن QR', telegram: 'تلگرام', linkedin: 'لینکدین', instagram: 'اینستاگرام' };

  HRM.registerModule({
    key: 'portal', title: 'متقاضیان سایت', order: 28,
    routes: { '/applicants': (ctx) => render(null, ctx.query) }
  });
})();
