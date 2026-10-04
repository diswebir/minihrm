// ═══════════════════════════════════════════════════════════
//  MiniHRM - Main Application Entry Point
//  سامانه مدیریت منابع انسانی
// ═══════════════════════════════════════════════════════════

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const flash = require('connect-flash');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const rateLimit = require('express-rate-limit');

const { initDb } = require('./src/database/connection');
const { initDatabase } = require('./src/database/schema');
const { seedDatabase } = require('./src/database/seed');
const { loadModules } = require('./src/modules');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security & Performance ──────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(morgan('short'));

// ─── Rate Limiting ───────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// ─── Body Parsing ────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ─── Session ─────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'minihrm-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    secure: false // set to true with HTTPS
  }
}));

// ─── Flash Messages ──────────────────────────────────────
app.use(flash());

// ─── View Engine ─────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// ─── Static Files ────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Global Template Variables ───────────────────────────
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.warning = req.flash('warning');
  res.locals.info = req.flash('info');
  res.locals.currentPath = req.path;
  res.locals.baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  next();
});

// ─── Health Check ────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Load Application ────────────────────────────────────
async function startApp() {
  try {
    // Initialize sql.js engine
    console.log('📦 Initializing database engine...');
    await initDb();

    // Create tables
    console.log('🗄️  Creating tables...');
    initDatabase();

    // Seed default data
    console.log('🌱 Seeding default data...');
    seedDatabase();

    // Save database to disk
    const { closeDb } = require('./src/database/connection');
    // Save will happen automatically via setInterval

    // Load all modules
    console.log('🔌 Loading modules...');
    loadModules(app);

    // 404 Handler
    app.use((req, res) => {
      res.status(404).render('error/404', {
        title: 'صفحه یافت نشد',
        layout: req.session.user ? 'layouts/main' : 'layouts/auth'
      });
    });

    // Error Handler
    app.use((err, req, res, next) => {
      console.error('❌ Error:', err.message);
      res.status(err.status || 500).render('error/500', {
        title: 'خطای سرور',
        error: process.env.NODE_ENV === 'development' ? err : {},
        layout: req.session.user ? 'layouts/main' : 'layouts/auth'
      });
    });

    // Start server
    app.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log('╔═══════════════════════════════════════════╗');
      console.log('║       🏢 MiniHRM - سامانه منابع انسانی      ║');
      console.log('╠═══════════════════════════════════════════╣');
      console.log(`║  🌐 http://localhost:${PORT}                  ║`);
      console.log('║  📁 Database: SQLite (data/minihrm.db)    ║');
      console.log('╚═══════════════════════════════════════════╝');
      console.log('');
    });

  } catch (error) {
    console.error('💥 Failed to start application:', error);
    process.exit(1);
  }
}

startApp();

module.exports = app;