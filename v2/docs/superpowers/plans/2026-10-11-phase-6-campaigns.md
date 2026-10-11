# Phase 6 — Campaigns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person with `comms.broadcast` writes a campaign (name, a message template, an audience, optionally a linked workflow), sends it now or schedules it, and every recipient gets one queued email (or one in-app notice) through the Phase 4 queue. The audience is a role, a saved report's people, or the "not opened" / "not completed" people of an earlier campaign, and it is snapshotted when the campaign starts sending, with the sender's own record visibility. Resend's signed webhook writes delivered / opened / clicked / bounced / complained times onto `messages`. A campaign report shows tiles, opens and clicks over the first 7 days, a filterable recipient table with CSV export, "Send follow-up to not opened", and, with a linked workflow, completion % and "Remind non-completers". Every campaign email carries a one-click unsubscribe link that the next campaign honours. Nothing is cut silently: an audience over the limit fails with a sentence, and every person left out is counted on the report.

**Architecture:** Postgres adds `campaigns`, `email_optouts`, a `campaign_id` foreign key on `messages` and `notifications`, `messages.unsubscribe_url`, the RPCs `schedule_campaign` / `cancel_campaign`, the read functions `campaign_stats` / `campaign_daily` / `campaign_completion`, an in-app read trigger and the `send-campaigns` cron job (Vault URL + `cron_secret`, the `resume` / `send-messages` / `render-pdfs` pattern). A pure module `supabase/functions/_shared/comms/campaign.ts` (audience parsing, recipient planning with exclusions and the cap, percentages, tiles, footer, unsubscribe tokens, recipient CSV) and `webhook.ts` (Svix signature, event mapping) run in the browser, the Edge Functions, `node --test` and `deno test`, like the other `_shared` modules. Three new Edge Functions: **`send-campaigns`** (pg_cron every minute and an immediate wake-up from `schedule_campaign`) claims a due campaign, reads its audience **as the sender** (`set local role authenticated` with the sender's claims, so RLS decides which saved report and records exist), plans recipients, renders the template once per person and inserts the messages in chunks of 1,000, all in one transaction; **`resend-webhook`** verifies the Svix signature and applies tracking times idempotently by `provider_id`; **`unsubscribe`** checks a signed per-message token and records the opt-out. `send-messages` gains a run loop (up to 1,000 emails a minute), a rate-limit pause that does not spend an attempt, the `List-Unsubscribe` headers and the `sending → sent` step. The frontend adds Campaigns (list, editor, report with a two-series SVG chart, recipient table, CSV), and a "Campaign emails" switch in Settings.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, supabase-js 2, Supabase CLI (Postgres 17, pgTAP, `pg_cron`, `pg_net`, Vault), Deno 2 Edge Functions, `npm:postgres@3.4.5`, Web Crypto (`crypto.subtle`, HMAC-SHA256, available in Deno and Node 24), `node --test`, oxlint. **No new dependencies** in `package.json` or `deno.lock`.

**Spec:** `docs/superpowers/specs/2026-10-11-reportnoreport-v2-design.md` (§8 Communication and §8.1 Campaigns; §10 Error handling; §11 Testing; §12 phase 6; §15 Design system)

## Global Constraints

- Everything from the Phase 1–5 Global Constraints still holds (org-scoped tables, `has_permission()` in every policy, British English, sentence-case verb-first buttons, no emoji, `design/` authoritative, tokens and `rnr-*` classes only, one `rnr-btn-primary` per view, never `disabled` on submit, `aria-busy` + `rnr-spin` while saving, native `<dialog>` via `src/ui/ConfirmDialog.tsx`, the browser never trusted, the app served from `/app/`, `pnpm build` runs `scripts/check-dist.mjs`).
- **Decisions this plan takes (reviewer: check these):**
  1. **Audience and whose visibility.** `campaigns.audience` is one of `{ kind: 'role', roleId }`, `{ kind: 'report', reportId, to: 'starter' | { field: '<key>' } }` or `{ kind: 'followup', campaignId, who: 'not_opened' | 'not_completed' }`. A saved report yields people one of two ways, chosen in the editor: **the person who started each record** (an active member, so they get the email and can be counted for completion) or **an email answer** (`{ field }`: a record answer that matches the Phase 4 `EMAIL_RE`; such an address may have no account). The audience is **snapshotted when the campaign starts sending**, not when it is drafted, and it is read **with the visibility of `campaigns.sent_by`** — the person who pressed Schedule or Send now: `send-campaigns` sets that person's JWT claims and `set local role authenticated` inside its transaction, so `saved_reports_read` and `records_read` (RLS) decide which report and which records exist, exactly as `run-report` does with the caller's JWT. A sender who can no longer send campaigns or open the report makes the campaign fail with a sentence. Grouped reports are refused (they list groups, not people). Filters run through the shared `readReportDef` + `runReport` (spec §4.3's one evaluator), never a second SQL copy.
  2. **The limit, stated and loud.** A campaign reaches at most **`MAX_AUDIENCE` = 10,000 people** after de-duplication — the same ceiling as `run-report`'s `MAX_SCAN`, so a report audience can never be cut by the report reader either. A role is read with `limit 10,001` so one person past the cap is detected, never trimmed; a report over 10,000 visible records is refused with the run-report sentence. Over the cap, the campaign goes to `failed` with "This audience has more than 10,000 people, which is more than one campaign can send. Split it into smaller roles or reports." and nothing is queued. The Phase 4 `MAX_PEOPLE` = 500 for a workflow's "Send message" stays as it is (a step must not queue thousands of emails inside the advancing transaction); campaigns are the batched path that `shortcut:` names, and `notify.ts`'s comment is updated to point here.
  3. **Exactly once.** `send-campaigns` claims a campaign with `UPDATE campaigns SET status = 'sending' WHERE id = $1 AND status = 'scheduled' AND scheduled_at <= now() RETURNING …` **in the same transaction** that snapshots the audience and inserts every message. A concurrent cron run blocks on the row lock, then finds the status changed and gets no row. A unique index on `messages (campaign_id, recipient_email)` makes a duplicate insert impossible even if that reasoning were wrong. Any failure rolls back the claim and every inserted row, then a second transaction moves the campaign from `scheduled` to **`failed`** with a plain reason (a `CampaignProblem` sentence, or "This campaign could not be prepared. Edit it and schedule it again." for anything unexpected, whose detail goes to `console.error` only). A failed campaign never retries by itself; "Edit and schedule again" returns it to draft.
  4. **Batching and throughput.** Messages are inserted in chunks of 1,000 inside the one transaction (10,000 people = 10 inserts). `send-messages` now loops: up to `MAX_BATCHES` = 20 batches of 50 per run (1,000 emails a minute), stopping at the first empty batch. A Resend 429 re-queues that email for one minute **without spending an attempt** (rate limiting is the provider pacing us, not a failure of the email) and ends the run; every other failure keeps the Phase 4 retry and backoff. A campaign moves `sending → sent` when it has no queued message left (`send-messages` checks after each run). The report says "4,200 of 10,000 sent so far" while it drains. `shortcut:` Resend's batch endpoint when an organisation needs more than about 1,000 a minute.
  5. **Opt-out: per organisation, by email address, not `notification_prefs`.** Campaign emails skip addresses in `email_optouts (org_id, email)`. Not `notification_prefs` because (a) a report audience can include addresses with no account, which have no prefs row; (b) prefs are per person across every organisation, while a campaign is one organisation's broadcast, and unsubscribing from one school must not mute another; (c) RFC 8058 one-click unsubscribe needs a link that works without signing in. Every campaign email gets a footer link and `List-Unsubscribe: <url>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers. The link is `UNSUBSCRIBE_URL?m=<message id>&t=<token>`, the token is HMAC-SHA256 over the message id with `UNSUBSCRIBE_SECRET` (so no email address is ever in a URL, and a link cannot be forged for another address). `GET` shows a confirmation page with one button (mail scanners prefetch links, so `GET` never unsubscribes); `POST` (the button, or a mail client's one-click) records the opt-out. A spam complaint from the webhook also records one. Members see and undo it in Settings ("Campaign emails from Alpha School"). Workflow and task emails keep honouring `notification_prefs` as in Phase 4, and in-app campaigns are always delivered (spec §8: in-app cannot be muted).
  6. **Webhook.** `resend-webhook` (`verify_jwt = false`) reads `svix-id`, `svix-timestamp`, `svix-signature`; computes `v1,` + base64(HMAC-SHA256(secret, "<id>.<timestamp>.<raw body>")) with the base64-decoded part of `RESEND_WEBHOOK_SECRET` (`whsec_…`, read and validated at boot); accepts if any listed signature matches in constant time and the timestamp is within 5 minutes; otherwise **401 "Not allowed." and nothing is written or logged beyond the status**. It stores no event rows. Each tracking column is set to the **earliest** time seen, `least(coalesce(col, $at), $at)`, so a replay or an out-of-order retry changes nothing. A click also proves the open and delivery, and an open proves delivery (`email.clicked` sets all three). `email.complained` also adds an `email_optouts` row. An unknown `provider_id` answers 200 `{ matched: false }` (Resend retries on non-2xx, and the endpoint may also receive another environment's mail); other event types answer 200 `{ ignored: true }`. **Local path without Resend:** Mailpit's message id is already stored as `provider_id` (Phase 4), and `node scripts/webhook-event.mjs <type> <provider-id>` signs a fixture event with the same shared signer and posts it to the local function.
  7. **Stats are computed in SQL, never by summing capped pages in the browser.** `campaign_stats(org)` and `campaign_daily(campaign)` are `security invoker` over a new `messages_campaign_read` policy (`comms.broadcast`), so they count every row with no 1,000-row PostgREST cap. `campaign_completion(campaign)` is `security definer` and refuses unless the caller holds `comms.broadcast` **and** `records.view_all` for the linked workflow; linking a workflow requires that permission too (trigger), so completion counts never reveal records the viewer could not open. Percentages: delivered % of recipients, opened % and clicked % of delivered (an open or click proves delivery, decision 6); a zero denominator gives `null`, shown as "No data yet", never `NaN%` or 0%. Opens carry the label "Opens are approximate: Apple Mail Privacy Protection opens emails automatically."
  8. **In-app campaigns.** The template's channel decides. An in-app campaign writes one `messages` row per member (`channel 'in_app'`, `status 'sent'`, so the email worker never picks it up) plus one `notifications` row with `campaign_id`; reading the notification sets that message's `opened_at` through a trigger. Its report shows recipients and read % only, and its recipient table has the read time only (spec: "In-app campaigns report read only"). Addresses with no account cannot get an in-app notice and are counted as left out.
  9. **Recipient table and CSV.** The table pages through `messages` with PostgREST (`count: 'exact'`, 50 a page, "Showing 51–100 of 4,210"). CSV reads **every** row in keyset pages of 1,000 (`id > last`), checks the total against the exact count (a mismatch is an error "The list changed while it downloaded. Try again.", never a short file), and builds the file with Phase 5's `toCsv` (RFC 4180, BOM, formula-injection guard on every text cell) and `csvFilename`.
  10. **Statuses.** `draft → scheduled → sending → sent`, plus **`failed`** with `error` (spec §10: an explicit failed status with the reason). Only drafts are edited or deleted (RLS + column grants); `schedule_campaign` / `cancel_campaign` are the only status changes a client can make; a campaign that has started sending cannot be cancelled.
  11. **Templates in campaigns.** A campaign has no record, so it renders with an empty record context: only `{{org.name}}` and `{{recipient.name}}` have values. The editor warns ("This template uses {{record.title}}, which is empty in a campaign…") through the shared `campaignTemplateIssue`; the server renders the same way and appends the unsubscribe footer itself (templates cannot remove it).
  12. **Task order:** the database task first so `database.types.ts` knows the new tables; the shared module next (it needs nothing from the database, so it may run alongside Task 1); then the backend (`send-messages`, `send-campaigns`, `resend-webhook`, `unsubscribe`) and, once the designer's spec is in, the frontend in parallel with it; the documentation task last.
- **Shared module rules:** files under `supabase/functions/_shared/comms/` import only each other, `../forms/*.ts` and `../reports/*.ts`, always with the `.ts` extension. No `Deno.*`, `process`, `window`, npm or jsr imports (`crypto`, `btoa`, `atob` and `TextEncoder` are globals in both runtimes); erasable TypeScript only; tests use `node:test` + `node:assert/strict` and run under node and Deno.
- **Defect classes from Phase 1–5 QA that must not recur:**
  - **no silent truncation or caps** (QA-P4-1): the 10,000 cap fails the campaign with a sentence; role reads use cap + 1; every person left out (unsubscribed, no email, no account, listed twice) is counted in `campaigns.excluded` and stated on the report; the CSV refuses a short file; `send-messages` leaves anything past 1,000 a minute queued, never dropped; tests pin each;
  - **no raw error leaks** (QA-P4-3): `campaigns.error`, webhook and unsubscribe responses and every 500 carry fixed sentences; exception text goes to `console.error` only; the webhook never echoes the body or the signature;
  - **no "we" in copy** (QA-P5-9): every new sentence addresses "you" or names the organisation — including Edge Function 500s, the unsubscribe page and the email footer;
  - every client-visible write is audited (QA-7): `campaign.create/update/delete` by trigger, `campaign.schedule` and `campaign.cancel` in their RPCs;
  - no `security definer` function callable by clients unless meant to be (QA-5): `wake_send_campaigns` and every trigger function are revoked from `public, anon, authenticated`; `schedule_campaign`, `cancel_campaign`, `campaign_completion`, `my_member_email` check the caller themselves;
  - every new server message reaching `friendlyError` has an entry in `src/ui/errors.ts` with a test (QA-11);
  - TanStack Query keys carry `orgId`, and per-person results carry `userId` (QA-2): `['campaigns', orgId]`, `['campaign', id]`, `['campaign-stats', orgId]`, `['campaign-daily', id]`, `['campaign-completion', userId, id]`, `['campaign-recipients', id, filter, page]`, `['audience-size', userId, orgId, …]`, `['optout', userId, orgId]`;
  - a write RLS turns into 0 rows is reported (`.select()` on every update/delete); campaign saves detect concurrent edits on `updated_at` (Phase 2 pattern);
  - focus moves to the page heading when the row that triggered an action disappears (QA-8, QA-P4-2): campaign delete, schedule, cancel, follow-up creation (with `useFocusAfterRender`); the recipient filter keeps focus on the pressed segment;
  - unsaved campaign edits are guarded on hash change, sign-out and org switch (QA-P2-4): `useLeaveGuard`;
  - **no inline `style` props** (QA-P4-5): every new style is an `rnr-*` class in `src/index.css` from the designer's list; SVG geometry uses attributes;
  - **the layer trap**: `bundle.css` is unlayered and beats Tailwind utilities — never `rnr-card p-0`, `rnr-menu w-…`, `td.flex`; use the designer's classes;
  - a two-tab race shows the moved-on state (QA-P3-6): scheduling a campaign another tab already scheduled shows "Only a draft campaign can be scheduled." mapped to a sentence and refetches;
  - **test cleanup** (QA-P4-6): every real-database test deletes what it inserted (campaigns cascade to messages and notifications; bulk `auth.users`, members and roles are deleted by tag) in `finally`;
  - **no warm-up flakiness**: the new real-database tests use `postgres` directly and never Realtime or `functions serve`, so they need no warm-up; the README tells QA to wait for `supabase status` before running the Realtime test, as in Phase 4;
  - `shortcut:` notes always name the limit and when to upgrade.
- New secrets (function secrets, never `VITE_`): `RESEND_WEBHOOK_SECRET` (`whsec_…`, `resend-webhook`), `UNSUBSCRIBE_SECRET` (32+ characters, `send-campaigns` and `unsubscribe`), `UNSUBSCRIBE_URL` (the public URL of the `unsubscribe` function, `send-campaigns`). Each is read once at boot and a missing or malformed value stops the function before it serves. New Vault secret: `send_campaigns_url`.
- The Senior Designer's `docs/superpowers/design/phase-6-screens.md` (Task 7) is written before Tasks 8 and 9. Where it differs from this plan on a visual, copy or accessibility point, the design spec wins; behaviour, data and security stay as this plan says.

## Review Focus

1. **The webhook only trusts signed, fresh events and replays change nothing** → missing headers, a wrong secret, a tampered body and a timestamp 6 minutes old are refused; a valid one passes; a second delivery of the same event and an older retry keep the first time. (tests "a signature from the same secret verifies, any change is refused", "a stale or future timestamp is refused" in Task 2; "unsigned and badly signed requests are 401 and write nothing", "a replayed event changes nothing and an older one keeps the earliest time" in Task 5)
2. **An audience never contains people the sender cannot see** → a report audience scheduled by a member reaches only the starters of records that member can see; the same report scheduled by an admin with `records.view_all` reaches both; a sender without `comms.broadcast` fails the campaign. (test "real Postgres: a report audience is read with the sender's visibility" in Task 4)
3. **A campaign is sent exactly once under concurrent cron** → two overlapping runs over one due campaign queue each recipient once and claim it once. (tests "real Postgres: two overlapping runs send a campaign once" in Task 4; "a campaign another run claimed sends nothing" in Task 4)
4. **Large audiences are batched without silent drops** → 10,000 people queue exactly 10,000 messages in 10 chunks; 10,001 fail the campaign with the sentence and queue nothing; `send-messages` keeps sending batches until the queue is empty and leaves anything past 1,000 queued. (tests "10,000 people plan exactly and 10,001 are refused" in Task 2; "a 10,000-person audience is queued in ten chunks with nobody dropped" in Task 4; "a run keeps sending batches until the queue is empty", "past 1,000 emails a run the rest stay queued for the next minute" in Task 3)
5. **Opt-outs are honoured and counted** → an opted-out address is left out and counted; a duplicate is counted; the one-click POST records an opt-out, a forged token is refused; campaign emails carry the unsubscribe headers. (tests "opted-out, duplicate and unusable addresses are left out and counted" in Task 2; "an opted-out member is left out and counted" in Task 4; "a campaign email carries one-click unsubscribe headers; other emails carry none" in Task 3; "one-click POST unsubscribes, a forged token is refused" in Task 6; `email_optouts` policies in Task 1)
6. **Cross-org isolation** → Beta reads, edits and schedules no Alpha campaign, reads no Alpha campaign messages, stats or opt-outs; a follow-up cannot be built on another organisation's campaign. (`11_campaigns.test.sql` in Task 1; "a follow-up reaches who did not open; one built on another organisation's campaign fails" in Task 4)
7. **Percentages with zero denominators** → nothing delivered gives "No data yet" for opened and clicked, not `NaN%`; an empty in-app campaign likewise. (test "percentages are null when the denominator is zero" in Task 2)
8. **CSV guard** → a recipient email or error starting with `=`, `+`, `-` or `@` is written as text; the file has every row. (tests "recipient csv guards formulas and keeps every row" in Task 2; "csv refuses a short download" in Task 8)

---

## Owners and order

| Task | Owner | Depends on |
|---|---|---|
| 1. Database: campaigns, opt-outs, message links, RPCs, stats, cron | Backend engineer | — |
| 2. Shared: audience, recipient plan, percentages, footer, tokens, webhook signature, CSV | Backend engineer | — |
| 3. `send-messages`: run loop, rate-limit pause, unsubscribe headers, `sending → sent` | Backend engineer | 1, 2 |
| 4. Edge Function `send-campaigns`: claim, snapshot as the sender, plan, queue | Backend engineer | 1, 2, 3 |
| 5. Edge Function `resend-webhook` and the local fixture script | Backend engineer | 1, 2 |
| 6. Edge Function `unsubscribe` | Backend engineer | 1, 2 |
| 7. Design spec `phase-6-screens.md` | Senior Designer | — (parallel with 1–6) |
| 8. Frontend: data layer, routes, Campaigns list, editor, Settings opt-out | Frontend engineer | 1, 2, 7 |
| 9. Frontend: campaign report, chart, recipients, CSV, follow-ups, end-to-end check | Frontend engineer | 4, 5, 8 |
| 10. Documentation: README end to end, spec status, CI | Backend engineer | 1–9 |

Backend runs 1 and 2 (either order), then 3 → 4, with 5 and 6 any time after 1 and 2; the designer runs 7 alongside; the frontend engineer starts 8 once 1, 2 and 7 are committed, then 9 once 4 and 5 are in; Task 10 runs last.

---

## File Structure

```
supabase/migrations/20261018000001_campaigns.sql          campaigns, email_optouts, messages/notifications links, RPCs, stats, trigger, cron
supabase/tests/11_campaigns.test.sql
supabase/seed.sql                                         send_campaigns_url Vault secret
supabase/config.toml                                      [functions.send-campaigns|resend-webhook|unsubscribe] verify_jwt = false
supabase/functions/.env.example                           RESEND_WEBHOOK_SECRET, UNSUBSCRIBE_SECRET, UNSUBSCRIBE_URL
src/data/database.types.ts                                regenerated (pnpm db:types)
supabase/functions/_shared/comms/campaign.ts              Audience, readAudience, planRecipients, MAX_AUDIENCE, pct, pctText, campaignTiles,
                                                          excludedText, campaignTemplateIssue, campaignContext, withFooter, hmacSha256, sameText,
                                                          unsubscribeLink, checkUnsubscribe, readUnsubscribeConfig, recipientCsv
supabase/functions/_shared/comms/webhook.ts               readWebhookSecret, signWebhook, verifyWebhook, readTrackingEvent, TRACKING
supabase/functions/_shared/comms/campaign.test.ts         node + deno
supabase/functions/_shared/comms/webhook.test.ts          node + deno
supabase/functions/advance/engine.ts                      Tx.finishCampaigns
supabase/functions/advance/notify.ts                      MessageRow.unsubscribe_url; MAX_PEOPLE comment
supabase/functions/advance/pgStore.ts                     lockMessage reads unsubscribe_url; finishCampaigns
supabase/functions/advance/testkit.ts                     the same in the fake
supabase/functions/send-messages/handler.ts               run loop, paused outcome, headers, finishCampaigns
supabase/functions/send-messages/transport.ts             Mail.headers, rateLimited
supabase/functions/send-messages/handler.test.ts, transport.test.ts
supabase/functions/send-campaigns/store.ts                CampaignStore, CampaignTx, SenderReads, rows
supabase/functions/send-campaigns/handler.ts              sendCampaigns, CampaignProblem, PROBLEMS, CHUNK
supabase/functions/send-campaigns/pgStore.ts              pgCampaignStore (direct connection; asSender switches role)
supabase/functions/send-campaigns/handler.test.ts
supabase/functions/send-campaigns/db.test.ts              real Postgres, runs only with RNR_TEST_DB_URL
supabase/functions/send-campaigns/index.ts
supabase/functions/resend-webhook/handler.ts, handler.test.ts, index.ts
supabase/functions/unsubscribe/handler.ts, handler.test.ts, index.ts
scripts/webhook-event.mjs                                 signs and posts a fixture event to the local webhook
docs/superpowers/design/phase-6-screens.md                designer spec (Task 7)
src/campaigns/logic.ts                                    re-exports the shared campaign module for Vite
src/campaigns/api.ts                                      campaigns, schedule/cancel, stats, daily, completion, recipients, CSV, audience size, opt-out
src/campaigns/chart.ts, chart.test.ts                     dailyGeometry (pure)
src/campaigns/CampaignsPage.tsx                           list + New campaign dialog
src/campaigns/CampaignPage.tsx                            draft/scheduled/failed → editor, sending/sent → report
src/campaigns/CampaignEditor.tsx                          name, template, audience, linked workflow, schedule / send now
src/campaigns/CampaignReport.tsx                          tiles, chart, completion, follow-ups
src/campaigns/CampaignChart.tsx                           two-series line chart + table alternative
src/campaigns/RecipientTable.tsx                          filters, pager, CSV
src/comms/SettingsPage.tsx                                Campaign emails switch
src/rbac/route.ts, route.test.ts                          campaigns, campaign routes; broadcast perm
src/ui/errors.ts, errors.test.ts                          campaign messages
src/index.css                                             designer §12 classes
src/App.tsx                                               routes, nav (Campaigns)
.github/workflows/ci-v2.yml                               send-campaigns/db.test.ts in the env-gated step
README.md                                                 whole-v2 setup, env, deploy, tests (Task 10)
docs/superpowers/specs/2026-10-11-reportnoreport-v2-design.md   status line (Task 10)
```

---

### Task 1: Database — campaigns, opt-outs, message links, RPCs, stats, cron

**Owner:** Backend engineer · **Depends on:** —

**Files:**
- Create: `supabase/migrations/20261018000001_campaigns.sql`, `supabase/tests/11_campaigns.test.sql`
- Modify: `supabase/seed.sql`, `supabase/config.toml`, `src/data/database.types.ts` (regenerated)

**Interfaces:**
- Consumes: `orgs`, `members`, `roles`, `member_roles`, `workflows`, `workflow_access`, `records`, `message_templates`, `messages`, `notifications` (Phases 1–4), `has_permission(uuid, text)`, `has_permission(uuid, text, uuid)`, `audit(uuid, text, text, jsonb, jsonb)`, the `pg_cron` / `pg_net` / Vault pattern.
- Produces:
  - table `campaigns(id, org_id, name, template_id, audience jsonb, linked_workflow_id, status, scheduled_at, sent_by, audience_snapshot_at, channel, recipients, excluded jsonb, error, finished_at, created_by, updated_by, created_at, updated_at)`; client column grants: insert `(id, org_id, name, template_id, audience, linked_workflow_id)`, update `(name, template_id, audience, linked_workflow_id)`
  - table `email_optouts(org_id, email citext, reason 'unsubscribe'|'complaint'|'settings', created_at)`, PK `(org_id, email)`
  - `messages.unsubscribe_url text`, FK `messages (campaign_id, org_id) → campaigns`, unique index `messages_campaign_recipient (campaign_id, recipient_email)`, index `messages_provider_idx (provider_id)`; `notifications.campaign_id` + FK
  - policy `messages_campaign_read` (`comms.broadcast`)
  - `schedule_campaign(p_campaign uuid, p_at timestamptz default null) returns void` (definer; "Not allowed" 42501, "Only a draft campaign can be scheduled.", "Choose a message template before sending.", "Choose who receives this campaign before sending.", "Choose a time in the future.", "Choose a time within the next year.")
  - `cancel_campaign(p_campaign uuid) returns void` (definer; "Not allowed" 42501, "This campaign has started sending and cannot be changed.")
  - `campaign_stats(p_org uuid) returns table(campaign_id uuid, recipients int, queued int, sent int, failed int, delivered int, opened int, clicked int, bounced int, complained int)` (invoker)
  - `campaign_daily(p_campaign uuid) returns table(day int, opens int, clicks int)` (invoker; days 0–6 from `audience_snapshot_at`)
  - `campaign_completion(p_campaign uuid) returns table(people int, started int, finished int)` (definer; "Not allowed" 42501)
  - `my_member_email(p_org uuid) returns citext` (definer, the caller's own address only)
  - trigger `notifications_campaign_read`; `wake_send_campaigns()` (definer, revoked); cron job `send-campaigns`; Vault secret `send_campaigns_url` (seed)

- [ ] **Step 1: Write the failing test** — `supabase/tests/11_campaigns.test.sql`

```sql
begin;
select plan(42);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

\set alpha 0000000a-0000-0000-0000-000000000001
\set beta 0000000b-0000-0000-0000-000000000001
\set wf 0000000a-0000-0000-0000-00000000c001
\set camp 0000000a-0000-0000-0000-00000000f601
\set camp2 0000000a-0000-0000-0000-00000000f602
\set admin 00000000-0000-0000-0000-0000000000a2
\set member 00000000-0000-0000-0000-0000000000a3
\set viewer 00000000-0000-0000-0000-0000000000a4
\set betaowner 00000000-0000-0000-0000-0000000000b1

-- Drafts: comms.broadcast creates and edits; nobody writes status or results directly
select pg_temp.act_as(:'member');
select throws_ok(format($$ insert into campaigns (org_id, name) values (%L, 'x') $$, :'alpha'), '42501', null, 'a member cannot create a campaign');
select pg_temp.act_as(:'admin');
select lives_ok(format($$ insert into campaigns (id, org_id, name, template_id, audience) values (%L, %L, 'Term starts',
  (select id from message_templates where org_id = %L and kind = 'record_approved'),
  jsonb_build_object('kind', 'role', 'roleId', (select id from roles where org_id = %L and name = 'Member'))) $$,
  :'camp', :'alpha', :'alpha', :'alpha'), 'comms.broadcast creates a draft');
select isnt_empty(format($$ select 1 from audit_log where action = 'campaign.create' and target = %L $$, :'camp'), 'create audited');
select throws_ok(format($$ update campaigns set status = 'sent' where id = %L $$, :'camp'), '42501', null, 'status cannot be written directly');
select lives_ok(format($$ insert into campaigns (id, org_id, name) values (%L, %L, 'No template yet') $$, :'camp2', :'alpha'), 'a second draft without a template');
select lives_ok(format($$ update campaigns set linked_workflow_id = %L where id = %L $$, :'wf', :'camp'), 'records.view_all links a workflow');

-- Linking needs records.view_all for that workflow
reset role;
insert into workflow_access (workflow_id, org_id, role_id, can_start, can_view_all)
values (:'wf', :'alpha', (select id from roles where org_id = :'alpha' and name = 'Admin'), true, false)
on conflict (workflow_id, role_id) do update set can_view_all = false;
select pg_temp.act_as(:'admin');
update campaigns set linked_workflow_id = null where id = :'camp';
select throws_ok(format($$ update campaigns set linked_workflow_id = %L where id = %L $$, :'wf', :'camp'),
  'P0001', 'You can only link a workflow whose records you can all see.', 'linking needs records.view_all for that workflow');
reset role;
update workflow_access set can_view_all = true where workflow_id = :'wf' and role_id = (select id from roles where org_id = :'alpha' and name = 'Admin');
select pg_temp.act_as(:'admin');
update campaigns set linked_workflow_id = :'wf' where id = :'camp';

select pg_temp.act_as(:'member');
select is((select count(*)::int from campaigns), 0, 'a member reads no campaigns');
select pg_temp.act_as(:'betaowner');
select is((select count(*)::int from campaigns where org_id = :'alpha'), 0, 'beta reads no alpha campaigns');
select is_empty(format($$ update campaigns set name = 'x' where id = %L returning id $$, :'camp'), 'beta cannot edit an alpha campaign');

-- Scheduling and cancelling
select pg_temp.act_as(:'member');
select throws_ok(format($$ select schedule_campaign(%L) $$, :'camp'), '42501', null, 'a member cannot schedule');
select pg_temp.act_as(:'admin');
select throws_ok(format($$ select schedule_campaign(%L, now() - interval '1 hour') $$, :'camp'), 'P0001', 'Choose a time in the future.', 'a past time is refused');
select throws_ok(format($$ select schedule_campaign(%L) $$, :'camp2'), 'P0001', 'Choose a message template before sending.', 'no template, no schedule');
select lives_ok(format($$ select schedule_campaign(%L, now() + interval '1 hour') $$, :'camp'), 'comms.broadcast schedules a draft');
select results_eq(format($$ select status, sent_by from campaigns where id = %L $$, :'camp'),
  format($$ values ('scheduled'::text, %L::uuid) $$, :'admin'), 'scheduled, with the scheduler as sender');
select isnt_empty(format($$ select 1 from audit_log where action = 'campaign.schedule' and target = %L $$, :'camp'), 'schedule audited');
select is_empty(format($$ update campaigns set name = 'x' where id = %L returning id $$, :'camp'), 'a scheduled campaign cannot be edited');
select is_empty(format($$ delete from campaigns where id = %L returning id $$, :'camp'), 'a scheduled campaign cannot be deleted');
select throws_ok(format($$ select schedule_campaign(%L) $$, :'camp'), 'P0001', 'Only a draft campaign can be scheduled.', 'scheduling twice is refused');
select lives_ok(format($$ select cancel_campaign(%L) $$, :'camp'), 'cancelling returns it to draft');
select is((select status from campaigns where id = :'camp'), 'draft', 'back to draft');

-- A sent campaign with tracked messages, read by a broadcaster who does not manage messages
reset role;
insert into roles (id, org_id, name) values ('0000000a-0000-0000-0000-00000000f6f0', :'alpha', 'Broadcaster');
insert into role_permissions values ('0000000a-0000-0000-0000-00000000f6f0', 'comms.broadcast');
insert into member_roles select id, '0000000a-0000-0000-0000-00000000f6f0' from members where org_id = :'alpha' and user_id = :'viewer';
update campaigns set status = 'sent', scheduled_at = now() - interval '2 days', audience_snapshot_at = now() - interval '2 days', channel = 'email', recipients = 4
where id = :'camp';
insert into messages (org_id, campaign_id, recipient_user_id, recipient_email, subject, body_html, body_text, status, error, sent_at, delivered_at, opened_at, clicked_at, bounced_at) values
  (:'alpha', :'camp', :'member', 'member@alpha.test', 'Hi', '<p>Hi</p>', 'Hi', 'sent', null, now() - interval '2 days', now() - interval '2 days',
   now() - interval '2 days' + interval '1 hour', now() - interval '1 day' + interval '1 hour', null),
  (:'alpha', :'camp', :'admin', 'admin@alpha.test', 'Hi', '<p>Hi</p>', 'Hi', 'sent', null, now() - interval '2 days', now() - interval '2 days', null, null, null),
  (:'alpha', :'camp', null, 'bounce@example.test', 'Hi', '<p>Hi</p>', 'Hi', 'sent', null, now() - interval '2 days', null, null, null, now() - interval '2 days'),
  (:'alpha', :'camp', null, 'fail@example.test', 'Hi', '<p>Hi</p>', 'Hi', 'failed', 'The email service refused this message: HTTP 422', null, null, null, null, null),
  (:'alpha', null, :'member', 'member@alpha.test', 'Task', '<p>Task</p>', 'Task', 'sent', null, now(), null, null, null, null);
insert into records (org_id, workflow_id, title, current_node_id, status, started_by, created_at)
values (:'alpha', :'wf', 'Campaign completion test', null, 'done', :'member', now() - interval '1 day');

select pg_temp.act_as(:'member');
select is((select count(*)::int from messages where campaign_id = :'camp'), 0, 'a member reads no campaign messages');
select pg_temp.act_as(:'viewer');
select is((select count(*)::int from messages where campaign_id = :'camp'), 4, 'comms.broadcast reads campaign messages');
select is((select count(*)::int from messages where campaign_id is null), 0, 'but not workflow messages');
select results_eq(format($$ select recipients, queued, sent, failed, delivered, opened, clicked, bounced, complained from campaign_stats(%L) where campaign_id = %L $$, :'alpha', :'camp'),
  $$ values (4, 0, 3, 1, 2, 1, 1, 1, 0) $$, 'stats count every message');
select results_eq(format($$ select day, opens, clicks from campaign_daily(%L) $$, :'camp'),
  $$ values (0, 1, 0), (1, 0, 1), (2, 0, 0), (3, 0, 0), (4, 0, 0), (5, 0, 0), (6, 0, 0) $$, 'first opens and clicks per day for seven days');
select throws_ok(format($$ select * from campaign_completion(%L) $$, :'camp'), '42501', null, 'completion needs records.view_all for the workflow');
select pg_temp.act_as(:'member');
select is_empty(format($$ select 1 from campaign_stats(%L) $$, :'alpha'), 'a member gets no stats');
select pg_temp.act_as(:'admin');
select results_eq(format($$ select people, started, finished from campaign_completion(%L) $$, :'camp'),
  $$ values (2, 1, 1) $$, 'completion counts members who started and finished after the send');

-- In-app: reading the notice marks the message opened
reset role;
insert into messages (org_id, campaign_id, recipient_user_id, recipient_email, channel, subject, body_html, body_text, status, sent_at)
values (:'alpha', :'camp2', :'member', 'member@alpha.test', 'in_app', 'Hello', '<p>Hello</p>', 'Hello', 'sent', now());
insert into notifications (org_id, user_id, campaign_id, kind, title, body, link) values (:'alpha', :'member', :'camp2', 'campaign', 'Hello', 'Hello', '#/inbox');
select pg_temp.act_as(:'member');
update notifications set read_at = now() where campaign_id = :'camp2';
reset role;
select isnt((select opened_at from messages where campaign_id = :'camp2'), null, 'reading an in-app campaign notice marks it opened');

-- Opt-outs: a member manages only their own address; broadcasters read their org's list
select pg_temp.act_as(:'member');
select lives_ok(format($$ insert into email_optouts (org_id, email, reason) values (%L, 'member@alpha.test', 'settings') $$, :'alpha'), 'a member opts out their own address');
select throws_ok(format($$ insert into email_optouts (org_id, email, reason) values (%L, 'admin@alpha.test', 'settings') $$, :'alpha'), '42501', null, 'not someone else''s');
select throws_ok(format($$ insert into email_optouts (org_id, email, reason) values (%L, 'member@alpha.test', 'complaint') $$, :'alpha'), '42501', null, 'and not as a complaint');
select is((select count(*)::int from email_optouts), 1, 'a member reads their own opt-out');
select pg_temp.act_as(:'viewer');
select is((select count(*)::int from email_optouts where org_id = :'alpha'), 1, 'a broadcaster reads the org''s opt-outs');
select pg_temp.act_as(:'betaowner');
select is((select count(*)::int from email_optouts where org_id = :'alpha'), 0, 'beta reads no alpha opt-outs');
select pg_temp.act_as(:'member');
select isnt_empty(format($$ delete from email_optouts where org_id = %L returning email $$, :'alpha'), 'a member opts back in');

-- Guards
reset role;
select throws_ok(format($$ insert into messages (org_id, campaign_id, recipient_email, subject, body_html, body_text)
  values (%L, %L, 'MEMBER@alpha.test', 'Hi', 'x', 'x') $$, :'alpha', :'camp'), '23505', null, 'one message per address per campaign');
select isnt_empty($$ select 1 from cron.job where jobname = 'send-campaigns' $$, 'the send-campaigns cron job exists');
select pg_temp.act_as(:'admin');
select throws_ok($$ select wake_send_campaigns() $$, '42501', null, 'clients cannot wake the worker');
select isnt_empty(format($$ delete from campaigns where id = %L returning id $$, :'camp2'), 'a draft can be deleted');
select is_empty(format($$ delete from campaigns where id = %L returning id $$, :'camp'), 'a sent campaign cannot be deleted');

select * from finish();
rollback;
```

- [ ] **Step 2: Run — expect FAIL**

Run: `supabase test db`
Expected: `11_campaigns.test.sql` fails at `relation "campaigns" does not exist`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261018000001_campaigns.sql`

```sql
-- Phase 6 (spec §8.1): campaigns, per-organisation email opt-outs, campaign stats and the send-campaigns wake-up.

alter table message_templates add constraint message_templates_id_org_key unique (id, org_id);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  template_id uuid,
  audience jsonb not null default '{}' check (jsonb_typeof(audience) = 'object' and pg_column_size(audience) <= 2000),
  linked_workflow_id uuid,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  scheduled_at timestamptz,
  sent_by uuid references auth.users(id) on delete set null, -- who scheduled it: the audience is read with this person's visibility
  audience_snapshot_at timestamptz,
  channel text check (channel in ('email', 'in_app')),       -- the template's channel when the audience was taken
  recipients int check (recipients >= 0),
  excluded jsonb not null default '{}' check (jsonb_typeof(excluded) = 'object'),
  error text check (length(error) <= 500),
  finished_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  check (status = 'draft' or scheduled_at is not null),
  foreign key (template_id, org_id) references message_templates (id, org_id) on delete set null (template_id),
  foreign key (linked_workflow_id, org_id) references workflows (id, org_id) on delete set null (linked_workflow_id)
);
create index campaigns_org_idx on campaigns (org_id, created_at desc);
create index campaigns_due_idx on campaigns (scheduled_at) where status = 'scheduled';

alter table messages
  add column unsubscribe_url text check (length(unsubscribe_url) <= 500 and unsubscribe_url ~ '^https?://[^\s]+$'),
  add constraint messages_campaign_fk foreign key (campaign_id, org_id) references campaigns (id, org_id) on delete cascade;
-- One message per address per campaign: a second insert can never double-send, whatever else goes wrong.
create unique index messages_campaign_recipient on messages (campaign_id, recipient_email) where campaign_id is not null;
create index messages_provider_idx on messages (provider_id) where provider_id is not null;

alter table notifications
  add column campaign_id uuid,
  add constraint notifications_campaign_fk foreign key (campaign_id, org_id) references campaigns (id, org_id) on delete cascade;

-- Per organisation and by address (decision 5): report audiences include addresses that have no account.
create table email_optouts (
  org_id uuid not null references orgs(id) on delete cascade,
  email citext not null check (length(email) between 3 and 320),
  reason text not null check (reason in ('unsubscribe', 'complaint', 'settings')),
  created_at timestamptz not null default now(),
  primary key (org_id, email)
);

alter table campaigns enable row level security;
alter table email_optouts enable row level security;

create policy campaigns_read on campaigns for select using (has_permission(org_id, 'comms.broadcast'));
create policy campaigns_insert on campaigns for insert with check (has_permission(org_id, 'comms.broadcast') and status = 'draft');
create policy campaigns_update on campaigns for update
  using (has_permission(org_id, 'comms.broadcast') and status = 'draft')
  with check (has_permission(org_id, 'comms.broadcast') and status = 'draft');
create policy campaigns_delete on campaigns for delete using (has_permission(org_id, 'comms.broadcast') and status = 'draft');
-- Status, sender and results are written only by schedule_campaign, cancel_campaign and send-campaigns.
revoke insert, update on campaigns from anon, authenticated;
grant insert (id, org_id, name, template_id, audience, linked_workflow_id) on campaigns to authenticated;
grant update (name, template_id, audience, linked_workflow_id) on campaigns to authenticated;

create policy messages_campaign_read on messages for select
  using (campaign_id is not null and has_permission(org_id, 'comms.broadcast'));

create or replace function my_member_email(p_org uuid) returns citext
language sql stable security definer set search_path = public as $$
  select email from members where org_id = p_org and user_id = auth.uid() and status = 'active'
$$;

create policy email_optouts_read on email_optouts for select
  using (has_permission(org_id, 'comms.broadcast') or email = my_member_email(org_id));
create policy email_optouts_own_insert on email_optouts for insert
  with check (reason = 'settings' and email = my_member_email(org_id));
create policy email_optouts_own_delete on email_optouts for delete using (email = my_member_email(org_id));
-- No update policy; unsubscribe and resend-webhook insert with the direct connection.

create or replace function campaigns_before_write() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.org_id is distinct from old.org_id then raise exception 'Not allowed' using errcode = '42501'; end if;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  else
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;
  if new.linked_workflow_id is not null and auth.uid() is not null
     and (tg_op = 'INSERT' or new.linked_workflow_id is distinct from old.linked_workflow_id)
     and not has_permission(new.org_id, 'records.view_all', new.linked_workflow_id) then
    raise exception 'You can only link a workflow whose records you can all see.';
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;
create trigger campaigns_before_write before insert or update on campaigns for each row execute function campaigns_before_write();

-- Draft edits by trigger; scheduling and cancelling are audited by their RPCs; send-campaigns' status moves are not client writes.
create or replace function audit_campaigns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and not (old.status = 'draft' and new.status = 'draft') then return null; end if;
  perform audit(coalesce(new.org_id, old.org_id),
    case tg_op when 'INSERT' then 'campaign.create' when 'UPDATE' then 'campaign.update' else 'campaign.delete' end,
    coalesce(new.id, old.id)::text,
    case when tg_op = 'INSERT' then null else jsonb_build_object('name', old.name, 'template_id', old.template_id, 'audience', old.audience) end,
    case when tg_op = 'DELETE' then null else jsonb_build_object('name', new.name, 'template_id', new.template_id, 'audience', new.audience) end);
  return null;
end $$;
create trigger campaigns_audit after insert or update or delete on campaigns for each row execute function audit_campaigns();

-- In-app campaigns: reading the notice is the "open" (decision 8).
create or replace function notifications_campaign_read() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update messages set opened_at = coalesce(opened_at, new.read_at)
  where campaign_id = new.campaign_id and recipient_user_id = new.user_id and channel = 'in_app';
  return null;
end $$;
create trigger notifications_campaign_read after update of read_at on notifications
  for each row when (new.campaign_id is not null and new.read_at is not null and old.read_at is null)
  execute function notifications_campaign_read();

create or replace function wake_send_campaigns() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'send_campaigns_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb);
end $$;

create or replace function schedule_campaign(p_campaign uuid, p_at timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_c campaigns; v_at timestamptz := coalesce(p_at, now());
begin
  select * into v_c from campaigns where id = p_campaign for update;
  if v_c.id is null or not has_permission(v_c.org_id, 'comms.broadcast') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if v_c.status <> 'draft' then raise exception 'Only a draft campaign can be scheduled.'; end if;
  if v_c.template_id is null then raise exception 'Choose a message template before sending.'; end if;
  if coalesce(v_c.audience->>'kind', '') not in ('role', 'report', 'followup') then
    raise exception 'Choose who receives this campaign before sending.';
  end if;
  if v_at < now() - interval '1 minute' then raise exception 'Choose a time in the future.'; end if;
  if v_at > now() + interval '1 year' then raise exception 'Choose a time within the next year.'; end if;
  update campaigns set status = 'scheduled', scheduled_at = v_at, sent_by = auth.uid(), error = null where id = p_campaign;
  perform audit(v_c.org_id, 'campaign.schedule', p_campaign::text, null, jsonb_build_object('scheduled_at', v_at));
  if v_at <= now() then perform wake_send_campaigns(); end if; -- pg_net sends after commit
end $$;

create or replace function cancel_campaign(p_campaign uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_c campaigns;
begin
  select * into v_c from campaigns where id = p_campaign for update;
  if v_c.id is null or not has_permission(v_c.org_id, 'comms.broadcast') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if v_c.status not in ('scheduled', 'failed') then raise exception 'This campaign has started sending and cannot be changed.'; end if;
  update campaigns set status = 'draft', scheduled_at = null, error = null where id = p_campaign;
  perform audit(v_c.org_id, 'campaign.cancel', p_campaign::text, jsonb_build_object('status', v_c.status, 'error', v_c.error), null);
end $$;

-- Counted in SQL so no PostgREST page cap can shorten them (decision 7). RLS decides who gets rows.
create or replace function campaign_stats(p_org uuid) returns table (
  campaign_id uuid, recipients int, queued int, sent int, failed int, delivered int, opened int, clicked int, bounced int, complained int)
language sql stable security invoker set search_path = public as $$
  select m.campaign_id, count(*)::int,
    count(*) filter (where m.status = 'queued')::int, count(*) filter (where m.status = 'sent')::int,
    count(*) filter (where m.status = 'failed')::int, count(m.delivered_at)::int, count(m.opened_at)::int,
    count(m.clicked_at)::int, count(m.bounced_at)::int, count(m.complained_at)::int
  from messages m where m.org_id = p_org and m.campaign_id is not null
  group by m.campaign_id
$$;

create or replace function campaign_daily(p_campaign uuid) returns table (day int, opens int, clicks int)
language sql stable security invoker set search_path = public as $$
  with c as (select audience_snapshot_at as t0 from campaigns where id = p_campaign and audience_snapshot_at is not null)
  select d.day,
    (select count(*) from messages m where m.campaign_id = p_campaign
       and m.opened_at >= c.t0 + d.day * interval '1 day' and m.opened_at < c.t0 + (d.day + 1) * interval '1 day')::int,
    (select count(*) from messages m where m.campaign_id = p_campaign
       and m.clicked_at >= c.t0 + d.day * interval '1 day' and m.clicked_at < c.t0 + (d.day + 1) * interval '1 day')::int
  from c, generate_series(0, 6) d(day)
  order by d.day
$$;

-- Definer, so it can count every record of the linked workflow; it refuses anyone who could not see them all.
create or replace function campaign_completion(p_campaign uuid) returns table (people int, started int, finished int)
language plpgsql stable security definer set search_path = public as $$
declare v_c campaigns;
begin
  select * into v_c from campaigns where id = p_campaign;
  if v_c.id is null or v_c.linked_workflow_id is null or v_c.audience_snapshot_at is null
     or not has_permission(v_c.org_id, 'comms.broadcast')
     or not has_permission(v_c.org_id, 'records.view_all', v_c.linked_workflow_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  with people as (select distinct recipient_user_id as u from messages where campaign_id = p_campaign and recipient_user_id is not null),
       recs as (select r.started_by, bool_or(r.status = 'done') as done from records r
                where r.workflow_id = v_c.linked_workflow_id and r.created_at >= v_c.audience_snapshot_at group by r.started_by)
  select (select count(*) from people)::int,
         (select count(*) from people p join recs on recs.started_by = p.u)::int,
         (select count(*) from people p join recs on recs.started_by = p.u and recs.done)::int;
end $$;

revoke execute on function wake_send_campaigns(), campaigns_before_write(), audit_campaigns(), notifications_campaign_read()
  from public, anon, authenticated;
revoke execute on function schedule_campaign(uuid, timestamptz), cancel_campaign(uuid), campaign_stats(uuid), campaign_daily(uuid),
  campaign_completion(uuid), my_member_email(uuid) from public, anon;

-- Every minute: start campaigns that are due (schedule_campaign also wakes it at once for "Send now").
select cron.schedule('send-campaigns', '* * * * *', $cron$
  select public.wake_send_campaigns()
  where exists (select 1 from public.campaigns where status = 'scheduled' and scheduled_at <= now())
$cron$);
```

- [ ] **Step 4: Seed and config**

Append to `supabase/seed.sql`:
```sql
-- Phase 6: pg_cron / schedule_campaign → send-campaigns (local value only; hosted projects set their own, see README).
select vault.create_secret('http://host.docker.internal:54321/functions/v1/send-campaigns', 'send_campaigns_url');
```

Append to `supabase/config.toml`, after `[functions.run-report]`:
```toml
[functions.send-campaigns]
verify_jwt = false

# Resend signs its calls (Svix); the function verifies them itself.
[functions.resend-webhook]
verify_jwt = false

# Opened from an email by someone who may have no account; the signed token is the check.
[functions.unsubscribe]
verify_jwt = false
```

- [ ] **Step 5: Run — expect PASS**

Run: `supabase db reset && supabase test db`
Expected: `All tests successful.` — 11 files, 255 tests (213 + 42).

- [ ] **Step 6: Regenerate types**

Run: `pnpm db:types && pnpm build`
Expected: `src/data/database.types.ts` gains `campaigns`, `email_optouts`, `messages.unsubscribe_url`, `notifications.campaign_id`, `schedule_campaign`, `cancel_campaign`, `campaign_stats`, `campaign_daily`, `campaign_completion`, `my_member_email`; the build passes with `check-dist: ok`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261018000001_campaigns.sql supabase/tests/11_campaigns.test.sql supabase/seed.sql supabase/config.toml src/data/database.types.ts
git commit -m "feat: add campaigns, email opt-outs and campaign stats"
```

---
### Task 2: Shared — audience, recipient plan, percentages, footer, tokens, webhook signature, CSV

**Owner:** Backend engineer · **Depends on:** —

**Files:**
- Create: `supabase/functions/_shared/comms/campaign.ts`, `supabase/functions/_shared/comms/campaign.test.ts`, `supabase/functions/_shared/comms/webhook.ts`, `supabase/functions/_shared/comms/webhook.test.ts`

**Interfaces:**
- Consumes: `EMAIL_RE` (`./recipients.ts`), `escapeHtml`, `variablesIn`, `RenderContext`, `TemplateText` (`./render.ts`), `KEY_RE` (`../forms/schema.ts`), `toCsv`, `Cell` (`../reports/csv.ts`, `../reports/run.ts`).
- Produces (`campaign.ts`):
  - `MAX_AUDIENCE = 10_000`; `TOO_BIG`, `NOBODY` (sentences)
  - `type FollowupWho = 'not_opened' | 'not_completed'`
  - `type Audience = { kind: 'role'; roleId: string } | { kind: 'report'; reportId: string; to: 'starter' | { field: string } } | { kind: 'followup'; campaignId: string; who: FollowupWho }`
  - `readAudience(v: unknown): Audience | null`
  - `type Person = { userId: string; email: string; name: string }`, `type Found = { people: Person[]; emails: string[]; noEmail: number }`, `type Recipient = { userId: string | null; email: string; name: string }`, `type Excluded = { unsubscribed: number; duplicate: number; noEmail: number; noAccount: number }`
  - `planRecipients(found: Found, optedOut: ReadonlySet<string>, channel: 'email' | 'in_app'): { ok: true; list: Recipient[]; excluded: Excluded } | { ok: false; error: string }`
  - `pct(n: number, d: number): number | null`, `pctText(p: number | null): string`
  - `type Stats = { recipients; queued; sent; failed; delivered; opened; clicked; bounced; complained }` (all `number`), `NO_STATS: Stats`, `type Tile = { label: string; value: string; caption: string }`, `campaignTiles(s: Stats, channel: 'email' | 'in_app'): Tile[]`
  - `excludedText(x: Partial<Excluded>): string | null`
  - `CAMPAIGN_VARIABLES`, `campaignTemplateIssue(t: TemplateText): string | null`, `campaignContext(orgName: string, recipientName: string): RenderContext`
  - `withFooter(r: { html: string; text: string }, orgName: string, unsubscribeUrl: string): { html: string; text: string }`
  - `hmacSha256(key: Uint8Array<ArrayBuffer>, data: string): Promise<Uint8Array>`, `sameText(a: string, b: string): boolean`
  - `unsubscribeLink(base: string, secret: string, messageId: string): Promise<string>`, `checkUnsubscribe(secret: string, messageId: unknown, token: unknown): Promise<boolean>`, `readUnsubscribeConfig(url: string | undefined, secret: string | undefined): { url: string; secret: string }`
  - `type RecipientRow = { id: string; recipient_email: string; status: string; error: string | null; delivered_at: string | null; opened_at: string | null; clicked_at: string | null; bounced_at: string | null }`, `RECIPIENT_STATUS`, `recipientCsv(rows: RecipientRow[], channel: 'email' | 'in_app'): string`
- Produces (`webhook.ts`): `TOLERANCE_MS = 300_000`, `type TrackingColumn`, `TRACKING: Record<string, TrackingColumn[]>`, `type TrackingEvent = { providerId: string; columns: TrackingColumn[]; at: Date; complaint: boolean }`, `readWebhookSecret(raw: string | undefined): Uint8Array<ArrayBuffer>`, `signWebhook(secret: Uint8Array<ArrayBuffer>, id: string, timestamp: string, body: string): Promise<string>`, `type SignedHeaders = { id: string | null; timestamp: string | null; signature: string | null }`, `verifyWebhook(secret: Uint8Array<ArrayBuffer>, h: SignedHeaders, body: string, now: Date): Promise<boolean>`, `readTrackingEvent(body: unknown, now: Date): TrackingEvent | 'ignored' | null`

- [ ] **Step 1: Write the failing tests** — `supabase/functions/_shared/comms/campaign.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_AUDIENCE, NOBODY, NO_STATS, TOO_BIG, campaignTemplateIssue, campaignTiles, checkUnsubscribe, excludedText, pct, pctText,
  planRecipients, readAudience, readUnsubscribeConfig, recipientCsv, unsubscribeLink, withFooter, type Person,
} from './campaign.ts'

const ROLE = '0000000a-0000-0000-0000-00000000a001'
const person = (i: number): Person => ({ userId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, email: `p${i}@alpha.test`, name: `Person ${i}` })
const people = (n: number) => Array.from({ length: n }, (_, i) => person(i))
const NONE = new Set<string>()

test('reads the three audience kinds and refuses anything else', () => {
  assert.deepEqual(readAudience({ kind: 'role', roleId: ROLE }), { kind: 'role', roleId: ROLE })
  assert.deepEqual(readAudience({ kind: 'report', reportId: ROLE, to: 'starter' }), { kind: 'report', reportId: ROLE, to: 'starter' })
  assert.deepEqual(readAudience({ kind: 'report', reportId: ROLE, to: { field: 'email' } }), { kind: 'report', reportId: ROLE, to: { field: 'email' } })
  assert.deepEqual(readAudience({ kind: 'followup', campaignId: ROLE, who: 'not_opened' }), { kind: 'followup', campaignId: ROLE, who: 'not_opened' })
  for (const bad of [null, [], {}, { kind: 'role' }, { kind: 'role', roleId: 'x' }, { kind: 'role', roleId: ROLE, extra: 1 },
    { kind: 'report', reportId: ROLE, to: { field: 'Bad Key' } }, { kind: 'report', reportId: ROLE }, { kind: 'followup', campaignId: ROLE, who: 'all' },
    { kind: 'everyone' }]) assert.equal(readAudience(bad), null)
})

test('10,000 people plan exactly and 10,001 are refused', () => {
  const ok = planRecipients({ people: people(MAX_AUDIENCE), emails: [], noEmail: 0 }, NONE, 'email')
  assert.equal(ok.ok, true)
  assert.equal(ok.ok && ok.list.length, 10_000)
  assert.equal(ok.ok && new Set(ok.list.map((r) => r.email)).size, 10_000)
  assert.deepEqual(planRecipients({ people: people(MAX_AUDIENCE + 1), emails: [], noEmail: 0 }, NONE, 'email'), { ok: false, error: TOO_BIG })
})

test('opted-out, duplicate and unusable addresses are left out and counted', () => {
  const found = { people: [person(1), person(2), { ...person(3), email: 'P1@ALPHA.TEST' }], emails: ['p2@alpha.test', 'raw@example.test', 'not an email', ' Raw@Example.test '], noEmail: 2 }
  const plan = planRecipients(found, new Set(['p2@alpha.test']), 'email')
  assert.equal(plan.ok, true)
  if (!plan.ok) return
  assert.deepEqual(plan.list.map((r) => [r.userId, r.email]), [[person(1).userId, 'p1@alpha.test'], [null, 'raw@example.test']])
  assert.deepEqual(plan.excluded, { unsubscribed: 1, duplicate: 3, noEmail: 3, noAccount: 0 })
  // Nobody vanishes: everyone found is either on the list or counted as left out.
  const total = found.people.length + found.emails.length + found.noEmail
  assert.equal(plan.list.length + Object.values(plan.excluded).reduce((a, b) => a + b, 0), total)
})

test('in-app campaigns leave out addresses with no account and ignore opt-outs', () => {
  const plan = planRecipients({ people: [person(1)], emails: ['raw@example.test'], noEmail: 0 }, new Set(['p1@alpha.test']), 'in_app')
  assert.deepEqual(plan.ok && [plan.list.map((r) => r.email), plan.excluded], [['p1@alpha.test'], { unsubscribed: 0, duplicate: 0, noEmail: 0, noAccount: 1 }])
})

test('nobody left is refused with a sentence', () => {
  assert.deepEqual(planRecipients({ people: [person(1)], emails: [], noEmail: 0 }, new Set(['p1@alpha.test']), 'email'), { ok: false, error: NOBODY })
  assert.deepEqual(planRecipients({ people: [], emails: [], noEmail: 0 }, NONE, 'email'), { ok: false, error: NOBODY })
})

test('percentages are null when the denominator is zero', () => {
  assert.equal(pct(0, 0), null)
  assert.equal(pct(5, 0), null)
  assert.equal(pct(1, 3), 33.3)
  assert.equal(pct(2, 2), 100)
  assert.equal(pctText(null), 'No data yet')
  assert.equal(pctText(33.3), '33.3%')
  const tiles = campaignTiles({ ...NO_STATS, recipients: 3, sent: 3 }, 'email')
  assert.deepEqual(tiles.map((t) => [t.label, t.value]), [
    ['Recipients', '3'], ['Delivered', '0%'], ['Opened', 'No data yet'], ['Clicked', 'No data yet'], ['Bounced and failed', '0 · 0']])
  assert.deepEqual(campaignTiles(NO_STATS, 'in_app').map((t) => t.value), ['0', 'No data yet'])
})

test('tiles: opened and clicked are shares of delivered, and sending shows progress', () => {
  const s = { ...NO_STATS, recipients: 10_000, queued: 5_800, sent: 4_150, failed: 50, delivered: 4_000, opened: 1_000, clicked: 250, bounced: 12 }
  assert.deepEqual(campaignTiles(s, 'email').map((t) => [t.value, t.caption]), [
    ['10,000', '4,200 of 10,000 sent so far'], ['40%', '4,000 of 10,000'], ['25%', '1,000 of 4,000 delivered, approximate'],
    ['6.3%', '250 of 4,000 delivered'], ['12 · 50', '12 bounced, 50 failed']])
  assert.deepEqual(campaignTiles({ ...NO_STATS, recipients: 4, sent: 4, opened: 1 }, 'in_app').map((t) => [t.label, t.value, t.caption]),
    [['Recipients', '4', 'People sent an in-app notice'], ['Read', '25%', '1 of 4 read it']])
})

test('excludedText says who was left out, or nothing', () => {
  assert.equal(excludedText({ unsubscribed: 0, duplicate: 0, noEmail: 0, noAccount: 0 }), null)
  assert.equal(excludedText({}), null)
  assert.equal(excludedText({ unsubscribed: 2, duplicate: 1, noEmail: 1, noAccount: 0 }),
    '4 people were left out: 2 unsubscribed, 1 had no email address, 1 was listed twice.')
  assert.equal(excludedText({ noAccount: 1 }), '1 person was left out: 1 has no account for in-app notices.')
})

test('campaignTemplateIssue names the variables that are empty in a campaign', () => {
  assert.equal(campaignTemplateIssue({ subject: 'News from {{org.name}}', body: 'Hello {{recipient.name}}' }), null)
  assert.equal(campaignTemplateIssue({ subject: '{{record.title}}', body: 'See {{link.record}} and {{record.title}}' }),
    'This template uses {{record.title}}, {{link.record}}, which are empty in a campaign. Only {{org.name}} and {{recipient.name}} are filled in.')
})

test('the footer escapes the organisation name and links the unsubscribe page', () => {
  const out = withFooter({ html: '<p>Hi</p>', text: 'Hi' }, 'A & <B>', 'https://x.test/u?m=1&t=2')
  assert.match(out.html, /A &amp; &lt;B&gt;/)
  assert.match(out.html, /<a href="https:\/\/x\.test\/u\?m=1&amp;t=2">Unsubscribe from A &amp; &lt;B&gt; campaign emails<\/a>/)
  assert.match(out.text, /Unsubscribe from A & <B> campaign emails: https:\/\/x\.test\/u\?m=1&t=2$/)
  assert.doesNotMatch(`${out.html}${out.text}`, /\bwe\b/i)
})

test('unsubscribe tokens verify for their message only', async () => {
  const secret = 'a-local-unsubscribe-secret-of-32+chars'
  const m1 = '00000000-0000-4000-8000-000000000001'
  const link = await unsubscribeLink('https://x.test/functions/v1/unsubscribe', secret, m1)
  const u = new URL(link)
  assert.equal(u.searchParams.get('m'), m1)
  const t = u.searchParams.get('t')!
  assert.match(t, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(await checkUnsubscribe(secret, m1, t), true)
  assert.equal(await checkUnsubscribe(secret, '00000000-0000-4000-8000-000000000002', t), false)
  assert.equal(await checkUnsubscribe('another-secret-of-thirty-two-chars!!', m1, t), false)
  assert.equal(await checkUnsubscribe(secret, 'not-a-uuid', t), false)
  assert.equal(await checkUnsubscribe(secret, m1, null), false)
})

test('readUnsubscribeConfig refuses a relative URL, a query and a short secret', () => {
  const secret = 'x'.repeat(32)
  assert.deepEqual(readUnsubscribeConfig('http://127.0.0.1:54321/functions/v1/unsubscribe', secret), { url: 'http://127.0.0.1:54321/functions/v1/unsubscribe', secret })
  assert.throws(() => readUnsubscribeConfig('/functions/v1/unsubscribe', secret), /UNSUBSCRIBE_URL/)
  assert.throws(() => readUnsubscribeConfig('https://x.test/u?a=1', secret), /UNSUBSCRIBE_URL/)
  assert.throws(() => readUnsubscribeConfig('https://x.test/u', 'short'), /UNSUBSCRIBE_SECRET/)
  assert.throws(() => readUnsubscribeConfig(undefined, undefined), /UNSUBSCRIBE_URL/)
})

test('recipient csv guards formulas and keeps every row', () => {
  const row = (i: number, over = {}) => ({ id: `m${i}`, recipient_email: `p${i}@alpha.test`, status: 'sent', error: null, delivered_at: '2026-10-11T10:00:00.000Z', opened_at: null, clicked_at: null, bounced_at: null, ...over })
  const rows = [row(1, { recipient_email: '=HYPERLINK("x")@evil.test' }), row(2, { status: 'failed', error: '-1 refused' }), ...Array.from({ length: 1_498 }, (_, i) => row(i + 3))]
  const csv = recipientCsv(rows, 'email')
  const lines = csv.replace(/^﻿/, '').trimEnd().split('\r\n')
  assert.equal(lines[0], 'Email,Status,Delivered,Opened,Clicked,Bounced,Error')
  assert.equal(lines.length, 1_501)
  assert.equal(lines[1], `"'=HYPERLINK(""x"")@evil.test",Sent,2026-10-11T10:00:00.000Z,,,,`)
  assert.equal(lines[2], "p2@alpha.test,Failed,2026-10-11T10:00:00.000Z,,,,'-1 refused")
  assert.equal(recipientCsv([row(1, { opened_at: '2026-10-12T08:00:00.000Z' })], 'in_app').replace(/^﻿/, ''), 'Email,Read\r\np1@alpha.test,2026-10-12T08:00:00.000Z\r\n')
})
```

`supabase/functions/_shared/comms/webhook.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TRACKING, readTrackingEvent, readWebhookSecret, signWebhook, verifyWebhook } from './webhook.ts'

const SECRET = readWebhookSecret('whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw') // a fixture, not a real secret
const NOW = new Date('2026-10-11T12:00:00Z')
const TS = String(NOW.getTime() / 1000)
const BODY = JSON.stringify({ type: 'email.opened', created_at: '2026-10-11T11:59:00.000Z', data: { email_id: 'rs_1' } })

test('a signature from the same secret verifies, any change is refused', async () => {
  const signature = await signWebhook(SECRET, 'msg_1', TS, BODY)
  assert.match(signature, /^v1,[A-Za-z0-9+/]{43}=$/)
  assert.equal(await verifyWebhook(SECRET, { id: 'msg_1', timestamp: TS, signature }, BODY, NOW), true)
  assert.equal(await verifyWebhook(SECRET, { id: 'msg_1', timestamp: TS, signature }, BODY.replace('rs_1', 'rs_2'), NOW), false)
  assert.equal(await verifyWebhook(SECRET, { id: 'msg_2', timestamp: TS, signature }, BODY, NOW), false)
  assert.equal(await verifyWebhook(readWebhookSecret('whsec_b3RoZXItc2VjcmV0LW9mLXNpeHRlZW4='), { id: 'msg_1', timestamp: TS, signature }, BODY, NOW), false)
  for (const h of [{ id: null, timestamp: TS, signature }, { id: 'msg_1', timestamp: null, signature }, { id: 'msg_1', timestamp: TS, signature: null }, { id: 'msg_1', timestamp: TS, signature: 'v1,' }]) {
    assert.equal(await verifyWebhook(SECRET, h, BODY, NOW), false)
  }
})

test('a stale or future timestamp is refused', async () => {
  for (const offset of [-301, 301]) {
    const ts = String(NOW.getTime() / 1000 + offset)
    assert.equal(await verifyWebhook(SECRET, { id: 'msg_1', timestamp: ts, signature: await signWebhook(SECRET, 'msg_1', ts, BODY) }, BODY, NOW), false)
  }
  assert.equal(await verifyWebhook(SECRET, { id: 'msg_1', timestamp: '1e9', signature: 'v1,x' }, BODY, NOW), false)
})

test('several signatures: any match passes', async () => {
  const good = await signWebhook(SECRET, 'msg_1', TS, BODY)
  assert.equal(await verifyWebhook(SECRET, { id: 'msg_1', timestamp: TS, signature: `v1,AAAA ${good}` }, BODY, NOW), true)
})

test('reads tracking events; an open proves delivery, a click proves both', () => {
  assert.deepEqual(readTrackingEvent(JSON.parse(BODY), NOW), { providerId: 'rs_1', columns: ['delivered_at', 'opened_at'], at: new Date('2026-10-11T11:59:00.000Z'), complaint: false })
  assert.deepEqual(TRACKING['email.clicked'], ['delivered_at', 'opened_at', 'clicked_at'])
  const complained = readTrackingEvent({ type: 'email.complained', created_at: 'garbage', data: { email_id: 'rs_9' } }, NOW)
  assert.deepEqual(complained, { providerId: 'rs_9', columns: ['complained_at'], at: NOW, complaint: true })
  const future = readTrackingEvent({ type: 'email.delivered', created_at: '2026-10-12T00:00:00Z', data: { email_id: 'rs_1' } }, NOW)
  assert.equal(future !== 'ignored' && future?.at.getTime(), NOW.getTime())
})

test('other event types are ignored and malformed ones refused', () => {
  assert.equal(readTrackingEvent({ type: 'email.sent', data: { email_id: 'rs_1' } }, NOW), 'ignored')
  assert.equal(readTrackingEvent({ type: 'toString', data: { email_id: 'rs_1' } }, NOW), 'ignored')
  for (const bad of [null, [], { type: 'email.opened' }, { type: 'email.opened', data: {} }, { type: 'email.opened', data: { email_id: 'a b' } }]) {
    assert.equal(readTrackingEvent(bad, NOW), null)
  }
})

test('readWebhookSecret accepts whsec_ secrets only', () => {
  assert.equal(SECRET.length, 24)
  for (const bad of [undefined, '', 'MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw', 'whsec_short', 'whsec_not base64 at all!!']) {
    assert.throws(() => readWebhookSecret(bad), /RESEND_WEBHOOK_SECRET/)
  }
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test`
Expected: the two new files fail with `Cannot find module './campaign.ts'` / `'./webhook.ts'`.

- [ ] **Step 3: Write `campaign.ts`** — `supabase/functions/_shared/comms/campaign.ts`

```ts
import { KEY_RE } from '../forms/schema.ts'
import { toCsv } from '../reports/csv.ts'
import type { Cell } from '../reports/run.ts'
import { EMAIL_RE } from './recipients.ts'
import { escapeHtml, variablesIn, type RenderContext, type TemplateText } from './render.ts'

/** Same ceiling as run-report's MAX_SCAN, so a report audience is never cut by the reader either (decision 2). */
export const MAX_AUDIENCE = 10_000
export const TOO_BIG = 'This audience has more than 10,000 people, which is more than one campaign can send. Split it into smaller roles or reports.'
export const NOBODY = 'Nobody in this audience can receive this campaign. Check who it is for, then schedule it again.'

export type FollowupWho = 'not_opened' | 'not_completed'
export type Audience =
  | { kind: 'role'; roleId: string }
  | { kind: 'report'; reportId: string; to: 'starter' | { field: string } }
  | { kind: 'followup'; campaignId: string; who: FollowupWho }
export type Person = { userId: string; email: string; name: string }
export type Found = { people: Person[]; emails: string[]; noEmail: number }
export type Recipient = { userId: string | null; email: string; name: string }
export type Excluded = { unsubscribed: number; duplicate: number; noEmail: number; noAccount: number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const keys = (v: Record<string, unknown>) => Object.keys(v).length

export function readAudience(v: unknown): Audience | null {
  if (!isObj(v)) return null
  if (v.kind === 'role' && isUuid(v.roleId) && keys(v) === 2) return { kind: 'role', roleId: v.roleId }
  if (v.kind === 'report' && isUuid(v.reportId) && keys(v) === 3) {
    if (v.to === 'starter') return { kind: 'report', reportId: v.reportId, to: 'starter' }
    const to = v.to
    if (isObj(to) && keys(to) === 1 && typeof to.field === 'string' && KEY_RE.test(to.field)) return { kind: 'report', reportId: v.reportId, to: { field: to.field } }
    return null
  }
  if (v.kind === 'followup' && isUuid(v.campaignId) && (v.who === 'not_opened' || v.who === 'not_completed') && keys(v) === 3) {
    return { kind: 'followup', campaignId: v.campaignId, who: v.who }
  }
  return null
}

/**
 * De-duplicates by address, drops opted-out and unusable addresses, and counts every one it drops, so the report can
 * say who was left out. Refuses rather than cuts when more than MAX_AUDIENCE remain.
 */
export function planRecipients(found: Found, optedOut: ReadonlySet<string>, channel: 'email' | 'in_app'):
  { ok: true; list: Recipient[]; excluded: Excluded } | { ok: false; error: string } {
  const excluded: Excluded = { unsubscribed: 0, duplicate: 0, noEmail: found.noEmail, noAccount: 0 }
  const seen = new Set<string>()
  const list: Recipient[] = []
  const first = (email: string) => {
    if (seen.has(email)) { excluded.duplicate += 1; return false }
    seen.add(email)
    return true
  }
  for (const p of found.people) {
    const email = p.email.trim().toLowerCase()
    if (!first(email)) continue
    if (channel === 'email' && optedOut.has(email)) excluded.unsubscribed += 1
    else list.push({ userId: p.userId, email, name: p.name })
  }
  for (const raw of found.emails) {
    const email = raw.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) { excluded.noEmail += 1; continue }
    if (!first(email)) continue
    if (channel === 'in_app') excluded.noAccount += 1 // an in-app notice needs an account
    else if (optedOut.has(email)) excluded.unsubscribed += 1
    else list.push({ userId: null, email, name: email })
  }
  if (list.length > MAX_AUDIENCE) return { ok: false, error: TOO_BIG }
  if (!list.length) return { ok: false, error: NOBODY }
  return { ok: true, list, excluded }
}

/** One decimal place; null when there is nothing to divide by, so the screen says so instead of 0% or NaN%. */
export const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null)
const num = (n: number) => n.toLocaleString('en-GB')
export const pctText = (p: number | null) => (p === null ? 'No data yet' : `${p.toLocaleString('en-GB', { maximumFractionDigits: 1 })}%`)

export type Stats = { recipients: number; queued: number; sent: number; failed: number; delivered: number; opened: number; clicked: number; bounced: number; complained: number }
export const NO_STATS: Stats = { recipients: 0, queued: 0, sent: 0, failed: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 }
export type Tile = { label: string; value: string; caption: string }

/** Delivered is a share of recipients; opened and clicked are shares of delivered (decision 7). */
export function campaignTiles(s: Stats, channel: 'email' | 'in_app'): Tile[] {
  if (channel === 'in_app') {
    return [
      { label: 'Recipients', value: num(s.recipients), caption: 'People sent an in-app notice' },
      { label: 'Read', value: pctText(pct(s.opened, s.recipients)), caption: `${num(s.opened)} of ${num(s.recipients)} read it` },
    ]
  }
  return [
    { label: 'Recipients', value: num(s.recipients), caption: s.queued ? `${num(s.recipients - s.queued)} of ${num(s.recipients)} sent so far` : 'Emails in this campaign' },
    { label: 'Delivered', value: pctText(pct(s.delivered, s.recipients)), caption: `${num(s.delivered)} of ${num(s.recipients)}` },
    { label: 'Opened', value: pctText(pct(s.opened, s.delivered)), caption: `${num(s.opened)} of ${num(s.delivered)} delivered, approximate` },
    { label: 'Clicked', value: pctText(pct(s.clicked, s.delivered)), caption: `${num(s.clicked)} of ${num(s.delivered)} delivered` },
    { label: 'Bounced and failed', value: `${num(s.bounced)} · ${num(s.failed)}`, caption: `${num(s.bounced)} bounced, ${num(s.failed)} failed` },
  ]
}

export function excludedText(x: Partial<Excluded>): string | null {
  const parts: [number, string, string][] = [
    [x.unsubscribed ?? 0, 'unsubscribed', 'unsubscribed'],
    [x.noEmail ?? 0, 'had no email address', 'had no email address'],
    [x.noAccount ?? 0, 'has no account for in-app notices', 'have no account for in-app notices'],
    [x.duplicate ?? 0, 'was listed twice', 'were listed twice'],
  ]
  const shown = parts.filter(([n]) => n > 0)
  const total = shown.reduce((a, [n]) => a + n, 0)
  if (!total) return null
  return `${num(total)} ${total === 1 ? 'person was' : 'people were'} left out: ${shown.map(([n, one, many]) => `${num(n)} ${n === 1 ? one : many}`).join(', ')}.`
}

export const CAMPAIGN_VARIABLES = ['org.name', 'recipient.name'] as const
/** A campaign has no record, task or step, so every other variable renders empty (decision 11). */
export function campaignTemplateIssue(t: TemplateText): string | null {
  const empty = [...new Set(variablesIn(`${t.subject}\n${t.body}`))].filter((k) => !(CAMPAIGN_VARIABLES as readonly string[]).includes(k))
  if (!empty.length) return null
  return `This template uses ${empty.map((k) => `{{${k}}}`).join(', ')}, which ${empty.length === 1 ? 'is' : 'are'} empty in a campaign. Only {{org.name}} and {{recipient.name}} are filled in.`
}
export const campaignContext = (orgName: string, recipientName: string): RenderContext => ({
  record: { title: '', data: {} }, step: { assignee: { name: '' } }, link: { task: '', record: '', invite: '' },
  org: { name: orgName }, recipient: { name: recipientName },
})

/** Appended by the server to every campaign email; a template cannot remove it. */
export function withFooter(r: { html: string; text: string }, orgName: string, unsubscribeUrl: string) {
  const o = escapeHtml(orgName)
  return {
    html: `${r.html}\n<hr>\n<p>You receive this because ${o} sent it to you through ReportNoReport. <a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe from ${o} campaign emails</a>.</p>`,
    text: `${r.text}\n\n--\nYou receive this because ${orgName} sent it to you through ReportNoReport.\nUnsubscribe from ${orgName} campaign emails: ${unsubscribeUrl}`,
  }
}

const enc = new TextEncoder()
export async function hmacSha256(key: Uint8Array<ArrayBuffer>, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)))
}
/** Constant time for equal lengths, so a token cannot be guessed a character at a time. */
export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const token = async (secret: string, messageId: string) => b64url(await hmacSha256(enc.encode(secret), `unsubscribe:${messageId}`))

/** The message id, not the address, goes in the URL: no email address ever appears in a link (decision 5). */
export const unsubscribeLink = async (base: string, secret: string, messageId: string) => `${base}?m=${messageId}&t=${await token(secret, messageId)}`
export async function checkUnsubscribe(secret: string, messageId: unknown, t: unknown): Promise<boolean> {
  if (!isUuid(messageId) || typeof t !== 'string') return false
  return sameText(await token(secret, messageId), t)
}
/** Read when a function boots; throws so a bad setting stops it before it serves. */
export function readUnsubscribeConfig(url: string | undefined, secret: string | undefined): { url: string; secret: string } {
  let u: URL | null = null
  try { u = new URL(url ?? '') } catch { u = null }
  if (!u || !/^https?:$/.test(u.protocol) || u.search || u.hash || u.href !== url) {
    throw new Error('UNSUBSCRIBE_URL must be the absolute URL of the unsubscribe function, such as https://<ref>.supabase.co/functions/v1/unsubscribe.')
  }
  if (!secret || secret.length < 32) throw new Error('UNSUBSCRIBE_SECRET must be at least 32 characters.')
  return { url: u.href, secret }
}

export type RecipientRow = {
  id: string; recipient_email: string; status: string; error: string | null
  delivered_at: string | null; opened_at: string | null; clicked_at: string | null; bounced_at: string | null
}
export const RECIPIENT_STATUS: Record<string, string> = { queued: 'Waiting to send', sent: 'Sent', failed: 'Failed' }
/** Times stay ISO 8601 (UTC) in the file; Phase 5's toCsv guards every text cell against formulas. */
export function recipientCsv(rows: RecipientRow[], channel: 'email' | 'in_app'): string {
  if (channel === 'in_app') return toCsv(['Email', 'Read'], rows.map((r): Cell[] => [r.recipient_email, r.opened_at]))
  return toCsv(['Email', 'Status', 'Delivered', 'Opened', 'Clicked', 'Bounced', 'Error'], rows.map((r): Cell[] => [
    r.recipient_email, RECIPIENT_STATUS[r.status] ?? r.status, r.delivered_at, r.opened_at, r.clicked_at, r.bounced_at, r.error,
  ]))
}
```

- [ ] **Step 4: Write `webhook.ts`** — `supabase/functions/_shared/comms/webhook.ts`

```ts
import { hmacSha256, sameText } from './campaign.ts'

/** Svix's own tolerance: an older (or future) timestamp is a replay or a broken clock. */
export const TOLERANCE_MS = 5 * 60_000
export type TrackingColumn = 'delivered_at' | 'opened_at' | 'clicked_at' | 'bounced_at' | 'complained_at'
/** An open proves delivery; a click proves the open too, even when the reader blocks images (decision 6). */
export const TRACKING: Record<string, TrackingColumn[]> = {
  'email.delivered': ['delivered_at'],
  'email.opened': ['delivered_at', 'opened_at'],
  'email.clicked': ['delivered_at', 'opened_at', 'clicked_at'],
  'email.bounced': ['bounced_at'],
  'email.complained': ['complained_at'],
}
export type TrackingEvent = { providerId: string; columns: TrackingColumn[]; at: Date; complaint: boolean }
export type SignedHeaders = { id: string | null; timestamp: string | null; signature: string | null }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))

/** `whsec_` + base64, as the Resend webhook page shows it. Read once at boot. */
export function readWebhookSecret(raw: string | undefined): Uint8Array<ArrayBuffer> {
  const m = /^whsec_([A-Za-z0-9+/]{16,}={0,2})$/.exec(raw ?? '')
  if (!m) throw new Error('RESEND_WEBHOOK_SECRET must be the whsec_ signing secret from the Resend webhook page.')
  return Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0))
}

/** Svix scheme: v1 = base64(HMAC-SHA256(secret, "<id>.<timestamp>.<raw body>")). Also signs the local fixture events. */
export const signWebhook = async (secret: Uint8Array<ArrayBuffer>, id: string, timestamp: string, body: string) =>
  `v1,${b64(await hmacSha256(secret, `${id}.${timestamp}.${body}`))}`

export async function verifyWebhook(secret: Uint8Array<ArrayBuffer>, h: SignedHeaders, body: string, now: Date): Promise<boolean> {
  if (!h.id || !h.timestamp || !h.signature || !/^\d{1,12}$/.test(h.timestamp)) return false
  if (Math.abs(now.getTime() - Number(h.timestamp) * 1000) > TOLERANCE_MS) return false
  const want = await signWebhook(secret, h.id, h.timestamp, body)
  return h.signature.split(' ').some((s) => sameText(s, want)) // several signatures appear while a secret is rotated
}

/** A tracking event, 'ignored' for any other type, or null when the body is not a Resend event. */
export function readTrackingEvent(body: unknown, now: Date): TrackingEvent | 'ignored' | null {
  if (!isObj(body) || typeof body.type !== 'string' || !isObj(body.data)) return null
  const id = body.data.email_id
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) return null
  if (!Object.hasOwn(TRACKING, body.type)) return 'ignored'
  const t = typeof body.created_at === 'string' ? Date.parse(body.created_at) : Number.NaN
  const at = Number.isFinite(t) && t <= now.getTime() + TOLERANCE_MS ? new Date(t) : now
  return { providerId: id, columns: TRACKING[body.type], at, complaint: body.type === 'email.complained' }
}
```

Note: `readTrackingEvent({ type: 'toString', data: { email_id: 'rs_1' } })` is `'ignored'` because of `Object.hasOwn`, and a `future` timestamp falls back to `now`; both are pinned by the tests above.

- [ ] **Step 5: Run — expect PASS**

Run:
```bash
pnpm test
DENO_NO_PACKAGE_JSON=1 deno test --allow-read supabase/functions/_shared/comms
```
Expected: node `pass 212` (193 + 13 campaign + 6 webhook), `fail 0`; Deno runs the same 19 new tests, all `ok`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/comms/campaign.ts supabase/functions/_shared/comms/campaign.test.ts supabase/functions/_shared/comms/webhook.ts supabase/functions/_shared/comms/webhook.test.ts
git commit -m "feat: add shared campaign planning, unsubscribe tokens and webhook signatures"
```

---
### Task 3: `send-messages` — run loop, rate-limit pause, unsubscribe headers, `sending → sent`

**Owner:** Backend engineer · **Depends on:** 1, 2

**Files:**
- Modify: `supabase/functions/send-messages/handler.ts`, `supabase/functions/send-messages/transport.ts`, `supabase/functions/send-messages/handler.test.ts`, `supabase/functions/send-messages/transport.test.ts`, `supabase/functions/advance/engine.ts`, `supabase/functions/advance/notify.ts`, `supabase/functions/advance/pgStore.ts`, `supabase/functions/advance/testkit.ts`

**Interfaces:**
- Consumes: `messages.unsubscribe_url`, `campaigns.status` (Task 1); the Phase 4 `Store`/`Tx`, `sendOne`, `backoffMs`, `MAX_ATTEMPTS`.
- Produces:
  - `type Mail = { id; to; subject; html; text; headers?: Record<string, string> }`
  - `type SendResult = { ok: true; providerId: string | null } | { ok: false; retry: boolean; error: string; rateLimited?: true }`
  - `MessageRow` gains `unsubscribe_url: string | null`
  - `Tx.finishCampaigns(now: Date): Promise<number>` — moves `sending` campaigns with no queued message to `sent`, returns how many
  - `MAX_BATCHES = 20`, `RATE_LIMITED` (sentence); response body `{ overdue, sent, retrying, failed, paused, campaigns }`

- [ ] **Step 1: Write the failing tests**

In `supabase/functions/send-messages/handler.test.ts`, add `paused: 0, campaigns: 0` to the four existing `.body` assertions (lines 37, 41, 48, 55), e.g. `{ overdue: 0, sent: 1, retrying: 0, failed: 0, paused: 0, campaigns: 0 }`, then append:

```ts
import { MAX_BATCHES, RATE_LIMITED } from './handler.ts'
import { ORG } from '../_shared/forms/fixture.ts'

type Row = ReturnType<typeof setup>['db']['messages'][number]
function queue(s: ReturnType<typeof setup>, n: number, over: Partial<Row> = {}) {
  for (let i = 0; i < n; i++) {
    s.db.messages.push({
      id: `bulk${i}`, org_id: ORG, template_id: null, record_id: null, recipient_user_id: null, recipient_email: `p${i}@example.test`,
      subject: 'Hello', body_html: '<p>Hello</p>', body_text: 'Hello', status: 'queued', attempts: 0, error: null,
      next_attempt_at: new Date(0), sent_at: null, provider_id: null, unsubscribe_url: null, ...over,
    } as Row)
  }
}

Deno.test('a run keeps sending batches until the queue is empty', async () => {
  const s = setup()
  queue(s, 120)
  const { t, sent } = transport([{ ok: true, providerId: 'x' }])
  const res = await run(s.store, t, T0)
  assertEquals(res.body, { overdue: 0, sent: 120, retrying: 0, failed: 0, paused: 0, campaigns: 0 })
  assertEquals([sent.length, s.db.messages.filter((m) => m.status === 'queued').length], [120, 0])
})

Deno.test('past 1,000 emails a run the rest stay queued for the next minute', async () => {
  const s = setup()
  queue(s, 1_500)
  const { t, sent } = transport([{ ok: true, providerId: 'x' }])
  const res = await run(s.store, t, T0)
  assertEquals([MAX_BATCHES * 50, sent.length, (res.body as { sent: number }).sent], [1_000, 1_000, 1_000])
  const left = s.db.messages.filter((m) => m.status === 'queued')
  assertEquals([left.length, left.every((m) => m.attempts === 0 && m.error === null)], [500, true]) // waiting, not failed or dropped
})

Deno.test('a rate limit waits a minute without using an attempt and ends the run', async () => {
  const s = setup()
  queue(s, 3)
  const { t, sent } = transport([{ ok: false, retry: true, rateLimited: true, error: 'The email service refused this message: Too many requests' }])
  const res = await run(s.store, t, T0)
  assertEquals(res.body, { overdue: 0, sent: 0, retrying: 0, failed: 0, paused: 1, campaigns: 0 })
  assertEquals(sent.length, 1)
  const m = s.db.messages[0]
  assertEquals([m.status, m.attempts, m.error, m.next_attempt_at.toISOString()], ['queued', 0, RATE_LIMITED, at(MIN).toISOString()])
})

Deno.test('a campaign email carries one-click unsubscribe headers; other emails carry none', async () => {
  const s = setup()
  queue(s, 1, { id: 'camp1', unsubscribe_url: 'https://x.test/functions/v1/unsubscribe?m=1&t=2' })
  queue(s, 1, { id: 'task1', recipient_email: 'task@example.test' })
  const { t, sent } = transport([{ ok: true, providerId: 'x' }])
  await run(s.store, t, T0)
  assertEquals(sent.find((m) => m.id === 'camp1')?.headers, {
    'List-Unsubscribe': '<https://x.test/functions/v1/unsubscribe?m=1&t=2>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  })
  assertEquals(sent.find((m) => m.id === 'task1')?.headers, undefined)
})
```

(`queue` pushes duplicate ids `bulk0…` when called twice with the default id; the tests above call it at most once with the default.)

In `supabase/functions/send-messages/transport.test.ts`, change the 429 expectation to `{ ok: false, retry: true, rateLimited: true, error: 'The email service refused this message: Too many requests' }` and append:

```ts
Deno.test('resend and mailpit pass extra headers through', async () => {
  const headers = { 'List-Unsubscribe': '<https://x.test/u?m=1&t=2>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
  const rc: Call[] = []
  await resendTransport(KEY, FROM, fake(200, { id: 'rs_1' }, rc)).send({ ...mail, headers })
  assertEquals(JSON.parse(String(rc[0].init.body)).headers, headers)
  const mc: Call[] = []
  await mailpitTransport('http://mailpit.test', FROM, fake(200, { ID: 'mp_1' }, mc)).send({ ...mail, headers })
  assertEquals(JSON.parse(String(mc[0].init.body)).Headers, headers)
  const plain: Call[] = []
  await resendTransport(KEY, FROM, fake(200, { id: 'rs_2' }, plain)).send(mail)
  assertEquals('headers' in JSON.parse(String(plain[0].init.body)), false)
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `DENO_NO_PACKAGE_JSON=1 deno test --allow-read supabase/functions/send-messages`
Expected: type errors on `paused`, `rateLimited`, `unsubscribe_url`, `MAX_BATCHES`, `RATE_LIMITED`.

- [ ] **Step 3: Transport** — `supabase/functions/send-messages/transport.ts`

Change the two types and the two `send` bodies:

```ts
export type Mail = { id: string; to: string; subject: string; html: string; text: string; headers?: Record<string, string> }
export type SendResult = { ok: true; providerId: string | null } | { ok: false; retry: boolean; error: string; rateLimited?: true }
```

In `resendTransport`:
```ts
        body: JSON.stringify({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text, headers: m.headers }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok) return { ok: true, providerId: typeof body?.id === 'string' ? body.id : null }
      const error = `The email service refused this message: ${reason(body, res.status)}`
      if (res.status === 429) return { ok: false, retry: true, rateLimited: true, error }
      return { ok: false, retry: res.status >= 500, error }
```

In `mailpitTransport`:
```ts
        body: JSON.stringify({ From: { Email: sender.email, Name: sender.name }, To: [{ Email: m.to }], Subject: m.subject, HTML: m.html, Text: m.text, Headers: m.headers }),
```

(`JSON.stringify` leaves out an `undefined` property, so ordinary emails send exactly what they sent before.)

- [ ] **Step 4: Engine types, store and fake**

`supabase/functions/advance/notify.ts` — `MessageRow` and the `MAX_PEOPLE` comment:
```ts
export type MessageRow = { id: string; org_id: string; recipient_email: string; subject: string; body_html: string; body_text: string; attempts: number; unsubscribe_url: string | null }
```
```ts
/**
 * shortcut: a workflow message reaches at most 500 people (a role task notifies its first 500 holders by email order; a
 * larger Send message stops the record). Larger audiences are campaigns (send-campaigns), which batch through the queue.
 */
```

`supabase/functions/advance/engine.ts` — add to `Tx`, after `finishMessage`:
```ts
  /** Campaigns whose emails have all left the queue move from sending to sent; returns how many. */
  finishCampaigns(now: Date): Promise<number>
```

`supabase/functions/advance/pgStore.ts` — `lockMessage` selects the new column, and `finishCampaigns`:
```ts
    lockMessage: (id, now) => one<MessageRow>(t`
      select id, org_id, recipient_email::text as recipient_email, subject, body_html, body_text, attempts, unsubscribe_url from messages
      where id = ${id} and status = 'queued' and next_attempt_at <= ${now} for update skip locked`),
```
```ts
    finishCampaigns: async (now) => (await t`
      update campaigns c set status = 'sent', finished_at = ${now}
      where c.status = 'sending' and not exists (select 1 from messages m where m.campaign_id = c.id and m.status = 'queued')
      returning c.id`).length,
```

`supabase/functions/advance/testkit.ts` — `queueMessages` adds `unsubscribe_url: null` to each pushed row; `lockMessage` returns `unsubscribe_url: m.unsubscribe_url ?? null`; add `finishCampaigns: async () => 0` (the fake has no campaigns; the real query is covered by the Task 4 database test).

- [ ] **Step 5: Handler** — `supabase/functions/send-messages/handler.ts`

```ts
type Outcome = 'sent' | 'retrying' | 'failed' | 'paused'

export const MAX_ATTEMPTS = 4 // the first try plus 3 retries (spec §8)
/** 1, 2, then 4 minutes after the 1st, 2nd and 3rd failure. */
export const backoffMs = (attempts: number) => 60_000 * 2 ** (attempts - 1)
const BATCH = 50
// shortcut: at most 20 batches of 50 (1,000 emails) a run, so a 10,000-person campaign drains in ten minutes or more;
// move to Resend's batch endpoint when organisations need faster. Anything past the cap stays queued for the next minute.
export const MAX_BATCHES = 20
export const RATE_LIMITED = 'The email service asked to slow down. This email will be sent in a minute.'

/** Called by pg_cron every minute: overdue reminders first (they queue mail), then the queue in batches. One transaction per item. */
export async function sendMessages(deps: Deps): Promise<Result> {
  if (!deps.authorised) return { status: 401, body: { error: 'Not allowed.' } }
  const now = deps.now()
  const counts = { overdue: await queueOverdue(deps, now), sent: 0, retrying: 0, failed: 0, paused: 0, campaigns: 0 }
  batches: for (let b = 0; b < MAX_BATCHES; b++) {
    const ids = await deps.store.tx((tx) => tx.dueMessages(now, BATCH))
    if (!ids.length) break
    for (const id of ids) {
      const r = await deps.store.tx((tx) => sendOne(tx, id, deps.transport, now))
      if (r) counts[r] += 1
      if (r === 'paused') break batches // the provider is pacing us: the rest waits for the next run
    }
  }
  counts.campaigns = await deps.store.tx((tx) => tx.finishCampaigns(now))
  return { status: 200, body: counts }
}
```

`queueOverdue` is unchanged. `sendOne`:
```ts
async function sendOne(tx: Tx, id: string, transport: Transport, now: Date): Promise<Outcome | null> {
  const m = await tx.lockMessage(id, now)
  if (!m) return null // another run has it, or it is no longer due
  const attempts = m.attempts + 1
  // RFC 8058 one-click unsubscribe; only campaign emails have a link (decision 5).
  const headers = m.unsubscribe_url
    ? { 'List-Unsubscribe': `<${m.unsubscribe_url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    : undefined
  let res: SendResult
  try {
    res = await transport.send({ id: m.id, to: m.recipient_email, subject: m.subject, html: m.body_html, text: m.body_text, headers })
  } catch (e) {
    console.error('email transport threw', id, e) // detail stays in the server log; the stored reason is shown to admins
    res = { ok: false, retry: true, error: 'The email service could not be reached.' }
  }
  if (res.ok) {
    await tx.finishMessage(id, { status: 'sent', attempts, error: null, sentAt: now, providerId: res.providerId })
    return 'sent'
  }
  if (res.rateLimited) { // pacing, not a failure of this email: no attempt is spent
    await tx.finishMessage(id, { status: 'queued', attempts: m.attempts, error: RATE_LIMITED, nextAttemptAt: new Date(now.getTime() + 60_000) })
    return 'paused'
  }
  const error = res.error.slice(0, 500)
  if (res.retry && attempts < MAX_ATTEMPTS) {
    await tx.finishMessage(id, { status: 'queued', attempts, error, nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)) })
    return 'retrying'
  }
  await tx.finishMessage(id, { status: 'failed', attempts, error })
  return 'failed'
}
```

- [ ] **Step 6: Run — expect PASS**

Run: `DENO_NO_PACKAGE_JSON=1 deno test --allow-read supabase/functions`
Expected: the 4 new handler tests and the new transport test pass with everything before; the env-gated tests stay ignored. Then with `RNR_TEST_DB_URL` set, `send-messages/race.test.ts` still `ok | 1 passed` (it asserts counts, not the response body).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/send-messages supabase/functions/advance/engine.ts supabase/functions/advance/notify.ts supabase/functions/advance/pgStore.ts supabase/functions/advance/testkit.ts
git commit -m "feat: send the email queue in batches with unsubscribe headers and rate-limit pauses"
```

---
### Task 4: Edge Function `send-campaigns` — claim, snapshot as the sender, plan, queue

**Owner:** Backend engineer · **Depends on:** 1, 2, 3

**Files:**
- Create: `supabase/functions/send-campaigns/store.ts`, `handler.ts`, `pgStore.ts`, `handler.test.ts`, `db.test.ts`, `index.ts`
- Modify: `supabase/functions/.env.example`, `.github/workflows/ci-v2.yml`

**Interfaces:**
- Consumes: `campaigns`, `messages`, `notifications`, `email_optouts`, `members`, `member_roles`, `saved_reports`, `records` and RLS (Task 1); `readAudience`, `planRecipients`, `campaignContext`, `withFooter`, `unsubscribeLink`, `readUnsubscribeConfig`, `MAX_AUDIENCE` (Task 2); `render` (`_shared/comms/render.ts`); `EMAIL_RE`; `readReportDef`, `runReport`, `ReportRecord`; `MAX_SCAN`, `SavedRow` (`run-report/handler.ts`); `TemplateRow` (`advance/notify.ts`); `Result` (`advance/engine.ts`).
- Produces:
  - `store.ts`: `CampaignRow`, `CampaignMessage`, `CampaignNotice`, `Finish`, `SenderReads`, `CampaignTx`, `CampaignStore` (exact shapes below)
  - `handler.ts`: `type Deps = { authorised: boolean; store: CampaignStore; now(): Date; unsubscribe: { url: string; secret: string } }`, `sendCampaigns(deps: Deps): Promise<Result>` (body `{ started: number; failed: number }`), `class CampaignProblem extends Error`, `PROBLEMS`, `NOT_PREPARED`, `CHUNK = 1000`
  - `pgStore.ts`: `pgCampaignStore(url: string): CampaignStore & { end(): Promise<void> }`
  - POST `/functions/v1/send-campaigns` with `Authorization: Bearer <CRON_SECRET>`; 401 "Not allowed." otherwise; 500 "Sending did not start. It will try again in a minute."

- [ ] **Step 1: The store contract** — `supabase/functions/send-campaigns/store.ts`

```ts
import type { Excluded, FollowupWho, Person } from '../_shared/comms/campaign.ts'
import type { ReportRecord } from '../_shared/reports/index.ts'
import type { TemplateRow } from '../advance/notify.ts'
import type { SavedRow } from '../run-report/handler.ts'

export type CampaignRow = { id: string; org_id: string; name: string; template_id: string | null; audience: unknown; sent_by: string | null }
export type CampaignMessage = {
  id: string; org_id: string; campaign_id: string; template_id: string; recipient_user_id: string | null; recipient_email: string
  channel: 'email' | 'in_app'; status: 'queued' | 'sent'; subject: string; body_html: string; body_text: string
  unsubscribe_url: string | null; sent_at: Date | null
}
export type CampaignNotice = { org_id: string; user_id: string; campaign_id: string; kind: 'campaign'; title: string; body: string; link: string }
export type Finish = { recipients: number; excluded: Excluded; channel: 'email' | 'in_app'; status: 'sending' | 'sent'; at: Date }

/** Reads made with the sender's JWT claims and the authenticated role: RLS decides what exists (decision 1). */
export interface SenderReads {
  can(orgId: string, perm: string, workflowId?: string): Promise<boolean>
  savedReport(id: string, orgId: string): Promise<SavedRow | null>
  records(orgId: string, workflowId: string): AsyncIterable<ReportRecord[]>
}
export interface CampaignTx {
  dueCampaigns(now: Date, limit: number): Promise<string[]>
  /** scheduled → sending under the row lock; null when another run has it or it was cancelled. */
  claim(id: string, now: Date): Promise<CampaignRow | null>
  asSender<T>(userId: string, fn: (reads: SenderReads) => Promise<T>): Promise<T>
  template(orgId: string, id: string): Promise<TemplateRow | null>
  orgName(orgId: string): Promise<string>
  roleExists(orgId: string, roleId: string): Promise<boolean>
  roleMembers(orgId: string, roleId: string, limit: number): Promise<Person[]>
  /** Active members only; former members are left out (and counted by the caller). */
  peopleByIds(orgId: string, ids: string[]): Promise<Person[]>
  parent(orgId: string, id: string): Promise<{ status: string; linked_workflow_id: string | null } | null>
  parentRecipients(orgId: string, parentId: string, who: FollowupWho): Promise<{ userId: string | null; email: string }[]>
  /** Lower-cased addresses from `emails` that opted out of this organisation's campaigns. */
  optedOut(orgId: string, emails: string[]): Promise<Set<string>>
  queue(rows: CampaignMessage[]): Promise<void>
  notify(rows: CampaignNotice[]): Promise<void>
  finish(id: string, f: Finish): Promise<void>
  /** scheduled → failed with the reason; false when the campaign is no longer scheduled. */
  fail(id: string, error: string): Promise<boolean>
}
export interface CampaignStore { tx<T>(fn: (tx: CampaignTx) => Promise<T>): Promise<T> }
```

- [ ] **Step 2: Write the failing handler tests** — `supabase/functions/send-campaigns/handler.test.ts`

```ts
import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1'
import { CHUNK, NOT_PREPARED, PROBLEMS, sendCampaigns, type Deps } from './handler.ts'
import type { CampaignMessage, CampaignNotice, CampaignRow, CampaignStore, CampaignTx, Finish, SenderReads } from './store.ts'
import { MAX_AUDIENCE, TOO_BIG, type Person } from '../_shared/comms/campaign.ts'
import { rec } from '../_shared/reports/fixture.ts'
import type { ReportRecord } from '../_shared/reports/index.ts'
import type { TemplateRow } from '../advance/notify.ts'
import type { SavedRow } from '../run-report/handler.ts'

const ORG = '0000000a-0000-0000-0000-000000000001'
const C = '0000000a-0000-0000-0000-00000000f601'
const PARENT = '0000000a-0000-0000-0000-00000000f600'
const ROLE = '0000000a-0000-0000-0000-00000000a001'
const REPORT = '0000000a-0000-0000-0000-00000000e001'
const WF = '0000000a-0000-0000-0000-00000000c001'
const ADMIN = '00000000-0000-0000-0000-0000000000a2'
const MEMBER = '00000000-0000-0000-0000-0000000000a3'
const NOW = new Date('2026-10-11T12:00:00Z')
const UNSUB = { url: 'https://x.test/functions/v1/unsubscribe', secret: 'a-local-unsubscribe-secret-of-32+chars' }
const EMAIL_T: TemplateRow = { id: 't1', org_id: ORG, kind: 'custom', name: 'Term news', channel: 'email', subject: 'News from {{org.name}}', body: 'Hello {{recipient.name}}' }
const person = (i: number): Person => ({ userId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, email: `p${i}@alpha.test`, name: `Person ${i}` })
const people = (n: number) => Array.from({ length: n }, (_, i) => person(i))
const SAVED: SavedRow = { name: 'Staff', workflow_id: WF, columns: [{ meta: 'title' }], filters: [{ field: 'kind', operator: 'is', value: 'staff' }], group_by: null, aggregate: null }

type Parent = { status: string; linked_workflow_id: string | null; recipients: { userId: string | null; email: string; opened: boolean; done: boolean }[] }
type World = {
  campaign: CampaignRow & { status: string }
  templates: TemplateRow[]; roles: Map<string, Person[]>; members: Person[]; optouts: Set<string>
  perms: Map<string, Set<string>>; saved: Map<string, SavedRow>; records: ReportRecord[]; parents: Map<string, Parent>
  messages: CampaignMessage[]; notices: CampaignNotice[]; finished: Finish | null; failed: string | null; queueCalls: number; boom: boolean
}
const world = (over: Partial<World> = {}): World => ({
  campaign: { id: C, org_id: ORG, name: 'Term news', template_id: 't1', audience: { kind: 'role', roleId: ROLE }, sent_by: ADMIN, status: 'scheduled' },
  templates: [EMAIL_T], roles: new Map([[ROLE, [person(1), person(2)]]]),
  members: [person(1), person(2), { userId: MEMBER, email: 'member@alpha.test', name: 'Member' }, { userId: ADMIN, email: 'admin@alpha.test', name: 'Admin' }],
  optouts: new Set(),
  perms: new Map([[ADMIN, new Set(['comms.broadcast', 'reports.view', 'records.view_all'])], [MEMBER, new Set(['comms.broadcast', 'reports.view'])]]),
  saved: new Map([[REPORT, SAVED]]), records: [], parents: new Map(),
  messages: [], notices: [], finished: null, failed: null, queueCalls: 0, boom: false, ...over,
})
// RLS in miniature: records.view_all sees every record, anyone else only what they started.
const reads = (w: World, user: string): SenderReads => ({
  can: async (_o, perm) => w.perms.get(user)?.has(perm) ?? false,
  savedReport: async (id) => (w.perms.get(user)?.has('reports.view') ? w.saved.get(id) ?? null : null),
  async *records() { yield w.records.filter((r) => w.perms.get(user)?.has('records.view_all') || r.started_by === user) },
})
/** Writes land only when the transaction function resolves, like a commit; a throw leaves the world as it was. */
function store(w: World): CampaignStore {
  return {
    async tx<T>(fn: (tx: CampaignTx) => Promise<T>) {
      const p = { messages: [] as CampaignMessage[], notices: [] as CampaignNotice[], finished: null as Finish | null, claimed: false, failed: null as string | null, calls: 0 }
      const tx: CampaignTx = {
        dueCampaigns: async () => [w.campaign.id],
        claim: async (id) => (id === w.campaign.id && w.campaign.status === 'scheduled' ? (p.claimed = true, { ...w.campaign }) : null),
        asSender: (user, f) => f(reads(w, user)),
        template: async (org, id) => w.templates.find((t) => t.id === id && t.org_id === org) ?? null,
        orgName: async () => 'Alpha School',
        roleExists: async (_o, r) => w.roles.has(r),
        roleMembers: async (_o, r, limit) => (w.roles.get(r) ?? []).slice(0, limit),
        peopleByIds: async (_o, ids) => w.members.filter((m) => ids.includes(m.userId)),
        parent: async (org, id) => (org === ORG ? w.parents.get(id) ?? null : null),
        parentRecipients: async (_o, id, who) => (w.parents.get(id)?.recipients ?? [])
          .filter((r) => (who === 'not_opened' ? !r.opened : !!r.userId && !r.done)).map(({ userId, email }) => ({ userId, email })),
        optedOut: async (_o, emails) => new Set(emails.map((e) => e.toLowerCase()).filter((e) => w.optouts.has(e))),
        queue: async (rows) => {
          if (w.boom) throw new Error('connection reset by peer at 10.0.0.1:5432')
          p.messages.push(...rows)
          p.calls += 1
        },
        notify: async (rows) => { p.notices.push(...rows) },
        finish: async (_id, f) => { p.finished = f },
        fail: async (_id, error) => (w.campaign.status === 'scheduled' ? (p.failed = error, true) : false),
      }
      const out = await fn(tx)
      if (p.claimed) w.campaign.status = 'sending'
      if (p.finished) { w.campaign.status = p.finished.status; w.finished = p.finished }
      if (p.failed) { w.campaign.status = 'failed'; w.failed = p.failed }
      w.messages.push(...p.messages)
      w.notices.push(...p.notices)
      w.queueCalls += p.calls
      return out
    },
  }
}
const deps = (w: World, authorised = true): Deps => ({ authorised, store: store(w), now: () => NOW, unsubscribe: UNSUB })
const ZERO = { unsubscribed: 0, duplicate: 0, noEmail: 0, noAccount: 0 }

Deno.test('401 without the cron secret, and nothing is queued', async () => {
  const w = world()
  assertEquals((await sendCampaigns(deps(w, false))).status, 401)
  assertEquals([w.messages.length, w.campaign.status], [0, 'scheduled'])
})

Deno.test('a role campaign queues one email per member with the footer and an unsubscribe link', async () => {
  const w = world()
  assertEquals((await sendCampaigns(deps(w))).body, { started: 1, failed: 0 })
  assertEquals(w.messages.map((m) => [m.recipient_email, m.subject, m.status, m.channel]),
    [['p1@alpha.test', 'News from Alpha School', 'queued', 'email'], ['p2@alpha.test', 'News from Alpha School', 'queued', 'email']])
  const m = w.messages[0]
  assertMatch(m.unsubscribe_url!, new RegExp(`^https://x\\.test/functions/v1/unsubscribe\\?m=${m.id}&t=[A-Za-z0-9_-]{43}$`))
  assertMatch(m.body_text, /^Hello Person 1\n\n--\n/)
  assert(m.body_text.endsWith(`Unsubscribe from Alpha School campaign emails: ${m.unsubscribe_url}`))
  assertEquals(w.finished, { recipients: 2, excluded: ZERO, channel: 'email', status: 'sending', at: NOW })
  assertEquals(w.campaign.status, 'sending')
})

Deno.test('an opted-out member is left out and counted', async () => {
  const w = world({ optouts: new Set(['p2@alpha.test']) })
  await sendCampaigns(deps(w))
  assertEquals([w.messages.map((m) => m.recipient_email), w.finished?.excluded], [['p1@alpha.test'], { ...ZERO, unsubscribed: 1 }])
})

Deno.test('a 10,000-person audience is queued in ten chunks with nobody dropped', async () => {
  const w = world({ roles: new Map([[ROLE, people(MAX_AUDIENCE)]]) })
  await sendCampaigns(deps(w))
  assertEquals([w.messages.length, new Set(w.messages.map((m) => m.recipient_email)).size, w.queueCalls, CHUNK], [10_000, 10_000, 10, 1_000])
  assertEquals(w.finished?.recipients, 10_000)
  const over = world({ roles: new Map([[ROLE, people(MAX_AUDIENCE + 1)]]) })
  assertEquals((await sendCampaigns(deps(over))).body, { started: 0, failed: 1 })
  assertEquals([over.messages.length, over.campaign.status, over.failed], [0, 'failed', TOO_BIG])
})

Deno.test('a report audience is filtered and read with the sender\'s visibility', async () => {
  const records = [
    rec('r1', { kind: 'staff' }, { started_by: MEMBER }),
    rec('r2', { kind: 'staff' }, { started_by: ADMIN }),
    rec('r3', { kind: 'other' }, { started_by: MEMBER }),
  ]
  const audience = { kind: 'report', reportId: REPORT, to: 'starter' }
  const asMember = world({ records, campaign: { ...world().campaign, audience, sent_by: MEMBER } })
  await sendCampaigns(deps(asMember))
  assertEquals(asMember.messages.map((m) => m.recipient_email), ['member@alpha.test'])
  const asAdmin = world({ records, campaign: { ...world().campaign, audience, sent_by: ADMIN } })
  await sendCampaigns(deps(asAdmin))
  assertEquals(asAdmin.messages.map((m) => m.recipient_email).sort(), ['admin@alpha.test', 'member@alpha.test'])
})

Deno.test('an email answer audience counts the records without a usable address', async () => {
  const records = [rec('r1', { kind: 'staff', contact: 'Ext@Example.test' }), rec('r2', { kind: 'staff', contact: '' }), rec('r3', { kind: 'staff', contact: 'nope' })]
  const w = world({ records, campaign: { ...world().campaign, audience: { kind: 'report', reportId: REPORT, to: { field: 'contact' } } } })
  await sendCampaigns(deps(w))
  assertEquals([w.messages.map((m) => [m.recipient_email, m.recipient_user_id]), w.finished?.excluded], [[['ext@example.test', null]], { ...ZERO, noEmail: 2 }])
})

Deno.test('a grouped report, a missing template and a sender without comms.broadcast each fail with the reason', async () => {
  const grouped = world({ saved: new Map([[REPORT, { ...SAVED, group_by: { field: 'kind' }, aggregate: { fn: 'count' } }]]),
    campaign: { ...world().campaign, audience: { kind: 'report', reportId: REPORT, to: 'starter' } } })
  await sendCampaigns(deps(grouped))
  assertEquals([grouped.failed, grouped.messages.length], [PROBLEMS.grouped, 0])
  const noTemplate = world({ templates: [] })
  await sendCampaigns(deps(noTemplate))
  assertEquals(noTemplate.failed, PROBLEMS.template)
  const lost = world({ perms: new Map([[ADMIN, new Set(['reports.view'])]]) })
  await sendCampaigns(deps(lost))
  assertEquals([lost.failed, lost.messages.length], [PROBLEMS.senderLost, 0])
})

Deno.test('an in-app campaign writes notices and sent rows, and finishes at once', async () => {
  const w = world({ templates: [{ ...EMAIL_T, channel: 'in_app' }] })
  await sendCampaigns(deps(w))
  assertEquals(w.messages.map((m) => [m.channel, m.status, m.unsubscribe_url, m.sent_at?.toISOString()]),
    [['in_app', 'sent', null, NOW.toISOString()], ['in_app', 'sent', null, NOW.toISOString()]])
  assertEquals(w.notices.map((n) => [n.user_id, n.title, n.link, n.campaign_id]), [[person(1).userId, 'News from Alpha School', '#/inbox', C], [person(2).userId, 'News from Alpha School', '#/inbox', C]])
  assertEquals([w.campaign.status, w.finished?.status], ['sent', 'sent'])
})

Deno.test('a campaign another run claimed sends nothing', async () => {
  const w = world({ campaign: { ...world().campaign, status: 'sending' } })
  assertEquals((await sendCampaigns(deps(w))).body, { started: 0, failed: 0 })
  assertEquals([w.messages.length, w.failed], [0, null])
})

Deno.test('a follow-up reaches who did not open; one built on another organisation\'s campaign fails', async () => {
  const parent: Parent = { status: 'sent', linked_workflow_id: WF, recipients: [
    { userId: person(1).userId, email: 'p1@alpha.test', opened: true, done: true },
    { userId: person(2).userId, email: 'p2@alpha.test', opened: false, done: false },
    { userId: null, email: 'raw@example.test', opened: false, done: false },
  ] }
  const w = world({ parents: new Map([[PARENT, parent]]), campaign: { ...world().campaign, audience: { kind: 'followup', campaignId: PARENT, who: 'not_opened' } } })
  await sendCampaigns(deps(w))
  assertEquals(w.messages.map((m) => m.recipient_email), ['p2@alpha.test', 'raw@example.test'])
  const remind = world({ parents: new Map([[PARENT, parent]]), campaign: { ...world().campaign, audience: { kind: 'followup', campaignId: PARENT, who: 'not_completed' } } })
  await sendCampaigns(deps(remind))
  assertEquals(remind.messages.map((m) => m.recipient_email), ['p2@alpha.test'])
  const foreign = world({ campaign: { ...world().campaign, audience: { kind: 'followup', campaignId: '0000000b-0000-0000-0000-00000000f600', who: 'not_opened' } } })
  await sendCampaigns(deps(foreign))
  assertEquals([foreign.failed, foreign.messages.length], [PROBLEMS.parent, 0])
})

Deno.test('an unexpected error rolls everything back and fails with a plain sentence', async () => {
  const w = world({ boom: true })
  const errors: unknown[] = []
  const log = console.error
  console.error = (...a: unknown[]) => { errors.push(a) }
  try {
    assertEquals((await sendCampaigns(deps(w))).body, { started: 0, failed: 1 })
  } finally { console.error = log }
  assertEquals([w.messages.length, w.failed, w.campaign.status], [0, NOT_PREPARED, 'failed'])
  assert(!w.failed!.includes('10.0.0.1'))
  assertEquals(errors.length, 1) // the detail went to the log only
})
```

- [ ] **Step 3: Run — expect FAIL**

Run: `DENO_NO_PACKAGE_JSON=1 deno test --allow-read supabase/functions/send-campaigns`
Expected: `Module not found "…/send-campaigns/handler.ts"`.

- [ ] **Step 4: Write the handler** — `supabase/functions/send-campaigns/handler.ts`

```ts
import { MAX_AUDIENCE, campaignContext, planRecipients, readAudience, unsubscribeLink, withFooter, type Audience, type Found } from '../_shared/comms/campaign.ts'
import { EMAIL_RE } from '../_shared/comms/recipients.ts'
import { render } from '../_shared/comms/render.ts'
import { readReportDef, runReport, type ReportRecord } from '../_shared/reports/index.ts'
import type { Result } from '../advance/engine.ts'
import { MAX_SCAN } from '../run-report/handler.ts'
import type { CampaignMessage, CampaignNotice, CampaignRow, CampaignStore, CampaignTx } from './store.ts'

export type Deps = { authorised: boolean; store: CampaignStore; now(): Date; unsubscribe: { url: string; secret: string } }
/** A reason the campaign cannot be sent as it stands; its message is stored and shown as it is. */
export class CampaignProblem extends Error {}
function fail(message: string): never { throw new CampaignProblem(message) }

export const CHUNK = 1_000 // rows per insert; 10,000 people = 10 inserts in one transaction
const DUE = 5 // shortcut: five campaigns start per minute; raise when organisations schedule more at the same minute
export const NOT_PREPARED = 'This campaign could not be prepared. Edit it and schedule it again.'
export const PROBLEMS = {
  noSender: 'The person who scheduled this campaign is no longer a member. Edit it and schedule it again.',
  senderLost: 'The person who scheduled this campaign can no longer send campaigns. Ask someone who can to schedule it again.',
  template: 'The message template of this campaign no longer exists. Choose another and schedule it again.',
  audience: 'Who this campaign is for is incomplete. Edit it and schedule it again.',
  role: 'The role this campaign is for no longer exists. Choose another and schedule it again.',
  report: 'The report this campaign is for no longer exists, or the person who scheduled it cannot open it. Choose another and schedule it again.',
  reportBroken: 'The report this campaign is for needs fixing before it can choose recipients. Fix the report, then schedule the campaign again.',
  grouped: 'A grouped report cannot choose recipients, because it lists groups instead of people. Choose a report without grouping.',
  records: 'The report this campaign is for covers more than 10,000 records its sender can see, which is more than one campaign can read. Narrow the report.',
  parent: 'The campaign this follow-up is based on has not been sent, or no longer exists.',
  completion: 'Reminding non-completers needs a sent campaign with a linked workflow whose records the sender can all see.',
} as const

/** pg_cron every minute, and schedule_campaign at once for "Send now". One transaction per campaign. */
export async function sendCampaigns(deps: Deps): Promise<Result> {
  if (!deps.authorised) return { status: 401, body: { error: 'Not allowed.' } }
  const now = deps.now()
  const counts = { started: 0, failed: 0 }
  const ids = await deps.store.tx((tx) => tx.dueCampaigns(now, DUE))
  for (const id of ids) {
    try {
      if (await deps.store.tx((tx) => prepare(tx, id, deps, now))) counts.started += 1
    } catch (e) {
      if (!(e instanceof CampaignProblem)) console.error('campaign prepare failed', id, e) // detail stays in the server log
      const reason = e instanceof CampaignProblem ? e.message : NOT_PREPARED
      if (await deps.store.tx((tx) => tx.fail(id, reason))) counts.failed += 1
    }
  }
  return { status: 200, body: counts }
}

/** Claim, snapshot and queue in one transaction: a throw rolls all of it back, so a campaign is queued completely or not at all. */
async function prepare(tx: CampaignTx, id: string, deps: Deps, now: Date): Promise<boolean> {
  const c = await tx.claim(id, now)
  if (!c) return false // another run claimed it, or it was cancelled
  const sender = c.sent_by ?? fail(PROBLEMS.noSender)
  const audience = readAudience(c.audience) ?? fail(PROBLEMS.audience)
  const t = (c.template_id ? await tx.template(c.org_id, c.template_id) : null) ?? fail(PROBLEMS.template)
  const found = await resolveAudience(tx, c, sender, audience, now)
  const optedOut = t.channel === 'email' ? await tx.optedOut(c.org_id, [...found.people.map((p) => p.email), ...found.emails]) : new Set<string>()
  const plan = planRecipients(found, optedOut, t.channel)
  if (!plan.ok) fail(plan.error)

  const org = await tx.orgName(c.org_id)
  const rows: CampaignMessage[] = []
  for (const r of plan.list) {
    const messageId = crypto.randomUUID() // known before the insert, so the unsubscribe link can name it
    const out = render(t, campaignContext(org, r.name))
    const link = t.channel === 'email' ? await unsubscribeLink(deps.unsubscribe.url, deps.unsubscribe.secret, messageId) : null
    const body = link ? withFooter(out, org, link) : out
    rows.push({
      id: messageId, org_id: c.org_id, campaign_id: c.id, template_id: t.id, recipient_user_id: r.userId, recipient_email: r.email,
      channel: t.channel, status: t.channel === 'email' ? 'queued' : 'sent', subject: out.subject || t.name,
      body_html: body.html, body_text: body.text, unsubscribe_url: link, sent_at: t.channel === 'email' ? null : now,
    })
  }
  for (let i = 0; i < rows.length; i += CHUNK) await tx.queue(rows.slice(i, i + CHUNK))
  if (t.channel === 'in_app') {
    const notices: CampaignNotice[] = rows.flatMap((r) => (r.recipient_user_id
      ? [{ org_id: c.org_id, user_id: r.recipient_user_id, campaign_id: c.id, kind: 'campaign' as const, title: r.subject, body: r.body_text.slice(0, 2000), link: '#/inbox' }]
      : []))
    for (let i = 0; i < notices.length; i += CHUNK) await tx.notify(notices.slice(i, i + CHUNK))
  }
  await tx.finish(c.id, { recipients: rows.length, excluded: plan.excluded, channel: t.channel, status: t.channel === 'email' ? 'sending' : 'sent', at: now })
  return true
}

async function resolveAudience(tx: CampaignTx, c: CampaignRow, sender: string, a: Audience, now: Date): Promise<Found> {
  if (!(await tx.asSender(sender, (s) => s.can(c.org_id, 'comms.broadcast')))) fail(PROBLEMS.senderLost)
  if (a.kind === 'role') {
    if (!(await tx.roleExists(c.org_id, a.roleId))) fail(PROBLEMS.role)
    // One past the cap, so planRecipients refuses a role that is too big instead of cutting it (decision 2).
    return { people: await tx.roleMembers(c.org_id, a.roleId, MAX_AUDIENCE + 1), emails: [], noEmail: 0 }
  }
  if (a.kind === 'report') return reportAudience(tx, c, sender, a, now)
  return followupAudience(tx, c, sender, a)
}

async function reportAudience(tx: CampaignTx, c: CampaignRow, sender: string, a: Extract<Audience, { kind: 'report' }>, now: Date): Promise<Found> {
  // Read as the sender: saved_reports_read and records_read decide which report and records exist (decision 1).
  const picked = await tx.asSender(sender, async (s) => {
    if (!(await s.can(c.org_id, 'reports.view')) && !(await s.can(c.org_id, 'reports.manage'))) fail(PROBLEMS.report)
    const saved = (await s.savedReport(a.reportId, c.org_id)) ?? fail(PROBLEMS.report)
    const def = readReportDef(saved)
    if (!def.ok) fail(PROBLEMS.reportBroken)
    if (def.value.groupBy) fail(PROBLEMS.grouped)
    const records: ReportRecord[] = []
    for await (const page of s.records(c.org_id, saved.workflow_id)) {
      records.push(...page)
      if (records.length > MAX_SCAN) fail(PROBLEMS.records)
    }
    // Filters read answers and `now` (within_days); the step and person names only feed display columns nobody sees here.
    const result = runReport(records, def.value, { now, stepName: () => '', personName: () => '' }, null)
    if (result.kind !== 'rows') fail(PROBLEMS.grouped)
    const byId = new Map(records.map((r) => [r.id, r]))
    return result.rows.map((row) => byId.get(row.id) as ReportRecord)
  })
  if (a.to === 'starter') {
    const ids = [...new Set(picked.map((r) => r.started_by))] // one person however many records they started
    const people = await tx.peopleByIds(c.org_id, ids)
    return { people, emails: [], noEmail: ids.length - people.length } // former members have no address here
  }
  const field = a.to.field
  const emails: string[] = []
  let noEmail = 0
  for (const r of picked) {
    const v = r.data?.[field]
    if (typeof v === 'string' && EMAIL_RE.test(v.trim())) emails.push(v.trim())
    else noEmail += 1
  }
  return { people: [], emails, noEmail }
}

async function followupAudience(tx: CampaignTx, c: CampaignRow, sender: string, a: Extract<Audience, { kind: 'followup' }>): Promise<Found> {
  const parent = (await tx.parent(c.org_id, a.campaignId)) ?? fail(PROBLEMS.parent) // scoped to this organisation
  if (parent.status !== 'sent') fail(PROBLEMS.parent)
  if (a.who === 'not_completed') {
    const wf = parent.linked_workflow_id ?? fail(PROBLEMS.completion)
    if (!(await tx.asSender(sender, (s) => s.can(c.org_id, 'records.view_all', wf)))) fail(PROBLEMS.completion)
  }
  const rows = await tx.parentRecipients(c.org_id, a.campaignId, a.who)
  const ids = [...new Set(rows.flatMap((r) => (r.userId ? [r.userId] : [])))]
  const people = await tx.peopleByIds(c.org_id, ids) // still active members only
  return { people, emails: rows.filter((r) => !r.userId).map((r) => r.email), noEmail: ids.length - people.length }
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `DENO_NO_PACKAGE_JSON=1 deno test --allow-read supabase/functions/send-campaigns`
Expected: `ok | 11 passed`.

- [ ] **Step 6: The Postgres store** — `supabase/functions/send-campaigns/pgStore.ts`

```ts
import postgres from 'npm:postgres@3.4.5'
import type { Person } from '../_shared/comms/campaign.ts'
import type { ReportRecord } from '../_shared/reports/index.ts'
import type { TemplateRow } from '../advance/notify.ts'
import type { SavedRow } from '../run-report/handler.ts'
import type { CampaignRow, CampaignStore, CampaignTx, SenderReads } from './store.ts'

const NIL = '00000000-0000-0000-0000-000000000000'
const PAGE = 1000
const MESSAGE = ['id', 'org_id', 'campaign_id', 'template_id', 'recipient_user_id', 'recipient_email', 'channel', 'status', 'subject', 'body_html', 'body_text', 'unsubscribe_url', 'sent_at']
const NOTICE = ['org_id', 'user_id', 'campaign_id', 'kind', 'title', 'body', 'link']

/** Connects as `postgres`; asSender switches to the authenticated role with the sender's claims so RLS applies to those reads. */
export function pgCampaignStore(url: string): CampaignStore & { end(): Promise<void> } {
  const sql = postgres(url, { max: 2, prepare: false, onnotice: () => {} })
  return {
    tx: <T>(fn: (tx: CampaignTx) => Promise<T>) => sql.begin((t) => fn(campaignTx(t))) as Promise<T>,
    end: () => sql.end(),
  }
}

function campaignTx(t: postgres.TransactionSql): CampaignTx {
  const one = async <R>(q: Promise<readonly unknown[]>) => ((await q)[0] as R | undefined) ?? null
  const person = t`m.user_id as "userId", m.email::text as email, coalesce(nullif(btrim(m.full_name), ''), m.email::text) as name`
  const rows = (r: unknown) => r as Record<string, postgres.ParameterOrJSON<never>>[]
  return {
    dueCampaigns: async (now, limit) =>
      (await t`select id from campaigns where status = 'scheduled' and scheduled_at <= ${now} order by scheduled_at limit ${limit}`).map((r) => r.id as string),
    // The row lock makes a concurrent run wait here, then find the status changed and get no row (decision 3).
    claim: (id, now) => one<CampaignRow>(t`
      update campaigns set status = 'sending' where id = ${id} and status = 'scheduled' and scheduled_at <= ${now}
      returning id, org_id, name, template_id, audience, sent_by`),
    asSender: async (userId, fn) => {
      await t`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`
      await t`set local role authenticated`
      try {
        return await fn(senderReads(t))
      } finally {
        // After a SQL error the transaction is already aborting and RESET fails; the rollback restores the role anyway.
        await t`reset role`.catch(() => undefined)
      }
    },
    template: (org, id) => one<TemplateRow>(t`select id, org_id, kind, name, channel, subject, body from message_templates where id = ${id} and org_id = ${org}`),
    orgName: async (org) => (await one<{ name: string }>(t`select name from orgs where id = ${org}`))?.name ?? '',
    roleExists: async (org, role) => (await t`select 1 from roles where id = ${role} and org_id = ${org}`).length > 0,
    roleMembers: async (org, role, limit) => [...await t<Person[]>`
      select ${person} from members m join member_roles mr on mr.member_id = m.id
      where m.org_id = ${org} and m.status = 'active' and mr.role_id = ${role} order by m.email limit ${limit}`],
    peopleByIds: async (org, ids) => (ids.length
      ? [...await t<Person[]>`select ${person} from members m where m.org_id = ${org} and m.status = 'active' and m.user_id in ${t(ids)} order by m.email`]
      : []),
    parent: (org, id) => one<{ status: string; linked_workflow_id: string | null }>(t`select status, linked_workflow_id from campaigns where id = ${id} and org_id = ${org}`),
    parentRecipients: async (org, id, who) => [...(who === 'not_opened'
      ? await t<{ userId: string | null; email: string }[]>`
          select recipient_user_id as "userId", recipient_email::text as email from messages
          where campaign_id = ${id} and org_id = ${org} and status = 'sent' and opened_at is null and bounced_at is null and complained_at is null`
      : await t<{ userId: string | null; email: string }[]>`
          select m.recipient_user_id as "userId", m.recipient_email::text as email from messages m join campaigns c on c.id = m.campaign_id
          where m.campaign_id = ${id} and m.org_id = ${org} and m.recipient_user_id is not null and m.status = 'sent'
            and not exists (select 1 from records r where r.workflow_id = c.linked_workflow_id and r.started_by = m.recipient_user_id
                            and r.created_at >= c.audience_snapshot_at and r.status = 'done')`)],
    optedOut: async (org, emails) => new Set(emails.length
      ? (await t`select lower(email::text) as e from email_optouts where org_id = ${org} and email in ${t(emails)}`).map((r) => r.e as string)
      : []),
    queue: async (r) => { await t`insert into messages ${t(rows(r), MESSAGE)}` },
    notify: async (r) => { await t`insert into notifications ${t(rows(r), NOTICE)}` },
    finish: async (id, f) => {
      await t`update campaigns set status = ${f.status}, recipients = ${f.recipients}, excluded = ${t.json(f.excluded)}, channel = ${f.channel},
        audience_snapshot_at = ${f.at}, finished_at = ${f.status === 'sent' ? f.at : null} where id = ${id}`
    },
    fail: async (id, error) => (await t`update campaigns set status = 'failed', error = ${error} where id = ${id} and status = 'scheduled' returning id`).length === 1,
  }
}

function senderReads(t: postgres.TransactionSql): SenderReads {
  return {
    can: async (org, perm, wf) => (wf
      ? await t`select has_permission(${org}::uuid, ${perm}, ${wf}::uuid) as ok`
      : await t`select has_permission(${org}::uuid, ${perm}) as ok`)[0].ok === true,
    savedReport: async (id, org) => ((await t`
      select name, workflow_id, columns, filters, group_by, aggregate from saved_reports where id = ${id} and org_id = ${org}`)[0] as SavedRow | undefined) ?? null,
    // Keyset by id, like run-report's callerSource; RLS (records_read) filters every page.
    async *records(org, wf) {
      let last = NIL
      for (;;) {
        const page = await t`
          select id, title, status, label, current_node_id, started_by, created_at::text as created_at, updated_at::text as updated_at, data
          from records where org_id = ${org} and workflow_id = ${wf} and id > ${last} order by id limit ${PAGE}`
        yield page as unknown as ReportRecord[]
        if (page.length < PAGE) return
        last = page[page.length - 1].id as string
      }
    },
  }
}
```

- [ ] **Step 7: The entry point** — `supabase/functions/send-campaigns/index.ts`

```ts
import { sendCampaigns } from './handler.ts'
import { pgCampaignStore } from './pgStore.ts'
import { readUnsubscribeConfig } from '../_shared/comms/campaign.ts'

// Throws at boot on a missing or malformed setting, before any campaign is touched.
const unsubscribe = readUnsubscribeConfig(Deno.env.get('UNSUBSCRIBE_URL'), Deno.env.get('UNSUBSCRIBE_SECRET'))
const store = pgCampaignStore(Deno.env.get('SUPABASE_DB_URL')!)
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  const secret = Deno.env.get('CRON_SECRET') ?? ''
  try {
    const authorised = secret.length >= 16 && req.headers.get('Authorization') === `Bearer ${secret}`
    const res = await sendCampaigns({ authorised, store, now: () => new Date(), unsubscribe })
    return json(res.status, res.body)
  } catch (e) {
    console.error('send-campaigns failed', e)
    return json(500, { error: 'Sending did not start. It will try again in a minute.' })
  }
})
```

Append to `supabase/functions/.env.example`:
```
# Campaigns: the public URL of the unsubscribe function, and the secret that signs its links (32+ characters).
UNSUBSCRIBE_URL=http://127.0.0.1:54321/functions/v1/unsubscribe
UNSUBSCRIBE_SECRET=
# The whsec_ signing secret from the Resend webhook page (hosted), or any whsec_ value locally for scripts/webhook-event.mjs.
RESEND_WEBHOOK_SECRET=
```

- [ ] **Step 8: Write the real-database tests** — `supabase/functions/send-campaigns/db.test.ts`

```ts
import { assertEquals } from 'jsr:@std/assert@1'
import postgres from 'npm:postgres@3.4.5'
import { PROBLEMS, sendCampaigns, type Deps } from './handler.ts'
import { pgCampaignStore } from './pgStore.ts'
import { ADMIN, MEMBER, WF } from '../_shared/workflow/fixture.ts'

const url = Deno.permissions.querySync({ name: 'env', variable: 'RNR_TEST_DB_URL' }).state === 'granted'
  ? Deno.env.get('RNR_TEST_DB_URL')
  : undefined
const ALPHA = '0000000a-0000-0000-0000-000000000001'
const VIEWER = '00000000-0000-0000-0000-0000000000a4'
const UNSUB = { url: 'http://127.0.0.1:54321/functions/v1/unsubscribe', secret: 'a-local-unsubscribe-secret-of-32+chars' }

async function campaign(sql: postgres.Sql, name: string, audience: unknown, sentBy: string): Promise<string> {
  const [c] = await sql`
    insert into campaigns (org_id, name, template_id, audience, status, scheduled_at, sent_by)
    values (${ALPHA}, ${name}, (select id from message_templates where org_id = ${ALPHA} and kind = 'record_approved'),
            ${sql.json(audience as postgres.JSONValue)}, 'scheduled', now() - interval '1 minute', ${sentBy})
    returning id`
  return c.id as string
}

Deno.test({
  name: 'real Postgres: two overlapping runs send a campaign once',
  ignore: !url,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const sql = postgres(url!, { max: 1 })
    const store = pgCampaignStore(url!)
    const tag = crypto.randomUUID().slice(0, 8)
    try {
      // 1,200 people, so the insert spans two chunks
      const [role] = await sql`insert into roles (org_id, name) values (${ALPHA}, ${`Bulk ${tag}`}) returning id`
      await sql`insert into auth.users (id, email, instance_id, aud, role)
        select gen_random_uuid(), 'bulk' || g || '-' || ${tag} || '@bulk.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
        from generate_series(1, 1200) g`
      await sql`insert into members (org_id, user_id, email, status)
        select ${ALPHA}, id, email, 'active' from auth.users where email like ${`bulk%-${tag}@bulk.test`}`
      await sql`insert into member_roles (member_id, role_id) select id, ${role.id} from members where org_id = ${ALPHA} and email like ${`bulk%-${tag}@bulk.test`}`
      const id = await campaign(sql, `Bulk ${tag}`, { kind: 'role', roleId: role.id }, ADMIN)
      const deps: Deps = { authorised: true, store, now: () => new Date(), unsubscribe: UNSUB }
      const [a, b] = await Promise.all([sendCampaigns(deps), sendCampaigns(deps)])
      const started = [a, b].map((r) => (r.body as { started: number }).started).sort()
      const [row] = await sql`select c.status, c.recipients,
        (select count(*)::int from messages where campaign_id = c.id) as messages,
        (select count(distinct recipient_email)::int from messages where campaign_id = c.id) as addresses,
        (select count(*)::int from messages where campaign_id = c.id and unsubscribe_url is not null) as links
        from campaigns c where c.id = ${id}`
      assertEquals([started, row.status, row.recipients, row.messages, row.addresses, row.links], [[0, 1], 'sending', 1200, 1200, 1200, 1200])
    } finally {
      await sql`delete from campaigns where name = ${`Bulk ${tag}`}` // messages cascade
      await sql`delete from members where org_id = ${ALPHA} and email like ${`bulk%-${tag}@bulk.test`}` // member_roles cascade
      await sql`delete from auth.users where email like ${`bulk%-${tag}@bulk.test`}`
      await sql`delete from roles where org_id = ${ALPHA} and name = ${`Bulk ${tag}`}`
      await store.end()
      await sql.end()
    }
  },
})

Deno.test({
  name: 'real Postgres: a report audience is read with the sender\'s visibility',
  ignore: !url,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const sql = postgres(url!, { max: 1 })
    const store = pgCampaignStore(url!)
    const tag = crypto.randomUUID().slice(0, 8)
    try {
      // The member may broadcast and view reports, but sees only the records they started.
      const [role] = await sql`insert into roles (org_id, name) values (${ALPHA}, ${`Broadcast ${tag}`}) returning id`
      await sql`insert into role_permissions values (${role.id}, 'comms.broadcast')`
      await sql`insert into member_roles select id, ${role.id} from members where org_id = ${ALPHA} and user_id = ${MEMBER}`
      await sql`insert into records (org_id, workflow_id, title, current_node_id, data, started_by) values
        (${ALPHA}, ${WF}, 'Audience member', null, ${sql.json({ tag })}, ${MEMBER}),
        (${ALPHA}, ${WF}, 'Audience admin', null, ${sql.json({ tag })}, ${ADMIN})`
      const [report] = await sql`insert into saved_reports (org_id, workflow_id, name, columns, filters)
        values (${ALPHA}, ${WF}, ${`Audience ${tag}`}, ${sql.json([{ meta: 'title' }])}, ${sql.json([{ field: 'tag', operator: 'is', value: tag }])}) returning id`
      const audience = { kind: 'report', reportId: report.id, to: 'starter' }
      const asMember = await campaign(sql, `Audience ${tag} member`, audience, MEMBER)
      const asAdmin = await campaign(sql, `Audience ${tag} admin`, audience, ADMIN)
      const asViewer = await campaign(sql, `Audience ${tag} viewer`, audience, VIEWER)
      await sendCampaigns({ authorised: true, store, now: () => new Date(), unsubscribe: UNSUB })
      const to = async (id: string) => (await sql`select recipient_email::text as e from messages where campaign_id = ${id} order by 1`).map((r) => r.e)
      assertEquals(await to(asMember), ['member@alpha.test'])
      assertEquals(await to(asAdmin), ['admin@alpha.test', 'member@alpha.test'])
      const [v] = await sql`select status, error from campaigns where id = ${asViewer}`
      assertEquals([v.status, v.error, (await to(asViewer)).length], ['failed', PROBLEMS.senderLost, 0])
    } finally {
      await sql`delete from campaigns where name like ${`Audience ${tag}%`}`
      await sql`delete from saved_reports where name = ${`Audience ${tag}`}`
      await sql`delete from records where data->>'tag' = ${tag}`
      await sql`delete from roles where org_id = ${ALPHA} and name = ${`Broadcast ${tag}`}` // member_roles and role_permissions cascade
      await store.end()
      await sql.end()
    }
  },
})
```

Run (with `supabase start` and the seed loaded):
```bash
RNR_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres DENO_NO_PACKAGE_JSON=1 \
deno test --allow-env --allow-net supabase/functions/send-campaigns/db.test.ts
```
Expected: `ok | 2 passed`. Without the variable both are reported as ignored.

- [ ] **Step 9: CI** — in `.github/workflows/ci-v2.yml`, add `supabase/functions/send-campaigns/db.test.ts` to the env-gated step's `deno test` file list and its comment:

```yaml
      # Real-database tests the plain `deno test` job skips: advance and send-messages races, campaign exactly-once and
      # audience visibility, run-report visibility, Realtime isolation.
      - name: Env-gated Edge tests
        env: { DENO_NO_PACKAGE_JSON: "1" }
        run: |
          eval "$(supabase status -o env)"
          export RNR_TEST_SUPABASE_URL="$API_URL" RNR_TEST_ANON_KEY="$ANON_KEY" RNR_TEST_DB_URL="$DB_URL"
          deno test --allow-env --allow-net --allow-read \
            supabase/functions/advance/race.test.ts supabase/functions/send-messages/race.test.ts \
            supabase/functions/send-campaigns/db.test.ts \
            supabase/functions/run-report/visibility.test.ts supabase/functions/_integration/realtime.test.ts
```

- [ ] **Step 10: Run — expect PASS**

Run: `DENO_NO_PACKAGE_JSON=1 deno test --allow-read supabase/functions`
Expected: every test passes; the env-gated ones (now 8) are ignored without their variables.

- [ ] **Step 11: Commit**

```bash
git add supabase/functions/send-campaigns supabase/functions/.env.example ../.github/workflows/ci-v2.yml
git commit -m "feat: send campaigns once to an audience read with the sender's visibility"
```

(Every command in this plan runs from `v2/`; the workflow file lives at the repository root, hence `../.github/…`.)

---
### Task 5: Edge Function `resend-webhook` and the local fixture script

**Owner:** Backend engineer · **Depends on:** 1, 2

**Files:**
- Create: `supabase/functions/resend-webhook/handler.ts`, `pgApply.ts`, `handler.test.ts`, `db.test.ts`, `index.ts`, `scripts/webhook-event.mjs`
- Modify: `.github/workflows/ci-v2.yml` (add `resend-webhook/db.test.ts` to the env-gated list from Task 4)

**Interfaces:**
- Consumes: `verifyWebhook`, `readTrackingEvent`, `readWebhookSecret`, `signWebhook`, `TrackingEvent` (Task 2); `messages.provider_id` + tracking columns, `email_optouts` (Task 1).
- Produces:
  - `type Deps = { secret: Uint8Array<ArrayBuffer>; now(): Date; apply(e: TrackingEvent): Promise<boolean> }`, `handleWebhook(headers: Headers, body: string, deps: Deps): Promise<Result>`, `MAX_BODY = 64_000`
  - `pgApply(sql: postgres.Sql): (e: TrackingEvent) => Promise<boolean>` — true when a message matched
  - POST `/functions/v1/resend-webhook`: 200 `{ matched: boolean }` / `{ ignored: true }`; 400 "Not a Resend event."; 401 "Not allowed."; 405; 413 "Too large."; 500 "Not recorded. Resend will try again."
  - `node scripts/webhook-event.mjs <type> <provider-id> [url]`

- [ ] **Step 1: Write the failing handler tests** — `supabase/functions/resend-webhook/handler.test.ts`

```ts
import { assertEquals } from 'jsr:@std/assert@1'
import { MAX_BODY, handleWebhook, type Deps } from './handler.ts'
import { readWebhookSecret, signWebhook, type TrackingEvent } from '../_shared/comms/webhook.ts'

const SECRET = readWebhookSecret('whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw')
const NOW = new Date('2026-10-11T12:00:00Z')
const TS = String(NOW.getTime() / 1000)
const event = (type: string, id = 'rs_1') => JSON.stringify({ type, created_at: '2026-10-11T11:58:00.000Z', data: { email_id: id } })
async function signed(body: string, over: Record<string, string> = {}) {
  return new Headers({ 'svix-id': 'msg_1', 'svix-timestamp': TS, 'svix-signature': await signWebhook(SECRET, 'msg_1', TS, body), ...over })
}
function deps(matched = true) {
  const applied: TrackingEvent[] = []
  const d: Deps = { secret: SECRET, now: () => NOW, apply: (e) => { applied.push(e); return Promise.resolve(matched) } }
  return { d, applied }
}

Deno.test('unsigned and badly signed requests are 401 and write nothing', async () => {
  const { d, applied } = deps()
  const body = event('email.opened')
  const stale = String(NOW.getTime() / 1000 - 600)
  const cases = [
    new Headers(),
    await signed(body, { 'svix-signature': 'v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' }),
    await signed(event('email.opened', 'rs_2')), // signed for another body
    new Headers({ 'svix-id': 'msg_1', 'svix-timestamp': stale, 'svix-signature': await signWebhook(SECRET, 'msg_1', stale, body) }),
  ]
  for (const h of cases) assertEquals(await handleWebhook(h, body, d), { status: 401, body: { error: 'Not allowed.' } })
  assertEquals(applied.length, 0)
})

Deno.test('a signed open is applied with delivery and its own time', async () => {
  const { d, applied } = deps()
  const body = event('email.opened')
  assertEquals(await handleWebhook(await signed(body), body, d), { status: 200, body: { matched: true } })
  assertEquals(applied, [{ providerId: 'rs_1', columns: ['delivered_at', 'opened_at'], at: new Date('2026-10-11T11:58:00.000Z'), complaint: false }])
})

Deno.test('an unknown message is 200 so Resend does not retry it', async () => {
  const { d } = deps(false)
  const body = event('email.delivered', 'rs_other_env')
  assertEquals(await handleWebhook(await signed(body), body, d), { status: 200, body: { matched: false } })
})

Deno.test('other types are ignored, a signed non-event is 400, an oversized body is 413', async () => {
  const { d, applied } = deps()
  const sent = event('email.sent')
  assertEquals(await handleWebhook(await signed(sent), sent, d), { status: 200, body: { ignored: true } })
  const junk = '{"hello":'
  assertEquals(await handleWebhook(await signed(junk), junk, d), { status: 400, body: { error: 'Not a Resend event.' } })
  const big = 'x'.repeat(MAX_BODY + 1)
  assertEquals((await handleWebhook(await signed(big), big, d)).status, 413)
  assertEquals(applied.length, 0)
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `DENO_NO_PACKAGE_JSON=1 deno test --allow-read supabase/functions/resend-webhook`
Expected: `Module not found "…/resend-webhook/handler.ts"`.

- [ ] **Step 3: Write the handler** — `supabase/functions/resend-webhook/handler.ts`

```ts
import { readTrackingEvent, verifyWebhook, type TrackingEvent } from '../_shared/comms/webhook.ts'
import type { Result } from '../advance/engine.ts'

export type Deps = { secret: Uint8Array<ArrayBuffer>; now(): Date; apply(e: TrackingEvent): Promise<boolean> }
export const MAX_BODY = 64_000 // a Resend event is a few hundred bytes

/** Verifies before reading anything: an unsigned or badly signed request is refused and never stored (spec §10). */
export async function handleWebhook(headers: Headers, body: string, deps: Deps): Promise<Result> {
  if (body.length > MAX_BODY) return { status: 413, body: { error: 'Too large.' } }
  const signedBy = { id: headers.get('svix-id'), timestamp: headers.get('svix-timestamp'), signature: headers.get('svix-signature') }
  if (!(await verifyWebhook(deps.secret, signedBy, body, deps.now()))) return { status: 401, body: { error: 'Not allowed.' } }
  let parsed: unknown = null
  try { parsed = JSON.parse(body) } catch { parsed = null } // a signed body that is not JSON is answered 400 below
  const event = readTrackingEvent(parsed, deps.now())
  if (event === null) return { status: 400, body: { error: 'Not a Resend event.' } }
  if (event === 'ignored') return { status: 200, body: { ignored: true } }
  return { status: 200, body: { matched: await deps.apply(event) } }
}
```

- [ ] **Step 4: Write the store and its real-database test** — `supabase/functions/resend-webhook/pgApply.ts`

```ts
import type postgres from 'npm:postgres@3.4.5'
import type { TrackingEvent } from '../_shared/comms/webhook.ts'

/** The earliest time wins, so a replay or a late retry changes nothing (decision 6). A complaint also opts the address out. */
export function pgApply(sql: postgres.Sql) {
  return (e: TrackingEvent) => sql.begin(async (t) => {
    let hit: { org_id: string; recipient_email: string } | undefined
    for (const col of e.columns) {
      const [row] = await t<{ org_id: string; recipient_email: string }[]>`
        update messages set ${t(col)} = least(coalesce(${t(col)}, ${e.at}::timestamptz), ${e.at}::timestamptz)
        where provider_id = ${e.providerId} returning org_id, recipient_email::text as recipient_email`
      hit ??= row
    }
    if (hit && e.complaint) {
      await t`insert into email_optouts (org_id, email, reason) values (${hit.org_id}, ${hit.recipient_email}, 'complaint') on conflict do nothing`
    }
    return !!hit
  }) as Promise<boolean>
}
```

`supabase/functions/resend-webhook/db.test.ts`

```ts
import { assertEquals } from 'jsr:@std/assert@1'
import postgres from 'npm:postgres@3.4.5'
import { pgApply } from './pgApply.ts'
import { TRACKING } from '../_shared/comms/webhook.ts'

const url = Deno.permissions.querySync({ name: 'env', variable: 'RNR_TEST_DB_URL' }).state === 'granted'
  ? Deno.env.get('RNR_TEST_DB_URL')
  : undefined
const ALPHA = '0000000a-0000-0000-0000-000000000001'

Deno.test({
  name: 'real Postgres: a replayed event changes nothing and an older one keeps the earliest time',
  ignore: !url,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const sql = postgres(url!, { max: 1 })
    const tag = crypto.randomUUID().slice(0, 8)
    const providerId = `rs_test_${tag}`
    const email = `hook-${tag}@example.test`
    try {
      await sql`insert into messages (org_id, recipient_email, subject, body_html, body_text, status, provider_id, sent_at)
        values (${ALPHA}, ${email}, 'Hi', '<p>Hi</p>', 'Hi', 'sent', ${providerId}, now())`
      const apply = pgApply(sql)
      const t2 = new Date('2026-10-11T12:00:00Z')
      const t1 = new Date('2026-10-11T11:00:00Z')
      const read = async () => (await sql`select delivered_at, opened_at, clicked_at from messages where provider_id = ${providerId}`)[0]
      assertEquals(await apply({ providerId, columns: TRACKING['email.opened'], at: t2, complaint: false }), true)
      assertEquals(await apply({ providerId, columns: TRACKING['email.opened'], at: t2, complaint: false }), true) // replay
      let row = await read()
      assertEquals([row.delivered_at.toISOString(), row.opened_at.toISOString(), row.clicked_at], [t2.toISOString(), t2.toISOString(), null])
      await apply({ providerId, columns: TRACKING['email.opened'], at: t1, complaint: false }) // an older retry arrives late
      row = await read()
      assertEquals([row.delivered_at.toISOString(), row.opened_at.toISOString()], [t1.toISOString(), t1.toISOString()])
      await apply({ providerId, columns: TRACKING['email.complained'], at: t2, complaint: true })
      assertEquals((await sql`select reason from email_optouts where org_id = ${ALPHA} and email = ${email}`).map((r) => r.reason), ['complaint'])
      assertEquals(await apply({ providerId: `rs_missing_${tag}`, columns: TRACKING['email.delivered'], at: t2, complaint: false }), false)
    } finally {
      await sql`delete from email_optouts where org_id = ${ALPHA} and email = ${email}`
      await sql`delete from messages where provider_id = ${providerId}`
      await sql.end()
    }
  },
})
```

- [ ] **Step 5: The entry point** — `supabase/functions/resend-webhook/index.ts`

```ts
import postgres from 'npm:postgres@3.4.5'
import { handleWebhook } from './handler.ts'
import { pgApply } from './pgApply.ts'
import { readWebhookSecret } from '../_shared/comms/webhook.ts'

// Throws at boot when the secret is missing or malformed, so no unverifiable request is ever accepted.
const secret = readWebhookSecret(Deno.env.get('RESEND_WEBHOOK_SECRET'))
const apply = pgApply(postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 2, prepare: false, onnotice: () => {} }))
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  try {
    const res = await handleWebhook(req.headers, await req.text(), { secret, now: () => new Date(), apply })
    return json(res.status, res.body)
  } catch (e) {
    console.error('resend-webhook failed', e) // a 500 makes Resend retry; the replay is harmless
    return json(500, { error: 'Not recorded. Resend will try again.' })
  }
})
```

- [ ] **Step 6: The local fixture script** — `scripts/webhook-event.mjs`

```js
// Signs a Resend-style event with the shared signer and posts it to the local resend-webhook (decision 6), so delivery,
// opens, clicks, bounces and complaints can be exercised without a Resend account. Mailpit's id is the provider id.
// Usage: node --env-file=supabase/functions/.env.local scripts/webhook-event.mjs email.opened <provider-id> [url]
import { readWebhookSecret, signWebhook } from '../supabase/functions/_shared/comms/webhook.ts'

const TYPES = ['email.delivered', 'email.opened', 'email.clicked', 'email.bounced', 'email.complained']
const [type, providerId, url = 'http://127.0.0.1:54321/functions/v1/resend-webhook'] = process.argv.slice(2)
if (!TYPES.includes(type) || !providerId) {
  console.error(`Usage: node scripts/webhook-event.mjs <${TYPES.join('|')}> <provider-id> [url]`)
  process.exit(2)
}
const secret = readWebhookSecret(process.env.RESEND_WEBHOOK_SECRET)
const body = JSON.stringify({ type, created_at: new Date().toISOString(), data: { email_id: providerId } })
const id = `msg_${crypto.randomUUID()}`
const timestamp = String(Math.floor(Date.now() / 1000))
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': await signWebhook(secret, id, timestamp, body) },
  body,
})
console.log(res.status, await res.text())
```

(The script imports the same `signWebhook` the function verifies with, so there is one signing implementation; `webhook.test.ts` pins it.)

- [ ] **Step 7: CI** — add `supabase/functions/resend-webhook/db.test.ts` after `send-campaigns/db.test.ts` in the env-gated step of `.github/workflows/ci-v2.yml`.

- [ ] **Step 8: Run — expect PASS**

Run:
```bash
DENO_NO_PACKAGE_JSON=1 deno test --allow-read supabase/functions/resend-webhook
RNR_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres DENO_NO_PACKAGE_JSON=1 \
deno test --allow-env --allow-net supabase/functions/resend-webhook/db.test.ts
```
Expected: `ok | 4 passed | 1 ignored`, then `ok | 1 passed`.

Then, with `RESEND_WEBHOOK_SECRET=whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw` (any `whsec_` value) in `supabase/functions/.env.local` and `supabase functions serve --env-file supabase/functions/.env.local` running: `node --env-file=supabase/functions/.env.local scripts/webhook-event.mjs email.opened <a provider_id from messages>` prints `200 {"matched":true}`; the same with a wrong secret prints `401 {"error":"Not allowed."}`.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/resend-webhook scripts/webhook-event.mjs ../.github/workflows/ci-v2.yml
git commit -m "feat: record delivery, opens and clicks from signed resend webhooks"
```

---

### Task 6: Edge Function `unsubscribe`

**Owner:** Backend engineer · **Depends on:** 1, 2

**Files:**
- Create: `supabase/functions/unsubscribe/handler.ts`, `handler.test.ts`, `index.ts`

**Interfaces:**
- Consumes: `checkUnsubscribe`, `readUnsubscribeConfig` (Task 2); `escapeHtml` (`_shared/comms/render.ts`); `messages`, `orgs`, `email_optouts` (Task 1).
- Produces:
  - `type UnsubscribeStore = { message(id: string): Promise<{ org_id: string; org_name: string; email: string } | null>; isOptedOut(orgId: string, email: string): Promise<boolean>; optOut(orgId: string, email: string): Promise<void> }`
  - `type Page = { status: number; html: string }`, `handleUnsubscribe(method: string, url: URL, deps: { secret: string; store: UnsubscribeStore }): Promise<Page>`
  - GET `/functions/v1/unsubscribe?m=<message id>&t=<token>` → confirmation page (200), already-unsubscribed page (200), invalid link (400), unknown message (404); POST same URL → done page (200); other methods 405. HTML only, `Content-Security-Policy: default-src 'none'; form-action 'self'`.

- [ ] **Step 1: Write the failing tests** — `supabase/functions/unsubscribe/handler.test.ts`

```ts
import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1'
import { handleUnsubscribe, type UnsubscribeStore } from './handler.ts'
import { unsubscribeLink } from '../_shared/comms/campaign.ts'

const SECRET = 'a-local-unsubscribe-secret-of-32+chars'
const BASE = 'http://127.0.0.1:54321/functions/v1/unsubscribe'
const M1 = '00000000-0000-4000-8000-000000000001'
const ORG = '0000000a-0000-0000-0000-000000000001'

function store(name = 'Alpha School') {
  const out = new Set<string>()
  const s: UnsubscribeStore = {
    message: async (id) => (id === M1 ? { org_id: ORG, org_name: name, email: 'ada@example.test' } : null),
    isOptedOut: async (org, email) => out.has(`${org}:${email}`),
    optOut: async (org, email) => { out.add(`${org}:${email}`) },
  }
  return { s, out }
}
const link = async (id = M1) => new URL(await unsubscribeLink(BASE, SECRET, id))

Deno.test('GET shows a confirmation and unsubscribes nobody', async () => {
  const { s, out } = store()
  const page = await handleUnsubscribe('GET', await link(), { secret: SECRET, store: s })
  assertEquals(page.status, 200)
  assertMatch(page.html, /<form method="post">/)
  assertMatch(page.html, /<button type="submit">Unsubscribe<\/button>/)
  assertEquals(out.size, 0) // mail scanners open links; only the button unsubscribes
})

Deno.test('one-click POST unsubscribes, a forged token is refused', async () => {
  const { s, out } = store()
  const page = await handleUnsubscribe('POST', await link(), { secret: SECRET, store: s })
  assertEquals(page.status, 200)
  assertMatch(page.html, /You are unsubscribed from Alpha School campaign emails\./)
  assertEquals([...out], [`${ORG}:ada@example.test`])
  const forged = await link()
  forged.searchParams.set('t', 'A'.repeat(43))
  const refused = await handleUnsubscribe('POST', forged, { secret: SECRET, store: s })
  assertEquals(refused.status, 400)
  const noToken = new URL(`${BASE}?m=${M1}`)
  assertEquals((await handleUnsubscribe('GET', noToken, { secret: SECRET, store: s })).status, 400)
})

Deno.test('an address already unsubscribed is told so; an unknown message is 404; other methods 405', async () => {
  const { s } = store()
  await handleUnsubscribe('POST', await link(), { secret: SECRET, store: s })
  const again = await handleUnsubscribe('GET', await link(), { secret: SECRET, store: s })
  assertMatch(again.html, /You are already unsubscribed/)
  const unknown = await handleUnsubscribe('GET', await link('00000000-0000-4000-8000-000000000009'), { secret: SECRET, store: s })
  assertEquals(unknown.status, 404)
  assertEquals((await handleUnsubscribe('PUT', await link(), { secret: SECRET, store: s })).status, 405)
})

Deno.test('the page escapes the organisation name, shows no address and never says we', async () => {
  const { s } = store('<script>alert(1)</script> & Co')
  const page = await handleUnsubscribe('GET', await link(), { secret: SECRET, store: s })
  assertMatch(page.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; Co/)
  assert(!page.html.includes('<script>'))
  assert(!page.html.includes('ada@example.test'))
  assert(!/\bwe\b/i.test(page.html))
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `DENO_NO_PACKAGE_JSON=1 deno test --allow-read supabase/functions/unsubscribe`
Expected: `Module not found "…/unsubscribe/handler.ts"`.

- [ ] **Step 3: Write the handler** — `supabase/functions/unsubscribe/handler.ts`

```ts
import { checkUnsubscribe } from '../_shared/comms/campaign.ts'
import { escapeHtml } from '../_shared/comms/render.ts'

export type UnsubscribeStore = {
  message(id: string): Promise<{ org_id: string; org_name: string; email: string } | null>
  isOptedOut(orgId: string, email: string): Promise<boolean>
  optOut(orgId: string, email: string): Promise<void>
}
export type Page = { status: number; html: string }

const page = (status: number, title: string, body: string): Page => ({
  status,
  html: `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<title>${title}</title></head><body><main><h1>${title}</h1>${body}</main></body></html>`,
})

/** GET asks, POST does: link scanners fetch every URL in an email, so only the button (or a one-click POST) unsubscribes. */
export async function handleUnsubscribe(method: string, url: URL, deps: { secret: string; store: UnsubscribeStore }): Promise<Page> {
  if (method !== 'GET' && method !== 'POST') return page(405, 'Not available', '<p>Open the unsubscribe link from the email.</p>')
  const id = url.searchParams.get('m')
  if (!(await checkUnsubscribe(deps.secret, id, url.searchParams.get('t')))) {
    return page(400, 'This link is not valid', '<p>The unsubscribe link is incomplete. Copy the whole link from the email and try again.</p>')
  }
  const m = await deps.store.message(id as string)
  if (!m) return page(404, 'This link has expired', '<p>Reply to the email and ask the sender to stop sending you campaigns.</p>')
  const org = escapeHtml(m.org_name)
  if (method === 'POST') {
    await deps.store.optOut(m.org_id, m.email)
    return page(200, 'Unsubscribed', `<p>You are unsubscribed from ${org} campaign emails. Emails about your own tasks and records still arrive.</p>`)
  }
  if (await deps.store.isOptedOut(m.org_id, m.email)) {
    return page(200, 'Unsubscribed', `<p>You are already unsubscribed from ${org} campaign emails.</p>`)
  }
  return page(200, 'Unsubscribe', `<p>Stop receiving campaign emails from ${org}? Emails about your own tasks and records still arrive.</p>`
    + '<form method="post"><button type="submit">Unsubscribe</button></form>')
}
```

(`<form method="post">` with no `action` posts to the same URL, query included, so the token travels with it.)

- [ ] **Step 4: The entry point** — `supabase/functions/unsubscribe/index.ts`

```ts
import postgres from 'npm:postgres@3.4.5'
import { handleUnsubscribe, type UnsubscribeStore } from './handler.ts'
import { readUnsubscribeConfig } from '../_shared/comms/campaign.ts'

const { secret } = readUnsubscribeConfig(Deno.env.get('UNSUBSCRIBE_URL'), Deno.env.get('UNSUBSCRIBE_SECRET')) // throws at boot when unset
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 2, prepare: false, onnotice: () => {} })
const store: UnsubscribeStore = {
  message: async (id) => ((await sql`
    select m.org_id, o.name as org_name, m.recipient_email::text as email from messages m join orgs o on o.id = m.org_id
    where m.id = ${id} and m.campaign_id is not null`)[0] as { org_id: string; org_name: string; email: string } | undefined) ?? null,
  isOptedOut: async (org, email) => (await sql`select 1 from email_optouts where org_id = ${org} and email = ${email}`).length > 0,
  optOut: async (org, email) => { await sql`insert into email_optouts (org_id, email, reason) values (${org}, ${email}, 'unsubscribe') on conflict do nothing` },
}
const HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; form-action 'self'", 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }

Deno.serve(async (req) => {
  try {
    const res = await handleUnsubscribe(req.method, new URL(req.url), { secret, store })
    return new Response(res.html, { status: res.status, headers: HEADERS })
  } catch (e) {
    console.error('unsubscribe failed', e)
    return new Response('<!doctype html><title>Try again</title><p>Your request did not go through. Try the link again in a minute.</p>', { status: 500, headers: HEADERS })
  }
})
```

- [ ] **Step 5: Run — expect PASS**

Run: `DENO_NO_PACKAGE_JSON=1 deno test --allow-read supabase/functions/unsubscribe`
Expected: `ok | 4 passed`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/unsubscribe
git commit -m "feat: add one-click unsubscribe from campaign emails"
```

---

### Task 7: Design spec for Phase 6 screens

**Owner:** Senior Designer · **Depends on:** — (must be committed before Task 8 starts)

**Files:**
- Create: `docs/superpowers/design/phase-6-screens.md`

**Interfaces:**
- Consumes: `design/README.md` (content rules — "you", no "we"; dataviz: series `in` = 1, `out` = 2, B&W hatch for `out`, tabular numerals, `opacity-dim` hover; `kpi` figures; Widget and DataTable rules), `design/tokens.css`, `design/components/*` (Widget, DataTable, Button, Field, Dialog, Menu, Segmented, Badge, Icon), `docs/superpowers/design/phase-1-screens.md`–`phase-5-screens.md` (their §0 rules, the layer trap, the row-header trap and every `src/index.css` addition still apply; Phase 5 §12 chart classes are reused), this plan's Tasks 8 and 9 code, and the shipped `src/**` (App shell, `ConfirmDialog`, `useAction`, `useNotice`, `useFocusAfterRender`, `useLeaveGuard`, `Skeleton`, `When`/`Day`, `errors`, `icons`, `SettingsPage`, `ReportsPage`, `ResultTable` pager, `ChartWidget`).
- Produces: the spec the frontend engineer follows in Tasks 8 and 9 wherever it differs from this plan's markup or copy.

- [ ] **Step 1: Write the spec** in the format of `phase-5-screens.md` (tables, exact classes/tokens, "DD" where the system is silent), with these sections:
  1. Global additions: nav order and visibility (Campaigns for `comms.broadcast`, after Messages; current for `campaigns` and `campaign`), page widths (list `max-w-5xl`, editor `max-w-2xl`, report `max-w-5xl`), status words and badges for `draft` / `scheduled` / `sending` / `sent` / `failed` (Badge colours from the system; never colour alone — the word is always shown), number and percentage formatting (en-GB, `rnr-num`, "No data yet" for a zero denominator, one decimal place), date cells (`When`), the "approximate" opens wording.
  2. Campaigns list: columns (name, status, send date — scheduled time or sent time, delivered %, opened %, clicked % from `campaign_stats`; "—" style never used for a real zero, "No data yet" for no denominator), per-row Open / Delete (drafts only), the New campaign dialog (name only; it opens the editor), delete confirmation copy, empty states (first run with one primary action; a caption for people without `comms.broadcast` is not needed because the route is hidden).
  3. Campaign editor (draft): name; template select (grouped "Email" / "In-app", the channel shown next to each), the `campaignTemplateIssue` warning placement and wording; audience as `rnr-seg` "A role" / "A report" (follow-up audiences render read-only: "People from <campaign> who did not open it" / "who have not finished <workflow>"); role select; report select (grouped reports listed but marked "Grouped reports cannot choose recipients" and not selectable — DD); "Send to" select ("The person who started each record" or each email-like answer field by label); the audience size line ("About 240 people. The list is taken when sending starts; people who unsubscribed or have no email address are left out." / "About 240 records match." for report audiences / "Counted when sending starts." for follow-ups) and its loading and error states; linked workflow select (optional, "None"); the schedule block (date-time input in the viewer's local time with the time zone named, "Schedule" secondary, "Send now" primary) and the Send now confirmation dialog ("Send <name> to about 240 people now?"); Save / Saved / conflict states; unsaved-changes dialog; Delete draft.
  4. Scheduled and failed states of the same page: scheduled summary ("Scheduled for 12 Oct 2026, 09:00", who scheduled it) with "Cancel schedule" (confirm); failed with the stored reason in `rnr-status` with the X icon and "Edit and schedule again".
  5. Campaign report (sending / sent): header (name, status, sent time, who sent it, "4,200 of 10,000 sent so far" while sending), the tiles row (5 email tiles or 2 in-app tiles, `rnr-kpi` figures with captions, grid 1 / 2 from `sm:` / 5 or 2 from `lg:` — DD), the exclusions line from `excludedText`, the "Opens are approximate: Apple Mail Privacy Protection opens emails automatically." note under the Opened tile (always visible, not a tooltip), the in-app variant ("In-app campaigns report reads only.").
  6. Opens and clicks chart: two series — opens `--in` (series 1), clicks `--out` (series 2) — lines with point markers that differ by shape (circle / square) and a solid / dashed stroke so colour is never alone; B&W themes add the `out` hatch rule's line equivalent (dashed) — state it; legend with text labels; x axis "Day 1" … "Day 7" after sending started; y axis from Phase 5 `niceTicks`, tabular numerals; gridlines `line-100`; hover dims the other series to `opacity-dim`; "Show as table" toggle (`rnr-btn-ghost`, `aria-pressed`) showing Day / Opens / Clicks; SVG `role="img"` with a text summary ("Opens and clicks over the first 7 days: 120 opens and 30 clicks, most on day 1."); empty state when nothing was opened yet; minimum width before the table is shown instead (reuse `MIN_CHART_WIDTH`).
  7. Completion block (only with a linked workflow and permission): "Started 120 of 240 (50%) · Finished 80 (33.3%)" as two `rnr-kpi`s, the "Remind non-completers" action (hidden, with "Everyone has finished." text, when nobody is left), and what people without `records.view_all` see (the block is hidden; a caption says "Completion needs permission to see every record of <workflow>.").
  8. Recipient table: `rnr-seg` filter "Everyone" / "Not opened" / "Bounced" (in-app: "Everyone" / "Not read"), columns (email, status, delivered, opened, clicked, error — in-app: email, read), sticky first column on phones, `rnr-table-card`, pager ("Showing 51–100 of 4,210", Previous / Next `rnr-btn-ghost`), "Download CSV" with busy state and the filename, empty states per filter ("Everyone opened it." etc.), loading and error states.
  9. Follow-up actions: "Send follow-up to not opened" (secondary) ("Send follow-up to not read" for in-app) and "Remind non-completers" create a draft named "Follow-up: <name>" and open it, and the new page's heading (which says the name) takes focus; when nobody qualifies the button is hidden and the text "Everyone opened it." / "Everyone has finished." shows instead (never a disabled button).
  10. Settings: the "Campaign emails" section (one checkbox for the organisation currently selected, "Campaign emails from <organisation>", the caption explaining it stops campaign emails from that organisation only and that task emails are unaffected, the saved/failed notices).
  11. Copy table for every new string (including the unsubscribe page and the email footer from Tasks 2 and 6 for review), and an accessibility summary (focus after delete/schedule/cancel/follow-up, live regions, 44px targets, keyboard path through filters and pager, 375px with no page-level horizontal scroll, `prefers-reduced-motion`).
  12. `src/index.css` additions as a §12-style list of named classes (`rnr-campaign-tiles`, `rnr-chart-series-in` / `-out`, `rnr-chart-legend`, …) with every value from tokens; no inline `style` anywhere (QA-P4-5); SVG geometry uses attributes.
  13. Conflicts with Tasks 8 and 9 and the corrections the frontend must make.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/design/phase-6-screens.md
git commit -m "docs: add phase 6 screen design spec"
```

---
### Task 8: Frontend — data layer, routes, Campaigns list, editor, Settings opt-out

**Owner:** Frontend engineer · **Depends on:** 1, 2, 7

**Files:**
- Create: `src/campaigns/logic.ts`, `src/campaigns/api.ts`, `src/campaigns/pages.ts`, `src/campaigns/pages.test.ts`, `src/campaigns/CampaignsPage.tsx`, `src/campaigns/CampaignPage.tsx`, `src/campaigns/CampaignEditor.tsx`, `src/campaigns/CampaignReport.tsx` (placeholder until Task 9)
- Modify: `src/rbac/route.ts`, `src/rbac/route.test.ts`, `src/ui/errors.ts`, `src/ui/errors.test.ts`, `src/comms/SettingsPage.tsx`, `src/App.tsx`, `src/index.css` (designer §12 classes)

**Interfaces:**
- Consumes: `campaigns`, `email_optouts`, `schedule_campaign`, `cancel_campaign`, `campaign_stats`, `my_member_email` (Task 1); `readAudience`, `campaignTemplateIssue`, `pctText`, `pct`, `NO_STATS`, `recipientCsv`, `Audience`, `Stats`, `RecipientRow` (Task 2); `run-report` (Phase 5, for the report audience size); `useTemplates` (`comms/api`), `useRoles`, `useWorkflows`, `useWorkflow` (`workflows/api`), `useForms` (`forms/api`), `useReports`, `useReport` (`reports/api`), `stepFields`, `dataColumns`, `csvFilename` (`reports/logic`); `useOrg`, `useAction`, `useNotice`, `useFocusAfterRender`, `useLeaveGuard`, `ConfirmDialog`, `friendlyError`, `Skeleton`, `When`.
- Produces:
  - `src/campaigns/api.ts`: `type CampaignStatus`, `type Campaign`, `CAMPAIGN_STATUS: Record<CampaignStatus, string>`, `CAMPAIGN_LIST_LIMIT = 200`, `useCampaigns(orgId)` → `{ rows: Campaign[]; total: number }`, `useCampaign(id)`, `type CampaignFields`, `createCampaign(orgId, f)`, `updateCampaign(id, f, updatedAt)`, `deleteCampaign(id)`, `scheduleCampaign(id, at: string | null)`, `cancelCampaign(id)`, `useCampaignStats(orgId, live?)` → `Map<string, Stats>`, `statsOf(map, id)`, `type DayRow`, `useCampaignDaily(id, live)`, `type Completion`, `useCampaignCompletion(userId, id, enabled)` → `Completion | null`, `type RecipientFilter = 'all' | 'not_opened' | 'bounced'`, `RECIPIENT_PAGE = 50`, `useRecipients(id, filter, page)` → `{ rows: RecipientRow[]; total: number }`, `downloadRecipients(c: Campaign)` → `{ filename } | { error }`, `type AudienceSize = { people: number } | { records: number }`, `useAudienceSize(userId, orgId, audience)`, `useOptOut(userId, orgId)` → `{ email: string; optedOut: boolean } | null`, `setOptOut(orgId, email, optedOut)`
  - `src/campaigns/pages.ts`: `PAGE_ROWS = 1000`, `readAllPages<T extends { id: string }>(fetchPage: (after: string) => Promise<T[]>, expected: number): Promise<T[] | 'changed'>`
  - routes `#/campaigns` (`{ page: 'campaigns' }`) and `#/campaigns/<id>` (`{ page: 'campaign', id }`), `Perms.broadcast`

- [ ] **Step 1: Write the failing tests**

`src/campaigns/pages.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PAGE_ROWS, readAllPages } from './pages.ts'

const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`

test('reads every page until a short one', async () => {
  const all = Array.from({ length: 2_500 }, (_, i) => ({ id: id(i) }))
  const calls: string[] = []
  const rows = await readAllPages(async (after) => { calls.push(after); return all.filter((r) => r.id > after).slice(0, PAGE_ROWS) }, 2_500)
  assert.equal(rows !== 'changed' && rows.length, 2_500)
  assert.deepEqual(calls, ['00000000-0000-0000-0000-000000000000', id(999), id(1_999)])
})

test('csv refuses a short download', async () => {
  // A row deleted or added between the count and the pages: refused, never a short file.
  assert.equal(await readAllPages(async () => [{ id: id(1) }], 2), 'changed')
  assert.equal(await readAllPages(async () => [{ id: id(1) }, { id: id(2) }], 1), 'changed')
})
```

Append to `src/rbac/route.test.ts` (and add `broadcast: true` to `all`, `broadcast: false` to `none` at the top of the file):

```ts
test('campaign pages need comms.broadcast', () => {
  assert.deepEqual(parseRoute('#/campaigns'), { page: 'campaigns' })
  assert.deepEqual(parseRoute(`#/campaigns/${id}`), { page: 'campaign', id })
  assert.deepEqual(parseRoute('#/campaigns/nope'), { page: 'members' })
  assert.equal(guardHash('#/campaigns', none), '#/inbox')
  assert.equal(guardHash(`#/campaigns/${id}`, none), '#/inbox')
  assert.equal(guardHash(`#/campaigns/${id}`, all), `#/campaigns/${id}`)
})
```

Append to `src/ui/errors.test.ts`:

```ts
test('campaign messages read as sentences', () => {
  const cases: [string, string][] = [
    ['Only a draft campaign can be scheduled.', 'This campaign is no longer a draft. The page now shows its latest state.'],
    ['Choose a message template before sending.', 'Choose a message template before sending.'],
    ['Choose who receives this campaign before sending.', 'Choose who receives this campaign before sending.'],
    ['Choose a time in the future.', 'Choose a time in the future.'],
    ['Choose a time within the next year.', 'Choose a time within the next year.'],
    ['This campaign has started sending and cannot be changed.', 'This campaign has started sending and cannot be changed. The page now shows its latest state.'],
    ['You can only link a workflow whose records you can all see.', 'You can only link a workflow whose records you can all see. Choose another, or ask an admin for access.'],
  ]
  for (const [message, sentence] of cases) assert.equal(friendlyError({ message }), sentence)
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test`
Expected: `pages.test.ts` cannot find `./pages.ts`; the route test fails on `campaigns`; the errors test gets the fallback sentence.

- [ ] **Step 3: Pure helpers, routes and messages**

`src/campaigns/logic.ts`
```ts
// The same module runs inside send-campaigns; the server's plan and rendering are the ones that count.
export * from '../../supabase/functions/_shared/comms/campaign.ts'
```

`src/campaigns/pages.ts`
```ts
const NIL = '00000000-0000-0000-0000-000000000000'
export const PAGE_ROWS = 1000 // PostgREST's max rows per request

/** Every row by keyset pages; 'changed' when the total differs from the count taken first, so a file is never silently short. */
export async function readAllPages<T extends { id: string }>(fetchPage: (after: string) => Promise<T[]>, expected: number): Promise<T[] | 'changed'> {
  const rows: T[] = []
  let after = NIL
  for (;;) {
    const page = await fetchPage(after)
    rows.push(...page)
    if (page.length < PAGE_ROWS) break
    after = page[page.length - 1].id
  }
  return rows.length === expected ? rows : 'changed'
}
```

`src/rbac/route.ts` — add the two pages:
```ts
export type Route =
  | { page: 'members' } | { page: 'roles' } | { page: 'forms' } | { page: 'workflows' } | { page: 'inbox' } | { page: 'records' }
  | { page: 'templates' } | { page: 'messages' } | { page: 'settings' } | { page: 'dashboard' } | { page: 'reports' } | { page: 'campaigns' }
  | { page: 'form-edit' | 'form-fill' | 'form-submissions'; id: string }
  | { page: 'workflow-edit' | 'workflow-access' | 'workflow-report' | 'start' | 'task' | 'record' | 'template' | 'report' | 'campaign'; id: string }
export type Perms = { roles: boolean; forms: boolean; workflows: boolean; comms: boolean; reports: boolean; reportsManage: boolean; broadcast: boolean }
```
Add `const CAMPAIGN_PAGE = new RegExp(\`^#/campaigns/${ID}$\`)`, add `'campaigns'` to `ListPage` and `'#/campaigns': 'campaigns'` to `LISTS`, and in `parseRoute` before the final return:
```ts
  const c = CAMPAIGN_PAGE.exec(hash)
  if (c) return { page: 'campaign', id: c[1] }
```
In `guardHash`, before the final return:
```ts
  if ((r.page === 'campaigns' || r.page === 'campaign') && !perms.broadcast) return '#/inbox'
```

`src/ui/errors.ts` — add before the `/Not allowed|permission to invite/` entry:
```ts
  [/Only a draft campaign can be scheduled/, 'This campaign is no longer a draft. The page now shows its latest state.'],
  [/Choose a message template before sending/, 'Choose a message template before sending.'],
  [/Choose who receives this campaign/, 'Choose who receives this campaign before sending.'],
  [/Choose a time in the future/, 'Choose a time in the future.'],
  [/Choose a time within the next year/, 'Choose a time within the next year.'],
  [/started sending and cannot be changed/, 'This campaign has started sending and cannot be changed. The page now shows its latest state.'],
  [/link a workflow whose records you can all see/, 'You can only link a workflow whose records you can all see. Choose another, or ask an admin for access.'],
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm test`
Expected: `pass 216` (212 + 2 pages + 1 route + 1 errors), `fail 0`.

- [ ] **Step 5: Data layer** — `src/campaigns/api.ts`

```ts
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '../data/supabase'
import { csvFilename } from '../reports/logic'
import { NO_STATS, recipientCsv, type Audience, type Excluded, type RecipientRow, type Stats } from './logic'
import { readAllPages } from './pages'

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed'
export const CAMPAIGN_STATUS: Record<CampaignStatus, string> = { draft: 'Draft', scheduled: 'Scheduled', sending: 'Sending', sent: 'Sent', failed: 'Not sent' }
export type Campaign = {
  id: string; org_id: string; name: string; template_id: string | null; audience: unknown; linked_workflow_id: string | null
  status: CampaignStatus; scheduled_at: string | null; sent_by: string | null; audience_snapshot_at: string | null
  channel: 'email' | 'in_app' | null; recipients: number | null; excluded: Partial<Excluded>; error: string | null
  finished_at: string | null; created_at: string; updated_at: string
}
const COLS = 'id, org_id, name, template_id, audience, linked_workflow_id, status, scheduled_at, sent_by, audience_snapshot_at, channel, recipients, excluded, error, finished_at, created_at, updated_at'

export const CAMPAIGN_LIST_LIMIT = 200 // shortcut: the newest 200, with the full count on screen; add paging when an organisation has more
export const useCampaigns = (orgId: string | null) => useQuery({
  queryKey: ['campaigns', orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data, error, count } = await supabase.from('campaigns').select(COLS, { count: 'exact' }).eq('org_id', orgId!)
      .order('created_at', { ascending: false }).range(0, CAMPAIGN_LIST_LIMIT - 1)
    if (error) throw error
    return { rows: data as unknown as Campaign[], total: count ?? data.length }
  },
})
const moving = (c: Campaign | null | undefined) => !!c && (c.status === 'scheduled' || c.status === 'sending')
export const useCampaign = (id: string) => useQuery({
  queryKey: ['campaign', id],
  refetchInterval: (q) => (moving(q.state.data) ? 10_000 : false), // scheduled → sending → sent happens on the server
  refetchOnWindowFocus: false, // a draft being edited is never swapped under the editor; saves, schedules and Reload refetch explicitly
  queryFn: async () => {
    const { data, error } = await supabase.from('campaigns').select(COLS).eq('id', id).maybeSingle()
    if (error) throw error
    return data as unknown as Campaign | null
  },
})
export type CampaignFields = { name: string; template_id: string | null; audience: Audience | Record<string, never>; linked_workflow_id: string | null }
export const createCampaign = (orgId: string, f: Partial<CampaignFields> & { name: string }) =>
  supabase.from('campaigns').insert({ org_id: orgId, ...f }).select('id').single()
export const updateCampaign = (id: string, f: CampaignFields, updatedAt: string) =>
  supabase.from('campaigns').update(f).eq('id', id).eq('updated_at', updatedAt).select('updated_at')
export const deleteCampaign = (id: string) => supabase.from('campaigns').delete().eq('id', id).select('id')
export const scheduleCampaign = (id: string, at: string | null) =>
  supabase.rpc('schedule_campaign', at ? { p_campaign: id, p_at: at } : { p_campaign: id })
export const cancelCampaign = (id: string) => supabase.rpc('cancel_campaign', { p_campaign: id })

export const useCampaignStats = (orgId: string | null, live = false) => useQuery({
  queryKey: ['campaign-stats', orgId],
  enabled: !!orgId,
  refetchInterval: live ? 10_000 : false,
  queryFn: async () => {
    const { data, error } = await supabase.rpc('campaign_stats', { p_org: orgId! })
    if (error) throw error
    return new Map((data ?? []).map(({ campaign_id, ...s }) => [campaign_id, s as Stats]))
  },
})
export const statsOf = (m: Map<string, Stats> | undefined, id: string): Stats => m?.get(id) ?? NO_STATS

export type DayRow = { day: number; opens: number; clicks: number }
export const useCampaignDaily = (id: string, live: boolean) => useQuery({
  queryKey: ['campaign-daily', id],
  refetchInterval: live ? 30_000 : false,
  queryFn: async () => {
    const { data, error } = await supabase.rpc('campaign_daily', { p_campaign: id })
    if (error) throw error
    return (data ?? []) as DayRow[]
  },
})

export type Completion = { people: number; started: number; finished: number }
/** null: the viewer may not see every record of the linked workflow (42501); the page hides the block and says why. */
export const useCampaignCompletion = (userId: string, id: string, enabled: boolean) => useQuery({
  queryKey: ['campaign-completion', userId, id],
  enabled,
  queryFn: async () => {
    const { data, error } = await supabase.rpc('campaign_completion', { p_campaign: id })
    if (error?.code === '42501') return null
    if (error) throw error
    return ((data ?? [])[0] ?? { people: 0, started: 0, finished: 0 }) as Completion
  },
})

export type RecipientFilter = 'all' | 'not_opened' | 'bounced'
export const RECIPIENT_PAGE = 50
const RCOLS = 'id, recipient_email, status, error, delivered_at, opened_at, clicked_at, bounced_at'
export const useRecipients = (id: string, filter: RecipientFilter, page: number) => useQuery({
  queryKey: ['campaign-recipients', id, filter, page],
  placeholderData: keepPreviousData,
  queryFn: async () => {
    let q = supabase.from('messages').select(RCOLS, { count: 'exact' }).eq('campaign_id', id)
    if (filter === 'not_opened') q = q.eq('status', 'sent').is('opened_at', null).is('bounced_at', null)
    if (filter === 'bounced') q = q.not('bounced_at', 'is', null)
    const from = (page - 1) * RECIPIENT_PAGE
    const { data, error, count } = await q.order('recipient_email').order('id').range(from, from + RECIPIENT_PAGE - 1)
    if (error) throw error
    return { rows: data as RecipientRow[], total: count ?? 0 }
  },
})

const DOWNLOAD_FAILED = 'The recipient list did not download. Try again.'
/** Every recipient, never a page (decision 9); refuses rather than saves a short file. */
export async function downloadRecipients(c: Campaign): Promise<{ filename: string } | { error: string }> {
  const { count, error } = await supabase.from('messages').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id)
  if (error || count === null) return { error: DOWNLOAD_FAILED }
  let rows: RecipientRow[] | 'changed'
  try {
    rows = await readAllPages(async (after) => {
      const { data, error: e } = await supabase.from('messages').select(RCOLS).eq('campaign_id', c.id).gt('id', after).order('id').limit(1000)
      if (e) throw e
      return data as RecipientRow[]
    }, count)
  } catch {
    return { error: DOWNLOAD_FAILED } // the reason shown is the whole story for the person; nothing partial is saved
  }
  if (rows === 'changed') return { error: 'The list changed while it downloaded. Try again.' }
  const filename = csvFilename(c.name, new Date().toISOString().slice(0, 10))
  const href = URL.createObjectURL(new Blob([recipientCsv(rows, c.channel ?? 'email')], { type: 'text/csv;charset=utf-8' }))
  Object.assign(document.createElement('a'), { href, download: filename }).click()
  setTimeout(() => URL.revokeObjectURL(href), 0)
  return { filename }
}

export type AudienceSize = { people: number } | { records: number }
/** An estimate for the editor; the real list is taken when sending starts (decision 1). Follow-ups are counted then. */
export const useAudienceSize = (userId: string, orgId: string | null, audience: Audience | null) => useQuery({
  queryKey: ['audience-size', userId, orgId, audience],
  enabled: !!orgId && !!audience && audience.kind !== 'followup',
  queryFn: async (): Promise<AudienceSize> => {
    const a = audience as Audience
    if (a.kind === 'role') {
      const { count, error } = await supabase.from('member_roles').select('member_id, members!inner(status)', { count: 'exact', head: true })
        .eq('role_id', a.roleId).eq('members.status', 'active')
      if (error) throw error
      return { people: count ?? 0 }
    }
    const reportId = a.kind === 'report' ? a.reportId : ''
    const { data, error } = await supabase.functions.invoke<{ result: { total: number } }>('run-report', { body: { orgId, reportId, page: 1, pageSize: 1 } })
    if (error) throw error
    return { records: data?.result.total ?? 0 }
  },
})

export const useOptOut = (userId: string, orgId: string | null) => useQuery({
  queryKey: ['optout', userId, orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data: email, error } = await supabase.rpc('my_member_email', { p_org: orgId! })
    if (error) throw error
    if (!email) return null
    const { data, error: e } = await supabase.from('email_optouts').select('email').eq('org_id', orgId!).eq('email', email)
    if (e) throw e
    return { email: email as string, optedOut: data.length > 0 }
  },
})
export const setOptOut = (orgId: string, email: string, optedOut: boolean) => (optedOut
  ? supabase.from('email_optouts').insert({ org_id: orgId, email, reason: 'settings' }).select('email')
  : supabase.from('email_optouts').delete().eq('org_id', orgId).eq('email', email).select('email'))
```

- [ ] **Step 6: Campaigns list** — `src/campaigns/CampaignsPage.tsx`

```tsx
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { friendlyError } from '../ui/errors'
import { PlusIcon, XIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { When } from '../ui/Time'
import { useAction } from '../ui/useAction'
import { useFocusAfterRender } from '../ui/useFocusAfterRender'
import { useNotice } from '../ui/useNotice'
import { CAMPAIGN_LIST_LIMIT, CAMPAIGN_STATUS, createCampaign, deleteCampaign, statsOf, useCampaignStats, useCampaigns, type Campaign } from './api'
import { pct, pctText } from './logic'

const sendDate = (c: Campaign) => (c.status === 'draft' ? null : c.finished_at ?? c.audience_snapshot_at ?? c.scheduled_at)

export function CampaignsPage() {
  const { orgId } = useOrg()
  const list = useCampaigns(orgId)
  const stats = useCampaignStats(orgId)
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [doomed, setDoomed] = useState<Campaign | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const removal = useAction()
  const [notice, setNotice] = useNotice()
  const focusLater = useFocusAfterRender()

  const confirmDelete = () => removal.run(async () => {
    if (!doomed) return
    const { data, error } = await deleteCampaign(doomed.id)
    if (error || !data.length) { setDeleteError(error ? friendlyError(error) : 'This campaign was already deleted or has been scheduled. Reload to see the latest list.'); return }
    setDoomed(null)
    setNotice(`${doomed.name} deleted.`)
    await qc.invalidateQueries({ queryKey: ['campaigns', orgId] })
    focusLater('campaigns-h') // the row that held the Delete button is gone
  })

  const rows = list.data?.rows ?? []
  return (
    <section className="flex max-w-5xl flex-col gap-4" aria-labelledby="campaigns-h">
      <div className="flex flex-wrap items-center gap-3">
        <h1 id="campaigns-h" className="page-title" tabIndex={-1}>Campaigns</h1>
        {!!rows.length && <button type="button" className="rnr-btn rnr-btn-primary ml-auto" onClick={() => setCreating(true)}><PlusIcon />New campaign</button>}
      </div>
      <p className="rnr-caption" role="status">{notice}</p>
      {list.isPending && <Skeleton rows={[{ w: '100%', h: 200 }]} />}
      {list.isError && (
        <div className="rnr-card gap-3">
          <p role="alert">The campaigns did not load. Check your connection and try again.</p>
          <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => void list.refetch()}>Try again</button></div>
        </div>
      )}
      {list.isSuccess && !rows.length && (
        <div className="rnr-card gap-3">
          <h2 className="dialog-title">Send your first campaign</h2>
          <p className="rnr-muted">Email a role or the people in a report, schedule it, and see who opened it and who finished the workflow.</p>
          <div><button type="button" className="rnr-btn rnr-btn-primary" onClick={() => setCreating(true)}><PlusIcon />New campaign</button></div>
        </div>
      )}
      {!!rows.length && (
        <div className="rnr-card rnr-table-card">
          <table className="rnr-table rnr-sticky-first">
            <caption className="sr-only">Campaigns</caption>
            <thead><tr>
              <th scope="col">Name</th><th scope="col">Status</th><th scope="col">Sent or scheduled</th>
              <th scope="col" className="num">Delivered</th><th scope="col" className="num">Opened</th><th scope="col" className="num">Clicked</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>
              {rows.map((c) => {
                const s = statsOf(stats.data, c.id)
                const inApp = c.channel === 'in_app'
                const when = sendDate(c)
                return (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td><span className="rnr-chip">{CAMPAIGN_STATUS[c.status]}</span></td>
                    <td>{when ? <When iso={when} /> : 'Not scheduled'}</td>
                    <td className="num">{inApp ? 'In-app' : pctText(pct(s.delivered, s.recipients))}</td>
                    <td className="num">{pctText(inApp ? pct(s.opened, s.recipients) : pct(s.opened, s.delivered))}</td>
                    <td className="num">{inApp ? 'In-app' : pctText(pct(s.clicked, s.delivered))}</td>
                    <td>
                      <div className="flex justify-end gap-1 whitespace-nowrap">
                        <a className="rnr-btn rnr-btn-secondary" href={`#/campaigns/${c.id}`} aria-label={`Open ${c.name}`}>Open</a>
                        {c.status === 'draft' && <button type="button" className="rnr-btn rnr-btn-danger" aria-label={`Delete ${c.name}`} onClick={() => { setDeleteError(null); setDoomed(c) }}>Delete</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {list.data && list.data.total > rows.length && (
        <p className="rnr-caption">Showing the newest {CAMPAIGN_LIST_LIMIT} of {list.data.total.toLocaleString('en-GB')} campaigns.</p>
      )}
      {creating && <NewCampaignDialog onClose={() => setCreating(false)} />}
      <ConfirmDialog open={!!doomed} title={`Delete ${doomed?.name ?? ''}?`} body={`${doomed?.name ?? ''} is a draft. Deleting it cannot be undone.`}
        confirmLabel="Delete draft" busyLabel="Deleting…" busy={removal.busy} error={deleteError}
        onClose={() => setDoomed(null)} onConfirm={() => void confirmDelete()} />
    </section>
  )
}

function NewCampaignDialog({ onClose }: { onClose(): void }) {
  const { orgId } = useOrg()
  const ref = useRef<HTMLDialogElement>(null)
  const uid = useId()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const act = useAction()
  useEffect(() => { ref.current?.showModal(); ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus() }, [])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void act.run(async () => {
      if (!name.trim()) { setError('Enter a name for the campaign.'); document.getElementById(`${uid}-n`)?.focus(); return }
      const { data, error: e2 } = await createCampaign(orgId!, { name: name.trim() })
      if (e2) { setError(friendlyError(e2)); return }
      location.hash = `#/campaigns/${data.id}`
    })
  }
  return (
    <dialog ref={ref} className="rnr-dialog" aria-labelledby={`${uid}-t`} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }}>
      <div className="rnr-dialog-head">
        <h2 id={`${uid}-t`}>New campaign</h2>
        <button className="rnr-icon-btn" type="button" aria-label="Close dialog" onClick={onClose}><XIcon /></button>
      </div>
      <form className="rnr-dialog-body" onSubmit={submit} noValidate>
        <div className="rnr-field" data-invalid={!!error || undefined}>
          <label className="rnr-label" htmlFor={`${uid}-n`}>Name</label>
          <input id={`${uid}-n`} data-autofocus className="rnr-input" value={name} maxLength={120} aria-invalid={!!error || undefined}
            aria-describedby={error ? `${uid}-e` : undefined} onChange={(e) => setName(e.target.value)} />
        </div>
        {error && <p id={`${uid}-e`} className="rnr-error" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="rnr-btn rnr-btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="rnr-btn rnr-btn-primary" type="submit" aria-busy={act.busy}>
            {act.busy && <span className="rnr-spin" aria-hidden="true" />}{act.busy ? 'Creating…' : 'Create campaign'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
```

- [ ] **Step 7: The campaign page switch** — `src/campaigns/CampaignPage.tsx`

```tsx
import { Skeleton } from '../ui/Skeleton'
import { useFocusAfterRender } from '../ui/useFocusAfterRender'
import { useCampaign } from './api'
import { CampaignEditor } from './CampaignEditor'
import { CampaignReport } from './CampaignReport'

/** Drafts, scheduled and failed campaigns open the editor; once sending starts the page is the report. */
export function CampaignPage({ id }: { id: string }) {
  const c = useCampaign(id)
  // Lives above the editor, which remounts when the campaign changes, so focus survives the swap (QA-8).
  const focusLater = useFocusAfterRender()
  if (c.isPending) return <Skeleton rows={[{ w: '40%', h: 32 }, { w: '100%', h: 320 }]} />
  if (c.isError) {
    return (
      <div className="rnr-card gap-3">
        <p role="alert">This campaign did not load. Check your connection and try again.</p>
        <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => void c.refetch()}>Try again</button></div>
      </div>
    )
  }
  if (!c.data) {
    return (
      <div className="rnr-card gap-3">
        <h1 className="page-title">This campaign does not exist</h1>
        <p className="rnr-muted">It may have been deleted, or it belongs to another organisation.</p>
        <div><a className="rnr-btn rnr-btn-secondary" href="#/campaigns">Go to campaigns</a></div>
      </div>
    )
  }
  return c.data.status === 'sending' || c.data.status === 'sent' ? <CampaignReport campaign={c.data} /> : <CampaignEditor key={c.data.updated_at} campaign={c.data} onMoved={() => focusLater('campaign-h')} />
}
```

(Task 8 creates `CampaignReport.tsx` as a one-line placeholder export `export function CampaignReport(_: { campaign: Campaign }) { return null }` so the build passes; Task 9 replaces the whole file.)

- [ ] **Step 8: The editor** — `src/campaigns/CampaignEditor.tsx`

```tsx
import { useEffect, useId, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { useTemplates } from '../comms/api'
import { useForms } from '../forms/api'
import type { Field } from '../forms/logic'
import { useReport, useReports } from '../reports/api'
import { dataColumns, stepFields } from '../reports/logic'
import { useRoles, useWorkflow, useWorkflows } from '../workflows/api'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { friendlyError } from '../ui/errors'
import { BackIcon, CheckIcon, XIcon } from '../ui/icons'
import { When } from '../ui/Time'
import { useAction } from '../ui/useAction'
import { useLeaveGuard } from '../ui/useLeaveGuard'
import { useNotice } from '../ui/useNotice'
import { cancelCampaign, deleteCampaign, scheduleCampaign, updateCampaign, useAudienceSize, type Campaign, type CampaignFields } from './api'
import { campaignTemplateIssue, readAudience, type Audience } from './logic'

type Draft = { name: string; templateId: string; kind: 'role' | 'report' | 'followup' | ''; roleId: string; reportId: string; to: string; linked: string }
function draftOf(c: Campaign): Draft {
  const a = readAudience(c.audience)
  return {
    name: c.name, templateId: c.template_id ?? '', kind: a?.kind ?? '', linked: c.linked_workflow_id ?? '',
    roleId: a?.kind === 'role' ? a.roleId : '', reportId: a?.kind === 'report' ? a.reportId : '',
    to: a?.kind === 'report' ? (a.to === 'starter' ? 'starter' : a.to.field) : 'starter',
  }
}
function audienceOf(d: Draft, saved: Audience | null): Audience | null {
  if (d.kind === 'role') return d.roleId ? { kind: 'role', roleId: d.roleId } : null
  if (d.kind === 'report') return d.reportId ? { kind: 'report', reportId: d.reportId, to: d.to === 'starter' ? 'starter' : { field: d.to } } : null
  return d.kind === 'followup' ? saved : null // follow-up audiences are made by the report page and are not edited here
}
const SAVE_CONFLICT = 'This campaign was changed by someone else. Reload to see the latest version, then make your change again.'
const localNow = () => { const d = new Date(Date.now() + 60 * 60_000); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) }

export const FOCUS_KEY = 'rnr.focus' // set by the report page before it opens a new follow-up draft

export function CampaignEditor({ campaign: c, onMoved }: { campaign: Campaign; onMoved(): void }) {
  const { orgId, userId } = useOrg()
  const qc = useQueryClient()
  const uid = useId()
  const templates = useTemplates(orgId)
  const roles = useRoles(orgId)
  const reports = useReports(orgId)
  const workflows = useWorkflows(orgId)
  const savedAudience = readAudience(c.audience)
  const [base, setBase] = useState(() => draftOf(c))
  const [d, setD] = useState(base)
  const [updatedAt, setUpdatedAt] = useState(c.updated_at)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [at, setAt] = useState(localNow)
  const [confirm, setConfirm] = useState<'now' | 'cancel' | 'delete' | null>(null)
  const [notice, setNotice] = useNotice()
  const save = useAction()
  const send = useAction()
  useEffect(() => {
    try {
      if (sessionStorage.getItem(FOCUS_KEY) !== c.id) return
      sessionStorage.removeItem(FOCUS_KEY)
      document.getElementById('campaign-h')?.focus() // a follow-up draft just opened from the report page
    } catch { /* storage blocked: focus stays where the browser put it, which is still on this page */ }
  }, [c.id])
  const draft = c.status === 'draft'
  const dirty = draft && JSON.stringify(d) !== JSON.stringify(base)
  const guard = useLeaveGuard(dirty, `#/campaigns/${c.id}`)
  const set = (p: Partial<Draft>) => { setD((x) => ({ ...x, ...p })); setError(null) }
  const audience = audienceOf(d, savedAudience)
  const size = useAudienceSize(userId, orgId, draft ? audience : null)
  const template = templates.data?.find((t) => t.id === d.templateId) ?? null
  const issue = template ? campaignTemplateIssue(template) : null
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['campaign', c.id] }), qc.invalidateQueries({ queryKey: ['campaigns', orgId] })])

  const fields = (): CampaignFields => ({ name: d.name.trim(), template_id: d.templateId || null, audience: audience ?? {}, linked_workflow_id: d.linked || null })
  async function persist(): Promise<boolean> {
    if (!d.name.trim()) { setError('Enter a name for the campaign.'); document.getElementById(`${uid}-n`)?.focus(); return false }
    if (!dirty) return true
    const { data, error: e } = await updateCampaign(c.id, fields(), updatedAt)
    if (e) { setError(friendlyError(e)); return false }
    if (!data.length) { setConflict(true); return false }
    setUpdatedAt(data[0].updated_at)
    setBase(d)
    return true
  }
  const onSave = () => save.run(persist, true)
  const schedule = (now: boolean) => send.run(async () => {
    if (!(await persist())) return
    const { error: e } = await scheduleCampaign(c.id, now ? null : new Date(at).toISOString())
    if (e) { setError(friendlyError(e)); await refresh(); return }
    setConfirm(null)
    await refresh()
    onMoved()
  })
  const reopen = () => send.run(async () => {
    const { error: e } = await cancelCampaign(c.id)
    if (e) { setError(friendlyError(e)); await refresh(); return }
    setConfirm(null)
    await refresh()
    onMoved()
  })
  const remove = () => send.run(async () => {
    const { data, error: e } = await deleteCampaign(c.id)
    if (e || !data.length) { setError(e ? friendlyError(e) : 'This campaign is no longer a draft. Reload to see its latest state.'); return }
    guard.stay()
    location.hash = '#/campaigns'
  })

  const sizeText = !audience ? 'Choose who receives this campaign.'
    : audience.kind === 'followup' ? 'Counted when sending starts.'
    : size.isPending ? 'Counting…'
    : size.isError ? 'The audience size did not load. It is counted again when sending starts.'
    : 'people' in size.data ? `About ${size.data.people.toLocaleString('en-GB')} ${size.data.people === 1 ? 'person' : 'people'}. The list is taken when sending starts; people who unsubscribed or have no email address are left out.`
    : `About ${size.data.records.toLocaleString('en-GB')} records match. The list is taken when sending starts; records without a usable address are left out.`
  const reportPicked = reports.data?.find((r) => r.id === d.reportId) ?? null

  return (
    <section className="flex max-w-2xl flex-col gap-4" aria-labelledby="campaign-h">
      <a className="rnr-btn rnr-btn-ghost self-start" href="#/campaigns"><BackIcon />Campaigns</a>
      <h1 id="campaign-h" className="page-title" tabIndex={-1}>{c.name}</h1>
      <p className="rnr-caption" role="status">{notice}</p>

      {c.status === 'scheduled' && (
        <div className="rnr-card gap-3">
          <p>Scheduled for <When iso={c.scheduled_at!} />. It cannot be edited until the schedule is cancelled.</p>
          <div><button type="button" className="rnr-btn rnr-btn-secondary" onClick={() => { setError(null); setConfirm('cancel') }}>Cancel schedule</button></div>
        </div>
      )}
      {c.status === 'failed' && (
        <div className="rnr-card gap-3">
          <p className="rnr-status" role="alert"><XIcon />{c.error ?? 'This campaign was not sent.'}</p>
          <div><button type="button" className="rnr-btn rnr-btn-secondary" aria-busy={send.busy} onClick={() => void reopen()}>Edit and schedule again</button></div>
        </div>
      )}

      {draft && (
        <form className="rnr-card gap-4" onSubmit={(e) => { e.preventDefault(); void onSave() }} noValidate>
          <div className="rnr-field">
            <label className="rnr-label" htmlFor={`${uid}-n`}>Name</label>
            <input id={`${uid}-n`} className="rnr-input" value={d.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="rnr-field">
            <label className="rnr-label" htmlFor={`${uid}-t`}>Message template</label>
            <select id={`${uid}-t`} className="rnr-input" value={d.templateId} aria-describedby={issue ? `${uid}-ti` : undefined} onChange={(e) => set({ templateId: e.target.value })}>
              <option value="">Choose a template</option>
              {(['email', 'in_app'] as const).map((ch) => (
                <optgroup key={ch} label={ch === 'email' ? 'Email' : 'In-app'}>
                  {templates.data?.filter((t) => t.channel === ch && t.kind !== 'invite').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </optgroup>
              ))}
            </select>
            {issue && <p id={`${uid}-ti`} className="rnr-hint">{issue}</p>}
          </div>
          {d.kind === 'followup' ? (
            <p className="rnr-muted">{savedAudience?.kind === 'followup' && savedAudience.who === 'not_completed'
              ? 'People from the earlier campaign who have not finished its workflow.'
              : 'People from the earlier campaign who did not open it.'}</p>
          ) : (
            <fieldset className="flex flex-col gap-3">
              <legend className="rnr-fieldset-label">Who receives it</legend>
              <div className="rnr-seg" role="radiogroup" aria-label="Who receives it">
                {(['role', 'report'] as const).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={d.kind === k} onClick={() => set({ kind: k })}>{k === 'role' ? 'A role' : 'A report'}</button>
                ))}
              </div>
              {d.kind === 'role' && (
                <div className="rnr-field">
                  <label className="rnr-label" htmlFor={`${uid}-r`}>Role</label>
                  <select id={`${uid}-r`} className="rnr-input" value={d.roleId} onChange={(e) => set({ roleId: e.target.value })}>
                    <option value="">Choose a role</option>
                    {roles.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              )}
              {d.kind === 'report' && (
                <>
                  <div className="rnr-field">
                    <label className="rnr-label" htmlFor={`${uid}-p`}>Report</label>
                    <select id={`${uid}-p`} className="rnr-input" value={d.reportId} onChange={(e) => set({ reportId: e.target.value, to: 'starter' })}>
                      <option value="">Choose a report</option>
                      {reports.data?.map((r) => <option key={r.id} value={r.id} disabled={!!r.group_by}>{r.group_by ? `${r.name} (grouped reports cannot choose recipients)` : r.name}</option>)}
                    </select>
                  </div>
                  {reportPicked && <SendTo reportId={reportPicked.id} value={d.to} onChange={(to) => set({ to })} />}
                </>
              )}
            </fieldset>
          )}
          <p className="rnr-caption" aria-live="polite">{sizeText}</p>
          <div className="rnr-field">
            <label className="rnr-label" htmlFor={`${uid}-w`}>Linked workflow (optional)</label>
            <select id={`${uid}-w`} className="rnr-input" value={d.linked} aria-describedby={`${uid}-wh`} onChange={(e) => set({ linked: e.target.value })}>
              <option value="">None</option>
              {workflows.data?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <p id={`${uid}-wh`} className="rnr-hint">The report then shows how many recipients started and finished it.</p>
          </div>
          {conflict && (
            <div className="flex flex-col items-start gap-2" role="alert">
              <p className="rnr-error">{SAVE_CONFLICT}</p>
              <button type="button" className="rnr-btn rnr-btn-secondary" onClick={() => { guard.stay(); void refresh() }}>Reload campaign</button>
            </div>
          )}
          {error && <p className="rnr-error" role="alert">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="rnr-btn rnr-btn-secondary" aria-busy={save.busy}>
              {save.busy && <span className="rnr-spin" aria-hidden="true" />}{save.saved ? <><CheckIcon />Saved</> : save.busy ? 'Saving…' : 'Save draft'}
            </button>
            <button type="button" className="rnr-btn rnr-btn-danger ml-auto" onClick={() => { setError(null); setConfirm('delete') }}>Delete draft</button>
          </div>
          <fieldset className="flex flex-col gap-3">
            <legend className="rnr-fieldset-label">Send</legend>
            <div className="rnr-field">
              <label className="rnr-label" htmlFor={`${uid}-at`}>Send at ({zone})</label>
              <input id={`${uid}-at`} type="datetime-local" className="rnr-input" value={at} onChange={(e) => setAt(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rnr-btn rnr-btn-secondary" aria-busy={send.busy} onClick={() => void schedule(false)}>Schedule</button>
              <button type="button" className="rnr-btn rnr-btn-primary" onClick={() => { setError(null); setConfirm('now') }}>Send now</button>
            </div>
          </fieldset>
        </form>
      )}

      <ConfirmDialog open={confirm === 'now'} title={`Send ${d.name.trim() || c.name} now?`} body={`${sizeText} You cannot cancel it once sending starts.`}
        confirmLabel="Send now" busyLabel="Sending…" busy={send.busy} error={error} onClose={() => setConfirm(null)} onConfirm={() => void schedule(true)} />
      <ConfirmDialog open={confirm === 'cancel'} title="Cancel the schedule?" body="The campaign goes back to a draft and nothing is sent."
        confirmLabel="Cancel schedule" busyLabel="Cancelling…" busy={send.busy} error={error} onClose={() => setConfirm(null)} onConfirm={() => void reopen()} />
      <ConfirmDialog open={confirm === 'delete'} title={`Delete ${c.name}?`} body="This draft will be deleted and cannot be recovered."
        confirmLabel="Delete draft" busyLabel="Deleting…" busy={send.busy} error={error} onClose={() => setConfirm(null)} onConfirm={() => void remove()} />
      <ConfirmDialog open={!!guard.leaveTo} title="Leave without saving?" body="Your changes to this campaign will be lost."
        confirmLabel="Leave without saving" busyLabel="Leaving…" busy={false} error={null} onClose={guard.stay} onConfirm={guard.leave} />
    </section>
  )
}

/** "The person who started each record", or a short-text answer that holds an address (decision 1). */
function SendTo({ reportId, value, onChange }: { reportId: string; value: string; onChange(to: string): void }) {
  const report = useReport(reportId)
  if (!report.data) return null
  return <SendToFields workflowId={report.data.workflow_id} value={value} onChange={onChange} />
}
function SendToFields({ workflowId, value, onChange }: { workflowId: string; value: string; onChange(to: string): void }) {
  const { orgId } = useOrg()
  const uid = useId()
  const wf = useWorkflow(workflowId)
  const forms = useForms(orgId)
  const options = useMemo(() => (wf.data && forms.data
    ? dataColumns(stepFields(wf.data.graph, new Map(forms.data.map((f) => [f.id, f.schema as Field[]])))).filter((col) => col.type === 'short_text' && /^[a-z][a-z0-9_]*$/.test(col.path))
    : []), [wf.data, forms.data])
  return (
    <div className="rnr-field">
      <label className="rnr-label" htmlFor={`${uid}-s`}>Send to</label>
      <select id={`${uid}-s`} className="rnr-input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="starter">The person who started each record</option>
        {options.map((col) => <option key={col.path} value={col.path}>The address in “{col.label}”</option>)}
      </select>
    </div>
  )
}
```

Notes for the implementer: a template with `kind = 'invite'` is never offered (its `{{link.invite}}` has no meaning in a campaign); the follow-up summary is read-only; `useLeaveGuard` covers hash changes, sign-out and org switch (QA-P2-4); the Send now confirmation is the only primary in its dialog and "Send now" the only primary on the page.

- [ ] **Step 9: Settings** — `src/comms/SettingsPage.tsx`: add after the "Email notifications" section, inside the outer `<section>`:

```tsx
      <CampaignEmails />
```

and at the end of the file:

```tsx
function CampaignEmails() {
  const { orgId, orgs, userId } = useOrg()
  const optOut = useOptOut(userId, orgId)
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useNotice()
  const act = useAction()
  const org = orgs.find((o) => o.id === orgId)?.name ?? 'this organisation'
  const toggle = (receive: boolean) => act.run(async () => {
    if (!optOut.data) return
    setError(null)
    const { data, error: e } = await setOptOut(orgId!, optOut.data.email, !receive)
    if (e || !data?.length) { setError(SAVE_FAILED); return }
    await qc.invalidateQueries({ queryKey: ['optout', userId, orgId] })
    setNotice(`Campaign emails from ${org} turned ${receive ? 'on' : 'off'}.`)
  })
  return (
    <section className="rnr-card gap-4" aria-labelledby="campaign-emails-h">
      <h2 id="campaign-emails-h" className="dialog-title">Campaign emails</h2>
      {optOut.isPending && <Skeleton rows={[{ w: '260px' }]} />}
      {optOut.isError && (
        <div className="flex flex-col items-start gap-2">
          <p className="rnr-error" role="alert">This setting did not load. Check your connection and try again.</p>
          <button type="button" className="rnr-btn rnr-btn-secondary" onClick={() => void optOut.refetch()}>Try again</button>
        </div>
      )}
      {optOut.isSuccess && optOut.data && (
        <div className="flex flex-col">
          <label className="rnr-check">
            <input type="checkbox" checked={!optOut.data.optedOut} aria-describedby="campaign-emails-c" aria-busy={act.busy} onChange={(e) => void toggle(e.target.checked)} />
            <span>Campaign emails from {org}</span>
          </label>
          <p className="rnr-caption rnr-pref-caption" id="campaign-emails-c">
            Announcements and reminders {org} sends to many people at once. Turning this off stops them from {org} only; emails about your own tasks and records still arrive.
          </p>
        </div>
      )}
      <p className="rnr-caption" role="status">{notice}</p>
      {error && <p className="rnr-error" role="alert">{error}</p>}
    </section>
  )
}
```

Add the imports `useAction` (`../ui/useAction`) and `setOptOut, useOptOut` (`../campaigns/api`).

- [ ] **Step 10: App shell** — `src/App.tsx`: import `CampaignsPage` and `CampaignPage`; add `case 'campaigns': return <CampaignsPage />` and `case 'campaign': return <CampaignPage id={route.id} />` to `Page`; add `broadcast: can('comms.broadcast')` to the `guardHash` perms object; add the nav link after Messages:

```tsx
            {can('comms.broadcast') && link('#/campaigns', 'Campaigns', route.page === 'campaigns' || route.page === 'campaign')}
```

Add the designer's §12 classes for the list and editor to `src/index.css`.

- [ ] **Step 11: Check**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: `pass 216`; oxlint clean; build passes with `check-dist: ok`.

- [ ] **Step 12: Commit**

```bash
git add src/campaigns src/rbac/route.ts src/rbac/route.test.ts src/ui/errors.ts src/ui/errors.test.ts src/comms/SettingsPage.tsx src/App.tsx src/index.css
git commit -m "feat: add the campaigns list, editor and campaign email setting"
```

---
### Task 9: Frontend — campaign report, chart, recipients, CSV, follow-ups, end-to-end check

**Owner:** Frontend engineer · **Depends on:** 4, 5, 8

**Files:**
- Create: `src/campaigns/chart.ts`, `src/campaigns/chart.test.ts`, `src/campaigns/CampaignChart.tsx`, `src/campaigns/RecipientTable.tsx`
- Modify: `src/campaigns/CampaignReport.tsx` (replaces the Task 8 placeholder), `src/index.css` (designer §12 chart and tile classes)

**Interfaces:**
- Consumes: `useCampaignStats`, `statsOf`, `useCampaignDaily`, `useCampaignCompletion`, `useRecipients`, `downloadRecipients`, `createCampaign`, `RECIPIENT_PAGE`, `Campaign`, `DayRow`, `RecipientFilter` (Task 8); `campaignTiles`, `excludedText`, `pct`, `pctText`, `RECIPIENT_STATUS`, `FollowupWho` (Task 2); `FOCUS_KEY` (`CampaignEditor.tsx`); `niceTicks`, `MIN_CHART_WIDTH` (`src/reports/chart.ts`); `useWorkflows`; the Phase 5 chart classes `rnr-chart`, `rnr-chart-grid`, `rnr-chart-zero`, `rnr-chart-axis`, `rnr-chart-line`, `rnr-chart-dot`.
- Produces:
  - `src/campaigns/chart.ts`: `type DayPoint = { day: number; opens: number; clicks: number }`, `type Point = { x: number; y: number; value: number }`, `dailyGeometry(days: DayPoint[], width: number, height: number): { width; height; left; right; bottom; ticks: { value: number; y: number }[]; xs: number[]; opens: Point[]; clicks: Point[] }`, `polyline(p: Point[]): string`, `dailySummary(days: DayPoint[]): string`
  - `CampaignReport({ campaign })`, `CampaignChart({ days })`, `RecipientTable({ campaign })`

- [ ] **Step 1: Write the failing tests** — `src/campaigns/chart.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dailyGeometry, dailySummary, polyline } from './chart.ts'

const days = (opens: number[], clicks: number[]) => opens.map((o, i) => ({ day: i, opens: o, clicks: clicks[i] ?? 0 }))

test('seven days spread across the width with a zero baseline', () => {
  const g = dailyGeometry(days([10, 4, 2, 0, 0, 0, 1], [5, 1]), 400, 200)
  assert.deepEqual([g.xs[0], g.xs[6], g.bottom], [40, 388, 176])
  assert.deepEqual(g.ticks.map((t) => t.value), [0, 2.5, 5, 7.5, 10])
  assert.deepEqual([g.ticks[0].y, g.opens[0].y, g.clicks[0].y], [176, 8, 92])
  assert.equal(polyline(g.opens.slice(0, 2)), '40.0,8.0 98.0,108.8')
})

test('nothing opened draws flat lines on the baseline without dividing by zero', () => {
  const g = dailyGeometry(days([0, 0, 0, 0, 0, 0, 0], []), 320, 160)
  assert.deepEqual(g.ticks.map((t) => t.value), [0, 1])
  assert.ok([...g.opens, ...g.clicks].every((p) => p.y === g.bottom && Number.isFinite(p.x)))
})

test('the summary names the totals and the busiest day', () => {
  assert.equal(dailySummary(days([3, 9, 0, 0, 0, 0, 0], [1])), 'Opens and clicks over the first 7 days: 12 opens and 1 click, most opens on day 2.')
  assert.equal(dailySummary(days([0, 0, 0, 0, 0, 0, 0], [])), 'Nothing was opened or clicked in the first 7 days.')
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test`
Expected: `chart.test.ts` cannot find `./chart.ts`.

- [ ] **Step 3: Chart geometry** — `src/campaigns/chart.ts`

```ts
import { niceTicks } from '../reports/chart.ts'

export type DayPoint = { day: number; opens: number; clicks: number }
export type Point = { x: number; y: number; value: number }
const LEFT = 40 // room for four tabular digits on the y axis
const RIGHT = 12
const TOP = 8
const AXIS = 24 // the "Day n" labels under the plot

/** Opens (series 1) and clicks (series 2) per day on one shared y scale that always starts at zero. */
export function dailyGeometry(days: DayPoint[], width: number, height: number) {
  const bottom = height - AXIS
  const values = niceTicks(0, Math.max(0, ...days.flatMap((d) => [d.opens, d.clicks]))) // [0, 1] when everything is 0
  const hi = values[values.length - 1]
  const y = (v: number) => bottom - (v / hi) * (bottom - TOP)
  const step = days.length > 1 ? (width - LEFT - RIGHT) / (days.length - 1) : 0
  const xs = days.map((_, i) => LEFT + i * step)
  const series = (k: 'opens' | 'clicks'): Point[] => days.map((d, i) => ({ x: xs[i], y: y(d[k]), value: d[k] }))
  return { width, height, left: LEFT, right: RIGHT, bottom, ticks: values.map((value) => ({ value, y: y(value) })), xs, opens: series('opens'), clicks: series('clicks') }
}

export const polyline = (p: Point[]) => p.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')

export function dailySummary(days: DayPoint[]): string {
  const opens = days.reduce((a, d) => a + d.opens, 0)
  const clicks = days.reduce((a, d) => a + d.clicks, 0)
  if (!opens && !clicks) return 'Nothing was opened or clicked in the first 7 days.'
  const best = days.reduce((a, d) => (d.opens > a.opens ? d : a), days[0])
  const n = (v: number, one: string, many: string) => `${v.toLocaleString('en-GB')} ${v === 1 ? one : many}`
  return `Opens and clicks over the first 7 days: ${n(opens, 'open', 'opens')} and ${n(clicks, 'click', 'clicks')}, most opens on day ${best.day + 1}.`
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm test`
Expected: `pass 219` (216 + 3), `fail 0`.

- [ ] **Step 5: The chart** — `src/campaigns/CampaignChart.tsx`

```tsx
import { useEffect, useId, useRef, useState } from 'react'
import { MIN_CHART_WIDTH } from '../reports/chart'
import type { DayRow } from './api'
import { dailyGeometry, dailySummary, polyline } from './chart'

const HEIGHT = 200
type Series = 'in' | 'out'
const LABEL: Record<Series, string> = { in: 'Opens', out: 'Clicks' }

/** Opens in --in with circles and a solid line, clicks in --out with squares and a dashed line: never colour alone (design/README dataviz). */
export function CampaignChart({ days }: { days: DayRow[] }) {
  const uid = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [asTable, setAsTable] = useState(false)
  const [active, setActive] = useState<Series | null>(null)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const table = asTable || (width > 0 && width < MIN_CHART_WIDTH)
  const summary = dailySummary(days)
  const g = width > 0 ? dailyGeometry(days, width, HEIGHT) : null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <ul className="rnr-chart-legend" aria-label="Series">
          {(['in', 'out'] as const).map((s) => (
            <li key={s} onPointerEnter={() => setActive(s)} onPointerLeave={() => setActive(null)}>
              <svg width="20" height="10" aria-hidden="true"><line className="rnr-chart-line" data-series={s} x1="0" x2="20" y1="5" y2="5" /></svg>{LABEL[s]}
            </li>
          ))}
        </ul>
        <button type="button" className="rnr-btn rnr-btn-ghost ml-auto" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>Show as table</button>
      </div>
      <div ref={wrap} className="rnr-chart-wrap">
        {!table && g && (
          <svg className="rnr-chart" viewBox={`0 0 ${g.width} ${g.height}`} role="img" aria-labelledby={`${uid}-t`} data-active={active ?? undefined}>
            <title id={`${uid}-t`}>{summary}</title>
            {g.ticks.map((t) => (
              <g key={t.value}>
                <line className={t.value === 0 ? 'rnr-chart-zero' : 'rnr-chart-grid'} x1={g.left} x2={g.width - g.right} y1={t.y} y2={t.y} />
                <text className="rnr-chart-axis rnr-num" x={g.left - 6} y={t.y} textAnchor="end" dominantBaseline="middle">{t.value.toLocaleString('en-GB')}</text>
              </g>
            ))}
            {g.xs.map((x, i) => (
              <text key={x} className="rnr-chart-axis" x={x} y={g.height - 6} textAnchor="middle">Day {days[i].day + 1}</text>
            ))}
            <polyline className="rnr-chart-line" data-series="in" points={polyline(g.opens)} />
            <polyline className="rnr-chart-line" data-series="out" points={polyline(g.clicks)} />
            {g.opens.map((p) => <circle key={`o${p.x}`} className="rnr-chart-dot" data-series="in" cx={p.x} cy={p.y} r={4}><title>{`${p.value} opens`}</title></circle>)}
            {g.clicks.map((p) => <rect key={`c${p.x}`} className="rnr-chart-dot" data-series="out" x={p.x - 4} y={p.y - 4} width={8} height={8}><title>{`${p.value} clicks`}</title></rect>)}
          </svg>
        )}
        {table && (
          <table className="rnr-table">
            <caption className="sr-only">{summary}</caption>
            <thead><tr><th scope="col">Day</th><th scope="col" className="num">Opens</th><th scope="col" className="num">Clicks</th></tr></thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.day}><th scope="row">Day {d.day + 1}</th><td className="num">{d.opens.toLocaleString('en-GB')}</td><td className="num">{d.clicks.toLocaleString('en-GB')}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="rnr-caption">{summary}</p>
    </div>
  )
}
```

- [ ] **Step 6: The recipient table** — `src/campaigns/RecipientTable.tsx`

```tsx
import { useState } from 'react'
import { DownloadIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { When } from '../ui/Time'
import { useAction } from '../ui/useAction'
import { RECIPIENT_PAGE, downloadRecipients, useRecipients, type Campaign, type RecipientFilter } from './api'
import { RECIPIENT_STATUS, type RecipientRow } from './logic'

const time = (iso: string | null) => (iso ? <When iso={iso} /> : <span className="rnr-muted">Not yet</span>)
const statusOf = (r: RecipientRow) => (r.bounced_at ? 'Bounced' : RECIPIENT_STATUS[r.status] ?? r.status)

export function RecipientTable({ campaign: c }: { campaign: Campaign }) {
  const inApp = c.channel === 'in_app'
  const [filter, setFilter] = useState<RecipientFilter>('all')
  const [page, setPage] = useState(1)
  const q = useRecipients(c.id, filter, page)
  const dl = useAction()
  const [dlNote, setDlNote] = useState<string | null>(null)
  const [dlError, setDlError] = useState<string | null>(null)
  const filters: [RecipientFilter, string][] = inApp
    ? [['all', 'Everyone'], ['not_opened', 'Not read']]
    : [['all', 'Everyone'], ['not_opened', 'Not opened'], ['bounced', 'Bounced']]
  const empty: Record<RecipientFilter, string> = { all: 'Nobody received this campaign.', not_opened: inApp ? 'Everyone read it.' : 'Everyone opened it.', bounced: 'Nothing bounced.' }
  const total = q.data?.total ?? 0
  const last = Math.max(1, Math.ceil(total / RECIPIENT_PAGE))
  const from = total ? (page - 1) * RECIPIENT_PAGE + 1 : 0
  const to = Math.min(page * RECIPIENT_PAGE, total)
  const download = () => dl.run(async () => {
    setDlNote(null); setDlError(null)
    const r = await downloadRecipients(c)
    if ('error' in r) setDlError(r.error)
    else setDlNote(`Saved ${r.filename}.`)
  })

  return (
    <section className="rnr-card gap-3" aria-labelledby="recipients-h">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="recipients-h" className="dialog-title">Recipients</h2>
        <button type="button" className="rnr-btn rnr-btn-secondary ml-auto" aria-busy={dl.busy} onClick={() => void download()}>
          {dl.busy ? <span className="rnr-spin" aria-hidden="true" /> : <DownloadIcon />}{dl.busy ? 'Downloading…' : 'Download CSV'}
        </button>
      </div>
      <div className="rnr-seg" role="radiogroup" aria-label="Show">
        {filters.map(([f, label]) => (
          <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => { setFilter(f); setPage(1) }}>{label}</button>
        ))}
      </div>
      <p className="rnr-caption" role="status">{dlNote}</p>
      {dlError && <p className="rnr-error" role="alert">{dlError}</p>}
      {q.isPending && <Skeleton rows={[{ w: '100%', h: 160 }]} />}
      {q.isError && (
        <div className="flex flex-col items-start gap-2">
          <p className="rnr-error" role="alert">The recipients did not load. Check your connection and try again.</p>
          <button type="button" className="rnr-btn rnr-btn-secondary" onClick={() => void q.refetch()}>Try again</button>
        </div>
      )}
      {q.data && !q.data.rows.length && <p className="rnr-muted">{empty[filter]}</p>}
      {q.data && !!q.data.rows.length && (
        <div className="rnr-table-card" aria-busy={q.isFetching || undefined}>
          <table className="rnr-table rnr-sticky-first">
            <caption className="sr-only">Recipients of {c.name}</caption>
            <thead>
              {inApp
                ? <tr><th scope="col">Email</th><th scope="col">Read</th></tr>
                : <tr><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Delivered</th><th scope="col">Opened</th><th scope="col">Clicked</th><th scope="col">Error</th></tr>}
            </thead>
            <tbody>
              {q.data.rows.map((r) => (inApp
                ? <tr key={r.id}><th scope="row">{r.recipient_email}</th><td>{time(r.opened_at)}</td></tr>
                : (
                  <tr key={r.id}>
                    <th scope="row">{r.recipient_email}</th><td>{statusOf(r)}</td><td>{time(r.delivered_at)}</td>
                    <td>{time(r.opened_at)}</td><td>{time(r.clicked_at)}</td><td>{r.error ?? ''}</td>
                  </tr>
                )))}
            </tbody>
          </table>
        </div>
      )}
      {total > 0 && (
        <div className="rnr-pager">
          <p className="rnr-caption rnr-num">Showing {from.toLocaleString('en-GB')}–{to.toLocaleString('en-GB')} of {total.toLocaleString('en-GB')}</p>
          {page > 1 && <button type="button" className="rnr-btn rnr-btn-ghost" onClick={() => setPage((p) => p - 1)}>Previous</button>}
          {page < last && <button type="button" className="rnr-btn rnr-btn-ghost" onClick={() => setPage((p) => p + 1)}>Next</button>}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 7: The report** — `src/campaigns/CampaignReport.tsx`

```tsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { useWorkflows } from '../workflows/api'
import { friendlyError } from '../ui/errors'
import { BackIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { When } from '../ui/Time'
import { useAction } from '../ui/useAction'
import { CAMPAIGN_STATUS, createCampaign, statsOf, useCampaignCompletion, useCampaignDaily, useCampaignStats, type Campaign } from './api'
import { CampaignChart } from './CampaignChart'
import { FOCUS_KEY } from './CampaignEditor'
import { campaignTiles, excludedText, pct, pctText, type FollowupWho } from './logic'
import { RecipientTable } from './RecipientTable'

export const OPENS_NOTE = 'Opens are approximate: Apple Mail Privacy Protection opens emails automatically.'

export function CampaignReport({ campaign: c }: { campaign: Campaign }) {
  const { orgId, userId } = useOrg()
  const qc = useQueryClient()
  const sending = c.status === 'sending'
  const inApp = c.channel === 'in_app'
  const stats = useCampaignStats(orgId, sending)
  const daily = useCampaignDaily(c.id, sending)
  const completion = useCampaignCompletion(userId, c.id, !!c.linked_workflow_id && !!c.audience_snapshot_at)
  const workflows = useWorkflows(orgId)
  const act = useAction()
  const [error, setError] = useState<string | null>(null)
  const s = statsOf(stats.data, c.id)
  const tiles = campaignTiles(s, inApp ? 'in_app' : 'email')
  const left = excludedText(c.excluded)
  const workflowName = workflows.data?.find((w) => w.id === c.linked_workflow_id)?.name ?? 'the linked workflow'
  const notOpened = Math.max(0, s.sent - s.opened - s.bounced) // the exact list is taken when the follow-up is sent

  const followUp = (who: FollowupWho) => act.run(async () => {
    setError(null)
    const { data, error: e } = await createCampaign(orgId!, {
      name: `Follow-up: ${c.name}`.slice(0, 120), template_id: c.template_id,
      audience: { kind: 'followup', campaignId: c.id, who }, linked_workflow_id: who === 'not_completed' ? c.linked_workflow_id : null,
    })
    if (e) { setError(friendlyError(e)); return }
    try { sessionStorage.setItem(FOCUS_KEY, data.id) } catch { /* storage blocked: the new page keeps the browser's focus */ }
    await qc.invalidateQueries({ queryKey: ['campaigns', orgId] })
    location.hash = `#/campaigns/${data.id}`
  })

  return (
    <section className="flex max-w-5xl flex-col gap-4" aria-labelledby="campaign-h">
      <a className="rnr-btn rnr-btn-ghost self-start" href="#/campaigns"><BackIcon />Campaigns</a>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 id="campaign-h" className="page-title" tabIndex={-1}>{c.name}</h1>
        <span className="rnr-chip">{CAMPAIGN_STATUS[c.status]}</span>
      </div>
      {c.audience_snapshot_at && <p className="rnr-muted">Sending started <When iso={c.audience_snapshot_at} />{c.finished_at && <> · finished <When iso={c.finished_at} /></>}</p>}
      {stats.isPending && <Skeleton rows={[{ w: '100%', h: 96 }]} />}
      {stats.isError && <p className="rnr-error" role="alert">The numbers did not load. Reload the page to try again.</p>}
      {stats.isSuccess && (
        <div className="rnr-campaign-tiles" data-count={tiles.length}>
          {tiles.map((t) => (
            <div key={t.label} className="rnr-card gap-1">
              <h2 className="label">{t.label}</h2>
              <p className="rnr-kpi rnr-num">{t.value}</p>
              <p className="rnr-caption">{t.caption}</p>
              {t.label === 'Opened' && <p className="rnr-caption">{OPENS_NOTE}</p>}
            </div>
          ))}
        </div>
      )}
      {inApp && <p className="rnr-caption">In-app campaigns report reads only: an in-app notice has no delivery, open or click tracking.</p>}
      {left && <p className="rnr-caption">{left}</p>}

      <section className="rnr-card gap-3" aria-labelledby="daily-h">
        <h2 id="daily-h" className="dialog-title">{inApp ? 'Reads over the first 7 days' : 'Opens and clicks over the first 7 days'}</h2>
        {daily.isPending && <Skeleton rows={[{ w: '100%', h: 200 }]} />}
        {daily.isError && <p className="rnr-error" role="alert">The chart did not load. Reload the page to try again.</p>}
        {daily.data && <CampaignChart days={daily.data} />}
      </section>

      {c.linked_workflow_id && completion.data === null && (
        <p className="rnr-caption">Completion needs permission to see every record of {workflowName}.</p>
      )}
      {completion.data && (
        <section className="rnr-card gap-3" aria-labelledby="completion-h">
          <h2 id="completion-h" className="dialog-title">{workflowName}</h2>
          <div className="flex flex-wrap gap-6">
            <div><p className="label">Started</p><p className="rnr-kpi rnr-num">{pctText(pct(completion.data.started, completion.data.people))}</p>
              <p className="rnr-caption">{completion.data.started.toLocaleString('en-GB')} of {completion.data.people.toLocaleString('en-GB')} members</p></div>
            <div><p className="label">Finished</p><p className="rnr-kpi rnr-num">{pctText(pct(completion.data.finished, completion.data.people))}</p>
              <p className="rnr-caption">{completion.data.finished.toLocaleString('en-GB')} of {completion.data.people.toLocaleString('en-GB')} members</p></div>
          </div>
          {c.status !== 'sent' ? null : completion.data.people > completion.data.finished
            ? <div><button type="button" className="rnr-btn rnr-btn-secondary" aria-busy={act.busy} onClick={() => void followUp('not_completed')}>Remind non-completers</button></div>
            : <p className="rnr-muted">Everyone has finished.</p>}
        </section>
      )}

      {sending && <p className="rnr-caption">Follow-ups become available once every email has left the queue.</p>}
      {c.status === 'sent' && (
        notOpened > 0
          ? <div><button type="button" className="rnr-btn rnr-btn-secondary" aria-busy={act.busy} onClick={() => void followUp('not_opened')}>{inApp ? 'Send follow-up to not read' : 'Send follow-up to not opened'}</button></div>
          : <p className="rnr-muted">{inApp ? 'Everyone read it.' : 'Everyone opened it.'}</p>
      )}
      {error && <p className="rnr-error" role="alert">{error}</p>}

      <RecipientTable campaign={c} />
    </section>
  )
}
```

Add to `src/index.css` the designer's §12 classes; this markup uses (names may change to the designer's, values from tokens only):

```css
.rnr-campaign-tiles { display: grid; gap: var(--space-4); grid-template-columns: minmax(0, 1fr); }
@media (min-width: 640px) { .rnr-campaign-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 1024px) { .rnr-campaign-tiles[data-count="5"] { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
.rnr-chart-line[data-series="out"] { stroke: var(--out); stroke-dasharray: 6 4; }
.rnr-chart-dot[data-series="out"] { fill: var(--out); }
.rnr-chart[data-active="in"] [data-series="out"], .rnr-chart[data-active="out"] [data-series="in"] { opacity: var(--opacity-dim); }
.rnr-chart-legend { display: flex; gap: var(--space-4); font-size: 12px; line-height: 16px; color: var(--ink-label); }
.rnr-chart-legend li { display: flex; align-items: center; gap: var(--space-2); }
@media (prefers-reduced-motion: no-preference) { .rnr-chart [data-series] { transition: opacity 120ms ease-out; } }
```

(`rnr-pager` exists from Phase 5. The dashed `out` line is the line-chart form of the B&W hatch: in Black & White themes `--out` is mid-grey, and the dash and the square markers carry the difference.)

- [ ] **Step 8: Check**

Run:
```bash
pnpm test && pnpm lint && pnpm build
DENO_NO_PACKAGE_JSON=1 deno test --allow-read supabase/functions
supabase db reset && supabase test db
```
Expected: `pass 219`; oxlint clean; build passes with `check-dist: ok`; deno: every test passes, the 9 env-gated ones ignored; pgTAP `All tests successful.` 11 files, 255 tests. Then, with the README variables set, the env-gated tests (advance race 2, send-messages race 1, send-campaigns db 2, resend-webhook db 1, run-report visibility 2, Realtime 1) all pass.

- [ ] **Step 9: End-to-end check in the Claude Browser pane** (fresh tab per user, `alpha.localhost:5173/app/` and `beta.localhost:5173/app/`; `supabase functions serve --env-file supabase/functions/.env.local` running with `UNSUBSCRIBE_URL`, `UNSUBSCRIBE_SECRET` and a local `RESEND_WEBHOOK_SECRET`; wait for `supabase status` to report every service before starting)

1. `admin@alpha.test`: Campaigns → New campaign "Term starts" → template "Record approved" shows the empty-variables warning; switch to a custom template using only `{{org.name}}` / `{{recipient.name}}` (create it in Templates first); audience "A role" → Member: "About 1 person. The list is taken when sending starts…"; Save draft shows Saved; Send now → confirm. Within a minute the page becomes the report: status Sending then Sent, Recipients 1, Delivered "0%", Opened "No data yet".
2. Mailpit (http://127.0.0.1:54324): the email has the footer and the `List-Unsubscribe` and `List-Unsubscribe-Post` headers. Copy its provider id from `messages`; run `node --env-file=supabase/functions/.env.local scripts/webhook-event.mjs email.opened <id>` → `200 {"matched":true}`; the report shows Delivered 100%, Opened 100%, the chart a point on day 1, the opens note visible. Run the same command again: nothing changes. Run it with a wrong secret: `401`.
3. Open the unsubscribe link from the email in a new tab: the confirmation page names Alpha School and shows no address; press Unsubscribe → "You are unsubscribed…". Settings as `member@alpha.test` shows "Campaign emails from Alpha School" unticked; tick it again → notice; untick → notice.
4. Admin: Send follow-up to not opened is hidden ("Everyone opened it."). Create a second campaign to the Viewer role with "Leave approval" linked: after it is sent, the completion block shows Started / Finished; Remind non-completers opens a draft "Follow-up: …" with the heading focused.
5. Report audience: a campaign to "Leave days by type" (grouped) is not selectable; create an ungrouped report and choose it with "The person who started each record"; after sending, recipients match the report's visible records.
6. A campaign to a role with nobody left after opt-outs fails: the editor shows the plain reason in `rnr-status` with "Edit and schedule again".
7. Recipients table: filters Everyone / Not opened / Bounced, pager text, Download CSV saves `term-starts-<date>.csv` with every row; a recipient address `=1+1@example.test` (via an email-answer audience) reads `'=1+1@example.test` in the file.
8. `member@alpha.test` and `viewer@alpha.test`: no Campaigns link; `#/campaigns` redirects to the inbox. `owner@beta.test`: an Alpha campaign id shows "This campaign does not exist".
9. 375 px: tiles stack, the chart switches to its table below the minimum width, tables scroll inside their card, no page-level horizontal scroll; Esc closes every dialog and returns focus; the B&W theme keeps the dashed square-marked clicks line distinct. Reset viewport and theme.

- [ ] **Step 10: Commit**

```bash
git add src/campaigns src/index.css
git commit -m "feat: add the campaign report with tracking, recipients, csv and follow-ups"
```

---
### Task 10: Documentation — README end to end, spec status, CI

**Owner:** Backend engineer · **Depends on:** 1–9

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-10-11-reportnoreport-v2-design.md`, `.github/workflows/ci-v2.yml` (check only: Tasks 4 and 5 added the two database tests)

**Interfaces:**
- Consumes: every function, secret, Vault entry and test command from Phases 1–6.
- Produces: a README that takes a new developer from a clean machine to a running, tested and deployed v2, and a spec whose status says what shipped.

- [ ] **Step 1: Replace `README.md`** with:

````markdown
# ReportNoReport v2

Forms, workflows, communication, reports and campaigns for school admins and HR teams. React 19 + Vite on Vercel; Supabase (Postgres with RLS, Auth, Storage, Realtime, pg_cron, Edge Functions) behind it. The design is `docs/superpowers/specs/2026-10-11-reportnoreport-v2-design.md`; each phase's plan and QA report are in `docs/superpowers/`.

## Run locally

```bash
brew install supabase/tap/supabase deno
pnpm install
supabase start                 # Postgres, Auth, Storage, Realtime, Mailpit, Edge runtime
supabase db reset              # migrations + seed
cp .env.example .env.local     # paste ANON_KEY from `supabase status`
cp supabase/functions/.env.example supabase/functions/.env.local   # once; fill it in as below
supabase functions serve --env-file supabase/functions/.env.local &
pnpm dev
```

The app is at http://localhost:5173/app/. Public pages: `/`, `/privacy`, `/terms`. Mailpit (every local email): http://127.0.0.1:54324.

Seed users (password `password123`): `owner@alpha.test`, `admin@alpha.test`, `member@alpha.test`, `viewer@alpha.test` (Alpha School), `owner@beta.test` (Beta HR). To test two people at once, open `alpha.localhost:5173/app/` and `beta.localhost:5173/app/`: each hostname has its own sign-in.

## Settings

Browser (`.env.local`, also set in Vercel): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Nothing secret ever goes in a `VITE_` variable.

Edge Functions (`supabase/functions/.env.local` locally; `supabase secrets set` when hosted). Each function reads its settings once at boot and refuses to start when one is missing or malformed.

| Variable | Used by | Local value | Hosted value |
|---|---|---|---|
| `CRON_SECRET` | `resume`, `send-messages`, `render-pdfs`, `send-campaigns` | `local-cron-secret` (matches `seed.sql`) | 16+ random characters, the same as the Vault secret `cron_secret` |
| `APP_URL` | `advance`, `send-messages`, `invite-member` (links in messages) | `http://localhost:5173/app/` | `https://reportnoreport.com/app/` |
| `EMAIL_TRANSPORT` | `send-messages` | `mailpit` | `resend` |
| `EMAIL_FROM` | `send-messages` | `ReportNoReport <noreply@reportnoreport.local>` | a sender on a domain verified in Resend |
| `MAILPIT_URL` | `send-messages` (mailpit only) | `http://host.docker.internal:54324` | not set |
| `RESEND_API_KEY` | `send-messages` (resend only) | not needed | the `re_…` key |
| `UNSUBSCRIBE_URL` | `send-campaigns`, `unsubscribe` | `http://127.0.0.1:54321/functions/v1/unsubscribe` | `https://<ref>.supabase.co/functions/v1/unsubscribe` |
| `UNSUBSCRIBE_SECRET` | `send-campaigns`, `unsubscribe` | any 32+ characters | 32+ random characters; changing it breaks links in emails already sent |
| `RESEND_WEBHOOK_SECRET` | `resend-webhook` | any `whsec_` + base64 value, e.g. `whsec_$(openssl rand -base64 24)` | the signing secret on the Resend webhook page |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` are provided by Supabase.

Vault secrets (pg_cron and the RPCs call the functions with these): `cron_secret`, `resume_url`, `send_messages_url`, `render_pdfs_url`, `send_campaigns_url`. `seed.sql` creates the local ones; a hosted project creates each with `select vault.create_secret('<value>', '<name>');`, the URLs being `https://<ref>.supabase.co/functions/v1/<function>`.

## How it fits together

- **Forms and workflows.** `submit-form` validates standalone submissions; `advance` runs every workflow step in one transaction with the record locked; `resume` (pg_cron, every minute) continues timers; `save-workflow` checks and publishes graphs.
- **Email and notifications.** Every email is a queued `messages` row. `send-messages` (pg_cron, every minute) sends up to 1,000 a run through Mailpit locally or Resend hosted (`Idempotency-Key` = message id), retries 3 times with backoff, waits a minute without spending an attempt when Resend rate-limits, then marks the message `failed` with a plain reason on the Messages page. In-app notifications arrive through Realtime. People mute email per type in Settings; in-app always arrives.
- **Reports.** `run-report` runs saved reports with the caller's own JWT (RLS decides every row), refuses more than 10,000 visible records (413) and exports CSV. `render-pdfs` (pg_cron and the `generate_pdf` action) renders record PDFs with `pdf-lib` and the Inter fonts (SIL OFL) into the private `record-pdfs` bucket. Inter covers Latin, Greek and Cyrillic; Tamil, Chinese, Japanese and other scripts print as empty boxes.
- **Campaigns.** `send-campaigns` (pg_cron every minute, and at once for "Send now") claims a due campaign, reads its audience — a role, a saved report's people, or the "not opened" / "not completed" people of an earlier campaign — with the visibility of the person who scheduled it, leaves out (and counts) unsubscribed, duplicate and unusable addresses, refuses more than 10,000 people, and queues one message each, all in one transaction. Every campaign email has a one-click unsubscribe link (`unsubscribe`), honoured per organisation. `resend-webhook` verifies Resend's signature and records delivered, opened, clicked, bounced and complained times; opens are approximate because Apple Mail Privacy Protection opens emails automatically.

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

| File | Proves |
|---|---|
| `advance/race.test.ts` | two simultaneous approvals advance a record once; a 501-person Send message stops the record |
| `send-messages/race.test.ts` | two overlapping cron runs remind an overdue task once |
| `send-campaigns/db.test.ts` | two overlapping runs send a 1,200-person campaign exactly once; a report audience follows the sender's visibility |
| `resend-webhook/db.test.ts` | replayed and late webhook events keep the earliest time; a complaint unsubscribes the address |
| `run-report/visibility.test.ts` | a report returns each seeded user only the records they can see |
| `_integration/realtime.test.ts` | Realtime sends a user only their own notifications |

Each test deletes what it creates. CI (`.github/workflows/ci-v2.yml`) runs all of the above on every pull request that touches `v2/`. Browser checks use the Claude Browser pane against `supabase start`, never Playwright.

## Deploy

**Supabase (hosted project).**
1. `supabase link --project-ref <ref>` and `supabase db push` (migrations only; never the seed).
2. Set the function secrets from the table above (`supabase secrets set CRON_SECRET=… APP_URL=… EMAIL_TRANSPORT=resend EMAIL_FROM=… RESEND_API_KEY=… UNSUBSCRIBE_URL=… UNSUBSCRIBE_SECRET=… RESEND_WEBHOOK_SECRET=…`).
3. Create the five Vault secrets (`cron_secret` equal to `CRON_SECRET`, and the four function URLs).
4. `supabase functions deploy` (every function; `config.toml` sets `verify_jwt = false` for the cron, webhook and unsubscribe functions, which check their own secret, signature or token).
5. In Resend: verify the sending domain, then add a webhook to `https://<ref>.supabase.co/functions/v1/resend-webhook` for `email.delivered`, `email.opened`, `email.clicked`, `email.bounced` and `email.complained`, and copy its signing secret into `RESEND_WEBHOOK_SECRET`. Turn on open and click tracking for the domain. Resend's default rate limit paces campaigns at roughly 120 emails a minute; ask Resend for more when campaigns are large.
6. Add `https://reportnoreport.com/app/` to Supabase Auth redirect URLs.

**Vercel.** Set the project Root Directory to `v2/` and `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Vercel builds with `pnpm build`, which fails if `scripts/check-dist.mjs` finds a leaked secret, a broken internal link, an `<img>` without `alt`, an image over 200 KB or a `[…]` placeholder. Routing, security headers and caching live in `vercel.json`.

## Known limits

Each is a `shortcut:` in the code with the point at which to change it: 10,000 visible records per report and 10,000 people per campaign (refused, never cut); 1,000 emails a minute; 500 people per workflow Send message (larger audiences are campaigns); 5 campaigns starting per minute; PDF times in UTC; scripts without Inter glyphs print as boxes; the newest 200 campaigns, 200 messages and 20 notifications per list.
````

- [ ] **Step 2: Spec status** — in `docs/superpowers/specs/2026-10-11-reportnoreport-v2-design.md`, change line 3 to:

```markdown
Date: 2026-10-11 · Status: implemented — Phases 1–6 built on `feat/v2-workflow-platform`; each phase's plan and QA report are in `docs/superpowers/plans/` and `docs/superpowers/qa/`
```

and add at the end of §8.1:

```markdown
As built (Phase 6 plan, decisions 1–11): a report audience is the records' starters or an email answer, read with the scheduler's visibility when sending starts; at most 10,000 people per campaign, refused rather than cut; campaigns also have a `failed` status with the reason; campaign email opt-outs are per organisation and by address (`email_optouts`, one-click unsubscribe), not `notification_prefs`, because report audiences include people without an account; the webhook keeps the earliest time of each event, so replays change nothing.
```

- [ ] **Step 3: Check**

Run: `grep -n "send-campaigns/db.test.ts\|resend-webhook/db.test.ts" ../.github/workflows/ci-v2.yml && pnpm build`
Expected: both test files listed in the env-gated step; the build passes (`check-dist` does not scan `README.md`, but the README has no secret values: every value in the table is a placeholder or a local default).

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-10-11-reportnoreport-v2-design.md
git commit -m "docs: document v2 end to end and mark the spec implemented"
```

---

## Self-review notes

- §8.1 `campaigns(org_id, name, template_id, audience jsonb, audience_snapshot_at, scheduled_at, status draft/scheduled/sending/sent, sent_by, linked_workflow_id?)` → Task 1, with `failed` added (decision 10) and `channel`, `recipients`, `excluded`, `error`, `finished_at` for the report; requires `comms.broadcast` (RLS, column grants, `schedule_campaign` / `cancel_campaign` checks, route guard).
- "Audience: a role, or the result of a saved report, snapshotted at send time" → decision 1, Task 4 (`resolveAudience`, `reportAudience` through the shared runner as the sender), proven by the real-database visibility test; follow-up audiences cover "Send follow-up to not opened" and "Remind non-completers".
- "Resend webhook → Edge Function (signature verified) writes delivered / opened / clicked / bounced / complained onto messages" → decision 6, Tasks 2 and 5; replays and late retries pinned by the real-database test; the local path is the fixture script plus Mailpit provider ids.
- Campaign report: tiles (recipients, delivered %, opened %, clicked %, bounced + failed) → `campaignTiles` (Task 2) in `CampaignReport` (Task 9); opens and clicks over the first 7 days → `campaign_daily` (Task 1) + `CampaignChart` (Task 9); recipient table with "not opened" / "bounced" filters and CSV export → `RecipientTable`, `downloadRecipients`, `recipientCsv` with Phase 5's guard (Tasks 2, 8, 9); "Send follow-up to not opened" → new draft with a follow-up audience (Task 9); with `linked_workflow_id`, completion % and "Remind non-completers" → `campaign_completion` (Task 1) and Task 9; Campaigns list with status, send date and delivered / opened / clicked % → Task 8; opens labelled approximate → `OPENS_NOTE` and the Opened tile caption; in-app campaigns report read only → decision 8.
- §8 "Users may mute email per notification type; in-app is always delivered" → workflow emails unchanged; campaign emails use per-organisation opt-outs with a one-click link (decision 5, Tasks 1, 3, 4, 6, 8); in-app campaigns ignore opt-outs.
- §10 → unsigned or bad-signature webhooks are 401 and nothing is stored (Task 5); campaigns fail with a reason and never drop anyone silently (decisions 2–4); every 500 and stored reason is a fixed sentence; the browser is never trusted (audience, rendering and footer are server-side).
- §11 → unit: audience parsing, recipient planning, percentages, tiles, template variables, footer escaping, tokens, Svix signatures, recipient CSV, keyset download, chart geometry; pgTAP: RLS allow/deny per permission, cross-org, column grants, schedule/cancel guards, stats, completion permission, opt-out policies, the in-app read trigger, cron; Deno: `send-campaigns` (exactly once, cap, exclusions, report audience, in-app, follow-ups, failures), `send-messages` loop / rate limit / headers, webhook and unsubscribe handlers; real-database: exactly once under concurrent cron, sender visibility, webhook idempotency; one browser end-to-end flow (Task 9 Step 9).
- §12 phase 6 "broadcast, scheduling, webhook tracking, campaign report, follow-ups" → Tasks 1–9; the final documentation task (Task 10) closes v2.
- §15 → the designer's spec first (Task 7); tokens and `rnr-*` classes only; series 1 `in` / series 2 `out` with shape and dash so colour is never alone.
- QA defect classes → silent truncation (decision 2, cap + 1 role read, `excluded` counts, CSV refuses short files, the list shows "newest 200 of N", `send-messages` leaves the rest queued), raw error leaks (`NOT_PREPARED`, fixed webhook/unsubscribe/500 sentences, a test asserts the exception text is not stored), "we" in copy (footer, unsubscribe page and tests assert it), inline styles (none; SVG attributes and classes), layer trap (no utility overrides on `rnr-*` blocks), focus loss (heading focus after delete/schedule/cancel/follow-up via `CampaignPage`'s `useFocusAfterRender` and `FOCUS_KEY`), stale cross-user cache (`userId` in per-person keys), test cleanup (every real-database test deletes by tag in `finally`), Realtime warm-up (no new Realtime test; README says to wait for `supabase status`).
- Expected counts: `pnpm test` 193 → 212 (Task 2) → 216 (Task 8) → 219 (Task 9); `deno test supabase/functions` gains 19 (Task 2) + 5 (Task 3) + 11 (Task 4) + 4 (Task 5) + 4 (Task 6) passing and 3 more ignored without variables (Tasks 4 and 5); `supabase test db` 213 in 10 files → 255 in 11 files (Task 1).
- Out of scope, by the spec: SMS / WhatsApp; A/B tests and per-recipient personalisation beyond `{{recipient.name}}`; per-campaign link tracking beyond Resend's own. Deferred with a `shortcut:` note: 1,000 emails a minute (Resend batch endpoint), 5 campaigns starting per minute, the newest 200 campaigns in the list.
