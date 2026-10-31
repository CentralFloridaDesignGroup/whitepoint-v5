-- Local preview fixtures for the Manage invoice overview. These records are
-- inserted only by invoice-overview-sample-data.mjs, which always uses D1 --local.
INSERT OR IGNORE INTO clients(id,name,status,email,client_number)
VALUES
  ('sample-invoice-overview-client-a','Sample · Harbor Construction','active','billing@harbor.example','SAMPLE-OV-CLIENT-A'),
  ('sample-invoice-overview-client-b','Sample · Cypress Property Group','active','ap@cypress.example','SAMPLE-OV-CLIENT-B');

INSERT OR IGNORE INTO contacts(id,client_id,name,email,role,invoice_recipient,first_name,last_name,is_poc,is_billing_poc)
VALUES
  ('sample-invoice-overview-contact-a','sample-invoice-overview-client-a','Harbor Billing','billing@harbor.example','Billing',1,'Harbor','Billing',1,1),
  ('sample-invoice-overview-contact-b','sample-invoice-overview-client-b','Cypress Billing','ap@cypress.example','Billing',1,'Cypress','Billing',1,1);

INSERT OR IGNORE INTO projects(id,project_number,client_id,name,description,manager_user_id,stage,active)
VALUES
  ('sample-invoice-overview-project-a1','SAMPLE-OV-101','sample-invoice-overview-client-a','Harbor Point Boundary Survey','Sample invoice overview preview.',(SELECT id FROM users WHERE email='nwhite@whitepointsurvey.com' AND active=1 AND archived_at IS NULL LIMIT 1),'active',1),
  ('sample-invoice-overview-project-a2','SAMPLE-OV-102','sample-invoice-overview-client-a','Riverside Warehouse Expansion','Sample invoice overview preview.',(SELECT id FROM users WHERE email='nwhite@whitepointsurvey.com' AND active=1 AND archived_at IS NULL LIMIT 1),'active',1),
  ('sample-invoice-overview-project-b1','SAMPLE-OV-201','sample-invoice-overview-client-b','Cypress Medical Campus','Sample invoice overview preview.',(SELECT id FROM users WHERE email='nwhite@whitepointsurvey.com' AND active=1 AND archived_at IS NULL LIMIT 1),'active',1);

INSERT OR IGNORE INTO invoices(id,project_id,client_id,invoice_number,source,status,issue_date,due_date,billing_name,billing_email,project_reference,public_token,sent_at,paid_at,voided_at)
VALUES
  ('sample-invoice-overview-invoice-01','sample-invoice-overview-project-a1','sample-invoice-overview-client-a','SAMPLE-OV-INV-01','manual','sent',date('now','-55 days'),date('now','-25 days'),'Harbor Construction','billing@harbor.example','SAMPLE-OV-101 · Harbor Point Boundary Survey','sample_invoice_overview_token_01',datetime('now','-55 days'),NULL,NULL),
  ('sample-invoice-overview-invoice-02','sample-invoice-overview-project-a1','sample-invoice-overview-client-a','SAMPLE-OV-INV-02','manual','sent',date('now','-5 days'),date('now','+25 days'),'Harbor Construction','billing@harbor.example','SAMPLE-OV-101 · Harbor Point Boundary Survey','sample_invoice_overview_token_02',datetime('now','-5 days'),NULL,NULL),
  ('sample-invoice-overview-invoice-03','sample-invoice-overview-project-a1','sample-invoice-overview-client-a','SAMPLE-OV-INV-03','manual','draft',date('now'),date('now','+30 days'),'Harbor Construction','billing@harbor.example','SAMPLE-OV-101 · Harbor Point Boundary Survey','sample_invoice_overview_token_03',NULL,NULL,NULL),
  ('sample-invoice-overview-invoice-04','sample-invoice-overview-project-a1','sample-invoice-overview-client-a','SAMPLE-OV-INV-04','manual','paid',date('now','-80 days'),date('now','-50 days'),'Harbor Construction','billing@harbor.example','SAMPLE-OV-101 · Harbor Point Boundary Survey','sample_invoice_overview_token_04',datetime('now','-80 days'),datetime('now','-40 days'),NULL),
  ('sample-invoice-overview-invoice-05','sample-invoice-overview-project-a1','sample-invoice-overview-client-a','SAMPLE-OV-INV-05','manual','void',date('now','-45 days'),date('now','-15 days'),'Harbor Construction','billing@harbor.example','SAMPLE-OV-101 · Harbor Point Boundary Survey','sample_invoice_overview_token_05',NULL,NULL,datetime('now','-10 days')),
  ('sample-invoice-overview-invoice-06','sample-invoice-overview-project-a2','sample-invoice-overview-client-a','SAMPLE-OV-INV-06','manual','sent',date('now','-40 days'),date('now','-10 days'),'Harbor Construction','billing@harbor.example','SAMPLE-OV-102 · Riverside Warehouse Expansion','sample_invoice_overview_token_06',datetime('now','-40 days'),NULL,NULL),
  ('sample-invoice-overview-invoice-07','sample-invoice-overview-project-b1','sample-invoice-overview-client-b','SAMPLE-OV-INV-07','manual','sent',date('now','-35 days'),date('now','-5 days'),'Cypress Property Group','ap@cypress.example','SAMPLE-OV-201 · Cypress Medical Campus','sample_invoice_overview_token_07',datetime('now','-35 days'),NULL,NULL);

INSERT OR IGNORE INTO invoice_lines(id,invoice_id,kind,description,amount_cents,sort_order)
VALUES
  ('sample-invoice-overview-line-01','sample-invoice-overview-invoice-01','manual','Boundary and control survey',125000,0),
  ('sample-invoice-overview-line-02','sample-invoice-overview-invoice-02','manual','Warehouse site layout',84000,0),
  ('sample-invoice-overview-line-03','sample-invoice-overview-invoice-03','manual','Utility exhibit draft',32000,0),
  ('sample-invoice-overview-line-04','sample-invoice-overview-invoice-04','manual','Topographic survey',45000,0),
  ('sample-invoice-overview-line-05','sample-invoice-overview-invoice-05','manual','Preliminary site plan',28000,0),
  ('sample-invoice-overview-line-06','sample-invoice-overview-invoice-06','manual','Construction staking',61500,0),
  ('sample-invoice-overview-line-07','sample-invoice-overview-invoice-07','manual','Campus control survey',129500,0);

INSERT OR IGNORE INTO invoice_payments(id,invoice_id,source,status,amount_cents,method,paid_at)
VALUES ('sample-invoice-overview-payment-04','sample-invoice-overview-invoice-04','manual','succeeded',45000,'check',datetime('now','-40 days'));
