const { Pool } = require('pg');

let pool = null;
let wrapper = null;

// Convert ? placeholders to $1, $2, ...
function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Convert SQLite-specific SQL to PostgreSQL
function convertSql(sql) {
  let converted = convertPlaceholders(sql);

  // INSERT OR IGNORE → INSERT INTO ... ON CONFLICT DO NOTHING
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(sql)) {
    converted = converted.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
    converted = converted.trimEnd().replace(/;?\s*$/, '') + ' ON CONFLICT DO NOTHING';
  }

  return converted;
}

// Tables without an 'id' serial primary key (composite PKs)
const NO_ID_TABLES = ['lesson_students', 'lesson_topics'];

class DbWrapper {
  constructor(pgPool) {
    this._pool = pgPool;
  }

  prepare(sql) {
    const pgSql = convertSql(sql);
    const self = this;

    const isInsert = /^\s*INSERT\s+INTO\s+/i.test(pgSql);
    const hasNoId = NO_ID_TABLES.some(t =>
      new RegExp(`INSERT\\s+INTO\\s+${t}\\b`, 'i').test(pgSql)
    );

    return {
      async run(...params) {
        let querySql = pgSql;
        // Automatically add RETURNING id for INSERT on tables with serial id
        if (isInsert && !hasNoId && !/RETURNING/i.test(querySql)) {
          querySql = querySql.trimEnd().replace(/\s*;?\s*$/, '') + ' RETURNING id';
        }
        const result = await self._pool.query(querySql, params);
        return {
          changes: result.rowCount,
          lastInsertRowid: isInsert && result.rows[0] ? result.rows[0].id : null
        };
      },
      async get(...params) {
        const result = await self._pool.query(pgSql, params);
        return result.rows[0] || null;
      },
      async all(...params) {
        const result = await self._pool.query(pgSql, params);
        return result.rows;
      }
    };
  }

  async exec(sql) {
    await this._pool.query(sql);
  }

  async getClient() {
    return await this._pool.connect();
  }

  getPool() {
    return this._pool;
  }

  async close() {
    await this._pool.end();
  }
}

async function initDb() {
  if (wrapper) return wrapper;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  pool = new Pool({
    connectionString,
    ssl: connectionString.includes('railway.app') || connectionString.includes('neon.tech')
      ? { rejectUnauthorized: false }
      : false,
    max: 10
  });

  // Test connection
  try {
    const client = await pool.connect();
    console.log('Connected to PostgreSQL');
    client.release();
  } catch (err) {
    console.error('Failed to connect to PostgreSQL:', err.message);
    process.exit(1);
  }

  wrapper = new DbWrapper(pool);
  await migrate(wrapper);
  return wrapper;
}

function getDb() {
  if (!wrapper) throw new Error('Database not initialized. Call await initDb() first.');
  return wrapper;
}

function getPool() {
  if (!pool) throw new Error('Database not initialized. Call await initDb() first.');
  return pool;
}

async function migrate(w) {
  await w.exec(`
    CREATE TABLE IF NOT EXISTS clubs (
      id          SERIAL PRIMARY KEY,
      name        TEXT    NOT NULL,
      slug        TEXT    NOT NULL UNIQUE,
      description TEXT    DEFAULT '',
      is_active   INTEGER DEFAULT 1,
      created_at  TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id             SERIAL PRIMARY KEY,
      username       TEXT    NOT NULL UNIQUE,
      password_hash  TEXT    NOT NULL,
      role           TEXT    NOT NULL CHECK(role IN ('admin','instructor','student')),
      name           TEXT    NOT NULL,
      email          TEXT    NOT NULL UNIQUE,
      phone          TEXT    DEFAULT NULL,
      status         TEXT    DEFAULT NULL,
      pp2_exam_passed INTEGER DEFAULT 0,
      pp2_exam_date  TEXT    DEFAULT NULL,
      must_change_password INTEGER DEFAULT 0,
      course_started TEXT    DEFAULT NULL,
      student_notes  TEXT    DEFAULT NULL,
      club_id        INTEGER DEFAULT NULL REFERENCES clubs(id),
      created_at     TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sites (
      id          SERIAL PRIMARY KEY,
      name        TEXT    NOT NULL,
      description TEXT    DEFAULT NULL,
      club_id     INTEGER NOT NULL REFERENCES clubs(id),
      created_at  TIMESTAMP DEFAULT NOW(),
      UNIQUE(name, club_id)
    );

    CREATE TABLE IF NOT EXISTS equipment (
      id                    SERIAL PRIMARY KEY,
      student_id            INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      wing_manufacturer     TEXT    DEFAULT '',
      wing_model            TEXT    DEFAULT '',
      wing_size             TEXT    DEFAULT '',
      wing_year             INTEGER,
      wing_club_owned       INTEGER DEFAULT 0,
      harness_manufacturer  TEXT    DEFAULT '',
      harness_model         TEXT    DEFAULT '',
      harness_club_owned    INTEGER DEFAULT 0,
      reserve_manufacturer  TEXT    DEFAULT '',
      reserve_model         TEXT    DEFAULT '',
      reserve_size          TEXT    DEFAULT '',
      reserve_pack_date     TEXT,
      reserve_club_owned    INTEGER DEFAULT 0,
      updated_at            TIMESTAMP,
      created_at            TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS flights (
      id                 SERIAL PRIMARY KEY,
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
      created_at         TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id             SERIAL PRIMARY KEY,
      date           TEXT    NOT NULL,
      instructor_id  INTEGER NOT NULL REFERENCES users(id),
      notes          TEXT    DEFAULT NULL,
      created_at     TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS theory_completions (
      id            SERIAL PRIMARY KEY,
      student_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      topic_key     TEXT    NOT NULL,
      completed_by  INTEGER NOT NULL REFERENCES users(id),
      lesson_id     INTEGER DEFAULT NULL REFERENCES lessons(id) ON DELETE SET NULL,
      completed_at  TIMESTAMP DEFAULT NOW(),
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
      id          SERIAL PRIMARY KEY,
      student_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      flight_id   INTEGER DEFAULT NULL REFERENCES flights(id) ON DELETE SET NULL,
      filename    TEXT    NOT NULL,
      stored_name TEXT    NOT NULL UNIQUE,
      mimetype    TEXT    NOT NULL,
      size_bytes  INTEGER NOT NULL,
      uploaded_by INTEGER NOT NULL REFERENCES users(id),
      created_at  TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id          SERIAL PRIMARY KEY,
      timestamp   TIMESTAMP DEFAULT NOW(),
      user_id     INTEGER NOT NULL,
      action      TEXT    NOT NULL,
      entity_type TEXT    NOT NULL,
      entity_id   INTEGER NOT NULL,
      details     TEXT    DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT    NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used       INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS theory_sections (
      id          SERIAL PRIMARY KEY,
      level       TEXT    NOT NULL CHECK(level IN ('pp1','pp2')),
      key         TEXT    NOT NULL UNIQUE,
      title       TEXT    NOT NULL,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS theory_topics_def (
      id               SERIAL PRIMARY KEY,
      section_id       INTEGER NOT NULL REFERENCES theory_sections(id) ON DELETE CASCADE,
      key              TEXT    NOT NULL UNIQUE,
      title            TEXT    NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 45,
      comment          TEXT    DEFAULT NULL,
      sort_order       INTEGER NOT NULL DEFAULT 0,
      created_at       TIMESTAMP DEFAULT NOW()
    );
  `);

  // Additive column migrations for existing databases
  await w.exec(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pp2_exam_date TEXT DEFAULT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password INTEGER DEFAULT 0;
  `);

  // Create indexes (IF NOT EXISTS supported in PostgreSQL)
  await w.exec(`
    CREATE INDEX IF NOT EXISTS idx_flights_student ON flights(student_id, date);
    CREATE INDEX IF NOT EXISTS idx_theory_student ON theory_completions(student_id);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_resets_user ON password_resets(user_id, used);
    CREATE INDEX IF NOT EXISTS idx_theory_sections_level ON theory_sections(level, sort_order);
    CREATE INDEX IF NOT EXISTS idx_theory_topics_def_section ON theory_topics_def(section_id, sort_order);
  `);
}

// Graceful shutdown
process.on('SIGINT', async () => { if (pool) await pool.end(); process.exit(0); });
process.on('SIGTERM', async () => { if (pool) await pool.end(); process.exit(0); });

module.exports = { initDb, getDb, getPool };
