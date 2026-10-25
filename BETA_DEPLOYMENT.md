# Beta deployment guide

This is a runbook, not authorization to deploy. No live Cloudflare, Stripe, QuickBooks, or Brevo state was changed during the pre-beta sweep.

## 1. Release gates

Run from the repository root with the release commit checked out and a clean worktree:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd test
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd build
pnpm.cmd audit --prod
git diff --check
rg -n "v4|legacy_|origin" apps/api packages apps/manage
```

Treat a Wrangler local log-file `EPERM` warning separately from its result. A successful dry-run bundle is a pass; a failed bundle is not.

Apply all seven migrations to a new isolated local D1 store before touching production. Do not reuse the normal local state for this check:

```powershell
$betaD1 = Join-Path $env:TEMP "whitepoint-v5-beta-migrations"
New-Item -ItemType Directory -Force $betaD1 | Out-Null
pnpm.cmd --filter @whitepoint/api exec wrangler d1 migrations apply whitepoint-v5 --local --persist-to $betaD1
```

The required order is `0001_company_initialization.sql` through `0007_invoice_init.sql`. Stop if the isolated migration, schema tests, route-policy parity test, or access-security tests fail.

## 2. Production configuration and secrets

`apps/api/wrangler.toml` must keep production `workers_dev = false`, `preview_urls = false`, and the single custom-domain route `api.whitepointsurvey.com`. Production browser origins are limited to:

- `https://whitepointsurvey.com`
- `https://www.whitepointsurvey.com`
- `https://app.whitepointsurvey.com`
- `https://docs.whitepointsurvey.com`
- `https://payment.whitepointsurvey.com`

Set production secrets interactively; never place values in source, shell history, screenshots, tickets, or logs:

```powershell
pnpm.cmd --filter @whitepoint/api exec wrangler secret put AUTH_BOOTSTRAP_TOKEN --env production
pnpm.cmd --filter @whitepoint/api exec wrangler secret put TOTP_ENCRYPTION_KEY --env production
pnpm.cmd --filter @whitepoint/api exec wrangler secret put BREVO_API_KEY --env production
pnpm.cmd --filter @whitepoint/api exec wrangler secret put QBO_CLIENT_ID --env production
pnpm.cmd --filter @whitepoint/api exec wrangler secret put QBO_CLIENT_SECRET --env production
pnpm.cmd --filter @whitepoint/api exec wrangler secret put STRIPE_SECRET_KEY --env production
pnpm.cmd --filter @whitepoint/api exec wrangler secret put STRIPE_WEBHOOK_SECRET --env production
```

Use a unique high-entropy bootstrap token and a base64-encoded 32-byte TOTP encryption key. Confirm non-secret production values for `BREVO_SENDER_EMAIL`, `QBO_REDIRECT_URI`, `QBO_ENVIRONMENT`, `QBO_MINOR_VERSION`, and `STRIPE_PUBLISHABLE_KEY` before release. The QBO redirect must be exactly `https://api.whitepointsurvey.com/v5/qbo/callback`.

## 3. Database and release order

1. Export or otherwise record a recoverable pre-release D1 snapshot.
2. Apply the pending migrations remotely in numeric order:

   ```powershell
   pnpm.cmd --filter @whitepoint/api exec wrangler d1 migrations apply whitepoint-v5 --remote --env production
   ```

3. Re-run the Worker dry-run from the exact release commit.
4. Deploy the API, then the first-party apps that consume it. Do not enable a `workers.dev` or preview URL as a fallback.
5. Confirm `https://api.whitepointsurvey.com/v5/health/status` and verify that the alternate Worker URLs are unavailable.

## 4. Provider setup

These integrations remain **unverified live** until the checks below are performed.

- **Stripe — unverified:** register only `https://api.whitepointsurvey.com/v5/webhooks/stripe`; configure the resulting signing secret; send signed sandbox events; verify invalid and replayed signatures are rejected or idempotently ignored; confirm checkout, payment credit, refund/dispute hold, automatic payout reconciliation, and delayed QBO posting.
- **QuickBooks Online — unverified:** register the exact callback URL above; complete a sandbox OAuth connection; verify state expiry and single use; check choices, saved settings, disconnect/retry behavior, and client/project/invoice/payment sync.
- **Brevo — unverified:** confirm the sender/domain is authorized; send invitation, reset, contact acknowledgement, application, timesheet, invoice, and payment-notice messages to controlled addresses; verify both HTML and text bodies, attachments, delivery status, and retry behavior.
- **Live webhooks — unverified:** provider dashboards and delivery/retry behavior have not been exercised by local tests or dry-runs.

## 5. Post-deployment access checks

Use separate controlled accounts for super-administrator, delegated administrator, manager, employee, and no-permission roles.

1. Verify missing, expired, revoked, inactive, and pending-MFA sessions cannot reach protected routes.
2. Verify login email and IP limits return generic `429` responses with `Retry-After`, then allow authentication after expiry.
3. Verify missing/wrong CSRF, missing/disallowed origin, wrong method, encoded path, and unknown route requests fail.
4. Verify only `*` can manage super-administrator roles/users. Confirm delegated administrators cannot self-promote, modify higher users/roles, expand beyond their permissions, or use a higher replacement role.
5. Substitute record IDs across projects, invoices, timesheets, documents, and assigned-manager views. Confirm financial fields remain redacted without their specific permissions.
6. Verify public invoice tokens are opaque and token-scoped; validate public form attachment type and size limits.
7. Confirm the removed routes return `404`: `GET /identity/me`, direct `POST /identity/users`, direct `PUT /identity/users/:id`, `GET /records/projects`, `GET /timesheets/weeks`, and `GET /timesheets/review`.

## 6. Observability and rollback

Production Worker logs and traces are sampled in `wrangler.toml`. Watch authentication 401/403/429 rates, route 404s, uncaught errors, Stripe retries, QBO sync errors, Brevo failures, scheduled-job results, D1 latency, and CPU time. Logs must not contain raw credentials, email addresses, IP addresses, session tokens, CSRF values, recovery codes, provider secrets, or public invoice tokens.

For a code regression, stop app rollout and redeploy the last known-good Worker and app commits. Keep the custom-domain-only route and secrets unchanged. For a data regression, stop writes where practical and restore from the recorded D1 recovery point; do not attempt a destructive reverse migration without a reviewed recovery plan. After rollback, repeat health, authentication, authorization, provider, and scheduled-job checks and preserve the incident timeline.
