-- Fresh V5 roles permissions schema.
CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  permissions TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(permissions)),
  built_in INTEGER NOT NULL DEFAULT 0 CHECK (built_in IN (0, 1)),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles(id, name, permissions, built_in) VALUES
  ('super-administrator', 'super-administrator', '["*"]', 1),
  ('employee', 'employee', '["dashboard.view"]', 1);
