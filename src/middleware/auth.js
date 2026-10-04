// ═══════════════════════════════════════════════════════════
//  Authentication Middleware
// ═══════════════════════════════════════════════════════════

function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  req.flash('error', 'لطفاً ابتدا وارد شوید');
  return res.redirect('/login');
}

function isCandidate(req, res, next) {
  if (req.session && req.session.candidate) {
    return next();
  }
  req.flash('error', 'لطفاً ابتدا احراز هویت شوید');
  return res.redirect('/apply');
}

function isGuest(req, res, next) {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  return next();
}

function isNotInstalled(req, res, next) {
  const { getDb } = require('../database/connection');
  try {
    const db = getDb();
    const admin = db.prepare("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1").get();
    if (admin) {
      return res.redirect('/login');
    }
    return next();
  } catch (e) {
    return next();
  }
}

function isInstalled(req, res, next) {
  const { getDb } = require('../database/connection');
  try {
    const db = getDb();
    const admin = db.prepare("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1").get();
    if (!admin) {
      return res.redirect('/install');
    }
    return next();
  } catch (e) {
    return res.redirect('/install');
  }
}

module.exports = {
  isAuthenticated,
  isCandidate,
  isGuest,
  isNotInstalled,
  isInstalled
};