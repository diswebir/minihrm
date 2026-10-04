// ═══════════════════════════════════════════════════════════
//  Module Loader - Register all modules
// ═══════════════════════════════════════════════════════════

function loadModules(app) {
  const modules = [
    { path: '/install',    file: './install' },
    { path: '/',           file: './auth' },
    { path: '/',           file: './dashboard' },
    { path: '/users',      file: './users' },
    { path: '/departments', file: './departments' },
    { path: '/positions',  file: './positions' },
    { path: '/recruitment', file: './candidates' },
    { path: '/form-builder', file: './formBuilder' },
    { path: '/mbti',       file: './mbti' },
    { path: '/employees',  file: './employees' },
    { path: '/settings',   file: './settings' },
    { path: '/reports',    file: './reports' },
    { path: '/apply',      file: './publicApply' },
  ];

  for (const mod of modules) {
    try {
      const router = require(mod.file);
      app.use(mod.path, router);
    } catch (error) {
      console.error(`  ❌ Failed to load module ${mod.file}:`, error.message);
    }
  }

  console.log(`✅ ${modules.length} modules loaded`);
}

module.exports = { loadModules };