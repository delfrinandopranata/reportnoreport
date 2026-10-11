# Phase 3 QA, round 1 (Workflow canvas + runtime)

Verdict: **FAIL** (1 major, 5 minor, 0 blocker).

## Check results

| Check | Result |
|---|---|
| `pnpm test` | 93 pass, 0 fail |
| `pnpm lint` (oxlint) | clean |
| `pnpm build` | passes (chunk-size warning only) |
| `deno test supabase/functions` | 97 pass, 0 fail, 1 ignored (race test, needs DB url) |
| race test, real Postgres | 1 pass: two simultaneous approvals advance once |
| `supabase db reset && supabase test db` | 6 files, 114 tests, PASS |

## Findings

| ID | Severity | Area | Evidence | Expected | Actual | Owner |
|---|---|---|---|---|---|---|
| QA-P3-1 | major | backend | Member role given only `forms.manage`; `GET /rest/v1/form_submissions?record_id=eq.<owner's record>` returns `{"answers":{"comment":"private approval note"}}` while `GET records?id=eq.<same>` returns `[]`. Policy `form_submissions_read` in `20261014000001_workflows.sql` ORs `has_permission(org,'forms.manage')` with `record_visible`. | Answers on a record-linked submission follow record visibility (started / submitted / holds task / `records.view_all` per workflow); a forms manager sees standalone submissions only. | Any `forms.manage` holder reads every approval answer in the org, ignoring `workflow_access` and record visibility. | backend |
| QA-P3-2 | minor | backend | Member (no Admin role) POST advance submit on an Admin-role task -> 409 "Claim this task before you act on it."; `claim_task` for the same user -> 403 "Not allowed". | A non-holder gets the same 404/403 as other non-assignees, not an instruction that cannot be followed; no confirmation that the task id exists. | `submitTask` returns the claim hint to any active org member for any role task. | backend |
| QA-P3-3 | minor | backend | `GET tasks?select=id,is_mine` returns `is_mine: null` for open tasks the caller does not hold. | `false`. | `is_mine` is three-valued (null) because `assignee_user_id = auth.uid()` is null when unassigned; harmless to `.eq('is_mine', true)` but typed boolean in `TaskDetail`. | backend |
| QA-P3-4 | minor | frontend | 4-step map (1024x768 viewport): first Map mount fits at scale 0.3 so the graph fills about a third of the pane until the fit control is pressed (then about 0.45). Default spacing is 240 px for ~207 px cards, so the Yes/No labels crowd the End card and the Form "Rejected" edge runs behind the Condition card. | Initial fit fills the pane; connections readable. | As described. | frontend |
| QA-P3-5 | minor | frontend | Connection target selects list unnamed steps as "Form (Form)", "Condition (Condition)", "End (End)". | Type shown once ("Form", or "Form 2" when repeated). | Label repeated in brackets. | frontend |
| QA-P3-6 | minor | frontend | Two tabs on one task: after tab A approves, tab B Reject shows "This task is already done." but Approve and Reject stay live. | After a 409 "already done" the form is replaced by the moved-on state (or the page refetches). | Buttons remain until reload. | frontend |

## Verified, no defect

- Security (REST/edge with user JWTs): cross-org read and write on workflows, records, form_submissions, tasks, scheduled_actions, record_events, workflow_access all return empty or 403/404; Beta cannot start, claim, save or call `open_record_counts`. Direct client writes to records, tasks, record_events, form_submissions (record-linked), scheduled_actions and workflows are refused by RLS (PATCH returns `[]`, INSERT 403); a client cannot change a workflow's graph or status.
- Visibility: members see only records they started, submitted to or hold a task on; org-wide `records.view_all` is narrowed per workflow by `workflow_access.can_view_all`; a per-workflow `can_view_all` never elevates a role that lacks the org permission; Owner is never narrowed; Viewer sees none. `has_permission` 3-arg vs 2-arg behaves as planned (null workflow falls back to org permission).
- Start without `can_start`: 403; unpublished: 409; other org: 404; Access-tab toggle persisted, audited as `workflow.access`, and the toggled-off member was refused.
- Tasks: wrong role claim 403; claim twice 400 "already claimed" (mapped by `friendlyError`); other user acting on a claimed task 403; wrong outcome 400; approve replay and approve-then-reject both 409 "already done"; submit on a closed or error record 409 "moved on".
- Concurrency: two parallel approvals via curl, one 200 and one 409, one submission, `step` bumped once; approve vs reject parallel likewise; two-tab UI attempt shows the 409 sentence.
- `resume`: no/wrong secret/user JWT -> 401, GET 405; pg_cron fired every minute and a due timer completed (`{"done":2,...}`); a timer whose record moved on, and one whose record closed, were `skipped` with a `skipped` event.
- Runtime: condition yes/no, unreadable or missing value -> false branch; relative-to-field timer (past date resumed next minute, far date waits, empty date -> `error` "needs a valid date"); form loop creates a fresh task per visit and ends; `set_status` sets the label; `send_message` and `generate_pdf` recorded as `pending` action events; failing actions (deleted role, empty status text) leave `error` plus reason and the submission kept; stopped record page shows reason and "Nothing after this step has run".
- `save-workflow`: member/viewer 403, draft hidden from non-managers (404), publish without `workflows.publish` 403, invalid publish 409 with pinned issues, published graph must stay valid, stale `updatedAt` 409 conflict, bad body 400, oversize 413, step with open records 409 with node id (and the DB trigger refuses a direct SQL graph edit), workflow with records cannot be deleted (friendly sentence mapped).
- UI: List and Map editing, publish, leave guard dialog with real Esc (focus returns to the trigger), keyboard-only List flow (Tab/Enter, live "Showing Start."), delete guard shows open count with no delete button, Inbox claim then Open, task view Approve, records list and filters, record page timeline and map, 375 px (no page overflow; tables scroll inside cards), dark theme, console clean (only the expected 409). Viewport and colour scheme reset.
- Review: no file over 800 lines (largest `WorkflowEditor.tsx` 328); all `shortcut:` notes in the required form; no inline hex, emoji or `disabled` submit; trigger functions revoked; no swallowed errors or raw error leaks found.

## Not covered

Nothing unchecked beyond a live cycle through a Time step (covered only by engine tests) and assignment by `{step}` / `{user}` (engine tests only).

---

# Round 2 (recheck of ffa6a54 backend, e38bb1d frontend)

Verdict: **FAIL** (0 blocker, 0 major, 2 minor open).

## Check results

| Check | Result |
|---|---|
| `pnpm test` (node) | 95 pass, 0 fail |
| `pnpm lint` | clean |
| `pnpm build` | passes |
| `deno test supabase/functions` | 98 pass, 0 fail, 1 ignored |
| race test, real Postgres | 1 pass |
| `supabase db reset && supabase test db` | 6 files, 119 tests, PASS |

## Per-finding status

| ID | Status | Evidence |
|---|---|---|
| QA-P3-1 | fixed | After reset, member with only `forms.manage` reads `[]` for a record-linked submission; the starter and an admin with `records.view_all` still read it; standalone submissions still follow `forms.manage` (policy `case when record_id is null`). |
| QA-P3-2 | fixed | Non-holder submit now 403 "Not allowed."; Beta 404; a holder on an unclaimed task still gets 409 "Claim this task before you act on it." |
| QA-P3-3 | fixed | `tasks?select=is_mine` returns `false`, never null. |
| QA-P3-4 | partly fixed, still open | New steps added in List view space at 320 px and labels have room; but first Map mount of the seeded "Leave approval" (6 steps, 1168 px wide, 598 px pane) still fits at scale 0.3 (`translate(200px,258px) scale(0.3)`), graph spans 351 of 598 px and cards read about 62 px wide. `fitViewOptions.minZoom: 0.55` has no effect. |
| QA-P3-5 | fixed | Targets read "Form 1", "Condition 1", "Form 2", "End 1" for unnamed steps; named steps keep their name. |
| QA-P3-6 | fixed | Two admin tabs: tab A approves, tab B Reject shows an alert "This task is already done." and the form is replaced by Back to inbox / View record. |

## New findings

| ID | Severity | Area | Evidence | Expected | Actual | Owner |
|---|---|---|---|---|---|---|
| QA-P3-7 | minor | backend | `engine.test.ts` "only the assignee or the person who claimed the task may act" now has a non-holder (MEMBER) acting on a claimed task and expects "Not allowed."; no test remains for a role holder who is neither claimer nor assignee. | A test that a holder acting on a task another holder claimed gets 403 "This task is assigned to someone else." (the code path in `submitTask` is correct and reachable, just no longer covered); also a user-assigned task acted on by a non-assignee. | Both branches untested. | backend |

Regression sweep over `git diff a29cda7..HEAD -- v2` (15 files): no other regressions found; claim/approve/reject, resume and the UI flows re-ran clean. Note: after `supabase db reset` existing browser sessions are invalid and show "Sign in again to continue." (environment effect, not a defect).

---

# Round 3 (af37f68 viewport, 28fd229 engine tests)

Verdict: **PASS** (no open blocker, major or minor).

Checks: `pnpm test` 101 pass, 0 fail; `deno test supabase/functions` 100 pass, 0 fail, 1 ignored; `pnpm lint` clean; `pnpm build` passes.

| ID | Status | Evidence |
|---|---|---|
| QA-P3-4 | fixed | Seeded 6-step workflow, desktop (pane 598 px): cold load and List->Map toggle both `translate(24px, 205.2px) scale(0.55)`, panned so Start sits at the left (graph does not fit at 0.55). 375 px (pane 285): both `translate(24px, 220.2px) scale(0.55)`, Start at 24-138 px. 1-2 step draft, desktop: first step opens centred at scale 1; adding the second step does not re-apply the viewport; List->Map toggle keeps scale 1. A ctrl+wheel zoom to scale 2 was still `translate(-440px, 218.9px) scale(2)` 2.5 s later: the timer applies once per Map open and does not fight or re-apply after the user's own zoom. Not separately measured: a 1-2 step graph at 375 px (same code path). |
| QA-P3-7 | fixed | Two new engine tests: a role holder who did not claim, and a non-assignee on a user-assigned task, both expect 403 "This task is assigned to someone else."; both pass. |

Observation, not a defect: in Map view a second step added with no pointer lands 32 px from the first (existing `freeSpot` nudge), so two cards overlap until dragged.
