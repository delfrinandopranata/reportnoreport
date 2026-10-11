# Phase 4 — Communication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People hear about work without polling: a new task notifies its assignees in the app and by email, an overdue task reminds them once, a workflow's "Send message" action really sends a template to the people it names, an org's admins edit the five system templates (and their own) with a variable menu and a preview against a real record, every email is a queued row a worker delivers with retries and a visible failure, and each person sees a live bell and can mute email per notification type.

**Architecture:** A pure TypeScript module, `supabase/functions/_shared/comms/` (renderer, variable list, recipient rules), runs in the browser (preview, variable menu, action editor), in the Edge Functions and under both `node --test` and `deno test`, like Phase 2's `_shared/forms` and Phase 3's `_shared/workflow`. Messages are rendered and queued **inside the transaction that causes them**: the Phase 3 engine (`advance/engine.ts`) gains `advance/notify.ts`, which writes `notifications` rows and queued `messages` rows through new `Tx` methods when a task is created and when a `send_message` action runs. A new `send-messages` Edge Function, woken every minute by pg_cron through pg_net (the Phase 3 `resume` pattern: Vault URL + shared `cron_secret`), first marks overdue tasks once and queues "Task overdue", then drains the queue through a `Transport` (Resend in production, Mailpit locally, an in-memory fake in tests) with three retries and exponential backoff. Postgres adds `message_templates` (seeded per org by trigger), `messages`, `notifications` (published to Supabase Realtime, RLS: own rows only) and `notification_prefs`, plus `retry_message`. The frontend adds a bell with a Realtime subscription, a Settings screen for email preferences, Templates and Messages pages for `comms.manage`, and a real "Send message" editor in the workflow side panel.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, supabase-js 2 (incl. Realtime `postgres_changes`), Supabase CLI (Postgres 17, pgTAP, `pg_cron`, `pg_net`, Vault, Realtime, Mailpit), Deno 2 Edge Functions, `npm:postgres@3.4.5` (Deno only, already in `deno.lock`), Resend HTTP API (`fetch`, no SDK), `node --test`, oxlint. No new web dependencies.

**Spec:** `docs/superpowers/specs/2026-10-11-reportnoreport-v2-design.md` (§8 Communication module except §8.1 Campaigns, which is Phase 6; §10 Error handling; §11 Testing; §12 phase 4; §15 Design system)

## Global Constraints

- Everything from the Phase 1–3 Global Constraints still holds (org-scoped tables, `has_permission()` in every policy, British English, sentence-case verb-first buttons, no emoji, `design/` authoritative, tokens only, one `rnr-btn-primary` per view, never `disabled` on submit, `aria-busy` + `rnr-spin` while saving, native `<dialog>` via `src/ui/ConfirmDialog.tsx`, the browser never trusted, the app served from `/app/`, `pnpm build` runs `scripts/check-dist.mjs`).
- **Decisions this plan takes (reviewer: check these):**
  1. **Local email goes to Mailpit through its HTTP send API; tests use an injected fake.** `send-messages` reads `EMAIL_TRANSPORT` (`resend` | `mailpit`), `EMAIL_FROM`, and `RESEND_API_KEY` (only for `resend`, must match `^re_[A-Za-z0-9_]{16,}$`) once at boot and throws before serving if any is missing or malformed, so a bad deploy fails loudly instead of queueing mail that can never leave. Mailpit is what `supabase start` already runs (`[local_smtp]`, UI on :54324, where invite mail lands today); its `POST /api/v1/send` takes JSON over plain `fetch`, so there is no SMTP client to add to Deno and no Resend key is ever needed locally or in tests. The Resend transport sends `Idempotency-Key: <message id>`, so a worker that dies between Resend accepting and the commit cannot send the same message twice.
  2. **Messages are rendered when they are queued, in the transaction of the step that caused them.** `messages` stores `subject`, `body_html`, `body_text`; the worker only delivers. A template edited later never changes mail already queued, a rolled-back step never leaves a message behind, and the worker needs no record, template or member reads.
  3. **Template bodies are plain text, never HTML.** The renderer HTML-escapes every literal character *and* every value, turns blank lines into `<p>` and line breaks into `<br>`, and makes `link.*` values (system-built `http(s)` URLs only) into anchors. Substitution is single-pass, so a value containing `{{org.name}}` is printed, not expanded. Subjects are one line (CR/LF/TAB collapsed), at most 200 characters. The editor preview shows the plain-text rendering, so no rendered markup ever reaches the DOM.
  4. **Who gets what.** Every recipient who is an active member gets an in-app notification whatever the template's channel ("in-app is always delivered"). An email is queued only when the template's channel is `email` and that person has not muted the template's type. A raw address read from the record's data gets the email only (there is no user to notify, and no preference to read). Preferences are per user, not per org, keyed by the template `kind`; all custom templates share the type `custom` ("Workflow messages"); invites cannot be muted.
  5. **`message_templates.kind`** (not in the spec table) is `custom` or one of the five system kinds; a partial unique index keeps one system template per kind per org, a trigger keeps `kind`/`is_system` fixed, RLS forbids deleting system templates. This is how the engine finds "Task assigned" and how preferences name a type.
  6. **`messages` is the email queue only.** In-app delivery is the `notifications` row. `messages.channel` is created (default `email`) with the tracking timestamps (`sent_at`, `delivered_at`, `opened_at`, `clicked_at`, `bounced_at`, `complained_at`) and `campaign_id`, because Phase 6 needs them; Phase 4 writes only `sent_at` and builds no tracking.
  7. **Retries:** at most 4 attempts (the first try plus 3 retries), the next one 1, 2 and 4 minutes after each failure (`60s × 2^(attempts−1)`); after the fourth failure the row is `failed` with the last error. A refusal that can never succeed (HTTP 4xx except 429, e.g. an invalid address) fails at once with its error instead of retrying. A thrown network error is retryable. `retry_message` (Messages page, `comms.manage`) puts a failed row back to `queued` with `attempts = 0`, audited.
  8. **Overdue is sent exactly once per task** by `UPDATE tasks SET overdue_notified_at = now WHERE id = … AND overdue_notified_at IS NULL AND status = 'open' AND due_at <= now RETURNING …` in the same transaction that queues the notice: a concurrent run blocks on the row lock, re-checks the predicate after the first commits and gets no row. The worker locks the record **before** the task, the same order `advance` uses (record `FOR UPDATE`, then `finishTask`), so the two cannot deadlock. A failure rolls both back and the next minute retries.
  9. **Recipients of `send_message`:** `{ role }` → every active holder; `{ user }` → that member if still active; `{ starter: true }` → `records.started_by`; `{ step }` → whoever last submitted that Start/Form step ("assignee of step X" once it has run); `{ field }` → `records.data[field]` when it is a valid email. People are de-duplicated by user id and an address that belongs to a recipient member is not mailed twice. A recipient that resolves to nobody (a former member, an empty or invalid email field, a step not yet run) is skipped and counted on the timeline event; if the whole action resolves to nobody, or the template is gone, the record stops in `error` with the reason (spec §5.4: a failing action is never skipped). At most 500 people per action (`shortcut:`).
  10. **`{{link.task}}`** is the task link for "Task assigned"/"Task overdue" and empty in path actions (the next step's task does not exist yet when the edge's actions run). **`{{step.assignee.name}}`** is the task's holder (claimer, else assigned person, else the role name) in task messages, and the person who completed the step the path leaves in path actions. **`{{link.invite}}`** is added for the invite template only: the app's sign-in page.
  11. **Invites are sent from the queue with the editable "Invite to org" template**, replacing GoTrue's `inviteUserByEmail`. The email links to `${APP_URL}` (sign in or create an account with the invited address; `accept_invites()` already activates the membership on sign-in), so no auth token is ever stored in `messages`, which every `comms.manage` holder can read. Invites are always email, whatever the template's channel.
  12. **Links:** `APP_URL` (e.g. `http://localhost:5173/app/`, `https://reportnoreport.com/app/`) is read and validated at boot by `advance`, `resume`, `send-messages` and `invite-member` (`readAppUrl`: absolute `http(s)`, path ending `/app/`). Emails link to `${APP_URL}#/tasks/<id>` / `#/records/<id>`; notifications store the relative `#/…` hash (DB check `^#/`), so a notification can never link off-site.
  13. **Phase 3's pending `send_message` events stay as history.** They were recorded with no template or recipients, so there is nothing to send; their timeline sentence becomes "Message not sent: recorded before messages were available." From this phase on the action queues for real, and the publish check requires a template and at least one recipient (the Phase 3 `shortcut:` in `actionIssue` is removed). The seeded "Leave approval" gets the "Record approved" template sent to the record starter.
  14. **The bell shows the current organisation's notifications** (each notification carries `org_id`; its link only makes sense in that org).
  15. **Task order:** the database task runs first so `database.types.ts` knows the new tables when the shared task wires `templates` into the publish check's references (`save-workflow` and the canvas editor); every later task can then run backend and frontend in parallel.
- **Shared module rules:** files under `supabase/functions/_shared/comms/` import only each other and `../forms/*.ts`, always with the `.ts` extension; `_shared/workflow/` may now also import `../comms/*.ts`. No `Deno.*`, `process`, `window`, npm or jsr imports; erasable TypeScript only; tests use `node:test` + `node:assert/strict` and run under node and Deno. Deno-only code (`advance/notify.ts`, `send-messages/*`) stays outside `_shared/`.
- **Defect classes from Phase 1–3 QA that must not recur:**
  - every client-visible write is audited (QA-7): `template.create/update/delete` by trigger, `message.retry` in the RPC; preferences are a person's own settings, not org data, and are not audited;
  - no `security definer` function is callable by clients unless meant to be (QA-5): `seed_message_templates` and every trigger function are revoked from `public, anon, authenticated`; `retry_message` checks `comms.manage` itself;
  - every new server message reaching `friendlyError` has an entry in `src/ui/errors.ts` with a test (QA-11): "Only failed messages can be retried.", "A template cannot change its type.";
  - TanStack Query keys carry `orgId` and, for per-person data, `userId`; two queries with different `select` shapes never share a key (QA-2): `['templates', orgId]`, `['template', id]`, `['messages', orgId, filter]`, `['notifications', userId, orgId]`, `['notifications-unread', userId, orgId]`, `['notification-prefs', userId]`, `['preview-records', orgId]`;
  - a write that RLS turns into 0 rows is reported, never silent (template save/delete and notification mark-read use `.select()`); template saves detect concurrent edits on `updated_at` (Phase 2 pattern);
  - focus moves to the page heading after the row that triggered an action disappears (QA-8): template delete, message retry under the Failed filter;
  - unsaved template edits are guarded on hash change, sign-out and org switch (QA-P2-4): `setNavGuard` + `guarded()`;
  - Edge Function CORS allows `authorization, x-client-info, apikey, content-type` (QA note, Phase 1); tokens and `rnr-*` classes only, no inline hex (QA-P2-5);
  - a two-tab race shows the moved-on state, not a live button (QA-P3-6): retry on a message another admin already retried shows "Only failed messages can be retried. Reload to see the latest status." and the list refetches;
  - `shortcut:` notes always name the limit and when to upgrade.
- New dependencies: none. Secrets: `RESEND_API_KEY` exists only as a hosted function secret; `scripts/check-dist.mjs` already fails the build on a leaked service-role JWT, and no `VITE_` variable is added.
- The Senior Designer's `docs/superpowers/design/phase-4-screens.md` (Task 6) is written before Tasks 7, 8 and 10. Where it differs from this plan on a visual, copy or accessibility point, the design spec wins; behaviour, data and security stay as this plan says.

## Review Focus

1. **Template values cannot inject markup or headers** → `<script>`, `"`, `'`, `&` and `<a>` in record data, record title, org name and recipient name come out escaped in `body_html`, raw in `body_text`, a value holding `{{org.name}}` is not expanded, and a value with a line break cannot add a subject line. (tests "values are HTML-escaped in html and kept as typed in text", "substitution is single-pass: a value is never expanded again" and "the subject is one line" in Task 2; "a new task notifies its holders in the app and by email, with escaped values" in Task 3; "the org name in an invite is escaped" in Task 5)
2. **A failing send retries, then fails visibly** → 1, 2 and 4 minutes between attempts, `failed` with the last error after the fourth; a permanent refusal fails at once; a thrown network error is retried; Retry on the Messages page requeues it. (tests "a failing send retries after 1, 2 and 4 minutes, then fails with the error", "a refusal that can never succeed fails at once", "a thrown transport error is retried" in Task 4; `retry_message` cases in `07_comms.test.sql`, Task 1)
3. **Overdue is sent exactly once, even when two cron runs overlap** → one "Task overdue" notice and one email per task, `overdue_notified_at` set once; closed or not-yet-due tasks get nothing. (tests "two overlapping runs send Task overdue once per task" in Task 4 against the locking fake, "real Postgres: two overlapping runs notify an overdue task once" in Task 4 against the local database)
4. **Muting email never mutes in-app** → a muted type still gets its notification and no email; an unmuted one gets both; invites cannot be muted. (tests "a muted email type still gets the in-app notice" in Task 3; `notification_prefs` type check and privacy in `07_comms.test.sql`, Task 1)
5. **Cross-org isolation** → Beta reads and edits no Alpha template, reads no Alpha message or notification and cannot retry one; members without `comms.manage` read no messages and edit no template; clients cannot queue messages or create system templates. (`07_comms.test.sql`, Task 1)
6. **Realtime delivers a user's own notifications only** → `notifications` is in the `supabase_realtime` publication and its RLS returns only `user_id = auth.uid()` rows of an org the user belongs to; with no client filter at all, a second signed-in user receives nothing. (`07_comms.test.sql` and "realtime: a user receives only their own notifications" in Task 1)

---

## Owners and order

| Task | Owner | Depends on |
|---|---|---|
| 1. Database: templates, queue, notifications, preferences, RLS, Realtime, cron | Backend engineer | — |
| 2. Shared: template renderer, variables, recipients, publish check | Backend engineer | 1 |
| 3. Engine: Task assigned and real `send_message` | Backend engineer | 1, 2 |
| 4. Edge Function `send-messages`: queue worker, transports, overdue | Backend engineer | 3 |
| 5. Invites through the queue | Backend engineer | 2, 4 |
| 6. Design spec `phase-4-screens.md` | Senior Designer | — (parallel with 1–5) |
| 7. Frontend: data layer, routes, nav, bell, notification settings | Frontend engineer | 1, 2, 6 |
| 8. Frontend: Templates pages, Send message editor, timeline | Frontend engineer | 3, 7 |
| 9. Frontend: Map view places a clicked step clear of the others | Frontend engineer | — |
| 10. Frontend: Messages page and end-to-end check | Frontend engineer | 4, 5, 7, 8 |

Backend runs 1 → 2 → 3 → 4 → 5; the designer runs 6 alongside; the frontend engineer can do 9 at any time, starts 7 once 1, 2 and 6 are committed, then 8, then 10 once the backend is done.

---

## File Structure

```
supabase/migrations/20261015000001_comms.sql            tables, RLS, seeding trigger, retry RPC, Realtime publication, cron
supabase/tests/07_comms.test.sql
supabase/functions/_integration/realtime.test.ts         real Supabase, runs only with RNR_TEST_* env
supabase/seed.sql                                        send_messages_url Vault secret; seeded workflow's Send message
supabase/config.toml                                     [functions.send-messages] verify_jwt = false
supabase/functions/.env.example                          names of every function variable
src/data/database.types.ts                               regenerated (pnpm db:types)
supabase/functions/_shared/comms/render.ts               RenderContext, VARIABLES, render, escapeHtml, valueText, isVariable, readAppUrl
supabase/functions/_shared/comms/render.test.ts          node + deno
supabase/functions/_shared/comms/recipients.ts           TEMPLATE_KINDS, KIND_LABELS, MUTABLE_KINDS, Recipient, SendMessage, readSendMessage, sendMessageIssue, EMAIL_RE
supabase/functions/_shared/comms/recipients.test.ts      node + deno
supabase/functions/_shared/workflow/graph.ts             Action uses SendMessage; Refs.templates; actionIssue checks Send message
supabase/functions/_shared/workflow/graph.test.ts        + Send message checks
supabase/functions/_shared/workflow/fixture.ts           T_APPROVED; e2 sends Record approved to the starter; REFS.templates
supabase/functions/save-workflow/index.ts                refs.templates
supabase/functions/advance/notify.ts                     deliver, notifyTask, sendAction
supabase/functions/advance/engine.ts                     Tx comms methods; Ctx.appUrl; runAction sends; createTask notifies
supabase/functions/advance/pgStore.ts                    comms + queue Tx methods
supabase/functions/advance/testkit.ts                    templates, people, prefs, messages, notifications in the fake
supabase/functions/advance/engine.test.ts                + notification and send_message tests
supabase/functions/advance/handler.ts, index.ts          appUrl dependency
supabase/functions/advance/handler.test.ts, race.test.ts appUrl in deps
supabase/functions/resume/handler.ts, index.ts, handler.test.ts   appUrl dependency
supabase/functions/send-messages/transport.ts            Mail, SendResult, Transport, resendTransport, mailpitTransport, transportFromEnv
supabase/functions/send-messages/transport.test.ts
supabase/functions/send-messages/handler.ts              sendMessages, backoffMs, MAX_ATTEMPTS
supabase/functions/send-messages/handler.test.ts
supabase/functions/send-messages/race.test.ts            real Postgres, runs only with RNR_TEST_DB_URL
supabase/functions/send-messages/index.ts
supabase/functions/invite-member/message.ts              inviteMessage
supabase/functions/invite-member/message.test.ts
supabase/functions/invite-member/index.ts                queues the Invite to org template
docs/superpowers/design/phase-4-screens.md               designer spec (Task 6)
src/comms/logic.ts                                       re-exports the shared comms modules for Vite
src/comms/api.ts                                         templates, messages, notifications, prefs queries and writes; Realtime feed
src/comms/NotificationBell.tsx                           bell, unread count, dropdown
src/comms/SettingsPage.tsx                               email preferences per type
src/comms/TemplatesPage.tsx                              list, new, delete
src/comms/TemplateEditor.tsx                             fields, insert-variable menu, preview against a record
src/comms/MessagesPage.tsx                               queue with failures, retry
src/comms/preview.ts                                     previewContext (pure)
src/comms/preview.test.ts
src/workflows/canvas/MessageAction.tsx                   template + recipients editor for one Send message action
src/workflows/canvas/SidePanel.tsx                       uses MessageAction; Send message active
src/workflows/canvas/WorkflowEditor.tsx                  refs.templates; clear spot for clicked steps
src/workflows/canvas/canvasOps.ts, canvasOps.test.ts     clearSpot
src/records/timeline.ts, timeline.test.ts                sent / not-sent sentences
src/rbac/route.ts, route.test.ts                         templates, template, messages, settings routes
src/ui/errors.ts, errors.test.ts                         retry and template-type messages
src/ui/icons.tsx                                         BellIcon
src/App.tsx                                              routes, nav, bell, Settings link
README.md                                                function variables, Mailpit, Resend, tests
```

---

### Task 1: Database — templates, queue, notifications, preferences, RLS, Realtime, cron

**Owner:** Backend engineer · **Depends on:** —

**Files:**
- Create: `supabase/migrations/20261015000001_comms.sql`, `supabase/tests/07_comms.test.sql`, `supabase/functions/_integration/realtime.test.ts`
- Modify: `supabase/seed.sql`, `supabase/config.toml`, `src/data/database.types.ts` (regenerated)

**Interfaces:**
- Consumes: `orgs`, `members`, `roles`, `records`, `tasks` (Phase 1/3), `is_member(uuid)`, `has_permission(uuid, text)`, `audit(uuid, text, text, jsonb, jsonb)`, `create_org(text, uuid)`, the `pg_cron` / `pg_net` / Vault pattern of `resume-workflows` (Phase 3).
- Produces:
  - tables `message_templates(id, org_id, kind, name, channel, subject, body, is_system, updated_by, created_at, updated_at)`, `messages(id, org_id, template_id, campaign_id, record_id, recipient_user_id, recipient_email, channel, subject, body_html, body_text, status, attempts, next_attempt_at, error, provider_id, sent_at, delivered_at, opened_at, clicked_at, bounced_at, complained_at, created_at)`, `notifications(id, user_id, org_id, kind, title, body, link, read_at, created_at)`, `notification_prefs(user_id, type, email_enabled, updated_at)`
  - `seed_message_templates(p_org uuid) returns void` (definer, revoked from clients), trigger `orgs_seed_templates`
  - `retry_message(p_message uuid) returns void` (definer, checks `comms.manage`; errors "Not allowed" 42501, "Only failed messages can be retried.")
  - template errors: "A template cannot change its type." (P0001)
  - index `tasks_overdue_idx`; Realtime publication of `notifications`; cron job `send-messages`; Vault secret `send_messages_url` (seed)

- [ ] **Step 1: Write the failing test** — `supabase/tests/07_comms.test.sql`

```sql
begin;
select plan(39);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

\set alpha 0000000a-0000-0000-0000-000000000001
\set beta 0000000b-0000-0000-0000-000000000001
\set gamma 0000000c-0000-0000-0000-000000000001
\set tpl 0000000a-0000-0000-0000-00000000a0f1
\set msg 0000000a-0000-0000-0000-00000000b0f1
\set msg2 0000000a-0000-0000-0000-00000000b0f2
\set n1 0000000a-0000-0000-0000-00000000c0f1
\set n2 0000000a-0000-0000-0000-00000000c0f2
\set admin 00000000-0000-0000-0000-0000000000a2
\set member 00000000-0000-0000-0000-0000000000a3
\set betaowner 00000000-0000-0000-0000-0000000000b1

-- Every org has the five system templates, and a new org gets them too
select results_eq(format($$ select kind from message_templates where org_id = %L and is_system order by kind $$, :'alpha'),
  $$ values ('invite'::text), ('record_approved'), ('record_rejected'), ('task_assigned'), ('task_overdue') $$, 'alpha has the five system templates');
select is((select count(*)::int from message_templates where org_id = :'beta' and is_system), 5, 'beta has its own five');
select pg_temp.act_as(:'member');
select lives_ok(format($$ select create_org('Gamma Club', %L) $$, :'gamma'), 'a member creates an org');
select is((select count(*)::int from message_templates where org_id = :'gamma'), 5, 'a new org gets the system templates');
select throws_ok(format($$ select seed_message_templates(%L) $$, :'alpha'), '42501', null, 'clients cannot call the seeder');

-- Templates: every member reads them; only comms.manage writes; system templates keep their type and stay
select is((select count(*)::int from message_templates where org_id = :'alpha'), 5, 'a member reads the org templates');
select is_empty(format($$ update message_templates set subject = 'x' where org_id = %L returning id $$, :'alpha'), 'a member cannot edit templates');
select throws_ok(format($$ insert into message_templates (org_id, name, subject, body) values (%L, 'Mine', 's', 'b') $$, :'alpha'),
  '42501', null, 'a member cannot create templates');
select pg_temp.act_as(:'admin');
select isnt_empty(format($$ update message_templates set body = 'Hi {{recipient.name}}' where org_id = %L and kind = 'task_assigned' returning id $$, :'alpha'),
  'comms.manage edits a system template');
select isnt_empty(format($$ select 1 from audit_log where action = 'template.update' and org_id = %L $$, :'alpha'), 'template edit audited');
select throws_ok(format($$ update message_templates set kind = 'custom' where org_id = %L and kind = 'invite' $$, :'alpha'),
  'P0001', 'A template cannot change its type.', 'a system template keeps its kind');
select is_empty(format($$ delete from message_templates where org_id = %L and is_system returning id $$, :'alpha'), 'system templates cannot be deleted');
select throws_ok(format($$ insert into message_templates (org_id, name, subject, body, is_system, kind) values (%L, 'Fake', 's', 'b', true, 'task_assigned') $$, :'alpha'),
  '42501', null, 'clients cannot create system templates');
select lives_ok(format($$ insert into message_templates (id, org_id, name, subject, body) values (%L, %L, 'Trip reminder', 'Trip', 'Bring {{record.data.item}}') $$, :'tpl', :'alpha'),
  'comms.manage creates a custom template');
select isnt_empty(format($$ delete from message_templates where id = %L returning id $$, :'tpl'), 'comms.manage deletes a custom template');
select pg_temp.act_as(:'betaowner');
select is((select count(*)::int from message_templates where org_id = :'alpha'), 0, 'beta reads no alpha templates');
select is_empty(format($$ update message_templates set subject = 'x' where org_id = %L returning id $$, :'alpha'), 'beta cannot edit alpha templates');

-- Messages: comms.manage reads the queue of its own org; retry only failed rows; clients never queue
reset role;
insert into messages (id, org_id, recipient_email, subject, body_html, body_text, status, attempts, error)
values (:'msg', :'alpha', 'a@example.com', 'Hello', '<p>Hi</p>', 'Hi', 'failed', 4, 'The email service refused this message: invalid address');
insert into messages (id, org_id, recipient_email, subject, body_html, body_text)
values (:'msg2', :'alpha', 'b@example.com', 'Hello', '<p>Hi</p>', 'Hi');
select pg_temp.act_as(:'member');
select is((select count(*)::int from messages), 0, 'a member reads no messages');
select throws_ok(format($$ select retry_message(%L) $$, :'msg'), '42501', null, 'a member cannot retry');
select pg_temp.act_as(:'betaowner');
select is((select count(*)::int from messages), 0, 'beta reads no alpha messages');
select throws_ok(format($$ select retry_message(%L) $$, :'msg'), '42501', null, 'beta cannot retry an alpha message');
select pg_temp.act_as(:'admin');
select is((select count(*)::int from messages where org_id = :'alpha'), 2, 'comms.manage reads the queue');
select throws_ok(format($$ select retry_message(%L) $$, :'msg2'), 'P0001', 'Only failed messages can be retried.', 'a queued message cannot be retried');
select lives_ok(format($$ select retry_message(%L) $$, :'msg'), 'comms.manage retries a failed message');
select results_eq(format($$ select status, attempts, error from messages where id = %L $$, :'msg'),
  $$ values ('queued'::text, 0, null::text) $$, 'retry requeues with a fresh attempt count');
select isnt_empty(format($$ select 1 from audit_log where action = 'message.retry' and target = %L $$, :'msg'), 'retry audited');
select throws_ok(format($$ insert into messages (org_id, recipient_email, subject, body_html, body_text) values (%L, 'x@example.com', 's', 'b', 'b') $$, :'alpha'),
  '42501', null, 'clients cannot queue messages');

-- Notifications: own rows only, links stay inside the app, only read_at is writable
reset role;
insert into notifications (id, user_id, org_id, kind, title, link) values
  (:'n1', :'member', :'alpha', 'task_assigned', 'For member', '#/inbox'),
  (:'n2', :'admin', :'alpha', 'task_assigned', 'For admin', '#/inbox');
select throws_ok(format($$ insert into notifications (user_id, org_id, kind, title, link) values (%L, %L, 'custom', 'x', 'https://evil.example') $$, :'member', :'alpha'),
  '23514', null, 'a notification link stays inside the app');
select pg_temp.act_as(:'member');
select results_eq($$ select title from notifications $$, $$ values ('For member'::text) $$, 'a user reads only their own notifications');
select isnt_empty(format($$ update notifications set read_at = now() where id = %L returning id $$, :'n1'), 'a user marks their own notification read');
select is_empty(format($$ update notifications set read_at = now() where id = %L returning id $$, :'n2'), 'a user cannot touch another user''s notification');
select throws_ok(format($$ update notifications set title = 'x' where id = %L $$, :'n1'), '42501', null, 'only read_at is writable');
select pg_temp.act_as(:'betaowner');
select is((select count(*)::int from notifications), 0, 'beta reads no alpha notifications');

-- Preferences: private, own rows only, invites cannot be muted
select pg_temp.act_as(:'member');
select lives_ok($$ insert into notification_prefs (type, email_enabled) values ('task_overdue', false) $$, 'a user mutes an email type');
select throws_ok(format($$ insert into notification_prefs (user_id, type, email_enabled) values (%L, 'task_overdue', false) $$, :'admin'),
  '42501', null, 'a user cannot set someone else''s preferences');
select throws_ok($$ insert into notification_prefs (type, email_enabled) values ('invite', false) $$, '23514', null, 'invites cannot be muted');
select pg_temp.act_as(:'admin');
select is((select count(*)::int from notification_prefs), 0, 'preferences are private');

-- Realtime and the worker's cron job
reset role;
select isnt_empty($$ select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications' $$,
  'notifications are published to Realtime');
select isnt_empty($$ select 1 from cron.job where jobname = 'send-messages' $$, 'the send-messages cron job exists');

select * from finish();
rollback;
```

- [ ] **Step 2: Run — expect FAIL**

Run: `supabase db reset && supabase test db`
Expected: `07_comms.test.sql` fails at the first test with `relation "message_templates" does not exist`; files 01–06 still pass.

- [ ] **Step 3: Implement** — `supabase/migrations/20261015000001_comms.sql`

```sql
-- Phase 4 (spec §8): message templates, the outgoing email queue, in-app notifications and email preferences.

create table message_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  -- 'custom', or the system template this row is; keys notification_prefs.type and lets the engine find "Task assigned".
  kind text not null default 'custom'
    check (kind in ('custom', 'task_assigned', 'task_overdue', 'record_approved', 'record_rejected', 'invite')),
  name text not null check (length(btrim(name)) between 1 and 120),
  channel text not null default 'email' check (channel in ('email', 'in_app')),
  subject text not null check (length(btrim(subject)) between 1 and 200),
  body text not null check (length(btrim(body)) between 1 and 10000),
  is_system boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (is_system = (kind <> 'custom'))
);
create unique index message_templates_system_kind on message_templates (org_id, kind) where is_system;
create index message_templates_org_idx on message_templates (org_id, name);

create table messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  template_id uuid references message_templates(id) on delete set null,
  campaign_id uuid, -- Phase 6 adds campaigns and this foreign key
  record_id uuid,
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_email citext not null check (length(recipient_email) between 3 and 320),
  channel text not null default 'email' check (channel in ('email', 'in_app')),
  subject text not null check (length(subject) between 1 and 200),
  body_html text not null,
  body_text text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempts int not null default 0 check (attempts between 0 and 4), -- the first try plus 3 retries
  next_attempt_at timestamptz not null default now(),
  error text check (length(error) <= 500),
  provider_id text,
  sent_at timestamptz,
  -- Tracking columns written by Phase 6's Resend webhook; nothing writes them yet.
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (record_id, org_id) references records (id, org_id) on delete cascade
);
create index messages_org_idx on messages (org_id, created_at desc);
create index messages_due_idx on messages (next_attempt_at) where status = 'queued';

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  kind text not null,
  title text not null check (length(title) between 1 and 200),
  body text not null default '' check (length(body) <= 2000),
  link text not null check (link ~ '^#/[A-Za-z0-9/_-]*$'), -- an in-app hash only, never another site
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, org_id, created_at desc);
create index notifications_unread_idx on notifications (user_id, org_id) where read_at is null;

create table notification_prefs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('task_assigned', 'task_overdue', 'record_approved', 'record_rejected', 'custom')),
  email_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, type)
);

-- send-messages looks for open tasks past due that have not been reminded.
create index tasks_overdue_idx on tasks (due_at) where status = 'open' and overdue_notified_at is null;

alter table message_templates enable row level security;
alter table messages enable row level security;
alter table notifications enable row level security;
alter table notification_prefs enable row level security;

-- Templates are not secret: workflow managers pick them in the Send message action.
create policy message_templates_read on message_templates for select using (is_member(org_id));
create policy message_templates_insert on message_templates for insert
  with check (has_permission(org_id, 'comms.manage') and not is_system and kind = 'custom');
create policy message_templates_update on message_templates for update
  using (has_permission(org_id, 'comms.manage')) with check (has_permission(org_id, 'comms.manage'));
create policy message_templates_delete on message_templates for delete
  using (has_permission(org_id, 'comms.manage') and not is_system);

create policy messages_read on messages for select using (has_permission(org_id, 'comms.manage'));
-- No write policies on messages: advance, send-messages and invite-member (service role / direct connection) write it,
-- and retry_message below is the one client path.

-- Realtime applies these policies per subscriber, so a user is only ever sent their own rows.
create policy notifications_read on notifications for select using (user_id = auth.uid() and is_member(org_id));
create policy notifications_update on notifications for update
  using (user_id = auth.uid() and is_member(org_id)) with check (user_id = auth.uid());
revoke update on notifications from anon, authenticated;
grant update (read_at) on notifications to authenticated;

create policy notification_prefs_own on notification_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function message_templates_before_write() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.org_id is distinct from old.org_id then raise exception 'Not allowed' using errcode = '42501'; end if;
    if new.kind is distinct from old.kind or new.is_system is distinct from old.is_system then
      raise exception 'A template cannot change its type.';
    end if;
    new.created_at := old.created_at;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;
create trigger message_templates_before_write before insert or update on message_templates
  for each row execute function message_templates_before_write();

create or replace function audit_message_templates() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return null; end if; -- templates seeded with a new org belong to org.create
  perform audit(coalesce(new.org_id, old.org_id),
    case tg_op when 'INSERT' then 'template.create' when 'UPDATE' then 'template.update' else 'template.delete' end,
    coalesce(new.id, old.id)::text,
    case when tg_op = 'INSERT' then null else jsonb_build_object('name', old.name, 'channel', old.channel, 'subject', old.subject) end,
    case when tg_op = 'DELETE' then null else jsonb_build_object('name', new.name, 'channel', new.channel, 'subject', new.subject) end);
  return null;
end $$;
create trigger message_templates_audit after insert or update or delete on message_templates
  for each row execute function audit_message_templates();

create or replace function seed_message_templates(p_org uuid) returns void
language sql security definer set search_path = public as $$
  insert into message_templates (org_id, kind, name, channel, subject, body, is_system) values
    (p_org, 'task_assigned', 'Task assigned', 'email', 'New task: {{record.title}}',
     E'Hello {{recipient.name}},\n\nThere is a new task on "{{record.title}}" for {{step.assignee.name}}.\n\nOpen the task: {{link.task}}\n\n{{org.name}}', true),
    (p_org, 'task_overdue', 'Task overdue', 'email', 'Overdue: {{record.title}}',
     E'Hello {{recipient.name}},\n\nThe task on "{{record.title}}" for {{step.assignee.name}} is past its due time.\n\nOpen the task: {{link.task}}\n\n{{org.name}}', true),
    (p_org, 'record_approved', 'Record approved', 'email', 'Approved: {{record.title}}',
     E'Hello {{recipient.name}},\n\n"{{record.title}}" was approved by {{step.assignee.name}}.\n\nSee the record: {{link.record}}\n\n{{org.name}}', true),
    (p_org, 'record_rejected', 'Record rejected', 'email', 'Rejected: {{record.title}}',
     E'Hello {{recipient.name}},\n\n"{{record.title}}" was rejected by {{step.assignee.name}}.\n\nSee the record: {{link.record}}\n\n{{org.name}}', true),
    (p_org, 'invite', 'Invite to org', 'email', 'You are invited to join {{org.name}}',
     E'Hello,\n\nYou have been invited to join {{org.name}} on ReportNoReport.\n\nSign in or create an account with this email address to accept: {{link.invite}}', true)
  on conflict (org_id, kind) where is_system do nothing
$$;

create or replace function orgs_seed_templates() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform seed_message_templates(new.id);
  return null;
end $$;
create trigger orgs_seed_templates after insert on orgs for each row execute function orgs_seed_templates();

select seed_message_templates(id) from orgs;

revoke execute on function seed_message_templates(uuid), orgs_seed_templates(), message_templates_before_write(), audit_message_templates()
  from public, anon, authenticated;

create or replace function retry_message(p_message uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_m messages;
begin
  select * into v_m from messages where id = p_message for update;
  if v_m.id is null or not has_permission(v_m.org_id, 'comms.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_m.status <> 'failed' then raise exception 'Only failed messages can be retried.'; end if;
  update messages set status = 'queued', attempts = 0, error = null, next_attempt_at = now() where id = p_message;
  perform audit(v_m.org_id, 'message.retry', p_message::text, jsonb_build_object('attempts', v_m.attempts, 'error', v_m.error), null);
end $$;
revoke execute on function retry_message(uuid) from public, anon;

alter publication supabase_realtime add table notifications;

-- Every minute: wake send-messages when an email is due or a task has gone overdue unreminded.
select cron.schedule('send-messages', '* * * * *', $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'send_messages_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb)
  where exists (select 1 from public.messages where status = 'queued' and next_attempt_at <= now())
     or exists (select 1 from public.tasks where status = 'open' and overdue_notified_at is null and due_at <= now())
$cron$);
```

- [ ] **Step 4: Seed and config**

Append to `supabase/seed.sql`:
```sql
-- Phase 4: pg_cron → send-messages (local values only; hosted projects set their own, see README).
select vault.create_secret('http://host.docker.internal:54321/functions/v1/send-messages', 'send_messages_url');
```

In `supabase/seed.sql`, in the seeded "Leave approval" graph, replace the e2 line
```
    {"id":"e2","from":"approve","outcome":"approved","to":"long","actions":[{"type":"send_message"}]},
```
with
```
    {"id":"e2","from":"approve","outcome":"approved","to":"long","actions":[{"type":"send_message","templateId":"TPL_APPROVED","recipients":[{"starter":true}]}]},
```
and wrap the existing `replace(…, 'ROLE_ADMIN', …)` so the template id is substituted too:
```sql
update workflows set status = 'published', updated_by = '00000000-0000-0000-0000-0000000000a1', graph = replace(replace($json${
  …unchanged graph text with the new e2 line…
}$json$, 'ROLE_ADMIN', (select id::text from roles where org_id = '0000000a-0000-0000-0000-000000000001' and name = 'Admin')),
  'TPL_APPROVED', (select id::text from message_templates where org_id = '0000000a-0000-0000-0000-000000000001' and kind = 'record_approved'))::jsonb
where id = '0000000a-0000-0000-0000-00000000c001';
```

Append to `supabase/config.toml`, after `[functions.resume]`:
```toml
[functions.send-messages]
verify_jwt = false
```

- [ ] **Step 5: Run — expect PASS**

Run: `supabase db reset && supabase test db`
Expected: `All tests successful.` — 7 files, 158 tests (119 + 39).

- [ ] **Step 6: Write the Realtime isolation test** — `supabase/functions/_integration/realtime.test.ts`

```ts
import { assertEquals } from 'jsr:@std/assert@1'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import postgres from 'npm:postgres@3.4.5'

const env = (k: string) => (Deno.permissions.querySync({ name: 'env', variable: k }).state === 'granted' ? Deno.env.get(k) : undefined)
const url = env('RNR_TEST_SUPABASE_URL')
const anon = env('RNR_TEST_ANON_KEY')
const db = env('RNR_TEST_DB_URL')
const ALPHA = '0000000a-0000-0000-0000-000000000001'
const MEMBER = '00000000-0000-0000-0000-0000000000a3'
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function signIn(email: string): Promise<SupabaseClient> {
  const c = createClient(url!, anon!, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'password123' })
  if (error) throw error
  c.realtime.setAuth(data.session.access_token)
  return c
}

/** Subscribes with no filter at all: only RLS decides what arrives. */
function listen(c: SupabaseClient, into: string[]) {
  return new Promise<void>((resolve, reject) => {
    c.channel(`rt-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (p) => into.push((p.new as { title: string }).title))
      .subscribe((s) => { if (s === 'SUBSCRIBED') resolve(); else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') reject(new Error(s)) })
  })
}

Deno.test({
  name: 'realtime: a user receives only their own notifications',
  ignore: !(url && anon && db),
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const member = await signIn('member@alpha.test')
    const admin = await signIn('admin@alpha.test')
    const sql = postgres(db!, { max: 1 })
    const got = { member: [] as string[], admin: [] as string[] }
    const title = `rt-${crypto.randomUUID()}`
    try {
      await Promise.all([listen(member, got.member), listen(admin, got.admin)])
      await sql`insert into notifications (user_id, org_id, kind, title, link) values (${MEMBER}, ${ALPHA}, 'custom', ${title}, '#/inbox')`
      for (let i = 0; i < 50 && !got.member.includes(title); i++) await wait(100)
      await wait(1000) // give a leak time to arrive
      assertEquals(got.member.includes(title), true)
      assertEquals(got.admin.includes(title), false)
    } finally {
      await sql`delete from notifications where title = ${title}`
      await sql.end()
      await member.removeAllChannels()
      await admin.removeAllChannels()
    }
  },
})
```

Run (with `supabase start` and the seed loaded):
```bash
RNR_TEST_SUPABASE_URL=http://127.0.0.1:54321 RNR_TEST_ANON_KEY=<ANON_KEY from supabase status> \
RNR_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres DENO_NO_PACKAGE_JSON=1 \
deno test --allow-env --allow-net supabase/functions/_integration/realtime.test.ts
```
Expected: `ok | 1 passed`. Without the variables, `deno test supabase/functions` reports it as ignored.

- [ ] **Step 7: Regenerate types**

Run: `pnpm db:types && pnpm build`
Expected: `src/data/database.types.ts` gains `message_templates`, `messages`, `notifications`, `notification_prefs` and `retry_message`; the build passes.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261015000001_comms.sql supabase/tests/07_comms.test.sql supabase/functions/_integration/realtime.test.ts supabase/seed.sql supabase/config.toml src/data/database.types.ts
git commit -m "feat: add message templates, email queue, notifications and preferences"
```

---
### Task 2: Shared — template renderer, variables, recipients, publish check

**Owner:** Backend engineer · **Depends on:** Task 1 (generated types, for the editor's template references)

**Files:**
- Create: `supabase/functions/_shared/comms/render.ts`, `supabase/functions/_shared/comms/recipients.ts`, `src/comms/logic.ts`, `src/comms/api.ts`
- Modify: `supabase/functions/_shared/workflow/graph.ts`, `supabase/functions/_shared/workflow/fixture.ts`, `supabase/functions/save-workflow/index.ts`, `src/workflows/canvas/WorkflowEditor.tsx`
- Test: `supabase/functions/_shared/comms/render.test.ts`, `supabase/functions/_shared/comms/recipients.test.ts`, `supabase/functions/_shared/workflow/graph.test.ts`

**Interfaces:**
- Consumes: `Answers` from `../forms/types.ts`, `KEY_RE` from `../forms/schema.ts` (Phase 2); `Refs`, `checkGraph`, `actionIssue` (Phase 3).
- Produces:
  - `render.ts`: `type RenderContext = { record: { title: string; data: Answers }; step: { assignee: { name: string } }; link: { task: string; record: string; invite: string }; org: { name: string }; recipient: { name: string } }`, `type TemplateText = { subject: string; body: string }`, `type Rendered = { subject: string; text: string; html: string; unknown: string[] }`, `VARIABLES: readonly { key: string; label: string; hint: string }[]`, `DATA_PREFIX = 'record.data.'`, `escapeHtml(s: string): string`, `valueText(v: unknown): string`, `isVariable(key: string): boolean`, `variablesIn(s: string): string[]`, `render(t: TemplateText, c: RenderContext): Rendered`, `readAppUrl(raw: string | undefined): string` (throws), `MAX_SUBJECT = 200`
  - `recipients.ts`: `TEMPLATE_KINDS`, `type TemplateKind`, `KIND_LABELS: Record<TemplateKind, string>`, `MUTABLE_KINDS`, `type MutableKind`, `type Recipient = { role: string } | { user: string } | { starter: true } | { step: string } | { field: string }`, `type SendMessage = { type: 'send_message'; templateId: string; recipients: Recipient[] }`, `EMAIL_RE`, `MAX_RECIPIENT_RULES = 20`, `readRecipient(r: unknown): Recipient | null`, `readSendMessage(a: unknown): SendMessage | null`, `type RecipientRefs = { templates: ReadonlySet<string>; roles: ReadonlySet<string>; users: ReadonlySet<string>; steps: ReadonlySet<string> }`, `sendMessageIssue(a: unknown, refs: RecipientRefs): string | null`
  - `graph.ts`: `Action` = `{ type: 'set_status'; label: string } | SendMessage | { type: 'generate_pdf' }`; `Refs` gains `templates: ReadonlySet<string>`
  - `fixture.ts`: `T_APPROVED`; e2 is `{ type: 'send_message', templateId: T_APPROVED, recipients: [{ starter: true }] }`; `REFS.templates`
  - `src/comms/api.ts`: `type TemplateRow`, `useTemplates(orgId: string | null)` under `['templates', orgId]`

- [ ] **Step 1: Write the failing tests** — `supabase/functions/_shared/comms/render.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtml, isVariable, readAppUrl, render, valueText, variablesIn, type RenderContext } from './render.ts'

const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({
  record: { title: 'Leave: Ada', data: { days: 3, cover: ['Peer', 'Team lead'], claims: [{ item: 'Taxi' }], agree: true, note: '' } },
  step: { assignee: { name: 'Admin' } },
  link: { task: 'http://localhost:5173/app/#/tasks/t1', record: 'http://localhost:5173/app/#/records/r1', invite: '' },
  org: { name: 'Alpha School' },
  recipient: { name: 'Ada' },
  ...over,
})

test('fills every variable', () => {
  const r = render({ subject: 'Task: {{record.title}}', body: '{{recipient.name}} / {{step.assignee.name}} / {{org.name}} / {{ record.data.days }} / {{link.record}}' }, ctx())
  assert.equal(r.subject, 'Task: Leave: Ada')
  assert.equal(r.text, 'Ada / Admin / Alpha School / 3 / http://localhost:5173/app/#/records/r1')
  assert.deepEqual(r.unknown, [])
})
test('values are HTML-escaped in html and kept as typed in text', () => {
  const evil = '<script>alert("x")</script> & \'quotes\' <a href="https://evil.example">win</a>'
  const r = render({ subject: 'S', body: 'Hi {{recipient.name}}, {{record.title}}, {{org.name}}, {{record.data.note}}' },
    ctx({ recipient: { name: evil }, record: { title: evil, data: { note: evil } }, org: { name: evil } }))
  assert.equal(r.html.includes('<script>'), false)
  assert.equal(r.html.includes('<a href="https://evil.example">'), false)
  assert.equal(r.html.split('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quotes&#39;').length - 1, 4)
  assert.equal(r.text, `Hi ${evil}, ${evil}, ${evil}, ${evil}`)
})
test('the template text itself is escaped too; paragraphs and line breaks become markup', () => {
  const r = render({ subject: 'S', body: '<b>Bold</b> & co\nline two\n\nNew paragraph' }, ctx())
  assert.equal(r.html, '<p>&lt;b&gt;Bold&lt;/b&gt; &amp; co<br>line two</p>\n<p>New paragraph</p>')
})
test('substitution is single-pass: a value is never expanded again', () => {
  const r = render({ subject: '{{recipient.name}}', body: '{{recipient.name}}' }, ctx({ recipient: { name: '{{org.name}}' } }))
  assert.equal(r.subject, '{{org.name}}')
  assert.equal(r.text, '{{org.name}}')
})
test('the subject is one line, at most 200 characters', () => {
  const r = render({ subject: 'Hi {{recipient.name}}', body: 'x' }, ctx({ recipient: { name: 'Ada\r\nBcc: victim@example.com' } }))
  assert.equal(r.subject, 'Hi Ada Bcc: victim@example.com')
  assert.equal(render({ subject: '{{record.title}}', body: 'x' }, ctx({ record: { title: 'x'.repeat(500), data: {} } })).subject.length, 200)
})
test('links become anchors in html only when they are http(s)', () => {
  const r = render({ subject: 'S', body: 'Open {{link.task}}' }, ctx())
  assert.equal(r.html, '<p>Open <a href="http://localhost:5173/app/#/tasks/t1">http://localhost:5173/app/#/tasks/t1</a></p>')
  const bad = render({ subject: 'S', body: '{{link.task}}' }, ctx({ link: { task: 'javascript:alert(1)', record: '', invite: '' } }))
  assert.equal(bad.html, '<p>javascript:alert(1)</p>')
  assert.equal(render({ subject: 'S', body: '[{{link.invite}}]' }, ctx()).html, '<p>[]</p>')
})
test('unknown variables render empty and are reported; missing answers render empty', () => {
  const r = render({ subject: '{{nope}}x', body: '{{record.data.missing}}|{{record.data.Bad-Key}}|{{recipient.email}}' }, ctx())
  assert.equal(r.subject, 'x')
  assert.equal(r.text, '||')
  assert.deepEqual(r.unknown, ['nope', 'record.data.Bad-Key', 'recipient.email'])
  assert.equal(render({ subject: 'S', body: '{{record.data.__proto__}}' }, ctx()).text, '')
})
test('answers read as one line of text', () => {
  assert.equal(valueText(['Peer', 'Team lead']), 'Peer, Team lead')
  assert.equal(valueText([{ item: 'Taxi' }]), '1 row')
  assert.equal(valueText([{ a: 1 }, { a: 2 }]), '2 rows')
  assert.equal(valueText(true), 'Yes')
  assert.equal(valueText(false), 'No')
  assert.equal(valueText(Number.NaN), '')
  assert.equal(valueText({ a: 1 }), '')
  assert.equal(valueText(null), '')
})
test('helpers', () => {
  assert.equal(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;')
  assert.deepEqual(variablesIn('a {{org.name}} b {{ record.data.days }}'), ['org.name', 'record.data.days'])
  assert.equal(isVariable('record.data.days'), true)
  assert.equal(isVariable('record.data.Days'), false)
  assert.equal(isVariable('org.id'), false)
})
test('APP_URL must be an absolute http(s) URL ending in /app/', () => {
  assert.equal(readAppUrl('http://localhost:5173/app/'), 'http://localhost:5173/app/')
  assert.equal(readAppUrl('https://reportnoreport.com/app/'), 'https://reportnoreport.com/app/')
  for (const bad of [undefined, '', 'reportnoreport.com/app/', 'https://reportnoreport.com/', 'https://reportnoreport.com/app', 'ftp://x/app/', 'https://x/app/?a=1', 'javascript:alert(1)//app/']) {
    assert.throws(() => readAppUrl(bad), /APP_URL/)
  }
})
```

`supabase/functions/_shared/comms/recipients.test.ts`:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EMAIL_RE, MAX_RECIPIENT_RULES, readRecipient, readSendMessage, sendMessageIssue, type RecipientRefs } from './recipients.ts'

const T = '0000000a-0000-0000-0000-00000000a0e1'
const ROLE = '0000000a-0000-0000-0000-00000000a001'
const USER = '00000000-0000-0000-0000-0000000000a2'
const refs: RecipientRefs = { templates: new Set([T]), roles: new Set([ROLE]), users: new Set([USER]), steps: new Set(['start', 'approve']) }
const action = (recipients: unknown[], templateId: unknown = T) => ({ type: 'send_message', templateId, recipients })

test('each recipient has exactly one valid key', () => {
  assert.deepEqual(readRecipient({ role: ROLE }), { role: ROLE })
  assert.deepEqual(readRecipient({ starter: true }), { starter: true })
  assert.deepEqual(readRecipient({ field: 'parent_email' }), { field: 'parent_email' })
  for (const bad of [null, [], {}, { role: '' }, { starter: false }, { field: 'Parent Email' }, { role: ROLE, user: USER }, { step: 'Bad Id!' }, { group: 'x' }]) {
    assert.equal(readRecipient(bad), null)
  }
})
test('a send_message action needs a template and 1 to 20 recipients', () => {
  assert.deepEqual(readSendMessage(action([{ starter: true }])), { type: 'send_message', templateId: T, recipients: [{ starter: true }] })
  assert.equal(readSendMessage(action([])), null)
  assert.equal(readSendMessage(action([{ starter: true }], '')), null)
  assert.equal(readSendMessage(action(Array.from({ length: MAX_RECIPIENT_RULES + 1 }, () => ({ starter: true })))), null)
  assert.equal(readSendMessage({ type: 'send_message' }), null)
})
test('publish check messages', () => {
  assert.equal(sendMessageIssue(action([{ starter: true }, { role: ROLE }, { user: USER }, { step: 'approve' }, { field: 'email' }]), refs), null)
  assert.equal(sendMessageIssue({ type: 'send_message' }, refs), 'Choose a message template for "Send message".')
  assert.equal(sendMessageIssue(action([{ starter: true }], 'gone'), refs), 'The message template for "Send message" no longer exists. Choose another.')
  assert.equal(sendMessageIssue(action([]), refs), 'Add at least one recipient to "Send message".')
  assert.equal(sendMessageIssue(action([{ field: '' }]), refs), 'A recipient of "Send message" is incomplete. Finish it or remove it.')
  assert.equal(sendMessageIssue(action([{ role: 'gone' }]), refs), 'A role that "Send message" sends to no longer exists.')
  assert.equal(sendMessageIssue(action([{ user: 'gone' }]), refs), 'A person that "Send message" sends to is no longer a member.')
  assert.equal(sendMessageIssue(action([{ step: 'long' }]), refs), '"Send message" can only send to the person who completed a Start or Form step.')
})
test('email addresses', () => {
  for (const ok of ['a@b.co', 'Parent.Name+tag@school.example.org']) assert.equal(EMAIL_RE.test(ok), true)
  for (const bad of ['', 'a@b', 'a b@c.co', 'a@b.co\nBcc: x@y.z', '<a@b.co>', 'a@b.co,c@d.co']) assert.equal(EMAIL_RE.test(bad), false)
})
```

Add to `supabase/functions/_shared/workflow/graph.test.ts` (import `T_APPROVED` from `./fixture.ts`), and update the existing "referenced forms, roles, people and steps must exist" test:
```ts
test('referenced forms, roles, people, templates and steps must exist', () => {
  const empty = { forms: new Set<string>(), roles: new Set<string>(), users: new Set<string>(), templates: new Set<string>() }
  assert.deepEqual(msgs(LEAVE, empty), [
    'The form for "Start" no longer exists. Choose another.',
    'The form for "Manager approval" no longer exists. Choose another.',
    'The role assigned to "Manager approval" no longer exists.',
    'The message template for "Send message" no longer exists. Choose another.',
  ])
  const g = leave()
  find<FormNode>(g, 'approve').assignee = { step: 'long' }
  assert.deepEqual(msgs(g), ['"Manager approval" must be assigned from an earlier Start or Form step.'])
  find<FormNode>(g, 'approve').assignee = { user: 'nobody' }
  assert.deepEqual(msgs(g), ['The person assigned to "Manager approval" is no longer a member.'])
  find<FormNode>(g, 'approve').assignee = { role: '' }
  assert.deepEqual(msgs(g), ['Choose who completes "Manager approval".'])
})
test('a Send message action needs a template and recipients that exist; issues pin to the connection', () => {
  const g = leave()
  g.edges[1].actions = [{ type: 'send_message', templateId: T_APPROVED, recipients: [{ step: 'long' }] }]
  assert.deepEqual(checkGraph(g, REFS), [{ message: '"Send message" can only send to the person who completed a Start or Form step.', edgeId: 'e2' }])
  g.edges[1].actions = [{ type: 'send_message' } as never]
  assert.deepEqual(msgs(g), ['Choose a message template for "Send message".'])
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test`
Expected: `Cannot find module '…/_shared/comms/render.ts'` and `…/recipients.ts`; graph tests fail on `T_APPROVED` (not exported).

- [ ] **Step 3: Implement** — `supabase/functions/_shared/comms/render.ts`

```ts
import type { Answers } from '../forms/types.ts'
import { KEY_RE } from '../forms/schema.ts'

export type RenderContext = {
  record: { title: string; data: Answers }
  step: { assignee: { name: string } }
  link: { task: string; record: string; invite: string }
  org: { name: string }
  recipient: { name: string }
}
export type TemplateText = { subject: string; body: string }
export type Rendered = { subject: string; text: string; html: string; unknown: string[] }

export const MAX_SUBJECT = 200
export const DATA_PREFIX = 'record.data.'
/** Every variable a template may use (spec §8); `record.data.<key>` reads one answer by its form field key. */
export const VARIABLES = [
  { key: 'record.title', label: 'Record title', hint: 'The record this message is about.' },
  { key: 'step.assignee.name', label: 'Step assignee', hint: 'Who holds the task, or who completed the step the path leaves.' },
  { key: 'link.task', label: 'Task link', hint: 'Only in Task assigned and Task overdue.' },
  { key: 'link.record', label: 'Record link', hint: 'Opens the record page.' },
  { key: 'link.invite', label: 'Invite link', hint: 'Only in Invite to org.' },
  { key: 'org.name', label: 'Organisation name', hint: 'Your organisation.' },
  { key: 'recipient.name', label: 'Recipient name', hint: 'The person reading the message.' },
] as const

const TOKEN = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g
const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const FIXED = new Set<string>(VARIABLES.map((v) => v.key))

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c])
export const variablesIn = (s: string) => [...s.matchAll(TOKEN)].map((m) => m[1])
export const isVariable = (key: string) => FIXED.has(key) || (key.startsWith(DATA_PREFIX) && KEY_RE.test(key.slice(DATA_PREFIX.length)))

/** An answer as one line of text: lists joined, repeating groups counted, anything else empty. */
export function valueText(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x === 'string' || typeof x === 'number')) return v.join(', ')
    return `${v.length} ${v.length === 1 ? 'row' : 'rows'}`
  }
  return ''
}

/** null = not a variable. */
function lookup(key: string, c: RenderContext): string | null {
  if (!isVariable(key)) return null
  if (key.startsWith(DATA_PREFIX)) {
    const k = key.slice(DATA_PREFIX.length)
    return Object.hasOwn(c.record.data ?? {}, k) ? valueText(c.record.data[k]) : ''
  }
  switch (key) {
    case 'record.title': return c.record.title
    case 'step.assignee.name': return c.step.assignee.name
    case 'link.task': return c.link.task
    case 'link.record': return c.link.record
    case 'link.invite': return c.link.invite
    case 'org.name': return c.org.name
    default: return c.recipient.name
  }
}

const isHttp = (v: string) => /^https?:\/\//i.test(v)
const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, ' ')

/**
 * Single pass over the template: values are inserted once and never scanned again. In `html` every literal character and
 * every value is escaped; only http(s) links become anchors. `text` is the same message unescaped, for the text part.
 */
export function render(t: TemplateText, c: RenderContext): Rendered {
  const unknown = new Set<string>()
  const fill = (s: string, literal: (x: string) => string, value: (v: string, key: string) => string) => {
    let out = ''
    let last = 0
    for (const m of s.matchAll(TOKEN)) {
      out += literal(s.slice(last, m.index))
      last = (m.index as number) + m[0].length
      const v = lookup(m[1], c)
      if (v === null) unknown.add(m[1])
      else out += value(v, m[1])
    }
    return out + literal(s.slice(last))
  }
  const subject = fill(t.subject, oneLine, (v) => oneLine(v)).trim().slice(0, MAX_SUBJECT)
  const text = fill(t.body, (x) => x, (v) => v)
  const html = fill(t.body, escapeHtml, (v, key) =>
    key.startsWith('link.') && isHttp(v) ? `<a href="${escapeHtml(v)}">${escapeHtml(v)}</a>` : escapeHtml(v))
    .split(/\r?\n[ \t]*\r?\n/)
    .map((p) => `<p>${p.replace(/\r?\n/g, '<br>')}</p>`)
    .join('\n')
  return { subject, text, html, unknown: [...unknown] }
}

const APP_URL_HELP = 'APP_URL must be an absolute URL such as https://reportnoreport.com/app/.'
/** The app's base URL for links in messages. Read when a function boots; throws so a bad setting stops it at once. */
export function readAppUrl(raw: string | undefined): string {
  let u: URL
  try { u = new URL(raw ?? '') } catch { throw new Error(APP_URL_HELP) }
  if (!/^https?:$/.test(u.protocol) || !u.pathname.endsWith('/app/') || u.search || u.hash || raw !== u.href) throw new Error(APP_URL_HELP)
  return u.href
}
```

`supabase/functions/_shared/comms/recipients.ts`:
```ts
import { KEY_RE } from '../forms/schema.ts'

export const TEMPLATE_KINDS = ['custom', 'task_assigned', 'task_overdue', 'record_approved', 'record_rejected', 'invite'] as const
export type TemplateKind = (typeof TEMPLATE_KINDS)[number]
export const KIND_LABELS: Record<TemplateKind, string> = {
  custom: 'Workflow messages', task_assigned: 'Task assigned', task_overdue: 'Task overdue',
  record_approved: 'Record approved', record_rejected: 'Record rejected', invite: 'Invite to org',
}
/** Types a person may mute email for. Invites always send. */
export const MUTABLE_KINDS = ['task_assigned', 'task_overdue', 'record_approved', 'record_rejected', 'custom'] as const
export type MutableKind = (typeof MUTABLE_KINDS)[number]

export type Recipient = { role: string } | { user: string } | { starter: true } | { step: string } | { field: string }
export type SendMessage = { type: 'send_message'; templateId: string; recipients: Recipient[] }
export type RecipientRefs = { templates: ReadonlySet<string>; roles: ReadonlySet<string>; users: ReadonlySet<string>; steps: ReadonlySet<string> }

export const MAX_RECIPIENT_RULES = 20
/** One address, no display name, no list, nothing that could break out of a header. */
export const EMAIL_RE = /^[^\s@<>()",;:\\]+@[^\s@<>()",;:\\]+\.[^\s@<>()",;:\\]+$/
const STEP_RE = /^[a-z0-9_-]{1,40}$/
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64

export function readRecipient(r: unknown): Recipient | null {
  if (!isObj(r) || Object.keys(r).length !== 1) return null
  if (isId(r.role)) return { role: r.role }
  if (isId(r.user)) return { user: r.user }
  if (r.starter === true) return { starter: true }
  if (typeof r.step === 'string' && STEP_RE.test(r.step)) return { step: r.step }
  if (typeof r.field === 'string' && KEY_RE.test(r.field)) return { field: r.field }
  return null
}

export function readSendMessage(a: unknown): SendMessage | null {
  if (!isObj(a) || a.type !== 'send_message' || !isId(a.templateId) || !Array.isArray(a.recipients)) return null
  if (a.recipients.length < 1 || a.recipients.length > MAX_RECIPIENT_RULES) return null
  const recipients = a.recipients.map(readRecipient)
  return recipients.every((r) => r !== null) ? { type: 'send_message', templateId: a.templateId, recipients: recipients as Recipient[] } : null
}

/** Publish-check message for one Send message action, or null when it can run. */
export function sendMessageIssue(a: unknown, refs: RecipientRefs): string | null {
  if (!isObj(a) || !isId(a.templateId)) return 'Choose a message template for "Send message".'
  if (!refs.templates.has(a.templateId)) return 'The message template for "Send message" no longer exists. Choose another.'
  if (!Array.isArray(a.recipients) || a.recipients.length === 0) return 'Add at least one recipient to "Send message".'
  if (a.recipients.length > MAX_RECIPIENT_RULES) return `Keep "Send message" to ${MAX_RECIPIENT_RULES} recipients or fewer.`
  for (const raw of a.recipients) {
    const r = readRecipient(raw)
    if (!r) return 'A recipient of "Send message" is incomplete. Finish it or remove it.'
    if ('role' in r && !refs.roles.has(r.role)) return 'A role that "Send message" sends to no longer exists.'
    if ('user' in r && !refs.users.has(r.user)) return 'A person that "Send message" sends to is no longer a member.'
    if ('step' in r && !refs.steps.has(r.step)) return '"Send message" can only send to the person who completed a Start or Form step.'
  }
  return null
}
```

`supabase/functions/_shared/workflow/graph.ts` — the type, the refs and the action check:
```ts
import { sendMessageIssue, type SendMessage } from '../comms/recipients.ts'
```
```ts
export type Action =
  | { type: 'set_status'; label: string }
  | SendMessage
  | { type: 'generate_pdf' }
```
```ts
export type Refs = { forms: ReadonlySet<string>; roles: ReadonlySet<string>; users: ReadonlySet<string>; templates: ReadonlySet<string> }
```
In `checkGraph`, change the action loop line to pass the graph and refs:
```ts
    for (const a of e.actions) { const m = actionIssue(a, g, refs); if (m) add(m, at) }
```
and replace `actionIssue`:
```ts
function actionIssue(a: unknown, g: Graph, refs: Refs): string | null {
  if (!isObj(a)) return 'Remove the broken action from this connection.'
  if (a.type === 'set_status') {
    const label = typeof a.label === 'string' ? a.label.trim() : ''
    return label.length >= 1 && label.length <= 60 ? null : 'Enter the status text (up to 60 characters).'
  }
  if (a.type === 'send_message') {
    const steps = new Set(g.nodes.filter((n) => n.type === 'start' || n.type === 'form').map((n) => n.id))
    return sendMessageIssue(a, { templates: refs.templates, roles: refs.roles, users: refs.users, steps })
  }
  if (a.type === 'generate_pdf') return null
  return 'Remove the unknown action from this connection.'
}
```

`supabase/functions/_shared/workflow/fixture.ts`:
```ts
export const T_APPROVED = '0000000a-0000-0000-0000-00000000a0e1'
```
e2 becomes:
```ts
    { id: 'e2', from: 'approve', outcome: 'approved', to: 'long', actions: [{ type: 'send_message', templateId: T_APPROVED, recipients: [{ starter: true }] }] },
```
and:
```ts
export const REFS: Refs = { forms: new Set([F_LEAVE, F_APPROVAL]), roles: new Set([ROLE_ADMIN]), users: new Set([ADMIN, MEMBER]), templates: new Set([T_APPROVED]) }
```

- [ ] **Step 4: Run — expect PASS under node and Deno**

Run: `pnpm test`
Expected: `# pass 116`, `# fail 0` (101 + 10 render + 4 recipients + 1 graph; the existing reference test is replaced in place).

Run: `DENO_NO_PACKAGE_JSON=1 deno test supabase/functions/_shared`
Expected: every shared test passes under Deno too (same output as node).

- [ ] **Step 5: Wire the template references** — `src/comms/logic.ts`

```ts
// The same modules run inside advance, send-messages and invite-member; the server's rendering is the one that is sent.
export * from '../../supabase/functions/_shared/comms/render.ts'
export * from '../../supabase/functions/_shared/comms/recipients.ts'
```

`src/comms/api.ts`:
```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../data/supabase'
import type { TemplateKind } from './logic'

export type TemplateRow = {
  id: string; org_id: string; kind: TemplateKind; name: string; channel: 'email' | 'in_app'
  subject: string; body: string; is_system: boolean; updated_at: string
}
const TEMPLATE_COLS = 'id, org_id, kind, name, channel, subject, body, is_system, updated_at'

export const useTemplates = (orgId: string | null) => useQuery({
  queryKey: ['templates', orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data, error } = await supabase.from('message_templates').select(TEMPLATE_COLS).eq('org_id', orgId!)
      .order('is_system', { ascending: false }).order('name')
    if (error) throw error
    return data as TemplateRow[]
  },
})
```

`src/workflows/canvas/WorkflowEditor.tsx` — import `useTemplates` from `'../../comms/api'`, then:
```tsx
  const templates = useTemplates(orgId)
  const refs = useMemo(() => (forms.data && roles.data && members.data && templates.data
    ? {
        forms: new Set(forms.data.map((f) => f.id)), roles: new Set(roles.data.map((r) => r.id)),
        users: new Set(members.data.keys()), templates: new Set(templates.data.map((t) => t.id)),
      }
    : null), [forms.data, roles.data, members.data, templates.data])
```

`supabase/functions/save-workflow/index.ts` — in `refs`:
```ts
        templates: await ids(admin.from('message_templates').select('id').eq('org_id', orgId), 'id'),
```

- [ ] **Step 6: Typecheck, lint, Edge tests**

Run: `pnpm build && pnpm lint && DENO_NO_PACKAGE_JSON=1 deno test supabase/functions`
Expected: build passes, no lint warnings. Deno: the shared tests pass (+15); `engine.test.ts` "a role task must be claimed; approving runs the condition and schedules the Time step" now fails on its pending `send_message` assertion — Task 3 replaces that assertion; nothing else fails.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/comms/render.ts supabase/functions/_shared/comms/render.test.ts supabase/functions/_shared/comms/recipients.ts supabase/functions/_shared/comms/recipients.test.ts supabase/functions/_shared/workflow/graph.ts supabase/functions/_shared/workflow/graph.test.ts supabase/functions/_shared/workflow/fixture.ts supabase/functions/save-workflow/index.ts src/comms/logic.ts src/comms/api.ts src/workflows/canvas/WorkflowEditor.tsx
git commit -m "feat: add shared template renderer, recipient rules and Send message publish check"
```

---

### Task 3: Engine — Task assigned and real `send_message`

**Owner:** Backend engineer · **Depends on:** Tasks 1, 2

**Files:**
- Create: `supabase/functions/advance/notify.ts`
- Modify: `supabase/functions/advance/engine.ts`, `supabase/functions/advance/pgStore.ts`, `supabase/functions/advance/testkit.ts`, `supabase/functions/advance/handler.ts`, `supabase/functions/advance/index.ts`, `supabase/functions/advance/handler.test.ts`, `supabase/functions/advance/race.test.ts`, `supabase/functions/resume/handler.ts`, `supabase/functions/resume/index.ts`, `supabase/functions/resume/handler.test.ts`, `supabase/functions/.env.example` (create)
- Test: `supabase/functions/advance/engine.test.ts`

**Interfaces:**
- Consumes: `render`, `RenderContext`, `readAppUrl` (Task 2 `render.ts`); `readSendMessage`, `EMAIL_RE`, `KIND_LABELS`, `TemplateKind` (Task 2 `recipients.ts`); `Tx`, `Store`, `StepError`, `walk`, `createTask`, `runAction`, `resumeOne` (Phase 3); tables from Task 1.
- Produces:
  - `notify.ts`: `type TemplateRow = { id: string; org_id: string; kind: TemplateKind; name: string; channel: 'email' | 'in_app'; subject: string; body: string }`, `type Person = { userId: string; email: string; name: string }`, `type NewMessage`, `type NewNotification`, `type MessageRow = { id: string; org_id: string; recipient_email: string; subject: string; body_html: string; body_text: string; attempts: number }`, `type MessagePatch = { status: 'queued' | 'sent' | 'failed'; attempts: number; error: string | null; nextAttemptAt?: Date; sentAt?: Date; providerId?: string | null }`, `type TaskRef`, `type NotifyCtx = { now: Date; appUrl: string }`, `type Sent = { emails: number; notices: number; skipped: number }`, `MAX_PEOPLE = 500`, `deliver(tx, t, people, emails, base, at): Promise<Sent>`, `notifyTask(tx, kind: 'task_assigned' | 'task_overdue', rec: RecordRow, task: TaskRef, ctx: NotifyCtx): Promise<Sent>`, `sendAction(tx, rec: RecordRow, from: string, a: unknown, ctx: NotifyCtx): Promise<Sent & { template: string; people: number }>`
  - `engine.ts`: `Tx` gains `orgName`, `template`, `peopleByIds`, `peopleInRole`, `roleName`, `emailMuted`, `notify`, `queueMessages`, `overdueTasks`, `markOverdue`, `dueMessages`, `lockMessage`, `finishMessage`; `Ctx` gains `appUrl: string`; `type WalkCtx = { now: Date; actor: string | null; appUrl: string }`; `walk(tx, rec, graph, from, outcome, ctx: WalkCtx)`; `resumeOne(tx, id: string, ctx: { now: Date; appUrl: string })`
  - `advance/handler.ts` `Deps` and `resume/handler.ts` `Deps` gain `appUrl: string`
  - `testkit.ts`: `APP`, `GONE`; `Db` gains `orgName`, `templates`, `muted`, `notifications`, `messages`; members carry `email` and `name`, roles carry `name`, tasks carry `overdue_notified_at`

- [ ] **Step 1: Write the failing tests** — `supabase/functions/advance/engine.test.ts`

In the existing test "a role task must be claimed; approving runs the condition and schedules the Time step", replace the pending assertion with:
```ts
  assertEquals(db.events.filter((e) => e.kind === 'action').map((e) => e.detail),
    [{ type: 'send_message', edge: 'e2', template: 'Record approved', people: 1, emails: 1, notices: 1, skipped: 0 }])
```
Change the imports to:
```ts
import { APP, BETA_USER, GONE, setup } from './testkit.ts'
import { ADMIN, F_APPROVAL, MEMBER, ROLE_ADMIN, T_APPROVED, leave } from '../_shared/workflow/fixture.ts'
```
and append:
```ts
const withEmailField = (s: ReturnType<typeof setup>) => {
  s.db.forms[1].schema = [{ key: 'comment', type: 'long_text', label: 'Comment' }, { key: 'notify', type: 'short_text', label: 'Email' }]
}
const sendTo = (recipients: unknown[]) => {
  const g = leave()
  g.edges[1].actions = [{ type: 'send_message', templateId: T_APPROVED, recipients } as never]
  return setup(g)
}

Deno.test('a new task notifies its holders in the app and by email, with escaped values', async () => {
  const { db, start } = setup()
  await start({ ...VALID, name: '<script>alert(1)</script>' })
  const task = db.tasks[0]
  assertEquals(db.notifications.map((n) => [n.user_id, n.kind, n.link, n.title]),
    [[ADMIN, 'task_assigned', `#/tasks/${task.id}`, 'New task: Leave approval: <script>alert(1)</script>']])
  assertEquals(db.messages.map((m) => [m.recipient_email, m.recipient_user_id, m.status, m.record_id]), [['admin@alpha.test', ADMIN, 'queued', db.records[0].id]])
  const link = `${APP}#/tasks/${task.id}`
  assertEquals(db.messages[0].body_html,
    `<p>Hello admin@alpha.test, &quot;Leave approval: &lt;script&gt;alert(1)&lt;/script&gt;&quot; needs Admin: <a href="${link}">${link}</a></p>`)
  assertEquals(db.messages[0].body_text, `Hello admin@alpha.test, "Leave approval: <script>alert(1)</script>" needs Admin: ${link}`)
  const ev = db.events.find((e) => e.kind === 'task')?.detail
  assertEquals([ev?.notified, ev?.emailed], [1, 1])
})
Deno.test('a muted email type still gets the in-app notice', async () => {
  const { db, start } = setup()
  db.muted.add(`${ADMIN}:task_assigned`)
  await start()
  assertEquals([db.notifications.length, db.messages.length], [1, 0])
})
Deno.test('Send message queues the template for the record starter; the approver is the step assignee', async () => {
  const { db, start, act, claim } = setup()
  await start()
  claim()
  await act(db.tasks[0].id, 'approved')
  const rec = db.records[0]
  const sent = db.messages.filter((m) => m.template_id === T_APPROVED)
  assertEquals(sent.map((m) => [m.recipient_email, m.subject]), [['member@alpha.test', 'Approved: Leave approval: Ada']])
  assertEquals(sent[0].body_text, `admin@alpha.test approved it. ${APP}#/records/${rec.id}`)
  assertEquals(db.notifications.filter((n) => n.kind === 'record_approved').map((n) => [n.user_id, n.link]), [[MEMBER, `#/records/${rec.id}`]])
})
Deno.test('recipients: role, person, step and an email field, each person once; unresolvable ones are skipped and counted', async () => {
  const s = sendTo([{ role: ROLE_ADMIN }, { user: ADMIN }, { step: 'start' }, { field: 'notify' }, { field: 'reason' }, { user: GONE }])
  withEmailField(s)
  await s.start()
  s.claim()
  await s.act(s.db.tasks[0].id, 'approved', ADMIN, { comment: 'Fine', notify: 'Parent@Example.com' })
  assertEquals(s.db.messages.filter((m) => m.template_id === T_APPROVED).map((m) => m.recipient_email).sort(),
    ['admin@alpha.test', 'member@alpha.test', 'parent@example.com'])
  assertEquals(s.db.notifications.filter((n) => n.kind === 'record_approved').map((n) => n.user_id).sort(), [ADMIN, MEMBER])
  assertEquals(s.db.events.find((e) => e.kind === 'action')?.detail,
    { type: 'send_message', edge: 'e2', template: 'Record approved', people: 3, emails: 3, notices: 2, skipped: 2 })
})
Deno.test('a Send message whose template is gone, or that finds nobody, stops the record with the reason', async () => {
  const gone = setup()
  gone.db.templates = gone.db.templates.filter((t) => t.id !== T_APPROVED)
  await gone.start()
  gone.claim()
  await gone.act(gone.db.tasks[0].id, 'approved')
  assertEquals([gone.db.records[0].status, gone.db.records[0].error],
    ['error', 'The message template of a "Send message" action no longer exists. Ask a workflow manager to choose another.'])
  const nobody = sendTo([{ field: 'reason' }])
  await nobody.start()
  nobody.claim()
  await nobody.act(nobody.db.tasks[0].id, 'approved')
  assertEquals([nobody.db.records[0].status, nobody.db.records[0].error],
    ['error', '"Send message" found nobody to send "Record approved" to. Ask a workflow manager to check its recipients.'])
  assertEquals(nobody.db.submissions.map((x) => x.node_id), ['start', 'approve']) // the approval that triggered it is kept
  assertEquals(nobody.db.messages.filter((m) => m.template_id === T_APPROVED).length, 0)
})
Deno.test('an in-app template notifies members and queues no email; raw addresses are skipped', async () => {
  const s = sendTo([{ starter: true }, { field: 'notify' }])
  withEmailField(s)
  s.db.templates = s.db.templates.map((t) => (t.id === T_APPROVED ? { ...t, channel: 'in_app' as const } : t))
  await s.start()
  s.claim()
  await s.act(s.db.tasks[0].id, 'approved', ADMIN, { comment: 'Fine', notify: 'parent@example.com' })
  assertEquals(s.db.messages.filter((m) => m.template_id === T_APPROVED).length, 0)
  assertEquals(s.db.notifications.filter((n) => n.kind === 'record_approved').map((n) => n.user_id), [MEMBER])
  assertEquals(s.db.events.find((e) => e.kind === 'action')?.detail.skipped, 1)
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `DENO_NO_PACKAGE_JSON=1 deno test supabase/functions/advance`
Expected: type errors — `APP`, `GONE` not exported from `testkit.ts`, `notifications`/`messages`/`muted`/`templates` not on `Db`.

- [ ] **Step 3: Implement** — `supabase/functions/advance/notify.ts`

```ts
import { render, type RenderContext } from '../_shared/comms/render.ts'
import { EMAIL_RE, KIND_LABELS, readSendMessage, type TemplateKind } from '../_shared/comms/recipients.ts'
import { StepError, type RecordRow, type Tx } from './engine.ts'

export type TemplateRow = { id: string; org_id: string; kind: TemplateKind; name: string; channel: 'email' | 'in_app'; subject: string; body: string }
export type Person = { userId: string; email: string; name: string }
export type NewMessage = {
  org_id: string; template_id: string; record_id: string | null; recipient_user_id: string | null
  recipient_email: string; subject: string; body_html: string; body_text: string
}
export type NewNotification = { org_id: string; user_id: string; kind: TemplateKind; title: string; body: string; link: string }
export type MessageRow = { id: string; org_id: string; recipient_email: string; subject: string; body_html: string; body_text: string; attempts: number }
export type MessagePatch = { status: 'queued' | 'sent' | 'failed'; attempts: number; error: string | null; nextAttemptAt?: Date; sentAt?: Date; providerId?: string | null }
export type TaskRef = { id: string; node_id: string; assignee_role_id: string | null; assignee_user_id: string | null; claimed_by: string | null }
export type NotifyCtx = { now: Date; appUrl: string }
export type Sent = { emails: number; notices: number; skipped: number }
type Base = Omit<RenderContext, 'recipient'>

/**
 * shortcut: a message reaches at most 500 people (a role task notifies its first 500 holders by email order; a larger
 * Send message stops the record). Batch through the queue when an org has roles that big; campaigns (Phase 6) do.
 */
export const MAX_PEOPLE = 500
const FORMER = 'Former member'

function baseContext(rec: RecordRow, orgName: string, assignee: string, ctx: NotifyCtx, taskId: string | null): Base {
  return {
    record: { title: rec.title, data: rec.data },
    step: { assignee: { name: assignee } },
    link: { task: taskId ? `${ctx.appUrl}#/tasks/${taskId}` : '', record: `${ctx.appUrl}#/records/${rec.id}`, invite: '' },
    org: { name: orgName },
  }
}

/**
 * Renders the template once per recipient and writes, in the caller's transaction, an in-app notice for every member
 * (always) and a queued email when the template is email and that member has not muted its type. Raw addresses get
 * the email only; an in-app template cannot reach them, so they count as skipped.
 */
export async function deliver(tx: Tx, t: TemplateRow, people: Person[], emails: string[], base: Base, at: { recordId: string | null; link: string }): Promise<Sent> {
  const isEmail = t.channel === 'email'
  const muted = isEmail && people.length ? await tx.emailMuted(people.map((p) => p.userId), t.kind) : new Set<string>()
  const notices: NewNotification[] = []
  const mails: NewMessage[] = []
  const queue = (to: string, userId: string | null, r: ReturnType<typeof render>) => mails.push({
    org_id: t.org_id, template_id: t.id, record_id: at.recordId, recipient_user_id: userId, recipient_email: to,
    subject: r.subject || t.name, body_html: r.html, body_text: r.text,
  })
  for (const p of people) {
    const r = render(t, { ...base, recipient: { name: p.name } })
    notices.push({ org_id: t.org_id, user_id: p.userId, kind: t.kind, title: r.subject || t.name, body: r.text.slice(0, 2000), link: at.link })
    if (isEmail && !muted.has(p.userId)) queue(p.email, p.userId, r)
  }
  if (isEmail) for (const e of emails) queue(e, null, render(t, { ...base, recipient: { name: e } }))
  if (notices.length) await tx.notify(notices)
  if (mails.length) await tx.queueMessages(mails)
  return { emails: mails.length, notices: notices.length, skipped: isEmail ? 0 : emails.length }
}

/** Task assigned / Task overdue to whoever holds the task: its claimer, else its person, else every holder of its role. */
export async function notifyTask(tx: Tx, kind: 'task_assigned' | 'task_overdue', rec: RecordRow, task: TaskRef, ctx: NotifyCtx): Promise<Sent> {
  const t = await tx.template(rec.org_id, { kind })
  if (!t) throw new StepError(`The "${KIND_LABELS[kind]}" message template is missing. Ask an admin to restore it.`)
  const holder = task.claimed_by ?? task.assignee_user_id
  const people = holder
    ? await tx.peopleByIds(rec.org_id, [holder])
    : task.assignee_role_id ? await tx.peopleInRole(rec.org_id, task.assignee_role_id) : []
  const assignee = holder
    ? people[0]?.name ?? FORMER
    : (task.assignee_role_id ? await tx.roleName(task.assignee_role_id, rec.org_id) : null) ?? 'Unassigned'
  const base = baseContext(rec, await tx.orgName(rec.org_id), assignee, ctx, task.id)
  return deliver(tx, t, people, [], base, { recordId: rec.id, link: `#/tasks/${task.id}` })
}

/**
 * One Send message action on the path leaving `from`. Throws StepError when the template is gone or nobody can be
 * reached, so the record stops with the reason (spec §5.4); a single recipient that resolves to nobody is skipped and counted.
 */
export async function sendAction(tx: Tx, rec: RecordRow, from: string, a: unknown, ctx: NotifyCtx): Promise<Sent & { template: string; people: number }> {
  const cfg = readSendMessage(a)
  if (!cfg) throw new StepError('A "Send message" action on this path has no template or recipients. Ask a workflow manager to fix it.')
  const t = await tx.template(rec.org_id, { id: cfg.templateId })
  if (!t) throw new StepError('The message template of a "Send message" action no longer exists. Ask a workflow manager to choose another.')

  const ids = new Set<string>()
  const roles = new Set<string>()
  const addresses = new Set<string>()
  let skipped = 0
  for (const r of cfg.recipients) {
    if ('role' in r) roles.add(r.role)
    else if ('user' in r) ids.add(r.user)
    else if ('starter' in r) ids.add(rec.started_by)
    else if ('step' in r) {
      const who = await tx.lastSubmitter(rec.id, r.step)
      if (who) ids.add(who)
      else skipped++
    } else {
      const v = rec.data[r.field]
      if (typeof v === 'string' && EMAIL_RE.test(v.trim())) addresses.add(v.trim().toLowerCase())
      else skipped++
    }
  }
  const named = await tx.peopleByIds(rec.org_id, [...ids])
  skipped += ids.size - named.length // former members
  const byId = new Map(named.map((p) => [p.userId, p]))
  for (const role of roles) for (const p of await tx.peopleInRole(rec.org_id, role)) byId.set(p.userId, p)
  const people = [...byId.values()]
  for (const p of people) addresses.delete(p.email.toLowerCase())
  if (!people.length && !addresses.size) {
    throw new StepError(`"Send message" found nobody to send "${t.name}" to. Ask a workflow manager to check its recipients.`)
  }
  if (people.length + addresses.size > MAX_PEOPLE) {
    throw new StepError(`"Send message" would send "${t.name}" to more than ${MAX_PEOPLE} people. Ask a workflow manager to narrow its recipients.`)
  }
  const doer = await tx.lastSubmitter(rec.id, from)
  const doerName = doer ? (byId.get(doer) ?? (await tx.peopleByIds(rec.org_id, [doer]))[0])?.name ?? FORMER : 'Nobody yet'
  const base = baseContext(rec, await tx.orgName(rec.org_id), doerName, ctx, null)
  const sent = await deliver(tx, t, people, [...addresses], base, { recordId: rec.id, link: `#/records/${rec.id}` })
  return { template: t.name, people: people.length + addresses.size, ...sent, skipped: sent.skipped + skipped }
}
```

`supabase/functions/advance/engine.ts` — imports:
```ts
import { notifyTask, sendAction, type MessagePatch, type MessageRow, type NewMessage, type NewNotification, type Person, type TemplateRow } from './notify.ts'
import type { TemplateKind } from '../_shared/comms/recipients.ts'
```
Append to `interface Tx`:
```ts
  orgName(orgId: string): Promise<string>
  template(orgId: string, ref: { id: string } | { kind: TemplateKind }): Promise<TemplateRow | null>
  /** Active members among these users. */
  peopleByIds(orgId: string, userIds: string[]): Promise<Person[]>
  /** Active holders of the role, by email, at most MAX_PEOPLE. */
  peopleInRole(orgId: string, roleId: string): Promise<Person[]>
  roleName(roleId: string, orgId: string): Promise<string | null>
  /** Of these users, the ones who turned email off for this kind. */
  emailMuted(userIds: string[], kind: TemplateKind): Promise<Set<string>>
  notify(rows: NewNotification[]): Promise<void>
  queueMessages(rows: NewMessage[]): Promise<void>
  /** Open, unreminded tasks past due, oldest first. */
  overdueTasks(now: Date, limit: number): Promise<{ id: string; record_id: string }[]>
  /** Sets overdue_notified_at once; null when another run did, or the task is done or not due. */
  markOverdue(taskId: string, now: Date): Promise<TaskRow | null>
  dueMessages(now: Date, limit: number): Promise<string[]>
  /** FOR UPDATE SKIP LOCKED, queued and due rows only. */
  lockMessage(id: string, now: Date): Promise<MessageRow | null>
  finishMessage(id: string, patch: MessagePatch): Promise<void>
```
Contexts:
```ts
export type Ctx = { now: Date; actor: string; appUrl: string; fileExists(path: string): Promise<boolean> }
export type WalkCtx = { now: Date; actor: string | null; appUrl: string }
type Ev = (k: EventKind, n: string | null, d?: Record<string, unknown>) => Promise<void>
```
In `walk`, change the signature's last parameter to `ctx: WalkCtx`, the actions line to
```ts
      for (const a of edge.actions) await runAction(tx, rec, edge, a, ctx, ev)
```
and the Form line to
```ts
      if (node.type === 'form') { await createTask(tx, rec, node, ctx, ev); break }
```
Replace `runAction`:
```ts
async function runAction(tx: Tx, rec: RecordRow, edge: Edge, a: unknown, ctx: WalkCtx, ev: Ev) {
  if (isObj(a) && a.type === 'set_status') {
    const label = typeof a.label === 'string' ? a.label.trim() : ''
    if (!label || label.length > 60) throw new StepError('A "Set status" action on this path has no status text. Ask a workflow manager to fix it.')
    rec.label = label
    return ev('action', edge.from, { type: 'set_status', edge: edge.id, label })
  }
  if (isObj(a) && a.type === 'send_message') {
    const sent = await sendAction(tx, rec, edge.from, a, ctx)
    return ev('action', edge.from, { type: 'send_message', edge: edge.id, ...sent })
  }
  if (isObj(a) && a.type === 'generate_pdf') {
    // shortcut: recorded as pending only; Phase 5 (Reports) processes pending generate_pdf events.
    return ev('action', edge.from, { type: a.type, edge: edge.id, status: 'pending', config: a })
  }
  throw new StepError('This path has an action the workflow cannot run. Ask a workflow manager to remove it.')
}
```
In `createTask`, change the signature to `(tx: Tx, rec: RecordRow, node: FormNode, ctx: WalkCtx, ev: Ev)`, use `ctx.now` for the due time, and replace the last two lines with:
```ts
  const taskId = await tx.insertTask({ org_id: rec.org_id, record_id: rec.id, node_id: node.id, assignee_role_id: role, assignee_user_id: user, due_at: dueAt })
  const sent = await notifyTask(tx, 'task_assigned', rec, { id: taskId, node_id: node.id, assignee_role_id: role, assignee_user_id: user, claimed_by: null }, ctx)
  await ev('task', node.id, { taskId, role, user, dueAt: dueAt?.toISOString() ?? null, notified: sent.notices, emailed: sent.emails })
```
`resumeOne`:
```ts
export async function resumeOne(tx: Tx, id: string, ctx: { now: Date; appUrl: string }): Promise<'done' | 'skipped' | 'failed' | 'gone'> {
```
with its `walk(…, 'next', { now: ctx.now, actor: null, appUrl: ctx.appUrl })`.

`supabase/functions/advance/pgStore.ts` — imports and the new methods inside the object `pgTx` returns:
```ts
import { MAX_PEOPLE, type MessageRow, type Person, type TemplateRow } from './notify.ts'
```
```ts
const TEMPLATE = ['id', 'org_id', 'kind', 'name', 'channel', 'subject', 'body']
const MESSAGE = ['org_id', 'template_id', 'record_id', 'recipient_user_id', 'recipient_email', 'subject', 'body_html', 'body_text']
const NOTICE = ['org_id', 'user_id', 'kind', 'title', 'body', 'link']
```
```ts
  const person = t`m.user_id as "userId", m.email::text as email, coalesce(nullif(btrim(m.full_name), ''), m.email::text) as name`
  const rows = (r: unknown) => r as Record<string, unknown>[]
```
```ts
    orgName: async (org) => (await one<{ name: string }>(t`select name from orgs where id = ${org}`))?.name ?? '',
    template: (org, ref) => ('id' in ref
      ? one<TemplateRow>(t`select ${t(TEMPLATE)} from message_templates where id = ${ref.id} and org_id = ${org}`)
      : one<TemplateRow>(t`select ${t(TEMPLATE)} from message_templates where org_id = ${org} and kind = ${ref.kind} and is_system`)),
    peopleByIds: async (org, ids) => (ids.length
      ? [...await t<Person[]>`select ${person} from members m where m.org_id = ${org} and m.status = 'active' and m.user_id in ${t(ids)} order by m.email`]
      : []),
    peopleInRole: async (org, role) => [...await t<Person[]>`
      select ${person} from members m join member_roles mr on mr.member_id = m.id
      where m.org_id = ${org} and m.status = 'active' and mr.role_id = ${role} order by m.email limit ${MAX_PEOPLE}`],
    roleName: async (role, org) => (await one<{ name: string }>(t`select name from roles where id = ${role} and org_id = ${org}`))?.name ?? null,
    emailMuted: async (ids, kind) => new Set(ids.length
      ? (await t`select user_id from notification_prefs where type = ${kind} and not email_enabled and user_id in ${t(ids)}`).map((r) => r.user_id as string)
      : []),
    notify: async (r) => { await t`insert into notifications ${t(rows(r), NOTICE)}` },
    queueMessages: async (r) => { await t`insert into messages ${t(rows(r), MESSAGE)}` },
    overdueTasks: async (now, limit) => [...await t<{ id: string; record_id: string }[]>`
      select id, record_id from tasks where status = 'open' and overdue_notified_at is null and due_at <= ${now} order by due_at limit ${limit}`],
    markOverdue: (id, now) => one<TaskRow>(t`
      update tasks set overdue_notified_at = ${now}
      where id = ${id} and status = 'open' and overdue_notified_at is null and due_at <= ${now}
      returning id, org_id, record_id, node_id, assignee_role_id, assignee_user_id, claimed_by, status`),
    dueMessages: async (now, limit) =>
      (await t`select id from messages where status = 'queued' and next_attempt_at <= ${now} order by next_attempt_at limit ${limit}`).map((r) => r.id as string),
    lockMessage: (id, now) => one<MessageRow>(t`
      select id, org_id, recipient_email::text as recipient_email, subject, body_html, body_text, attempts from messages
      where id = ${id} and status = 'queued' and next_attempt_at <= ${now} for update skip locked`),
    finishMessage: async (id, p) => {
      await t`update messages set status = ${p.status}, attempts = ${p.attempts}, error = ${p.error},
        next_attempt_at = coalesce(${p.nextAttemptAt ?? null}::timestamptz, next_attempt_at),
        sent_at = coalesce(${p.sentAt ?? null}::timestamptz, sent_at),
        provider_id = coalesce(${p.providerId ?? null}::text, provider_id)
        where id = ${id}`
    },
```

`supabase/functions/advance/testkit.ts`:
```ts
import type { MessagePatch, NewMessage, NewNotification, TemplateRow } from './notify.ts'
import { ADMIN, F_APPROVAL, F_LEAVE, LEAVE, MEMBER, ROLE_ADMIN, T_APPROVED, WF } from '../_shared/workflow/fixture.ts'
```
`Db` changes and additions:
```ts
  members: { user_id: string; org_id: string; email: string; name: string }[]
  roles: { id: string; org_id: string; name: string }[]
  tasks: (TaskRow & { due_at: Date | null; overdue_notified_at: Date | null })[]
  orgName: string
  templates: TemplateRow[]
  muted: Set<string> // `${userId}:${kind}` pairs with email turned off
  notifications: NewNotification[]
  messages: (NewMessage & { id: string; status: MessagePatch['status']; attempts: number; error: string | null; next_attempt_at: Date; sent_at: Date | null; provider_id: string | null })[]
```
`insertTask` pushes `{ ...row, id: id('task'), claimed_by: null, status: 'open' as const, overdue_notified_at: null }`. New methods in the fake `Tx`:
```ts
        orgName: async () => db.orgName,
        template: async (org, ref) =>
          db.templates.find((x) => x.org_id === org && ('id' in ref ? x.id === ref.id : x.kind === ref.kind && x.kind !== 'custom')) ?? null,
        peopleByIds: async (org, ids) => db.members.filter((m) => m.org_id === org && ids.includes(m.user_id)).map(person),
        peopleInRole: async (org, role) => db.members.filter((m) => m.org_id === org && db.holders.has(`${m.user_id}:${role}`)).map(person),
        roleName: async (role, org) => db.roles.find((r) => r.id === role && r.org_id === org)?.name ?? null,
        emailMuted: async (ids, kind) => new Set(ids.filter((u) => db.muted.has(`${u}:${kind}`))),
        notify: async (rows) => { db.notifications.push(...rows) },
        queueMessages: async (rows) => {
          // next_attempt_at: due at once, like the column default now()
          for (const r of rows) db.messages.push({ ...r, id: id('msg'), status: 'queued', attempts: 0, error: null, next_attempt_at: new Date(0), sent_at: null, provider_id: null })
        },
        overdueTasks: async (now, limit) => db.tasks
          .filter((t) => t.status === 'open' && !t.overdue_notified_at && t.due_at && t.due_at <= now)
          .slice(0, limit).map((t) => ({ id: t.id, record_id: t.record_id })),
        markOverdue: async (tid, now) => {
          await lock(`t:${tid}`)
          await tick()
          const t = db.tasks.find((x) => x.id === tid && x.status === 'open' && !x.overdue_notified_at && x.due_at && x.due_at <= now)
          if (!t) return null
          t.overdue_notified_at = now
          return { ...t }
        },
        dueMessages: async (now, limit) => db.messages.filter((m) => m.status === 'queued' && m.next_attempt_at <= now).slice(0, limit).map((m) => m.id),
        lockMessage: async (mid, now) => {
          await lock(`m:${mid}`)
          const m = db.messages.find((x) => x.id === mid && x.status === 'queued' && x.next_attempt_at <= now)
          return m ? { id: m.id, org_id: m.org_id, recipient_email: m.recipient_email, subject: m.subject, body_html: m.body_html, body_text: m.body_text, attempts: m.attempts } : null
        },
        finishMessage: async (mid, p) => {
          const m = db.messages.find((x) => x.id === mid)
          if (!m) return
          m.status = p.status
          m.attempts = p.attempts
          m.error = p.error
          if (p.nextAttemptAt) m.next_attempt_at = p.nextAttemptAt
          if (p.sentAt) m.sent_at = p.sentAt
          if (p.providerId !== undefined) m.provider_id = p.providerId
        },
```
with, above `fakeStore`:
```ts
const person = (m: Db['members'][number]) => ({ userId: m.user_id, email: m.email, name: m.name })
```
Constants and `setup`:
```ts
export const APP = 'http://localhost:5173/app/'
export const GONE = '00000000-0000-0000-0000-0000000000a9' // never a member

const tpl = (id: string, kind: TemplateRow['kind'], name: string, subject: string, body: string): TemplateRow =>
  ({ id, org_id: ORG, kind, name, channel: 'email', subject, body })
const TEMPLATES: TemplateRow[] = [
  tpl('0000000a-0000-0000-0000-00000000a0e0', 'task_assigned', 'Task assigned', 'New task: {{record.title}}',
    'Hello {{recipient.name}}, "{{record.title}}" needs {{step.assignee.name}}: {{link.task}}'),
  tpl('0000000a-0000-0000-0000-00000000a0e2', 'task_overdue', 'Task overdue', 'Overdue: {{record.title}}', 'Still waiting on {{step.assignee.name}}: {{link.task}}'),
  tpl(T_APPROVED, 'record_approved', 'Record approved', 'Approved: {{record.title}}', '{{step.assignee.name}} approved it. {{link.record}}'),
  tpl('0000000a-0000-0000-0000-00000000a0e3', 'record_rejected', 'Record rejected', 'Rejected: {{record.title}}', 'See {{link.record}}'),
  tpl('0000000a-0000-0000-0000-00000000a0e4', 'invite', 'Invite to org', 'Join {{org.name}}', '{{link.invite}}'),
]
```
In `setup`'s `db`:
```ts
    members: [
      { user_id: MEMBER, org_id: ORG, email: 'member@alpha.test', name: 'member@alpha.test' },
      { user_id: ADMIN, org_id: ORG, email: 'admin@alpha.test', name: 'admin@alpha.test' },
    ],
    roles: [{ id: ROLE_ADMIN, org_id: ORG, name: 'Admin' }],
    orgName: 'Alpha School',
    templates: structuredClone(TEMPLATES),
    muted: new Set(),
    notifications: [], messages: [],
```
`ctx` gains `appUrl: APP`; `resume` calls `resumeOne(tx, sid, { now, appUrl: APP })`.

`supabase/functions/advance/handler.ts`:
```ts
export type Deps = { userId(): Promise<string | null>; store: Store; fileExists(path: string): Promise<boolean>; now(): Date; appUrl: string }
```
```ts
  const ctx = { now: deps.now(), actor, appUrl: deps.appUrl, fileExists: deps.fileExists }
```
`supabase/functions/advance/index.ts`:
```ts
import { readAppUrl } from '../_shared/comms/render.ts'
```
```ts
const appUrl = readAppUrl(Deno.env.get('APP_URL')) // throws at boot: links in messages must be right before anything is queued
```
and pass `appUrl` in the `advance(body, { … })` deps. `handler.test.ts` `deps(…)` and `race.test.ts` `ctx(…)` gain `appUrl: 'http://localhost:5173/app/'`.

`supabase/functions/resume/handler.ts`:
```ts
export type Deps = { authorised: boolean; store: Store; now(): Date; appUrl: string }
```
```ts
      const r = await deps.store.tx((tx) => resumeOne(tx, id, { now, appUrl: deps.appUrl }))
```
`resume/index.ts` reads `const appUrl = readAppUrl(Deno.env.get('APP_URL'))` at the top and passes it; `resume/handler.test.ts` passes `appUrl: APP` (import `APP` from `../advance/testkit.ts`) in all three calls.

`supabase/functions/.env.example`:
```
# Copy to .env.local (git-ignored) for `supabase functions serve --env-file supabase/functions/.env.local`.
CRON_SECRET=
APP_URL=http://localhost:5173/app/
EMAIL_TRANSPORT=mailpit
EMAIL_FROM=ReportNoReport <noreply@reportnoreport.local>
MAILPIT_URL=http://host.docker.internal:54324
# Only with EMAIL_TRANSPORT=resend (hosted): a Resend API key, set as a function secret, never committed.
RESEND_API_KEY=
```

- [ ] **Step 4: Run — expect PASS**

Run: `DENO_NO_PACKAGE_JSON=1 deno test supabase/functions`
Expected: `ok | 121 passed | 0 failed | 2 ignored` (115 + 6 new engine tests; the Phase 3 race test and the Realtime test are ignored without their variables).

Run (local database, seed loaded): `RNR_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres DENO_NO_PACKAGE_JSON=1 deno test --allow-env --allow-net supabase/functions/advance/race.test.ts`
Expected: `ok | 1 passed` — the real `pgStore` now queues Task assigned and the Record approved message inside the locked transaction.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/advance/notify.ts supabase/functions/advance/engine.ts supabase/functions/advance/pgStore.ts supabase/functions/advance/testkit.ts supabase/functions/advance/engine.test.ts supabase/functions/advance/handler.ts supabase/functions/advance/index.ts supabase/functions/advance/handler.test.ts supabase/functions/advance/race.test.ts supabase/functions/resume/handler.ts supabase/functions/resume/index.ts supabase/functions/resume/handler.test.ts supabase/functions/.env.example deno.lock
git commit -m "feat: notify task holders and send workflow messages from the engine"
```

---

### Task 4: Edge Function `send-messages` — queue worker, transports, overdue

**Owner:** Backend engineer · **Depends on:** Task 3

**Files:**
- Create: `supabase/functions/send-messages/transport.ts`, `supabase/functions/send-messages/handler.ts`, `supabase/functions/send-messages/index.ts`
- Test: `supabase/functions/send-messages/transport.test.ts`, `supabase/functions/send-messages/handler.test.ts`, `supabase/functions/send-messages/race.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `Store`, `Tx` (`overdueTasks`, `markOverdue`, `lockRecord`, `dueMessages`, `lockMessage`, `finishMessage`), `Result` (Task 3 / Phase 3); `notifyTask` (Task 3); `readAppUrl` (Task 2); `pgStore` (Phase 3 + Task 3); the `send-messages` cron job and Vault secret (Task 1).
- Produces:
  - `transport.ts`: `type Mail = { id: string; to: string; subject: string; html: string; text: string }`, `type SendResult = { ok: true; providerId: string | null } | { ok: false; retry: boolean; error: string }`, `type Transport = { send(m: Mail): Promise<SendResult> }`, `resendTransport(key: string, from: string, f?: typeof fetch): Transport`, `mailpitTransport(base: string, from: string, f?: typeof fetch): Transport`, `transportFromEnv(env: (k: string) => string | undefined, f?: typeof fetch): Transport` (throws)
  - `handler.ts`: `type Deps = { authorised: boolean; store: Store; transport: Transport; now(): Date; appUrl: string }`, `MAX_ATTEMPTS = 4`, `backoffMs(attempts: number): number`, `sendMessages(deps: Deps): Promise<Result>` → `200 { overdue, sent, retrying, failed }` or `401`
  - HTTP: `POST /functions/v1/send-messages` with `Authorization: Bearer <CRON_SECRET>`; `verify_jwt = false`; `405` for other methods

- [ ] **Step 1: Write the failing tests** — `supabase/functions/send-messages/transport.test.ts`

```ts
import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { mailpitTransport, resendTransport, transportFromEnv } from './transport.ts'

const KEY = 're_test_0123456789abcdefABCDEF'
const FROM = 'ReportNoReport <noreply@reportnoreport.com>'
const mail = { id: '00000000-0000-4000-8000-000000000001', to: 'ada@example.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' }
type Call = { url: string; init: RequestInit }
const fake = (status: number, body: unknown, calls: Call[] = []) => {
  const f = (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init! }); return Promise.resolve(new Response(JSON.stringify(body), { status })) }
  return f as typeof fetch
}

Deno.test('resend: posts the message with the key and an idempotency key per message', async () => {
  const calls: Call[] = []
  const res = await resendTransport(KEY, FROM, fake(200, { id: 'rs_1' }, calls)).send(mail)
  assertEquals(res, { ok: true, providerId: 'rs_1' })
  assertEquals(calls[0].url, 'https://api.resend.com/emails')
  const h = new Headers(calls[0].init.headers)
  assertEquals([h.get('authorization'), h.get('idempotency-key')], [`Bearer ${KEY}`, mail.id])
  assertEquals(JSON.parse(String(calls[0].init.body)), { from: FROM, to: ['ada@example.com'], subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' })
})
Deno.test('resend: 429 and 5xx are retryable; other refusals are final; errors never echo the key', async () => {
  assertEquals(await resendTransport(KEY, FROM, fake(429, { message: 'Too many requests' })).send(mail),
    { ok: false, retry: true, error: 'The email service refused this message: Too many requests' })
  assertEquals((await resendTransport(KEY, FROM, fake(503, {})).send(mail)), { ok: false, retry: true, error: 'The email service refused this message: HTTP 503' })
  const final = await resendTransport(KEY, FROM, fake(422, { message: 'Invalid `to` field.' })).send(mail)
  assertEquals(final, { ok: false, retry: false, error: 'The email service refused this message: Invalid `to` field.' })
})
Deno.test('mailpit: posts to the send API in Mailpit\'s shape', async () => {
  const calls: Call[] = []
  const res = await mailpitTransport('http://host.docker.internal:54324/', FROM, fake(200, { ID: 'mp_1' }, calls)).send(mail)
  assertEquals(res, { ok: true, providerId: 'mp_1' })
  assertEquals(calls[0].url, 'http://host.docker.internal:54324/api/v1/send')
  assertEquals(JSON.parse(String(calls[0].init.body)), {
    From: { Email: 'noreply@reportnoreport.com', Name: 'ReportNoReport' }, To: [{ Email: 'ada@example.com' }], Subject: 'Hi', HTML: '<p>Hi</p>', Text: 'Hi',
  })
})
Deno.test('configuration is checked at boot and a bad value stops the function', () => {
  const env = (vars: Record<string, string>) => (k: string) => vars[k]
  assertEquals(typeof transportFromEnv(env({ EMAIL_TRANSPORT: 'mailpit', EMAIL_FROM: FROM })).send, 'function')
  assertEquals(typeof transportFromEnv(env({ EMAIL_TRANSPORT: 'resend', EMAIL_FROM: FROM, RESEND_API_KEY: KEY })).send, 'function')
  assertThrows(() => transportFromEnv(env({ EMAIL_FROM: FROM })), Error, 'EMAIL_TRANSPORT must be "resend" or "mailpit".')
  assertThrows(() => transportFromEnv(env({ EMAIL_TRANSPORT: 'mailpit', EMAIL_FROM: 'not an address' })), Error, 'EMAIL_FROM')
  assertThrows(() => transportFromEnv(env({ EMAIL_TRANSPORT: 'resend', EMAIL_FROM: FROM })), Error, 'RESEND_API_KEY is missing or malformed.')
  const err = assertThrows(() => transportFromEnv(env({ EMAIL_TRANSPORT: 'resend', EMAIL_FROM: FROM, RESEND_API_KEY: 'sk_live_secret' })))
  assertEquals((err as Error).message.includes('sk_live_secret'), false)
})
```

`supabase/functions/send-messages/handler.test.ts`:
```ts
import { assertEquals } from 'jsr:@std/assert@1'
import { backoffMs, sendMessages, type Deps } from './handler.ts'
import type { Mail, SendResult, Transport } from './transport.ts'
import { APP, setup } from '../advance/testkit.ts'
import { ADMIN } from '../_shared/workflow/fixture.ts'

const T0 = new Date('2026-10-11T12:00:00Z') // the testkit's NOW: Task assigned is queued at start
const at = (ms: number) => new Date(T0.getTime() + ms)
const MIN = 60_000

function transport(results: (SendResult | Error)[]) {
  const sent: Mail[] = []
  const t: Transport = {
    send: (m) => {
      sent.push(m)
      const r = results.length > 1 ? results.shift()! : results[0]
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r)
    },
  }
  return { t, sent }
}
const run = (store: Deps['store'], t: Transport, now: Date, authorised = true) =>
  sendMessages({ authorised, store, transport: t, now: () => now, appUrl: APP })

Deno.test('401 without the cron secret, and nothing is sent', async () => {
  const s = setup()
  await s.start()
  const { t, sent } = transport([{ ok: true, providerId: 'x' }])
  assertEquals((await run(s.store, t, T0, false)).status, 401)
  assertEquals([sent.length, s.db.messages[0].status], [0, 'queued'])
})
Deno.test('sends a queued message and records it as sent', async () => {
  const s = setup()
  await s.start()
  const { t, sent } = transport([{ ok: true, providerId: 'rs_1' }])
  const res = await run(s.store, t, T0)
  assertEquals(res.body, { overdue: 0, sent: 1, retrying: 0, failed: 0 })
  assertEquals(sent.map((m) => [m.id, m.to, m.subject]), [[s.db.messages[0].id, 'admin@alpha.test', 'New task: Leave approval: Ada']])
  const m = s.db.messages[0]
  assertEquals([m.status, m.attempts, m.error, m.provider_id, m.sent_at?.toISOString()], ['sent', 1, null, 'rs_1', T0.toISOString()])
  assertEquals((await run(s.store, t, at(MIN))).body, { overdue: 0, sent: 0, retrying: 0, failed: 0 }) // never sent twice
})
Deno.test('a failing send retries after 1, 2 and 4 minutes, then fails with the error', async () => {
  const s = setup()
  await s.start()
  const { t, sent } = transport([{ ok: false, retry: true, error: 'The email service refused this message: HTTP 503' }])
  const m = s.db.messages[0]
  assertEquals((await run(s.store, t, T0)).body, { overdue: 0, sent: 0, retrying: 1, failed: 0 })
  assertEquals([m.status, m.attempts, m.next_attempt_at.toISOString()], ['queued', 1, at(MIN).toISOString()])
  assertEquals((await run(s.store, t, at(MIN - 1))).body.retrying, 0) // not due yet
  await run(s.store, t, at(MIN))
  assertEquals([m.attempts, m.next_attempt_at.toISOString()], [2, at(3 * MIN).toISOString()])
  await run(s.store, t, at(3 * MIN))
  assertEquals([m.attempts, m.next_attempt_at.toISOString()], [3, at(7 * MIN).toISOString()])
  assertEquals((await run(s.store, t, at(7 * MIN))).body, { overdue: 0, sent: 0, retrying: 0, failed: 1 })
  assertEquals([m.status, m.attempts, m.error], ['failed', 4, 'The email service refused this message: HTTP 503'])
  assertEquals(sent.length, 4)
  assertEquals((await run(s.store, t, at(60 * MIN))).body.failed, 0) // a failed row is left for a person to retry
  assertEquals([backoffMs(1), backoffMs(2), backoffMs(3)], [MIN, 2 * MIN, 4 * MIN])
})
Deno.test('a refusal that can never succeed fails at once', async () => {
  const s = setup()
  await s.start()
  const { t } = transport([{ ok: false, retry: false, error: 'The email service refused this message: Invalid `to` field.' }])
  assertEquals((await run(s.store, t, T0)).body.failed, 1)
  assertEquals([s.db.messages[0].status, s.db.messages[0].attempts], ['failed', 1])
})
Deno.test('a thrown transport error is retried, and a later success clears the error', async () => {
  const s = setup()
  await s.start()
  const { t } = transport([new Error('connection reset'), { ok: true, providerId: 'rs_2' }])
  await run(s.store, t, T0)
  assertEquals([s.db.messages[0].status, s.db.messages[0].error], ['queued', 'Could not reach the email service: connection reset'])
  await run(s.store, t, at(MIN))
  assertEquals([s.db.messages[0].status, s.db.messages[0].attempts, s.db.messages[0].error], ['sent', 2, null])
})
Deno.test('two overlapping runs send Task overdue once per task', async () => {
  const s = setup()
  await s.start() // the approval task is due two days after T0
  const { t } = transport([{ ok: true, providerId: 'x' }])
  const late = at(3 * 24 * 60 * MIN)
  const both = await Promise.all([run(s.store, t, late), run(s.store, t, late)])
  assertEquals(both.map((r) => r.body.overdue).sort(), [0, 1])
  assertEquals(s.db.notifications.filter((n) => n.kind === 'task_overdue').map((n) => [n.user_id, n.link]), [[ADMIN, `#/tasks/${s.db.tasks[0].id}`]])
  assertEquals(s.db.messages.filter((m) => m.subject.startsWith('Overdue:')).length, 1)
  assertEquals(s.db.tasks[0].overdue_notified_at?.toISOString(), late.toISOString())
  assertEquals((await run(s.store, t, at(4 * 24 * 60 * MIN))).body.overdue, 0)
})
Deno.test('tasks that are done or not yet due get no overdue notice', async () => {
  const early = setup()
  await early.start()
  const { t } = transport([{ ok: true, providerId: 'x' }])
  assertEquals((await run(early.store, t, at(MIN))).body.overdue, 0)
  const done = setup()
  await done.start()
  done.claim()
  await done.act(done.db.tasks[0].id, 'approved')
  assertEquals((await run(done.store, t, at(3 * 24 * 60 * MIN))).body.overdue, 0)
  assertEquals(done.db.notifications.filter((n) => n.kind === 'task_overdue').length, 0)
})
```

`supabase/functions/send-messages/race.test.ts`:
```ts
import { assertEquals } from 'jsr:@std/assert@1'
import postgres from 'npm:postgres@3.4.5'
import { startRecord } from '../advance/engine.ts'
import { pgStore } from '../advance/pgStore.ts'
import { sendMessages } from './handler.ts'
import { VALID } from '../_shared/forms/fixture.ts'
import { MEMBER, WF } from '../_shared/workflow/fixture.ts'

const url = Deno.permissions.querySync({ name: 'env', variable: 'RNR_TEST_DB_URL' }).state === 'granted'
  ? Deno.env.get('RNR_TEST_DB_URL')
  : undefined
const APP = 'http://localhost:5173/app/'

Deno.test({
  name: 'real Postgres: two overlapping runs notify an overdue task once',
  ignore: !url,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const store = pgStore(url!)
    const sql = postgres(url!, { max: 1 })
    const transport = { send: () => Promise.resolve({ ok: true as const, providerId: null }) }
    try {
      const started = await store.tx((tx) => startRecord(tx, { workflowId: WF, answers: VALID }, { now: new Date(), actor: MEMBER, appUrl: APP, fileExists: () => Promise.resolve(true) }))
      assertEquals(started.status, 200)
      const recordId = started.body.recordId as string
      const [task] = await sql`update tasks set due_at = now() - interval '1 hour' where record_id = ${recordId} and status = 'open' returning id`
      const deps = { authorised: true, store, transport, now: () => new Date(), appUrl: APP }
      await Promise.all([sendMessages(deps), sendMessages(deps)])
      const [row] = await sql`select
        (select count(*)::int from notifications where kind = 'task_overdue' and link = ${`#/tasks/${task.id}`}) as notices,
        (select count(*)::int from messages where record_id = ${recordId} and subject like 'Overdue:%') as emails,
        (select count(*)::int from tasks where id = ${task.id} and overdue_notified_at is not null) as marked`
      assertEquals([row.notices, row.emails, row.marked], [1, 1, 1])
      await sql`delete from notifications where link in (${`#/tasks/${task.id}`}, ${`#/records/${recordId}`})`
      await sql`delete from records where id = ${recordId}`
    } finally {
      await store.end()
      await sql.end()
    }
  },
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `DENO_NO_PACKAGE_JSON=1 deno test supabase/functions/send-messages`
Expected: `Module not found "…/send-messages/transport.ts"`.

- [ ] **Step 3: Implement** — `supabase/functions/send-messages/transport.ts`

```ts
export type Mail = { id: string; to: string; subject: string; html: string; text: string }
export type SendResult = { ok: true; providerId: string | null } | { ok: false; retry: boolean; error: string }
export type Transport = { send(m: Mail): Promise<SendResult> }

const RESEND_KEY = /^re_[A-Za-z0-9_]{16,}$/
const FROM = /^(?:([^<>\r\n"]{1,80}) )?<?([^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)>?$/
const reason = (body: unknown, status: number) =>
  body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string' ? (body as { message: string }).message : `HTTP ${status}`

function splitFrom(from: string) {
  const m = FROM.exec(from)
  if (!m) throw new Error('EMAIL_FROM must be an address such as "ReportNoReport <noreply@reportnoreport.com>".')
  return { name: m[1] ?? '', email: m[2] }
}

export function resendTransport(key: string, from: string, f: typeof fetch = fetch): Transport {
  return {
    async send(m) {
      const res = await f('https://api.resend.com/emails', {
        method: 'POST',
        // The message id makes a resend after a crash a no-op on Resend's side.
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': m.id },
        body: JSON.stringify({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok) return { ok: true, providerId: typeof body?.id === 'string' ? body.id : null }
      return { ok: false, retry: res.status === 429 || res.status >= 500, error: `The email service refused this message: ${reason(body, res.status)}` }
    },
  }
}

export function mailpitTransport(base: string, from: string, f: typeof fetch = fetch): Transport {
  const sender = splitFrom(from)
  return {
    async send(m) {
      const res = await f(`${base.replace(/\/+$/, '')}/api/v1/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ From: { Email: sender.email, Name: sender.name }, To: [{ Email: m.to }], Subject: m.subject, HTML: m.html, Text: m.text }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok) return { ok: true, providerId: typeof body?.ID === 'string' ? body.ID : null }
      return { ok: false, retry: res.status >= 500, error: `Mailpit refused this message: ${reason(body, res.status)}` }
    },
  }
}

/** Read once when the function boots: a missing or malformed setting throws before any message is touched. */
export function transportFromEnv(env: (k: string) => string | undefined, f: typeof fetch = fetch): Transport {
  const from = env('EMAIL_FROM') ?? ''
  splitFrom(from)
  const kind = env('EMAIL_TRANSPORT')
  if (kind === 'resend') {
    const key = env('RESEND_API_KEY') ?? ''
    if (!RESEND_KEY.test(key)) throw new Error('RESEND_API_KEY is missing or malformed.')
    return resendTransport(key, from, f)
  }
  if (kind === 'mailpit') return mailpitTransport(env('MAILPIT_URL') ?? 'http://host.docker.internal:54324', from, f)
  throw new Error('EMAIL_TRANSPORT must be "resend" or "mailpit".')
}
```

`supabase/functions/send-messages/handler.ts`:
```ts
import { notifyTask } from '../advance/notify.ts'
import type { Result, Store, Tx } from '../advance/engine.ts'
import type { SendResult, Transport } from './transport.ts'

export type Deps = { authorised: boolean; store: Store; transport: Transport; now(): Date; appUrl: string }
type Outcome = 'sent' | 'retrying' | 'failed'

export const MAX_ATTEMPTS = 4 // the first try plus 3 retries (spec §8)
/** 1, 2, then 4 minutes after the 1st, 2nd and 3rd failure. */
export const backoffMs = (attempts: number) => 60_000 * 2 ** (attempts - 1)
const BATCH = 50 // shortcut: 50 overdue tasks and 50 emails a minute; loop until empty or raise when an org sends more

/** Called by pg_cron every minute: overdue reminders first (they queue mail), then the queue. One transaction per item. */
export async function sendMessages(deps: Deps): Promise<Result> {
  if (!deps.authorised) return { status: 401, body: { error: 'Not allowed.' } }
  const now = deps.now()
  const counts = { overdue: await queueOverdue(deps, now), sent: 0, retrying: 0, failed: 0 }
  const ids = await deps.store.tx((tx) => tx.dueMessages(now, BATCH))
  for (const id of ids) {
    const r = await deps.store.tx((tx) => sendOne(tx, id, deps.transport, now))
    if (r) counts[r] += 1
  }
  return { status: 200, body: counts }
}

/**
 * Record lock first, then the task row: the order advance uses, so the two never deadlock. markOverdue's UPDATE re-checks
 * overdue_notified_at under the row lock, so an overlapping run gets no row and sends nothing. A failure rolls back the
 * mark with the notice, and the next minute tries again.
 */
async function queueOverdue(deps: Deps, now: Date): Promise<number> {
  const due = await deps.store.tx((tx) => tx.overdueTasks(now, BATCH))
  let n = 0
  for (const { id, record_id } of due) {
    try {
      const marked = await deps.store.tx(async (tx) => {
        const rec = await tx.lockRecord(record_id)
        const task = await tx.markOverdue(id, now)
        if (!task) return false
        if (rec?.status === 'open') await notifyTask(tx, 'task_overdue', rec, task, { now, appUrl: deps.appUrl })
        return true
      })
      if (marked) n += 1
    } catch (e) {
      console.error('overdue notice failed, retrying next run', id, e)
    }
  }
  return n
}

async function sendOne(tx: Tx, id: string, transport: Transport, now: Date): Promise<Outcome | null> {
  const m = await tx.lockMessage(id, now)
  if (!m) return null // another run has it, or it is no longer due
  const attempts = m.attempts + 1
  let res: SendResult
  try {
    res = await transport.send({ id: m.id, to: m.recipient_email, subject: m.subject, html: m.body_html, text: m.body_text })
  } catch (e) {
    res = { ok: false, retry: true, error: `Could not reach the email service: ${e instanceof Error ? e.message : String(e)}` }
  }
  if (res.ok) {
    await tx.finishMessage(id, { status: 'sent', attempts, error: null, sentAt: now, providerId: res.providerId })
    return 'sent'
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

`supabase/functions/send-messages/index.ts`:
```ts
import { sendMessages } from './handler.ts'
import { transportFromEnv } from './transport.ts'
import { pgStore } from '../advance/pgStore.ts'
import { readAppUrl } from '../_shared/comms/render.ts'

// Both throw at boot on a missing or malformed setting (spec §8: the key is read from env and validated at startup).
const transport = transportFromEnv((k) => Deno.env.get(k))
const appUrl = readAppUrl(Deno.env.get('APP_URL'))
const store = pgStore(Deno.env.get('SUPABASE_DB_URL')!)
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  const secret = Deno.env.get('CRON_SECRET') ?? ''
  try {
    const authorised = secret.length >= 16 && req.headers.get('Authorization') === `Bearer ${secret}`
    const res = await sendMessages({ authorised, store, transport, now: () => new Date(), appUrl })
    return json(res.status, res.body)
  } catch (e) {
    console.error('send-messages failed', e)
    return json(500, { error: 'Sending failed.' })
  }
})
```

- [ ] **Step 4: Run — expect PASS**

Run: `DENO_NO_PACKAGE_JSON=1 deno test supabase/functions`
Expected: `ok | 132 passed | 0 failed | 3 ignored` (121 + 4 transport + 7 handler; the new race test is ignored without `RNR_TEST_DB_URL`).

Run: `RNR_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres DENO_NO_PACKAGE_JSON=1 deno test --allow-env --allow-net supabase/functions/send-messages/race.test.ts`
Expected: `ok | 1 passed`.

- [ ] **Step 5: Check the local transport end to end**

```bash
curl -s http://127.0.0.1:54324/api/v1/info            # Mailpit answers with its version (the send API needs v1.16 or later)
supabase functions serve --env-file supabase/functions/.env.local &
curl -s -X POST http://127.0.0.1:54321/functions/v1/send-messages -H 'Authorization: Bearer local-cron-secret'
```
Expected: the first call prints JSON with `"Version"`; the last prints `{"overdue":0,"sent":0,"retrying":0,"failed":0}` (or the counts of what the seed queued). With `EMAIL_TRANSPORT` removed from `.env.local`, the function fails to boot and the call returns a 5xx with the boot error in the serve log.

- [ ] **Step 6: README** — in `README.md`, replace the `echo 'CRON_SECRET=…'` line in "Run locally" with:
```bash
cp supabase/functions/.env.example supabase/functions/.env.local   # once; set CRON_SECRET=local-cron-secret (matches seed.sql)
```
and replace the function list comment with `# invite-member, submit-form, advance, resume, save-workflow, send-messages`. Add after the seed users paragraph:
```markdown
Email: every email is a queued `messages` row. `send-messages` (pg_cron, every minute) sends it through Mailpit locally (`EMAIL_TRANSPORT=mailpit`; read it at http://127.0.0.1:54324) and Resend when hosted. No Resend key is needed locally or for tests.
```
Add to "Tests":
```markdown
- `RNR_TEST_DB_URL=… deno test --allow-env --allow-net supabase/functions/send-messages/race.test.ts` — two overlapping cron runs remind an overdue task once
- `RNR_TEST_SUPABASE_URL=http://127.0.0.1:54321 RNR_TEST_ANON_KEY=<anon key> RNR_TEST_DB_URL=… deno test --allow-env --allow-net supabase/functions/_integration/realtime.test.ts` — Realtime sends a user only their own notifications
```
Replace the "Hosted projects" sentence with:
```markdown
Hosted projects: set the function secrets `CRON_SECRET` (16+ characters), `APP_URL` (`https://reportnoreport.com/app/`), `EMAIL_TRANSPORT=resend`, `EMAIL_FROM` (a sender on a domain verified in Resend) and `RESEND_API_KEY`, and create the Vault secrets `resume_url` (`https://<ref>.supabase.co/functions/v1/resume`), `send_messages_url` (`https://<ref>.supabase.co/functions/v1/send-messages`) and `cron_secret` (same value as `CRON_SECRET`). A missing or malformed email setting stops `send-messages` at boot.
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/send-messages/transport.ts supabase/functions/send-messages/transport.test.ts supabase/functions/send-messages/handler.ts supabase/functions/send-messages/handler.test.ts supabase/functions/send-messages/race.test.ts supabase/functions/send-messages/index.ts README.md
git commit -m "feat: add send-messages worker with retries, overdue reminders and Resend/Mailpit transports"
```

---

### Task 5: Invites through the queue

**Owner:** Backend engineer · **Depends on:** Tasks 2, 4

**Files:**
- Create: `supabase/functions/invite-member/message.ts`
- Test: `supabase/functions/invite-member/message.test.ts`
- Modify: `supabase/functions/invite-member/index.ts`

**Interfaces:**
- Consumes: `render`, `readAppUrl` (Task 2); the `invite` system template and `messages` (Task 1); `claimInvite`, `validateInvite` (Phase 1).
- Produces: `inviteMessage(t: { id: string; subject: string; body: string }, input: { orgId: string; orgName: string; email: string; appUrl: string }): NewMessage` (`NewMessage` from `../advance/notify.ts`). `invite-member` answers as before (`200 { memberId, status: 'invited' | 'existing' }`, `400`, `403`, `500 "Could not send the invite email."`).

- [ ] **Step 1: Write the failing test** — `supabase/functions/invite-member/message.test.ts`

```ts
import { assertEquals } from 'jsr:@std/assert@1'
import { inviteMessage } from './message.ts'

const T = { id: '0000000a-0000-0000-0000-00000000a0e4', subject: 'You are invited to join {{org.name}}', body: 'Join {{org.name}}: {{link.invite}}' }
const APP = 'http://localhost:5173/app/'

Deno.test('the invite links to the app sign-in page and carries no token', () => {
  const m = inviteMessage(T, { orgId: 'org-1', orgName: 'Alpha School', email: 'new@alpha.test', appUrl: APP })
  assertEquals(m, {
    org_id: 'org-1', template_id: T.id, record_id: null, recipient_user_id: null, recipient_email: 'new@alpha.test',
    subject: 'You are invited to join Alpha School',
    body_html: `<p>Join Alpha School: <a href="${APP}">${APP}</a></p>`,
    body_text: `Join Alpha School: ${APP}`,
  })
})
Deno.test('the org name in an invite is escaped', () => {
  const m = inviteMessage(T, { orgId: 'org-1', orgName: '<img src=x onerror=alert(1)> & Co', email: 'new@alpha.test', appUrl: APP })
  assertEquals(m.body_html, `<p>Join &lt;img src=x onerror=alert(1)&gt; &amp; Co: <a href="${APP}">${APP}</a></p>`)
  assertEquals(m.subject, 'You are invited to join <img src=x onerror=alert(1)> & Co')
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `DENO_NO_PACKAGE_JSON=1 deno test supabase/functions/invite-member`
Expected: `Module not found "…/invite-member/message.ts"`.

- [ ] **Step 3: Implement** — `supabase/functions/invite-member/message.ts`

```ts
import { render } from '../_shared/comms/render.ts'
import type { NewMessage } from '../advance/notify.ts'

/**
 * The "Invite to org" email. It links to the app's sign-in page: signing in or signing up with the invited address runs
 * accept_invites(), so no auth token is stored in `messages`, which every comms.manage holder can read.
 */
export function inviteMessage(t: { id: string; subject: string; body: string }, input: { orgId: string; orgName: string; email: string; appUrl: string }): NewMessage {
  const r = render(t, {
    record: { title: '', data: {} },
    step: { assignee: { name: '' } },
    link: { task: '', record: '', invite: input.appUrl },
    org: { name: input.orgName },
    recipient: { name: input.email },
  })
  return {
    org_id: input.orgId, template_id: t.id, record_id: null, recipient_user_id: null, recipient_email: input.email,
    subject: r.subject || 'You are invited', body_html: r.html, body_text: r.text,
  }
}
```

`supabase/functions/invite-member/index.ts` — imports and boot check:
```ts
import { inviteMessage } from './message.ts'
import { readAppUrl } from '../_shared/comms/render.ts'

const appUrl = readAppUrl(Deno.env.get('APP_URL')) // throws at boot
```
Replace the block from `const { error: mailError } = await admin.auth.admin.inviteUserByEmail(…)` to the closing `}` of its `if` with:
```ts
  // Invites go through the queue with the org's editable "Invite to org" template; always email, whatever its channel.
  const [{ data: tpl }, { data: org }] = await Promise.all([
    admin.from('message_templates').select('id, subject, body').eq('org_id', orgId).eq('kind', 'invite').eq('is_system', true).maybeSingle(),
    admin.from('orgs').select('name').eq('id', orgId).maybeSingle(),
  ])
  const { error: queueError } = tpl && org
    ? await admin.from('messages').insert(inviteMessage(tpl, { orgId, orgName: org.name, email, appUrl }))
    : { error: new Error('invite template missing') }
  if (queueError) {
    await admin.from('members').delete().eq('id', member.id)
    return json(500, { error: 'Could not send the invite email.' })
  }
```

- [ ] **Step 4: Run — expect PASS**

Run: `DENO_NO_PACKAGE_JSON=1 deno test supabase/functions`
Expected: `ok | 134 passed | 0 failed | 3 ignored`.

Run (stack up, functions served): as `owner@alpha.test` in the app, invite `new@alpha.test` → within a minute Mailpit shows "You are invited to join Alpha School" with a link to `http://localhost:5173/app/`; signing up there with `new@alpha.test` lands in Alpha School.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/invite-member/message.ts supabase/functions/invite-member/message.test.ts supabase/functions/invite-member/index.ts
git commit -m "feat: send invites through the message queue with the Invite to org template"
```

---

### Task 6: Design spec for Phase 4 screens

**Owner:** Senior Designer · **Depends on:** — (must be committed before Task 7 starts)

**Files:**
- Create: `docs/superpowers/design/phase-4-screens.md`

**Interfaces:**
- Consumes: `design/README.md`, `design/tokens.css`, `design/components/*` (Button, Field, Dialog, DataTable, Badge, Menu, Segmented, Icon), `docs/superpowers/design/phase-1-screens.md`–`phase-3-screens.md` §0 (still apply), this plan's Tasks 7, 8 and 10 code, and the Phase 3 side panel (`src/workflows/canvas/SidePanel.tsx`).
- Produces: the spec the frontend engineer follows in Tasks 7, 8 and 10 wherever it differs from this plan's markup or copy.

- [ ] **Step 1: Write the spec** in the format of `phase-3-screens.md` (tables, exact classes/tokens, "DD" where the system is silent), with these sections:
  1. Global additions: nav order and visibility (Templates and Messages for `comms.manage`, after Workflows; which item is current for `#/templates/<id>`), the header's right side (bell, Settings link, Sign out) at desktop and at 375px, page widths, message status words as `rnr-status` (`queued` "Queued", `sent` "Sent", `failed` "Failed", never colour alone), channel words ("Email", "In-app"), the "System" mark for system templates (`rnr-chip`), date/time format (en-GB `whenText`).
  2. Bell and dropdown: the icon button (`rnr-icon-btn`, `BellIcon`, 44px touch target), the unread count (`rnr-chip` + `rnr-num`, "99+" cap, hidden at 0; the accessible name "Notifications, 3 unread"), the panel (`rnr-menu` surface, width, max height with internal scroll, position at desktop and full-width at 375px), each item (title, time, unread mark that is not colour alone, link target), "Mark all as read", the empty state ("No notifications yet."), Esc / outside click / focus return to the bell, the polite live announcement when a new notification arrives.
  3. Settings: the page title, the "Email notifications" fieldset with one `rnr-check` per type (`KIND_LABELS` minus Invite), the explanation that in-app notifications always arrive, save-per-toggle with a status line, errors.
  4. Templates list: columns (name, channel, System mark, last updated), New template, per-row Edit and Delete (no Delete for system templates), the delete confirmation copy, empty state for custom templates.
  5. Template editor: Name, Channel (`rnr-seg`), Subject, Body (textarea, rows, monospace or not), the "Insert variable" menu (`rnr-menu`: the seven variables with label + hint, then "Answer from the record" listing the chosen preview record's answer keys), where the token is inserted (the field that last had focus, at the caret), the unknown-variable warning, the preview panel (record picker, rendered subject + plain-text body, the note that links are filled in when sent), Save / saved / conflict states, the unsaved-changes dialog, delete for custom templates.
  6. Send message action in the workflow side panel: the template select (with a "Manage templates" link for `comms.manage`), the recipient list (one row per recipient with its kind and target and a Remove button), the add-recipient control (kind select then target select, two steps like Add action), copy for each kind (Role, Person, Record starter, Person who completed a step, Email from an answer), the publish issues as they read in the panel.
  7. Messages page: filter (`rnr-seg`: All / Failed / Queued / Sent), table columns (to, subject, status with attempts, last error, time), the Retry button on failed rows, the "Retried. It will be sent within a minute." status line, the empty states per filter, 375px (table scrolls inside its card, first column sticky).
  8. Record timeline sentences for sent messages ("Sent “Record approved” to 2 people", with skipped counts) and old pending ones.
  9. Copy table for every new string, and an accessibility summary (bell keyboard path, focus after retry/delete/save, live regions, 44px targets, 375px with no page-level horizontal scroll).
  10. Conflicts with Tasks 7, 8 and 10 and the corrections the frontend must make.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/design/phase-4-screens.md
git commit -m "docs: add phase 4 screen design spec"
```

---

### Task 7: Frontend — data layer, routes, nav, bell, notification settings

**Owner:** Frontend engineer · **Depends on:** Tasks 1, 2, 6

**Files:**
- Create: `src/comms/NotificationBell.tsx`, `src/comms/SettingsPage.tsx`
- Modify: `src/comms/api.ts`, `src/rbac/route.ts`, `src/rbac/route.test.ts`, `src/ui/errors.ts`, `src/ui/errors.test.ts`, `src/ui/icons.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `useOrg()` (`orgId`, `userId`, `can`), `supabase` (incl. `channel(...).on('postgres_changes', …)`), `friendlyError`, `useNotice`, `Skeleton`, `When`; `MUTABLE_KINDS`, `KIND_LABELS` (Task 2 via `src/comms/logic.ts`); tables and RLS from Task 1.
- Produces:
  - `type Route = … | { page: 'templates' | 'messages' | 'settings' } | { page: 'template'; id: string }`; hashes `#/templates`, `#/templates/<id>`, `#/messages`, `#/settings`
  - `type Perms = { roles: boolean; forms: boolean; workflows: boolean; comms: boolean }`; templates and messages pages fall back to `#/inbox` without `comms.manage`
  - `src/comms/api.ts`: `type Notification`, `NOTIFICATION_LIMIT = 20`, `useNotifications(orgId, userId)`, `useUnreadCount(orgId, userId)`, `useNotificationFeed(orgId, userId): void`, `markRead(id: string)`, `markAllRead(orgId: string, userId: string)`, `usePrefs(userId)`, `setEmailPref(userId: string, type: MutableKind, enabled: boolean)`
  - `NotificationBell()`, `SettingsPage()`, `BellIcon`

- [ ] **Step 1: Write the failing tests**

`src/rbac/route.test.ts` — change `all` / `none` and add:
```ts
const all = { roles: true, forms: true, workflows: true, comms: true }
const none = { roles: false, forms: false, workflows: false, comms: false }

test('parses templates, messages and settings pages; comms pages need comms.manage', () => {
  assert.deepEqual(parseRoute('#/templates'), { page: 'templates' })
  assert.deepEqual(parseRoute(`#/templates/${id}`), { page: 'template', id })
  assert.deepEqual(parseRoute('#/messages'), { page: 'messages' })
  assert.deepEqual(parseRoute('#/settings'), { page: 'settings' })
  assert.deepEqual(parseRoute('#/templates/nope'), { page: 'members' })
  assert.equal(guardHash('#/templates', none), '#/inbox')
  assert.equal(guardHash(`#/templates/${id}`, none), '#/inbox')
  assert.equal(guardHash('#/messages', none), '#/inbox')
  assert.equal(guardHash('#/messages', all), '#/messages')
  assert.equal(guardHash('#/settings', none), '#/settings')
})
```

`src/ui/errors.test.ts` — add:
```ts
test('communication messages', () => {
  assert.equal(friendlyError({ code: 'P0001', message: 'Only failed messages can be retried.' }),
    'Only failed messages can be retried. Reload to see the latest status.')
  assert.equal(friendlyError({ code: 'P0001', message: 'A template cannot change its type.' }),
    'A template cannot change its type. Create a new template instead.')
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test`
Expected: the new route test fails (`#/templates` parses as members) and the new errors test fails (fallback sentence).

- [ ] **Step 3: Implement routes and errors**

`src/rbac/route.ts`:
```ts
export type Route =
  | { page: 'members' } | { page: 'roles' } | { page: 'forms' } | { page: 'workflows' } | { page: 'inbox' } | { page: 'records' }
  | { page: 'templates' } | { page: 'messages' } | { page: 'settings' }
  | { page: 'form-edit' | 'form-fill' | 'form-submissions'; id: string }
  | { page: 'workflow-edit' | 'workflow-access' | 'start' | 'task' | 'record' | 'template'; id: string }
export type Perms = { roles: boolean; forms: boolean; workflows: boolean; comms: boolean }
```
```ts
const TEMPLATE_PAGE = new RegExp(`^#/templates/${ID}$`)
const LISTS: Record<string, 'roles' | 'forms' | 'workflows' | 'inbox' | 'records' | 'templates' | 'messages' | 'settings'> = {
  '#/roles': 'roles', '#/forms': 'forms', '#/workflows': 'workflows', '#/inbox': 'inbox', '#/records': 'records',
  '#/templates': 'templates', '#/messages': 'messages', '#/settings': 'settings',
}
```
In `parseRoute`, before the final `return`:
```ts
  const t = TEMPLATE_PAGE.exec(hash)
  if (t) return { page: 'template', id: t[1] }
```
In `guardHash`, before `return hash`:
```ts
  if ((r.page === 'templates' || r.page === 'template' || r.page === 'messages') && !perms.comms) return '#/inbox'
```

`src/ui/errors.ts` — add to `SENTENCES` before the `Not allowed` entry:
```ts
  [/Only failed messages can be retried/, 'Only failed messages can be retried. Reload to see the latest status.'],
  [/A template cannot change its type/, 'A template cannot change its type. Create a new template instead.'],
```

`src/ui/icons.tsx`:
```tsx
export const BellIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
```

- [ ] **Step 4: Data layer** — append to `src/comms/api.ts`

```ts
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { MutableKind } from './logic'

export type Notification = { id: string; title: string; body: string; link: string; read_at: string | null; created_at: string }
export const NOTIFICATION_LIMIT = 20 // shortcut: newest 20 in the dropdown; add a full notifications page when people ask for history

export const useNotifications = (orgId: string | null, userId: string) => useQuery({
  queryKey: ['notifications', userId, orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data, error } = await supabase.from('notifications').select('id, title, body, link, read_at, created_at')
      .eq('org_id', orgId!).eq('user_id', userId).order('created_at', { ascending: false }).limit(NOTIFICATION_LIMIT)
    if (error) throw error
    return data as Notification[]
  },
})

export const useUnreadCount = (orgId: string | null, userId: string) => useQuery({
  queryKey: ['notifications-unread', userId, orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true })
      .eq('org_id', orgId!).eq('user_id', userId).is('read_at', null)
    if (error) throw error
    return count ?? 0
  },
})

/** Live bell: any change to my notifications refetches the list and the count. RLS decides what is sent; the filter saves traffic. */
export function useNotificationFeed(orgId: string | null, userId: string) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!orgId) return
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: ['notifications', userId, orgId] })
      void qc.invalidateQueries({ queryKey: ['notifications-unread', userId, orgId] })
    }
    const channel = supabase.channel(`notifications:${userId}:${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, refresh)
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [orgId, userId, qc])
}

// Zero rows back is not a failure here: another tab already marked them read.
export const markRead = (id: string) =>
  supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null).select('id')
export const markAllRead = (orgId: string, userId: string) =>
  supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('org_id', orgId).eq('user_id', userId).is('read_at', null).select('id')

/** type → email on; a type with no row is on. */
export const usePrefs = (userId: string) => useQuery({
  queryKey: ['notification-prefs', userId],
  queryFn: async () => {
    const { data, error } = await supabase.from('notification_prefs').select('type, email_enabled')
    if (error) throw error
    return new Map(data.map((p) => [p.type as MutableKind, p.email_enabled]))
  },
})
export const setEmailPref = (userId: string, type: MutableKind, enabled: boolean) =>
  supabase.from('notification_prefs')
    .upsert({ user_id: userId, type, email_enabled: enabled, updated_at: new Date().toISOString() }, { onConflict: 'user_id,type' })
    .select('type')
```
(Merge the new imports with the file's existing `import { useQuery } from '@tanstack/react-query'` line.)

- [ ] **Step 5: Bell** — `src/comms/NotificationBell.tsx`

```tsx
import { useEffect, useId, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { friendlyError } from '../ui/errors'
import { BellIcon } from '../ui/icons'
import { When } from '../ui/Time'
import { markAllRead, markRead, useNotificationFeed, useNotifications, useUnreadCount } from './api'

export function NotificationBell() {
  const { orgId, userId } = useOrg()
  useNotificationFeed(orgId, userId)
  const unread = useUnreadCount(orgId, userId)
  const list = useNotifications(orgId, userId)
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const n = unread.data ?? 0

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus() } }
    addEventListener('mousedown', onDown)
    addEventListener('keydown', onKey)
    return () => { removeEventListener('mousedown', onDown); removeEventListener('keydown', onKey) }
  }, [open])

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['notifications', userId, orgId] })
    void qc.invalidateQueries({ queryKey: ['notifications-unread', userId, orgId] })
  }
  const readOne = async (id: string) => {
    const { error: e } = await markRead(id)
    if (e) setError(friendlyError(e))
    refresh()
  }
  const readAll = async () => {
    if (!orgId) return
    const { error: e } = await markAllRead(orgId, userId)
    setError(e ? friendlyError(e) : null)
    refresh()
  }

  return (
    <div ref={box} className="relative">
      <button ref={button} type="button" className="rnr-icon-btn relative" aria-expanded={open} aria-controls={panelId}
        aria-label={n ? `Notifications, ${n} unread` : 'Notifications'} onClick={() => setOpen((o) => !o)}>
        <BellIcon size={20} />
        {n > 0 && <span className="rnr-chip rnr-num absolute -top-1 -right-1" aria-hidden="true">{n > 99 ? '99+' : n}</span>}
      </button>
      <span className="sr-only" aria-live="polite">{n ? `${n} unread notifications` : ''}</span>
      {open && (
        <div id={panelId} role="region" aria-label="Notifications"
          className="rnr-menu absolute right-0 z-20 mt-2 w-[min(360px,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <h2 className="label">Notifications</h2>
            {n > 0 && <button type="button" className="rnr-btn rnr-btn-ghost" onClick={readAll}>Mark all as read</button>}
          </div>
          {error && <p className="rnr-error px-2" role="alert">{error}</p>}
          {list.isError && <p className="rnr-error px-2" role="alert">We could not load your notifications. Try again in a moment.</p>}
          {list.data?.length === 0 && <p className="rnr-muted px-2 py-3">No notifications yet.</p>}
          <ul className="flex flex-col">
            {list.data?.map((x) => (
              <li key={x.id}>
                <a href={x.link} className="rnr-menu-item flex flex-col items-start gap-0.5" onClick={() => { void readOne(x.id); setOpen(false) }}>
                  <span className={x.read_at ? '' : 'label'}>{!x.read_at && <span className="sr-only">Unread: </span>}{x.title}</span>
                  <span className="rnr-caption"><When iso={x.created_at} /></span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Settings** — `src/comms/SettingsPage.tsx`

```tsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { friendlyError } from '../ui/errors'
import { Skeleton } from '../ui/Skeleton'
import { useNotice } from '../ui/useNotice'
import { KIND_LABELS, MUTABLE_KINDS, type MutableKind } from './logic'
import { setEmailPref, usePrefs } from './api'

export function SettingsPage() {
  const { userId } = useOrg()
  const prefs = usePrefs(userId)
  const qc = useQueryClient()
  const [saving, setSaving] = useState<MutableKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useNotice()

  const toggle = async (type: MutableKind, enabled: boolean) => {
    if (saving) return
    setSaving(type)
    setError(null)
    const { data, error: e } = await setEmailPref(userId, type, enabled)
    setSaving(null)
    if (e || !data?.length) {
      setError(e ? friendlyError(e) : 'We could not save that setting. Reload the page and try again.')
      return
    }
    await qc.invalidateQueries({ queryKey: ['notification-prefs', userId] })
    setNotice(`${KIND_LABELS[type]} emails turned ${enabled ? 'on' : 'off'}.`)
  }

  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <h1 className="page-title" id="settings-h">Settings</h1>
      <section className="rnr-card gap-3" aria-labelledby="email-h">
        <h2 id="email-h" className="label">Email notifications</h2>
        <p className="rnr-muted">In-app notifications always arrive. Choose which ones also come by email.</p>
        {prefs.isPending && <Skeleton rows={MUTABLE_KINDS.map(() => ({ w: '220px' }))} />}
        {prefs.isError && <p className="rnr-error" role="alert">We could not load your settings. Reload the page.</p>}
        {prefs.isSuccess && (
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Email me about</legend>
            {MUTABLE_KINDS.map((k) => (
              <label key={k} className="rnr-check">
                <input type="checkbox" checked={prefs.data.get(k) ?? true} aria-busy={saving === k}
                  onChange={(e) => void toggle(k, e.target.checked)} />
                <span>{KIND_LABELS[k]}</span>
              </label>
            ))}
          </fieldset>
        )}
        {error && <p className="rnr-error" role="alert">{error}</p>}
        <p className="rnr-caption" role="status">{notice}</p>
      </section>
    </div>
  )
}
```

- [ ] **Step 7: Shell** — `src/App.tsx`

Import `NotificationBell` and `SettingsPage`. In `Page`:
```tsx
    case 'settings': return <SettingsPage />
```
In `Shell`, pass the new permission:
```tsx
  const hash = loading ? rawHash : guardHash(rawHash, { roles: can('roles.manage'), forms: can('forms.manage'), workflows: can('workflows.manage'), comms: can('comms.manage') })
```
Replace the Sign out button with a right-hand group:
```tsx
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            {link('#/settings', 'Settings', route.page === 'settings')}
            <button className="rnr-btn rnr-btn-ghost" type="button" aria-busy={out.busy}
              onClick={() => guarded(() => out.run(() => supabase.auth.signOut()))}>
              {out.busy && <span className="rnr-spin" aria-hidden="true" />}{out.busy ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
```

- [ ] **Step 8: Typecheck, lint, unit tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: no errors, no warnings, two more passing tests than before this task, `# fail 0`.

- [ ] **Step 9: Browser check** (`supabase start`, functions served, `pnpm dev`; Browser pane, fresh tabs `admin.localhost:5173/app/` and `member.localhost:5173/app/`)

1. Member: Inbox → Start new → Leave approval → submit. Admin's tab, without reloading: the bell shows 1 and its accessible name reads "Notifications, 1 unread"; the dropdown lists "New task: Leave approval: …"; clicking it opens the task and the count drops to 0.
2. Member's bell stays at 0 (nothing addressed to them).
3. Esc closes the dropdown and focus returns to the bell; a click outside closes it.
4. Member: Settings → untick "Task overdue" → status "Task overdue emails turned off."; reload keeps it unticked.
5. 375px: bell, Settings and Sign out fit; the dropdown is full width inside the gutter; no page-level horizontal scroll. Reset the viewport.

- [ ] **Step 10: Commit**

```bash
git add src/comms/api.ts src/comms/NotificationBell.tsx src/comms/SettingsPage.tsx src/rbac/route.ts src/rbac/route.test.ts src/ui/errors.ts src/ui/errors.test.ts src/ui/icons.tsx src/App.tsx
git commit -m "feat: add live notification bell and email notification settings"
```

---

### Task 8: Frontend — Templates pages, Send message editor, timeline

**Owner:** Frontend engineer · **Depends on:** Tasks 3, 7

**Files:**
- Create: `src/comms/TemplatesPage.tsx`, `src/comms/TemplateEditor.tsx`, `src/comms/preview.ts`, `src/workflows/canvas/MessageAction.tsx`
- Modify: `src/comms/api.ts`, `src/workflows/canvas/SidePanel.tsx`, `src/workflows/canvas/WorkflowEditor.tsx`, `src/records/timeline.ts`, `src/App.tsx`
- Test: `src/comms/preview.test.ts`, `src/records/timeline.test.ts`

**Interfaces:**
- Consumes: `render`, `VARIABLES`, `isVariable`, `DATA_PREFIX`, `KIND_LABELS`, `Recipient`, `SendMessage` (Task 2); `useTemplates`, `TemplateRow` (Task 2); `useOrg`, `useAction`, `useNotice`, `useFocusAfterRender`, `ConfirmDialog`, `setNavGuard`, `Skeleton`, `When`, `friendlyError`; `useMemberEmails`; `stepLabel` (Phase 3); the `send_message` event detail `{ template, people, emails, notices, skipped }` (Task 3).
- Produces:
  - `src/comms/api.ts`: `useTemplate(id)` under `['template', id]`, `createTemplate(orgId)`, `updateTemplate(id, fields, updatedAt)`, `deleteTemplate(id)`, `type PreviewRecord`, `usePreviewRecords(orgId)` under `['preview-records', orgId]`
  - `src/comms/preview.ts`: `previewContext(rec: PreviewRecord | null, who: { orgName: string; myName: string; appUrl: string }): RenderContext`
  - `TemplatesPage()`, `TemplateEditor({ id })`, `MessageAction(props)`
  - `eventText` for `send_message`: sent ("Sent “Record approved” to 2 people") and old pending events

- [ ] **Step 1: Write the failing tests**

`src/comms/preview.test.ts`:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { previewContext } from './preview.ts'
import { render } from '../../supabase/functions/_shared/comms/render.ts'

const who = { orgName: 'Alpha School', myName: 'admin@alpha.test', appUrl: 'http://localhost:5173/app/' }

test('a chosen record fills the record variables and its link', () => {
  const c = previewContext({ id: 'r1', title: 'Leave: Ada', data: { days: 3 } }, who)
  const r = render({ subject: '{{record.title}}', body: '{{record.data.days}} {{link.record}} {{recipient.name}} {{org.name}}' }, c)
  assert.equal(r.subject, 'Leave: Ada')
  assert.equal(r.text, '3 http://localhost:5173/app/#/records/r1 admin@alpha.test Alpha School')
})
test('with no record the preview still renders, with a placeholder title and empty answers', () => {
  const r = render({ subject: '{{record.title}}', body: '[{{record.data.days}}] {{link.task}}' }, previewContext(null, who))
  assert.equal(r.subject, 'Example record')
  assert.equal(r.text, '[] http://localhost:5173/app/#/inbox')
})
```

`src/records/timeline.test.ts` — in "actions that are not carried out yet say so", replace the `send_message` line with:
```ts
  assert.equal(eventText(ev('action', 'approve', { type: 'send_message', status: 'pending' }), LEAVE, null), 'Message not sent: recorded before messages were available.')
```
and add:
```ts
test('sent messages say what was sent and to how many people', () => {
  assert.equal(eventText(ev('action', 'approve', { type: 'send_message', template: 'Record approved', people: 1, skipped: 0 }), LEAVE, null), 'Sent “Record approved” to 1 person')
  assert.equal(eventText(ev('action', 'approve', { type: 'send_message', template: 'Record approved', people: 3, skipped: 2 }), LEAVE, null),
    'Sent “Record approved” to 3 people. 2 recipients could not be reached.')
  assert.equal(eventIcon(ev('action', 'approve', { type: 'send_message', template: 'Record approved', people: 1, skipped: 0 })), null)
  assert.equal(eventIcon(ev('action', 'approve', { type: 'send_message', status: 'pending' })), 'clock')
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test`
Expected: `Cannot find module '…/src/comms/preview.ts'`; the timeline tests fail on the new sentences.

- [ ] **Step 3: Implement** — `src/comms/preview.ts`

```ts
import type { RenderContext } from '../../supabase/functions/_shared/comms/render.ts'
import type { Answers } from '../../supabase/functions/_shared/forms/types.ts'

export type PreviewRecord = { id: string; title: string; data: Answers }

/** What the editor previews: a real record when chosen, you as the recipient and the step assignee. Display only; sends render on the server. */
export function previewContext(rec: PreviewRecord | null, who: { orgName: string; myName: string; appUrl: string }): RenderContext {
  return {
    record: { title: rec?.title ?? 'Example record', data: rec?.data ?? {} },
    step: { assignee: { name: who.myName } },
    link: { task: `${who.appUrl}#/inbox`, record: rec ? `${who.appUrl}#/records/${rec.id}` : `${who.appUrl}#/records`, invite: who.appUrl },
    org: { name: who.orgName },
    recipient: { name: who.myName },
  }
}
```

`src/records/timeline.ts` — the `action` case and the icon:
```ts
    case 'action':
      if (d.type === 'set_status') return `Status set to “${String(d.label)}”`
      if (d.type === 'send_message') return d.status === 'pending' ? 'Message not sent: recorded before messages were available.' : sentText(d)
      return 'PDF not made yet. Available when Reports ship.'
```
```ts
const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0)
function sentText(d: Record<string, unknown>): string {
  const people = count(d.people)
  const skipped = count(d.skipped)
  const main = `Sent “${String(d.template ?? 'a message')}” to ${people} ${people === 1 ? 'person' : 'people'}`
  return skipped ? `${main}. ${skipped} ${skipped === 1 ? 'recipient' : 'recipients'} could not be reached.` : main
}
```
```ts
    case 'action':
      if (e.detail?.type === 'generate_pdf') return 'clock'
      return e.detail?.type === 'send_message' && e.detail?.status === 'pending' ? 'clock' : null
```

`src/comms/api.ts` — append:
```ts
import type { PreviewRecord } from './preview'

export const useTemplate = (id: string) => useQuery({
  queryKey: ['template', id],
  queryFn: async () => {
    const { data, error } = await supabase.from('message_templates').select(TEMPLATE_COLS).eq('id', id).maybeSingle()
    if (error) throw error
    return data as TemplateRow | null
  },
})
export const createTemplate = (orgId: string) => supabase.from('message_templates')
  .insert({ org_id: orgId, name: 'New template', subject: 'Message from {{org.name}}', body: 'Hello {{recipient.name}},\n\n' })
  .select('id').single()
export type TemplateFields = Pick<TemplateRow, 'name' | 'channel' | 'subject' | 'body'>
/** Conditional on updated_at: zero rows back means someone else saved first. */
export const updateTemplate = (id: string, f: TemplateFields, updatedAt: string) => supabase.from('message_templates')
  .update(f).eq('id', id).eq('updated_at', updatedAt).select('updated_at')
export const deleteTemplate = (id: string) => supabase.from('message_templates').delete().eq('id', id).eq('is_system', false).select('id')

export const usePreviewRecords = (orgId: string | null) => useQuery({
  queryKey: ['preview-records', orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data, error } = await supabase.from('records').select('id, title, data').eq('org_id', orgId!)
      .order('created_at', { ascending: false }).limit(50)
    if (error) throw error
    return data as PreviewRecord[]
  },
})
```

- [ ] **Step 4: Templates list** — `src/comms/TemplatesPage.tsx`

```tsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { friendlyError } from '../ui/errors'
import { PlusIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { When } from '../ui/Time'
import { useAction } from '../ui/useAction'
import { useFocusAfterRender } from '../ui/useFocusAfterRender'
import { useNotice } from '../ui/useNotice'
import { createTemplate, deleteTemplate, useTemplates, type TemplateRow } from './api'

const CHANNEL = { email: 'Email', in_app: 'In-app' } as const

export function TemplatesPage() {
  const { orgId } = useOrg()
  const templates = useTemplates(orgId)
  const qc = useQueryClient()
  const create = useAction()
  const remove = useAction()
  const [deleting, setDeleting] = useState<TemplateRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [notice, setNotice] = useNotice()
  const focusLater = useFocusAfterRender()

  const add = () => create.run(async () => {
    setError(null)
    const { data, error: e } = await createTemplate(orgId!)
    if (e || !data) { setError(friendlyError(e)); return }
    await qc.invalidateQueries({ queryKey: ['templates', orgId] })
    location.hash = `#/templates/${data.id}`
  })
  const confirmDelete = () => remove.run(async () => {
    if (!deleting) return
    const { data, error: e } = await deleteTemplate(deleting.id)
    if (e || !data?.length) { setDeleteError(e ? friendlyError(e) : 'This template could not be deleted. Reload the page and try again.'); return }
    const name = deleting.name
    setDeleting(null)
    setDeleteError(null)
    await qc.invalidateQueries({ queryKey: ['templates', orgId] })
    setNotice(`${name} deleted.`)
    focusLater('templates-h')
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title" id="templates-h" tabIndex={-1}>Message templates</h1>
        <button className="rnr-btn rnr-btn-primary ml-auto" type="button" aria-busy={create.busy} onClick={add}>
          {create.busy ? <span className="rnr-spin" aria-hidden="true" /> : <PlusIcon />}{create.busy ? 'Creating…' : 'New template'}
        </button>
      </div>
      {error && <p className="rnr-error" role="alert">{error}</p>}
      <p className="rnr-caption" role="status">{notice}</p>
      {templates.isPending && <Skeleton rows={[{ w: '100%', h: 240 }]} />}
      {templates.isError && <p className="rnr-error" role="alert">We could not load the templates. Reload the page.</p>}
      {templates.data && (
        <div className="rnr-card p-0 overflow-x-auto">
          <table className="rnr-table">
            <thead><tr><th scope="col">Name</th><th scope="col">Channel</th><th scope="col">Last changed</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {templates.data.map((t) => (
                <tr key={t.id}>
                  <td className="rnr-sticky-first">{t.name}{t.is_system && <span className="rnr-chip ml-2">System</span>}</td>
                  <td>{CHANNEL[t.channel]}</td>
                  <td><When iso={t.updated_at} /></td>
                  <td className="flex justify-end gap-1">
                    <a className="rnr-btn rnr-btn-ghost" href={`#/templates/${t.id}`}>Edit</a>
                    {!t.is_system && (
                      <button className="rnr-btn rnr-btn-ghost" type="button" onClick={() => { setDeleteError(null); setDeleting(t) }}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!templates.data.some((t) => !t.is_system) && <p className="rnr-muted p-4">No templates of your own yet. Create one to use in a workflow's Send message action.</p>}
        </div>
      )}
      <ConfirmDialog open={!!deleting} title="Delete template?" busy={remove.busy} error={deleteError}
        body={`${deleting?.name ?? 'This template'} will be deleted. Workflows that send it stop with an error until someone chooses another template.`}
        confirmLabel="Delete template" busyLabel="Deleting…" onConfirm={confirmDelete} onClose={() => setDeleting(null)} />
    </div>
  )
}
```

- [ ] **Step 5: Template editor** — `src/comms/TemplateEditor.tsx`

```tsx
import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useMemberEmails } from '../members/useMemberEmails'
import { useOrg } from '../rbac/useOrg'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { friendlyError } from '../ui/errors'
import { BackIcon, CheckIcon } from '../ui/icons'
import { setNavGuard, type Next } from '../ui/navGuard'
import { Skeleton } from '../ui/Skeleton'
import { useAction } from '../ui/useAction'
import { useFocusAfterRender } from '../ui/useFocusAfterRender'
import { DATA_PREFIX, KIND_LABELS, VARIABLES, isVariable, render } from './logic'
import { previewContext } from './preview'
import { updateTemplate, usePreviewRecords, useTemplate, type TemplateFields, type TemplateRow } from './api'

type Target = 'subject' | 'body'
const LIMITS = { name: 120, subject: 200, body: 10000 } as const

export function TemplateEditor({ id }: { id: string }) {
  const { orgId } = useOrg()
  const tpl = useTemplate(id)
  const card = (title: string, text: string) => (
    <div className="rnr-card gap-3 max-w-xl"><h1 className="page-title">{title}</h1><p className="rnr-muted">{text}</p></div>
  )
  return (
    <div className="flex flex-col gap-4">
      <a className="rnr-btn rnr-btn-ghost self-start" href="#/templates"><BackIcon />Back to templates</a>
      {tpl.isPending && <Skeleton rows={[{ w: '240px', h: 32 }, { w: '100%', h: 320 }]} />}
      {tpl.isError && card('We could not load this template', 'Check your connection and reload the page.')}
      {tpl.isSuccess && (!tpl.data || tpl.data.org_id !== orgId) && card('This template does not exist', 'It may have been deleted, or it belongs to another organisation.')}
      {tpl.data && tpl.data.org_id === orgId && <Editor key={tpl.data.updated_at} tpl={tpl.data} />}
    </div>
  )
}

function Editor({ tpl }: { tpl: TemplateRow }) {
  const { orgId, orgs, userId } = useOrg()
  const qc = useQueryClient()
  const emails = useMemberEmails(orgId)
  const records = usePreviewRecords(orgId)
  const [f, setF] = useState<TemplateFields>({ name: tpl.name, channel: tpl.channel, subject: tpl.subject, body: tpl.body })
  const [saved, setSaved] = useState<TemplateFields>(f)
  const [version, setVersion] = useState(tpl.updated_at)
  const [errors, setErrors] = useState<Partial<Record<keyof TemplateFields, string>>>({})
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [leaveTo, setLeaveTo] = useState<Next | null>(null)
  const [menu, setMenu] = useState(false)
  const [recordId, setRecordId] = useState('')
  const save = useAction()
  const focusLater = useFocusAfterRender()
  const subjectRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const last = useRef<Target>('body')
  const uid = useId()
  const dirty = (Object.keys(f) as (keyof TemplateFields)[]).some((k) => f[k] !== saved[k])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    addEventListener('beforeunload', warn)
    setNavGuard((next) => { if (next === `#/templates/${tpl.id}`) return false; setLeaveTo(() => next); return true })
    return () => { removeEventListener('beforeunload', warn); setNavGuard(null) }
  }, [dirty, tpl.id])

  const record = records.data?.find((r) => r.id === recordId) ?? null
  const preview = useMemo(() => render(f, previewContext(record, {
    orgName: orgs.find((o) => o.id === orgId)?.name ?? '', myName: emails.data?.get(userId) ?? 'You', appUrl: `${location.origin}/app/`,
  })), [f, record, orgs, orgId, emails.data, userId])
  const dataKeys = Object.keys(record?.data ?? {}).filter((k) => isVariable(`${DATA_PREFIX}${k}`))

  const insert = (key: string) => {
    const target = last.current
    const el: HTMLInputElement | HTMLTextAreaElement | null = target === 'subject' ? subjectRef.current : bodyRef.current
    const token = `{{${key}}}`
    const value = f[target]
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    setF({ ...f, [target]: value.slice(0, start) + token + value.slice(end) })
    setMenu(false)
    focusLater(() => { const node = target === 'subject' ? subjectRef.current : bodyRef.current; node?.setSelectionRange(start + token.length, start + token.length); return node })
  }

  const submit = () => save.run(async () => {
    const next: typeof errors = {}
    for (const k of ['name', 'subject', 'body'] as const) {
      const len = f[k].trim().length
      if (!len) next[k] = 'This field is required.'
      else if (len > LIMITS[k]) next[k] = `Keep this under ${LIMITS[k]} characters.`
    }
    setErrors(next)
    setError(null)
    if (Object.keys(next).length) { focusLater(`${uid}-${Object.keys(next)[0]}`); return false }
    const body = { ...f, name: f.name.trim() }
    const { data, error: e } = await updateTemplate(tpl.id, body, version)
    if (e) { setError(friendlyError(e)); return false }
    if (!data?.length) { setConflict(true); return false }
    setVersion(data[0].updated_at)
    setSaved(body)
    setF(body)
    void qc.invalidateQueries({ queryKey: ['templates', orgId] })
    return true
  }, true)

  const field = (k: 'name' | 'subject', label: string, ref?: RefObject<HTMLInputElement | null>) => (
    <div className="rnr-field" data-invalid={errors[k] ? true : undefined}>
      <label className="rnr-label" htmlFor={`${uid}-${k}`}>{label}</label>
      <input id={`${uid}-${k}`} ref={ref} className="rnr-input" value={f[k]} aria-invalid={errors[k] ? true : undefined}
        aria-describedby={errors[k] ? `${uid}-${k}-err` : undefined}
        onFocus={() => { if (k === 'subject') last.current = 'subject' }} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      {errors[k] && <p id={`${uid}-${k}-err`} className="rnr-error">{errors[k]}</p>}
    </div>
  )

  return (
    <>
      <h1 className="page-title">{tpl.name}</h1>
      {tpl.is_system && <p className="rnr-muted">System template for {KIND_LABELS[tpl.kind]}. You can change its words and channel; it cannot be deleted.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <form className="rnr-card gap-4" noValidate onSubmit={(e) => { e.preventDefault(); void submit() }}>
          {field('name', 'Name')}
          <div className="rnr-field">
            <span className="rnr-label" id={`${uid}-ch`}>Channel</span>
            <div className="rnr-seg" role="group" aria-labelledby={`${uid}-ch`}>
              {(['email', 'in_app'] as const).map((c) => (
                <button key={c} type="button" aria-pressed={f.channel === c} onClick={() => setF({ ...f, channel: c })}>{c === 'email' ? 'Email' : 'In-app only'}</button>
              ))}
            </div>
            <p className="rnr-hint">Members always get an in-app notification. Email also goes out unless they turned this type off.</p>
          </div>
          {field('subject', 'Subject', subjectRef)}
          <div className="rnr-field" data-invalid={errors.body ? true : undefined}>
            <label className="rnr-label" htmlFor={`${uid}-body`}>Message</label>
            <textarea id={`${uid}-body`} ref={bodyRef} className="rnr-input min-h-48" value={f.body} aria-invalid={errors.body ? true : undefined}
              aria-describedby={`${uid}-body-hint${errors.body ? ` ${uid}-body-err` : ''}`}
              onFocus={() => { last.current = 'body' }} onChange={(e) => setF({ ...f, body: e.target.value })} />
            <p id={`${uid}-body-hint`} className="rnr-hint">Plain text. A blank line starts a new paragraph.</p>
            {errors.body && <p id={`${uid}-body-err`} className="rnr-error">{errors.body}</p>}
          </div>
          <div className="relative">
            <button type="button" className="rnr-btn rnr-btn-secondary" aria-expanded={menu} aria-controls={`${uid}-vars`}
              onClick={() => setMenu((m) => !m)} onKeyDown={(e) => { if (e.key === 'Escape') setMenu(false) }}>Insert variable</button>
            {menu && (
              <div id={`${uid}-vars`} className="rnr-menu absolute z-20 mt-1 w-72 max-h-80 overflow-y-auto" onKeyDown={(e) => { if (e.key === 'Escape') setMenu(false) }}>
                {VARIABLES.map((v) => (
                  <button key={v.key} type="button" className="rnr-menu-item flex flex-col items-start" onClick={() => insert(v.key)}>
                    <span>{v.label}</span><span className="rnr-caption">{v.hint}</span>
                  </button>
                ))}
                <div className="rnr-menu-sep" />
                {dataKeys.length
                  ? dataKeys.map((k) => <button key={k} type="button" className="rnr-menu-item" onClick={() => insert(`${DATA_PREFIX}${k}`)}>Answer: {k}</button>)
                  : <p className="rnr-caption px-3 py-2">Choose a record to preview to list its answers.</p>}
              </div>
            )}
          </div>
          {preview.unknown.length > 0 && (
            <p className="rnr-error" role="alert">Not a variable, so it will be left empty: {preview.unknown.map((u) => `{{${u}}}`).join(', ')}</p>
          )}
          {error && <p className="rnr-error" role="alert">{error}</p>}
          {conflict && (
            <div className="flex flex-wrap items-center gap-2" role="alert">
              <p className="rnr-error">Someone else changed this template. Reload to see their changes.</p>
              <button type="button" className="rnr-btn rnr-btn-secondary" onClick={() => { setNavGuard(null); void qc.invalidateQueries({ queryKey: ['template', tpl.id] }) }}>Reload template</button>
            </div>
          )}
          <div>
            <button type="submit" className="rnr-btn rnr-btn-primary" aria-busy={save.busy}>
              {save.busy && <span className="rnr-spin" aria-hidden="true" />}
              {save.saved && <CheckIcon />}
              {save.busy ? 'Saving…' : save.saved ? 'Saved' : 'Save template'}
            </button>
          </div>
        </form>
        <section className="rnr-card gap-3" aria-labelledby={`${uid}-pv`}>
          <h2 id={`${uid}-pv`} className="label">Preview</h2>
          <div className="rnr-field">
            <label className="rnr-label" htmlFor={`${uid}-rec`}>Record to preview with</label>
            <select id={`${uid}-rec`} className="rnr-input" value={recordId} onChange={(e) => setRecordId(e.target.value)}>
              <option value="">No record (example values)</option>
              {records.data?.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
            <p className="rnr-hint">You stand in for the recipient and the step assignee. Links are filled in when the message is sent.</p>
          </div>
          <p className="label">{preview.subject || 'No subject'}</p>
          <p className="whitespace-pre-wrap">{preview.text}</p>
        </section>
      </div>
      <ConfirmDialog open={!!leaveTo} title="Leave without saving?" body={`Your changes to ${f.name.trim() || 'this template'} will be lost.`}
        confirmLabel="Leave without saving" busyLabel="Leaving…" busy={false} error={null} onClose={() => setLeaveTo(null)}
        onConfirm={() => { const to = leaveTo; setNavGuard(null); setLeaveTo(null); if (typeof to === 'function') to(); else if (to) location.hash = to }} />
    </>
  )
}
```

- [ ] **Step 6: Send message editor** — `src/workflows/canvas/MessageAction.tsx`

```tsx
import { useId, useState } from 'react'
import type { Field } from '../../forms/logic'
import { readRecipient, type Recipient } from '../../comms/logic'
import type { Action, Graph } from '../logic'
import { stepLabel } from './canvasOps'

type Kind = 'role' | 'user' | 'starter' | 'step' | 'field'
const KINDS: [Kind, string][] = [
  ['role', 'Everyone with a role'], ['user', 'A person'], ['starter', 'The person who started the record'],
  ['step', 'The person who completed a step'], ['field', 'An email address from an answer'],
]
type Props = {
  action: Extract<Action, { type: 'send_message' }>; graph: Graph; roles: { id: string; name: string }[]; members: Map<string, string>
  templates: { id: string; name: string }[]; fields: Field[]; canManage: boolean
  onChange(a: Extract<Action, { type: 'send_message' }>): void; onSay(t: string): void
}

/** One Send message action: its template and its recipients. Adding a recipient is two steps, like adding an action. */
export function MessageAction({ action, graph, roles, members, templates, fields, canManage, onChange, onSay }: Props) {
  const id = useId()
  const [kind, setKind] = useState<Kind | ''>('')
  const [target, setTarget] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recipients = Array.isArray(action.recipients) ? action.recipients : []
  const steps = graph.nodes.filter((n) => n.type === 'start' || n.type === 'form')
  const options: Record<Kind, [string, string][]> = {
    role: roles.map((r) => [r.id, r.name]),
    user: [...members].map(([uid, email]) => [uid, email]),
    starter: [],
    step: steps.map((n) => [n.id, stepLabel(graph, n)]),
    field: fields.filter((x) => x.type === 'short_text').map((x) => [x.key, x.label || x.key]),
  }
  const describe = (r: Recipient) => {
    if ('starter' in r) return 'The person who started the record'
    if ('role' in r) return `Everyone with the role ${roles.find((x) => x.id === r.role)?.name ?? '(deleted role)'}`
    if ('user' in r) return members.get(r.user) ?? 'A former member'
    if ('step' in r) {
      const n = graph.nodes.find((x) => x.id === r.step)
      return `Whoever completed ${n ? stepLabel(graph, n) : '(deleted step)'}`
    }
    return `The email in the answer ${fields.find((x) => x.key === r.field)?.label ?? r.field}`
  }
  const add = () => {
    if (!kind || (kind !== 'starter' && !target)) { setError('Choose who to send to.'); return }
    const r = readRecipient(kind === 'starter' ? { starter: true } : { [kind]: target })
    if (!r) { setError('Choose who to send to.'); return }
    onChange({ ...action, recipients: [...recipients, r] })
    setKind('')
    setTarget('')
    setError(null)
    onSay(`${describe(r)} added as a recipient.`)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="rnr-field">
        <label className="rnr-label" htmlFor={`${id}-t`}>Template</label>
        <select id={`${id}-t`} className="rnr-input" value={action.templateId ?? ''} onChange={(e) => onChange({ ...action, templateId: e.target.value })}>
          <option value="">Choose a template…</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {canManage && <a className="rnr-hint" href="#/templates">Manage templates</a>}
      </div>
      <h4 className="rnr-label">Send to</h4>
      {recipients.length === 0 && <p className="rnr-caption">No recipients yet.</p>}
      <ul className="flex flex-col gap-1">
        {recipients.map((r, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="flex-1">{describe(r)}</span>
            <button type="button" className="rnr-btn rnr-btn-ghost" aria-label={`Remove recipient: ${describe(r)}`}
              onClick={() => { onChange({ ...action, recipients: recipients.filter((_, j) => j !== i) }); onSay(`${describe(r)} removed.`) }}>Remove</button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <div className="rnr-field flex-1" data-invalid={error ? true : undefined}>
          <label className="rnr-label" htmlFor={`${id}-k`}>Recipient to add</label>
          <select id={`${id}-k`} className="rnr-input" value={kind} aria-describedby={error ? `${id}-err` : undefined}
            onChange={(e) => { setKind(e.target.value as Kind | ''); setTarget(''); setError(null) }}>
            <option value="">Choose who…</option>
            {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {kind && kind !== 'starter' && (
          <div className="rnr-field flex-1">
            <label className="rnr-label" htmlFor={`${id}-v`}>{KINDS.find(([v]) => v === kind)?.[1]}</label>
            <select id={`${id}-v`} className="rnr-input" value={target} onChange={(e) => { setTarget(e.target.value); setError(null) }}>
              <option value="">Choose…</option>
              {options[kind].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        )}
        <button type="button" className="rnr-btn rnr-btn-secondary" onClick={add}>Add recipient</button>
      </div>
      {error && <p id={`${id}-err`} className="rnr-error">{error}</p>}
    </div>
  )
}
```

`src/workflows/canvas/SidePanel.tsx`:
```tsx
import { MessageAction } from './MessageAction'
```
```tsx
const NOT_ACTIVE = { generate_pdf: 'Not active yet. Available when Reports ship.' } as const
export type MessageCtx = { templates: { id: string; name: string }[]; canManageTemplates: boolean }
```
`Props` gains `messages: MessageCtx`; `SidePanel` destructures `messages`. `ActionList` gains the props it passes down:
```tsx
function ActionList({ edgeId, actions, onChange, onSay, graph, roles, members, fields, messages }: {
  edgeId: string; actions: Action[]; onChange(a: Action[]): void; onSay(t: string): void
  graph: Graph; roles: { id: string; name: string }[]; members: Map<string, string>; fields: Field[]; messages: MessageCtx
}) {
```
In `add`:
```tsx
    const next: Action = type === 'set_status' ? { type, label: '' }
      : type === 'send_message' ? { type, templateId: '', recipients: [] }
      : { type: 'generate_pdf' }
```
In the per-action block, replace the `set_status` / `NOT_ACTIVE` ternary with:
```tsx
            {a.type === 'set_status'
              ? <DraftInput key={a.label} label="Status text" hint="Shown next to the record's status." value={a.label}
                  onCommit={(t) => onChange(actions.map((x, j) => (j === i ? { type: 'set_status', label: t.trim() } : x)))} />
              : a.type === 'send_message'
                ? <MessageAction action={a} graph={graph} roles={roles} members={members} fields={fields} templates={messages.templates}
                    canManage={messages.canManageTemplates} onSay={onSay} onChange={(n) => onChange(actions.map((x, j) => (j === i ? n : x)))} />
                : a.type in NOT_ACTIVE && <p className="rnr-caption">{NOT_ACTIVE[a.type as keyof typeof NOT_ACTIVE]}</p>}
```
The caption becomes `Actions run in the order you add them. Generate PDF is recorded on the timeline but not carried out yet: available when Reports ship.`, and the option `<option value="send_message">Send message</option>`. The `ActionList` call:
```tsx
            {edge && <ActionList edgeId={edge.id} actions={edge.actions} onChange={(acts) => onChange(setActions(graph, edge.id, acts))} onSay={onSay}
              graph={graph} roles={roles} members={members} fields={fields} messages={messages} />}
```

`src/workflows/canvas/WorkflowEditor.tsx` — the `<SidePanel … />` gains:
```tsx
      messages={{ templates: templates.data ?? [], canManageTemplates: can('comms.manage') }}
```

`src/App.tsx` — import `TemplatesPage` and `TemplateEditor`; in `Page`:
```tsx
    case 'templates': return <TemplatesPage />
    case 'template': return <TemplateEditor id={route.id} />
```
Nav, after Workflows:
```tsx
            {can('comms.manage') && link('#/templates', 'Templates', route.page === 'templates' || route.page === 'template')}
```

- [ ] **Step 7: Typecheck, lint, unit tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: no errors, no warnings, three more passing tests than before this task (2 preview + 1 timeline), `# fail 0`.

- [ ] **Step 8: Browser check** (Browser pane, `admin.localhost:5173/app/`)

1. Templates lists the five system templates with "System" and no Delete. Edit "Task assigned": put the caret after "Hello", Insert variable → Organisation name → `{{org.name}}` lands at the caret and focus returns to the message. Choose a Leave approval record to preview: subject and text fill in; "Answer: days" appears in the menu. Type `{{nope}}` → the not-a-variable warning lists it. Save → "Saved".
2. Change the subject in a second tab and save; save in the first → "Someone else changed this template." with Reload template.
3. With unsaved edits press Back to templates → "Leave without saving?"; Esc keeps the edit.
4. New template → editor opens; back on the list, Delete it → focus on the "Message templates" heading, status "New template deleted."
5. Workflows → Leave approval → Approved connection: the Send message action shows "Record approved" and "The person who started the record"; remove the recipient → the publish check pins "Add at least one recipient to "Send message"."; add "A person" → admin@alpha.test → the issue clears.
6. A record from before this phase shows "Message not sent: recorded before messages were available." on its timeline.

- [ ] **Step 9: Commit**

```bash
git add src/comms/api.ts src/comms/preview.ts src/comms/preview.test.ts src/comms/TemplatesPage.tsx src/comms/TemplateEditor.tsx src/workflows/canvas/MessageAction.tsx src/workflows/canvas/SidePanel.tsx src/workflows/canvas/WorkflowEditor.tsx src/records/timeline.ts src/records/timeline.test.ts src/App.tsx
git commit -m "feat: add message template editor with variables and preview, and the Send message action editor"
```

---

### Task 9: Frontend — Map view places a clicked step clear of the others

**Owner:** Frontend engineer · **Depends on:** — (Phase 3 QA round 3 observation)

**Files:**
- Modify: `src/workflows/canvas/canvasOps.ts`, `src/workflows/canvas/WorkflowEditor.tsx`
- Test: `src/workflows/canvas/canvasOps.test.ts`

**Interfaces:**
- Consumes: `snap`, `STEP_GAP`, `nextSpot` (Phase 3).
- Produces: `ROW_GAP = 160`, `clearSpot(g: Graph, at: { x: number; y: number }): { x: number; y: number }` — `at` snapped, moved right by `STEP_GAP` until no card is within `STEP_GAP` horizontally and `ROW_GAP` vertically. A drop at the pointer is unchanged (it still goes through `addNode`'s 32px `freeSpot` nudge).

- [ ] **Step 1: Write the failing test** — add to `src/workflows/canvas/canvasOps.test.ts` (import `ROW_GAP` and `clearSpot`):

```ts
test('a step added without a pointer in Map view lands clear of every card', () => {
  const one = addNode({ nodes: [], edges: [] }, 'form', { x: 0, y: 0 }).graph
  assert.deepEqual(clearSpot(one, { x: 16, y: 16 }), { x: 16 + STEP_GAP, y: 16 })
  const two = addNode(one, 'form', clearSpot(one, { x: 16, y: 16 })).graph
  assert.deepEqual(two.nodes[1].position, { x: 16 + STEP_GAP, y: 16 })
  assert.deepEqual(clearSpot(two, { x: 16, y: 16 }), { x: 16 + 2 * STEP_GAP, y: 16 })
  assert.deepEqual(clearSpot(one, { x: 0, y: ROW_GAP }), { x: 0, y: ROW_GAP }) // a row below is already clear
  assert.deepEqual(clearSpot({ nodes: [], edges: [] }, { x: 7, y: 9 }), { x: 0, y: 16 })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test`
Expected: `clearSpot` is not exported (`SyntaxError: The requested module './canvasOps.ts' does not provide an export named 'ROW_GAP'`).

- [ ] **Step 3: Implement** — `src/workflows/canvas/canvasOps.ts`, after `nextSpot`:

```ts
/** Vertical room for a card with two outcome rows. */
export const ROW_GAP = 160
/** Where a step goes when there is no pointer in Map view: the spot asked for, moved right a step at a time until no card is near. */
export function clearSpot(g: Graph, at: At): At {
  const p = snap(at)
  while (g.nodes.some((n) => Math.abs(n.position.x - p.x) < STEP_GAP && Math.abs(n.position.y - p.y) < ROW_GAP)) p.x += STEP_GAP
  return p
}
```

`src/workflows/canvas/WorkflowEditor.tsx` — import `clearSpot`, and in `add` replace the placement:
```tsx
    let at = nextSpot(graph)
    if (view === 'map') {
      const r = board.current!.getBoundingClientRect()
      const p = flow.screenToFlowPosition(screen ?? { x: r.left + r.width / 2 - 104, y: r.top + r.height / 2 - 40 })
      at = screen ? p : clearSpot(graph, p) // a drop lands where the pointer is; a click or Enter must not land on a card
    }
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: one more passing test than before this task, `# fail 0`.

- [ ] **Step 5: Browser check** — Workflows → New workflow → Map view → click Start in the palette, then Form, then Condition (no dragging): the three cards sit side by side, `STEP_GAP` apart, none overlapping; dragging a Form onto the board still lands where it is dropped.

- [ ] **Step 6: Commit**

```bash
git add src/workflows/canvas/canvasOps.ts src/workflows/canvas/canvasOps.test.ts src/workflows/canvas/WorkflowEditor.tsx
git commit -m "fix: place steps added without a pointer clear of existing cards in Map view"
```

---

### Task 10: Frontend — Messages page and end-to-end check

**Owner:** Frontend engineer · **Depends on:** Tasks 4, 5, 7, 8

**Files:**
- Create: `src/comms/MessagesPage.tsx`
- Modify: `src/comms/api.ts`, `src/App.tsx`

**Interfaces:**
- Consumes: `retry_message` and `messages` RLS (Task 1); the worker's statuses and error text (Task 4); `useOrg`, `friendlyError`, `useNotice`, `useFocusAfterRender`, `Skeleton`, `When`.
- Produces: `type MessageFilter = 'all' | 'failed' | 'queued' | 'sent'`, `type QueueRow`, `MESSAGE_LIMIT = 200`, `useMessages(orgId, filter)` under `['messages', orgId, filter]`, `retryMessage(id: string)`; `MessagesPage()`; nav item Messages for `comms.manage`.

- [ ] **Step 1: Data** — append to `src/comms/api.ts`

```ts
import { keepPreviousData } from '@tanstack/react-query'

export type MessageFilter = 'all' | 'failed' | 'queued' | 'sent'
export type QueueRow = {
  id: string; recipient_email: string; subject: string; status: 'queued' | 'sent' | 'failed'
  attempts: number; error: string | null; created_at: string; sent_at: string | null
}
export const MESSAGE_LIMIT = 200 // shortcut: newest 200 per filter; add paging when an org's queue outgrows a screen of failures

export const useMessages = (orgId: string | null, filter: MessageFilter) => useQuery({
  queryKey: ['messages', orgId, filter],
  enabled: !!orgId,
  placeholderData: keepPreviousData,
  queryFn: async () => {
    let q = supabase.from('messages').select('id, recipient_email, subject, status, attempts, error, created_at, sent_at')
      .eq('org_id', orgId!).order('created_at', { ascending: false }).limit(MESSAGE_LIMIT)
    if (filter !== 'all') q = q.eq('status', filter)
    const { data, error } = await q
    if (error) throw error
    return data as QueueRow[]
  },
})
export const retryMessage = (id: string) => supabase.rpc('retry_message', { p_message: id })
```
(Merge `keepPreviousData` into the existing `@tanstack/react-query` import.)

- [ ] **Step 2: Page** — `src/comms/MessagesPage.tsx`

```tsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { friendlyError } from '../ui/errors'
import { Skeleton } from '../ui/Skeleton'
import { When } from '../ui/Time'
import { useFocusAfterRender } from '../ui/useFocusAfterRender'
import { useNotice } from '../ui/useNotice'
import { retryMessage, useMessages, type MessageFilter, type QueueRow } from './api'

const FILTERS: [MessageFilter, string][] = [['all', 'All'], ['failed', 'Failed'], ['queued', 'Queued'], ['sent', 'Sent']]
const STATUS: Record<QueueRow['status'], string> = { queued: 'Queued', sent: 'Sent', failed: 'Failed' }
const EMPTY: Record<MessageFilter, string> = {
  all: 'No messages yet. Task notices and workflow messages appear here once they are queued.',
  failed: 'No failed messages.', queued: 'Nothing waiting to be sent.', sent: 'Nothing sent yet.',
}

export function MessagesPage() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  const [filter, setFilter] = useState<MessageFilter>('all')
  const messages = useMessages(orgId, filter)
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useNotice()
  const focusLater = useFocusAfterRender()

  const retry = async (m: QueueRow) => {
    if (busy.has(m.id)) return
    setBusy((s) => new Set(s).add(m.id))
    setError(null)
    const { error: e } = await retryMessage(m.id)
    setBusy((s) => { const n = new Set(s); n.delete(m.id); return n })
    await qc.invalidateQueries({ queryKey: ['messages', orgId] }) // refetch on failure too: another admin may have retried it
    if (e) { setError(friendlyError(e)); return }
    setNotice(`Retried. The message to ${m.recipient_email} will be sent within a minute.`)
    if (filter === 'failed') focusLater('messages-h') // the row leaves this list
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="page-title" id="messages-h" tabIndex={-1}>Messages</h1>
      <div className="rnr-seg self-start" role="group" aria-label="Show messages">
        {FILTERS.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>
      {error && <p className="rnr-error" role="alert">{error}</p>}
      <p className="rnr-caption" role="status">{notice}</p>
      {messages.isPending && <Skeleton rows={[{ w: '100%', h: 240 }]} />}
      {messages.isError && <p className="rnr-error" role="alert">We could not load the messages. Reload the page.</p>}
      {messages.data && messages.data.length === 0 && <p className="rnr-muted">{EMPTY[filter]}</p>}
      {messages.data && messages.data.length > 0 && (
        <div className="rnr-card p-0 overflow-x-auto">
          <table className="rnr-table">
            <thead><tr><th scope="col">To</th><th scope="col">Subject</th><th scope="col">Status</th><th scope="col">Problem</th><th scope="col">When</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {messages.data.map((m) => (
                <tr key={m.id}>
                  <td className="rnr-sticky-first">{m.recipient_email}</td>
                  <td>{m.subject}</td>
                  <td><span className="rnr-status">{STATUS[m.status]}{m.attempts > 1 && <span className="rnr-caption rnr-num"> · {m.attempts} tries</span>}</span></td>
                  <td>{m.error ?? ''}</td>
                  <td><When iso={m.sent_at ?? m.created_at} /></td>
                  <td>
                    {m.status === 'failed' && (
                      <button type="button" className="rnr-btn rnr-btn-secondary" aria-busy={busy.has(m.id)} onClick={() => void retry(m)}>
                        {busy.has(m.id) && <span className="rnr-spin" aria-hidden="true" />}{busy.has(m.id) ? 'Retrying…' : 'Retry'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

`src/App.tsx` — import `MessagesPage`; in `Page`:
```tsx
    case 'messages': return <MessagesPage />
```
Nav, after Templates:
```tsx
            {can('comms.manage') && link('#/messages', 'Messages', route.page === 'messages')}
```

- [ ] **Step 3: Typecheck, lint, unit tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: no errors, no warnings, same pass count as after Tasks 7–9, `# fail 0`.

- [ ] **Step 4: End-to-end browser check** (spec §11 "one end-to-end flow per phase"; `supabase db reset`, `supabase functions serve --env-file supabase/functions/.env.local` with `EMAIL_TRANSPORT=mailpit`, `pnpm dev`; Browser pane, one fresh tab per user: `member.localhost:5173/app/`, `admin.localhost:5173/app/`, `beta.localhost:5173/app/`; Mailpit at `http://127.0.0.1:54324`)

1. `member@alpha.test` starts Leave approval with 3 days. Admin's bell goes to 1 without a reload. Within a minute Mailpit has "New task: Leave approval: …" to admin@alpha.test whose link opens `http://localhost:5173/app/#/tasks/<id>`.
2. Admin claims and approves. The member's bell goes to 1 ("Approved: …"); Mailpit has the Record approved email to member@alpha.test; the record timeline reads "Sent “Record approved” to 1 person".
3. Member → Settings → untick "Record approved". A second record approved by the admin → the member's bell still gets the notice; Mailpit gets no second Record approved email.
4. Overdue: as the local `postgres` user run `update tasks set due_at = now() - interval '1 minute' where status = 'open';` for a third record's open task. Within two minutes the admin's bell shows "Overdue: …" once; after two more minutes still once; `select overdue_notified_at from tasks …` is set.
5. Failure path: stop Mailpit (`docker stop supabase_inbucket_reportnoreport-v2`, or point `MAILPIT_URL` at a closed port and restart serving), start a record → Messages shows the Task assigned row as Queued with "Could not reach the email service: …" and its tries rising; after the fourth try it is Failed with that text. Restart Mailpit, press Retry → "Retried. The message to admin@alpha.test will be sent within a minute.", focus stays sensible, and the row becomes Sent.
6. Two admin tabs on Messages → Failed: tab A retries a row; tab B presses Retry on the same row → "Only failed messages can be retried. Reload to see the latest status." and the list refreshes without the row.
7. Invite `parent@alpha.test` from Members → Mailpit shows "You are invited to join Alpha School" linking to `http://localhost:5173/app/`.
8. `owner@beta.test`: Templates shows Beta's own five templates only; pasting an Alpha template URL shows "This template does not exist"; Messages shows none of Alpha's rows; the bell shows none of Alpha's notifications. `viewer@alpha.test`: no Templates or Messages in the nav; `#/messages` goes to the inbox.
9. 375px: Messages table scrolls inside its card with the To column sticky; the template editor stacks the preview under the form; no page-level horizontal scroll. Reset the viewport.

- [ ] **Step 5: Commit**

```bash
git add src/comms/api.ts src/comms/MessagesPage.tsx src/App.tsx
git commit -m "feat: add Messages page with failures and retry"
```

---

## Self-review notes

- §8 tables → Task 1: `message_templates` (`org_id`, `name`, `channel` email/in_app, `subject`, `body`, `is_system`, + `kind`, decision 5), `messages` (`org_id`, `template_id`, `campaign_id`, `record_id`, `recipient_user_id`, `recipient_email`, `channel`, `status` queued/sent/failed, `attempts`, `error`, `sent_at`, `delivered_at`, `opened_at`, `clicked_at`, `bounced_at`, `complained_at`, + `subject`/`body_html`/`body_text`/`next_attempt_at`/`provider_id`, decisions 2 and 6), `notifications` (`user_id`, `org_id`, `title`, `body`, `link`, `read_at`, + `kind`), `notification_prefs` (`user_id`, `type`, `email_enabled`).
- §8 variables → Task 2 `VARIABLES` + `render`: `{{record.title}}`, `{{record.data.<key>}}`, `{{step.assignee.name}}`, `{{link.task}}`, `{{link.record}}`, `{{org.name}}`, `{{recipient.name}}` (+ `{{link.invite}}`, decision 10); values HTML-escaped (decision 3); insert menu + preview against a real record → Task 8.
- §8 system templates (seeded, editable): Task assigned, Task overdue, Record approved, Record rejected, Invite to org → Task 1 `seed_message_templates` + `orgs_seed_templates` + backfill; editable through RLS for `comms.manage`, never deletable, type fixed.
- §8 recipients for `send_message` (role, user, record starter, assignee of step X, an email field) → Task 2 `Recipient` + publish check, Task 3 `sendAction` (decision 9), Task 8 `MessageAction`.
- §8 automatic: task created → Task assigned (Task 3 `createTask` → `notifyTask`); cron Task overdue once per task (Task 4 `queueOverdue`, `tasks.overdue_notified_at`, decision 8).
- §8 delivery: every send is a queued row (Tasks 3 and 5), a worker sends it, 3 retries with exponential backoff, then `failed` with the error on the Messages page (Task 4, decision 7; Task 10). §8 mute email per type, in-app always (decision 4; Task 1 prefs, Task 3 `deliver`, Task 7 Settings); Realtime bell (Task 1 publication + RLS, Task 7 `useNotificationFeed` + `NotificationBell`). §8.1 Campaigns is Phase 6: only the columns it needs are created.
- §10 → the browser never renders what is sent (server render at enqueue; the preview is display-only text); permission is enforced by RLS and `retry_message`; messages and overdue failures carry explicit `failed` / error text or are retried, never dropped; a `send_message` that cannot run stops the record with the reason. §10 webhooks belong to Phase 6.
- §11 → unit: template rendering + escaping under node and Deno (Task 2), preview context and timeline text (Task 8), canvas placement (Task 9); pgTAP: RLS allow/deny per permission, cross-org, preference privacy, retry guard, Realtime publication, cron job (Task 1); Deno: engine notifications and `send_message` (Task 3), message retry + backoff + terminal failure, overdue once under overlap, transports and boot validation (Task 4), invite rendering (Task 5); real-Postgres overdue race and Realtime isolation as opt-in tests (Tasks 1, 4); one browser end-to-end flow (Task 10). §12 phase 4 "templates, in-app bell, task emails, Messages page" → Tasks 1–10. §15 → designer spec first (Task 6); tokens and `rnr-*` classes only.
- Review Focus 1 → Tasks 2, 3, 5 tests; 2 → Task 4 tests + Task 1 retry tests; 3 → Task 4 fake and real-Postgres tests; 4 → Task 3 test + Task 1 pgTAP; 5 → Task 1 pgTAP; 6 → Task 1 pgTAP + Realtime test.
- Phase 3 QA observation (Map view overlap) → Task 9, reusing `STEP_GAP` and `nextSpot`; QA defect classes → Global Constraints list, each with its task.
- Expected counts: `pnpm test` 101 → 116 (Task 2) → +2 (Task 7) → +3 (Task 8) → +1 (Task 9) = 122; `deno test supabase/functions` 100 + 1 ignored → +1 ignored (Task 1) → 115 (Task 2) → 121 (Task 3) → 132 + 3 ignored (Task 4) → 134 + 3 ignored (Task 5); `supabase test db` 119 in 6 files → 158 in 7 files (Task 1).
- Out of scope, by the spec: SMS / WhatsApp, campaigns, delivery/open/click tracking, the Resend webhook (Phase 6). Deferred with a `shortcut:` note: 500 people per message, 50 overdue tasks and 50 emails per minute, newest 20 notifications in the dropdown, newest 200 messages per filter, `generate_pdf` still pending (Phase 5).
