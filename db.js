const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'data.db');

let db = null;
let saveTimeout = null;

// Save database to disk (debounced)
function saveToDisk() {
  if (!db) return;
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }, 100);
}

function saveNow() {
  if (!db) return;
  if (saveTimeout) clearTimeout(saveTimeout);
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Wrapper that provides better-sqlite3-like API
class DbWrapper {
  constructor(sqlDb) {
    this._db = sqlDb;
  }

  prepare(sql) {
    const stmt = this._db.prepare(sql);
    const self = this;
    return {
      run(...params) {
        stmt.bind(params);
        stmt.step();
        stmt.free();
        saveToDisk();
        const info = {
          changes: self._db.getRowsModified(),
          lastInsertRowid: self._lastInsertRowId(),
        };
        return info;
      },
      get(...params) {
        stmt.bind(params);
        let result = null;
        if (stmt.step()) {
          result = stmt.getAsObject();
        }
        stmt.free();
        return result;
      },
      all(...params) {
        const results = [];
        stmt.bind(params);
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      },
    };
  }

  exec(sql) {
    this._db.run(sql);
    saveToDisk();
  }

  pragma(pragmaStr) {
    try {
      this._db.run(`PRAGMA ${pragmaStr}`);
    } catch (e) {
      // Some pragmas may not be supported
    }
  }

  transaction(fn) {
    return (...args) => {
      this._db.run('BEGIN TRANSACTION');
      try {
        const result = fn(...args);
        this._db.run('COMMIT');
        saveToDisk();
        return result;
      } catch (e) {
        this._db.run('ROLLBACK');
        throw e;
      }
    };
  }

  _lastInsertRowId() {
    const stmt = this._db.prepare('SELECT last_insert_rowid() as id');
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();
    return row.id;
  }

  close() {
    saveNow();
    this._db.close();
  }
}

let wrapper = null;
let initPromise = null;

async function initDb() {
  if (wrapper) return wrapper;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const SQL = await initSqlJs();

    // Ensure data directory exists
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Load existing database or create new one
    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }

    wrapper = new DbWrapper(db);
    wrapper.pragma('foreign_keys = ON');
    migrate(wrapper);
    return wrapper;
  })();

  return initPromise;
}

// Synchronous getter — only works after initDb() has completed
function getDb() {
  if (!wrapper) throw new Error('Database not initialized. Call await initDb() first.');
  return wrapper;
}

function migrate(w) {
  w.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      username       TEXT    NOT NULL UNIQUE,
      password_hash  TEXT    NOT NULL,
      role           TEXT    NOT NULL CHECK(role IN ('instructor','student')),
      name           TEXT    NOT NULL,
      email          TEXT    NOT NULL UNIQUE,
      phone          TEXT    DEFAULT NULL,
      status         TEXT    DEFAULT NULL,
      course_started TEXT    DEFAULT NULL,
      student_notes  TEXT    DEFAULT NULL,
      created_at     TEXT    DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sites (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      description TEXT    DEFAULT NULL,
      created_at  TEXT    DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS flights (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date               TEXT    NOT NULL,
      flight_count       INTEGER NOT NULL DEFAULT 1,
      flight_type        TEXT    NOT NULL CHECK(flight_type IN ('low','high')),
      site_id            INTEGER NOT NULL REFERENCES sites(id),
      weather            TEXT    DEFAULT NULL,
      exercises          TEXT    DEFAULT NULL,
      notes              TEXT    DEFAULT NULL,
      is_approval_flight INTEGER DEFAULT 0,
      added_by           INTEGER NOT NULL REFERENCES users(id),
      created_at         TEXT    DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      date           TEXT    NOT NULL,
      instructor_id  INTEGER NOT NULL REFERENCES users(id),
      notes          TEXT    DEFAULT NULL,
      created_at     TEXT    DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS theory_completions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      topic_key     TEXT    NOT NULL,
      completed_by  INTEGER NOT NULL REFERENCES users(id),
      lesson_id     INTEGER DEFAULT NULL REFERENCES lessons(id) ON DELETE SET NULL,
      completed_at  TEXT    DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, topic_key)
    );

    CREATE TABLE IF NOT EXISTS lesson_students (
      lesson_id   INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      student_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY(lesson_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS lesson_topics (
      lesson_id  INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      topic_key  TEXT    NOT NULL,
      PRIMARY KEY(lesson_id, topic_key)
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      flight_id   INTEGER DEFAULT NULL REFERENCES flights(id) ON DELETE SET NULL,
      filename    TEXT    NOT NULL,
      stored_name TEXT    NOT NULL UNIQUE,
      mimetype    TEXT    NOT NULL,
      size_bytes  INTEGER NOT NULL,
      uploaded_by INTEGER NOT NULL REFERENCES users(id),
      created_at  TEXT    DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp   TEXT    DEFAULT CURRENT_TIMESTAMP,
      user_id     INTEGER NOT NULL,
      action      TEXT    NOT NULL,
      entity_type TEXT    NOT NULL,
      entity_id   INTEGER NOT NULL,
      details     TEXT    DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT    NOT NULL,
      expires_at TEXT    NOT NULL,
      used       INTEGER DEFAULT 0,
      created_at TEXT    DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS theory_sections (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      level       TEXT    NOT NULL CHECK(level IN ('pp1','pp2')),
      key         TEXT    NOT NULL UNIQUE,
      title       TEXT    NOT NULL,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS theory_topics_def (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id       INTEGER NOT NULL REFERENCES theory_sections(id) ON DELETE CASCADE,
      key              TEXT    NOT NULL UNIQUE,
      title            TEXT    NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 45,
      comment          TEXT    DEFAULT NULL,
      sort_order       INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT    DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create indexes (ignore if exist)
  try { w.exec('CREATE INDEX idx_flights_student ON flights(student_id, date)'); } catch(e) {}
  try { w.exec('CREATE INDEX idx_theory_student ON theory_completions(student_id)'); } catch(e) {}
  try { w.exec('CREATE INDEX idx_audit_timestamp ON audit_log(timestamp)'); } catch(e) {}
  try { w.exec('CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id)'); } catch(e) {}
  try { w.exec('CREATE INDEX idx_resets_user ON password_resets(user_id, used)'); } catch(e) {}
  try { w.exec('CREATE INDEX idx_theory_sections_level ON theory_sections(level, sort_order)'); } catch(e) {}
  try { w.exec('CREATE INDEX idx_theory_topics_def_section ON theory_topics_def(section_id, sort_order)'); } catch(e) {}
}

// Graceful shutdown
process.on('SIGINT', () => { saveNow(); process.exit(0); });
process.on('SIGTERM', () => { saveNow(); process.exit(0); });

module.exports = { initDb, getDb, saveNow };
