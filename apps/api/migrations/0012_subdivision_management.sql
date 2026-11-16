-- Add subdivision schema omitted from the production 0010 migration.
CREATE TABLE IF NOT EXISTS subdivisions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  plat_reference TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_subdivisions_name ON subdivisions(name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS subdivision_parcels (
  id TEXT PRIMARY KEY,
  subdivision_id TEXT NOT NULL REFERENCES subdivisions(id),
  parcel_type TEXT NOT NULL CHECK (parcel_type IN ('lot','tract','parcel','pad')),
  block TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL,
  plat_reference TEXT NOT NULL DEFAULT '',
  street_address TEXT NOT NULL DEFAULT '',
  parcel_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(subdivision_id,block,label)
);
CREATE INDEX IF NOT EXISTS idx_subdivision_parcels_subdivision ON subdivision_parcels(subdivision_id,block,label);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subdivision_parcels_identity ON subdivision_parcels(subdivision_id,block COLLATE NOCASE,label COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS subdivision_parents (
  subdivision_id TEXT NOT NULL REFERENCES subdivisions(id),
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(subdivision_id,client_id)
);

CREATE TABLE IF NOT EXISTS subdivision_assignments (
  id TEXT PRIMARY KEY,
  parcel_id TEXT NOT NULL REFERENCES subdivision_parcels(id),
  parent_project_id TEXT NOT NULL REFERENCES projects(id),
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id),
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subdivision_assignment_active ON subdivision_assignments(parcel_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_subdivision_assignment_parent ON subdivision_assignments(parent_project_id,ended_at);

CREATE TABLE IF NOT EXISTS subdivision_phase_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  tasks_json TEXT NOT NULL CHECK (json_valid(tasks_json)),
  revision INTEGER NOT NULL DEFAULT 1,
  archived_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subdivision_batches (
  id TEXT PRIMARY KEY,
  subdivision_id TEXT NOT NULL REFERENCES subdivisions(id),
  parent_project_id TEXT NOT NULL REFERENCES projects(id),
  parent_revision INTEGER NOT NULL,
  template_snapshot_json TEXT NOT NULL CHECK (json_valid(template_snapshot_json)),
  operation TEXT NOT NULL DEFAULT 'assign' CHECK (operation IN ('assign','append')),
  template_id TEXT REFERENCES subdivision_phase_templates(id),
  template_revision INTEGER,
  template_name TEXT,
  confirmed_contract INTEGER NOT NULL DEFAULT 0 CHECK (confirmed_contract IN (0,1)),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS subdivision_batch_rows (
  batch_id TEXT NOT NULL REFERENCES subdivision_batches(id),
  parcel_id TEXT NOT NULL REFERENCES subdivision_parcels(id),
  previous_project_id TEXT,
  project_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','created','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  project_id TEXT REFERENCES projects(id),
  target_project_id TEXT REFERENCES projects(id),
  target_revision INTEGER,
  task_ids_json TEXT CHECK (task_ids_json IS NULL OR json_valid(task_ids_json)),
  error TEXT,
  PRIMARY KEY(batch_id,parcel_id)
);

CREATE TABLE IF NOT EXISTS subdivision_template_applications (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES subdivision_batches(id),
  parcel_id TEXT NOT NULL REFERENCES subdivision_parcels(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  template_id TEXT NOT NULL REFERENCES subdivision_phase_templates(id),
  template_revision INTEGER NOT NULL,
  template_name TEXT NOT NULL,
  tasks_json TEXT NOT NULL CHECK (json_valid(tasks_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(batch_id,parcel_id)
);
CREATE INDEX IF NOT EXISTS idx_subdivision_template_applications_project ON subdivision_template_applications(project_id,created_at);
