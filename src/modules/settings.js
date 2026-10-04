// ═══════════════════════════════════════════════════════════
//  Settings Module
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { getDb } = require('../database/connection');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

router.use(isAuthenticated);
router.use(requireRole('super_admin'));

// Settings page
router.get('/', (req, res) => {
  const db = getDb();

  const settings = db.prepare('SELECT * FROM settings ORDER BY setting_group, id').all();
  const modules = db.prepare('SELECT * FROM modules ORDER BY sort_order').all();

  // Group settings
  const grouped = {};
  for (const s of settings) {
    if (!grouped[s.setting_group]) grouped[s.setting_group] = [];
    grouped[s.setting_group].push(s);
  }

  const groupLabels = {
    general: 'عمومی',
    sms: 'پیامک (SMS)',
    recruitment: 'استخدام',
    modules: 'ماژول‌ها'
  };

  res.render('settings/index', {
    title: 'تنظیمات',
    grouped,
    groupLabels,
    modules
  });
});

// Update settings
router.post('/', (req, res) => {
  const db = getDb();
  const updates = req.body;

  const updateStmt = db.prepare("UPDATE settings SET setting_value = ? WHERE setting_key = ?");

  const runUpdates = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      if (key.startsWith('module_')) {
        // Handle module toggle
        const slug = key.replace('module_', '');
        db.prepare('UPDATE modules SET is_enabled = ? WHERE slug = ?').run(value === 'on' ? 1 : 0, slug);
      } else {
        updateStmt.run(Array.isArray(value) ? value.join(',') : (value || ''), key);
      }
    }
  });

  runUpdates();

  db.prepare(`
    INSERT INTO activity_logs (user_id, action, module, description, ip_address) VALUES (?, 'update', 'settings', 'بروزرسانی تنظیمات', ?)
  `).run(req.session.user.id, req.ip);

  req.flash('success', 'تنظیمات با موفقیت بروزرسانی شد');
  return res.redirect('/settings');
});

// Module toggle (AJAX)
router.post('/modules/:slug/toggle', (req, res) => {
  const db = getDb();
  const module = db.prepare('SELECT * FROM modules WHERE slug = ?').get(req.params.slug);

  if (!module) {
    return res.status(404).json({ error: 'ماژول یافت نشد' });
  }

  const newState = module.is_enabled ? 0 : 1;
  db.prepare('UPDATE modules SET is_enabled = ? WHERE slug = ?').run(newState, req.params.slug);

  return res.json({ success: true, enabled: newState });
});

module.exports = router;