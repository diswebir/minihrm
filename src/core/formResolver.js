/**
 * ترکیب «فرم استخدام پایه» با «تنظیمات هر موقعیت شغلی»
 * ------------------------------------------------------------------
 * مدیر منابع انسانی می‌تواند برای هر موقعیت شغلی:
 *   - فیلدهای اجباری بیشتری تعیین کند (required)
 *   - برخی فیلدها را پنهان کند (hidden)
 *   - فیلدهای اختصاصی اضافه کند (extraFields)
 *   - فقط بخشی از مراحل فرم را فعال کند (steps)
 */
'use strict';

const { deepMerge } = require('./utils');
const { defaultForm } = require('./seed/form');

/** فرم پایه ذخیره‌شده در سامانه (قابل ویرایش) */
function baseSchema(app) {
  const row = app.db.col('form_schemas').find((f) => f.key === 'default' || f.isDefault);
  const schema = row && row.schema ? row.schema : defaultForm();
  return JSON.parse(JSON.stringify(schema));
}

/**
 * فرم نهایی برای یک موقعیت شغلی
 * @param {object} app
 * @param {object|null} job
 */
function resolveForm(app, job = null) {
  const schema = baseSchema(app);
  if (!job) return schema;

  const ov = job.formOverrides || {};
  const requiredExtra = new Set(ov.required || []);
  const hidden = new Set(ov.hidden || []);
  const stepKeys = Array.isArray(ov.steps) && ov.steps.length ? new Set(ov.steps) : null;
  const extraFields = ov.extraFields || [];

  schema.steps = schema.steps
    .filter((s) => !stepKeys || stepKeys.has(s.key))
    .map((step) => {
      const fields = step.fields
        .filter((f) => !hidden.has(f.name))
        .map((f) => Object.assign({}, f, {
          required: !!f.required || requiredExtra.has(f.name),
          jobRequired: requiredExtra.has(f.name) ? true : undefined
        }));
      for (const ef of extraFields.filter((x) => x.step === step.key || x.stepKey === step.key)) {
        // جلوگیری از تکرار فیلد با همان نام
        if (!fields.some((f) => f.name === ef.field.name)) fields.push(ef.field);
      }
      return Object.assign({}, step, { fields });
    });

  schema.job = { id: job.id, title: job.title };
  schema.overrides = { required: Array.from(requiredExtra), hidden: Array.from(hidden) };
  return schema;
}

/** فیلدهای هویتی متقاضی که در فهرست‌ها نمایش داده می‌شوند */
function identityFromAnswers(answers = {}, mobile = '') {
  const p = answers.personal || {};
  const c = answers.contact || {};
  return {
    firstName: p.firstName || '',
    lastName: p.lastName || '',
    name: [p.firstName, p.lastName].filter(Boolean).join(' ') || '',
    mobile: c.mobile || mobile || '',
    email: c.email || '',
    nationalId: p.nationalId || '',
    birthDate: p.birthDate || '',
    city: p.birthPlace || ''
  };
}

/** خلاصه پاسخ‌ها برای جدول‌های فهرست (برچسب‌دار) */
function flattenAnswers(schema, answers = {}) {
  const out = [];
  for (const step of schema.steps || []) {
    for (const field of step.fields || []) {
      if (['heading', 'note'].includes(field.type)) continue;
      const value = (answers[step.key] || {})[field.name];
      out.push({
        step: step.title,
        stepKey: step.key,
        field: field.label,
        name: field.name,
        type: field.type,
        value: Array.isArray(value) ? value.map((v) => (typeof v === 'object' ? Object.values(v).filter(Boolean).join(' / ') : v)).join(' | ') : (value === undefined || value === null ? '' : String(value))
      });
    }
  }
  return out;
}

/** اعتبارسنجی پاسخ‌ها بر اساس فرم (سمت سرور) */
function validateAnswers(schema, answers = {}, { partial = false, stepKey = null } = {}) {
  const errors = {};
  const steps = stepKey ? (schema.steps || []).filter((s) => s.key === stepKey) : (schema.steps || []);
  for (const step of steps) {
    const values = answers[step.key] || {};
    for (const field of step.fields || []) {
      if (['heading', 'note'].includes(field.type)) continue;
      if (field.hiddenInWizard) continue;
      if (!isVisible(field, values)) continue;
      const value = values[field.name];
      const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length) ||
        (field.type === 'table' && Array.isArray(value) && value.filter((r) => Object.values(r || {}).some((x) => x !== '' && x !== null && x !== undefined)).length === 0);
      if (field.required && empty) {
        if (field.type === 'switch') errors[`${step.key}.${field.name}`] = 'تأیید این مورد الزامی است';
        else errors[`${step.key}.${field.name}`] = 'تکمیل این فیلد الزامی است';
        continue;
      }
      if (empty) continue;
      if (field.type === 'table' && Array.isArray(value)) {
        const minRows = field.minRows || 0;
        const filled = value.filter((r) => Object.values(r || {}).some((x) => x !== '' && x !== null && x !== undefined));
        if (filled.length < minRows) errors[`${step.key}.${field.name}`] = `حداقل ${minRows} ردیف لازم است`;
        (field.columns || []).forEach((col) => {
          if (!col.required) return;
          filled.forEach((r, i) => {
            if (r[col.name] === undefined || r[col.name] === null || r[col.name] === '') {
              errors[`${step.key}.${field.name}.${i}.${col.name}`] = `ردیف ${i + 1}: «${col.label}» الزامی است`;
            }
          });
        });
      }
      if (field.type === 'number' && value !== '' && isNaN(Number(String(value).replace(/,/g, '')))) {
        errors[`${step.key}.${field.name}`] = 'مقدار عددی وارد کنید';
      }
    }
  }
  return { errors, ok: Object.keys(errors).length === 0 };
}

/** بررسی شرط نمایش فیلد */
function isVisible(field, values = {}) {
  const cond = field.visibleIf;
  if (!cond) return true;
  const target = values[cond.field];
  const val = cond.value;
  switch (cond.op || 'eq') {
    case 'eq': return target === val;
    case 'neq': return target !== val;
    case 'in': return Array.isArray(val) ? val.includes(target) : target === val;
    case 'includes':
      if (Array.isArray(target)) return target.includes(val);
      return String(target || '').includes(String(val || ''));
    case 'truthy': return !!target;
    case 'falsy': return !target;
    case 'gt': return Number(target) > Number(val);
    case 'lt': return Number(target) < Number(val);
    default: return true;
  }
}

/** ساخت خلاصه‌ای از فرم برای کلاینت پورتال (بدون فیلدهای پنهان) */
function clientForm(schema) {
  const schemaCopy = JSON.parse(JSON.stringify(schema));
  for (const step of schemaCopy.steps || []) {
    step.fields = (step.fields || []).filter((f) => !f.hiddenInWizard);
  }
  return schemaCopy;
}

module.exports = { baseSchema, resolveForm, validateAnswers, isVisible, flattenAnswers, identityFromAnswers, clientForm, deepMerge };
