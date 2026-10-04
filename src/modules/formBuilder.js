// ═══════════════════════════════════════════════════════════
//  Form Builder Module - Customizable Recruitment Forms
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { getDb } = require('../database/connection');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { moduleGuard } = require('../middleware/moduleGuard');

router.use(isAuthenticated);
router.use(moduleGuard('form_builder'));

// List form templates
router.get('/', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();
  const templates = db.prepare(`
    SELECT ft.*,
    (SELECT COUNT(*) FROM form_fields WHERE template_id = ft.id) as field_count,
    u.first_name || ' ' || u.last_name as creator_name
    FROM form_templates ft
    LEFT JOIN users u ON ft.created_by = u.id
    ORDER BY ft.created_at DESC
  `).all();

  res.render('formBuilder/index', {
    title: 'فرم‌ساز',
    templates
  });
});

// Edit form template
router.get('/:id/edit', requireRole('super_admin', 'hr_manager', 'hr_employee'), (req, res) => {
  const db = getDb();
  const template = db.prepare('SELECT * FROM form_templates WHERE id = ?').get(req.params.id);

  if (!template) {
    req.flash('error', 'فرم یافت نشد');
    return res.redirect('/form-builder');
  }

  const fields = db.prepare(`
    SELECT * FROM form_fields WHERE template_id = ? ORDER BY step_number, order_num
  `).all(req.params.id);

  // Group by step
  const steps = {};
  for (let i = 1; i <= template.total_steps; i++) {
    steps[i] = fields.filter(f => f.step_number === i);
  }

  res.render('formBuilder/edit', {
    title: `ویرایش فرم: ${template.name}`,
    template,
    fields,
    steps
  });
});

// Create new template
router.post('/', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { name, description, total_steps } = req.body;
  const db = getDb();

  db.prepare(`
    INSERT INTO form_templates (name, description, total_steps, created_by) VALUES (?, ?, ?, ?)
  `).run(name || 'فرم جدید', description || '', parseInt(total_steps) || 1, req.session.user.id);

  req.flash('success', 'فرم جدید ایجاد شد');
  return res.redirect('/form-builder');
});

// Update template
router.post('/:id', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { name, description, total_steps, is_active } = req.body;
  const db = getDb();

  db.prepare(`
    UPDATE form_templates SET name=?, description=?, total_steps=?, is_active=?, updated_at=datetime('now') WHERE id=?
  `).run(name, description || '', parseInt(total_steps) || 1, is_active ? 1 : 0, req.params.id);

  req.flash('success', 'فرم بروزرسانی شد');
  return res.redirect(`/form-builder/${req.params.id}/edit`);
});

// Add field to template
router.post('/:id/fields', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { step_number, field_key, field_label, field_type, is_required, placeholder, options, order_num } = req.body;
  const db = getDb();

  db.prepare(`
    INSERT INTO form_fields (template_id, step_number, field_key, field_label, field_type, is_required, placeholder, options, order_num) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.params.id,
    parseInt(step_number) || 1,
    field_key || `field_${Date.now()}`,
    field_label || 'فیلد جدید',
    field_type || 'text',
    is_required ? 1 : 0,
    placeholder || '',
    options || '',
    parseInt(order_num) || 0
  );

  req.flash('success', 'فیلد اضافه شد');
  return res.redirect(`/form-builder/${req.params.id}/edit`);
});

// Update field
router.post('/:templateId/fields/:fieldId', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const { step_number, field_key, field_label, field_type, is_required, placeholder, options, order_num } = req.body;
  const db = getDb();

  db.prepare(`
    UPDATE form_fields SET step_number=?, field_key=?, field_label=?, field_type=?, is_required=?, placeholder=?, options=?, order_num=? WHERE id=? AND template_id=?
  `).run(
    parseInt(step_number), field_key, field_label, field_type,
    is_required ? 1 : 0, placeholder || '', options || '',
    parseInt(order_num) || 0, req.params.fieldId, req.params.templateId
  );

  req.flash('success', 'فیلد بروزرسانی شد');
  return res.redirect(`/form-builder/${req.params.templateId}/edit`);
});

// Delete field
router.post('/:templateId/fields/:fieldId/delete', requireRole('super_admin', 'hr_manager'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM form_fields WHERE id = ? AND template_id = ?').run(req.params.fieldId, req.params.templateId);

  req.flash('success', 'فیلد حذف شد');
  return res.redirect(`/form-builder/${req.params.templateId}/edit`);
});

// Delete template
router.post('/:id/delete', requireRole('super_admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM form_templates WHERE id = ?').run(req.params.id);

  req.flash('success', 'فرم حذف شد');
  return res.redirect('/form-builder');
});

module.exports = router;