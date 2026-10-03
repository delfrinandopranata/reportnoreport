# Platform foundation — design

**Date:** 2026-10-03
**Status:** Draft for review
**Sub-project:** 1 of 5 (Platform foundation, including a thin slice of firm provisioning)

## 1. Intent

Turn the browser-only client-money MVP into a multi-tenant SaaS that any firm can use to manage its clients and the money it holds on their behalf (receipts, payments, balances, statements).

**Success looks like:** the platform owner creates a firm in an admin console, the firm's owner accepts an invite, signs in, sets up bank accounts and users, records and imports transactions, and issues statements — with each firm's data invisible to every other firm, enforced by the database.

### Decisions (from brainstorming)

| # | Decision | Choice |
|---|---|---|
| D1 | How firms get onto the platform | Platform owner onboards each firm by hand now; data model ready for self-serve sign-up later |
| D2 | Backend | Supabase (Postgres + row-level security + Auth + Edge Functions + Storage), Singapore region; frontend stays a Vite app on Vercel |
| D3 | Currency | One currency per firm, chosen at creation; never mixed. Several bank accounts per firm, all in that currency |
| D4 | Correcting mistakes | Entries stay freely editable and deletable; a database-level change log records every change |
| D5 | Membership | One person belongs to exactly one firm; the platform owner is a separate super-admin |
| D6 | Frontend data layer | Server-first: pages query only what they show; balances and statements computed in Postgres; TanStack Query for caching |

### Sub-project map

1. **Platform foundation** — this spec.
2. Firm provisioning — the minimal console is in this spec; richer tooling later.
3. Trust and compliance — audit views, locked periods, bank reconciliation.
4. Client communication — emailed statements, reminders, client portal.
5. Billing — plans and subscriptions for self-serve firms.

## 2. Architecture

- **Frontend:** existing Vite + React 19 + TypeScript + Tailwind 4 app, deployed on Vercel. Talks to Supabase with `@supabase/supabase-js` using the public anon key. No custom API server.
- **Supabase project (Singapore):**
  - **Auth:** email + password, invite links, password reset.
  - **Postgres:** all application data.
  - **Row-level security (RLS):** tenant isolation and role permissions.
  - **SQL functions:** balances, ledgers, import, owner rules.
  - **Storage:** firm logos (bucket `logos`, one folder per firm).
  - **Edge Function `admin`:** super-admin operations that need the service-role key (create firm, invite owner, suspend firm). The service-role key exists only there.
- **Browser state:** only per-viewer UI preferences that don't need to follow the user (e.g. selected view). Dashboard layout and table column layouts move to `user_preferences` on the server.

### Tenancy

- Every business table has `firm_id uuid not null references firms`.
- A helper `auth_firm_id()` returns the signed-in person's `profiles.firm_id`; `auth_role()` returns their role.
- RLS policy on every business table: `firm_id = auth_firm_id()` for select; writes additionally require the role to permit the action (matrix in §4).
- Super-admins (`profiles.is_super_admin = true`, `firm_id` null) cannot read firm data through normal RLS. They act through the `admin` Edge Function, which verifies the caller is a super-admin before using the service-role key. **Open as support** calls read-only Edge Function endpoints (`support/clients`, `support/balances`, `support/ledger`) that return one firm's data; each call writes a `change_log` row with action `support_access`. Support mode cannot write.
- A suspended firm (`firms.status = 'suspended'`) or suspended person fails `auth_firm_id()`, so access stops immediately.

### Ready for self-serve (D1)

`firms.status` (`trial | active | suspended`) and `firms.plan` exist from day one. A future public sign-up page calls the same "create firm" path; no restructuring.

## 3. Data model

Common columns on every table: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz`, `updated_at timestamptz`, `created_by uuid`, `updated_by uuid` (references `profiles`). Business tables also carry `firm_id`.

| Table | Columns | Rules |
|---|---|---|
| `firms` | `name`, `trading_name`, `registration_no`, `sst_no`, `phone`, `email`, `website`, `address1`, `address2`, `postcode`, `city`, `state`, `country`, `logo_path`, **`currency`** (ISO 4217, e.g. `MYR`), `statement_note`, `discrepancy_days`, `show_registration_on_statement`, `fy_start_month`, `date_format`, `status`, `plan` | `currency` cannot change once the firm has any transaction (trigger) |
| `profiles` | `user_id` (auth.users), `firm_id` (nullable for super-admins), `name`, `email`, `role` (`owner | admin | accountant | viewer`), `status` (`active | invited | suspended`), `last_active_at`, `is_super_admin` | Unique `email`; exactly one active `owner` per firm (constraint trigger) |
| `bank_accounts` | `firm_id`, `name`, `bank_name`, `account_name`, `account_no`, `is_default`, `is_active` | At most one default per firm; at least one active account before a transaction can be posted |
| `clients` | `firm_id`, `type`, `name`, `registration_no`, `industry`, `contact`, `phone`, `email`, `website`, `address1`, `address2`, `postcode`, `city`, `state`, `country`, `status` (`active | inactive | archived`), `tags text[]`, `assigned_to` (profiles), `notes` | Same fields as today's `Client` |
| `transactions` | `firm_id`, `client_id`, `bank_account_id`, `kind` (`receipt | payment`), `amount_minor bigint > 0`, `date`, `description` | `client_id` and `bank_account_id` must belong to the same firm (FK + check via trigger) |
| `change_log` | `firm_id`, `table_name`, `row_id`, `action` (`insert | update | delete | support_access`), `before jsonb`, `after jsonb`, `actor`, `at` | Written only by triggers / the Edge Function; read-only to owners and admins |
| `user_preferences` | `profile_id`, `key`, `value jsonb` | Readable/writable only by that profile |

**Money:** integers in the currency's minor unit (`amount_minor`). Formatting uses the firm's `currency` with `Intl.NumberFormat`.

### Computed in Postgres (never stored)

- `client_balances(p_from date, p_to date, p_bank_account uuid default null)` → per client: `opening`, `receipts`, `payments`, `closing`, `txn_count`, `last_txn_date`.
- `ledger_lines(p_from date, p_to date, p_client uuid default null, p_bank_account uuid default null)` → transactions in period with `balance` (running, per client when filtered to a client, otherwise across the firm), ordered by `date, created_at`.
- `import_transactions(rows jsonb, new_clients jsonb)` → validates and inserts all rows in one transaction; returns counts or raises with row-level errors. All-or-nothing.

These replace the browser's `statement()` and `totalsByClient()` for display. The browser versions stay for tests only (§6).

## 4. Roles and permissions

Unchanged from today's matrix, now enforced by RLS:

| Action | Owner | Admin | Accountant | Viewer |
|---|---|---|---|---|
| View clients, balances, statements | ✓ | ✓ | ✓ | ✓ |
| Add / edit clients | ✓ | ✓ | ✓ | — |
| Delete clients | ✓ | ✓ | — | — |
| Post / edit / delete transactions | ✓ | ✓ | ✓ | — |
| Manage users | ✓ | ✓ (not the owner) | — | — |
| Manage settings and bank accounts | ✓ | ✓ | — | — |
| Transfer ownership | ✓ | — | — | — |

## 5. Screens and flows

### New

1. **Sign in** — email + password; forgot password; set password from invite link. All other routes require a session; after sign-in the user returns to the page they requested.
2. **Super-admin console (`#admin`)** — visible only to super-admins:
   - Firms list: name, currency, status, plan, user count, last activity.
   - **Create firm:** name, currency, owner name + email → creates `firms` row, creates an invited `profiles` owner, sends the invite.
   - Suspend / reactivate firm.
   - **Open as support:** read-only view of a firm, logged.
3. **Settings › Bank accounts** — list, add, edit (name, bank, account name, account no.), set default, deactivate. Regional card shows the firm currency read-only.

### Changed

4. **Users** — invites send real emails (Supabase Auth); resend invite; "Viewing as" removed.
5. **Record transaction** — adds **Bank account** (defaults to firm default).
6. **Money formatting** — all amounts use the firm's currency instead of hard-coded RM.
7. **Clients (Balances and Transactions)** — adds a **Bank account** filter; data from `client_balances` / `ledger_lines`.
8. **Client profile** — edits save to the server; ledger filter by bank account.
9. **Statement of account** — firm details from `firms`; figures from `ledger_lines`.
10. **Import** — optional **Bank account** column (matched by name; blank → default account); unmatched values are errors; posted via `import_transactions`.

### Removed

"Load sample data", file backup/restore, data undo/redo, "Viewing as".

### Unchanged

Dashboard widgets (layout now stored per user), customisable tables, CSV export, print, statement layout.

### Demo mode

The current browser-only app remains reachable as **Demo** (no sign-in, local data) for sales demos, clearly labelled.

## 6. Errors, security and edge cases

**Security**
- RLS on every table, tested both ways (cross-firm reads return zero rows; each role's writes allowed/denied per §4).
- Service-role key only in the `admin` Edge Function.
- Owner invariants enforced by database triggers.
- Logos: ≤ 200 KB, PNG / JPEG / SVG, path `logos/<firm_id>/…`, readable only by that firm.
- CSV export keeps the spreadsheet formula guard; import validates every row before writing.

**Errors**
- Failed writes keep the form open with input intact and a plain message; no silent failures.
- Import is all-or-nothing in one database transaction.
- Concurrent edits: updates include the `updated_at` the user loaded; if it changed, the save is rejected with "This client was changed by <name> at <time>. Reload to see their changes."
- Expired session → sign-in → back to the same page.

**Edge cases**
- Deleting a client with transactions requires confirmation naming the count; `change_log` keeps the deleted rows.
- Deactivated bank accounts are hidden from new entries; history unaffected.
- Firm currency locked once transactions exist.
- Invite links expire after 7 days; admins can resend.

## 7. Testing

1. **Database tests (pgTAP, local Supabase):** RLS per table per role; firm A vs firm B isolation; owner invariants; suspension; `client_balances` / `ledger_lines` / `import_transactions` against fixed fixtures.
2. **Equivalence test:** one fixture ledger run through the browser `statement()` / `totalsByClient()` and the Postgres functions; results must match exactly.
3. **Unit tests (`node --test`):** formatting with firm currency, CSV import/export, validation.
4. **Browser checks:** sign-in, invite acceptance, create firm, bank accounts, record transaction, import, statement, cross-firm access attempt (must fail), suspended firm.

## 8. Environments and rollout

- **Local:** Supabase CLI (Docker); seed with two demo firms in different currencies.
- **Production:** one Supabase project (Singapore) + Vercel. Schema changes only through versioned migrations in `supabase/migrations/`, applied with the CLI.
- **Rollout:** build foundation → create one pilot firm via the console → onboard it → iterate.

## 9. Out of scope

Self-serve sign-up and billing (sub-project 5), bank reconciliation and locked periods (3), emailed statements and client portal (4), two-factor sign-in, single sign-on, custom domains per firm, multi-firm membership, multi-currency within a firm.

## 10. New dependencies

- `@supabase/supabase-js` — client for Auth, Postgres, Storage.
- `@tanstack/react-query` — server-state caching and loading states.
- Supabase CLI — development only (migrations, local stack, pgTAP).
