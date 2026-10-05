'use strict';
/** داشبوردهای اختصاصی نقش‌ها */
const express = require('express');
const router = express.Router();
const db = require('../db');
const helpers = require('../lib/helpers');
const permissions = require('../lib/permissions');

router.get('/', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  res.redirect('/dashboard');
});

router.get('/dashboard', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  const user = req.session.user;
  const stats = {};

  try {
    if (permissions.can(user, 'applicants.view')) {
      stats.applicantsTotal = db.prepare("SELECT COUNT(*) c FROM applicants WHERE status != 'draft'").get().c;
      stats.applicantsNew = db.prepare("SELECT COUNT(*) c FROM applicants WHERE status = 'submitted'").get().c;
      stats.applicantsInterview = db.prepare("SELECT COUNT(*) c FROM applicants WHERE status = 'interview'").get().c;
      stats.applicantsAccepted = db.prepare("SELECT COUNT(*) c FROM applicants WHERE status = 'accepted'").get().c;
      stats.positionsOpen = db.prepare("SELECT COUNT(*) c FROM positions WHERE status = 'open'").get().c;
      stats.recentApplicants = db.prepare(`
        SELECT a.*, p.title AS position_title FROM applicants a
        LEFT JOIN positions p ON p.id = a.position_id
        WHERE a.status != 'draft' ORDER BY a.id DESC LIMIT 8
      `).all();
      stats.byStatus = db.prepare("SELECT status, COUNT(*) c FROM applicants WHERE status != 'draft' GROUP BY status").all();
      // روند ۳۰ روز اخیر
      stats.trend = db.prepare(`
        SELECT date(submitted_at) AS d, COUNT(*) c FROM applicants
        WHERE submitted_at IS NOT NULL AND submitted_at >= datetime('now','-30 days')
        GROUP BY date(submitted_at) ORDER BY d
      `).all();
      // توزیع تیپ‌های شخصیتی
      if (permissions.can(user, 'mbti.view')) {
        stats.mbtiDist = db.prepare(`
          SELECT mbti_type, COUNT(*) c FROM applicants
          WHERE mbti_type != '' AND status != 'draft' GROUP BY mbti_type ORDER BY c DESC LIMIT 8
        `).all();
      }
    }
    if (user.is_super_admin || permissions.can(user, 'users.view')) {
      stats.usersTotal = db.prepare("SELECT COUNT(*) c FROM users WHERE status = 'active'").get().c;
    }
    if (user.is_super_admin) {
      stats.modulesEnabled = db.prepare('SELECT COUNT(*) c FROM modules WHERE enabled = 1 AND installed = 1').get().c;
      stats.auditRecent = db.prepare(`
        SELECT a.*, u.full_name AS user_name FROM audit_log a
        LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 6
      `).all();
    }
  } catch (e) {
    console.error('dashboard stats error:', e.message);
  }

  // پروفایل من برای کارمندان
  if (user.role_code === 'employee') {
    stats.myInfo = user;
  }

  res.render('pages/dashboard', {
    title: 'داشبورد',
    activeMenu: 'dashboard',
    stats
  });
});

module.exports = router;
