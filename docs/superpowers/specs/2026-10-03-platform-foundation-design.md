# Platform foundation — design

**Date:** 2026-10-03
**Status:** Draft for review (revision 2: homepage, self-serve trial, Stripe one-time payment, onboarding)
**Sub-project:** 1 of 4

## 1. Intent

Turn the browser-only client-money MVP into a multi-tenant SaaS that any firm can discover, try free, pay for once, and use to manage its clients and the money it holds on their behalf (receipts, payments, balances, statements).

**Success looks like:** a firm finds the homepage, signs up, verifies its email, is walked through the product, explores with sample data, removes it, imports its own clients and transactions, invites its team, and pays RM 10 to keep using it after the 14-day trial — with each firm's data invisible to every other firm, enforced by the database.

### Decisions (from brainstorming)

| # | Decision | Choice |
|---|---|---|
| D1 | How firms get on | Self-serve sign-up with a 14-day free trial (no payment), plus manual creation by the platform owner |
| D2 | Backend | Supabase (Postgres + row-level security + Auth + Edge Functions + Storage), Singapore region; frontend stays a Vite app on Vercel |
| D3 | Currency | One currency per firm, chosen at sign-up; never mixed. Several bank accounts per firm, all in that currency |
| D4 | Correcting mistakes | Entries stay freely editable and deletable; a database-level change log records every change |
| D5 | Membership | One person belongs to exactly one firm; the platform owner is a separate super-admin |
| D6 | Frontend data layer | Server-first: pages query only what they show; balances and statements computed in Postgres; TanStack Query for caching |
| D7 | Pricing | RM 10 one-time payment per firm via Stripe Checkout (card or FPX); unlocks the firm permanently |
| D8 | Trial end | 14 days; if unpaid the firm becomes read-only (view, export, print) until paid |
| D9 | Launch cap | At most 5 self-serve firms (early access); configurable by the super-admin; then a waitlist |
| D10 | Onboarding | Auto product tour on first sign-in; skippable "Get started" checklist; loadable and removable sample data |

### Sub-project map

1. **Platform foundation** — this spec (includes provisioning console, self-serve trial, one-time billing, onboarding).
2. Trust and compliance — audit views, locked periods, bank reconciliation.
3. Client communication — emailed statements, reminders, client portal.
4. Growth — recurring plans, per-seat pricing, referrals (only if needed later).

## 2. Architecture

- **Homepage:** a static marketing page built as a second Vite HTML entry (`index.html` → `/`), fast and indexable.
- **App:** the existing Vite + React 19 + TypeScript + Tailwind 4 app at `/app` (hash routes inside, e.g. `/app#clients`), deployed on Vercel. Talks to Supabase with `@supabase/supabase-js` using the public anon key. No custom API server.
- **Demo:** the current browser-only app at `/demo`, labelled "Demo — data stays in your browser", no sign-in.
- **Supabase project (Singapore):**
  - **Auth:** email + password with email verification, invite links, password reset.
  - **Postgres:** all application data.
  - **Row-level security (RLS):** tenant isolation, role permissions, and trial/payment write rules.
  - **SQL functions:** firm creation, balances, ledgers, import, sample data, owner rules.
  - **Storage:** firm logos (bucket `logos`, one folder per firm).
  - **Edge Functions** (hold server secrets; never exposed to the browser):
    - `admin` — super-admin operations (create firm, invite owner, suspend, extend trial, mark complimentary, support view, settings).
    - `billing-checkout` — creates a Stripe Checkout Session for the caller's firm (Owner only).
    - `stripe-webhook` — verifies Stripe signatures and records payments and refunds.
- **Secrets** (Supabase function secrets): `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` (RM 10 one-time price).
- **Browser state:** only per-viewer UI conveniences. Dashboard layout, table layouts, tour progress and checklist state live in `user_preferences` on the server.

### Tenancy

- Every business table has `firm_id uuid not null references firms`.
- `auth_firm_id()` returns the signed-in person's firm (null if the person or firm is suspended). `auth_role()` returns their role.
- **Read policy** on every business table: `firm_id = auth_firm_id()`.
- **Write policy** on every business table: read policy **and** `firm_can_write(firm_id)` **and** the role permits the action (§4).
- `firm_can_write(firm)` is true when the firm is not suspended and `billing_status` is `paid` or `complimentary`, or `billing_status = 'trial'` and `now() < trial_ends_at`.
- Super-admins (`profiles.is_super_admin = true`, `firm_id` null) cannot read firm data through RLS. They act only through the `admin` Edge Function, which verifies the caller before using the service-role key. **Open as support** uses read-only endpoints (`support/clients`, `support/balances`, `support/ledger`); each call writes a `change_log` row with action `support_access`. Support mode cannot write.

## 3. Data model

Common columns on every table: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz`, `updated_at timestamptz`, `created_by uuid`, `updated_by uuid` (references `profiles`). Business tables also carry `firm_id`.

| Table | Columns | Rules |
|---|---|---|
| `firms` | `name`, `trading_name`, `registration_no`, `sst_no`, `phone`, `email`, `website`, `address1`, `address2`, `postcode`, `city`, `state`, `country`, `logo_path`, `currency` (ISO 4217), `statement_note`, `discrepancy_days`, `show_registration_on_statement`, `fy_start_month`, `date_format`, `status` (`active | suspended`), `source` (`self_serve | admin`), `billing_status` (`trial | paid | complimentary | read_only`), `trial_ends_at`, `paid_at`, `stripe_customer_id`, `stripe_checkout_session_id`, `stripe_payment_intent_id` | `currency` cannot change once the firm has any transaction (trigger). `billing_status` writable only by Edge Functions |
| `profiles` | `user_id` (auth.users), `firm_id` (nullable for super-admins), `name`, `email`, `role` (`owner | admin | accountant | viewer`), `status` (`active | invited | suspended`), `last_active_at`, `is_super_admin` | Unique `email`; exactly one active `owner` per firm (constraint trigger) |
| `bank_accounts` | `firm_id`, `name`, `bank_name`, `account_name`, `account_no`, `is_default`, `is_active`, `is_sample` | At most one default per firm |
| `clients` | `firm_id`, `type`, `name`, `registration_no`, `industry`, `contact`, `phone`, `email`, `website`, `address1`, `address2`, `postcode`, `city`, `state`, `country`, `status` (`active | inactive | archived`), `tags text[]`, `assigned_to` (profiles), `notes`, `is_sample` | Same fields as today's `Client` |
| `transactions` | `firm_id`, `client_id`, `bank_account_id`, `kind` (`receipt | payment`), `amount_minor bigint > 0`, `date`, `description`, `is_sample` | `client_id` and `bank_account_id` must belong to the same firm (trigger) |
| `change_log` | `firm_id`, `table_name`, `row_id`, `action` (`insert | update | delete | support_access | billing`), `before jsonb`, `after jsonb`, `actor`, `at` | Written only by triggers and Edge Functions; readable by owners and admins |
| `user_preferences` | `profile_id`, `key`, `value jsonb` | Only that profile can read/write. Keys include `dashboard`, `table.*`, `tour`, `checklist` |
| `platform_settings` | `firm_cap int` (default 5), `trial_days int` (default 14) | Single row; read/write by super-admin via `admin` only |
| `waitlist` | `email`, `firm_name`, `created_at` | Insert-only for the public (rate-limited); read by super-admin |
| `stripe_events` | `event_id` (unique), `type`, `received_at` | Makes webhook processing idempotent |

**Money:** integers in the currency's minor unit (`amount_minor`), formatted with the firm's `currency` via `Intl.NumberFormat`. The RM 10 platform fee is always charged in MYR regardless of the firm's currency.

### Computed in Postgres (never stored)

- `client_balances(p_from date, p_to date, p_bank_account uuid default null)` → per client: `opening`, `receipts`, `payments`, `closing`, `txn_count`, `last_txn_date`.
- `ledger_lines(p_from date, p_to date, p_client uuid default null, p_bank_account uuid default null)` → transactions in period with running `balance` (per client when filtered to one client, otherwise across the firm), ordered by `date, created_at`.
- `import_transactions(rows jsonb, new_clients jsonb)` → validates and inserts all rows in one transaction; all-or-nothing with row-level errors.
- `create_firm_for_current_user(name, currency)` → for a verified user with no firm: checks the self-serve cap, creates the firm (`trial`, `trial_ends_at = now() + trial_days`, `source = self_serve`), the Owner profile, and a default bank account named "Client account" so transactions can be posted immediately. Locks `platform_settings` while counting so two sign-ups can't exceed the cap.
- `load_sample_data()` / `remove_sample_data()` → Owner/Admin only; inserts a sample bank account, 8 clients and ~150 transactions over 6 months flagged `is_sample`; removal deletes only `is_sample` rows (transactions first, then clients, then the sample bank account if unused).

These replace the browser's `statement()` and `totalsByClient()` for display. The browser versions stay for tests only (§7).

## 4. Roles and permissions

Enforced by RLS (and additionally gated by `firm_can_write` for every write):

| Action | Owner | Admin | Accountant | Viewer |
|---|---|---|---|---|
| View clients, balances, statements; export; print | ✓ | ✓ | ✓ | ✓ |
| Add / edit clients | ✓ | ✓ | ✓ | — |
| Delete clients | ✓ | ✓ | — | — |
| Post / edit / delete transactions; import | ✓ | ✓ | ✓ | — |
| Load / remove sample data | ✓ | ✓ | — | — |
| Manage users | ✓ | ✓ (not the owner) | — | — |
| Manage settings and bank accounts | ✓ | ✓ | — | — |
| Pay (billing) | ✓ | — | — | — |
| Transfer ownership | ✓ | — | — | — |

## 5. Screens and flows

### Public

1. **Homepage (`/`)** — hero ("Client money, handled."), what it does (receipts and payments per client, statements of account, team roles), how it works in 3 steps, feature grid, pricing ("Free for 14 days. Then RM 10, once."), FAQ, sign-up call to action, footer. When the self-serve cap is reached, every sign-up button becomes **Join the waitlist** (email + firm name).
2. **Sign up (`/app#signup`)** — firm name, firm currency, your name, work email, password. Supabase sends a verification email; the workspace stays closed until verified. On first verified sign-in, `create_firm_for_current_user` runs. If the cap was reached in the meantime, the person sees the waitlist message and is added to the waitlist.
3. **Sign in (`/app#signin`)** — email + password, forgot password, set password from invite. All other app routes require a session; after sign-in the user returns to the page they requested.

### Onboarding (inside the app)

4. **Product tour** — starts automatically on a person's first sign-in. Spotlight + popover per step, "Step 3 of 10", **Back / Next / Skip tour**. Owner/Admin steps: sidebar → Dashboard widgets and Edit layout → Clients list → Add client → client profile tabs → Record transaction → Statement of account → Import and export → Users and invites → Settings and billing. Steps a role can't use are left out. Progress is saved; replay from the help menu (?). Built in-house: a small component anchoring popovers to elements marked `data-tour="…"`; no tour library.
5. **Sample data offer** — when the tour ends (and in Settings › Data): **Load sample data**. While sample rows exist, a banner shows "You're exploring with sample data · **Remove sample data**". Removal deletes only sample-flagged rows, so anything real added meanwhile is kept. Then the firm imports its own data with the existing CSV import.
6. **Get started checklist** — complete your bank account details, invite your team, add your first client, record your first transaction. Each item has **Skip**; items tick themselves off when done; **Dismiss checklist** hides it; reopen from the help menu.
7. **Trial and billing banner** — "12 days left in your trial" (Owner also sees **Pay RM 10**). After expiry while unpaid: "Your trial ended on 17 Oct 2026. Pay RM 10 to keep adding and editing — your data stays viewable and exportable." Write controls are disabled with that reason as their tooltip.

### Super-admin console (`#admin`)

8. Firms list (console-created firms also get the default "Client account"): name, currency, source, billing status (trial days left / paid date / complimentary / read-only), user count, last activity. Actions: **Create firm** (name, currency, owner name + email, start as active-complimentary or trial; does not count toward the cap), **Suspend / Reactivate**, **Extend trial (+7 / +14 days)**, **Mark complimentary**, **Open as support** (logged).
9. Platform settings: self-serve firm cap (default 5), trial length (default 14 days); live count of self-serve firms against the cap.
10. Waitlist: email, firm name, date; copy emails.

### Firm app — new

11. **Settings › Bank accounts** — list, add, edit (name, bank, account name, account no.), set default, deactivate. Regional card shows the firm currency read-only.
12. **Settings › Billing (Owner)** — Trial (days left, **Pay RM 10**) / Paid (date, Stripe receipt link) / Complimentary / Read-only (**Pay RM 10**). **Pay RM 10** calls `billing-checkout` and redirects to Stripe Checkout (card or FPX); success returns to `/app#settings/billing?paid=1`, which shows "Payment received" once the webhook has marked the firm paid (polls briefly; never trusts the redirect alone).

### Firm app — changed

13. **Users** — invites send real emails; resend invite; "Viewing as" removed.
14. **Record transaction** — adds **Bank account** (defaults to firm default).
15. **Money formatting** — all amounts use the firm's currency instead of hard-coded RM.
16. **Clients (Balances and Transactions)** — adds a **Bank account** filter; data from `client_balances` / `ledger_lines`.
17. **Client profile** — edits save to the server; ledger filter by bank account.
18. **Statement of account** — firm details from `firms`; figures from `ledger_lines`.
19. **Import** — optional **Bank account** column (matched by name; blank → default account); unmatched values are errors; posted via `import_transactions`.

### Removed from the signed-in app

File backup/restore, data undo/redo, "Viewing as", local-only "Load sample data" (replaced by server sample data).

### Unchanged

Dashboard widgets (layout now stored per user), customisable tables, CSV export, print, statement layout.

## 6. Errors, security and edge cases

**Security**
- RLS on every table, tested both ways (cross-firm reads return zero rows; each role's writes allowed/denied per §4; writes denied when `firm_can_write` is false).
- Service-role and Stripe keys exist only as Edge Function secrets.
- Stripe webhook: signature verified with `STRIPE_WEBHOOK_SECRET`; `event_id` stored in `stripe_events` before applying so retries are no-ops; only `checkout.session.completed` (status `paid`) and `charge.refunded` change `billing_status`. Payment state never comes from the browser.
- Checkout session carries `firm_id` in `client_reference_id` and metadata; the webhook updates only that firm and only if the amount and currency match the configured price.
- Self-serve sign-up requires email verification before a firm is created; the cap is checked inside `create_firm_for_current_user` under a row lock.
- Waitlist insert is rate-limited (per IP via Edge Function, or a database check of recent inserts per email).
- Owner invariants enforced by database triggers. `billing_status`, `trial_ends_at`, `paid_at` and Stripe ids are not writable by firm users.
- Logos: ≤ 200 KB, PNG / JPEG / SVG, path `logos/<firm_id>/…`, readable only by that firm.
- CSV export keeps the spreadsheet formula guard; import validates every row before writing.

**Errors**
- Failed writes keep the form open with input intact and a plain message; no silent failures.
- Writes attempted while read-only return a clear message ("Your trial has ended. Pay RM 10 to keep editing.") rather than a generic permission error.
- Import and sample-data operations are all-or-nothing in one database transaction.
- Concurrent edits: updates include the `updated_at` the user loaded; if it changed, the save is rejected with "This client was changed by <name> at <time>. Reload to see their changes."
- Stripe Checkout cancelled → back to Billing with no change. Webhook delayed → Billing shows "Confirming payment…" and refreshes; a paid firm is never shown as unpaid because of a slow webhook for more than the polling window (then "Payment is being confirmed; refresh in a minute").
- Expired session → sign-in → back to the same page.

**Edge cases**
- Deleting a client with transactions requires confirmation naming the count; `change_log` keeps the deleted rows.
- Deactivated bank accounts are hidden from new entries; history unaffected.
- Firm currency locked once transactions exist.
- Invite links expire after 7 days; admins can resend.
- Trial expiry is evaluated at request time (`now() < trial_ends_at`); no cron needed.
- Refund after payment → `read_only`; data kept.
- Cap reached between sign-up and verification → person added to waitlist, no firm created.
- Removing sample data never deletes rows without `is_sample`, even if they reference sample clients (such transactions block removal with a message naming the client).

## 7. Testing

1. **Database tests (pgTAP, local Supabase):** RLS per table per role; firm A vs firm B isolation; `firm_can_write` for trial (before/after expiry), paid, complimentary, read-only, suspended; owner invariants; cap enforcement under concurrent sign-ups; `client_balances` / `ledger_lines` / `import_transactions` against fixtures; sample data load/remove leaves real rows untouched.
2. **Equivalence test:** one fixture ledger run through the browser `statement()` / `totalsByClient()` and the Postgres functions; results must match exactly.
3. **Edge Function tests (Deno):** webhook signature rejection, idempotent replay, amount/currency mismatch ignored, refund → read-only; checkout refuses non-owners and already-paid firms.
4. **Unit tests (`node --test`):** formatting with firm currency, CSV import/export, validation, tour step filtering by role.
5. **Browser checks:** homepage → sign-up → verify → tour → sample data → remove → import → invite → trial banner; trial expiry (time-shifted `trial_ends_at`) → read-only; Stripe test-mode payment (card and FPX) → paid; cap reached → waitlist; cross-firm access attempt fails; super-admin console actions.

## 8. Environments and rollout

- **Local:** Supabase CLI (Docker); Stripe CLI forwarding test webhooks; seed with two demo firms in different currencies and one super-admin.
- **Production:** one Supabase project (Singapore) + Vercel; Stripe live mode with one RM 10 one-time price. Schema changes only through versioned migrations in `supabase/migrations/`, applied with the CLI.
- **Rollout:** build foundation → Stripe test mode end to end → open self-serve with cap 5 → first firms onboard → raise the cap when ready.

## 9. Out of scope

Recurring or per-seat pricing, coupons, invoices beyond Stripe receipts, bank reconciliation and locked periods (sub-project 2), emailed statements and client portal (3), two-factor sign-in, single sign-on, custom domains per firm, multi-firm membership, multi-currency within a firm, SEO beyond a static homepage.

## 10. New dependencies

- `@supabase/supabase-js` — client for Auth, Postgres, Storage, Edge Function calls.
- `@tanstack/react-query` — server-state caching and loading states.
- `stripe` (npm, used only inside Edge Functions) — Checkout Sessions and webhook verification.
- Supabase CLI and Stripe CLI — development only.
