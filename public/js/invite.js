/* فعال‌سازی حساب با لینک دعوت */
(function () {
  'use strict';
  const form = document.getElementById('invite-form');
  const errorBox = document.getElementById('invite-error');
  const successBox = document.getElementById('invite-success');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.add('hidden');
    const btn = document.getElementById('invite-submit');
    btn.disabled = true;
    btn.textContent = 'در حال ذخیره…';
    try {
      const res = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'HRM' },
        body: JSON.stringify({
          token: form.token.value,
          password: form.password.value,
          confirmPassword: form.confirmPassword.value
        })
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || 'خطا در انجام عملیات');
      successBox.textContent = 'حساب شما فعال شد. در حال انتقال به پنل…';
      successBox.classList.remove('hidden');
      setTimeout(() => { location.href = '/admin'; }, 900);
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'تعیین رمز عبور و ورود';
    }
  });
})();
