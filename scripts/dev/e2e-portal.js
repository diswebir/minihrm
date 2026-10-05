/* E2E مرورگرگونه پورتال متقاضی با jsdom (فقط توسعه) */
const { JSDOM, requestInterceptor } = require(process.env.JSDOM_PATH || 'jsdom');
const fs = require('fs');
const BASE = (process.env.HRM_BASE || 'http://localhost:3000').replace(/\/+$/, '');
const path = require('path');
const ROOT = process.env.HRM_APP_ROOT || path.resolve(__dirname, '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on('unhandledRejection', (e) => console.log('  (unhandled rejection در صفحه):', (e && e.message) || e));
const jar = new Map();

function cookieHeader() {
  return Array.from(jar.entries()).map(([k, v]) => k + '=' + v).join('; ');
}
function storeCookies(res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const c of list) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
async function localFetch(url, init = {}) {
  const headers = Object.assign({}, init.headers || {});
  const ck = cookieHeader();
  if (ck) headers.Cookie = ck;
  const res = await fetch(url, Object.assign({}, init, { headers, redirect: 'manual' }));
  storeCookies(res);
  return res;
}
const loader = requestInterceptor(async (request) => {
  try {
    const url = request.url.replace(/^https?:\/\/localhost:3000/, BASE);
    const res = await localFetch(url, { method: request.method });
    const buf = Buffer.from(await res.arrayBuffer());
    return new Response(buf, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') || 'application/octet-stream' } });
  } catch (e) { return new Response('', { status: 502 }); }
});

function makePage(html, url) {
  const errors = [];
  const dom = new JSDOM(html, {
    url,
    runScripts: 'dangerously',
    resources: { interceptors: [loader] },
    pretendToBeVisual: true,
    virtualConsole: undefined,
    beforeParse(window) {
      window.scrollTo = () => {};
      window.__netlog = [];
      window.fetch = async (input, init = {}) => {
        const raw = String(input);
        // BASE ممکن است پیشوند مسیر داشته باشد؛ URL را مثل مرورگر حل می‌کنیم
        const target = new URL(raw, BASE + '/').href;
        const headers = Object.assign({}, init.headers || {});
        const ck = cookieHeader();
        if (ck) headers.Cookie = ck;
        const res = await fetch(target, { method: init.method || 'GET', headers, body: init.body, redirect: 'manual' });
        storeCookies(res);
        const buf = Buffer.from(await res.arrayBuffer());
        if (window.__netlog) window.__netlog.push((init.method || 'GET') + ' ' + raw + ' → ' + res.status + (res.ok ? '' : ' ' + buf.toString('utf8').slice(0, 160)));
        return {
          ok: res.ok, status: res.status, headers: res.headers,
          json: async () => JSON.parse(buf.toString('utf8')),
          text: async () => buf.toString('utf8'),
          blob: async () => new window.Blob([buf])
        };
      };
      window.addEventListener('error', (e) => errors.push('window.error: ' + (e.message || (e.error && e.error.message))));
      window.addEventListener('unhandledrejection', (e) => errors.push('unhandled: ' + ((e.reason && e.reason.message) || e.reason)));
    }
  });
  return { dom, errors, w: dom.window };
}

async function until(fn, label, tries = 100, gap = 100) {
  for (let i = 0; i < tries; i++) { try { const v = fn(); if (v) return v; } catch (e) { /* ignore */ } await sleep(gap); }
  throw new Error('timeout: ' + label);
}

function otpFromLog(mobile) {
  const logs = JSON.parse(fs.readFileSync(ROOT + '/data/db/sms_logs.json', 'utf8'));
  const rows = (logs.rows || logs).filter((r) => String(r.to).includes(mobile.slice(-10)) && /کد/.test(r.text || ''));
  const last = rows[rows.length - 1];
  if (!last) return null;
  const m = (last.text || '').match(/(\d{5})/);
  return m ? m[1] : null;
}

(async () => {
  const boot = await (await localFetch(BASE + '/api/portal/bootstrap')).json();
  const job = boot.data.jobs[0];
  const slug = job.slug;
  const mobile = '0912' + String(7000000 + Math.floor(Math.random() * 999999));
  const nationalId = '00' + String(10000000 + Math.floor(Math.random() * 8999999));
  console.log('job:', job.title, '| mobile:', mobile, '| nationalId:', nationalId);

  /* ---------- صفحه فرم استخدام ---------- */
  const pageRes = await localFetch(BASE + '/apply?job=' + slug);
  const pageHtml = await pageRes.text();
  const { w, errors } = makePage(pageHtml, BASE + '/apply?job=' + slug);

  await until(() => w.document.querySelector('#state-login') && !w.document.querySelector('#state-login').classList.contains('hidden'), 'login state');
  console.log('✓ فرم باز شد و حالت ورود نمایش داده شد');

  const q = (s) => w.document.querySelector(s);
  q('#apply-mobile').value = mobile;
  q('#apply-name').value = 'متقاضی آزمایشی';
  q('#btn-send-otp').click();
  await until(() => !q('#login-step-code').classList.contains('hidden'), 'otp step');
  const code = await until(() => otpFromLog(mobile), 'otp code in sms log', 40);
  console.log('✓ کد پیامکی دریافت شد:', code);
  q('#apply-code').value = code;
  q('#btn-verify-otp').click();
  await until(() => !q('#state-form').classList.contains('hidden'), 'form state');
  console.log('✓ ورود موفق — فرم بارگذاری شد');

  const steps = () => w.HRM_PORTAL_STEPS || null;
  const stepItems = () => Array.from(w.document.querySelectorAll('#step-list .step-item'));
  const total = stepItems().length;
  console.log('  تعداد مراحل:', total);

  function fillCurrentStep() {
    const card = q('#step-card');
    const setVal = (el, v) => {
      el.value = v;
      el.dispatchEvent(new w.Event('input', { bubbles: true }));
      el.dispatchEvent(new w.Event('change', { bubbles: true }));
    };
    card.querySelectorAll('[data-field]').forEach((el) => {
      const name = el.dataset.field;
      const type = el.dataset.type;
      if (type === 'file') return;
      if (type === 'radio') { if (!el.checked) { el.checked = true; el.dispatchEvent(new w.Event('change', { bubbles: true })); } return; }
      if (type === 'checkbox' || type === 'switch') { if (!el.checked) { el.checked = true; el.dispatchEvent(new w.Event('change', { bubbles: true })); } return; }
      if (el.tagName === 'SELECT') {
        const opts = Array.from(el.options).filter((o) => o.value !== '');
        setVal(el, (opts[0] || { value: '' }).value);
        return;
      }
      if (name === 'nationalId' || /national/i.test(name)) { setVal(el, nationalId); return; }
      if (type === 'date') { setVal(el, '1404/06/15'); return; }
      if (type === 'number' || type === 'currency') { setVal(el, /year|سال/i.test(name) ? '3' : '10'); return; }
      if (type === 'email') { setVal(el, 'test@example.com'); return; }
      if (type === 'tel' || /mobile|phone/i.test(name)) { setVal(el, mobile); return; }
      if (/postal/i.test(name)) { setVal(el, '1234567890'); return; }
      else setVal(el, 'متن آزمایشی');
    });
    // جدول‌های تکرارشدنی
    card.querySelectorAll('[data-add-row]').forEach((btn) => {
      btn.click();
      card.querySelectorAll('[data-tfield]').forEach((el) => {
        if (el.tagName === 'SELECT') {
          const opts = Array.from(el.options).filter((o) => o.value !== '');
          setVal(el, (opts[0] || { value: '' }).value);
          return;
        }
        if (el.type === 'radio' || el.dataset.type === 'radio') {
          el.checked = true;
          el.dispatchEvent(new w.Event('change', { bubbles: true }));
          el.dispatchEvent(new w.Event('input', { bubbles: true }));
          return;
        }
        if (el.dataset.type === 'date') { setVal(el, '1395/06/15'); return; }
        if (el.dataset.type === 'number' || /sal|year|معدل|average/i.test(el.dataset.tcol || '')) { setVal(el, '17'); return; }
        setVal(el, el.dataset.type === 'radio' ? el.value : 'تست');
      });
    });
  }

  for (let i = 0; i < total; i++) {
    const title = (q('#step-card .card-title') || {}).textContent || '';
    fillCurrentStep();
    await sleep(80);
    q('#btn-next').click();
    if (i < total - 1) {
      await sleep(1500);
      if ((q('#step-card .card-title') || {}).textContent === title) {
        console.log('  ✗ پیش‌روی نکرد. متن کارت:\n' + (q('#step-card').textContent || '').replace(/\s+/g, ' ').slice(0, 700));
        console.log('  errors مند کلاینت:', JSON.stringify(w.HRM_PORTAL_DEBUG || {}));
        const inputs = Array.from(q('#step-card').querySelectorAll('[data-field]')).map((el) => ({ f: el.dataset.field, t: el.dataset.type, v: el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value }));
        console.log('  فیلدها:', JSON.stringify(inputs).slice(0, 1200));
        process.exit(1);
      }
    } else {
      await until(() => !q('#state-done').classList.contains('hidden') || /خطا|مورد نیازمند/.test(q('#step-card').textContent), 'submit result', 120, 150);
    }
    console.log(`  ← مرحله ${i + 1}/${total}: ${title.trim().slice(0, 40)}`);
    if (/مورد نیازمند/.test(q('#step-card').textContent)) {
      console.log('  ✗ خطای اعتبارسنجی در مرحله:', q('#step-card').textContent.replace(/\s+/g, ' ').slice(0, 400));
      process.exit(1);
    }
  }

  const trackingCode = q('#done-code').textContent.trim();
  const doneMsg = q('#done-message').textContent.trim();
  console.log('✓ فرم ثبت شد — کد رهگیری:', trackingCode);
  console.log('  پیام:', doneMsg.slice(0, 120));

  /* ---------- آزمون ---------- */
  const startBtn = q('#btn-start-assessment');
  if (startBtn && !startBtn.classList.contains('hidden')) {
    startBtn.click();
    await until(() => !q('#state-assessment').classList.contains('hidden'), 'assessment state');
    await until(() => w.document.querySelectorAll('#assess-questions .question-card, #assess-questions .checkline').length > 0, 'questions');
    const qCards = Array.from(w.document.querySelectorAll('#assess-questions [data-q]'));
    console.log('  تعداد سؤال آزمون:', qCards.length);
    qCards.forEach((card, i) => {
      const lines = Array.from(card.querySelectorAll('.checkline'));
      if (lines.length) lines[i % lines.length].click();
    });
    await sleep(800);
    console.log('  پاسخ داده‌شده:', q('#assess-counter').textContent.trim());
    await until(() => !q('#btn-submit-assessment').disabled, 'submit enabled', 50);
    q('#btn-submit-assessment').click();
    await sleep(2500);
    await until(() => /آزمون شما ثبت شد|قبلاً تکمیل/.test(q('#assess-questions').textContent), 'assessment done', 60, 150);
    await sleep(1500);
    console.log('✓ نتیجه ثبت آزمون:', q('#assess-questions').textContent.replace(/\s+/g, ' ').trim().slice(0, 160));
  } else {
    console.log('! موردی برای آزمون نبود (شاید آزمون برای این موقعیت فعال نیست)');
  }

  /* ---------- بررسی سمت سرور ---------- */
  const after = await (await localFetch(BASE + '/api/portal/bootstrap')).json();
  const mine = (after.data.applications || []).find((a) => a.code === trackingCode);
  console.log('✓ سمت سرور:', mine ? JSON.stringify({ code: mine.code, status: mine.status, assessmentStatus: mine.assessmentStatus }) : 'یافت نشد');

  /* ---------- پیگیری ---------- */
  const trackRes = await localFetch(BASE + '/track');
  const t = makePage(await trackRes.text(), BASE + '/track');
  await until(() => t.w.document.querySelector('#btn-track'), 'track page');
  await sleep(1200);

  t.w.document.querySelector('#track-code').value = trackingCode;
  t.w.document.querySelector('#track-mobile').value = mobile;
  t.w.document.querySelector('#btn-track').click();
  try {
    await until(() => !t.w.document.querySelector('#track-result').classList.contains('hidden') || !t.w.document.querySelector('#track-alert').classList.contains('hidden'), 'track result', 40);
  } catch (e) {
    console.log('✗ تشخیص خطای پیگیری:');
    console.log('  شبکه:', t.w.__netlog.join(' | '));
    console.log('  خطاها:', t.errors.join(' | ') || 'ندارد');
    console.log('  alert:', t.w.document.querySelector('#track-alert').outerHTML.slice(0, 200));
    console.log('  result hidden:', t.w.document.querySelector('#track-result').className);
    console.log('  دسترسی به‌روزرسانی:', t.w.document.getElementById('btn-track').disabled, t.w.document.getElementById('btn-track').textContent);
    process.exit(1);
  }
  if (!t.w.document.querySelector('#track-result').classList.contains('hidden')) {
    console.log('✓ پیگیری:', t.w.document.querySelector('#track-status').textContent.trim(), '|', t.w.document.querySelector('#track-job').textContent.trim(), '|', t.w.document.querySelector('#track-assessment').textContent.trim());
    console.log('  تایم‌لاین:', t.w.document.querySelector('#track-timeline').textContent.replace(/\s+/g, ' ').trim().slice(0, 160));
  } else {
    console.log('✗ پیگیری خطا داد:', t.w.document.querySelector('#track-alert').textContent.trim());
  }

  const netFail = w.__netlog.concat(t.w.__netlog).filter((l) => /→ (4|5)\d\d/.test(l));
  console.log(netFail.length ? '⚠ درخواست‌های ناموفق:\n' + netFail.join('\n') : '✓ همه درخواست‌های شبکه موفق بودند');
  const realErrors = errors.concat(t.errors).filter((e) => !/qrcode/i.test(e));
  console.log(realErrors.length ? '⚠ خطاهای مرورگر:\n' + realErrors.join('\n') : '✓ بدون خطای مرورگر');
  process.exit(0);
})().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });
