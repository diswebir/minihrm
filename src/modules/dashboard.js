// ═══════════════════════════════════════════════════════════
//  Dashboard Module
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { getDb } = require('../database/connection');
const { isAuthenticated } = require('../middleware/auth');

// Redirect root to dashboard
router.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  return res.redirect('/login');
});

// Dashboard
router.get('/dashboard', isAuthenticated, (req, res) => {
  const db = getDb();
  const user = req.session.user;

  // Get statistics based on role
  let stats = {};
  let recentCandidates = [];
  let recentActivities = [];

  if (['super_admin', 'hr_manager', 'hr_employee'].includes(user.role)) {
    // HR Dashboard stats
    stats.totalCandidates = db.prepare('SELECT COUNT(*) as c FROM candidates').get().c;
    stats.newCandidates = db.prepare("SELECT COUNT(*) as c FROM candidates WHERE status = 'new'").get().c;
    stats.underReview = db.prepare("SELECT COUNT(*) as c FROM candidates WHERE status = 'under_review'").get().c;
    stats.approved = db.prepare("SELECT COUNT(*) as c FROM candidates WHERE status = 'approved'").get().c;
    stats.rejected = db.prepare("SELECT COUNT(*) as c FROM candidates WHERE status = 'rejected'").get().c;
    stats.hired = db.prepare("SELECT COUNT(*) as c FROM candidates WHERE status = 'hired'").get().c;
    stats.activePositions = db.prepare('SELECT COUNT(*) as c FROM job_positions WHERE is_active = 1').get().c;
    stats.totalEmployees = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'employee'").get().c;

    // Recent candidates
    recentCandidates = db.prepare(`
      SELECT c.*, jp.title as position_title
      FROM candidates c
      LEFT JOIN job_positions jp ON c.job_position_id = jp.id
      ORDER BY c.created_at DESC LIMIT 10
    `).all();

    // Recent activities
    recentActivities = db.prepare(`
      SELECT al.*, u.first_name, u.last_name
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC LIMIT 15
    `).all();

    // Position-wise candidate count
    stats.positionStats = db.prepare(`
      SELECT jp.title, COUNT(c.id) as count
      FROM job_positions jp
      LEFT JOIN candidates c ON c.job_position_id = jp.id
      WHERE jp.is_active = 1
      GROUP BY jp.id
      ORDER BY count DESC
      LIMIT 5
    `).all();

    // Status distribution for chart
    stats.statusDistribution = db.prepare(`
      SELECT status, COUNT(*) as count FROM candidates GROUP BY status
    `).all();

  } else if (user.role === 'employee') {
    // Employee dashboard - limited stats
    stats.myProfile = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  }

  // Get modules for sidebar
  const modules = db.prepare('SELECT * FROM modules ORDER BY sort_order').all();

  res.render('dashboard/index', {
    title: 'داشبورد',
    layout: 'layouts/main',
    stats,
    recentCandidates,
    recentActivities,
    modules,
    userRole: user.role
  });
});

// Change password
router.post('/change-password', isAuthenticated, async (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  const bcrypt = require('bcryptjs');

  if (!current_password || !new_password) {
    req.flash('error', 'رمز عبور فعلی و جدید الزامی است');
    return res.redirect('/dashboard');
  }

  if (new_password !== confirm_password) {
    req.flash('error', 'رمز عبور جدید و تکرار آن مطابقت ندارند');
    return res.redirect('/dashboard');
  }

  if (new_password.length < 6) {
    req.flash('error', 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد');
    return res.redirect('/dashboard');
  }

  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);

    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) {
      req.flash('error', 'رمز عبور فعلی اشتباه است');
      return res.redirect('/dashboard');
    }

    const newHash = await bcrypt.hash(new_password, 12);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?').run(newHash, user.id);

    req.flash('success', 'رمز عبور با موفقیت تغییر کرد');
    return res.redirect('/dashboard');

  } catch (error) {
    console.error('Change password error:', error);
    req.flash('error', 'خطا در تغییر رمز عبور');
    return res.redirect('/dashboard');
  }
});

module.exports = router;