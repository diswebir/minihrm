// ═══════════════════════════════════════════════════════════
//  Database Schema - All Tables
// ═══════════════════════════════════════════════════════════

const { getDb } = require('./connection');

function initDatabase() {
  const db = getDb();

  const schema = `
    -- ─── Users & Authentication ───────────────────────────
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('super_admin','hr_manager','hr_employee','employee')),
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      national_code TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      department_id INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT DEFAULT '',
      icon TEXT DEFAULT 'bi-grid',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      manager_id INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS job_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      department_id INTEGER,
      description TEXT DEFAULT '',
      requirements TEXT DEFAULT '',
      employment_type TEXT DEFAULT 'full_time',
      salary_range TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS form_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      total_steps INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS form_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      step_number INTEGER NOT NULL DEFAULT 1,
      field_key TEXT NOT NULL,
      field_label TEXT NOT NULL,
      field_type TEXT NOT NULL DEFAULT 'text',
      is_required INTEGER NOT NULL DEFAULT 0,
      placeholder TEXT DEFAULT '',
      options TEXT DEFAULT '',
      validation_rules TEXT DEFAULT '',
      order_num INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT DEFAULT '',
      last_name TEXT DEFAULT '',
      phone TEXT UNIQUE NOT NULL,
      email TEXT DEFAULT '',
      national_code TEXT DEFAULT '',
      job_position_id INTEGER,
      form_template_id INTEGER,
      status TEXT NOT NULL DEFAULT 'new',
      otp_verified INTEGER NOT NULL DEFAULT 0,
      form_step INTEGER NOT NULL DEFAULT 0,
      form_completed INTEGER NOT NULL DEFAULT 0,
      mbti_completed INTEGER NOT NULL DEFAULT 0,
      mbti_type TEXT DEFAULT '',
      mbti_scores TEXT DEFAULT '{}',
      mbti_analysis TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      reviewed_by INTEGER,
      reviewed_at TEXT,
      qr_scan_date TEXT DEFAULT '',
      source TEXT DEFAULT 'qr',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS candidate_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL,
      field_key TEXT NOT NULL,
      field_value TEXT DEFAULT '',
      file_path TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(candidate_id, field_key)
    );

    CREATE TABLE IF NOT EXISTS mbti_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_number INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      dimension TEXT NOT NULL,
      option_a_text TEXT NOT NULL,
      option_b_text TEXT NOT NULL,
      option_a_value TEXT NOT NULL,
      option_b_value TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS mbti_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      selected_option TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(candidate_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      is_used INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT UNIQUE NOT NULL,
      setting_value TEXT DEFAULT '',
      setting_group TEXT DEFAULT 'general',
      label TEXT DEFAULT '',
      field_type TEXT DEFAULT 'text'
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      module TEXT DEFAULT '',
      description TEXT DEFAULT '',
      ip_address TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS candidate_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL,
      old_status TEXT DEFAULT '',
      new_status TEXT NOT NULL,
      changed_by INTEGER,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS candidate_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL,
      user_id INTEGER,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS qr_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_position_id INTEGER,
      code TEXT UNIQUE NOT NULL,
      scan_count INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assessment_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT DEFAULT '',
      total_questions INTEGER NOT NULL DEFAULT 0,
      time_minutes INTEGER NOT NULL DEFAULT 10,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assessment_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER NOT NULL,
      question_number INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      dimension TEXT NOT NULL DEFAULT '',
      option_a_text TEXT NOT NULL DEFAULT '',
      option_b_text TEXT NOT NULL DEFAULT '',
      option_a_value TEXT NOT NULL DEFAULT '',
      option_b_value TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS assessment_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL,
      test_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      selected_option TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(candidate_id, test_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS assessment_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL,
      test_id INTEGER NOT NULL,
      result_type TEXT DEFAULT '',
      scores TEXT DEFAULT '{}',
      analysis TEXT DEFAULT '',
      recommendations TEXT DEFAULT '',
      completed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(candidate_id, test_id)
    );
  `;

  db.exec(schema);
  console.log('✅ Database schema initialized');
}

module.exports = { initDatabase };