/**
 * ماژول پورتال عمومی استخدام
 * ------------------------------------------------------------------
 * - صفحات عمومی: فرصت‌های شغلی، صفحه هر موقعیت شغلی، شروع فرم، پیگیری
 * - ورود متقاضی با شماره موبایل + کد یکبارمصرف پیامکی (IPPanel)
 * - ویزارد چندمرحله‌ای فرم استخدام با ذخیره خودکار و اعتبارسنجی
 * - آزمون شخصیت‌شناسی (نتیجه فقط برای منابع انسانی/مدیر نمایش داده می‌شود)
 */
'use strict';

const utils = require('../../core/utils');
const jalali = require('../../core/jalali');
const domain = require('../../core/domain');
const forms = require('../../core/formResolver');
const mbti = require('../../core/mbtiAnalysis');

module.exports = {
  key: 'portal',
  title: 'پورتال استخدام',
  description: 'صفحه عمومی فرصت‌های شغلی، فرم استخدام آنلاین چندمرحله‌ای، ورود با کد پیامکی و پیگیری وضعیت.',
  icon: 'globe',
  order: 5,
  core: true,
  defaultEnabled: true,

  permissions: [
    { key: 'portal.view', title: 'مشاهده تنظیمات پورتال', group: 'پورتال' },
    { key: 'portal.applicants', title: 'مشاهده حساب‌های متقاضیان', group: 'پورتال' }
  ],

  nav: [
    { path: '/applicants', title: 'متقاضیان سایت', icon: 'user-check', perm: 'portal.applicants', order: 28 }
  ],

  settings: [
    { key: 'allowGuestBrowse', title: 'امکان مشاهده فرصت‌ها بدون ورود', type: 'bool', default: true },
    { key: 'showFormPreview', title: 'نمایش پیش‌نمایش مراحل فرم در صفحه شغل', type: 'bool', default: true },
    { key: 'autosaveSeconds', title: 'فاصله ذخیره خودکار فرم (ثانیه)', type: 'number', default: 20 },
    { key: 'requireOtpAgain', title: 'درخواست کد جدید در هر ورود', type: 'bool', default: false },
    { key: 'thanksMessage', title: 'پیام پس از ثبت نهایی فرم', type: 'text', default: 'فرم شما با موفقیت ثبت شد. کارشناسان منابع انسانی در صورت تناسب، با شما تماس خواهند گرفت. کد رهگیری خود را نزد خود نگه دارید.' }
  ],

  // ================================================================ صفحات عمومی
  routes(router, app) {
    const portal = app.config.get('publicPortal', {});
    const brand = () => ({
      name: app.config.get('app.name', 'مینی HRM'),
      companyName: app.config.get('app.companyName', ''),
      logo: app.config.get('app.logo', null),
      primaryColor: app.config.get('app.primaryColor', '#7C6CF0')
    });

    const baseData = (req) => ({
      brand: brand(),
      portal,
      app: app.config.get('app', {}),
      year: jalali.jalaaliParts(new Date()).year,
      base: app.config.baseUrl(req),
      contact: {
        email: portal.contactEmail || app.config.get('app.supportEmail', ''),
        phone: portal.contactPhone || app.config.get('app.supportPhone', ''),
        address: portal.address || ''
      }
    });

    router.get('/', (req, res) => res.redirect(portal.careersEnabled === false ? '/admin' : '/careers'));

    router.get('/careers', (req, res) => {
      if (portal.careersEnabled === false) {
        return res.redirect('/admin');
      }
      const jobs = publicJobs(app, { department: req.query.department, q: req.query.q, type: req.query.type });
      const departments = Array.from(new Set(app.db.col('jobs').all().filter((j) => j.status === 'open' && j.showInPortal !== false).map((j) => j.department).filter(Boolean)));
      res.html(app.view.render('portal/careers', Object.assign(baseData(req), {
        jobs: jobs.map(compactJob),
        departments,
        filters: { department: req.query.department || '', q: req.query.q || '', type: req.query.type || '' },
        title: portal.pageTitle || 'فرصت‌های شغلی'
      })));
    });

    router.get('/careers/jobs/:slug', (req, res) => {
      const job = app.db.col('jobs').by('slug', req.params.slug);
      if (!job || job.showInPortal === false) {
        return res.status(404).html(app.view.render('errors/error', {
          status: 404, message: 'موقعیت شغلی مورد نظر یافت نشد یا بسته شده است.', brand: brand(), title: 'موقعیت یافت نشد'
        }, 'layouts/plain'));
      }
      const schema = forms.clientForm(forms.resolveForm(app, job));
      res.html(app.view.render('portal/job', Object.assign(baseData(req), {
        job,
        steps: schema.steps.map((s) => ({ key: s.key, title: s.title, icon: s.icon, count: (s.fields || []).length })),
        applyUrl: `/apply?job=${job.slug}`,
        title: job.title
      })));
    });

    router.get('/apply', (req, res) => {
      const job = req.query.job ? app.db.col('jobs').by('slug', req.query.job) : null;
      // اگر لینک ارسالی منابع انسانی حاوی توکن نشست متقاضی است، نشست را در کوکی بنشان
      const session = app.auth.sessionFromRequest(req);
      if (session && session.subjectType === 'applicant') {
        res.setCookie(app.auth.cookieHeader(session));
      }
      res.html(app.view.render('portal/apply', Object.assign(baseData(req), {
        job: job || null,
        title: 'فرم استخدام',
        sid: req.query.sid || null
      })));
    });

    router.get('/track', (req, res) => {
      res.html(app.view.render('portal/track', Object.assign(baseData(req), { title: 'پیگیری درخواست' })));
    });

    /** ورود متقاضی از طریق لینک دعوت منابع انسانی (مسیر جداگانه از دعوت کارکنان: /invite/:token) */
    router.get('/apply/invite/:token', (req, res) => {
      const invite = app.db.col('applicant_invites').byId(req.params.token);
      if (!invite || invite.usedAt || new Date(invite.expiresAt).getTime() < Date.now()) {
        return res.status(410).html(app.view.render('errors/error', {
          status: 410, message: 'این لینک منقضی شده است. لطفاً از صفحه فرصت‌های شغلی، فرم را تکمیل کنید.',
          brand: brand(), title: 'لینک منقضی', backUrl: '/careers'
        }, 'layouts/plain'));
      }
      let applicant = app.db.col('applicants').find((a) => utils.normalizeMobile(a.mobile) === utils.normalizeMobile(invite.mobile));
      if (!applicant) {
        applicant = app.db.col('applicants').insert({
          mobile: utils.normalizeMobile(invite.mobile),
          name: invite.name || '',
          verifiedAt: new Date().toISOString(),
          source: 'invite'
        });
      }
      const session = app.auth.createSession({
        subjectType: 'applicant', subjectId: applicant.id, req,
        hours: app.config.get('security.applySessionHours', 72), meta: { purpose: 'invite' }
      });
      app.db.col('applicant_invites').update(invite.id, { usedAt: new Date().toISOString() });
      res.setCookie(app.auth.cookieHeader(session));
      const job = invite.jobId ? app.db.col('jobs').byId(invite.jobId) : null;
      res.redirect(`/apply${job ? `?job=${job.slug}` : ''}`);
    });
  },

  // ================================================================ API پورتال
  api(api, app) {
    const modules = app.modules;

    /** داده‌های پایه پورتال برای کلاینت */
    api.get('/portal/bootstrap', { auth: false, module: 'portal' }, (ctx) => {
      const jobSlug = ctx.query.job;
      const job = jobSlug ? ctx.col('jobs').by('slug', jobSlug) : null;
      const session = ctx.auth.currentApplicant(ctx.req);
      const applicant = session ? session.applicant : null;
      const settings = modules.settings('portal');
      let draft = null;
      let myApplications = [];
      if (applicant) {
        myApplications = ctx.col('applications')
          .filter((a) => a.applicantId === applicant.id && a.status !== 'draft')
          .map((a) => ({
            id: a.id, code: a.code, jobTitle: a.jobTitle, status: a.status,
            statusTitle: domain.statusInfo(a.status).title, statusColor: domain.statusInfo(a.status).color,
            createdAt: a.createdAt, submittedAt: a.submittedAt,
            assessmentStatus: a.assessment ? a.assessment.status : null,
            nextInterviewAt: domain.nextInterview(a)
          }));
        draft = ctx.col('applications').find((a) => a.applicantId === applicant.id && a.status === 'draft');
        if (draft) {
          draft = {
            id: draft.id, jobId: draft.jobId, jobTitle: draft.jobTitle,
            answers: draft.answers || {}, progress: draft.progress || { currentStep: 0, completed: [] },
            updatedAt: draft.updatedAt
          };
        }
      }

      const schema = job ? forms.clientForm(forms.resolveForm(app, job)) : null;

      return {
        portal: publicSettings(app),
        brand: { name: ctx.config.get('app.name'), companyName: ctx.config.get('app.companyName'), logo: ctx.config.get('app.logo'), primaryColor: ctx.config.get('app.primaryColor') },
        jobs: publicJobs(app).map(compactJob),
        job: job ? Object.assign(compactJob(job), { description: job.description, requirements: job.requirements || [], responsibilities: job.responsibilities || [], welcomeMessage: job.welcomeMessage || '' }) : null,
        schema,
        applicant: applicant ? { id: applicant.id, name: applicant.name, mobile: applicant.mobile } : null,
        applications: myApplications,
        draft,
        settings,
        assessmentSettings: modules.settings('assessments'),
        smsTestMode: app.sms.testMode,
        now: new Date().toISOString()
      };
    });

    /** درخواست کد یکبارمصرف */
    api.post('/portal/otp/request', { auth: false, module: 'portal', rateLimit: { max: 12, windowSec: 300 } }, async (ctx) => {
      const mobile = utils.normalizeMobile(ctx.body.mobile);
      if (!utils.isValidMobile(mobile)) ctx.fail('شماره موبایل معتبر وارد کنید (مثال: ۰۹۱۲۳۴۵۶۷۸۹)', 400, { fields: { mobile: 'شماره موبایل نامعتبر است' } });
      const purpose = ctx.body.purpose === 'track' ? 'apply' : 'apply';
      const result = await ctx.otp.request({ mobile, purpose, ip: ctx.ip });
      if (!result.ok) ctx.fail(result.error);
      return {
        sent: true,
        ttlSec: result.ttlSec,
        devCode: result.devCode,           // فقط در حالت آزمایشی پیامک
        simulated: result.simulated,
        mobile
      };
    });

    /** تأیید کد و ایجاد نشست متقاضی */
    api.post('/portal/otp/verify', { auth: false, module: 'portal', rateLimit: { max: 20, windowSec: 300 } }, (ctx) => {
      const mobile = utils.normalizeMobile(ctx.body.mobile);
      if (!utils.isValidMobile(mobile)) ctx.fail('شماره موبایل نامعتبر است');
      const verify = ctx.otp.verify({ mobile, purpose: 'apply', code: ctx.body.code });
      if (!verify.ok) ctx.fail(verify.error, 400, { fields: { code: verify.error } });

      let applicant = ctx.col('applicants').find((a) => utils.normalizeMobile(a.mobile) === mobile);
      if (!applicant) {
        applicant = ctx.col('applicants').insert({
          mobile,
          name: utils.cleanText(ctx.body.name, 120),
          verifiedAt: new Date().toISOString(),
          source: 'portal'
        });
      } else {
        ctx.col('applicants').update(applicant.id, { verifiedAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() });
      }
      const session = ctx.auth.createSession({
        subjectType: 'applicant', subjectId: applicant.id, req: ctx.req,
        hours: ctx.config.get('security.applySessionHours', 72), meta: { purpose: 'apply' }
      });
      ctx.req.__res.setCookie(ctx.auth.cookieHeader(session));

      const applications = ctx.col('applications').filter((a) => a.applicantId === applicant.id && a.status !== 'draft')
        .map((a) => ({ id: a.id, code: a.code, jobTitle: a.jobTitle, statusTitle: domain.statusInfo(a.status).title, statusColor: domain.statusInfo(a.status).color }));
      const draft = ctx.col('applications').find((a) => a.applicantId === applicant.id && a.status === 'draft');
      return {
        applicant: { id: applicant.id, name: applicant.name, mobile: applicant.mobile },
        sessionId: session.id,
        applications,
        draft: draft ? { id: draft.id, jobId: draft.jobId, jobTitle: draft.jobTitle, progress: draft.progress, answers: draft.answers } : null
      };
    });

    api.post('/portal/logout', { auth: false, module: 'portal' }, (ctx) => {
      const session = ctx.auth.sessionFromRequest(ctx.req);
      if (session && session.subjectType === 'applicant') ctx.auth.destroySession(session.id);
      ctx.req.__res.setCookie(ctx.auth.clearCookieHeader('applicant'));
      return { loggedOut: true };
    });

    /** شروع یا ادامه پیش‌نویس فرم */
    api.post('/portal/applications', { auth: false, module: 'portal' }, (ctx) => {
      const session = ctx.auth.currentApplicant(ctx.req);
      if (!session) ctx.fail('برای شروع فرم، ابتدا با شماره موبایل وارد شوید.', 401, { code: 'need_auth' });
      const applicant = session.applicant;
      const slug = ctx.body.jobSlug;
      const jobId = ctx.body.jobId;
      const job = slug ? ctx.col('jobs').by('slug', slug) : (jobId ? ctx.col('jobs').byId(jobId) : null);
      if (!job) ctx.fail('موقعیت شغلی انتخاب نشده یا نامعتبر است');
      if (job.status !== 'open') ctx.fail('این موقعیت شغلی در حال حاضر فعال نیست');

      // جلوگیری از ثبت تکراری
      const existing = ctx.col('applications').find((a) => a.applicantId === applicant.id && a.jobId === job.id && a.status !== 'draft');
      if (existing) {
        ctx.fail(`شما قبلاً برای این موقعیت فرم ثبت کرده‌اید (کد رهگیری: ${existing.code}).`, 409, { code: 'duplicate', applicationId: existing.id });
      }

      let draft = ctx.col('applications').find((a) => a.applicantId === applicant.id && a.status === 'draft');
      const schema = forms.resolveForm(app, job);
      const data = {
        applicantId: applicant.id,
        jobId: job.id,
        jobTitle: job.title,
        formSchemaKey: schema.key,
        formVersion: (ctx.col('form_schemas').find((f) => f.key === 'default' || f.isDefault) || {}).version || 1,
        answers: (draft && draft.answers) || {},
        files: [],
        status: 'draft',
        progress: (draft && draft.progress) || { currentStep: 0, completed: [] },
        source: ctx.body.source || 'portal',
        mobile: applicant.mobile,
        referenceCode: ctx.body.referenceCode || null
      };
      if (draft) {
        draft = ctx.col('applications').update(draft.id, Object.assign({}, data, { timeline: (draft.timeline || []).concat([{ at: new Date().toISOString(), actorName: 'متقاضی', type: 'draft', title: `ادامه فرم برای «${job.title}»` }]) }));
      } else {
        draft = ctx.col('applications').insert(Object.assign({}, data, {
          timeline: [{ at: new Date().toISOString(), actorName: 'متقاضی', type: 'draft', title: `شروع فرم استخدام برای «${job.title}»` }]
        }));
      }
      return { application: { id: draft.id, jobId: draft.jobId, jobTitle: draft.jobTitle, answers: draft.answers, progress: draft.progress }, schema: forms.clientForm(schema) };
    });

    /** ذخیره خودکار پاسخ‌ها */
    api.put('/portal/applications/:id', { auth: false, module: 'portal' }, (ctx) => {
      const session = ctx.auth.currentApplicant(ctx.req);
      if (!session) ctx.fail('نشست شما منقضی شده است؛ دوباره وارد شوید.', 401, { code: 'need_auth' });
      const application = ctx.col('applications').byId(ctx.params.id);
      if (!application || application.applicantId !== session.applicant.id) ctx.notFound('فرم یافت نشد');
      if (application.status !== 'draft') ctx.fail('این فرم قبلاً ثبت نهایی شده است.');

      const job = ctx.col('jobs').byId(application.jobId);
      const schema = forms.resolveForm(app, job);
      const answers = JSON.parse(JSON.stringify(application.answers || {}));
      const incoming = ctx.body.answers || {};
      for (const [stepKey, values] of Object.entries(incoming)) {
        answers[stepKey] = Object.assign({}, answers[stepKey] || {}, values);
      }
      const progress = Object.assign({ currentStep: 0, completed: [] }, application.progress || {}, ctx.body.progress || {});

      const updated = ctx.col('applications').update(application.id, { answers, progress });
      // اعتبارسنجی مرحله‌ای (در صورت درخواست)
      let errors = null;
      if (ctx.body.validateStep) {
        const result = forms.validateAnswers(schema, answers, { stepKey: ctx.body.validateStep });
        if (!result.ok) errors = result.errors;
      }
      return { savedAt: updated.updatedAt, errors, progress: updated.progress, completeness: computeCompleteness(schema, answers) };
    });

    /** آپلود فایل (رزومه/عکس/مدارک) */
    api.post('/portal/applications/:id/files', { auth: false, module: 'portal' }, (ctx) => {
      const session = ctx.auth.currentApplicant(ctx.req);
      if (!session) ctx.fail('نشست شما منقضی شده است.', 401, { code: 'need_auth' });
      const application = ctx.col('applications').byId(ctx.params.id);
      if (!application || application.applicantId !== session.applicant.id) ctx.notFound('فرم یافت نشد');
      const file = ctx.files.find((f) => f.field === 'file') || ctx.files[0];
      if (!file) ctx.fail('فایلی ارسال نشده است');
      const portalCfg = ctx.config.get('publicPortal', {});
      if (portalCfg.allowResumeUpload === false) ctx.fail('بارگذاری فایل در حال حاضر غیرفعال است');
      const maxMB = Number(portalCfg.maxFileSizeMB || 5);
      const saved = ctx.app.upload.saveUpload(file, {
        root: app.root, dir: `applications/${application.id}`,
        allowed: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx'],
        maxBytes: maxMB * 1024 * 1024, prefix: ctx.body.fieldName || 'file'
      });
      const record = Object.assign(saved, { field: ctx.body.fieldName || file.field, uploadedAt: new Date().toISOString() });
      const files = (application.files || []).filter((f) => f.field !== record.field).concat([record]);
      const answers = JSON.parse(JSON.stringify(application.answers || {}));
      if (ctx.body.fieldName && ctx.body.stepKey) {
        answers[ctx.body.stepKey] = Object.assign({}, answers[ctx.body.stepKey] || {}, { [ctx.body.fieldName]: { name: record.name, path: record.path, size: record.size } });
      }
      ctx.col('applications').update(application.id, { files, answers });
      return { file: { name: record.name, path: record.path, size: record.size, field: record.field } };
    });

    /** ثبت نهایی فرم */
    api.post('/portal/applications/:id/submit', { auth: false, module: 'portal' }, async (ctx) => {
      const session = ctx.auth.currentApplicant(ctx.req);
      if (!session) ctx.fail('نشست شما منقضی شده است.', 401, { code: 'need_auth' });
      const application = ctx.col('applications').byId(ctx.params.id);
      if (!application || application.applicantId !== session.applicant.id) ctx.notFound('فرم یافت نشد');
      if (application.status !== 'draft') ctx.fail('این فرم قبلاً ثبت نهایی شده است.');

      const job = ctx.col('jobs').byId(application.jobId);
      const schema = forms.resolveForm(app, job);
      const answers = Object.assign({}, application.answers || {}, ctx.body.answers || {});
      const validation = forms.validateAnswers(schema, answers);
      if (!validation.ok) {
        ctx.fail('برخی فیلدهای اجباری تکمیل نشده‌اند.', 400, { fields: validation.errors });
      }

      // جلوگیری از کد ملی تکراری برای همان موقعیت
      const nationalId = ((answers.personal || {}).nationalId || '').toString();
      if (modules.s('recruitment', 'requireUniqueNationalId', true) && nationalId) {
        const dup = ctx.col('applications').find((a) => a.id !== application.id && a.jobId === job.id && a.status !== 'draft' && ((a.answers || {}).personal || {}).nationalId === nationalId);
        if (dup) ctx.fail('برای این کد ملی و این موقعیت شغلی، قبلاً فرم ثبت شده است.', 409, { fields: { 'personal.nationalId': 'این کد ملی قبلاً برای این موقعیت ثبت شده است' } });
      }

      const identity = forms.identityFromAnswers(answers, session.applicant.mobile);
      const code = nextApplicationCode(ctx);
      const now = new Date().toISOString();

      const assessmentRequired = !!(job && job.assessment && job.assessment.mbti && job.assessment.mbti.enabled);

      const updated = ctx.col('applications').update(application.id, {
        code,
        status: 'new',
        submittedAt: now,
        firstName: identity.firstName,
        lastName: identity.lastName,
        name: identity.name,
        mobile: identity.mobile,
        email: identity.email,
        nationalId: identity.nationalId,
        answers,
        progress: { currentStep: 0, completed: (schema.steps || []).map((s) => s.key), submitted: true },
        assessment: assessmentRequired
          ? { type: 'mbti', status: 'invited', required: !!(job.assessment.mbti.required), invitedAt: now }
          : { type: 'mbti', status: 'not_required' },
        timeline: (application.timeline || []).concat([
          { at: now, actorName: identity.name || 'متقاضی', type: 'submit', title: `ثبت نهایی فرم استخدام (کد رهگیری: ${code})` }
        ])
      });

      ctx.col('applicants').update(session.applicant.id, { name: identity.name || session.applicant.name });

      // پیامک تشکر
      if (modules.s('recruitment', 'autoReplySms', true) && identity.mobile) {
        const result = await ctx.sms.sendTemplate({
          to: identity.mobile, templateKey: 'applied',
          params: { name: identity.name, job: job ? job.title : '', code, company: ctx.config.get('app.companyName', '') }
        });
        ctx.col('applications').update(application.id, {
          timeline: updated.timeline.concat([{ at: new Date().toISOString(), actorName: 'سیستم', type: 'sms', title: `ارسال پیامک تشکر${result.simulated ? ' (حالت آزمایشی)' : result.ok ? '' : ' — ناموفق'}` }])
        });
      }

      ctx.audit.log({
        action: 'application.submit', entity: 'application', entityId: application.id,
        title: `ثبت فرم استخدام «${identity.name}» برای «${job ? job.title : ''}»`, req: ctx.req
      });

      return {
        application: { id: application.id, code, status: 'new', jobTitle: job ? job.title : '' },
        next: assessmentRequired ? 'assessment' : 'done',
        assessmentRequired,
        thanksMessage: modules.s('portal', 'thanksMessage', '')
      };
    });

    /** فهرست پرونده‌های متقاضی */
    api.get('/portal/applications', { auth: false, module: 'portal' }, (ctx) => {
      const session = ctx.auth.currentApplicant(ctx.req);
      if (!session) return { applications: [], authenticated: false };
      const apps = ctx.col('applications').filter((a) => a.applicantId === session.applicant.id && a.status !== 'draft');
      return {
        authenticated: true,
        applicant: { name: session.applicant.name, mobile: session.applicant.mobile },
        applications: apps.map((a) => ({
          id: a.id, code: a.code, jobTitle: a.jobTitle,
          status: a.status, statusTitle: domain.statusInfo(a.status).title, statusColor: domain.statusInfo(a.status).color,
          createdAt: a.createdAt, submittedAt: a.submittedAt,
          assessmentStatus: a.assessment ? a.assessment.status : null,
          interviews: (a.interviews || []).filter((i) => i.status === 'scheduled').map((i) => ({ at: i.scheduledAt, type: i.type, mode: i.mode }))
        }))
      };
    });

    // ---------------------------------------------------------------- آزمون شخصیت
    api.get('/portal/assessment/:applicationId', { auth: false, module: 'portal' }, (ctx) => {
      const session = ctx.auth.currentApplicant(ctx.req);
      if (!session) ctx.fail('نشست شما منقضی شده است.', 401, { code: 'need_auth' });
      const application = ctx.col('applications').byId(ctx.params.applicationId);
      if (!application || application.applicantId !== session.applicant.id) ctx.notFound('پرونده یافت نشد');
      const settings = modules.settings('assessments');
      const existing = ctx.col('assessment_results').find((r) => r.applicationId === application.id && r.status === 'completed');
      if (existing && !settings.allowRetake) {
        return {
          status: 'completed',
          completedAt: existing.completedAt,
          message: 'شما این آزمون را قبلاً تکمیل کرده‌اید. نتیجه آزمون توسط کارشناسان منابع انسانی بررسی می‌شود.',
          showResultToApplicant: !!settings.showResultToApplicant,
          type: settings.showResultToApplicant ? existing.type : undefined,
          profileName: settings.showResultToApplicant ? existing.profileName : undefined
        };
      }
      const questions = mbti.questions(app).map((q) => ({
        no: q.no, text: q.text, options: q.options.map((o, i) => ({ key: i === 0 ? 'a' : 'b', label: o.label }))
      }));
      return {
        status: 'available',
        title: settings.testTitle || 'آزمون شناخت سبک کاری و شخصیتی',
        intro: settings.testIntro || '',
        requireAll: settings.requireAll !== false,
        total: questions.length,
        questions,
        application: { id: application.id, code: application.code, jobTitle: application.jobTitle }
      };
    });

    api.post('/portal/assessment/:applicationId/submit', { auth: false, module: 'portal' }, (ctx) => {
      const session = ctx.auth.currentApplicant(ctx.req);
      if (!session) ctx.fail('نشست شما منقضی شده است.', 401, { code: 'need_auth' });
      const application = ctx.col('applications').byId(ctx.params.applicationId);
      if (!application || application.applicantId !== session.applicant.id) ctx.notFound('پرونده یافت نشد');
      const settings = modules.settings('assessments');

      const existing = ctx.col('assessment_results').find((r) => r.applicationId === application.id && r.status === 'completed');
      if (existing && !settings.allowRetake) ctx.fail('شما این آزمون را قبلاً تکمیل کرده‌اید.');

      const answers = {};
      for (const [rawKey, rawVal] of Object.entries(ctx.body.answers || {})) {
        const key = utils.enDigits(rawKey).trim();
        answers[key] = typeof rawVal === 'string' ? utils.enDigits(rawVal).trim() : rawVal;
      }
      const analysis = mbti.analyze(app, answers, ctx.col('jobs').byId(application.jobId));
      if (settings.requireAll !== false && analysis.answered < analysis.total) {
        ctx.fail(`پاسخ به همه سؤالات الزامی است (${utils.faDigits(analysis.answered)} از ${utils.faDigits(analysis.total)} پاسخ داده شده).`);
      }
      if (!analysis.type) ctx.fail('پاسخ‌های ارسالی برای تحلیل کافی نیست.');

      const record = ctx.col('assessment_results').insert({
        applicationId: application.id,
        jobId: application.jobId,
        source: 'portal',
        type: analysis.type,
        profileName: analysis.profileName,
        group: analysis.group,
        scores: analysis.scores,
        dimensions: analysis.dimensions,
        answered: analysis.answered,
        total: analysis.total,
        borderline: analysis.borderline,
        borderlineNote: analysis.borderlineNote,
        confidence: analysis.confidence,
        perQuestion: analysis.perQuestion,
        fitScore: analysis.jobFit ? analysis.jobFit.score : null,
        fitLevel: analysis.jobFit ? analysis.jobFit.level : null,
        status: 'completed',
        completedAt: new Date().toISOString()
      });

      ctx.col('applications').update(application.id, {
        assessment: Object.assign({}, application.assessment || {}, { type: 'mbti', status: 'completed', resultId: record.id, completedAt: record.completedAt }),
        timeline: (application.timeline || []).concat([
          { at: new Date().toISOString(), actorName: 'متقاضی', type: 'assessment', title: 'تکمیل آزمون شخصیت‌شناسی' }
        ])
      });

      if (settings.sendSmsOnComplete) {
        ctx.sms.sendRaw({
          to: session.applicant.mobile, templateKey: 'assessmentDone',
          text: `${session.applicant.name || ''} عزیز، آزمون شما با موفقیت ثبت شد. با تشکر از ${ctx.config.get('app.companyName', '')}`,
          params: { name: session.applicant.name, company: ctx.config.get('app.companyName', '') }
        });
      }

      ctx.audit.log({
        action: 'assessment.submit', entity: 'assessment', entityId: record.id,
        title: `تکمیل آزمون شخصیت توسط متقاضی (${application.code || application.id})`, req: ctx.req
      });

      // نتیجه فقط در صورت فعال بودن تنظیم، به متقاضی نمایش داده می‌شود
      if (settings.showResultToApplicant) {
        return { status: 'completed', showResultToApplicant: true, type: analysis.type, profileName: analysis.profileName, message: 'آزمون شما با موفقیت ثبت شد.' };
      }
      return {
        status: 'completed',
        showResultToApplicant: false,
        message: 'آزمون شما با موفقیت ثبت شد. نتیجه این آزمون توسط کارشناسان منابع انسانی بررسی می‌شود و در فرایند ارزیابی شما لحاظ خواهد شد.'
      };
    });

    // ---------------------------------------------------------------- پیگیری
    api.get('/portal/track', { auth: false, module: 'portal', rateLimit: { max: 30, windowSec: 300 } }, (ctx) => {
      const code = utils.cleanText(ctx.query.code, 40).toUpperCase();
      const mobile = utils.normalizeMobile(ctx.query.mobile || '');
      if (!code) ctx.fail('کد رهگیری را وارد کنید');
      const application = ctx.col('applications').find((a) => String(a.code || '').toUpperCase() === code);
      if (!application) ctx.notFound('درخواستی با این کد رهگیری یافت نشد.');
      // محدودیت حریم خصوصی: فقط کد ملی/موبایل تطبیق جزئی
      if (mobile) {
        const appMobile = domain.mobile(application);
        if (appMobile && utils.normalizeMobile(appMobile) !== mobile) {
          ctx.fail('شماره موبایل با کد رهگیری مطابقت ندارد.', 403);
        }
      }
      const st = domain.statusInfo(application.status);
      const publicTimeline = (application.timeline || [])
        .filter((t) => ['submit', 'status', 'interview', 'assessment', 'draft'].includes(t.type))
        .map((t) => ({ at: t.at, title: t.title, type: t.type }));
      const upcoming = (application.interviews || []).filter((i) => i.status === 'scheduled' && i.scheduledAt);
      return {
        application: {
          code: application.code,
          jobTitle: application.jobTitle,
          status: application.status,
          statusTitle: st.title,
          statusColor: st.color,
          statusDescription: st.description,
          submittedAt: application.submittedAt || application.createdAt,
          assessmentStatus: application.assessment ? application.assessment.status : null,
          nextInterview: upcoming.length ? { at: upcoming[0].scheduledAt, type: upcoming[0].type, mode: upcoming[0].mode, location: application.interviews[0].location || '' } : null,
          timeline: publicTimeline
        }
      };
    });

    // ---------------------------------------------------------------- مدیریت متقاضیان (پنل)
    api.get('/portal/applicants', { perm: 'portal.applicants', module: 'portal' }, (ctx) => {
      let rows = ctx.col('applicants').all().map((a) => {
        const apps = ctx.col('applications').filter((x) => x.applicantId === a.id);
        return {
          id: a.id, name: a.name, mobile: a.mobile, source: a.source,
          verifiedAt: a.verifiedAt, createdAt: a.createdAt,
          applications: apps.length,
          submitted: apps.filter((x) => x.status !== 'draft').length,
          lastActivityAt: a.lastLoginAt || a.updatedAt
        };
      });
      const { q } = ctx.query;
      if (q) {
        const n = String(q).toLowerCase();
        rows = rows.filter((r) => [r.name, r.mobile].join(' ').toLowerCase().includes(n));
      }
      rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return { rows, total: rows.length };
    });
  }
};

// ------------------------------------------------------------------ توابع کمکی

function publicSettings(app) {
  const p = app.config.get('publicPortal', {});
  return {
    pageTitle: p.pageTitle,
    welcomeText: p.welcomeText,
    aboutCompany: p.aboutCompany,
    showSalary: p.showSalary !== false,
    showApplyCount: !!p.showApplyCount,
    allowResumeUpload: p.allowResumeUpload !== false,
    maxFileSizeMB: Number(p.maxFileSizeMB || 5),
    contactEmail: p.contactEmail,
    contactPhone: p.contactPhone,
    address: p.address,
    addressMapUrl: p.addressMapUrl,
    socials: p.socials || {},
    footerText: p.footerText,
    careersEnabled: p.careersEnabled !== false
  };
}

function publicJobs(app, filter = {}) {
  let jobs = app.db.col('jobs').all().filter((j) => j.status === 'open' && j.showInPortal !== false);
  if (filter.department) jobs = jobs.filter((j) => j.department === filter.department);
  if (filter.type) jobs = jobs.filter((j) => j.type === filter.type);
  if (filter.q) {
    const n = String(filter.q).toLowerCase();
    jobs = jobs.filter((j) => [j.title, j.department, j.location, (j.tags || []).join(' '), j.summary, j.description].join(' ').toLowerCase().includes(n));
  }
  return jobs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function compactJob(job) {
  const hoursAgo = Math.round((Date.now() - new Date(job.createdAt).getTime()) / 3600000);
  return {
    id: job.id,
    title: job.title,
    slug: job.slug,
    department: job.department,
    location: job.location,
    type: job.type,
    level: job.level,
    openings: job.openings || 1,
    salaryRange: job.salaryRange,
    summary: job.summary,
    description: job.description,
    requirements: job.requirements || [],
    responsibilities: job.responsibilities || [],
    tags: job.tags || [],
    deadline: job.deadline || null,
    assessmentEnabled: !!(job.assessment && job.assessment.mbti && job.assessment.mbti.enabled),
    assessmentRequired: !!(job.assessment && job.assessment.mbti && job.assessment.mbti.required),
    isNew: hoursAgo < 72,
    createdAt: job.createdAt
  };
}

function computeCompleteness(schema, answers = {}) {
  let total = 0;
  let filled = 0;
  for (const step of schema.steps || []) {
    const values = answers[step.key] || {};
    for (const field of step.fields || []) {
      if (['heading', 'note'].includes(field.type) || field.hiddenInWizard) continue;
      total++;
      const v = values[field.name];
      if (v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)) filled++;
    }
  }
  return { total, filled, percent: total ? Math.round((filled / total) * 100) : 0 };
}

function nextApplicationCode(ctx) {
  const year = jalali.jalaaliParts(new Date()).year;
  const col = ctx.col('applications');
  const prefix = ctx.modules.s('recruitment', 'codePrefix', 'APL');
  const count = col.filter((a) => a.code && String(a.code).includes(`-${year}-`)).length + 1;
  let code = `${prefix}-${year}-${String(count).padStart(4, '0')}`;
  let i = count;
  while (col.find((a) => a.code === code)) {
    i++;
    code = `${prefix}-${year}-${String(i).padStart(4, '0')}`;
  }
  return code;
}
