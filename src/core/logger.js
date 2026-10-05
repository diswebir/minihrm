/**
 * لاگر ساده سامانه (متن + لاگ خطا در پوشه data/logs)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

class Logger {
  constructor({ root, level = 'info' }) {
    this.root = root;
    this.level = LEVELS[level] || 20;
    this.logDir = path.join(root, 'data', 'logs');
    try { fs.mkdirSync(this.logDir, { recursive: true }); } catch (e) { /* ignore */ }
  }

  _write(level, args) {
    if (LEVELS[level] < this.level) return;
    const ts = new Date().toISOString();
    const msg = args.map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'object') { try { return JSON.stringify(a); } catch (e) { return String(a); } }
      return String(a);
    }).join(' ');
    const line = `${ts} [${level.toUpperCase()}] ${msg}`;
    const color = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' }[level] || '';
    process.stdout.write(`${color}${line}\x1b[0m\n`);
    if (level === 'error' || level === 'warn') {
      try {
        const file = path.join(this.logDir, `${new Date().toISOString().slice(0, 10)}.log`);
        fs.appendFileSync(file, line + '\n');
      } catch (e) { /* ignore */ }
    }
  }

  debug(...a) { this._write('debug', a); }
  info(...a) { this._write('info', a); }
  warn(...a) { this._write('warn', a); }
  error(...a) { this._write('error', a); }
}

module.exports = { Logger };
