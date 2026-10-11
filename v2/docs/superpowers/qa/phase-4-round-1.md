# Phase 4 QA, round 1 (Communication)

Verdict: **FAIL** (1 major, 6 minor, 0 blocker).

## Check results

| Check | Result |
|---|---|
| `supabase db reset`, then 30 s warm-up, `functions serve` restarted | ok |
| `pnpm test` | 141 pass, 0 fail |
| `pnpm lint` (oxlint) | clean |
| `pnpm build` | passes (chunk-size warning only), `check-dist: ok` |
| `DENO_NO_PACKAGE_JSON=1 deno test supabase/functions` | 134 pass, 0 fail, 3 ignored (the DB-backed tests) |
| advance race test (real Postgres) | 1 pass |
| send-messages race test (real Postgres) | 1 pass |
| Realtime test (`_integration/realtime.test.ts`) | 1 pass |
| `supabase test db` (right after reset) | 7 files, 158 tests, PASS. Re-run after my manual testing FAILS 6 assertions (06 and 07 count open records, queue rows, prefs); that is leftover test data, not a defect. |

## Findings

| ID | Severity | Area | Evidence | Expected | Actual | Owner |
|---|---|---|---|---|---|---|
| QA-P4-1 | major | backend | Seeded 501 active Viewer members, published Send message `{role: Viewer}`, approved a task. Event: `emails: 500, people: 500, notices: 500, skipped: 0`; record `done`, error null. `pgStore.peopleInRole` has `limit 500`, so `sendAction`'s `people + addresses > MAX_PEOPLE` check can never fire for a role. No test covers the cap (`grep 500/MAX_PEOPLE` in `*.test.ts` finds nothing). | `notify.ts` says "a larger Send message stops the record"; plan Review Focus 9: a message over 500 people stops the record with the reason. Nobody is dropped silently. | The 502nd person (and any beyond 500) gets no notice and no email, the timeline says "Sent to 500 people", and nothing flags it. | backend |
| QA-P4-2 | minor | frontend | Messages, Failed filter. Another admin retried the same message (status now queued); I pressed Retry. Alert "Only failed messages can be retried. The list now shows the latest status." appears and the row disappears, but `document.activeElement` is `body`. The success path correctly focuses `#messages-h`. | Plan constraint (QA-8): focus moves to the page heading when the row that triggered the action disappears. | Focus is lost on the already-retried path. | frontend |
| QA-P4-3 | minor | backend | Mailpit stopped, message queued, four cron runs. `messages.error` = "Could not reach the email service: error sending request for url (http://host.docker.internal:54324/api/v1/send)...". `sendOne` stores `e.message` of the thrown fetch error; the Messages page prints it to every `comms.manage` holder. | Plain-language reason without raw exception text or internal URLs (spec section 10, no raw error leaks). | Raw transport exception, including the internal host and path, is stored and shown. | backend |
| QA-P4-4 | minor | frontend | `NotificationBell.readOne`: `await markRead(id) // fire and forget`; the `{ error }` it returns is never read. | A failed mark-read is reported or retried (no swallowed errors). | The notification stays unread with no message; only the "mark all" path reports failure. | frontend |
| QA-P4-5 | minor | frontend | Inline styles added in Phase 4: `MessagesPage.tsx` and `TemplatesPage.tsx` (`style={{ padding: 0, overflowX: 'auto' }}`), `TemplateEditor.tsx` (`overflow: 'visible'`), `SettingsPage.tsx` (`marginLeft: var(--space-6)`). | Plan Global Constraints: tokens and `rnr-*` classes only. Earlier phases already have inline styles, so this is consistent drift, not new. | Four new inline `style` props. | frontend |
| QA-P4-6 | minor | backend | After both race tests, `notifications` still holds rows for the test records ("Leave approval: Ada" for admin, "Approved: ..." for member): `advance/race.test.ts` deletes only the record (line 34). The send-messages race test does delete its notifications. pgTAP counts also assume a clean seed. | Race tests leave the local database as they found it. | Residue appears in the seeded users' bells after running the documented commands. | backend |
| QA-P4-7 | minor | frontend | Templates list shows "Invite to org" as "Email and in-app", and the editor hint is correct ("Invitations are always emailed"). Invitees have no user row, so no in-app notice is ever created. | Channel column for Invite to org reads "Email". | Reads "Email and in-app". | frontend |

## Verified, no defect

- **Test and tool counts** above are real, run on this tree after `db reset`.
- **Cross-org and RBAC (REST, user JWTs, all five seed users):**
  - Beta cannot read, update or delete Alpha templates (updates and deletes return `[]`) and cannot insert into Alpha (403).
  - member and viewer cannot insert (403) and update or delete nothing.
  - System templates cannot be deleted by the owner (0 rows), cannot change `kind` or `is_system` ("A template cannot change its type."), and cannot be inserted as system (403).
  - Moving `org_id` returns 403.
  - member, viewer and beta read 0 `messages`; admin and owner read only their own org.
  - `messages` and `notifications` have no client insert path (403); notifications update only `read_at` (403 on any other column).
  - Another user's notification is invisible (`[]`) and cannot be marked read.
  - Prefs: own row ok, another user's row 403, `type: invite` 400, other users' prefs read as `[]`.
  - `retry_message` and `seed_message_templates` are 401/403 for anon, member and beta.
  - Audit rows exist for `template.create/update/delete` and `message.retry`.
- **Realtime:** the integration test passes (a second signed-in user with no filter receives nothing); live bell arrival confirmed in the browser: unread 12 to 13 and the polite status "New notification: ..." within 2.5 s with the panel closed.
- **send-messages without the cron secret:** no header, wrong secret, empty bearer, and a signed-in user JWT all return 401 "Not allowed."
- **Injection:** template subject with `\r\nBcc: evil@x.test <b>` plus body with `<script>`, `<a href="javascript:">` and record title/answer `<script>...<img onerror>&"'`. Mailpit HTML part: every literal and value escaped, only system `link.*` values are anchors, `<p>`/`<br>` structure intact. Text part: values as typed. Subject collapsed to one line, Bcc and Cc empty. In-app notification and the Inbox, bell, Messages and template preview render the text with no `script` or `img` element in the DOM. A value containing `{{org.name}}` is not expanded. An unknown variable renders empty and is warned about in the editor.
- **Recipient resolution:** a `{user}` from another org, a `{field}` with no valid email, and a template id from another org each stop the record in `error` with a plain reason ("found nobody to send", "template no longer exists"); a deleted template, a missing template id and a cross-org template id all give the same message. A valid email answer sends to that address only. Starter recipient sends one email and one notice.
- **Invites:** `invite-member` queues the "Invite to org" message with a link to the app sign-in only; no `token`, `otp` or `access_token` text in any `messages` row; member and Beta get 403.
- **Delivery:**
  - Permanent 4xx (invalid address, Mailpit 400) fails at once on attempt 1 with the error.
  - Mailpit stopped: attempts 1, 2, 3 queue 60 s, 120 s, 240 s ahead, attempt 4 is `failed` with the error; a fifth run does nothing.
  - `retry_message`: 403 for member and Beta, 204 for owner, 400 "Only failed messages can be retried." on a queued row; after Mailpit restarts the message is sent with a provider id.
  - Four concurrent cron runs on one overdue task: exactly one notice and one email; a second set after clearing `overdue_notified_at` queued exactly one more.
  - Muting `task_overdue` and `task_assigned`: in-app notice still created, no email queued; unmuting restores email.
  - Resend path unit tests cover 429 retry and `Idempotency-Key = message id`; the key is read once at boot, matched against `^re_...`, and never logged.
- **Phase 3 pending events:** timeline shows "Message not sent: recorded before messages were available." with an X icon; a real send shows "Sent “Record approved” to 1 person" with "1 email queued for delivery."
- **UI, Claude Browser pane (admin tab, member tab, Beta tab; REST evidence for viewer):**
  - Bell: opens, items link to `#/tasks/...` and mark read (12 unread after one click), Mark all as read focuses the panel heading and announces; real Esc closes the panel and returns focus to the bell.
  - Settings mute persists to `notification_prefs`.
  - Templates: Insert variable by keyboard (Enter, ArrowDown, Enter, Esc returns to the button), preview with a hostile record shows text only, conflict ("changed by someone else" then Reload template focuses the heading), unsaved-changes dialog and delete dialog both close on real Esc, delete confirms and lands on the list with "deleted." announced and focus on the heading.
  - Workflow editor: Send message action shows templates and role/person/starter/step/answer recipients; saving a published workflow with an empty Send message is refused with "Choose a message template".
  - Messages: Failed filter, row Retry, success path focuses `#messages-h`.
  - member and viewer have no Templates or Messages tabs and `#/templates`, `#/messages`, `#/templates/<id>` redirect to the inbox; Beta sees only its own templates and messages, an Alpha template id shows "This template does not exist".
  - 375 px: bell panel fits (16 px gutters), no page-level horizontal scroll on Templates, editor, Messages, Settings or the workflow editor (tables scroll inside their cards). Viewports reset to desktop.
  - Console: no unexpected errors (only the 400/401/403/409 responses my negative tests provoked).
- **Code review:** no file over 800 lines (largest changed source `WorkflowEditor.tsx` 347); `shortcut:` notes all name limit and upgrade point; trigger functions revoked from clients; `retry_message` checks `comms.manage` itself; every new server message has a `friendlyError` entry; no secrets in logs or `VITE_` variables.

## Not covered

- Viewer was checked by REST and route-guard logic, not a separate browser session (same permissions as member for comms).
- Real Resend delivery (no key); Resend behaviour is covered by unit tests with an injected fetch.
- Leftover local data from this run (edited "Task assigned" template, test records, prefs) remains until the next `supabase db reset`.

# Round 2 (recheck of cea5b35 backend, ef1a615 frontend)

Verdict: **PASS** (0 blocker, 0 major; no new findings).

After `supabase db reset`, 30 s wait, `functions serve` restarted:

| Check | Result |
|---|---|
| `pnpm test` | 142 pass, 0 fail |
| `pnpm lint` | clean |
| `pnpm build` | passes, `check-dist: ok` |
| `deno test supabase/functions` (with DB url) | 138 pass, 0 fail, 1 ignored (Realtime, run separately) |
| advance and send-messages race tests, new 501-holder DB test | pass (inside the 138) |
| Realtime test | 1 pass |
| `supabase test db` | 7 files, 158 tests, PASS |

| ID | Status | Evidence |
|---|---|---|
| QA-P4-1 | fixed | Live: role of 500 holders (499 seeded plus viewer) sends: 500 emails, 500 notices, record done. 501 holders: record `error` "would send ... to more than 500 people. Ask a workflow manager to narrow its recipients.", 0 messages queued. |
| QA-P4-2 | fixed | Already-retried Failed-filter row: focus lands on `H1#messages-h` (was body). |
| QA-P4-3 | fixed | Mailpit stopped: stored error is "The email service could not be reached." (no URL); detail goes to the server log. |
| QA-P4-4 | fixed | Forced a real failure by revoking UPDATE on `notifications` from `authenticated`, then clicking a bell item: status "We could not mark your notifications as read. Try again.", unread stayed 3 (optimistic read rolled back), navigation still worked. Grant restored. |
| QA-P4-5 | fixed | No inline `style={{` remains in Phase 4 files; `.rnr-table-card`, `.rnr-card-open`, `.rnr-pref-caption` classes. Variable menu is not clipped (form overflow visible). |
| QA-P4-6 | fixed | `notifications` count is 0 after all race tests. |
| QA-P4-7 | fixed | `channelLabel` returns "Email" for the invite template. |

Regression sweep of `git diff 4e07578..HEAD -- v2` (16 files): nothing found. Note (not a finding): a role-assigned task notification (`notifyTask`) still notifies the first 500 holders of a larger role; this is the documented `shortcut:` and not a Send message.
Leftover local test data remains until the next `db reset`.
