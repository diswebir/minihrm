/**
 * ماژول استخدام — فرم‌ساز، درخواست‌های استخدامی، فرایند انتخاب و ارزیابی
 * ------------------------------------------------------------------
 * - فرم‌ساز کامل (افزودن/ویرایش/جابجایی مراحل و فیلدها)
 * - مدیریت درخواست‌ها با فیلتر، جست‌وجو، تغییر وضعیت، یادداشت و امتیاز
 * - ارزیابی سه‌سطحی (مصاحبه‌کننده، منابع انسانی، مدیریت) مطابق فرم کاغذی
 * - خروجی CSV و چاپ پرونده
 */
'use strict';

const utils = require('../../core/utils');
const forms = require('../../core/formResolver');
const csv = require('../../core/csv');
const {
  APPLICATION_STATUSES, DECISIONS, EVALUATION_ROLES, statusInfo,
  paginate, sortRows, summary, fullName, timelineEvent, funnelStats, timeseries
} = require('../../core/domain');

module.exports = {
  key: 'recruitment',
  title: 'استخدام و فرم‌ها',
  description: 'دریافت فرم استخدام، مدیریت متقاضیان، فرم‌ساز، وضعیت‌های فرایند جذب و ارزیابی متقاضیان.',
  icon: 'user-plus',
  order: 40,
  depends: ['jobs'],
  defaultEnabled: true,

  permissions: [
    { key: 'applications.view', title: 'مشاهده درخواست‌های استخدامی', group: 'استخدام' },
    { key: 'applications.update', title: 'ویرایش و تغییر وضعیت درخواست', group: 'استخدام' },
    { key: 'applications.note', title: 'ثبت یادداشت و نظر', group: 'استخدام' },
    { key: 'applications.interview', title: 'ثبت ارزیابی و مصاحبه', group: 'استخدام' },
    { key: 'applications.delete', title: 'حذف درخواست', group: 'استخدام' },
    { key: 'applications.export', title: 'خروجی گرفتن از داده‌های متقاضیان', group: 'استخدام' },
    { key: 'applications.refer', title: 'معرفی متقاضی جدید', group: 'استخدام' },
    { key: 'form.view', title: 'مشاهده فرم استخدام', group: 'فرم استخدام' },
    { key: 'form.manage', title: 'ویرایش فرم استخدام و فرم‌ساز', group: 'فرم استخدام' }
  ],

  settings: [
    { key: 'codePrefix', title: 'پیش‌شماره کد رهگیری', type: 'text', default: 'APL' },
    { key: 'autoReplySms', title: 'ارسال پیامک تشکر پس از ثبت فرم', type: 'bool', default: true },
    { key: 'notifyHrOnSubmit', title: 'ثبت رویداد اطلاع‌رسانی برای منابع انسانی', type: 'bool', default: true },
    { key: 'requireUniqueNationalId', title: 'جلوگیری از ثبت تکراری کد ملی برای یک موقعیت', type: 'bool', default: true },
    { key: 'staleDays', title: 'آستانه «در انتظار اقدام» (روز)', type: 'number', default: 3 },
    { key: 'defaultPerPage', title: 'تعداد ردیف‌های پیش‌فرض فهرست', type: 'number', default: 20 }
  ],

  nav: [
    { path: '/applications', title: 'متقاضیان', icon: 'user-plus', perm: 'applications.view', order: 25 },
    { path: '/form-builder', title: 'فرم‌ساز استخدام', icon: 'layout-template', perm: 'form.view', order: 26 },
    { path: '/pipeline', title: 'قیف جذب (کانبان)', icon: 'kanban', perm: 'applications.view', order: 27 }
  ],

  /** داده‌های اولیه: ذخیره فرم پیش‌فرض استخراج‌شده از فایل اکسل شرکت */
  install(app) {
    const col = app.db.col('form_schemas');
    if (!col.find((f) => f.key === 'default' || f.isDefault)) {
      col.insert({
        key: 'default',
        isDefault: true,
        title: 'فرم استخدام شرکت',
        source: 'فرم استخدام.xlsx — OF-FR-01-03',
        schema: require('../../core/seed/form').defaultForm(),
        createdBy: 'system'
      });
    }
    return { formSchemas: col.count() };
  },

  api(api, app) {
    const modules = app.modules;
    const domain = require('../../core/domain');

    // ============================================================ فرم‌ساز

    api.get('/form', { perm: 'form.view', module: 'recruitment' }, (ctx) => {
      const row = ctx.col('form_schemas').find((f) => f.key === 'default' || f.isDefault);
      const jobs = ctx.col('jobs').all().map((j) => ({
        id: j.id, title: j.title,
        overrides: j.formOverrides || {},
        formCount: ctx.col('applications').filter((a) => a.jobId === j.id).length
      }));
      return {
        schema: row ? row.schema : require('../../core/seed/form').defaultForm(),
        updatedAt: row ? row.updatedAt : null,
        source: row ? row.source : null,
        jobs,
        fieldTemplates: require('../../core/seed/form').FIELD_TEMPLATES,
        stats: formUsageStats(ctx)
      };
    });

    api.put('/form', { perm: 'form.manage', module: 'recruitment' }, (ctx) => {
      const schema = ctx.body.schema;
      if (!schema || !Array.isArray(schema.steps)) ctx.fail('ساختار فرم نامعتبر است');
      const validation = validateSchema(schema);
      if (!validation.ok) ctx.fail(validation.message);
      const col = ctx.col('form_schemas');
      const row = col.find((f) => f.key === 'default' || f.isDefault);
      const next = Object.assign({}, row || { key: 'default', isDefault: true }, {
        title: utils.cleanText(ctx.body.title || schema.title, 120),
        schema: normalizeSchema(schema),
        updatedBy: ctx.user.id,
        updatedByName: ctx.user.name,
        version: (row && row.version ? row.version : 1) + 1
      });
      const saved = row ? col.update(row.id, next) : col.insert(next);
      ctx.log('form.update', `ویرایش فرم استخدام (نسخه ${saved.version})`, { entity: 'form', entityId: saved.id, meta: { steps: schema.steps.length } });
      return { schema: saved.schema, version: saved.version, updatedAt: saved.updatedAt };
    });

    api.post('/form/reset', { perm: 'form.manage', module: 'recruitment' }, (ctx) => {
      const col = ctx.col('form_schemas');
      const row = col.find((f) => f.key === 'default' || f.isDefault);
      const fresh = require('../../core/seed/form').defaultForm();
      if (row) col.update(row.id, { schema: fresh, version: (row.version || 1) + 1, updatedByName: ctx.user.name });
      else col.insert({ key: 'default', isDefault: true, schema: fresh });
      ctx.log('form.reset', 'بازگردانی فرم استخدام به نسخه پیش‌فرض', { entity: 'form', level: 'warn' });
      return { schema: fresh };
    });

    /** پیش‌نمایش فرم یک موقعیت شغلی مشخص */
    api.get('/form/preview/:jobId', { perm: 'form.view', module: 'recruitment' }, (ctx) => {
      const job = ctx.col('jobs').byId(ctx.params.jobId);
      if (!job) ctx.notFound('موقعیت شغلی یافت نشد');
      return { schema: forms.resolveForm(app, job), job: { id: job.id, title: job.title } };
    });

    // ============================================================ درخواست‌ها

    api.get('/applications', { perm: 'applications.view', module: 'recruitment' }, (ctx) => {
      let rows = ctx.col('applications').all().map(summary);
      const filtered = applyFilters(rows, ctx.query, app);

      // آمار روی مجموعه فیلترشده (بدون صفحه‌بندی)
      const stats = {
        byStatus: APPLICATION_STATUSES.map((s) => Object.assign({}, s, { count: filtered.filter((r) => r.status === s.key).length })),
        total: filtered.length,
        withAssessment: filtered.filter((r) => r.hasAssessment).length,
        overdue: filtered.filter((r) => r.nextInterviewAt && new Date(r.nextInterviewAt) < new Date()).length,
        avgRating: avg(filtered.map((r) => r.rating).filter(Boolean))
      };

      const sorted = sortRows(filtered, ctx.query.sortBy || 'createdAt', ctx.query.dir || 'desc',
        ['createdAt', 'name', 'jobTitle', 'status', 'rating', 'updatedAt']);
      const paged = paginate(sorted, ctx.query, Number(modules.s('recruitment', 'defaultPerPage', 20)));

      return {
        ...paged,
        stats,
        jobs: ctx.col('jobs').all().map((j) => ({ id: j.id, title: j.title, status: j.status })),
        users: ctx.col('users').all().filter((u) => u.status === 'active').map((u) => ({ id: u.id, name: u.name })),
        statuses: APPLICATION_STATUSES,
        tags: Array.from(new Set(ctx.col('applications').all().flatMap((a) => a.tags || []))).sort()
      };
    });

    api.get('/applications/kanban', { perm: 'applications.view', module: 'recruitment' }, (ctx) => {
      const rows = applyFilters(ctx.col('applications').all().map(summary), ctx.query, app);
      const columns = APPLICATION_STATUSES.filter((s) => !['withdrawn'].includes(s.key)).map((s) => ({
        key: s.key, title: s.title, color: s.color, icon: s.icon,
        items: rows.filter((r) => r.status === s.key).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 30),
        total: rows.filter((r) => r.status === s.key).length
      }));
      return { columns, total: rows.length };
    });

    api.get('/applications/stats', { perm: 'applications.view', module: 'recruitment' }, (ctx) => {
      const apps = ctx.col('applications').all();
      return {
        funnel: funnelStats(apps),
        trend: timeseries(apps, { days: Number(ctx.query.days || 30) }),
        byJob: ctx.col('jobs').all().map((j) => {
          const list = apps.filter((a) => a.jobId === j.id);
          return {
            id: j.id, title: j.title, status: j.status, openings: j.openings || 1,
            total: list.length,
            byStatus: APPLICATION_STATUSES.map((s) => ({ key: s.key, title: s.title, color: s.color, count: list.filter((a) => a.status === s.key).length })),
            hired: list.filter((a) => a.status === 'hired').length
          };
        })
      };
    });

    api.get('/applications/:id', { perm: 'applications.view', module: 'recruitment' }, (ctx) => {
      const application = ctx.col('applications').byId(ctx.params.id);
      if (!application) ctx.notFound('درخواست استخدامی یافت نشد');
      const job = application.jobId ? ctx.col('jobs').byId(application.jobId) : null;
      const schema = job ? forms.resolveForm(app, job) : forms.baseSchema(app);
      const assessmentResults = ctx.col('assessment_results').filter((r) => r.applicationId === application.id)
        .map((r) => buildAssessmentSummary(r));
      const interviews = ctx.col('interviews').filter((i) => i.applicationId === application.id)
        .sort((a, b) => (a.scheduledAt < b.scheduledAt ? 1 : -1));
      const notes = (application.notes || []).filter((n) => !n.private || ctx.can('applications.update'));
      return {
        application: Object.assign({}, application, { notes }),
        answersFlat: forms.flattenAnswers(schema, application.answers || {}),
        schema: forms.clientForm(schema),
        job: job ? { id: job.id, title: job.title, department: job.department, idealTypes: job.idealTypes || [], assessment: job.assessment || {} } : null,
        assessmentResults,
        interviews,
        timeline: (application.timeline || []).slice().reverse(),
        decisions: DECISIONS,
        evaluationRoles: EVALUATION_ROLES,
        statuses: APPLICATION_STATUSES,
        users: ctx.col('users').all().filter((u) => u.status === 'active').map((u) => ({ id: u.id, name: u.name, avatar: u.avatar || null })),
        files: application.files || []
      };
    });

    api.put('/applications/:id', { perm: 'applications.update', module: 'recruitment' }, (ctx) => {
      const application = ctx.col('applications').byId(ctx.params.id);
      if (!application) ctx.notFound('درخواست استخدامی یافت نشد');
      const patch = {};
      if (ctx.body.answers) {
        const job = application.jobId ? ctx.col('jobs').byId(application.jobId) : null;
        const schema = job ? forms.resolveForm(app, job) : forms.baseSchema(app);
        // ادغام پاسخ‌های جدید (بدون حذف موارد موجود)
        const merged = JSON.parse(JSON.stringify(application.answers || {}));
        for (const [stepKey, values] of Object.entries(ctx.body.answers)) {
          merged[stepKey] = Object.assign({}, merged[stepKey] || {}, values);
        }
        patch.answers = merged;
        patch.formVersion = schema.version || 1;
      }
      if (Array.isArray(ctx.body.tags)) patch.tags = ctx.body.tags.map((t) => utils.cleanText(t, 40)).filter(Boolean);
      if (ctx.body.rating !== undefined) patch.rating = ctx.body.rating === null ? null : Math.min(5, Math.max(1, Number(ctx.body.rating)));
      if (ctx.body.assignedTo !== undefined) patch.assignedTo = ctx.body.assignedTo || null;
      if (ctx.body.status !== undefined) {
        patch.status = ctx.body.status;
        patch.statusChangedAt = new Date().toISOString();
      }
      if (patch.status) {
        patch.timeline = (application.timeline || []).concat([
          timelineEvent(ctx.user, 'status', `تغییر وضعیت به «${statusInfo(patch.status).title}»${ctx.body.statusNote ? ' — ' + ctx.body.statusNote : ''}`)
        ]);
        if (patch.status === 'hired') patch.hiredAt = new Date().toISOString();
      }
      if (ctx.body.answers || ctx.body.rating !== undefined) {
        patch.timeline = (patch.timeline || application.timeline || []).concat([
          timelineEvent(ctx.user, 'edit', 'ویرایش اطلاعات پرونده توسط منابع انسانی')
        ]);
      }
      const updated = ctx.col('applications').update(application.id, patch);
      ctx.log('application.update', `ویرایش پرونده «${fullName(application)}»`, { entity: 'application', entityId: application.id, meta: { status: patch.status } });
      return { application: summary(updated) };
    });

    api.post('/applications/:id/status', { perm: 'applications.update', module: 'recruitment' }, async (ctx) => {
      const application = ctx.col('applications').byId(ctx.params.id);
      if (!application) ctx.notFound('درخواست استخدامی یافت نشد');
      const status = String(ctx.body.status || '');
      if (!APPLICATION_STATUSES.some((s) => s.key === status)) ctx.fail('وضعیت نامعتبر است');
      const patch = {
        status,
        statusChangedAt: new Date().toISOString(),
        timeline: (application.timeline || []).concat([
          timelineEvent(ctx.user, 'status', `تغییر وضعیت به «${statusInfo(status).title}»${ctx.body.reason ? ' — ' + utils.cleanText(ctx.body.reason, 300) : ''}`)
        ])
      };
      if (status === 'hired') patch.hiredAt = new Date().toISOString();
      if (['rejected', 'withdrawn'].includes(status)) patch.closedAt = new Date().toISOString();
      if (ctx.body.sendSms) {
        const smsKey = status === 'rejected' ? 'rejected' : status === 'offer' ? 'offers' : status === 'interview' ? 'interview' : null;
        if (smsKey) {
          const result = await sendApplicantSms(ctx, application, smsKey, {
            name: fullName(application), job: application.jobTitle || '',
            company: ctx.config.get('app.companyName', '') || ctx.config.get('app.name', '')
          });
          patch.timeline = patch.timeline.concat([timelineEvent(ctx.user, 'sms', `ارسال پیامک «${smsKey}»${result.ok ? (result.simulated ? ' (آزمایشی)' : '') : ' — ناموفق'}`)]);
        }
      }
      const updated = ctx.col('applications').update(application.id, patch);
      ctx.log('application.status', `تغییر وضعیت «${fullName(application)}» به ${statusInfo(status).title}`, { entity: 'application', entityId: application.id });
      return { application: summary(updated) };
    });

    api.post('/applications/:id/notes', { perm: 'applications.note', module: 'recruitment' }, (ctx) => {
      const application = ctx.col('applications').byId(ctx.params.id);
      if (!application) ctx.notFound('درخواست استخدامی یافت نشد');
      const text = utils.cleanText(ctx.body.text, 2000);
      if (!text) ctx.fail('متن یادداشت الزامی است');
      const note = {
        id: utils.uid('note'), at: new Date().toISOString(),
        byId: ctx.user.id, byName: ctx.user.name, text,
        private: !!ctx.body.private,
        mentions: Array.isArray(ctx.body.mentions) ? ctx.body.mentions : []
      };
      const notes = (application.notes || []).concat([note]);
      ctx.col('applications').update(application.id, {
        notes,
        timeline: (application.timeline || []).concat([timelineEvent(ctx.user, 'note', 'ثبت یادداشت جدید')])
      });
      ctx.log('application.note', `یادداشت برای «${fullName(application)}»`, { entity: 'application', entityId: application.id });
      return { note };
    });

    api.delete('/applications/:id/notes/:noteId', { perm: 'applications.note', module: 'recruitment' }, (ctx) => {
      const application = ctx.col('applications').byId(ctx.params.id);
      if (!application) ctx.notFound('درخواست استخدامی یافت نشد');
      const notes = (application.notes || []).filter((n) => n.id !== ctx.params.noteId || (n.byId !== ctx.user.id && !ctx.isSuperAdmin()));
      ctx.col('applications').update(application.id, { notes });
      return { deleted: true };
    });

    /** ارزیابی سه‌سطحی (مصاحبه‌کننده/منابع انسانی/مدیریت) */
    api.post('/applications/:id/evaluation', { perm: 'applications.interview', module: 'recruitment' }, (ctx) => {
      const application = ctx.col('applications').byId(ctx.params.id);
      if (!application) ctx.notFound('درخواست استخدامی یافت نشد');
      const role = ctx.body.role;
      if (!EVALUATION_ROLES.some((r) => r.key === role)) ctx.fail('نوع ارزیابی نامعتبر است');
      if (role === 'manager' && !ctx.can('applications.update')) ctx.fail('ثبت نظر مدیریت توسط شما مجاز نیست');
      const decision = DECISIONS.some((d) => d.key === ctx.body.decision) ? ctx.body.decision : 'review';
      const entry = {
        role,
        text: utils.cleanText(ctx.body.text, 4000),
        decision,
        decisionTitle: (DECISIONS.find((d) => d.key === decision) || {}).title,
        byId: ctx.user.id,
        byName: ctx.user.name,
        at: new Date().toISOString()
      };
      const evaluations = Object.assign({}, application.evaluations || {}, { [role]: entry });
      const patch = {
        evaluations,
        timeline: (application.timeline || []).concat([
          timelineEvent(ctx.user, 'evaluation', `ثبت ${(EVALUATION_ROLES.find((r) => r.key === role) || {}).title} — ${entry.decisionTitle}`)
        ])
      };
      // اگر هر سه سطح ثبت شد، وضعیت به «ارزیابی نهایی» می‌رود
      if (evaluations.interviewer && evaluations.hr && evaluations.manager && ['new', 'screening', 'assessment', 'interview'].includes(application.status)) {
        patch.status = 'evaluation';
        patch.timeline = patch.timeline.concat([timelineEvent(null, 'status', 'تکمیل ارزیابی سه‌سطحی؛ پرونده آماده تصمیم نهایی است')]);
      }
      if (decision === 'approve' && role === 'manager') {
        patch.timeline = patch.timeline.concat([timelineEvent(null, 'decision', 'نظر مثبت مدیریت ثبت شد')]);
      }
      ctx.col('applications').update(application.id, patch);
      ctx.log('application.evaluation', `ثبت ارزیابی «${role}» برای «${fullName(application)}»`, { entity: 'application', entityId: application.id });
      return { evaluation: entry, evaluations, status: patch.status || application.status };
    });

    api.post('/applications/:id/sms', { perm: 'applications.note', module: 'recruitment' }, async (ctx) => {
      const application = ctx.col('applications').byId(ctx.params.id);
      if (!application) ctx.notFound('درخواست استخدامی یافت نشد');
      const mobile = domain.mobile(application);
      if (!mobile) ctx.fail('شماره موبایل متقاضی ثبت نشده است');
      const result = await ctx.sms.sendRaw({
        to: mobile,
        text: utils.cleanText(ctx.body.text, 600),
        templateKey: ctx.body.templateKey || 'custom',
        params: Object.assign({
          name: fullName(application),
          job: application.jobTitle || '',
          company: ctx.config.get('app.companyName', '')
        }, ctx.body.params || {})
      });
      ctx.col('applications').update(application.id, {
        timeline: (application.timeline || []).concat([timelineEvent(ctx.user, 'sms', `${result.ok ? 'ارسال' : 'خطا در ارسال'} پیامک${result.simulated ? ' (آزمایشی)' : ''}: ${utils.truncate(ctx.body.text, 60)}`)])
      });
      return { sent: result.ok, simulated: result.simulated, error: result.error || null };
    });

    /** ارسال مجدد لینک فرم/آزمون برای متقاضی */
    api.post('/applications/:id/resend-link', { perm: 'applications.note', module: 'recruitment' }, async (ctx) => {
      const application = ctx.col('applications').byId(ctx.params.id);
      if (!application) ctx.notFound('درخواست استخدامی یافت نشد');
      const mobile = domain.mobile(application);
      if (!mobile) ctx.fail('شماره موبایل متقاضی ثبت نشده است');
      const applicant = ctx.col('applicants').find((a) => a.id === application.applicantId || utils.normalizeMobile(a.mobile) === utils.normalizeMobile(mobile));
      let token = null;
      if (applicant) {
        const session = ctx.auth.createSession({
          subjectType: 'applicant', subjectId: applicant.id, req: ctx.req,
          hours: ctx.config.get('security.applySessionHours', 72), meta: { purpose: 'resume' }
        });
        token = session.id;
      }
      const job = application.jobId ? ctx.col('jobs').byId(application.jobId) : null;
      const link = `${ctx.baseUrl('/apply')}?sid=${token || ''}${job ? `&job=${job.slug}` : ''}`;
      const result = await ctx.sms.sendRaw({
        to: mobile, templateKey: 'applicationLink',
        text: `${fullName(application)} عزیز، برای تکمیل فرم استخدام از این لینک استفاده کنید: ${link}`,
        params: { name: fullName(application), link, company: ctx.config.get('app.companyName', '') }
      });
      ctx.col('applications').update(application.id, {
        timeline: (application.timeline || []).concat([timelineEvent(ctx.user, 'sms', `ارسال لینک تکمیل فرم${result.simulated ? ' (آزمایشی)' : ''}`)])
      });
      return { link, sent: result.ok, simulated: result.simulated, error: result.error || null };
    });

    api.delete('/applications/:id', { perm: 'applications.delete', module: 'recruitment' }, (ctx) => {
      const application = ctx.col('applications').byId(ctx.params.id);
      if (!application) ctx.notFound('درخواست استخدامی یافت نشد');
      for (const f of application.files || []) app.upload.removeUpload(app.root, f.path);
      ctx.col('assessment_results').removeWhere((r) => r.applicationId === application.id);
      ctx.col('interviews').removeWhere((i) => i.applicationId === application.id);
      ctx.col('applications').remove(application.id);
      ctx.log('application.delete', `حذف پرونده «${fullName(application)}»`, { entity: 'application', entityId: application.id, level: 'warn' });
      return { deleted: true };
    });

    /** اطلاعات پرونده برای چاپ */
    api.get('/applications/:id/print', { perm: 'applications.view', module: 'recruitment' }, (ctx) => {
      const application = ctx.col('applications').byId(ctx.params.id);
      if (!application) ctx.notFound('درخواست استخدامی یافت نشد');
      const job = application.jobId ? ctx.col('jobs').byId(application.jobId) : null;
      const schema = job ? forms.resolveForm(app, job) : forms.baseSchema(app);
      return {
        application,
        answersFlat: forms.flattenAnswers(schema, application.answers || {}),
        job: job ? { title: job.title, department: job.department } : null,
        brand: {
          company: ctx.config.get('app.companyName', ''),
          logo: ctx.config.get('app.logo', null)
        },
        printedAt: new Date().toISOString(),
        printedBy: ctx.user.name
      };
    });

    /** خروجی CSV از متقاضیان */
    api.get('/applications/export/csv', { perm: 'applications.export', module: 'recruitment' }, (ctx) => {
      const rows = applyFilters(ctx.col('applications').all(), ctx.query, app);
      const job = ctx.query.jobId ? ctx.col('jobs').byId(ctx.query.jobId) : null;
      const schema = job ? forms.resolveForm(app, job) : forms.baseSchema(app);
      const labels = [];
      for (const step of schema.steps || []) {
        for (const field of step.fields || []) {
          if (['heading', 'note', 'file'].includes(field.type)) continue;
          labels.push({ key: `${step.key}.${field.name}`, title: field.label, step: step.title });
        }
      }
      const columns = [
        { key: 'code', title: 'کد رهگیری' },
        { key: 'name', title: 'نام و نام خانوادگی', get: (a) => fullName(a) },
        { key: 'mobile', title: 'موبایل', get: (a) => domain.mobile(a) },
        { key: 'jobTitle', title: 'موقعیت شغلی' },
        { key: 'status', title: 'وضعیت', get: (a) => statusInfo(a.status).title },
        { key: 'rating', title: 'امتیاز' },
        { key: 'createdAt', title: 'تاریخ ثبت', get: (a) => require('../../core/jalali').formatJalaliTime(a.createdAt) },
        { key: 'mbti', title: 'تیپ شخصیتی', get: (a) => {
          const r = ctx.col('assessment_results').find((x) => x.applicationId === a.id && x.status === 'completed');
          return r ? `${r.type} (${(r.borderline || []).length ? 'مرزی' : 'قطعی'})` : '';
        } },
        ...labels.map((l) => ({
          key: l.key,
          title: `${l.step} — ${l.title}`,
          get: (a) => {
            const [stepKey, fieldName] = l.key.split('.');
            const v = (a.answers && a.answers[stepKey]) ? a.answers[stepKey][fieldName] : '';
            if (Array.isArray(v)) return v.map((row) => (typeof row === 'object' ? Object.values(row).filter(Boolean).join(' / ') : row)).join(' | ');
            return v;
          }
        }))
      ];
      const content = csv.toCSV(rows, columns);
      const filename = `applications-${new Date().toISOString().slice(0, 10)}.csv`;
      ctx.log('application.export', `خروجی CSV از ${rows.length} درخواست`, { entity: 'application' });
      ctx.req.__res.csv(content, filename);
      return undefined;
    });

    /** ایمپورت/به‌روزرسانی گروهی وضعیت */
    api.post('/applications/bulk-status', { perm: 'applications.update', module: 'recruitment' }, (ctx) => {
      const ids = Array.isArray(ctx.body.ids) ? ctx.body.ids : [];
      const status = ctx.body.status;
      if (!ids.length) ctx.fail('هیچ پرونده‌ای انتخاب نشده است');
      if (!APPLICATION_STATUSES.some((s) => s.key === status)) ctx.fail('وضعیت نامعتبر است');
      let updated = 0;
      for (const id of ids) {
        const application = ctx.col('applications').byId(id);
        if (!application) continue;
        ctx.col('applications').update(id, {
          status,
          statusChangedAt: new Date().toISOString(),
          timeline: (application.timeline || []).concat([timelineEvent(ctx.user, 'status', `تغییر گروهی وضعیت به «${statusInfo(status).title}»`)])
        });
        updated++;
      }
      ctx.log('application.bulk_status', `تغییر وضعیت ${updated} پرونده به ${statusInfo(status).title}`, { entity: 'application' });
      return { updated };
    });
  }
};

// ------------------------------------------------------------------ توابع کمکی

function applyFilters(rows, query = {}, app) {
  const { q, jobId, status, stage, rating, hasAssessment, from, to, tag, assignedTo, mbtiType } = query;
  let out = rows;
  if (q) {
    const n = String(q).toLowerCase();
    out = out.filter((r) => [r.name, r.mobile, r.email, r.code, r.jobTitle, (r.tags || []).join(' ')].join(' ').toLowerCase().includes(n));
  }
  if (jobId) out = out.filter((r) => r.jobId === jobId);
  if (status) {
    const list = String(status).split(',').filter(Boolean);
    out = out.filter((r) => list.includes(r.status));
  }
  if (stage) {
    const keys = APPLICATION_STATUSES.filter((s) => s.stage === stage).map((s) => s.key);
    out = out.filter((r) => keys.includes(r.status));
  }
  if (rating) out = out.filter((r) => Number(r.rating) >= Number(rating));
  if (tag) out = out.filter((r) => (r.tags || []).includes(tag));
  if (assignedTo) out = out.filter((r) => r.assignedTo === assignedTo);
  if (hasAssessment === '1' || hasAssessment === 'yes') out = out.filter((r) => r.hasAssessment);
  if (hasAssessment === '0' || hasAssessment === 'no') out = out.filter((r) => !r.hasAssessment);
  if (from) out = out.filter((r) => new Date(r.createdAt) >= new Date(from));
  if (to) out = out.filter((r) => new Date(r.createdAt) <= new Date(new Date(to).getTime() + 86400000));
  if (mbtiType && app) {
    const ids = new Set(app.db.col('assessment_results').filter((r) => r.type === mbtiType).map((r) => r.applicationId));
    out = out.filter((r) => ids.has(r.id));
  }
  return out;
}

function formUsageStats(ctx) {
  const apps = ctx.col('applications').all();
  const steps = {};
  for (const a of apps) {
    for (const [step, values] of Object.entries(a.answers || {})) {
      steps[step] = steps[step] || { filled: 0, fields: new Set() };
      steps[step].filled++;
      for (const k of Object.keys(values || {})) steps[step].fields.add(k);
    }
  }
  return {
    totalApplications: apps.length,
    completed: apps.filter((a) => a.status !== 'draft').length,
    draft: apps.filter((a) => a.status === 'draft').length,
    stepUsage: Object.entries(steps).map(([key, v]) => ({ key, filled: v.filled, fields: v.fields.size }))
  };
}

function buildAssessmentSummary(result) {
  return {
    id: result.id, type: result.type, status: result.status,
    completedAt: result.completedAt, answered: result.answered, total: result.total,
    dimensions: result.dimensions, borderline: result.borderline || [],
    fitScore: result.fitScore || null, profileName: result.profileName || ''
  };
}

function validateSchema(schema) {
  if (!schema.steps.length) return { ok: false, message: 'فرم باید حداقل یک مرحله داشته باشد' };
  const names = new Set();
  for (const step of schema.steps) {
    if (!step.key && !step.title) return { ok: false, message: 'هر مرحله باید عنوان داشته باشد' };
    for (const field of step.fields || []) {
      if (!field.name) return { ok: false, message: `در مرحله «${step.title}» یک فیلد بدون نام وجود دارد` };
      const full = `${step.key}.${field.name}`;
      if (names.has(full)) return { ok: false, message: `فیلد تکراری: ${field.label || field.name}` };
      names.add(full);
      if (['select', 'radio', 'checkbox'].includes(field.type) && (!Array.isArray(field.options) || !field.options.length)) {
        return { ok: false, message: `فیلد «${field.label || field.name}» به گزینه نیاز دارد` };
      }
      if (field.type === 'table' && (!Array.isArray(field.columns) || !field.columns.length)) {
        return { ok: false, message: `جدول «${field.label || field.name}» باید حداقل یک ستون داشته باشد` };
      }
    }
  }
  return { ok: true };
}

function normalizeSchema(schema) {
  const out = JSON.parse(JSON.stringify(schema));
  out.steps = out.steps.map((step, i) => Object.assign({}, step, {
    key: step.key || `step${i + 1}`,
    order: i + 1,
    fields: (step.fields || []).map((f) => {
      const field = Object.assign({}, f);
      field.type = field.type || 'text';
      if (['select', 'radio', 'checkbox'].includes(field.type) && Array.isArray(field.options)) {
        field.options = field.options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
      }
      return field;
    })
  }));
  out.updatedAt = new Date().toISOString();
  return out;
}

function avg(list) {
  if (!list.length) return null;
  return Math.round((list.reduce((a, b) => a + Number(b), 0) / list.length) * 10) / 10;
}

async function sendApplicantSms(ctx, application, templateKey, params) {
  const mobile = require('../../core/domain').mobile(application);
  if (!mobile) return { ok: false, error: 'شماره موبایل موجود نیست' };
  return ctx.sms.sendTemplate({ to: mobile, templateKey, params });
}
