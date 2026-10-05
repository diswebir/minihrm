'use strict';
/** احراز هویت — هش رمز عبور با scrypt (بدون نیاز به ماژول نیتیو) */
const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const parts = String(stored || '').split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const [, salt, hash] = parts;
    const check = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
  } catch (_) {
    return false;
  }
}

function passwordStrength(password) {
  const p = String(password || '');
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^a-zA-Z0-9]/.test(p)) score++;
  const labels = ['خیلی ضعیف', 'ضعیف', 'متوسط', 'خوب', 'قوی', 'بسیار قوی'];
  return { score, label: labels[Math.min(score, 5)] };
}

module.exports = { hashPassword, verifyPassword, passwordStrength };
