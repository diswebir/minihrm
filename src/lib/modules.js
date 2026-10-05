'use strict';
/**
 * سیستم ماژولار سامانه — هر ماژول از src/modules/<code>/module.json + routes.js تشکیل شده
 * ماژول‌ها قابل فعال/غیرفعال‌سازی از پنل مدیریت هستند.
 */
const fs = require('fs');
const path = require('path');
const db = require('../db');

const MODULES_DIR = path.join(__dirname, '..', 'modules');

function discover() {
  const list = [];
  if (!fs.existsSync(MODULES_DIR)) return list;
  for (const dir of fs.readdirSync(MODULES_DIR)) {
    const manifestPath = path.join(MODULES_DIR, dir, 'module.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.code = manifest.code || dir;
      manifest.routesPath = path.join(MODULES_DIR, dir, 'routes.js');
      list.push(manifest);
    } catch (_) { /* ignore */ }
  }
  return list;
}

function isEnabled(code) {
  const r = db.prepare('SELECT enabled, installed FROM modules WHERE code = ?').get(code);
  return !!(r && r.enabled && r.installed);
}

/** بارگذاری ماژول‌های فعال روی اپلیکیشن */
function register(app) {
  for (const m of discover()) {
    let dbMod = db.prepare('SELECT * FROM modules WHERE code = ?').get(m.code);
    if (!dbMod) {
      db.prepare('INSERT INTO modules (code, name, description, icon, version, enabled, installed, sort) VALUES (?,?,?,?,?,?,?,?)')
        .run(m.code, m.name, m.description || '', m.icon || 'puzzle', m.version || '1.0.0', 1, 1, m.sort || 0);
    }
    if (!isEnabled(m.code)) continue;
    if (fs.existsSync(m.routesPath)) {
      try {
        const mod = require(m.routesPath);
        if (mod && typeof mod.register === 'function') {
          mod.register(app);
          console.log(`[modules] registered: ${m.code}`);
        } else if (mod && typeof mod === 'function') {
          // ماژول یک express.Router صادر کرده است
          app.use(mod);
          console.log(`[modules] registered (router): ${m.code}`);
        }
      } catch (e) {
        console.error(`[modules] failed to register ${m.code}:`, e.message);
      }
    }
  }
}

module.exports = { discover, isEnabled, register };
