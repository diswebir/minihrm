// ═══════════════════════════════════════════════════════════
//  Module Guard Middleware - Check if module is enabled
// ═══════════════════════════════════════════════════════════

const { getDb } = require('../database/connection');

function moduleGuard(moduleSlug) {
  return (req, res, next) => {
    try {
      const db = getDb();
      const module = db.prepare('SELECT is_enabled FROM modules WHERE slug = ?').get(moduleSlug);

      if (!module) {
        return next(); // Module not found, proceed (might be a non-module route)
      }

      if (!module.is_enabled) {
        // Super admin can still access for management
        if (req.session.user && req.session.user.role === 'super_admin') {
          req.moduleDisabled = true;
          return next();
        }

        req.flash('warning', 'این ماژول در حال حاضر غیرفعال است');
        return res.redirect('/dashboard');
      }

      next();
    } catch (error) {
      console.error('Module guard error:', error);
      next();
    }
  };
}

module.exports = { moduleGuard };