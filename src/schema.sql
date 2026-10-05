-- ============================================================
-- MiniHRM - Database Schema
-- سامانه مدیریت منابع انسانی مینی‌اچ‌آر‌ام
-- ============================================================

-- ---------- کاربران و نقش‌ها ----------
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_system INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  grp TEXT NOT NULL,
  description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  role_id INTEGER REFERENCES roles(id),
  is_super_admin INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',           -- active | disabled
  avatar_path TEXT DEFAULT '',
  last_login_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- بازنویسی مجوزها برای کاربر خاص (grant / deny)
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'grant',     -- grant | deny
  PRIMARY KEY (user_id, permission_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expired_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired_at);

-- ---------- ماژول‌ها ----------
CREATE TABLE IF NOT EXISTS modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon TEXT DEFAULT 'puzzle',
  version TEXT DEFAULT '1.0.0',
  enabled INTEGER DEFAULT 1,
  installed INTEGER DEFAULT 1,            -- 0 = به‌زودی / در آینده نصب می‌شود
  sort INTEGER DEFAULT 0
);

-- ---------- تنظیمات ----------
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- ---------- فعالیت‌ها / اعلان‌ها ----------
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT DEFAULT '',
  entity_id TEXT DEFAULT '',
  detail TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  link TEXT DEFAULT '',
  read_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);

-- ---------- کدهای یکبار مصرف OTP ----------
CREATE TABLE IF NOT EXISTS otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT DEFAULT 'candidate_login',
  meta TEXT DEFAULT '{}',
  attempts INTEGER DEFAULT 0,
  consumed_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone, created_at);

-- ---------- موقعیت‌های شغلی ----------
CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  department TEXT DEFAULT '',
  employment_type TEXT DEFAULT 'full_time',  -- full_time|part_time|remote|project|intern
  description TEXT DEFAULT '',
  requirements TEXT DEFAULT '',
  benefits TEXT DEFAULT '',
  min_salary TEXT DEFAULT '',
  max_salary TEXT DEFAULT '',
  status TEXT DEFAULT 'open',                -- open | closed | draft
  sort INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ---------- فرم استخدام (پیکربندی‌پذیر) ----------
CREATE TABLE IF NOT EXISTS form_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon TEXT DEFAULT 'file',
  enabled INTEGER DEFAULT 1,
  sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS form_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_key TEXT UNIQUE NOT NULL,
  step_key TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL,                -- text|textarea|number|phone|email|date|select|radio|checkbox|switch|file|repeater
  options TEXT DEFAULT '[]',         -- JSON [{value,label}]
  placeholder TEXT DEFAULT '',
  required INTEGER DEFAULT 0,
  visible INTEGER DEFAULT 1,
  builtin INTEGER DEFAULT 1,
  grp TEXT DEFAULT '',
  width TEXT DEFAULT 'half',         -- half | full
  help TEXT DEFAULT '',
  sort INTEGER DEFAULT 0
);

-- ---------- متقاضیان ----------
CREATE TABLE IF NOT EXISTS applicants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tracking_code TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  position_id INTEGER REFERENCES positions(id),
  first_name TEXT DEFAULT '',
  last_name TEXT DEFAULT '',
  national_id TEXT DEFAULT '',
  birth_date TEXT DEFAULT '',
  email TEXT DEFAULT '',
  gender TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',  -- draft|submitted|reviewing|interview|accepted|rejected|on_hold
  step TEXT DEFAULT 'personal',
  data TEXT DEFAULT '{}',       -- JSON snapshot of all answers
  photo_path TEXT DEFAULT '',
  mbti_type TEXT DEFAULT '',
  mbti_scores TEXT DEFAULT '{}',
  mbti_answers TEXT DEFAULT '[]',
  consent_at TEXT,
  submitted_at TEXT,
  created_ip TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_applicants_status ON applicants(status);
CREATE INDEX IF NOT EXISTS idx_applicants_phone ON applicants(phone);
CREATE INDEX IF NOT EXISTS idx_applicants_position ON applicants(position_id);

-- تاریخچه وضعیت / رویدادهای متقاضی
CREATE TABLE IF NOT EXISTS applicant_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  user_id INTEGER,
  event TEXT NOT NULL,
  detail TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- نظرات (مصاحبه‌کننده / منابع انسانی / مدیریت)
CREATE TABLE IF NOT EXISTS applicant_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  user_id INTEGER,
  kind TEXT NOT NULL,               -- interview | hr | management | general
  note TEXT DEFAULT '',
  decision TEXT DEFAULT '',         -- accept | review | reject | ''
  created_at TEXT DEFAULT (datetime('now'))
);

-- ---------- آزمون شخصیت MBTI ----------
CREATE TABLE IF NOT EXISTS mbti_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number INTEGER NOT NULL UNIQUE,
  text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  trait_a TEXT NOT NULL,            -- E|I|S|N|T|F|J|P
  trait_b TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  sort INTEGER DEFAULT 0
);

-- ---------- آزمون‌های روان‌شناختی (DISC / هوش هیجانی / هالند و ...) ----------
CREATE TABLE IF NOT EXISTS tests (
  code TEXT PRIMARY KEY,             -- mbti | disc | eq | holland
  title TEXT NOT NULL,
  short_title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  intro TEXT DEFAULT '',
  icon TEXT DEFAULT 'brain',
  dimensions TEXT DEFAULT '[]',      -- JSON [{key,name,desc}]
  scale_labels TEXT DEFAULT '[]',    -- JSON ["کاملاً مخالفم", ...]
  required INTEGER DEFAULT 0,        -- الزامی برای تکمیل فرم استخدام
  enabled INTEGER DEFAULT 1,
  sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS test_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_code TEXT NOT NULL REFERENCES tests(code) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  text TEXT NOT NULL,
  dimension TEXT NOT NULL,
  reverse INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  sort INTEGER DEFAULT 0,
  UNIQUE(test_code, number)
);

CREATE TABLE IF NOT EXISTS test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  test_code TEXT NOT NULL REFERENCES tests(code) ON DELETE CASCADE,
  answers TEXT DEFAULT '[]',         -- JSON [{number,value}]
  scores TEXT DEFAULT '{}',          -- JSON {dimension: raw}
  summary TEXT DEFAULT '{}',         -- JSON نتیجه تحلیل‌شده
  completed_at TEXT DEFAULT (datetime('now')),
  UNIQUE(applicant_id, test_code)
);

CREATE TABLE IF NOT EXISTS mbti_types (
  code TEXT PRIMARY KEY,            -- INTJ ...
  title TEXT NOT NULL,
  nickname TEXT NOT NULL,
  group_title TEXT DEFAULT '',
  one_liner TEXT DEFAULT '',
  description TEXT DEFAULT '',
  strengths TEXT DEFAULT '[]',
  weaknesses TEXT DEFAULT '[]',
  work_style TEXT DEFAULT '',
  team_role TEXT DEFAULT '',
  communication TEXT DEFAULT '',
  decision_making TEXT DEFAULT '',
  leadership TEXT DEFAULT '',
  stress TEXT DEFAULT '',
  motivation TEXT DEFAULT '',
  ideal_jobs TEXT DEFAULT '[]',
  interview_tips TEXT DEFAULT '[]',
  red_flags TEXT DEFAULT '[]',
  famous_fit TEXT DEFAULT ''
);
