/* تست تعاملی (نوشتن/عملیات) پنل مدیریت با jsdom — فقط توسعه */
const { JSDOM, requestInterceptor } = require(process.env.JSDOM_PATH || 'jsdom');
const BASE = 'http://localhost:3000';
const SID = process.env.SID;
if (!SID) { console.error('SID لازم است'); process.exit(1); }
const COOKIE = 'hrm_sid=' + SID;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on('unhandledRejection', (e) => console.log('  (unhandled rejection در صفحه):', (e && e.message) || e));

const loader = requestInterceptor(async (request) => {
  try {
    const res = await fetch(request.url.replace('http://localhost:3000', BASE), { method: request.method, headers: { Cookie: COOKIE, 'X-Requested-With': 'HRM' } });
    const buf = Buffer.from(await res.arrayBuffer());
    return new Response(buf, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') || 'application/octet-stream' } });
  } catch (e) { return new Response('', { status: 502 }); }
});

async function api(path, method = 'GET', body) {
  const r = await fetch(BASE + '/api' + path, {
    method,
    headers: { Cookie: COOKIE, 'X-Requested-With': 'HRM', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await r.json();
  return { status: r.status, data: j.data, error: j.error, ok: j.ok };
}

async function page(route) {
  const html = await (await fetch(BASE + '/admin', { headers: { Cookie: COOKIE } })).text();
  const errors = [];
  const dom = new JSDOM(html, {
    url: BASE + '/admin#' + route,
    runScripts: 'dangerously',
    resources: { interceptors: [loader] },
    pretendToBeVisual: true,
    beforeParse(window) {
      window.scrollTo = () => {};
      window.__netlog = [];
      window.fetch = async (input, init = {}) => {
        const raw = String(input);
        const target = raw.startsWith('http') ? raw : BASE + raw;
        const res = await fetch(target, { method: init.method || 'GET', headers: Object.assign({ Cookie: COOKIE }, init.headers || {}), body: init.body, redirect: 'manual' });
        const buf = Buffer.from(await res.arrayBuffer());
        window.__netlog.push((init.method || 'GET') + ' ' + raw + ' → ' + res.status);
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
  const w = dom.window;
  for (let i = 0; i < 200; i++) { if (w.HRM && w.HRM.state.user) break; await sleep(100); }
  for (let i = 0; i < 80; i++) {
    const outlet = w.document.getElementById('outlet');
    if (outlet && !outlet.querySelector('.skeleton') && outlet.textContent.trim().length > 30) break;
    await sleep(100);
  }
  await sleep(600);
  return { w, errors, doc: w.document, $: (s) => w.document.querySelector(s), $$: (s) => Array.from(w.document.querySelectorAll(s)) };
}

async function toastText(p, timeout = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const el = p.$('.toast-wrap .toast');
    if (el && el.textContent.trim()) return el.textContent.trim();
    await sleep(120);
  }
  return null;
}
async function waitFor(fn, label, timeout = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (fn()) return true; } catch (e) { /* ignore */ }
    await sleep(120);
  }
  console.log('  ✗ انتظار ناموفق:', label);
  return false;
}
let fails = 0;
function check(cond, msg) { console.log((cond ? ' ok  ' : 'FAIL ') + msg); if (!cond) fails++; }

(async () => {
  // طرح تازه، پرونده‌ای ندارد؛ برای اینکه این تست خودکفا باشد ابتدا جریان متقاضی را اجرا می‌کنیم.
  let appsRes = await api('/applications?perPage=3');
  if (!appsRes.data || !(appsRes.data.rows || []).length) {
    console.log('هیچ پرونده استخدامی وجود ندارد → اجرای scripts/dev/e2e-portal.js برای ساخت داده اولیه…\n');
    const { execFileSync } = require('child_process');
    const path2 = require('path');
    try {
      execFileSync(process.execPath, [path2.join(__dirname, 'e2e-portal.js')], { env: process.env, stdio: 'inherit' });
    } catch (e) {
      console.log('اجرای e2e-portal با خطا تمام شد؛ ادامه تست‌ها ممکن است ناقص باشد.\n');
    }
    appsRes = await api('/applications?perPage=3');
  }
  const apps = (appsRes.data && appsRes.data.rows) || [];
  if (!apps.length) {
    console.log('✗ هیچ پرونده‌ای برای تست عملیات نوشتن موجود نیست.');
    process.exit(1);
  }
  const app = apps[0];
  console.log('پرونده آزمایشی:', app.code, '| وضعیت فعلی:', app.status);

  /* ── ۱) تغییر وضعیت از پرونده متقاضی ─────────────────────────── */
  let p = await page('/applications/' + app.id);
  const sel = p.$('[data-status-apply]') && p.$('select.select');
  const statusSelect = p.$$('#outlet select.select').find((s) => s.options.length > 5) || p.$('select.select');
  const target = 'screening';
  statusSelect.value = target;
  p.$('[data-status-apply]').click();
  await sleep(500);
  if (p.$('.modal [data-skip]')) p.$('.modal [data-skip]').click();
  await sleep(900);
  const afterStatus = await api('/applications/' + app.id);
  check(afterStatus.data.application.status === target, `تغییر وضعیت → ${target} (فعلی: ${afterStatus.data.application.status})`);
  check((afterStatus.data.timeline || []).some((t) => /وضعیت/.test(t.title || '')), 'رویداد تغییر وضعیت در تاریخچه ثبت شد');
  // بازگرداندن وضعیت
  await api('/applications/' + app.id + '/status', 'POST', { status: app.status, reason: 'بازگردانی توسط آزمون خودکار', sendSms: false });
  const restored = await api('/applications/' + app.id);
  check(restored.data.application.status === app.status, 'بازگردانی وضعیت به حالت اول');

  /* ── ۲) ویرایش درجای پاسخ فرم ────────────────────────────────── */
  p = await page('/applications/' + app.id);
  const cells = p.$$('#outlet [data-val]');
  const editable = cells.filter((c) => { const r = c.closest('.field'); return r && r.classList.contains('pointer'); });
  check(editable.length > 0, `فیلدهای قابل ویرایش: ${editable.length} از ${cells.length}`);
  if (editable.length) {
    const row = editable[0].closest('.field');
    row.click();
    await sleep(250);
    const input = row.querySelector('input,textarea');
    check(!!input, 'ورود به حالت ویرایش درجا');
    if (input) {
      const before = input.value;
      input.value = before + ' ✓آزمون';
      input.dispatchEvent(new p.w.Event('input', { bubbles: true }));
      input.blur();
      await sleep(1200);
      const detail = await api('/applications/' + app.id);
      const flat = detail.data.answersFlat || [];
      const hit = flat.some((f) => String(f.value || '').includes('✓آزمون'));
      check(hit, 'ذخیره ویرایش درجای پاسخ (PUT /applications/:id)');
      if (hit) {
        // بازگردانی مقدار اصلی
        const f = flat.find((x) => String(x.value || '').includes('✓آزمون'));
        await api('/applications/' + app.id, 'PUT', { answers: { [f.stepKey]: { [f.field]: before } } });
      }
    }
  }

  /* ── ۳) یادداشت ─────────────────────────────────────────────── */
  p = await page('/applications/' + app.id);
  p.$$('#outlet .tab').find((t) => /یادداشت/.test(t.textContent)).click();
  await sleep(500);
  const noteBox = p.$('[data-note-text]');
  check(!!noteBox, 'جعبه یادداشت نمایش داده شد');
  if (noteBox) {
    noteBox.value = 'یادداشت آزمون خودکار ' + new Date().toISOString().slice(11, 19);
    p.$('[data-note-add]').click();
    await sleep(1200);
    const detail = await api('/applications/' + app.id);
    const note = (detail.data.application.notes || []).find((n) => /آزمون خودکار/.test(n.text || ''));
    check(!!note, 'ثبت یادداشت روی پرونده');
    if (note) {
      const del = await api('/applications/' + app.id + '/notes/' + note.id, 'DELETE');
      check(del.status === 200, 'حذف یادداشت آزمایشی (DELETE /applications/:id/notes/:noteId) → ' + del.status);
    }
  }

  /* ── ۴) تفسیر منابع انسانی روی نتیجه آزمون ──────────────────── */
  const asmts = await api('/assessments?perPage=1');
  const asmt = asmts.data.rows[0];
  p = await page('/assessments/' + asmt.id);
  const notesBtn = p.$('[data-notes]');
  check(!!notesBtn, 'دکمه ثبت تفسیر منابع انسانی موجود است');
  if (notesBtn) {
    notesBtn.click();
    await sleep(400);
    const modal = p.$('.modal');
    check(!!modal, 'پنجره تفسیر باز شد');
    if (modal) {
      const ta = modal.querySelector('textarea');
      ta.value = 'جمع‌بندی آزمایشی خودکار: تناسب خوب با نقش، نیازمند بررسی در مصاحبه.';
      ta.dispatchEvent(new p.w.Event('input', { bubbles: true }));
      modal.querySelector('[data-save]').click();
      await sleep(1400);
      const d = await api('/assessments/' + asmt.id);
      check(!!(d.data.hrNotes && /آزمایشی/.test(d.data.hrNotes.text || '')), 'ذخیره تفسیر HR روی نتیجه آزمون');
      check(p.w.HRM.state.user && true, '—');
    }
  }

  /* ── ۵) ذخیره تغییرات فرم‌ساز ───────────────────────────────── */
  p = await page('/form-builder');
  const saveBtn = p.$('[data-save]');
  check(!!saveBtn, 'دکمه ذخیره تغییرات فرم‌ساز موجود است');
  if (saveBtn) {
    saveBtn.click();
    const t = await toastText(p);
    check(!!t, 'ذخیره فرم استخدام (PUT /form) — پیام: ' + (t || '—'));
  }

  /* ── ۶) تنظیمات عمومی (ذخیره) ───────────────────────────────── */
  p = await page('/settings');
  const genSave = p.$$('#outlet button').find((b) => /ذخیره/.test(b.textContent));
  check(!!genSave, 'دکمه ذخیره تنظیمات عمومی موجود است');
  if (genSave) {
    // مقدار تلفن پشتیبانی را تغییر بده، ذخیره کن و برگردان
    const before = await api('/settings');
    const oldPhone = (before.data.app || {}).supportPhone || '';
    const newPhone = oldPhone === '02100000000' ? '02111111111' : '02100000000';
    const phoneInput = p.$$('#outlet input').find((i) => i.name === 'supportPhone');
    check(!!phoneInput, 'فیلد تلفن پشتیبانی موجود است');
    if (phoneInput) {
      phoneInput.value = newPhone;
      phoneInput.dispatchEvent(new p.w.Event('input', { bubbles: true }));
      genSave.click();
      await sleep(1500);
      const after = await api('/settings');
      check((after.data.app || {}).supportPhone === newPhone, `ذخیره واقعی مقدار جدید (${newPhone}) — فعلی: ${(after.data.app || {}).supportPhone}`);
      // بازگردانی
      phoneInput.value = oldPhone;
      phoneInput.dispatchEvent(new p.w.Event('input', { bubbles: true }));
      genSave.click();
      await sleep(1200);
      const back = await api('/settings');
      check((back.data.app || {}).supportPhone === oldPhone, 'بازگردانی تلفن پشتیبانی');
    }
  }

  /* ── ۷) ویرایش موقعیت شغلی (فرم داخل کارت) ─────────────────── */
  const jobs = await api('/jobs?perPage=1');
  const job = jobs.data.rows[0];
  p = await page('/jobs/' + job.id);
  const titleInput = p.$$('#outlet input').find((i) => i.name === 'title');
  const jobSave = p.$('[data-save]');
  check(!!titleInput && !!jobSave, 'ویرایشگر موقعیت شغلی و دکمه ذخیره موجود است');
  if (titleInput && jobSave) {
    const originalTitle = titleInput.value;
    const marker = ' ⭐آزمون';
    titleInput.value = originalTitle + marker;
    titleInput.dispatchEvent(new p.w.Event('input', { bubbles: true }));
    jobSave.click();
    await sleep(1600);
    const after = await api('/jobs/' + job.id);
    check(after.data.job.title.includes('⭐آزمون'), `ذخیره عنوان موقعیت شغلی (فعلی: ${after.data.job.title})`);
    // بازگردانی
    await api('/jobs/' + job.id, 'PUT', { title: originalTitle });
    const back = await api('/jobs/' + job.id);
    check(back.data.job.title === originalTitle, 'بازگردانی عنوان موقعیت شغلی');
  }

  /* ── ۸) ایجاد و حذف کاربر ───────────────────────────────────── */
  p = await page('/users');
  const newUserBtn = p.$('[data-new]');
  check(!!newUserBtn, 'دکمه کاربر جدید موجود است');
  if (newUserBtn) {
    newUserBtn.click();
    await waitFor(() => p.$('.drawer'), 'باز شدن کشوی کاربر جدید');
    const drawer = p.$('.drawer');
    const mobile = '0912' + String(8000000 + Math.floor(Math.random() * 999999));
    const setField = (name, val) => {
      const el = drawer.querySelector('[name="' + name + '"]');
      if (!el) return false;
      if (el.type === 'checkbox') { el.checked = true; el.dispatchEvent(new p.w.Event('change', { bubbles: true })); }
      else { el.value = val; el.dispatchEvent(new p.w.Event('input', { bubbles: true })); }
      return true;
    };
    setField('name', 'کاربر آزمون خودکار');
    setField('mobile', mobile);
    const rolesData = await api('/roles');
    const empRole = rolesData.data.roles.find((r) => r.key === 'hr_staff') || rolesData.data.roles.find((r) => r.key === 'employee');
    const roleBox = drawer.querySelector('input[type="checkbox"][value="' + empRole.id + '"]');
    if (roleBox) { roleBox.checked = true; roleBox.dispatchEvent(new p.w.Event('change', { bubbles: true })); }
    drawer.querySelector('[data-save]').click();
    await sleep(1500);
    const invalid = Array.from(drawer.querySelectorAll('.field.invalid')).map((f) => (f.querySelector('.error-text') || {}).textContent + ' @ ' + ((f.querySelector('label') || {}).textContent || '').trim());
    if (invalid.length) console.log('  (اعتبارسنجی ناموفق: ' + invalid.join(' | ') + ')');
    const found = await api('/users?q=' + mobile);
    const created = (found.data.rows || [])[0];
    check(!!created, 'ایجاد کاربر از پنل (POST /users) — ' + (created ? created.name + ' / ' + (created.roles || []).map((r) => r.name).join(',') : 'ناموفق'));
    if (created) {
      const del = await api('/users/' + created.id, 'DELETE');
      check(del.status === 200, 'حذف کاربر آزمایشی → ' + del.status);
    }
  }

  /* ── ۹) ایجاد/حذف نقش با مجوزها ────────────────────────────── */
  p = await page('/roles');
  const newRoleBtn = p.$('[data-new]');
  check(!!newRoleBtn, 'دکمه نقش جدید موجود است');
  if (newRoleBtn) {
    newRoleBtn.click();
    await sleep(600);
    const m = p.$('.modal');
    check(!!m, 'پنجره نقش جدید باز شد');
    if (m) {
      const permCount = m.querySelectorAll('[data-perm]').length;
      m.querySelector('[data-role-name]').value = 'نقش آزمون خودکار';
      m.querySelector('[data-role-desc]').value = 'ساخته‌شده توسط آزمون خودکار';
      // انتخاب دو مجوز
      const perms = Array.from(m.querySelectorAll('[data-perm]')).slice(0, 2);
      perms.forEach((i) => { i.checked = true; i.dispatchEvent(new p.w.Event('change', { bubbles: true })); });
      m.querySelector('[data-save]').click();
      await sleep(1500);
      const roles = await api('/roles');
      const created = roles.data.roles.find((r) => r.name === 'نقش آزمون خودکار');
      check(!!created, `ایجاد نقش با ${permCount} مجوز قابل انتخاب — مجوزهای انتخاب‌شده: ${created ? created.permissions.join(', ') : 'ناموفق'}`);
      if (created) {
        const del = await api('/roles/' + created.id, 'DELETE');
        const afterRoles = await api('/roles');
        check(del.status === 200 && !afterRoles.data.roles.some((r) => r.id === created.id), 'حذف نقش آزمایشی');
      }
    }
  }

  /* ── ۱۰) خاموش/روشن کردن ماژول از تنظیمات ──────────────────── */
  p = await page('/settings');
  p.$$('#outlet .tab').find((t) => /ماژول/.test(t.textContent)).click();
  await waitFor(() => p.$('[data-toggle]'), 'زبانه ماژول‌ها');
  const toggles = p.$$('[data-toggle]:not(:disabled)');
  check(toggles.length > 0, `تعداد ماژول‌های قابل تغییر: ${toggles.length}`);
  if (toggles.length) {
    const t = toggles[0];
    const key = t.dataset.toggle;
    const wasChecked = t.checked;
    t.checked = !wasChecked;
    t.dispatchEvent(new p.w.Event('change', { bubbles: true }));
    await sleep(1500);
    const mods = await api('/settings/modules');
    const now = (mods.data.modules || []).find((x) => x.key === key);
    check(now && now.enabled === !wasChecked, `تغییر وضعیت ماژول «${key}» → ${now ? now.enabled : '؟'}`);
    // بازگردانی
    const res = await api('/settings/modules/' + key + '/toggle', 'POST', {});
    const mods2 = await api('/settings/modules');
    const back = (mods2.data.modules || []).find((x) => x.key === key);
    check(back && back.enabled === wasChecked, `بازگردانی وضعیت ماژول «${key}»`);
  }

  /* ── ۱۱) ویرایش قالب پیامک و بازگردانی ─────────────────────── */
  p = await page('/sms');
  p.$$('#outlet .tab').find((t) => /قالب/.test(t.textContent)).click();
  await waitFor(() => p.$('[data-tpl]'), 'زبانه قالب‌های پیام');
  const tplBtn = p.$('[data-tpl]');
  const templates = await api('/sms/templates');
  const tplKey = tplBtn && tplBtn.dataset.tpl;
  const tpl = (templates.data.templates || []).find((x) => x.key === tplKey);
  check(!!tpl, 'قالب پیامک برای ویرایش یافت شد: ' + tplKey);
  if (tpl) {
    tplBtn.click();
    await sleep(500);
    const tm = p.$('.modal');
    const area = tm && tm.querySelector('textarea');
    check(!!area, 'پنجره ویرایش قالب باز شد');
    if (area) {
      const old = area.value;
      area.value = old + ' [آزمون]';
      area.dispatchEvent(new p.w.Event('input', { bubbles: true }));
      tm.querySelector('[data-save]').click();
      await sleep(1400);
      const afterT = await api('/sms/templates');
      const nowT = (afterT.data.templates || []).find((x) => x.key === tplKey);
      check(!!nowT && nowT.text.includes('[آزمون]'), 'ذخیره قالب پیامک (PUT /sms/templates/:key)');
      const restore = await api('/sms/templates/' + tplKey, 'PUT', { text: old, enabled: tpl.enabled });
      const backT = await api('/sms/templates');
      const b = (backT.data.templates || []).find((x) => x.key === tplKey);
      check(!!b && b.text === old, 'بازگردانی متن قالب');
    }
  }

  /* ── ۱۲) تشخیص وضعیت ماژول با API ────────────────────────────── */
  const sys = await api('/settings/system');
  check(!!sys.data && !!sys.data.collections, 'GET /settings/system (زیرساخت) پاسخ داد');

  console.log('\n' + (fails ? '✗ ' + fails + ' مورد ناموفق' : '✓ همه عملیات تعاملی موفق'));
  console.log('خطاهای صفحه:', p.errors.length ? p.errors.join(' | ') : 'ندارد');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('TX HARNESS ERROR', e); process.exit(2); });
