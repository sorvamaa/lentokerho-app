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
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Rate limiting — login endpoint (5 attempts per 15 minutes)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Liian monta kirjautumisyritystä. Yritä uudelleen 15 minuutin kuluttua.' },
  standardHeaders: true,
  legacyHeaders: false,
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
app.use(express.json());
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

// Middleware: Authentication check
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};
