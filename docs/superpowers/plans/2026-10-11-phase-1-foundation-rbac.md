# Phase 1 — Foundation + RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running app where a user signs up, creates an org, invites members, and manages custom roles and permissions — every rule enforced by Postgres RLS.

**Architecture:** Vite + React SPA talking directly to Supabase with the anon key. All authorisation lives in SQL: `is_member()` and `has_permission()` (security definer) back every RLS policy; privileged writes go through `security definer` RPCs that enforce the guards and write `audit_log`. One Edge Function sends invites (needs the service role).

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, supabase-js 2, Supabase CLI (Postgres 17, pgTAP), Deno 2 for Edge Functions, `node --test` for unit tests, oxlint.

**Spec:** `docs/superpowers/specs/2026-10-11-reportnoreport-v2-design.md` (§3 Tenancy, §7 RBAC)

## Global Constraints

- Repo: `~/ntucsm/personal/reportnoreport-v2`, GitHub `delfrinandopranata`, branch `main` + feature branches.
- Every table carries `org_id`; every RLS policy checks membership and permission via `has_permission()`.
- Permissions are a fixed list in code: `forms.manage`, `workflows.manage`, `workflows.publish`, `records.view_all`, `records.start`, `reports.view`, `reports.manage`, `members.manage`, `roles.manage`, `comms.manage`, `comms.broadcast`.
- Seeded roles: Owner (all permissions, not editable or deletable), Admin, Member, Viewer (seeded, editable).
- The last Owner cannot be removed; nobody grants a permission they lack; every role, permission and membership change writes `audit_log`.
- Frontend loads the caller's permissions once per org switch, to hide controls only.
- The browser is never trusted for permissions.
- No code copied from employer repositories. Patterns from v1 (`~/ntucsm/platform-internal`, own repo) may be reused.
- British English in UI copy.
- `workflow_access` (§7) depends on `workflows` and ships in Phase 3, not here.

## Review Focus

1. **Owner demotes themselves while being the only Owner** → refused with "An organisation needs at least one Owner." (test in Task 4)
2. **Admin with `roles.manage` but not `members.manage` edits a role to add `members.manage`** → refused: you cannot grant what you lack. (Task 4)
3. **A user in org A reads org B's members/roles/audit by guessing ids** → zero rows. (Task 3)
4. **Invite sent twice to the same email** → second call returns the existing pending member, no duplicate row. (Task 5)
5. **Removed member keeps a stale session and calls an RPC** → `has_permission` is false; RPC raises 42501. (Task 4)

---

## File Structure

```
package.json, vite.config.ts, tsconfig*.json, index.html, .env.example, .oxlintrc.json
.github/workflows/ci.yml
supabase/config.toml
supabase/migrations/20261012000001_tenancy.sql        orgs, members, roles, permissions, role_permissions, member_roles, audit_log
supabase/migrations/20261012000002_access.sql         is_member, has_permission, my_permissions, RLS policies
supabase/migrations/20261012000003_rbac_rpcs.sql      create_org, save_role, delete_role, set_member_roles, remove_member, accept_invite
supabase/functions/invite-member/index.ts             invite Edge Function
supabase/functions/invite-member/validate.ts          pure request validation
supabase/functions/invite-member/validate.test.ts
supabase/seed.sql
supabase/tests/01_schema.test.sql
supabase/tests/02_isolation.test.sql
supabase/tests/03_rbac_guards.test.sql
src/main.tsx, src/App.tsx, src/index.css
src/data/supabase.ts          client + readEnv
src/data/supabase.test.ts
src/rbac/permissions.ts       PERMISSIONS, groups, can()
src/rbac/permissions.test.ts
src/rbac/useOrg.tsx           current org + permission set (context)
src/auth/AuthPage.tsx
src/orgs/CreateOrgPage.tsx
src/orgs/OrgSwitcher.tsx
src/members/MembersPage.tsx
src/roles/RolesPage.tsx
src/roles/RoleEditor.tsx
README.md
```

---

### Task 1: Scaffold, env guard, CI

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `index.html`, `.env.example`, `.gitignore`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/data/supabase.ts`, `.github/workflows/ci.yml`
- Test: `src/data/readEnv.test.ts`

**Interfaces:**
- Produces: `readEnv(env): { url: string; anonKey: string }`, `supabase` client export from `src/data/supabase.ts`.

- [ ] **Step 1: Scaffold**

```bash
cd ~/ntucsm/personal/reportnoreport-v2
pnpm create vite@latest . --template react-ts   # accept "ignore existing files"
pnpm add @supabase/supabase-js @tanstack/react-query
pnpm add -D tailwindcss @tailwindcss/vite oxlint @types/node
supabase init
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({ plugins: [react(), tailwindcss()] })
```

`src/index.css`:
```css
@import "tailwindcss";
```

`package.json` scripts:
```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "oxlint src",
  "test": "node --test 'src/**/*.test.ts'",
  "db:types": "supabase gen types typescript --local > src/data/database.types.ts"
}
```
Add `"engines": { "node": ">=24" }` (node 24 runs `.ts` tests natively). Set `"allowImportingTsExtensions": true` and `"noEmit": true` in `tsconfig.app.json`.

`.env.example`:
```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=paste-anon-key-from-supabase-status
```
Append `.env.local` and `supabase/.temp` to `.gitignore`.

- [ ] **Step 2: Write the failing test** — `src/data/readEnv.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readEnv } from './readEnv.ts'

const jwt = (role: string) => `x.${btoa(JSON.stringify({ role }))}.y`

test('returns url and key', () => {
  assert.deepEqual(readEnv({ VITE_SUPABASE_URL: 'http://a', VITE_SUPABASE_ANON_KEY: jwt('anon') }),
    { url: 'http://a', anonKey: jwt('anon') })
})
test('names missing variables', () => {
  assert.throws(() => readEnv({}), /VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY/)
})
test('refuses a service-role key', () => {
  assert.throws(() => readEnv({ VITE_SUPABASE_URL: 'u', VITE_SUPABASE_ANON_KEY: jwt('service_role') }), /Refusing/)
  assert.throws(() => readEnv({ VITE_SUPABASE_URL: 'u', VITE_SUPABASE_ANON_KEY: 'sb_secret_abc' }), /Refusing/)
})
```

- [ ] **Step 3: Run — expect FAIL** (`Cannot find module './readEnv.ts'`)

Run: `pnpm test`

- [ ] **Step 4: Implement** — `src/data/readEnv.ts` (pure, so the test does not import supabase-js / `import.meta.env`)

```ts
type Env = Partial<Record<'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY', string>>
const REFUSAL = 'Refusing to start: a service-role/secret key was put in VITE_SUPABASE_ANON_KEY'

/** Fails loudly at startup instead of with silent 401s. */
export function readEnv(env: Env): { url: string; anonKey: string } {
  const missing = (['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const).filter((k) => !env[k])
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`)
  const anonKey = env.VITE_SUPABASE_ANON_KEY!
  if (anonKey.startsWith('sb_secret_')) throw new Error(REFUSAL)
  const payload = anonKey.split('.')[1]
  if (payload) {
    let claims: { role?: string }
    try { claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) }
    catch { throw new Error('VITE_SUPABASE_ANON_KEY is not a valid Supabase key') }
    if (claims.role === 'service_role') throw new Error(REFUSAL)
  }
  return { url: env.VITE_SUPABASE_URL!, anonKey }
}
```

`src/data/supabase.ts`:
```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { readEnv } from './readEnv.ts'

const { url, anonKey } = readEnv(import.meta.env)
export const supabase = createClient<Database>(url, anonKey)
```
Create a placeholder `src/data/database.types.ts` containing `export type Database = any` — Task 3 regenerates it.

- [ ] **Step 5: Run — expect PASS** (`pnpm test`, 3 passing)

- [ ] **Step 6: CI** — `.github/workflows/ci.yml`

```yaml
name: CI
on: { pull_request: {}, push: { branches: [main] } }
permissions: { contents: read }
jobs:
  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
        env: { VITE_SUPABASE_URL: http://127.0.0.1:54321, VITE_SUPABASE_ANON_KEY: ci.e30.ci }
  edge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with: { deno-version: v2.x }
      - run: deno test supabase/functions
  db:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: supabase db start
      - run: supabase test db
```

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml vite.config.ts tsconfig*.json index.html .env.example .gitignore src supabase/config.toml .github
git commit -m "chore: scaffold app, env guard and CI"
```

---

### Task 2: Tenancy + RBAC schema

**Files:**
- Create: `supabase/migrations/20261012000001_tenancy.sql`
- Test: `supabase/tests/01_schema.test.sql`

**Interfaces:**
- Produces tables: `orgs(id, name, created_at)`, `members(id, org_id, user_id?, email, full_name?, status 'invited'|'active', invited_by?, created_at)`, `permissions(key, grp, label)`, `roles(id, org_id, name, is_system, is_owner)`, `role_permissions(role_id, permission)`, `member_roles(member_id, role_id)`, `audit_log(id, org_id, actor_id, action, target, before, after, created_at)`.

- [ ] **Step 1: Write the failing test** — `supabase/tests/01_schema.test.sql`

```sql
begin;
select plan(12);
select has_table('orgs');
select has_table('members');
select has_table('permissions');
select has_table('roles');
select has_table('role_permissions');
select has_table('member_roles');
select has_table('audit_log');
select results_eq('select count(*)::int from permissions', array[11], 'eleven permissions seeded');
select col_is_fk('members', 'org_id');
select col_is_fk('role_permissions', 'permission');
select throws_ok($$ insert into members (org_id, email) values (gen_random_uuid(), 'X@a.test') $$, '23503', null, 'member needs an org');
select ok((select relrowsecurity from pg_class where relname = 'roles'), 'RLS on roles');
select * from finish();
rollback;
```

- [ ] **Step 2: Run — expect FAIL**

Run: `supabase start && supabase test db`
Expected: `01_schema ... Failed` (`relation "orgs" does not exist`)

- [ ] **Step 3: Implement** — `supabase/migrations/20261012000001_tenancy.sql`

```sql
create extension if not exists citext;

create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create type member_status as enum ('invited', 'active');

create table members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email citext not null,
  full_name text,
  status member_status not null default 'invited',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, email),
  unique (org_id, user_id)
);
create index members_user_id_idx on members(user_id);

-- Fixed list; the app mirrors it in src/rbac/permissions.ts.
create table permissions (
  key text primary key,
  grp text not null,
  label text not null
);
insert into permissions (key, grp, label) values
  ('forms.manage',      'Forms',     'Create and edit forms'),
  ('workflows.manage',  'Workflows', 'Create and edit workflows'),
  ('workflows.publish', 'Workflows', 'Publish workflows'),
  ('records.view_all',  'Records',   'View all records'),
  ('records.start',     'Records',   'Start records'),
  ('reports.view',      'Reports',   'View reports'),
  ('reports.manage',    'Reports',   'Create and edit reports'),
  ('comms.manage',      'Comms',     'Manage message templates'),
  ('comms.broadcast',   'Comms',     'Send campaigns'),
  ('members.manage',    'Admin',     'Invite and manage members'),
  ('roles.manage',      'Admin',     'Manage roles and permissions');

create table roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  is_system boolean not null default false,
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);
create unique index roles_one_owner_per_org on roles(org_id) where is_owner;

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission text not null references permissions(key),
  primary key (role_id, permission)
);

create table member_roles (
  member_id uuid not null references members(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  primary key (member_id, role_id)
);
create index member_roles_role_id_idx on member_roles(role_id);

create table audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_org_created_idx on audit_log(org_id, created_at desc);

alter table orgs enable row level security;
alter table members enable row level security;
alter table permissions enable row level security;
alter table roles enable row level security;
alter table role_permissions enable row level security;
alter table member_roles enable row level security;
alter table audit_log enable row level security;
```

- [ ] **Step 4: Run — expect PASS**

Run: `supabase db reset && supabase test db`
Expected: `01_schema ... ok`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261012000001_tenancy.sql supabase/tests/01_schema.test.sql
git commit -m "feat: add tenancy and RBAC schema"
```

---

### Task 3: Access helpers, RLS policies, seed, isolation tests

**Files:**
- Create: `supabase/migrations/20261012000002_access.sql`, `supabase/seed.sql`
- Test: `supabase/tests/02_isolation.test.sql`

**Interfaces:**
- Consumes: Task 2 tables.
- Produces SQL: `is_member(p_org uuid) → boolean`, `has_permission(p_org uuid, p_perm text) → boolean`, `my_permissions(p_org uuid) → setof text`, `current_member_id(p_org uuid) → uuid`.
- Seed users (password `password123`): `owner@alpha.test` (…a1, Owner), `admin@alpha.test` (…a2, Admin), `member@alpha.test` (…a3, Member), `viewer@alpha.test` (…a4, Viewer), `owner@beta.test` (…b1, Owner of Beta). Org ids: Alpha `0000000a-0000-0000-0000-000000000001`, Beta `0000000b-0000-0000-0000-000000000001`.

- [ ] **Step 1: Write the seed** — `supabase/seed.sql`

```sql
-- Users
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', id::uuid, 'authenticated', 'authenticated', email,
       crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''
from (values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@alpha.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@alpha.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'member@alpha.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'viewer@alpha.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner@beta.test')
) u(id, email);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
select gen_random_uuid(), id, id::text, json_build_object('sub', id::text, 'email', email), 'email', now(), now(), now()
from auth.users;

-- Orgs are created through the RPC so seeding exercises the real path.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select create_org('Alpha School', '0000000a-0000-0000-0000-000000000001');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
select create_org('Beta HR', '0000000b-0000-0000-0000-000000000001');

-- Alpha members with one system role each.
insert into members (org_id, user_id, email, status)
values ('0000000a-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'admin@alpha.test', 'active'),
       ('0000000a-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'member@alpha.test', 'active'),
       ('0000000a-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4', 'viewer@alpha.test', 'active');
insert into member_roles (member_id, role_id)
select m.id, r.id from members m join roles r on r.org_id = m.org_id
where m.org_id = '0000000a-0000-0000-0000-000000000001'
  and (m.email, r.name) in (('admin@alpha.test','Admin'), ('member@alpha.test','Member'), ('viewer@alpha.test','Viewer'));
```

`create_org` is defined in Task 4. Until then, keep the two `create_org` lines and everything after them commented out with `--`; Task 4 Step 4 uncomments them.

- [ ] **Step 2: Write the failing test** — `supabase/tests/02_isolation.test.sql`

The isolation test needs orgs, so in this task it inserts its own fixture directly as `postgres` (bypassing RLS):

```sql
begin;
select plan(9);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- Fixture: org A with u1 holding a role that has reports.view; org B with u2.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000f001', 'u1@a.test'), ('00000000-0000-0000-0000-00000000f002', 'u2@b.test');
insert into orgs (id, name) values ('00000000-0000-0000-0000-00000000fa00', 'A'), ('00000000-0000-0000-0000-00000000fb00', 'B');
insert into members (id, org_id, user_id, email, status) values
  ('00000000-0000-0000-0000-00000000fa01', '00000000-0000-0000-0000-00000000fa00', '00000000-0000-0000-0000-00000000f001', 'u1@a.test', 'active'),
  ('00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fb00', '00000000-0000-0000-0000-00000000f002', 'u2@b.test', 'active');
insert into roles (id, org_id, name) values ('00000000-0000-0000-0000-00000000fa10', '00000000-0000-0000-0000-00000000fa00', 'Reader');
insert into role_permissions values ('00000000-0000-0000-0000-00000000fa10', 'reports.view');
insert into member_roles values ('00000000-0000-0000-0000-00000000fa01', '00000000-0000-0000-0000-00000000fa10');
insert into audit_log (org_id, action, target) values ('00000000-0000-0000-0000-00000000fb00', 'x', 'y');

select pg_temp.act_as('00000000-0000-0000-0000-00000000f001');
select ok(is_member('00000000-0000-0000-0000-00000000fa00'), 'u1 is a member of A');
select ok(not is_member('00000000-0000-0000-0000-00000000fb00'), 'u1 is not a member of B');
select ok(has_permission('00000000-0000-0000-0000-00000000fa00', 'reports.view'), 'u1 has reports.view in A');
select ok(not has_permission('00000000-0000-0000-0000-00000000fa00', 'roles.manage'), 'u1 lacks roles.manage');
select results_eq($$ select * from my_permissions('00000000-0000-0000-0000-00000000fa00') $$, array['reports.view'], 'my_permissions lists held keys');
select is_empty($$ select id from orgs where id = '00000000-0000-0000-0000-00000000fb00' $$, 'cannot see org B');
select is_empty($$ select id from members where org_id = '00000000-0000-0000-0000-00000000fb00' $$, 'cannot see B members');
select is_empty($$ select id from audit_log where org_id = '00000000-0000-0000-0000-00000000fb00' $$, 'cannot see B audit log');
select is_empty($$ select id from audit_log where org_id = '00000000-0000-0000-0000-00000000fa00' $$, 'audit log needs roles.manage or members.manage');

select * from finish();
rollback;
```

- [ ] **Step 3: Run — expect FAIL** (`function is_member(uuid) does not exist`)

Run: `supabase db reset && supabase test db`

- [ ] **Step 4: Implement** — `supabase/migrations/20261012000002_access.sql`

```sql
-- SECURITY DEFINER so policies can read members/roles without recursing into their own RLS.
create or replace function current_member_id(p_org uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from members where org_id = p_org and user_id = auth.uid() and status = 'active'
$$;

create or replace function is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select current_member_id(p_org) is not null
$$;

create or replace function my_permissions(p_org uuid) returns setof text
language sql stable security definer set search_path = public as $$
  select p.key from permissions p
  where exists (
    select 1 from member_roles mr join roles r on r.id = mr.role_id
    left join role_permissions rp on rp.role_id = r.id
    where mr.member_id = current_member_id(p_org)
      and (r.is_owner or rp.permission = p.key)
  )
  order by p.key
$$;

create or replace function has_permission(p_org uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from my_permissions(p_org) k where k = p_perm)
$$;

-- Read: every member sees their org, its members, roles and grants.
create policy orgs_read on orgs for select using (is_member(id));
create policy members_read on members for select using (is_member(org_id) or user_id = auth.uid());
create policy permissions_read on permissions for select using (auth.role() = 'authenticated');
create policy roles_read on roles for select using (is_member(org_id));
create policy role_permissions_read on role_permissions for select
  using (exists (select 1 from roles r where r.id = role_id and is_member(r.org_id)));
create policy member_roles_read on member_roles for select
  using (exists (select 1 from members m where m.id = member_id and is_member(m.org_id)));
create policy audit_read on audit_log for select
  using (has_permission(org_id, 'roles.manage') or has_permission(org_id, 'members.manage'));

-- Org rename by Owners/admins holding roles.manage.
create policy orgs_update on orgs for update
  using (has_permission(id, 'roles.manage')) with check (has_permission(id, 'roles.manage'));

-- No insert/update/delete policies on members, roles, role_permissions, member_roles, audit_log:
-- all writes go through the RPCs in 20261012000003_rbac_rpcs.sql, which enforce the guards.
```

- [ ] **Step 5: Run — expect PASS**

Run: `supabase db reset && supabase test db`
Expected: `01_schema ok`, `02_isolation ok`

- [ ] **Step 6: Regenerate types and commit**

```bash
pnpm db:types
git add supabase/migrations/20261012000002_access.sql supabase/seed.sql supabase/tests/02_isolation.test.sql src/data/database.types.ts
git commit -m "feat: add has_permission and org-isolated RLS"
```

---

### Task 4: RBAC RPCs with guards and audit

**Files:**
- Create: `supabase/migrations/20261012000003_rbac_rpcs.sql`
- Modify: `supabase/seed.sql` (uncomment `create_org` block)
- Test: `supabase/tests/03_rbac_guards.test.sql`

**Interfaces:**
- Consumes: `has_permission`, `current_member_id`, `my_permissions` (Task 3).
- Produces RPCs (all `security definer`, raise `42501` on denial, `P0001` with a user-facing message on guard failure):
  - `create_org(p_name text, p_id uuid default gen_random_uuid()) → uuid` — caller becomes active member with Owner; seeds Owner/Admin/Member/Viewer.
  - `save_role(p_org uuid, p_role_id uuid, p_name text, p_permissions text[]) → uuid` — `p_role_id null` creates.
  - `delete_role(p_role_id uuid) → void`
  - `set_member_roles(p_member_id uuid, p_role_ids uuid[]) → void`
  - `remove_member(p_member_id uuid) → void`
  - `accept_invites() → int` — links invited rows matching the caller's email to `auth.uid()`, sets active; returns count.
  - internal `audit(p_org uuid, p_action text, p_target text, p_before jsonb, p_after jsonb)`.

Seeded role permissions:
- Admin: every permission.
- Member: `records.start`, `reports.view`.
- Viewer: `reports.view`.

- [ ] **Step 1: Write the failing test** — `supabase/tests/03_rbac_guards.test.sql` (runs against `seed.sql`)

```sql
begin;
select plan(14);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

\set alpha '''0000000a-0000-0000-0000-000000000001'''

-- create_org seeds four roles and makes the caller Owner
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select lives_ok($$ select create_org('Member Own Org') $$, 'any user can create an org');
select results_eq($$ select count(*)::int from roles r join orgs o on o.id = r.org_id where o.name = 'Member Own Org' $$, array[4], 'four roles seeded');

-- Member cannot manage roles
select throws_ok(format($$ select save_role(%s, null, 'Hacker', array['roles.manage']) $$, :alpha), '42501', null, 'member cannot create roles');

-- Admin can create a role with permissions it holds
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select lives_ok(format($$ select save_role(%s, null, 'Counsellor', array['records.start','reports.view']) $$, :alpha), 'admin creates role');
select isnt_empty($$ select 1 from audit_log where action = 'role.create' and after->>'name' = 'Counsellor' $$, 'role create audited');

-- Owner role is immutable
select throws_ok(format($$ select save_role(%s, (select id from roles where org_id = %s and is_owner), 'Boss', array[]::text[]) $$, :alpha, :alpha),
  'P0001', 'The Owner role cannot be changed.', 'owner role immutable');
select throws_ok(format($$ select delete_role((select id from roles where org_id = %s and is_owner)) $$, :alpha),
  'P0001', 'The Owner role cannot be deleted.', 'owner role undeletable');

-- Cannot grant what you lack: make a role-manager without members.manage
reset role;
insert into roles (id, org_id, name) values ('0000000a-0000-0000-0000-00000000aa01', :alpha, 'RoleMgr');
insert into role_permissions values ('0000000a-0000-0000-0000-00000000aa01', 'roles.manage');
delete from member_roles where member_id = (select id from members where email = 'viewer@alpha.test');
insert into member_roles select id, '0000000a-0000-0000-0000-00000000aa01' from members where email = 'viewer@alpha.test';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select throws_ok(format($$ select save_role(%s, null, 'Escalate', array['members.manage']) $$, :alpha),
  'P0001', 'You cannot grant permissions you do not hold: members.manage', 'no escalation via save_role');

-- Last Owner guard
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select set_member_roles((select id from members where email = 'owner@alpha.test'), array[]::uuid[]) $$,
  'P0001', 'An organisation needs at least one Owner.', 'last owner cannot drop Owner');
select throws_ok($$ select remove_member((select id from members where email = 'owner@alpha.test')) $$,
  'P0001', 'An organisation needs at least one Owner.', 'last owner cannot be removed');

-- Only an Owner can assign the Owner role
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok(format($$ select set_member_roles((select id from members where email = 'member@alpha.test'), array[(select id from roles where org_id = %s and is_owner)]) $$, :alpha),
  'P0001', 'Only an Owner can assign the Owner role.', 'admin cannot make owners');

-- Removed member loses access immediately
select lives_ok($$ select remove_member((select id from members where email = 'member@alpha.test')) $$, 'admin removes member');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select ok(not has_permission(:alpha, 'records.start'), 'removed member has no permissions');
select throws_ok(format($$ select save_role(%s, null, 'X', array[]::text[]) $$, :alpha), '42501', null, 'removed member blocked from RPCs');

select * from finish();
rollback;
```

- [ ] **Step 2: Run — expect FAIL** (`function create_org(unknown) does not exist`)

Run: `supabase db reset && supabase test db`

- [ ] **Step 3: Implement** — `supabase/migrations/20261012000003_rbac_rpcs.sql`

```sql
create or replace function audit(p_org uuid, p_action text, p_target text, p_before jsonb, p_after jsonb)
returns void language sql security definer set search_path = public as $$
  insert into audit_log (org_id, actor_id, action, target, before, after)
  values (p_org, auth.uid(), p_action, p_target, p_before, p_after)
$$;
revoke execute on function audit(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;

create or replace function require_permission(p_org uuid, p_perm text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission(p_org, p_perm) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
end $$;

create or replace function owner_count(p_org uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(distinct mr.member_id)::int
  from member_roles mr join roles r on r.id = mr.role_id join members m on m.id = mr.member_id
  where r.org_id = p_org and r.is_owner and m.status = 'active'
$$;

create or replace function create_org(p_name text, p_id uuid default gen_random_uuid()) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_member uuid;
  v_owner uuid;
  v_role uuid;
  v_email text := (select email from auth.users where id = auth.uid());
begin
  if auth.uid() is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  insert into orgs (id, name) values (p_id, trim(p_name));
  insert into members (org_id, user_id, email, status) values (p_id, auth.uid(), v_email, 'active') returning id into v_member;
  insert into roles (org_id, name, is_system, is_owner) values (p_id, 'Owner', true, true) returning id into v_owner;
  insert into member_roles values (v_member, v_owner);

  insert into roles (org_id, name, is_system) values (p_id, 'Admin', true) returning id into v_role;
  insert into role_permissions select v_role, key from permissions;
  insert into roles (org_id, name, is_system) values (p_id, 'Member', true) returning id into v_role;
  insert into role_permissions values (v_role, 'records.start'), (v_role, 'reports.view');
  insert into roles (org_id, name, is_system) values (p_id, 'Viewer', true) returning id into v_role;
  insert into role_permissions values (v_role, 'reports.view');

  perform audit(p_id, 'org.create', p_id::text, null, jsonb_build_object('name', trim(p_name)));
  return p_id;
end $$;

create or replace function save_role(p_org uuid, p_role_id uuid, p_name text, p_permissions text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := p_role_id;
  v_before jsonb;
  v_lacking text;
begin
  perform require_permission(p_org, 'roles.manage');
  if exists (select 1 from roles where id = p_role_id and is_owner) then
    raise exception 'The Owner role cannot be changed.';
  end if;
  if p_role_id is not null and not exists (select 1 from roles where id = p_role_id and org_id = p_org) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select string_agg(p, ', ' order by p) into v_lacking
  from unnest(p_permissions) p
  where not has_permission(p_org, p);
  if v_lacking is not null then
    raise exception 'You cannot grant permissions you do not hold: %', v_lacking;
  end if;

  if v_id is null then
    insert into roles (org_id, name) values (p_org, trim(p_name)) returning id into v_id;
  else
    select jsonb_build_object('name', r.name, 'permissions', coalesce(array_agg(rp.permission order by rp.permission) filter (where rp.permission is not null), '{}'))
      into v_before from roles r left join role_permissions rp on rp.role_id = r.id where r.id = v_id group by r.name;
    update roles set name = trim(p_name) where id = v_id;
    delete from role_permissions where role_id = v_id;
  end if;
  insert into role_permissions select v_id, p from unnest(p_permissions) p on conflict do nothing;

  perform audit(p_org, case when p_role_id is null then 'role.create' else 'role.update' end, v_id::text, v_before,
    jsonb_build_object('name', trim(p_name), 'permissions', (select coalesce(array_agg(p order by p), '{}') from unnest(p_permissions) p)));
  return v_id;
end $$;

create or replace function delete_role(p_role_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_role roles;
begin
  select * into v_role from roles where id = p_role_id;
  if v_role.id is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  perform require_permission(v_role.org_id, 'roles.manage');
  if v_role.is_owner then raise exception 'The Owner role cannot be deleted.'; end if;
  delete from roles where id = p_role_id;
  perform audit(v_role.org_id, 'role.delete', p_role_id::text, jsonb_build_object('name', v_role.name), null);
end $$;

create or replace function set_member_roles(p_member_id uuid, p_role_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := (select org_id from members where id = p_member_id);
  v_owner uuid;
  v_had_owner boolean;
  v_gets_owner boolean;
  v_before uuid[];
begin
  if v_org is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  perform require_permission(v_org, 'members.manage');
  if exists (select 1 from unnest(p_role_ids) r where r not in (select id from roles where org_id = v_org)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select id into v_owner from roles where org_id = v_org and is_owner;
  select array_agg(role_id order by role_id) into v_before from member_roles where member_id = p_member_id;
  v_had_owner := v_owner = any(coalesce(v_before, '{}'));
  v_gets_owner := v_owner = any(p_role_ids);

  if v_had_owner <> v_gets_owner and not exists (
    select 1 from member_roles where member_id = current_member_id(v_org) and role_id = v_owner) then
    raise exception 'Only an Owner can assign the Owner role.';
  end if;
  if v_had_owner and not v_gets_owner and owner_count(v_org) <= 1 then
    raise exception 'An organisation needs at least one Owner.';
  end if;
  -- Granting a role grants its permissions: same no-escalation rule as save_role.
  if exists (
    select 1 from role_permissions rp where rp.role_id = any(p_role_ids) and not has_permission(v_org, rp.permission)) then
    raise exception 'You cannot assign a role with permissions you do not hold.';
  end if;

  delete from member_roles where member_id = p_member_id;
  insert into member_roles select p_member_id, r from unnest(p_role_ids) r on conflict do nothing;
  perform audit(v_org, 'member.roles', p_member_id::text, to_jsonb(v_before), to_jsonb(p_role_ids));
end $$;

create or replace function remove_member(p_member_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_m members;
begin
  select * into v_m from members where id = p_member_id;
  if v_m.id is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  perform require_permission(v_m.org_id, 'members.manage');
  if exists (select 1 from member_roles mr join roles r on r.id = mr.role_id where mr.member_id = p_member_id and r.is_owner)
     and owner_count(v_m.org_id) <= 1 then
    raise exception 'An organisation needs at least one Owner.';
  end if;
  delete from members where id = p_member_id;
  perform audit(v_m.org_id, 'member.remove', p_member_id::text, jsonb_build_object('email', v_m.email), null);
end $$;

create or replace function accept_invites() returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if auth.uid() is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  update members set user_id = auth.uid(), status = 'active'
  where status = 'invited' and email = (select email from auth.users where id = auth.uid());
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function require_permission(uuid, text), owner_count(uuid) from public, anon;
```

- [ ] **Step 4: Uncomment the `create_org` block in `supabase/seed.sql`**

- [ ] **Step 5: Run — expect PASS**

Run: `supabase db reset && supabase test db`
Expected: `01_schema ok`, `02_isolation ok`, `03_rbac_guards ok`

- [ ] **Step 6: Regenerate types and commit**

```bash
pnpm db:types
git add supabase/migrations/20261012000003_rbac_rpcs.sql supabase/seed.sql supabase/tests/03_rbac_guards.test.sql src/data/database.types.ts
git commit -m "feat: add RBAC RPCs with owner and escalation guards"
```

---

### Task 5: Invite Edge Function

**Files:**
- Create: `supabase/functions/invite-member/validate.ts`, `supabase/functions/invite-member/index.ts`
- Test: `supabase/functions/invite-member/validate.test.ts`

**Interfaces:**
- Consumes: `has_permission`, `members`, `member_roles`, `audit` (Tasks 3–4).
- Produces: `POST /functions/v1/invite-member` body `{ orgId: string, email: string, roleIds: string[] }` → `200 { memberId, status: 'invited' | 'existing' }`, `400 { error }`, `403 { error }`.
- `validateInvite(body: unknown): { ok: true, value: { orgId, email, roleIds } } | { ok: false, error: string }`.

- [ ] **Step 1: Write the failing test** — `validate.test.ts`

```ts
import { assertEquals } from 'jsr:@std/assert@1'
import { validateInvite } from './validate.ts'

const org = '0000000a-0000-0000-0000-000000000001'

Deno.test('accepts and normalises a valid invite', () => {
  assertEquals(validateInvite({ orgId: org, email: '  Jo@School.test ', roleIds: [] }),
    { ok: true, value: { orgId: org, email: 'jo@school.test', roleIds: [] } })
})
Deno.test('rejects a bad email', () => {
  assertEquals(validateInvite({ orgId: org, email: 'nope', roleIds: [] }), { ok: false, error: 'Enter a valid email address.' })
})
Deno.test('rejects a non-uuid org or role', () => {
  assertEquals(validateInvite({ orgId: 'x', email: 'a@b.test', roleIds: [] }).ok, false)
  assertEquals(validateInvite({ orgId: org, email: 'a@b.test', roleIds: ['x'] }).ok, false)
})
Deno.test('rejects a non-object body', () => {
  assertEquals(validateInvite(null).ok, false)
})
```

- [ ] **Step 2: Run — expect FAIL** (`Module not found "validate.ts"`)

Run: `deno test supabase/functions`

- [ ] **Step 3: Implement** — `validate.ts`

```ts
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type Invite = { orgId: string; email: string; roleIds: string[] }

export function validateInvite(body: unknown): { ok: true; value: Invite } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request.' }
  const { orgId, email, roleIds } = body as Record<string, unknown>
  if (typeof orgId !== 'string' || !UUID.test(orgId)) return { ok: false, error: 'Invalid organisation.' }
  if (typeof email !== 'string' || !EMAIL.test(email.trim())) return { ok: false, error: 'Enter a valid email address.' }
  if (!Array.isArray(roleIds) || roleIds.some((r) => typeof r !== 'string' || !UUID.test(r))) return { ok: false, error: 'Invalid roles.' }
  return { ok: true, value: { orgId, email: email.trim().toLowerCase(), roleIds: roleIds as string[] } }
}
```

`index.ts`:
```ts
import { createClient } from 'npm:@supabase/supabase-js@2'
import { validateInvite } from './validate.ts'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } })
  const parsed = validateInvite(await req.json().catch(() => null))
  if (!parsed.ok) return json(400, { error: parsed.error })
  const { orgId, email, roleIds } = parsed.value

  const url = Deno.env.get('SUPABASE_URL')!
  // Caller-scoped client: permission checks run as the caller, under RLS.
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: allowed, error: permError } = await asCaller.rpc('has_permission', { p_org: orgId, p_perm: 'members.manage' })
  if (permError || !allowed) return json(403, { error: 'You do not have permission to invite members.' })

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: existing } = await admin.from('members').select('id').eq('org_id', orgId).eq('email', email).maybeSingle()
  if (existing) return json(200, { memberId: existing.id, status: 'existing' })

  const { data: { user: caller } } = await asCaller.auth.getUser()
  const { data: member, error: insertError } = await admin.from('members')
    .insert({ org_id: orgId, email, status: 'invited', invited_by: caller?.id }).select('id').single()
  if (insertError) return json(500, { error: 'Could not create the invite.' })

  // Role assignment reuses the RPC so the Owner / no-escalation guards apply to invites too.
  const { error: rolesError } = await asCaller.rpc('set_member_roles', { p_member_id: member.id, p_role_ids: roleIds })
  if (rolesError) {
    await admin.from('members').delete().eq('id', member.id)
    return json(403, { error: rolesError.message })
  }

  const { error: mailError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${req.headers.get('origin') ?? ''}/` })
  // An existing auth user cannot be re-invited; they accept on next sign-in via accept_invites().
  if (mailError && !/already been registered/i.test(mailError.message)) {
    await admin.from('members').delete().eq('id', member.id)
    return json(500, { error: 'Could not send the invite email.' })
  }
  await admin.from('audit_log').insert({ org_id: orgId, actor_id: caller?.id, action: 'member.invite', target: member.id, after: { email, roleIds } })
  return json(200, { memberId: member.id, status: 'invited' })
})
```

- [ ] **Step 4: Run — expect PASS** (`deno test supabase/functions`, 4 passing)

- [ ] **Step 5: Manual duplicate-invite check** (Review Focus #4)

```bash
supabase functions serve invite-member &
TOKEN=$(curl -s -X POST 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' -H "apikey: $ANON" -H 'Content-Type: application/json' -d '{"email":"owner@alpha.test","password":"password123"}' | jq -r .access_token)
for i in 1 2; do curl -s -X POST http://127.0.0.1:54321/functions/v1/invite-member -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"orgId":"0000000a-0000-0000-0000-000000000001","email":"new@alpha.test","roleIds":[]}'; echo; done
```
Expected: first `"status":"invited"`, second `"status":"existing"` with the same `memberId`. The invite email shows in Mailpit at http://127.0.0.1:54324.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/invite-member
git commit -m "feat: add invite-member Edge Function"
```

---

### Task 6: Frontend permissions model

**Files:**
- Create: `src/rbac/permissions.ts`, `src/rbac/useOrg.tsx`
- Test: `src/rbac/permissions.test.ts`

**Interfaces:**
- Produces:
  - `PERMISSIONS: readonly Permission[]` (the 11 keys), `type Permission`
  - `PERMISSION_GROUPS: { group: string; items: { key: Permission; label: string }[] }[]`
  - `can(held: ReadonlySet<string>, perm: Permission): boolean`
  - `<OrgProvider>` and `useOrg(): { orgs: { id: string; name: string }[]; orgId: string | null; setOrgId(id: string): void; permissions: ReadonlySet<string>; can(perm: Permission): boolean; loading: boolean }`

- [ ] **Step 1: Write the failing test** — `src/rbac/permissions.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PERMISSIONS, PERMISSION_GROUPS, can } from './permissions.ts'

test('eleven permissions, matching the database seed', () => {
  assert.equal(PERMISSIONS.length, 11)
})
test('every permission appears in exactly one group', () => {
  const grouped = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key)).sort()
  assert.deepEqual(grouped, [...PERMISSIONS].sort())
})
test('can checks membership of the held set', () => {
  const held = new Set(['reports.view'])
  assert.equal(can(held, 'reports.view'), true)
  assert.equal(can(held, 'roles.manage'), false)
})
```

- [ ] **Step 2: Run — expect FAIL** (`pnpm test`, module not found)

- [ ] **Step 3: Implement** — `src/rbac/permissions.ts`

```ts
export const PERMISSION_GROUPS = [
  { group: 'Forms', items: [{ key: 'forms.manage', label: 'Create and edit forms' }] },
  { group: 'Workflows', items: [
    { key: 'workflows.manage', label: 'Create and edit workflows' },
    { key: 'workflows.publish', label: 'Publish workflows' },
  ] },
  { group: 'Records', items: [
    { key: 'records.view_all', label: 'View all records' },
    { key: 'records.start', label: 'Start records' },
  ] },
  { group: 'Reports', items: [
    { key: 'reports.view', label: 'View reports' },
    { key: 'reports.manage', label: 'Create and edit reports' },
  ] },
  { group: 'Comms', items: [
    { key: 'comms.manage', label: 'Manage message templates' },
    { key: 'comms.broadcast', label: 'Send campaigns' },
  ] },
  { group: 'Admin', items: [
    { key: 'members.manage', label: 'Invite and manage members' },
    { key: 'roles.manage', label: 'Manage roles and permissions' },
  ] },
] as const

export type Permission = (typeof PERMISSION_GROUPS)[number]['items'][number]['key']
export const PERMISSIONS: readonly Permission[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key))

/** UI hint only — the database decides. */
export const can = (held: ReadonlySet<string>, perm: Permission) => held.has(perm)
```

`src/rbac/useOrg.tsx`:
```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../data/supabase'
import { can as canHold, type Permission } from './permissions'

const KEY = 'rnr.orgId'
type Org = { id: string; name: string }
type Ctx = { orgs: Org[]; orgId: string | null; setOrgId(id: string): void; permissions: ReadonlySet<string>; can(p: Permission): boolean; loading: boolean }
const OrgContext = createContext<Ctx | null>(null)

const readStored = () => { try { return localStorage.getItem(KEY) } catch { return null } }

export function OrgProvider({ children }: { children: ReactNode }) {
  const [orgId, setOrgIdState] = useState<string | null>(readStored)
  const orgsQ = useQuery({
    queryKey: ['orgs'],
    queryFn: async () => {
      await supabase.rpc('accept_invites')
      const { data, error } = await supabase.from('orgs').select('id, name').order('name')
      if (error) throw error
      return data
    },
  })
  const orgs = orgsQ.data ?? []
  const activeId = orgs.some((o) => o.id === orgId) ? orgId : orgs[0]?.id ?? null

  const permsQ = useQuery({
    queryKey: ['permissions', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_permissions', { p_org: activeId! })
      if (error) throw error
      return new Set<string>(data as string[])
    },
  })
  useEffect(() => { if (activeId) try { localStorage.setItem(KEY, activeId) } catch { /* private mode */ } }, [activeId])

  const permissions = permsQ.data ?? new Set<string>()
  return (
    <OrgContext.Provider value={{
      orgs, orgId: activeId, setOrgId: setOrgIdState, permissions,
      can: (p) => canHold(permissions, p), loading: orgsQ.isLoading || permsQ.isLoading,
    }}>{children}</OrgContext.Provider>
  )
}

export function useOrg() {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg must be used inside <OrgProvider>')
  return ctx
}
```

- [ ] **Step 4: Run — expect PASS** (`pnpm test`)

- [ ] **Step 5: Commit**

```bash
git add src/rbac
git commit -m "feat: add frontend permission model and org context"
```

---

### Task 7: Screens — auth, create org, switcher, members, roles

**Files:**
- Create: `src/auth/AuthPage.tsx`, `src/orgs/CreateOrgPage.tsx`, `src/orgs/OrgSwitcher.tsx`, `src/members/MembersPage.tsx`, `src/roles/RolesPage.tsx`, `src/roles/RoleEditor.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`
- Create: `README.md`

**Interfaces:**
- Consumes: `supabase`, `useOrg()`, `PERMISSION_GROUPS`, RPCs `create_org`, `save_role`, `delete_role`, `set_member_roles`, `remove_member`, function `invite-member`.

- [ ] **Step 1: Wire providers and routing** — `src/main.tsx`

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}><App /></QueryClientProvider>
  </StrictMode>,
)
```

`src/App.tsx` (hash routing — no router dependency for three pages):
```tsx
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './data/supabase'
import { OrgProvider, useOrg } from './rbac/useOrg'
import { AuthPage } from './auth/AuthPage'
import { CreateOrgPage } from './orgs/CreateOrgPage'
import { OrgSwitcher } from './orgs/OrgSwitcher'
import { MembersPage } from './members/MembersPage'
import { RolesPage } from './roles/RolesPage'

const useHash = () => {
  const [hash, setHash] = useState(location.hash || '#/members')
  useEffect(() => { const on = () => setHash(location.hash); addEventListener('hashchange', on); return () => removeEventListener('hashchange', on) }, [])
  return hash
}

function Shell() {
  const { orgs, orgId, loading, can } = useOrg()
  const hash = useHash()
  if (loading) return <p className="p-8 text-gray-500">Loading…</p>
  if (!orgs.length || hash === '#/new-org') return <CreateOrgPage />
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center gap-6 border-b bg-white px-6 py-3">
        <OrgSwitcher />
        <nav className="flex gap-4 text-sm">
          <a href="#/members">Members</a>
          {can('roles.manage') && <a href="#/roles">Roles</a>}
        </nav>
        <button className="ml-auto text-sm" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      <main className="mx-auto max-w-5xl p-6">
        {hash === '#/roles' ? <RolesPage key={orgId} /> : <MembersPage key={orgId} />}
      </main>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (session === undefined) return null
  if (!session) return <AuthPage />
  return <OrgProvider><Shell /></OrgProvider>
}
```

- [ ] **Step 2: Auth and org pages**

`src/auth/AuthPage.tsx`:
```tsx
import { useState, type FormEvent } from 'react'
import { supabase } from '../data/supabase'

export function AuthPage() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const { error } = mode === 'sign-in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })
    if (error) setError(error.message)
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-24 flex max-w-sm flex-col gap-3">
      <h1 className="text-xl font-semibold">{mode === 'sign-in' ? 'Sign in' : 'Create account'}</h1>
      <label className="flex flex-col text-sm">Email<input className="rounded border p-2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="flex flex-col text-sm">Password<input className="rounded border p-2" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button className="rounded bg-blue-600 p-2 text-white">{mode === 'sign-in' ? 'Sign in' : 'Create account'}</button>
      <button type="button" className="text-sm text-blue-600" onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>
        {mode === 'sign-in' ? 'Create an account' : 'I already have an account'}
      </button>
    </form>
  )
}
```

`src/orgs/CreateOrgPage.tsx`:
```tsx
import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../data/supabase'
import { useOrg } from '../rbac/useOrg'

export function CreateOrgPage() {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const qc = useQueryClient()
  const { setOrgId } = useOrg()

  async function submit(e: FormEvent) {
    e.preventDefault()
    const { data, error } = await supabase.rpc('create_org', { p_name: name })
    if (error) return setError(error.message)
    setOrgId(data)
    await qc.invalidateQueries({ queryKey: ['orgs'] })
    location.hash = '#/members'
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-24 flex max-w-sm flex-col gap-3">
      <h1 className="text-xl font-semibold">Create your organisation</h1>
      <label className="flex flex-col text-sm">Organisation name<input className="rounded border p-2" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button className="rounded bg-blue-600 p-2 text-white">Create organisation</button>
    </form>
  )
}
```

`src/orgs/OrgSwitcher.tsx`:
```tsx
import { useOrg } from '../rbac/useOrg'

export function OrgSwitcher() {
  const { orgs, orgId, setOrgId } = useOrg()
  return (
    <select aria-label="Organisation" className="rounded border p-1 text-sm" value={orgId ?? ''}
      onChange={(e) => (e.target.value === '__new' ? (location.hash = '#/new-org') : setOrgId(e.target.value))}>
      {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      <option value="__new">+ New organisation</option>
    </select>
  )
}
```

- [ ] **Step 3: Members page** — `src/members/MembersPage.tsx`

```tsx
import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../data/supabase'
import { useOrg } from '../rbac/useOrg'

type Role = { id: string; name: string; is_owner: boolean }
type Member = { id: string; email: string; status: 'invited' | 'active'; member_roles: { role_id: string }[] }

export function MembersPage() {
  const { orgId, can } = useOrg()
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [inviteRoles, setInviteRoles] = useState<string[]>([])
  const manage = can('members.manage')

  const roles = useQuery({ queryKey: ['roles', orgId], queryFn: async () => {
    const { data, error } = await supabase.from('roles').select('id, name, is_owner').eq('org_id', orgId!).order('name')
    if (error) throw error
    return data as Role[]
  } })
  const members = useQuery({ queryKey: ['members', orgId], queryFn: async () => {
    const { data, error } = await supabase.from('members').select('id, email, status, member_roles(role_id)').eq('org_id', orgId!).order('email')
    if (error) throw error
    return data as Member[]
  } })
  const refresh = () => qc.invalidateQueries({ queryKey: ['members', orgId] })

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    setError(null)
    const { error } = await p
    if (error) setError(error.message)
    await refresh()
  }

  async function invite(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const { data, error } = await supabase.functions.invoke('invite-member', { body: { orgId, email, roleIds: inviteRoles } })
    if (error) return setError((await error.context?.json?.())?.error ?? error.message)
    if (data.status === 'existing') setError(`${email} is already in this organisation.`)
    setEmail(''); setInviteRoles([])
    await refresh()
  }

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Members</h1>
      {error && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {manage && (
        <form onSubmit={invite} className="flex flex-wrap items-end gap-3 rounded border bg-white p-4">
          <label className="flex flex-col text-sm">Email<input className="rounded border p-2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <fieldset className="flex gap-2 text-sm"><legend className="sr-only">Roles</legend>
            {roles.data?.filter((r) => !r.is_owner).map((r) => (
              <label key={r.id} className="flex items-center gap-1"><input type="checkbox" checked={inviteRoles.includes(r.id)} onChange={() => setInviteRoles(toggle(inviteRoles, r.id))} />{r.name}</label>
            ))}
          </fieldset>
          <button className="rounded bg-blue-600 px-3 py-2 text-sm text-white">Send invite</button>
        </form>
      )}
      <table className="w-full rounded border bg-white text-sm">
        <thead><tr className="text-left text-gray-500"><th className="p-2">Email</th><th>Status</th><th>Roles</th><th /></tr></thead>
        <tbody>
          {members.data?.map((m) => {
            const held = m.member_roles.map((r) => r.role_id)
            return (
              <tr key={m.id} className="border-t">
                <td className="p-2">{m.email}</td>
                <td>{m.status === 'invited' ? 'Invited' : 'Active'}</td>
                <td className="flex flex-wrap gap-2 py-2">
                  {roles.data?.map((r) => (
                    <label key={r.id} className="flex items-center gap-1">
                      <input type="checkbox" disabled={!manage} checked={held.includes(r.id)}
                        onChange={() => run(supabase.rpc('set_member_roles', { p_member_id: m.id, p_role_ids: toggle(held, r.id) }))} />
                      {r.name}
                    </label>
                  ))}
                </td>
                <td>{manage && (
                  <button className="text-red-600" onClick={() => confirm(`Remove ${m.email}?`) && run(supabase.rpc('remove_member', { p_member_id: m.id }))}>Remove</button>
                )}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
```

- [ ] **Step 4: Roles page + editor**

`src/roles/RoleEditor.tsx`:
```tsx
import { useState } from 'react'
import { PERMISSION_GROUPS } from '../rbac/permissions'
import { useOrg } from '../rbac/useOrg'

export type RoleDraft = { id: string | null; name: string; permissions: string[]; is_owner: boolean }

export function RoleEditor({ role, onSave, onCancel }: { role: RoleDraft; onSave(r: RoleDraft): void; onCancel(): void }) {
  const [draft, setDraft] = useState(role)
  const { can } = useOrg()
  const toggle = (k: string) => setDraft({ ...draft, permissions: draft.permissions.includes(k) ? draft.permissions.filter((p) => p !== k) : [...draft.permissions, k] })

  return (
    <div className="flex flex-col gap-3 rounded border bg-white p-4">
      <label className="flex flex-col text-sm">Role name
        <input className="rounded border p-2" maxLength={60} disabled={draft.is_owner} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </label>
      {PERMISSION_GROUPS.map((g) => (
        <fieldset key={g.group} className="text-sm">
          <legend className="font-medium">{g.group}</legend>
          {g.items.map((i) => (
            <label key={i.key} className="flex items-center gap-2">
              <input type="checkbox" checked={draft.is_owner || draft.permissions.includes(i.key)}
                disabled={draft.is_owner || !can(i.key)} onChange={() => toggle(i.key)} />
              {i.label}{!can(i.key) && !draft.is_owner && <span className="text-gray-400"> (you don’t hold this)</span>}
            </label>
          ))}
        </fieldset>
      ))}
      {draft.is_owner
        ? <p className="text-sm text-gray-500">The Owner role always has every permission and cannot be changed.</p>
        : <div className="flex gap-2"><button className="rounded bg-blue-600 px-3 py-2 text-sm text-white" onClick={() => onSave(draft)}>Save role</button><button className="text-sm" onClick={onCancel}>Cancel</button></div>}
    </div>
  )
}
```

`src/roles/RolesPage.tsx`:
```tsx
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../data/supabase'
import { useOrg } from '../rbac/useOrg'
import { RoleEditor, type RoleDraft } from './RoleEditor'

export function RolesPage() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<RoleDraft | null>(null)
  const [error, setError] = useState<string | null>(null)

  const roles = useQuery({ queryKey: ['roles-full', orgId], queryFn: async () => {
    const { data, error } = await supabase.from('roles').select('id, name, is_owner, is_system, role_permissions(permission)').eq('org_id', orgId!).order('name')
    if (error) throw error
    return data
  } })
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['roles-full', orgId] }), qc.invalidateQueries({ queryKey: ['roles', orgId] })])

  async function save(r: RoleDraft) {
    setError(null)
    const { error } = await supabase.rpc('save_role', { p_org: orgId!, p_role_id: r.id, p_name: r.name, p_permissions: r.permissions })
    if (error) return setError(error.message)
    setEditing(null); await refresh()
  }
  async function remove(id: string, name: string) {
    if (!confirm(`Delete the ${name} role? Members lose its permissions.`)) return
    const { error } = await supabase.rpc('delete_role', { p_role_id: id })
    if (error) setError(error.message)
    await refresh()
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center"><h1 className="text-lg font-semibold">Roles</h1>
        <button className="ml-auto rounded bg-blue-600 px-3 py-2 text-sm text-white" onClick={() => setEditing({ id: null, name: '', permissions: [], is_owner: false })}>New role</button>
      </div>
      {error && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {editing && <RoleEditor key={editing.id ?? 'new'} role={editing} onSave={save} onCancel={() => setEditing(null)} />}
      <ul className="divide-y rounded border bg-white text-sm">
        {roles.data?.map((r) => (
          <li key={r.id} className="flex items-center gap-3 p-3">
            <span className="font-medium">{r.name}</span>
            <span className="text-gray-500">{r.is_owner ? 'All permissions' : `${r.role_permissions.length} permissions`}</span>
            <button className="ml-auto" onClick={() => setEditing({ id: r.id, name: r.name, is_owner: r.is_owner, permissions: r.role_permissions.map((p) => p.permission) })}>
              {r.is_owner ? 'View' : 'Edit'}
            </button>
            {!r.is_owner && <button className="text-red-600" onClick={() => remove(r.id, r.name)}>Delete</button>}
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 5: README** — `README.md`

````markdown
# ReportNoReport v2

Forms, workflows, communication and reports for school admins and HR teams.

## Run locally

```bash
brew install supabase/tap/supabase deno
pnpm install
supabase start
supabase db reset          # migrations + seed
cp .env.example .env.local # paste ANON_KEY from `supabase status`
supabase functions serve & # invite-member
pnpm dev
```

Seed users (password `password123`): `owner@alpha.test`, `admin@alpha.test`, `member@alpha.test`, `viewer@alpha.test` (Alpha School), `owner@beta.test` (Beta HR). Invite emails land in Mailpit: http://127.0.0.1:54324.

## Tests

- `pnpm test` — unit
- `supabase test db` — RLS, roles, guards
- `deno test supabase/functions` — Edge Functions
````

- [ ] **Step 6: Typecheck and build**

Run: `pnpm build`
Expected: no TypeScript errors.

- [ ] **Step 7: Browser verification** (Claude Browser pane, `http://localhost:5173`)

1. Sign in as `owner@alpha.test` → Members lists 4 members with role checkboxes.
2. Untick Owner on yourself → red alert "An organisation needs at least one Owner."
3. Roles → New role "Counsellor", tick Start records + View reports → Save → listed with "2 permissions".
4. Invite `new@alpha.test` with Counsellor → row appears as Invited; email visible in Mailpit.
5. Sign out, sign in as `viewer@alpha.test` → no Roles link, checkboxes disabled, no invite form.
6. Org switcher → "+ New organisation" → create "Viewer Co" → you are Owner there, and Roles link appears.

- [ ] **Step 8: Commit**

```bash
git add src README.md
git commit -m "feat: add auth, org, members and roles screens"
```

---

## Self-review notes

- Spec §3 tenancy → Tasks 2–3. §7 tables → Task 2 (`workflow_access` deferred to Phase 3, stated in Global Constraints). `has_permission` → Task 3 (workflow-scoped overload added in Phase 3). Guards + audit → Task 4. Members page / invite → Tasks 5, 7. Roles page → Task 7. Permissions loaded once per org switch → Task 6 (`['permissions', orgId]` query).
- Review Focus 1, 2, 5 → `03_rbac_guards.test.sql`; 3 → `02_isolation.test.sql`; 4 → Task 5 Step 5.
