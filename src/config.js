'use strict';
/** پیکربندی سامانه — config.json + تنظیمات دیتابیس */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.MINIHRM_DATA || path.join(ROOT, 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const DB_PATH = path.join(DATA_DIR, 'app.db');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (_) {
    return null;
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

function isInstalled() {
  const cfg = loadConfig();
  return !!(cfg && cfg.installed);
}

function ensureSecret() {
  const cfg = loadConfig() || {};
  if (!cfg.sessionSecret) {
    cfg.sessionSecret = crypto.randomBytes(48).toString('hex');
    saveConfig(cfg);
  }
  return cfg.sessionSecret;
}

module.exports = {
  ROOT, DATA_DIR, CONFIG_PATH, DB_PATH, UPLOAD_DIR,
  loadConfig, saveConfig, isInstalled, ensureSecret
};
