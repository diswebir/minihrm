/**
 * ماژول داشبورد مدیریتی
 */
'use strict';

const { APPLICATION_STATUSES, statusInfo, funnelStats, timeseries, summary, fullName } = require('../../core/domain');
const utils = require('../../core/utils');

module.exports = {
  key: 'dashboard',
  title: 'داشبورد',
  description: 'نمای کلی فرایند جذب، شاخص‌های کلیدی و کارهای در انتظار اقدام.',
  icon: 'layout-dashboard',
  order: 10,
  core: true,
  defaultEnabled: true,

  permissions: [
    { key: 'dashboard.view', title: 'مشاهده داشبورد', group: 'داشبورد' },
    { key: 'dashboard.extended', title: 'مشاهده تحلیل‌های پیشرفته داشبورد', group: 'داشبورد' }
  ],

  settings: [
    { key: 'trendDays', title: 'بازه روند درخواست‌ها (روز)', type: 'number', default: 30, help: 'تعداد روزهایی که در نمودار روند نمایش داده می‌شود' },
    { key: 'showAssessmentDistribution', title: 'نمایش توزیع تیپ‌های شخصیتی', type: 'bool', default: true },
    { key: 'upcomingInterviewDays', title: 'بازه مصاحبه‌های پیش‌رو (روز)', type: 'number', default: 7 }
  ],

  nav: [
    { path: '/dashboard', title: 'داشبورد', icon: 'layout-dashboard', perm: 'dashboard.view', order: 1 }
  ],

  api(api, app) {
    const modules = app.modules;

    api.get('/dashboard', { perm: 'dashboard.view', module: 'dashboard' }, (ctx) => {
      const apps = ctx.col('applications').all();
      const jobs = ctx.col('jobs').all();
      const results = ctx.col('assessment_results').all();
      const interviews = ctx.col('interviews').all();
      const users = ctx.col('users').all();

      const openJobs = jobs.filter((j) => j.status === 'open');
      const activeApps = apps.filter((a) => !['hired', 'rejected', 'withdrawn'].includes(a.status));
      const funnel = funnelStats(apps);
      const trendDays = Number(modules.s('dashboard', 'trendDays', 30));
      const trend = timeseries(apps, { days: trendDays });

      // شاخص‌های کلیدی
      const submittedThisWeek = apps.filter((a) => new Date(a.createdAt) > utils.addDays(new Date(), -7)).length;
      const prevWeek = apps.filter((a) => {
        const d = new Date(a.createdAt);
        return d > utils.addDays(new Date(), -14) && d <= utils.addDays(new Date(), -7);
      }).length;
      const hireRate = apps.length ? utils.percent(funnel.reached.hired, apps.length) : 0;

      // میانگین زمان جذب (از ثبت تا استخدام)
      const hired = apps.filter((a) => a.status === 'hired' && a.hiredAt);
      const avgTimeToHire = hired.length
        ? Math.round(hired.reduce((sum, a) => sum + (new Date(a.hiredAt) - new Date(a.createdAt)) / 86400000, 0) / hired.length)
        : null;

      // توزیع تیپ‌های شخصیتی
      const mbtiDist = {};
      for (const r of results) {
        if (!r.type) continue;
        mbtiDist[r.type] = (mbtiDist[r.type] || 0) + 1;
      }

      // مصاحبه‌های پیش‌رو
      const horizon = utils.addDays(new Date(), Number(modules.s('dashboard', 'upcomingInterviewDays', 7)));
      const upcoming = interviews
        .filter((i) => i.status === 'scheduled' && i.scheduledAt && new Date(i.scheduledAt) <= horizon && new Date(i.scheduledAt) >= utils.addDays(new Date(), -1))
        .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
        .slice(0, 8)
        .map((i) => {
          const application = ctx.col('applications').byId(i.applicationId);
          return {
            id: i.id,
            applicationId: i.applicationId,
            applicantName: application ? fullName(application) : (i.applicantName || 'متقاضی'),
            jobTitle: application ? application.jobTitle : '',
            scheduledAt: i.scheduledAt,
            duration: i.duration || 60,
            mode: i.mode || 'حضوری',
            type: i.type || 'مصاحبه حضوری',
            status: i.status
          };
        });

      // درخواست‌های در انتظار اقدام (بیش از ۳ روز بدون تغییر)
      const aging = activeApps
        .filter((a) => new Date(a.updatedAt || a.createdAt) < utils.addDays(new Date(), -3))
        .sort((a, b) => new Date(a.updatedAt || a.createdAt) - new Date(b.updatedAt || b.createdAt))
        .slice(0, 6)
        .map(summary);

      // عملکرد موقعیت‌های شغلی
      const jobPerformance = openJobs.map((j) => {
        const list = apps.filter((a) => a.jobId === j.id);
        return {
          id: j.id,
          title: j.title,
          department: j.department,
          openings: j.openings || 1,
          total: list.length,
          hired: list.filter((a) => a.status === 'hired').length,
          inProgress: list.filter((a) => !['hired', 'rejected', 'withdrawn'].includes(a.status)).length,
          conversion: utils.percent(list.filter((a) => a.status === 'hired').length, list.length || 1)
        };
      }).sort((a, b) => b.total - a.total).slice(0, 5);

      // منبع آشنایی متقاضیان
      const sources = {};
      for (const a of apps) {
        const src = (a.answers && a.answers.aspirations && a.answers.aspirations.howFound) || 'نامشخص';
        sources[src] = (sources[src] || 0) + 1;
      }

      const recentActivity = app.audit.recent(10).map((l) => ({
        id: l.id, at: l.at, actorName: l.actorName, action: l.action, title: l.title, level: l.level, entity: l.entity, entityId: l.entityId
      }));

      return {
        kpis: {
          openJobs: openJobs.length,
          totalJobs: jobs.length,
          totalApplications: apps.length,
          activeApplications: activeApps.length,
          newApplications: apps.filter((a) => a.status === 'new').length,
          screening: apps.filter((a) => a.status === 'screening').length,
          interviewStage: apps.filter((a) => a.status === 'interview').length,
          hired: funnel.reached.hired,
          rejected: apps.filter((a) => a.status === 'rejected').length,
          assessmentsCompleted: results.length,
          assessmentsPending: apps.filter((a) => a.assessment && a.assessment.status === 'invited').length,
          upcomingInterviews: interviews.filter((i) => i.status === 'scheduled' && new Date(i.scheduledAt) >= new Date()).length,
          submittedThisWeek,
          weekDelta: prevWeek ? Math.round(((submittedThisWeek - prevWeek) / prevWeek) * 100) : null,
          hireRate,
          avgTimeToHire,
          activeUsers: users.filter((u) => u.status === 'active').length
        },
        funnel,
        trend,
        trendDays,
        mbtiDistribution: mbtiDist,
        upcomingInterviews: upcoming,
        agingApplications: aging,
        jobPerformance,
        sources: Object.entries(sources).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 6),
        recentActivity,
        statuses: APPLICATION_STATUSES.map((s) => ({ key: s.key, title: s.title, color: s.color, count: funnel.counts[s.key] || 0 })),
        greeting: greeting()
      };
    });

    // کارهای سریع (ویجت‌های قابل تنظیم کاربر)
    api.get('/dashboard/widgets', { perm: 'dashboard.view', module: 'dashboard' }, () => {
      return {
        widgets: [
          { key: 'kpis', title: 'شاخص‌های کلیدی', enabled: true },
          { key: 'trend', title: 'روند درخواست‌ها', enabled: true },
          { key: 'funnel', title: 'قیف جذب', enabled: true },
          { key: 'mbti', title: 'توزیع تیپ شخصیتی', enabled: !!modules.s('dashboard', 'showAssessmentDistribution', true) },
          { key: 'interviews', title: 'مصاحبه‌های پیش‌رو', enabled: true },
          { key: 'aging', title: 'در انتظار اقدام', enabled: true },
          { key: 'jobs', title: 'عملکرد موقعیت‌ها', enabled: true },
          { key: 'activity', title: 'فعالیت‌های اخیر', enabled: true }
        ]
      };
    });
  }
};

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'شب بخیر';
  if (h < 12) return 'صبح بخیر';
  if (h < 17) return 'وقت بخیر';
  if (h < 20) return 'عصر بخیر';
  return 'شب بخیر';
}
