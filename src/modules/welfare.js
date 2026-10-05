// ═══════════════════════════════════════════════════════════
//  Welfare Module - Transportation, Kitchen, Security
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { getDb } = require('../database/connection');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { moduleGuard } = require('../middleware/moduleGuard');

router.use(isAuthenticated);
router.use(moduleGuard('welfare'));

// ─── Welfare Dashboard ───────────────────────────────────
router.get('/', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();
  const stats = {
    vehicles: db.prepare('SELECT COUNT(*) as c FROM transport_vehicles WHERE is_active = 1').get().c,
    passengers: db.prepare('SELECT COUNT(*) as c FROM transport_assignments WHERE is_active = 1').get().c,
    menuItems: db.prepare('SELECT COUNT(*) as c FROM kitchen_menus WHERE is_active = 1').get().c,
    securityShifts: db.prepare('SELECT COUNT(*) as c FROM security_shifts WHERE is_active = 1').get().c,
  };
  res.render('welfare/index', { title: 'رفاهیات', stats });
});

// ═══════════ TRANSPORTATION ═══════════════════════════════
router.get('/transport', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();
  const vehicles = db.prepare(`
    SELECT tv.*, (SELECT COUNT(*) FROM transport_assignments WHERE vehicle_id = tv.id AND is_active = 1) as passenger_count
    FROM transport_vehicles tv WHERE tv.is_active = 1 ORDER BY tv.route_name
  `).all();
  res.render('welfare/transport', { title: 'ایاب و ذهاب - ناوگان', vehicles });
});

router.post('/transport/vehicle', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { vehicle_type, plate_number, model, capacity, driver_name, driver_phone, route_name, route_description, notes } = req.body;
  const db = getDb();
  db.prepare(`
    INSERT INTO transport_vehicles (vehicle_type, plate_number, model, capacity, driver_name, driver_phone, route_name, route_description, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(vehicle_type || 'van', plate_number, model || '', parseInt(capacity) || 10, driver_name || '', driver_phone || '', route_name || '', route_description || '', notes || '');
  req.flash('success', 'وسیله نقلیه اضافه شد');
  res.redirect('/welfare/transport');
});

router.get('/transport/:id', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();
  const vehicle = db.prepare('SELECT * FROM transport_vehicles WHERE id = ?').get(req.params.id);
  if (!vehicle) { req.flash('error', 'وسیله یافت نشد'); return res.redirect('/welfare/transport'); }
  const passengers = db.prepare(`
    SELECT ta.*, u.first_name, u.last_name FROM transport_assignments ta
    JOIN users u ON ta.user_id = u.id WHERE ta.vehicle_id = ? AND ta.is_active = 1
  `).all(req.params.id);
  const employees = db.prepare("SELECT id, first_name, last_name FROM users WHERE is_active = 1 AND id NOT IN (SELECT user_id FROM transport_assignments WHERE vehicle_id = ? AND is_active = 1)").all(req.params.id);
  res.render('welfare/vehicle-detail', { title: `مسیر: ${vehicle.route_name || vehicle.plate_number}`, vehicle, passengers, employees });
});

router.post('/transport/:id/assign', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { user_ids, pickup_point, pickup_time, shift_type } = req.body;
  const db = getDb();
  const ids = Array.isArray(user_ids) ? user_ids : [user_ids];
  const upsert = db.prepare(`
    INSERT INTO transport_assignments (vehicle_id, user_id, pickup_point, pickup_time, shift_type)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(vehicle_id, user_id) DO UPDATE SET pickup_point=?, pickup_time=?, shift_type=?
  `);
  const assignAll = db.transaction(() => {
    for (const uid of ids) {
      if (uid) upsert.run(req.params.id, parseInt(uid), pickup_point || '', pickup_time || '', shift_type || 'morning', pickup_point || '', pickup_time || '', shift_type || 'morning');
    }
  });
  assignAll();
  req.flash('success', 'مسافران اختصاص داده شدند');
  res.redirect(`/welfare/transport/${req.params.id}`);
});

router.post('/transport/:vehicleId/remove/:userId', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  db.prepare('UPDATE transport_assignments SET is_active = 0 WHERE vehicle_id = ? AND user_id = ?').run(req.params.vehicleId, req.params.userId);
  req.flash('success', 'مسافر حذف شد');
  res.redirect(`/welfare/transport/${req.params.vehicleId}`);
});

router.post('/transport/:id/delete', requireRole('super_admin'), (req, res) => {
  const db = getDb();
  db.prepare('UPDATE transport_vehicles SET is_active = 0 WHERE id = ?').run(req.params.id);
  req.flash('success', 'وسیله نقلیه غیرفعال شد');
  res.redirect('/welfare/transport');
});

// ═══════════ KITCHEN ══════════════════════════════════════
router.get('/kitchen', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();
  const days = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
  const menus = db.prepare('SELECT * FROM kitchen_menus WHERE is_active = 1 ORDER BY day_of_week, meal_type').all();
  const grouped = {};
  for (let i = 0; i < 7; i++) grouped[i] = menus.filter(m => m.day_of_week === i);
  res.render('welfare/kitchen', { title: 'آشپزخانه - منوی غذا', grouped, days });
});

router.post('/kitchen/menu', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { day_of_week, meal_type, food_name, description } = req.body;
  const db = getDb();
  db.prepare('INSERT INTO kitchen_menus (day_of_week, meal_type, food_name, description) VALUES (?, ?, ?, ?)')
    .run(parseInt(day_of_week), meal_type || 'lunch', food_name, description || '');
  req.flash('success', 'غذا اضافه شد');
  res.redirect('/welfare/kitchen');
});

router.post('/kitchen/menu/:id/delete', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM kitchen_menus WHERE id = ?').run(req.params.id);
  res.redirect('/welfare/kitchen');
});

// ═══════════ SECURITY ═════════════════════════════════════
router.get('/security', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  const days = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
  const shifts = db.prepare('SELECT * FROM security_shifts WHERE is_active = 1 ORDER BY day_of_week, shift_start').all();
  const grouped = {};
  for (let i = 0; i < 7; i++) grouped[i] = shifts.filter(s => s.day_of_week === i);
  res.render('welfare/security', { title: 'نگهبانی', grouped, days });
});

router.post('/security/shift', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { guard_name, guard_phone, shift_start, shift_end, location, day_of_week, notes } = req.body;
  const db = getDb();
  db.prepare('INSERT INTO security_shifts (guard_name, guard_phone, shift_start, shift_end, location, day_of_week, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(guard_name, guard_phone || '', shift_start, shift_end, location || '', parseInt(day_of_week) || 0, notes || '');
  req.flash('success', 'شیفت نگهبانی اضافه شد');
  res.redirect('/welfare/security');
});

router.post('/security/shift/:id/delete', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM security_shifts WHERE id = ?').run(req.params.id);
  res.redirect('/welfare/security');
});

module.exports = router;