# ReportNoReport v2

Forms, workflows, communication and reports for school admins and HR teams.

## Run locally

```bash
brew install supabase/tap/supabase deno
pnpm install
supabase start
supabase db reset          # migrations + seed
cp .env.example .env.local # paste ANON_KEY from `supabase status`
supabase functions serve & # invite-member, submit-form
pnpm dev
```

The app is at http://localhost:5173/app/. Public pages: `/`, `/privacy`, `/terms`.

Seed users (password `password123`): `owner@alpha.test`, `admin@alpha.test`, `member@alpha.test`, `viewer@alpha.test` (Alpha School), `owner@beta.test` (Beta HR). Invite emails land in Mailpit: http://127.0.0.1:54324.

## Tests

- `pnpm test` — unit (incl. the shared form logic in `supabase/functions/_shared/forms`)
- `supabase test db` — RLS, roles, guards, forms and form-file storage
- `deno test supabase/functions` — Edge Functions and the same shared form tests under Deno

## Deploy

Set the Vercel project Root Directory to `v2/`. Vercel builds with `pnpm build`, which fails if `scripts/check-dist.mjs` finds a leaked secret, a broken internal link, an `<img>` without `alt`, an image over 200 KB or a `[…]` placeholder.

- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel project.
- Add `https://reportnoreport.com/app/` to Supabase Auth redirect URLs.
- Routing, security headers and caching live in `vercel.json`.
