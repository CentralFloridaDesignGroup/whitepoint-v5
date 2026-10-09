ALTER TABLE billing_positions ADD COLUMN local_id TEXT COLLATE NOCASE;
CREATE UNIQUE INDEX idx_billing_positions_local_id ON billing_positions(local_id) WHERE local_id IS NOT NULL;
