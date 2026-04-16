const express = require('express');    
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const { Pool } = require('pg');
const { initDb, getDb } = require('./db');
const { logAction } = require('./audit');
const { sendPasswordReset } = require('./mailer');

// Sentry error tracking (optional — only if DSN is configured)
let Sentry = null;
if (process.env.SENTRY_DSN) {
  Sentry = require('@sentry/node');
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.2
  });
}

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-key';
const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';
const DATABASE_URL = process.env.DATABASE_URL;

// Create a separate PG pool for session store (so sessions work before db migrations)
const sessionPool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('railway.app') || DATABASE_URL.includes('neon.tech')
    ? { rejectUnauthorized: false }
    : false,
  max: 3
}) : null;

// Ensure upload directory exists
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Trust proxy (Railway runs behind a reverse proxy)
app.set('trust proxy', 1);

// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================

// Helmet.js — security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      scriptSrcAttr: ["'unsafe-inline'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Rate limiting — login endpoint (strict in production, looser in dev)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 30 : 50,
  message: { error: 'Liian monta kirjautumisyritystä. Yritä uudelleen 15 minuutin kuluttua.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.ip
});

// Rate limiting — general API (100 requests per minute)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Liian monta pyyntöä. Yritä hetken kuluttua uudelleen.' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', apiLimiter);

// Middleware
app.use((req, res, next) => {
  express.json()(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: 'Invalid JSON in request body' });
    }
    next();
  });
});
// Cache-bust app.js and style.css on every deploy (server restart = new version)
const ASSET_VERSION = Date.now().toString();
function serveIndex(req, res) {
  fs.readFile(path.join(__dirname, 'public', 'index.html'), 'utf8', (err, html) => {
    if (err) return res.status(500).send('Error loading page');
    const bustered = html
      .replace('href="style.css"', `href="style.css?v=${ASSET_VERSION}"`)
      .replace('src="app.js"', `src="app.js?v=${ASSET_VERSION}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(bustered);
  });
}
app.get('/', serveIndex);
app.get('/index.html', serveIndex);
app.use(express.static('public'));

// ============================================================================
// SESSION CONFIGURATION (PostgreSQL-backed)
// ============================================================================

if (sessionPool) {
  app.use(session({
    store: new pgSession({
      pool: sessionPool,
      tableName: 'session',
      createTableIfMissing: true
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));
} else {
  // Fallback for local development without DATABASE_URL
  app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    }
  }));
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = uuidv4() + ext;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPG, and PNG files are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// ============================================================================
// CSRF PROTECTION (synchronizer token pattern)
// ============================================================================

// Generate a per-session CSRF token on first request.
app.use((req, res, next) => {
  if (req.session && !req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  next();
});

// Public endpoints exempt from CSRF check — they either create the session
// (login) or are anonymous flows (password reset).
// Paths are relative to the /api mount point — Express strips the prefix
// before handing the request to the middleware.
const CSRF_EXEMPT_PATHS = new Set([
  '/login',
  '/forgot-password',
  '/reset-password'
]);

// Verify CSRF token on state-changing requests under /api.
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (CSRF_EXEMPT_PATHS.has(req.path)) return next();
  const sent = req.get('x-csrf-token');
  if (!sent || !req.session.csrfToken || sent !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Virheellinen tai puuttuva CSRF-tunniste. Päivitä sivu ja yritä uudelleen.' });
  }
  next();
});

// Expose the current session's CSRF token to the client.
app.get('/api/csrf', (req, res) => {
  res.json({ csrfToken: req.session.csrfToken });
});

// Middleware: Authentication check
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Middleware: Block every authenticated request for users that still have the
// default password, except the endpoints they need to actually change it.
// Relative to the /api mount point (Express strips the prefix).
const ALLOWED_WHEN_MUST_CHANGE = new Set([
  '/me',
  '/logout',
  '/change-password',
  '/csrf'
]);

app.use('/api', async (req, res, next) => {
  if (!req.session.userId) return next();
  if (ALLOWED_WHEN_MUST_CHANGE.has(req.path)) return next();
  try {
    const db = getDb();
    const u = await db.prepare('SELECT must_change_password FROM users WHERE id = ?').get(req.session.userId);
    if (u && u.must_change_password) {
      return res.status(403).json({ error: 'Salasana on vaihdettava ennen kuin voit jatkaa.', must_change_password: true });
    }
  } catch(e) {
    // fall through; don't lock users out on DB hiccup
  }
  next();
});

// Middleware: Instructor role check (allows admin too)
const requireInstructor = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getDb();
  const user = await db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);

  if (!user || (user.role !== 'instructor' && user.role !== 'admin')) {
    return res.status(403).json({ error: 'Instructor access required' });
  }
  next();
};

// Middleware: Admin role check
const requireAdmin = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getDb();
  const user = await db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);

  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

const requireChiefInstructor = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const db = getDb();
  const user = await db.prepare('SELECT role, is_chief FROM users WHERE id = ?').get(req.session.userId);
  if (!user || user.role === 'student') {
    return res.status(403).json({ error: 'Instructor access required' });
  }
  if (user.role === 'admin') return next();
  if (!user.is_chief) {
    return res.status(403).json({ error: 'Chief instructor access required' });
  }
  next();
};

// Helper: Get user's club_id
const getUserClubId = async (req) => {
  const db = getDb();
  const user = await db.prepare('SELECT club_id, role FROM users WHERE id = ?').get(req.session.userId);
  return user ? user.club_id : null;
};

// Helper: Get user object without password
const getUserWithoutPassword = async (userId) => {
  const db = getDb();
  return await db.prepare('SELECT id, username, email, name, role, phone, must_change_password, is_chief, privacy_accepted_at FROM users WHERE id = ?').get(userId);
};

// Middleware: Sanitize request body strings to prevent XSS
app.use('/api', (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    const sanitize = (v) => typeof v === 'string' ? v.replace(/</g, '&lt;').replace(/>/g, '&gt;') : v;
    for (const k of Object.keys(req.body)) {
      if (k === 'password' || k === 'newPassword' || k === 'currentPassword') continue;
      req.body[k] = sanitize(req.body[k]);
    }
  }
  next();
});

// Middleware: Validate URL parameters
app.use('/api', (req, res, next) => {
  const segments = req.path.split('/');
  for (const seg of segments) {
    if (!seg || /^[a-zA-Z_-]+$/.test(seg)) continue;
    if (/[^0-9a-zA-Z._-]/.test(seg)) {
      return res.status(400).json({ error: 'Invalid parameter in URL' });
    }
  }
  next();
});

// ============================================================================
// AUTH ROUTES
// ============================================================================

// POST /api/login
app.post('/api/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const db = getDb();
  const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.userId = user.id;
  await logAction(user.id, 'LOGIN', 'user', user.id, {});

  const safeUser = await getUserWithoutPassword(user.id);
  res.json(safeUser);
});

// POST /api/logout
app.post('/api/logout', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  await logAction(userId, 'LOGOUT', 'user', userId, {});
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ success: true });
  });
});

// GET /api/me
app.get('/api/me', requireAuth, async (req, res) => {
  const user = await getUserWithoutPassword(req.session.userId);
  res.json(user);
});

// POST /api/change-password
app.post('/api/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.session.userId;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const db = getDb();
  const user = await db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);

  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 12);
  await db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hashedPassword, userId);

  await logAction(userId, 'CHANGE_PASSWORD', 'user', userId, {});
  res.json({ success: true });
});

// GET /api/me/data-export — GDPR article 20 data portability
app.get('/api/me/data-export', requireAuth, async (req, res) => {
  const db = getDb();
  const userId = req.session.userId;

  const user = await db.prepare(
    'SELECT id, username, email, name, phone, role, status, course_started, pp2_exam_passed, pp2_exam_date, privacy_accepted_at, created_at FROM users WHERE id = ?'
  ).get(userId);

  const flights = await db.prepare(
    `SELECT f.date, f.flight_count, f.flight_type, s.name as site_name, f.weather, f.exercises, f.notes, f.is_approval_flight, f.approved, f.created_at
     FROM flights f LEFT JOIN sites s ON f.site_id = s.id WHERE f.student_id = ? ORDER BY f.date`
  ).all(userId);

  const theory = await db.prepare(
    'SELECT topic_key, completed_at FROM theory_completions WHERE student_id = ? ORDER BY completed_at'
  ).all(userId);

  const equipment = await db.prepare(
    'SELECT * FROM student_equipment WHERE student_id = ?'
  ).get(userId);

  const attachments = await db.prepare(
    'SELECT original_name, mime_type, size, created_at FROM attachments WHERE student_id = ?'
  ).all(userId);

  const club = user.role !== 'admin' ? await db.prepare(
    'SELECT name FROM clubs WHERE id = (SELECT club_id FROM users WHERE id = ?)'
  ).get(userId) : null;

  const exportData = {
    exported_at: new Date().toISOString(),
    profile: {
      name: user.name,
      email: user.email,
      phone: user.phone,
      username: user.username,
      role: user.role,
      status: user.status,
      club: club ? club.name : null,
      course_started: user.course_started,
      pp2_exam_passed: !!user.pp2_exam_passed,
      pp2_exam_date: user.pp2_exam_date,
      privacy_accepted_at: user.privacy_accepted_at,
      account_created: user.created_at
    },
    flights: flights,
    theory_completions: theory,
    equipment: equipment || null,
    attachments: attachments.map(a => ({ name: a.original_name, type: a.mime_type, size: a.size, uploaded: a.created_at }))
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="pilottipolku-data-${user.username}-${new Date().toISOString().split('T')[0]}.json"`);
  res.json(exportData);
});

// POST /api/students/:id/anonymize — GDPR right to be forgotten (admin only)
app.post('/api/students/:id/anonymize', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const student = await db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(id, 'student');
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const anonymizedName = `Anonymisoitu käyttäjä #${id}`;
  const anonymizedEmail = `anonymized-${id}@removed.invalid`;
  const anonymizedUsername = `anon_${id}_${Date.now()}`;

  await db.prepare(`
    UPDATE users SET
      name = ?, email = ?, username = ?, phone = NULL,
      student_notes = NULL, password_hash = 'ANONYMIZED'
    WHERE id = ?
  `).run(anonymizedName, anonymizedEmail, anonymizedUsername, id);

  // Remove attachments files from disk
  const attachments = await db.prepare('SELECT stored_name FROM attachments WHERE student_id = ?').all(id);
  for (const att of attachments) {
    const filepath = path.join(UPLOAD_DIR, att.stored_name);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  }
  await db.prepare('DELETE FROM attachments WHERE student_id = ?').run(id);

  await logAction(req.session.userId, 'ANONYMIZE', 'student', id, { original_name: student.name });
  res.json({ success: true });
});

// POST /api/accept-privacy
app.post('/api/accept-privacy', requireAuth, async (req, res) => {
  const db = getDb();
  await db.prepare('UPDATE users SET privacy_accepted_at = ? WHERE id = ?').run(new Date().toISOString(), req.session.userId);
  await logAction(req.session.userId, 'ACCEPT_PRIVACY', 'user', req.session.userId, {});
  res.json({ success: true });
});

// POST /api/forgot-password
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  const db = getDb();
  const user = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);

  // Always return 200 to avoid revealing if email exists
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = bcrypt.hashSync(token, 10);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.prepare(
      'INSERT INTO password_resets (user_id, token_hash, expires_at, used) VALUES (?, ?, ?, 0)'
    ).run(user.id, hashedToken, expiresAt);

    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    sendPasswordReset(email, resetUrl);

    await logAction(user.id, 'FORGOT_PASSWORD', 'user', user.id, {});
  }

  res.json({ success: true });
});

// POST /api/reset-password
app.post('/api/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const db = getDb();
  const now = new Date();

  const reset = await db.prepare(
    'SELECT id, user_id, token_hash FROM password_resets WHERE used = 0 AND expires_at > ? ORDER BY created_at DESC LIMIT 1'
  ).get(now);

  if (!reset || !bcrypt.compareSync(token, reset.token_hash)) {
    return res.status(400).json({ error: 'Invalid or expired reset token' });
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 12);

  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashedPassword, reset.user_id);
  await db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);

  await logAction(reset.user_id, 'RESET_PASSWORD', 'user', reset.user_id, {});
  res.json({ success: true });
});

// POST /api/admin/reset-password — Instructor can reset student passwords
app.post('/api/admin/reset-password', requireAuth, requireInstructor, async (req, res) => {
  const { user_id, new_password } = req.body;

  if (!user_id || !new_password) {
    return res.status(400).json({ error: 'user_id and new_password required' });
  }

  if (new_password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const db = getDb();
  const targetUser = await db.prepare('SELECT id, role, club_id FROM users WHERE id = ?').get(user_id);

  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Instructor can only reset passwords for users in their club
  const currentUser = await db.prepare('SELECT role, club_id FROM users WHERE id = ?').get(req.session.userId);

  if (currentUser.role === 'instructor') {
    if (targetUser.club_id !== currentUser.club_id) {
      return res.status(403).json({ error: 'Can only reset passwords for your club members' });
    }
    // Instructor cannot reset other instructor passwords (only students)
    if (targetUser.role === 'instructor' && targetUser.id !== req.session.userId) {
      return res.status(403).json({ error: 'Instructors cannot reset other instructor passwords' });
    }
  }

  const hashedPassword = bcrypt.hashSync(new_password, 12);
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashedPassword, user_id);

  await logAction(req.session.userId, 'ADMIN_RESET_PASSWORD', 'user', user_id, {});
  res.json({ success: true });
});

// ============================================================================
// STUDENT ROUTES
// ============================================================================

// Helper: Calculate student stats
const getStudentStats = async (studentId) => {
  const db = getDb();

  // Check if club requires flight approval
  const student = await db.prepare('SELECT club_id FROM users WHERE id = ?').get(studentId);
  let approvalFilter = '';
  if (student && student.club_id) {
    const cs = await db.prepare('SELECT require_flight_approval FROM club_settings WHERE club_id = ?').get(student.club_id);
    if (cs && cs.require_flight_approval) {
      approvalFilter = ' AND approved = 1';
    }
  }

  const lowFlights = await db.prepare(
    `SELECT COALESCE(SUM(flight_count), 0) as count FROM flights WHERE student_id = ? AND flight_type = ?${approvalFilter}`
  ).get(studentId, 'low');

  const highFlights = await db.prepare(
    `SELECT COALESCE(SUM(flight_count), 0) as count FROM flights WHERE student_id = ? AND flight_type = ?${approvalFilter}`
  ).get(studentId, 'high');

  const highDays = await db.prepare(
    `SELECT COUNT(DISTINCT date) as count FROM flights WHERE student_id = ? AND flight_type = ?${approvalFilter}`
  ).get(studentId, 'high');

  const totalFlights = await db.prepare(
    `SELECT COALESCE(SUM(flight_count), 0) as count FROM flights WHERE student_id = ?${approvalFilter}`
  ).get(studentId);

  const lastFlight = await db.prepare(
    `SELECT date FROM flights WHERE student_id = ?${approvalFilter} ORDER BY date DESC LIMIT 1`
  ).get(studentId);

  const hasApproval = await db.prepare(
    `SELECT COUNT(*) as count FROM flights WHERE student_id = ? AND is_approval_flight = 1${approvalFilter}`
  ).get(studentId);

  const approvalFlight = await db.prepare(
    `SELECT date FROM flights WHERE student_id = ? AND is_approval_flight = 1${approvalFilter} ORDER BY date DESC LIMIT 1`
  ).get(studentId);

  // PP2 exam status
  const pp2Exam = await db.prepare(
    'SELECT pp2_exam_passed, pp2_exam_date FROM users WHERE id = ?'
  ).get(studentId);

  // Theory counts
  const theoryPp1 = await db.prepare(
    "SELECT COUNT(*) as count FROM theory_completions WHERE student_id = ? AND topic_key LIKE 'pp1_%'"
  ).get(studentId);

  const theoryPp2 = await db.prepare(
    "SELECT COUNT(*) as count FROM theory_completions WHERE student_id = ? AND topic_key LIKE 'pp2_%'"
  ).get(studentId);

  return {
    low_flights: parseInt(lowFlights.count),
    high_flights: parseInt(highFlights.count),
    high_days: parseInt(highDays.count),
    total_flights: parseInt(totalFlights.count),
    last_flight_date: lastFlight ? lastFlight.date : null,
    has_approval: parseInt(hasApproval.count) > 0,
    approval_flight_date: approvalFlight ? approvalFlight.date : null,
    pp2_exam_passed: pp2Exam ? pp2Exam.pp2_exam_passed : 0,
    pp2_exam_date: pp2Exam ? pp2Exam.pp2_exam_date : null,
    theory_pp1: parseInt(theoryPp1.count),
    theory_pp2: parseInt(theoryPp2.count)
  };
};

// GET /api/students
app.get('/api/students', requireAuth, requireInstructor, async (req, res) => {
  const { status = 'all', club_id } = req.query;
  const db = getDb();
  const user = await db.prepare('SELECT role, club_id FROM users WHERE id = ?').get(req.session.userId);

  let query = 'SELECT id, username, name, email, phone, status, pp2_exam_passed, pp2_exam_date, course_started, student_notes, created_at, club_id FROM users WHERE role = ?';
  const params = ['student'];

  if (status !== 'all') {
    query += ' AND status = ?';
    params.push(status);
  }

  // Instructor sees only their club; admin can filter by club_id param
  if (user.role === 'instructor') {
    query += ' AND club_id = ?';
    params.push(user.club_id);
  } else if (user.role === 'admin' && club_id) {
    query += ' AND club_id = ?';
    params.push(club_id);
  }

  query += ' ORDER BY name ASC';

  const students = await db.prepare(query).all(...params);

  const result = [];
  for (const student of students) {
    const stats = await getStudentStats(student.id);
    result.push({ ...student, ...stats });
  }

  res.json({ students: result });
});

// POST /api/students
app.post('/api/students', requireAuth, requireInstructor, async (req, res) => {
  const { name, email, phone, username, password, course_started, status } = req.body;

  if (!name || !email || !username || !password) {
    return res.status(400).json({ error: 'Name, email, username, and password required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const db = getDb();

  const existingUser = await db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existingUser) {
    return res.status(400).json({ error: 'Username or email already exists' });
  }

  const hashedPassword = bcrypt.hashSync(password, 12);
  const instructorClubId = await getUserClubId(req);

  const userResult = await db.prepare(
    'INSERT INTO users (username, email, name, password_hash, phone, role, status, pp2_exam_passed, course_started, student_notes, club_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(username, email, name, hashedPassword, phone || null, 'student', status || 'ongoing', 0, course_started || new Date().toISOString().split('T')[0], '', instructorClubId);

  await logAction(req.session.userId, 'CREATE', 'student', userResult.lastInsertRowid, { name, email });

  const student = await db.prepare('SELECT * FROM users WHERE id = ?').get(userResult.lastInsertRowid);
  const stats = await getStudentStats(student.id);

  res.status(201).json({ ...student, ...stats });
});

// GET /api/students/:id
app.get('/api/students/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  // Access control: students can only view their own profile
  const requestingUser = await db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);
  if (requestingUser.role === 'student' && req.session.userId !== parseInt(id)) {
    return res.status(403).json({ error: 'Not authorized to view this student' });
  }

  // Never return password_hash — use explicit column list
  const student = await db.prepare(
    'SELECT id, username, email, name, role, phone, club_id, status, pp2_exam_passed, pp2_exam_date, course_started, student_notes, created_at FROM users WHERE id = ? AND role = ?'
  ).get(id, 'student');

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const stats = await getStudentStats(student.id);
  res.json({ ...student, ...stats });
});

// PUT /api/students/:id
app.put('/api/students/:id', requireAuth, requireInstructor, async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, status, pp2_exam_passed, pp2_exam_date, course_started, student_notes } = req.body;

  const db = getDb();
  const student = await db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(id, 'student');

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  // Validate: cannot set status to 'completed' without pp2_exam_passed
  if (status === 'completed') {
    const examPassed = pp2_exam_passed !== undefined ? pp2_exam_passed : student.pp2_exam_passed;
    if (!examPassed) {
      return res.status(400).json({ error: 'PP2-koe täytyy olla suoritettu ennen valmistumista' });
    }
  }

  const updates = [];
  const values = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (email !== undefined) { updates.push('email = ?'); values.push(email); }
  if (phone !== undefined) { updates.push('phone = ?'); values.push(phone); }
  if (status !== undefined) { updates.push('status = ?'); values.push(status); }
  if (pp2_exam_passed !== undefined) { updates.push('pp2_exam_passed = ?'); values.push(pp2_exam_passed ? 1 : 0); }
  if (pp2_exam_date !== undefined) { updates.push('pp2_exam_date = ?'); values.push(pp2_exam_date || null); }
  if (course_started !== undefined) { updates.push('course_started = ?'); values.push(course_started); }
  if (student_notes !== undefined) { updates.push('student_notes = ?'); values.push(student_notes); }

  if (updates.length > 0) {
    values.push(id);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    await db.prepare(query).run(...values);
  }

  await logAction(req.session.userId, 'UPDATE', 'student', id, { fields: Object.keys(req.body) });

  const updated = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const stats = await getStudentStats(updated.id);

  res.json({ ...updated, ...stats });
});

// DELETE /api/students/:id
app.delete('/api/students/:id', requireAuth, requireInstructor, async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const student = await db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(id, 'student');

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  await db.prepare('DELETE FROM users WHERE id = ?').run(id);

  await logAction(req.session.userId, 'DELETE', 'student', id, {});

  res.json({ success: true });
});

// ============================================================================
// FLIGHT ROUTES
// ============================================================================

// GET /api/students/:id/flights
app.get('/api/students/:id/flights', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { type = 'all', sort = 'desc' } = req.query;

  const db = getDb();

  let query = `
    SELECT f.*, s.name as site_name
    FROM flights f
    LEFT JOIN sites s ON f.site_id = s.id
    WHERE f.student_id = ?
  `;
  const params = [id];

  if (type !== 'all') {
    query += ' AND f.flight_type = ?';
    params.push(type);
  }

  query += ` ORDER BY f.date ${sort === 'asc' ? 'ASC' : 'DESC'}`;

  const flights = await db.prepare(query).all(...params);

  // Include student stats and club approval setting
  const stats = await getStudentStats(id);
  const studentRow = await db.prepare('SELECT club_id FROM users WHERE id = ?').get(id);
  let requireFlightApproval = false;
  if (studentRow && studentRow.club_id) {
    const cs = await db.prepare('SELECT require_flight_approval FROM club_settings WHERE club_id = ?').get(studentRow.club_id);
    if (cs) requireFlightApproval = !!cs.require_flight_approval;
  }
  res.json({ student: stats, flights, require_flight_approval: requireFlightApproval });
});

// POST /api/students/:id/flights
app.post('/api/students/:id/flights', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { date, flight_count, flight_type, site_id, weather, exercises, notes, is_approval_flight } = req.body;

  const db = getDb();
  const student = await db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(id, 'student');

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  // Check authorization: admin, instructor or student adding their own flight
  const requestingUser = await db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);
  const isAdmin = requestingUser?.role === 'admin';
  const isInstructor = requestingUser?.role === 'instructor';
  const isOwnFlight = parseInt(id) === req.session.userId;

  if (!isAdmin && !isInstructor && !isOwnFlight) {
    return res.status(403).json({ error: 'You can only add flights for your own account' });
  }

  if (!date || flight_count === undefined || !flight_type) {
    return res.status(400).json({ error: 'Date, flight_count, and flight_type required' });
  }

  // Auto-approve if added by instructor/admin; leave pending if student adds own flight and approval required
  let approvedVal = null, approvedByVal = null, approvedAtVal = null;
  if (isAdmin || isInstructor) {
    approvedVal = 1;
    approvedByVal = req.session.userId;
    approvedAtVal = new Date().toISOString();
  }

  const result = await db.prepare(`
    INSERT INTO flights (student_id, date, flight_count, flight_type, site_id, weather, exercises, notes, is_approval_flight, added_by, approved, approved_by, approved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, date, flight_count, flight_type, site_id || null, weather || null, exercises || null, notes || null, is_approval_flight ? 1 : 0, req.session.userId, approvedVal, approvedByVal, approvedAtVal);

  await logAction(req.session.userId, 'CREATE', 'flight', result.lastInsertRowid, { student_id: id, flight_type });

  const flight = await db.prepare(`
    SELECT f.*, s.name as site_name
    FROM flights f
    LEFT JOIN sites s ON f.site_id = s.id
    WHERE f.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(flight);
});

// PUT /api/flights/:id
app.put('/api/flights/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const flight = await db.prepare('SELECT * FROM flights WHERE id = ?').get(id);

  if (!flight) {
    return res.status(404).json({ error: 'Flight not found' });
  }

  // Check authorization: instructor or student editing their own flight
  const student = await db.prepare('SELECT id FROM users WHERE id = ?').get(flight.student_id);
  const requestingUser = await db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);
  const isInstructor = requestingUser?.role === 'instructor';
  const isOwnFlight = student?.id === req.session.userId;

  if (!isInstructor && !isOwnFlight) {
    return res.status(403).json({ error: 'Not authorized to edit this flight' });
  }

  const { date, flight_count, flight_type, site_id, weather, exercises, notes, is_approval_flight } = req.body;

  const updates = [];
  const values = [];

  if (date !== undefined) { updates.push('date = ?'); values.push(date); }
  if (flight_count !== undefined) { updates.push('flight_count = ?'); values.push(flight_count); }
  if (flight_type !== undefined) { updates.push('flight_type = ?'); values.push(flight_type); }
  if (site_id !== undefined) { updates.push('site_id = ?'); values.push(site_id); }
  if (weather !== undefined) { updates.push('weather = ?'); values.push(weather); }
  if (exercises !== undefined) { updates.push('exercises = ?'); values.push(exercises); }
  if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }
  if (is_approval_flight !== undefined) { updates.push('is_approval_flight = ?'); values.push(is_approval_flight ? 1 : 0); }

  if (updates.length > 0) {
    values.push(id);
    const query = `UPDATE flights SET ${updates.join(', ')} WHERE id = ?`;
    await db.prepare(query).run(...values);
  }

  await logAction(req.session.userId, 'UPDATE', 'flight', id, { fields: Object.keys(req.body) });

  const updated = await db.prepare(`
    SELECT f.*, s.name as site_name
    FROM flights f
    LEFT JOIN sites s ON f.site_id = s.id
    WHERE f.id = ?
  `).get(id);

  res.json(updated);
});

// DELETE /api/flights/:id
app.delete('/api/flights/:id', requireAuth, requireInstructor, async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const flight = await db.prepare('SELECT * FROM flights WHERE id = ?').get(id);

  if (!flight) {
    return res.status(404).json({ error: 'Flight not found' });
  }

  await db.prepare('DELETE FROM flights WHERE id = ?').run(id);

  await logAction(req.session.userId, 'DELETE', 'flight', id, {});

  res.json({ success: true });
});

// POST /api/flights/:id/approve
app.post('/api/flights/:id/approve', requireAuth, requireInstructor, async (req, res) => {
  const { id } = req.params;
  const db = getDb();
  const flight = await db.prepare('SELECT * FROM flights WHERE id = ?').get(id);
  if (!flight) return res.status(404).json({ error: 'Flight not found' });

  await db.prepare('UPDATE flights SET approved = 1, approved_by = ?, approved_at = ? WHERE id = ?')
    .run(req.session.userId, new Date().toISOString(), id);

  await logAction(req.session.userId, 'APPROVE', 'flight', id, {});
  res.json({ success: true });
});

// POST /api/flights/:id/reject
app.post('/api/flights/:id/reject', requireAuth, requireInstructor, async (req, res) => {
  const { id } = req.params;
  const db = getDb();
  const flight = await db.prepare('SELECT * FROM flights WHERE id = ?').get(id);
  if (!flight) return res.status(404).json({ error: 'Flight not found' });

  await db.prepare('UPDATE flights SET approved = 0, approved_by = ?, approved_at = ? WHERE id = ?')
    .run(req.session.userId, new Date().toISOString(), id);

  await logAction(req.session.userId, 'REJECT', 'flight', id, {});
  res.json({ success: true });
});

// ============================================================================
// THEORY ROUTES
// ============================================================================

// GET /api/students/:id/theory
app.get('/api/students/:id/theory', requireAuth, async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const completions = await db.prepare(
    'SELECT topic_key FROM theory_completions WHERE student_id = ?'
  ).all(id);

  res.json({ completions: completions.map(c => c.topic_key) });
});

// POST /api/students/:id/theory
app.post('/api/students/:id/theory', requireAuth, requireInstructor, async (req, res) => {
  const { id } = req.params;
  const { topic_key } = req.body;

  if (!topic_key) {
    return res.status(400).json({ error: 'topic_key required' });
  }

  const db = getDb();

  await db.prepare(
    'INSERT OR IGNORE INTO theory_completions (student_id, topic_key, completed_by) VALUES (?, ?, ?)'
  ).run(id, topic_key, req.session.userId);

  await logAction(req.session.userId, 'CREATE', 'theory_completion', id, { topic_key });

  res.json({ success: true });
});

// DELETE /api/students/:id/theory/:topic_key
app.delete('/api/students/:id/theory/:topic_key', requireAuth, requireInstructor, async (req, res) => {
  const { id, topic_key } = req.params;
  const db = getDb();

  await db.prepare(
    'DELETE FROM theory_completions WHERE student_id = ? AND topic_key = ?'
  ).run(id, topic_key);

  await logAction(req.session.userId, 'DELETE', 'theory_completion', id, { topic_key });

  res.json({ success: true });
});

// ============================================================================
// THEORY MANAGEMENT ROUTES (dynamic sections & topics)
// ============================================================================

// GET /api/theory/structure — returns full structure for frontend
app.get('/api/theory/structure', requireAuth, async (req, res) => {
  const db = getDb();

  const sections = await db.prepare(
    'SELECT * FROM theory_sections ORDER BY level, sort_order'
  ).all();

  const topics = await db.prepare(
    'SELECT * FROM theory_topics_def ORDER BY section_id, sort_order'
  ).all();

  // Group topics by section
  const topicsBySection = {};
  topics.forEach(t => {
    if (!topicsBySection[t.section_id]) topicsBySection[t.section_id] = [];
    topicsBySection[t.section_id].push(t);
  });

  // Build structure grouped by level
  const structure = { pp1: [], pp2: [] };
  sections.forEach(s => {
    const sectionTopics = topicsBySection[s.id] || [];
    const totalDuration = sectionTopics.reduce((sum, t) => sum + (t.duration_minutes || 0), 0);
    const entry = {
      id: s.id,
      key: s.key,
      title: s.title,
      sort_order: s.sort_order,
      total_duration: totalDuration,
      topics: sectionTopics.map(t => ({
        id: t.id,
        key: t.key,
        title: t.title,
        duration_minutes: t.duration_minutes,
        comment: t.comment,
        sort_order: t.sort_order
      }))
    };
    if (structure[s.level]) {
      structure[s.level].push(entry);
    }
  });

  res.json(structure);
});

// GET /api/theory/sections — list all sections (admin only)
app.get('/api/theory/sections', requireAuth, requireAdmin, async (req, res) => {
  const db = getDb();
  const sections = await db.prepare(
    'SELECT * FROM theory_sections ORDER BY level, sort_order'
  ).all();
  res.json({ sections });
});

// POST /api/theory/sections — create a new section (admin only)
app.post('/api/theory/sections', requireAuth, requireAdmin, async (req, res) => {
  const { level, key, title } = req.body;
  if (!level || !key || !title) {
    return res.status(400).json({ error: 'level, key, and title are required' });
  }
  if (!['pp1', 'pp2'].includes(level)) {
    return res.status(400).json({ error: 'level must be pp1 or pp2' });
  }

  const db = getDb();

  // Get next sort_order for this level
  const maxOrder = await db.prepare(
    'SELECT MAX(sort_order) as max_order FROM theory_sections WHERE level = ?'
  ).get(level);
  const sortOrder = (maxOrder && maxOrder.max_order != null) ? maxOrder.max_order + 1 : 0;

  try {
    const result = await db.prepare(
      'INSERT INTO theory_sections (level, key, title, sort_order) VALUES (?, ?, ?, ?)'
    ).run(level, key, title, sortOrder);

    await logAction(req.session.userId, 'CREATE', 'theory_section', result.lastInsertRowid, { level, key, title });
    res.json({ id: result.lastInsertRowid, level, key, title, sort_order: sortOrder });
  } catch (e) {
    if (e.message && e.message.includes('unique')) {
      return res.status(400).json({ error: 'Section key already exists' });
    }
    throw e;
  }
});

// PUT /api/theory/sections/:id — update a section (admin only)
app.put('/api/theory/sections/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { title, sort_order } = req.body;
  const db = getDb();

  const section = await db.prepare('SELECT * FROM theory_sections WHERE id = ?').get(id);
  if (!section) return res.status(404).json({ error: 'Section not found' });

  const newTitle = title !== undefined ? title : section.title;
  const newOrder = sort_order !== undefined ? sort_order : section.sort_order;

  await db.prepare(
    'UPDATE theory_sections SET title = ?, sort_order = ? WHERE id = ?'
  ).run(newTitle, newOrder, id);

  await logAction(req.session.userId, 'UPDATE', 'theory_section', id, { title: newTitle });
  res.json({ success: true });
});

// DELETE /api/theory/sections/:id — delete a section, admin only (only if no topics)
app.delete('/api/theory/sections/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const topicCount = await db.prepare(
    'SELECT COUNT(*) as count FROM theory_topics_def WHERE section_id = ?'
  ).get(id);

  if (parseInt(topicCount.count) > 0) {
    return res.status(400).json({ error: `Aihealueella on ${topicCount.count} aihetta. Poista ensin aiheet.` });
  }

  await db.prepare('DELETE FROM theory_sections WHERE id = ?').run(id);
  await logAction(req.session.userId, 'DELETE', 'theory_section', id, {});
  res.json({ success: true });
});

// POST /api/theory/sections/:id/topics — create a topic in a section (admin only)
app.post('/api/theory/sections/:sectionId/topics', requireAuth, requireAdmin, async (req, res) => {
  const { sectionId } = req.params;
  const { key, title, duration_minutes, comment } = req.body;

  if (!key || !title) {
    return res.status(400).json({ error: 'key and title are required' });
  }

  const db = getDb();

  const section = await db.prepare('SELECT * FROM theory_sections WHERE id = ?').get(sectionId);
  if (!section) return res.status(404).json({ error: 'Section not found' });

  const maxOrder = await db.prepare(
    'SELECT MAX(sort_order) as max_order FROM theory_topics_def WHERE section_id = ?'
  ).get(sectionId);
  const sortOrder = (maxOrder && maxOrder.max_order != null) ? maxOrder.max_order + 1 : 0;

  try {
    const result = await db.prepare(
      'INSERT INTO theory_topics_def (section_id, key, title, duration_minutes, comment, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(sectionId, key, title, duration_minutes || 45, comment || null, sortOrder);

    await logAction(req.session.userId, 'CREATE', 'theory_topic', result.lastInsertRowid, { key, title, sectionId });
    res.json({ id: result.lastInsertRowid, key, title, duration_minutes: duration_minutes || 45, comment: comment || null, sort_order: sortOrder });
  } catch (e) {
    if (e.message && e.message.includes('unique')) {
      return res.status(400).json({ error: 'Topic key already exists' });
    }
    throw e;
  }
});

// PUT /api/theory/topics/:id — update a topic (admin only)
app.put('/api/theory/topics/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { title, duration_minutes, comment, sort_order } = req.body;
  const db = getDb();

  const topic = await db.prepare('SELECT * FROM theory_topics_def WHERE id = ?').get(id);
  if (!topic) return res.status(404).json({ error: 'Topic not found' });

  const newTitle = title !== undefined ? title : topic.title;
  const newDuration = duration_minutes !== undefined ? duration_minutes : topic.duration_minutes;
  const newComment = comment !== undefined ? comment : topic.comment;
  const newOrder = sort_order !== undefined ? sort_order : topic.sort_order;

  await db.prepare(
    'UPDATE theory_topics_def SET title = ?, duration_minutes = ?, comment = ?, sort_order = ? WHERE id = ?'
  ).run(newTitle, newDuration, newComment, newOrder, id);

  await logAction(req.session.userId, 'UPDATE', 'theory_topic', id, { title: newTitle, duration_minutes: newDuration });
  res.json({ success: true });
});

// DELETE /api/theory/topics/:id — delete a topic, admin only (only if no completions)
app.delete('/api/theory/topics/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const topic = await db.prepare('SELECT * FROM theory_topics_def WHERE id = ?').get(id);
  if (!topic) return res.status(404).json({ error: 'Topic not found' });

  const completions = await db.prepare(
    'SELECT COUNT(*) as count FROM theory_completions WHERE topic_key = ?'
  ).get(topic.key);

  if (parseInt(completions.count) > 0) {
    return res.status(400).json({ error: `Aiheella on ${completions.count} suoritusta. Poista ensin suoritukset.` });
  }

  await db.prepare('DELETE FROM theory_topics_def WHERE id = ?').run(id);
  await logAction(req.session.userId, 'DELETE', 'theory_topic', id, { key: topic.key });
  res.json({ success: true });
});

// ============================================================================
// LESSON ROUTES
// ============================================================================

// GET /api/lessons
app.get('/api/lessons', requireAuth, requireInstructor, async (req, res) => {
  const db = getDb();
  const user = await db.prepare('SELECT role, club_id FROM users WHERE id = ?').get(req.session.userId);

  let query = `
    SELECT
      l.*,
      COUNT(DISTINCT ls.student_id) as student_count,
      COUNT(DISTINCT lt.topic_key) as topic_count
    FROM lessons l
    LEFT JOIN lesson_students ls ON l.id = ls.lesson_id
    LEFT JOIN lesson_topics lt ON l.id = lt.lesson_id
    LEFT JOIN users u ON l.instructor_id = u.id
  `;
  const params = [];

  // Filter by club for instructors
  if (user.role === 'instructor') {
    query += ' WHERE u.club_id = ?';
    params.push(user.club_id);
  }

  query += ' GROUP BY l.id ORDER BY l.date DESC';

  const lessons = await db.prepare(query).all(...params);

  // Add instructor name
  const lessonsWithNames = [];
  for (const l of lessons) {
    const instructor = await db.prepare('SELECT name FROM users WHERE id = ?').get(l.instructor_id);
    lessonsWithNames.push({ ...l, instructor_name: instructor ? instructor.name : '' });
  }

  res.json({ lessons: lessonsWithNames });
});

// POST /api/lessons
app.post('/api/lessons', requireAuth, requireInstructor, async (req, res) => {
  const { date, topic_keys = [], student_ids = [], notes } = req.body;

  if (!date) {
    return res.status(400).json({ error: 'Date required' });
  }

  const db = getDb();
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const lessonRes = await client.query(
      'INSERT INTO lessons (date, instructor_id, notes) VALUES ($1, $2, $3) RETURNING id',
      [date, req.session.userId, notes || null]
    );
    const lessonId = lessonRes.rows[0].id;

    for (const studentId of student_ids) {
      await client.query('INSERT INTO lesson_students (lesson_id, student_id) VALUES ($1, $2)', [lessonId, studentId]);
    }

    for (const topicKey of topic_keys) {
      await client.query('INSERT INTO lesson_topics (lesson_id, topic_key) VALUES ($1, $2)', [lessonId, topicKey]);

      // Mark theory completions for all students in this lesson
      for (const studentId of student_ids) {
        await client.query(
          'INSERT INTO theory_completions (student_id, topic_key, completed_by, lesson_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
          [studentId, topicKey, req.session.userId, lessonId]
        );
      }
    }

    await client.query('COMMIT');

    await logAction(req.session.userId, 'CREATE', 'lesson', lessonId, {
      student_count: student_ids.length,
      topic_count: topic_keys.length
    });

    const lesson = await db.prepare(`
      SELECT
        l.*,
        COUNT(DISTINCT ls.student_id) as student_count,
        COUNT(DISTINCT lt.topic_key) as topic_count
      FROM lessons l
      LEFT JOIN lesson_students ls ON l.id = ls.lesson_id
      LEFT JOIN lesson_topics lt ON l.id = lt.lesson_id
      WHERE l.id = ?
      GROUP BY l.id
    `).get(lessonId);

    res.status(201).json(lesson);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// GET /api/lessons/:id
app.get('/api/lessons/:id', requireAuth, requireInstructor, async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const lesson = await db.prepare('SELECT * FROM lessons WHERE id = ?').get(id);

  if (!lesson) {
    return res.status(404).json({ error: 'Lesson not found' });
  }

  const studentRows = await db.prepare('SELECT student_id FROM lesson_students WHERE lesson_id = ?').all(id);
  const topics = await db.prepare('SELECT topic_key FROM lesson_topics WHERE lesson_id = ?').all(id);

  // Get student names
  const studentNames = [];
  for (const s of studentRows) {
    const u = await db.prepare('SELECT name FROM users WHERE id = ?').get(s.student_id);
    studentNames.push(u ? u.name : 'Tuntematon');
  }

  // Get instructor name
  const instructor = await db.prepare('SELECT name FROM users WHERE id = ?').get(lesson.instructor_id);

  res.json({
    lesson: {
      ...lesson,
      instructor_name: instructor ? instructor.name : '',
      student_count: studentRows.length,
      topic_count: topics.length
    },
    student_ids: studentRows.map(s => s.student_id),
    student_names: studentNames,
    topic_keys: topics.map(t => t.topic_key)
  });
});

// PUT /api/lessons/:id
app.put('/api/lessons/:id', requireAuth, requireInstructor, async (req, res) => {
  const { id } = req.params;
  const { date, notes, student_ids = [], topic_keys = [] } = req.body;

  const db = getDb();
  const lesson = await db.prepare('SELECT * FROM lessons WHERE id = ?').get(id);

  if (!lesson) {
    return res.status(404).json({ error: 'Lesson not found' });
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    if (date !== undefined || notes !== undefined) {
      const updates = [];
      const values = [];
      let paramIdx = 1;
      if (date !== undefined) { updates.push(`date = $${paramIdx++}`); values.push(date); }
      if (notes !== undefined) { updates.push(`notes = $${paramIdx++}`); values.push(notes); }
      values.push(id);
      const query = `UPDATE lessons SET ${updates.join(', ')} WHERE id = $${paramIdx}`;
      await client.query(query, values);
    }

    // Update lesson_students
    await client.query('DELETE FROM lesson_students WHERE lesson_id = $1', [id]);
    for (const studentId of student_ids) {
      await client.query('INSERT INTO lesson_students (lesson_id, student_id) VALUES ($1, $2)', [id, studentId]);
    }

    // Update lesson_topics and theory_completions
    await client.query('DELETE FROM lesson_topics WHERE lesson_id = $1', [id]);
    await client.query('UPDATE theory_completions SET lesson_id = NULL WHERE lesson_id = $1', [id]);

    for (const topicKey of topic_keys) {
      await client.query('INSERT INTO lesson_topics (lesson_id, topic_key) VALUES ($1, $2)', [id, topicKey]);

      for (const studentId of student_ids) {
        await client.query(
          'INSERT INTO theory_completions (student_id, topic_key, completed_by, lesson_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
          [studentId, topicKey, req.session.userId, id]
        );
      }
    }

    await client.query('COMMIT');

    await logAction(req.session.userId, 'UPDATE', 'lesson', id, {
      fields: Object.keys(req.body)
    });

    const updated = await db.prepare(`
      SELECT
        l.*,
        COUNT(DISTINCT ls.student_id) as student_count,
        COUNT(DISTINCT lt.topic_key) as topic_count
      FROM lessons l
      LEFT JOIN lesson_students ls ON l.id = ls.lesson_id
      LEFT JOIN lesson_topics lt ON l.id = lt.lesson_id
      WHERE l.id = ?
      GROUP BY l.id
    `).get(id);

    res.json(updated);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// DELETE /api/lessons/:id
app.delete('/api/lessons/:id', requireAuth, requireInstructor, async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const lesson = await db.prepare('SELECT * FROM lessons WHERE id = ?').get(id);

  if (!lesson) {
    return res.status(404).json({ error: 'Lesson not found' });
  }

  await db.prepare('DELETE FROM lessons WHERE id = ?').run(id);

  await logAction(req.session.userId, 'DELETE', 'lesson', id, {});

  res.json({ success: true });
});

// ============================================================================
// SITE ROUTES
// ============================================================================

// GET /api/sites
app.get('/api/sites', requireAuth, async (req, res) => {
  const db = getDb();
  const user = await db.prepare('SELECT role, club_id FROM users WHERE id = ?').get(req.session.userId);

  let query = 'SELECT * FROM sites';
  const params = [];

  // Instructor and student see only their club's sites; admin can filter by club_id param
  if (user.role === 'instructor' || user.role === 'student') {
    query += ' WHERE club_id = ?';
    params.push(user.club_id);
  } else if (user.role === 'admin' && req.query.club_id) {
    query += ' WHERE club_id = ?';
    params.push(req.query.club_id);
  }

  query += ' ORDER BY name ASC';

  const sites = await db.prepare(query).all(...params);
  res.json({ sites });
});

// POST /api/sites
app.post('/api/sites', requireAuth, requireInstructor, async (req, res) => {
  const { name, description, club_id } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name required' });
  }

  const db = getDb();
  const requestingUser = await db.prepare('SELECT role, club_id FROM users WHERE id = ?').get(req.session.userId);
  let siteClubId;

  if (requestingUser.role === 'admin') {
    // Admin must provide club_id, or use the first club as default
    const firstClub = await db.prepare('SELECT id FROM clubs LIMIT 1').get();
    siteClubId = club_id || (firstClub ? firstClub.id : null);
    if (!siteClubId) {
      return res.status(400).json({ error: 'club_id required (no clubs exist)' });
    }
  } else {
    siteClubId = requestingUser.club_id;
  }

  const result = await db.prepare('INSERT INTO sites (name, description, club_id) VALUES (?, ?, ?)').run(name, description || null, siteClubId);

  await logAction(req.session.userId, 'CREATE', 'site', result.lastInsertRowid, { name });

  const site = await db.prepare('SELECT * FROM sites WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(site);
});

// PUT /api/sites/:id
app.put('/api/sites/:id', requireAuth, requireInstructor, async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  const db = getDb();
  const site = await db.prepare('SELECT * FROM sites WHERE id = ?').get(id);

  if (!site) {
    return res.status(404).json({ error: 'Site not found' });
  }

  const updates = [];
  const values = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (description !== undefined) { updates.push('description = ?'); values.push(description); }

  if (updates.length > 0) {
    values.push(id);
    const query = `UPDATE sites SET ${updates.join(', ')} WHERE id = ?`;
    await db.prepare(query).run(...values);
  }

  await logAction(req.session.userId, 'UPDATE', 'site', id, { fields: Object.keys(req.body) });

  const updated = await db.prepare('SELECT * FROM sites WHERE id = ?').get(id);
  res.json(updated);
});

// DELETE /api/sites/:id
app.delete('/api/sites/:id', requireAuth, requireInstructor, async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const site = await db.prepare('SELECT * FROM sites WHERE id = ?').get(id);

  if (!site) {
    return res.status(404).json({ error: 'Site not found' });
  }

  const flightCount = await db.prepare('SELECT COUNT(*) as count FROM flights WHERE site_id = ?').get(id);

  if (parseInt(flightCount.count) > 0) {
    return res.status(400).json({ error: 'Cannot delete site with flights' });
  }

  await db.prepare('DELETE FROM sites WHERE id = ?').run(id);

  await logAction(req.session.userId, 'DELETE', 'site', id, {});

  res.json({ success: true });
});

// ============================================================================
// ATTACHMENT ROUTES
// ============================================================================

// GET /api/students/:id/attachments
app.get('/api/students/:id/attachments', requireAuth, async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const attachments = await db.prepare(
    'SELECT id, student_id, filename, stored_name, size_bytes, mimetype, created_at FROM attachments WHERE student_id = ?'
  ).all(id);

  res.json({ attachments });
});

// POST /api/students/:id/attachments
app.post('/api/students/:id/attachments', requireAuth, requireInstructor, upload.single('file'), async (req, res) => {
  const { id } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: 'File required' });
  }

  const db = getDb();
  const student = await db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(id, 'student');

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const result = await db.prepare(
    'INSERT INTO attachments (student_id, filename, stored_name, mimetype, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.session.userId);

  await logAction(req.session.userId, 'CREATE', 'attachment', result.lastInsertRowid, {
    student_id: id,
    filename: req.file.originalname
  });

  const attachment = await db.prepare(
    'SELECT id, student_id, filename, stored_name, created_at FROM attachments WHERE id = ?'
  ).get(result.lastInsertRowid);

  res.status(201).json(attachment);
});

// GET /api/attachments/:id/download
app.get('/api/attachments/:id/download', requireAuth, async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const attachment = await db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);

  if (!attachment) {
    return res.status(404).json({ error: 'Attachment not found' });
  }

  const filepath = path.join(UPLOAD_DIR, attachment.stored_name);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  await logAction(req.session.userId, 'READ', 'attachment', id, { filename: attachment.filename });

  res.download(filepath, attachment.filename);
});

// DELETE /api/attachments/:id
app.delete('/api/attachments/:id', requireAuth, requireInstructor, async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const attachment = await db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);

  if (!attachment) {
    return res.status(404).json({ error: 'Attachment not found' });
  }

  const filepath = path.join(UPLOAD_DIR, attachment.stored_name);

  try {
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  } catch (error) {
    console.error('Error deleting file:', error);
  }

  await db.prepare('DELETE FROM attachments WHERE id = ?').run(id);

  await logAction(req.session.userId, 'DELETE', 'attachment', id, {});

  res.json({ success: true });
});

// ============================================================================
// EQUIPMENT ROUTES
// ============================================================================

// GET /api/students/:id/equipment
app.get('/api/students/:id/equipment', requireAuth, async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const student = await db.prepare('SELECT id FROM users WHERE id = ? AND role = ?').get(id, 'student');
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const equipment = await db.prepare('SELECT * FROM equipment WHERE student_id = ?').get(id);

  if (equipment) {
    res.json(equipment);
  } else {
    // Return empty defaults
    res.json({
      student_id: parseInt(id),
      wing_manufacturer: '',
      wing_model: '',
      wing_size: '',
      wing_year: null,
      wing_club_owned: 0,
      harness_manufacturer: '',
      harness_model: '',
      harness_club_owned: 0,
      reserve_manufacturer: '',
      reserve_model: '',
      reserve_size: '',
      reserve_pack_date: null,
      reserve_club_owned: 0
    });
  }
});

// PUT /api/students/:id/equipment
app.put('/api/students/:id/equipment', requireAuth, async (req, res) => {
  const { id } = req.params;
  const {
    wing_manufacturer, wing_model, wing_size, wing_year, wing_club_owned,
    harness_manufacturer, harness_model, harness_club_owned,
    reserve_manufacturer, reserve_model, reserve_size, reserve_pack_date, reserve_club_owned
  } = req.body;

  const db = getDb();

  const student = await db.prepare('SELECT id FROM users WHERE id = ? AND role = ?').get(id, 'student');
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  // Check authorization: student can edit own equipment, instructor/admin can edit any
  const user = await db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);
  if (user.role === 'student' && req.session.userId !== parseInt(id)) {
    return res.status(403).json({ error: 'Not authorized to edit this equipment' });
  }

  const existing = await db.prepare('SELECT id FROM equipment WHERE student_id = ?').get(id);

  if (existing) {
    // Update existing
    const updates = [];
    const values = [];

    if (wing_manufacturer !== undefined) { updates.push('wing_manufacturer = ?'); values.push(wing_manufacturer || ''); }
    if (wing_model !== undefined) { updates.push('wing_model = ?'); values.push(wing_model || ''); }
    if (wing_size !== undefined) { updates.push('wing_size = ?'); values.push(wing_size || ''); }
    if (wing_year !== undefined) { updates.push('wing_year = ?'); values.push(wing_year); }
    if (wing_club_owned !== undefined) { updates.push('wing_club_owned = ?'); values.push(wing_club_owned ? 1 : 0); }
    if (harness_manufacturer !== undefined) { updates.push('harness_manufacturer = ?'); values.push(harness_manufacturer || ''); }
    if (harness_model !== undefined) { updates.push('harness_model = ?'); values.push(harness_model || ''); }
    if (harness_club_owned !== undefined) { updates.push('harness_club_owned = ?'); values.push(harness_club_owned ? 1 : 0); }
    if (reserve_manufacturer !== undefined) { updates.push('reserve_manufacturer = ?'); values.push(reserve_manufacturer || ''); }
    if (reserve_model !== undefined) { updates.push('reserve_model = ?'); values.push(reserve_model || ''); }
    if (reserve_size !== undefined) { updates.push('reserve_size = ?'); values.push(reserve_size || ''); }
    if (reserve_pack_date !== undefined) { updates.push('reserve_pack_date = ?'); values.push(reserve_pack_date); }
    if (reserve_club_owned !== undefined) { updates.push('reserve_club_owned = ?'); values.push(reserve_club_owned ? 1 : 0); }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const query = `UPDATE equipment SET ${updates.join(', ')} WHERE student_id = ?`;
    await db.prepare(query).run(...values);
  } else {
    // Insert new
    await db.prepare(
      'INSERT INTO equipment (student_id, wing_manufacturer, wing_model, wing_size, wing_year, wing_club_owned, harness_manufacturer, harness_model, harness_club_owned, reserve_manufacturer, reserve_model, reserve_size, reserve_pack_date, reserve_club_owned, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id,
      wing_manufacturer || '', wing_model || '', wing_size || '', wing_year || null, wing_club_owned ? 1 : 0,
      harness_manufacturer || '', harness_model || '', harness_club_owned ? 1 : 0,
      reserve_manufacturer || '', reserve_model || '', reserve_size || '', reserve_pack_date || null, reserve_club_owned ? 1 : 0,
      new Date().toISOString()
    );
  }

  await logAction(req.session.userId, 'UPDATE', 'equipment', id, { student_id: id });

  const updated = await db.prepare('SELECT * FROM equipment WHERE student_id = ?').get(id);
  res.json(updated);
});

// ============================================================================
// INSTRUCTOR ROUTES
// ============================================================================

// GET /api/instructors
app.get('/api/instructors', requireAuth, requireInstructor, async (req, res) => {
  const db = getDb();
  const user = await db.prepare('SELECT role, club_id FROM users WHERE id = ?').get(req.session.userId);

  let query = `SELECT u.id, u.username, u.email, u.name, u.phone, u.club_id, u.is_chief, c.name as club_name
    FROM users u LEFT JOIN clubs c ON u.club_id = c.id WHERE u.role = ?`;
  const params = ['instructor'];

  // Instructor sees only their club's instructors; admin can filter by club_id param
  if (user.role === 'instructor') {
    query += ' AND u.club_id = ?';
    params.push(user.club_id);
  } else if (user.role === 'admin' && req.query.club_id) {
    query += ' AND u.club_id = ?';
    params.push(req.query.club_id);
  }

  query += ' ORDER BY c.name ASC, u.name ASC';

  const instructors = await db.prepare(query).all(...params);
  res.json({ instructors });
});

// POST /api/instructors (admin or instructor in same club)
app.post('/api/instructors', requireAuth, requireChiefInstructor, async (req, res) => {
  const { name, email, phone, username, password, club_id } = req.body;

  if (!name || !email || !username || !password) {
    return res.status(400).json({ error: 'Name, email, username, and password required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const db = getDb();
  const currentUser = await db.prepare('SELECT role, club_id FROM users WHERE id = ?').get(req.session.userId);

  // Determine target club_id
  let targetClubId;
  if (currentUser.role === 'admin') {
    // Admin must specify club_id
    if (!club_id) {
      return res.status(400).json({ error: 'Club ID required for admin' });
    }
    targetClubId = club_id;
  } else {
    // Instructor: always assigns to own club
    targetClubId = currentUser.club_id;
  }

  const existingUser = await db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existingUser) {
    return res.status(400).json({ error: 'Username or email already exists' });
  }

  const hashedPassword = bcrypt.hashSync(password, 12);

  // Auto-set as chief if no instructors exist in this club yet
  const existingInstructors = await db.prepare('SELECT id FROM users WHERE club_id = ? AND role = ?').get(targetClubId, 'instructor');
  const autoChief = existingInstructors ? 0 : 1;

  const result = await db.prepare(
    'INSERT INTO users (username, email, name, password_hash, phone, role, club_id, is_chief) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(username, email, name, hashedPassword, phone || null, 'instructor', targetClubId, autoChief);

  await logAction(req.session.userId, 'CREATE', 'instructor', result.lastInsertRowid, { name, email, is_chief: autoChief });

  const instructor = await db.prepare(
    'SELECT id, username, email, name, phone, club_id, is_chief FROM users WHERE id = ?'
  ).get(result.lastInsertRowid);

  res.status(201).json(instructor);
});

// DELETE /api/instructors/:id (admin or instructor in same club)
app.delete('/api/instructors/:id', requireAuth, requireChiefInstructor, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId;

  if (id == userId) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  const db = getDb();
  const currentUser = await db.prepare('SELECT role, club_id FROM users WHERE id = ?').get(userId);
  const instructor = await db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(id, 'instructor');

  if (!instructor) {
    return res.status(404).json({ error: 'Instructor not found' });
  }

  // Instructor can only delete instructors from their own club
  if (currentUser.role === 'instructor' && instructor.club_id !== currentUser.club_id) {
    return res.status(403).json({ error: 'Cannot delete instructor from another club' });
  }

  await db.prepare('DELETE FROM users WHERE id = ?').run(id);

  await logAction(req.session.userId, 'DELETE', 'instructor', id, {});

  res.json({ success: true });
});

// PUT /api/instructors/:id/set-chief — admin or current chief can transfer the role
app.put('/api/instructors/:id/set-chief', requireAuth, async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const currentUser = await db.prepare('SELECT role, club_id, is_chief FROM users WHERE id = ?').get(req.session.userId);
  if (!currentUser) return res.status(401).json({ error: 'Unauthorized' });

  const target = await db.prepare('SELECT id, club_id, role FROM users WHERE id = ? AND role = ?').get(id, 'instructor');
  if (!target) return res.status(404).json({ error: 'Instructor not found' });

  if (currentUser.role === 'admin') {
    // Admin can set chief for any club
  } else if (currentUser.role === 'instructor' && currentUser.is_chief && currentUser.club_id === target.club_id) {
    // Chief can transfer to same club
  } else {
    return res.status(403).json({ error: 'Only admin or current chief can change this' });
  }

  // Remove chief from all instructors in the target club, then set the new one
  await db.prepare('UPDATE users SET is_chief = 0 WHERE club_id = ? AND role = ?').run(target.club_id, 'instructor');
  await db.prepare('UPDATE users SET is_chief = 1 WHERE id = ?').run(id);

  await logAction(req.session.userId, 'SET_CHIEF', 'instructor', id, { club_id: target.club_id });
  res.json({ success: true });
});

// ============================================================================
// CLUBS ROUTES (Admin only)
// ============================================================================

// GET /api/clubs
app.get('/api/clubs', requireAuth, requireAdmin, async (req, res) => {
  const db = getDb();
  const clubs = await db.prepare('SELECT * FROM clubs ORDER BY name ASC').all();
  res.json({ clubs });
});

// POST /api/clubs
app.post('/api/clubs', requireAuth, requireAdmin, async (req, res) => {
  const { club_name, club_slug, club_description, instructor_name, instructor_email, instructor_username, instructor_password } = req.body;

  if (!club_name || !club_slug || !instructor_name || !instructor_email || !instructor_username || !instructor_password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (instructor_password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const db = getDb();

  // Check if club slug exists
  const existingClub = await db.prepare('SELECT id FROM clubs WHERE slug = ?').get(club_slug);
  if (existingClub) {
    return res.status(400).json({ error: 'Club slug already exists' });
  }

  // Check if instructor username or email exists
  const existingUser = await db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(instructor_username, instructor_email);
  if (existingUser) {
    return res.status(400).json({ error: 'Username or email already exists' });
  }

  try {
    // Create club
    const clubResult = await db.prepare('INSERT INTO clubs (name, slug, description) VALUES (?, ?, ?)').run(
      club_name, club_slug, club_description || ''
    );
    const clubId = clubResult.lastInsertRowid;

    // Create first instructor for the club
    const hashedPassword = bcrypt.hashSync(instructor_password, 12);
    const instructorResult = await db.prepare(
      'INSERT INTO users (username, email, name, password_hash, role, club_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(instructor_username, instructor_email, instructor_name, hashedPassword, 'instructor', clubId);

    await logAction(req.session.userId, 'CREATE', 'club', clubId, { name: club_name, instructor_id: instructorResult.lastInsertRowid });

    const club = await db.prepare('SELECT * FROM clubs WHERE id = ?').get(clubId);
    res.status(201).json(club);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/clubs/:id
app.put('/api/clubs/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, slug, description, is_active } = req.body;

  const db = getDb();
  const club = await db.prepare('SELECT * FROM clubs WHERE id = ?').get(id);

  if (!club) {
    return res.status(404).json({ error: 'Club not found' });
  }

  const updates = [];
  const values = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (slug !== undefined) { updates.push('slug = ?'); values.push(slug); }
  if (description !== undefined) { updates.push('description = ?'); values.push(description); }
  if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }

  if (updates.length > 0) {
    values.push(id);
    const query = `UPDATE clubs SET ${updates.join(', ')} WHERE id = ?`;
    await db.prepare(query).run(...values);
  }

  await logAction(req.session.userId, 'UPDATE', 'club', id, { fields: Object.keys(req.body) });

  const updated = await db.prepare('SELECT * FROM clubs WHERE id = ?').get(id);
  res.json(updated);
});

// DELETE /api/clubs/:id (soft delete)
app.delete('/api/clubs/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const club = await db.prepare('SELECT * FROM clubs WHERE id = ?').get(id);

  if (!club) {
    return res.status(404).json({ error: 'Club not found' });
  }

  await db.prepare('UPDATE clubs SET is_active = 0 WHERE id = ?').run(id);

  await logAction(req.session.userId, 'DELETE', 'club', id, {});

  res.json({ success: true });
});

// GET /api/clubs/:id/stats
app.get('/api/clubs/:id/stats', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const club = await db.prepare('SELECT * FROM clubs WHERE id = ?').get(id);

  if (!club) {
    return res.status(404).json({ error: 'Club not found' });
  }

  const studentCount = await db.prepare('SELECT COUNT(*) as count FROM users WHERE club_id = ? AND role = ?').get(id, 'student');
  const instructorCount = await db.prepare('SELECT COUNT(*) as count FROM users WHERE club_id = ? AND role = ?').get(id, 'instructor');
  const siteCount = await db.prepare('SELECT COUNT(*) as count FROM sites WHERE club_id = ?').get(id);
  const flightCount = await db.prepare('SELECT COALESCE(SUM(flight_count), 0) as count FROM flights WHERE student_id IN (SELECT id FROM users WHERE club_id = ? AND role = ?)').get(id, 'student');

  res.json({
    club,
    stats: {
      students: parseInt(studentCount.count),
      instructors: parseInt(instructorCount.count),
      sites: parseInt(siteCount.count),
      flights: parseInt(flightCount.count)
    }
  });
});

// ============================================================================
// DASHBOARD ROUTE
// ============================================================================

// GET /api/dashboard
app.get('/api/dashboard', requireAuth, requireInstructor, async (req, res) => {
  const db = getDb();
  const user = await db.prepare('SELECT role, club_id FROM users WHERE id = ?').get(req.session.userId);

  // Build club filter (parameterized for safety)
  let clubWhere = '';
  const clubParams = [];
  if (user.role === 'instructor') {
    clubWhere = ' AND u.club_id = ?';
    clubParams.push(user.club_id);
  }

  // Count stats
  const activeStudents = await db.prepare(
    `SELECT COUNT(*) as count FROM users u WHERE u.role = ? AND u.status = ?${clubWhere}`
  ).get('student', 'ongoing', ...clubParams);

  const graduatedStudents = await db.prepare(
    `SELECT COUNT(*) as count FROM users u WHERE u.role = ? AND u.status = ?${clubWhere}`
  ).get('student', 'completed', ...clubParams);

  const totalFlights = await db.prepare(
    `SELECT COALESCE(SUM(f.flight_count), 0) as count FROM flights f JOIN users u ON f.student_id = u.id WHERE 1=1${clubWhere}`
  ).get(...clubParams);

  const totalLessons = await db.prepare(
    `SELECT COUNT(*) as count FROM lessons l JOIN users u ON l.instructor_id = u.id WHERE 1=1${clubWhere}`
  ).get(...clubParams);

  // Active students with stats and last_flight_date
  const students = await db.prepare(`
    SELECT u.id, u.username, u.name, u.email, u.phone, u.role, u.status,
           u.pp2_exam_passed, u.pp2_exam_date, u.course_started, u.student_notes, u.club_id, u.created_at
    FROM users u
    WHERE u.role = 'student' AND u.status = 'ongoing'${clubWhere}
    ORDER BY u.name ASC
  `).all(...clubParams);

  const studentsWithStats = [];
  for (const student of students) {
    const stats = await getStudentStats(student.id);
    studentsWithStats.push({ ...student, ...stats });
  }

  // Recent events (10 latest audit_log entries)
  const events = await db.prepare(`
    SELECT al.*, u.name as user_name
    FROM audit_log al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE 1=1${clubWhere}
    ORDER BY al.timestamp DESC
    LIMIT 10
  `).all(...clubParams);

  // Inactive warnings (students with no flight in 30+ days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const inactiveWarnings = await db.prepare(`
    SELECT u.id, u.name, u.email, u.status,
      (SELECT MAX(date) FROM flights WHERE student_id = u.id) as last_flight_date
    FROM users u
    WHERE u.role = 'student' AND u.status = 'ongoing'${clubWhere}
    AND (
      (SELECT MAX(date) FROM flights WHERE student_id = u.id) IS NULL
      OR (SELECT MAX(date) FROM flights WHERE student_id = u.id) < ?
    )
  `).all(...clubParams, thirtyDaysAgo);

  // Retention warnings: students whose course_started is over 10 years ago
  const tenYearsAgo = new Date(Date.now() - 10 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const retentionWarnings = await db.prepare(`
    SELECT u.id, u.name, u.status, u.course_started
    FROM users u
    WHERE u.role = 'student' AND u.course_started IS NOT NULL AND u.course_started < ?${clubWhere}
    ORDER BY u.course_started ASC
  `).all(tenYearsAgo, ...clubParams);

  res.json({
    stats: {
      active_students: parseInt(activeStudents.count),
      graduated_students: parseInt(graduatedStudents.count),
      total_flights: parseInt(totalFlights.count),
      total_lessons: parseInt(totalLessons.count)
    },
    students: studentsWithStats,
    recent_events: events,
    inactive_warnings: inactiveWarnings,
    retention_warnings: retentionWarnings
  });
});

// ============================================================================
// CLUB SETTINGS ROUTES
// ============================================================================

app.get('/api/club-settings', requireAuth, requireChiefInstructor, async (req, res) => {
  const db = getDb();
  const user = await db.prepare('SELECT club_id FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.club_id) return res.status(400).json({ error: 'No club' });
  let settings = await db.prepare('SELECT * FROM club_settings WHERE club_id = ?').get(user.club_id);
  if (!settings) {
    await db.prepare('INSERT INTO club_settings (club_id) VALUES (?)').run(user.club_id);
    settings = { club_id: user.club_id, require_flight_approval: 0 };
  }
  res.json({ settings });
});

app.put('/api/club-settings', requireAuth, requireChiefInstructor, async (req, res) => {
  const db = getDb();
  const user = await db.prepare('SELECT club_id FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.club_id) return res.status(400).json({ error: 'No club' });

  const { require_flight_approval } = req.body;
  if (require_flight_approval !== undefined) {
    await db.prepare('UPDATE club_settings SET require_flight_approval = ? WHERE club_id = ?').run(require_flight_approval ? 1 : 0, user.club_id);
  }

  await logAction(req.session.userId, 'UPDATE', 'club_settings', user.club_id, req.body);
  const settings = await db.prepare('SELECT * FROM club_settings WHERE club_id = ?').get(user.club_id);
  res.json({ settings });
});

// ============================================================================
// MY CLUB ROUTES (Chief instructor)
// ============================================================================

app.get('/api/my-club', requireAuth, requireInstructor, async (req, res) => {
  const db = getDb();
  const user = await db.prepare('SELECT club_id FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.club_id) return res.status(400).json({ error: 'No club' });
  const club = await db.prepare('SELECT * FROM clubs WHERE id = ?').get(user.club_id);
  res.json({ club });
});

app.put('/api/my-club', requireAuth, requireChiefInstructor, async (req, res) => {
  const db = getDb();
  const user = await db.prepare('SELECT club_id FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.club_id) return res.status(400).json({ error: 'No club' });

  const { name, description, contact_email, contact_phone, website } = req.body;
  const updates = [];
  const values = [];
  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (description !== undefined) { updates.push('description = ?'); values.push(description); }
  if (contact_email !== undefined) { updates.push('contact_email = ?'); values.push(contact_email || null); }
  if (contact_phone !== undefined) { updates.push('contact_phone = ?'); values.push(contact_phone || null); }
  if (website !== undefined) { updates.push('website = ?'); values.push(website || null); }

  if (updates.length > 0) {
    values.push(user.club_id);
    await db.prepare(`UPDATE clubs SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  await logAction(req.session.userId, 'UPDATE', 'club', user.club_id, { fields: Object.keys(req.body) });
  const club = await db.prepare('SELECT * FROM clubs WHERE id = ?').get(user.club_id);
  res.json({ club });
});

app.post('/api/my-club/logo', requireAuth, requireChiefInstructor, upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const db = getDb();
  const user = await db.prepare('SELECT club_id FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.club_id) return res.status(400).json({ error: 'No club' });

  // Delete old logo file if exists
  const club = await db.prepare('SELECT logo_path FROM clubs WHERE id = ?').get(user.club_id);
  if (club && club.logo_path) {
    const oldPath = path.join(UPLOAD_DIR, club.logo_path);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  await db.prepare('UPDATE clubs SET logo_path = ? WHERE id = ?').run(req.file.filename, user.club_id);
  await logAction(req.session.userId, 'UPDATE', 'club_logo', user.club_id, {});
  res.json({ logo_path: req.file.filename });
});

app.delete('/api/my-club/logo', requireAuth, requireChiefInstructor, async (req, res) => {
  const db = getDb();
  const user = await db.prepare('SELECT club_id FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.club_id) return res.status(400).json({ error: 'No club' });

  const club = await db.prepare('SELECT logo_path FROM clubs WHERE id = ?').get(user.club_id);
  if (club && club.logo_path) {
    const oldPath = path.join(UPLOAD_DIR, club.logo_path);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  await db.prepare('UPDATE clubs SET logo_path = NULL WHERE id = ?').run(user.club_id);
  res.json({ success: true });
});

app.get('/api/clubs/:id/logo', async (req, res) => {
  const db = getDb();
  const club = await db.prepare('SELECT logo_path FROM clubs WHERE id = ?').get(req.params.id);
  if (!club || !club.logo_path) return res.status(404).json({ error: 'No logo' });
  const filepath = path.join(UPLOAD_DIR, club.logo_path);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(path.resolve(filepath));
});

// ============================================================================
// AUDIT LOG ROUTE
// ============================================================================

// GET /api/audit-log
app.get('/api/audit-log', requireAuth, requireInstructor, async (req, res) => {
  const { user_id, entity_type, from, to, limit = 100 } = req.query;

  const db = getDb();
  const user = await db.prepare('SELECT role, club_id FROM users WHERE id = ?').get(req.session.userId);

  let query = 'SELECT al.*, u.name as user_name FROM audit_log al LEFT JOIN users u ON al.user_id = u.id WHERE 1=1';
  const params = [];

  // Filter by club for instructors
  if (user.role === 'instructor') {
    query += ' AND u.club_id = ?';
    params.push(user.club_id);
  }

  if (user_id) {
    query += ' AND al.user_id = ?';
    params.push(user_id);
  }

  if (entity_type) {
    query += ' AND al.entity_type = ?';
    params.push(entity_type);
  }

  if (from) {
    query += ' AND al.timestamp >= ?';
    params.push(from);
  }

  if (to) {
    query += ' AND al.timestamp <= ?';
    params.push(to);
  }

  query += ' ORDER BY al.timestamp DESC LIMIT ?';
  params.push(Math.min(parseInt(limit) || 100, 1000));

  const logs = await db.prepare(query).all(...params);
  res.json({ events: logs });
});

// ============================================================================
// GDPR — Privacy policy endpoint
// ============================================================================

app.get('/api/privacy-policy', (req, res) => {
  res.json({
    title: 'PilottiPolku — Tietosuojaseloste',
    controller: 'PilottiPolku-sovelluksen ylläpitäjä',
    purpose: 'Varjoliidon koulutuksen hallinta ja seuranta',
    legal_basis: 'Sopimus (koulutussuhde) ja oikeutettu etu (turvallisuus)',
    data_collected: [
      'Nimi, sähköposti, puhelinnumero',
      'Koulutustiedot: lennot, teoria, kalusto',
      'Kirjautumistiedot (salasana tallennetaan kryptattuna)',
      'Käyttöloki (audit log) turvallisuussyistä'
    ],
    data_retention: 'Koulutustiedot säilytetään koulutussuhteen ajan ja 5 vuotta sen jälkeen ilmailuviranomaisten vaatimusten mukaisesti.',
    data_sharing: 'Tietoja ei luovuteta kolmansille osapuolille, paitsi viranomaisten lakisääteisestä pyynnöstä.',
    rights: [
      'Oikeus nähdä omat tiedot (sisäänkirjautuessa näkyvissä)',
      'Oikeus pyytää tietojen oikaisua ohjaajalta',
      'Oikeus pyytää tietojen poistamista (huom: ilmailumääräykset voivat estää poiston)',
      'Oikeus tehdä valitus tietosuojavaltuutetulle'
    ],
    contact: 'Ota yhteyttä kerhosi ohjaajaan tai ylläpitäjään tietosuoja-asioissa.',
    updated: '2026-04-06'
  });
});

// ============================================================================
// ERROR HANDLING & SERVER START
// ============================================================================

app.use((err, req, res, next) => {
  console.error('Error:', err);

  // Report to Sentry if configured
  if (Sentry) {
    Sentry.captureException(err);
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'FILE_TOO_LARGE') {
      return res.status(400).json({ error: 'File too large (max 10MB)' });
    }
    return res.status(400).json({ error: 'File upload error' });
  }

  if (err.message === 'Only PDF, JPG, and PNG files are allowed') {
    return res.status(400).json({ error: err.message });
  }

  res.status(500).json({ error: 'Internal server error' });
});

// Seed database with default data (runs automatically on startup if DB is empty)
async function seedDatabase() {
  const db = getDb();
  const userCount = await db.prepare('SELECT COUNT(*) as c FROM users').get();
  if (parseInt(userCount.c) > 0) return { message: 'Already seeded', userCount: parseInt(userCount.c) };

  console.log('Database is empty — seeding default data...');
  if (process.env.NODE_ENV === 'production') {
    console.warn('⚠ Seeding into a PRODUCTION database. Default accounts will be forced to change passwords on first login.');
  }
  const hash = (pw) => bcrypt.hashSync(pw, 12);
  // In production every default account must change its password on first login.
  const forceChange = process.env.NODE_ENV === 'production' ? 1 : 0;

  try {
    // ============================
    // Admin user (no club)
    // ============================
    await db.prepare(
      'INSERT INTO users (username,password_hash,role,name,email) VALUES (?,?,?,?,?)'
    ).run('admin', hash('admin123'), 'admin', 'Pääkäyttäjä', 'admin@pilottipolku.fi');

    // ============================
    // KERHO 1: Hämeenkyrön Lentokerho
    // ============================
    const club1 = await db.prepare(
      'INSERT INTO clubs (name,slug,description) VALUES (?,?,?)'
    ).run('Hämeenkyrön Lentokerho', 'hameenkyro', 'Hämeenkyrön lentokerhon koulutusohjelma');
    const club1Id = club1.lastInsertRowid;

    // Ohjaajat
    await db.prepare(
      'INSERT INTO users (username,password_hash,role,name,email,phone,club_id) VALUES (?,?,?,?,?,?,?)'
    ).run('Taavi', hash('Taavi123!!'), 'instructor', 'Taavi Tuulentaittaja', 'taavi.t@example.com', '040-1234567', club1Id);
    await db.prepare(
      'INSERT INTO users (username,password_hash,role,name,email,phone,club_id) VALUES (?,?,?,?,?,?,?)'
    ).run('Marko', hash('Marko123!!'), 'instructor', 'Marko Sorvamaa', 'marko.s@example.com', '050-7654321', club1Id);

    // Oppilaat
    await db.prepare(
      'INSERT INTO users (username,password_hash,role,name,email,phone,status,course_started,club_id) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run('pekka', hash('oppilas123'), 'student', 'Pekka Pilotti', 'pekka@example.com', '044-1111111', 'ongoing', '2026-01-15', club1Id);
    await db.prepare(
      'INSERT INTO users (username,password_hash,role,name,email,phone,status,course_started,club_id) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run('anna', hash('oppilas123'), 'student', 'Anna Aloittelija', 'anna@example.com', '044-2222222', 'ongoing', '2026-02-01', club1Id);
    await db.prepare(
      'INSERT INTO users (username,password_hash,role,name,email,phone,status,course_started,club_id) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run('kalle', hash('oppilas123'), 'student', 'Kalle Korkealentäjä', 'kalle@example.com', '044-3333333', 'ongoing', '2025-06-01', club1Id);

    // Lentopaikat
    await db.prepare('INSERT INTO sites (name,description,club_id) VALUES (?,?,?)').run('Teisko', 'Teiskon harjoittelupaikka', club1Id);
    await db.prepare('INSERT INTO sites (name,description,club_id) VALUES (?,?,?)').run('Hämeenkyrön lentokenttä', 'EFHM, pääkenttä', club1Id);
    await db.prepare('INSERT INTO sites (name,description,club_id) VALUES (?,?,?)').run('Jämi', 'Jämin lentopaikka', club1Id);

    // ============================
    // KERHO 2: FlyDaddy
    // ============================
    const club2 = await db.prepare(
      'INSERT INTO clubs (name,slug,description) VALUES (?,?,?)'
    ).run('FlyDaddy', 'flydaddy', 'FlyDaddy varjoliitokoulutus');
    const club2Id = club2.lastInsertRowid;

    await db.prepare(
      'INSERT INTO users (username,password_hash,role,name,email,phone,club_id) VALUES (?,?,?,?,?,?,?)'
    ).run('Väiski', hash('Viski123!!'), 'instructor', 'Väiski Virtanen', 'vaiski.v@example.com', '040-5551234', club2Id);

    await db.prepare(
      'INSERT INTO users (username,password_hash,role,name,email,phone,status,course_started,club_id) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run('mikko_fd', hash('oppilas123'), 'student', 'Mikko Mäkinen', 'mikko.m@example.com', '044-4444444', 'ongoing', '2026-01-10', club2Id);
    await db.prepare(
      'INSERT INTO users (username,password_hash,role,name,email,phone,status,course_started,club_id) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run('sanna_fd', hash('oppilas123'), 'student', 'Sanna Siipi', 'sanna.s@example.com', '044-5555555', 'ongoing', '2026-02-20', club2Id);
    await db.prepare(
      'INSERT INTO users (username,password_hash,role,name,email,phone,status,course_started,club_id) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run('tommi_fd', hash('oppilas123'), 'student', 'Tommi Tuuli', 'tommi.t@example.com', '044-6666666', 'ongoing', '2025-09-15', club2Id);

    await db.prepare('INSERT INTO sites (name,description,club_id) VALUES (?,?,?)').run('Vesivehmaa', 'Vesivehmaan lentokenttä', club2Id);
    await db.prepare('INSERT INTO sites (name,description,club_id) VALUES (?,?,?)').run('Isolähde', 'Isolähteen lentopaikka', club2Id);

    // ============================
    // KERHO 3: Oulun Icaros Team
    // ============================
    const club3 = await db.prepare(
      'INSERT INTO clubs (name,slug,description) VALUES (?,?,?)'
    ).run('Oulun Icaros Team', 'icaros', 'Oulun Icaros Team varjoliitokoulutus');
    const club3Id = club3.lastInsertRowid;

    await db.prepare(
      'INSERT INTO users (username,password_hash,role,name,email,phone,club_id) VALUES (?,?,?,?,?,?,?)'
    ).run('Jarno', hash('Jarno123!!'), 'instructor', 'Jarno Järvinen', 'jarno.j@example.com', '040-6661234', club3Id);

    await db.prepare(
      'INSERT INTO users (username,password_hash,role,name,email,phone,status,course_started,club_id) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run('heikki_ic', hash('oppilas123'), 'student', 'Heikki Haukka', 'heikki.h@example.com', '044-7777777', 'ongoing', '2026-03-01', club3Id);
    await db.prepare(
      'INSERT INTO users (username,password_hash,role,name,email,phone,status,course_started,club_id) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run('liisa_ic', hash('oppilas123'), 'student', 'Liisa Lokki', 'liisa.l@example.com', '044-8888888', 'ongoing', '2025-11-01', club3Id);
    await db.prepare(
      'INSERT INTO users (username,password_hash,role,name,email,phone,status,course_started,club_id) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run('erkki_ic', hash('oppilas123'), 'student', 'Erkki Etelävuori', 'erkki.e@example.com', '044-9999999', 'ongoing', '2025-08-15', club3Id);

    await db.prepare('INSERT INTO sites (name,description,club_id) VALUES (?,?,?)').run('Ahmosuo', 'Ahmosuon lentopaikka', club3Id);
    await db.prepare('INSERT INTO sites (name,description,club_id) VALUES (?,?,?)').run('Kuivasmeri', 'Kuivasmeren lentopaikka', club3Id);

    // ============================
    // KERHO 4: Airiston Varjoliitäjät
    // ============================
    const club4 = await db.prepare(
      'INSERT INTO clubs (name,slug,description) VALUES (?,?,?)'
    ).run('Airiston Varjoliitäjät', 'airisto', 'Airiston Varjoliitäjät ry');
    const club4Id = club4.lastInsertRowid;

    await db.prepare(
      'INSERT INTO users (username,password_hash,role,name,email,phone,club_id) VALUES (?,?,?,?,?,?,?)'
    ).run('Juho', hash('Juho123!!'), 'instructor', 'Juho Jokinen', 'juho.j@example.com', '040-7771234', club4Id);

    await db.prepare(
      'INSERT INTO users (username,password_hash,role,name,email,phone,status,course_started,club_id) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run('ville_ai', hash('oppilas123'), 'student', 'Ville Varpunen', 'ville.v@example.com', '044-1010101', 'ongoing', '2026-02-15', club4Id);
    await db.prepare(
      'INSERT INTO users (username,password_hash,role,name,email,phone,status,course_started,club_id) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run('maria_ai', hash('oppilas123'), 'student', 'Maria Merilintu', 'maria.m@example.com', '044-2020202', 'ongoing', '2025-10-01', club4Id);
    await db.prepare(
      'INSERT INTO users (username,password_hash,role,name,email,phone,status,course_started,club_id) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run('jukka_ai', hash('oppilas123'), 'student', 'Jukka Jalohaukka', 'jukka.j@example.com', '044-3030303', 'ongoing', '2026-01-20', club4Id);

    await db.prepare('INSERT INTO sites (name,description,club_id) VALUES (?,?,?)').run('Oripää', 'Oripään lentopaikka', club4Id);

    // ============================
    // THEORY SECTIONS & TOPICS (same for all clubs)
    // ============================
    const theorySections = [
      { level:'pp1', key:'pp1_aero', title:'Aerodynamiikka', topics:[
        {key:'pp1_aero_1',title:'Liitimen rakenne ja toiminta',dur:45,comment:'Koulutusopas luku 2.1'},
        {key:'pp1_aero_2',title:'Nostovoima ja vastus',dur:45,comment:'Koulutusopas luku 2.2'},
        {key:'pp1_aero_3',title:'Lentonopeudet ja suoritusarvot',dur:30,comment:'Koulutusopas luku 2.3'},
        {key:'pp1_aero_4',title:'Sakkaus ja sen välttäminen',dur:45,comment:'Koulutusopas luku 2.4'},
        {key:'pp1_aero_5',title:'Kääntyminen ja painonsiirto',dur:30,comment:'Koulutusopas luku 2.5'}
      ]},
      { level:'pp1', key:'pp1_meteo', title:'Mikrometeorologia', topics:[
        {key:'pp1_meteo_1',title:'Tuulen perusteet',dur:45,comment:'Koulutusopas luku 3.1'},
        {key:'pp1_meteo_2',title:'Terminen aktiivisuus – perusteet',dur:45,comment:'Koulutusopas luku 3.2'},
        {key:'pp1_meteo_3',title:'Turbulenssi ja tuulengradientti',dur:30,comment:'Koulutusopas luku 3.3'},
        {key:'pp1_meteo_4',title:'Sääennusteiden lukeminen',dur:30,comment:'Koulutusopas luku 3.4'},
        {key:'pp1_meteo_5',title:'Paikallissääilmiöt',dur:30,comment:'Koulutusopas luku 3.5'}
      ]},
      { level:'pp1', key:'pp1_equip', title:'Välineet', topics:[
        {key:'pp1_equip_1',title:'Liitimen osat ja materiaalit',dur:45,comment:'Koulutusopas luku 4.1'},
        {key:'pp1_equip_2',title:'Valjaat ja varavarjo',dur:45,comment:'Koulutusopas luku 4.2'},
        {key:'pp1_equip_3',title:'Kypärä ja suojavarusteet',dur:30,comment:'Koulutusopas luku 4.3'},
        {key:'pp1_equip_4',title:'Välineiden tarkastus ja huolto',dur:45,comment:'Koulutusopas luku 4.4'}
      ]},
      { level:'pp1', key:'pp1_rules', title:'Säännöt ja ilmatila', topics:[
        {key:'pp1_rules_1',title:'Ilmailulaki ja -määräykset',dur:45,comment:'Koulutusopas luku 5.1'},
        {key:'pp1_rules_2',title:'Ilmatilarakenne',dur:45,comment:'Koulutusopas luku 5.2'},
        {key:'pp1_rules_3',title:'NOTAM ja ilmailutiedotteet',dur:30,comment:'Koulutusopas luku 5.3'},
        {key:'pp1_rules_4',title:'Väistämissäännöt',dur:30,comment:'Koulutusopas luku 5.4'},
        {key:'pp1_rules_5',title:'SIL:n ohjeet ja koulutusvaatimukset',dur:45,comment:'Koulutusopas luku 5.5'}
      ]},
      { level:'pp1', key:'pp1_tech', title:'Lentotekniikka PP1', topics:[
        {key:'pp1_tech_1',title:'Maassa tapahtuva harjoittelu',dur:45,comment:'Koulutusopas luku 6.1'},
        {key:'pp1_tech_2',title:'Nousu ja laskeutuminen',dur:60,comment:'Koulutusopas luku 6.2'},
        {key:'pp1_tech_3',title:'Suuntaohjaus ja nopeudensäätö',dur:45,comment:'Koulutusopas luku 6.3'},
        {key:'pp1_tech_4',title:'Laskeutumiskuviot',dur:45,comment:'Koulutusopas luku 6.4'},
        {key:'pp1_tech_5',title:'Top-landing harjoittelu',dur:30,comment:'Koulutusopas luku 6.5'}
      ]},
      { level:'pp1', key:'pp1_safety', title:'Turvallisuus PP1', topics:[
        {key:'pp1_safety_1',title:'Riskienhallinta ja päätöksenteko',dur:45,comment:'Koulutusopas luku 7.1'},
        {key:'pp1_safety_2',title:'Hätätilanteet – liitimen hallinta',dur:60,comment:'Koulutusopas luku 7.2'},
        {key:'pp1_safety_3',title:'Varavarjon käyttö',dur:45,comment:'Koulutusopas luku 7.3'},
        {key:'pp1_safety_4',title:'Ensiapu lentopaikalla',dur:45,comment:'Koulutusopas luku 7.4'},
        {key:'pp1_safety_5',title:'Onnettomuusraportointi',dur:30,comment:'Koulutusopas luku 7.5'}
      ]},
      { level:'pp2', key:'pp2_aero_adv', title:'Aerodynamiikka (syventävä)', topics:[
        {key:'pp2_aero_1',title:'Profiilipolaaridiagrammit',dur:45,comment:'Koulutusopas luku 8.1'},
        {key:'pp2_aero_2',title:'Liitosuhde ja sink rate',dur:45,comment:'Koulutusopas luku 8.2'},
        {key:'pp2_aero_3',title:'Wingover ja SAT – aerodynamiikka',dur:60,comment:'Koulutusopas luku 8.3'},
        {key:'pp2_aero_4',title:'Speed system ja trim',dur:30,comment:'Koulutusopas luku 8.4'},
        {key:'pp2_aero_5',title:'EN-luokitus ja turvallisuustestit',dur:30,comment:'Koulutusopas luku 8.5'},
        {key:'pp2_aero_6',title:'Siipiprofiilien vertailu',dur:45,comment:'Koulutusopas luku 8.6'}
      ]},
      { level:'pp2', key:'pp2_meteo_adv', title:'Meteorologia (syventävä)', topics:[
        {key:'pp2_meteo_1',title:'Synoptiikka ja sääkartat',dur:60,comment:'Koulutusopas luku 9.1'},
        {key:'pp2_meteo_2',title:'Termiikka – kehittynyt teoria',dur:60,comment:'Koulutusopas luku 9.2'},
        {key:'pp2_meteo_3',title:'Inversiot ja stabiilisuus',dur:45,comment:'Koulutusopas luku 9.3'},
        {key:'pp2_meteo_4',title:'Vuoristoaallot ja roottori',dur:45,comment:'Koulutusopas luku 9.4'},
        {key:'pp2_meteo_5',title:'Ukkosrintamat ja vaaralliset säätilat',dur:45,comment:'Koulutusopas luku 9.5'},
        {key:'pp2_meteo_6',title:'Lentosään arviointi ja Go/No-Go',dur:30,comment:'Koulutusopas luku 9.6'}
      ]},
      { level:'pp2', key:'pp2_nav', title:'Navigointi', topics:[
        {key:'pp2_nav_1',title:'Kartat ja koordinaatistot',dur:45,comment:'Koulutusopas luku 10.1'},
        {key:'pp2_nav_2',title:'GPS-navigointi ilmassa',dur:45,comment:'Koulutusopas luku 10.2'},
        {key:'pp2_nav_3',title:'Reittisuunnittelu – XC',dur:60,comment:'Koulutusopas luku 10.3'},
        {key:'pp2_nav_4',title:'Ilmatilarajat ja karttapalvelut',dur:30,comment:'Koulutusopas luku 10.4'},
        {key:'pp2_nav_5',title:'Vario ja flight computer',dur:45,comment:'Koulutusopas luku 10.5'}
      ]},
      { level:'pp2', key:'pp2_tech_adv', title:'Lentotekniikka PP2', topics:[
        {key:'pp2_tech_1',title:'Termiikkiin keskittyminen',dur:60,comment:'Koulutusopas luku 11.1'},
        {key:'pp2_tech_2',title:'Dynaamiset käännökset',dur:45,comment:'Koulutusopas luku 11.2'},
        {key:'pp2_tech_3',title:'Big ears ja B-stall',dur:45,comment:'Koulutusopas luku 11.3'},
        {key:'pp2_tech_4',title:'Spiral dive ja exit',dur:60,comment:'Koulutusopas luku 11.4'},
        {key:'pp2_tech_5',title:'Laskeutuminen ahtaisiin paikkoihin',dur:45,comment:'Koulutusopas luku 11.5'},
        {key:'pp2_tech_6',title:'Tuulilaskennat ja finaalivalinta',dur:45,comment:'Koulutusopas luku 11.6'}
      ]},
      { level:'pp2', key:'pp2_xc', title:'Matkalento (XC)', topics:[
        {key:'pp2_xc_1',title:'XC-lennon suunnittelu',dur:60,comment:'Koulutusopas luku 12.1'},
        {key:'pp2_xc_2',title:'Termiikkistrategia',dur:60,comment:'Koulutusopas luku 12.2'},
        {key:'pp2_xc_3',title:'Siirtymälennot ja liito-optimointi',dur:45,comment:'Koulutusopas luku 12.3'},
        {key:'pp2_xc_4',title:'XC-kilpailut ja FAI-säännöt',dur:45,comment:'Koulutusopas luku 12.4'},
        {key:'pp2_xc_5',title:'Lentopäiväkirja ja dokumentointi',dur:30,comment:'Koulutusopas luku 12.5'}
      ]},
      { level:'pp2', key:'pp2_safety_adv', title:'Turvallisuus PP2', topics:[
        {key:'pp2_safety_1',title:'SIV-kurssin teoria',dur:60,comment:'Koulutusopas luku 13.1'},
        {key:'pp2_safety_2',title:'Kasaantuminen ja cravat',dur:45,comment:'Koulutusopas luku 13.2'},
        {key:'pp2_safety_3',title:'Autorotaatio ja full stall',dur:45,comment:'Koulutusopas luku 13.3'},
        {key:'pp2_safety_4',title:'Läheltä piti -raportointi',dur:30,comment:'Koulutusopas luku 13.4'},
        {key:'pp2_safety_5',title:'Henkinen valmentautuminen',dur:45,comment:'Koulutusopas luku 13.5'}
      ]},
      { level:'pp2', key:'pp2_human', title:'Inhimilliset tekijät', topics:[
        {key:'pp2_human_1',title:'Ihmisen suorituskyky ja rajoitukset',dur:45,comment:'Koulutusopas luku 14.1'},
        {key:'pp2_human_2',title:'Päätöksenteko lennolla (ADM)',dur:45,comment:'Koulutusopas luku 14.2'},
        {key:'pp2_human_3',title:'Stressinhallinta',dur:30,comment:'Koulutusopas luku 14.3'},
        {key:'pp2_human_4',title:'Fyysinen kunto ja lentäminen',dur:30,comment:'Koulutusopas luku 14.4'},
        {key:'pp2_human_5',title:'Hypoksia ja kylmyys',dur:45,comment:'Koulutusopas luku 14.5'},
        {key:'pp2_human_6',title:'Ryhmädynamiikka lentopaikalla',dur:30,comment:'Koulutusopas luku 14.6'}
      ]}
    ];

    let sortOrder = 0;
    for (const sec of theorySections) {
      const secResult = await db.prepare('INSERT INTO theory_sections (level,key,title,sort_order) VALUES (?,?,?,?)')
        .run(sec.level, sec.key, sec.title, sortOrder++);
      const sectionId = secResult.lastInsertRowid;
      let topicSort = 0;
      for (const t of sec.topics) {
        await db.prepare('INSERT INTO theory_topics_def (section_id,key,title,duration_minutes,comment,sort_order) VALUES (?,?,?,?,?,?)')
          .run(sectionId, t.key, t.title, t.dur, t.comment, topicSort++);
      }
    }

    if (forceChange) {
      await db.prepare('UPDATE users SET must_change_password = 1').run();
    }

    const totalUsers = 1 + 2 + 3 + 1 + 3 + 1 + 3; // admin + 4 clubs
    const totalSites = 3 + 2 + 2 + 1;
    console.log(`Seed complete: ${totalUsers} users, 4 clubs, ${totalSites} sites, ${theorySections.length} theory sections`);
    return { message: 'Seed complete', users: totalUsers, clubs: 4, sites: totalSites, theorySections: theorySections.length };
  } catch(e) {
    console.error('Seed error:', e.message);
    throw e;
  }
}

// Seed endpoint (also available via HTTP for manual use)
app.post('/api/seed', async (req, res) => {
  try {
    const result = await seedDatabase();
    res.json(result);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Initialize database, auto-seed if empty, then start server

// One-time migration: fix double-encoded UTF-8 Finnish characters in database
async function fixDoubleEncodedUtf8() {
  const db = getDb();
  try {
    const testName = await db.prepare("SELECT name FROM users WHERE name LIKE '%\u00c3%' LIMIT 1").get();
    const testUser = await db.prepare("SELECT username FROM users WHERE username LIKE '%\u00c3%' LIMIT 1").get();
    if (!testName && !testUser) {
      return;
    }
    console.log('Fixing double-encoded UTF-8 characters in database...');
    
    const pool = db.getPool();
    
    const fixes = [
      "UPDATE users SET username = convert_from(convert_to(username, 'LATIN1'), 'UTF8') WHERE username ~ '[\u00c0-\u00ff]'",
      "UPDATE users SET name = convert_from(convert_to(name, 'LATIN1'), 'UTF8') WHERE name ~ '[\u00c0-\u00ff]'",
      "UPDATE clubs SET name = convert_from(convert_to(name, 'LATIN1'), 'UTF8') WHERE name ~ '[\u00c0-\u00ff]'",
      "UPDATE clubs SET description = convert_from(convert_to(description, 'LATIN1'), 'UTF8') WHERE description ~ '[\u00c0-\u00ff]'",
      "UPDATE sites SET name = convert_from(convert_to(name, 'LATIN1'), 'UTF8') WHERE name ~ '[\u00c0-\u00ff]'",
      "UPDATE sites SET description = convert_from(convert_to(description, 'LATIN1'), 'UTF8') WHERE description ~ '[\u00c0-\u00ff]'",
      "UPDATE curriculum_topics SET title = convert_from(convert_to(title, 'LATIN1'), 'UTF8') WHERE title ~ '[\u00c0-\u00ff]'",
      "UPDATE curriculum_topics SET comment = convert_from(convert_to(comment, 'LATIN1'), 'UTF8') WHERE comment IS NOT NULL AND comment ~ '[\u00c0-\u00ff]'",
      "UPDATE flights SET notes = convert_from(convert_to(notes, 'LATIN1'), 'UTF8') WHERE notes IS NOT NULL AND notes ~ '[\u00c0-\u00ff]'",
      "UPDATE flights SET exercises = convert_from(convert_to(exercises, 'LATIN1'), 'UTF8') WHERE exercises IS NOT NULL AND exercises ~ '[\u00c0-\u00ff]'",
      "UPDATE flights SET weather = convert_from(convert_to(weather, 'LATIN1'), 'UTF8') WHERE weather IS NOT NULL AND weather ~ '[\u00c0-\u00ff]'"
    ];
    
    for (const sql of fixes) {
      try {
        await pool.query(sql);
      } catch(e) {}
    }
    console.log('UTF-8 encoding fix applied successfully.');
  } catch(e) {
    console.error('UTF-8 fix failed (non-critical):', e.message);
  }
}

// One-time migration: fix double-encoded Finnish chars in theory tables.
// Targets rows containing `Ã` (U+00C3) — the hallmark of mis-encoded UTF-8
// interpreted as Latin-1 and re-encoded. Safe to run repeatedly because the
// filter only matches broken rows; properly encoded Finnish text is left alone.
async function fixTheoryUtf8() {
  try {
    const pool = getDb().getPool();
    const fixes = [
      "UPDATE theory_topics_def SET title   = convert_from(convert_to(title,   'LATIN1'), 'UTF8') WHERE title   LIKE '%\u00c3%'",
      "UPDATE theory_topics_def SET comment = convert_from(convert_to(comment, 'LATIN1'), 'UTF8') WHERE comment IS NOT NULL AND comment LIKE '%\u00c3%'",
      "UPDATE theory_sections   SET title   = convert_from(convert_to(title,   'LATIN1'), 'UTF8') WHERE title   LIKE '%\u00c3%'"
    ];
    for (const sql of fixes) {
      try { await pool.query(sql); } catch(e) { console.error('Theory UTF-8 fix row failed:', e.message); }
    }
  } catch(e) {
    console.error('Theory UTF-8 fix failed (non-critical):', e.message);
  }
}

// One-time migration: fix mangled dashes in theory_topics_def
// Old seed data stored `–` as the 5-codepoint sequence E2,C2,80,C2,93 (and
// `—` as …,94). Replace those with real en-/em-dashes.
async function fixTheoryDashes() {
  try {
    const pool = getDb().getPool();
    // Multiple mojibake variants observed in production data. Each pair is
    // [broken sequence, correct replacement].
    const pairs = [
      ['\u00e2\u00c2\u0080\u00c2\u0093', '\u2013'], // 5-char en-dash
      ['\u00e2\u00c2\u0080\u00c2\u0094', '\u2014'], // 5-char em-dash
      ['\u00e2\u0080\u0093',             '\u2013'], // 3-char en-dash
      ['\u00e2\u0080\u0094',             '\u2014']  // 3-char em-dash
    ];
    const fixes = [
      `UPDATE theory_topics_def SET title   = REPLACE(title,   $1, $2) WHERE title   LIKE '%' || $1 || '%'`,
      `UPDATE theory_topics_def SET comment = REPLACE(comment, $1, $2) WHERE comment LIKE '%' || $1 || '%'`,
      `UPDATE theory_sections   SET title   = REPLACE(title,   $1, $2) WHERE title   LIKE '%' || $1 || '%'`
    ];
    for (const sql of fixes) {
      for (const [bad, good] of pairs) {
        await pool.query(sql, [bad, good]);
      }
    }
  } catch(e) {
    console.error('Theory dash fix failed (non-critical):', e.message);
  }
}

initDb().then(async () => {
  // Automatically seed the database if it's empty
  try {
    await seedDatabase();
  } catch(e) {
    console.error('Auto-seed failed:', e.message);
  }

  // Migration: add is_chief column to users and club_settings table
  try {
    const db = getDb();
    const pool = db.getPool();
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_chief INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMP DEFAULT NULL`);
    await pool.query(`ALTER TABLE clubs ADD COLUMN IF NOT EXISTS contact_email TEXT DEFAULT NULL`);
    await pool.query(`ALTER TABLE clubs ADD COLUMN IF NOT EXISTS contact_phone TEXT DEFAULT NULL`);
    await pool.query(`ALTER TABLE clubs ADD COLUMN IF NOT EXISTS website TEXT DEFAULT NULL`);
    await pool.query(`ALTER TABLE clubs ADD COLUMN IF NOT EXISTS logo_path TEXT DEFAULT NULL`);
    await pool.query(`ALTER TABLE flights ADD COLUMN IF NOT EXISTS approved INTEGER DEFAULT NULL`);
    await pool.query(`ALTER TABLE flights ADD COLUMN IF NOT EXISTS approved_by INTEGER DEFAULT NULL`);
    await pool.query(`ALTER TABLE flights ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP DEFAULT NULL`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS club_settings (
        club_id INTEGER PRIMARY KEY REFERENCES clubs(id) ON DELETE CASCADE,
        require_flight_approval INTEGER DEFAULT 0
      )
    `);
    // Set first instructor per club as chief if no chief exists
    const clubs = await db.prepare('SELECT id FROM clubs').all();
    for (const club of clubs) {
      const hasChief = await db.prepare('SELECT id FROM users WHERE club_id = ? AND role = ? AND is_chief = 1').get(club.id, 'instructor');
      if (!hasChief) {
        const firstInstructor = await db.prepare('SELECT id FROM users WHERE club_id = ? AND role = ? ORDER BY id ASC LIMIT 1').get(club.id, 'instructor');
        if (firstInstructor) {
          await db.prepare('UPDATE users SET is_chief = 1 WHERE id = ?').run(firstInstructor.id);
          console.log(`Set chief instructor for club ${club.id}: user ${firstInstructor.id}`);
        }
      }
    }
    // Ensure every club has a row in club_settings
    await pool.query(`INSERT INTO club_settings (club_id) SELECT id FROM clubs WHERE id NOT IN (SELECT club_id FROM club_settings)`);
  } catch(e) {
    console.error('Chief/settings migration failed:', e.message);
  }

  // Fix any double-encoded UTF-8 characters from previous seed data
  try {
    await fixDoubleEncodedUtf8();
  } catch(e) {
    console.error('UTF-8 fix failed:', e.message);
  }

  // Fix double-encoded Finnish chars in theory tables
  try {
    await fixTheoryUtf8();
  } catch(e) {
    console.error('Theory UTF-8 fix failed:', e.message);
  }

  // Fix mangled dashes in theory topic titles
  try {
    await fixTheoryDashes();
  } catch(e) {
    console.error('Theory dash fix failed:', e.message);
  }

  // Replace real instructor emails with fictional ones (privacy)
  try {
    const db = getDb();
    const emailUpdates = [
      ['taavi.t@example.com', 'taavi@hameenkyronlentokerho.fi'],
      ['marko.s@example.com', 'marko.sorvamaa@qtec.fi'],
      ['vaiski.v@example.com', 'vaiski@flydaddy.fi'],
      ['jarno.j@example.com', 'jarno@icaros.fi'],
      ['juho.j@example.com', 'juho@airisto.fi']
    ];
    for (const [newEmail, oldEmail] of emailUpdates) {
      await db.prepare('UPDATE users SET email = ? WHERE email = ?').run(newEmail, oldEmail);
    }
    console.log('Instructor emails updated to fictional addresses');
  } catch(e) {
    console.error('Email migration failed:', e.message);
  }

  // Fix Väiski password hash
  try {
    const db = getDb();
    const vaiski = await db.prepare("SELECT id FROM users WHERE username LIKE '%iski' AND role = 'instructor' AND club_id = 2").get();
    if (vaiski) {
      const correctHash = bcrypt.hashSync('Viski123!!', 12);
      await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(correctHash, vaiski.id);
      console.log('Väiski password hash updated');
    }
  } catch(e) {
    console.error('Väiski pw fix failed:', e.message);
  }

  app.listen(PORT, () => {
    console.log(`PilottiPolku app server running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});


