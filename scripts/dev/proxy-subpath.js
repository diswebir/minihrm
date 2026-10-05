#!/usr/bin/env node
/**
 * شبیه‌ساز نصب در زیرمسیر (برای تست cPanel/Passenger)
 * ------------------------------------------------------------------
 * یک پروکسی ساده روی پورت ۳۲۰۰ بالا می‌آورد که درخواست‌های /hrm/* را با
 * هدر X-Forwarded-Prefix به برنامه اصلی (پورت ۳۰۰۰) می‌فرستد — دقیقاً همان
 * کاری که cPanel/Passenger انجام می‌دهد.
 *
 *   node scripts/dev/proxy-subpath.js            # پیشوند پیش‌فرض: /hrm
 *   BASE=/crm PORT=3300 node scripts/dev/proxy-subpath.js
 *   TARGET=http://127.0.0.1:3000
 */
'use strict';

const http = require('http');

const BASE = (process.env.BASE || '/hrm').replace(/\/+$/, '');
const LISTEN = parseInt(process.env.PROXY_PORT || '3200', 10);
const TARGET = process.env.TARGET || 'http://127.0.0.1:3000';
const target = new URL(TARGET);

const server = http.createServer((req, res) => {
  if (!req.url.startsWith(BASE)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`خارج از پیشوند ${BASE} — این پروکسی فقط زیرمسیر را منتقل می‌کند.`);
    return;
  }
  const upstream = http.request({
    host: target.hostname,
    port: target.port || 80,
    method: req.method,
    path: req.url,     // خود پیشوند هم می‌رود (مثل Passenger)
    headers: Object.assign({}, req.headers, {
      'x-forwarded-prefix': BASE,
      'x-forwarded-host': req.headers.host || '',
      'x-forwarded-proto': 'http'
    })
  }, (up) => {
    res.writeHead(up.statusCode, up.headers);
    up.pipe(res);
  });
  upstream.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('خطای پروکسی: ' + e.message);
  });
  req.pipe(upstream);
});

server.listen(LISTEN, '0.0.0.0', () => {
  console.log(`پروکسی زیرمسیر: http://localhost:${LISTEN}${BASE}/  →  ${TARGET}`);
});
