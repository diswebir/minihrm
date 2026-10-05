/**
 * موتور قالب سبک سامانه (بدون وابستگی خارجی)
 * ------------------------------------------------------------------
 * پشتیبانی از:
 *   {{ expression }}         خروجی امن (HTML-escape)
 *   {{{ expression }}}       خروجی خام
 *   {{#if expr}} … {{else if expr}} … {{else}} … {{/if}}
 *   {{#each list}} … {{/each}}   با @index، @first، @last و this
 *   {{#unless expr}} … {{/unless}}
 *   {{> partialName }}       درج قالب دیگر
 *   {{! comment }}
 *   {{ h.jalali(date) }}     توابع کمکی
 */
'use strict';

const fs = require('fs');
const path = require('path');
const utils = require('./utils');
const jalali = require('./jalali');

const TOKEN_RE = /\{\{\{([\s\S]*?)\}\}\}|\{\{([\s\S]*?)\}\}/g;

class View {
  constructor({ root, cache = true, logger }) {
    this.root = root;
    this.viewDir = path.join(root, 'views');
    this.cache = cache;
    this.logger = logger;
    this.cacheMap = new Map();   // name → {mtime, tree}
    this.exprCache = new Map();
    this.partials = new Map();
  }

  /** توابع کمکی داخل قالب‌ها */
  helpers() {
    const self = this;
    return {
      jalali: (d, opt) => jalali.formatJalali(d, opt),
      jalaliTime: (d) => jalali.formatJalaliTime(d),
      jalaliLong: (d) => jalali.formatJalaliLong(d),
      jparts: (d) => jalali.jalaaliParts(d),
      fa: (n) => utils.faDigits(n),
      num: (n) => utilFaNumber(n),
      money: (n) => utils.faDigits(Number(n || 0).toLocaleString('en-US')) + ' تومان',
      ago: (d) => jalali.timeAgo(d),
      esc: (s) => utils.esc(s),
      json: (o) => JSON.stringify(o === undefined ? null : o).replace(/</g, '\\u003c'),
      upper: (s) => String(s || '').toUpperCase(),
      lower: (s) => String(s || '').toLowerCase(),
      join: (arr, sep) => (Array.isArray(arr) ? arr.join(sep === undefined ? '، ' : sep) : ''),
      len: (a) => (Array.isArray(a) || typeof a === 'string' ? a.length : 0),
      or: (a, b) => (a === undefined || a === null || a === '' ? b : a),
      default: (a, b) => (a === undefined || a === null || a === '' ? b : a),
      eq: (a, b) => a === b,
      neq: (a, b) => a !== b,
      gt: (a, b) => a > b,
      gte: (a, b) => a >= b,
      lt: (a, b) => a < b,
      lte: (a, b) => a <= b,
      includes: (arr, v) => (Array.isArray(arr) ? arr.includes(v) : String(arr || '').includes(String(v))),
      quote: (s) => `«${s || ''}»`,
      nl2br: (s) => utils.esc(s).replace(/\n/g, '<br>'),
      strip: (s) => utils.stripTags(s),
      initials: (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join(''),
      color: (i) => ['violet', 'mint', 'sky', 'peach', 'lemon', 'rose'][i % 6],
      truncate: (s, n) => utils.truncate(s, n || 80),
      asset: (p) => '/assets/' + String(p || '').replace(/^\/+/, ''),
      formatBytes: (b) => utils.formatBytes(b),
      self
    };
  }

  // ---------------------------------------------------------- پارس قالب

  parse(source) {
    TOKEN_RE.lastIndex = 0;
    const root = { type: 'root', children: [] };
    const stack = [root];
    let lastIndex = 0;
    let m;
    const src = String(source || '');

    // افزودن گره به شاخه درست (پس از {{else}} به elseChildren)
    const pushTo = (node) => {
      const top = stack[stack.length - 1];
      const bucket = (top.inElse && top.elseChildren) ? top.elseChildren : top.children;
      bucket.push(node);
    };

    const pushText = (text) => {
      if (!text) return;
      pushTo({ type: 'text', value: text });
    };

    while ((m = TOKEN_RE.exec(src)) !== null) {
      pushText(src.slice(lastIndex, m.index));
      lastIndex = TOKEN_RE.lastIndex;
      const raw = m[1] !== undefined;
      const body = (raw ? m[1] : m[2]).trim();

      if (!raw && body.startsWith('!')) continue; // توضیح

      const tag = body[0];
      const top = stack[stack.length - 1];

      if (!raw && tag === '#') {
        const spaceIdx = body.indexOf(' ');
        const keyword = body.slice(1, spaceIdx === -1 ? undefined : spaceIdx).trim();
        const expr = spaceIdx === -1 ? '' : body.slice(spaceIdx + 1).trim();
        if (keyword === 'if' || keyword === 'unless') {
          const node = { type: 'if', expr, negate: keyword === 'unless', children: [], elseChildren: [] };
          pushTo(node);
          stack.push(node);
        } else if (keyword === 'each') {
          const node = { type: 'each', expr, children: [], elseChildren: [] };
          pushTo(node);
          stack.push(node);
        } else {
          throw new Error(`تگ ناشناخته در قالب: {{#${keyword}}}`);
        }
        continue;
      }

      if (!raw && tag === '/') {
        const keyword = body.slice(1).trim();
        const current = stack[stack.length - 1];
        const closesIf = current && current.type === 'if' && (keyword === 'if' || keyword === 'unless');
        const closesEach = current && current.type === 'each' && keyword === 'each';
        if (!closesIf && !closesEach) {
          throw new Error(`بستن تگ نامعتبر: {{/${keyword}}}`);
        }
        let popped = stack.pop();
        // شاخه‌های «else if» بخشی از همان بلوک if بیرونی هستند و با یک {{/if}} بسته می‌شوند
        while (popped && popped.elseIfBranch && stack.length > 1) {
          popped = stack.pop();
        }
        continue;
      }

      if (!raw && tag === '>') {
        pushTo({ type: 'include', name: body.slice(1).trim() });
        continue;
      }

      if (!raw && (body === 'else' || body.startsWith('else'))) {
        const topNode = stack[stack.length - 1];
        if (!topNode || (topNode.type !== 'if' && topNode.type !== 'each')) throw new Error('{{else}} بدون بلوک متناظر');
        topNode.inElse = true;
        const rest = body.slice(4).trim();
        if (rest.startsWith('if ')) {
          // else if → به شکل یک بلوک if تودرتو در شاخه else
          const nested = { type: 'if', expr: rest.slice(3).trim(), negate: false, children: [], elseChildren: [], elseIfBranch: true };
          topNode.elseChildren.push(nested);
          stack.push(nested);
        }
        continue;
      }

      pushTo({ type: 'output', expr: body, raw });
    }
    pushText(src.slice(lastIndex));
    if (stack.length !== 1) throw new Error('تگ‌های قالب بسته نشده‌اند');
    return root;
  }

  loadTemplate(name) {
    const file = path.join(this.viewDir, name.endsWith('.html') ? name : name + '.html');
    if (this.partials.has(name)) return this.partials.get(name);
    if (!this.cache || !this.cacheMap.has(file)) {
      const source = fs.readFileSync(file, 'utf8');
      const tree = this.parse(source);
      this.cacheMap.set(file, { tree, mtime: Date.now() });
    }
    return this.cacheMap.get(file).tree;
  }

  registerPartial(name, source) { this.partials.set(name, this.parse(source)); }

  compileExpr(expr) {
    if (this.exprCache.has(expr)) return this.exprCache.get(expr);
    const normalized = String(expr)
      .replace(/@index/g, '$ix')
      .replace(/@first/g, '($ix === 0)')
      .replace(/@last/g, '$last')
      .replace(/\.\.\//g, '$up.')
      .replace(/\bthis\b/g, '$item');
    let fn;
    try {
      // eslint-disable-next-line no-new-func
      fn = new Function('$locals', '$item', '$ix', '$last', '$up', '$root', 'h', `
        const $p = { $item, $ix, $last, $up, $root, h };
        const $scope = new Proxy($locals, {
          has: () => true,
          get: (t, k) => {
            if (typeof k === 'symbol') return undefined;
            if (k in $p) return $p[k];
            if (k in t) return t[k];
            try { return globalThis[k]; } catch (e) { return undefined; }
          }
        });
        with ($scope) { return (${normalized}); }
      `);
    } catch (e) {
      throw new Error(`عبارت نامعتبر در قالب: ${expr} — ${e.message}`);
    }
    this.exprCache.set(expr, fn);
    return fn;
  }

  // ---------------------------------------------------------- رندر

  renderTemplate(name, data = {}, extra = {}) {
    const tree = this.loadTemplate(name);
    const h = this.helpers();
    const locals = Object.assign({}, data, { h });
    return this.renderNodes(tree.children, {
      locals, item: undefined, ix: 0, last: false, up: undefined, root: locals, h, depth: 0, extra
    });
  }

  renderString(source, data = {}) {
    const tree = this.parse(source);
    const h = this.helpers();
    const locals = Object.assign({}, data, { h });
    return this.renderNodes(tree.children, { locals, item: undefined, ix: 0, last: false, up: undefined, root: locals, h, depth: 0 });
  }

  evalExpr(expr, ctx, { safe = true } = {}) {
    try {
      const fn = this.compileExpr(expr);
      const value = fn(ctx.locals, ctx.item, ctx.ix, ctx.last, ctx.up, ctx.root, ctx.h);
      return value;
    } catch (e) {
      if (safe) {
        if (this.logger) this.logger.warn('خطا در ارزیابی عبارت قالب:', expr, e.message);
        return '';
      }
      throw e;
    }
  }

  renderNodes(nodes, ctx) {
    let out = '';
    for (const node of nodes || []) {
      if (ctx.depth > 40) break;
      switch (node.type) {
        case 'text':
          out += node.value;
          break;
        case 'output': {
          const v = this.evalExpr(node.expr, ctx);
          out += node.raw ? (v === null || v === undefined ? '' : String(v)) : utils.esc(v === null || v === undefined ? '' : v);
          break;
        }
        case 'include': {
          const childCtx = Object.assign({}, ctx, { depth: ctx.depth + 1 });
          out += this.renderTemplate(node.name, ctx.locals, childCtx.extra || {});
          break;
        }
        case 'if': {
          let cond = this.evalExpr(node.expr, ctx);
          if (node.negate) cond = !cond;
          if (cond) out += this.renderNodes(node.children, Object.assign({}, ctx, { depth: ctx.depth + 1 }));
          else if (node.elseChildren.length) out += this.renderNodes(node.elseChildren, Object.assign({}, ctx, { depth: ctx.depth + 1 }));
          break;
        }
        case 'each': {
          const list = this.evalExpr(node.expr, ctx);
          const arr = Array.isArray(list) ? list : (list && typeof list === 'object' ? Object.values(list) : []);
          if (!arr.length) {
            if (node.elseChildren.length) out += this.renderNodes(node.elseChildren, Object.assign({}, ctx, { depth: ctx.depth + 1 }));
            break;
          }
          arr.forEach((item, i) => {
            const itemLocals = (item && typeof item === 'object') ? Object.assign({}, ctx.locals, item) : Object.assign({}, ctx.locals, { this: item });
            const childCtx = {
              locals: itemLocals,
              item,
              ix: i,
              last: i === arr.length - 1,
              up: ctx.locals,
              root: ctx.root,
              h: ctx.h,
              depth: ctx.depth + 1,
              extra: ctx.extra
            };
            out += this.renderNodes(node.children, childCtx);
          });
          break;
        }
        default:
          break;
      }
    }
    return out;
  }

  /**
   * رندر یک صفحه با قالب اصلی (layout)
   * @param {string} name نام قالب صفحه (مثل 'portal/home')
   * @param {object} data داده‌ها
   * @param {string|null} layout نام قالب اصلی (پیش‌فرض: 'layouts/site')
   */
  /** مقادیر پیش‌فرض مشترک همه قالب‌ها (مانند app و brand) */
  setDefaults(fn) { this.defaultsFn = fn; }

  defaults() {
    try {
      return (this.defaultsFn && this.defaultsFn()) || {};
    } catch (e) {
      return {};
    }
  }

  render(name, data = {}, layout = 'layouts/site') {
    const merged = Object.assign({}, this.defaults(), data);
    const html = this.renderTemplate(name, merged);
    if (!layout) return html;
    try {
      return this.renderTemplate(layout, Object.assign({}, merged, { body: html }));
    } catch (e) {
      if (this.logger) this.logger.warn('قالب اصلی یافت نشد:', layout, e.message);
      return html;
    }
  }
}

function utilFaNumber(n) {
  const num = Number(n);
  if (isNaN(num)) return utils.faDigits(n);
  return utils.faDigits(num.toLocaleString('en-US'));
}

module.exports = { View };
