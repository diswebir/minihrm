// ═══════════════════════════════════════════════════════════
//  Database Connection - SQLite via sql.js (pure JS)
//  Wraps sql.js with better-sqlite3 compatible API
// ═══════════════════════════════════════════════════════════

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'minihrm.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;
let sqlPromise = null;

// Save database to file
function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// Auto-save periodically
setInterval(saveDb, 30000);

// Initialize database
async function initDb() {
  if (!sqlPromise) {
    sqlPromise = initSqlJs();
  }
  const SQL = await sqlPromise;

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  return db;
}

// Get database (synchronous after init)
function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return createDbProxy(db);
}

// Create a proxy that provides better-sqlite3 compatible API
function createDbProxy(sqlJsDb) {
  return {
    exec(sql) {
      try {
        sqlJsDb.exec(sql);
        saveDb();
      } catch (e) {
        // Ignore "table already exists" errors
        if (!e.message.includes('already exists')) {
          throw e;
        }
      }
    },

    prepare(sql) {
      return {
        run(...params) {
          try {
            // Flatten if first arg is array (for spread params)
            const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
            sqlJsDb.run(sql, flatParams);
            return { changes: sqlJsDb.getRowsModified() };
          } catch (e) {
            console.error('SQL Run Error:', e.message, '\nSQL:', sql.substring(0, 200));
            throw e;
          }
        },
        get(...params) {
          try {
            const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
            const stmt = sqlJsDb.prepare(sql);
            if (flatParams.length > 0) {
              stmt.bind(flatParams);
            }
            if (stmt.step()) {
              const cols = stmt.getColumnNames();
              const vals = stmt.get();
              stmt.free();
              const row = {};
              cols.forEach((c, i) => row[c] = vals[i]);
              return row;
            }
            stmt.free();
            return undefined;
          } catch (e) {
            console.error('SQL Get Error:', e.message, '\nSQL:', sql.substring(0, 200));
            throw e;
          }
        },
        all(...params) {
          try {
            const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
            const results = [];
            const stmt = sqlJsDb.prepare(sql);
            if (flatParams.length > 0) {
              stmt.bind(flatParams);
            }
            while (stmt.step()) {
              const cols = stmt.getColumnNames();
              const vals = stmt.get();
              const row = {};
              cols.forEach((c, i) => row[c] = vals[i]);
              results.push(row);
            }
            stmt.free();
            return results;
          } catch (e) {
            console.error('SQL All Error:', e.message, '\nSQL:', sql.substring(0, 200));
            throw e;
          }
        }
      };
    },

    pragma(key, value) {
      // sql.js doesn't support pragma the same way, but we can try
      try {
        if (value !== undefined) {
          sqlJsDb.run(`PRAGMA ${key} = ${value}`);
        } else {
          sqlJsDb.run(`PRAGMA ${key}`);
        }
      } catch (e) {
        // Silently ignore pragma errors
      }
    },

    // Transaction wrapper (better-sqlite3 compatible)
    // sql.js doesn't handle explicit transactions well with run(), so we just execute sequentially
    transaction(fn) {
      return function(...args) {
        return fn.apply(this, args);
      };
    },

    // Raw access for transactions
    raw: sqlJsDb
  };
}

// Close and save
function closeDb() {
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
}

// Handle process exit
process.on('exit', closeDb);
process.on('SIGINT', () => { closeDb(); process.exit(); });
process.on('SIGTERM', () => { closeDb(); process.exit(); });

module.exports = { getDb, initDb, closeDb, DB_PATH };