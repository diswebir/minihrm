/**
 * آپلود فایل — پارسر multipart/form-data بدون وابستگی خارجی
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { enDigits, formatBytes } = require('./utils');

const MAX_TOTAL = 30 * 1024 * 1024; // ۳۰ مگابایت برای هر درخواست

/** خواندن بدنه خام درخواست با محدودیت حجم */
function readBody(req, maxBytes = MAX_TOTAL) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > maxBytes) {
        done = true;
        reject(Object.assign(new Error(`حجم فایل‌های ارسالی بیش از حد مجاز است (حداکثر ${formatBytes(maxBytes)})`), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } });
    req.on('error', (e) => { if (!done) { done = true; reject(e); } });
  });
}

/** پارس multipart/form-data */
function parseMultipart(buffer, boundary) {
  const fields = {};
  const files = [];
  const delim = Buffer.from(`--${boundary}`);
  let index = buffer.indexOf(delim);
  while (index !== -1) {
    const start = index + delim.length;
    // انتهای بخش
    if (buffer.slice(start, start + 2).toString() === '--') break;
    const nextDelim = buffer.indexOf(delim, start);
    if (nextDelim === -1) break;
    let part = buffer.slice(start, nextDelim);
    // حذف CRLF ابتدا/انتها
    if (part.slice(0, 2).toString() === '\r\n') part = part.slice(2);
    if (part.slice(-2).toString() === '\r\n') part = part.slice(0, -2);

    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const headerText = part.slice(0, headerEnd).toString('utf8');
      const content = part.slice(headerEnd + 4);
      const nameMatch = /name="([^"]*)"/i.exec(headerText);
      const fileMatch = /filename="([^"]*)"/i.exec(headerText);
      const typeMatch = /content-type:\s*([^\r\n;]+)/i.exec(headerText);
      const name = nameMatch ? nameMatch[1] : null;
      if (name) {
        if (fileMatch && fileMatch[1]) {
          files.push({
            field: name,
            filename: decodeURIComponent(fileMatch[1]).replace(/[\\/]/g, '/').split('/').pop(),
            mime: typeMatch ? typeMatch[1].trim() : 'application/octet-stream',
            size: content.length,
            buffer: content
          });
        } else {
          const value = content.toString('utf8');
          if (fields[name] !== undefined) {
            fields[name] = Array.isArray(fields[name]) ? fields[name].concat(value) : [fields[name], value];
          } else fields[name] = value;
        }
      }
    }
    index = nextDelim;
  }
  return { fields, files };
}

/** پارس بدنه درخواست بر اساس Content-Type */
async function parseBody(req, { maxBytes = MAX_TOTAL } = {}) {
  const type = String(req.headers['content-type'] || '').toLowerCase();
  if (req.method === 'GET' || req.method === 'HEAD') return { fields: {}, files: [], raw: null };
  if (type.includes('multipart/form-data')) {
    const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(type);
    if (!boundaryMatch) return { fields: {}, files: [], raw: null };
    const boundary = (boundaryMatch[1] || boundaryMatch[2]).trim();
    const buffer = await readBody(req, maxBytes);
    const parsed = parseMultipart(buffer, boundary);
    return { fields: parsed.fields, files: parsed.files, raw: buffer };
  }
  if (type.includes('application/json')) {
    const buffer = await readBody(req, Math.min(maxBytes, 5 * 1024 * 1024));
    req._rawBody = buffer;
    try { return { fields: buffer.length ? JSON.parse(buffer.toString('utf8')) : {}, files: [], raw: buffer, json: true }; }
    catch (e) { throw Object.assign(new Error('بدنه JSON نامعتبر است'), { status: 400 }); }
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    const buffer = await readBody(req, Math.min(maxBytes, 2 * 1024 * 1024));
    const params = new URLSearchParams(buffer.toString('utf8'));
    const fields = {};
    for (const [k, v] of params.entries()) {
      if (fields[k] !== undefined) fields[k] = Array.isArray(fields[k]) ? fields[k].concat(v) : [fields[k], v];
      else fields[k] = v;
    }
    return { fields, files: [], raw: buffer };
  }
  // سایر انواع (مثل text/plain)
  const buffer = await readBody(req, Math.min(maxBytes, 1024 * 1024));
  return { fields: {}, files: [], raw: buffer, text: buffer.toString('utf8') };
}

const BLOCKED_EXT = ['php', 'php3', 'php4', 'php5', 'phtml', 'pht', 'phar', 'cgi', 'pl', 'py', 'rb', 'sh', 'bash', 'exe', 'bat', 'cmd', 'com', 'msi', 'dll', 'so', 'jsp', 'asp', 'aspx', 'htaccess', 'js'];
const DEFAULT_ALLOWED = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'zip', 'rar'];

/**
 * ذخیره فایل آپلودی روی دیسک
 * @param {object} file شیء فایل از parseBody
 * @param {object} opts { dir, allowed, maxBytes, prefix }
 */
function saveUpload(file, { root, dir = 'misc', allowed = DEFAULT_ALLOWED, maxBytes = 5 * 1024 * 1024, prefix = 'f' } = {}) {
  if (!file || !file.buffer) throw Object.assign(new Error('فایلی ارسال نشده است'), { status: 400 });
  const ext = (file.filename.split('.').pop() || '').toLowerCase();
  if (!ext) throw Object.assign(new Error('فایل بدون پسوند مجاز نیست'), { status: 400 });
  if (BLOCKED_EXT.includes(ext)) throw Object.assign(new Error(`پسوند .${ext} برای آپلود مجاز نیست`), { status: 400 });
  if (allowed && allowed.length && !allowed.includes(ext)) {
    throw Object.assign(new Error(`فرمت .${ext} مجاز نیست. فرمت‌های مجاز: ${allowed.join('، ')}`), { status: 400 });
  }
  if (file.buffer.length > maxBytes) {
    throw Object.assign(new Error(`حجم فایل ${formatBytes(file.buffer.length)} است؛ حداکثر مجاز ${formatBytes(maxBytes)}`), { status: 400 });
  }
  const safeName = `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const relDir = path.join('uploads', String(dir).replace(/\.\./g, '').replace(/^\/+/, ''));
  const absDir = path.join(root, 'data', relDir);
  fs.mkdirSync(absDir, { recursive: true });
  const absPath = path.join(absDir, safeName);
  fs.writeFileSync(absPath, file.buffer);
  return {
    path: path.join('/', relDir, safeName).replace(/\\/g, '/'),
    absPath,
    name: file.filename,
    size: file.buffer.length,
    mime: file.mime,
    uploadedAt: new Date().toISOString()
  };
}

/** حذف فایل آپلودی (با کنترل مسیر) */
function removeUpload(root, relPath) {
  try {
    const clean = String(relPath || '').replace(/^\/+/, '');
    if (!clean.startsWith('uploads/')) return false;
    const abs = path.join(root, 'data', clean);
    if (!abs.startsWith(path.join(root, 'data', 'uploads'))) return false;
    if (fs.existsSync(abs)) { fs.unlinkSync(abs); return true; }
  } catch (e) { /* ignore */ }
  return false;
}

module.exports = { parseBody, parseMultipart, saveUpload, removeUpload, readBody, DEFAULT_ALLOWED, BLOCKED_EXT };
