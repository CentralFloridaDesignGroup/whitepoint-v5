ALTER TABLE invoices
ADD COLUMN copy_pm INTEGER NOT NULL DEFAULT 1 CHECK (copy_pm IN (0, 1));

ALTER TABLE invoices
ADD COLUMN pm_copy_email TEXT;

ALTER TABLE invoices
ADD COLUMN pm_copy_status TEXT NOT NULL DEFAULT 'none' CHECK (pm_copy_status IN ('none', 'accepted', 'failed'));

ALTER TABLE invoices
ADD COLUMN pm_copy_error TEXT;

CREATE VIEW
  invoice_entry_claims AS
SELECT
  a.entry_id,
  SUM(
    a.billed_hours_hundredths + a.writeoff_hours_hundredths
  ) AS claimed_hours,
  SUM(a.billed_charge_cents + a.writeoff_charge_cents) AS claimed_charge
FROM
  invoice_entry_allocations a
  JOIN invoices i ON i.id = a.invoice_id
WHERE
  i.status <> 'void'
GROUP BY
  a.entry_id;

DROP INDEX idx_invoices_monthly;

CREATE UNIQUE INDEX idx_invoices_monthly ON invoices (project_id, billing_month)
WHERE
  source = 'monthly'
  AND status <> 'void';

DROP TRIGGER invoice_allocation_capacity_insert;

CREATE TRIGGER invoice_allocation_capacity_insert BEFORE INSERT ON invoice_entry_allocations BEGIN
SELECT
  CASE
    WHEN (
      SELECT
        status
      FROM
        invoices
      WHERE
        id = NEW.invoice_id
    ) = 'void' THEN RAISE (ABORT, 'Cannot allocate time to a void invoice')
  END;

SELECT
  CASE
    WHEN (
      SELECT
        COALESCE(
          SUM(
            a.billed_hours_hundredths + a.writeoff_hours_hundredths
          ),
          0
        )
      FROM
        invoice_entry_allocations a
        JOIN invoices i ON i.id = a.invoice_id
      WHERE
        a.entry_id = NEW.entry_id
        AND i.status <> 'void'
    ) + NEW.billed_hours_hundredths + NEW.writeoff_hours_hundredths > (
      SELECT
        ROUND(hours * 100)
      FROM
        user_timesheet_entries
      WHERE
        id = NEW.entry_id
    )
    OR (
      SELECT
        COALESCE(
          SUM(a.billed_charge_cents + a.writeoff_charge_cents),
          0
        )
      FROM
        invoice_entry_allocations a
        JOIN invoices i ON i.id = a.invoice_id
      WHERE
        a.entry_id = NEW.entry_id
        AND i.status <> 'void'
    ) + NEW.billed_charge_cents + NEW.writeoff_charge_cents > (
      SELECT
        charge_cents
      FROM
        user_timesheet_entries
      WHERE
        id = NEW.entry_id
    ) THEN RAISE (ABORT, 'Time entry has already been allocated')
  END;

END;

DROP TRIGGER invoice_allocation_capacity_update;

CREATE TRIGGER invoice_allocation_capacity_update BEFORE
UPDATE ON invoice_entry_allocations BEGIN
SELECT
  CASE
    WHEN (
      SELECT
        status
      FROM
        invoices
      WHERE
        id = NEW.invoice_id
    ) = 'void' THEN RAISE (ABORT, 'Cannot allocate time to a void invoice')
  END;

SELECT
  CASE
    WHEN (
      SELECT
        COALESCE(
          SUM(
            a.billed_hours_hundredths + a.writeoff_hours_hundredths
          ),
          0
        )
      FROM
        invoice_entry_allocations a
        JOIN invoices i ON i.id = a.invoice_id
      WHERE
        a.entry_id = NEW.entry_id
        AND a.invoice_id <> OLD.invoice_id
        AND i.status <> 'void'
    ) + NEW.billed_hours_hundredths + NEW.writeoff_hours_hundredths > (
      SELECT
        ROUND(hours * 100)
      FROM
        user_timesheet_entries
      WHERE
        id = NEW.entry_id
    )
    OR (
      SELECT
        COALESCE(
          SUM(a.billed_charge_cents + a.writeoff_charge_cents),
          0
        )
      FROM
        invoice_entry_allocations a
        JOIN invoices i ON i.id = a.invoice_id
      WHERE
        a.entry_id = NEW.entry_id
        AND a.invoice_id <> OLD.invoice_id
        AND i.status <> 'void'
    ) + NEW.billed_charge_cents + NEW.writeoff_charge_cents > (
      SELECT
        charge_cents
      FROM
        user_timesheet_entries
      WHERE
        id = NEW.entry_id
    ) THEN RAISE (ABORT, 'Time entry has already been allocated')
  END;

END;