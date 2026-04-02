const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const { initDb, getDb } = require('./db');
const { logAction } = require('./audit');
const { sendPasswordReset } = require('./mailer');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-key';
const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';

// Ensure upload directory exists
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Session configuration
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

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

// Middleware: Authentication check
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Middleware: Instructor role check
const requireInstructor = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getDb();
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);

  if (!user || user.role !== 'instructor') {
    return res.status(403).json({ error: 'Instructor access required' });
  }
  next();
};

// Helper: Get user object without password
const getUserWithoutPassword = (userId) => {
  const db = getDb();
  return db.prepare('SELECT id, username, email, name, role, phone FROM users WHERE id = ?').get(userId);
};

// ============================================================================
// AUTH ROUTES
// ============================================================================

// POST /api/login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.userId = user.id;
  logAction(user.id, 'LOGIN', 'user', user.id, {});

  const safeUser = getUserWithoutPassword(user.id);
  res.json(safeUser);
});

// POST /api/logout
app.post('/api/logout', requireAuth, (req, res) => {
  const userId = req.session.userId;
  logAction(userId, 'LOGOUT', 'user', userId, {});
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ success: true });
  });
});

// GET /api/me
app.get('/api/me', requireAuth, (req, res) => {
  const user = getUserWithoutPassword(req.session.userId);
  res.json(user);
});

// POST /api/change-password
app.post('/api/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.session.userId;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const db = getDb();
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);

  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashedPassword, userId);

  logAction(userId, 'CHANGE_PASSWORD', 'user', userId, {});
  res.json({ success: true });
});

// POST /api/forgot-password
app.post('/api/forgot-password', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

  // Always return 200 to avoid revealing if email exists
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = bcrypt.hashSync(token, 10);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    db.prepare(
      'INSERT INTO password_resets (user_id, token_hash, expires_at, used) VALUES (?, ?, ?, 0)'
    ).run(user.id, hashedToken, expiresAt);

    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    sendPasswordReset(email, resetUrl);

    logAction(user.id, 'FORGOT_PASSWORD', 'user', user.id, {});
  }

  res.json({ success: true });
});

// POST /api/reset-password
app.post('/api/reset-password', (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const db = getDb();
  const now = new Date();

  const reset = db.prepare(
    'SELECT id, user_id, token_hash FROM password_resets WHERE used = 0 AND expires_at > ? ORDER BY created_at DESC LIMIT 1'
  ).get(now);

  if (!reset || !bcrypt.compareSync(token, reset.token_hash)) {
    return res.status(400).json({ error: 'Invalid or expired reset token' });
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashedPassword, reset.user_id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);

  logAction(reset.user_id, 'RESET_PASSWORD', 'user', reset.user_id, {});
  res.json({ success: true });
});

// ============================================================================
// STUDENT ROUTES
// ============================================================================

// Helper: Calculate student stats
const getStudentStats = (studentId) => {
  const db = getDb();

  const lowFlights = db.prepare(
    'SELECT COALESCE(SUM(flight_count), 0) as count FROM flights WHERE student_id = ? AND flight_type = ?'
  ).get(studentId, 'low');

  const highFlights = db.prepare(
    'SELECT COALESCE(SUM(flight_count), 0) as count FROM flights WHERE student_id = ? AND flight_type = ?'
  ).get(studentId, 'high');

  const highDays = db.prepare(
    'SELECT COUNT(DISTINCT date) as count FROM flights WHERE student_id = ? AND flight_type = ?'
  ).get(studentId, 'high');

  const totalFlights = db.prepare(
    'SELECT COALESCE(SUM(flight_count), 0) as count FROM flights WHERE student_id = ?'
  ).get(studentId);

  const lastFlight = db.prepare(
    'SELECT date FROM flights WHERE student_id = ? ORDER BY date DESC LIMIT 1'
  ).get(studentId);

  const hasApproval = db.prepare(
    'SELECT COUNT(*) as count FROM flights WHERE student_id = ? AND is_approval_flight = 1'
  ).get(studentId);

  // Theory counts
  const theoryPp1 = db.prepare(
    "SELECT COUNT(*) as count FROM theory_completions WHERE student_id = ? AND topic_key LIKE 'pp1_%'"
  ).get(studentId);

  const theoryPp2 = db.prepare(
    "SELECT COUNT(*) as count FROM theory_completions WHERE student_id = ? AND topic_key LIKE 'pp2_%'"
  ).get(studentId);

  return {
    low_flights: lowFlights.count,
    high_flights: highFlights.count,
    high_days: highDays.count,
    total_flights: totalFlights.count,
    last_flight_date: lastFlight ? lastFlight.date : null,
    has_approval: hasApproval.count > 0,
    theory_pp1: theoryPp1.count,
    theory_pp2: theoryPp2.count
  };
};

// GET /api/students
app.get('/api/students', requireAuth, requireInstructor, (req, res) => {
  const { status = 'all' } = req.query;
  const db = getDb();

  let query = 'SELECT id, username, name, email, phone, status, course_started, student_notes, created_at FROM users WHERE role = ?';
  const params = ['student'];

  if (status !== 'all') {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY name ASC';

  const students = db.prepare(query).all(...params);

  const result = students.map(student => ({
    ...student,
    ...getStudentStats(student.id)
  }));

  res.json({ students: result });
});

// POST /api/students
app.post('/api/students', requireAuth, requireInstructor, (req, res) => {
  const { name, email, phone, username, password, course_started, status } = req.body;

  if (!name || !email || !username || !password) {
    return res.status(400).json({ error: 'Name, email, username, and password required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const db = getDb();

  const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existingUser) {
    return res.status(400).json({ error: 'Username or email already exists' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  const userResult = db.prepare(
    'INSERT INTO users (username, email, name, password_hash, phone, role, status, course_started, student_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(username, email, name, hashedPassword, phone || null, 'student', status || 'ongoing', course_started || new Date().toISOString().split('T')[0], '');

  logAction(req.session.userId, 'CREATE', 'student', userResult.lastInsertRowid, { name, email });

  const student = db.prepare('SELECT * FROM users WHERE id = ?').get(userResult.lastInsertRowid);
  const stats = getStudentStats(student.id);

  res.status(201).json({ ...student, ...stats });
});

// GET /api/students/:id
app.get('/api/students/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const student = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(id, 'student');

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const stats = getStudentStats(student.id);
  res.json({ ...student, ...stats });
});

// PUT /api/students/:id
app.put('/api/students/:id', requireAuth, requireInstructor, (req, res) => {
  const { id } = req.params;
  const { name, email, phone, status, course_started, student_notes } = req.body;

  const db = getDb();
  const student = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(id, 'student');

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const updates = [];
  const values = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (email !== undefined) { updates.push('email = ?'); values.push(email); }
  if (phone !== undefined) { updates.push('phone = ?'); values.push(phone); }
  if (status !== undefined) { updates.push('status = ?'); values.push(status); }
  if (course_started !== undefined) { updates.push('course_started = ?'); values.push(course_started); }
  if (student_notes !== undefined) { updates.push('student_notes = ?'); values.push(student_notes); }

  if (updates.length > 0) {
    values.push(id);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    db.prepare(query).run(...values);
  }

  logAction(req.session.userId, 'UPDATE', 'student', id, { fields: Object.keys(req.body) });

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const stats = getStudentStats(updated.id);

  res.json({ ...updated, ...stats });
});

// DELETE /api/students/:id
app.delete('/api/students/:id', requireAuth, requireInstructor, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const student = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(id, 'student');

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);

  logAction(req.session.userId, 'DELETE', 'student', id, {});

  res.json({ success: true });
});

// ============================================================================
// FLIGHT ROUTES
// ============================================================================

// GET /api/students/:id/flights
app.get('/api/students/:id/flights', requireAuth, (req, res) => {
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

  const flights = db.prepare(query).all(...params);

  // Include student stats
  const stats = getStudentStats(id);
  res.json({ student: stats, flights });
});

// POST /api/students/:id/flights
app.post('/api/students/:id/flights', requireAuth, (req, res) => {
  const { id } = req.params;
  const { date, flight_count, flight_type, site_id, weather, exercises, notes, is_approval_flight } = req.body;

  const db = getDb();
  const student = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(id, 'student');

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  // Check authorization: instructor or student adding their own flight
  const isInstructor = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId)?.role === 'instructor';
  const isOwnFlight = parseInt(id) === req.session.userId;

  if (!isInstructor && !isOwnFlight) {
    return res.status(403).json({ error: 'You can only add flights for your own account' });
  }

  if (!date || flight_count === undefined || !flight_type) {
    return res.status(400).json({ error: 'Date, flight_count, and flight_type required' });
  }

  const result = db.prepare(`
    INSERT INTO flights (student_id, date, flight_count, flight_type, site_id, weather, exercises, notes, is_approval_flight, added_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, date, flight_count, flight_type, site_id || null, weather || null, exercises || null, notes || null, is_approval_flight ? 1 : 0, req.session.userId);

  logAction(req.session.userId, 'CREATE', 'flight', result.lastInsertRowid, { student_id: id, flight_type });

  const flight = db.prepare(`
    SELECT f.*, s.name as site_name
    FROM flights f
    LEFT JOIN sites s ON f.site_id = s.id
    WHERE f.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(flight);
});

// PUT /api/flights/:id
app.put('/api/flights/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const flight = db.prepare('SELECT * FROM flights WHERE id = ?').get(id);

  if (!flight) {
    return res.status(404).json({ error: 'Flight not found' });
  }

  // Check authorization: instructor or student editing their own flight
  const student = db.prepare('SELECT id FROM users WHERE id = ?').get(flight.student_id);
  const isInstructor = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId)?.role === 'instructor';
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
    db.prepare(query).run(...values);
  }

  logAction(req.session.userId, 'UPDATE', 'flight', id, { fields: Object.keys(req.body) });

  const updated = db.prepare(`
    SELECT f.*, s.name as site_name
    FROM flights f
    LEFT JOIN sites s ON f.site_id = s.id
    WHERE f.id = ?
  `).get(id);

  res.json(updated);
});

// DELETE /api/flights/:id
app.delete('/api/flights/:id', requireAuth, requireInstructor, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const flight = db.prepare('SELECT * FROM flights WHERE id = ?').get(id);

  if (!flight) {
    return res.status(404).json({ error: 'Flight not found' });
  }

  db.prepare('DELETE FROM flights WHERE id = ?').run(id);

  logAction(req.session.userId, 'DELETE', 'flight', id, {});

  res.json({ success: true });
});

// ============================================================================
// THEORY ROUTES
// ============================================================================

// GET /api/students/:id/theory
app.get('/api/students/:id/theory', requireAuth, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const completions = db.prepare(
    'SELECT topic_key FROM theory_completions WHERE student_id = ?'
  ).all(id);

  res.json({ completions: completions.map(c => c.topic_key) });
});

// POST /api/students/:id/theory
app.post('/api/students/:id/theory', requireAuth, requireInstructor, (req, res) => {
  const { id } = req.params;
  const { topic_key } = req.body;

  if (!topic_key) {
    return res.status(400).json({ error: 'topic_key required' });
  }

  const db = getDb();

  db.prepare(
    'INSERT OR IGNORE INTO theory_completions (student_id, topic_key, completed_by) VALUES (?, ?, ?)'
  ).run(id, topic_key, req.session.userId);

  logAction(req.session.userId, 'CREATE', 'theory_completion', id, { topic_key });

  res.json({ success: true });
});

// DELETE /api/students/:id/theory/:topic_key
app.delete('/api/students/:id/theory/:topic_key', requireAuth, requireInstructor, (req, res) => {
  const { id, topic_key } = req.params;
  const db = getDb();

  db.prepare(
    'DELETE FROM theory_completions WHERE student_id = ? AND topic_key = ?'
  ).run(id, topic_key);

  logAction(req.session.userId, 'DELETE', 'theory_completion', id, { topic_key });

  res.json({ success: true });
});

// ============================================================================
// THEORY MANAGEMENT ROUTES (dynamic sections & topics)
// ============================================================================

// GET /api/theory/structure — returns full structure for frontend
app.get('/api/theory/structure', requireAuth, (req, res) => {
  const db = getDb();

  const sections = db.prepare(
    'SELECT * FROM theory_sections ORDER BY level, sort_order'
  ).all();

  const topics = db.prepare(
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

// GET /api/theory/sections — list all sections
app.get('/api/theory/sections', requireAuth, requireInstructor, (req, res) => {
  const db = getDb();
  const sections = db.prepare(
    'SELECT * FROM theory_sections ORDER BY level, sort_order'
  ).all();
  res.json({ sections });
});

// POST /api/theory/sections — create a new section
app.post('/api/theory/sections', requireAuth, requireInstructor, (req, res) => {
  const { level, key, title } = req.body;
  if (!level || !key || !title) {
    return res.status(400).json({ error: 'level, key, and title are required' });
  }
  if (!['pp1', 'pp2'].includes(level)) {
    return res.status(400).json({ error: 'level must be pp1 or pp2' });
  }

  const db = getDb();

  // Get next sort_order for this level
  const maxOrder = db.prepare(
    'SELECT MAX(sort_order) as max_order FROM theory_sections WHERE level = ?'
  ).get(level);
  const sortOrder = (maxOrder && maxOrder.max_order != null) ? maxOrder.max_order + 1 : 0;

  try {
    const result = db.prepare(
      'INSERT INTO theory_sections (level, key, title, sort_order) VALUES (?, ?, ?, ?)'
    ).run(level, key, title, sortOrder);

    logAction(req.session.userId, 'CREATE', 'theory_section', result.lastInsertRowid, { level, key, title });
    res.json({ id: result.lastInsertRowid, level, key, title, sort_order: sortOrder });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Section key already exists' });
    }
    throw e;
  }
});

// PUT /api/theory/sections/:id — update a section
app.put('/api/theory/sections/:id', requireAuth, requireInstructor, (req, res) => {
  const { id } = req.params;
  const { title, sort_order } = req.body;
  const db = getDb();

  const section = db.prepare('SELECT * FROM theory_sections WHERE id = ?').get(id);
  if (!section) return res.status(404).json({ error: 'Section not found' });

  const newTitle = title !== undefined ? title : section.title;
  const newOrder = sort_order !== undefined ? sort_order : section.sort_order;

  db.prepare(
    'UPDATE theory_sections SET title = ?, sort_order = ? WHERE id = ?'
  ).run(newTitle, newOrder, id);

  logAction(req.session.userId, 'UPDATE', 'theory_section', id, { title: newTitle });
  res.json({ success: true });
});

// DELETE /api/theory/sections/:id — delete a section (only if no topics)
app.delete('/api/theory/sections/:id', requireAuth, requireInstructor, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const topicCount = db.prepare(
    'SELECT COUNT(*) as count FROM theory_topics_def WHERE section_id = ?'
  ).get(id);

  if (topicCount.count > 0) {
    return res.status(400).json({ error: `Aihealueella on ${topicCount.count} aihetta. Poista ensin aiheet.` });
  }

  db.prepare('DELETE FROM theory_sections WHERE id = ?').run(id);
  logAction(req.session.userId, 'DELETE', 'theory_section', id, {});
  res.json({ success: true });
});

// POST /api/theory/sections/:id/topics — create a topic in a section
app.post('/api/theory/sections/:sectionId/topics', requireAuth, requireInstructor, (req, res) => {
  const { sectionId } = req.params;
  const { key, title, duration_minutes, comment } = req.body;

  if (!key || !title) {
    return res.status(400).json({ error: 'key and title are required' });
  }

  const db = getDb();

  const section = db.prepare('SELECT * FROM theory_sections WHERE id = ?').get(sectionId);
  if (!section) return res.status(404).json({ error: 'Section not found' });

  const maxOrder = db.prepare(
    'SELECT MAX(sort_order) as max_order FROM theory_topics_def WHERE section_id = ?'
  ).get(sectionId);
  const sortOrder = (maxOrder && maxOrder.max_order != null) ? maxOrder.max_order + 1 : 0;

  try {
    const result = db.prepare(
      'INSERT INTO theory_topics_def (section_id, key, title, duration_minutes, comment, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(sectionId, key, title, duration_minutes || 45, comment || null, sortOrder);

    logAction(req.session.userId, 'CREATE', 'theory_topic', result.lastInsertRowid, { key, title, sectionId });
    res.json({ id: result.lastInsertRowid, key, title, duration_minutes: duration_minutes || 45, comment: comment || null, sort_order: sortOrder });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Topic key already exists' });
    }
    throw e;
  }
});

// PUT /api/theory/topics/:id — update a topic
app.put('/api/theory/topics/:id', requireAuth, requireInstructor, (req, res) => {
  const { id } = req.params;
  const { title, duration_minutes, comment, sort_order } = req.body;
  const db = getDb();

  const topic = db.prepare('SELECT * FROM theory_topics_def WHERE id = ?').get(id);
  if (!topic) return res.status(404).json({ error: 'Topic not found' });

  const newTitle = title !== undefined ? title : topic.title;
  const newDuration = duration_minutes !== undefined ? duration_minutes : topic.duration_minutes;
  const newComment = comment !== undefined ? comment : topic.comment;
  const newOrder = sort_order !== undefined ? sort_order : topic.sort_order;

  db.prepare(
    'UPDATE theory_topics_def SET title = ?, duration_minutes = ?, comment = ?, sort_order = ? WHERE id = ?'
  ).run(newTitle, newDuration, newComment, newOrder, id);

  logAction(req.session.userId, 'UPDATE', 'theory_topic', id, { title: newTitle, duration_minutes: newDuration });
  res.json({ success: true });
});

// DELETE /api/theory/topics/:id — delete a topic (only if no completions)
app.delete('/api/theory/topics/:id', requireAuth, requireInstructor, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const topic = db.prepare('SELECT * FROM theory_topics_def WHERE id = ?').get(id);
  if (!topic) return res.status(404).json({ error: 'Topic not found' });

  const completions = db.prepare(
    'SELECT COUNT(*) as count FROM theory_completions WHERE topic_key = ?'
  ).get(topic.key);

  if (completions.count > 0) {
    return res.status(400).json({ error: `Aiheella on ${completions.count} suoritusta. Poista ensin suoritukset.` });
  }

  db.prepare('DELETE FROM theory_topics_def WHERE id = ?').run(id);
  logAction(req.session.userId, 'DELETE', 'theory_topic', id, { key: topic.key });
  res.json({ success: true });
});

// ============================================================================
// LESSON ROUTES
// ============================================================================

// GET /api/lessons
app.get('/api/lessons', requireAuth, requireInstructor, (req, res) => {
  const db = getDb();

  const lessons = db.prepare(`
    SELECT
      l.*,
      COUNT(DISTINCT ls.student_id) as student_count,
      COUNT(DISTINCT lt.topic_key) as topic_count
    FROM lessons l
    LEFT JOIN lesson_students ls ON l.id = ls.lesson_id
    LEFT JOIN lesson_topics lt ON l.id = lt.lesson_id
    GROUP BY l.id
    ORDER BY l.date DESC
  `).all();

  // Add instructor name
  const lessonsWithNames = lessons.map(l => {
    const instructor = db.prepare('SELECT name FROM users WHERE id = ?').get(l.instructor_id);
    return { ...l, instructor_name: instructor ? instructor.name : '' };
  });

  res.json({ lessons: lessonsWithNames });
});

// POST /api/lessons
app.post('/api/lessons', requireAuth, requireInstructor, (req, res) => {
  const { date, topic_keys = [], student_ids = [], notes } = req.body;

  if (!date) {
    return res.status(400).json({ error: 'Date required' });
  }

  const db = getDb();

  try {
    const transaction = db.transaction(() => {
      const lessonResult = db.prepare(
        'INSERT INTO lessons (date, instructor_id, notes) VALUES (?, ?, ?)'
      ).run(date, req.session.userId, notes || null);

      const lessonId = lessonResult.lastInsertRowid;

      for (const studentId of student_ids) {
        db.prepare('INSERT INTO lesson_students (lesson_id, student_id) VALUES (?, ?)').run(lessonId, studentId);
      }

      for (const topicKey of topic_keys) {
        db.prepare('INSERT INTO lesson_topics (lesson_id, topic_key) VALUES (?, ?)').run(lessonId, topicKey);

        // Mark theory completions for all students in this lesson
        for (const studentId of student_ids) {
          db.prepare(
            'INSERT OR IGNORE INTO theory_completions (student_id, topic_key, completed_by, lesson_id) VALUES (?, ?, ?, ?)'
          ).run(studentId, topicKey, req.session.userId, lessonId);
        }
      }

      return lessonId;
    });

    const lessonId = transaction();

    logAction(req.session.userId, 'CREATE', 'lesson', lessonId, {
      student_count: student_ids.length,
      topic_count: topic_keys.length
    });

    const lesson = db.prepare(`
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
    res.status(500).json({ error: error.message });
  }
});

// GET /api/lessons/:id
app.get('/api/lessons/:id', requireAuth, requireInstructor, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(id);

  if (!lesson) {
    return res.status(404).json({ error: 'Lesson not found' });
  }

  const studentRows = db.prepare('SELECT student_id FROM lesson_students WHERE lesson_id = ?').all(id);
  const topics = db.prepare('SELECT topic_key FROM lesson_topics WHERE lesson_id = ?').all(id);

  // Get student names
  const studentNames = studentRows.map(s => {
    const u = db.prepare('SELECT name FROM users WHERE id = ?').get(s.student_id);
    return u ? u.name : 'Tuntematon';
  });

  // Get instructor name
  const instructor = db.prepare('SELECT name FROM users WHERE id = ?').get(lesson.instructor_id);

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
app.put('/api/lessons/:id', requireAuth, requireInstructor, (req, res) => {
  const { id } = req.params;
  const { date, notes, student_ids = [], topic_keys = [] } = req.body;

  const db = getDb();
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(id);

  if (!lesson) {
    return res.status(404).json({ error: 'Lesson not found' });
  }

  try {
    const transaction = db.transaction(() => {
      if (date !== undefined || notes !== undefined) {
        const updates = [];
        const values = [];
        if (date !== undefined) { updates.push('date = ?'); values.push(date); }
        if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }
        values.push(id);
        const query = `UPDATE lessons SET ${updates.join(', ')} WHERE id = ?`;
        db.prepare(query).run(...values);
      }

      // Update lesson_students
      db.prepare('DELETE FROM lesson_students WHERE lesson_id = ?').run(id);
      for (const studentId of student_ids) {
        db.prepare('INSERT INTO lesson_students (lesson_id, student_id) VALUES (?, ?)').run(id, studentId);
      }

      // Update lesson_topics and theory_completions
      db.prepare('DELETE FROM lesson_topics WHERE lesson_id = ?').run(id);
      db.prepare('UPDATE theory_completions SET lesson_id = NULL WHERE lesson_id = ?').run(id);

      for (const topicKey of topic_keys) {
        db.prepare('INSERT INTO lesson_topics (lesson_id, topic_key) VALUES (?, ?)').run(id, topicKey);

        for (const studentId of student_ids) {
          db.prepare(
            'INSERT OR IGNORE INTO theory_completions (student_id, topic_key, lesson_id) VALUES (?, ?, ?)'
          ).run(studentId, topicKey, id);
        }
      }
    });

    transaction();

    logAction(req.session.userId, 'UPDATE', 'lesson', id, {
      fields: Object.keys(req.body)
    });

    const updated = db.prepare(`
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
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/lessons/:id
app.delete('/api/lessons/:id', requireAuth, requireInstructor, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(id);

  if (!lesson) {
    return res.status(404).json({ error: 'Lesson not found' });
  }

  db.prepare('DELETE FROM lessons WHERE id = ?').run(id);

  logAction(req.session.userId, 'DELETE', 'lesson', id, {});

  res.json({ success: true });
});

// ============================================================================
// SITE ROUTES
// ============================================================================

// GET /api/sites
app.get('/api/sites', requireAuth, (req, res) => {
  const db = getDb();
  const sites = db.prepare('SELECT * FROM sites ORDER BY name ASC').all();
  res.json({ sites });
});

// POST /api/sites
app.post('/api/sites', requireAuth, requireInstructor, (req, res) => {
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name required' });
  }

  const db = getDb();
  const result = db.prepare('INSERT INTO sites (name, description) VALUES (?, ?)').run(name, description || null);

  logAction(req.session.userId, 'CREATE', 'site', result.lastInsertRowid, { name });

  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(site);
});

// PUT /api/sites/:id
app.put('/api/sites/:id', requireAuth, requireInstructor, (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  const db = getDb();
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(id);

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
    db.prepare(query).run(...values);
  }

  logAction(req.session.userId, 'UPDATE', 'site', id, { fields: Object.keys(req.body) });

  const updated = db.prepare('SELECT * FROM sites WHERE id = ?').get(id);
  res.json(updated);
});

// DELETE /api/sites/:id
app.delete('/api/sites/:id', requireAuth, requireInstructor, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(id);

  if (!site) {
    return res.status(404).json({ error: 'Site not found' });
  }

  const flightCount = db.prepare('SELECT COUNT(*) as count FROM flights WHERE site_id = ?').get(id);

  if (flightCount.count > 0) {
    return res.status(400).json({ error: 'Cannot delete site with flights' });
  }

  db.prepare('DELETE FROM sites WHERE id = ?').run(id);

  logAction(req.session.userId, 'DELETE', 'site', id, {});

  res.json({ success: true });
});

// ============================================================================
// ATTACHMENT ROUTES
// ============================================================================

// GET /api/students/:id/attachments
app.get('/api/students/:id/attachments', requireAuth, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const attachments = db.prepare(
    'SELECT id, student_id, filename, stored_name, size_bytes, mimetype, created_at FROM attachments WHERE student_id = ?'
  ).all(id);

  res.json({ attachments });
});

// POST /api/students/:id/attachments
app.post('/api/students/:id/attachments', requireAuth, requireInstructor, upload.single('file'), (req, res) => {
  const { id } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: 'File required' });
  }

  const db = getDb();
  const student = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(id, 'student');

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const result = db.prepare(
    'INSERT INTO attachments (student_id, filename, stored_name, mimetype, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.session.userId);

  logAction(req.session.userId, 'CREATE', 'attachment', result.lastInsertRowid, {
    student_id: id,
    filename: req.file.originalname
  });

  const attachment = db.prepare(
    'SELECT id, student_id, filename, stored_name, created_at FROM attachments WHERE id = ?'
  ).get(result.lastInsertRowid);

  res.status(201).json(attachment);
});

// GET /api/attachments/:id/download
app.get('/api/attachments/:id/download', requireAuth, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);

  if (!attachment) {
    return res.status(404).json({ error: 'Attachment not found' });
  }

  const filepath = path.join(UPLOAD_DIR, attachment.stored_name);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  logAction(req.session.userId, 'READ', 'attachment', id, { filename: attachment.filename });

  res.download(filepath, attachment.filename);
});

// DELETE /api/attachments/:id
app.delete('/api/attachments/:id', requireAuth, requireInstructor, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);

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

  db.prepare('DELETE FROM attachments WHERE id = ?').run(id);

  logAction(req.session.userId, 'DELETE', 'attachment', id, {});

  res.json({ success: true });
});

// ============================================================================
// INSTRUCTOR ROUTES
// ============================================================================

// GET /api/instructors
app.get('/api/instructors', requireAuth, requireInstructor, (req, res) => {
  const db = getDb();
  const instructors = db.prepare(
    'SELECT id, username, email, name, phone FROM users WHERE role = ?'
  ).all('instructor');

  res.json({ instructors });
});

// POST /api/instructors
app.post('/api/instructors', requireAuth, requireInstructor, (req, res) => {
  const { name, email, phone, username, password } = req.body;

  if (!name || !email || !username || !password) {
    return res.status(400).json({ error: 'Name, email, username, and password required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const db = getDb();

  const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existingUser) {
    return res.status(400).json({ error: 'Username or email already exists' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  const result = db.prepare(
    'INSERT INTO users (username, email, name, password_hash, phone, role) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(username, email, name, hashedPassword, phone || null, 'instructor');

  logAction(req.session.userId, 'CREATE', 'instructor', result.lastInsertRowid, { name, email });

  const instructor = db.prepare(
    'SELECT id, username, email, name, phone FROM users WHERE id = ?'
  ).get(result.lastInsertRowid);

  res.status(201).json(instructor);
});

// DELETE /api/instructors/:id
app.delete('/api/instructors/:id', requireAuth, requireInstructor, (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId;

  if (id == userId) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  const db = getDb();
  const instructor = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(id, 'instructor');

  if (!instructor) {
    return res.status(404).json({ error: 'Instructor not found' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);

  logAction(req.session.userId, 'DELETE', 'instructor', id, {});

  res.json({ success: true });
});

// ============================================================================
// DASHBOARD ROUTE
// ============================================================================

// GET /api/dashboard
app.get('/api/dashboard', requireAuth, requireInstructor, (req, res) => {
  const db = getDb();

  // Count stats
  const activeStudents = db.prepare(
    'SELECT COUNT(*) as count FROM users WHERE role = ? AND status = ?'
  ).get('student', 'ongoing');

  const graduatedStudents = db.prepare(
    "SELECT COUNT(*) as count FROM users WHERE role = 'student' AND status IN ('approved_pp2', 'graduated')"
  ).get();

  const totalFlights = db.prepare(
    'SELECT COALESCE(SUM(flight_count), 0) as count FROM flights'
  ).get();

  const totalLessons = db.prepare(
    'SELECT COUNT(*) as count FROM lessons'
  ).get();

  // Active students with stats and last_flight_date
  const students = db.prepare(`
    SELECT u.*
    FROM users u
    WHERE u.role = 'student' AND u.status = 'ongoing'
    ORDER BY u.name ASC
  `).all();

  const studentsWithStats = students.map(student => ({
    ...student,
    ...getStudentStats(student.id)
  }));

  // Recent events (10 latest audit_log entries)
  const events = db.prepare(`
    SELECT al.*, u.name as user_name
    FROM audit_log al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.timestamp DESC
    LIMIT 10
  `).all();

  // Inactive warnings (students with no flight in 30+ days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const inactiveWarnings = db.prepare(`
    SELECT u.id, u.name, u.email, u.status,
      (SELECT MAX(date) FROM flights WHERE student_id = u.id) as last_flight_date
    FROM users u
    WHERE u.role = 'student' AND u.status = 'ongoing'
    AND (
      (SELECT MAX(date) FROM flights WHERE student_id = u.id) IS NULL
      OR (SELECT MAX(date) FROM flights WHERE student_id = u.id) < ?
    )
  `).all(thirtyDaysAgo);

  res.json({
    stats: {
      active_students: activeStudents.count,
      graduated_students: graduatedStudents.count,
      total_flights: totalFlights.count,
      total_lessons: totalLessons.count
    },
    students: studentsWithStats,
    recent_events: events,
    inactive_warnings: inactiveWarnings
  });
});

// ============================================================================
// AUDIT LOG ROUTE
// ============================================================================

// GET /api/audit-log
app.get('/api/audit-log', requireAuth, requireInstructor, (req, res) => {
  const { user_id, entity_type, from, to, limit = 100 } = req.query;

  const db = getDb();

  let query = 'SELECT al.*, u.name as user_name FROM audit_log al LEFT JOIN users u ON al.user_id = u.id WHERE 1=1';
  const params = [];

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

  const logs = db.prepare(query).all(...params);
  res.json({ events: logs });
});

// ============================================================================
// ERROR HANDLING & SERVER START
// ============================================================================

app.use((err, req, res, next) => {
  console.error('Error:', err);

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

// Temporary seed endpoint (remove after first use)
app.post('/api/seed', async (req, res) => {
  try {
    const db = getDb();
    const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    if (userCount > 0) return res.json({ message: 'Already seeded', userCount });

    const hash = (pw) => bcrypt.hashSync(pw, 12);

    db.prepare(`INSERT INTO users (username,password_hash,role,name,email,phone) VALUES (?,?,?,?,?,?)`)
      .run('ohjaaja', hash('ohjaaja123'), 'instructor', 'Matti Meikäläinen', 'matti@lentokerho.net', '040-1234567');
    db.prepare(`INSERT INTO users (username,password_hash,role,name,email,phone) VALUES (?,?,?,?,?,?)`)
      .run('ohjaaja2', hash('ohjaaja123'), 'instructor', 'Liisa Lennonopettaja', 'liisa@lentokerho.net', '050-7654321');

    db.prepare(`INSERT INTO users (username,password_hash,role,name,email,phone,status,course_started) VALUES (?,?,?,?,?,?,?,?)`)
      .run('oppilas1', hash('oppilas123'), 'student', 'Pekka Pilotti', 'pekka@example.com', '044-1111111', 'ongoing', '2026-01-15');
    db.prepare(`INSERT INTO users (username,password_hash,role,name,email,phone,status,course_started) VALUES (?,?,?,?,?,?,?,?)`)
      .run('oppilas2', hash('oppilas123'), 'student', 'Anna Aloittelija', 'anna@example.com', '044-2222222', 'ongoing', '2026-02-01');
    db.prepare(`INSERT INTO users (username,password_hash,role,name,email,phone,status,course_started) VALUES (?,?,?,?,?,?,?,?)`)
      .run('oppilas3', hash('oppilas123'), 'student', 'Kalle Korkealentäjä', 'kalle@example.com', '044-3333333', 'ongoing', '2025-06-01');

    db.prepare(`INSERT INTO sites (name,description) VALUES (?,?)`).run('Hämeenkyrön lentokenttä', 'EFHM, pääkenttä');
    db.prepare(`INSERT INTO sites (name,description) VALUES (?,?)`).run('Viljakkala', 'Harjoittelurinne');
    db.prepare(`INSERT INTO sites (name,description) VALUES (?,?)`).run('Särkänniemi tandem', 'Tandem-lentopaikka');

    // Seed theory sections and topics
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
      const secResult = db.prepare('INSERT INTO theory_sections (level,key,title,sort_order) VALUES (?,?,?,?)')
        .run(sec.level, sec.key, sec.title, sortOrder++);
      const sectionId = secResult.lastInsertRowid;
      let topicSort = 0;
      for (const t of sec.topics) {
        db.prepare('INSERT INTO theory_topics_def (section_id,key,title,duration_minutes,comment,sort_order) VALUES (?,?,?,?,?,?)')
          .run(sectionId, t.key, t.title, t.dur, t.comment, topicSort++);
      }
    }

    res.json({ message: 'Seed complete', users: 5, sites: 3, theorySections: theorySections.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Initialize database then start server
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Lentokerho app server running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
