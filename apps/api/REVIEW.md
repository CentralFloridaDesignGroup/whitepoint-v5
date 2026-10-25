# API review ? 2026-10-29

This is the post-cleanup snapshot of the V5 Worker. It is a source and local-validation review, not a claim about remote provider accounts.

| Surface | Inventory | Review result |
| --- | ---: | --- |
| Hono routes | 110 handlers, 104 unique method/path pairs | Before and after method/path sets match. Roles, invoice payments, and rate configuration now have focused route owners. The existing origin, CSRF, session, and permission gate remains in `src/index.ts`. |
| D1 | 418 `prepare` sites; seven first-run migrations | The V4 import metadata, replay tables, and origin columns are gone. Weekly hours belongs to migration 0003. Invoice lists select only required columns; shared revision guards, transactions, webhook event IDs, and payout posting state remain. |
| R2 | 17 direct binding operation sites | Brand logos use `BRAND_ASSETS`; client documents, project POs, and issued invoice packets use `RECORD_DOCUMENTS`. Existing upload/DB compensation and permission checks remain. |
| Outbound calls | Brevo, Stripe, and QuickBooks | The API still owns transport and provider state. Stripe confirmation credits D1; QuickBooks payment, fee, and transfer posting waits for a paid and reconciled payout. |
| Scheduled jobs | Timesheet reminders and monthly invoice drafts | Both remain on the Worker scheduled handler and retain New York time gates. |
| API-owned tooling | Local D1 reset plus V5 migrations | V4 import scripts and the standalone weekly-hours migration were removed. |

The shared invoice contract and affected Manage invoice screens no longer carry V4 origin or deposit fields. A malformed invoice issue date now returns a validation response instead of throwing. The API suite, typecheck, Worker dry run, affected app builds, and an isolated seven-migration Wrangler D1 apply validate the local result. Live Stripe, QuickBooks, Brevo, and remote R2 account behavior were not exercised.
