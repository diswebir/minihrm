/**
 * ماژول گزارش‌ها و تحلیل‌های مدیریتی
 */
'use strict';

const utils = require('../../core/utils');
const csv = require('../../core/csv');
const jalali = require('../../core/jalali');
const mbti = require('../../core/mbtiAnalysis');
const { APPLICATION_STATUSES, statusInfo, funnelStats, timeseries, fullName, mobile } = require('../../core/domain');

module.exports = {
  key: 'reports',
  title: 'گزارش‌ها و تحلیل',
  description: 'گزارش‌های تحلیلی جذب، قیف استخدام، عملکرد موقعیت‌های شغلی، تحلیل شخصیتی و بهره‌وری تیم منابع انسانی.',
  icon: 'bar-chart',
  order: 80,
  depends: ['recruitment'],
  defaultEnabled: true,

  permissions: [
    { key: 'reports.view', title: 'مشاهده گزارش‌ها', group: 'گزارش‌ها' },
    { key: 'reports.export', title: 'خروجی گرفتن از گزارش‌ها', group: 'گزارش‌ها' },
    { key: 'reports.hr_productivity', title: 'مشاهده گزارش عملکرد تیم منابع انسانی', group: 'گزارش‌ها' }
  ],

  settings: [
    { key: 'defaultRangeDays', title: 'بازه پیش‌فرض گزارش (روز)', type: 'number', default: 90 },
    { key: 'targetTimeToHire', title: 'هدف میانگین زمان جذب (روز)', type: 'number', default: 30 },
    { key: 'targetHireRate', title: 'هدف نرخ تبدیل به استخدام (٪)', type: 'number', default: 5 },
    { key: 'showSensitive', title: 'نمایش داده‌های حساس (حقوق و وضعیت خانوادگی) در گزارش', type: 'bool', default: false }
  ],

  nav: [
    { path: '/reports', title: 'گزارش‌ها', icon: 'bar-chart', perm: 'reports.view', order: 60 }
  ],

  api(api, app) {
    const modules = app.modules;

    api.get('/reports/overview', { perm: 'reports.view', module: 'reports' }, (ctx) => {
      const range = resolveRange(ctx.query, modules);
      const apps = filterByRange(ctx.col('applications').all(), range);
      const allApps = ctx.col('applications').all();
      const jobs = ctx.col('jobs').all();
      const results = ctx.col('assessment_results').all().filter((r) => !r.completedAt || (new Date(r.completedAt) >= range.from && new Date(r.completedAt) <= range.to));
      const interviews = ctx.col('interviews').all().filter((i) => new Date(i.createdAt) >= range.from && new Date(i.createdAt) <= range.to);

      const funnel = funnelStats(apps);
      const trend = timeseries(apps, { days: range.days });

      // مقایسه با بازه قبلی
      const prevRange = { from: new Date(range.from.getTime() - range.days * 86400000), to: new Date(range.from.getTime() - 1) };
      const prevApps = filterByRange(allApps, prevRange);
      const compare = {
        applications: { current: apps.length, previous: prevApps.length, delta: delta(apps.length, prevApps.length) },
        hires: { current: apps.filter((a) => a.status === 'hired').length, previous: prevApps.filter((a) => a.status === 'hired').length, delta: delta(apps.filter((a) => a.status === 'hired').length, prevApps.filter((a) => a.status === 'hired').length) }
      };

      // عملکرد موقعیت‌های شغلی
      const jobPerformance = jobs.map((j) => {
        const list = apps.filter((a) => a.jobId === j.id);
        const interviewed = list.filter((a) => (a.interviews || []).length);
        const hired = list.filter((a) => a.status === 'hired');
        const scores = list.map((a) => a.rating).filter(Boolean);
        return {
          id: j.id, title: j.title, department: j.department, status: j.status,
          openings: j.openings || 1,
          applications: list.length,
          interviewed: interviewed.length,
          hired: hired.length,
          conversionToInterview: utils.percent(interviewed.length, list.length, 1),
          conversionToHire: utils.percent(hired.length, list.length, 1),
          avgRating: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
          avgDaysToFill: hired.length ? Math.round(hired.reduce((sum, a) => sum + (new Date(a.hiredAt || a.updatedAt) - new Date(a.createdAt)) / 86400000, 0) / hired.length) : null
        };
      }).filter((j) => j.applications > 0 || j.status === 'open').sort((a, b) => b.applications - a.applications);

      // زمان جذب و کهنگی مراحل
      const hiredList = apps.filter((a) => a.status === 'hired' && (a.hiredAt || a.updatedAt));
      const avgTimeToHire = hiredList.length
        ? Math.round(hiredList.reduce((s, a) => s + (new Date(a.hiredAt || a.updatedAt) - new Date(a.createdAt)) / 86400000, 0) / hiredList.length)
        : null;
      const last14 = utils.addDays(new Date(), -14);
      const aging = apps
        .filter((a) => !['hired', 'rejected', 'withdrawn'].includes(a.status) && new Date(a.createdAt) < last14)
        .map((a) => ({
          id: a.id, code: a.code, name: fullName(a), jobTitle: a.jobTitle, status: a.status,
          statusTitle: statusInfo(a.status).title, days: Math.round((Date.now() - new Date(a.createdAt)) / 86400000)
        }))
        .sort((a, b) => b.days - a.days).slice(0, 20);

      // منابع جذب
      const sources = {};
      for (const a of apps) {
        const src = (a.answers && a.answers.aspirations && a.answers.aspirations.howFound) || 'نامشخص';
        sources[src] = (sources[src] || 0) + 1;
      }

      // تحلیل شخصیتی
      const typeDist = {};
      const groupDist = {};
      const fitBuckets = { 'بالا (۸۵+)': 0, 'خوب (۷۰-۸۴)': 0, 'متوسط (۵۵-۶۹)': 0, 'پایین (<۵۵)': 0 };
      for (const r of results) {
        if (r.type) {
          typeDist[r.type] = (typeDist[r.type] || 0) + 1;
          const g = mbti.PROFILES[r.type] ? mbti.PROFILES[r.type].group : null;
          if (g) groupDist[g] = (groupDist[g] || 0) + 1;
        }
        if (typeof r.fitScore === 'number') {
          if (r.fitScore >= 85) fitBuckets['بالا (۸۵+)']++;
          else if (r.fitScore >= 70) fitBuckets['خوب (۷۰-۸۴)']++;
          else if (r.fitScore >= 55) fitBuckets['متوسط (۵۵-۶۹)']++;
          else fitBuckets['پایین (<۵۵)']++;
        }
      }

      // مؤلفه‌های فرم (توزیع تحصیلات، نوع همکاری، وضعیت تأهل)
      const education = {};
      const cooperation = {};
      const marital = {};
      const military = {};
      const salaryList = [];
      for (const a of apps) {
        const edu = ((a.answers || {}).education || {}).education;
        if (Array.isArray(edu) && edu.length) {
          const top = pickTopDegree(edu);
          if (top) education[top] = (education[top] || 0) + 1;
        }
        const asp = (a.answers || {}).aspirations || {};
        for (const c of (Array.isArray(asp.cooperationType) ? asp.cooperationType : [asp.cooperationType]).filter(Boolean)) {
          cooperation[c] = (cooperation[c] || 0) + 1;
        }
        if (asp.expectedSalary) salaryList.push(Number(String(asp.expectedSalary).replace(/[^\d]/g, '')) || 0);
        const fam = (a.answers || {}).family || {};
        if (fam.maritalStatus) marital[fam.maritalStatus] = (marital[fam.maritalStatus] || 0) + 1;
        if (fam.militaryStatus) military[fam.militaryStatus] = (military[fam.militaryStatus] || 0) + 1;
      }

      // بهره‌وری تیم منابع انسانی (بر اساس لاگ حسابرسی)
      let productivity = null;
      if (ctx.can('reports.hr_productivity')) {
        const logs = ctx.col('audit_logs').all().filter((l) => l.at >= range.from.toISOString() && l.at <= range.to.toISOString());
        const users = ctx.col('users').all();
        const byUser = {};
        for (const l of logs) {
          if (!l.actorId) continue;
          byUser[l.actorId] = byUser[l.actorId] || { actions: 0, statusChanges: 0, notes: 0, evaluations: 0, sms: 0 };
          const bucket = byUser[l.actorId];
          bucket.actions++;
          if (l.action === 'application.status') bucket.statusChanges++;
          if (l.action === 'application.note') bucket.notes++;
          if (l.action === 'application.evaluation') bucket.evaluations++;
          if (l.action === 'sms.send') bucket.sms++;
        }
        productivity = Object.entries(byUser).map(([id, v]) => {
          const u = users.find((x) => x.id === id);
          return Object.assign({ userId: id, name: u ? u.name : 'کاربر حذف‌شده' }, v);
        }).sort((a, b) => b.actions - a.actions);
      }

      // مصاحبه‌ها
      const completedInterviews = interviews.filter((i) => i.status === 'completed');
      const interviewScores = completedInterviews.map((i) => i.scorecard && i.scorecard.percent).filter((x) => typeof x === 'number');

      return {
        range: { from: range.from.toISOString(), to: range.to.toISOString(), days: range.days, label: `${jalali.formatJalali(range.from)} تا ${jalali.formatJalali(range.to)}` },
        kpis: {
          applications: apps.length,
          activeApplications: apps.filter((a) => !['hired', 'rejected', 'withdrawn'].includes(a.status)).length,
          hires: funnel.reached.hired,
          rejected: apps.filter((a) => a.status === 'rejected').length,
          interviews: interviews.length,
          completedInterviews: completedInterviews.length,
          avgInterviewScore: interviewScores.length ? Math.round(interviewScores.reduce((a, b) => a + b, 0) / interviewScores.length) : null,
          assessments: results.length,
          avgFit: (() => { const f = results.map((r) => r.fitScore).filter((x) => typeof x === 'number'); return f.length ? Math.round(f.reduce((a, b) => a + b, 0) / f.length) : null; })(),
          avgTimeToHire,
          targetTimeToHire: Number(modules.s('reports', 'targetTimeToHire', 30)),
          hireRate: utils.percent(funnel.reached.hired, apps.length),
          targetHireRate: Number(modules.s('reports', 'targetHireRate', 5)),
          openJobs: jobs.filter((j) => j.status === 'open').length
        },
        compare,
        funnel,
        trend,
        jobPerformance,
        sources: Object.entries(sources).map(([name, count]) => ({ name, count, percent: utils.percent(count, apps.length) })).sort((a, b) => b.count - a.count),
        personality: {
          typeDistribution: Object.entries(typeDist).map(([type, count]) => ({
            type, count,
            name: mbti.PROFILES[type] ? mbti.PROFILES[type].name : '',
            group: mbti.PROFILES[type] ? mbti.PROFILES[type].group : '',
            color: mbti.PROFILES[type] ? mbti.GROUPS[mbti.PROFILES[type].group].color : 'sky'
          })).sort((a, b) => b.count - a.count),
          groupDistribution: Object.entries(groupDist).map(([key, count]) => Object.assign({}, mbti.GROUPS[key] || { key, name: key }, { count })),
          fitBuckets: Object.entries(fitBuckets).map(([label, count]) => ({ label, count })),
          total: results.length
        },
        demographics: {
          education: Object.entries(education).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
          cooperation: Object.entries(cooperation).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
          marital: modules.s('reports', 'showSensitive', false) ? Object.entries(marital).map(([label, count]) => ({ label, count })) : null,
          military: modules.s('reports', 'showSensitive', false) ? Object.entries(military).map(([label, count]) => ({ label, count })) : null,
          avgExpectedSalary: salaryList.length ? Math.round(salaryList.reduce((a, b) => a + b, 0) / salaryList.length) : null
        },
        aging,
        productivity,
        statuses: APPLICATION_STATUSES.map((s) => ({ key: s.key, title: s.title, color: s.color, count: funnel.counts[s.key] || 0 })),
        jobs: jobs.map((j) => ({ id: j.id, title: j.title }))
      };
    });

    /** خروجی CSV گزارش‌ها */
    api.get('/reports/export/csv', { perm: 'reports.export', module: 'reports' }, (ctx) => {
      const type = ctx.query.type || 'applications';
      const range = resolveRange(ctx.query, modules);
      const apps = filterByRange(ctx.col('applications').all(), range);

      if (type === 'applications') {
        const columns = [
          { key: 'code', title: 'کد رهگیری' },
          { key: 'name', title: 'نام متقاضی', get: (a) => fullName(a) },
          { key: 'mobile', title: 'موبایل', get: (a) => mobile(a) },
          { key: 'jobTitle', title: 'موقعیت شغلی' },
          { key: 'statusTitle', title: 'وضعیت', get: (a) => statusInfo(a.status).title },
          { key: 'rating', title: 'امتیاز منابع انسانی' },
          { key: 'interviewCount', title: 'تعداد مصاحبه', get: (a) => (a.interviews || []).length },
          { key: 'interviewScore', title: 'امتیاز مصاحبه', get: (a) => {
            const s = (a.interviews || []).map((i) => i.score).filter((x) => typeof x === 'number');
            return s.length ? Math.max(...s) : '';
          } },
          { key: 'mbti', title: 'تیپ شخصیتی', get: (a) => {
            const r = ctx.col('assessment_results').find((x) => x.applicationId === a.id && x.status === 'completed');
            return r ? r.type : '';
          } },
          { key: 'createdAt', title: 'تاریخ ثبت', get: (a) => jalali.formatJalaliTime(a.createdAt) },
          { key: 'updatedAt', title: 'آخرین تغییر', get: (a) => jalali.formatJalaliTime(a.updatedAt) }
        ];
        ctx.log('report.export', `خروجی CSV درخواست‌ها (${apps.length} ردیف)`, { entity: 'report' });
        ctx.req.__res.csv(csv.toCSV(apps, columns), `applications-report-${new Date().toISOString().slice(0, 10)}.csv`);
        return undefined;
      }

      if (type === 'jobs') {
        const jobs = ctx.col('jobs').all();
        const columns = [
          { key: 'title', title: 'موقعیت شغلی' },
          { key: 'department', title: 'دپارتمان' },
          { key: 'status', title: 'وضعیت' },
          { key: 'openings', title: 'ظرفیت' },
          { key: 'applications', title: 'تعداد متقاضی', get: (j) => apps.filter((a) => a.jobId === j.id).length },
          { key: 'interviewed', title: 'مصاحبه‌شده', get: (j) => apps.filter((a) => a.jobId === j.id && (a.interviews || []).length).length },
          { key: 'hired', title: 'استخدام‌شده', get: (j) => apps.filter((a) => a.jobId === j.id && a.status === 'hired').length },
          { key: 'createdAt', title: 'تاریخ ایجاد', get: (j) => jalali.formatJalali(j.createdAt) }
        ];
        ctx.req.__res.csv(csv.toCSV(jobs, columns), `jobs-report-${new Date().toISOString().slice(0, 10)}.csv`);
        return undefined;
      }

      if (type === 'personality') {
        const results = ctx.col('assessment_results').all();
        const columns = [
          { key: 'applicant', title: 'متقاضی', get: (r) => { const a = ctx.col('applications').byId(r.applicationId); return a ? fullName(a) : ''; } },
          { key: 'job', title: 'موقعیت', get: (r) => { const a = ctx.col('applications').byId(r.applicationId); return a ? a.jobTitle : ''; } },
          { key: 'type', title: 'تیپ' },
          { key: 'profileName', title: 'عنوان' },
          { key: 'fitScore', title: 'تناسب شغلی' },
          { key: 'fitLevel', title: 'سطح تناسب' },
          { key: 'borderline', title: 'ابعاد مرزی', get: (r) => (r.borderline || []).join('، ') },
          { key: 'date', title: 'تاریخ', get: (r) => jalali.formatJalali(r.completedAt || r.createdAt) }
        ];
        ctx.req.__res.csv(csv.toCSV(results, columns), `personality-report-${new Date().toISOString().slice(0, 10)}.csv`);
        return undefined;
      }

      ctx.fail('نوع گزارش نامعتبر است');
    });
  }
};

// ------------------------------------------------------------------ کمکی

function resolveRange(query, modules) {
  const days = Number(query.days || modules.s('reports', 'defaultRangeDays', 90)) || 90;
  const to = query.to ? new Date(new Date(query.to).getTime() + 86399999) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - days * 86400000);
  return { from, to, days: Math.max(1, Math.round((to - from) / 86400000)) };
}

function filterByRange(rows, range) {
  return rows.filter((r) => {
    const d = new Date(r.createdAt || 0);
    return d >= range.from && d <= range.to;
  });
}

function delta(current, previous) {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function pickTopDegree(eduRows) {
  const order = ['دکتری', 'کارشناسی ارشد', 'کارشناسی', 'کاردانی', 'دیپلم'];
  for (const level of order) {
    if (eduRows.some((r) => r.degree === level)) return level;
  }
  return eduRows[0] ? eduRows[0].degree : null;
}
