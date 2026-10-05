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

    -- ═══ TRAINING MODULE ═══
    CREATE TABLE IF NOT EXISTS training_courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT 'general',
      content_type TEXT DEFAULT 'video' CHECK(content_type IN ('video','document','link','text')),
      content_url TEXT DEFAULT '',
      content_text TEXT DEFAULT '',
      duration_hours REAL DEFAULT 0,
      is_mandatory INTEGER NOT NULL DEFAULT 0,
      department_id INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS training_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      assigned_by INTEGER,
      status TEXT NOT NULL DEFAULT 'assigned' CHECK(status IN ('assigned','in_progress','completed','expired')),
      due_date TEXT,
      started_at TEXT,
      completed_at TEXT,
      score REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(course_id, user_id)
    );

    -- ═══ PAYROLL MODULE ═══
    CREATE TABLE IF NOT EXISTS salary_structures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      base_salary REAL NOT NULL DEFAULT 0,
      housing_allowance REAL DEFAULT 0,
      transport_allowance REAL DEFAULT 0,
      food_allowance REAL DEFAULT 0,
      children_allowance REAL DEFAULT 0,
      marriage_allowance REAL DEFAULT 0,
      job_title_allowance REAL DEFAULT 0,
      overtime_rate REAL DEFAULT 0,
      insurance_employee_share REAL DEFAULT 0,
      insurance_employer_share REAL DEFAULT 0,
      tax_rate REAL DEFAULT 0,
      effective_from TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payslips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      period_year INTEGER NOT NULL,
      period_month INTEGER NOT NULL,
      base_salary REAL DEFAULT 0,
      allowances_total REAL DEFAULT 0,
      overtime_hours REAL DEFAULT 0,
      overtime_pay REAL DEFAULT 0,
      bonus REAL DEFAULT 0,
      additions_total REAL DEFAULT 0,
      insurance_deduction REAL DEFAULT 0,
      tax_deduction REAL DEFAULT 0,
      loan_deduction REAL DEFAULT 0,
      deductions_total REAL DEFAULT 0,
      gross_salary REAL DEFAULT 0,
      net_salary REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','paid')),
      paid_at TEXT,
      notes TEXT DEFAULT '',
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payslip_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payslip_id INTEGER NOT NULL,
      item_type TEXT NOT NULL CHECK(item_type IN ('addition','deduction')),
      title TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      description TEXT DEFAULT '',
      FOREIGN KEY (payslip_id) REFERENCES payslips(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      loan_type TEXT DEFAULT 'cash',
      amount REAL NOT NULL,
      monthly_installment REAL NOT NULL,
      total_installments INTEGER NOT NULL,
      paid_installments INTEGER NOT NULL DEFAULT 0,
      start_date TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paid_off','cancelled')),
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ═══ OFFBOARDING MODULE ═══
    CREATE TABLE IF NOT EXISTS offboarding_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      request_type TEXT NOT NULL CHECK(request_type IN ('resignation','termination','end_contract','retirement')),
      reason TEXT DEFAULT '',
      last_working_day TEXT,
      settlement_amount REAL DEFAULT 0,
      severance_pay REAL DEFAULT 0,
      unused_leave_pay REAL DEFAULT 0,
      loan_remaining REAL DEFAULT 0,
      equipment_returned INTEGER DEFAULT 0,
      access_revoked INTEGER DEFAULT 0,
      knowledge_transferred INTEGER DEFAULT 0,
      exit_interview_done INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','in_progress','completed','rejected')),
      approved_by INTEGER,
      completed_at TEXT,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ═══ WELFARE MODULE ═══
    CREATE TABLE IF NOT EXISTS transport_vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_type TEXT DEFAULT 'van' CHECK(vehicle_type IN ('van','bus','minibus','car')),
      plate_number TEXT NOT NULL,
      model TEXT DEFAULT '',
      capacity INTEGER NOT NULL DEFAULT 10,
      driver_name TEXT DEFAULT '',
      driver_phone TEXT DEFAULT '',
      route_name TEXT DEFAULT '',
      route_description TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transport_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      pickup_point TEXT DEFAULT '',
      pickup_time TEXT DEFAULT '',
      shift_type TEXT DEFAULT 'morning' CHECK(shift_type IN ('morning','evening','night')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(vehicle_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS kitchen_menus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_of_week INTEGER NOT NULL,
      meal_type TEXT DEFAULT 'lunch' CHECK(meal_type IN ('breakfast','lunch','dinner')),
      food_name TEXT NOT NULL,
      description TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS security_shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guard_name TEXT NOT NULL,
      guard_phone TEXT DEFAULT '',
      shift_start TEXT NOT NULL,
      shift_end TEXT NOT NULL,
      location TEXT DEFAULT '',
      day_of_week INTEGER DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ═══ LEGAL & LICENSING MODULE ═══
    CREATE TABLE IF NOT EXISTS company_permits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      permit_type TEXT NOT NULL,
      permit_number TEXT DEFAULT '',
      issuing_authority TEXT DEFAULT '',
      issue_date TEXT,
      expiry_date TEXT,
      renewal_required INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','expired','pending_renewal','cancelled')),
      file_path TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shareholders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      national_code TEXT DEFAULT '',
      share_percentage REAL NOT NULL DEFAULT 0,
      share_amount REAL DEFAULT 0,
      role TEXT DEFAULT 'shareholder' CHECK(role IN ('shareholder','board_member','ceo','managing_director')),
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS company_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_number TEXT NOT NULL,
      economic_code TEXT DEFAULT '',
      company_type TEXT DEFAULT 'llc' CHECK(company_type IN ('llc','joint_stock','cooperative','partnership','other')),
      registered_capital REAL DEFAULT 0,
      paid_capital REAL DEFAULT 0,
      registration_date TEXT,
      registration_office TEXT DEFAULT '',
      address TEXT DEFAULT '',
      status TEXT DEFAULT 'active' CHECK(status IN ('active','suspended','dissolved')),
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `;

  db.exec(schema);
  console.log('✅ Database schema initialized');
}

module.exports = { initDatabase };