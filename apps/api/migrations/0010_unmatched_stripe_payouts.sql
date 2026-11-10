ALTER TABLE stripe_payouts ADD COLUMN qbo_force_unmatched INTEGER NOT NULL DEFAULT 0 CHECK(qbo_force_unmatched IN (0,1));
ALTER TABLE stripe_payouts ADD COLUMN qbo_force_actor TEXT;
ALTER TABLE stripe_payouts ADD COLUMN qbo_force_at TEXT;
ALTER TABLE stripe_payout_transactions ADD COLUMN qbo_customer_id TEXT;
ALTER TABLE stripe_payout_transactions ADD COLUMN qbo_sales_receipt_id TEXT;

CREATE TRIGGER invoice_task_contract_insert AFTER INSERT ON invoice_lines
WHEN NEW.project_task_id IS NOT NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM project_tasks t WHERE t.id=NEW.project_task_id
      AND t.bill_type IN ('fixed-fee','time-and-materials-nte')
      AND (SELECT COALESCE(SUM(l.amount_cents),0) FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id WHERE l.project_task_id=t.id AND i.status<>'void')>t.contract_amount_cents
  ) THEN RAISE(ABORT,'Task exceeds its contract amount.') END;
END;

CREATE TRIGGER invoice_task_contract_update AFTER UPDATE OF amount_cents,project_task_id ON invoice_lines
WHEN NEW.project_task_id IS NOT NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM project_tasks t WHERE t.id=NEW.project_task_id
      AND t.bill_type IN ('fixed-fee','time-and-materials-nte')
      AND (SELECT COALESCE(SUM(l.amount_cents),0) FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id WHERE l.project_task_id=t.id AND i.status<>'void')>t.contract_amount_cents
  ) THEN RAISE(ABORT,'Task exceeds its contract amount.') END;
END;
