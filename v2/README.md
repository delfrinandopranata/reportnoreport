# ReportNoReport v2

Forms, workflows, communication and reports for school admins and HR teams.

## Run locally

```bash
brew install supabase/tap/supabase deno
pnpm install
supabase start
supabase db reset          # migrations + seed
cp .env.example .env.local # paste ANON_KEY from `supabase status`
echo 'CRON_SECRET=local-cron-secret' > supabase/functions/.env.local   # once; matches the Vault secret in seed.sql
supabase functions serve --env-file supabase/functions/.env.local &    # invite-member, submit-form, advance, resume, save-workflow
pnpm dev
```

Seed users (password `password123`): `owner@alpha.test`, `admin@alpha.test`, `member@alpha.test`, `viewer@alpha.test` (Alpha School), `owner@beta.test` (Beta HR). Invite emails land in Mailpit: http://127.0.0.1:54324.

## Tests

- `pnpm test` — unit (incl. the shared form logic in `supabase/functions/_shared/forms`)
- `supabase test db` — RLS, roles, guards, forms and form-file storage
- `deno test supabase/functions` — Edge Functions, the workflow engine and the shared tests under Deno
- `RNR_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres DENO_NO_PACKAGE_JSON=1 deno test --allow-env --allow-net supabase/functions/advance/race.test.ts` — two simultaneous approvals against the local database

Hosted projects: set the `CRON_SECRET` function secret (16+ characters) and create the Vault secrets `resume_url` (`https://<ref>.supabase.co/functions/v1/resume`) and `cron_secret` (same value).
