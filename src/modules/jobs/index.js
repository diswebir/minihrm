/**
 * ماژول موقعیت‌های شغلی (آگهی‌های استخدام)
 */
'use strict';

const utils = require('../../core/utils');
const { paginate, sortRows, statusInfo } = require('../../core/domain');

module.exports = {
  key: 'jobs',
  title: 'موقعیت‌های شغلی',
  description: 'تعریف موقعیت‌های شغلی، شرح شغل، الزامات، انتشار در پورتال و QR اختصاصی هر موقعیت.',
  icon: 'briefcase',
  order: 30,
  defaultEnabled: true,

  permissions: [
    { key: 'jobs.view', title: 'مشاهده موقعیت‌های شغلی', group: 'موقعیت‌های شغلی' },
    { key: 'jobs.create', title: 'ایجاد موقعیت شغلی', group: 'موقعیت‌های شغلی' },
    { key: 'jobs.update', title: 'ویرایش موقعیت شغلی', group: 'موقعیت‌های شغلی' },
    { key: 'jobs.delete', title: 'حذف موقعیت شغلی', group: 'موقعیت‌های شغلی' },
    { key: 'jobs.publish', title: 'انتشار/بستن آگهی', group: 'موقعیت‌های شغلی' },
    { key: 'jobs.qr', title: 'دریافت QR و لینک اشتراک‌گذاری', group: 'موقعیت‌های شغلی' }
  ],

  settings: [
    { key: 'defaultAssessmentEnabled', title: 'آزمون شخصیت برای موقعیت‌های جدید فعال باشد', type: 'bool', default: true },
    { key: 'defaultAssessmentRequired', title: 'تکمیل آزمون برای موقعیت‌های جدید اجباری باشد', type: 'bool', default: false },
    { key: 'autoCloseOnFilled', title: 'بستن خودکار آگهی پس از تکمیل ظرفیت', type: 'bool', default: false },
    { key: 'portalDefault', title: 'موقعیت‌های جدید در پورتال نمایش داده شوند', type: 'bool', default: true },
    { key: 'qrBaseUrl', title: 'آدرس پایه لینک QR (اختیاری)', type: 'text', default: '', help: 'در صورت خالی بودن، آدرس پایه سامانه استفاده می‌شود.' }
  ],

  nav: [
    { path: '/jobs', title: 'موقعیت‌های شغلی', icon: 'briefcase', perm: 'jobs.view', order: 20 }
  ],

  install(app) {
    const col = app.db.col('jobs');
    // اطمینان از وجود اسلاگ یکتا برای موقعیت‌های موجود
    for (const job of col.all()) {
      if (!job.slug) col.update(job.id, { slug: uniqueSlug(col, utils.slugify(job.title)) });
    }
    return { jobs: col.count() };
  },

  api(api, app) {
    const modules = app.modules;
    const forms = require('../../core/formResolver');

    const jobOut = (job) => {
      const applications = app.db.col('applications').filter((a) => a.jobId === job.id);
      return Object.assign({}, job, {
        counts: {
          total: applications.length,
          active: applications.filter((a) => !['hired', 'rejected', 'withdrawn'].includes(a.status)).length,
          hired: applications.filter((a) => a.status === 'hired').length,
          new: applications.filter((a) => a.status === 'new').length,
          interview: applications.filter((a) => a.status === 'interview').length
        },
        publicUrl: `${baseUrlOf(app, job)}/careers/jobs/${job.slug}`,
        applyUrl: `${baseUrlOf(app, job)}/apply?job=${job.slug}`
      });
    };

    api.get('/jobs', { perm: 'jobs.view', module: 'jobs' }, (ctx) => {
      let rows = ctx.col('jobs').all().map(jobOut);
      const { q, status, department, type } = ctx.query;
      if (q) {
        const n = String(q).toLowerCase();
        rows = rows.filter((j) => [j.title, j.department, j.location, (j.tags || []).join(' ')].join(' ').toLowerCase().includes(n));
      }
      if (status) rows = rows.filter((j) => j.status === status);
      if (department) rows = rows.filter((j) => j.department === department);
      if (type) rows = rows.filter((j) => j.type === type);
      rows = sortRows(rows, ctx.query.sortBy || 'createdAt', ctx.query.dir || 'desc', ['createdAt', 'title', 'deadline', 'updatedAt']);
      const paged = paginate(rows, ctx.query, 12);
      const all = ctx.col('jobs').all();
      return {
        ...paged,
        stats: {
          total: all.length,
          open: all.filter((j) => j.status === 'open').length,
          draft: all.filter((j) => j.status === 'draft').length,
          closed: all.filter((j) => j.status === 'closed').length,
          departments: Array.from(new Set(all.map((j) => j.department).filter(Boolean)))
        },
        options: {
          types: ['تمام‌وقت', 'پاره‌وقت', 'دورکاری', 'پروژه‌ای', 'کارآموزی'],
          levels: ['کارآموز', 'کارشناس', 'کارشناس ارشد', 'سرپرست', 'مدیر'],
          statuses: [
            { key: 'open', title: 'در حال جذب', color: 'mint' },
            { key: 'draft', title: 'پیش‌نویس', color: 'sky' },
            { key: 'closed', title: 'بسته‌شده', color: 'rose' },
            { key: 'paused', title: 'توقف موقت', color: 'lemon' }
          ]
        }
      };
    });

    api.get('/jobs/:id', { perm: 'jobs.view', module: 'jobs' }, (ctx) => {
      const job = ctx.col('jobs').byId(ctx.params.id);
      if (!job) ctx.notFound('موقعیت شغلی یافت نشد');
      const applications = ctx.col('applications').filter((a) => a.jobId === job.id);
      const byStatus = {};
      for (const a of applications) byStatus[a.status] = (byStatus[a.status] || 0) + 1;
      return {
        job: jobOut(job),
        formSchema: forms.resolveForm(app, job),
        statusCounts: Object.entries(byStatus).map(([key, count]) => Object.assign(statusInfo(key), { count })),
        recentApplications: applications
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 8)
          .map((a) => require('../../core/domain').summary(a))
      };
    });

    api.post('/jobs', { perm: 'jobs.create', module: 'jobs' }, (ctx) => {
      const b = ctx.body;
      if (!utils.cleanText(b.title)) ctx.fail('عنوان موقعیت شغلی الزامی است');
      const col = ctx.col('jobs');
      const job = col.insert(buildJob(col, b, app, ctx.user));
      ctx.log('job.create', `ایجاد موقعیت شغلی «${job.title}»`, { entity: 'job', entityId: job.id });
      return { job: jobOut(job) };
    });

    api.put('/jobs/:id', { perm: 'jobs.update', module: 'jobs' }, (ctx) => {
      const job = ctx.col('jobs').byId(ctx.params.id);
      if (!job) ctx.notFound('موقعیت شغلی یافت نشد');
      const b = ctx.body;
      const patch = {};
      const strFields = ['title', 'department', 'location', 'type', 'level', 'salaryRange', 'description', 'summary', 'requirementsText', 'responsibilitiesText', 'welcomeMessage', 'contactPerson'];
      for (const f of strFields) if (b[f] !== undefined) patch[f] = utils.cleanText(b[f], 8000);
      if (b.openings !== undefined) patch.openings = Math.max(1, Number(b.openings) || 1);
      if (b.deadline !== undefined) patch.deadline = b.deadline || null;
      if (b.showInPortal !== undefined) patch.showInPortal = !!b.showInPortal;
      if (b.status !== undefined) patch.status = b.status;
      if (Array.isArray(b.requirements)) patch.requirements = b.requirements.map((x) => utils.cleanText(x, 400)).filter(Boolean);
      if (Array.isArray(b.responsibilities)) patch.responsibilities = b.responsibilities.map((x) => utils.cleanText(x, 400)).filter(Boolean);
      if (Array.isArray(b.tags)) patch.tags = b.tags.map((x) => utils.cleanText(x, 40)).filter(Boolean);
      if (Array.isArray(b.idealTypes)) patch.idealTypes = b.idealTypes;
      if (b.assessment) patch.assessment = Object.assign({ mbti: { enabled: true, required: false } }, job.assessment || {}, b.assessment);
      if (b.formOverrides) patch.formOverrides = normalizeOverrides(b.formOverrides);
      if (b.title && b.title !== job.title) patch.slug = uniqueSlug(ctx.col('jobs'), utils.slugify(b.title), job.id);
      const updated = ctx.col('jobs').update(job.id, patch);
      ctx.log('job.update', `ویرایش موقعیت شغلی «${updated.title}»`, { entity: 'job', entityId: job.id, meta: { status: updated.status } });
      return { job: jobOut(updated) };
    });

    api.post('/jobs/:id/status', { perm: 'jobs.publish', module: 'jobs' }, (ctx) => {
      const job = ctx.col('jobs').byId(ctx.params.id);
      if (!job) ctx.notFound('موقعیت شغلی یافت نشد');
      const status = ['open', 'closed', 'draft', 'paused'].includes(ctx.body.status) ? ctx.body.status : 'open';
      const updated = ctx.col('jobs').update(job.id, { status, statusChangedAt: new Date().toISOString() });
      ctx.log('job.status', `تغییر وضعیت «${job.title}» به ${status}`, { entity: 'job', entityId: job.id });
      return { job: jobOut(updated) };
    });

    api.post('/jobs/:id/duplicate', { perm: 'jobs.create', module: 'jobs' }, (ctx) => {
      const job = ctx.col('jobs').byId(ctx.params.id);
      if (!job) ctx.notFound('موقعیت شغلی یافت نشد');
      const copy = Object.assign({}, job);
      delete copy.id; delete copy.createdAt; delete copy.updatedAt;
      copy.title = `${job.title} (کپی)`;
      copy.slug = uniqueSlug(ctx.col('jobs'), utils.slugify(copy.title));
      copy.status = 'draft';
      const created = ctx.col('jobs').insert(copy);
      ctx.log('job.duplicate', `کپی موقعیت شغلی «${job.title}»`, { entity: 'job', entityId: created.id });
      return { job: jobOut(created) };
    });

    api.delete('/jobs/:id', { perm: 'jobs.delete', module: 'jobs' }, (ctx) => {
      const job = ctx.col('jobs').byId(ctx.params.id);
      if (!job) ctx.notFound('موقعیت شغلی یافت نشد');
      const count = ctx.col('applications').filter((a) => a.jobId === job.id).length;
      if (count && ctx.query.force !== '1') ctx.fail(`این موقعیت ${count} درخواست استخدامی دارد. برای حذف، ابتدا درخواست‌ها را منتقل یا حذف کنید.`);
      ctx.col('jobs').remove(job.id);
      ctx.log('job.delete', `حذف موقعیت شغلی «${job.title}»`, { entity: 'job', entityId: job.id, level: 'warn' });
      return { deleted: true };
    });

    /** اطلاعات QR و لینک اشتراک‌گذاری */
    api.get('/jobs/:id/qr', { perm: 'jobs.qr', module: 'jobs' }, (ctx) => {
      const job = ctx.col('jobs').byId(ctx.params.id);
      if (!job) ctx.notFound('موقعیت شغلی یافت نشد');
      const base = baseUrlOf(app, job);
      return {
        job: { id: job.id, title: job.title, slug: job.slug, department: job.department },
        applyUrl: `${base}/apply?job=${job.slug}`,
        publicUrl: `${base}/careers/jobs/${job.slug}`,
        qrTitle: `فرم استخدام — ${job.title}`,
        instructions: [
          'کد QR را در آگهی، بنر یا کارت ویزیت قرار دهید.',
          'متقاضی با اسکن، وارد فرم استخدام می‌شود.',
          'ورود با شماره موبایل و کد پیامکی انجام می‌شود.',
          'فرم چندمرحله‌ای تا ثبت نهایی ادامه می‌یابد.'
        ]
      };
    });

    api.get('/jobs/meta/options', { perm: 'jobs.view', module: 'jobs' }, (ctx) => {
      const all = ctx.col('jobs').all();
      return {
        departments: Array.from(new Set(all.map((j) => j.department).filter(Boolean))).sort(),
        locations: Array.from(new Set(all.map((j) => j.location).filter(Boolean))).sort(),
        jobs: all.map((j) => ({ id: j.id, title: j.title, status: j.status, slug: j.slug }))
      };
    });
  }
};

// ------------------------------------------------------------------ کمکی‌ها

function baseUrlOf(app, job) {
  const configured = String(app.modules.s('jobs', 'qrBaseUrl', '') || '').trim().replace(/\/+$/, '');
  return configured || String(app.config.get('app.baseUrl', '') || '').replace(/\/+$/, '') || '';
}

function uniqueSlug(col, base, excludeId = null) {
  let slug = base || 'job';
  let i = 2;
  while (col.all().some((j) => j.slug === slug && j.id !== excludeId)) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

function buildJob(col, b, app, user) {
  const title = utils.cleanText(b.title, 160);
  const modules = app.modules;
  return {
    title,
    slug: uniqueSlug(col, utils.slugify(title)),
    department: utils.cleanText(b.department, 80),
    location: utils.cleanText(b.location, 80),
    type: utils.cleanText(b.type, 40) || 'تمام‌وقت',
    level: utils.cleanText(b.level, 40) || 'کارشناس',
    openings: Math.max(1, Number(b.openings) || 1),
    salaryRange: utils.cleanText(b.salaryRange, 80),
    summary: utils.cleanText(b.summary, 400),
    description: utils.cleanText(b.description, 8000),
    requirements: (b.requirements || []).map((x) => utils.cleanText(x, 400)).filter(Boolean),
    responsibilities: (b.responsibilities || []).map((x) => utils.cleanText(x, 400)).filter(Boolean),
    tags: (b.tags || []).map((x) => utils.cleanText(x, 40)).filter(Boolean),
    idealTypes: Array.isArray(b.idealTypes) ? b.idealTypes : [],
    deadline: b.deadline || null,
    status: b.status || 'open',
    showInPortal: b.showInPortal !== undefined ? !!b.showInPortal : modules.s('jobs', 'portalDefault', true),
    welcomeMessage: utils.cleanText(b.welcomeMessage, 1000),
    contactPerson: utils.cleanText(b.contactPerson, 120),
    assessment: Object.assign({
      mbti: {
        enabled: modules.s('jobs', 'defaultAssessmentEnabled', true),
        required: modules.s('jobs', 'defaultAssessmentRequired', false)
      }
    }, b.assessment || {}),
    formOverrides: normalizeOverrides(b.formOverrides),
    createdBy: user ? user.id : null,
    createdByName: user ? user.name : ''
  };
}

function normalizeOverrides(input = {}) {
  return {
    required: Array.isArray(input.required) ? input.required : [],
    hidden: Array.isArray(input.hidden) ? input.hidden : [],
    steps: Array.isArray(input.steps) ? input.steps : [],
    extraFields: Array.isArray(input.extraFields) ? input.extraFields : []
  };
}
