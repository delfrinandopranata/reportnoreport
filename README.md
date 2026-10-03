# ReportNoReport

Report without complicated reporting — client-money ledgers and statements for professional firms.

Repository: https://github.com/delfrinandopranata/reportnoreport

Client accounts MVP: record receipts and payments per client, track client funds held, and review each client ledger — on a drag-and-drop dashboard.

**Stack:** React 19 · TypeScript · Vite · Tailwind CSS 4 · dnd-kit · TanStack Query · Supabase (Postgres, Auth, Storage, Edge Functions)

## Run locally

```bash
brew install supabase/tap/supabase deno
pnpm install
supabase start            # local Postgres, Auth, Storage, Mailpit (emails) at http://127.0.0.1:54324
supabase db reset         # migrations + seed
cp .env.example .env.local  # then paste ANON_KEY from `supabase status`
pnpm dev
```

Seed users (password `password123`): `owner@alpha.test`, `admin@alpha.test`, `accountant@alpha.test`, `viewer@alpha.test` (Alpha Advisory, MYR), `owner@beta.test` (Beta Partners, SGD).

## Tests

- `pnpm test` — unit tests
- `supabase test db` — database tests (RLS, roles, invariants, ledger, import, team)
- `pnpm test:db` — browser maths vs SQL equivalence (needs `supabase start`)
- `deno test supabase/functions` — Edge Function rules

## What's in it

- **Dashboard** — "Edit layout" to drag (pointer or keyboard), resize, add and remove widgets: client funds held, total receipts, total payments, active clients, cash flow, client balances, recent transactions, record transaction.
- **Clients** — one page for every client account:
  - **Balances** view: opening, receipts, payments, closing balance per client for the period; select a client for their profile.
  - **Transactions** view: every receipt and payment across all clients in one ledger, with running balance; group by client or month (collapsible, subtotals).
  - Period presets, search, client filter, debit balances only, receipts/payments filter, sortable columns.
  - **Customisable table** — show/hide and reorder columns, drag column edges to resize, compact or comfortable rows (remembered per browser).
  - **Import** transactions from CSV (new clients created by name, duplicates skipped, row-level errors), **Export** the current table to CSV, **Print** the current table (A4 landscape).
- **Client profile** — KPIs, cash flow, client ledger with running balance, record transaction, printable **statement of account** (A4 / PDF).
- Data lives in Supabase, separated per firm by row-level security. Amounts are stored as integer minor units in the firm's currency.

## Deploy

For a complete hosted deployment (Supabase, Vercel, Resend), see [docs/operations.md](docs/operations.md) § Hosted deployment checklist.

Vercel auto-detects Vite: build `pnpm build`, output `dist`. Environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must be set in Vercel or `.env.local` locally.

## Users and Settings

- **Users** (`#users`): team list, invite, change role, suspend/reactivate, remove, transfer ownership, plus a roles and permissions table. Roles are `owner`, `admin`, `accountant`, `viewer`. The rules are enforced in the database; the UI gates actions with `can(role, action)` from `src/users/rules.ts`.
- **Settings** (`#settings`, `src/settings/`): organisation, bank accounts, statement footer and regional options. Only `settings.manage` roles can edit. The statement reads these values.
- **Billing** (`#settings/billing`): pay MYR 10.00 one-time via Stripe (owners only). After payment, the firm is marked `paid` and can record transactions. Refunds set the firm to `read_only`. See [docs/operations.md](docs/operations.md) § Stripe Setup and Operations for local testing and deployment.

## Email (Resend)

Hosted Supabase Auth emails (invite, confirmation, password reset, email change) go out through Resend SMTP using the branded templates in `supabase/templates/`. Local development uses Mailpit (http://127.0.0.1:54324); nothing is really sent. The `[auth.email.smtp]` block in `supabase/config.toml` is written but `enabled = false`.

Go-live checklist (hosted project; the local `config.toml` does not reach it automatically):

1. Resend: add your sending domain and verify it (SPF and DKIM DNS records), then create an API key with sending access.
2. Supabase dashboard > Authentication > SMTP Settings: enable custom SMTP with host `smtp.resend.com`, port `465`, user `resend`, password = the API key, sender `no-reply@mail.<your-domain>`, sender name `ReportNoReport`.
3. Authentication > Email Templates: paste each file from `supabase/templates/` with its subject (same as `config.toml`):
   - Invite user (`invite.html`): `You've been invited to ReportNoReport`
   - Reset password (`recovery.html`): `Reset your ReportNoReport password`
   - Confirm sign up (`confirmation.html`): `Confirm your ReportNoReport email address`
   - Change email address (`email_change.html`): `Confirm your new ReportNoReport email address`
4. Authentication > Providers > Email: set OTP expiry to `86400` (24 hours, the hosted maximum).
5. Authentication > URL Configuration: Site URL = the production app URL; Redirect URLs include `<app-url>/app/?flow=set-password` and `<app-url>/**`.
6. Authentication > Rate Limits: raise the email rate limit from the default.
7. Send a test invite and check it arrives, the branding renders and the link works.

Warning: do NOT run `supabase config push` for auth while `[auth.email.smtp] enabled = false` locally. It would push that setting and turn Resend off in production.

`supabase secrets set RESEND_API_KEY=...` is only needed once Edge Functions send email through the Resend API directly. It is not needed yet.

Never commit the API key. `supabase/.env.example` lists the variable names; real `.env` files are git-ignored.

## Edge Function secrets

The `team` function builds invite links from the `APP_URL` secret. Locally, copy `supabase/functions/.env.example` to `supabase/functions/.env.local` (git-ignored). On the hosted project, set it to the production app URL; without it the function refuses to send invites:

```bash
supabase secrets set APP_URL=https://<app-host>
```
