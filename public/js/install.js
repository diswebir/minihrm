/* ویزارد نصب — تست پیامک و تعامل‌های کوچک */
(function () {
  'use strict';
  const btn = document.getElementById('btn-test-sms');
  if (btn) {
    btn.addEventListener('click', async () => {
      const form = document.getElementById('sms-form');
      const result = document.getElementById('sms-test-result');
      const mobile = document.getElementById('test-mobile').value.trim();
      if (!mobile) { result.textContent = 'شماره موبایل تست را وارد کنید.'; result.style.color = 'var(--rose-600)'; return; }
      btn.disabled = true;
      btn.textContent = 'در حال تست…';
      result.textContent = '';
      const body = new URLSearchParams({
        smsApiKey: form.smsApiKey.value,
        smsSender: form.smsSender.value,
        smsPatternCode: form.smsPatternCode.value,
        smsBaseUrl: '',
        testMobile: mobile
      });
      try {
        const res = await fetch('/install/test-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString()
        });
        const json = await res.json();
        if (json.ok) {
          const credit = json.data.credit;
          let msg = 'اتصال برقرار شد. ';
          if (json.data.sent) msg += 'پیام آزمایشی ارسال شد. ';
          else msg += `ارسال پیام ناموفق بود: ${json.data.error || ''} `;
          if (credit && credit.credit !== undefined) msg += `اعتبار حساب: ${new Intl.NumberFormat('fa-IR').format(Math.floor(credit.credit))} ریال`;
          result.textContent = msg;
          result.style.color = 'var(--mint-600)';
        } else {
          result.textContent = json.error || 'تست ناموفق بود';
          result.style.color = 'var(--rose-600)';
        }
      } catch (e) {
        result.textContent = 'خطا در ارتباط با سرور';
        result.style.color = 'var(--rose-600)';
      } finally {
        btn.disabled = false;
        btn.textContent = 'تست اتصال و ارسال پیام آزمایشی';
      }
    });
  }

  // نمایش انتخاب ماژول
  document.querySelectorAll('.module-card input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => cb.closest('.module-card').classList.toggle('selected', cb.checked));
  });
})();
