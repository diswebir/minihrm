/**
 * ابزار CSV (سازگار با Excel فارسی — با BOM)
 */
'use strict';

function escapeCell(value, delimiter = ',') {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@]/.test(s)) s = "'" + s;         // جلوگیری از فرمول تزریقی در Excel
  if (s.includes('"') || s.includes(delimiter) || s.includes('\n') || s.includes('\r')) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * ساخت متن CSV
 * @param {Array<object>} rows
 * @param {Array<{key:string,title:string,get?:Function}>} columns
 */
function toCSV(rows, columns, { delimiter = ',', includeHeader = true } = {}) {
  const head = includeHeader ? columns.map((c) => escapeCell(c.title, delimiter)).join(delimiter) : null;
  const body = (rows || []).map((row) => columns.map((c) => {
    const v = typeof c.get === 'function' ? c.get(row) : (row ? row[c.key] : '');
    if (Array.isArray(v)) return escapeCell(v.join(' | '), delimiter);
    if (v && typeof v === 'object') return escapeCell(JSON.stringify(v), delimiter);
    return escapeCell(v, delimiter);
  }).join(delimiter));
  return [head, ...body].filter((x) => x !== null).join('\r\n');
}

/** پارس CSV ساده (پشتیبانی از نقل‌قول) */
function parseCSV(text, { delimiter = ',' } = {}) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const src = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch === '\r') { /* skip */ }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** ساخت فایل CSV از خروجی درخواست‌ها (ستون‌های پویا) */
function fromObjects(rows) {
  const keys = new Set();
  for (const r of rows) for (const k of Object.keys(r)) keys.add(k);
  const columns = Array.from(keys).map((k) => ({ key: k, title: k }));
  return toCSV(rows, columns);
}

module.exports = { toCSV, parseCSV, fromObjects, escapeCell };
