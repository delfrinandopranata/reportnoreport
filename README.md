# Platform Internal

Client accounts MVP: record receipts and payments per client, track client funds held, and review each client ledger — on a drag-and-drop dashboard.

**Stack:** React 19 · TypeScript · Vite · Tailwind CSS 4 · dnd-kit · zustand · zundo (undo/redo)

## Run

```bash
pnpm install
pnpm dev
```

- `pnpm build` — typecheck + production build (`dist/`)
- `pnpm test` — ledger maths (`node --test`, no extra deps)

## What's in it

- **Dashboard** — "Edit layout" to drag (pointer or keyboard), resize, add and remove widgets: client funds held, total receipts, total payments, active clients, cash flow, client balances, recent transactions, record transaction.
- **Clients** — one page for every client account:
  - **Balances** view: opening, receipts, payments, closing balance per client for the period; select a client for their profile.
  - **Transactions** view: every receipt and payment across all clients in one ledger, with running balance; group by client or month (collapsible, subtotals).
  - Period presets, search, client filter, debit balances only, receipts/payments filter, sortable columns.
  - **Customisable table** — show/hide and reorder columns, drag column edges to resize, compact or comfortable rows (remembered per browser).
  - **Import** transactions from CSV (new clients created by name, duplicates skipped, row-level errors), **Export** the current table to CSV, **Print** the current table (A4 landscape).
- **Client profile** — KPIs, cash flow, client ledger with running balance, record transaction, printable **statement of account** (A4 / PDF).
- **Undo / redo** — every data and layout change (⌘Z / ⇧⌘Z).
- Data lives in the browser (`localStorage`); first load seeds demo data. Amounts are stored as integer sen, currency MYR (RM).

## Deploy

Vercel auto-detects Vite: build `pnpm build`, output `dist`.

## Users and Settings

- **Users** (`#users`): team list, invite, change role, suspend/reactivate, remove, transfer ownership, plus a roles and permissions table. Roles are `owner`, `admin`, `accountant`, `viewer`. Rules (permission matrix, one owner, unique emails) live in `src/users/rules.ts` and are tested in `src/users.test.ts`; other modules gate actions with `can(role, action)` from `src/users/store.ts`.
- **There is no sign-in yet.** "Viewing as" previews a role on this device. Real authentication and per-business data separation arrive with the backend; the `User` shape (ids, ISO timestamps, no derived data) maps 1:1 to it.
- **Settings** (`#settings`, `src/settings/`): organisation, statement footer and bank details, regional options and JSON backup/restore of all app data. Only `settings.manage` roles can edit. The statement reads these values.
- Persisted under `platform-internal-users` and `platform-internal-settings` (the main data stays under `platform-internal`).

## Email (Resend)

Hosted Supabase Auth emails (invite, confirmation, password reset, email change) go out through Resend SMTP using the branded templates in `supabase/templates/`. Local development uses Mailpit (http://127.0.0.1:54324); nothing is really sent. The `[auth.email.smtp]` block in `supabase/config.toml` is written but `enabled = false`.

Go-live checklist (hosted project; the local `config.toml` does not reach it automatically):

1. Resend: add your sending domain and verify it (SPF and DKIM DNS records), then create an API key with sending access.
2. Supabase dashboard > Authentication > SMTP Settings: enable custom SMTP with host `smtp.resend.com`, port `465`, user `resend`, password = the API key, sender `no-reply@mail.<your-domain>`, sender name `Platform`.
3. Authentication > Email Templates: paste each file from `supabase/templates/` with its subject (same as `config.toml`):
   - Invite user (`invite.html`): `You've been invited to Platform`
   - Reset password (`recovery.html`): `Reset your Platform password`
   - Confirm sign up (`confirmation.html`): `Confirm your Platform email address`
   - Change email address (`email_change.html`): `Confirm your new Platform email address`
4. Authentication > Providers > Email: set OTP expiry to `86400` (24 hours, the hosted maximum).
5. Authentication > URL Configuration: Site URL = the production app URL; Redirect URLs include `<app-url>/app?flow=set-password` and `<app-url>/**`.
6. Authentication > Rate Limits: raise the email rate limit from the default.
7. Send a test invite and check it arrives, the branding renders and the link works.

Warning: do NOT run `supabase config push` for auth while `[auth.email.smtp] enabled = false` locally. It would push that setting and turn Resend off in production.

`supabase secrets set RESEND_API_KEY=...` is only needed once Edge Functions send email through the Resend API directly. It is not needed yet.

Never commit the API key. `supabase/.env.example` lists the variable names; real `.env` files are git-ignored.
