CREATE TABLE billing_positions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE pay_tables (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  expires_on TEXT,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
  undefined_rate_cents INTEGER NOT NULL DEFAULT 0 CHECK(undefined_rate_cents >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX idx_pay_tables_default ON pay_tables(is_default) WHERE is_default=1;
CREATE TABLE pay_table_rates (
  pay_table_id TEXT NOT NULL REFERENCES pay_tables(id),
  position_id TEXT NOT NULL REFERENCES billing_positions(id),
  rate_cents INTEGER NOT NULL CHECK(rate_cents >= 0),
  PRIMARY KEY(pay_table_id,position_id)
);
CREATE TABLE timesheet_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  revision INTEGER NOT NULL DEFAULT 1
);
INSERT INTO timesheet_settings(id) VALUES(1);
ALTER TABLE users ADD COLUMN manager_user_id TEXT REFERENCES users(id);
ALTER TABLE users ADD COLUMN billing_position_id TEXT REFERENCES billing_positions(id);
ALTER TABLE users ADD COLUMN pay_basis TEXT CHECK(pay_basis IN ('hourly','salary'));
ALTER TABLE users ADD COLUMN pay_amount_cents INTEGER CHECK(pay_amount_cents >= 0);
ALTER TABLE projects ADD COLUMN pay_table_id TEXT REFERENCES pay_tables(id);

CREATE TABLE user_timesheets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  week_start TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved')),
  revision INTEGER NOT NULL DEFAULT 1,
  submitted_at TEXT,
  approved_at TEXT,
  approved_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,week_start)
);
CREATE INDEX idx_timesheets_status_week ON user_timesheets(status,week_start);
CREATE TABLE user_timesheet_entries (
  id TEXT PRIMARY KEY,
  timesheet_id TEXT NOT NULL REFERENCES user_timesheets(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  project_task_id TEXT REFERENCES project_tasks(id),
  entry_date TEXT NOT NULL,
  hours REAL NOT NULL CHECK(hours > 0 AND hours < 24),
  note TEXT NOT NULL,
  cost_rate_cents INTEGER CHECK(cost_rate_cents >= 0),
  charge_rate_cents INTEGER CHECK(charge_rate_cents >= 0),
  cost_cents INTEGER CHECK(cost_cents >= 0),
  charge_cents INTEGER CHECK(charge_cents >= 0),
  billing_type TEXT,
  pay_table_id TEXT REFERENCES pay_tables(id),
  billing_position_id TEXT REFERENCES billing_positions(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_timesheet_entries_week ON user_timesheet_entries(timesheet_id,entry_date);
CREATE INDEX idx_timesheet_entries_project ON user_timesheet_entries(project_id);
CREATE TABLE timesheet_audit (
  id TEXT PRIMARY KEY,
  timesheet_id TEXT NOT NULL REFERENCES user_timesheets(id),
  entry_id TEXT,
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(details_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_timesheet_audit_week ON timesheet_audit(timesheet_id,created_at);
CREATE TABLE timesheet_notifications (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('missing','report')),
  recipient_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
  claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  UNIQUE(week_start,kind,recipient_user_id)
);
