# Plan A — Backend and Tenancy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the app from browser-only storage onto Supabase with sign-in, per-firm data isolation enforced by Postgres row-level security, server-computed balances and ledgers, and real team invites — so a firm's people can sign in and work on shared data.

**Architecture:** Supabase Postgres holds all data; every business table carries `firm_id` and RLS restricts rows to the signed-in person's firm, with writes further gated by role and by `firm_can_write()`. Balances and running ledgers are SQL functions (`client_balances`, `ledger_lines`) called over RPC. The React app reads through a thin data layer in `src/data/` (TanStack Query hooks + pure row↔model mappers) so existing components keep their `Client` / `Txn` / `Statement` shapes. One Edge Function (`team`) does the operations that need the service-role key (invite, resend, remove).

**Tech Stack:** Vite 8, React 19, TypeScript 6, Tailwind 4, `@supabase/supabase-js` 2, `@tanstack/react-query` 5, Supabase CLI (local Postgres 15 + pgTAP), Deno (Edge Functions), `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-03-platform-foundation-design.md` (this plan implements §2 Architecture/Tenancy, §3 Data model, §4 Roles, §5 items 3, 11, 13–19 and "Removed", §6, §7 items 1–2 and 4, §8 Local). Homepage/sign-up/console are Plan B, Stripe is Plan C, tour/checklist/sample data are Plan D.

**Spec amendments made while planning (flag in review):**
1. Firm owners/admins inviting staff also needs the service-role key, so this plan adds a second Edge Function, `team` (spec §2 listed only `admin`, `billing-checkout`, `stripe-webhook`).
2. `created_by` / `updated_by` reference `auth.users(id)` rather than `profiles` (avoids a firms↔profiles circular foreign key; same identity).
3. Statement bank details come from the firm's **default bank account** (Settings › Bank accounts) instead of three free-text settings fields.
4. `client_balances` gets a `p_client` parameter so the statement page can fetch one client's opening/closing without a second function.
5. `amount_minor` is capped at `1e13` (100 billion in major units) so values stay exact as JavaScript numbers.

## Global Constraints

- Working directory: `/Users/delfrinando/ntucsm/platform-internal` (its own git repo; branch `main`). Commit after each task; push only when the task list says so.
- Never run Prettier. Lint is `npx oxlint src` (warnings named `only-export-components` are accepted).
- Unit tests: `pnpm test` (`node --test src/*.test.ts src/**/*.test.ts`). Database tests: `supabase test db`. Edge Function tests: `deno test supabase/functions`.
- Typecheck: `npx tsc -p tsconfig.app.json --noEmit` must print nothing.
- Money is integer minor units everywhere (`amount_minor` in SQL, `amount` in TS). Never floats.
- One currency per firm (`firms.currency`, ISO 4217); format with `Intl.NumberFormat('en-MY', { style: 'currency', currency })`.
- British English in all copy; accountancy vocabulary already in the app (Receipts, Payments, Client balance, Client ledger, Debit balance, MTD).
- Roles: `owner | admin | accountant | viewer`. Permission matrix (spec §4) — accountant may `clients.edit`, `transactions.post`, `transactions.delete`; admin may everything except `billing.pay` and `ownership.transfer`; viewer reads only.
- The service-role key must never appear in `src/` or any `VITE_` variable.
- Local test credentials live only in `supabase/seed.sql` (password `password123`, emails `*@alpha.test`, `*@beta.test`, `admin@platform.test`).
- New runtime dependencies allowed: `@supabase/supabase-js`, `@tanstack/react-query`. Remove `zundo` when no longer imported.

## Review Focus

1. **Two people edit the same client** — the second save must be rejected with "This client was changed by <name> at <time>. Reload to see their changes.", never silently overwrite. Test: Task 9 `updateClient` conflict test.
2. **Session expires while a form is open** — the user lands on sign-in and returns to the same hash route afterwards; unsaved input is lost but nothing is half-written. Test: Task 8 `returnTo` test.
3. **Firm can no longer write (trial over / suspended) and someone clicks Save** — they see "Your firm can't make changes right now: <reason>." not a raw `42501`. Test: Task 5 SQL test + Task 9 `toUserMessage` test.
4. **Import file with one bad row among 500 good ones** — nothing is written and the bad row number is reported. Test: Task 6 SQL test.
5. **Very large amounts** (e.g. pasted `99999999999999`) — rejected with a clear message instead of losing precision. Test: Task 2 check-constraint test + Task 9 mapper test.

---

## File Structure

**Created**
| Path | Responsibility |
|---|---|
| `supabase/config.toml` | Supabase CLI project config (generated, then edited) |
| `supabase/migrations/20261003000001_schema.sql` | Enums, tables, indexes, `updated_at`/actor triggers |
| `supabase/migrations/20261003000002_tenancy.sql` | `auth_*` helpers, `firm_can_write`, `auth_can`, RLS policies |
| `supabase/migrations/20261003000003_invariants.sql` | Owner/default/currency/same-firm/billing-column triggers, change log |
| `supabase/migrations/20261003000004_team.sql` | Team RPCs: accept invite, change role, suspend, reactivate, transfer ownership, touch last active |
| `supabase/migrations/20261003000005_ledger.sql` | `client_balances`, `ledger_lines` |
| `supabase/migrations/20261003000006_import.sql` | `import_transactions` |
| `supabase/migrations/20261003000007_storage.sql` | `logos` bucket + policies |
| `supabase/seed.sql` | Two firms (MYR, SGD), users per role, a super-admin, sample clients/transactions |
| `supabase/tests/*.test.sql` | pgTAP tests (schema, isolation, roles, invariants, write rules, ledger, import, team) |
| `supabase/functions/team/index.ts` | Edge Function: invite / resend / remove |
| `supabase/functions/team/rules.ts` | Pure authorisation rules for `team` |
| `supabase/functions/team/rules.test.ts` | Deno tests for the rules |
| `.env.example` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `src/data/supabase.ts` | Typed Supabase client; validates env at startup |
| `src/data/database.types.ts` | Generated DB types (`supabase gen types`) |
| `src/data/mappers.ts` | Pure row↔model mapping (Client, Txn, Statement, Firm, BankAccount, Member) |
| `src/data/mappers.test.ts` | Unit tests for mappers |
| `src/data/errors.ts` | `toUserMessage(error, context)` |
| `src/data/errors.test.ts` | Unit tests |
| `src/data/session.tsx` | `SessionProvider`, `useSession()` (user, profile, firm, `can`, `canWrite`) |
| `src/data/queries.ts` | TanStack Query hooks for every read/write |
| `src/data/money.ts` | `makeMoney(currency)`, `useMoney()` |
| `src/data/money.test.ts` | Unit tests |
| `src/data/equivalence.db.test.ts` | Browser `statement()` vs SQL functions on one fixture (needs local Supabase) |
| `src/auth/AuthPages.tsx` | Sign in, forgot password, set password |
| `src/auth/route.ts` | `returnTo` save/restore helpers |
| `src/auth/route.test.ts` | Unit tests |
| `src/settings/BankAccounts.tsx` | Settings › Bank accounts |
| `src/settings/constants.ts` | `STATES`, `MONTHS`, `LOGO_MAX_BYTES`, `DEFAULT_NOTE`, `formatDate` (moved out of the old store) |

**Modified:** `package.json`, `src/main.tsx`, `src/App.tsx`, `src/ledger.ts`, `src/ui.tsx`, `src/widgets.tsx`, `src/Dashboard.tsx`, `src/ClientsPage.tsx`, `src/ClientProfile.tsx`, `src/clients/*.tsx`, `src/transfer.tsx`, `src/Statement.tsx`, `src/settings/SettingsPage.tsx`, `src/users/UsersPage.tsx`, `src/users/badges.tsx`, `README.md`, `.gitignore`.

**Deleted:** `src/store.ts` (data parts; widget layout moves to preferences), `src/users/store.ts`, `src/users/ViewingAs.tsx`, `src/settings/store.ts`, `src/settings/backup.ts`.

---

### Task 1: Tooling, Supabase project, client module

**Files:**
- Create: `supabase/config.toml` (via CLI), `.env.example`, `src/data/supabase.ts`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Produces: `supabase` (typed `SupabaseClient<Database>`) exported from `src/data/supabase.ts`; `readEnv(env)` pure function.

- [ ] **Step 1: Tag the browser-only version for the future /demo build (Plan B)**

```bash
git tag demo-local && git push origin demo-local
```

- [ ] **Step 2: Install tooling**

```bash
brew install supabase/tap/supabase deno
supabase --version
deno --version
```
Expected: both print versions.

- [ ] **Step 3: Initialise and start Supabase locally**

```bash
supabase init --force
supabase start
supabase status -o env
```
Expected: `API_URL=http://127.0.0.1:54321`, `ANON_KEY=…`, `SERVICE_ROLE_KEY=…`.

In `supabase/config.toml` set:
```toml
[auth]
site_url = "http://localhost:5199"
additional_redirect_urls = ["http://localhost:5199/app", "http://localhost:5199"]

[auth.email]
enable_confirmations = true
# Invite and reset links stay valid for 7 days (spec §6).
otp_expiry = 604800
```

- [ ] **Step 4: Dependencies and env files**

```bash
pnpm add @supabase/supabase-js @tanstack/react-query
printf 'VITE_SUPABASE_URL=http://127.0.0.1:54321\nVITE_SUPABASE_ANON_KEY=paste-anon-key-from-supabase-status\n' > .env.example
supabase status -o env | awk -F= '/^API_URL=/{print "VITE_SUPABASE_URL="$2} /^ANON_KEY=/{print "VITE_SUPABASE_ANON_KEY="$2}' | tr -d '"' > .env.local
grep -q '^supabase/.temp' .gitignore || printf 'supabase/.temp\nsupabase/.branches\n' >> .gitignore
```
`.env.local` is already ignored by the `*.local` rule.

Add to `package.json` scripts:
```json
"test": "node --test src/*.test.ts src/**/*.test.ts",
"test:db": "node --test src/data/equivalence.db.test.ts",
"db:types": "supabase gen types typescript --local > src/data/database.types.ts"
```
and exclude `*.db.test.ts` from the plain `test` glob by renaming the equivalence test pattern (the glob `src/**/*.test.ts` would match it) — so use instead:
```json
"test": "node --test $(ls src/*.test.ts src/*/*.test.ts | grep -v '\\.db\\.test\\.ts$')"
```

- [ ] **Step 5: Write the failing test for env validation**

`src/data/supabase.test.ts`:
```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readEnv } from './supabase.ts'

test('readEnv returns url and anon key', () => {
  assert.deepEqual(readEnv({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'abc' }), {
    url: 'http://127.0.0.1:54321',
    anonKey: 'abc',
  })
})

test('readEnv names every missing variable', () => {
  assert.throws(() => readEnv({}), /VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY/)
})

test('readEnv refuses a service-role key in the browser', () => {
  const serviceJwt = `x.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.y`
  assert.throws(() => readEnv({ VITE_SUPABASE_URL: 'http://x', VITE_SUPABASE_ANON_KEY: serviceJwt }), /service-role/)
})
```

- [ ] **Step 6: Run it to make sure it fails**

Run: `node --test src/data/supabase.test.ts`
Expected: FAIL — cannot find module `./supabase.ts`.

- [ ] **Step 7: Implement**

`src/data/supabase.ts`:
```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

type Env = Partial<Record<'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY', string>>

/** Validates browser env at startup so a misconfigured deploy fails loudly, not with silent 401s. */
export function readEnv(env: Env): { url: string; anonKey: string } {
  const missing = (['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const).filter((k) => !env[k])
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`)
  const anonKey = env.VITE_SUPABASE_ANON_KEY!
  const payload = anonKey.split('.')[1]
  if (payload) {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string }
    if (claims.role === 'service_role') throw new Error('Refusing to start: a service-role key was put in VITE_SUPABASE_ANON_KEY')
  }
  return { url: env.VITE_SUPABASE_URL!, anonKey }
}

const { url, anonKey } = readEnv(import.meta.env as Env)
export const supabase = createClient<Database>(url, anonKey)
```

Because the test imports the module, the module-level `readEnv(import.meta.env)` would throw under Node. Guard it: replace the last two lines with

```ts
const viteEnv = (import.meta as { env?: Env }).env
export const supabase = viteEnv ? (() => {
  const { url, anonKey } = readEnv(viteEnv)
  return createClient<Database>(url, anonKey)
})() : (null as unknown as ReturnType<typeof createClient<Database>>)
```

Create a placeholder types file so the import resolves until Task 2 generates the real one:
```bash
printf 'export type Database = any\n' > src/data/database.types.ts
```

- [ ] **Step 8: Run tests**

Run: `node --test src/data/supabase.test.ts && npx tsc -p tsconfig.app.json --noEmit`
Expected: 3 passing tests; typecheck prints nothing.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml .gitignore .env.example supabase/config.toml src/data/supabase.ts src/data/supabase.test.ts src/data/database.types.ts
git commit -m "chore: add Supabase project and typed client"
```

---

### Task 2: Schema

**Files:**
- Create: `supabase/migrations/20261003000001_schema.sql`, `supabase/tests/01_schema.test.sql`
- Regenerate: `src/data/database.types.ts`

**Interfaces:**
- Produces: tables `firms, profiles, bank_accounts, clients, transactions, change_log, user_preferences, platform_settings, waitlist, stripe_events`; enums `firm_status, firm_source, billing_status, member_role, member_status, client_type, client_status, txn_kind, change_action`; trigger function `stamp_row()`.

- [ ] **Step 1: Write the failing pgTAP test**

`supabase/tests/01_schema.test.sql`:
```sql
begin;
select plan(14);

select has_table('public', t, t || ' exists')
from unnest(array['firms','profiles','bank_accounts','clients','transactions','change_log',
                  'user_preferences','platform_settings','waitlist','stripe_events']) as t;

select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0, 'row-level security is enabled on every public table');

select throws_ok(
  $$ insert into firms (name, currency, billing_status) values ('X', 'MYR', 'trial') $$,
  '23514', null, 'a trial firm must have trial_ends_at');

select throws_ok(
  $$ insert into firms (name, currency, billing_status) values ('X', 'myr', 'paid') $$,
  '23514', null, 'currency must be an upper-case ISO code');

select throws_ok(
  $$ with f as (insert into firms (name, currency, billing_status) values ('Y','MYR','paid') returning id),
          c as (insert into clients (firm_id, name) select id, 'C' from f returning id, firm_id),
          b as (insert into bank_accounts (firm_id, name, is_default) select id, 'B', true from f returning id)
     insert into transactions (firm_id, client_id, bank_account_id, kind, amount_minor, date)
     select c.firm_id, c.id, b.id, 'receipt', 10000000000001, current_date from c, b $$,
  '23514', null, 'amount_minor is capped at 1e13');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `supabase test db`
Expected: FAIL — relations do not exist.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261003000001_schema.sql`:
```sql
create extension if not exists pgcrypto;

create type firm_status    as enum ('active', 'suspended');
create type firm_source    as enum ('self_serve', 'admin');
create type billing_status as enum ('trial', 'paid', 'complimentary', 'read_only');
create type member_role    as enum ('owner', 'admin', 'accountant', 'viewer');
create type member_status  as enum ('active', 'invited', 'suspended');
create type client_type    as enum ('company', 'individual');
create type client_status  as enum ('active', 'inactive', 'archived');
create type txn_kind       as enum ('receipt', 'payment');
create type change_action  as enum ('insert', 'update', 'delete', 'support_access', 'billing');

-- Sets updated_at and the acting user on every write. auth.uid() is null for service-role writes.
create or replace function stamp_row() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

create table firms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  trading_name text not null default '',
  registration_no text not null default '',
  sst_no text not null default '',
  phone text not null default '',
  email text not null default '',
  website text not null default '',
  address1 text not null default '',
  address2 text not null default '',
  postcode text not null default '',
  city text not null default '',
  state text not null default '',
  country text not null default 'Malaysia',
  logo_path text,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  statement_note text not null default 'Please review this statement and notify us of any discrepancies within {days} days of the statement date.',
  discrepancy_days int not null default 14 check (discrepancy_days between 1 and 365),
  show_registration_on_statement boolean not null default true,
  fy_start_month int not null default 1 check (fy_start_month between 1 and 12),
  date_format text not null default 'text' check (date_format in ('text', 'numeric')),
  status firm_status not null default 'active',
  source firm_source not null default 'admin',
  billing_status billing_status not null default 'trial',
  trial_ends_at timestamptz,
  paid_at timestamptz,
  stripe_customer_id text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint trial_has_end check (billing_status <> 'trial' or trial_ends_at is not null)
);

create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  firm_id uuid references firms(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  email text not null,
  role member_role not null default 'viewer',
  status member_status not null default 'invited',
  last_active_at timestamptz,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint super_admin_has_no_firm check (is_super_admin = (firm_id is null))
);
create unique index profiles_email_key on profiles (lower(email));
create index profiles_firm_idx on profiles (firm_id);

create table bank_accounts (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  bank_name text not null default '',
  account_name text not null default '',
  account_no text not null default '',
  is_default boolean not null default false,
  is_active boolean not null default true,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);
create index bank_accounts_firm_idx on bank_accounts (firm_id);

create table clients (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  type client_type not null default 'company',
  name text not null check (length(trim(name)) > 0),
  registration_no text not null default '',
  industry text not null default '',
  contact text not null default '',
  phone text not null default '',
  email text not null default '',
  website text not null default '',
  address1 text not null default '',
  address2 text not null default '',
  postcode text not null default '',
  city text not null default '',
  state text not null default '',
  country text not null default 'Malaysia',
  status client_status not null default 'active',
  tags text[] not null default '{}',
  assigned_to uuid references profiles(id) on delete set null,
  notes text not null default '',
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);
create index clients_firm_name_idx on clients (firm_id, lower(name));

create table transactions (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  bank_account_id uuid not null references bank_accounts(id) on delete restrict,
  kind txn_kind not null,
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 10000000000000),
  date date not null,
  description text not null default '',
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);
create index transactions_firm_date_idx on transactions (firm_id, date, created_at);
create index transactions_client_date_idx on transactions (client_id, date, created_at);
create index transactions_bank_idx on transactions (bank_account_id);

create table change_log (
  id bigint generated always as identity primary key,
  firm_id uuid references firms(id) on delete cascade,
  table_name text not null,
  row_id uuid,
  action change_action not null,
  before jsonb,
  after jsonb,
  actor uuid,
  at timestamptz not null default now()
);
create index change_log_firm_at_idx on change_log (firm_id, at desc);

create table user_preferences (
  profile_id uuid not null references profiles(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (profile_id, key)
);

create table platform_settings (
  id boolean primary key default true check (id),
  firm_cap int not null default 5 check (firm_cap >= 0),
  trial_days int not null default 14 check (trial_days between 1 and 365)
);
insert into platform_settings default values;

create table waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  firm_name text not null default '',
  created_at timestamptz not null default now()
);

create table stripe_events (
  event_id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

create trigger stamp before insert or update on firms         for each row execute function stamp_row();
create trigger stamp before insert or update on profiles      for each row execute function stamp_row();
create trigger stamp before insert or update on bank_accounts for each row execute function stamp_row();
create trigger stamp before insert or update on clients       for each row execute function stamp_row();
create trigger stamp before insert or update on transactions  for each row execute function stamp_row();

alter table firms             enable row level security;
alter table profiles          enable row level security;
alter table bank_accounts     enable row level security;
alter table clients           enable row level security;
alter table transactions      enable row level security;
alter table change_log        enable row level security;
alter table user_preferences  enable row level security;
alter table platform_settings enable row level security;
alter table waitlist          enable row level security;
alter table stripe_events     enable row level security;
```

- [ ] **Step 4: Apply and run tests**

Run: `supabase db reset && supabase test db`
Expected: `01_schema.test.sql .. ok`, 14 tests pass.

- [ ] **Step 5: Generate types**

Run: `pnpm db:types && npx tsc -p tsconfig.app.json --noEmit`
Expected: `src/data/database.types.ts` contains `firms`, `clients`, …; typecheck prints nothing.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261003000001_schema.sql supabase/tests/01_schema.test.sql src/data/database.types.ts
git commit -m "feat(db): core schema with RLS enabled"
```

---

### Task 3: Seed data

**Files:**
- Create: `supabase/seed.sql`

**Interfaces:**
- Produces fixed ids used by every later SQL test:

| Entity | id |
|---|---|
| Firm Alpha Advisory Sdn Bhd (MYR, complimentary) | `0000000a-0000-0000-0000-000000000001` |
| Firm Beta Partners Pte Ltd (SGD, trial, ends now+14d) | `0000000b-0000-0000-0000-000000000001` |
| auth user alpha owner `owner@alpha.test` | `00000000-0000-0000-0000-0000000000a1` |
| auth user alpha accountant `accountant@alpha.test` | `00000000-0000-0000-0000-0000000000a2` |
| auth user alpha viewer `viewer@alpha.test` | `00000000-0000-0000-0000-0000000000a3` |
| auth user alpha admin `admin@alpha.test` | `00000000-0000-0000-0000-0000000000a4` |
| auth user beta owner `owner@beta.test` | `00000000-0000-0000-0000-0000000000b1` |
| auth user super-admin `admin@platform.test` | `00000000-0000-0000-0000-0000000000f1` |
| Alpha default bank account | `0000000a-0000-0000-0000-0000000000ba` |
| Beta default bank account | `0000000b-0000-0000-0000-0000000000ba` |
| Alpha client "Kopi Corner Sdn Bhd" | `0000000a-0000-0000-0000-0000000000c1` |
| Alpha client "Harbourline Logistics Sdn Bhd" | `0000000a-0000-0000-0000-0000000000c2` |
| Beta client "Marina Bay Studio Pte Ltd" | `0000000b-0000-0000-0000-0000000000c1` |

- [ ] **Step 1: Write the seed**

`supabase/seed.sql`:
```sql
-- Local development only. Password for every user: password123
create or replace function pg_temp.add_user(p_id uuid, p_email text) returns void language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
          crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}',
          now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), p_id, p_id::text, json_build_object('sub', p_id::text, 'email', p_email), 'email', now(), now(), now());
$$;

select pg_temp.add_user('00000000-0000-0000-0000-0000000000a1', 'owner@alpha.test');
select pg_temp.add_user('00000000-0000-0000-0000-0000000000a2', 'accountant@alpha.test');
select pg_temp.add_user('00000000-0000-0000-0000-0000000000a3', 'viewer@alpha.test');
select pg_temp.add_user('00000000-0000-0000-0000-0000000000a4', 'admin@alpha.test');
select pg_temp.add_user('00000000-0000-0000-0000-0000000000b1', 'owner@beta.test');
select pg_temp.add_user('00000000-0000-0000-0000-0000000000f1', 'admin@platform.test');

insert into firms (id, name, currency, billing_status, source, address1, city, state, postcode, registration_no)
values ('0000000a-0000-0000-0000-000000000001', 'Alpha Advisory Sdn Bhd', 'MYR', 'complimentary', 'admin',
        'Level 18, Menara Binjai', 'Kuala Lumpur', 'Kuala Lumpur', '50450', '202301012345 (1501234-A)');
insert into firms (id, name, currency, billing_status, trial_ends_at, source, country)
values ('0000000b-0000-0000-0000-000000000001', 'Beta Partners Pte Ltd', 'SGD', 'trial', now() + interval '14 days', 'self_serve', 'Singapore');

insert into profiles (user_id, firm_id, name, email, role, status, is_super_admin) values
  ('00000000-0000-0000-0000-0000000000a1', '0000000a-0000-0000-0000-000000000001', 'Lim Boon Hock', 'owner@alpha.test', 'owner', 'active', false),
  ('00000000-0000-0000-0000-0000000000a2', '0000000a-0000-0000-0000-000000000001', 'Rajesh Kumar', 'accountant@alpha.test', 'accountant', 'active', false),
  ('00000000-0000-0000-0000-0000000000a3', '0000000a-0000-0000-0000-000000000001', 'Chong Mei Ling', 'viewer@alpha.test', 'viewer', 'active', false),
  ('00000000-0000-0000-0000-0000000000a4', '0000000a-0000-0000-0000-000000000001', 'Nur Aisyah', 'admin@alpha.test', 'admin', 'active', false),
  ('00000000-0000-0000-0000-0000000000b1', '0000000b-0000-0000-0000-000000000001', 'Tan Wei Ming', 'owner@beta.test', 'owner', 'active', false),
  ('00000000-0000-0000-0000-0000000000f1', null, 'Platform Admin', 'admin@platform.test', 'viewer', 'active', true);

insert into bank_accounts (id, firm_id, name, bank_name, account_name, account_no, is_default) values
  ('0000000a-0000-0000-0000-0000000000ba', '0000000a-0000-0000-0000-000000000001', 'Client account', 'Maybank', 'Alpha Advisory Sdn Bhd – Client Account', '5140 1234 5678', true),
  ('0000000b-0000-0000-0000-0000000000ba', '0000000b-0000-0000-0000-000000000001', 'Client account', 'DBS', 'Beta Partners – Client Account', '072-123456-7', true);

insert into clients (id, firm_id, name, contact, email, phone, city, state, postcode, tags) values
  ('0000000a-0000-0000-0000-0000000000c1', '0000000a-0000-0000-0000-000000000001', 'Kopi Corner Sdn Bhd', 'Wei Jie Ong', 'weijie@kopicorner.example', '+60123456789', 'Petaling Jaya', 'Selangor', '46200', '{Retainer}'),
  ('0000000a-0000-0000-0000-0000000000c2', '0000000a-0000-0000-0000-000000000001', 'Harbourline Logistics Sdn Bhd', 'Aisha Rahman', 'aisha@harbourline.example', '+60123456781', 'Klang', 'Selangor', '41200', '{Priority}'),
  ('0000000b-0000-0000-0000-0000000000c1', '0000000b-0000-0000-0000-000000000001', 'Marina Bay Studio Pte Ltd', 'Grace Lee', 'grace@marinabay.example', '+6591234567', 'Singapore', '', '018956', '{}');

insert into transactions (firm_id, client_id, bank_account_id, kind, amount_minor, date, description) values
  ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-0000000000c1', '0000000a-0000-0000-0000-0000000000ba', 'receipt', 1000000, '2026-08-20', 'Retainer received'),
  ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-0000000000c1', '0000000a-0000-0000-0000-0000000000ba', 'payment',  250000, '2026-08-31', 'Filing fees'),
  ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-0000000000c1', '0000000a-0000-0000-0000-0000000000ba', 'payment',  100000, '2026-09-05', 'Supplier payment'),
  ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-0000000000c1', '0000000a-0000-0000-0000-0000000000ba', 'receipt',   40000, '2026-09-30', 'Top-up'),
  ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-0000000000c2', '0000000a-0000-0000-0000-0000000000ba', 'receipt',  500000, '2026-09-10', 'Escrow deposit'),
  ('0000000b-0000-0000-0000-000000000001', '0000000b-0000-0000-0000-0000000000c1', '0000000b-0000-0000-0000-0000000000ba', 'receipt',  300000, '2026-09-12', 'Deposit');
```

- [ ] **Step 2: Apply and check**

Run: `supabase db reset && psql "$(supabase status -o env | awk -F= '/^DB_URL=/{print $2}' | tr -d '"')" -c "select name, currency, billing_status from firms order by name"`
Expected: two rows — Alpha (MYR, complimentary), Beta (SGD, trial).

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "chore(db): local seed with two firms and one user per role"
```

---

### Task 4: Tenancy helpers and RLS policies

**Files:**
- Create: `supabase/migrations/20261003000002_tenancy.sql`, `supabase/tests/02_isolation.test.sql`, `supabase/tests/03_roles.test.sql`

**Interfaces:**
- Produces SQL functions: `auth_profile_id() → uuid`, `auth_firm_id() → uuid`, `auth_role() → member_role`, `auth_can(action text) → boolean`, `firm_can_write(firm uuid) → boolean`, `firm_write_block_reason(firm uuid) → text` (null when writable).
- Action names (must match `src/users/rules.ts` `Action` plus three new ones): `clients.edit`, `clients.delete`, `transactions.post`, `transactions.delete`, `users.manage`, `settings.manage`, `sample.manage`, `billing.pay`, `ownership.transfer`.

- [ ] **Step 1: Write the failing isolation test**

`supabase/tests/02_isolation.test.sql`:
```sql
begin;
select plan(6);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from clients), 2, 'alpha owner sees alpha clients only');
select is((select count(*)::int from firms), 1, 'alpha owner sees one firm');
select is((select count(*)::int from transactions where firm_id = '0000000b-0000-0000-0000-000000000001'), 0, 'alpha owner cannot read beta transactions');

reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from clients), 1, 'beta owner sees beta clients only');
select throws_ok(
  $$ insert into clients (firm_id, name) values ('0000000a-0000-0000-0000-000000000001', 'Sneaky') $$,
  '42501', null, 'beta owner cannot insert into alpha');
select is_empty(
  $$ update clients set name = 'Hijack' where id = '0000000a-0000-0000-0000-0000000000c1' returning id $$,
  'beta owner cannot update alpha rows');

select * from finish();
rollback;
```

- [ ] **Step 2: Write the failing roles test**

`supabase/tests/03_roles.test.sql`:
```sql
begin;
select plan(8);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3'); -- viewer
select throws_ok($$ insert into clients (name) values ('V') $$, '42501', null, 'viewer cannot add clients');
select is_empty($$ update firms set trading_name = 'x' returning id $$, 'viewer cannot edit settings');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2'); -- accountant
select lives_ok($$ insert into clients (name) values ('Acct Co') $$, 'accountant can add clients (firm_id defaults)');
select lives_ok(
  $$ insert into transactions (client_id, bank_account_id, kind, amount_minor, date)
     values ('0000000a-0000-0000-0000-0000000000c1', '0000000a-0000-0000-0000-0000000000ba', 'receipt', 100, current_date) $$,
  'accountant can post transactions');
select is_empty($$ delete from clients where id = '0000000a-0000-0000-0000-0000000000c2' returning id $$, 'accountant cannot delete clients');
select is_empty($$ update firms set trading_name = 'x' returning id $$, 'accountant cannot edit settings');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4'); -- admin
select isnt_empty($$ update firms set trading_name = 'Alpha' returning id $$, 'admin can edit settings');
select ok(not auth_can('billing.pay'), 'admin cannot pay');

select * from finish();
rollback;
```

- [ ] **Step 3: Run them to make sure they fail**

Run: `supabase test db`
Expected: FAIL — `auth_can` does not exist; viewer insert does not throw.

- [ ] **Step 4: Write the migration**

`supabase/migrations/20261003000002_tenancy.sql`:
```sql
-- Helpers are SECURITY DEFINER so policies can read profiles/firms without recursing into their own RLS.
create or replace function auth_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where user_id = auth.uid()
$$;

-- Null when the person or their firm is suspended, or the person hasn't accepted their invite.
create or replace function auth_firm_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.firm_id from profiles p join firms f on f.id = p.firm_id
  where p.user_id = auth.uid() and p.status = 'active' and f.status = 'active'
$$;

create or replace function auth_role() returns member_role
language sql stable security definer set search_path = public as $$
  select role from profiles where user_id = auth.uid() and status = 'active'
$$;

create or replace function auth_can(action text) returns boolean
language sql stable as $$
  select case auth_role()
    when 'owner' then true
    when 'admin' then action not in ('billing.pay', 'ownership.transfer')
    when 'accountant' then action in ('clients.edit', 'transactions.post', 'transactions.delete')
    else false
  end
$$;

create or replace function firm_write_block_reason(firm uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when f.id is null then 'Firm not found.'
    when f.status = 'suspended' then 'This firm''s access is suspended.'
    when f.billing_status in ('paid', 'complimentary') then null
    when f.billing_status = 'trial' and now() < f.trial_ends_at then null
    when f.billing_status = 'trial' then 'The free trial ended on ' || to_char(f.trial_ends_at, 'FMDD Mon YYYY') || '.'
    else 'This firm is read-only.'
  end
  from (select 1) one left join firms f on f.id = firm
$$;

create or replace function firm_can_write(firm uuid) returns boolean
language sql stable as $$ select firm_write_block_reason(firm) is null $$;

alter table bank_accounts alter column firm_id set default auth_firm_id();
alter table clients       alter column firm_id set default auth_firm_id();
alter table transactions  alter column firm_id set default auth_firm_id();

-- firms
create policy firms_read on firms for select using (id = auth_firm_id());
create policy firms_update on firms for update
  using (id = auth_firm_id() and auth_can('settings.manage') and firm_can_write(id))
  with check (id = auth_firm_id());

-- profiles: everyone in the firm can see the team; changes go through RPCs / the team function.
create policy profiles_read on profiles for select using (firm_id = auth_firm_id() or user_id = auth.uid());

-- bank accounts
create policy bank_read   on bank_accounts for select using (firm_id = auth_firm_id());
create policy bank_insert on bank_accounts for insert with check (firm_id = auth_firm_id() and auth_can('settings.manage') and firm_can_write(firm_id));
create policy bank_update on bank_accounts for update using (firm_id = auth_firm_id() and auth_can('settings.manage') and firm_can_write(firm_id)) with check (firm_id = auth_firm_id());

-- clients
create policy clients_read   on clients for select using (firm_id = auth_firm_id());
create policy clients_insert on clients for insert with check (firm_id = auth_firm_id() and auth_can('clients.edit') and firm_can_write(firm_id));
create policy clients_update on clients for update using (firm_id = auth_firm_id() and auth_can('clients.edit') and firm_can_write(firm_id)) with check (firm_id = auth_firm_id());
create policy clients_delete on clients for delete using (firm_id = auth_firm_id() and auth_can('clients.delete') and firm_can_write(firm_id));

-- transactions
create policy txns_read   on transactions for select using (firm_id = auth_firm_id());
create policy txns_insert on transactions for insert with check (firm_id = auth_firm_id() and auth_can('transactions.post') and firm_can_write(firm_id));
create policy txns_update on transactions for update using (firm_id = auth_firm_id() and auth_can('transactions.post') and firm_can_write(firm_id)) with check (firm_id = auth_firm_id());
create policy txns_delete on transactions for delete using (firm_id = auth_firm_id() and auth_can('transactions.delete') and firm_can_write(firm_id));

-- change log: owners and admins read; only triggers write.
create policy log_read on change_log for select using (firm_id = auth_firm_id() and auth_role() in ('owner', 'admin'));

-- preferences: private per person.
create policy prefs_all on user_preferences for all using (profile_id = auth_profile_id()) with check (profile_id = auth_profile_id());

-- platform_settings, waitlist, stripe_events: no policies → service role only (Plans B/C add what they need).
```

- [ ] **Step 5: Run tests**

Run: `supabase db reset && supabase test db`
Expected: `01`, `02`, `03` all ok.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261003000002_tenancy.sql supabase/tests/02_isolation.test.sql supabase/tests/03_roles.test.sql
git commit -m "feat(db): firm isolation and role permissions via RLS"
```

---

### Task 5: Invariants, write rules and change log

**Files:**
- Create: `supabase/migrations/20261003000003_invariants.sql`, `supabase/tests/04_invariants.test.sql`, `supabase/tests/05_write_rules.test.sql`

**Interfaces:**
- Produces: trigger functions `check_same_firm()`, `lock_firm_columns()`, `log_change()`; partial unique indexes `one_owner_per_firm`, `one_default_bank_per_firm`. Errors raised with `errcode = 'P0001'` and a human message (the frontend shows `error.message` for `P0001`).

- [ ] **Step 1: Write the failing invariants test**

`supabase/tests/04_invariants.test.sql`:
```sql
begin;
select plan(7);

-- As postgres (bypasses RLS) to test the constraints themselves.
select throws_ok(
  $$ update firms set currency = 'USD' where id = '0000000a-0000-0000-0000-000000000001' $$,
  'P0001', 'The firm currency can''t change once transactions exist.', 'currency locked once transactions exist');

select throws_ok(
  $$ insert into transactions (firm_id, client_id, bank_account_id, kind, amount_minor, date)
     values ('0000000a-0000-0000-0000-000000000001', '0000000b-0000-0000-0000-0000000000c1', '0000000a-0000-0000-0000-0000000000ba', 'receipt', 1, current_date) $$,
  'P0001', 'Client and bank account must belong to the same firm as the transaction.', 'cross-firm client rejected');

select throws_ok(
  $$ update profiles set role = 'owner' where user_id = '00000000-0000-0000-0000-0000000000a4' $$,
  '23505', null, 'only one owner per firm');

select throws_ok(
  $$ insert into bank_accounts (firm_id, name, is_default) values ('0000000a-0000-0000-0000-000000000001', 'Second', true) $$,
  '23505', null, 'only one default bank account per firm');

update clients set notes = 'audited' where id = '0000000a-0000-0000-0000-0000000000c1';
select is(
  (select after->>'notes' from change_log where row_id = '0000000a-0000-0000-0000-0000000000c1' and action = 'update' order by at desc limit 1),
  'audited', 'updates are written to change_log');

delete from transactions where description = 'Top-up';
select isnt(
  (select before->>'description' from change_log where table_name = 'transactions' and action = 'delete' order by at desc limit 1),
  null, 'deleted rows are kept in change_log');

-- As the alpha owner, billing columns are protected.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(
  $$ update firms set billing_status = 'paid' $$,
  'P0001', 'Billing details can only be changed by the platform.', 'firm users cannot change billing');

select * from finish();
rollback;
```

- [ ] **Step 2: Write the failing write-rules test**

`supabase/tests/05_write_rules.test.sql`:
```sql
begin;
select plan(5);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$ insert into clients (name) values ('During trial') $$, 'trial firm can write');

reset role;
update firms set trial_ends_at = now() - interval '1 day' where id = '0000000b-0000-0000-0000-000000000001';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$ insert into clients (name) values ('After trial') $$, '42501', null, 'expired trial cannot write');
select is((select count(*)::int from clients), 2, 'expired trial can still read');
select matches(firm_write_block_reason('0000000b-0000-0000-0000-000000000001'), '^The free trial ended on ', 'reason names the trial end');

reset role;
update firms set status = 'suspended' where id = '0000000a-0000-0000-0000-000000000001';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from clients), 0, 'suspended firm sees nothing');

select * from finish();
rollback;
```

- [ ] **Step 3: Run to confirm failure**

Run: `supabase test db`
Expected: `04` and `05` fail (no triggers yet; `05` may partly pass — that's fine).

- [ ] **Step 4: Write the migration**

`supabase/migrations/20261003000003_invariants.sql`:
```sql
create unique index one_owner_per_firm on profiles (firm_id) where role = 'owner' and status <> 'suspended';
create unique index one_default_bank_per_firm on bank_accounts (firm_id) where is_default;

create or replace function check_same_firm() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'transactions' then
    if not exists (select 1 from clients where id = new.client_id and firm_id = new.firm_id)
       or not exists (select 1 from bank_accounts where id = new.bank_account_id and firm_id = new.firm_id) then
      raise exception 'Client and bank account must belong to the same firm as the transaction.' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'clients' and new.assigned_to is not null then
    if not exists (select 1 from profiles where id = new.assigned_to and firm_id = new.firm_id) then
      raise exception 'The assigned member must belong to the same firm.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger same_firm before insert or update on transactions for each row execute function check_same_firm();
create trigger same_firm before insert or update on clients for each row execute function check_same_firm();

-- Platform-owned columns may only change via the service role (Edge Functions / dashboard).
create or replace function lock_firm_columns() returns trigger language plpgsql as $$
begin
  if new.currency is distinct from old.currency
     and exists (select 1 from transactions where firm_id = old.id) then
    raise exception 'The firm currency can''t change once transactions exist.' using errcode = 'P0001';
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'postgres' and (
       new.billing_status is distinct from old.billing_status or new.trial_ends_at is distinct from old.trial_ends_at
    or new.paid_at is distinct from old.paid_at or new.status is distinct from old.status or new.source is distinct from old.source
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_checkout_session_id is distinct from old.stripe_checkout_session_id
    or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id) then
    raise exception 'Billing details can only be changed by the platform.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger lock_columns before update on firms for each row execute function lock_firm_columns();

create or replace function log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_firm uuid := case tg_table_name when 'firms' then coalesce(new.id, old.id) else coalesce(new.firm_id, old.firm_id) end;
begin
  insert into change_log (firm_id, table_name, row_id, action, before, after, actor)
  values (v_firm, tg_table_name, coalesce(new.id, old.id), lower(tg_op)::change_action,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          auth.uid());
  return coalesce(new, old);
end $$;
create trigger log after insert or update or delete on firms         for each row execute function log_change();
create trigger log after insert or update or delete on profiles      for each row execute function log_change();
create trigger log after insert or update or delete on bank_accounts for each row execute function log_change();
create trigger log after insert or update or delete on clients       for each row execute function log_change();
create trigger log after insert or update or delete on transactions  for each row execute function log_change();
```

Note: `firms` rows are `old`/`new` of type `firms`, which has no `firm_id`; the `case` above reads `new.id` for that table. PL/pgSQL resolves record fields at run time, so the `firm_id` branch is never evaluated for `firms`.

- [ ] **Step 5: Run tests**

Run: `supabase db reset && supabase test db`
Expected: `01`–`05` ok.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261003000003_invariants.sql supabase/tests/04_invariants.test.sql supabase/tests/05_write_rules.test.sql
git commit -m "feat(db): firm invariants, write rules and change log"
```

---

### Task 6: Ledger and import functions

**Files:**
- Create: `supabase/migrations/20261003000005_ledger.sql`, `supabase/migrations/20261003000006_import.sql`, `supabase/tests/06_ledger.test.sql`, `supabase/tests/07_import.test.sql`

**Interfaces:**
- Produces:
  - `client_balances(p_from date, p_to date, p_bank_account uuid default null, p_client uuid default null)` → `table(client_id uuid, opening bigint, receipts bigint, payments bigint, closing bigint, txn_count int, last_txn_date date)`
  - `ledger_lines(p_from date, p_to date, p_client uuid default null, p_bank_account uuid default null, p_per_client boolean default false)` → `table(id uuid, client_id uuid, bank_account_id uuid, kind txn_kind, amount_minor bigint, date date, description text, created_at timestamptz, updated_at timestamptz, balance bigint)` ordered `date, created_at, id`
  - `import_transactions(p_rows jsonb, p_dry_run boolean default false)` → `jsonb {"transactions": int, "clients": int, "duplicates": int}`. Each row object: `{"line": int, "client_name": text, "bank_account": text|null, "kind": "receipt"|"payment", "amount_minor": int, "date": "YYYY-MM-DD", "description": text}`.

- [ ] **Step 1: Write the failing ledger test**

`supabase/tests/06_ledger.test.sql` (fixture mirrors `src/ledger.test.ts` "statement rolls prior entries…": opening 7500 sen-equivalent scaled ×100 in seed):
```sql
begin;
select plan(6);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
set local role authenticated;

-- Seed Kopi Corner: +1,000,000 (20 Aug) −250,000 (31 Aug) −100,000 (5 Sep) +40,000 (30 Sep)
select is(
  (select row(opening, receipts, payments, closing, txn_count)::text from client_balances('2026-09-01', '2026-09-30')
   where client_id = '0000000a-0000-0000-0000-0000000000c1'),
  '(750000,40000,100000,690000,2)', 'September balances for Kopi Corner');

select is(
  (select array_agg(balance order by date) from ledger_lines('2026-09-01', '2026-09-30', '0000000a-0000-0000-0000-0000000000c1')),
  array[650000, 690000]::bigint[], 'running balance starts from the opening balance');

select is(
  (select count(*)::int from client_balances('2026-09-01', '2026-09-30')), 2, 'one row per client in the firm, including zero-activity');

select is(
  (select closing from client_balances('2026-01-01', '2026-12-31', null, '0000000a-0000-0000-0000-0000000000c2')),
  500000::bigint, 'p_client limits to one client');

select is(
  (select array_agg(balance order by date, created_at) from ledger_lines('2026-09-01', '2026-09-30', null, null, true)),
  array[650000, 500000, 690000]::bigint[], 'per-client running balances when p_per_client');

select is(
  (select array_agg(balance order by date, created_at) from ledger_lines('2026-09-01', '2026-09-30')),
  array[1150000, 1650000, 1690000]::bigint[], 'firm-wide running balance by default');

select * from finish();
rollback;
```

- [ ] **Step 2: Write the failing import test**

`supabase/tests/07_import.test.sql`:
```sql
begin;
select plan(6);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000a2', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  import_transactions('[
    {"line":2,"client_name":"kopi corner sdn bhd","bank_account":null,"kind":"receipt","amount_minor":1000000,"date":"2026-08-20","description":"Retainer received"},
    {"line":3,"client_name":"New Co Sdn Bhd","bank_account":"Client account","kind":"payment","amount_minor":500,"date":"2026-09-02","description":"Stamp duty"}
  ]'::jsonb, true),
  '{"clients": 1, "duplicates": 1, "transactions": 1}'::jsonb, 'dry run counts new clients, duplicates and rows');

select is((select count(*)::int from clients where name = 'New Co Sdn Bhd'), 0, 'dry run writes nothing');

select is(
  import_transactions('[
    {"line":2,"client_name":"New Co Sdn Bhd","bank_account":null,"kind":"payment","amount_minor":500,"date":"2026-09-02","description":"Stamp duty"}
  ]'::jsonb),
  '{"clients": 1, "duplicates": 0, "transactions": 1}'::jsonb, 'import creates the client and the row');

select throws_ok(
  $$ select import_transactions('[
    {"line":2,"client_name":"Kopi Corner Sdn Bhd","bank_account":null,"kind":"receipt","amount_minor":100,"date":"2026-09-03","description":"ok"},
    {"line":3,"client_name":"Kopi Corner Sdn Bhd","bank_account":"Nonexistent","kind":"receipt","amount_minor":100,"date":"2026-09-03","description":"bad"}
  ]'::jsonb) $$,
  'P0001', 'Row 3: bank account "Nonexistent" not found.', 'unknown bank account names the row');

select is((select count(*)::int from transactions where description = 'ok'), 0, 'a failing import writes nothing');

reset role;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000a3', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(
  $$ select import_transactions('[{"line":2,"client_name":"Kopi Corner Sdn Bhd","bank_account":null,"kind":"receipt","amount_minor":1,"date":"2026-09-03","description":"x"}]'::jsonb) $$,
  'P0001', 'Your role can''t import transactions.', 'viewer cannot import');

select * from finish();
rollback;
```

- [ ] **Step 3: Run to confirm failure**

Run: `supabase test db`
Expected: FAIL — functions do not exist.

- [ ] **Step 4: Write the ledger migration**

`supabase/migrations/20261003000005_ledger.sql`:
```sql
-- SECURITY INVOKER: RLS on clients/transactions limits results to the caller's firm.
create or replace function client_balances(p_from date, p_to date, p_bank_account uuid default null, p_client uuid default null)
returns table (client_id uuid, opening bigint, receipts bigint, payments bigint, closing bigint, txn_count int, last_txn_date date)
language sql stable security invoker set search_path = public as $$
  select c.id,
    coalesce(sum(case when t.date < p_from then case t.kind when 'receipt' then t.amount_minor else -t.amount_minor end end), 0)::bigint,
    coalesce(sum(case when t.date between p_from and p_to and t.kind = 'receipt' then t.amount_minor end), 0)::bigint,
    coalesce(sum(case when t.date between p_from and p_to and t.kind = 'payment' then t.amount_minor end), 0)::bigint,
    coalesce(sum(case when t.date <= p_to then case t.kind when 'receipt' then t.amount_minor else -t.amount_minor end end), 0)::bigint,
    (count(t.id) filter (where t.date between p_from and p_to))::int,
    max(t.date) filter (where t.date <= p_to)
  from clients c
  left join transactions t on t.client_id = c.id and (p_bank_account is null or t.bank_account_id = p_bank_account)
  where p_client is null or c.id = p_client
  group by c.id
$$;

create or replace function ledger_lines(p_from date, p_to date, p_client uuid default null, p_bank_account uuid default null, p_per_client boolean default false)
returns table (id uuid, client_id uuid, bank_account_id uuid, kind txn_kind, amount_minor bigint, date date,
               description text, created_at timestamptz, updated_at timestamptz, balance bigint)
language sql stable security invoker set search_path = public as $$
  select x.* from (
    select t.id, t.client_id, t.bank_account_id, t.kind, t.amount_minor, t.date, t.description, t.created_at, t.updated_at,
      (sum(case t.kind when 'receipt' then t.amount_minor else -t.amount_minor end)
         over (partition by case when p_per_client then t.client_id end
               order by t.date, t.created_at, t.id rows unbounded preceding))::bigint
    from transactions t
    where (p_client is null or t.client_id = p_client)
      and (p_bank_account is null or t.bank_account_id = p_bank_account)
      and t.date <= p_to
  ) x
  where x.date >= p_from
  order by x.date, x.created_at, x.id
$$;
```

- [ ] **Step 5: Write the import migration**

`supabase/migrations/20261003000006_import.sql`:
```sql
-- All-or-nothing: any error rolls back the whole call. SECURITY INVOKER so RLS and firm_can_write apply.
create or replace function import_transactions(p_rows jsonb, p_dry_run boolean default false)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_firm uuid := auth_firm_id();
  v_default_bank uuid;
  r jsonb;
  v_client uuid;
  v_bank uuid;
  v_new_clients int := 0;
  v_dupes int := 0;
  v_rows int := 0;
  v_seen_new text[] := '{}';
begin
  if v_firm is null then raise exception 'You are not signed in to an active firm.' using errcode = 'P0001'; end if;
  if not auth_can('transactions.post') then raise exception 'Your role can''t import transactions.' using errcode = 'P0001'; end if;
  if not firm_can_write(v_firm) then raise exception 'Your firm can''t make changes right now: %', firm_write_block_reason(v_firm) using errcode = 'P0001'; end if;

  select id into v_default_bank from bank_accounts where firm_id = v_firm and is_default and is_active;

  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(r->>'bank_account', '') = '' then
      v_bank := v_default_bank;
      if v_bank is null then raise exception 'Row %: no default bank account is set.', r->>'line' using errcode = 'P0001'; end if;
    else
      select id into v_bank from bank_accounts where firm_id = v_firm and is_active and lower(name) = lower(trim(r->>'bank_account'));
      if v_bank is null then raise exception 'Row %: bank account "%" not found.', r->>'line', r->>'bank_account' using errcode = 'P0001'; end if;
    end if;

    select id into v_client from clients where firm_id = v_firm and lower(name) = lower(trim(r->>'client_name')) limit 1;
    if v_client is null then
      if not (lower(trim(r->>'client_name')) = any (v_seen_new)) then
        v_new_clients := v_new_clients + 1;
        v_seen_new := v_seen_new || lower(trim(r->>'client_name'));
      end if;
      if not p_dry_run then
        insert into clients (name) values (trim(r->>'client_name')) returning id into v_client;
      end if;
    elsif exists (select 1 from transactions where client_id = v_client and date = (r->>'date')::date
                  and kind = (r->>'kind')::txn_kind and amount_minor = (r->>'amount_minor')::bigint
                  and description = coalesce(r->>'description', '')) then
      v_dupes := v_dupes + 1;
      continue;
    end if;

    v_rows := v_rows + 1;
    if not p_dry_run then
      insert into transactions (client_id, bank_account_id, kind, amount_minor, date, description)
      values (v_client, v_bank, (r->>'kind')::txn_kind, (r->>'amount_minor')::bigint, (r->>'date')::date, coalesce(r->>'description', ''));
    end if;
  end loop;

  return jsonb_build_object('transactions', v_rows, 'clients', v_new_clients, 'duplicates', v_dupes);
end $$;
```

- [ ] **Step 6: Run tests**

Run: `supabase db reset && supabase test db`
Expected: `01`–`07` ok.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261003000005_ledger.sql supabase/migrations/20261003000006_import.sql supabase/tests/06_ledger.test.sql supabase/tests/07_import.test.sql
git commit -m "feat(db): balances, running ledger and all-or-nothing import"
```

---

### Task 7: Team RPCs, `team` Edge Function, storage

**Files:**
- Create: `supabase/migrations/20261003000004_team.sql`, `supabase/migrations/20261003000007_storage.sql`, `supabase/tests/08_team.test.sql`, `supabase/functions/team/rules.ts`, `supabase/functions/team/rules.test.ts`, `supabase/functions/team/index.ts`

**Interfaces:**
- SQL RPCs (all `security definer`, raise `P0001` with a human message): `accept_invite() → void`, `touch_last_active() → void`, `change_member_role(p_profile uuid, p_role member_role) → void`, `suspend_member(p_profile uuid) → void`, `reactivate_member(p_profile uuid) → void`, `transfer_ownership(p_profile uuid) → void`.
- Edge Function `team` (POST JSON, `Authorization: Bearer <user jwt>`):
  - `{ "action": "invite", "name": string, "email": string, "role": "admin"|"accountant"|"viewer" }` → `201 { "profileId": string }`
  - `{ "action": "resend", "profileId": string }` → `200 {}`
  - `{ "action": "remove", "profileId": string }` → `200 {}`
  - Errors: `4xx { "error": string }` with a human message.
- `decide(actor, target, action)` in `rules.ts` → `string | null` (error message or null = allowed).

- [ ] **Step 1: Write the failing team SQL test**

`supabase/tests/08_team.test.sql`:
```sql
begin;
select plan(6);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2'); -- accountant
select throws_ok($$ select change_member_role((select id from profiles where email = 'viewer@alpha.test'), 'admin') $$,
  'P0001', 'Your role can''t manage users.', 'accountant cannot change roles');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4'); -- admin
select throws_ok($$ select suspend_member((select id from profiles where email = 'owner@alpha.test')) $$,
  'P0001', 'Only the owner can change the owner.', 'admin cannot suspend the owner');
select lives_ok($$ select change_member_role((select id from profiles where email = 'viewer@alpha.test'), 'accountant') $$,
  'admin can change a viewer to accountant');
select throws_ok($$ select change_member_role((select id from profiles where email = 'viewer@alpha.test'), 'owner') $$,
  'P0001', 'Use Transfer ownership to make someone the owner.', 'owner role only via transfer');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1'); -- owner
select lives_ok($$ select transfer_ownership((select id from profiles where email = 'admin@alpha.test')) $$, 'owner transfers ownership');
reset role;
select is((select role::text from profiles where email = 'owner@alpha.test'), 'admin', 'previous owner becomes admin');

select * from finish();
rollback;
```

- [ ] **Step 2: Write the failing Deno rules test**

`supabase/functions/team/rules.test.ts`:
```ts
import { assertEquals } from 'jsr:@std/assert@1'
import { decide, type Member } from './rules.ts'

const owner: Member = { id: 'o', firmId: 'f', role: 'owner', status: 'active' }
const admin: Member = { id: 'a', firmId: 'f', role: 'admin', status: 'active' }
const accountant: Member = { id: 'c', firmId: 'f', role: 'accountant', status: 'active' }
const otherFirm: Member = { id: 'x', firmId: 'g', role: 'viewer', status: 'active' }

Deno.test('admins and owners may invite', () => {
  assertEquals(decide(admin, null, 'invite'), null)
  assertEquals(decide(accountant, null, 'invite'), "Your role can't manage users.")
})

Deno.test('nobody removes themselves or the owner (except nobody)', () => {
  assertEquals(decide(owner, owner, 'remove'), "You can't remove yourself.")
  assertEquals(decide(admin, owner, 'remove'), 'Only the owner can change the owner.')
  assertEquals(decide(owner, admin, 'remove'), null)
})

Deno.test('targets must be in the same firm', () => {
  assertEquals(decide(owner, otherFirm, 'remove'), 'That person is not in your firm.')
})
```

- [ ] **Step 3: Run both to confirm failure**

Run: `supabase test db; deno test supabase/functions/team`
Expected: FAIL — functions/modules missing.

- [ ] **Step 4: Write the team migration**

`supabase/migrations/20261003000004_team.sql`:
```sql
create or replace function pg_temp_assert_manager(p_target uuid) returns profiles
language plpgsql security definer set search_path = public as $$
declare v_actor profiles; v_target profiles;
begin
  select * into v_actor from profiles where user_id = auth.uid() and status = 'active';
  if v_actor.id is null or not auth_can('users.manage') then
    raise exception 'Your role can''t manage users.' using errcode = 'P0001';
  end if;
  select * into v_target from profiles where id = p_target;
  if v_target.id is null or v_target.firm_id is distinct from v_actor.firm_id then
    raise exception 'That person is not in your firm.' using errcode = 'P0001';
  end if;
  if v_target.id = v_actor.id then raise exception 'You can''t change your own access.' using errcode = 'P0001'; end if;
  if v_target.role = 'owner' then raise exception 'Only the owner can change the owner.' using errcode = 'P0001'; end if;
  if not firm_can_write(v_actor.firm_id) then
    raise exception 'Your firm can''t make changes right now: %', firm_write_block_reason(v_actor.firm_id) using errcode = 'P0001';
  end if;
  return v_target;
end $$;
alter function pg_temp_assert_manager(uuid) rename to assert_manager;
revoke execute on function assert_manager(uuid) from public, anon, authenticated;

create or replace function accept_invite() returns void language sql security definer set search_path = public as $$
  update profiles set status = 'active', last_active_at = now() where user_id = auth.uid() and status = 'invited'
$$;

create or replace function touch_last_active() returns void language sql security definer set search_path = public as $$
  update profiles set last_active_at = now() where user_id = auth.uid() and status = 'active'
$$;

create or replace function change_member_role(p_profile uuid, p_role member_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_manager(p_profile);
  if p_role = 'owner' then raise exception 'Use Transfer ownership to make someone the owner.' using errcode = 'P0001'; end if;
  update profiles set role = p_role where id = p_profile;
end $$;

create or replace function suspend_member(p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_manager(p_profile);
  update profiles set status = 'suspended' where id = p_profile;
end $$;

create or replace function reactivate_member(p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_target profiles;
begin
  v_target := assert_manager(p_profile);
  -- Someone who never signed in goes back to invited, not active.
  update profiles set status = case when v_target.last_active_at is null then 'invited' else 'active' end::member_status
  where id = p_profile;
end $$;

create or replace function transfer_ownership(p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_actor profiles; v_target profiles;
begin
  select * into v_actor from profiles where user_id = auth.uid() and status = 'active';
  if v_actor.role is distinct from 'owner' then raise exception 'Only the owner can transfer ownership.' using errcode = 'P0001'; end if;
  select * into v_target from profiles where id = p_profile and firm_id = v_actor.firm_id and status = 'active';
  if v_target.id is null then raise exception 'Choose an active member of your firm.' using errcode = 'P0001'; end if;
  if v_target.id = v_actor.id then raise exception 'You are already the owner.' using errcode = 'P0001'; end if;
  -- Demote first so the one-owner index never sees two owners.
  update profiles set role = 'admin' where id = v_actor.id;
  update profiles set role = 'owner' where id = v_target.id;
end $$;
```

Note: `pg_temp_assert_manager` is a plain public function name created then renamed to `assert_manager` — it is not in the `pg_temp` schema (that prefix is only part of the name). Simpler: create it directly as `assert_manager`; the rename line can be deleted. Keep the `revoke` so clients can't call it directly.

- [ ] **Step 5: Write the storage migration**

`supabase/migrations/20261003000007_storage.sql`:
```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', false, 204800, array['image/png', 'image/jpeg', 'image/svg+xml'])
on conflict (id) do nothing;

create policy logos_read on storage.objects for select
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth_firm_id()::text);
create policy logos_write on storage.objects for insert
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = auth_firm_id()::text and auth_can('settings.manage'));
create policy logos_update on storage.objects for update
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth_firm_id()::text and auth_can('settings.manage'));
create policy logos_delete on storage.objects for delete
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth_firm_id()::text and auth_can('settings.manage'));
```

- [ ] **Step 6: Write the Edge Function rules and handler**

`supabase/functions/team/rules.ts`:
```ts
export type Role = 'owner' | 'admin' | 'accountant' | 'viewer'
export type Member = { id: string; firmId: string; role: Role; status: 'active' | 'invited' | 'suspended' }
export type TeamAction = 'invite' | 'resend' | 'remove'

/** Returns an error message, or null when allowed. Mirrors assert_manager() in SQL. */
export function decide(actor: Member, target: Member | null, action: TeamAction): string | null {
  if (actor.status !== 'active' || (actor.role !== 'owner' && actor.role !== 'admin')) return "Your role can't manage users."
  if (action === 'invite') return null
  if (!target || target.firmId !== actor.firmId) return 'That person is not in your firm.'
  if (target.id === actor.id) return "You can't remove yourself."
  if (target.role === 'owner') return 'Only the owner can change the owner.'
  return null
}
```

`supabase/functions/team/index.ts`:
```ts
import { createClient } from 'npm:@supabase/supabase-js@2'
import { decide, type Member, type Role } from './rules.ts'

const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5199'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

type ProfileRow = { id: string; firm_id: string; role: Role; status: Member['status']; email: string; name: string; user_id: string }
const toMember = (p: ProfileRow): Member => ({ id: p.id, firmId: p.firm_id, role: p.role, status: p.status })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })

  const admin = createClient(url, serviceKey)
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /, '')
  const { data: auth } = await admin.auth.getUser(jwt ?? '')
  if (!auth.user) return json(401, { error: 'Please sign in again.' })

  const { data: actorRow } = await admin.from('profiles').select('*').eq('user_id', auth.user.id).single<ProfileRow>()
  if (!actorRow) return json(403, { error: "Your role can't manage users." })
  const { data: writable } = await admin.rpc('firm_can_write', { firm: actorRow.firm_id })
  if (!writable) return json(403, { error: "Your firm can't make changes right now." })

  const body = await req.json().catch(() => null) as
    | { action: 'invite'; name: string; email: string; role: Role }
    | { action: 'resend' | 'remove'; profileId: string }
    | null
  if (!body) return json(400, { error: 'Invalid request.' })

  if (body.action === 'invite') {
    const denied = decide(toMember(actorRow), null, 'invite')
    if (denied) return json(403, { error: denied })
    const email = body.email.trim().toLowerCase()
    const name = body.name.trim()
    if (!name) return json(400, { error: 'Enter their full name.' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'Enter a valid email address.' })
    if (body.role === 'owner') return json(400, { error: 'Use Transfer ownership to make someone the owner.' })
    const { data: existing } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle()
    if (existing) return json(409, { error: 'Someone with that email already has access.' })
    const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${appUrl}/app#set-password`, data: { name } })
    if (error || !invited.user) return json(502, { error: 'The invitation email could not be sent. Try again.' })
    const { data: profile, error: insertError } = await admin.from('profiles')
      .insert({ user_id: invited.user.id, firm_id: actorRow.firm_id, name, email, role: body.role, status: 'invited' })
      .select('id').single()
    if (insertError) {
      await admin.auth.admin.deleteUser(invited.user.id)
      return json(500, { error: 'The invitation could not be saved. Try again.' })
    }
    return json(201, { profileId: profile.id })
  }

  const { data: targetRow } = await admin.from('profiles').select('*').eq('id', body.profileId).maybeSingle<ProfileRow>()
  const denied = decide(toMember(actorRow), targetRow ? toMember(targetRow) : null, body.action)
  if (denied) return json(403, { error: denied })

  if (body.action === 'resend') {
    if (targetRow!.status !== 'invited') return json(400, { error: 'Only pending invitations can be resent.' })
    const { error } = await admin.auth.admin.inviteUserByEmail(targetRow!.email, { redirectTo: `${appUrl}/app#set-password` })
    return error ? json(502, { error: 'The invitation email could not be sent. Try again.' }) : json(200, {})
  }

  const { error } = await admin.auth.admin.deleteUser(targetRow!.user_id)
  return error ? json(500, { error: 'That person could not be removed. Try again.' }) : json(200, {})
})
```

- [ ] **Step 7: Run all backend tests**

Run: `supabase db reset && supabase test db && deno test supabase/functions/team`
Expected: `01`–`08` ok; 3 Deno tests pass.

- [ ] **Step 8: Smoke-test the function locally**

```bash
supabase functions serve team --env-file supabase/functions/.env.local &
TOKEN=$(curl -s "http://127.0.0.1:54321/auth/v1/token?grant_type=password" -H "apikey: $(supabase status -o env | awk -F= '/^ANON_KEY=/{print $2}' | tr -d '"')" -H 'Content-Type: application/json' -d '{"email":"owner@alpha.test","password":"password123"}' | jq -r .access_token)
curl -s http://127.0.0.1:54321/functions/v1/team -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"action":"invite","name":"Siti Hajar","email":"siti@alpha.test","role":"accountant"}'
```
with `supabase/functions/.env.local` containing `APP_URL=http://localhost:5199` (git-ignored). Expected: `{"profileId":"…"}`; Inbucket (http://127.0.0.1:54324) shows the invite email.

- [ ] **Step 9: Commit**

```bash
printf 'supabase/functions/.env.local\n' >> .gitignore
git add .gitignore supabase/migrations/20261003000004_team.sql supabase/migrations/20261003000007_storage.sql supabase/tests/08_team.test.sql supabase/functions/team
git commit -m "feat(db): team management RPCs, team edge function and logo storage"
```

---

### Task 8: Mappers, money, errors and the equivalence test

**Files:**
- Create: `src/data/mappers.ts`, `src/data/mappers.test.ts`, `src/data/money.ts`, `src/data/money.test.ts`, `src/data/errors.ts`, `src/data/errors.test.ts`, `src/data/equivalence.db.test.ts`
- Modify: `src/ledger.ts` (extend `Txn`; make money formatting currency-aware)

**Interfaces:**
- Consumes: generated `Database` types; SQL functions from Task 6.
- Produces (exact names used by Tasks 9–12):
  ```ts
  // src/ledger.ts
  export type Txn = { id: string; clientId: string; bankAccountId: string; kind: Kind; amount: number; date: string; note: string; createdAt: string; updatedAt: string }
  export function makeMoney(currency: string): { format(cents: number): string; compact(cents: number): string }
  // src/data/mappers.ts
  export type ClientRow = Database['public']['Tables']['clients']['Row']
  export function rowToClient(r: ClientRow): Client
  export function clientToRow(c: Partial<Client>): Partial<ClientRow>
  export type LedgerRow = { id: string; client_id: string; bank_account_id: string; kind: 'receipt' | 'payment'; amount_minor: number; date: string; description: string; created_at: string; updated_at: string; balance: number }
  export function rowToLine(r: LedgerRow): StatementLine
  export type BalanceRow = { client_id: string; opening: number; receipts: number; payments: number; closing: number; txn_count: number; last_txn_date: string | null }
  export function toStatement(balance: BalanceRow | undefined, lines: StatementLine[]): Statement
  export function sumBalances(rows: BalanceRow[]): Statement   // lines: []
  export type Firm = { id: string; name: string; tradingName: string; registrationNo: string; sstNo: string; phone: string; email: string; website: string; address1: string; address2: string; postcode: string; city: string; state: string; country: string; logoPath: string | null; currency: string; statementNote: string; discrepancyDays: number; showRegistrationOnStatement: boolean; fyStartMonth: number; dateFormat: 'text' | 'numeric'; billingStatus: 'trial' | 'paid' | 'complimentary' | 'read_only'; trialEndsAt: string | null; paidAt: string | null }
  export function rowToFirm(r: FirmRow): Firm
  export function firmToRow(f: Partial<Firm>): Partial<FirmRow>
  export type BankAccount = { id: string; name: string; bankName: string; accountName: string; accountNo: string; isDefault: boolean; isActive: boolean }
  export function rowToBank(r: BankRow): BankAccount
  export type Member = { id: string; userId: string; name: string; email: string; role: Role; status: 'active' | 'invited' | 'suspended'; lastActiveAt: string | null; createdAt: string }
  export function rowToMember(r: ProfileRow): Member
  export function parseAmount(input: string): { ok: true; cents: number } | { ok: false; error: string }
  // src/data/errors.ts
  export function toUserMessage(error: unknown, ctx?: { writeBlockReason?: string | null }): string
  ```

- [ ] **Step 1: Write failing tests**

`src/data/mappers.test.ts`:
```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clientToRow, parseAmount, rowToClient, rowToLine, sumBalances, toStatement } from './mappers.ts'

const row = {
  id: 'c1', firm_id: 'f', type: 'company', name: 'Kopi Corner', registration_no: '', industry: '', contact: 'Wei', phone: '+60123',
  email: 'a@b.c', website: '', address1: '', address2: '', postcode: '', city: '', state: '', country: 'Malaysia', status: 'active',
  tags: ['VIP'], assigned_to: null, notes: '', is_sample: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z',
  created_by: null, updated_by: null,
} as const

test('rowToClient maps snake_case to the app Client', () => {
  const c = rowToClient(row as never)
  assert.equal(c.registrationNo, '')
  assert.equal(c.assignedUserId, undefined)
  assert.deepEqual(c.tags, ['VIP'])
  assert.equal(c.createdAt, '2026-01-01')
  assert.equal(c.updatedAt, '2026-02-01T00:00:00Z')
})

test('clientToRow only includes fields that were given', () => {
  assert.deepEqual(clientToRow({ name: 'X', assignedUserId: undefined, registrationNo: '123' }), { name: 'X', assigned_to: null, registration_no: '123' })
})

test('rowToLine maps receipt/payment to in/out', () => {
  const l = rowToLine({ id: 't', client_id: 'c', bank_account_id: 'b', kind: 'payment', amount_minor: 1250, date: '2026-09-01', description: 'Fee', created_at: 'x', updated_at: 'y', balance: -1250 })
  assert.deepEqual([l.kind, l.amount, l.note, l.balance, l.bankAccountId], ['out', 1250, 'Fee', -1250, 'b'])
})

test('toStatement and sumBalances', () => {
  const b = { client_id: 'c', opening: 100, receipts: 50, payments: 20, closing: 130, txn_count: 2, last_txn_date: '2026-09-30' }
  assert.deepEqual(toStatement(b, []), { opening: 100, receipts: 50, payments: 20, closing: 130, lines: [] })
  assert.deepEqual(toStatement(undefined, []), { opening: 0, receipts: 0, payments: 0, closing: 0, lines: [] })
  assert.deepEqual(sumBalances([b, { ...b, opening: -10, closing: 20 }]).closing, 150)
})

test('parseAmount rejects amounts above the database cap', () => {
  assert.deepEqual(parseAmount('12.50'), { ok: true, cents: 1250 })
  assert.equal(parseAmount('99999999999999').ok, false)
  assert.match((parseAmount('99999999999999') as { error: string }).error, /too large/)
  assert.equal(parseAmount('abc').ok, false)
})
```

`src/data/money.test.ts`:
```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeMoney } from '../ledger.ts'

test('makeMoney formats in the firm currency', () => {
  assert.equal(makeMoney('MYR').format(123450), 'RM 1,234.50')
  assert.equal(makeMoney('SGD').format(-5000), '-S$50.00')
  assert.equal(makeMoney('MYR').compact(8140000), 'RM 81.4K')
})
```

`src/data/errors.test.ts`:
```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toUserMessage } from './errors.ts'

test('RLS denials explain a blocked firm', () => {
  assert.equal(
    toUserMessage({ code: '42501', message: 'new row violates row-level security policy' }, { writeBlockReason: 'The free trial ended on 17 Oct 2026.' }),
    "Your firm can't make changes right now: The free trial ended on 17 Oct 2026.",
  )
  assert.equal(toUserMessage({ code: '42501', message: 'x' }), "You don't have permission to do that.")
})

test('P0001 messages are written for people and shown as-is', () => {
  assert.equal(toUserMessage({ code: 'P0001', message: 'Row 3: bank account "X" not found.' }), 'Row 3: bank account "X" not found.')
})

test('network failures and unknown errors are plain', () => {
  assert.equal(toUserMessage(new TypeError('Failed to fetch')), "Couldn't save. Check your connection and try again.")
  assert.equal(toUserMessage({ code: '23505', message: 'duplicate key' }), 'That already exists.')
  assert.equal(toUserMessage('weird'), 'Something went wrong. Try again.')
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test src/data/mappers.test.ts src/data/money.test.ts src/data/errors.test.ts`
Expected: FAIL — modules/exports missing.

- [ ] **Step 3: Implement `makeMoney` and extend `Txn` in `src/ledger.ts`**

Replace the block from `export const CURRENCY = 'MYR'` through `export const formatCompact = …` with:
```ts
const moneyCache = new Map<string, { format(cents: number): string; compact(cents: number): string }>()

/** Formatter for one currency; cached because Intl.NumberFormat is expensive to build. */
export function makeMoney(currency: string) {
  const cached = moneyCache.get(currency)
  if (cached) return cached
  const full = new Intl.NumberFormat('en-MY', { style: 'currency', currency })
  const short = new Intl.NumberFormat('en-MY', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 })
  const m = { format: (cents: number) => full.format(cents / 100), compact: (cents: number) => short.format(cents / 100) }
  moneyCache.set(currency, m)
  return m
}
```
Change `Txn` to:
```ts
export type Txn = {
  id: string
  clientId: string
  bankAccountId: string
  kind: Kind
  amount: number
  date: string
  note: string
  createdAt: string
  updatedAt: string
}
```
Update the `txn()` helper in `src/ledger.test.ts` to add `bankAccountId: 'b', createdAt: '', updatedAt: ''`.

`formatMoney` / `formatCompact` callers are migrated to `useMoney()` in Task 10; until then keep thin wrappers so the build stays green:
```ts
/** @deprecated use useMoney() — kept until every caller reads the firm currency. */
export const formatMoney = (cents: number) => makeMoney('MYR').format(cents)
/** @deprecated use useMoney() */
export const formatCompact = (cents: number) => makeMoney('MYR').compact(cents)
```

- [ ] **Step 4: Implement mappers and errors**

`src/data/mappers.ts`:
```ts
import { parseCents, type Client, type Statement, type StatementLine } from '../ledger'
import type { Role } from '../users/rules'
import type { Database } from './database.types'

type Tables = Database['public']['Tables']
export type ClientRow = Tables['clients']['Row']
export type FirmRow = Tables['firms']['Row']
export type BankRow = Tables['bank_accounts']['Row']
export type ProfileRow = Tables['profiles']['Row']

export const AMOUNT_CAP = 10_000_000_000_000 // matches transactions.amount_minor check

export function rowToClient(r: ClientRow): Client {
  return {
    id: r.id, name: r.name, contact: r.contact, email: r.email, createdAt: r.created_at.slice(0, 10), updatedAt: r.updated_at,
    type: r.type, registrationNo: r.registration_no, industry: r.industry, phone: r.phone, website: r.website,
    address1: r.address1, address2: r.address2, city: r.city, state: r.state, postcode: r.postcode, country: r.country,
    status: r.status, tags: r.tags, assignedUserId: r.assigned_to ?? undefined, notes: r.notes,
  }
}

const CLIENT_COLUMNS: [keyof Client, keyof ClientRow][] = [
  ['name', 'name'], ['contact', 'contact'], ['email', 'email'], ['type', 'type'], ['registrationNo', 'registration_no'],
  ['industry', 'industry'], ['phone', 'phone'], ['website', 'website'], ['address1', 'address1'], ['address2', 'address2'],
  ['city', 'city'], ['state', 'state'], ['postcode', 'postcode'], ['country', 'country'], ['status', 'status'], ['tags', 'tags'],
  ['notes', 'notes'],
]

/** Only keys present in `c` are written, so partial patches never blank other fields. */
export function clientToRow(c: Partial<Client>): Partial<ClientRow> {
  const out: Record<string, unknown> = {}
  for (const [from, to] of CLIENT_COLUMNS) if (from in c) out[to] = c[from]
  if ('assignedUserId' in c) out.assigned_to = c.assignedUserId ?? null
  return out as Partial<ClientRow>
}

export type LedgerRow = { id: string; client_id: string; bank_account_id: string; kind: 'receipt' | 'payment'; amount_minor: number; date: string; description: string; created_at: string; updated_at: string; balance: number }

export function rowToLine(r: LedgerRow): StatementLine {
  return {
    id: r.id, clientId: r.client_id, bankAccountId: r.bank_account_id, kind: r.kind === 'receipt' ? 'in' : 'out',
    amount: r.amount_minor, date: r.date, note: r.description, createdAt: r.created_at, updatedAt: r.updated_at, balance: r.balance,
  }
}

export type BalanceRow = { client_id: string; opening: number; receipts: number; payments: number; closing: number; txn_count: number; last_txn_date: string | null }

export function toStatement(b: BalanceRow | undefined, lines: StatementLine[]): Statement {
  return { opening: b?.opening ?? 0, receipts: b?.receipts ?? 0, payments: b?.payments ?? 0, closing: b?.closing ?? 0, lines }
}

export function sumBalances(rows: BalanceRow[]): Statement {
  return rows.reduce<Statement>(
    (s, r) => ({ opening: s.opening + r.opening, receipts: s.receipts + r.receipts, payments: s.payments + r.payments, closing: s.closing + r.closing, lines: [] }),
    { opening: 0, receipts: 0, payments: 0, closing: 0, lines: [] },
  )
}

export type Firm = {
  id: string; name: string; tradingName: string; registrationNo: string; sstNo: string; phone: string; email: string; website: string
  address1: string; address2: string; postcode: string; city: string; state: string; country: string; logoPath: string | null
  currency: string; statementNote: string; discrepancyDays: number; showRegistrationOnStatement: boolean; fyStartMonth: number
  dateFormat: 'text' | 'numeric'; billingStatus: 'trial' | 'paid' | 'complimentary' | 'read_only'; trialEndsAt: string | null; paidAt: string | null
}

export function rowToFirm(r: FirmRow): Firm {
  return {
    id: r.id, name: r.name, tradingName: r.trading_name, registrationNo: r.registration_no, sstNo: r.sst_no, phone: r.phone, email: r.email,
    website: r.website, address1: r.address1, address2: r.address2, postcode: r.postcode, city: r.city, state: r.state, country: r.country,
    logoPath: r.logo_path, currency: r.currency, statementNote: r.statement_note, discrepancyDays: r.discrepancy_days,
    showRegistrationOnStatement: r.show_registration_on_statement, fyStartMonth: r.fy_start_month, dateFormat: r.date_format as Firm['dateFormat'],
    billingStatus: r.billing_status, trialEndsAt: r.trial_ends_at, paidAt: r.paid_at,
  }
}

const FIRM_COLUMNS: [keyof Firm, keyof FirmRow][] = [
  ['name', 'name'], ['tradingName', 'trading_name'], ['registrationNo', 'registration_no'], ['sstNo', 'sst_no'], ['phone', 'phone'],
  ['email', 'email'], ['website', 'website'], ['address1', 'address1'], ['address2', 'address2'], ['postcode', 'postcode'], ['city', 'city'],
  ['state', 'state'], ['country', 'country'], ['logoPath', 'logo_path'], ['statementNote', 'statement_note'],
  ['discrepancyDays', 'discrepancy_days'], ['showRegistrationOnStatement', 'show_registration_on_statement'],
  ['fyStartMonth', 'fy_start_month'], ['dateFormat', 'date_format'],
]

export function firmToRow(f: Partial<Firm>): Partial<FirmRow> {
  const out: Record<string, unknown> = {}
  for (const [from, to] of FIRM_COLUMNS) if (from in f) out[to] = f[from]
  return out as Partial<FirmRow>
}

export type BankAccount = { id: string; name: string; bankName: string; accountName: string; accountNo: string; isDefault: boolean; isActive: boolean }
export const rowToBank = (r: BankRow): BankAccount => ({
  id: r.id, name: r.name, bankName: r.bank_name, accountName: r.account_name, accountNo: r.account_no, isDefault: r.is_default, isActive: r.is_active,
})

export type Member = { id: string; userId: string; name: string; email: string; role: Role; status: 'active' | 'invited' | 'suspended'; lastActiveAt: string | null; createdAt: string }
export const rowToMember = (r: ProfileRow): Member => ({
  id: r.id, userId: r.user_id, name: r.name, email: r.email, role: r.role, status: r.status, lastActiveAt: r.last_active_at, createdAt: r.created_at,
})

export function parseAmount(input: string): { ok: true; cents: number } | { ok: false; error: string } {
  const cents = parseCents(input)
  if (cents === null) return { ok: false, error: 'Enter an amount greater than 0, up to 2 decimal places.' }
  if (cents > AMOUNT_CAP) return { ok: false, error: 'That amount is too large. The maximum is 100,000,000,000.00.' }
  return { ok: true, cents }
}
```

`src/data/errors.ts`:
```ts
type PgError = { code?: string; message?: string }

/** Turns Supabase/Postgres/network failures into a sentence a person can act on. */
export function toUserMessage(error: unknown, ctx: { writeBlockReason?: string | null } = {}): string {
  if (error instanceof TypeError) return "Couldn't save. Check your connection and try again."
  if (typeof error !== 'object' || error === null) return 'Something went wrong. Try again.'
  const { code, message } = error as PgError
  if (code === 'P0001' && message) return message
  if (code === '42501' || code === 'PGRST301') {
    return ctx.writeBlockReason ? `Your firm can't make changes right now: ${ctx.writeBlockReason}` : "You don't have permission to do that."
  }
  if (code === '23505') return 'That already exists.'
  if (code === 'PGRST116') return 'That record no longer exists.'
  return 'Something went wrong. Try again.'
}
```

- [ ] **Step 5: Run unit tests**

Run: `pnpm test && npx tsc -p tsconfig.app.json --noEmit`
Expected: all unit tests pass (existing 21 + new), typecheck clean.

- [ ] **Step 6: Write the equivalence test (needs local Supabase)**

`src/data/equivalence.db.test.ts`:
```ts
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { test } from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { statement, totalsByClient, type Txn } from '../ledger.ts'

const env = Object.fromEntries(execSync('supabase status -o env').toString().trim().split('\n').map((l) => l.split('=').map((s) => s.replace(/"/g, '')) as [string, string]))
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY)
const anon = createClient(env.API_URL, env.ANON_KEY)
const FIRM = '0000000a-0000-0000-0000-000000000001'
const BANK = '0000000a-0000-0000-0000-0000000000ba'

test('SQL balances and running ledger match the browser maths', async () => {
  // Fixture: a fresh client with an awkward mix of same-day and cross-month entries.
  const { data: client } = await service.from('clients').insert({ firm_id: FIRM, name: `Equivalence ${Date.now()}` }).select('id').single()
  const fixture: [Txn['kind'], number, string][] = [['in', 10000, '2026-07-01'], ['out', 2500, '2026-07-01'], ['in', 999, '2026-08-15'], ['out', 12000, '2026-09-01'], ['in', 1, '2026-09-30']]
  for (const [kind, amount, date] of fixture) {
    await service.from('transactions').insert({ firm_id: FIRM, client_id: client!.id, bank_account_id: BANK, kind: kind === 'in' ? 'receipt' : 'payment', amount_minor: amount, date })
  }
  const { data: rows } = await service.from('transactions').select('*').eq('client_id', client!.id).order('created_at')
  const txns: Txn[] = rows!.map((r) => ({ id: r.id, clientId: r.client_id, bankAccountId: r.bank_account_id, kind: r.kind === 'receipt' ? 'in' : 'out', amount: r.amount_minor, date: r.date, note: r.description, createdAt: r.created_at, updatedAt: r.updated_at }))

  await anon.auth.signInWithPassword({ email: 'owner@alpha.test', password: 'password123' })
  for (const [from, to] of [['2026-08-01', '2026-08-31'], ['2026-07-01', '2026-09-30'], ['2026-09-15', '2026-12-31']]) {
    const browser = statement(txns, from, to)
    const { data: bal } = await anon.rpc('client_balances', { p_from: from, p_to: to, p_client: client!.id })
    const { data: lines } = await anon.rpc('ledger_lines', { p_from: from, p_to: to, p_client: client!.id })
    assert.deepEqual(
      { opening: bal![0].opening, receipts: bal![0].receipts, payments: bal![0].payments, closing: bal![0].closing },
      { opening: browser.opening, receipts: browser.receipts, payments: browser.payments, closing: browser.closing }, `${from}..${to} totals`)
    assert.deepEqual(lines!.map((l: { balance: number }) => l.balance), browser.lines.map((l) => l.balance), `${from}..${to} running balance`)
  }
  assert.equal(totalsByClient(txns).get(client!.id)?.net, (await anon.rpc('client_balances', { p_from: '1900-01-01', p_to: '2999-12-31', p_client: client!.id })).data![0].closing)

  await service.from('clients').delete().eq('id', client!.id)
})
```

- [ ] **Step 7: Run it**

Run: `pnpm test:db`
Expected: 1 passing test.

- [ ] **Step 8: Commit**

```bash
git add src/ledger.ts src/ledger.test.ts src/data/mappers.ts src/data/mappers.test.ts src/data/money.test.ts src/data/errors.ts src/data/errors.test.ts src/data/equivalence.db.test.ts
git commit -m "feat(data): row mappers, currency-aware money, user-facing errors, SQL equivalence test"
```

---

### Task 9: Session, sign-in and query hooks

**Files:**
- Create: `src/data/session.tsx`, `src/data/queries.ts`, `src/data/money.ts`, `src/auth/AuthPages.tsx`, `src/auth/route.ts`, `src/auth/route.test.ts`, `src/data/queries.test.ts`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: mappers, errors, `supabase` client, SQL functions and RPCs.
- Produces:
  ```ts
  // src/data/session.tsx
  export type Session = { userId: string; profile: Member; firm: Firm; can(action: Action): boolean; canWrite: boolean; writeBlockReason: string | null; signOut(): Promise<void> }
  export function SessionProvider(props: { children: ReactNode }): JSX.Element
  export function useSession(): Session          // throws if used outside a signed-in tree
  // src/data/money.ts
  export function useMoney(): { format(cents: number): string; compact(cents: number): string; currency: string }
  // src/auth/route.ts
  export function rememberReturnTo(hash: string, storage?: Pick<Storage, 'setItem'>): void
  export function takeReturnTo(storage?: Pick<Storage, 'getItem' | 'removeItem'>): string   // default '#dashboard'
  // src/data/queries.ts  (all hooks; keys under ['firm', firmId, …])
  useClients(): UseQueryResult<Client[]>
  useClient(id: string): UseQueryResult<Client | null>
  useBalances(p: { from: string; to: string; bankAccountId?: string; clientId?: string }): UseQueryResult<BalanceRow[]>
  useLedger(p: { from: string; to: string; clientId?: string; bankAccountId?: string; perClient?: boolean }): UseQueryResult<StatementLine[]>
  useRecentTxns(limit: number): UseQueryResult<Txn[]>
  useBankAccounts(): UseQueryResult<BankAccount[]>
  useMembers(): UseQueryResult<Member[]>
  usePreference<T>(key: string, fallback: T): [T, (value: T) => void]
  useCreateClient(): UseMutationResult<Client, Error, ClientInput>
  useUpdateClient(): UseMutationResult<Client, Error, { id: string; patch: Partial<Client>; loadedUpdatedAt: string }>
  useDeleteClient(): UseMutationResult<void, Error, string>
  usePostTxn(): UseMutationResult<void, Error, { clientId: string; bankAccountId: string; kind: Kind; amount: number; date: string; note: string }>
  useUpdateTxn(): UseMutationResult<void, Error, { id: string; patch: Partial<Pick<Txn, 'kind' | 'amount' | 'date' | 'note' | 'bankAccountId'>> }>
  useDeleteTxn(): UseMutationResult<void, Error, string>
  useImport(): UseMutationResult<{ transactions: number; clients: number; duplicates: number }, Error, { rows: ImportPayloadRow[]; dryRun: boolean }>
  useUpdateFirm(): UseMutationResult<void, Error, Partial<Firm>>
  useUploadLogo(): UseMutationResult<string, Error, File>     // returns storage path, saved to firms.logo_path
  useLogoUrl(path: string | null): string | null              // signed URL, 1 hour
  useSaveBank(): UseMutationResult<void, Error, Partial<BankAccount> & { id?: string }>
  useTeam(): { invite, resend, remove, changeRole, suspend, reactivate, transferOwnership } // each a UseMutationResult
  export type ImportPayloadRow = { line: number; client_name: string; bank_account: string | null; kind: 'receipt' | 'payment'; amount_minor: number; date: string; description: string }
  export class ConflictError extends Error { constructor(by: string, at: string) }
  ```

- [ ] **Step 1: Write failing tests**

`src/auth/route.test.ts`:
```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rememberReturnTo, takeReturnTo } from './route.ts'

const memory = () => {
  const m = new Map<string, string>()
  return { setItem: (k: string, v: string) => void m.set(k, v), getItem: (k: string) => m.get(k) ?? null, removeItem: (k: string) => void m.delete(k) }
}

test('returns the remembered hash once, then the default', () => {
  const s = memory()
  rememberReturnTo('#clients/abc/transactions', s)
  assert.equal(takeReturnTo(s), '#clients/abc/transactions')
  assert.equal(takeReturnTo(s), '#dashboard')
})

test('never returns to auth pages', () => {
  const s = memory()
  rememberReturnTo('#signin', s)
  assert.equal(takeReturnTo(s), '#dashboard')
})
```

`src/data/queries.test.ts` (pure helper extracted from `useUpdateClient` so the conflict rule is testable without React):
```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conflictMessage } from './queries.ts'

test('conflict message names who changed it and when', () => {
  assert.equal(conflictMessage('Nur Aisyah', '2026-10-03T07:42:00Z', 'Asia/Kuala_Lumpur'),
    'This client was changed by Nur Aisyah at 3:42 pm. Reload to see their changes.')
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test src/auth/route.test.ts src/data/queries.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `src/auth/route.ts`**

```ts
const KEY = 'returnTo'
const AUTH_ROUTES = ['#signin', '#forgot', '#set-password']

export function rememberReturnTo(hash: string, storage: Pick<Storage, 'setItem'> = sessionStorage) {
  try { storage.setItem(KEY, hash) } catch { /* storage blocked: we just land on the dashboard */ }
}

export function takeReturnTo(storage: Pick<Storage, 'getItem' | 'removeItem'> = sessionStorage): string {
  try {
    const hash = storage.getItem(KEY)
    storage.removeItem(KEY)
    return hash && !AUTH_ROUTES.some((r) => hash.startsWith(r)) ? hash : '#dashboard'
  } catch {
    return '#dashboard'
  }
}
```

- [ ] **Step 4: Implement `src/data/session.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session as AuthSession } from '@supabase/supabase-js'
import { can as roleCan, type Action } from '../users/rules'
import { rowToFirm, rowToMember, type Firm, type Member } from './mappers'
import { supabase } from './supabase'
import { AuthPages } from '../auth/AuthPages'
import { rememberReturnTo } from '../auth/route'

export type Session = {
  userId: string; profile: Member; firm: Firm
  can(action: Action): boolean; canWrite: boolean; writeBlockReason: string | null
  signOut(): Promise<void>
}

const Ctx = createContext<Session | null>(null)

export function useSession(): Session {
  const s = useContext(Ctx)
  if (!s) throw new Error('useSession must be used inside a signed-in SessionProvider')
  return s
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthSession | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuth(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' && !location.hash.startsWith('#signin')) rememberReturnTo(location.hash)
      setAuth(session)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = auth?.user.id
  const context = useQuery({
    queryKey: ['session', userId],
    enabled: !!userId,
    queryFn: async () => {
      await supabase.rpc('accept_invite')
      await supabase.rpc('touch_last_active')
      const { data: profile, error } = await supabase.from('profiles').select('*').eq('user_id', userId!).single()
      if (error) throw error
      if (!profile.firm_id) return { profile, firm: null, reason: null }
      const { data: firm } = await supabase.from('firms').select('*').eq('id', profile.firm_id).maybeSingle()
      const { data: reason } = await supabase.rpc('firm_write_block_reason', { firm: profile.firm_id })
      return { profile, firm, reason: reason as string | null }
    },
  })

  if (auth === undefined || (userId && context.isPending)) return <FullPageMessage text="Loading…" />
  if (!auth) return <AuthPages />
  if (context.isError) return <FullPageMessage text="We couldn't load your account. Refresh to try again." />
  const { profile, firm, reason } = context.data!
  if (!firm) return <FullPageMessage text="Your access is suspended, or your firm isn't set up yet. Contact your firm's owner." action={() => supabase.auth.signOut()} />

  const member = rowToMember(profile)
  const session: Session = {
    userId: userId!, profile: member, firm: rowToFirm(firm),
    can: (a) => member.status === 'active' && roleCan(member.role, a),
    canWrite: reason === null, writeBlockReason: reason,
    signOut: async () => { await supabase.auth.signOut() },
  }
  return <Ctx.Provider value={session}>{children}</Ctx.Provider>
}

function FullPageMessage({ text, action }: { text: string; action?: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="grid gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">{text}</p>
        {action && <button type="button" onClick={action} className="text-sm font-medium underline">Sign out</button>}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Implement `src/auth/AuthPages.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../data/supabase'
import { btn, Field, input } from '../ui'
import { takeReturnTo } from './route'

type Mode = 'signin' | 'forgot' | 'set-password'
const modeFromHash = (): Mode => (location.hash.startsWith('#forgot') ? 'forgot' : location.hash.startsWith('#set-password') || location.hash.includes('type=invite') || location.hash.includes('type=recovery') ? 'set-password' : 'signin')

export function AuthPages() {
  const [mode, setMode] = useState<Mode>(modeFromHash)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onHash = () => setMode(modeFromHash())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  const run = async (e: FormEvent<HTMLFormElement>, fn: (data: FormData) => Promise<void>) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try { await fn(new FormData(e.currentTarget)) } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong. Try again.') } finally { setBusy(false) }
  }

  const signIn = (data: FormData) => supabase.auth.signInWithPassword({ email: String(data.get('email')), password: String(data.get('password')) })
    .then(({ error }) => { if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Email or password is incorrect.' : error.message); location.hash = takeReturnTo() })
  const forgot = (data: FormData) => supabase.auth.resetPasswordForEmail(String(data.get('email')), { redirectTo: `${location.origin}${location.pathname}#set-password` })
    .then(({ error }) => { if (error) throw error; setNotice('If that email has an account, a reset link is on its way.') })
  const setPassword = async (data: FormData) => {
    const password = String(data.get('password'))
    if (password.length < 8) throw new Error('Use at least 8 characters.')
    if (password !== String(data.get('confirm'))) throw new Error('The passwords don’t match.')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
    location.hash = takeReturnTo()
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-zinc-50 p-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="mb-1 text-xl font-semibold">{mode === 'signin' ? 'Sign in' : mode === 'forgot' ? 'Reset your password' : 'Set your password'}</h1>
        <p className="mb-5 text-sm text-zinc-500">{mode === 'signin' ? 'Client accounts for your firm.' : mode === 'forgot' ? 'We’ll email you a reset link.' : 'Choose a password to finish setting up your account.'}</p>
        <form className="grid gap-4" noValidate onSubmit={(e) => run(e, mode === 'signin' ? signIn : mode === 'forgot' ? forgot : setPassword)}>
          {mode !== 'set-password' && <Field label="Email"><input name="email" type="email" autoComplete="email" required className={input} /></Field>}
          {mode !== 'forgot' && <Field label="Password"><input name="password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required className={input} /></Field>}
          {mode === 'set-password' && <Field label="Confirm password"><input name="confirm" type="password" autoComplete="new-password" required className={input} /></Field>}
          {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
          {notice && <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">{notice}</p>}
          <button className={btn.primary} disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'forgot' ? 'Send reset link' : 'Save password'}</button>
        </form>
        <p className="mt-4 text-sm">
          {mode === 'signin' ? <a href="#forgot" className="text-zinc-500 underline">Forgot password?</a> : <a href="#signin" className="text-zinc-500 underline">Back to sign in</a>}
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Implement `src/data/money.ts`**

```ts
import { makeMoney } from '../ledger'
import { useSession } from './session'

export function useMoney() {
  const { firm } = useSession()
  return { ...makeMoney(firm.currency), currency: firm.currency }
}
```

- [ ] **Step 7: Implement `src/data/queries.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { Client, ClientInput, Kind, StatementLine, Txn } from '../ledger'
import type { Role } from '../users/rules'
import { toUserMessage } from './errors'
import {
  clientToRow, firmToRow, rowToBank, rowToClient, rowToLine, rowToMember,
  type BalanceRow, type BankAccount, type Firm, type LedgerRow, type Member,
} from './mappers'
import { useSession } from './session'
import { supabase } from './supabase'

export type ImportPayloadRow = { line: number; client_name: string; bank_account: string | null; kind: 'receipt' | 'payment'; amount_minor: number; date: string; description: string }

export class ConflictError extends Error {}

export function conflictMessage(by: string, at: string, timeZone?: string): string {
  const time = new Date(at).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone }).replace(/\s?(AM|PM)$/i, (m) => ` ${m.trim().toLowerCase()}`)
  return `This client was changed by ${by} at ${time}. Reload to see their changes.`
}

/** Throws a person-readable Error so components can show error.message directly. */
function useFail() {
  const { writeBlockReason } = useSession()
  return (error: unknown): never => { throw new Error(toUserMessage(error, { writeBlockReason })) }
}

function useKeys() {
  const { firm } = useSession()
  return {
    all: ['firm', firm.id] as const,
    clients: ['firm', firm.id, 'clients'] as const,
    client: (id: string) => ['firm', firm.id, 'client', id] as const,
    balances: (p: object) => ['firm', firm.id, 'balances', p] as const,
    ledger: (p: object) => ['firm', firm.id, 'ledger', p] as const,
    recent: (n: number) => ['firm', firm.id, 'recent', n] as const,
    banks: ['firm', firm.id, 'banks'] as const,
    members: ['firm', firm.id, 'members'] as const,
  }
}

/** Any money or client change can move balances anywhere, so refresh the whole firm. */
function useInvalidateFirm() {
  const qc = useQueryClient()
  const keys = useKeys()
  return () => qc.invalidateQueries({ queryKey: keys.all })
}

export function useClients() {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.clients, queryFn: async () => {
    const { data, error } = await supabase.from('clients').select('*').order('name')
    return error ? fail(error) : data.map(rowToClient)
  } })
}

export function useClient(id: string) {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.client(id), queryFn: async () => {
    const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle()
    return error ? fail(error) : data ? rowToClient(data) : null
  } })
}

export function useBalances(p: { from: string; to: string; bankAccountId?: string; clientId?: string }) {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.balances(p), queryFn: async () => {
    const { data, error } = await supabase.rpc('client_balances', { p_from: p.from, p_to: p.to, p_bank_account: p.bankAccountId ?? null, p_client: p.clientId ?? null })
    return error ? fail(error) : (data as BalanceRow[])
  } })
}

export function useLedger(p: { from: string; to: string; clientId?: string; bankAccountId?: string; perClient?: boolean }) {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.ledger(p), queryFn: async () => {
    const { data, error } = await supabase.rpc('ledger_lines', { p_from: p.from, p_to: p.to, p_client: p.clientId ?? null, p_bank_account: p.bankAccountId ?? null, p_per_client: p.perClient ?? false })
    return error ? fail(error) : (data as LedgerRow[]).map(rowToLine)
  } })
}

export function useRecentTxns(limit: number) {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.recent(limit), queryFn: async () => {
    const { data, error } = await supabase.from('transactions').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }).limit(limit)
    return error ? fail(error) : data.map((r): Txn => ({ id: r.id, clientId: r.client_id, bankAccountId: r.bank_account_id, kind: r.kind === 'receipt' ? 'in' : 'out', amount: r.amount_minor, date: r.date, note: r.description, createdAt: r.created_at, updatedAt: r.updated_at }))
  } })
}

export function useBankAccounts() {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.banks, queryFn: async () => {
    const { data, error } = await supabase.from('bank_accounts').select('*').order('is_default', { ascending: false }).order('name')
    return error ? fail(error) : data.map(rowToBank)
  } })
}

export function useMembers() {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.members, queryFn: async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('name')
    return error ? fail(error) : data.map(rowToMember)
  } })
}

export function usePreference<T>(key: string, fallback: T): [T, (value: T) => void] {
  const { profile } = useSession()
  const [value, setValue] = useState<T>(fallback)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    supabase.from('user_preferences').select('value').eq('profile_id', profile.id).eq('key', key).maybeSingle()
      .then(({ data }) => { if (data) setValue(data.value as T) })
  }, [profile.id, key])
  const save = (next: T) => {
    setValue(next)
    clearTimeout(timer.current)
    // Debounced: dragging a column edge fires many updates; persist the last one.
    timer.current = setTimeout(() => {
      supabase.from('user_preferences').upsert({ profile_id: profile.id, key, value: next as never }).then(({ error }) => {
        if (error) console.error('Preference not saved', key, error)
      })
    }, 400)
  }
  return [value, save]
}

export function useCreateClient() {
  const invalidate = useInvalidateFirm(); const fail = useFail()
  return useMutation({ mutationFn: async (input: ClientInput) => {
    const { data, error } = await supabase.from('clients').insert(clientToRow(input as Partial<Client>) as never).select('*').single()
    return error ? fail(error) : rowToClient(data)
  }, onSuccess: invalidate })
}

export function useUpdateClient() {
  const invalidate = useInvalidateFirm(); const fail = useFail()
  return useMutation({ mutationFn: async ({ id, patch, loadedUpdatedAt }: { id: string; patch: Partial<Client>; loadedUpdatedAt: string }) => {
    const { data, error } = await supabase.from('clients').update(clientToRow(patch)).eq('id', id).eq('updated_at', loadedUpdatedAt).select('*')
    if (error) return fail(error)
    if (data.length === 0) {
      const { data: current } = await supabase.from('clients').select('updated_at, updated_by').eq('id', id).maybeSingle()
      if (!current) throw new Error('This client no longer exists.')
      const { data: who } = await supabase.from('profiles').select('name').eq('user_id', current.updated_by ?? '').maybeSingle()
      throw new ConflictError(conflictMessage(who?.name ?? 'someone else', current.updated_at))
    }
    return rowToClient(data[0])
  }, onSettled: invalidate })
}

export function useDeleteClient() {
  const invalidate = useInvalidateFirm(); const fail = useFail()
  return useMutation({ mutationFn: async (id: string) => {
    const { data, error } = await supabase.from('clients').delete().eq('id', id).select('id')
    if (error) return fail(error)
    if (!data.length) throw new Error("You don't have permission to do that.")
  }, onSuccess: invalidate })
}

export function usePostTxn() {
  const invalidate = useInvalidateFirm(); const fail = useFail()
  return useMutation({ mutationFn: async (t: { clientId: string; bankAccountId: string; kind: Kind; amount: number; date: string; note: string }) => {
    const { error } = await supabase.from('transactions').insert({ client_id: t.clientId, bank_account_id: t.bankAccountId, kind: t.kind === 'in' ? 'receipt' : 'payment', amount_minor: t.amount, date: t.date, description: t.note } as never)
    if (error) fail(error)
  }, onSuccess: invalidate })
}

export function useUpdateTxn() {
  const invalidate = useInvalidateFirm(); const fail = useFail()
  return useMutation({ mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<Txn, 'kind' | 'amount' | 'date' | 'note' | 'bankAccountId'>> }) => {
    const row: Record<string, unknown> = {}
    if (patch.kind) row.kind = patch.kind === 'in' ? 'receipt' : 'payment'
    if (patch.amount !== undefined) row.amount_minor = patch.amount
    if (patch.date) row.date = patch.date
    if (patch.note !== undefined) row.description = patch.note
    if (patch.bankAccountId) row.bank_account_id = patch.bankAccountId
    const { error } = await supabase.from('transactions').update(row).eq('id', id)
    if (error) fail(error)
  }, onSuccess: invalidate })
}

export function useDeleteTxn() {
  const invalidate = useInvalidateFirm(); const fail = useFail()
  return useMutation({ mutationFn: async (id: string) => {
    const { data, error } = await supabase.from('transactions').delete().eq('id', id).select('id')
    if (error) return fail(error)
    if (!data.length) throw new Error("You don't have permission to do that.")
  }, onSuccess: invalidate })
}

export function useImport() {
  const invalidate = useInvalidateFirm(); const fail = useFail()
  return useMutation({ mutationFn: async ({ rows, dryRun }: { rows: ImportPayloadRow[]; dryRun: boolean }) => {
    const { data, error } = await supabase.rpc('import_transactions', { p_rows: rows as never, p_dry_run: dryRun })
    return error ? fail(error) : (data as { transactions: number; clients: number; duplicates: number })
  }, onSuccess: (_d, v) => { if (!v.dryRun) invalidate() } })
}

export function useUpdateFirm() {
  const qc = useQueryClient(); const { firm } = useSession(); const fail = useFail()
  return useMutation({ mutationFn: async (patch: Partial<Firm>) => {
    const { error } = await supabase.from('firms').update(firmToRow(patch)).eq('id', firm.id)
    if (error) fail(error)
  }, onSuccess: () => qc.invalidateQueries({ queryKey: ['session'] }) })
}

export function useUploadLogo() {
  const { firm } = useSession(); const update = useUpdateFirm(); const fail = useFail()
  return useMutation({ mutationFn: async (file: File) => {
    const ext = file.type === 'image/svg+xml' ? 'svg' : file.type === 'image/png' ? 'png' : 'jpg'
    const path = `${firm.id}/logo-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('logos').upload(path, file, { contentType: file.type })
    if (error) return fail(error)
    await update.mutateAsync({ logoPath: path })
    return path
  } })
}

export function useLogoUrl(path: string | null): string | null {
  const { data } = useQuery({ queryKey: ['logo', path], enabled: !!path, staleTime: 50 * 60 * 1000, queryFn: async () => {
    const { data } = await supabase.storage.from('logos').createSignedUrl(path!, 3600)
    return data?.signedUrl ?? null
  } })
  return data ?? null
}

export function useSaveBank() {
  const qc = useQueryClient(); const keys = useKeys(); const fail = useFail()
  return useMutation({ mutationFn: async (b: Partial<BankAccount> & { id?: string }) => {
    const row = { name: b.name, bank_name: b.bankName, account_name: b.accountName, account_no: b.accountNo, is_active: b.isActive }
    if (b.isDefault) {
      // Clear the old default first so the one-default index never sees two.
      const { error } = await supabase.from('bank_accounts').update({ is_default: false }).eq('is_default', true).neq('id', b.id ?? '')
      if (error) return fail(error)
    }
    const { error } = b.id
      ? await supabase.from('bank_accounts').update({ ...row, ...(b.isDefault !== undefined && { is_default: b.isDefault }) }).eq('id', b.id)
      : await supabase.from('bank_accounts').insert({ ...row, name: b.name!, is_default: !!b.isDefault } as never)
    if (error) fail(error)
  }, onSuccess: () => qc.invalidateQueries({ queryKey: keys.banks }) })
}

async function callTeam(body: object): Promise<void> {
  const { data, error } = await supabase.functions.invoke('team', { body })
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(detail?.error ?? "Couldn't reach the server. Try again.")
  }
  return data
}

export function useTeam() {
  const qc = useQueryClient(); const keys = useKeys(); const fail = useFail()
  const done = { onSuccess: () => qc.invalidateQueries({ queryKey: keys.members }) }
  const rpc = (fn: string) => async (args: Record<string, unknown>) => { const { error } = await supabase.rpc(fn as never, args as never); if (error) fail(error) }
  return {
    invite: useMutation({ mutationFn: (v: { name: string; email: string; role: Exclude<Role, 'owner'> }) => callTeam({ action: 'invite', ...v }), ...done }),
    resend: useMutation({ mutationFn: (profileId: string) => callTeam({ action: 'resend', profileId }), ...done }),
    remove: useMutation({ mutationFn: (profileId: string) => callTeam({ action: 'remove', profileId }), ...done }),
    changeRole: useMutation({ mutationFn: (v: { profileId: string; role: Role }) => rpc('change_member_role')({ p_profile: v.profileId, p_role: v.role }), ...done }),
    suspend: useMutation({ mutationFn: (profileId: string) => rpc('suspend_member')({ p_profile: profileId }), ...done }),
    reactivate: useMutation({ mutationFn: (profileId: string) => rpc('reactivate_member')({ p_profile: profileId }), ...done }),
    transferOwnership: useMutation({ mutationFn: (profileId: string) => rpc('transfer_ownership')({ p_profile: profileId }), onSuccess: () => qc.invalidateQueries() }),
  }
}

export type { Member, StatementLine }
```

- [ ] **Step 8: Wire providers in `src/main.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SessionProvider } from './data/session'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 9: Run tests and typecheck**

Run: `pnpm test && npx tsc -p tsconfig.app.json --noEmit`
Expected: unit tests pass. Typecheck may fail only in files still importing deleted store APIs — none deleted yet, so it should be clean.

- [ ] **Step 10: Browser check — sign-in only**

Start the app (`preview_start` name `platform-internal`), open `http://localhost:5199/#clients`.
Expected: Sign-in page. Sign in as `owner@alpha.test` / `password123` → returns to `#clients` (data still from the old local store until Task 10 — that's expected). Wrong password → "Email or password is incorrect."

- [ ] **Step 11: Commit**

```bash
git add src/main.tsx src/data/session.tsx src/data/queries.ts src/data/queries.test.ts src/data/money.ts src/auth
git commit -m "feat(app): sign-in, session context and server query hooks"
```

---

### Task 10: Port Clients, client profile, statement, dashboard and import to the server

**Files:**
- Modify: `src/ClientsPage.tsx`, `src/ClientProfile.tsx`, `src/clients/AddClient.tsx`, `src/clients/ClientInfo.tsx`, `src/clients/fields.tsx`, `src/clients/shared.tsx`, `src/Statement.tsx`, `src/widgets.tsx`, `src/Dashboard.tsx`, `src/transfer.tsx`, `src/ui.tsx`

**Interfaces:**
- Consumes: every hook from Task 9; `useMoney()`; `Session.can`, `Session.canWrite`, `Session.writeBlockReason`.
- Produces: no new exports. After this task no file under `src/` imports `useStore` except `src/App.tsx` (removed in Task 12).

Port rules applied in every file (do them file by file, running typecheck after each):

| Old | New |
|---|---|
| `useStore((s) => s.clients)` | `const { data: clients = [] } = useClients()` |
| `useStore((s) => s.txns)` then `statement(own, from, to)` | `useBalances({ from, to, clientId })` + `useLedger({ from, to, clientId })` → `toStatement(balances?.[0], lines ?? [])` |
| `totalsByClient(txns)` / `perClient` map | `useBalances({ from, to, bankAccountId })` → `new Map(rows.map((r) => [r.client_id, r]))` |
| `useStore((s) => s.addClient)` | `useCreateClient().mutateAsync` |
| `useStore((s) => s.updateClient)(id, patch)` | `useUpdateClient().mutateAsync({ id, patch, loadedUpdatedAt: client.updatedAt })` |
| `removeClient` / `addTxn` / `removeTxn` / `importLedger` | `useDeleteClient` / `usePostTxn` / `useDeleteTxn` / `useImport` |
| `useCan('x')` / `can(currentUser.role, 'x')` | `useSession().can('x') && useSession().canWrite` for write buttons; tooltip `writeBlockReason ?? "Your role can't …"` |
| `useUsers((s) => s.users)` (assigned member) | `useMembers()` filtered to `status === 'active'` |
| `formatMoney(x)` / `formatCompact(x)` | `const money = useMoney()` → `money.format(x)` / `money.compact(x)` |
| `useSettings(...)` / `useStore((s) => s.businessName)` | `useSession().firm` fields |

Loading and error states: every page that reads a query renders `<Empty text="Loading…" />` while `isPending`, and `<p role="alert">{error.message}</p>` on `isError`. Mutations show `error.message` inline next to the button that triggered them; buttons are disabled while `isPending`.

- [ ] **Step 1: `src/ui.tsx` — TxnForm gets a bank account and server posting**

Replace the body of `TxnForm` with:
```tsx
export function TxnForm({ clientId, onDone }: { clientId?: string; onDone?: () => void }) {
  const { data: clients = [] } = useClients()
  const { data: banks = [] } = useBankAccounts()
  const post = usePostTxn()
  const { currency } = useMoney()
  const [kind, setKind] = useState<Kind>('in')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const active = banks.filter((b) => b.isActive)

  if (!clientId && clients.length === 0) return <p className="text-sm text-zinc-500">Add a client before recording a transaction.</p>
  if (active.length === 0) return <p className="text-sm text-zinc-500">Add a bank account in Settings before recording a transaction.</p>

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const amount = parseAmount(String(data.get('amount')))
    const target = clientId ?? String(data.get('clientId'))
    if (!amount.ok) return setError(amount.error)
    if (!target) return setError('Select a client.')
    try {
      await post.mutateAsync({ clientId: target, bankAccountId: String(data.get('bankAccountId')), kind, amount: amount.cents, date: String(data.get('date')) || today(), note: String(data.get('note')).trim() })
      form.reset(); setError(''); setSaved(true); setTimeout(() => setSaved(false), 1600); onDone?.()
    } catch (err) {
      setError((err as Error).message)
    }
  }
  // …JSX unchanged except:
  //  1. Amount label: <Field label={`Amount (${currency})`}>
  //  2. New field after Client (or first when clientId is fixed):
  //     <Field label="Bank account">
  //       <select name="bankAccountId" className={input} defaultValue={active.find((b) => b.isDefault)?.id ?? active[0].id}>
  //         {active.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
  //       </select>
  //     </Field>
  //  3. Submit button: disabled={post.isPending}
}
```
Imports to add at the top of `src/ui.tsx`: `import { parseAmount } from './data/mappers'`, `import { useMoney } from './data/money'`, `import { useBankAccounts, useClients, usePostTxn } from './data/queries'`. Remove the `useStore` import and `parseCents` import if unused.

`PeriodPicker`: replace `useSettings((s) => s.fyStartMonth)` with `useSession().firm.fyStartMonth`.

- [ ] **Step 2: `src/widgets.tsx` and `src/Dashboard.tsx`**

- `MoneyKpi`: replace `useMonthSplit(txns)` with
  ```ts
  const monthStart = `${today().slice(0, 7)}-01`
  const all = sumBalances(useBalances({ from: '1900-01-01', to: today() }).data ?? [])
  const month = sumBalances(useBalances({ from: monthStart, to: today() }).data ?? [])
  const pick = { net: all.closing, in: all.receipts, out: all.payments }
  const pickMonth = { net: month.receipts - month.payments, in: month.receipts, out: month.payments }
  ```
- `ClientsKpi`: `clients` from `useClients()`; overdrawn = `(useBalances({ from: '1900-01-01', to: today() }).data ?? []).filter((r) => r.closing < 0).length`.
- `Cashflow`: `const sixMonthsAgo = ` first day of the month five months back (`new Date(y, m - 5, 1)` → `toLocaleDateString('en-CA')`); `const { data: lines = [] } = useLedger({ from: sixMonthsAgo, to: today() })`; pass `lines` to `CashflowChart`. `CashflowChart` keeps taking `txns: Txn[]` (StatementLine extends Txn).
- `Balances`: rows from `useClients()` joined to `useBalances({ from: '1900-01-01', to: today() })` by `client_id`, using `closing`.
- `Recent`: `const { data: recent = [] } = useRecentTxns(6)`.
- `Dashboard.tsx`: widget layout from `const [widgets, setWidgets] = usePreference<Widget[]>('dashboard', DEFAULT_WIDGETS)` (move `DEFAULT_WIDGETS`, `Widget`, `WidgetType`, `Span` and `NEXT_SPAN` from `src/store.ts` into `src/Dashboard.tsx`); `moveWidget`, `addWidget`, `removeWidget`, `resizeWidget` become local functions that call `setWidgets(next)` with the same immutable logic they have in `store.ts` today.

- [ ] **Step 3: `src/ClientsPage.tsx` (`LedgerView`)**

- Replace `clients`/`txns` store reads with `useClients()`.
- `perClient` becomes `new Map((useBalances({ from: period.from, to: period.to, bankAccountId }).data ?? []).map((r) => [r.client_id, toStatement(r, [])]))`.
- Transactions view: `const { data: lines = [] } = useLedger({ from: period.from, to: period.to, clientId: fixedClientId ?? (clientFilter === 'all' ? undefined : clientFilter), bankAccountId, perClient: mode === 'client' })`. `summary` = `sumBalances` of the balance rows for in-scope clients; `summary.lines = lines` filtered by `inScope`.
- `balances` map (running balance per row) becomes `new Map(lines.map((l) => [l.id, l.balance]))` — the server already computed it with the right partitioning.
- Add a **Bank account** `<select>` next to the client filter: options "All bank accounts" + `useBankAccounts().data`; state `bankAccountId?: string` passed to both queries.
- `firstDate` = `'1900-01-01'` replaced by the earliest of `clients[].createdAt` (no full transaction scan).
- Write gating: `const s = useSession(); const canPost = s.can('transactions.post') && s.canWrite` etc. Disabled-button tooltips use `s.writeBlockReason ?? "Your role can't …"`.
- Ledger row delete: `useDeleteTxn().mutate(t.id)`; show `error.message` in the table header bar if it fails.
- Export/print/columns/grouping: unchanged (they work on `lines` / `balanceRows` in memory).

- [ ] **Step 4: `src/transfer.tsx` (import)**

- Keep `readImport(csv)` for parsing/validation in the browser.
- Add an optional `Bank account` column to `readImport` in `src/ledger.ts`: read `text(at(cells, 'bank account'))` into a new `ImportRow.bankAccount: string` (empty string when absent). Add a test in `src/ledger.test.ts`:
  ```ts
  test('readImport reads an optional bank account column', () => {
    const { rows } = readImport('Date,Client,Bank account,Receipts\n2026-09-01,Kopi,CIMB escrow,10')
    assert.equal(rows[0].bankAccount, 'CIMB escrow')
  })
  ```
- Replace `planImport` + `importLedger` with the server: on file chosen, build `ImportPayloadRow[]` (`{ line, client_name: r.clientName, bank_account: r.bankAccount || null, kind: r.kind === 'in' ? 'receipt' : 'payment', amount_minor: r.amount, date: r.date, description: r.note }`) and call `useImport().mutateAsync({ rows, dryRun: true })` for the preview counts (`transactions`, `clients`, `duplicates`); **Import** calls it again with `dryRun: false`. Server errors (`Row N: …`) are shown in the red error box. Delete `planImport` from `src/ledger.ts` and its test (the server now does matching and duplicate detection).
- Preview receipts/payments totals still come from the parsed rows.

- [ ] **Step 5: `src/ClientProfile.tsx`, `src/clients/*`**

- `ClientProfile`: `const { data: client, isPending } = useClient(id)`; not found → existing "doesn't exist" view. Status pill / tags / assigned member call `useUpdateClient().mutateAsync({ id, patch, loadedUpdatedAt: client.updatedAt })`; catch → show `error.message` (a `ConflictError` message offers a **Reload** button that calls `queryClient.invalidateQueries()`).
- Tab headline balance: `useBalances({ from: '1900-01-01', to: today(), clientId: id }).data?.[0]?.closing ?? 0` formatted with `useMoney()`.
- Delete: `useDeleteClient().mutateAsync(id)` then `location.hash = 'clients'`.
- `ClientInfo` save: one `updateClient` call with the whole draft diff; on `ConflictError` keep the form open and show the message.
- `AddClient`: `useCreateClient().mutateAsync(input)`; assigned member options from `useMembers()`.
- `clients/shared.tsx` `useCan` → re-export a thin wrapper: `export const useCan = (a: Action) => { const s = useSession(); return s.can(a) && s.canWrite }`.

- [ ] **Step 6: `src/Statement.tsx`**

- `own`/`statement()` → `useBalances({ from, to, clientId: id })` + `useLedger({ from, to, clientId: id })` → `toStatement(balances?.[0], lines)`.
- Header details from `useSession().firm`; logo from `useLogoUrl(firm.logoPath)`.
- Settlement details from the default bank account: `useBankAccounts().data?.find((b) => b.isDefault)` → `bankName · accountName · accountNo`.
- Footer note: `firm.statementNote.replace('{days}', String(firm.discrepancyDays))`; currency line shows `firm.currency`.

- [ ] **Step 7: Typecheck, unit tests, lint**

Run: `npx tsc -p tsconfig.app.json --noEmit && pnpm test && npx oxlint src`
Expected: clean (only `only-export-components` warnings).

- [ ] **Step 8: Browser verification**

Signed in as `owner@alpha.test`:
1. `#clients` Balances shows Kopi Corner closing **RM 6,900.00** and Harbourline **RM 5,000.00** for "All time" (from seed: 10,000 − 2,500 − 1,000 + 400 = 6,900).
2. Transactions view, "Last month" (September 2026): Kopi rows −1,000.00 / +400.00 with running balances 6,500.00 → 6,900.00.
3. Record a receipt of 100.00 on Kopi Corner → closing becomes RM 7,000.00 without a page reload.
4. Open Kopi Corner in two browser tabs, edit notes in tab A and save, then edit notes in tab B and save → tab B shows "This client was changed by Lim Boon Hock at …".
5. Import a CSV with one valid row and one row with bank account `Nope` → error "Row 3: bank account "Nope" not found."; nothing imported.
6. Statement for Kopi Corner (September) shows Alpha's address, Maybank settlement details, closing RM 6,900.00.
7. Sign in as `viewer@alpha.test` → no record form, Edit/Delete disabled.
8. Sign in as `owner@beta.test` → only Marina Bay Studio, amounts in **S$**.

- [ ] **Step 9: Commit**

```bash
git add src
git commit -m "feat(app): clients, ledger, statements, dashboard and import read and write through Supabase"
```

---

### Task 11: Settings, bank accounts and users on the server

**Files:**
- Create: `src/settings/BankAccounts.tsx`, `src/settings/constants.ts`
- Modify: `src/settings/SettingsPage.tsx`, `src/users/UsersPage.tsx`, `src/users/badges.tsx`

**Interfaces:**
- Consumes: `useUpdateFirm`, `useUploadLogo`, `useLogoUrl`, `useBankAccounts`, `useSaveBank`, `useMembers`, `useTeam`, `useSession`.
- Produces: `BankAccountsCard` component; constants module.

- [ ] **Step 1: Move constants**

Create `src/settings/constants.ts` with `STATES`, `MONTHS`, `LOGO_MAX_BYTES`, `DEFAULT_NOTE` copied verbatim from `src/settings/store.ts`, and `formatDate(date: string, format: 'text' | 'numeric', long = false)` — same body as today but taking `format` as a parameter instead of reading the store. Update importers.

- [ ] **Step 2: `src/settings/SettingsPage.tsx`**

- Organisation card: draft initialised from `useSession().firm`; **Save** → `useUpdateFirm().mutateAsync(diff)`; logo file → check `file.size <= LOGO_MAX_BYTES` (existing message) → `useUploadLogo().mutateAsync(file)`; preview via `useLogoUrl(firm.logoPath)`.
- Statements card: note, discrepancy days, show registration no. → `useUpdateFirm`. Remove the three bank fields (moved to Bank accounts).
- Regional card: date format and financial-year start → `useUpdateFirm`; currency shown read-only as `firm.currency` with the help text "Set when your firm was created. It can't change once transactions exist."
- Data card: delete backup/restore UI; keep a short note "Your data is stored securely on our servers and backed up daily." 
- Every card's Edit button is disabled with tooltip `writeBlockReason ?? "Your role can't change settings"` unless `can('settings.manage') && canWrite`.
- Insert `<BankAccountsCard />` between Organisation and Statements.

- [ ] **Step 3: `src/settings/BankAccounts.tsx`**

```tsx
import { useState, type FormEvent } from 'react'
import type { BankAccount } from '../data/mappers'
import { useBankAccounts, useSaveBank } from '../data/queries'
import { useSession } from '../data/session'
import { btn, Dialog, Field, Icon, input } from '../ui'

export function BankAccountsCard() {
  const { data: banks = [], isPending, error } = useBankAccounts()
  const save = useSaveBank()
  const s = useSession()
  const canEdit = s.can('settings.manage') && s.canWrite
  const [editing, setEditing] = useState<Partial<BankAccount> | null>(null)
  const [formError, setFormError] = useState('')

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const d = new FormData(e.currentTarget)
    const name = String(d.get('name')).trim()
    if (!name) return setFormError('Enter a name, e.g. "Maybank client account".')
    try {
      await save.mutateAsync({ id: editing?.id, name, bankName: String(d.get('bankName')).trim(), accountName: String(d.get('accountName')).trim(), accountNo: String(d.get('accountNo')).trim(), isDefault: d.get('isDefault') === 'on' || banks.length === 0, isActive: true })
      setEditing(null); setFormError('')
    } catch (err) { setFormError((err as Error).message) }
  }

  return (
    <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Bank accounts</h2>
          <p className="text-sm text-zinc-500">Where you hold client money. The default account is used for new transactions and shown on statements.</p>
        </div>
        <button type="button" className={btn.ghost} disabled={!canEdit} title={canEdit ? undefined : s.writeBlockReason ?? "Your role can't change settings"} onClick={() => setEditing({})}>
          <Icon name="plus" /> Add account
        </button>
      </header>
      {isPending ? <p className="text-sm text-zinc-500">Loading…</p> : error ? <p role="alert" className="text-sm text-red-600">{error.message}</p> : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {banks.map((b) => (
            <li key={b.id} className={`flex items-center gap-3 py-3 ${b.isActive ? '' : 'opacity-50'}`}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{b.name} {b.isDefault && <span className="ml-1 rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">Default</span>} {!b.isActive && <span className="ml-1 text-xs text-zinc-500">Inactive</span>}</p>
                <p className="truncate text-sm text-zinc-500">{[b.bankName, b.accountName, b.accountNo].filter(Boolean).join(' · ') || 'No bank details yet'}</p>
              </div>
              {canEdit && (
                <>
                  {!b.isDefault && b.isActive && <button type="button" className={btn.ghost} onClick={() => save.mutate({ id: b.id, isDefault: true })}>Make default</button>}
                  {!b.isDefault && <button type="button" className={btn.ghost} onClick={() => save.mutate({ id: b.id, isActive: !b.isActive })}>{b.isActive ? 'Deactivate' : 'Reactivate'}</button>}
                  <button type="button" className={btn.ghost} onClick={() => setEditing(b)}>Edit</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {save.error && !editing && <p role="alert" className="mt-2 text-sm text-red-600">{save.error.message}</p>}
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit bank account' : 'Add bank account'}>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <Field label="Name"><input name="name" defaultValue={editing?.name} placeholder="e.g. Maybank client account" className={input} /></Field>
          <Field label="Bank"><input name="bankName" defaultValue={editing?.bankName} className={input} /></Field>
          <Field label="Account name"><input name="accountName" defaultValue={editing?.accountName} className={input} /></Field>
          <Field label="Account no."><input name="accountNo" defaultValue={editing?.accountNo} className={input} /></Field>
          {!editing?.isDefault && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isDefault" className="size-4 accent-zinc-900" /> Make this the default account</label>}
          {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end gap-2"><button type="button" className={btn.ghost} onClick={() => setEditing(null)}>Cancel</button><button className={btn.primary} disabled={save.isPending}>Save</button></div>
        </form>
      </Dialog>
    </section>
  )
}
```

- [ ] **Step 4: `src/users/UsersPage.tsx`**

- List from `useMembers()`; current user is `useSession().profile` (the "(you)" marker compares `profile.id`).
- Invite dialog → `useTeam().invite.mutateAsync({ name, email, role })`; success banner text: "<name> was invited. They'll get an email to set their password."; error → `error.message` inline (duplicate email message comes from the function).
- Manage dialog: role select → `changeRole`; Suspend/Reactivate → `suspend`/`reactivate`; Remove (confirm) → `remove`; Transfer ownership (owner only) → `transferOwnership`; **Resend invite** button when `status === 'invited'` → `resend`.
- Delete the sign-in "isn't connected yet" note and the `ViewingAs` panel.
- Permissions table keeps reading `ACTIONS` / `can` from `src/users/rules.ts` (unchanged).

- [ ] **Step 5: Typecheck, unit tests, lint**

Run: `npx tsc -p tsconfig.app.json --noEmit && pnpm test && npx oxlint src`
Expected: clean.

- [ ] **Step 6: Browser verification**

As `owner@alpha.test`:
1. Settings › Organisation: change trading name → reload page → value persisted.
2. Upload a 250 KB PNG → "That logo is 250 KB. The limit is 200 KB…"; upload a small PNG → preview shows; statement header shows it.
3. Bank accounts: add "CIMB escrow account", make it default → Record transaction defaults to it; statement settlement details switch to CIMB.
4. Users: invite `siti@alpha.test` as Accountant → appears as Invited; Inbucket (http://127.0.0.1:54324) has the email; open the link → Set your password → lands signed in as Siti with Accountant permissions; back as owner, Siti shows Active.
5. Change Siti to Viewer → Siti (after refresh) loses the record form.
6. As `admin@alpha.test`: Manage on the owner is not offered.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat(app): firm settings, bank accounts and team management on Supabase"
```

---

### Task 12: Remove the browser stores, finish App shell, docs

**Files:**
- Delete: `src/store.ts`, `src/users/store.ts`, `src/users/ViewingAs.tsx`, `src/settings/store.ts`, `src/settings/backup.ts`
- Modify: `src/App.tsx`, `package.json`, `README.md`

**Interfaces:**
- Consumes: `useSession()`.
- Produces: final App shell — sidebar footer shows the signed-in person (avatar, name, role) and **Sign out**.

- [ ] **Step 1: `src/App.tsx`**

- Remove `History` (undo/redo), `useZustand`, `useStore`, "Load sample data", `ViewingAs`.
- Sidebar footer:
  ```tsx
  const { profile, firm, signOut } = useSession()
  // …
  <div className="mt-auto hidden items-center gap-2 px-2 lg:flex">
    <Avatar name={profile.name} />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">{profile.name}</p>
      <p className="truncate text-xs text-zinc-500">{firm.name} · {ROLE_LABEL[profile.role]}</p>
    </div>
    <button type="button" className={btn.ghost} onClick={signOut} aria-label="Sign out" title="Sign out"><Icon name="x" /></button>
  </div>
  ```
- `readRoute`: unchanged for app routes; `#signin`, `#forgot`, `#set-password` are handled by `SessionProvider` before `App` renders.

- [ ] **Step 2: Remove dead code and dependencies**

```bash
git rm src/store.ts src/users/store.ts src/users/ViewingAs.tsx src/settings/store.ts src/settings/backup.ts
grep -rn "from './store'\|from '../store'\|users/store\|settings/store\|settings/backup\|zundo" src && echo "STILL REFERENCED" || echo "clean"
pnpm remove zundo
grep -rqn "from 'zustand'" src || pnpm remove zustand
```
Expected: `clean`. Remove functions in `src/users/rules.ts` that only the deleted store used (`inviteUser`, `changeRole`, `suspendUser`, `reactivateUser`, `removeUser`, `transferOwnership`, `validateUsers`) and their tests in `src/users.test.ts`; keep `ROLES`, `ROLE_LABEL`, `ROLE_SUMMARY`, `ACTIONS`, `can`, `canManageUser`, `isValidEmail`, `normaliseEmail`.

- [ ] **Step 3: README**

Replace the "Run" and data notes with:
```markdown
## Run locally

```bash
brew install supabase/tap/supabase deno
pnpm install
supabase start            # local Postgres, Auth, Storage, Inbucket (emails) at http://127.0.0.1:54324
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
```

- [ ] **Step 4: Full verification**

```bash
supabase db reset && supabase test db
deno test supabase/functions
pnpm test && pnpm test:db
npx tsc -p tsconfig.app.json --noEmit && npx oxlint src && pnpm build
```
Expected: every command succeeds.

Browser (in-app pane, `http://localhost:5199`):
1. Signed out → sign-in page; sign in → dashboard with Alpha data in RM.
2. Every sidebar page loads with no console errors.
3. In a second tab, sign in as `owner@beta.test` via `http://beta.localhost:5199` (separate cookie jar) → only Beta data, S$.
4. Expire Beta's trial: `psql "$DB_URL" -c "update firms set trial_ends_at = now() - interval '1 day' where name like 'Beta%'"` → refresh Beta tab → record form replaced by the block reason; Save on a client edit shows "Your firm can't make changes right now: The free trial ended on …".
5. Phone width 375px: sign-in page and clients page have no horizontal scroll.

- [ ] **Step 5: Commit and push**

```bash
git add -A src package.json pnpm-lock.yaml README.md
git commit -m "refactor: remove browser-only stores; app runs entirely on Supabase"
git push
```

---

## Self-Review

**Spec coverage (Plan A scope):**
- §2 Architecture / Tenancy → Tasks 1, 4, 5, 9. Super-admin support view → Plan B (console). 
- §3 Data model → Task 2 (all tables, including Plan B/C/D columns so later plans add no schema churn for these tables); computed functions → Task 6. `create_firm_for_current_user`, sample data functions → Plans B and D.
- §4 Roles → Task 4 (`auth_can`), Task 7 (team RPCs), Task 10/11 (UI gating).
- §5 items 3 (sign-in) → Task 9; 11 (bank accounts) → Task 11; 13 (users) → Task 11; 14–19 → Task 10; "Removed" → Task 12.
- §6 Security/errors/edge cases → Tasks 4, 5, 6, 7, 8 (errors), 10 (conflicts), 11 (logo cap); invite expiry → `otp_expiry = 604800` in Task 1 Step 3 config.
- §7 Testing items 1, 2, 4 → pgTAP Tasks 2–7, equivalence Task 8, unit tests throughout, browser checks Tasks 9–12.
- §8 Local environment → Tasks 1, 3, 12.

**Gaps found and fixed inline:** invite-link expiry (`otp_expiry` added to Task 1 config); statement bank details source (spec amendment 3); firm staff invites need the service key (amendment 1).

**Type consistency:** `Txn` gains `bankAccountId`, `createdAt`, `updatedAt` in Task 8 and every later task uses those names; SQL `kind` is `receipt|payment`, app `Kind` stays `in|out`, converted only in `mappers.ts`, `queries.ts` (`usePostTxn`, `useUpdateTxn`, `useRecentTxns`) and `transfer.tsx` (import payload).

**Review Focus → tests:** (1) `conflictMessage` unit test + Task 10 browser step 4; (2) `route.test.ts`; (3) `05_write_rules.test.sql` + `errors.test.ts` + Task 12 browser step 4; (4) `07_import.test.sql` "a failing import writes nothing"; (5) `01_schema.test.sql` cap test + `mappers.test.ts` `parseAmount` test.
