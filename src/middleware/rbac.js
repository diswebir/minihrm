// ═══════════════════════════════════════════════════════════
//  Role-Based Access Control Middleware
// ═══════════════════════════════════════════════════════════

// Role hierarchy (higher number = more access)
const ROLE_HIERARCHY = {
  super_admin: 100,
  hr_manager: 80,
  hr_employee: 60,
  employee: 40
};

// Module access map
const MODULE_ACCESS = {
  users: ['super_admin', 'hr_manager'],
  departments: ['super_admin', 'hr_manager'],
  positions: ['super_admin', 'hr_manager', 'hr_employee'],
  recruitment: ['super_admin', 'hr_manager', 'hr_employee'],
  form_builder: ['super_admin', 'hr_manager', 'hr_employee'],
  mbti: ['super_admin', 'hr_manager', 'hr_employee'],
  employees: ['super_admin', 'hr_manager', 'hr_employee', 'employee'],
  reports: ['super_admin', 'hr_manager', 'hr_employee'],
  settings: ['super_admin'],
};

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      req.flash('error', 'لطفاً ابتدا وارد شوید');
      return res.redirect('/login');
    }

    const userRole = req.session.user.role;
    if (roles.includes(userRole)) {
      return next();
    }

    req.flash('error', 'شما دسترسی به این بخش را ندارید');
    return res.redirect('/dashboard');
  };
}

function requireMinRole(minRole) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      req.flash('error', 'لطفاً ابتدا وارد شوید');
      return res.redirect('/login');
    }

    const userLevel = ROLE_HIERARCHY[req.session.user.role] || 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] || 0;

    if (userLevel >= requiredLevel) {
      return next();
    }

    req.flash('error', 'سطح دسترسی شما برای این بخش کافی نیست');
    return res.redirect('/dashboard');
  };
}

function canAccessModule(moduleSlug) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      req.flash('error', 'لطفاً ابتدا وارد شوید');
      return res.redirect('/login');
    }

    const userRole = req.session.user.role;
    const allowedRoles = MODULE_ACCESS[moduleSlug];

    if (!allowedRoles || !allowedRoles.includes(userRole)) {
      req.flash('error', 'شما دسترسی به این ماژول را ندارید');
      return res.redirect('/dashboard');
    }

    next();
  };
}

module.exports = {
  requireRole,
  requireMinRole,
  canAccessModule,
  ROLE_HIERARCHY,
  MODULE_ACCESS
};