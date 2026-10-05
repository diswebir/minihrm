/* راه‌اندازی پنل مدیریت */
(function () {
  'use strict';
  function boot() {
    if (!window.HRM) { setTimeout(boot, 60); return; }
    if (document.getElementById('outlet')) HRM.loadApp();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
