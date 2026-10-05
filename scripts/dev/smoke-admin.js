/* هارنس تست دودی پنل مدیریت با jsdom (فقط توسعه — داخل ریپو نیست) */
const { JSDOM, requestInterceptor } = require(process.env.JSDOM_PATH || 'jsdom');
const fs = require('fs');
const BASE = (process.env.HRM_BASE || 'http://localhost:3000').replace(/\/+$/, '');
const SID = process.env.SID;
if (!SID) { console.error('SID لازم است'); process.exit(1); }
const COOKIE = 'hrm_sid=' + SID;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiGet(p) {
  const r = await fetch(BASE + '/api' + p, { headers: { Cookie: COOKIE, 'X-Requested-With': 'HRM' } });
  const j = await r.json();
  return j.ok ? j.data : null;
}

const loader = requestInterceptor(async (request) => {
  try {
    const url = request.url;
    const res = await fetch(url, { method: request.method || 'GET', headers: { Cookie: COOKIE, 'X-Requested-With': 'HRM' }, body: undefined, redirect: 'manual' });
    if (!res.ok && res.status !== 304) return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') || 'text/plain' } });
    const buf = Buffer.from(await res.arrayBuffer());
    return new Response(buf, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') || 'application/octet-stream' } });
  } catch (e) { return new Response('', { status: 502 }); }
});

(async () => {
  const html = await (await fetch(BASE + '/admin', { headers: { Cookie: COOKIE } })).text();
  const errors = [];
  const logs = [];
  const dom = new JSDOM(html, {
    url: BASE + '/admin',
    runScripts: 'dangerously',
    resources: { interceptors: [loader] },
    pretendToBeVisual: true,
    beforeParse(window) {
      window.scrollTo = () => {};
      window.fetch = async (input, init = {}) => {
        const raw = String(input);
        // BASE ممکن است پیشوند مسیر داشته باشد؛ URL را مثل مرورگر حل می‌کنیم
        const url = new URL(raw, BASE + '/').href;
        const headers = Object.assign({}, init.headers || {}, { Cookie: COOKIE });
        const res = await fetch(url, { method: init.method || 'GET', headers, body: init.body, redirect: 'manual' });
        const buf = Buffer.from(await res.arrayBuffer());
        return {
          ok: res.ok, status: res.status, headers: res.headers,
          json: async () => JSON.parse(buf.toString('utf8')),
          text: async () => buf.toString('utf8'),
          blob: async () => new window.Blob([buf])
        };
      };
      window.addEventListener('error', (e) => errors.push('window.error: ' + (e.message || (e.error && e.error.message))));
      window.addEventListener('unhandledrejection', (e) => errors.push('unhandled: ' + ((e.reason && e.reason.message) || e.reason)));
      ['warn', 'error'].forEach((k) => {
        const orig = window.console[k].bind(window.console);
        window.console[k] = (...a) => { logs.push(k + ': ' + a.map((x) => (x && x.message) || String(x)).join(' ')); orig(...a); };
      });
    }
  });
  const w = dom.window;

  // انتظار برای بوت
  for (let i = 0; i < 200; i++) { if (w.HRM && w.HRM.state.user) break; await sleep(100); }
  if (!w.HRM || !w.HRM.state.user) {
    console.log('BOOT FAILED');
    console.log('errors:', errors.join('\n'));
    console.log('logs:', logs.slice(-25).join('\n'));
    const splash = w.document.getElementById('splash');
    console.log('splash:', splash && splash.textContent.trim().slice(0, 300));
    process.exit(1);
  }
  console.log('BOOT OK — user:', w.HRM.state.user.name, '| modules:', w.HRM.modules.map((m) => m.key).join(','));

  const jobs = await apiGet('/jobs?perPage=5');
  const apps = await apiGet('/applications?perPage=5');
  const asmts = await apiGet('/assessments?perPage=5');
  const ivs = await apiGet('/interviews?perPage=5');
  const users = await apiGet('/users?perPage=5');
  const ids = {
    job: jobs && jobs.rows[0] && jobs.rows[0].id,
    app: apps && apps.rows[0] && apps.rows[0].id,
    asmt: asmts && asmts.rows[0] && asmts.rows[0].id,
    iv: ivs && ivs.rows[0] && ivs.rows[0].id,
    user: users && users.rows[0] && users.rows[0].id
  };
  console.log('ids:', JSON.stringify(ids));

  const routes = [
    '/dashboard', '/jobs', ids.job && '/jobs/' + ids.job,
    '/applications', ids.app && '/applications/' + ids.app, '/pipeline', '/form-builder',
    '/assessments', ids.asmt && '/assessments/' + ids.asmt, '/assessments/analytics', '/assessments/questions',
    '/interviews', '/interview-questions',
    '/applicants', '/users', '/roles', '/reports', '/audit', '/profile', '/sms', '/settings'
  ].filter(Boolean);

  const verbose = process.env.VERBOSE === '1';
  let fails = 0;
  for (const route of routes) {
    const before = errors.length;
    w.location.hash = '#' + route;
    await sleep(120);
    for (let i = 0; i < 60; i++) {
      const outlet = w.document.getElementById('outlet');
      if (outlet && !outlet.querySelector('.skeleton') && outlet.textContent.trim().length > 30) break;
      await sleep(100);
    }
    await sleep(1200);
    const outlet = w.document.getElementById('outlet');
    const text = (outlet && outlet.textContent || '').replace(/\s+/g, ' ').trim();
    const isErr = text.includes('خطا در بارگذاری صفحه') || text.includes('[object ');
    if (route === '/pipeline') console.log('  kanban cards:', outlet.querySelectorAll('.kanban-card').length, '| cols:', outlet.querySelectorAll('.kanban-col').length);
    if (route === '/settings' || route === '/sms') console.log('  panel children:', outlet.querySelectorAll('.tabs + div > *').length);
    const newErrs = errors.slice(before);
    const bad = isErr || newErrs.some((e) => !/qrcode|QRCode/i.test(e));
    if (bad) fails++;
    if (verbose && process.env.HTML_ROUTES && process.env.HTML_ROUTES.split(',').some((r) => route.startsWith(r))) {
      console.log('  HTML(' + route + '):', (outlet ? outlet.innerHTML : '').replace(/\s+/g, ' ').slice(0, 900));
    }
    console.log(`${bad ? 'FAIL' : ' ok '} ${route}  len=${text.length}${verbose ? '  «' + text.slice(0, 260) + '»' : ''}${isErr ? '  → ' + text.slice(0, 160) : ''}${newErrs.length ? '  errs=' + newErrs.slice(0, 3).join(' | ').slice(0, 300) : ''}`);
  }
  /* ---------- فاز دوم: همه زبانه‌ها ---------- */
  console.log('\n--- بررسی زبانه‌ها ---');
  const tabRoutes = ['/settings', '/sms', '/jobs/' + ids.job, '/applications/' + ids.app, '/assessments'];
  for (const route of tabRoutes) {
    w.location.hash = '#' + route;
    await sleep(150);
    for (let i = 0; i < 60; i++) {
      const outlet = w.document.getElementById('outlet');
      if (outlet && !outlet.querySelector('.skeleton') && outlet.textContent.trim().length > 30) break;
      await sleep(100);
    }
    await sleep(900);
    const tabs = Array.from(w.document.querySelectorAll('#outlet .tab'));
    for (let ti = 0; ti < tabs.length; ti++) {
      const before = errors.length;
      const label = tabs[ti].textContent.trim().replace(/\s+/g, ' ');
      tabs[ti].click();
      await sleep(700);
      const outlet = w.document.getElementById('outlet');
      const text = (outlet ? outlet.textContent : '').replace(/\s+/g, ' ');
      const newErrs = errors.slice(before).filter((e) => !/qrcode/i.test(e));
      const bad = /\[object |خطا در بارگذاری صفحه/.test(text) || newErrs.length;
      if (bad) { fails++; console.log('FAIL  ' + route + ' ⇢ زبانه «' + label + '» len=' + text.length + (newErrs.length ? '  errs=' + newErrs.join(' | ').slice(0, 240) : '') + '  «' + text.slice(0, 160) + '»'); }
      else console.log(' ok   ' + route + ' ⇢ زبانه «' + label + '» len=' + text.length);
    }
  }

  const noise = logs.filter((l) => !/qrcode/i.test(l));
  if (noise.length) console.log('\nconsole noise:\n' + noise.slice(0, 30).join('\n'));
  console.log('\nSUMMARY: routes=' + routes.length + ' fails=' + fails + ' windowErrors=' + errors.length);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
