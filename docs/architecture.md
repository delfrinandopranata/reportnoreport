# Architecture

## Tech stack

**Frontend:** Vite 8, React 19, TypeScript 6, Tailwind CSS 4, dnd-kit (drag-and-drop), TanStack Query 5, Supabase JS client.

**Backend:** Supabase (Postgres 17, Auth, Storage, Edge Functions in Deno 2), Stripe (payments, future), Resend (email delivery).

**Hosting:** Vercel (frontend), Supabase (Singapore region, database + auth + functions), Stripe (test → live).

**Testing:** Node.js `--test` runner (unit), pgTAP (database), Deno (Edge Functions), Supabase CLI local stack.

**Code standards:** British English, integer money (no floats), ISO currency codes (MYR/SGD/USD), row-level security at every boundary.

## Entry points and pages

```
/                   → index.html (homepage, public, no sign-in; Plan B)
/app/               → app/index.html (React app, requires auth; uses hash routes)
                       #signin, #signup, #dashboard, #clients, #settings, #users, #admin
/demo/              → same app as /app/, built with VITE_DEMO=true (no sign-in, no Supabase; src/demo/store.ts)
```

**Hash routes** — the app at `/app/` uses client-side routing:
- `#signin` — sign in by email and password
- `#signup` — create a firm (Plan B): firm name, currency, your name, email, password
- `#dashboard` — drag-and-drop widgets, edit layout
- `#clients` — balances and transactions tabs, filters, export, print, import
- `#clients/<id>` — client profile: tabs (info, ledger, statement), record transaction
- `#settings` — firm details, bank accounts, regional options, logo, statement footer
- `#users` — team list, invite, change role, suspend, transfer ownership
- `#settings/billing` — trial / paid / complimentary / read-only state and pay button (Plan C)
- `#admin` — super-admin console (Plan B): firms list, platform settings, waitlist

## Frontend structure

```
src/
  App.tsx                     — root component, router, session context
  main.tsx                    — entry point
  Dashboard.tsx               — dashboard with draggable widgets
  ClientsPage.tsx             — clients and transactions (tabs, filters)
  ClientProfile.tsx           — client profile: tabs and statement
  Statement.tsx               — printable statement of account
  transfer.tsx                — transfer ownership dialog
  
  data/
    supabase.ts               — typed Supabase client, env validation
    database.types.ts         — generated types from `supabase gen types`
    session.tsx               — SessionProvider, useSession, user/firm/role context
    queries.ts                — TanStack Query hooks (useClients, useLedger, useBalances, etc.)
    mappers.ts                — pure row ↔ model mapping (Client, Txn, Firm, BankAccount, etc.)
    money.ts                  — Intl.NumberFormat helpers (makeMoney, useMoney)
    errors.ts                 — toUserMessage(error, context) — human-readable error messages
    equivalence.db.test.ts    — browser statement() vs SQL functions
    paging.ts                 — fetchAll pagination for queries > 1000 rows
  
  auth/
    AuthPages.tsx             — sign in, forgot password, set password (invite/reset flow)
    route.ts                  — returnTo save/restore (sign-in → requested page)
  
  clients/
    AddClient.tsx             — add or edit a client (modal/page)
    ClientInfo.tsx            — client details panel
    shared.tsx                — shared client fields, country select
    fields.tsx                — client field constants and type guards
  
  settings/
    SettingsPage.tsx          — firm settings form and tabs
    BankAccounts.tsx          — list, add, edit bank accounts; set default
    bankForm.ts               — form logic and validation
    constants.ts              — country/region lists, date format, currencies, logo limits
  
  users/
    UsersPage.tsx             — team management: list, invite, role change, suspend
    rules.ts                  — pure role/permission rules (can, canManageUser, ROLES, GRANTS)
    badges.tsx                — role badge component
  
  home/
    home.ts                   — homepage (Plan B): cap check, waitlist form
    home.css                  — homepage styles
  
  admin/                       — super-admin console (Plan B)
    AdminConsole.tsx          — firms list, create, suspend, extend trial, support view
    api.ts                    — calls to admin Edge Function
  
  widgets.tsx                 — draggable dashboard widgets
  table.tsx                   — customisable table (show/hide columns, resize, sort)
  ui.tsx                      — shared UI components (forms, modals, buttons, tables)
  ledger.ts                   — statement() function (for tests; SQL replaces this in production)
  
  index.css                   — global Tailwind styles
  favicon.svg

supabase/
  config.toml                 — CLI config (API port 54321, DB 54322, Studio 54323, Mailpit 54324)
  seed.sql                    — dev seed: Alpha (MYR), Beta (SGD), super-admin, sample clients/txns
  
  migrations/
    20261003000001_schema.sql           — tables, enums, indexes, stamp_at/by triggers
    20261003000002_tenancy.sql          — auth_firm_id(), auth_role(), auth_can(), firm_can_write(), RLS policies
    20261003000003_invariants.sql       — owner/default/currency/same-firm/billing triggers, change_log
    20261003000004_team.sql             — team RPCs (accept, change role, suspend, reactivate, transfer)
    20261003000005_ledger.sql           — client_balances(), ledger_lines() functions
    20261003000006_import.sql           — import_transactions() all-or-nothing bulk insert
    20261003000007_storage.sql          — logos bucket, RLS policies
    20261003000008_stamp_row.sql        — stamp_row trigger (created_at/by on INSERT, not UPDATE)
    20261003000009_security_hardening.sql — revoke dangerous defaults (public execute on functions)
    20261003000010_client_balances_order.sql — ORDER BY client id for stable paging
    20261004000001_signup.sql           — platform_status(), join_waitlist(), create_firm_for_current_user() (Plan B)
    20261004000002_support.sql          — support_balances(), support_ledger() (Plan B admin console)
  
  functions/
    team/
      index.ts                — Edge Function: invite, resend, remove (service role; caller verified)
      rules.ts                — pure auth rules (canInvite, canChange, canRemove, canTransfer)
      rules.test.ts           — Deno tests
    admin/                    — Edge Function: super-admin operations (Plan B)
      index.ts
      rules.ts
      rules.test.ts
    billing-checkout/         — Edge Function: create Stripe Checkout Session (Plan C)
    stripe-webhook/           — Edge Function: verify and apply Stripe webhook (Plan C)
  
  templates/
    invite.html               — branded invite email (Resend SMTP)
    recovery.html             — branded password reset email
    confirmation.html         — branded sign-up confirmation email
    email_change.html         — branded email change confirmation
  
  tests/
    *.test.sql                — pgTAP tests (schema, isolation, roles, invariants, writes, ledger, import, team, signup)

.env.example                  — VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
.env.local (git-ignored)      — real values from `supabase status -o env`

scripts/
  build-demo.sh               — builds the current tree with VITE_DEMO=true at /demo/ during vite build
```

## Data flow: a read (e.g., fetch clients)

1. **Browser** → `useClients()` hook in `src/data/queries.ts`
2. **TanStack Query** checks cache; if stale or missing, calls the fetcher
3. **Fetcher** → `supabase.from('clients').select(...).eq('firm_id', auth_firm_id()).range(offset, limit)` via RLS
4. **Postgres RLS** — checks `auth_firm_id()` (JWT `sub` claim), returns only rows where `firm_id = auth_firm_id()`
5. **Rows** → JS client deserialises; `mappers.ts` transforms DB rows to model `Client[]`
6. **Component** receives typed `Client[]`, renders

**Key point:** RLS is the security boundary. The app never manually filters by `firm_id`. Every row read from a business table is guaranteed to belong to the signed-in person's firm.

## Data flow: a write (e.g., edit a client)

1. **Browser form** → `updateClient(firmId, clientId, updates)` in `src/data/queries.ts`
2. **TanStack Query** mutation:
   - Validate amount/email/etc. on the client
   - Send `supabase.from('clients').update(updates).eq('id', clientId)` + `eq('firm_id', auth_firm_id())`
3. **Postgres RLS**:
   - Read policy: is `firm_id = auth_firm_id()`? (blocks cross-firm edits)
   - Write policy: read + `firm_can_write(firm_id)` true? (blocks trial-expired, suspended, read-only firms) + role permits the action (triggers on update enforce this)
4. **Trigger** `log_change()` writes a `change_log` row before commit
5. **Success** → refresh the list cache; component shows new data
6. **Error** → `toUserMessage()` formats it (e.g., "Your trial has ended. Pay RM 10 to keep editing.") or reports a conflict ("This was changed by Alice at 3 pm")

**Key point:** Write failures are explicit. If `firm_can_write` is false, RLS rejects the attempt with a clear reason. If concurrent edits conflict, the second edit is rejected, not overwritten.

## Backend: Edge Functions

Three Edge Functions hold server secrets (Supabase service role, Stripe secret, Resend API key):

- **`team`** — invite, resend invite, remove from firm (caller must be admin/owner in that firm)
- **`admin`** — create firm, suspend, extend trial, mark complimentary, support view (caller must be super-admin; uses service role to bypass RLS)
- **`billing-checkout`** (Plan C) — create Stripe Checkout Session for the caller's firm (caller must be owner)
- **`stripe-webhook`** (Plan C) — verify Stripe signature, record payment/refund, update `billing_status`

All functions request are authenticated via `Authorization: Bearer <access_token>` (set by the JS client automatically).

## RLS security model

Every business table (`clients`, `transactions`, `bank_accounts`, `firms` membership view, `change_log`) has:

- **Read policy:** `firm_id = auth_firm_id()` — only rows belonging to your firm
- **Write policy:** read + `firm_can_write(firm_id) = true` + role permits the action

`firm_can_write(firm)` returns true when:
- The firm is not suspended (`status = 'active'`), AND
- `billing_status` is `'paid'` or `'complimentary'`, OR
- `billing_status = 'trial'` AND `now() < trial_ends_at`

Super-admins (`is_super_admin = true`, `firm_id = null`) cannot read firm data through RLS. They act only through the `admin` Edge Function, which uses the service role to read/write as needed, with every read written to `change_log` action `support_access`.

## Tenancy helpers (SQL functions)

- **`auth_firm_id()`** — returns the signed-in person's `firm_id` (null if suspended or a super-admin)
- **`auth_role()`** — returns the signed-in person's `role` (null if not in a firm)
- **`auth_can(action text)`** — returns true if the role permits the action (e.g., `auth_can('clients.edit')`)
- **`firm_can_write(firm_id uuid)`** — true if the firm can write (not suspended, trial/paid/complimentary)
- **`firm_write_block_reason(firm_id uuid)`** — human-readable reason for a write block, or null

These functions are called by RLS policies, migrations, and Edge Functions to enforce rules consistently.

## Data computed in Postgres (never stored)

- **`client_balances(p_from date, p_to date, p_bank_account uuid default null)`** → opening/receipts/payments/closing/txn_count/last_txn_date per client
- **`ledger_lines(p_from date, p_to date, p_client uuid default null, p_bank_account uuid default null)`** → transactions in period with running balance
- **`import_transactions(rows jsonb, new_clients jsonb)`** → validate and insert all in one transaction; row-level errors if any fail
- **`create_firm_for_current_user(p_firm_name text, p_currency text, p_person_name text) returns uuid`** — self-serve sign-up (verifies email, checks cap under row lock, creates firm + owner profile + default bank account)
- **`platform_status()`** → `{"accepting_signups": boolean}` (anon-readable; true if self-serve count < cap)
- **`join_waitlist(p_email text, p_firm_name text)`** → add to waitlist (rate-limited per email per day)
- **`load_sample_data()` / `remove_sample_data()`** — owner/admin only; insert or delete sample rows (marked `is_sample = true`)

Browser equivalents of `client_balances` and `ledger_lines` are kept in `src/ledger.ts` for testing only.

## Change log

Every write (insert, update, delete) triggers `log_change()` which records:
- `firm_id`, `table_name`, `row_id` (UUID of the changed row, or the firm ID for firm-level changes)
- `action` (`insert`, `update`, `delete`, `support_access`, `billing`)
- `before` / `after` (JSONB of the row before/after; nulls if not applicable)
- `actor` (profile ID of the person who changed it, or null for triggers)
- `at` (timestamp)

This allows owners and admins to see a full audit trail in the Settings › Audit view (future).

Deletions are logical — the transaction is recorded in `change_log` so it's recoverable, but removed from the live tables. This is why you can delete a client with transactions: the transactions are removed, and the change log records the deletion.

## Schema overview

All common tables have: `id uuid`, `created_at timestamptz`, `updated_at timestamptz`, `created_by uuid`, `updated_by uuid`.

Business tables also have `firm_id uuid references firms(id)`.

| Table | Rows represent | Key columns |
|---|---|---|
| `firms` | Tenant organisations | `id`, `name`, `currency` (ISO), `billing_status`, `trial_ends_at`, `paid_at`, `source` (`self_serve`/`admin`), `status` (`active`/`suspended`) |
| `profiles` | Users (one per person per firm; super-admins have `firm_id = null`) | `id`, `user_id` (FK auth.users), `firm_id`, `email`, `role`, `status` (`active`/`invited`/`suspended`), `is_super_admin` |
| `bank_accounts` | Firm bank accounts | `firm_id`, `name`, `bank_name`, `account_name`, `account_no`, `is_default`, `is_active` |
| `clients` | Client organisations | `firm_id`, `name`, `type`, `status` (`active`/`inactive`/`archived`), `contact`, `email`, `website`, `address1`–`postcode`, `city`, `state`, `country`, `registration_no`, `industry`, `tags[]`, `assigned_to` (FK profiles), `notes`, `is_sample` |
| `transactions` | Receipts and payments | `firm_id`, `client_id`, `bank_account_id`, `kind` (`receipt`/`payment`), `amount_minor` (integer, >0), `date`, `description`, `is_sample` |
| `change_log` | Audit trail | `firm_id`, `table_name`, `row_id`, `action`, `before` / `after` (JSONB), `actor`, `at` |
| `user_preferences` | Per-user client state | `profile_id`, `key`, `value` (JSONB); keys: `dashboard`, `table.*`, `tour`, `checklist` |
| `bank_accounts` | (see above) | |
| `platform_settings` | System config | Single row: `firm_cap` (default 5), `trial_days` (default 14) |
| `waitlist` | Firms waiting for access | `email`, `firm_name`, `created_at` |
| `stripe_events` | Idempotency guard for webhook | `event_id` (unique), `type`, `received_at` |

See [data-model-and-security.md](./data-model-and-security.md) for the full data model with constraints, triggers and RLS rules.
