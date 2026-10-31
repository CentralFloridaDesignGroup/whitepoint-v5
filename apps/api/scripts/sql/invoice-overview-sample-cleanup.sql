-- Remove only the records owned by invoice-overview-sample-seed.sql.
DELETE FROM stripe_payout_transactions WHERE payment_id IN (SELECT id FROM invoice_payments WHERE id LIKE 'sample-invoice-overview-payment-%') OR adjustment_id IN (SELECT id FROM stripe_payment_adjustments WHERE payment_id IN (SELECT id FROM invoice_payments WHERE id LIKE 'sample-invoice-overview-payment-%'));
DELETE FROM stripe_adjustment_transactions WHERE adjustment_id IN (SELECT id FROM stripe_payment_adjustments WHERE payment_id IN (SELECT id FROM invoice_payments WHERE id LIKE 'sample-invoice-overview-payment-%'));
DELETE FROM stripe_payment_adjustments WHERE payment_id IN (SELECT id FROM invoice_payments WHERE id LIKE 'sample-invoice-overview-payment-%');
DELETE FROM stripe_checkout_sessions WHERE invoice_id LIKE 'sample-invoice-overview-invoice-%';
DELETE FROM invoice_events WHERE invoice_id LIKE 'sample-invoice-overview-invoice-%';
DELETE FROM invoice_notifications WHERE invoice_id LIKE 'sample-invoice-overview-invoice-%';
DELETE FROM invoice_recipients WHERE invoice_id LIKE 'sample-invoice-overview-invoice-%';
DELETE FROM invoice_entry_allocations WHERE invoice_id LIKE 'sample-invoice-overview-invoice-%';
DELETE FROM invoice_lines WHERE invoice_id LIKE 'sample-invoice-overview-invoice-%';
DELETE FROM invoice_payments WHERE invoice_id LIKE 'sample-invoice-overview-invoice-%';
DELETE FROM invoices WHERE id LIKE 'sample-invoice-overview-invoice-%';
DELETE FROM project_po_documents WHERE project_id LIKE 'sample-invoice-overview-project-%';
DELETE FROM project_tasks WHERE project_id LIKE 'sample-invoice-overview-project-%';
DELETE FROM project_contacts WHERE project_id LIKE 'sample-invoice-overview-project-%';
DELETE FROM projects WHERE id LIKE 'sample-invoice-overview-project-%';
DELETE FROM contacts WHERE id LIKE 'sample-invoice-overview-contact-%';
DELETE FROM client_addresses WHERE client_id LIKE 'sample-invoice-overview-client-%';
DELETE FROM clients WHERE id LIKE 'sample-invoice-overview-client-%';
