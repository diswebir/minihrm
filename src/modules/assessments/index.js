/**
 * ماژول آزمون شخصیت‌شناسی (MBTI) و تحلیل روان‌سنجی
 * ------------------------------------------------------------------
 * نتیجه آزمون فقط برای کارمند منابع انسانی و مدیران نمایش داده می‌شود
 * و به خود متقاضی نشان داده نمی‌شود (قابل تغییر در تنظیمات).
 */
'use strict';

const utils = require('../../core/utils');
const mbti = require('../../core/mbtiAnalysis');
const csv = require('../../core/csv');
const { paginate, sortRows, fullName, mobile } = require('../../core/domain');

module.exports = {
  key: 'assessments',
  title: 'آزمون شخصیت‌شناسی',
  description: 'آزمون MBTI با نمره‌گذاری و تحلیل جامع روان‌سنجی، محاسبه تناسب شغلی و گزارش‌های تحلیلی.',
  icon: 'brain',
  order: 50,
  depends: ['recruitment'],
  defaultEnabled: true,

  permissions: [
    { key: 'assessments.view', title: 'مشاهده نتایج آزمون‌ها', group: 'آزمون شخصیت' },
    { key: 'assessments.review', title: 'ثبت تفسیر و یادداشت منابع انسانی', group: 'آزمون شخصیت' },
    { key: 'assessments.manage', title: 'مدیریت سؤالات و تنظیمات آزمون', group: 'آزمون شخصیت' },
    { key: 'assessments.export', title: 'خروجی گرفتن از نتایج آزمون', group: 'آزمون شخصیت' }
  ],

  settings: [
    { key: 'testTitle', title: 'عنوان آزمون (نمایش به متقاضی)', type: 'text', default: 'آزمون شناخت سبک کاری و شخصیتی', help: 'بهتر است عنوان فنی MBTI به متقاضی نمایش داده نشود.' },
    { key: 'testIntro', title: 'متن معرفی آزمون', type: 'text', default: 'در هر سؤال گزینه‌ای را انتخاب کنید که اغلب رفتار شما را بهتر توصیف می‌کند. پاسخ درست یا غلط وجود ندارد؛ صادقانه پاسخ دهید.', help: '' },
    { key: 'showResultToApplicant', title: 'نمایش نتیجه به متقاضی', type: 'bool', default: false, help: 'پیش‌فرض: نتیجه فقط برای منابع انسانی و مدیران نمایش داده می‌شود.' },
    { key: 'allowRetake', title: 'اجازه تکرار آزمون', type: 'bool', default: false },
    { key: 'retakeDays', title: 'فاصله مجاز تکرار آزمون (روز)', type: 'number', default: 30 },
    { key: 'requireAll', title: 'الزام پاسخ به همه سؤالات', type: 'bool', default: true },
    { key: 'sendSmsOnComplete', title: 'ارسال پیامک پس از تکمیل آزمون', type: 'bool', default: false },
    { key: 'autoInvite', title: 'دعوت خودکار متقاضیان جدید به آزمون', type: 'bool', default: false }
  ],

  nav: [
    { path: '/assessments', title: 'آزمون‌های شخصیت', icon: 'brain', perm: 'assessments.view', order: 30 },
    { path: '/assessments/analytics', title: 'تحلیل آزمون‌ها', icon: 'pie-chart', perm: 'assessments.view', order: 31 },
    { path: '/assessments/questions', title: 'سؤالات آزمون', icon: 'list-checks', perm: 'assessments.manage', order: 32 }
  ],

  install(app) {
    // نسخه‌گذاری بانک سؤالات (سؤالات از فایل اصلی استخراج شده‌اند)
    const meta = app.db.col('mbti_meta');
    if (!meta.all().length) {
      meta.insert({
        key: 'seed',
        source: 'آزمون روانشناسی شخصیتی.docx — OF-FR-05-00',
        total: mbti.TOTAL,
        pairs: mbti.PAIRS.map((p) => `${p.a}/${p.b}`),
        seededAt: new Date().toISOString()
      });
    }
    return { questions: mbti.TOTAL, profiles: Object.keys(mbti.PROFILES).length };
  },

  api(api, app) {
    const modules = app.modules;

    const resultOut = (r, ctx) => {
      const application = r.applicationId ? ctx.col('applications').byId(r.applicationId) : null;
      return {
        id: r.id,
        applicationId: r.applicationId,
        applicantName: application ? fullName(application) : r.applicantName,
        jobTitle: application ? application.jobTitle : (r.jobTitle || ''),
        jobId: application ? application.jobId : r.jobId,
        mobile: application ? mobile(application) : r.mobile,
        type: r.type,
        profileName: r.profileName,
        group: r.group ? r.group.name : '',
        answered: r.answered,
        total: r.total,
        completeness: r.total ? Math.round((r.answered / r.total) * 100) : 0,
        borderline: r.borderline || [],
        confidence: r.confidence || null,
        fitScore: r.fitScore || null,
        fitLevel: r.fitLevel || null,
        status: r.status || 'completed',
        createdAt: r.createdAt,
        completedAt: r.completedAt || r.createdAt,
        hasHrNotes: !!(r.hrNotes && r.hrNotes.text),
        dimensions: (r.dimensions || []).map((d) => ({
          pair: d.pair, winnerKey: d.winnerKey, winnerLabel: d.winnerLabel,
          aScore: d.aScore, bScore: d.bScore, dominantPercent: d.dominantPercent,
          winnerColor: d.winnerColor, borderline: d.borderline
        }))
      };
    };

    // ---------------------------------------------------------- فهرست نتایج
    api.get('/assessments', { perm: 'assessments.view', module: 'assessments' }, (ctx) => {
      let rows = ctx.col('assessment_results').all().map((r) => resultOut(r, ctx));
      const { q, jobId, type, group, minFit, status } = ctx.query;
      if (q) {
        const n = String(q).toLowerCase();
        rows = rows.filter((r) => [r.applicantName, r.mobile, r.type, r.profileName, r.jobTitle].join(' ').toLowerCase().includes(n));
      }
      if (jobId) rows = rows.filter((r) => r.jobId === jobId);
      if (type) rows = rows.filter((r) => r.type === type);
      if (group) rows = rows.filter((r) => r.group === group);
      if (status) rows = rows.filter((r) => r.status === status);
      if (minFit) rows = rows.filter((r) => (r.fitScore || 0) >= Number(minFit));

      rows = sortRows(rows, ctx.query.sortBy || 'completedAt', ctx.query.dir || 'desc', ['completedAt', 'applicantName', 'type', 'fitScore', 'completeness']);
      const paged = paginate(rows, ctx.query, 20);

      const all = rows;
      const distribution = {};
      for (const r of all) if (r.type) distribution[r.type] = (distribution[r.type] || 0) + 1;

      return {
        ...paged,
        stats: {
          total: all.length,
          completed: all.filter((r) => r.status === 'completed').length,
          avgFit: all.filter((r) => r.fitScore).length ? Math.round(all.reduce((s, r) => s + (r.fitScore || 0), 0) / all.filter((r) => r.fitScore).length) : null,
          borderlineCount: all.filter((r) => (r.borderline || []).length >= 2).length,
          types: Object.keys(distribution).length
        },
        distribution,
        groupDistribution: all.reduce((acc, r) => { if (r.group) acc[r.group] = (acc[r.group] || 0) + 1; return acc; }, {}),
        jobs: ctx.col('jobs').all().map((j) => ({ id: j.id, title: j.title })),
        profileList: Object.values(mbti.PROFILES).map((p) => ({ code: p.code, name: p.name, group: p.group, tagline: p.tagline })),
        groups: Object.values(mbti.GROUPS)
      };
    });

    // ---------------------------------------------------------- گزارش کامل یک نتیجه
    api.get('/assessments/:id', { perm: 'assessments.view', module: 'assessments' }, (ctx) => {
      const result = ctx.col('assessment_results').byId(ctx.params.id);
      if (!result) ctx.notFound('نتیجه آزمون یافت نشد');
      const application = result.applicationId ? ctx.col('applications').byId(result.applicationId) : null;
      const job = application && application.jobId ? ctx.col('jobs').byId(application.jobId) : (result.jobId ? ctx.col('jobs').byId(result.jobId) : null);
      const profile = result.type ? mbti.PROFILES[result.type] : null;
      const insight = {
        profile: profile ? mbti.PROFILES[profile.code] : null,
        dimensions: (result.dimensions || []).map((d) => Object.assign({}, d, {
          winnerInsight: mbti.DIMENSION_INSIGHTS[d.winnerKey],
          loserInsight: mbti.DIMENSION_INSIGHTS[d.loserKey]
        })),
        guidelines: mbti.REPORT_GUIDELINES,
        group: profile ? mbti.GROUPS[profile.group] : null
      };
      return {
        result: resultOut(result, ctx),
        full: result,
        insight,
        application: application ? {
          id: application.id, code: application.code, name: fullName(application),
          mobile: mobile(application), jobTitle: application.jobTitle, status: application.status
        } : null,
        job: job ? { id: job.id, title: job.title, idealTypes: job.idealTypes || [] } : null,
        jobFit: job ? mbti.jobFit({ ...result }, job) : null,
        hrNotes: result.hrNotes || null,
        otherResults: application
          ? ctx.col('assessment_results').filter((r) => r.applicationId === application.id && r.id !== result.id).map((r) => ({ id: r.id, type: r.type, completedAt: r.completedAt || r.createdAt }))
          : []
      };
    });

    /** ثبت تفسیر منابع انسانی روی نتیجه آزمون */
    api.put('/assessments/:id/notes', { perm: 'assessments.review', module: 'assessments' }, (ctx) => {
      const result = ctx.col('assessment_results').byId(ctx.params.id);
      if (!result) ctx.notFound('نتیجه آزمون یافت نشد');
      const hrNotes = {
        text: utils.cleanText(ctx.body.text, 4000),
        fitJudgement: ['عالی', 'مناسب', 'مشروط', 'نامناسب'].includes(ctx.body.fitJudgement) ? ctx.body.fitJudgement : null,
        byId: ctx.user.id,
        byName: ctx.user.name,
        at: new Date().toISOString()
      };
      const updated = ctx.col('assessment_results').update(result.id, { hrNotes });
      if (result.applicationId) {
        const application = ctx.col('applications').byId(result.applicationId);
        if (application) {
          ctx.col('applications').update(application.id, {
            timeline: (application.timeline || []).concat([{
              at: new Date().toISOString(), actorId: ctx.user.id, actorName: ctx.user.name,
              type: 'assessment', title: `ثبت تفسیر منابع انسانی روی نتیجه آزمون (${result.type})`
            }])
          });
        }
      }
      ctx.log('assessment.notes', `ثبت تفسیر منابع انسانی برای نتیجه ${result.type}`, { entity: 'assessment', entityId: result.id });
      return { hrNotes };
    });

    api.delete('/assessments/:id', { perm: 'assessments.manage', module: 'assessments' }, (ctx) => {
      const result = ctx.col('assessment_results').byId(ctx.params.id);
      if (!result) ctx.notFound('نتیجه آزمون یافت نشد');
      ctx.col('assessment_results').remove(result.id);
      ctx.log('assessment.delete', `حذف نتیجه آزمون ${result.type || ''}`, { entity: 'assessment', entityId: result.id, level: 'warn' });
      return { deleted: true };
    });

    /** ورود دستی نتیجه آزمون کاغذی توسط منابع انسانی */
    api.post('/assessments/manual', { perm: 'assessments.manage', module: 'assessments' }, (ctx) => {
      const { applicationId, answers, applicantName, mobile: mob } = ctx.body;
      let application = applicationId ? ctx.col('applications').byId(applicationId) : null;
      if (!application) ctx.fail('پرونده متقاضی یافت نشد');
      const job = application.jobId ? ctx.col('jobs').byId(application.jobId) : null;
      const analysis = mbti.analyze(app, answers || {}, job);
      if (!analysis.type) ctx.fail('پاسخ‌های وارد‌شده برای تعیین تیپ کافی نیست');
      const record = ctx.col('assessment_results').insert({
        applicationId: application.id,
        jobId: application.jobId,
        source: 'manual',
        type: analysis.type,
        profileName: analysis.profileName,
        group: analysis.group,
        scores: analysis.scores,
        dimensions: analysis.dimensions,
        answered: analysis.answered,
        total: analysis.total,
        borderline: analysis.borderline,
        confidence: analysis.confidence,
        fitScore: analysis.jobFit ? analysis.jobFit.score : null,
        fitLevel: analysis.jobFit ? analysis.jobFit.level : null,
        status: 'completed',
        completedAt: new Date().toISOString(),
        enteredBy: ctx.user.id,
        enteredByName: ctx.user.name
      });
      ctx.col('applications').update(application.id, {
        assessment: Object.assign({}, application.assessment || {}, { status: 'completed', resultId: record.id, type: 'mbti' }),
        timeline: (application.timeline || []).concat([{
          at: new Date().toISOString(), actorId: ctx.user.id, actorName: ctx.user.name,
          type: 'assessment', title: `ثبت دستی نتیجه آزمون شخصیت (${analysis.type}) توسط منابع انسانی`
        }])
      });
      ctx.log('assessment.manual', `ثبت دستی نتیجه آزمون برای «${fullName(application)}» (${analysis.type})`, { entity: 'assessment', entityId: record.id });
      return { result: resultOut(record, ctx) };
    });

    // ---------------------------------------------------------- سؤالات
    api.get('/assessments/questions/bank', { perm: 'assessments.view', module: 'assessments' }, (ctx) => {
      return {
        questions: mbti.allQuestions(app),
        pairs: mbti.PAIRS,
        dimensions: mbti.DIMENSIONS,
        total: mbti.TOTAL,
        settings: modules.settings('assessments'),
        meta: ctx.col('mbti_meta').all()
      };
    });

    api.put('/assessments/questions/:no', { perm: 'assessments.manage', module: 'assessments' }, (ctx) => {
      const no = Number(ctx.params.no);
      const q = mbti.SEED_QUESTIONS.find((x) => x.no === no);
      if (!q) ctx.notFound('سؤال یافت نشد');
      const col = ctx.col('mbti_questions');
      const patch = {
        no,
        text: utils.cleanText(ctx.body.text || q.text, 600),
        options: (ctx.body.options || q.options).map((o, i) => ({
          label: utils.cleanText((o && o.label) || q.options[i].label, 300),
          code: q.options[i].code
        })),
        active: ctx.body.active !== false,
        updatedBy: ctx.user.name,
        updatedAt: new Date().toISOString()
      };
      const existing = col.find((x) => Number(x.no) === no);
      const saved = existing ? col.update(existing.id, patch) : col.insert(patch);
      ctx.log('assessment.question_update', `ویرایش سؤال شماره ${no} آزمون شخصیت`, { entity: 'assessment_question', entityId: saved.id });
      return { question: saved };
    });

    api.post('/assessments/questions/reset', { perm: 'assessments.manage', module: 'assessments' }, (ctx) => {
      ctx.col('mbti_questions').removeWhere(() => true);
      ctx.log('assessment.question_reset', 'بازگردانی سؤالات آزمون به نسخه پیش‌فرض', { entity: 'assessment', level: 'warn' });
      return { questions: mbti.allQuestions(app) };
    });

    // ---------------------------------------------------------- تحلیل و آمار
    api.get('/assessments/analytics/overview', { perm: 'assessments.view', module: 'assessments' }, (ctx) => {
      const results = ctx.col('assessment_results').all();
      const applications = ctx.col('applications').all();

      const typeDist = {};
      const groupDist = {};
      const pairDist = {};
      for (const r of results) {
        if (!r.type) continue;
        typeDist[r.type] = (typeDist[r.type] || 0) + 1;
        const group = r.group && r.group.key ? r.group.key : (mbti.PROFILES[r.type] ? mbti.PROFILES[r.type].group : null);
        if (group) groupDist[group] = (groupDist[group] || 0) + 1;
        for (const d of r.dimensions || []) {
          pairDist[d.pair] = pairDist[d.pair] || { a: 0, b: 0, aKey: d.a, bKey: d.b };
          if (d.winnerKey === d.a) pairDist[d.pair].a++;
          else pairDist[d.pair].b++;
        }
      }

      const byJob = ctx.col('jobs').all().map((j) => {
        const list = results.filter((r) => r.jobId === j.id || (r.applicationId && (applications.find((a) => a.id === r.applicationId) || {}).jobId === j.id));
        const fits = list.map((r) => r.fitScore).filter((x) => typeof x === 'number');
        const dist = {};
        for (const r of list) if (r.type) dist[r.type] = (dist[r.type] || 0) + 1;
        return {
          jobId: j.id, title: j.title, idealTypes: j.idealTypes || [],
          total: list.length,
          avgFit: fits.length ? Math.round(fits.reduce((a, b) => a + b, 0) / fits.length) : null,
          highFit: fits.filter((f) => f >= 85).length,
          distribution: dist,
          topTypes: Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([type, count]) => ({ type, count }))
        };
      }).filter((j) => j.total > 0).sort((a, b) => b.total - a.total);

      // نرخ تبدیل آزمون‌داده‌ها به استخدام
      const withAssessment = applications.filter((a) => results.some((r) => r.applicationId === a.id));
      const hiredWithAssessment = withAssessment.filter((a) => a.status === 'hired');
      const allHired = applications.filter((a) => a.status === 'hired');

      return {
        totals: {
          results: results.length,
          uniqueApplicants: new Set(results.map((r) => r.applicationId)).size,
          types: Object.keys(typeDist).length,
          avgFit: (() => {
            const fits = results.map((r) => r.fitScore).filter((x) => typeof x === 'number');
            return fits.length ? Math.round(fits.reduce((a, b) => a + b, 0) / fits.length) : null;
          })(),
          assessmentToHireRate: withAssessment.length ? utils.percent(hiredWithAssessment.length, withAssessment.length) : 0,
          overallHireRate: applications.length ? utils.percent(allHired.length, applications.length) : 0
        },
        typeDistribution: Object.entries(typeDist).map(([type, count]) => ({
          type, count,
          name: mbti.PROFILES[type] ? mbti.PROFILES[type].name : '',
          group: mbti.PROFILES[type] ? mbti.PROFILES[type].group : '',
          color: mbti.PROFILES[type] ? mbti.GROUPS[mbti.PROFILES[type].group].color : 'sky'
        })).sort((a, b) => b.count - a.count),
        groupDistribution: Object.entries(groupDist).map(([key, count]) => Object.assign({}, mbti.GROUPS[key] || { key, name: key }, { count })),
        pairDistribution: Object.entries(pairDist).map(([pair, v]) => ({
          pair,
          a: { key: v.aKey, count: v.a, percent: utils.percent(v.a, v.a + v.b) },
          b: { key: v.bKey, count: v.b, percent: utils.percent(v.b, v.a + v.b) }
        })),
        byJob,
        recentResults: results.sort((a, b) => ((a.completedAt || a.createdAt) < (b.completedAt || b.createdAt) ? 1 : -1)).slice(0, 8).map((r) => resultOut(r, ctx)),
        profiles: Object.values(mbti.PROFILES).map((p) => ({
          code: p.code, name: p.name, group: p.group, tagline: p.tagline,
          summary: p.summary, idealRoles: p.idealRoles, roleClusters: p.roleClusters,
          strengths: p.strengths.slice(0, 4), weaknesses: p.weaknesses.slice(0, 3)
        }))
      };
    });

    api.get('/assessments/export/csv', { perm: 'assessments.export', module: 'assessments' }, (ctx) => {
      const rows = ctx.col('assessment_results').all();
      const columns = [
        { key: 'applicant', title: 'متقاضی', get: (r) => {
          const a = r.applicationId ? ctx.col('applications').byId(r.applicationId) : null;
          return a ? fullName(a) : (r.applicantName || '');
        } },
        { key: 'job', title: 'موقعیت شغلی', get: (r) => {
          const a = r.applicationId ? ctx.col('applications').byId(r.applicationId) : null;
          return a ? a.jobTitle : '';
        } },
        { key: 'type', title: 'تیپ شخصیتی' },
        { key: 'profileName', title: 'عنوان تیپ' },
        { key: 'E', title: 'E', get: (r) => (r.scores || {}).E || 0 },
        { key: 'I', title: 'I', get: (r) => (r.scores || {}).I || 0 },
        { key: 'S', title: 'S', get: (r) => (r.scores || {}).S || 0 },
        { key: 'N', title: 'N', get: (r) => (r.scores || {}).N || 0 },
        { key: 'T', title: 'T', get: (r) => (r.scores || {}).T || 0 },
        { key: 'F', title: 'F', get: (r) => (r.scores || {}).F || 0 },
        { key: 'J', title: 'J', get: (r) => (r.scores || {}).J || 0 },
        { key: 'P', title: 'P', get: (r) => (r.scores || {}).P || 0 },
        { key: 'fit', title: 'تناسب شغلی', get: (r) => r.fitScore || '' },
        { key: 'fitLevel', title: 'سطح تناسب' },
        { key: 'borderline', title: 'ابعاد مرزی', get: (r) => (r.borderline || []).join('، ') },
        { key: 'answered', title: 'تعداد پاسخ' },
        { key: 'date', title: 'تاریخ', get: (r) => require('../../core/jalali').formatJalaliTime(r.completedAt || r.createdAt) },
        { key: 'hrNotes', title: 'تفسیر منابع انسانی', get: (r) => (r.hrNotes && r.hrNotes.text) || '' }
      ];
      ctx.log('assessment.export', `خروجی CSV از ${rows.length} نتیجه آزمون`, { entity: 'assessment' });
      ctx.req.__res.csv(csv.toCSV(rows, columns), `assessments-${new Date().toISOString().slice(0, 10)}.csv`);
      return undefined;
    });
  }
};
