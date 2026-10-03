# Data Model and Security

## Tables and constraints

All tables have standard columns: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz`, `updated_at timestamptz`, `created_by uuid` (FK `auth.users(id)`), `updated_by uuid` (FK `auth.users(id)`). Business tables also have `firm_id uuid not null references firms(id) on delete cascade`.

### Core tables

| Table | Columns | Constraints | Notes |
|---|---|---|---|
| `firms` | `id`, `name`, `currency` (ISO 4217), `status` (`active`/`suspended`), `source` (`self_serve`/`admin`), `billing_status` (`trial`/`paid`/`complimentary`/`read_only`), `trial_ends_at`, `paid_at`, `stripe_customer_id`, `stripe_checkout_session_id`, `stripe_payment_intent_id`, `logo_path`, `trading_name`, `email`, `phone`, `website`, `registration_no`, `sst_no`, `address1`, `address2`, `postcode`, `city`, `state`, `country`, `fy_start_month`, `date_format`, `discrepancy_days`, `statement_note`, `show_registration_on_statement` | Non-null: `name`, `currency`, `status`, `source`, `billing_status`. Unique: none (multiple firms may have the same name). `currency` cannot change once any transaction exists (trigger). `billing_status` / `trial_ends_at` / `paid_at` / Stripe IDs writable only by service-role (Edge Functions), never by firm users. | Tenant root; each firm's data is isolated by `firm_id`. |
| `profiles` | `id`, `user_id` (FK `auth.users`), `email`, `name`, `firm_id` (nullable), `role` (`owner`/`admin`/`accountant`/`viewer`), `status` (`active`/`invited`/`suspended`), `is_super_admin` (boolean), `last_active_at` | Unique: `email` (only one profile per email across the platform). Exactly one active `owner` per firm (constraint trigger). Super-admins have `firm_id = null` and `is_super_admin = true`. | One person = one firm (Spec D5). Super-admins are platform ops, not firm users. |
| `bank_accounts` | `firm_id`, `name`, `bank_name`, `account_name`, `account_no`, `is_default` (boolean), `is_active` (boolean), `is_sample` (boolean) | Non-null: `firm_id`, `name`. At most one `is_default = true` per firm (trigger). Deactivated accounts hidden from new entries; existing transactions unaffected. | Receipts and payments are posted to a bank account. Default account is auto-selected in the UI. |
| `clients` | `firm_id`, `name`, `type` (`individual`/`company`/`lp`), `status` (`active`/`inactive`/`archived`), `contact`, `email`, `phone`, `website`, `address1`, `address2`, `postcode`, `city`, `state`, `country`, `registration_no`, `industry`, `tags` (text[]), `assigned_to` (FK `profiles`, nullable), `notes`, `is_sample` | Non-null: `firm_id`, `name`. Cascade on firm delete; deleting a client requires confirmation if it has transactions (the transactions remain in `change_log`). | Client master; no soft-delete — deleted clients are logical in the change log only. |
| `transactions` | `firm_id`, `client_id` (FK), `bank_account_id` (FK), `kind` (`receipt`/`payment`), `amount_minor` (bigint > 0), `date`, `description`, `is_sample` | Non-null: all except `description`. Both `client_id` and `bank_account_id` must reference the same firm (trigger). `amount_minor` capped at 1e13 (100 billion major units) so values stay exact as JavaScript numbers. | Money is always integer minor units. No currency field here; currency is inherited from `firms`. Receipts and payments are immutable once posted (update creates a new transaction, old one deleted). |
| `change_log` | `id` (auto-increment), `firm_id` (nullable), `table_name`, `row_id`, `action` (`insert`/`update`/`delete`/`support_access`/`billing`), `before` (JSONB), `after` (JSONB), `actor` (UUID, nullable), `at` (timestamptz) | Non-null: `table_name`, `action`, `at`. Unique: none. Append-only; never updated or deleted. | Audit trail. Readable by owners and admins. Service role writes via triggers + admin Edge Function. `firm_id` is null for system-level actions (billing, support access). |
| `user_preferences` | `profile_id` (FK), `key` (text), `value` (JSON), `updated_at` | Non-null: `profile_id`, `key`, `value`. Unique: `(profile_id, key)`. Only that profile can read/write. | Stores UI state per user: dashboard layout, table column preferences, tour progress, checklist state. Keys are dot-separated: `dashboard`, `table.clients`, `table.transactions`, `tour`, `checklist`. |
| `platform_settings` | `id` (boolean, always true), `firm_cap` (integer, default 5), `trial_days` (integer, default 14) | Single row. Writable only by super-admin via `admin` Edge Function. | System-wide defaults. `firm_cap` is the self-serve firm limit; `trial_days` is the trial period. |
| `waitlist` | `id`, `email`, `firm_name`, `created_at` | Non-null: `email`, `firm_name`. Unique: none (same firm can re-apply). At most 1 insert per email per 24h (rate limit). | Public, anonymous insert-only. Readable by super-admin. |
| `stripe_events` | `event_id` (text, unique), `type` (text), `received_at` (timestamptz) | Unique: `event_id`. | Idempotency guard. Webhook retries are no-ops because `event_id` is checked before applying. |

## SQL Functions (Computed)

### Tenancy helpers

These functions derive the signed-in person's context from the JWT and enforce security rules.

```sql
auth_firm_id()          — returns the signed-in person's firm_id (uuid, or null if suspended/super-admin)
auth_role()             — returns the signed-in person's role (member_role enum, or null if not in a firm)
auth_can(action text)   — returns true if the role permits the action
                          Actions: 'clients.edit', 'clients.delete', 'transactions.post', 
                          'transactions.delete', 'users.manage', 'settings.manage'
firm_can_write(firm_id) — returns true iff the firm is not suspended AND
                          (billing_status IN ('paid', 'complimentary') 
                           OR (billing_status = 'trial' AND now() < trial_ends_at))
firm_write_block_reason(firm_id)  — returns a human-readable reason if the firm can't write, or null
```

### Business logic (Plan A)

```sql
client_balances(p_from date, p_to date, p_bank_account uuid = null)
  RETURNS TABLE (
    client_id uuid, client_name text,
    opening bigint, receipts bigint, payments bigint, closing bigint,
    txn_count integer, last_txn_date date
  )
  — Opening balance at p_from, receipts and payments in [p_from, p_to],
    closing balance at p_to, transaction count, last transaction date.
  — Ordered by client ID (stable for paging).
  — If p_bank_account given, filters to that account.
  — Called by the Clients › Balances tab and statements.

ledger_lines(p_from date, p_to date, p_client uuid = null, p_bank_account uuid = null)
  RETURNS TABLE (
    txn_id uuid, date date, description text, kind txn_kind, amount_minor bigint,
    client_id uuid, client_name text, bank_account_id uuid, bank_name text,
    balance bigint, running_balance bigint
  )
  — All transactions in [p_from, p_to] with running balance.
  — If p_client given, running balance is per that client only; otherwise, firm-wide.
  — If p_bank_account given, filters to that account.
  — Ordered by date, then created_at (stable for paging).
  — Called by the Clients › Transactions tab, Client profile › Ledger, and statements.

import_transactions(rows jsonb, new_clients jsonb)
  RETURNS TABLE (error_count integer, errors jsonb)
  — Validates and inserts all transactions in one transaction.
  — rows: [{ date, description, kind, amount_minor, client_name, bank_account, ... }, ...]
  — new_clients: [{ name, type, ... }, ...] (clients to create if they don't exist)
  — Returns row-level errors (e.g., "Row 5: invalid date") and total error count.
  — All-or-nothing: if any row fails validation, nothing is written and all errors are reported.
  — Called by the CSV import modal.
```

### Business logic (Plan B)

```sql
create_firm_for_current_user(p_firm_name text, p_currency text, p_person_name text)
  RETURNS uuid (firm_id)
  — For a verified user with no firm: checks the self-serve cap under a row lock,
    creates the firm (status = 'active', source = 'self_serve',
    billing_status = 'trial', trial_ends_at = now() + trial_days),
    creates the Owner profile, and a default bank account.
  — Raises P0001 with exact message if:
      'Verify your email address before creating your firm.'
      'You already belong to a firm.'
      'EARLY_ACCESS_FULL' (cap reached; frontend detects this token)
      'Choose MYR, SGD or USD.'
      'Enter your firm name.' or 'Enter your name.'
  — Called by SessionProvider on first verified sign-in.

platform_status()
  RETURNS jsonb { "accepting_signups": boolean }
  — True if self-serve firm count < firm_cap.
  — Anon-readable. Called by the homepage and sign-up UI.

join_waitlist(p_email text, p_firm_name text)
  RETURNS void
  — Idempotent per email (case-insensitive). At most 1 insert per email per 24h.
  — Raises P0001 'Enter a valid email address.' if email is invalid.
  — Called by the homepage and sign-up waitlist form.

load_sample_data()  / remove_sample_data()
  — Owner/Admin only.
  — load_sample_data: inserts 1 sample bank account, 8 sample clients, ~150 sample transactions.
  — remove_sample_data: deletes all rows where is_sample = true (transactions first, then clients, then bank account).
  — If real rows reference a sample client (e.g., real transactions with a sample client),
    removal is blocked with "Cannot remove sample data: real transactions exist for <client>".
```

### Support (Plan B)

```sql
support_balances(firm_id uuid, p_from date, p_to date)
support_ledger(firm_id uuid, p_from date, p_to date)
  — Service-role-only (no RLS; read all firms).
  — Called by the admin Edge Function for the super-admin support view.
  — Results are logged to change_log action 'support_access'.
```

## Row-level security (RLS)

Every business table (`clients`, `transactions`, `bank_accounts`, `change_log` for firm-level rows) has policies:

**Read policy:** `firm_id = auth_firm_id()` — only own firm's rows are visible.

**Write policy (Insert/Update/Delete):** `firm_id = auth_firm_id() AND firm_can_write(firm_id) AND auth_can(<action>)`

The `auth_can(<action>)` part is enforced by the database:
- Inserting a transaction calls a trigger that checks `auth_can('transactions.post')`
- Updating a client calls a trigger that checks `auth_can('clients.edit')`
- Deleting a client calls a trigger that checks `auth_can('clients.delete')`
- Etc.

**Bypass:** Service role (used by Edge Functions) bypasses RLS entirely. The app never uses service role from the browser.

**Super-admin:** Super-admins cannot read firm data through RLS (firm_id = null). They access everything via the `admin` Edge Function, which logs each read to `change_log` action `support_access`.

## Roles and permissions matrix

| Action | Owner | Admin | Accountant | Viewer |
|---|---|---|---|---|
| View (all) | ✓ | ✓ | ✓ | ✓ |
| Clients › edit | ✓ | ✓ | ✓ | — |
| Clients › delete | ✓ | ✓ | — | — |
| Transactions › post / edit / delete | ✓ | ✓ | ✓ | — |
| Import transactions | ✓ | ✓ | ✓ | — |
| Load / remove sample data | ✓ | ✓ | — | — |
| Users › manage | ✓ | ✓ (not owner) | — | — |
| Settings › manage (firm, bank accounts) | ✓ | ✓ | — | — |
| Billing › pay | ✓ | — | — | — |
| Ownership › transfer | ✓ | — | — | — |

Enforced via `auth_can()` in triggers (insert/update/delete checks) and in the app via `can(role, action)` from `src/users/rules.ts` (UI gates).

## Triggers and constraints

### Automatic timestamps and actor tracking

- `stamp_row` — On INSERT, set `created_at := now()`, `created_by := auth.uid()`. These are never updated.
- On UPDATE (trigger on all business tables), set `updated_at := now()`, `updated_by := auth.uid()`.

### Invariants

- **Owner uniqueness:** Exactly one active `owner` per firm (trigger on `profiles` insert/update).
- **Default bank account:** At most one `is_default = true` per firm (trigger on `bank_accounts` insert/update).
- **Currency lock:** `currency` cannot change once `transactions` exist for that firm (trigger on `firms` update).
- **Same-firm referencing:** Both `client_id` and `bank_account_id` in a `transaction` must belong to the same `firm_id` (trigger on `transactions` insert/update).
- **Billing column lock:** `billing_status`, `trial_ends_at`, `paid_at`, `stripe_*` are never writable by firm users; only service role (Edge Functions) can write them (RLS revokes on UPDATE).

### Change log

Every INSERT/UPDATE/DELETE on a business table triggers `log_change()`, which records the row before and after in `change_log` with the action type and the actor's profile ID. This is audit-trail only; the log is append-only and never modified. Soft-delete: when a client is deleted, the transaction rows are also deleted, but both deletions are recorded in the log so they're recoverable.

## Grants (function execute permissions)

| Function | Anon | Authenticated | Service Role |
|---|---|---|---|
| `platform_status()` | ✓ | ✓ | (N/A) |
| `join_waitlist()` | ✓ | ✓ | (N/A) |
| `create_firm_for_current_user()` | — | ✓ | — |
| `client_balances()` | — | ✓ (RLS filtered) | ✓ |
| `ledger_lines()` | — | ✓ (RLS filtered) | ✓ |
| `import_transactions()` | — | ✓ (RLS filtered) | ✓ |
| `load_sample_data()` | — | ✓ (role gated) | ✓ |
| `remove_sample_data()` | — | ✓ (role gated) | ✓ |
| `accept_invite()`, `change_role()`, `suspend_profile()`, `reactivate_profile()`, `transfer_ownership()`, `touch_last_active()` | — | ✓ (role gated) | ✓ |
| `support_balances()`, `support_ledger()` | — | — | ✓ |
| All other functions (auth helpers, etc.) | — | — | ✓ |

Anon (unauthenticated) can only call `platform_status` and `join_waitlist`.

## Money representation and display

**Storage:** Integer minor units (`amount_minor` in SQL, `amount` in TypeScript). For MYR (2 decimal places), 1000 represents RM 10.00.

**Display:** `Intl.NumberFormat` with `style: 'currency'` and `currencyDisplay: 'code'` (ISO codes: MYR, SGD, USD).

**Validation:** The app rejects amounts > 1e13 (100 billion major units) with "Amount exceeds maximum". Amounts must be positive integers.

**Import:** CSV amounts can be prefixed with "RM" (MYR only) or an ISO code (e.g., "SGD 10.00"). If the code doesn't match the firm's currency, it's a row error: "Row 5: amount is in SGD but this firm uses MYR."

**Formatting:** In the UI, amounts are displayed with the firm's currency code and locale-aware grouping, e.g., "MYR 1,234.50" or "SGD 3,000.00".

## Trial and billing states

**trial:** Firm is in the free trial period. Can read and write. `trial_ends_at` is set at firm creation to `now() + trial_days`. `firm_can_write()` checks `now() < trial_ends_at`.

**paid:** Firm has made a one-time RM 10 payment via Stripe. Can read and write indefinitely. `paid_at` is set by the Stripe webhook when payment is confirmed.

**read_only:** Firm's trial has ended and payment is unpaid. Can read, export, print, but cannot write (no new clients, transactions, etc.). Used to preserve data if a firm doesn't pay but also blocks accidental writes.

**complimentary:** Firm is marked complimentary by super-admin (no payment required). Can read and write indefinitely. Used for test firms, internal use, etc.

**suspended:** Firm is suspended by super-admin (e.g., abuse, non-payment). Cannot read or write. `auth_firm_id()` returns null if the firm is suspended, so RLS blocks all access.

## Session context

The app maintains `SessionContext` with:
- `user` — auth user (email, metadata)
- `profile` — firm user profile (id, name, role, status)
- `firm` — firm details (id, name, currency, billing_status, trial_ends_at, status)
- `can(action)` — shorthand for `auth_can(action)` from the database, checked at the client for UI gating
- `canWrite()` — shorthand for `firm_can_write()`; true if writes are allowed

The context is initialised on app load via `SessionProvider`, which:
1. Checks Supabase Auth session
2. Fetches the profile and firm from Postgres
3. On first verified sign-in, calls `create_firm_for_current_user` if needed (Plan B)
4. Detects if the session is stale (firm's trial expired, suspension changed, etc.) on every page load

## Special cases and edge cases

**Concurrent edits:** If two people edit the same client, the second update is rejected with a 409 Conflict. The error message is "This client was changed by <name> at <time>. Reload to see their changes."

**Trial expiry mid-session:** The trial end is checked at request time (`now() < trial_ends_at`), not once at sign-in. If the trial expires while someone is editing, the next write attempt fails with "Your trial has ended. Pay RM 10 to keep editing."

**Firm suspension:** If a firm is suspended while a user is signed in, the next write attempt fails with "Your firm has been suspended. Contact support."

**Deleting a client with transactions:** The client can be deleted (RLS allows it), but the delete confirmation modal requires the user to confirm "Delete <Name> and its <N> transactions?" The transactions are also deleted and recorded in the change log.

**Sample data:** Sample clients and transactions are marked `is_sample = true`. The `remove_sample_data()` function deletes only sample rows, but if a real transaction references a sample client, removal is blocked.

**Invite expiry:** Invite links generated by Supabase Auth expire after `otp_expiry` (24 hours locally, configurable on hosted; see Operations). If someone follows an expired link, they get "Link expired; ask for a resend."

**Deactivated bank accounts:** When a bank account is marked `is_active = false`, it's hidden from the UI for new entries. Existing transactions that reference it are unaffected and continue to show the account details.

**Stripe webhook:** Stripe sends webhook events that the `stripe-webhook` function verifies (signature + `event_id` deduplication). Only `charge.refunded` (sets `billing_status = 'read_only'`) and `checkout.session.completed` with status `paid` (sets `billing_status = 'paid'`) change billing status. If the webhook is delayed, the Billing screen shows "Confirming payment…" and polls.
