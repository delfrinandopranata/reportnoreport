# Plan B — Homepage, Self-Serve Trial and Super-Admin Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any firm discover the product on a public homepage, sign up for a 14-day free trial (up to an early-access cap of 5 self-serve firms, then a waitlist), and let the platform owner run every firm from a super-admin console — with the app served at `/app/` and the old browser-only demo at `/demo/`.

**Architecture:** Vite builds three entry points: a static marketing page (`index.html` → `/`), the React app (`app/index.html` → `/app/`), and a separately built copy of the `demo-local` tag (`/demo/`). Sign-up uses Supabase Auth (email verification required); on the first verified sign-in the app calls `create_firm_for_current_user`, a SECURITY DEFINER function that enforces the self-serve cap under a row lock. Public, anonymous capabilities are limited to two narrow RPCs (`platform_status`, `join_waitlist`). Super-admin work goes through a new `admin` Edge Function (service role, caller verified as super-admin); the console UI lives in `src/admin/`.

**Tech Stack:** as Plan A (Vite 8, React 19, TS, Tailwind 4, supabase-js 2, TanStack Query 5, Supabase CLI, Deno).

**Spec:** `docs/superpowers/specs/2026-10-03-platform-foundation-design.md` — this plan implements §2 (homepage/app/demo entries, `admin` Edge Function, super-admin + support view, self-serve readiness), §3 (`create_firm_for_current_user`, `platform_settings`, `waitlist`), §5 items 1, 2, 7 (trial part only — the Pay button is Plan C), 8, 9, 10, §6 (cap under lock, waitlist rate limit, email verification), §7 items 1 and 5 (cap, trial, console), §8 (local + production checklist).

## Global Constraints

- Repo `/Users/delfrinando/ntucsm/platform-internal`, branch `feat/self-serve-console` (from `main` @ 8a32ccf). Commit per task with conventional messages; no tool-branding trailers. Push only when a task says so.
- Never run Prettier. Lint `npx oxlint`. Typecheck `npx tsc -p tsconfig.app.json --noEmit`. Unit tests `pnpm test` (use `/opt/homebrew/bin/pnpm`). DB tests `supabase test db`. Edge Function tests `deno test supabase/functions`.
- Migrations are append-only: new files start at `20261004000001_…`.
- Money: integer minor units; display ISO codes via `makeMoney` (`MYR 1,234.50`).
- One person = one firm (spec D5). Super-admins have `firm_id = null`, `is_super_admin = true`.
- Trial length and cap come from `platform_settings` (defaults: `trial_days = 14`, `firm_cap = 5`). Admin-created firms never count toward the cap.
- Supported sign-up currencies: `MYR`, `SGD`, `USD` (select list; default `MYR`).
- Anonymous (`anon`) may execute ONLY `platform_status()` and `join_waitlist(text, text)`. Everything else stays revoked from anon.
- The service-role key exists only in Edge Functions.
- Redirect URLs move from `/app?flow=set-password` to `/app/?flow=set-password` (the app now lives at `/app/`).
- British English; product name "Platform"; homepage pricing line exactly: "Free for 14 days. Then RM 10, once." (the Pay flow itself is Plan C).
- Browser checks use the in-app Browser pane in the agent's own tab on its own `*.localhost:5199` host.

## Review Focus

1. **Two firms sign up at the same moment when one slot is left** → exactly one gets a firm, the other is waitlisted. Test: B2 pgTAP cap test + the `for update` lock assertion.
2. **Unverified email tries to create a firm** (direct RPC call) → refused. Test: B2 pgTAP.
3. **Someone already in a firm (or a super-admin) calls create_firm again** → refused, no second firm. Test: B2 pgTAP.
4. **Non-super-admin calls the `admin` function** → 403 and nothing changes. Test: B3 Deno rules test.
5. **Trial ends while the person is signed in** → banner switches to the ended state and writes are blocked (existing RLS) with the reason. Test: B6 unit test on `trialState()`.

---

## File Structure

| Path | Responsibility | Task |
|---|---|---|
| `index.html` | Static homepage (marketing) | B1 (moved), B5 (content) |
| `app/index.html` | React app entry (`/src/main.tsx`) | B1 |
| `vite.config.ts` | multi-page `build.rollupOptions.input` | B1 |
| `vercel.json` | clean URLs, `/app` → `/app/` redirect, headers | B1 |
| `scripts/build-demo.sh` | builds tag `demo-local` with base `/demo/` into `dist/demo` | B8 |
| `supabase/migrations/20261004000001_signup.sql` | `platform_status`, `join_waitlist`, `create_firm_for_current_user`, waitlist constraints, grants | B2 |
| `supabase/tests/11_signup.test.sql` | pgTAP for B2 | B2 |
| `supabase/functions/admin/{index.ts,rules.ts,rules.test.ts}` | super-admin Edge Function | B3 |
| `src/auth/AuthPages.tsx`, `src/auth/route.ts` | Sign up mode | B4 |
| `src/data/session.tsx` | first-sign-in firm creation; super-admin branch | B4 |
| `src/data/signup.ts` (+ test) | pure helpers: pending-firm metadata, cap error detection | B4 |
| `src/home/home.ts`, `src/home/home.css` | homepage script (cap check, waitlist form) | B5 |
| `src/trial.ts` (+ test), `src/App.tsx` | trial banner | B6 |
| `src/admin/*.tsx`, `src/admin/api.ts` | super-admin console + support view | B7 |
| `README.md` | hosted deployment checklist | B9 |

---

### Task B1: Move the app to `/app/`; multi-page build; Vercel config

**Files:** Create `app/index.html`, `vercel.json`. Modify `index.html`, `vite.config.ts`, `src/auth/AuthPages.tsx`, `supabase/functions/team/index.ts`, `supabase/config.toml`, `README.md`.

**Interfaces — produces:** app URL base `/app/`; set-password redirect `<origin>/app/?flow=set-password`.

- [ ] **Step 1:** `git mv index.html app/index.html`. In `app/index.html` keep the head; script stays `<script type="module" src="/src/main.tsx"></script>`; title "Platform — Client accounts".
- [ ] **Step 2:** New minimal root `index.html` (title "Platform — Client money, handled.", `<h1>Client money, handled.</h1>`, a link `<a href="/app/">Sign in</a>`, `<script type="module" src="/src/home/home.ts"></script>`). Create `src/home/home.ts` containing only `import '../index.css'` for now (B5 fills both).
- [ ] **Step 3:** `vite.config.ts`:
  ```ts
  import { resolve } from 'node:path'
  // …
  export default defineConfig({
    plugins: [react(), tailwindcss()],
    build: { rollupOptions: { input: { home: resolve(__dirname, 'index.html'), app: resolve(__dirname, 'app/index.html') } } },
  })
  ```
  (`__dirname` → use `fileURLToPath(new URL('.', import.meta.url))` since the package is ESM.)
- [ ] **Step 4:** Redirects to `/app/?flow=set-password`: `AuthPages.tsx` `resetPasswordForEmail` redirectTo; `team/index.ts` both `inviteUserByEmail` calls; `supabase/config.toml` `site_url = "http://localhost:5199/app/"` (keep the R20 globs); README URL Configuration line.
- [ ] **Step 5:** `vercel.json`:
  ```json
  {
    "cleanUrls": true,
    "redirects": [{ "source": "/app", "destination": "/app/", "permanent": true }, { "source": "/demo", "destination": "/demo/", "permanent": true }],
    "headers": [{ "source": "/(.*)", "headers": [
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "X-Frame-Options", "value": "DENY" }
    ] }]
  }
  ```
- [ ] **Step 6:** Verify: `pnpm build` produces `dist/index.html` and `dist/app/index.html`; dev server: `http://localhost:5199/app/` shows sign-in and the app works after sign-in (owner@alpha.test); `http://localhost:5199/` shows the minimal homepage. Restart auth (`supabase stop && supabase start`) for `site_url`. `pnpm test`, tsc, oxlint, `deno test supabase/functions`.
- [ ] **Step 7:** Commit `feat: serve the app at /app/ alongside a homepage entry`.

### Task B2: Sign-up, cap and waitlist functions (database)

**Files:** Create `supabase/migrations/20261004000001_signup.sql`, `supabase/tests/11_signup.test.sql`. Regenerate `src/data/database.types.ts`.

**Interfaces — produces (frozen):**
- `platform_status() returns jsonb` → `{"accepting_signups": boolean}`; executable by anon + authenticated.
- `join_waitlist(p_email text, p_firm_name text) returns void`; anon + authenticated; idempotent per email (case-insensitive); rejects invalid email (P0001 "Enter a valid email address."); at most 1 insert per email per 24h (otherwise no-op).
- `create_firm_for_current_user(p_firm_name text, p_currency text, p_person_name text) returns uuid` (firm id); authenticated only; raises P0001 with exact messages:
  - `'Verify your email address before creating your firm.'` (auth.users.email_confirmed_at is null)
  - `'You already belong to a firm.'` (a profile exists for auth.uid())
  - `'EARLY_ACCESS_FULL'` (cap reached — the frontend detects this token)
  - `'Choose MYR, SGD or USD.'` (currency not in list)
  - `'Enter your firm name.'` / `'Enter your name.'` (blank)

- [ ] **Step 1: Write the failing test** `supabase/tests/11_signup.test.sql`:
  ```sql
  begin;
  select plan(12);

  -- helpers
  create or replace function pg_temp.new_user(p_email text, p_confirmed boolean) returns uuid language plpgsql as $$
  declare v uuid := gen_random_uuid();
  begin
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated', p_email, '', case when p_confirmed then now() end, '{}', '{}', now(), now(), '', '', '', '');
    return v;
  end $$;
  create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
  begin
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end $$;

  select ok(has_function_privilege('anon', 'public.platform_status()', 'execute'), 'anon can read platform status');
  select ok(has_function_privilege('anon', 'public.join_waitlist(text,text)', 'execute'), 'anon can join the waitlist');
  select ok(not has_function_privilege('anon', 'public.create_firm_for_current_user(text,text,text)', 'execute'), 'anon cannot create firms');

  -- cap: seed has 1 self_serve firm (Beta). Set cap to 2 → one slot left.
  update platform_settings set firm_cap = 2;
  select is((platform_status()->>'accepting_signups')::boolean, true, 'accepting while below cap');

  select pg_temp.act_as(pg_temp.new_user('unverified@new.test', false));
  select throws_ok($$ select create_firm_for_current_user('Unverified Co', 'MYR', 'Una') $$, 'P0001', 'Verify your email address before creating your firm.', 'unverified email refused');

  select pg_temp.act_as(pg_temp.new_user('first@new.test', true));
  select isnt(create_firm_for_current_user('First Co Sdn Bhd', 'MYR', 'First Person'), null, 'verified user creates a firm');
  select is((select row(role::text, status::text)::text from profiles where email = 'first@new.test'), '(owner,active)', 'creator is the active owner');
  select is((select count(*)::int from bank_accounts b join firms f on f.id = b.firm_id where f.name = 'First Co Sdn Bhd' and b.is_default), 1, 'firm starts with a default bank account');
  select throws_ok($$ select create_firm_for_current_user('Second', 'MYR', 'First Person') $$, 'P0001', 'You already belong to a firm.', 'no second firm');

  select pg_temp.act_as(pg_temp.new_user('late@new.test', true));
  select throws_ok($$ select create_firm_for_current_user('Late Co', 'MYR', 'Late') $$, 'P0001', 'EARLY_ACCESS_FULL', 'cap reached');
  reset role;
  select is((platform_status()->>'accepting_signups')::boolean, false, 'not accepting at cap');

  select pg_temp.act_as(pg_temp.new_user('trial@new.test', true));
  reset role;
  select ok((select trial_ends_at between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour' from firms where name = 'First Co Sdn Bhd'), 'trial ends after trial_days');

  select * from finish();
  rollback;
  ```
  Also add a separate assertion file section (or in the same file before `finish`) that `join_waitlist('bad', 'X')` throws `'Enter a valid email address.'` and calling it twice for the same email leaves one row — adjust `plan()` count accordingly.
- [ ] **Step 2:** `supabase db reset && supabase test db` → 11 FAILS.
- [ ] **Step 3: Migration** `20261004000001_signup.sql`:
  ```sql
  create unique index if not exists waitlist_email_key on waitlist (lower(email));

  create or replace function platform_status() returns jsonb
  language sql stable security definer set search_path = public as $$
    select jsonb_build_object('accepting_signups',
      (select count(*) from firms where source = 'self_serve') < (select firm_cap from platform_settings))
  $$;

  create or replace function join_waitlist(p_email text, p_firm_name text) returns void
  language plpgsql security definer set search_path = public as $$
  declare v_email text := lower(trim(p_email));
  begin
    if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(v_email) > 254 then
      raise exception 'Enter a valid email address.' using errcode = 'P0001';
    end if;
    insert into waitlist (email, firm_name) values (v_email, left(coalesce(trim(p_firm_name), ''), 200))
    on conflict (lower(email)) do nothing;  -- idempotent; one row per email
  end $$;

  create or replace function create_firm_for_current_user(p_firm_name text, p_currency text, p_person_name text) returns uuid
  language plpgsql security definer set search_path = public as $$
  declare
    v_user auth.users;
    v_settings platform_settings;
    v_firm uuid;
    v_profile uuid;
  begin
    select * into v_user from auth.users where id = auth.uid();
    if v_user.id is null then raise exception 'Please sign in again.' using errcode = 'P0001'; end if;
    if v_user.email_confirmed_at is null then raise exception 'Verify your email address before creating your firm.' using errcode = 'P0001'; end if;
    if exists (select 1 from profiles where user_id = v_user.id) then raise exception 'You already belong to a firm.' using errcode = 'P0001'; end if;
    if coalesce(trim(p_firm_name), '') = '' then raise exception 'Enter your firm name.' using errcode = 'P0001'; end if;
    if coalesce(trim(p_person_name), '') = '' then raise exception 'Enter your name.' using errcode = 'P0001'; end if;
    if p_currency not in ('MYR', 'SGD', 'USD') then raise exception 'Choose MYR, SGD or USD.' using errcode = 'P0001'; end if;

    -- Serialise sign-ups so two people can't take the last slot at once.
    select * into v_settings from platform_settings for update;
    if (select count(*) from firms where source = 'self_serve') >= v_settings.firm_cap then
      raise exception 'EARLY_ACCESS_FULL' using errcode = 'P0001';
    end if;

    insert into firms (name, currency, billing_status, trial_ends_at, source)
    values (trim(p_firm_name), p_currency, 'trial', now() + make_interval(days => v_settings.trial_days), 'self_serve')
    returning id into v_firm;
    insert into profiles (user_id, firm_id, name, email, role, status, last_active_at)
    values (v_user.id, v_firm, trim(p_person_name), lower(v_user.email), 'owner', 'active', now())
    returning id into v_profile;
    insert into bank_accounts (firm_id, name, is_default) values (v_firm, 'Client account', true);
    return v_firm;
  end $$;

  revoke execute on function platform_status() from public;
  revoke execute on function join_waitlist(text, text) from public;
  revoke execute on function create_firm_for_current_user(text, text, text) from public, anon;
  grant execute on function platform_status() to anon, authenticated;
  grant execute on function join_waitlist(text, text) to anon, authenticated;
  grant execute on function create_firm_for_current_user(text, text, text) to authenticated;
  ```
  Note: the "24h rate limit" in the spec is satisfied by one-row-per-email idempotency (a repeated email is a no-op); IP rate limiting belongs to the hosting edge (documented in B9).
- [ ] **Step 4:** `supabase db reset && supabase test db` → all files pass. `pnpm db:types`. tsc.
- [ ] **Step 5:** Commit `feat(db): self-serve firm creation with early-access cap and waitlist`.

### Task B3: `admin` Edge Function

**Files:** Create `supabase/functions/admin/rules.ts`, `rules.test.ts`, `index.ts`.

**Interfaces — produces (frozen):** POST JSON with `Authorization: Bearer <user jwt>`; caller must have `profiles.is_super_admin = true` (else 403 `{error:"Super-admin access only."}`). Actions and responses:
| action | body | response |
|---|---|---|
| `list_firms` | — | `{ firms: [{ id, name, currency, source, status, billing_status, trial_ends_at, paid_at, created_at, members: number, last_active_at: string\|null }] }` |
| `create_firm` | `{ name, currency, owner_name, owner_email, start: 'complimentary'\|'trial' }` | `201 { firmId }` (firm `source='admin'`, default bank account, owner invited via `inviteUserByEmail` redirect `${APP_URL}/app/?flow=set-password`, profile `owner`/`invited`) |
| `set_status` | `{ firmId, status: 'active'\|'suspended' }` | `{}` |
| `extend_trial` | `{ firmId, days: 7\|14 }` | `{ trial_ends_at }` (from max(now, current end); sets billing_status `trial`) |
| `set_billing` | `{ firmId, billing_status: 'complimentary'\|'trial' }` | `{}` |
| `get_settings` / `set_settings` | `{ firm_cap?, trial_days? }` | `{ firm_cap, trial_days, self_serve_firms }` |
| `list_waitlist` | — | `{ waitlist: [{ email, firm_name, created_at }] }` |
| `support` | `{ firmId, view: 'clients'\|'balances'\|'ledger', from?, to? }` | read-only data; writes one `change_log` row `action='support_access'`, `after = {view, from, to}`, `actor = caller` |
Every mutating action writes a `change_log` row (`action='billing'` for billing/trial changes, `'update'` for status) with before/after for the firm. Errors: 400 for validation (human message), 404 firm not found, 500 generic "Something went wrong." with server-side `console.error`.

- [ ] **Step 1:** `rules.ts` with pure, tested functions: `isSuperAdmin(profile)`, `validateCreateFirm(body)` → error string | null (name required, email format, currency in MYR/SGD/USD, start in set), `extendTrialEnd(currentEnd: string|null, now: Date, days: 7|14): string`, `validateSettings({firm_cap, trial_days})` (cap integer 0–1000, trial 1–365). Deno tests first (RED), then implement (GREEN): non-super-admin rejected; validation messages; extend from a past end uses now; extend from a future end adds to it.
- [ ] **Step 2:** `index.ts` mirroring `team/index.ts` structure (CORS headers `authorization, x-client-info, apikey, content-type`; methods `POST, OPTIONS`; `resolveAppUrl` reused by importing from `../team/rules.ts`), service-role client, auth via `admin.auth.getUser(jwt)`, load caller profile, dispatch actions as specified. `support/ledger` uses service-role queries equivalent to `ledger_lines` filtered by `firm_id` (call the SQL function under the service role? It's SECURITY INVOKER relying on RLS → under service role it would return ALL firms. So query `transactions` directly with `.eq('firm_id', firmId)` and compute nothing — return rows; balances via `client_balances` is likewise unsafe → compute `support/balances` with a SQL query on `transactions` grouped by client filtered by firm_id via `.rpc` is not available → implement a new SECURITY DEFINER SQL function `support_client_balances(p_firm uuid, p_from date, p_to date)` executable ONLY by `service_role`, in migration `20261004000002_support.sql`, and test it in `supabase/tests/12_support.test.sql` (authenticated cannot execute; returns only that firm's clients).
- [ ] **Step 3:** Seed `admin@platform.test` already exists (super-admin). Smoke test with `supabase functions serve admin` + curl as that user: `list_firms` returns Alpha and Beta; as `owner@alpha.test` → 403.
- [ ] **Step 4:** `deno test supabase/functions` (from repo root), `supabase test db`. Commit `feat: super-admin edge function`.

### Task B4: Sign up and first sign-in

**Files:** Modify `src/auth/AuthPages.tsx`, `src/auth/route.ts`, `src/data/session.tsx`. Create `src/data/signup.ts`, `src/data/signup.test.ts`, `src/admin/AdminConsole.tsx` (stub only: `export function AdminConsole({ name, onSignOut }: { name: string; onSignOut: () => void })` rendering "Super-admin console" heading + Sign out; B7 replaces the body, keeping this signature).

**Interfaces:** consumes B2 RPCs; produces `pendingFirmFromMetadata(meta): { firmName: string; currency: 'MYR'|'SGD'|'USD'; personName: string } | null`, `isEarlyAccessFull(error): boolean`.

Requirements:
1. Auth page mode `#signup` ("Start your free trial"): fields Firm name, Currency (MYR default / SGD / USD), Your name, Work email, Password (≥ 8, show/hide toggle reuse), Confirm password. Link "Already have an account? Sign in"; sign-in page links "New to Platform? Start a free trial". Before showing the form, call `platform_status()`; if not accepting → show "Early access is full" + waitlist form (email, firm name → `join_waitlist`) with confirmation "You're on the list. We'll email you when a place opens."
2. Submit → `supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/app/`, data: { name, firm_name, currency } } })`. Show "Check your email — we've sent a link to <email> to verify your address." Handle "User already registered" → "An account with that email already exists. Sign in instead."
3. SessionProvider: after sign-in, when the profile query returns NO profile and the user is not a super-admin: read `pendingFirmFromMetadata(user.user_metadata)`; if present call `create_firm_for_current_user(firm_name, currency, name)` then reload the session query; if it throws `EARLY_ACCESS_FULL` → call `join_waitlist(user.email, firm_name)` and show a full-page message "Early access is full. You're on the waitlist — we'll email you when a place opens." with Sign out; any other error → show it with Retry/Sign out. If no metadata → existing "not set up" message.
4. SessionProvider: when `profile.is_super_admin` → render `<AdminConsole name={profile.name} onSignOut={signOut} />` instead of the app (no firm needed).
5. Unit tests (`src/data/signup.test.ts`) for the two pure helpers, RED first.
6. Browser: sign up `trialco@new.test` → Mailpit confirmation email (uses confirmation template) → follow link → lands in `/app/` → firm created, owner, trial; Settings shows the firm currency; Users shows the owner. Then sign in as `admin@platform.test` → AdminConsole stub. Clean up: delete the test firm and auth user via SQL (`docker exec` psql: `delete from firms where name = '…'; delete from auth.users where email = 'trialco@new.test';`).

Commit `feat(auth): self-serve sign-up with firm creation on first sign-in`.

### Task B5: Homepage

**Files:** `index.html`, `src/home/home.ts`, `src/home/home.css` (optional — Tailwind via `@import "../index.css"` is fine). No React.

Requirements: static, fast, accessible marketing page in the app's visual language (zinc, Inter, light/dark via `prefers-color-scheme`), mobile-first, no horizontal scroll at 375px. Sections:
1. Header: logo tile + "Platform", nav links (Features, Pricing, FAQ), "Sign in" (`/app/`), primary "Start free trial" (`/app/#signup`).
2. Hero: "Client money, handled." + one-sentence value prop for firms that hold money on behalf of clients (receipts, payments, balances, statements); primary + secondary CTA ("See the demo" → `/demo/`).
3. What it does (3 cards): Client ledgers with running balances; Statements of account in your firm's currency; Your team with the right access (roles).
4. How it works (3 steps): Sign up and verify your email → Add your bank accounts and clients (or import a CSV) → Record receipts and payments, send statements.
5. Feature grid (6): Firm-level data isolation; Roles & permissions; CSV import/export; Printable statements; Multi-currency firms (MYR, SGD, USD — one currency per firm); Change history.
6. Pricing card: "Free for 14 days. Then RM 10, once." + "No card needed to start." + CTA.
7. FAQ (accordion with `<details>`): Is my data separate from other firms? Which currencies? What happens after 14 days? (read-only until you pay; data stays exportable) Can I import from a spreadsheet? Who can see what?
8. Footer: © year Platform · Sign in · Contact (mailto placeholder `hello@` + domain configured later — use `#` with TODO-free copy "Contact us" linking to `mailto:hello@example.com` constant at top of home.ts, documented in README for replacement).
`home.ts`: on load call `POST <VITE_SUPABASE_URL>/rest/v1/rpc/platform_status` with the anon key (use supabase-js `createClient` directly — do NOT import `src/data/supabase.ts`, which pulls app concerns; create the client in home.ts with the same env validation helper `readEnv` imported from `src/data/supabase.ts` is acceptable ONLY if it doesn't pull React — if it does, inline a tiny env check). If not accepting sign-ups: every "Start free trial" CTA changes to "Join the waitlist" opening an inline form (email, firm name → `join_waitlist`) with success/error messages (`role="status"/"alert"`). If the RPC fails, keep CTAs as sign-up links (fail open; the server still enforces the cap).
SEO: `<title>`, meta description, Open Graph title/description, canonical placeholder comment, `lang="en-GB"`, semantic landmarks, one h1.
Browser: desktop/tablet/375px, light/dark; with `update platform_settings set firm_cap = 0` (docker exec) → waitlist mode works and inserts; restore `firm_cap = 5` and delete the test waitlist row. Screenshots to `.screenshots/home-*.jpg`.
Commit `feat: marketing homepage with trial and waitlist`.

### Task B6: Trial banner

**Files:** Create `src/trial.ts`, `src/trial.test.ts`; modify `src/App.tsx`.

`trialState(firm: { billingStatus: string; trialEndsAt: string | null }, now: Date): { kind: 'none' } | { kind: 'active'; daysLeft: number; endsOn: string } | { kind: 'ended'; endedOn: string }` — `daysLeft` = ceil of remaining days, minimum 1 while active; `endsOn`/`endedOn` formatted `d MMM yyyy` en-GB. Tests RED first: paid/complimentary → none; 13.2 days left → 14; 0.5 days → 1; past → ended.
Banner (top of main content, all roles, `role="status"`): active → "<n> days left in your free trial (ends <date>)."; owners also see "You'll be able to pay RM 10 to keep using Platform." (Plan C replaces this with the Pay button); ended → amber banner "Your free trial ended on <date>. Your data is read-only — you can still view, export and print." Hidden for paid/complimentary. Re-evaluate every minute (interval) so a trial ending mid-session updates; when it flips to ended, invalidate the session query so `canWrite` updates.
Commit `feat(app): trial banner`.

### Task B7: Super-admin console

**Files:** `src/admin/AdminConsole.tsx` (replace stub, keep signature), `src/admin/api.ts` (typed `callAdmin(action, body)` using `supabase.functions.invoke('admin', …)` with the same error extraction as `callTeam`), `src/admin/FirmsTable.tsx`, `src/admin/CreateFirmDialog.tsx`, `src/admin/SupportView.tsx`, `src/admin/PlatformSettings.tsx`, `src/admin/Waitlist.tsx`.

Requirements: own shell (header "Platform admin", signed-in name, Sign out); sections via hash `#admin`, `#admin/support/<firmId>`, `#admin/settings`, `#admin/waitlist`.
- Firms table (reuse `src/table.tsx` column system if practical, else a plain accessible table): name, currency, source, status, billing (trial n days left / ended / paid date / complimentary), members, last activity, created; search; actions per row: Suspend/Reactivate (confirm), Extend trial +7/+14, Make complimentary, Open support view. Every action shows busy state and inline error; success refreshes the list.
- Create firm dialog: name, currency (MYR/SGD/USD), owner name, owner email, Start as (Complimentary · Trial). Explains "The owner gets an email to set their password (link valid 24 hours)."
- Support view (read-only, clearly labelled "Support view — read-only. Access is logged."): firm header; tabs Clients · Balances (period presets reuse `PeriodPicker` if decoupled from session — otherwise simple from/to date inputs) · Ledger; amounts via `makeMoney(firm.currency)`.
- Platform settings: firm cap, trial days, live "<n> of <cap> self-serve places used".
- Waitlist: table email, firm name, date; "Copy emails" button (clipboard, with confirmation).
- Loading/empty/error states; light/dark; 375px usable (tables scroll in their card).
Browser as `admin@platform.test`: list firms; create a complimentary firm with owner `newowner@admin.test` → Mailpit invite → set password → owner signs in to their firm; extend Beta trial; suspend then reactivate Alpha (verify Alpha owner sees suspended message while suspended); support view for Alpha shows Kopi Corner; settings cap change and restore to 5. Clean up the created firm + auth user.
Commit `feat: super-admin console`.

### Task B8: `/demo/` build

**Files:** Create `scripts/build-demo.sh`; modify `package.json` (`"build": "tsc -b && vite build && bash scripts/build-demo.sh"`, `"build:app": "tsc -b && vite build"`), `.gitignore` (`.demo-build/`).

`scripts/build-demo.sh`: `set -euo pipefail`; build tag `demo-local` in a temporary git worktree at `.demo-build` (`git worktree add --force --detach .demo-build demo-local`), install with the lockfile there (`pnpm install --frozen-lockfile` using the same pnpm), `vite build --base /demo/ --outDir ../dist/demo --emptyOutDir` (run from inside `.demo-build`), then `git worktree remove --force .demo-build` in a `trap` so it is always cleaned up. In the demo build, add a visible banner? Not possible without changing the tag — instead `scripts/build-demo.sh` injects `<div style="…">Demo — data stays in your browser. <a href="/app/">Sign in</a></div>` into `dist/demo/index.html` after `<body>` with `sed`. Fail with a clear message if the tag is missing.
Verify `pnpm build` → `dist/demo/index.html` exists; `npx vite preview --port 5300` serves `/demo/` with the banner and the old app working (localStorage). Commit `feat: build the browser-only demo at /demo/`.

### Task B9: Docs, verification, push

**Files:** `README.md`.
- Hosted deployment checklist: create Supabase project (Singapore) → `supabase link` → `supabase db push` → `supabase functions deploy team admin` → secrets `APP_URL` → Auth settings (from the Email/Resend section; Site URL `<app>/app/`, redirect URLs `<app>/app/**`) → create the super-admin: sign up normally? No — insert via SQL in the dashboard: create auth user via dashboard "Invite user", then `insert into profiles (user_id, firm_id, name, email, role, status, is_super_admin) values ('<uid>', null, '<name>', '<email>', 'viewer', 'active', true);` → Vercel project: framework Vite, build `pnpm build`, output `dist`, env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable key) → custom domain → smoke test list (homepage, sign-up, invite, admin console). Note: rate limiting of the public waitlist endpoint relies on Supabase/Vercel edge limits.
- Full verification (record outputs): `supabase db reset && supabase test db`, `deno test supabase/functions`, `pnpm test`, `pnpm test:db`, tsc, oxlint, `pnpm build`. Browser smoke: `/`, `/app/` sign-in, `/demo/` (via `vite preview` after build).
- Commit `docs: hosted deployment checklist` and push branch.

---

## Self-Review

- Spec coverage: §5 items 1 (B5), 2 (B4), 7 trial part (B6; Pay → Plan C), 8–10 (B3+B7), §2 entries (B1, B8), super-admin/support (B3, B7), §3 functions/tables (B2), §6 cap lock/verification/waitlist (B2, B4, B5), §7 tests (B2 pgTAP, B3 Deno, B4/B6 unit, browser in each), §8 (B9).
- Placeholder scan: the homepage contact email is an explicit constant to replace (documented), not a TBD.
- Type consistency: RPC names/signatures frozen in B2; `admin` action contract frozen in B3; `AdminConsole` props frozen in B4 and kept in B7; redirect `/app/?flow=set-password` used by B1, B3, B4.
- Spec amendment: waitlist rate limit is one-row-per-email + hosting edge limits (no IP tracking in Postgres).
