# Invoice overview preview data

Use the local-only seed to preview the Manage invoice overview with two sample companies, three projects, and sent, overdue, draft, paid, and void invoices:

```powershell
pnpm --filter @whitepoint/api d1:sample-invoices seed
```

The script always invokes Wrangler with `--local`; it cannot target remote D1. It does not reset the database or apply migrations. Apply the current local migrations first if the invoice tables do not exist.

Remove only these fixture records when finished:

```powershell
pnpm --filter @whitepoint/api d1:sample-invoices clean
```

Both actions are safe to repeat. The fixture project manager is the active local `nwhite@whitepointsurvey.com` account when present, and the records do not create QuickBooks, Stripe, email, or R2 activity.
