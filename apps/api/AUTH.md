# Staff authentication

The API owns staff identity, sessions, and permissions in D1. Manage and Docs use the same API cookie, so a completed sign-in works in both apps. Payment and main remain public.

## Local setup

1. Copy `.dev.vars.example` to `.dev.vars` and set four real values. Use 32 random bytes for `AUTH_BOOTSTRAP_TOKEN` and a separate 32 random bytes, base64 encoded, for `TOTP_ENCRYPTION_KEY`. Do not commit `.dev.vars`.
2. Set `BREVO_SENDER_EMAIL` to a verified Brevo sender and provide its API key as `BREVO_API_KEY`. The API sends invitation and reset links through Brevo. Without those values, the local administrator setup and sign-in still work, but email delivery fails.
3. Run `pnpm d1:reset` only when the local D1 contents are disposable, then run `pnpm dev:manage` and `pnpm dev:docs`. The reset command operates on the API's local Wrangler D1 state.
4. Open Manage `/login`, choose **First administrator setup**, enter the bootstrap token and a new password of at least 15 characters, then scan the authenticator QR code (or enter its setup key) and confirm the six-digit TOTP code. Save the recovery codes generated after confirmation. You may then add a passkey. The seeded administrator is `nwhite@whitepointsurvey.com`. The setup endpoint is single use.

In deployment, configure `AUTH_BOOTSTRAP_TOKEN`, `TOTP_ENCRYPTION_KEY`, and `BREVO_API_KEY` as Worker secrets; set the verified sender in configuration. Never put these values in a Vite variable. Keep the TOTP encryption key stable across releases or existing TOTP credentials cannot be read. The current production settings allow only the Manage and Docs origins and use `whitepointsurvey.com` as the WebAuthn RP ID. Localhost has a separate cookie name and RP ID for development.

Users are invitation-only. Administrators can resend invitations or initiate factor recovery from Manage's **Users & access** screen. Public password reset emails do not remove enrolled factors. Administrator recovery does remove the target's factors and sessions after delivery, requiring fresh enrollment on the next sign-in.

All staff members must enroll TOTP during account setup or administrator-assisted recovery. A passkey is optional and may be added after TOTP and recovery codes are established. A registered passkey can be used for later sign-ins.

Passkey sign-in can discover an account's saved passkey without entering an email. If an older authenticator does not offer its passkey in that prompt, enter the account email before choosing **Use passkey**; the API will request that account's saved credential explicitly.

The Worker Free tier has a 10 ms CPU limit; the local workerd password hash and verification took about 167 ms wall time each in the initial smoke test. This is not a CPU measurement. Validate actual CPU usage on the intended Cloudflare tier before deployment. Do not lower the 600,000-iteration password work factor to fit a tier.
