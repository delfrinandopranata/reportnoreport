# Phase 5 (Reports) — QA round 1

Verdict: **FAIL** (1 major, 6 minor, 0 blocker). Branch `feat/v2-workflow-platform`, diff `95e49b2~1..HEAD`.

## Checks run
| Check | Result |
|---|---|
| `pnpm test` | 191 pass, 0 fail |
| `pnpm lint` (oxlint) | clean |
| `pnpm build` (tsc, vite, check-dist) | ok (chunk-size warning only) |
| `DENO_NO_PACKAGE_JSON=1 deno test --allow-read supabase/functions` | 186 pass, 0 fail, 5 ignored (the env-gated ones) |
| env-gated: advance/race (2), send-messages/race (1), run-report/visibility (1), _integration/realtime (1) | all 5 pass with README env vars |
| `supabase test db` | 9 files, 205 tests, PASS |

## Findings
| ID | Severity | Area | Evidence | Expected | Actual | Owner |
|---|---|---|---|---|---|---|
| QA-P5-1 | major | render-pdfs CPU | Record with two 10,000-character answers (reason + approval comment, random words, the max `long_text`). Edge runtime log: `CPU time hard limit reached ... request has been cancelled by supervisor`; job stayed `queued`, attempts=1 (lease). One 10,000-char answer alone finishes in 1.6 s with CPU soft-limit warnings; the repeated-text 6,000-char record also logged soft-limit hits. | Review Focus 4 / commit 0e03a5e: long answers render inside the Edge CPU limit; a PDF always completes or fails fast with a reason. | Realistic max-length content kills the worker. The job sits "queued" until the 5-min lease expires, is retried into the same kill, and after 3 attempts fails with the generic "could not be made" text. An open record on a `generate_pdf` action is then put in `error`, and no retry can ever succeed. Unit tests use repeated text, so the word-width cache hides the cost. | backend |
| QA-P5-2 | minor | PDF fonts | Name "Zoë இந்து 日本 Ng" renders `Zoë [box][box]... Ng` in the PDF. grep for Tamil/CJK in README, design spec and `render-pdfs/` finds no note. | Plan decision 2: a `shortcut:` note with an upgrade path, and the limitation documented. | Silent boxes, no `shortcut:` comment, no README line. (The UTC and 10,000-record shortcuts are noted.) | backend |
| QA-P5-3 | minor | run-report speed | 10,000 visible records: 200 in 22 s; 10,001: 413 after 17 s (it reads everything before refusing). Local, 10 sequential keyset pages through `record_visible`. | A report or widget answers in a few seconds. | The dashboard fires one run-report per widget, so at the ceiling each widget spins about 20 s. Correct and complete; slow. | backend |
| QA-P5-4 | minor | group keys | Group by `days` with one record holding `"3"` and one holding `3` gives two groups, `('3',1)` and `(3,1)`, both labelled "3" (CSV too). | One group per displayed key (plan decision 10: key is the display value). | Duplicate-looking rows. Group id is `typeof:value`. | backend |
| QA-P5-5 | minor | docs / signed URL | `src/reports/api.ts` signs for 300 s. Plan decision 7 still says 60 s. The designer's row 18 asked for the plan text to be corrected. Any user who can see the record can also ask storage for `expiresIn` of days (99999 accepted). | Plan matches the code. | Plan text not corrected. The long-expiry point is inherent to Storage and needs no PDF-specific policy (viewer, other-org and path-guess requests all 404 or 400). | planner |
| QA-P5-6 | minor | saved_reports | A `reports.manage` user inserted a saved report with 20,000 columns through PostgREST (201). run-report answers 409 "Use at most 20 columns", so nothing leaks. | DB-level bound, or none needed because the runner re-validates. | No CHECK on `columns`/`filters` length; the audit trigger also stores the whole blob. | backend |
| QA-P5-7 | minor | CI | `ci-v2.yml` does not run `visibility.test.ts`, the race tests or `realtime.test.ts`. | Review Focus 1 (visibility) guarded in CI. | Only local runs exercise them. | devops |
| QA-P5-8 | minor | UI (dashboard) | A span-1 widget at 1363 px: title truncates to "Leave da…" beside "Open report". | Title readable or the link moved. | Truncated title, no tooltip. | uiux |

## Verified, no defect
- **Run-report visibility** (real JWTs): owner (view_all) 8 of 8; member only the records they started (6 of 8); viewer 0; beta owner gets 403 on Alpha's org, 404 for an Alpha workflow or saved report under Beta's org; Alpha owner gets 404 for Beta's workflow. Crafted column or filter paths (`__proto__`, `constructor`, SQL text) and unknown operators return 400 with a plain sentence. 21 and 5,000 columns return 400. The 413 and 10,000 boundary: exactly 10,000 returns 200; 10,001 returns 413 (JSON and CSV). The 413 carries a sentence and no totals, as the plan specifies.
- **Group and sum:** nulls, `"4"`, `true` left out and counted, negatives, 0.1 + 0.2 = 0.3 (grand total 5.8), an empty group sums to null, "No answer" sorts last. A page past the end returns no rows and the full totals. Page 0 returns 400.
- **CSV:** BOM, CRLF, quoted comma/quote/newline, Unicode intact, `=`, `+`, `@` and a typed `-5` guarded, numbers (-2.5) not guarded, headers guarded.
- **RLS and RPC:** member/viewer/beta cannot write saved_reports, templates or widgets (42501 or 0 rows); beta cannot read, edit or delete Alpha rows; cross-org FKs refuse; no direct writes to record_pdfs or widget updates; `wake_render_pdfs` and anon `request_record_pdf` are denied; viewer and beta `request_record_pdf` on an Alpha record is "Not allowed".
- **PDF storage:** member, owner and admin sign Alpha's PDF; viewer and beta get 404; direct GET for beta and viewer is refused; bucket listing shows only the caller's visible rows; upload and delete as owner are refused; the render-pdfs endpoint returns 401 without the cron secret.
- **PDF content:** the 3-page A4 render shows all answerable types, a hidden field omitted, a missing field marked "no longer on the form", multiple signature images, repeating group rows, a negative shown as −3, UTC times, sign-off block, running head, "Page n of N", Inter embedded and subset, and the OFL licence file committed.
- **Failure paths:** a missing signature fails at once with a plain sentence; an open record goes to `error`, a closed record stays `done` and shows "Try again" in the UI; the requester gets a notice; two concurrent workers render one job once; `request_record_pdf` is idempotent while queued.
- **Dashboard:** reorder through the keyboard (focus stays on the handle, live-region announcement); a stale save after another tab added a widget shows "The dashboard changed" with "Reload dashboard"; RPC rejects stale versions and bad spans; Esc closes the options menu (focus returns to the trigger) and the Add widget dialog (focus returns to Add widget); the chart has a table alternative and a text summary.
- **Template editor:** a concurrent edit shows "This template was changed by someone else" with Reload; member is redirected from the template route.
- **Responsive and console:** 375 px report and dashboard have no horizontal overflow (viewport reset to desktop); no console errors other than 401s from a stale browser session left over from the earlier `db reset`.
- **Code review:** no inline styles except dnd-kit transform/transition; no file over 800 lines (largest source file 349); `run-report` has no service-role client; exception text goes to `console.error` and never reaches responses, job rows or notifications; `shortcut:` notes name their limits; Inter licence present.

## Not exercised
Lease expiry by simulating a dead worker (the SQL path was not hit because the job completed first; covered by handler unit tests); the real `generate_pdf` action through `advance` (unit tests only); dashboard "Showing 10 of N" copy; PDF page-break rendering of an 11,000-character answer in a single field (a 10,000-character one rendered across pages); the Realtime and race tests ran once each. Test rows (records 9999…, Beta workflow) remain in the local database.

# Round 2

Verdict: **PASS with one minor open** (QA-P5-9). Checked at HEAD f4632c8 after a fresh `supabase db reset` and `functions serve`.

Checks: `pnpm test` 193 pass; `pnpm lint` clean; `pnpm build` ok; deno 193 pass, 6 ignored (env-gated); all 6 env-gated tests pass (advance race 2, send-messages race 1, run-report visibility 2, realtime 1); `supabase test db` 10 files, 213 tests PASS. The Edge runtime did not crash.

| ID | Status | Evidence |
|---|---|---|
| QA-P5-1 | fixed | In the running Edge runtime, a record with two 10,000-character random-word answers renders in 0.30 s (7 pages), and the RICH record in 0.45 s. The log shows no CPU-limit messages. Without kerning the text reads cleanly and stays inside the margins. |
| QA-P5-2 | fixed | The PDF panel now says Tamil, Chinese, Japanese and other scripts print as empty boxes. The shortcut note and README line are in the diff. |
| QA-P5-3 | fixed | With 10,000 visible records: owner 200 in 0.27 s, member 200 in 0.15 s. With 10,001 the owner gets 413 in 0.06 s (JSON and CSV). A member with fewer than 10,000 visible records gets 200 in 0.15 s. |
| QA-P5-4 | fixed | `"3"` and `3` now group as `(3, 2)`. |
| QA-P5-5 | fixed | Plan text corrected; 300 s expiry stands, and the Storage API cannot cap it. |
| QA-P5-6 | fixed | A direct insert of 20,000 columns is refused by `saved_reports_shape` (400). |
| QA-P5-7 | fixed | The CI db job exports the RNR_TEST env vars and runs the gated tests. |
| QA-P5-8 | fixed in diff (wrapped titles, d5f064a); not re-viewed in the browser. |

Regression checks: reloading `#/dashboard` stays on the dashboard (the bounce fix works); the dashboard shows both widgets for the owner; the Alpha visibility and PDF flows behave as in round 1.

New finding:
| ID | Severity | Area | Evidence | Expected | Actual | Owner |
|---|---|---|---|---|---|---|
| QA-P5-9 | minor | copy | `advance/index.ts:41`, `submit-form/index.ts:46`, `save-workflow/index.ts:66` and `run-report/index.ts:36` still return "We could not ...". These 500 sentences reach the UI. | design/README forbids "we"; the coordinator said all were rewritten. | Four user-facing 500 strings still say "We". | backend |

## Round 3

QA-P5-9 fixed in 61f44ed by the lead: the four 500 sentences now read "This step did not save. Try again.", "Your answers did not save. Try again.", "This workflow did not save. Try again." and "This report did not run. Try again.". No "We could not" remains in v2/src or v2/supabase/functions. deno 193 passed (6 ignored), node 193 passed. Verdict: PASS, 0 open.
