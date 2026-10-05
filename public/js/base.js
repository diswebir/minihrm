/**
 * shim پیشوند نصب (زیرمسیر) — اولین اسکریپت همه صفحات
 * ------------------------------------------------------------------
 * اگر سامانه در زیرمسیری مثل https://example.com/hrm اجرا شود، همه آدرس‌های
 * مطلق سمت کلاینت (fetch/XHR/لینک‌ها/window.open/history) باید پیشوند بگیرند.
 * این فایل پیشوند را از ویژگی data-base روی تگ <html> می‌خواند و یک‌بار برای
 * همیشه رفتار مرورگر را وصله می‌کند؛ بنابراین فایل‌های دیگر نیازی به تغییر
 * ندارند. اگر پیشوند خالی باشد، هیچ وصله‌ای اعمال نمی‌شود (حالت عادی).
 */
(function () {
  'use strict';
  var el = document.documentElement;
  var base = ((el && el.getAttribute('data-base')) || '').replace(/\/+$/, '');
  if (base === '/') base = '';
  window.__HRM_BASE__ = base;

  /** تبدیل مسیر مطلق داخلی به مسیر با پیشوند */
  window.hrmUrl = function (p) {
    if (typeof p !== 'string' || p === '' || p.charAt(0) !== '/') return p;
    if (p.charAt(1) === '/') return p;                       // پروتکل-نسبی
    if (base && (p === base || p.indexOf(base + '/') === 0)) return p;
    return base + p;
  };

  /** آیا مسیر داخلی است؟ (برای بازنویسی لینک‌ها) */
  function isInternal(p) { return typeof p === 'string' && p.charAt(0) === '/' && p.charAt(1) !== '/'; }

  if (!base) return;   // اجرا روی ریشه → نیازی به وصله نیست

  // --- fetch
  if (typeof window.fetch === 'function') {
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        if (isInternal(input)) input = window.hrmUrl(input);
        else if (input && typeof input === 'object' && typeof input.url === 'string' && input.url.indexOf(location.origin) === 0) {
          var u = new URL(input.url);
          if (isInternal(u.pathname)) {
            var req2 = new Request(location.origin + window.hrmUrl(u.pathname + u.search), input);
            return origFetch.call(this, req2, init);
          }
        }
      } catch (e) { /* در صورت خطا، همان درخواست اصلی */ }
      return origFetch.call(this, input, init);
    };
  }

  // --- XMLHttpRequest
  if (window.XMLHttpRequest && window.XMLHttpRequest.prototype.open) {
    var origOpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function (method, url) {
      if (isInternal(url)) arguments[1] = window.hrmUrl(url);
      return origOpen.apply(this, arguments);
    };
  }

  // --- window.open
  if (typeof window.open === 'function') {
    var origWin = window.open;
    window.open = function (url) {
      if (isInternal(url)) arguments[0] = window.hrmUrl(url);
      return origWin.apply(window, arguments);
    };
  }

  // --- history.pushState / replaceState
  ['pushState', 'replaceState'].forEach(function (k) {
    var orig = history[k];
    if (typeof orig !== 'function') return;
    history[k] = function (state, title, url) {
      if (isInternal(url)) arguments[2] = window.hrmUrl(url);
      return orig.apply(history, arguments);
    };
  });

  // --- کلیک روی لینک‌های داخلی (لینک‌هایی که با JS ساخته می‌شوند)
  document.addEventListener('click', function (ev) {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (!isInternal(href)) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download')) return;
    if (base && (href === base || href.indexOf(base + '/') === 0)) return;
    ev.preventDefault();
    location.href = window.hrmUrl(href);
  }, true);

  // --- ارسال فرم‌های داخلی
  document.addEventListener('submit', function (ev) {
    var f = ev.target;
    if (!f || f.tagName !== 'FORM') return;
    var act = f.getAttribute('action');
    if (isInternal(act)) f.setAttribute('action', window.hrmUrl(act));
  }, true);

  // --- ویژگی src که با JS تنظیم می‌شود (مثل بارگذاری ماژول‌های پنل)
  try {
    var desc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src')
      || Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (desc && desc.set) {
      Object.defineProperty(HTMLScriptElement.prototype, 'src', {
        configurable: true, enumerable: desc.enumerable,
        get: function () { return desc.get.call(this); },
        set: function (v) { return desc.set.call(this, window.hrmUrl(v)); }
      });
    }
  } catch (e) { /* اختیاری */ }
})();
