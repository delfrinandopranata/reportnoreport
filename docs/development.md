# Development

## Prerequisites

- **macOS** (Homebrew) or Linux
- **Node.js 22+** and pnpm 12+ (`/opt/homebrew/bin/pnpm --version`)
- **Supabase CLI** (`brew install supabase/tap/supabase`)
- **Deno 2+** (`brew install deno` or `deno --version`)
- **Git** and a GitHub checkout of the repo

## First-time setup

### 1. Install dependencies

```bash
cd /Users/delfrinando/ntucsm/platform-internal
/opt/homebrew/bin/pnpm install
```

**Why `/opt/homebrew/bin/pnpm`?** The PATH `pnpm` may be v10 (old); Homebrew's is v12 (matches `pnpm-lock.yaml`). If setup fails, you have a stale version.

### 2. Start Supabase locally

```bash
supabase start
```

Expected output:
```
Started supabase local development setup.
API URL: http://127.0.0.1:54321
DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
Anon Key: eyJ...
Service Role Key: eyJ...
```

Copy the Anon Key.

### 3. Create `.env.local`

```bash
cat > .env.local <<EOF
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<paste-anon-key>
EOF
```

Also create `supabase/functions/.env.local`:

```bash
cat > supabase/functions/.env.local <<EOF
APP_URL=http://localhost:5199/app/
EOF
```

### 4. Verify the database is ready

```bash
supabase status
```

If the status shows API/DB/Studio/Mailpit URLs, you're ready. The migrations run automatically on `supabase start`.

### 5. Run the dev server

```bash
/opt/homebrew/bin/pnpm dev
```

Open `http://localhost:5199/app/` in your browser. You should see the sign-in page. **Seed users** (password `password123`):
- `owner@alpha.test` (Alpha Advisory, MYR, complimentary)
- `admin@alpha.test` (same firm, admin role)
- `accountant@alpha.test` (same firm, accountant role)
- `viewer@alpha.test` (same firm, viewer role)
- `owner@beta.test` (Beta Partners, SGD, trial active)
- `admin@platform.test` (super-admin, no firm)

Sign in as `owner@alpha.test` and you should see the dashboard.

### 6. (Optional) Open the database GUI

```bash
# Supabase Studio at http://127.0.0.1:54323
# (sign in with any email@example.com, password: postgres)

# Or use psql directly:
PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -p 54322 postgres
```

## Daily commands

```bash
# Start Supabase (if not running)
supabase start

# Start the dev server (http://localhost:5199/app/)
/opt/homebrew/bin/pnpm dev

# Check mail (Mailpit; http://127.0.0.1:54324)
# Open in browser

# Mailpit shows all emails sent from the local app (invites, password resets, etc.)
```

## Running tests

### Unit tests (Node.js)

```bash
/opt/homebrew/bin/pnpm test
```

Tests source files matching `src/**/*.test.ts` (except `.db.test.ts`). Covers:
- `src/ledger.test.ts` — statement maths
- `src/users.test.ts` — role/permission rules
- `src/auth/route.test.ts` — returnTo save/restore
- `src/data/mappers.test.ts` — row ↔ model mapping
- `src/data/money.test.ts` — currency formatting
- `src/data/errors.test.ts` — error messages
- `src/data/paging.test.ts` — fetchAll pagination
- `src/data/signup.test.ts` — cap and waitlist logic
- `src/settings/bankForm.test.ts` — bank account form validation

All should pass locally. If a test fails, check:
- Supabase is running (`supabase status`)
- `.env.local` is set
- `pnpm install` completed without errors

### Database tests (pgTAP)

```bash
supabase test db
```

Tests in `supabase/tests/*.test.sql` cover:
- **01_schema.test.sql** — tables, enums, columns, constraints
- **02_isolation.test.sql** — RLS prevents cross-firm reads
- **03_roles.test.sql** — role permissions enforced
- **04_invariants.test.sql** — unique owner, default bank account, currency lock, triggers
- **05_write_rules.test.sql** — firm_can_write gating (trial, paid, suspended)
- **06_ledger.test.sql** — client_balances, ledger_lines correctness
- **07_import.test.sql** — import_transactions validation and all-or-nothing
- **08_team.test.sql** — invite, role change, suspend, transfer
- **09_constraints.test.sql** — change_log schema and trigger coverage
- **11_signup.test.sql** — cap, waitlist, create_firm_for_current_user

All tests should pass. If any test fails, check the error message and the migration that introduced the function. The tests are designed to be declarative: read the test name to understand what it's checking.

### Equivalence test (browser maths vs SQL)

```bash
/opt/homebrew/bin/pnpm test:db
```

Runs `src/data/equivalence.db.test.ts`. This test verifies that:
- The browser `statement()` function (in `src/ledger.ts`, for testing only) produces the same output as SQL `ledger_lines()`
- The browser `totalsByClient()` function produces the same output as SQL `client_balances()`

Uses a single fixture ledger with receipts and payments across two clients. If this test fails, the browser maths and SQL are out of sync — fix the browser version (tests only; production uses SQL).

### Edge Function tests (Deno)

```bash
deno test supabase/functions
```

Tests in `supabase/functions/**/*.test.ts` cover Edge Function rules (caller validation, auth checks). All tests should pass. Billing tests (Plan C) deferred.

### Type checking and linting

```bash
# Type check
npx tsc -p tsconfig.app.json --noEmit

# Lint (Oxlint, very fast)
npx oxlint src
```

Both should pass with no output. If oxlint complains about `only-export-components`, that's OK; it's a known false positive for `SessionProvider`.

### Build verification

```bash
/opt/homebrew/bin/pnpm build
```

Produces `dist/` with:
- `dist/index.html` (homepage)
- `dist/app/` (React app)
- `dist/app/index.html`, `dist/app/assets/`, etc.
- `dist/demo/` (browser-only MVP, if Plan B is complete)

All three should load and run locally via `pnpm preview`.

## Environment files

### `.env.local` (git-ignored)

For local dev Supabase:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<from-supabase-status>
```

### `.env.dev.local` (git-ignored, future)

For hosted DEV Supabase (with tunnel):

```env
VITE_SUPABASE_URL=https://your-dev-project.supabase.co
VITE_SUPABASE_ANON_KEY=<your-dev-anon-key>
```

### `supabase/functions/.env.local` (git-ignored)

For local Edge Function tests and `team` invites:

```env
APP_URL=http://localhost:5199/app/
```

On hosted Supabase, set this in Supabase dashboard › Project Settings › Edge Functions › APP_URL.

## Adding a migration

Migrations are Postgres SQL files in `supabase/migrations/` numbered `20261003000001_schema.sql`, etc. Append-only; never edit an existing migration.

### To add a migration:

1. Create a new file with the next number:

```bash
touch supabase/migrations/20261004000011_my_feature.sql
```

2. Write your SQL (idempotent where possible):

```sql
-- Idempotent: use CREATE IF NOT EXISTS, ALTER only if the column doesn't exist, etc.
alter table clients add column if not exists tags text[] default '{}';
create index if not exists idx_clients_tags on clients using gin (tags);
```

3. Run locally:

```bash
supabase db reset
```

The Supabase CLI runs all migrations in order. If your migration fails, fix it and re-run `supabase db reset` (this deletes local data, so seed again).

4. Test:

```bash
supabase test db
```

5. Regenerate types:

```bash
supabase gen types typescript --local > src/data/database.types.ts
```

6. Commit:

```bash
git add supabase/migrations/20261004000011_my_feature.sql src/data/database.types.ts
git commit -m "feat: add tags to clients"
```

## Debugging

### Supabase logs

```bash
# See all local Supabase services
supabase status

# View API logs (request/response)
supabase logs --tail

# Stop and restart (clears temp files, may fix stale state)
supabase stop && supabase start
```

### Database logs and queries

Inside Supabase Studio (http://127.0.0.1:54323), go to **SQL Editor** and run queries directly. Or:

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -p 54322 postgres
```

Common queries:

```sql
-- See all firms
select id, name, currency, billing_status, trial_ends_at from firms;

-- See all profiles
select id, email, firm_id, role, status from profiles;

-- Check RLS is working (should return zero rows if signed in as owner@beta.test)
select count(*) from clients where firm_id != auth_firm_id();

-- View change log
select table_name, action, row_id, created_at from change_log order by id desc limit 20;

-- Force an RLS error (should fail with 403)
delete from clients where firm_id != auth_firm_id();
```

### Dev server issues

**Port 5199 already in use?**

```bash
lsof -iTCP:5199
kill -9 <PID>
```

**Stale node_modules?**

```bash
rm -rf node_modules pnpm-lock.yaml
/opt/homebrew/bin/pnpm install
```

**Supabase won't start?**

```bash
supabase stop
docker system prune -f  # Clean up old images
supabase start
```

**Database locked?**

```bash
supabase db reset  # Clears and re-seeds
```

## Key local defaults

| Service | URL | Port | User/Pass |
|---|---|---|---|
| Dev server | http://localhost:5199 | 5199 | (none) |
| Supabase API | http://127.0.0.1:54321 | 54321 | (anon key) |
| Postgres | postgresql://postgres:postgres@127.0.0.1:54322 | 54322 | postgres / postgres |
| Supabase Studio | http://127.0.0.1:54323 | 54323 | any email / postgres |
| Mailpit (email) | http://127.0.0.1:54324 | 54324 | (none) |

## Troubleshooting

| Issue | Solution |
|---|---|
| `VITE_SUPABASE_URL is missing` on build | Create `.env.local` with the keys above |
| Type errors after schema change | Run `supabase gen types typescript --local > src/data/database.types.ts` and `pnpm install` |
| Lint fails on first run | Run `supabase db reset` to apply all migrations, then `supabase test db` to verify |
| Test times out | Increase Jest timeout (not used here; tests use Node.js --test runner which has no timeout) |
| Invite email not sent | Check Mailpit at http://127.0.0.1:54324; if missing, verify `app_url` in `supabase/functions/.env.local` |
| Cross-firm data visible | Run `supabase test db` to check RLS is working; RLS failure is a critical bug |
| Currency formats wrong | Check `makeMoney()` in `src/data/money.ts` — it uses `Intl.NumberFormat(..., { currencyDisplay: 'code' })` |
| pnpm install fails with hash mismatch | Delete `pnpm-lock.yaml` and `.pnpmstore`, then run again |
| Port 5435 ambiguous (local DB tunnel) | Use the port from `supabase status` (usually 54322); port 5435 is for hosted DEV only |
| App loads but shows 401 Unauthorized | Supabase Auth isn't configured; check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` |

## Cookie isolation (multi-stack testing)

When testing multiple signed-in users at once, **use separate hostnames to keep cookie jars apart:**

```
alpha.localhost:5199     — sign in as owner@alpha.test
beta.localhost:5199      — sign in as owner@beta.test (separate session)
```

Chrome automatically resolves `*.localhost` to 127.0.0.1 with no config; each hostname has its own cookie jar.

If you use bare `localhost:5199` for both, the second login overwrites the first's session.

## Building and deploying locally

```bash
# Build for production
/opt/homebrew/bin/pnpm build

# Preview the build
/opt/homebrew/bin/pnpm preview

# Open http://localhost:4173/app/ to see the built app
```

The build produces `dist/` with all entry points (homepage, app, demo) optimised.

For Vercel deployment, see [operations.md](./operations.md) § Hosting.
