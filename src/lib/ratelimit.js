'use strict';
/** محدودسازی نرخ درخواست (ساده و درون‌پردازشی) */
const buckets = new Map();

function rateLimit({ windowMs = 60000, max = 10, keyFn, message = 'تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.' }) {
  return function limiter(req, res, next) {
    const key = (keyFn ? keyFn(req) : (req.ip || 'x')) + '|' + (req.baseUrl || '') + (req.path || '');
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now > b.reset) {
      b = { count: 0, reset: now + windowMs };
      buckets.set(key, b);
    }
    b.count++;
    if (b.count > max) {
      if (req.xhr || (req.headers.accept || '').includes('json')) {
        return res.status(429).json({ ok: false, message });
      }
      return res.status(429).render('pages/error', { title: 'محدودیت درخواست', status: 429, message });
    }
    next();
  };
}

// پاک‌سازی دوره‌ای
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k);
}, 60000).unref?.();

module.exports = { rateLimit };
