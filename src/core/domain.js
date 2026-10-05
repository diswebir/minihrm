/**
 * مدل دامنه مشترک سامانه (درخواست‌های استخدامی، وضعیت‌ها، صفحه‌بندی و ...)
 */
'use strict';

const utils = require('./utils');

/** وضعیت‌های درخواست استخدامی */
const APPLICATION_STATUSES = [
  { key: 'new', title: 'ثبت جدید', color: 'sky', icon: 'inbox', stage: 'intake', order: 1, description: 'فرم استخدامی به‌صورت کامل ثبت شده و منتظر بررسی اولیه است.' },
  { key: 'screening', title: 'غربالگری', color: 'violet', icon: 'filter', stage: 'intake', order: 2, description: 'کارشناس منابع انسانی در حال بررسی شرایط و مدارک متقاضی است.' },
  { key: 'assessment', title: 'آزمون شخصیت', color: 'lemon', icon: 'brain', stage: 'evaluation', order: 3, description: 'متقاضی برای تکمیل آزمون شخصیت‌شناسی راهنمایی شده است.' },
  { key: 'interview', title: 'مصاحبه', color: 'peach', icon: 'message-circle', stage: 'evaluation', order: 4, description: 'مصاحبه (حضوری/آنلاین) برنامه‌ریزی یا برگزار شده است.' },
  { key: 'evaluation', title: 'ارزیابی نهایی', color: 'mint', icon: 'clipboard-check', stage: 'evaluation', order: 5, description: 'نظر مصاحبه‌کننده، منابع انسانی و مدیریت در حال جمع‌بندی است.' },
  { key: 'offer', title: 'پیشنهاد همکاری', color: 'violet', icon: 'send', stage: 'decision', order: 6, description: 'پیشنهاد همکاری ارسال شده و در انتظار پاسخ متقاضی است.' },
  { key: 'hired', title: 'استخدام‌شده', color: 'mint', icon: 'user-check', stage: 'decision', order: 7, description: 'متقاضی پذیرش نهایی شد و فرایند جذب تکمیل است.' },
  { key: 'onhold', title: 'نیاز به بررسی بیشتر', color: 'lemon', icon: 'pause-circle', stage: 'decision', order: 8, description: 'پرونده برای تصمیم‌گیری نهایی یا فرصت‌های آینده نگه داشته شده است.' },
  { key: 'talent_pool', title: 'بانک استعداد', color: 'sky', icon: 'archive', stage: 'decision', order: 9, description: 'متقاضی مناسب برای موقعیت‌های آینده ذخیره شده است.' },
  { key: 'rejected', title: 'رد صلاحیت', color: 'rose', icon: 'x-circle', stage: 'decision', order: 10, description: 'متقاضی در این مرحله پذیرفته نشد.' },
  { key: 'withdrawn', title: 'انصراف متقاضی', color: 'peach', icon: 'log-out', stage: 'decision', order: 11, description: 'متقاضی از ادامه فرایند انصراف داده است.' }
];

const STATUS_MAP = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s.key, s]));
const FUNNEL_ORDER = ['new', 'screening', 'assessment', 'interview', 'evaluation', 'offer', 'hired'];

function statusInfo(key) {
  return STATUS_MAP[key] || { key, title: key || 'نامشخص', color: 'sky', icon: 'circle', stage: 'other', order: 99 };
}

function statusTitle(key) { return statusInfo(key).title; }

/** وضعیت‌های پایانی */
const CLOSED_STATUSES = ['hired', 'rejected', 'withdrawn', 'talent_pool'];

/** تصمیم‌های ارزیابی (مطابق فرم کاغذی: مناسب / بررسی بیشتر / رد) */
const DECISIONS = [
  { key: 'approve', title: 'مناسب برای استخدام', color: 'mint', icon: 'check-circle' },
  { key: 'review', title: 'نیاز به بررسی بیشتر', color: 'lemon', icon: 'search' },
  { key: 'reject', title: 'رد صلاحیت', color: 'rose', icon: 'x-circle' }
];

/** نقش‌های ارزیابی در فرم استخدام */
const EVALUATION_ROLES = [
  { key: 'interviewer', title: 'نظر مصاحبه‌کننده' },
  { key: 'hr', title: 'نظر منابع انسانی' },
  { key: 'manager', title: 'نظر مدیریت' }
];

/** صفحه‌بندی روی آرایه‌ها */
function paginate(rows, query = {}, defaultPerPage = 20) {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const perPage = Math.min(200, Math.max(1, parseInt(query.perPage || query.limit || defaultPerPage, 10) || defaultPerPage));
  const total = rows.length;
  const start = (page - 1) * perPage;
  return {
    rows: rows.slice(start, start + perPage),
    total,
    page,
    perPage,
    pages: Math.max(1, Math.ceil(total / perPage)),
    hasNext: start + perPage < total,
    hasPrev: page > 1
  };
}

/** مرتب‌سازی امن */
function sortRows(rows, sortBy = 'createdAt', dir = 'desc', allowed = []) {
  const key = allowed.length && !allowed.includes(sortBy) ? (allowed[0] || 'createdAt') : sortBy;
  const factor = String(dir).toLowerCase() === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const av = a[key]; const bv = b[key];
    if (av === bv) return 0;
    if (av === undefined || av === null) return 1;
    if (bv === undefined || bv === null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
    return String(av).localeCompare(String(bv), 'fa') * factor;
  });
}

/** نام کامل متقاضی */
function fullName(app) {
  if (!app) return '';
  if (app.firstName || app.lastName) return [app.firstName, app.lastName].filter(Boolean).join(' ');
  if (app.answers) {
    const p = app.answers.personal || {};
    if (p.firstName || p.lastName) return [p.firstName, p.lastName].filter(Boolean).join(' ');
  }
  return app.name || 'متقاضی';
}

/** شماره موبایل متقاضی */
function mobile(app) {
  if (!app) return '';
  return app.mobile || (app.answers && ((app.answers.contact || {}).mobile || (app.answers.contact || {}).phoneMobile)) || '';
}

/** خلاصه درخواست برای فهرست‌ها */
function summary(app) {
  const st = statusInfo(app.status);
  const edu = (app.answers && app.answers.education && app.answers.education.education) || [];
  const topEdu = Array.isArray(edu) && edu.length ? edu.find((e) => e.degree === 'دکتری') || edu.find((e) => e.degree === 'کارشناسی ارشد') || edu[0] : null;
  return {
    id: app.id,
    code: app.code,
    name: fullName(app),
    mobile: mobile(app),
    email: (app.answers && (app.answers.contact || {}).email) || app.email || '',
    jobId: app.jobId,
    jobTitle: app.jobTitle || '',
    status: app.status,
    statusTitle: st.title,
    statusColor: st.color,
    rating: app.rating || null,
    tags: app.tags || [],
    education: topEdu ? `${topEdu.degree || ''} ${topEdu.field || ''}`.trim() : '',
    assessmentType: (app.assessment && app.assessment.type) || null,
    hasAssessment: !!(app.assessment && app.assessment.status === 'completed'),
    nextInterviewAt: nextInterview(app),
    createdAt: app.createdAt,
    submittedAt: app.submittedAt || app.createdAt,
    updatedAt: app.updatedAt,
    progress: app.progress || null
  };
}

function nextInterview(app) {
  const list = (app.interviews || []).filter((i) => i.status === 'scheduled' && i.scheduledAt);
  list.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  return list.length ? list[0].scheduledAt : null;
}

/** افزودن رویداد به تایم‌لاین درخواست */
function timelineEvent(actor, type, title, meta = {}) {
  return {
    at: new Date().toISOString(),
    actorId: actor ? actor.id : null,
    actorName: actor ? actor.name : 'سیستم',
    type, title, meta
  };
}

/** محاسبه آمار قیف جذب */
function funnelStats(applications) {
  const counts = {};
  for (const s of APPLICATION_STATUSES) counts[s.key] = 0;
  for (const app of applications) counts[app.status] = (counts[app.status] || 0) + 1;
  const reached = {
    new: applications.length,
    screening: applications.filter((a) => FUNNEL_ORDER.indexOf(a.status) >= 1 || CLOSED_STATUSES.includes(a.status)).length,
    assessment: applications.filter((a) => a.assessment && a.assessment.status === 'completed').length,
    interview: applications.filter((a) => (a.interviews || []).length > 0).length,
    evaluation: applications.filter((a) => a.evaluations && (a.evaluations.hr || a.evaluations.manager || a.evaluations.interviewer)).length,
    offer: applications.filter((a) => ['offer', 'hired'].includes(a.status)).length,
    hired: applications.filter((a) => a.status === 'hired').length
  };
  const total = applications.length || 1;
  return {
    counts,
    reached,
    rates: {
      toScreening: utils.percent(reached.screening, total),
      toAssessment: utils.percent(reached.assessment, total),
      toInterview: utils.percent(reached.interview, total),
      toEvaluation: utils.percent(reached.evaluation, total),
      toOffer: utils.percent(reached.offer, total),
      toHire: utils.percent(reached.hired, total)
    }
  };
}

/** سری زمانی درخواست‌ها (بر اساس روز) */
function timeseries(rows, { days = 30, dateField = 'createdAt' } = {}) {
  const out = [];
  const today = utils.startOfDay();
  for (let i = days - 1; i >= 0; i--) {
    const day = utils.addDays(today, -i);
    const next = utils.addDays(day, 1);
    const count = rows.filter((r) => {
      const d = new Date(r[dateField] || 0);
      return d >= day && d < next;
    }).length;
    out.push({ date: day.toISOString().slice(0, 10), timestamp: day.getTime(), count });
  }
  return out;
}

module.exports = {
  APPLICATION_STATUSES, STATUS_MAP, FUNNEL_ORDER, CLOSED_STATUSES, DECISIONS, EVALUATION_ROLES,
  statusInfo, statusTitle, paginate, sortRows, fullName, mobile, summary, nextInterview,
  timelineEvent, funnelStats, timeseries
};
