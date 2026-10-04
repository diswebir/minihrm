// ═══════════════════════════════════════════════════════════
//  Reports Module
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { getDb } = require('../database/connection');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { moduleGuard } = require('../middleware/moduleGuard');

router.use(isAuthenticated);
router.use(moduleGuard('reports'));

// Reports dashboard
router.get('/', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();

  // Recruitment stats
  const recruitmentStats = {
    total: db.prepare('SELECT COUNT(*) as c FROM candidates').get().c,
    byStatus: db.prepare(`
      SELECT status, COUNT(*) as count FROM candidates GROUP BY status ORDER BY count DESC
    `).all(),
    byPosition: db.prepare(`
      SELECT jp.title, COUNT(c.id) as count
      FROM job_positions jp
      LEFT JOIN candidates c ON c.job_position_id = jp.id
      WHERE jp.is_active = 1
      GROUP BY jp.id ORDER BY count DESC
    `).all(),
    bySource: db.prepare(`
      SELECT source, COUNT(*) as count FROM candidates GROUP BY source
    `).all(),
    byMonth: db.prepare(`
      SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count
      FROM candidates
      GROUP BY month
      ORDER BY month DESC
      LIMIT 12
    `).all(),
  };

  // MBTI stats
  const mbtiStats = {
    completed: db.prepare('SELECT COUNT(*) as c FROM candidates WHERE mbti_completed = 1').get().c,
    byType: db.prepare(`
      SELECT mbti_type, COUNT(*) as count
      FROM candidates
      WHERE mbti_completed = 1 AND mbti_type != ''
      GROUP BY mbti_type ORDER BY count DESC
    `).all(),
  };

  // Conversion funnel
  const funnel = {
    scanned: db.prepare('SELECT SUM(scan_count) as c FROM qr_codes').get().c || 0,
    started: db.prepare("SELECT COUNT(*) as c FROM candidates WHERE status != 'new'").get().c,
    completed: db.prepare('SELECT COUNT(*) as c FROM candidates WHERE form_completed = 1').get().c,
    mbtiDone: mbtiStats.completed,
    approved: db.prepare("SELECT COUNT(*) as c FROM candidates WHERE status = 'approved'").get().c,
    hired: db.prepare("SELECT COUNT(*) as c FROM candidates WHERE status = 'hired'").get().c,
  };

  // Activity stats
  const activityStats = {
    recentLogs: db.prepare(`
      SELECT al.*, u.first_name || ' ' || u.last_name as user_name
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC LIMIT 20
    `).all(),
  };

  res.render('reports/index', {
    title: 'گزارشات',
    recruitmentStats,
    mbtiStats,
    funnel,
    activityStats
  });
});

module.exports = router;