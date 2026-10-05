'use strict';
/**
 * MiniHRM - لایه دسترسی به پایگاه داده
 * ---------------------------------------------------------------
 * این لایه دو موتور را پشتیبانی می‌کند تا روی هر هاست cPanel بدون نیاز به
 * کامپایل ماژول نیتیو اجرا شود:
 *   1) node:sqlite (SQLite واقعی داخلی Node.js 22+ — امن برای چندپردازشی)
 *   2) sql.js (SQLite مبتنی بر WebAssembly — کاملاً خالص JS، سازگار با همه‌جا)
 * API مشابه better-sqlite3: prepare().run/get/all , exec , transaction
 */
const fs = require('fs');
const path = require('path');

let engine = null;        // 'node-sqlite' | 'sqljs'
let SQL = null;           // sql.js module
let rawDb = null;         // underlying db handle
let dbPath = null;
let lastSync = { mtimeMs: -1, size: -1 };
let inTransaction = false;
let writeDepth = 0;

/* ---------- helpers ---------- */
function flattenParams(args) {
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
}

function sleepSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch (_) { /* ignore */ }
}

/* ---------- sql.js coordination (multi-process safety) ---------- */
const LOCK_TIMEOUT_MS = 5000;
const LOCK_RETRY_MS = 15;

function lockDir() { return dbPath + '.lock'; }

function acquireLock() {
  const dir = lockDir();
  const start = Date.now();
  for (;;) {
    try {
      fs.mkdirSync(dir);
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // lock stale after timeout: break it
      try {
        const st = fs.statSync(dir);
        if (Date.now() - st.mtimeMs > LOCK_TIMEOUT_MS * 3) {
          fs.rmdirSync(dir);
          continue;
        }
      } catch (_) { /* raced */ }
      if (Date.now() - start > LOCK_TIMEOUT_MS) {
        // last resort: break stale lock
        try { fs.rmdirSync(dir); } catch (_) { /* ignore */ }
        continue;
      }
      sleepSync(LOCK_RETRY_MS);
    }
  }
}

function releaseLock() {
  try { fs.rmdirSync(lockDir()); } catch (_) { /* ignore */ }
}

function fileStat() {
  try {
    const st = fs.statSync(dbPath);
    return { mtimeMs: st.mtimeMs, size: st.size };
  } catch (_) {
    return { mtimeMs: -1, size: -1 };
  }
}

function ensureFresh() {
  if (engine !== 'sqljs') return;
  const cur = fileStat();
  if (!rawDb || cur.mtimeMs !== lastSync.mtimeMs || cur.size !== lastSync.size) {
    let buf = null;
    if (cur.mtimeMs !== -1) {
      try { buf = fs.readFileSync(dbPath); } catch (_) { buf = null; }
    }
    if (rawDb && rawDb.close) { try { rawDb.close(); } catch (_) { /* ignore */ } }
    rawDb = new SQL.Database(buf && buf.length ? buf : undefined);
    lastSync = cur;
  }
}

function persistSqljs() {
  const data = Buffer.from(rawDb.export());
  const tmp = dbPath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, dbPath);
  lastSync = fileStat();
}

/** Execute fn inside a write lock with one persist at the end. */
function withWrite(fn) {
  if (engine === 'node-sqlite') return fn();
  if (inTransaction) return fn(); // outer transaction handles persist
  acquireLock();
  try {
    ensureFresh();
    const result = fn();
    persistSqljs();
    return result;
  } finally {
    releaseLock();
  }
}

/* ---------- statement wrappers ---------- */
function makeStatement(sql) {
  if (engine === 'node-sqlite') {
    const stmt = rawDb.prepare(sql);
    return {
      run(...args) {
        const r = stmt.run(...flattenParams(args));
        return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
      },
      get(...args) { return stmt.get(...flattenParams(args)); },
      all(...args) { return stmt.all(...flattenParams(args)); }
    };
  }
  // sql.js
  return {
    run(...args) {
      const params = flattenParams(args);
      return withWrite(() => {
        const stmt = rawDb.prepare(sql);
        try {
          stmt.bind(params.length ? params : undefined);
          stmt.step();
        } finally { stmt.free(); }
        const changes = rawDb.getRowsModified();
        let lastId = null;
        try {
          const r = rawDb.exec('SELECT last_insert_rowid() AS id');
          if (r && r[0] && r[0].values[0]) lastId = Number(r[0].values[0][0]);
        } catch (_) { /* ignore */ }
        return { changes: Number(changes), lastInsertRowid: lastId };
      });
    },
    get(...args) {
      const params = flattenParams(args);
      ensureFresh();
      const stmt = rawDb.prepare(sql);
      try {
        stmt.bind(params.length ? params : undefined);
        if (stmt.step()) {
          const obj = stmt.getAsObject();
          return obj;
        }
        return undefined;
      } finally { stmt.free(); }
    },
    all(...args) {
      const params = flattenParams(args);
      ensureFresh();
      const stmt = rawDb.prepare(sql);
      try {
        stmt.bind(params.length ? params : undefined);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        return rows;
      } finally { stmt.free(); }
    }
  };
}

/* ---------- public API ---------- */
async function init(filePath) {
  dbPath = filePath;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  // 1) try real SQLite inside Node.js (>= 22.5) — مگر اینکه engine اجباری شود
  const forced = String(process.env.MINIHRM_DB_ENGINE || '').toLowerCase();
  if (forced !== 'sqljs') {
    try {
      const { DatabaseSync } = require('node:sqlite');
      rawDb = new DatabaseSync(dbPath);
      rawDb.exec('PRAGMA journal_mode = WAL;');
      rawDb.exec('PRAGMA busy_timeout = 8000;');
      rawDb.exec('PRAGMA foreign_keys = ON;');
      engine = 'node-sqlite';
      return { engine };
    } catch (_) { /* fall through */ }
  }

  // 2) sql.js (WebAssembly) — always available, zero native code
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs({
    locateFile: (f) => {
      try { return require.resolve('sql.js/dist/' + f); } catch (_) { return f; }
    }
  });
  engine = 'sqljs';
  ensureFresh();
  if (rawDb) {
    try {
      rawDb.exec('PRAGMA foreign_keys = ON;');
    } catch (_) { /* ignore */ }
  }
  return { engine };
}

function prepare(sql) {
  if (!rawDb) throw new Error('database not initialized');
  return makeStatement(sql);
}

function exec(sql) {
  if (!rawDb) throw new Error('database not initialized');
  return withWrite(() => rawDb.exec(sql));
}

function transaction(fn) {
  return function tx(...args) {
    if (engine === 'node-sqlite') {
      rawDb.exec('BEGIN');
      try {
        const r = fn(...args);
        rawDb.exec('COMMIT');
        return r;
      } catch (e) {
        try { rawDb.exec('ROLLBACK'); } catch (_) { /* ignore */ }
        throw e;
      }
    }
    // sql.js: one lock + one persist for the whole transaction
    if (inTransaction) return fn(...args);
    acquireLock();
    inTransaction = true;
    try {
      ensureFresh();
      rawDb.exec('BEGIN');
      try {
        const r = fn(...args);
        rawDb.exec('COMMIT');
        persistSqljs();
        return r;
      } catch (e) {
        try { rawDb.exec('ROLLBACK'); } catch (_) { /* ignore */ }
        throw e;
      }
    } finally {
      inTransaction = false;
      releaseLock();
    }
  };
}

function close() {
  if (!rawDb) return;
  if (engine === 'node-sqlite') {
    try { rawDb.close(); } catch (_) { /* ignore */ }
  } else {
    try { persistSqljs(); rawDb.close(); } catch (_) { /* ignore */ }
  }
  rawDb = null;
}

/** Force sync to disk (useful before backups/downloads). */
function flush() {
  if (engine === 'sqljs' && rawDb && !inTransaction) {
    acquireLock();
    try { persistSqljs(); } finally { releaseLock(); }
  }
}

/** Raw bytes of the database file (for backup download). */
function snapshot() {
  flush();
  return fs.readFileSync(dbPath);
}

function getEngine() { return engine; }
function getPath() { return dbPath; }

module.exports = { init, prepare, exec, transaction, close, flush, snapshot, getEngine, getPath };
