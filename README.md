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
