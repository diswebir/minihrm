/* صفحه ورود — رمز عبور یا کد پیامکی */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const tabs = document.querySelectorAll('#login-tabs [data-method]');
  const formPassword = $('#form-password');
  const formOtp = $('#form-otp');
  const errorBox = $('#login-error');
  let mobile = '';

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.remove('hidden');
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function clearError() { errorBox.classList.add('hidden'); }

  function setTab(method) {
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.method === method));
    formPassword.classList.toggle('hidden', method !== 'password');
    formOtp.classList.toggle('hidden', method !== 'otp');
    clearError();
    const first = method === 'password' ? $('#login-field') : $('#otp-mobile');
    if (first) first.focus();
  }
  tabs.forEach((t) => t.addEventListener('click', () => setTab(t.dataset.method)));

  async function post(url, body) {
    const res = await fetch('/api' + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'HRM' },
      body: JSON.stringify(body)
    });
    let json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    if (!res.ok || !json || json.ok === false) {
      throw new Error((json && json.error) || 'خطا در ارتباط با سرور');
    }
    return json.data;
  }

  formPassword.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    const btn = $('#btn-password');
    btn.disabled = true;
    btn.textContent = 'در حال ورود…';
    try {
      const data = await post('/auth/login', {
        login: formPassword.login.value.trim(),
        password: formPassword.password.value
      });
      location.href = window.hrmUrl ? window.hrmUrl('/admin') : '/admin';
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = 'ورود به پنل';
    }
  });

  $('#btn-otp-request').addEventListener('click', async (e) => {
    e.preventDefault();
    clearError();
    mobile = $('#otp-mobile').value.trim();
    const btn = $('#btn-otp-request');
    btn.disabled = true;
    btn.textContent = 'در حال ارسال…';
    try {
      const data = await post('/auth/otp/request', { mobile });
      $('#otp-step-mobile').classList.add('hidden');
      $('#otp-step-code').classList.remove('hidden');
      let hint = 'کد پیامکی ارسال شد.';
      if (data.simulated) hint = 'حالت آزمایشی پیامک فعال است؛ ارسال واقعی انجام نشد.';
      if (data.devCode) hint += ` کد شما: ${data.devCode}`;
      $('#otp-hint').textContent = hint;
      const inputs = document.querySelectorAll('#otp-inputs input');
      inputs[0].focus();
      startResendTimer(60);
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'ارسال کد ورود';
    }
  });

  const inputs = Array.from(document.querySelectorAll('#otp-inputs input'));
  inputs.forEach((inp, idx) => {
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/[^\d۰-۹]/g, '').replace(/[۰-۹]/g, (c) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c));
      if (inp.value && idx < inputs.length - 1) inputs[idx + 1].focus();
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !inp.value && idx > 0) inputs[idx - 1].focus();
      if (e.key === 'Enter') $('#btn-otp-verify').click();
    });
    inp.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      if (text) {
        e.preventDefault();
        text.split('').slice(0, inputs.length).forEach((ch, i) => { inputs[i].value = ch; });
        inputs[Math.min(text.length, inputs.length - 1)].focus();
      }
    });
  });

  $('#btn-otp-verify').addEventListener('click', async (e) => {
    e.preventDefault();
    clearError();
    const code = inputs.map((i) => i.value).join('');
    if (code.length < inputs.length) return showError('کد ۵ رقمی را کامل وارد کنید.');
    const btn = $('#btn-otp-verify');
    btn.disabled = true;
    btn.textContent = 'در حال بررسی…';
    try {
      await post('/auth/otp/verify', { mobile, code });
      location.href = window.hrmUrl ? window.hrmUrl('/admin') : '/admin';
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = 'تأیید و ورود';
      inputs.forEach((i) => { i.value = ''; });
      inputs[0].focus();
    }
  });

  $('#btn-otp-back').addEventListener('click', () => {
    $('#otp-step-code').classList.add('hidden');
    $('#otp-step-mobile').classList.remove('hidden');
    clearError();
  });

  function startResendTimer(seconds) {
    const btn = $('#btn-otp-resend');
    let left = seconds;
    btn.disabled = true;
    btn.textContent = `ارسال مجدد (${left})`;
    const timer = setInterval(() => {
      left--;
      if (left <= 0) {
        clearInterval(timer);
        btn.disabled = false;
        btn.textContent = 'ارسال مجدد کد';
      } else btn.textContent = `ارسال مجدد (${left})`;
    }, 1000);
  }
  $('#btn-otp-resend').addEventListener('click', async () => {
    try {
      const data = await post('/auth/otp/request', { mobile });
      let hint = 'کد جدید ارسال شد.';
      if (data.simulated) hint = 'حالت آزمایشی پیامک فعال است.';
      if (data.devCode) hint += ` کد شما: ${data.devCode}`;
      $('#otp-hint').textContent = hint;
      startResendTimer(60);
    } catch (err) { showError(err.message); }
  });

  const first = $('#login-field') || $('#otp-mobile');
  if (first) first.focus();
})();
