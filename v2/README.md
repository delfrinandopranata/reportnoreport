# ReportNoReport v2

Forms, workflows, communication and reports for school admins and HR teams.

## Run locally

```bash
brew install supabase/tap/supabase deno
pnpm install
supabase start
supabase db reset          # migrations + seed
cp .env.example .env.local # paste ANON_KEY from `supabase status`
cp supabase/functions/.env.example supabase/functions/.env.local   # once; set CRON_SECRET=local-cron-secret (matches seed.sql)
supabase functions serve --env-file supabase/functions/.env.local &    # invite-member, submit-form, advance, resume, save-workflow, send-messages
pnpm dev
```

The app is at http://localhost:5173/app/. Public pages: `/`, `/privacy`, `/terms`.

Seed users (password `password123`): `owner@alpha.test`, `admin@alpha.test`, `member@alpha.test`, `viewer@alpha.test` (Alpha School), `owner@beta.test` (Beta HR). Invite emails land in Mailpit: http://127.0.0.1:54324.

Email: every email is a queued `messages` row. `send-messages` (pg_cron, every minute) sends it through Mailpit locally (`EMAIL_TRANSPORT=mailpit`; read it at http://127.0.0.1:54324) and Resend when hosted. No Resend key is needed locally or for tests.

## Tests

- `pnpm test` — unit (incl. the shared form logic in `supabase/functions/_shared/forms`)
- `supabase test db` — RLS, roles, guards, forms and form-file storage
- `DENO_NO_PACKAGE_JSON=1 deno test --allow-read supabase/functions` — Edge Functions (`--allow-read` loads the Inter fonts for `render-pdfs`), the workflow engine and the shared tests under Deno
- `RNR_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres DENO_NO_PACKAGE_JSON=1 deno test --allow-env --allow-net supabase/functions/advance/race.test.ts` — two simultaneous approvals against the local database
- `RNR_TEST_DB_URL=… deno test --allow-env --allow-net supabase/functions/send-messages/race.test.ts` — two overlapping cron runs remind an overdue task once
- `RNR_TEST_SUPABASE_URL=http://127.0.0.1:54321 RNR_TEST_ANON_KEY=<anon key> RNR_TEST_DB_URL=… deno test --allow-env --allow-net supabase/functions/run-report/visibility.test.ts` — the real `run-report` handler returns each seeded user only the records they can see
- `RNR_TEST_SUPABASE_URL=http://127.0.0.1:54321 RNR_TEST_ANON_KEY=<anon key> RNR_TEST_DB_URL=… deno test --allow-env --allow-net supabase/functions/_integration/realtime.test.ts` — Realtime sends a user only their own notifications

`render-pdfs` makes record PDFs: `request_record_pdf`, the `generate_pdf` action and pg_cron (every minute) wake it with `CRON_SECRET`; it renders with `pdf-lib` and the Inter 4.1 fonts (SIL OFL) in `supabase/functions/render-pdfs/fonts/`, shipped through `static_files` in `config.toml`, and uploads to the private `record-pdfs` bucket. Locally the Vault secret `render_pdfs_url` comes from `seed.sql`. Inter covers Latin, Greek and Cyrillic: Tamil, Chinese, Japanese and other scripts print as empty boxes in a PDF (a `shortcut:` in `render.ts`; add a Noto subset per script when an organisation needs it). Text is drawn without shaping (no kerning or ligatures) to stay inside the Edge CPU limit; a render that nears the limit fails at once with a plain reason instead of being killed.

`run-report` runs saved or draft reports for `reports.view`: it reads `records` with the caller's own JWT (no service-role client, so RLS decides every row), filters with the shared evaluator, and counts the visible records first and refuses a workflow with more than 10,000 (413) before reading any row, instead of cutting it. `format: "csv"` returns every row.

Hosted projects: set the function secrets `CRON_SECRET` (16+ characters), `APP_URL` (`https://reportnoreport.com/app/`), `EMAIL_TRANSPORT=resend`, `EMAIL_FROM` (a sender on a domain verified in Resend) and `RESEND_API_KEY`, and create the Vault secrets `resume_url` (`https://<ref>.supabase.co/functions/v1/resume`), `send_messages_url` (`https://<ref>.supabase.co/functions/v1/send-messages`), `render_pdfs_url` (`https://<ref>.supabase.co/functions/v1/render-pdfs`) and `cron_secret` (same value as `CRON_SECRET`). A missing or malformed email setting stops `send-messages` at boot.

## Deploy

Set the Vercel project Root Directory to `v2/`. Vercel builds with `pnpm build`, which fails if `scripts/check-dist.mjs` finds a leaked secret, a broken internal link, an `<img>` without `alt`, an image over 200 KB or a `[…]` placeholder.

- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel project.
- Add `https://reportnoreport.com/app/` to Supabase Auth redirect URLs.
- Routing, security headers and caching live in `vercel.json`.
