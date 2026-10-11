# Phase 6 (Campaigns) QA, round 1

Verdict: **FAIL** (2 major, 4 minor, 1 note). Scope: spec §8.1, §10, §11, §15, plus the unsubscribe redesign (94f119e, 2d75548), against `git diff 880641b~1..HEAD`.

## Checks run

| Check | Result |
|---|---|
| `pnpm test` | 234 pass, 0 fail |
| `pnpm lint` | clean (oxlint, 0 warnings or errors) |
| `pnpm build` | ok, `check-dist: ok` |
| `DENO_NO_PACKAGE_JSON=1 deno test --allow-read supabase/functions` | 237 passed, 0 failed, 10 ignored (the env-gated ones) |
| `supabase test db` | 11 files, 255 tests, PASS |
| Env-gated: `advance/race` 2, `send-messages/race` 1, `resend-webhook/db` 1, `send-campaigns/db` 3, `run-report/visibility` 2, `_integration/realtime` 1 | all pass |

Live checks: functions served with `--env-file supabase/functions/.env.local`. The CLI does not auto-load `.env.local`, so without the flag `resend-webhook` dies at boot (README step is accurate, but easy to miss).

## Findings

| ID | Severity | Area | Evidence | Expected | Actual | Owner |
|---|---|---|---|---|---|---|
| QA-P6-1 | Major | send-campaigns, audience cap (Review Focus 4) | Seeded BigRole with 10,002 active members. Opted out `big1` and `big2`. Scheduled and ran. Result: `recipients 9999`, `excluded {unsubscribed: 2}`, status `sending`, no error. `zzz@load.test` has no message. | A role of more than 10,000 people fails with the "more than 10,000 people" sentence, or every eligible person is sent to. Never a silent drop. | `roleMembers` reads only `MAX_AUDIENCE + 1` rows (ordered by email) before opt-outs are applied. `planRecipients` then sees at most 10,000 left, so the cap check passes and everyone past row 10,001 is silently dropped. The Review Focus test only covers a role with no opt-outs. | Backend |
| QA-P6-2 | Major | Messages page, known open item from the UX audit | Admin at `#/messages` with the 2,999-recipient campaign sent: 200 rows, all campaign mail, no pager, no campaign or system filter, no campaign label on a row. | Large campaign mail does not hide system mail. Failures stay reachable (the page promises "failures stay until you retry them"). | Correction to the audit wording: the status filters query `status = x limit 200`, so Failed sees the newest 200 failed messages, not the newest 200 overall. The effect is the same. A campaign with more than 200 failures hides every older system failure (invite, task) with no way to reach or retry it. Queued and All are buried at once by a campaign. | Frontend, plus a small `campaign_id` filter in the API |
| QA-P6-3 | Minor (risk on hosted) | Edge CPU limit, 10,000 campaign | 10,000-recipient run locally: first call returned `WORKER_LIMIT`, logs show "CPU time soft limit reached", status stayed `scheduled`. A later cron run moved it to `sending` with 9,999 recipients. Prepare does about 20,000 HMACs and 10,000 renders in one request. | A 10,000-person campaign starts reliably. | Works only after a retry locally. On hosted a hard CPU kill rolls the transaction back and the campaign stays `scheduled` forever, retried every minute, with no `failed` state and no reason. No guard or test covers this. | Backend |
| QA-P6-4 | Minor | Stats display | `Load`: 1 delivered of 2,999 shows "Delivered 0%" (0.03% rounds to 0.0%) beside "Opened 100%, 1 of 1 delivered". | A non-zero share is not shown as 0%. | `pctText` rounds to one decimal and prints `0%` for a non-zero value. Opened and clicked percentages (of delivered) read as 100% next to Delivered 0%. | Frontend |
| QA-P6-5 | Minor | Recipients list vs follow-up | Recipients filter "Not opened" is `status = sent, opened_at is null, bounced_at is null`. The `not_opened` follow-up also excludes `complained_at`. | The list is the people the follow-up would reach. | Complained recipients show under "Not opened" but are never sent the follow-up. | Frontend |
| QA-P6-6 | Minor | Docs and test coverage | README Tests list omits `send-campaigns/db.test.ts` and `resend-webhook/db.test.ts` (CI runs them). `resend-webhook` also does not validate `data.email_id` is a string: an event without it would reach `postgres` as `undefined` and answer 500, so Resend retries it forever. The unsubscribe CORS origin limit has no test. | README lists every env-gated test. A signed event with a bad shape is answered 400. | As described. | Backend |
| QA-P6-7 | Note | Local runtime | `supabase functions serve` answers every function with `Access-Control-Allow-Origin: *`, even `resend-webhook` and `send-campaigns`, which set no CORS headers. | CORS limited to the APP origin. | Could not verify the origin limit live. The code in `unsubscribe/index.ts` sets only `new URL(APP_URL).origin` with `Vary: Origin`, and the hosted gateway adds nothing. Verified by reading only. | none |

## Passed (live or by test)

- **comms.broadcast gate.** Member, viewer and Beta owner: no campaigns, campaign messages, stats or daily rows. Insert, schedule, cancel, completion and `wake_send_campaigns` each return 403 (42501). Anon is refused on the RPCs. Cross-org `campaign_stats` returns an empty set. Admin cannot write `status` (permission denied) and cannot cancel a `sending` campaign. Members cannot open `#/campaigns` (redirected to Inbox).
- **Webhook.** Missing signature, bad signature, a 1,000-second-old timestamp, a missing `svix-id`: all 401. Unknown provider id: 200 `matched: false`. A replay is idempotent. An older event moves `opened_at` to the earlier time (earliest wins). A click at a 2999 timestamp is clamped to now. A complaint also opts the address out.
- **Unsubscribe.** Forged, tampered, other-message and missing tokens: 400. The one-click form POST works. Reuse is idempotent. The GET reports `already: true`. A deleted message gives 404 and the page says "This link no longer works". There is no message retention job, so "expired message" can only mean deleted. The `org` string `<img onerror>...<b>Co</b>` renders as text on every page state and in the document title. The function down shows "Try again later". No raw error leaks. Opt-outs: a later campaign excluded 2 unsubscribed addresses. Transactional mail does not read `email_optouts` (matches the plan).
- **Headers and footer.** Mailpit mail carries `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. The footer link opens the public page. No "we" in `src`, `supabase/functions`, `unsubscribe.html` or the footer. No inline `style=` in the new screens (the email footer inlines styles, which is correct for mail).
- **Exactly once.** Three simultaneous `send-campaigns` calls: one `started: 1`, the others `started: 0`. One message per address.
- **Batching.** 2,999 recipients (3,000 seeded, 2 opted out, 1 existing): sent 846, 784, 1,000 per minute, then `sending` moved to `sent` at 14:19. Nothing dropped. Excluded counted.
- **Failures.** Sender without comms.broadcast, sender removed (`sent_by` null) and an audience over 10,000 each give `failed` with the plain sentence. The report page shows "Edit and schedule again", which reopens the draft with its settings.
- **Follow-ups.** `not_opened` and `not_completed` each reached the one expected person. A follow-up on a sent campaign works from the report page.
- **UI.** Review dialog closes on a real Esc. Report shows tiles, 7-day chart, filters, paged recipients (50, "Showing 1–50 of 2,999") and the CSV button. Settings toggle opts in and out and writes `email_optouts`. At 375px there is no page-level horizontal scroll (the table scrolls inside its card). Console clean. Viewport reset to desktop.
- **Code review.** No file over 800 lines apart from generated `database.types.ts` (851). The new `shortcut:` notes (`DUE = 5`, `MAX_BATCHES`, `CAMPAIGN_LIST_LIMIT`, `MESSAGE_LIMIT`) state limits and upgrade triggers. CI file includes the new env-gated tests. No secrets printed.

## Not verified

- Resend 429 pause, only by unit test (`transport.test.ts` and the `send-messages` handler tests); no live provider.
- CSV file contents (download not inspected in the pane); formula guard relies on Phase 5 `toCsv` and its tests.
- Completion percentage with `records.view_all` withheld: covered by `11_campaigns.test.sql`, not clicked through.

## Test data left behind

Local DB holds about 13,000 `load.test` members and campaign messages, plus the Alpha org name restored to "Alpha School". `supabase db reset` clears it. `supabase functions serve` is still running in the background.

## Result

**FAIL.** Fix QA-P6-1 and QA-P6-2 (and rate QA-P6-3 for hosted) before Phase 6 passes.

---

# Round 2 (recheck of 1eae435, ff2cf28, 807b5ea, 007705b)

Verdict: **PASS** (no new blocker or major). Fresh `supabase db reset` (new migrations 20261018000002/3 applied), functions served with `--env-file`.

| ID | Status | Evidence |
|---|---|---|
| QA-P6-1 | Fixed | BigRole 10,002 members + 2 opt-outs: `recipients 10000`, `unsubscribed 2`, 10,000 messages queued, none lost. Adding one member (10,003 + 2 opt-outs, 10,001 eligible): campaign `failed` with the "more than 10,000 people" sentence, nothing queued. |
| QA-P6-3 | Fixed | 10,000-recipient run through the edge runtime: 0.77 s, `attempts 1`, `claimed_until` set, no WORKER_LIMIT. Simulated kill (attempts 1, lease in the past): retried, `attempts 2`, started. Attempts 3 with lease in the past: `failed` with "Starting this campaign was interrupted three times" (`attempts 4`). A live lease is not re-run by a second call. No render sentinel (`@@rnr`) in any of 10,000 bodies, subjects or text; every message has its own unsubscribe link and the function-URL header link. |
| QA-P6-2 | Fixed | Messages has Source System/Campaign/All (default System, shows the old system failure that was buried before). Campaign source with 13,001 rows: "Showing 7,201–7,250 of 13,001" at page 145, 50 rows per page, row label "Campaign: Pager" linking to `#/campaigns/<id>`. Ordering has an id tiebreak. Last page not clicked through (pager maths covered by `messageQuery.test.ts`). |
| QA-P6-4 | Fixed (tests) | `pctText(pct(1, 2999))` is `<1%`; tiles show `<1%` and `100%` side by side. |
| QA-P6-5 | Fixed (code and tests) | `NOT_OPENED` is shared and includes `complained_at is null`; `followup.test.ts` passes. |
| QA-P6-6 | Fixed | Signed event without `email_id`: 200 `{"ignored":true,"reason":"This event has no usable email id."}` (was 500). README lists the env-gated tests; CI already ran them. |

Checks: `pnpm test` 241 pass; `pnpm lint` clean; `pnpm build` ok; Deno 243 passed, 14 ignored (env-gated); `supabase test db` 12 files, 262 pass; env-gated all pass (advance/race 2, send-messages/race 1, resend-webhook/db 1, send-campaigns/db 7, run-report/visibility 2, realtime 1). Diff `8baf3c0..HEAD`: no new inline styles, `innerHTML`, `console.log` or secrets.

New findings: none. Note: `claimed_until` stays set after a successful start (harmless, status is no longer `scheduled`). Local DB again holds about 23,000 `load.test` rows; `supabase db reset` clears them.
