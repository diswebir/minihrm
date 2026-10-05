/**
 * ماژول مصاحبه‌ها — زمان‌بندی، بانک سؤالات، کارنامه امتیازدهی
 */
'use strict';

const utils = require('../../core/utils');
const mbti = require('../../core/mbtiAnalysis');
const seed = require('../../core/seed/interviewQuestions');
const { paginate, sortRows, fullName, mobile, timelineEvent, statusInfo, summary } = require('../../core/domain');

module.exports = {
  key: 'interviews',
  title: 'مصاحبه‌ها',
  description: 'زمان‌بندی مصاحبه، بانک سؤالات ساختارمند، کارنامه امتیازدهی و جمع‌بندی نظر مصاحبه‌کنندگان.',
  icon: 'message-circle',
  order: 60,
  depends: ['recruitment'],
  defaultEnabled: true,

  permissions: [
    { key: 'interviews.view', title: 'مشاهده مصاحبه‌ها', group: 'مصاحبه‌ها' },
    { key: 'interviews.schedule', title: 'زمان‌بندی و ویرایش مصاحبه', group: 'مصاحبه‌ها' },
    { key: 'interviews.score', title: 'ثبت امتیاز و کارنامه مصاحبه', group: 'مصاحبه‌ها' },
    { key: 'interviews.manage', title: 'مدیریت بانک سؤالات و تنظیمات', group: 'مصاحبه‌ها' }
  ],

  settings: [
    { key: 'defaultDuration', title: 'مدت پیش‌فرض مصاحبه (دقیقه)', type: 'number', default: 45 },
    { key: 'defaultMode', title: 'شیوه پیش‌فرض', type: 'select', default: 'حضوری', options: [
      { value: 'حضوری', label: 'حضوری' },
      { value: 'آنلاین', label: 'آنلاین (ویدیویی)' },
      { value: 'تلفنی', label: 'تلفنی' }
    ] },
    { key: 'autoSmsInvite', title: 'ارسال پیامک دعوت به مصاحبه به‌صورت خودکار', type: 'bool', default: true },
    { key: 'reminderHours', title: 'یادآوری چند ساعت قبل از مصاحبه', type: 'number', default: 24 },
    { key: 'requireScorecard', title: 'کارنامه امتیازدهی الزامی باشد', type: 'bool', default: true },
    { key: 'autoSuggestQuestions', title: 'پیشنهاد خودکار سؤال بر اساس موقعیت و تیپ شخصیتی', type: 'bool', default: true }
  ],

  nav: [
    { path: '/interviews', title: 'مصاحبه‌ها', icon: 'message-circle', perm: 'interviews.view', order: 35 },
    { path: '/interview-questions', title: 'بانک سؤالات مصاحبه', icon: 'help-circle', perm: 'interviews.manage', order: 36 }
  ],

  install(app) {
    const col = app.db.col('interview_questions');
    if (!col.count()) {
      col.insertMany(seed.QUESTIONS.map((q) => Object.assign({}, q, { system: true, active: true })));
    }
    const meta = app.db.col('interviews_meta');
    if (!meta.all().length) {
      meta.insert({
        key: 'seed',
        source: 'بانک سؤالات استاندارد مصاحبه استخدامی',
        categories: seed.CATEGORIES.map((c) => c.key),
        seededAt: new Date().toISOString()
      });
    }
    return { questions: col.count(), categories: seed.CATEGORIES.length };
  },

  api(api, app) {
    const modules = app.modules;
    const domain = require('../../core/domain');

    // ---------------------------------------------------------- مصاحبه‌ها
    api.get('/interviews', { perm: 'interviews.view', module: 'interviews' }, (ctx) => {
      const users = ctx.col('users').all();
      let rows = ctx.col('interviews').all().map((i) => interviewOut(i, ctx));
      const { q, status, from, to, interviewerId, jobId, mode, scope } = ctx.query;
      if (q) {
        const n = String(q).toLowerCase();
        rows = rows.filter((r) => [r.applicantName, r.jobTitle, r.type, r.location].join(' ').toLowerCase().includes(n));
      }
      if (status) rows = rows.filter((r) => r.status === status);
      if (mode) rows = rows.filter((r) => r.mode === mode);
      if (interviewerId) rows = rows.filter((r) => (r.interviewerIds || []).includes(interviewerId) || r.interviewerId === interviewerId);
      if (jobId) rows = rows.filter((r) => r.jobId === jobId);
      if (from) rows = rows.filter((r) => new Date(r.scheduledAt) >= new Date(from));
      if (to) rows = rows.filter((r) => new Date(r.scheduledAt) <= new Date(new Date(to).getTime() + 86400000));
      if (scope === 'upcoming') rows = rows.filter((r) => r.status === 'scheduled' && new Date(r.scheduledAt) >= new Date());
      if (scope === 'past') rows = rows.filter((r) => r.status !== 'scheduled' || new Date(r.scheduledAt) < new Date());

      rows = sortRows(rows, ctx.query.sortBy || 'scheduledAt', ctx.query.dir || (scope === 'past' ? 'desc' : 'asc'), ['scheduledAt', 'createdAt', 'applicantName', 'status']);
      const paged = paginate(rows, ctx.query, 20);

      const all = ctx.col('interviews').all();
      return {
        ...paged,
        stats: {
          total: all.length,
          scheduled: all.filter((i) => i.status === 'scheduled').length,
          today: all.filter((i) => i.status === 'scheduled' && new Date(i.scheduledAt).toDateString() === new Date().toDateString()).length,
          upcoming: all.filter((i) => i.status === 'scheduled' && new Date(i.scheduledAt) >= new Date()).length,
          completed: all.filter((i) => i.status === 'completed').length,
          canceled: all.filter((i) => i.status === 'canceled').length,
          avgScore: (() => {
            const scores = all.map((i) => i.scorecard && i.scorecard.total).filter((x) => typeof x === 'number');
            return scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
          })()
        },
        users: users.filter((u) => u.status === 'active').map((u) => ({ id: u.id, name: u.name, avatar: u.avatar || null })),
        jobs: ctx.col('jobs').all().map((j) => ({ id: j.id, title: j.title })),
        options: {
          modes: ['حضوری', 'آنلاین', 'تلفنی'],
          types: ['مصاحبه اولیه', 'مصاحبه فنی', 'مصاحبه منابع انسانی', 'مصاحبه مدیریتی', 'مصاحبه نهایی'],
          statuses: [
            { key: 'scheduled', title: 'زمان‌بندی‌شده', color: 'sky' },
            { key: 'completed', title: 'برگزارشده', color: 'mint' },
            { key: 'canceled', title: 'لغوشده', color: 'rose' },
            { key: 'no_show', title: 'عدم حضور', color: 'peach' }
          ],
          criteria: seed.CRITERIA,
          scoreScale: seed.SCORE_SCALE
        }
      };
    });

    api.post('/interviews', { perm: 'interviews.schedule', module: 'interviews' }, async (ctx) => {
      const b = ctx.body;
      const application = ctx.col('applications').byId(b.applicationId);
      if (!application) ctx.fail('پرونده متقاضی یافت نشد');
      if (!b.scheduledAt) ctx.fail('تاریخ و ساعت مصاحبه الزامی است');
      const interview = ctx.col('interviews').insert({
        applicationId: application.id,
        jobId: application.jobId || null,
        applicantName: fullName(application),
        applicantMobile: mobile(application),
        scheduledAt: new Date(b.scheduledAt).toISOString(),
        duration: Math.max(15, Number(b.duration) || Number(modules.s('interviews', 'defaultDuration', 45))),
        type: utils.cleanText(b.type, 80) || 'مصاحبه فنی',
        mode: utils.cleanText(b.mode, 40) || modules.s('interviews', 'defaultMode', 'حضوری'),
        location: utils.cleanText(b.location, 200),
        link: utils.cleanText(b.link, 300),
        interviewerIds: Array.isArray(b.interviewerIds) ? b.interviewerIds : (b.interviewerId ? [b.interviewerId] : []),
        questionIds: Array.isArray(b.questionIds) ? b.questionIds : [],
        notes: utils.cleanText(b.notes, 2000),
        status: 'scheduled',
        createdBy: ctx.user.id,
        createdByName: ctx.user.name
      });

      // افزودن به پرونده متقاضی
      const interviews = (application.interviews || []).concat([{
        id: interview.id, type: interview.type, scheduledAt: interview.scheduledAt,
        duration: interview.duration, mode: interview.mode, status: 'scheduled'
      }]);
      const patch = {
        interviews,
        timeline: (application.timeline || []).concat([
          timelineEvent(ctx.user, 'interview', `زمان‌بندی ${interview.type} برای ${require('../../core/jalali').formatJalaliTime(interview.scheduledAt)}`)
        ])
      };
      if (['new', 'screening', 'assessment'].includes(application.status)) {
        patch.status = 'interview';
        patch.timeline = patch.timeline.concat([timelineEvent(null, 'status', `تغییر وضعیت به «${statusInfo('interview').title}»`)]);
      }
      ctx.col('applications').update(application.id, patch);

      // پیامک دعوت
      if (b.sendSms !== false && modules.s('interviews', 'autoSmsInvite', true)) {
        const jalali = require('../../core/jalali');
        const result = await ctx.sms.sendTemplate({
          to: mobile(application),
          templateKey: 'interview',
          params: {
            name: fullName(application),
            job: application.jobTitle || '',
            date: jalali.formatJalali(interview.scheduledAt),
            time: `${String(new Date(interview.scheduledAt).getHours()).padStart(2, '0')}:${String(new Date(interview.scheduledAt).getMinutes()).padStart(2, '0')}`,
            company: ctx.config.get('app.companyName', ''),
            location: interview.location || interview.mode
          }
        });
        ctx.col('interviews').update(interview.id, { smsSent: result.ok, smsSimulated: !!result.simulated });
      }

      ctx.log('interview.create', `زمان‌بندی مصاحبه برای «${fullName(application)}»`, { entity: 'interview', entityId: interview.id });
      return { interview: interviewOut(ctx.col('interviews').byId(interview.id), ctx) };
    });

    api.get('/interviews/:id', { perm: 'interviews.view', module: 'interviews' }, (ctx) => {
      const interview = ctx.col('interviews').byId(ctx.params.id);
      if (!interview) ctx.notFound('مصاحبه یافت نشد');
      const application = ctx.col('applications').byId(interview.applicationId);
      const job = interview.jobId ? ctx.col('jobs').byId(interview.jobId) : null;
      const candidates = (interview.questionIds || []).map((id) => ctx.col('interview_questions').byId(id)).filter(Boolean);
      const assessments = application ? ctx.col('assessment_results').filter((r) => r.applicationId === application.id && r.status === 'completed') : [];
      const users = ctx.col('users').all();
      return {
        interview: interviewOut(interview, ctx),
        full: interview,
        application: application ? {
          id: application.id, code: application.code, name: fullName(application),
          mobile: mobile(application), jobTitle: application.jobTitle, status: application.status,
          answers: application.answers, rating: application.rating, tags: application.tags || []
        } : null,
        job: job ? { id: job.id, title: job.title, department: job.department, idealTypes: job.idealTypes || [] } : null,
        questions: candidates.map((q) => questionOut(q)),
        suggestedQuestions: suggestQuestions(ctx, application, interview),
        assessment: assessments.length ? { type: assessments[0].type, profileName: assessments[0].profileName, fitScore: assessments[0].fitScore, dimensions: assessments[0].dimensions, borderline: assessments[0].borderline } : null,
        interviewers: (interview.interviewerIds || []).map((id) => users.find((u) => u.id === id)).filter(Boolean).map((u) => ({ id: u.id, name: u.name, avatar: u.avatar })),
        criteria: seed.CRITERIA,
        scoreScale: seed.SCORE_SCALE,
        decisions: domain.DECISIONS
      };
    });

    api.put('/interviews/:id', { perm: 'interviews.schedule', module: 'interviews' }, (ctx) => {
      const interview = ctx.col('interviews').byId(ctx.params.id);
      if (!interview) ctx.notFound('مصاحبه یافت نشد');
      const patch = {};
      if (ctx.body.scheduledAt) patch.scheduledAt = new Date(ctx.body.scheduledAt).toISOString();
      if (ctx.body.duration !== undefined) patch.duration = Math.max(15, Number(ctx.body.duration) || 45);
      for (const f of ['type', 'mode', 'location', 'link', 'notes']) {
        if (ctx.body[f] !== undefined) patch[f] = utils.cleanText(ctx.body[f], 2000);
      }
      if (Array.isArray(ctx.body.interviewerIds)) patch.interviewerIds = ctx.body.interviewerIds;
      if (Array.isArray(ctx.body.questionIds)) patch.questionIds = ctx.body.questionIds;
      if (ctx.body.status !== undefined && ['scheduled', 'completed', 'canceled', 'no_show'].includes(ctx.body.status)) patch.status = ctx.body.status;
      const updated = ctx.col('interviews').update(interview.id, patch);
      syncApplicationInterview(ctx, updated);
      ctx.log('interview.update', `ویرایش مصاحبه «${updated.applicantName}»`, { entity: 'interview', entityId: interview.id });
      return { interview: interviewOut(updated, ctx) };
    });

    /** ثبت کارنامه امتیازدهی مصاحبه */
    api.post('/interviews/:id/score', { perm: 'interviews.score', module: 'interviews' }, (ctx) => {
      const interview = ctx.col('interviews').byId(ctx.params.id);
      if (!interview) ctx.notFound('مصاحبه یافت نشد');
      const b = ctx.body;
      const criteria = {};
      let weightedSum = 0;
      let weightTotal = 0;
      for (const c of seed.CRITERIA) {
        const raw = b.criteria && b.criteria[c.key];
        if (raw === undefined || raw === null || raw === '') continue;
        const value = Math.min(5, Math.max(1, Number(raw)));
        criteria[c.key] = value;
        weightedSum += value * c.weight;
        weightTotal += c.weight;
      }
      if (!weightTotal) ctx.fail('حداقل یک معیار امتیازدهی باید تکمیل شود');
      const total = Math.round((weightedSum / weightTotal) * 100) / 100;
      const percent = Math.round((total / 5) * 100);

      const questionScores = (b.questionScores || []).map((qs) => ({
        questionId: qs.questionId,
        question: qs.question || '',
        score: Math.min(5, Math.max(1, Number(qs.score) || 3)),
        note: utils.cleanText(qs.note, 800)
      }));

      const scorecard = {
        criteria,
        weightTotal,
        total,
        percent,
        level: percent >= 85 ? 'عالی' : percent >= 70 ? 'خوب' : percent >= 55 ? 'قابل بررسی' : 'ضعیف',
        questionScores,
        strengths: utils.cleanText(b.strengths, 2000),
        weaknesses: utils.cleanText(b.weaknesses, 2000),
        summary: utils.cleanText(b.summary, 4000),
        decision: ['approve', 'review', 'reject'].includes(b.decision) ? b.decision : 'review',
        decisionTitle: (domain.DECISIONS.find((d) => d.key === (b.decision || 'review')) || {}).title,
        interviewerName: ctx.user.name,
        interviewerId: ctx.user.id,
        at: new Date().toISOString()
      };

      const updated = ctx.col('interviews').update(interview.id, { scorecard, status: 'completed' });
      syncApplicationInterview(ctx, updated);

      // ثبت به‌عنوان نظر مصاحبه‌کننده در پرونده
      const application = ctx.col('applications').byId(interview.applicationId);
      if (application) {
        const evaluations = Object.assign({}, application.evaluations || {});
        evaluations.interviewer = {
          role: 'interviewer',
          text: scorecard.summary || scorecard.strengths,
          decision: scorecard.decision,
          decisionTitle: scorecard.decisionTitle,
          byId: ctx.user.id, byName: ctx.user.name, at: new Date().toISOString(),
          score: percent
        };
        const patch = {
          evaluations,
          timeline: (application.timeline || []).concat([
            timelineEvent(ctx.user, 'interview', `ثبت کارنامه مصاحبه «${interview.type}» — امتیاز ${percent}٪ (${scorecard.level})`)
          ])
        };
        if (evaluations.interviewer && evaluations.hr && evaluations.manager && ['new', 'screening', 'assessment', 'interview'].includes(application.status)) {
          patch.status = 'evaluation';
        }
        ctx.col('applications').update(application.id, patch);
      }

      ctx.log('interview.score', `ثبت کارنامه مصاحبه «${interview.applicantName}» — ${percent}٪`, { entity: 'interview', entityId: interview.id });
      return { scorecard, interview: interviewOut(updated, ctx) };
    });

    api.delete('/interviews/:id', { perm: 'interviews.schedule', module: 'interviews' }, (ctx) => {
      const interview = ctx.col('interviews').byId(ctx.params.id);
      if (!interview) ctx.notFound('مصاحبه یافت نشد');
      ctx.col('interviews').remove(interview.id);
      const application = ctx.col('applications').byId(interview.applicationId);
      if (application) {
        ctx.col('applications').update(application.id, {
          interviews: (application.interviews || []).filter((i) => i.id !== interview.id),
          timeline: (application.timeline || []).concat([timelineEvent(ctx.user, 'interview', 'حذف مصاحبه از پرونده')])
        });
      }
      ctx.log('interview.delete', `حذف مصاحبه «${interview.applicantName}»`, { entity: 'interview', entityId: interview.id, level: 'warn' });
      return { deleted: true };
    });

    /** پیشنهاد سؤال بر اساس پرونده و تیپ شخصیتی */
    api.get('/interviews/suggest/:applicationId', { perm: 'interviews.view', module: 'interviews' }, (ctx) => {
      const application = ctx.col('applications').byId(ctx.params.applicationId);
      if (!application) ctx.notFound('پرونده یافت نشد');
      return { suggestions: suggestQuestions(ctx, application, null), application: { id: application.id, name: fullName(application), jobTitle: application.jobTitle } };
    });

    // ---------------------------------------------------------- بانک سؤالات
    api.get('/interview-questions', { perm: 'interviews.view', module: 'interviews' }, (ctx) => {
      let rows = ctx.col('interview_questions').all().map(questionOut);
      const { q, category, type, active } = ctx.query;
      if (q) {
        const n = String(q).toLowerCase();
        rows = rows.filter((r) => [r.question, r.purpose, r.code].join(' ').toLowerCase().includes(n));
      }
      if (category) rows = rows.filter((r) => r.category === category);
      if (type) rows = rows.filter((r) => r.type === type);
      if (active === '1') rows = rows.filter((r) => r.active);
      const stats = {
        total: rows.length,
        byCategory: seed.CATEGORIES.map((c) => ({ ...c, count: rows.filter((r) => r.category === c.key).length })),
        custom: rows.filter((r) => !r.system).length
      };
      return { rows: sortRows(rows, ctx.query.sortBy || 'code', ctx.query.dir || 'asc', ['code', 'category']), stats, categories: seed.CATEGORIES, options: { types: Array.from(new Set(seed.QUESTIONS.map((q2) => q2.type))) } };
    });

    api.post('/interview-questions', { perm: 'interviews.manage', module: 'interviews' }, (ctx) => {
      const b = ctx.body;
      if (!utils.cleanText(b.question)) ctx.fail('متن سؤال الزامی است');
      const question = ctx.col('interview_questions').insert({
        code: utils.cleanText(b.code, 30) || `CUS-${Date.now().toString(36).toUpperCase()}`,
        category: utils.cleanText(b.category, 40) || 'experience',
        type: utils.cleanText(b.type, 60) || 'عمومی',
        question: utils.cleanText(b.question, 800),
        purpose: utils.cleanText(b.purpose, 500),
        goodSignals: (b.goodSignals || []).map((x) => utils.cleanText(x, 200)).filter(Boolean),
        redFlags: (b.redFlags || []).map((x) => utils.cleanText(x, 200)).filter(Boolean),
        weight: Math.min(5, Math.max(1, Number(b.weight) || 3)),
        system: false,
        active: b.active !== false,
        createdBy: ctx.user.name
      });
      ctx.log('interview_question.create', 'افزودن سؤال مصاحبه جدید', { entity: 'interview_question', entityId: question.id });
      return { question: questionOut(question) };
    });

    api.put('/interview-questions/:id', { perm: 'interviews.manage', module: 'interviews' }, (ctx) => {
      const q = ctx.col('interview_questions').byId(ctx.params.id);
      if (!q) ctx.notFound('سؤال یافت نشد');
      const b = ctx.body;
      const patch = {};
      for (const f of ['question', 'purpose', 'type', 'category', 'code']) if (b[f] !== undefined) patch[f] = utils.cleanText(b[f], 800);
      if (b.weight !== undefined) patch.weight = Math.min(5, Math.max(1, Number(b.weight) || 3));
      if (b.active !== undefined) patch.active = !!b.active;
      if (Array.isArray(b.goodSignals)) patch.goodSignals = b.goodSignals.map((x) => utils.cleanText(x, 200)).filter(Boolean);
      if (Array.isArray(b.redFlags)) patch.redFlags = b.redFlags.map((x) => utils.cleanText(x, 200)).filter(Boolean);
      const updated = ctx.col('interview_questions').update(q.id, patch);
      ctx.log('interview_question.update', 'ویرایش سؤال مصاحبه', { entity: 'interview_question', entityId: q.id });
      return { question: questionOut(updated) };
    });

    api.delete('/interview-questions/:id', { perm: 'interviews.manage', module: 'interviews' }, (ctx) => {
      const q = ctx.col('interview_questions').byId(ctx.params.id);
      if (!q) ctx.notFound('سؤال یافت نشد');
      ctx.col('interview_questions').remove(q.id);
      ctx.log('interview_question.delete', 'حذف سؤال مصاحبه', { entity: 'interview_question', entityId: q.id, level: 'warn' });
      return { deleted: true };
    });

    api.post('/interview-questions/reset', { perm: 'interviews.manage', module: 'interviews' }, (ctx) => {
      ctx.col('interview_questions').removeWhere(() => true);
      ctx.col('interview_questions').insertMany(seed.QUESTIONS.map((q) => Object.assign({}, q, { system: true, active: true })));
      ctx.log('interview_question.reset', 'بازگردانی بانک سؤالات مصاحبه به نسخه پیش‌فرض', { entity: 'interview_question', level: 'warn' });
      return { questions: ctx.col('interview_questions').count() };
    });
  }
};

// ------------------------------------------------------------------ کمکی

function interviewOut(i, ctx) {
  const users = ctx ? ctx.col('users').all() : [];
  const interviewers = (i.interviewerIds || []).map((id) => users.find((u) => u.id === id)).filter(Boolean).map((u) => ({ id: u.id, name: u.name, avatar: u.avatar || null }));
  const statuses = {
    scheduled: { title: 'زمان‌بندی‌شده', color: 'sky' },
    completed: { title: 'برگزارشده', color: 'mint' },
    canceled: { title: 'لغوشده', color: 'rose' },
    no_show: { title: 'عدم حضور', color: 'peach' }
  };
  return {
    id: i.id,
    applicationId: i.applicationId,
    applicantName: i.applicantName,
    applicantMobile: i.applicantMobile,
    jobId: i.jobId,
    jobTitle: i.jobTitle || (ctx && i.applicationId && ctx.col('applications').byId(i.applicationId) ? ctx.col('applications').byId(i.applicationId).jobTitle : ''),
    scheduledAt: i.scheduledAt,
    duration: i.duration,
    type: i.type,
    mode: i.mode,
    location: i.location,
    link: i.link,
    interviewerIds: i.interviewerIds || [],
    interviewers,
    questionCount: (i.questionIds || []).length,
    status: i.status || 'scheduled',
    statusTitle: (statuses[i.status] || statuses.scheduled).title,
    statusColor: (statuses[i.status] || statuses.scheduled).color,
    scorecard: i.scorecard || null,
    score: i.scorecard ? i.scorecard.percent : null,
    scoreLevel: i.scorecard ? i.scorecard.level : null,
    smsSent: i.smsSent || false,
    notes: i.notes || '',
    createdAt: i.createdAt,
    createdByName: i.createdByName || ''
  };
}

function questionOut(q) {
  return {
    id: q.id, code: q.code, category: q.category, type: q.type,
    question: q.question, purpose: q.purpose || '',
    goodSignals: q.goodSignals || [], redFlags: q.redFlags || [],
    weight: q.weight || 3, system: !!q.system, active: q.active !== false
  };
}

function suggestQuestions(ctx, application, interview) {
  const bank = ctx.col('interview_questions').all().filter((q) => q.active !== false);
  const picked = new Map();
  const add = (q, reason) => {
    if (!q || picked.has(q.id)) return;
    picked.set(q.id, Object.assign(questionOut(q), { reason }));
  };

  // ۱) سؤالات مرتبط با موقعیت شغلی (بر اساس نوع مصاحبه)
  const type = interview ? interview.type : 'مصاحبه فنی';
  const categoryMap = {
    'مصاحبه اولیه': ['experience', 'motivation', 'conditions'],
    'مصاحبه فنی': ['technical', 'problem', 'experience'],
    'مصاحبه منابع انسانی': ['behavioral', 'teamwork', 'integrity', 'conditions'],
    'مصاحبه مدیریتی': ['leadership', 'problem', 'motivation', 'integrity'],
    'مصاحبه نهایی': ['integrity', 'conditions', 'motivation', 'leadership']
  };
  for (const cat of (categoryMap[type] || ['experience', 'motivation'])) {
    for (const q of bank.filter((x) => x.category === cat).slice(0, 3)) add(q, `مرتبط با مرحله «${type}»`);
  }

  // ۲) سؤالات مبتنی بر تیپ شخصیتی متقاضی
  const result = ctx.col('assessment_results').find((r) => r.applicationId === application.id && r.status === 'completed');
  if (result && result.type && mbti.PROFILES[result.type]) {
    const probes = mbti.PROFILES[result.type].interviewProbes;
    const probeQuestions = [];
    probes.forEach((p, i) => {
      probeQuestions.push({
        id: `mbti-${result.type}-${i}`,
        code: `MBTI-${result.type}-${i + 1}`,
        category: 'personality',
        type: 'شخصیتی',
        question: p,
        purpose: `بررسی ترجیح رفتاری مرتبط با تیپ ${result.type} (${result.profileName})`,
        goodSignals: [], redFlags: [], weight: 4, system: true, active: true,
        virtual: true
      });
    });
    probeQuestions.forEach((q) => picked.set(q.id, Object.assign(q, { reason: `بر اساس تیپ شخصیتی ${result.type} — ${result.profileName}` })));
  }

  // ۳) سؤالات مسیر شغلی و پرریسک بر اساس تحلیل
  for (const q of bank.filter((x) => x.category === 'advancement').slice(0, 2)) add(q, 'بررسی مسیر رشد و یادگیری');
  for (const q of bank.filter((x) => x.weight >= 5 && ['integrity', 'motivation'].includes(x.category)).slice(0, 2)) add(q, 'سؤال کلیدی پرریسک');

  return Array.from(picked.values()).slice(0, 18);
}

function syncApplicationInterview(ctx, interview) {
  const application = ctx.col('applications').byId(interview.applicationId);
  if (!application) return;
  const interviews = (application.interviews || []).map((i) => (i.id === interview.id ? {
    id: interview.id, type: interview.type, scheduledAt: interview.scheduledAt,
    duration: interview.duration, mode: interview.mode, status: interview.status,
    score: interview.scorecard ? interview.scorecard.percent : null
  } : i));
  ctx.col('applications').update(application.id, { interviews });
}
