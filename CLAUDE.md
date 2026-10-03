# CLAUDE.md — Platform development conventions

This file states conventions for any Claude session in this repo. **Read [docs/README.md](docs/README.md) first** for orientation.

## Product and architecture

**Platform** is a multi-tenant client-money SaaS (Supabase + Vercel). Read the docs:
- [docs/README.md](docs/README.md) — orientation and quick reference
- [docs/architecture.md](docs/architecture.md) — entry points, data flow, backend structure
- [docs/data-model-and-security.md](docs/data-model-and-security.md) — tables, RLS, permissions
- [docs/process.md](docs/process.md) — how work is run (plans, specs, agents, commits)

Current status: Plan A (backend) and Plan B (self-serve console) complete on main. Next: Plan C (Stripe, RM 10 once).

## Code conventions

### Language and copy

- **British English** throughout: "organisation", "centre", "licence" (not "organization", "center", "license")
- **Currency:** ISO codes (MYR, SGD, USD) displayed as "MYR 1,234.50", never symbols
- **Money:** Integer minor units everywhere — 1000 represents RM 10.00 (2 decimals for MYR)
- **Dates:** Use `new Date()` and `date.toISOString().split('T')[0]` for YYYY-MM-DD; `formatDate()` from `src/settings/constants.ts` for display
- **Comments:** Only when non-obvious (algorithm, invariant, public API). Never narrate what the code says
- **No Prettier** — ever. Lint is `npx oxlint src` (warnings about `only-export-components` are OK)

### TypeScript and React

- **Type everything:** No `any` without `// @ts-ignore` and a reason. Model types in `src/data/mappers.ts`, keep them in sync with Supabase types
- **Naming:**
  - Functions/variables: `camelCase`
  - Types/interfaces: `PascalCase`
  - Constants: `UPPER_SNAKE`
  - Booleans: `is*`, `has*`, `should*`
  - Hooks: `use*`
- **Immutability:** Never mutate arguments; return new values
- **Error handling:** Catch all errors explicitly; never swallow. Use `toUserMessage(error, context)` from `src/data/errors.ts` to format for the UI
- **React components:** Pure when possible. Use `SessionProvider` for user/firm/role context. Use TanStack Query hooks for data fetching; never `fetch()` in components
- **CSS:** Tailwind 4 only. No inline styles; no CSS modules. Responsive: mobile-first (`sm:`, `lg:`, etc.)

### Database

- **Schema migrations:** Append-only files in `supabase/migrations/` numbered `20261003000001_…`. Never edit or delete existing migrations. New migrations start at `20261004000003_` (next in sequence after signup and support)
- **RLS:** Every business table has read and write policies. Read the RLS model in [data-model-and-security.md](docs/data-model-and-security.md); never bypass it
- **Stored functions:** Created once, idempotent (use `create or replace`). Keep them in migrations; don't create ad-hoc SQL functions
- **Triggers:** Created in migrations. Use for audit (change_log), invariants (owner uniqueness), and derived columns (updated_at)
- **Money:** Always `bigint` minor units; never floats. Cap at 1e13 (100 billion major units)
- **Denormalisation:** Avoid except where the schema mandates it (e.g., `firm_id` in every table for RLS)

### Testing

- **Unit tests:** `src/**/*.test.ts` using Node.js `--test` runner. Run: `pnpm test`
- **Database tests:** `supabase/tests/*.test.sql` using pgTAP. Run: `supabase test db` (must have local Supabase running)
- **Edge Function tests:** `supabase/functions/**/*.test.ts` using Deno. Run: `deno test supabase/functions`
- **Equivalence test:** `src/data/equivalence.db.test.ts` verifies browser maths = SQL functions. Run: `pnpm test:db` (requires `supabase start` first)
- **No Playwright or Jest:** Browser testing uses the Claude in-app Browser pane (`localhost:5199` with cookie isolation via `*.localhost`)
- **Write tests with the code:** Every bug fix includes a failing test, then the fix. New features include tests.
- **Coverage:** Aim for >80% on public APIs and complex logic; accept <80% on UI components

## Secrets and security

- **Secrets never in git:** `.env.local` and `supabase/functions/.env.local` are git-ignored
- **`.env.example`** lists variable names only (no values)
- **Service role key:** Only in Supabase Edge Functions (never browser code, never in VITE_ variables)
- **API keys:** Resend, Stripe, Supabase keys set in environment variables, not code
- **Passwords:** Local dev seed uses `password123` (local only); never check in real passwords
- **Audit:** `git log -S '<key-fragment>'` to find accidental commits

## Development setup

**Prerequisites:**
- Node.js 22+ and `/opt/homebrew/bin/pnpm` v12 (not the system pnpm)
- Supabase CLI and Deno (`brew install supabase/tap/supabase deno`)

**First time:**
```bash
/opt/homebrew/bin/pnpm install
supabase start
# Set VITE_SUPABASE_* in .env.local from supabase status output
/opt/homebrew/bin/pnpm dev  # http://localhost:5199/app/
```

**Daily:**
- `supabase start` (if not running)
- `/opt/homebrew/bin/pnpm dev` (dev server on 5199)
- `supabase test db` after schema changes
- Tests: `pnpm test`, `deno test supabase/functions`, typecheck `npx tsc -p tsconfig.app.json --noEmit`

**Cookie isolation (multi-user testing):**
```
http://alpha.localhost:5199/app/   — owner@alpha.test
http://beta.localhost:5199/app/    — owner@beta.test (separate session)
```
Chrome auto-resolves `*.localhost` to 127.0.0.1; each hostname has its own cookie jar.

## Git and commits

**Branches:**
- `main` — production (never edit locally; only merge)
- `feat/stripe-billing` — Plan C (future)
- Naming: `feat/`, `fix/`, `docs/`, `refactor/`, `test/`, `chore/` + description + optional Linear ID
- No `cursor` or `claude` in branch names

**Commits:**
```
feat: add trial banner to app shell

Shows days left during trial; after expiry, blocks writes with a reason.
Trial state is checked at request time (now() < trial_ends_at) so the banner
updates automatically. (Ruling P2)

- App.tsx displays TrialBanner when billing_status = 'trial'
- trialState() selector derived from firm.trial_ends_at
- Write attempts while trial_ends_at passed return "Your trial has ended..."

Test: t10_trial.browser verifies the banner and write block.
```

**No tool-branding:** No "Co-Authored-By: Claude", no "Generated by", no Cursor metadata. Attribution is the user only.

**Push:** Only when asked. Never `git push --force` to main.

## Running checks before committing

```bash
# Type check
npx tsc -p tsconfig.app.json --noEmit

# Lint (Oxlint, very fast)
npx oxlint src

# Unit tests
pnpm test

# Database tests (if you touched supabase/)
supabase test db

# Build
pnpm build
```

All must pass. If a check fails, fix it (don't skip the check).

**Never Prettier.** BE uses `oxlint` which includes Prettier rules; FE has no lint. `--fix` is only for oxlint on changed files.

## Where things live

| Question | Answer | Location |
|---|---|---|
| What's the product? | Client-money SaaS | [docs/README.md](docs/README.md) |
| How does it work? | Architecture, data flow | [docs/architecture.md](docs/architecture.md) |
| What's the database? | Tables, RLS, SQL functions | [docs/data-model-and-security.md](docs/data-model-and-security.md) |
| What's left to build? | Plans, status, next steps | [docs/status-and-roadmap.md](docs/status-and-roadmap.md) |
| How's work run? | Spec → plan → agents → commits | [docs/process.md](docs/process.md) |
| What was decided and why? | Rulings, trade-offs, rationale | [docs/decisions.md](docs/decisions.md) |
| How do I set up locally? | Prerequisites, dev commands | [docs/development.md](docs/development.md) |
| How do I deploy? | Supabase, Vercel, Stripe, Resend | [docs/operations.md](docs/operations.md) |
| What's the schema? | Generated types | `src/data/database.types.ts` |
| What are the API contracts? | Supabase RPC types | `src/data/database.types.ts` |
| What's the UI component library? | Tailwind + custom components | `src/ui.tsx` |
| What are the role/permission rules? | Pure functions, no React | `src/users/rules.ts` |

## Roles and permissions

**Roles:** `owner`, `admin`, `accountant`, `viewer`. Permissions are enforced by RLS + role checks in triggers + UI gates.

```typescript
// Check what a role can do
import { can } from 'src/users/rules'
can('owner', 'clients.edit')  // true
can('viewer', 'transactions.post')  // false
```

**SQL equivalent:** `auth_can(action text) returns boolean` in Postgres.

**Firm write blocks:** `firm_can_write(firm_id)` returns false if the firm is suspended, trial-expired, or read-only. Always check before writes.

## Error handling and user messages

**Error → user message:**
```typescript
import { toUserMessage } from 'src/data/errors'
catch (err) {
  const msg = toUserMessage(err, { context: 'clients.edit' })
  // msg = "Your firm can't make changes right now: trial expired" (or similar)
}
```

**Never show raw errors** to users. Always call `toUserMessage()`. It handles:
- RLS (403) → "Your firm doesn't have access" or "Your role can't do that"
- Unique violations (23505) → "Someone already has that email"
- Trial/suspension → "Your trial has ended. Pay RM 10 to keep editing."
- Concurrent edits (409) → "This was changed by Alice at 3 pm. Reload to see their changes."

## Advanced patterns

### Paging large lists

```typescript
import { fetchAll } from 'src/data/paging'
// PostgREST caps returns at 1000 rows; fetchAll pages automatically
const ledger = await fetchAll(client.from('transactions').select('*').eq('firm_id', firmId))
```

### Currency formatting

```typescript
import { makeMoney } from 'src/data/money'
const format = makeMoney('MYR')
format(100000)  // "MYR 1,000.00"
```

### Conflict detection (concurrent edits)

```typescript
// When updating, include the current updated_at timestamp
await updateClient(clientId, updates, currentUpdatedAt)
// If updated_at changed, the update fails with 409; user sees conflict message
```

### Deferred decisions and tech debt

Minor items are tracked in [docs/status-and-roadmap.md](docs/status-and-roadmap.md) § Deferred items. Before merging a PR, check if any changes affect a deferred item; if so, pull it into this PR or update the status.

---

## Questions?

- **Confused about the architecture?** Read [docs/architecture.md](docs/architecture.md)
- **What's the security model?** [docs/data-model-and-security.md](docs/data-model-and-security.md)
- **How do I set up?** [docs/development.md](docs/development.md)
- **Stuck on a decision?** Check [docs/decisions.md](docs/decisions.md) for the rationale

**Status:** If you're picking up mid-session, read [docs/status-and-roadmap.md](docs/status-and-roadmap.md) § How to resume work.
