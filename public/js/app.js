/* MiniHRM — اسکریپت‌های عمومی رابط کاربری */
(function () {
  'use strict';

  /* ---------- منوی موبایل ---------- */
  document.addEventListener('click', function (e) {
    const toggle = e.target.closest('.menu-toggle');
    if (toggle) {
      const sb = document.querySelector('.sidebar');
      if (sb) {
        sb.classList.toggle('open');
        toggle.setAttribute('aria-expanded', sb.classList.contains('open') ? 'true' : 'false');
      }
      return;
    }
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && sidebar.classList.contains('open') && !e.target.closest('.sidebar') && !e.target.closest('.menu-toggle')) {
      sidebar.classList.remove('open');
      const t = document.querySelector('.menu-toggle');
      if (t) t.setAttribute('aria-expanded', 'false');
    }
  });
  // بستن سایدبار / دراپ‌داون با کلید Escape
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      const t = document.querySelector('.menu-toggle');
      if (t) { t.setAttribute('aria-expanded', 'false'); t.focus(); }
    }
    const dd = document.getElementById('notif-dropdown');
    if (dd && dd.style.display !== 'none') {
      dd.style.display = 'none';
      const bell = document.querySelector('[data-notif-toggle]');
      if (bell) { bell.setAttribute('aria-expanded', 'false'); bell.focus(); }
    }
  });

  /* ---------- کاشی‌های انتخابی (radio/checkbox tiles) ---------- */
  function syncTiles() {
    document.querySelectorAll('.option-tile').forEach(function (tile) {
      const input = tile.querySelector('input');
      if (!input) return;
      tile.classList.toggle('selected', !!input.checked);
      input.addEventListener('change', function () {
        if (input.type === 'radio') {
          document.querySelectorAll(`input[name="${input.name}"]`).forEach(function (r) {
            r.closest('.option-tile')?.classList.toggle('selected', r.checked);
          });
        } else {
          tile.classList.toggle('selected', input.checked);
        }
      });
    });
  }
  syncTiles();

  /* ---------- ریپیترها (ردیف‌های تکرارشونده) ---------- */
  document.addEventListener('click', function (e) {
    const addBtn = e.target.closest('.repeater-add');
    if (addBtn) {
      const targetId = addBtn.getAttribute('data-target');
      const tpl = document.getElementById('tpl-' + targetId);
      const container = document.getElementById(targetId);
      if (!tpl || !container) return;
      const index = container.querySelectorAll('.repeater-row').length;
      let html = tpl.innerHTML.replace(/__IDX__/g, index);
      const wrap = document.createElement('div');
      wrap.innerHTML = html;
      const row = wrap.firstElementChild;
      container.appendChild(row);
      syncTiles();
      // فوکوس روی اولین فیلد
      const first = row.querySelector('input, select, textarea');
      if (first) first.focus();
      reindexRows(container, targetId);
      const emptyBox = container.parentElement.querySelector('.repeater-empty');
      if (emptyBox) emptyBox.style.display = 'none';
      return;
    }
    const removeBtn = e.target.closest('.row-remove');
    if (removeBtn) {
      const row = removeBtn.closest('.repeater-row');
      const container = row.closest('.repeater-container');
      const targetId = container.id;
      row.remove();
      reindexRows(container, targetId);
      const emptyBox = container.parentElement.querySelector('.repeater-empty');
      if (emptyBox) emptyBox.style.display = container.querySelectorAll('.repeater-row').length ? 'none' : '';
    }
  });

  function reindexRows(container, targetId) {
    // نام‌گذاری: فیلدهای پیش‌فرض rows[i][col] — فیلدهای سفارشی rows_<key>[i][col]
    const fk = targetId.indexOf('rep-') === 0 ? targetId.slice(4) : targetId;
    const prefix = fk.indexOf('custom_') === 0 ? 'rows_' + fk : 'rows';
    container.querySelectorAll('.repeater-row').forEach(function (row, idx) {
      row.querySelectorAll('[data-col]').forEach(function (input) {
        const col = input.getAttribute('data-col');
        input.name = `${prefix}[${idx}][${col}]`;
      });
      const num = row.querySelector('.row-num');
      if (num) num.textContent = idx + 1;
    });
  }
  document.querySelectorAll('.repeater-container').forEach(function (c) {
    reindexRows(c, c.id);
  });

  /* ---------- بخش فیلدهای اختیاری (جمع‌شدنی) ---------- */
  const optDetails = document.getElementById('optional-fields');
  if (optDetails) {
    // اگر مقداری از قبل ذخیره شده باشد، بخش باز می‌شود
    const hasVal = Array.prototype.some.call(optDetails.querySelectorAll('input, select, textarea'), function (el) {
      if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
      return !!(el.value && el.value.trim());
    });
    if (hasVal) optDetails.open = true;
    // با انتخاب «متاهل»، فیلدهای همسر (داخل بخش اختیاری) در دسترس قرار می‌گیرند
    const marital = document.querySelector('select[name="f_marital_status"]');
    if (marital) {
      marital.addEventListener('change', function () {
        if (marital.value === 'married') optDetails.open = true;
      });
      if (marital.value === 'married') optDetails.open = true;
    }
  }

  /* ---------- تب‌ها (با پشتیبانی کیبورد و ARIA) ---------- */
  function activateTab(tab) {
    const group = tab.closest('.tabs');
    const container = group && group.getAttribute('data-tabs-container');
    if (!container) return;
    group.querySelectorAll('.tab').forEach(function (t) {
      const on = t === tab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.setAttribute('tabindex', on ? '0' : '-1');
    });
    const target = tab.getAttribute('data-tab');
    document.querySelectorAll('#' + container + ' > [data-tab-panel]').forEach(function (panel) {
      panel.style.display = panel.getAttribute('data-tab-panel') === target ? '' : 'none';
    });
    if (history.replaceState) history.replaceState(null, '', '#' + target);
  }
  document.addEventListener('click', function (e) {
    const tab = e.target.closest('.tab');
    if (tab && tab.closest('.tabs') && tab.closest('.tabs').getAttribute('data-tabs-container')) {
      activateTab(tab);
    }
  });
  // جهت‌یابی فلش‌ها (راست/چپ) بین تب‌ها
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    const tab = e.target.closest && e.target.closest('.tab');
    if (!tab) return;
    const tabs = Array.prototype.slice.call(tab.closest('.tabs').querySelectorAll('.tab'));
    const i = tabs.indexOf(tab);
    let n = null;
    if (e.key === 'ArrowLeft') n = tabs[(i + 1) % tabs.length];      // RTL: فلش چپ = بعدی
    if (e.key === 'ArrowRight') n = tabs[(i - 1 + tabs.length) % tabs.length];
    if (e.key === 'Home') n = tabs[0];
    if (e.key === 'End') n = tabs[tabs.length - 1];
    if (n) { e.preventDefault(); n.focus(); activateTab(n); }
  });
  // باز کردن تب از روی هشتگ URL (#sms و ...)
  (function () {
    const h = location.hash.replace('#', '');
    if (!h) return;
    const tab = document.querySelector('.tabs .tab[data-tab="' + h + '"]');
    if (tab) activateTab(tab);
  })();

  /* ---------- درخواست‌های AJAX ساده ---------- */
  window.hrmPost = async function (url, data) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(data || {})
      });
      return await res.json();
    } catch (err) {
      return { ok: false, message: 'خطای شبکه. دوباره تلاش کنید.' };
    }
  };

  window.hrmToast = function (message, type) {
    let box = document.getElementById('hrm-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'hrm-toast';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      box.style.cssText = 'position:fixed;bottom:22px;left:22px;z-index:999;display:flex;flex-direction:column;gap:10px;';
      document.body.appendChild(box);
    }
    const el = document.createElement('div');
    const colors = {
      ok: 'background:#e3f8f3;color:#127863;border:1.5px solid #bfeee3;',
      err: 'background:#ffe9ee;color:#c8455f;border:1.5px solid #ffc9d4;',
      info: 'background:#e7f4fe;color:#2279b8;border:1.5px solid #c4e4fa;'
    };
    el.style.cssText = 'padding:13px 20px;border-radius:14px;font-weight:600;font-size:.86rem;box-shadow:0 12px 30px rgba(70,80,160,.2);animation:hrmIn .25s ease;max-width:340px;' + (colors[type] || colors.ok);
    el.textContent = message;
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, 4200);
  };

  /* ---------- تایید عملیات‌ها + وضعیت بارگذاری دکمه‌ها ---------- */
  document.addEventListener('submit', function (e) {
    const form = e.target;
    if (form.hasAttribute('data-confirm')) {
      if (!window.confirm(form.getAttribute('data-confirm') || 'آیا مطمئن هستید؟')) {
        e.preventDefault();
        return;
      }
    }
    // غیرفعال‌سازی دکمه ثبت و نمایش وضعیت بارگذاری (جلوگیری از ارسال دوباره)
    const btn = form.querySelector('button[type="submit"]:not([data-no-loading])');
    if (btn && form.checkValidity()) {
      btn.disabled = true;
      if (!btn.getAttribute('data-old-text')) {
        btn.setAttribute('data-old-text', btn.textContent);
        btn.textContent = btn.getAttribute('data-loading-text') || 'در حال ثبت...';
      }
    }
  });

  /* ---------- فوکوس خودکار روی اولین فیلد نامعتبر ---------- */
  (function () {
    const invalid = document.querySelector('form :invalid');
    if (invalid && invalid.focus) {
      try { invalid.focus({ preventScroll: false }); } catch (_) { invalid.focus(); }
    }
  })();

  document.addEventListener('click', async function (e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (action === 'toggle-module') {
      e.preventDefault();
      if (btn.disabled) return;
      btn.disabled = true;
      const res = await hrmPost(btn.getAttribute('data-url'), {});
      btn.disabled = false;
      if (res.ok) {
        hrmToast(res.message, 'ok');
        setTimeout(() => location.reload(), 600);
      } else {
        hrmToast(res.message || 'خطا رخ داد', 'err');
      }
    }
    if (action === 'toggle-required') {
      e.preventDefault();
      if (btn.disabled) return;
      btn.disabled = true;
      const res = await hrmPost(btn.getAttribute('data-url'), {});
      btn.disabled = false;
      if (res.ok) {
        hrmToast(res.message, 'ok');
        setTimeout(() => location.reload(), 600);
      } else {
        hrmToast(res.message || 'خطا رخ داد', 'err');
      }
    }
    if (action === 'status-change') {
      e.preventDefault();
      const res = await hrmPost(btn.getAttribute('data-url'), { status: btn.getAttribute('data-status') });
      if (res.ok) {
        hrmToast(res.message, 'ok');
        setTimeout(() => location.reload(), 550);
      } else {
        hrmToast(res.message || 'خطا رخ داد', 'err');
      }
    }
    if (action === 'delete-row') {
      e.preventDefault();
      if (!confirm(btn.getAttribute('data-confirm') || 'آیا مطمئن هستید؟')) return;
      const res = await hrmPost(btn.getAttribute('data-url'), {});
      if (res.ok) {
        hrmToast(res.message, 'ok');
        setTimeout(() => location.reload(), 550);
      } else {
        hrmToast(res.message || 'خطا رخ داد', 'err');
      }
    }
  });

  /* ---------- اعلان‌ها ---------- */
  const bell = document.querySelector('[data-notif-toggle]');
  if (bell) {
    bell.setAttribute('aria-expanded', 'false');
    bell.setAttribute('aria-haspopup', 'true');
    bell.addEventListener('click', function (e) {
      e.preventDefault();
      const dd = document.getElementById('notif-dropdown');
      if (dd) {
        const open = dd.style.display === 'none' || !dd.style.display;
        dd.style.display = open ? 'block' : 'none';
        bell.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
    });
    document.addEventListener('click', function (e) {
      const dd = document.getElementById('notif-dropdown');
      if (dd && !e.target.closest('[data-notif-toggle]') && !e.target.closest('#notif-dropdown')) {
        dd.style.display = 'none';
        bell.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- OTP ---------- */
  const otpForm = document.getElementById('otp-form');
  if (otpForm) {
    otpForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const phone = otpForm.querySelector('[name=phone]').value;
      const msgBox = document.getElementById('otp-msg');
      const btn = otpForm.querySelector('button[type=submit]');
      btn.disabled = true;
      const res = await hrmPost('/api/otp/send', { phone: phone });
      btn.disabled = false;
      if (res.ok) {
        msgBox.innerHTML = '<div class="alert success">' + (res.message || 'کد ارسال شد') + '</div>' +
          (res.devCode ? '<div class="dev-code">' + res.devCode + '</div><div class="help text-center">کد آزمایشی (درایور تست)</div>' : '');
        document.getElementById('verify-section').style.display = '';
        otpForm.querySelector('[name=phone]').readOnly = true;
      } else {
        msgBox.innerHTML = '<div class="alert error">' + (res.message || 'خطا رخ داد') + '</div>';
      }
    });
  }
  const verifyForm = document.getElementById('verify-form');
  if (verifyForm) {
    verifyForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const phone = document.querySelector('#otp-form [name=phone]').value;
      const code = verifyForm.querySelector('[name=code]').value;
      const msgBox = document.getElementById('otp-msg');
      const res = await hrmPost('/api/otp/verify', { phone: phone, code: code });
      if (res.ok) {
        // ادامه ویزارد
        const startForm = document.getElementById('continue-form');
        if (startForm) startForm.submit();
        else window.location.href = '/apply/status';
      } else {
        msgBox.innerHTML = '<div class="alert error">' + (res.message || 'خطا رخ داد') + '</div>';
      }
    });
  }

  /* ---------- نمودارها (SVG ساده) ---------- */
  window.renderMiniBars = function (el, data) {
    if (!el || !data || !data.length) return;
    const max = Math.max(...data.map(d => d.value || d.c || 0), 1);
    el.innerHTML = data.map(function (d) {
      const v = d.value !== undefined ? d.value : (d.c || 0);
      const h = Math.max(6, Math.round((v / max) * 100));
      return `<div class="chart-bar" style="height:${h}%" title="${d.label || d.d || ''}: ${v}"></div>`;
    }).join('');
  };

  /* ---------- تاریخ شمسی ساده برای فیلدهای date ---------- */
  document.querySelectorAll('input[data-jalali]').forEach(function (input) {
    input.setAttribute('placeholder', 'مثال: 1370/05/12');
    input.setAttribute('inputmode', 'numeric');
    input.addEventListener('input', function () {
      let v = input.value.replace(/[^\d/]/g, '');
      if (v.length === 4 && !v.includes('/')) v += '/';
      if (v.length === 7 && (v.match(/\//g) || []).length === 1) v += '/';
      input.value = v.slice(0, 10);
    });
  });
})();

/* انیمیشن ورود توست */
const style = document.createElement('style');
style.textContent = '@keyframes hrmIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}';
document.head.appendChild(style);
