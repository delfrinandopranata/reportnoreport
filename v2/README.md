# ReportNoReport v2

Forms, workflows, communication, reports and campaigns for school admins and HR teams. React 19 + Vite on Vercel; Supabase (Postgres with RLS, Auth, Storage, Realtime, pg_cron, Edge Functions) behind it. The design is `docs/superpowers/specs/2026-10-11-reportnoreport-v2-design.md`; every phase's plan, design spec and QA report are in `docs/superpowers/` (`plans/`, `design/`, `qa/`).

## What is in it

| Module | What it does | Where |
|---|---|---|
| Access control (RBAC) | Organisations (tenants), invites, roles built from permissions, members, audit log. Every table is scoped by `org_id` and every policy calls `has_permission()` | `src/rbac`, `src/roles`, `src/members`, `src/orgs`, `src/auth` |
| Forms | Form builder with 12 field types, rules, calculated fields, standalone submissions and file answers | `src/forms`, `supabase/functions/submit-form` |
| Workflows | Canvas with 5 card types, publish check, runtime (`advance`), inbox, record page, timers | `src/workflows`, `src/inbox`, `src/records`, `supabase/functions/{advance,resume,save-workflow}` |
| Communication | Message templates, in-app bell (Realtime), task emails through a queue, Messages page, per-type email mute | `src/comms`, `supabase/functions/send-messages` |
| Reports | Record PDFs, saved aggregate reports with CSV, dashboard | `src/reports`, `supabase/functions/{run-report,render-pdfs}` |
| Campaigns | Broadcasts to a role, a saved report's people or an earlier campaign's "not opened" / "not completed" people; scheduling; tracking; report; follow-ups; one-click unsubscribe | `src/campaigns`, `supabase/functions/{send-campaigns,resend-webhook,unsubscribe}` |
| Public site | Landing page, `/privacy`, `/terms`, `/unsubscribe`, served as static HTML next to the app (the app is under `/app/`) | `index.html`, `privacy.html`, `terms.html`, `unsubscribe.html`, `public/` |

## Run locally

Needs Node 24+, pnpm, Docker (for Supabase), the Supabase CLI and Deno.

```bash
brew install supabase/tap/supabase deno
pnpm install
supabase start                 # Postgres, Auth, Storage, Realtime, Mailpit, Edge runtime
supabase db reset              # migrations + seed (wait about 30 seconds afterwards)
cp .env.example .env.local     # paste ANON_KEY from `supabase status`
cp supabase/functions/.env.example supabase/functions/.env.local   # once; fill it in as in "Settings" below
supabase functions serve --env-file supabase/functions/.env.local &
pnpm dev
```

- The app: http://localhost:5173/app/. Public pages: `/`, `/privacy`, `/terms`, `/unsubscribe`.
- `supabase functions serve` does not read `.env.local` by itself: without `--env-file`, `resend-webhook`, `send-campaigns` and `unsubscribe` stop at boot with a message naming the missing setting. After `supabase db reset`, restart it.
- Mailpit (every local email, including its headers): http://127.0.0.1:54324.
- Seed users (password `password123`): `owner@alpha.test`, `admin@alpha.test`, `member@alpha.test`, `viewer@alpha.test` (Alpha School), `owner@beta.test` (Beta HR). To be two people at once, open `alpha.localhost:5173/app/` and `beta.localhost:5173/app/`: each hostname has its own sign-in.

## Settings

Names only here; never commit values. Local values live in `.env.local` and `supabase/functions/.env.local` (both git-ignored); `.env.example` and `supabase/functions/.env.example` list the same names.

**Browser** (`.env.local`; hosted: Vercel project settings). Nothing secret ever goes in a `VITE_` variable.

| Name | For |
|---|---|
| `VITE_SUPABASE_URL` | the Supabase API URL (`http://127.0.0.1:54321` locally) |
| `VITE_SUPABASE_ANON_KEY` | the anon (publishable) key from `supabase status` |

**Edge Functions** (`supabase/functions/.env.local` locally; `supabase secrets set` when hosted). Each function reads its settings once at boot and refuses to start when one is missing or malformed.

| Name | Used by | Local | Hosted |
|---|---|---|---|
| `CRON_SECRET` | `resume`, `send-messages`, `render-pdfs`, `send-campaigns` (callers prove themselves with it) | `local-cron-secret` (matches `seed.sql`) | 16+ random characters, equal to the Vault secret `cron_secret` |
| `APP_URL` | `advance`, `send-messages`, `invite-member` (links in messages), `send-campaigns` (unsubscribe page link), `unsubscribe` (CORS origin) | `http://localhost:5173/app/` | `https://reportnoreport.com/app/` |
| `EMAIL_TRANSPORT` | `send-messages` | `mailpit` | `resend` |
| `EMAIL_FROM` | `send-messages` | a `Name <address>` sender | a sender on a domain verified in Resend |
| `MAILPIT_URL` | `send-messages` (mailpit only) | `http://host.docker.internal:54324` | not set |
| `RESEND_API_KEY` | `send-messages` (resend only) | not needed | the Resend API key |
| `UNSUBSCRIBE_URL` | `send-campaigns`, `unsubscribe` (the function's own URL, used in the `List-Unsubscribe` header) | `http://127.0.0.1:54321/functions/v1/unsubscribe` | `https://<ref>.supabase.co/functions/v1/unsubscribe` |
| `UNSUBSCRIBE_SECRET` | `send-campaigns`, `unsubscribe` (signs unsubscribe links) | any 32+ characters | 32+ random characters; changing it breaks links in emails already sent |
| `RESEND_WEBHOOK_SECRET` | `resend-webhook` (verifies Resend's signature) | any `whsec_` + base64 value, such as `whsec_$(openssl rand -base64 24)` | the signing secret on the Resend webhook page |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` are provided to every function by Supabase.

**Vault** (pg_cron and the database functions call the Edge Functions with these): `cron_secret`, `resume_url`, `send_messages_url`, `render_pdfs_url`, `send_campaigns_url`. `seed.sql` creates the local ones. A hosted project creates each with `select vault.create_secret('<value>', '<name>');`, the URLs being `https://<ref>.supabase.co/functions/v1/<function>` and `cron_secret` equal to `CRON_SECRET`.

**Tests only:** `RNR_TEST_DB_URL`, `RNR_TEST_SUPABASE_URL`, `RNR_TEST_ANON_KEY` (see Tests).

## How it fits together

- **Forms and workflows.** `submit-form` validates standalone submissions; `advance` runs every workflow step in one transaction with the record locked; `resume` (pg_cron, every minute) continues timers; `save-workflow` checks and publishes graphs.
- **Email and notifications.** Every email is a queued `messages` row. `send-messages` (pg_cron, every minute) sends up to 1,000 a run through Mailpit locally or Resend hosted (`Idempotency-Key` = message id), retries 3 times with backoff, waits a minute without spending an attempt when Resend rate-limits, then marks the message `failed` with a plain reason on the Messages page. In-app notifications arrive through Realtime. People mute email per type in Settings; in-app always arrives.
- **Reports.** `run-report` runs saved reports with the caller's own JWT (RLS decides every row), counts visible records first and refuses more than 10,000 (413), and exports CSV. `render-pdfs` (pg_cron and the `generate_pdf` action) renders record PDFs with `pdf-lib` and the Inter fonts (SIL OFL) into the private `record-pdfs` bucket.
- **Campaigns.** `send-campaigns` (pg_cron every minute, and at once for "Send now") spends an attempt and takes a lease, then in one transaction claims the campaign, reads its audience with the visibility of the person who scheduled it, leaves out (and counts) unsubscribed, duplicate and unusable addresses, refuses more than 10,000 people, and queues one message each with a single `INSERT … SELECT`. A run the runtime kills is retried after its lease; after 3 the campaign is `failed` with a reason. Every campaign email carries a footer link to `<APP_URL origin>/unsubscribe?t=<token>` and `List-Unsubscribe` / `List-Unsubscribe-Post` headers that post straight to the `unsubscribe` function (JSON only; opt-outs are per organisation and by address). `resend-webhook` verifies Resend's signature and records delivered, opened, clicked, bounced and complained times, keeping the earliest time of each, so replays change nothing; opens are approximate because Apple Mail Privacy Protection opens emails automatically.

Locally, campaign tracking works without Resend: Mailpit's message id is stored as the provider id, and

```bash
node --env-file=supabase/functions/.env.local scripts/webhook-event.mjs email.opened <provider_id from messages>
```

signs a fixture event with `RESEND_WEBHOOK_SECRET` and posts it to the local `resend-webhook` (types: `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`).

## Tests

```bash
pnpm test                                                        # unit, incl. the shared modules under supabase/functions/_shared
pnpm lint                                                        # oxlint (never Prettier)
pnpm build                                                       # tsc + vite + scripts/check-dist.mjs
supabase db reset && supabase test db                            # pgTAP: RLS, roles, guards, every table
DENO_NO_PACKAGE_JSON=1 deno test --allow-read supabase/functions # Edge Functions and the shared modules under Deno
```

Database-backed Edge tests are skipped unless their variables are set. With `supabase start` running and the seed loaded (wait until `supabase status` lists every service before the Realtime test):

```bash
eval "$(supabase status -o env)"
export RNR_TEST_SUPABASE_URL="$API_URL" RNR_TEST_ANON_KEY="$ANON_KEY" RNR_TEST_DB_URL="$DB_URL"
DENO_NO_PACKAGE_JSON=1 deno test --allow-env --allow-net --allow-read \
  supabase/functions/advance/race.test.ts \
  supabase/functions/send-messages/race.test.ts \
  supabase/functions/send-campaigns/db.test.ts \
  supabase/functions/resend-webhook/db.test.ts \
  supabase/functions/run-report/visibility.test.ts \
  supabase/functions/_integration/realtime.test.ts
```

| File | Needs | Proves |
|---|---|---|
| `advance/race.test.ts` | `RNR_TEST_DB_URL` | two simultaneous approvals advance a record once; a 501-person Send message stops the record |
| `send-messages/race.test.ts` | `RNR_TEST_DB_URL` | two overlapping cron runs remind an overdue task once |
| `send-campaigns/db.test.ts` | `RNR_TEST_DB_URL` | two overlapping runs send a campaign once; a report audience follows the sender's visibility; 10,002 members with 2 opted out send 10,000 and 10,003 fail with the limit sentence; the set-based insert fills in names, links and unsubscribe tokens; killed runs are retried, then failed; the follow-up reaches exactly the people `campaign_stats.not_opened` counts (seeds up to 20,000 members, about 25 seconds) |
| `resend-webhook/db.test.ts` | `RNR_TEST_DB_URL` | replayed and late events keep the earliest time; a complaint unsubscribes the address |
| `run-report/visibility.test.ts` | all three | a report returns each seeded user only the records they can see |
| `_integration/realtime.test.ts` | all three | Realtime sends a user only their own notifications |

Each test deletes what it creates. CI (`.github/workflows/ci-v2.yml`, in the repository root) runs all of the above on every pull request that touches `v2/`. Browser checks use the Claude Browser pane against `supabase start`, never Playwright.

## Deploy

**Supabase (hosted project).**
1. `supabase link --project-ref <ref>` and `supabase db push` (migrations only; never the seed).
2. Set the function secrets from the table above: `supabase secrets set CRON_SECRET=… APP_URL=… EMAIL_TRANSPORT=resend EMAIL_FROM=… RESEND_API_KEY=… UNSUBSCRIBE_URL=… UNSUBSCRIBE_SECRET=… RESEND_WEBHOOK_SECRET=…`.
3. Create the five Vault secrets (`cron_secret` equal to `CRON_SECRET`, and the four function URLs).
4. `supabase functions deploy` (every function; `config.toml` sets `verify_jwt = false` for the cron, webhook and unsubscribe functions, which check their own secret, signature or token).
5. In Resend: verify the sending domain, then add a webhook to `https://<ref>.supabase.co/functions/v1/resend-webhook` for `email.delivered`, `email.opened`, `email.clicked`, `email.bounced` and `email.complained`, and copy its signing secret into `RESEND_WEBHOOK_SECRET`. Turn on open and click tracking for the domain. Resend's default rate limit paces campaigns at roughly 120 emails a minute; ask Resend for more when campaigns are large.
6. Add `https://reportnoreport.com/app/` to Supabase Auth redirect URLs.

**Vercel.** Set the project Root Directory to `v2/` and `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Vercel builds with `pnpm build`, which fails if `scripts/check-dist.mjs` finds a leaked secret, a broken internal link, an `<img>` without `alt`, an image over 200 KB or a `[…]` placeholder. Routing, security headers and caching live in `vercel.json`.

## Known limits

Most are a `shortcut:` in the code naming the point at which to change it.

- **Fonts.** Inter covers Latin, Greek and Cyrillic; Tamil, Chinese, Japanese and other scripts print as empty boxes in record PDFs (add a Noto subset per script when an organisation needs it). PDF text is drawn without shaping, and times are in UTC.
- **Report size.** A saved report reads at most 10,000 visible records; more is refused (413), never cut.
- **Campaign size.** At most 10,000 people per campaign after opt-outs and de-duplication; more fails the campaign with a sentence. Everyone left out is counted on the report.
- **Workflow messages.** A workflow "Send message" step reaches at most 500 people; larger audiences are campaigns.
- **Throughput.** 1,000 emails a minute from the queue (Resend's batch endpoint is the next step) and 5 campaigns starting per minute.
- **Edge CPU.** Edge Functions are killed at the runtime's CPU limit. Campaign preparation is one set-based insert for that reason, and a run that is still killed is retried and then failed with a reason. PDF rendering fails at once, with a reason, rather than being killed.
- **Signed URLs expire.** Record PDF links last 5 minutes and form-file links 1 hour; open them again from the page.
- **No versioning.** Records point at the live workflow graph, and forms are not versioned; editing a published workflow affects open records.
- **Lists.** The newest 200 campaigns, 200 messages and 20 notifications are shown per list.
- **Not built.** SMS and WhatsApp, public (logged-out) forms, more than one report template per workflow.
