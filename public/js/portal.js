/* ═══════════════════════════════════════════════════════════════
   portal.js — منطق سمت مرورگر پورتال استخدام
   · فرم استخدام چندمرحله‌ای با ذخیره خودکار
   · ورود با کد پیامکی (OTP)
   · آزمون شخصیت‌شناسی
   · پیگیری وضعیت با کد رهگیری
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var API = '/api/portal';
  var FA = '۰۱۲۳۴۵۶۷۸۹';

  /* ---------------------------------------------------------- ابزارها */
  function fa(v) { return String(v === null || v === undefined ? '' : v).replace(/\d/g, function (d) { return FA[+d]; }); }
  function en(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/[۰-۹]/g, function (d) { return String(FA.indexOf(d)); })
      .replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); });
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function toggle(el, on, cls) { if (el) el.classList[on ? 'remove' : 'add'](cls || 'hidden'); }

  function jdate(iso) {
    if (!iso) return '—';
    try { return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); }
    catch (e) { return new Date(iso).toLocaleDateString('fa-IR'); }
  }
  function jtime(iso) {
    if (!iso) return '—';
    try { return new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); }
    catch (e) { return ''; }
  }
  function jdateTime(iso) { return jdate(iso) + ' — ' + jtime(iso); }

  function toast(message, type) {
    var wrap = $('#portal-toasts');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'portal-toasts';
      wrap.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center';
      document.body.appendChild(wrap);
    }
    var colors = { success: 'mint', error: 'rose', warning: 'lemon', info: 'sky' };
    var node = document.createElement('div');
    node.className = 'insight ' + (colors[type] || 'sky');
    node.style.cssText = 'box-shadow:0 12px 32px rgba(44,42,64,.18);min-width:260px;max-width:92vw';
    node.innerHTML = '<div class="text-sm">' + esc(message) + '</div>';
    wrap.appendChild(node);
    setTimeout(function () { node.style.opacity = '0'; node.style.transition = 'opacity .4s'; setTimeout(function () { node.remove(); }, 400); }, 4200);
  }

  function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', credentials: 'same-origin', headers: { 'X-Requested-With': 'HRM' } };
    if (opts.body instanceof FormData) init.body = opts.body;
    else if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    return fetch(API + path, init).then(function (res) {
      return res.json().catch(function () { return { ok: false, error: 'پاسخ نامعتبر از سرور دریافت شد.' }; }).then(function (json) {
        if (!res.ok || json.ok === false) {
          var err = new Error(json.error || ('خطا در ارتباط با سرور (' + res.status + ')'));
          err.status = res.status; err.code = json.code; err.fields = json.fields || null; err.raw = json;
          throw err;
        }
        return json.data;
      });
    });
  }

  function btnLoading(btn, on, text) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.textContent = text || 'لطفاً صبر کنید…'; }
    else { btn.disabled = false; if (btn.dataset.label) btn.textContent = btn.dataset.label; }
  }

  /* ══════════════════════════════════════════════ فرم استخدام */
  function initApply(root) {
    var state = {
      data: null, jobSlug: (root.getAttribute('data-job-slug') || '').trim(),
      job: null, jobs: [], applicant: null,
      app: null, schema: null, answers: {}, step: 0, errors: {},
      progress: { currentStep: 0, completed: [] },
      saving: false, savedAt: null, timer: null, dirty: false, submitting: false
    };
    root.classList.remove('class', 'class');

    state.boot = function () {
      return api('/bootstrap' + (state.jobSlug ? '?job=' + encodeURIComponent(state.jobSlug) : ''))
        .then(function (data) {
          state.data = data; state.job = data.job; state.jobs = data.jobs || []; state.applicant = data.applicant;
          state.portal = data.portal || {};
          route();
        })
        .catch(function (err) { renderFatal(err); });
    };

    function route() {
      hideAll();
      if (!state.job) {  // انتخاب موقعیت شغلی
        renderJobs();
        return showState('state-job');
      }
      if (!state.applicant) { renderLogin(); return showState('state-login'); }
      var submitted = (state.data.applications || []).filter(function (a) { return a.jobTitle === state.job.title; })[0];
      if (submitted) {
        state.submitted = submitted;
        renderDone({
          code: submitted.code, message: 'شما قبلاً برای این موقعیت شغلی فرم استخدام ثبت کرده‌اید. می‌توانید وضعیت درخواست خود را پیگیری کنید.',
          assessmentRequired: submitted.assessmentStatus === 'invited' || submitted.assessmentStatus === 'required'
        });
        return;
      }
      // ادامه پیش‌نویس یا شروع فرم جدید
      var btn = null;
      api('/applications', { method: 'POST', body: { jobSlug: state.jobSlug } })
        .then(function (res) {
          state.app = res.application; state.schema = res.schema;
          state.answers = res.application.answers || {};
          state.progress = res.application.progress || state.progress;
          state.step = Math.min(Math.max(0, (state.progress.currentStep || 0)), stepCount() - 1);
          renderForm();
          showState('state-form');
        })
        .catch(function (err) {
          if (err.code === 'duplicate') {
            var id = err.raw && err.raw.applicationId;
            renderDone({ code: err.raw && err.raw.code, message: err.message, applicationId: id });
          } else if (err.code === 'need_auth') {
            localStorage.setItem('hrm_pending_job', state.jobSlug);
            renderLogin();
            showState('state-login');
          } else renderFatal(err);
        });
    }

    function hideAll() { ['state-job', 'state-login', 'state-form', 'state-done', 'state-assessment'].forEach(function (id) { var el = $('#' + id); if (el) el.classList.add('hidden'); }); }
    function showState(id) { var el = document.getElementById(id); if (el) el.classList.remove('hidden'); }

    function renderFatal(err) {
      showState('state-login');
      var box = $('#login-alert');
      if (box) { box.classList.remove('hidden'); $('.text-sm', box).textContent = err.message || 'خطای غیرمنتظره'; }
    }

    /* ---------- انتخاب موقعیت شغلی ---------- */
    function renderJobs() {
      var grid = $('#job-options');
      if (!grid) return;
      if (!state.jobs.length) {
        grid.innerHTML = '<div class="empty"><div class="bold">موقعیت شغلی فعالی وجود ندارد</div><div class="text-sm muted">در حال حاضر آگهی فعالی منتشر نشده است.</div></div>';
        return;
      }
      grid.innerHTML = state.jobs.map(function (j) {
        return '<div class="job-card"><div class="card">' +
          '<div class="card-title">' + esc(j.title) + '</div>' +
          '<div class="text-sm muted">' + esc(j.department || '') + (j.location ? ' — ' + esc(j.location) : '') + '</div>' +
          (j.summary ? '<p class="text-sm muted mt-1">' + esc(j.summary) + '</p>' : '') +
          '<a class="btn btn-primary btn-block mt-2" href="/apply?job=' + encodeURIComponent(j.slug || j.id) + '">انتخاب و شروع فرم</a>' +
          '</div></div>';
      }).join('');
    }

    /* ---------- ورود با کد پیامکی ---------- */
    function renderLogin() {
      var alert = $('#login-alert');
      if (alert) alert.classList.add('hidden');
      var mobile = $('#apply-mobile'), name = $('#apply-name');
      if (mobile && !mobile.value) {
        var saved = localStorage.getItem('hrm_last_mobile');
        if (saved) mobile.value = saved;
      }
      if (name) name.value = localStorage.getItem('hrm_last_name') || '';
      var stepMobile = $('#login-step-mobile'), stepCode = $('#login-step-code');
      if (stepMobile) stepMobile.classList.remove('hidden');
      if (stepCode) stepCode.classList.add('hidden');
    }

    function loginAlert(message) {
      var box = $('#login-alert');
      if (box) { box.classList.remove('hidden'); $('.text-sm', box).textContent = message; }
    }

    $('#btn-send-otp') && $('#btn-send-otp').addEventListener('click', function () {
      var btn = this;
      var mobile = en($('#apply-mobile').value).replace(/\D/g, '');
      var name = $('#apply-name').value.trim();
      if (!/^09\d{9}$/.test(mobile)) return loginAlert('شماره موبایل معتبر وارد کنید (مثال: ۰۹۱۲۳۴۵۶۷۸۹).');
      btnLoading(btn, true, 'در حال ارسال کد…');
      api('/otp/request', { method: 'POST', body: { mobile: mobile } })
        .then(function (res) {
          localStorage.setItem('hrm_last_mobile', mobile);
          localStorage.setItem('hrm_last_name', name);
          $('#login-step-mobile').classList.add('hidden');
          $('#login-step-code').classList.remove('hidden');
          var hint = $('#otp-hint');
          hint.textContent = res.devCode
            ? 'حالت آزمایشی — کد پیامکی شما: ' + fa(res.devCode) + ' (اعتبار ' + fa(res.ttlSec) + ' ثانیه)'
            : 'کد پیامکی به شماره ' + fa(mobile) + ' ارسال شد. اعتبار کد ' + fa(res.ttlSec || 120) + ' ثانیه است.';
          $('#apply-code').focus();
          startResendTimer(60);
        })
        .catch(function (err) { loginAlert(err.message); })
        .then(function () { btnLoading(btn, false); });
    });

    var resendTimer = null;
    function startResendTimer(seconds) {
      var btn = $('#btn-resend');
      if (!btn) return;
      var left = seconds;
      btn.disabled = true;
      clearInterval(resendTimer);
      resendTimer = setInterval(function () {
        left -= 1;
        if (left <= 0) { clearInterval(resendTimer); btn.disabled = false; btn.textContent = 'ارسال مجدد کد'; }
        else btn.textContent = 'ارسال مجدد (' + fa(left) + ')';
      }, 1000);
    }

    $('#btn-resend') && $('#btn-resend').addEventListener('click', function () {
      var mobile = en($('#apply-mobile').value).replace(/\D/g, '');
      btnLoading(this, true, '…');
      api('/otp/request', { method: 'POST', body: { mobile: mobile } })
        .then(function (res) { toast(res.devCode ? 'کد جدید (آزمایشی): ' + fa(res.devCode) : 'کد جدید ارسال شد.', 'success'); startResendTimer(60); })
        .catch(function (err) { loginAlert(err.message); })
        .then(function () { btnLoading($('#btn-resend'), false); });
    });

    $('#btn-change-mobile') && $('#btn-change-mobile').addEventListener('click', function () {
      $('#login-step-code').classList.add('hidden');
      $('#login-step-mobile').classList.remove('hidden');
    });

    $('#btn-verify-otp') && $('#btn-verify-otp').addEventListener('click', function () {
      var btn = this;
      var mobile = en($('#apply-mobile').value).replace(/\D/g, '');
      var code = en($('#apply-code').value).replace(/\D/g, '');
      var name = $('#apply-name').value.trim();
      if (!code) return loginAlert('کد پیامکی را وارد کنید.');
      btnLoading(btn, true, 'در حال بررسی…');
      api('/otp/verify', { method: 'POST', body: { mobile: mobile, code: code, name: name } })
        .then(function (res) {
          state.applicant = res.applicant;
          state.data.applications = res.applications || [];
          toast('خوش آمدید' + (res.applicant && res.applicant.name ? ' ' + res.applicant.name : '') + '!', 'success');
          route();
        })
        .catch(function (err) { loginAlert(err.message); })
        .then(function () { btnLoading(btn, false); });
    });

    /* ---------- فرم چندمرحله‌ای ---------- */
    function steps() { return (state.schema && state.schema.steps) || []; }
    function stepCount() { return steps().length || 1; }
    function currentStep() { return steps()[state.step] || steps()[0] || { key: 'x', fields: [] }; }
    function valuesOf(stepKey) { return state.answers[stepKey] || (state.answers[stepKey] = {}); }
    function stepOfFieldKey(fullKey) { return String(fullKey).split('.')[0]; }
    function fieldOfFieldKey(fullKey) { var p = String(fullKey).split('.'); return p.length > 1 ? p[1] : p[0]; }

    function isVisible(field, values) {
      var v = field.visibleIf;
      if (!v) return true;
      var cur = values[v.field];
      if (v.op === 'eq') return String(cur) === String(v.value);
      if (v.op === 'includes') return Array.isArray(cur) ? cur.indexOf(v.value) > -1 : String(cur) === String(v.value);
      if (v.op === 'truthy') return !!cur;
      if (v.op === 'not') return String(cur) !== String(v.value);
      return true;
    }

    function optionsOf(field) {
      return (field.options || []).map(function (o) { return (o && o.value !== undefined) ? o : { value: o, label: o }; });
    }

    function renderForm() {
      renderStepList();
      renderStep();
      updateProgress();
      updateSaveLabel(state.savedAt ? 'ذخیره‌شده' : 'ذخیره خودکار فعال است');
    }

    function renderStepList() {
      var list = $('#step-list');
      if (!list) return;
      list.innerHTML = steps().map(function (s, i) {
        var done = (state.progress.completed || []).indexOf(s.key) > -1;
        var cls = i === state.step ? 'active' : (done ? 'done' : '');
        return '<button type="button" class="step-item ' + cls + '" data-go-step="' + i + '">' +
          '<span class="step-num">' + (done && i !== state.step ? '✓' : fa(i + 1)) + '</span>' +
          '<span class="grow text-sm">' + esc(s.title) + '</span>' +
          '</button>';
      }).join('');
    }

    function renderStep() {
      var card = $('#step-card');
      var step = currentStep();
      var values = valuesOf(step.key);
      var html = '<div class="row between wrap gap-2 mb-2">' +
        '<div><div class="card-title">' + esc(step.title) + '</div>' +
        (step.description ? '<div class="text-sm muted">' + esc(step.description) + '</div>' : '') + '</div>' +
        '<span class="badge badge-violet">مرحله ' + fa(state.step + 1) + ' از ' + fa(stepCount()) + '</span></div>' +
        '<div class="form-grid">' + (step.fields || []).map(function (f) { return fieldHtml(step.key, f, values); }).join('') + '</div>';

      var localErrors = Object.keys(state.errors || {}).filter(function (k) { return stepOfFieldKey(k) === step.key; });
      if (localErrors.length) {
        html += '<div class="insight rose mt-2"><span class="ic">⚠️</span><div class="text-sm">' +
          '<span class="bold">' + fa(localErrors.length) + ' مورد نیازمند اصلاح است:</span><ul style="margin:6px 0 0;padding-inline-start:18px">' +
          localErrors.map(function (k) { return '<li>' + esc(state.errors[k]) + '</li>'; }).join('') + '</ul></div></div>';
      }
      card.innerHTML = html;

      var prev = $('#btn-prev'), next = $('#btn-next');
      if (prev) prev.disabled = state.step === 0;
      if (next) next.textContent = state.step === stepCount() - 1 ? 'ثبت نهایی فرم' : 'مرحله بعد';
      $$('[data-go-step]', $('#step-list')).forEach(function (b) {
        b.addEventListener('click', function () { gotoStep(+b.dataset.goStep); });
      });
      $$('.rating-star', card).forEach(function (star) {
        star.addEventListener('click', function () {
          var name = star.dataset.ratingName, val = +star.dataset.ratingValue;
          values[name] = val;
          markDirty();
          $$('.rating-star[data-rating-name="' + name + '"]', card).forEach(function (s2) {
            s2.classList.toggle('on', +s2.dataset.ratingValue <= val);
          });
        });
      });
      $$('[data-add-row]', card).forEach(function (b) {
        b.addEventListener('click', function () {
          var fname = b.dataset.addRow;
          var field = findField(step.key, fname);
          values[fname] = values[fname] || [];
          if (values[fname].length >= (field.maxRows || 20)) return toast('حداکثر تعداد ردیف مجاز است.', 'warning');
          values[fname].push({});
          markDirty();
          renderStep();
        });
      });
      $$('[data-del-row]', card).forEach(function (b) {
        b.addEventListener('click', function () {
          var fname = b.dataset.delRow, idx = +b.dataset.rowIndex;
          if (values[fname]) values[fname].splice(idx, 1);
          markDirty();
          renderStep();
        });
      });
      $$('[data-file-field]', card).forEach(function (inp) {
        inp.addEventListener('change', function () {
          var file = inp.files[0];
          if (!file) return;
          var maxMB = (state.portal && state.portal.maxFileSizeMB) || 5;
          if (file.size > maxMB * 1024 * 1024) return toast('حجم فایل باید کمتر از ' + fa(maxMB) + ' مگابایت باشد.', 'error');
          var fd = new FormData();
          fd.append('file', file);
          fd.append('fieldName', inp.dataset.fileField);
          fd.append('stepKey', inp.dataset.fileStep);
          toast('در حال بارگذاری فایل…', 'info');
          api('/applications/' + state.app.id + '/files', { method: 'POST', body: fd })
            .then(function (res) {
              values[inp.dataset.fileField] = res.file;
              markDirty();
              toast('فایل «' + res.file.name + '» بارگذاری شد.', 'success');
              renderStep();
            })
            .catch(function (err) { toast(err.message, 'error'); });
        });
      });
      bindFieldEvents(card, step);
    }

    function findField(stepKey, name) {
      var step = steps().filter(function (s) { return s.key === stepKey; })[0] || {};
      return (step.fields || []).filter(function (f) { return f.name === name; })[0] || {};
    }

    function fieldHtml(stepKey, f, values) {
      var val = values[f.name];
      var key = stepKey + '.' + f.name;
      var error = state.errors ? state.errors[key] : null;
      var visible = isVisible(f, values);
      var col = f.type === 'table' ? 12 : (f.col || 6);
      var out = '<div class="field col-' + col + ' ' + (visible ? '' : 'hidden') + '" data-visible-for="' + esc(f.name) + '" data-step-key="' + esc(stepKey) + '">';
      if (f.type === 'heading') return '<div class="col-12 mt-2"><div class="divider"></div><h4>' + esc(f.label) + '</h4></div>';
      if (f.type === 'note') return '<div class="col-12"><div class="insight sky"><span class="ic">ℹ️</span><div class="text-sm">' + esc(f.label || f.help) + '</div></div></div>';

      out += '<label class="label">' + esc(f.label) + (f.required ? ' <span class="req">*</span>' : '') + '</label>';
      var attrs = 'data-field="' + esc(f.name) + '" data-step="' + esc(stepKey) + '" data-type="' + esc(f.type) + '"';

      if (f.type === 'textarea') out += '<textarea class="textarea" rows="' + (f.rows || 3) + '" placeholder="' + esc(f.placeholder || '') + '" ' + attrs + '>' + esc(val || '') + '</textarea>';
      else if (f.type === 'select') {
        out += '<select class="select" ' + attrs + '><option value="">انتخاب کنید…</option>' + optionsOf(f).map(function (o) {
          return '<option value="' + esc(o.value) + '"' + (String(val) === String(o.value) ? ' selected' : '') + '>' + esc(o.label) + '</option>';
        }).join('') + '</select>';
      } else if (f.type === 'radio') {
        out += '<div class="radio-cards">' + optionsOf(f).map(function (o) {
          return '<label class="radio-card' + (String(val) === String(o.value) ? ' selected' : '') + '"><input type="radio" name="' + esc(key) + '" value="' + esc(o.value) + '" ' + attrs + (String(val) === String(o.value) ? ' checked' : '') + '><span class="text-sm">' + esc(o.label) + '</span></label>';
        }).join('') + '</div>';
      } else if (f.type === 'checkbox') {
        var arr = Array.isArray(val) ? val : (val ? [val] : []);
        out += '<div class="radio-cards">' + optionsOf(f).map(function (o) {
          return '<label class="radio-card' + (arr.indexOf(o.value) > -1 ? ' selected' : '') + '"><input type="checkbox" value="' + esc(o.value) + '" data-multi="1" ' + attrs + (arr.indexOf(o.value) > -1 ? ' checked' : '') + '><span class="text-sm">' + esc(o.label) + '</span></label>';
        }).join('') + '</div>';
      } else if (f.type === 'switch') {
        out += '<label class="checkline' + (val ? ' checked' : '') + '" style="align-items:center"><input type="checkbox" data-switch="1" ' + attrs + (val ? ' checked' : '') + '><span class="text-sm grow">' + esc(f.placeholder || 'بله، تأیید می‌کنم') + '</span></label>';
      } else if (f.type === 'rating') {
        var max = f.max || 5, cur = Number(val) || 0;
        out += '<div class="row gap-1" data-rating="' + esc(f.name) + '">' + Array.from({ length: max }).map(function (_, i) {
          return '<button type="button" class="rating-star' + (i < cur ? ' on' : '') + '" data-rating-name="' + esc(f.name) + '" data-rating-value="' + (i + 1) + '">★</button>';
        }).join('') + '</div>';
      } else if (f.type === 'file') {
        var fileVal = val && val.name ? val : null;
        out += '<div>' + (fileVal ? '<div class="checkline checked mb-1 text-sm">📎 ' + esc(fileVal.name) + ' <span class="muted">(' + fa(Math.max(1, Math.round((fileVal.size || 0) / 1024))) + ' کیلوبایت)</span></div>' : '') +
          '<input type="file" class="input" accept="' + (f.accept === 'image' ? 'image/jpeg,image/png,image/webp' : '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx') + '" data-file-field="' + esc(f.name) + '" data-file-step="' + esc(stepKey) + '">' +
          '<div class="hint">' + esc(f.help || 'فرمت‌های مجاز: PDF، تصویر، Word') + '</div></div>';
      } else if (f.type === 'table') {
        var rows = Array.isArray(val) ? val : [];
        var cols = f.columns || [];
        out += '<div class="table-wrap"><table class="data-table compact"><thead><tr>' +
          cols.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join('') + '<th style="width:52px"></th></tr></thead><tbody>' +
          (rows.length ? rows.map(function (row, i) {
            return '<tr>' + cols.map(function (c) {
              var cellErr = state.errors ? state.errors[stepKey + '.' + f.name + '.' + i + '.' + c.name] : null;
              var cellAttrs = 'data-trow="' + i + '" data-tcol="' + esc(c.name) + '" data-tfield="' + esc(f.name) + '" data-tstep="' + esc(stepKey) + '"';
              var cell = '';
              if (c.type === 'select') {
                cell = '<select class="select sm" ' + cellAttrs + '><option value="">—</option>' + (c.options || []).map(function (o) {
                  return '<option value="' + esc(o) + '"' + (String(row[c.name]) === String(o) ? ' selected' : '') + '>' + esc(o) + '</option>';
                }).join('') + '</select>';
              } else if (c.type === 'radio') {
                cell = '<div class="row gap-1 wrap">' + (c.options || []).map(function (o) {
                  return '<label class="text-xs nowrap"><input type="radio" name="' + esc(stepKey + '.' + f.name + '.' + i + '.' + c.name) + '" value="' + esc(o) + '" data-type="radio" ' + cellAttrs + (String(row[c.name]) === String(o) ? ' checked' : '') + '> ' + esc(o) + '</label>';
                }).join('') + '</div>';
              } else {
                cell = '<input class="input sm' + (c.type === 'currency' ? ' ltr' : '') + '" ' + (c.type === 'date' ? 'placeholder="۱۴۰۴/۰۱/۰۱" inputmode="numeric"' : '') +
                  ' type="' + (c.type === 'currency' || c.type === 'number' ? 'text' : 'text') + '" value="' + esc(row[c.name] || '') + '" ' + cellAttrs + '>';
              }
              return '<td' + (cellErr ? ' title="' + esc(cellErr) + '" style="border-color:var(--rose-400)"' : '') + '>' + cell + '</td>';
            }).join('') +
              '<td><button type="button" class="btn btn-sm btn-ghost danger" data-del-row="' + esc(f.name) + '" data-row-index="' + i + '">✕</button></td></tr>';
          }).join('') : '<tr><td colspan="' + (cols.length + 1) + '" class="text-center muted text-sm" style="padding:14px">هنوز ردیفی افزوده نشده است</td></tr>') +
          '</tbody></table>' +
          '<button type="button" class="btn btn-sm btn-soft mt-1" data-add-row="' + esc(f.name) + '">+ ' + esc(f.addLabel || 'افزودن ردیف') + '</button></div>';
      } else {
        var inputType = (f.type === 'currency' || f.type === 'date') ? 'text' : f.type;
        out += '<input class="input' + (f.type === 'currency' || f.type === 'number' ? ' ltr' : '') + '" type="' + inputType + '"' +
          (f.type === 'currency' || f.type === 'number' || f.type === 'date' ? ' inputmode="numeric"' : '') +
          ' placeholder="' + esc(f.placeholder || (f.type === 'date' ? '۱۴۰۴/۰۱/۰۱' : '')) + '" value="' + esc(val === undefined || val === null ? '' : val) + '" ' + attrs + '>';
      }
      if (f.help && f.type !== 'file' && f.type !== 'table') out += '<div class="hint">' + esc(f.help) + '</div>';
      if (error) out += '<div class="hint" style="color:var(--rose-600)">' + esc(error) + '</div>';
      out += '</div>';
      return out;
    }

    function bindFieldEvents(card, step) {
      var values = valuesOf(step.key);
      $$('[data-field]', card).forEach(function (inp) {
        var handler = function () {
          var type = inp.dataset.type;
          if (type === 'checkbox') {
            var group = $$('[data-field="' + inp.dataset.field + '"][data-step="' + inp.dataset.step + '"]', card);
            values[inp.dataset.field] = group.filter(function (i) { return i.checked; }).map(function (i) { return i.value; });
          } else if (type === 'switch') {
            values[inp.dataset.field] = inp.checked;
            var cl = inp.closest('.checkline'); if (cl) cl.classList.toggle('checked', inp.checked);
          } else if (type === 'radio') {
            values[inp.dataset.field] = inp.value;
            $$('input[name="' + inp.name + '"]', card).forEach(function (i2) { var pc = i2.closest('.radio-card'); if (pc) pc.classList.toggle('selected', i2.checked); });
          } else {
            var v = inp.value;
            if (type === 'currency' || type === 'number') v = en(v).replace(/[^\d.-]/g, '');
            values[inp.dataset.field] = v;
          }
          delete state.errors[step.key + '.' + inp.dataset.field];
          refreshVisibility(card, step.key);
          markDirty();
        };
        inp.addEventListener('input', handler);
        inp.addEventListener('change', handler);
        if (inp.dataset.type === 'date') attachJalali(inp);
      });
      $$('[data-tfield]', card).forEach(function (inp) {
        var handler = function () {
          var row = values[inp.dataset.tfield] && values[inp.dataset.tfield][+inp.dataset.trow];
          if (!row) return;
          if (inp.dataset.type === 'radio') {
            if (inp.checked) row[inp.dataset.tcol] = inp.value;
          } else {
            row[inp.dataset.tcol] = inp.dataset.tcol && /salary|number/i.test(inp.dataset.tcol) ? en(inp.value).replace(/[^\d]/g, '') : inp.value;
          }
          markDirty();
        };
        inp.addEventListener('input', handler);
        inp.addEventListener('change', handler);
      });
    }

    function refreshVisibility(card, stepKey) {
      var values = valuesOf(stepKey);
      var step = steps().filter(function (s) { return s.key === stepKey; })[0];
      if (!step) return;
      (step.fields || []).forEach(function (f) {
        var wrap = card.querySelector('[data-visible-for="' + f.name + '"]');
        if (wrap) toggle(wrap, isVisible(f, values));
      });
    }

    /* تاریخ شمسی ساده: تبدیل ورودی به قالب YYYY/MM/DD با اعداد فارسی */
    function attachJalali(input) {
      input.addEventListener('input', function () {
        var v = en(input.value).replace(/[^\d]/g, '').slice(0, 8);
        var out = v;
        if (v.length > 4) out = v.slice(0, 4) + '/' + v.slice(4);
        if (v.length > 6) out = out.slice(0, 7) + '/' + v.slice(6);
        input.value = fa(out);
      });
    }

    function markDirty() {
      state.dirty = true;
      updateSaveLabel('در حال ذخیره…');
      clearTimeout(state.timer);
      state.timer = setTimeout(function () { save().catch(function () { /* خطا در برچسب ذخیره نمایش داده می‌شود */ }); }, 1200);
    }

    function updateSaveLabel(text) {
      var el = $('#save-state');
      if (el) el.textContent = text;
    }

    function save(validateStepKey) {
      if (!state.app || state.submitted) return Promise.resolve(null);
      state.saving = true;
      updateSaveLabel('در حال ذخیره…');
      return api('/applications/' + state.app.id, {
        method: 'PUT',
        body: { answers: state.answers, progress: { currentStep: state.step }, validateStep: validateStepKey || undefined }
      }).then(function (res) {
        state.savedAt = res.savedAt;
        state.progress = res.progress || state.progress;
        state.errors = res.errors || {};
        state.dirty = false;
        state.completeness = res.completeness || null;
        updateSaveLabel('ذخیره شد — ' + jtime(res.savedAt));
        updateProgress();
        renderStepList();
        return res;
      }).catch(function (err) {
        if (err.code === 'need_auth') {
          toast('نشست شما منقضی شده است؛ دوباره وارد شوید.', 'error');
          state.applicant = null; renderLogin(); showState('state-login');
        } else updateSaveLabel('ذخیره نشد — دوباره تلاش می‌شود');
        throw err;
      }).then(function (r) { state.saving = false; return r; }, function (e) { state.saving = false; throw e; });
    }

    function updateProgress() {
      var pct = state.completeness && typeof state.completeness.percent === 'number'
        ? state.completeness.percent
        : Math.round(((state.step + 1) / stepCount()) * 100);
      var bar = $('#form-progress'); if (bar) bar.style.width = pct + '%';
      var label = $('#progress-label');
      if (label) label.textContent = fa(pct) + '٪ تکمیل — مرحله ' + fa(state.step + 1) + ' از ' + fa(stepCount());
    }

    function gotoStep(i) {
      if (i < 0 || i >= stepCount()) return;
      save().then(function () { state.step = i; renderForm(); window.scrollTo({ top: 120, behavior: 'smooth' }); })
        .catch(function () { /* خطای ذخیره نمایش داده شده */ });
    }

    function clientValidateStep(step) {
      var values = valuesOf(step.key);
      var errors = {};
      (step.fields || []).forEach(function (f) {
        if (['heading', 'note'].indexOf(f.type) > -1 || f.hiddenInWizard) return;
        if (!isVisible(f, values)) return;
        var v = values[f.name];
        var empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
        if (f.type === 'table' && Array.isArray(v)) {
          var filled = v.filter(function (r) { return Object.keys(r || {}).some(function (k) { return r[k] !== '' && r[k] !== null && r[k] !== undefined; }); });
          if ((f.minRows || 0) > 0 && filled.length < f.minRows) errors[step.key + '.' + f.name] = 'حداقل ' + fa(f.minRows) + ' ردیف لازم است';
          return;
        }
        if (f.required && empty) errors[step.key + '.' + f.name] = f.type === 'switch' ? 'تأیید این مورد الزامی است' : 'تکمیل این فیلد الزامی است';
      });
      return errors;
    }

    function nextStep() {
      var step = currentStep();
      var local = clientValidateStep(step);
      state.errors = Object.assign({}, state.errors, local);
      if (Object.keys(local).length) { renderStep(); updateSaveLabel('لطفاً خطاها را برطرف کنید'); return; }
      save(step.key).then(function (res) {
        if (res && res.errors && Object.keys(res.errors).length) { state.errors = res.errors; renderStep(); return; }
        if (state.step === stepCount() - 1) return submit();
        state.step += 1;
        renderForm();
        window.scrollTo({ top: 120, behavior: 'smooth' });
      }).catch(function () { /* پیام خطا */ });
    }

    function submit() {
      if (state.submitting) return;
      state.submitting = true;
      var btn = $('#btn-next');
      btnLoading(btn, true, 'در حال ثبت نهایی…');
      api('/applications/' + state.app.id + '/submit', { method: 'POST', body: { answers: state.answers } })
        .then(function (res) {
          localStorage.setItem('hrm_last_code', res.application.code);
          renderDone({ code: res.application.code, message: res.thanksMessage || 'فرم شما با موفقیت ثبت شد.', assessmentRequired: res.assessmentRequired, applicationId: state.app.id });
        })
        .catch(function (err) {
          if (err.fields) {
            state.errors = err.fields;
            var first = Object.keys(err.fields)[0];
            var idx = steps().findIndex(function (s) { return s.key === stepOfFieldKey(first); });
            if (idx > -1) state.step = idx;
            renderForm();
            toast('برخی فیلدهای اجباری تکمیل نشده‌اند.', 'error');
          } else toast(err.message, 'error');
        })
        .then(function () { state.submitting = false; btnLoading(btn, false); });
    }

    $('#btn-prev') && $('#btn-prev').addEventListener('click', function () { gotoStep(state.step - 1); });
    $('#btn-next') && $('#btn-next').addEventListener('click', nextStep);

    /* ---------- پایان فرم ---------- */
    function renderDone(res) {
      state.done = res;
      state.submitted = true;
      clearTimeout(state.timer);
      showState('state-done');
      var code = $('#done-code'); if (code) code.textContent = res.code || '—';
      var msg = $('#done-message');
      if (msg) msg.textContent = res.message || 'فرم استخدام شما با موفقیت ثبت شد.';
      var startBtn = $('#btn-start-assessment');
      var note = $('#assessment-note');
      var appId = res.applicationId || (state.app && state.app.id) || (state.submitted && state.submitted.id);
      if (startBtn) {
        toggle(startBtn, !!res.assessmentRequired, 'hidden');
        if (res.assessmentRequired) {
          startBtn.onclick = function () { startAssessment(appId); };
          if (note) note.textContent = 'تکمیل آزمون شخصیت‌شناسی، شانس بررسی پرونده شما را افزایش می‌دهد.';
        } else if (note) {
          note.textContent = 'نتیجه بررسی توسط کارشناسان منابع انسانی از طریق همین صفحه و بخش پیگیری قابل مشاهده است.';
        }
      }
      if (res.code) localStorage.setItem('hrm_last_code', res.code);
    }

    /* ---------- آزمون ---------- */
    function startAssessment(applicationId) {
      if (!applicationId) return toast('شناسه پرونده یافت نشد.', 'error');
      var box = $('#assess-questions');
      box.innerHTML = '<div class="skeleton" style="height:120px"></div>';
      showState('state-assessment');
      api('/assessment/' + applicationId)
        .then(function (data) {
          if (data.status === 'completed') {
            toast(data.message || 'این آزمون قبلاً تکمیل شده است.', 'info');
            $('#assess-questions').innerHTML = '<div class="card"><div class="text-sm">' + esc(data.message || '') + '</div>' +
              (data.showResultToApplicant && data.profileName ? '<div class="insight mint mt-2"><span class="ic">✓</span><div class="text-sm">تیپ شخصیتی شما: <span class="bold">' + esc(data.profileName) + '</span></div></div>' : '') + '</div>';
            showState('state-assessment');
            return;
          }
          renderAssessment(applicationId, data);
        })
        .catch(function (err) { toast(err.message, 'error'); showState('state-done'); });
    }

    var assess = { answers: {}, total: 0, answered: 0 };
    function renderAssessment(applicationId, data) {
      assess = { answers: {}, total: data.total, answered: 0 };
      var title = $('#assess-title'); if (title) title.textContent = data.title || 'آزمون شخصیت‌شناسی';
      var intro = $('#assess-intro'); if (intro) intro.textContent = data.intro || 'به گزینه‌ای که بیشتر شبیه شماست پاسخ دهید. پاسخ درست یا غلط وجود ندارد.';
      $('#assess-questions').innerHTML = data.questions.map(function (q) {
        return '<div class="card mb-2" data-q="' + fa(q.no) + '">' +
          '<div class="row gap-2" style="align-items:flex-start"><span class="badge badge-violet">' + fa(q.no) + '</span>' +
          '<div class="grow"><div class="text-sm bold mb-2">' + esc(q.text) + '</div>' +
          '<div class="col gap-1">' + q.options.map(function (o) {
            return '<label class="checkline" data-q="' + q.no + '" data-q-opt="' + q.no + '" data-q-val="' + esc(o.key) + '"><input type="radio" name="q' + q.no + '" value="' + esc(o.key) + '"><span class="text-sm grow">' + esc(o.label) + '</span></label>';
          }).join('') + '</div></div></div></div>';
      }).join('');

      $$('.checkline', $('#assess-questions')).forEach(function (line) {
        line.addEventListener('click', function (ev) {
          var inp = $('input', line);
          setTimeout(function () {
            if (!inp.checked) return;
            assess.answers[line.dataset.q] = line.dataset.qVal;
            $$('[data-q-opt="' + line.dataset.q + '"]').forEach(function (l2) { l2.classList.toggle('checked', l2 === line); });
            updateAssessProgress();
          }, 0);
        });
      });
      updateAssessProgress();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function updateAssessProgress() {
      var answered = Object.keys(assess.answers).length;
      assess.answered = answered;
      var bar = $('#assess-progress'); if (bar) bar.style.width = Math.round((answered / Math.max(1, assess.total)) * 100) + '%';
      var counter = $('#assess-counter'); if (counter) counter.textContent = fa(answered) + ' از ' + fa(assess.total);
      var btn = $('#btn-submit-assessment'); if (btn) btn.disabled = answered < assess.total;
    }

    $('#btn-submit-assessment') && $('#btn-submit-assessment').addEventListener('click', function () {
      var btn = this;
      var applicationId = state.done && (state.done.applicationId || (state.app && state.app.id));
      btnLoading(btn, true, 'در حال ثبت آزمون…');
      api('/assessment/' + applicationId + '/submit', { method: 'POST', body: { answers: assess.answers } })
        .then(function (res) {
          $('#assess-questions').innerHTML = '<div class="card text-center" style="padding:30px">' +
            '<div class="success-circle">✓</div><h3>آزمون شما ثبت شد</h3>' +
            '<p class="muted text-sm">' + esc(res.message || '') + '</p>' +
            (res.showResultToApplicant && res.profileName ? '<div class="insight mint mt-2"><span class="ic">✓</span><div class="text-sm">تیپ شخصیتی شما: <span class="bold">' + esc(res.type) + ' — ' + esc(res.profileName) + '</span></div></div>' : '') +
            '<a class="btn btn-primary mt-3" href="/track">پیگیری وضعیت درخواست</a></div>';
          var bar = $('#assess-progress'); if (bar) bar.style.width = '100%';
        })
        .catch(function (err) { toast(err.message, 'error'); })
        .then(function () { btnLoading(btn, false); });
    });

    state.boot();
  }

  /* ══════════════════════════════════════════════ پیگیری وضعیت */
  function initTrack() {
    var codeInput = $('#track-code');
    var mobileInput = $('#track-mobile');
    var alertBox = $('#track-alert');
    var result = $('#track-result');
    if (!codeInput) return;
    var last = localStorage.getItem('hrm_last_code');
    if (last && !codeInput.value) codeInput.value = last;
    var lastMobile = localStorage.getItem('hrm_last_mobile');
    if (lastMobile && mobileInput && !mobileInput.value) mobileInput.value = lastMobile;

    function showAlert(msg) { if (alertBox) { alertBox.classList.remove('hidden'); $('.text-sm', alertBox).textContent = msg; } }

    function lookup() {
      var code = en(codeInput.value).trim().toUpperCase();
      var mobile = en(mobileInput.value).replace(/\D/g, '');
      if (!code) return showAlert('کد رهگیری را وارد کنید.');
      if (alertBox) alertBox.classList.add('hidden');
      var btn = $('#btn-track');
      btnLoading(btn, true, 'در حال بررسی…');
      api('/track?code=' + encodeURIComponent(code) + (mobile ? '&mobile=' + mobile : ''))
        .then(function (data) { renderTrack(data.application); })
        .catch(function (err) { showAlert(err.message); toggle(result, false); })
        .then(function () { btnLoading(btn, false); });
    }

    function renderTrack(app) {
      toggle(result, true);
      $('#track-code-out').textContent = app.code;
      var st = $('#track-status');
      st.textContent = app.statusTitle;
      st.className = 'badge badge-' + (app.statusColor || 'sky');
      $('#track-job').textContent = app.jobTitle || '—';
      $('#track-date').textContent = jdateTime(app.submittedAt);
      var assessment = { completed: 'تکمیل‌شده ✓', invited: 'در انتظار تکمیل', required: 'در انتظار تکمیل', not_required: 'نیاز نبوده', failed: 'ناتمام' }[app.assessmentStatus] || '—';
      $('#track-assessment').textContent = assessment;
      var interviewBox = $('#track-interview');
      if (app.nextInterview) {
        toggle(interviewBox, true);
        $('#track-interview-text').textContent = 'مصاحبه شما در تاریخ ' + jdateTime(app.nextInterview.at) + ' به‌صورت ' +
          ({ 'in-person': 'حضوری', 'حضوری': 'حضوری', online: 'آنلاین', phone: 'تلفنی', video: 'ویدیویی' }[app.nextInterview.mode] || app.nextInterview.mode || '—') + ' برگزار می‌شود.';
      } else toggle(interviewBox, false);
      $('#track-desc').textContent = app.statusDescription || '';

      var timeline = $('#track-timeline');
      if (timeline) {
        timeline.innerHTML = (app.timeline || []).length
          ? app.timeline.slice().reverse().map(function (t) {
            return '<div class="timeline-item"><div class="dot"></div><div><div class="text-sm">' + esc(t.title) + '</div>' +
              '<div class="text-xs muted">' + jdateTime(t.at) + '</div></div></div>';
          }).join('')
          : '<div class="text-sm muted">روندی برای نمایش وجود ندارد.</div>';
      }
      if (result && typeof result.scrollIntoView === 'function') result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    $('#btn-track').addEventListener('click', lookup);
    codeInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') lookup(); });
    mobileInput && mobileInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') lookup(); });
  }

  /* ---------------------------------------------------------- راه‌اندازی */
  document.addEventListener('DOMContentLoaded', function () {
    var applyRoot = document.getElementById('apply-root');
    if (applyRoot) initApply(applyRoot);
    if (document.getElementById('btn-track')) initTrack();
  });
})();
