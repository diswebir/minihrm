'use strict';
/**
 * Seed — ایجاد جداول، مجوزها، نقش‌ها، ماژول‌ها، سوالات MBTI، تیپ‌ها و فیلدهای فرم
 */
const fs = require('fs');
const path = require('path');
const db = require('./db');
const data = require('./seed-data');
const MBTI_TYPES = require('./mbti-types');

function run() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  // ---- permissions ----
  const insPerm = db.prepare('INSERT OR IGNORE INTO permissions (code, name, grp, description) VALUES (?,?,?,?)');
  for (const p of data.PERMISSIONS) insPerm.run(p.code, p.name, p.grp, p.desc || '');

  // ---- roles ----
  const insRole = db.prepare('INSERT OR IGNORE INTO roles (code, name, description, is_system) VALUES (?,?,?,?)');
  const insRP = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?,?)');
  for (const r of data.ROLES) {
    insRole.run(r.code, r.name, r.description, r.is_system ? 1 : 0);
    const role = db.prepare('SELECT id FROM roles WHERE code = ?').get(r.code);
    for (const code of r.permissions) {
      const perm = db.prepare('SELECT id FROM permissions WHERE code = ?').get(code);
      if (role && perm) insRP.run(role.id, perm.id);
    }
  }

  // ---- modules ----
  const insMod = db.prepare('INSERT OR IGNORE INTO modules (code, name, description, icon, version, enabled, installed, sort) VALUES (?,?,?,?,?,?,?,?)');
  for (const m of data.MODULES) {
    insMod.run(m.code, m.name, m.description, m.icon, m.version, m.enabled ? 1 : 0, m.installed ? 1 : 0, m.sort);
  }

  // ---- mbti questions ---- (فقط اگر خالی باشد — جلوگیری از درج تکراری هنگام ری‌استارت)
  const qCount = db.prepare('SELECT COUNT(*) c FROM mbti_questions').get().c;
  if (qCount === 0) {
    const insQ = db.prepare('INSERT INTO mbti_questions (number, text, option_a, option_b, trait_a, trait_b, enabled, sort) VALUES (?,?,?,?,?,?,1,?)');
    for (const q of data.MBTI_QUESTIONS) {
      insQ.run(q.number, q.text, q.option_a, q.option_b, q.trait_a, q.trait_b, q.number);
    }
  }

  // ---- mbti types ----
  const tCount = db.prepare('SELECT COUNT(*) c FROM mbti_types').get().c;
  if (tCount === 0) {
    const insT = db.prepare(`INSERT INTO mbti_types
      (code, title, nickname, group_title, one_liner, description, strengths, weaknesses, work_style, team_role,
       communication, decision_making, leadership, stress, motivation, ideal_jobs, interview_tips, red_flags, famous_fit)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const t of MBTI_TYPES) {
      insT.run(
        t.code, t.title, t.nickname, t.group_title, t.one_liner, t.description,
        JSON.stringify(t.strengths || []), JSON.stringify(t.weaknesses || []),
        t.work_style, t.team_role, t.communication, t.decision_making,
        t.leadership, t.stress, t.motivation,
        JSON.stringify(t.ideal_jobs || []), JSON.stringify(t.interview_tips || []), JSON.stringify(t.red_flags || []),
        t.famous_fit
      );
    }
  }

  // ---- form steps ----
  const insStep = db.prepare('INSERT OR IGNORE INTO form_steps (key, title, description, icon, enabled, sort) VALUES (?,?,?,?,1,?)');
  for (const s of data.FORM_STEPS) insStep.run(s.key, s.title, s.description, s.icon, s.sort);

  // ---- form fields ----
  const insField = db.prepare(`INSERT OR IGNORE INTO form_fields
    (field_key, step_key, label, type, options, placeholder, required, visible, builtin, grp, width, help, sort)
    VALUES (?,?,?,?,?,?,?,?,1,?,?,?,?)`);
  for (const f of data.FORM_FIELDS) {
    insField.run(
      f.field_key, f.step_key, f.label, f.type,
      JSON.stringify(f.options || []), f.placeholder || '',
      f.required ? 1 : 0, f.visible === 0 ? 0 : 1,
      f.grp || '', f.width || 'half', f.help || '', f.sort || 0
    );
  }

  // ---- default settings ----
  const insSet = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?,?)');
  const defaults = {
    company_name: 'شرکت دانش بنیان عرفان صنعت اصفهان',
    company_logo: '',
    app_title: 'سامانه مدیریت منابع انسانی',
    tracking_prefix: 'ERF',
    otp_length: '5',
    otp_expiry_seconds: '300',
    otp_resend_seconds: '120',
    otp_max_attempts: '5',
    session_hours: '24',
    sms_driver: 'mock',                 // mock | ippanel
    sms_ippanel_apikey: '',
    sms_ippanel_from: '+983000505',
    sms_ippanel_pattern_code: '',
    sms_mock_show: '1',
    install_done: '0'
  };
  for (const [k, v] of Object.entries(defaults)) insSet.run(k, v);
}

module.exports = { run };
