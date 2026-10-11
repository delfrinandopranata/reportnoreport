# Phase 3 — Workflow Canvas + Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A workflow manager draws a workflow on a canvas from the five cards (Start, Form, Condition, Time, End), the publish check pins every problem on the canvas, and once published a member with access starts a record from the Inbox; the record moves through approvals, branches and timers, every step on the server, in one locked transaction per move, with a timeline and a read-only map on the record page.

**Architecture:** A pure TypeScript graph module, `supabase/functions/_shared/workflow/graph.ts`, holds the node/edge types, the publish check and next-step resolution; Vite imports it through `src/workflows/logic.ts` and the Edge Functions import it directly, and its tests run under `node --test` and `deno test` (same rules as Phase 2's `_shared/forms`). The runtime engine (`supabase/functions/advance/engine.ts`) walks the graph against a `Tx` interface; `advance` (start / submit a task) and `resume` (pg_cron, every minute) run it inside one Postgres transaction opened over a direct connection (`npm:postgres`, `SUPABASE_DB_URL`) that holds `SELECT … FOR UPDATE` on the record. `save-workflow` is the only writer of `workflows.graph` and `workflows.status`, so a published graph always passes the check. Postgres adds `workflows`, `workflow_access`, `records`, `tasks`, `scheduled_actions`, `record_events`, extends Phase 2's `form_submissions` in place, a workflow-scoped `has_permission(org, perm, workflow)`, and RLS that shows a member the records they started, submitted to or hold a task on.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, supabase-js 2, `@xyflow/react` v12 (new, Task 8 only), Supabase CLI (Postgres 17, pgTAP, `pg_cron`, `pg_net`, Vault), Deno 2 Edge Functions, `npm:postgres@3.4.5` (Edge Functions only, through Deno's `npm:` specifier, not `package.json`), `node --test`, oxlint.

**Spec:** `docs/superpowers/specs/2026-10-11-reportnoreport-v2-design.md` (§5 Workflow module, §6 Inbox and record page, §7 `workflow_access` + workflow-scoped `has_permission`, §10 Error handling, §11 Testing, §12 phase 3, §15 Design system)

## Global Constraints

- Everything from the Phase 1 and Phase 2 Global Constraints still holds (org-scoped tables, `has_permission()` in every policy, British English, sentence-case verb-first buttons, no emoji, `design/` authoritative, tokens only, one `rnr-btn-primary` per view, never `disabled` on submit, `aria-busy` + `rnr-spin` while saving, native `<dialog>` via `src/ui/ConfirmDialog.tsx`, the browser never trusted).
- **Decisions this plan takes (reviewer: check these):**
  1. **Submissions extend `form_submissions` in place; no new `submissions` table and no rename.** Spec §5.1's `submissions` is this table: `record_id`, `node_id`, `task_id` (unique) and `outcome` are added, nullable for Phase 2's standalone rows (`check ((record_id is null) = (node_id is null))`). One table means one RLS policy, one answer renderer, one storage path rule and one validator for every answer in the product. The rename is skipped because it buys nothing and breaks `submit-form`, the submissions page, `errors.ts` and `05_forms.test.sql` for no behaviour.
  2. **`has_permission(org, perm, workflow)` is a new three-argument overload with no default.** A `default null` third argument would make every existing two-argument call ambiguous (`function has_permission(uuid, text) is not unique`) and the two-argument function cannot be dropped while 20+ policies use it. With a workflow id, `records.start` / `records.view_all` additionally need a `workflow_access` row (`can_start` / `can_view_all`) for a role the caller holds; Owners are never narrowed; every other permission passes through. A new workflow gets access rows seeded from the roles that hold `records.start` / `records.view_all` (trigger), so publishing does not lock everyone out.
  3. **Runtime transactions use a direct Postgres connection from the Edge Function** (`npm:postgres`, `SUPABASE_DB_URL`, which the Edge Runtime provides), because supabase-js cannot hold a transaction or a row lock. The engine is written against a `Tx` interface; the pg adapter and an in-memory fake both implement it. It connects as `postgres` (RLS bypassed), so the engine checks membership, permission and assignment explicitly; `has_permission` is evaluated as the caller by setting `request.jwt.claims` for that transaction only.
  4. **`records.step` (an integer bumped on every move) is the `state_at_schedule`.** A node id cannot tell "still waiting on this Time step" from "left and came back through a loop"; a counter can. `resume` skips a row whose record's `step` differs or which is no longer `open`.
  5. **`save-workflow` is the only writer of `workflows.graph`, `name` and `status`** (no client update policy). It runs the shared check; a draft may be saved with issues, a publish or an edit of a published workflow may not. The node-deletion guard lives in a `before update of graph` trigger (authoritative whichever path writes), and `advance` takes `FOR SHARE` on the workflow so a save and an advance cannot interleave (the save waits, then its guard sees the moved record).
  6. **`record_events` is the timeline** (started, submitted, task, claimed, condition, waiting, resumed, skipped, action, error, closed). `send_message` and `generate_pdf` are written there as `{status: 'pending'}` action events and the walk continues: `shortcut:` until Phase 4 (messages) and Phase 5 (PDF) consume pending action events. `set_status` sets `records.label` (free text); `records.status` stays owned by the runtime (`open`/`done`/`rejected`/`error`).
  7. **At most one open task per record** (partial unique index): the graph has no parallel split, so this is a free backstop; `form_submissions.task_id` is unique, so a double approval cannot land twice even if the lock were bypassed.
  8. **pg_cron calls `resume` through `pg_net` with a shared secret** held in Vault (`resume_url`, `cron_secret`); `resume` has `verify_jwt = false` and compares `Authorization: Bearer <CRON_SECRET>`. The job only fires the HTTP call when a pending row is due.
  9. **A failing step never skips:** the submission that triggered it is kept, the record goes to `error` with a plain-words reason on the node where it stopped, and an `error` event is written. Phase 3 has no retry button: `shortcut:` an admin fixes the workflow and starts a new record; retry arrives with the admin records tooling in Phase 5.
- **Shared module rules:** files under `supabase/functions/_shared/workflow/` import only each other and `../forms/*.ts`, always with the `.ts` extension; no `Deno.*`, `process`, `window`, npm or jsr imports; erasable TypeScript only. Tests there use `node:test` + `node:assert/strict`. Runtime code that is Deno-only (`advance/engine.ts`, `advance/pgStore.ts`) lives outside `_shared/`, so `pnpm test`'s glob never picks up its `Deno.test` files.
- **Ids:** node and edge ids match `^[a-z0-9_-]{1,40}$` and are unique; the graph stores references only (form ids, role ids, user ids).
- **Assignment:** a role task must be claimed (`claim_task`) before anyone acts on it; a user task belongs to that user; `{ step: nodeId }` resolves at task creation to whoever last submitted that step, stored as `assignee_user_id`.
- **Defect classes from Phase 1 and Phase 2 QA that must not recur:**
  - every client-visible write is audited (QA-7): `workflow.create/update/publish/delete` and `workflow.access` by trigger, `task.claim` in the RPC;
  - no `security definer` helper is callable by clients unless meant to be (QA-5): `record_visible`, `is_mine` and `has_permission` answer only about the caller and are needed inside policies and PostgREST computed columns; `open_record_counts` and `claim_task` check permission themselves; trigger functions are revoked from `public, anon, authenticated`;
  - every new server message reaching `friendlyError` has an entry in `src/ui/errors.ts` with a test; Edge Function responses carry their own sentences and are shown as sent (QA-11, QA-12);
  - TanStack Query keys include `orgId` or the row id, and two queries with different `select` shapes never share a key (QA-2): Task 7 extracts `useMemberEmails` and reuses `['roles', orgId]` with Members' exact `select`;
  - a write that RLS turns into 0 rows is reported, never silent (workflow delete and access upserts use `.select()`);
  - focus moves to the page heading after the row that triggered an action disappears (QA-8), and to the success heading after a submit unmounts the button (Phase 2 `useFocusAfterRender`);
  - a stored file path must exist (QA-P2-1): `advance` reuses `missingUploads`, moved into the shared forms module;
  - hidden fields never feed other rules (QA-P2-2): `advance` reuses `validateAnswers` / `resolve` unchanged;
  - unsaved canvas work is guarded on hash change, sign-out and org switch (QA-P2-4): `setNavGuard` + `guarded()`;
  - Edge Function CORS allows `authorization, x-client-info, apikey, content-type`; tokens only, no inline hex (QA-P2-5).
- New dependencies: `@xyflow/react` (package.json). `npm:postgres@3.4.5` is a Deno import inside `supabase/functions/`, not a web dependency; commit the updated `deno.lock`.
- The Senior Designer's `docs/superpowers/design/phase-3-screens.md` (Task 6) is written before Tasks 7–10. Where it differs from this plan on a visual, copy or accessibility point, the design spec wins; behaviour, data and security stay as this plan says.

## Review Focus

1. **Two people approve the same task at the same moment** → exactly one advances the record: one 200, one 409 "This task is already done.", one submission, `step` bumped once, one timer. (test "two simultaneous approvals advance the record once" in Task 3 against the locking fake; "real Postgres: two simultaneous approvals advance the record once" in Task 4 against the local database; backstops `form_submissions.task_id` unique and one open task per record in `06_workflows.test.sql`, Task 2)
2. **A timer fires after its record has moved on or closed** → the scheduled row is `skipped`, the record is untouched, and a `skipped` event is written; an unexpected error marks the row `failed` and the record `error`, never retried silently. (tests "resume skips a row whose record moved on, or closed, since it was scheduled" in Task 3 and "an unexpected error marks the row failed and the record error" in Task 4; cron job present in Task 2)
3. **Cycles** → a loop with no Form or Time step is refused at publish; a loop through a Form or Time step is allowed and creates a fresh task per visit; a malformed graph that slips past the check stops with an error after 100 hops instead of spinning. (tests "a loop without a Form or Time step is refused; one with either is allowed" in Task 1; "a loop back through a Form step creates a fresh task each visit" and "a loop of Condition steps stops with an error instead of spinning" in Task 3)
4. **Cross-org and permission isolation** → Beta reads no Alpha workflow, record, task or submission; a member without a `can_start` row cannot start the workflow though they hold `records.start`; only holders of the task's role can claim it; clients cannot insert records, tasks or scheduled actions or update workflows. (`06_workflows.test.sql` in Task 2; "start is refused without access, on a draft, from another org, and with bad answers" in Task 3)
5. **Deleting a step that open records sit on** → the database refuses the graph update ("A step with open records cannot be deleted: approve (1 open)"), `save-workflow` answers 409 with the step id, and the canvas shows the open count and offers no delete for that step. (`06_workflows.test.sql` in Task 2; "an open step cannot be deleted" in Task 5; Task 8 side panel)
6. **A failing action** (empty "Set status" text, a deleted role, an unreadable date for a Time step) → the record is `error` with the reason, nothing after it runs, and the submission that triggered it is kept. (tests "a failing action stops the record with the reason; nothing after it runs" and siblings in Task 3)

---

## Owners and order

| Task | Owner | Depends on |
|---|---|---|
| 1. Shared: graph types, publish check, next-step resolution | Backend engineer | — |
| 2. Database: workflows, records, tasks, timers, access, RLS, cron | Backend engineer | — (parallel with 1) |
| 3. Runtime engine with a locking test store | Backend engineer | 1 |
| 4. Edge Functions `advance` and `resume` | Backend engineer | 2, 3 |
| 5. Edge Function `save-workflow` | Backend engineer | 1, 2 |
| 6. Design spec `phase-3-screens.md` | Senior Designer | — (parallel with 1–5) |
| 7. Frontend: routes, nav, workflows list, data layer | Frontend engineer | 1, 2, 6 |
| 8. Frontend: canvas editor and Access tab | Frontend engineer | 5, 7 |
| 9. Frontend: Inbox, start and task view | Frontend engineer | 4, 7 |
| 10. Frontend: records list, record page, end-to-end check | Frontend engineer | 4, 8, 9 |

Backend runs 1 → 3 → 4 with 2 alongside 1, then 5; the designer runs 6 at the same time; the frontend engineer starts 7 once 1, 2 and 6 are committed, then 8 and 9 (either order), then 10.

---

## File Structure

```
supabase/functions/_shared/workflow/graph.ts        types, outcomesOf, nextEdge, readGraph, checkGraph, durationMs, timeRunAt
supabase/functions/_shared/workflow/fixture.ts      LEAVE graph, REFS, ids — tests only
supabase/functions/_shared/workflow/graph.test.ts   node + deno
supabase/functions/_shared/forms/uploads.ts         missingUploads (moved out of submit-form)
supabase/functions/_shared/forms/index.ts           + uploads.ts
supabase/functions/_shared/storage.ts               fileExists(client, path) for the Edge Functions
supabase/migrations/20261014000001_workflows.sql    tables, has_permission overload, record_visible, RLS, triggers, RPCs, cron
supabase/tests/06_workflows.test.sql
supabase/tests/05_forms.test.sql                    org form count 2 → 3 (seeded approval form)
supabase/seed.sql                                   + "Manager approval" form, published "Leave approval", Vault secrets
supabase/config.toml                                [functions.resume] verify_jwt = false
supabase/functions/advance/engine.ts                Tx, Store, walk, startRecord, submitTask, resumeOne, failScheduled
supabase/functions/advance/testkit.ts               fakeStore (locking, in-memory) + setup() — tests only
supabase/functions/advance/engine.test.ts
supabase/functions/advance/pgStore.ts               Tx over npm:postgres
supabase/functions/advance/handler.ts               body parsing + auth, dependencies injected
supabase/functions/advance/handler.test.ts
supabase/functions/advance/race.test.ts             real Postgres, runs only with RNR_TEST_DB_URL
supabase/functions/advance/index.ts
supabase/functions/resume/handler.ts
supabase/functions/resume/handler.test.ts
supabase/functions/resume/index.ts
supabase/functions/save-workflow/handler.ts
supabase/functions/save-workflow/handler.test.ts
supabase/functions/save-workflow/index.ts
supabase/functions/submit-form/handler.ts           imports missingUploads from the shared module
supabase/functions/submit-form/index.ts             imports fileExists from _shared/storage.ts
docs/superpowers/design/phase-3-screens.md          designer spec (Task 6)
src/workflows/logic.ts                              re-exports the shared graph module for Vite
src/workflows/api.ts                                workflow, access, task, record queries; saveWorkflow, advance, claimTask
src/workflows/WorkflowGate.tsx                      loading / error / not-found wrapper
src/workflows/WorkflowsPage.tsx                     list, create, delete
src/workflows/AccessPage.tsx                        roles × can_start / can_view_all
src/workflows/canvas/canvasOps.ts                   addNode, connect, removeNode, moveNode, issuesByNode, toFlow
src/workflows/canvas/canvasOps.test.ts
src/workflows/canvas/NodeCard.tsx                   one card per node, one handle per outcome
src/workflows/canvas/SidePanel.tsx                  node settings, outcome targets (keyboard connect), edge actions, delete guard
src/workflows/canvas/WorkflowEditor.tsx             palette, ReactFlow board, issues, save / publish
src/workflows/canvas/MiniCanvas.tsx                 read-only map with the current step highlighted
src/inbox/InboxPage.tsx                             My tasks (claim), Start new
src/inbox/StartPage.tsx                             start form → advance
src/inbox/TaskPage.tsx                              earlier submissions + my form with Submit / Approve / Reject
src/records/RecordsPage.tsx                         list with All / Open / Error / Closed filter
src/records/RecordPage.tsx                          timeline + mini canvas
src/records/timeline.ts                             eventText (pure)
src/records/timeline.test.ts
src/members/useMemberEmails.ts                      shared member email lookup (extracted from SubmissionsPage)
src/forms/submissions/AnswerList.tsx                answer rendering (extracted from SubmissionsPage)
src/forms/submissions/SubmissionsPage.tsx           uses AnswerList + useMemberEmails
src/forms/fill/FormRunner.tsx                       optional outcome buttons (Approve / Reject)
src/forms/api.ts                                    SubmitResult carries `id`
src/rbac/route.ts, src/rbac/route.test.ts           workflow, inbox, task, start, record routes
src/ui/errors.ts, src/ui/errors.test.ts             workflow-delete and claim messages
src/App.tsx                                         nav + route switch
src/index.css                                       canvas card states (from the design spec)
package.json                                        @xyflow/react
README.md                                           functions, cron secret, race test
```

---

### Task 1: Shared graph types, publish check and next-step resolution

**Owner:** Backend engineer · **Depends on:** —

**Files:**
- Create: `supabase/functions/_shared/workflow/graph.ts`, `supabase/functions/_shared/workflow/fixture.ts`
- Test: `supabase/functions/_shared/workflow/graph.test.ts`

**Interfaces:**
- Consumes: `OPERATORS`, `Rule`, `Answers` from `../forms/types.ts`; `parsePath`, `toDay` from `../forms/rules.ts` (Phase 2).
- Produces:
  - `NODE_TYPES`, `type NodeType`, `OUTCOMES`, `type Outcome`, `UNITS`, `type Unit`, `type Duration = { amount: number; unit: Unit }`
  - `type Assignee = { role: string } | { user: string } | { step: string }`
  - `type Relative = { field: string; amount: number; unit: Unit; direction: 'before' | 'after' }`
  - `type StartNode`, `FormNode`, `ConditionNode`, `TimeNode`, `EndNode`, `type WfNode` (all with `id`, `label?`, `position: { x: number; y: number }`)
  - `type Action = { type: 'set_status'; label: string } | { type: 'send_message'; templateId?: string; recipients?: unknown } | { type: 'generate_pdf' }`
  - `type Edge = { id: string; from: string; outcome: Outcome; to: string; actions: Action[] }`, `type Graph = { nodes: WfNode[]; edges: Edge[] }`
  - `type Issue = { message: string; nodeId?: string; edgeId?: string }`, `type Refs = { forms: ReadonlySet<string>; roles: ReadonlySet<string>; users: ReadonlySet<string> }`
  - `ID_RE`, `MAX_NODES`, `TYPE_LABELS`, `OUTCOME_LABELS`
  - `nodeName(n: WfNode | undefined): string` · `outcomesOf(n: WfNode): Outcome[]` · `nodeById(g: Graph, id: string): WfNode | undefined` · `nextEdge(g: Graph, from: string, outcome: Outcome): Edge | null`
  - `readGraph(raw: unknown): Graph | null` (shape only) · `checkGraph(raw: unknown, refs: Refs): Issue[]` (never throws)
  - `durationMs(d: unknown): number | null` · `timeRunAt(node: TimeNode, data: Answers, now: Date): Date | null`

- [ ] **Step 1: Write the fixture** — `supabase/functions/_shared/workflow/fixture.ts` (tests only; the same shape as the seeded "Leave approval", Task 2)

```ts
import type { Graph, Refs } from './graph.ts'

export const WF = '0000000a-0000-0000-0000-00000000c001'
export const F_LEAVE = '0000000a-0000-0000-0000-0000000000f1'
export const F_APPROVAL = '0000000a-0000-0000-0000-0000000000f3'
export const ROLE_ADMIN = '0000000a-0000-0000-0000-00000000a001'
export const ADMIN = '00000000-0000-0000-0000-0000000000a2'
export const MEMBER = '00000000-0000-0000-0000-0000000000a3'

const at = (x: number, y: number) => ({ x, y })

export const LEAVE: Graph = {
  nodes: [
    { id: 'start', type: 'start', formId: F_LEAVE, position: at(0, 0) },
    { id: 'approve', type: 'form', label: 'Manager approval', formId: F_APPROVAL, assignee: { role: ROLE_ADMIN }, mode: 'approve', due: { amount: 2, unit: 'days' }, position: at(240, 0) },
    { id: 'long', type: 'condition', label: 'More than 2 days?', rule: { field: 'days', operator: 'gt', value: 2 }, position: at(480, 0) },
    { id: 'wait', type: 'time', label: 'Wait a day', after: { amount: 1, unit: 'days' }, position: at(720, 0) },
    { id: 'done', type: 'end', label: 'Approved', status: 'done', position: at(960, 0) },
    { id: 'rejected', type: 'end', label: 'Rejected', status: 'rejected', position: at(480, 160) },
  ],
  edges: [
    { id: 'e1', from: 'start', outcome: 'submitted', to: 'approve', actions: [] },
    { id: 'e2', from: 'approve', outcome: 'approved', to: 'long', actions: [{ type: 'send_message' }] },
    { id: 'e3', from: 'approve', outcome: 'rejected', to: 'rejected', actions: [{ type: 'set_status', label: 'Rejected by manager' }] },
    { id: 'e4', from: 'long', outcome: 'yes', to: 'wait', actions: [] },
    { id: 'e5', from: 'long', outcome: 'no', to: 'done', actions: [] },
    { id: 'e6', from: 'wait', outcome: 'next', to: 'done', actions: [{ type: 'generate_pdf' }] },
  ],
}

export const REFS: Refs = { forms: new Set([F_LEAVE, F_APPROVAL]), roles: new Set([ROLE_ADMIN]), users: new Set([ADMIN, MEMBER]) }

/** A deep copy to change in one test without touching the others. */
export const leave = (): Graph => structuredClone(LEAVE)
```

- [ ] **Step 2: Write the failing tests** — `supabase/functions/_shared/workflow/graph.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkGraph, durationMs, nextEdge, outcomesOf, readGraph, timeRunAt, type ConditionNode, type EndNode, type FormNode, type Graph, type TimeNode, type WfNode } from './graph.ts'
import { LEAVE, REFS, leave } from './fixture.ts'

const msgs = (g: unknown, refs = REFS) => checkGraph(g, refs).map((i) => i.message)
const find = <T extends WfNode = WfNode>(g: Graph, id: string) => g.nodes.find((n) => n.id === id) as T

test('the fixture workflow passes the publish check', () => {
  assert.deepEqual(checkGraph(LEAVE, REFS), [])
})
test('exactly one Start', () => {
  const none = leave()
  none.nodes = none.nodes.filter((n) => n.id !== 'start')
  none.edges = none.edges.filter((e) => e.from !== 'start')
  assert.ok(msgs(none).includes('Add a Start step.'))
  const two = leave()
  two.nodes.push({ ...find(two, 'start'), id: 'start2' })
  two.edges.push({ id: 'e9', from: 'start2', outcome: 'submitted', to: 'approve', actions: [] })
  assert.ok(msgs(two).includes('Keep only one Start step.'))
})
test('every outcome is connected', () => {
  const g = leave()
  g.edges = g.edges.filter((e) => e.id !== 'e3')
  assert.deepEqual(checkGraph(g, REFS), [
    { message: 'Connect the "Rejected" outcome of "Manager approval".', nodeId: 'approve' },
    { message: '"Rejected" cannot be reached from Start.', nodeId: 'rejected' },
  ])
})
test('unreachable steps are reported', () => {
  const g = leave()
  g.nodes.push({ id: 'orphan', type: 'end', status: 'done', position: { x: 0, y: 300 } })
  assert.deepEqual(checkGraph(g, REFS), [{ message: '"End" cannot be reached from Start.', nodeId: 'orphan' }])
})
test('a loop without a Form or Time step is refused; one with either is allowed', () => {
  const stuck = leave()
  stuck.nodes.push({ id: 'c2', type: 'condition', rule: { field: 'days', operator: 'lt', value: 9 }, position: { x: 0, y: 400 } })
  stuck.edges = stuck.edges.filter((e) => e.id !== 'e5')
  stuck.edges.push(
    { id: 'e7', from: 'long', outcome: 'no', to: 'c2', actions: [] },
    { id: 'e8', from: 'c2', outcome: 'yes', to: 'long', actions: [] },
    { id: 'e9', from: 'c2', outcome: 'no', to: 'done', actions: [] },
  )
  const issues = checkGraph(stuck, REFS)
  assert.deepEqual(issues.map((i) => i.nodeId).sort(), ['c2', 'long'])
  assert.match(issues[0].message, /would never stop/)

  const viaForm = leave()
  viaForm.edges = viaForm.edges.map((e) => (e.id === 'e5' ? { ...e, to: 'approve' } : e))
  assert.deepEqual(checkGraph(viaForm, REFS), [])
  const viaTime = leave()
  viaTime.edges = viaTime.edges.map((e) => (e.id === 'e6' ? { ...e, to: 'long' } : e))
  assert.deepEqual(checkGraph(viaTime, REFS), [])
})
test('a condition that loops to itself is refused', () => {
  const g = leave()
  g.edges = g.edges.map((e) => (e.id === 'e4' ? { ...e, to: 'long' } : e))
  assert.ok(checkGraph(g, REFS).some((i) => i.nodeId === 'long' && /would never stop/.test(i.message)))
})
test('referenced forms, roles, people and steps must exist', () => {
  const empty = { forms: new Set<string>(), roles: new Set<string>(), users: new Set<string>() }
  assert.deepEqual(msgs(LEAVE, empty), [
    'The form for "Start" no longer exists. Choose another.',
    'The form for "Manager approval" no longer exists. Choose another.',
    'The role assigned to "Manager approval" no longer exists.',
  ])
  const g = leave()
  find<FormNode>(g, 'approve').assignee = { step: 'long' }
  assert.deepEqual(msgs(g), ['"Manager approval" must be assigned from an earlier Start or Form step.'])
  find<FormNode>(g, 'approve').assignee = { user: 'nobody' }
  assert.deepEqual(msgs(g), ['The person assigned to "Manager approval" is no longer a member.'])
  find<FormNode>(g, 'approve').assignee = { role: '' }
  assert.deepEqual(msgs(g), ['Choose who completes "Manager approval".'])
})
test('connections must fit their steps', () => {
  const g = leave()
  g.edges.push(
    { id: 'e10', from: 'long', outcome: 'next', to: 'done', actions: [] },
    { id: 'e11', from: 'wait', outcome: 'next', to: 'start', actions: [] },
    { id: 'e12', from: 'wait', outcome: 'next', to: 'ghost', actions: [] },
  )
  assert.deepEqual(msgs(g), [
    '"More than 2 days?" has no "Next" outcome. Delete this connection.',
    'Nothing can lead back to Start. Connect to another step.',
    '"Wait a day" has two paths for "Next". Keep one.',
    'A connection points at a deleted step. Delete it.',
  ])
})
test('actions are checked', () => {
  const g = leave()
  g.edges[2].actions = [{ type: 'set_status', label: ' ' }, { type: 'launch_rocket' } as never]
  assert.deepEqual(msgs(g), ['Enter the status text (up to 60 characters).', 'Remove the unknown action from this connection.'])
})
test('step settings are checked', () => {
  const g = leave()
  find<FormNode>(g, 'approve').due = { amount: 0, unit: 'days' }
  find<ConditionNode>(g, 'long').rule = { field: 'Days!', operator: 'gt' } as never
  find<TimeNode>(g, 'wait').relative = { field: 'start', amount: 1, unit: 'days', direction: 'before' }
  find<EndNode>(g, 'done').status = 'maybe' as never
  assert.deepEqual(msgs(g), [
    'Enter a due time for "Manager approval" between 1 minute and 366 days.',
    'Set the rule for "More than 2 days?".',
    'Choose either a wait time or a date field for "Wait a day".',
    'Choose whether "Approved" ends as done or rejected.',
  ])
})
test('an unreadable graph is one issue, never a throw', () => {
  for (const raw of [null, 'x', { nodes: 'x', edges: [] }, { nodes: [{ id: 1 }], edges: [] }, { nodes: [], edges: [{}] }]) {
    assert.deepEqual(msgs(raw), ['This workflow could not be read. Reload the page.'])
  }
  assert.equal(readGraph(LEAVE), LEAVE)
})
test('next-step resolution', () => {
  assert.equal(nextEdge(LEAVE, 'approve', 'rejected')?.to, 'rejected')
  assert.equal(nextEdge(LEAVE, 'approve', 'submitted'), null)
  assert.deepEqual(outcomesOf(find(LEAVE, 'approve')), ['approved', 'rejected'])
  assert.deepEqual(outcomesOf({ ...find<FormNode>(LEAVE, 'approve'), mode: 'fill' }), ['submitted'])
  assert.deepEqual(outcomesOf(find(LEAVE, 'done')), [])
})
test('time steps: a wait, or a date field before/after', () => {
  const now = new Date('2026-10-11T12:00:00Z')
  const wait = find<TimeNode>(LEAVE, 'wait')
  assert.equal(timeRunAt(wait, {}, now)?.toISOString(), '2026-10-12T12:00:00.000Z')
  const rel = (direction: 'before' | 'after', amount = 1): TimeNode =>
    ({ ...wait, after: undefined, relative: { field: 'start', amount, unit: 'days', direction } })
  assert.equal(timeRunAt(rel('before'), { start: '2026-10-20' }, now)?.toISOString(), '2026-10-19T00:00:00.000Z')
  assert.equal(timeRunAt(rel('after', 0), { start: '2026-10-20' }, now)?.toISOString(), '2026-10-20T00:00:00.000Z')
  assert.equal(timeRunAt(rel('after'), { start: 'soon' }, now), null)
  assert.equal(timeRunAt(rel('after'), {}, now), null)
  assert.equal(durationMs({ amount: 1, unit: 'minutes' }), 60_000)
  assert.equal(durationMs({ amount: 367, unit: 'days' }), null)
  assert.equal(durationMs({ amount: 1.5, unit: 'hours' }), null)
  assert.equal(durationMs({ amount: 1, unit: 'weeks' }), null)
})
```

- [ ] **Step 3: Run — expect FAIL**

Run: `pnpm test`
Expected: `Cannot find module '…/_shared/workflow/graph.ts'`.

- [ ] **Step 4: Implement** — `supabase/functions/_shared/workflow/graph.ts`

```ts
import { OPERATORS, type Answers, type Rule } from '../forms/types.ts'
import { parsePath, toDay } from '../forms/rules.ts'

export const NODE_TYPES = ['start', 'form', 'condition', 'time', 'end'] as const
export type NodeType = (typeof NODE_TYPES)[number]
export const OUTCOMES = ['submitted', 'approved', 'rejected', 'yes', 'no', 'next'] as const
export type Outcome = (typeof OUTCOMES)[number]
export const UNITS = ['minutes', 'hours', 'days'] as const
export type Unit = (typeof UNITS)[number]
export type Duration = { amount: number; unit: Unit }
export type Assignee = { role: string } | { user: string } | { step: string }
export type Relative = { field: string; amount: number; unit: Unit; direction: 'before' | 'after' }

type Base = { id: string; label?: string; position: { x: number; y: number } }
export type StartNode = Base & { type: 'start'; formId: string }
export type FormNode = Base & { type: 'form'; formId: string; assignee: Assignee; mode: 'fill' | 'approve'; due?: Duration }
export type ConditionNode = Base & { type: 'condition'; rule: Rule }
export type TimeNode = Base & { type: 'time'; after?: Duration; relative?: Relative }
export type EndNode = Base & { type: 'end'; status: 'done' | 'rejected' }
export type WfNode = StartNode | FormNode | ConditionNode | TimeNode | EndNode

export type Action =
  | { type: 'set_status'; label: string }
  | { type: 'send_message'; templateId?: string; recipients?: unknown }
  | { type: 'generate_pdf' }
export type Edge = { id: string; from: string; outcome: Outcome; to: string; actions: Action[] }
export type Graph = { nodes: WfNode[]; edges: Edge[] }
export type Issue = { message: string; nodeId?: string; edgeId?: string }
export type Refs = { forms: ReadonlySet<string>; roles: ReadonlySet<string>; users: ReadonlySet<string> }

export const ID_RE = /^[a-z0-9_-]{1,40}$/
export const MAX_NODES = 200
export const TYPE_LABELS: Record<NodeType, string> = { start: 'Start', form: 'Form', condition: 'Condition', time: 'Time', end: 'End' }
export const OUTCOME_LABELS: Record<Outcome, string> = {
  submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected', yes: 'Yes', no: 'No', next: 'Next',
}
const UNIT_MS: Record<Unit, number> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 }
const MAX_MS = 366 * UNIT_MS.days
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isUnit = (u: unknown): u is Unit => (UNITS as readonly unknown[]).includes(u)
const outcomeLabel = (o: string) => (OUTCOME_LABELS as Record<string, string>)[o] ?? o

export const nodeName = (n: WfNode | undefined) =>
  n ? n.label?.trim() || (TYPE_LABELS as Record<string, string>)[n.type] || 'Step' : 'A deleted step'

export function outcomesOf(n: WfNode): Outcome[] {
  switch (n.type) {
    case 'start': return ['submitted']
    case 'form': return n.mode === 'approve' ? ['approved', 'rejected'] : ['submitted']
    case 'condition': return ['yes', 'no']
    case 'time': return ['next']
    default: return []
  }
}

export const nodeById = (g: Graph, id: string) => g.nodes.find((n) => n.id === id)
export const nextEdge = (g: Graph, from: string, outcome: Outcome) =>
  g.edges.find((e) => e.from === from && e.outcome === outcome) ?? null

/** A whole number of minutes, hours or days, more than zero and at most 366 days. */
export function durationMs(d: unknown): number | null {
  if (!isObj(d) || !Number.isInteger(d.amount) || !isUnit(d.unit)) return null
  const ms = (d.amount as number) * UNIT_MS[d.unit]
  return ms > 0 && ms <= MAX_MS ? ms : null
}

/** Offset of a date-relative Time step; zero is allowed ("on the day"). */
function relativeMs(r: unknown): number | null {
  if (!isObj(r) || !Number.isInteger(r.amount) || (r.amount as number) < 0 || !isUnit(r.unit)) return null
  if (r.direction !== 'before' && r.direction !== 'after') return null
  const p = parsePath(r.field)
  if (!p || p.col || p.count) return null
  const ms = (r.amount as number) * UNIT_MS[r.unit]
  return ms <= MAX_MS ? (r.direction === 'before' ? -ms : ms) : null
}

/** When a Time step resumes; null when its date field is empty or unreadable. Dates are UTC days (Phase 2). */
export function timeRunAt(node: TimeNode, data: Answers, now: Date): Date | null {
  if (node.after) {
    const ms = durationMs(node.after)
    return ms === null ? null : new Date(now.getTime() + ms)
  }
  const offset = relativeMs(node.relative)
  const day = node.relative ? toDay(data?.[node.relative.field]) : null
  return offset === null || day === null ? null : new Date(day * UNIT_MS.days + offset)
}

/** Shape only, so a draft with gaps can be stored and drawn; checkGraph judges the content. */
export function readGraph(raw: unknown): Graph | null {
  if (!isObj(raw) || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return null
  const okNode = (n: unknown) => isObj(n) && typeof n.id === 'string' && typeof n.type === 'string' &&
    isObj(n.position) && Number.isFinite(n.position.x) && Number.isFinite(n.position.y)
  const okEdge = (e: unknown) => isObj(e) && typeof e.id === 'string' && typeof e.from === 'string' &&
    typeof e.to === 'string' && typeof e.outcome === 'string' && Array.isArray(e.actions)
  return raw.nodes.every(okNode) && raw.edges.every(okEdge) ? (raw as unknown as Graph) : null
}

/** The publish check (spec §5.3). Never throws; every issue names the step or connection it is pinned to. */
export function checkGraph(raw: unknown, refs: Refs): Issue[] {
  const g = readGraph(raw)
  if (!g) return [{ message: 'This workflow could not be read. Reload the page.' }]
  const issues: Issue[] = []
  const add = (message: string, at: { nodeId?: string; edgeId?: string } = {}) => { issues.push({ message, ...at }) }
  if (g.nodes.length > MAX_NODES) add(`Keep a workflow under ${MAX_NODES} steps.`)

  const byId = new Map<string, WfNode>()
  for (const n of g.nodes) {
    if (!ID_RE.test(n.id) || byId.has(n.id)) { add('A step has a missing or repeated id. Delete it and add it again.', { nodeId: n.id }); continue }
    byId.set(n.id, n)
    checkNode(n, g, refs, (m) => add(m, { nodeId: n.id }))
  }
  const starts = g.nodes.filter((n) => n.type === 'start')
  if (starts.length !== 1) add(starts.length ? 'Keep only one Start step.' : 'Add a Start step.')

  const seen = new Set<string>()
  const pairs = new Set<string>()
  for (const e of g.edges) {
    const at = { edgeId: e.id }
    if (!ID_RE.test(e.id) || seen.has(e.id)) { add('A connection has a missing or repeated id. Delete it and connect again.', at); continue }
    seen.add(e.id)
    const from = byId.get(e.from)
    const to = byId.get(e.to)
    if (!from || !to) { add('A connection points at a deleted step. Delete it.', at); continue }
    if (!outcomesOf(from).includes(e.outcome)) add(`"${nodeName(from)}" has no "${outcomeLabel(e.outcome)}" outcome. Delete this connection.`, at)
    if (to.type === 'start') add('Nothing can lead back to Start. Connect to another step.', at)
    const pair = `${e.from}\u0000${e.outcome}`
    if (pairs.has(pair)) add(`"${nodeName(from)}" has two paths for "${outcomeLabel(e.outcome)}". Keep one.`, at)
    pairs.add(pair)
    for (const a of e.actions) { const m = actionIssue(a); if (m) add(m, at) }
  }
  for (const n of byId.values()) {
    for (const o of outcomesOf(n)) {
      if (!g.edges.some((e) => e.from === n.id && e.outcome === o && byId.has(e.to))) {
        add(`Connect the "${OUTCOME_LABELS[o]}" outcome of "${nodeName(n)}".`, { nodeId: n.id })
      }
    }
  }
  if (starts.length === 1) {
    const reached = reach(g, starts[0].id)
    for (const n of byId.values()) if (!reached.has(n.id)) add(`"${nodeName(n)}" cannot be reached from Start.`, { nodeId: n.id })
  }
  for (const id of stuckLoop(g, byId)) add('This loop has no Form or Time step, so it would never stop. Add one to the loop.', { nodeId: id })
  return issues
}

function checkNode(n: WfNode, g: Graph, refs: Refs, add: (m: string) => void) {
  const name = nodeName(n)
  switch (n.type) {
    case 'start':
    case 'form':
      if (!n.formId) add(`Choose a form for "${name}".`)
      else if (!refs.forms.has(n.formId)) add(`The form for "${name}" no longer exists. Choose another.`)
      if (n.type === 'start') return
      if (n.mode !== 'fill' && n.mode !== 'approve') add(`Choose whether "${name}" is filled in or approved.`)
      if (n.due !== undefined && durationMs(n.due) === null) add(`Enter a due time for "${name}" between 1 minute and 366 days.`)
      return checkAssignee(n, g, refs, add)
    case 'condition':
      if (!isObj(n.rule) || !parsePath(n.rule.field) || !(OPERATORS as readonly unknown[]).includes(n.rule.operator)) add(`Set the rule for "${name}".`)
      return
    case 'time': {
      const hasAfter = n.after !== undefined
      const hasRelative = n.relative !== undefined
      if (hasAfter === hasRelative) return add(`Choose either a wait time or a date field for "${name}".`)
      if (hasAfter && durationMs(n.after) === null) return add(`Enter a wait for "${name}" between 1 minute and 366 days.`)
      if (hasRelative && relativeMs(n.relative) === null) add(`Choose a date field, an amount and before or after for "${name}".`)
      return
    }
    case 'end':
      if (n.status !== 'done' && n.status !== 'rejected') add(`Choose whether "${name}" ends as done or rejected.`)
      return
    default:
      add('This step type is not supported. Delete it.')
  }
}

function checkAssignee(n: FormNode, g: Graph, refs: Refs, add: (m: string) => void) {
  const a: unknown = n.assignee
  const name = nodeName(n)
  if (isObj(a) && typeof a.role === 'string' && a.role) {
    if (!refs.roles.has(a.role)) add(`The role assigned to "${name}" no longer exists.`)
    return
  }
  if (isObj(a) && typeof a.user === 'string' && a.user) {
    if (!refs.users.has(a.user)) add(`The person assigned to "${name}" is no longer a member.`)
    return
  }
  if (isObj(a) && typeof a.step === 'string' && a.step) {
    const s = g.nodes.find((x) => x.id === a.step)
    if (!s || (s.type !== 'start' && s.type !== 'form') || s.id === n.id) add(`"${name}" must be assigned from an earlier Start or Form step.`)
    return
  }
  add(`Choose who completes "${name}".`)
}

function actionIssue(a: unknown): string | null {
  if (!isObj(a)) return 'Remove the broken action from this connection.'
  if (a.type === 'set_status') {
    const label = typeof a.label === 'string' ? a.label.trim() : ''
    return label.length >= 1 && label.length <= 60 ? null : 'Enter the status text (up to 60 characters).'
  }
  // shortcut: template and recipient references are checked once message templates exist (Phase 4).
  if (a.type === 'send_message' || a.type === 'generate_pdf') return null
  return 'Remove the unknown action from this connection.'
}

function reach(g: Graph, from: string): Set<string> {
  const seen = new Set([from])
  const queue = [from]
  while (queue.length) {
    const id = queue.shift() as string
    for (const e of g.edges) if (e.from === id && !seen.has(e.to)) { seen.add(e.to); queue.push(e.to) }
  }
  return seen
}

/** Steps on a cycle made only of Start / Condition / End steps: one advance would spin round it forever. */
function stuckLoop(g: Graph, byId: Map<string, WfNode>): Set<string> {
  const free = (id: string) => { const t = byId.get(id)?.type; return t !== undefined && t !== 'form' && t !== 'time' }
  const next = new Map<string, string[]>()
  for (const e of g.edges) if (free(e.from) && free(e.to)) next.set(e.from, [...(next.get(e.from) ?? []), e.to])
  const state = new Map<string, 1 | 2>() // 1 = on the stack, 2 = finished
  const stack: string[] = []
  const out = new Set<string>()
  const visit = (id: string) => {
    state.set(id, 1)
    stack.push(id)
    for (const to of next.get(id) ?? []) {
      if (state.get(to) === 1) for (const x of stack.slice(stack.lastIndexOf(to))) out.add(x)
      else if (!state.has(to)) visit(to)
    }
    stack.pop()
    state.set(id, 2)
  }
  for (const id of next.keys()) if (!state.has(id)) visit(id)
  return out
}
```

- [ ] **Step 5: Run — expect PASS under node**

Run: `pnpm test`
Expected: `# pass 75` `# fail 0` (63 from Phases 1–2 + 12).

- [ ] **Step 6: Run the same file under Deno**

Run: `DENO_NO_PACKAGE_JSON=1 deno test supabase/functions/_shared`
Expected: all shared tests pass, including the 12 new ones; outputs identical to node.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/workflow/graph.ts supabase/functions/_shared/workflow/fixture.ts supabase/functions/_shared/workflow/graph.test.ts
git commit -m "feat: add shared workflow graph types and publish check"
```

---
### Task 2: Database — workflows, records, tasks, timers, access, RLS, cron

**Owner:** Backend engineer · **Depends on:** — (Phase 1–2 migrations)

**Files:**
- Create: `supabase/migrations/20261014000001_workflows.sql`, `supabase/tests/06_workflows.test.sql`
- Modify: `supabase/seed.sql`, `supabase/tests/05_forms.test.sql` (org form count), `src/data/database.types.ts` (regenerated)

**Interfaces:**
- Consumes: `is_member(uuid)`, `current_member_id(uuid)`, `has_permission(uuid, text)`, `audit(uuid, text, text, jsonb, jsonb)` (Phase 1); `forms`, `form_submissions` (Phase 2).
- Produces:
  - `workflows(id, org_id, name, status draft|published, graph jsonb {nodes, edges}, created_by, updated_by, published_by, published_at, created_at, updated_at)`; `unique (id, org_id)`.
  - `workflow_access(workflow_id, org_id, role_id, can_start, can_view_all)`; PK `(workflow_id, role_id)`.
  - `records(id, org_id, workflow_id, title, current_node_id, status open|done|rejected|error, label, error, data jsonb object, step int, started_by, created_at, updated_at)`; FK to `workflows(id, org_id) on delete restrict`.
  - `form_submissions` + `record_id`, `node_id`, `task_id unique`, `outcome submitted|approved|rejected` (default `submitted`).
  - `tasks(id, org_id, record_id, node_id, assignee_role_id, assignee_user_id, claimed_by, due_at, status open|done|cancelled, overdue_notified_at, created_at, done_at)`; at most one `open` per record.
  - `scheduled_actions(id, org_id, record_id, resume_node_id, run_at, state_at_schedule int, status pending|done|skipped|failed, error, created_at, finished_at)`.
  - `record_events(id bigint, org_id, record_id, kind, node_id, actor_id, detail jsonb, created_at)`.
  - Functions: `has_permission(p_org uuid, p_perm text, p_workflow uuid) → boolean` (definer); `record_visible(p_record uuid) → boolean` (definer, caller-scoped); `can_start(workflows) → boolean` and `is_mine(tasks) → boolean` (PostgREST computed columns); `claim_task(p_task uuid) → void`; `open_record_counts(p_workflow uuid) → table(node_id text, n int)`.
  - Error sentences raised: `'A step with open records cannot be deleted: <node> (<n> open)'`, `'This task was already claimed or completed.'`, `'A published workflow cannot go back to draft.'`.
  - Cron job `resume-workflows` (every minute) posting to Vault `resume_url` with `Bearer <cron_secret>` when a pending row is due.
  - Seed: form `…0000000000f3` "Manager approval"; workflow `0000000a-0000-0000-0000-00000000c001` "Leave approval", published, the Task 1 fixture shape with the real Admin role id and a 1-minute wait.

- [ ] **Step 1: Write the failing test** — `supabase/tests/06_workflows.test.sql`

```sql
begin;
select plan(41);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

\set alpha 0000000a-0000-0000-0000-000000000001
\set beta 0000000b-0000-0000-0000-000000000001
\set wf 0000000a-0000-0000-0000-00000000c001
\set wf2 0000000a-0000-0000-0000-00000000c002
\set rec 0000000a-0000-0000-0000-00000000d001
\set task 0000000a-0000-0000-0000-00000000e001
\set f3 0000000a-0000-0000-0000-0000000000f3
\set owner 00000000-0000-0000-0000-0000000000a1
\set admin 00000000-0000-0000-0000-0000000000a2
\set member 00000000-0000-0000-0000-0000000000a3
\set viewer 00000000-0000-0000-0000-0000000000a4
\set betaowner 00000000-0000-0000-0000-0000000000b1

-- A manager creates a workflow: it starts as an empty draft, access is seeded, the write is audited
select pg_temp.act_as(:'admin');
select lives_ok(format($$ insert into workflows (id, org_id, name, status, graph) values (%L, %L, 'Trip approval', 'published', '{"nodes":[{"id":"x"}],"edges":[]}') $$, :'wf2', :'alpha'),
  'admin creates a workflow');
select results_eq(format($$ select status, graph from workflows where id = %L $$, :'wf2'),
  $$ values ('draft'::text, '{"nodes":[],"edges":[]}'::jsonb) $$, 'a new workflow is an empty draft whatever the client sends');
select results_eq(format($$ select r.name, wa.can_start, wa.can_view_all from workflow_access wa join roles r on r.id = wa.role_id where wa.workflow_id = %L order by r.name $$, :'wf2'),
  $$ values ('Admin'::text, true, true), ('Member'::text, true, false) $$, 'access is seeded from the roles holding records.start / records.view_all');
select isnt_empty(format($$ select 1 from audit_log where action = 'workflow.create' and target = %L $$, :'wf2'), 'workflow create audited');
select is_empty(format($$ update workflows set name = 'Hacked' where id = %L returning id $$, :'wf2'), 'clients cannot update workflows; save-workflow is the only writer');

-- Members see published workflows only and cannot write them
select pg_temp.act_as(:'member');
select throws_ok(format($$ insert into workflows (org_id, name) values (%L, 'Nope') $$, :'alpha'), '42501', null, 'member cannot create workflows');
select results_eq(format($$ select id::text from workflows where org_id = %L $$, :'alpha'), format($$ values (%L::text) $$, :'wf'),
  'member sees the published workflow, not the draft');
select ok(has_permission(:'alpha'::uuid, 'records.start', :'wf'::uuid), 'member may start the seeded workflow');
select ok((select can_start(w) from workflows w where w.id = :'wf'), 'the can_start computed column agrees');

-- workflow_access narrows records.start; Owners are never narrowed
select pg_temp.act_as(:'admin');
select lives_ok(format($$ delete from workflow_access where workflow_id = %L and role_id = (select id from roles where org_id = %L and name = 'Member') $$, :'wf', :'alpha'),
  'admin removes the Member row');
select isnt_empty(format($$ select 1 from audit_log where action = 'workflow.access' and target = %L $$, :'wf'), 'access change audited');
select pg_temp.act_as(:'member');
select ok(not has_permission(:'alpha'::uuid, 'records.start', :'wf'::uuid), 'without a can_start row the member cannot start it');
select ok(has_permission(:'alpha'::uuid, 'records.start'), 'the org-wide permission is unchanged');
select throws_ok(format($$ insert into workflow_access (workflow_id, org_id, role_id, can_start) select %L, %L, id, true from roles where org_id = %L and name = 'Member' $$, :'wf', :'alpha', :'alpha'),
  '42501', null, 'member cannot grant themselves access');
select pg_temp.act_as(:'owner');
select ok(has_permission(:'alpha'::uuid, 'records.start', :'wf'::uuid), 'an Owner is never narrowed');
select pg_temp.act_as(:'viewer');
select ok(not has_permission(:'alpha'::uuid, 'records.view_all', :'wf'::uuid), 'viewer cannot view all records');

-- Record visibility: starter, view_all, holder of an open role task
reset role;
insert into records (id, org_id, workflow_id, title, current_node_id, started_by) values (:'rec', :'alpha', :'wf', 'Leave approval: Ada', 'approve', :'member');
insert into tasks (id, org_id, record_id, node_id, assignee_role_id)
values (:'task', :'alpha', :'rec', 'approve', (select id from roles where org_id = :'alpha' and name = 'Viewer'));
select pg_temp.act_as(:'member');
select isnt_empty(format($$ select 1 from records where id = %L $$, :'rec'), 'the starter sees their record');
select pg_temp.act_as(:'admin');
select isnt_empty(format($$ select 1 from records where id = %L $$, :'rec'), 'records.view_all with a can_view_all row sees every record');
select pg_temp.act_as(:'viewer');
select isnt_empty(format($$ select 1 from records where id = %L $$, :'rec'), 'a holder of the open task''s role sees the record');
select ok((select is_mine(t) from tasks t where t.id = :'task'), 'the role task is in the viewer''s inbox');
select lives_ok(format($$ select claim_task(%L) $$, :'task'), 'viewer claims the role task');
select throws_ok(format($$ select claim_task(%L) $$, :'task'), 'P0001', 'This task was already claimed or completed.', 'a second claim is refused');
select pg_temp.act_as(:'member');
select throws_ok(format($$ select claim_task(%L) $$, :'task'), '42501', null, 'only holders of the task''s role can claim it');
select throws_ok(format($$ insert into records (org_id, workflow_id, title, started_by) values (%L, %L, 'x', auth.uid()) $$, :'alpha', :'wf'),
  '42501', null, 'clients cannot insert records');
select throws_ok(format($$ insert into tasks (org_id, record_id, node_id, assignee_user_id) values (%L, %L, 'approve', auth.uid()) $$, :'alpha', :'rec'),
  '42501', null, 'clients cannot insert tasks');
select throws_ok(format($$ insert into scheduled_actions (org_id, record_id, resume_node_id, run_at, state_at_schedule) values (%L, %L, 'wait', now(), 0) $$, :'alpha', :'rec'),
  '42501', null, 'clients cannot insert scheduled actions');

-- Another org sees nothing
select pg_temp.act_as(:'betaowner');
select is_empty(format($$ select 1 from records where org_id = %L $$, :'alpha'), 'beta owner reads no alpha records');
select is_empty(format($$ select 1 from tasks where org_id = %L $$, :'alpha'), 'beta owner reads no alpha tasks');
select is_empty(format($$ select 1 from workflows where org_id = %L $$, :'alpha'), 'beta owner reads no alpha workflows');
select ok(not has_permission(:'alpha'::uuid, 'records.start', :'wf'::uuid), 'beta owner cannot start an alpha workflow');

-- Submissions on a record: one per task, the step is named, the starter can read them
reset role;
insert into form_submissions (org_id, form_id, answers, submitted_by, record_id, node_id, task_id, outcome)
values (:'alpha', :'f3', '{}', :'viewer', :'rec', 'approve', :'task', 'approved');
select throws_ok(format($$ insert into form_submissions (org_id, form_id, answers, submitted_by, record_id, node_id, task_id, outcome) values (%L, %L, '{}', %L, %L, 'approve', %L, 'approved') $$, :'alpha', :'f3', :'admin', :'rec', :'task'),
  '23505', null, 'a task takes one submission, so a double approval cannot both land');
select throws_ok(format($$ insert into form_submissions (org_id, form_id, answers, submitted_by, record_id) values (%L, %L, '{}', %L, %L) $$, :'alpha', :'f3', :'admin', :'rec'),
  '23514', null, 'a workflow submission names its step');
select throws_ok(format($$ insert into tasks (org_id, record_id, node_id, assignee_user_id) values (%L, %L, 'approve', %L) $$, :'alpha', :'rec', :'admin'),
  '23505', null, 'a record has at most one open task');
select pg_temp.act_as(:'member');
select isnt_empty(format($$ select 1 from form_submissions where record_id = %L $$, :'rec'), 'the starter reads every submission on their record');

-- Node-deletion guard
reset role;
select throws_ok(format($$ update workflows set graph = '{"nodes":[],"edges":[]}' where id = %L $$, :'wf'),
  'P0001', 'A step with open records cannot be deleted: approve (1 open)', 'a step with an open record cannot be deleted');
select lives_ok(format($$ update workflows set graph = jsonb_set(graph, '{nodes}', (select jsonb_agg(n) from jsonb_array_elements(graph->'nodes') n where n->>'id' <> 'wait')) where id = %L $$, :'wf'),
  'other steps can still be deleted');
select pg_temp.act_as(:'admin');
select results_eq(format($$ select node_id, n from open_record_counts(%L) $$, :'wf'), $$ values ('approve'::text, 1) $$, 'managers see open records per step');
select pg_temp.act_as(:'member');
select throws_ok(format($$ select * from open_record_counts(%L) $$, :'wf'), '42501', null, 'only workflow managers see the counts');
select pg_temp.act_as(:'admin');
select throws_ok(format($$ delete from workflows where id = %L $$, :'wf'), '23503', null, 'a workflow with records cannot be deleted');

-- Claims are audited; the resume job is scheduled
reset role;
select isnt_empty(format($$ select 1 from audit_log where action = 'task.claim' and target = %L $$, :'task'), 'task claim audited');
select isnt_empty($$ select 1 from cron.job where jobname = 'resume-workflows' and schedule = '* * * * *' $$, 'resume job runs every minute');

select * from finish();
rollback;
```

- [ ] **Step 2: Run — expect FAIL**

Run: `supabase db reset && supabase test db`
Expected: `06_workflows.test.sql` fails with `relation "workflows" does not exist`.

- [ ] **Step 3: Implement** — `supabase/migrations/20261014000001_workflows.sql`

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Lets workflow_access and tasks prove a role belongs to the same org.
alter table roles add constraint roles_id_org_key unique (id, org_id);

create table workflows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'published')),
  graph jsonb not null default '{"nodes":[],"edges":[]}'
    check (jsonb_typeof(graph->'nodes') = 'array' and jsonb_typeof(graph->'edges') = 'array'),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create index workflows_org_idx on workflows (org_id);

create table workflow_access (
  workflow_id uuid not null,
  org_id uuid not null,
  role_id uuid not null,
  can_start boolean not null default false,
  can_view_all boolean not null default false,
  primary key (workflow_id, role_id),
  foreign key (workflow_id, org_id) references workflows (id, org_id) on delete cascade,
  foreign key (role_id, org_id) references roles (id, org_id) on delete cascade
);

create table records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  workflow_id uuid not null,
  title text not null check (length(title) between 1 and 200),
  current_node_id text,
  status text not null default 'open' check (status in ('open', 'done', 'rejected', 'error')),
  label text check (length(label) <= 60),
  error text,
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  step int not null default 0, -- bumped on every move; scheduled_actions.state_at_schedule compares against it
  started_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (workflow_id, org_id) references workflows (id, org_id) on delete restrict
);
create index records_org_idx on records (org_id, created_at desc);
create index records_workflow_node_idx on records (workflow_id, current_node_id) where status in ('open', 'error');

create table tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  record_id uuid not null,
  node_id text not null,
  -- shortcut: a deleted role leaves its open tasks unassigned (visible to records.view_all only) until admin record tools (Phase 5).
  assignee_role_id uuid references roles(id) on delete set null,
  assignee_user_id uuid references auth.users(id) on delete set null,
  claimed_by uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  overdue_notified_at timestamptz, -- written by Phase 4's overdue sender
  created_at timestamptz not null default now(),
  done_at timestamptz,
  foreign key (record_id, org_id) references records (id, org_id) on delete cascade
);
-- The graph has no parallel split, so a record waits on one task at a time.
create unique index tasks_one_open_per_record on tasks (record_id) where status = 'open';
create index tasks_user_open_idx on tasks (assignee_user_id) where status = 'open';
create index tasks_role_open_idx on tasks (assignee_role_id) where status = 'open';

-- Spec §5.1 `submissions` is Phase 2's table, extended: standalone rows keep record_id/node_id null.
alter table form_submissions
  add column record_id uuid,
  add column node_id text,
  add column task_id uuid unique references tasks(id) on delete set null,
  add column outcome text not null default 'submitted' check (outcome in ('submitted', 'approved', 'rejected')),
  add constraint form_submissions_record_fkey foreign key (record_id, org_id) references records (id, org_id) on delete cascade,
  add constraint form_submissions_step_check check ((record_id is null) = (node_id is null));
create index form_submissions_record_idx on form_submissions (record_id, created_at) where record_id is not null;

create table scheduled_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  record_id uuid not null,
  resume_node_id text not null,
  run_at timestamptz not null,
  state_at_schedule int not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (record_id, org_id) references records (id, org_id) on delete cascade
);
create index scheduled_actions_due_idx on scheduled_actions (run_at) where status = 'pending';

create table record_events (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  record_id uuid not null,
  kind text not null check (kind in ('started', 'submitted', 'task', 'claimed', 'condition', 'waiting', 'resumed', 'skipped', 'action', 'error', 'closed')),
  node_id text,
  actor_id uuid references auth.users(id) on delete set null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (record_id, org_id) references records (id, org_id) on delete cascade
);
create index record_events_record_idx on record_events (record_id, id);

-- Workflow-scoped check (spec §7). A separate overload, not a default argument: a default would make
-- every existing two-argument call ambiguous.
create or replace function has_permission(p_org uuid, p_perm text, p_workflow uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_permission(p_org, p_perm) and (
    p_workflow is null
    or p_perm not in ('records.start', 'records.view_all')
    or exists (select 1 from member_roles mr join roles r on r.id = mr.role_id
               where mr.member_id = current_member_id(p_org) and r.is_owner)
    or exists (select 1 from workflow_access wa join member_roles mr on mr.role_id = wa.role_id
               where wa.workflow_id = p_workflow and wa.org_id = p_org
                 and mr.member_id = current_member_id(p_org)
                 and case p_perm when 'records.start' then wa.can_start else wa.can_view_all end))
$$;

-- One rule for "may I see this record", shared by every runtime table's policy. SECURITY DEFINER so the
-- records ⇄ form_submissions ⇄ tasks references do not recurse through each other's RLS; it only ever
-- answers for the caller, so it is safe for clients to call (QA-5).
create or replace function record_visible(p_record uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from records r
    where r.id = p_record and is_member(r.org_id) and (
      r.started_by = auth.uid()
      or has_permission(r.org_id, 'records.view_all', r.workflow_id)
      or exists (select 1 from form_submissions s where s.record_id = r.id and s.submitted_by = auth.uid())
      or exists (select 1 from tasks t where t.record_id = r.id and (
            t.assignee_user_id = auth.uid() or t.claimed_by = auth.uid()
            or (t.status = 'open' and t.claimed_by is null and t.assignee_role_id in (
                  select mr.role_id from member_roles mr where mr.member_id = current_member_id(r.org_id))))))
  )
$$;

-- PostgREST computed columns (`select … can_start` / `.eq('is_mine', true)`).
create or replace function can_start(w workflows) returns boolean language sql stable as $$
  select w.status = 'published' and has_permission(w.org_id, 'records.start', w.id)
$$;
create or replace function is_mine(t tasks) returns boolean
language sql stable security definer set search_path = public as $$
  select t.status = 'open' and (
    t.assignee_user_id = auth.uid() or t.claimed_by = auth.uid()
    or (t.claimed_by is null and exists (
          select 1 from member_roles mr where mr.member_id = current_member_id(t.org_id) and mr.role_id = t.assignee_role_id)))
$$;

alter table workflows enable row level security;
alter table workflow_access enable row level security;
alter table records enable row level security;
alter table tasks enable row level security;
alter table scheduled_actions enable row level security;
alter table record_events enable row level security;

create policy workflows_read on workflows for select
  using (is_member(org_id) and (status = 'published' or has_permission(org_id, 'workflows.manage')));
create policy workflows_insert on workflows for insert with check (has_permission(org_id, 'workflows.manage'));
create policy workflows_delete on workflows for delete using (has_permission(org_id, 'workflows.manage'));
-- No update policy: save-workflow (service role) is the only writer of name, graph and status, after the publish check.

create policy workflow_access_read on workflow_access for select using (is_member(org_id));
create policy workflow_access_insert on workflow_access for insert with check (has_permission(org_id, 'workflows.manage'));
create policy workflow_access_update on workflow_access for update
  using (has_permission(org_id, 'workflows.manage')) with check (has_permission(org_id, 'workflows.manage'));
create policy workflow_access_delete on workflow_access for delete using (has_permission(org_id, 'workflows.manage'));

create policy records_read on records for select using (record_visible(id));
create policy tasks_read on tasks for select using (record_visible(record_id));
create policy scheduled_actions_read on scheduled_actions for select using (record_visible(record_id));
create policy record_events_read on record_events for select using (record_visible(record_id));
-- No insert/update/delete policies on the runtime tables: advance / resume (direct connection) are the only writers.

drop policy form_submissions_read on form_submissions;
create policy form_submissions_read on form_submissions for select
  using ((submitted_by = auth.uid() and is_member(org_id))
    or has_permission(org_id, 'forms.manage')
    or (record_id is not null and record_visible(record_id)));

create or replace function workflows_before_write() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_by := new.created_by;
    new.status := 'draft';
    new.graph := '{"nodes":[],"edges":[]}';
    new.published_by := null;
    new.published_at := null;
    return new;
  end if;
  if new.org_id is distinct from old.org_id then raise exception 'Not allowed' using errcode = '42501'; end if;
  if new.status = 'draft' and old.status = 'published' then raise exception 'A published workflow cannot go back to draft.'; end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  if new.status = 'published' and old.status = 'draft' then
    new.published_at := now();
    new.published_by := new.updated_by;
  else
    new.published_at := old.published_at;
    new.published_by := old.published_by;
  end if;
  return new;
end $$;
create trigger workflows_before_write before insert or update on workflows for each row execute function workflows_before_write();

-- Authoritative node-deletion guard (spec §5.1), whichever path writes the graph. advance holds FOR SHARE on the
-- workflow, so this sees any record that an in-flight advance moves.
create or replace function workflows_guard_steps() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_node text;
  v_n int;
begin
  select r.current_node_id, count(*)::int into v_node, v_n
  from records r
  where r.workflow_id = new.id and r.status in ('open', 'error') and r.current_node_id is not null
    and not exists (select 1 from jsonb_array_elements(new.graph->'nodes') e where e->>'id' = r.current_node_id)
  group by r.current_node_id order by r.current_node_id limit 1;
  if v_node is not null then
    raise exception 'A step with open records cannot be deleted: % (% open)', v_node, v_n;
  end if;
  return new;
end $$;
create trigger workflows_guard_steps before update of graph on workflows for each row execute function workflows_guard_steps();

-- New workflows inherit access from the roles that already hold the org-wide permissions.
create or replace function workflows_seed_access() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into workflow_access (workflow_id, org_id, role_id, can_start, can_view_all)
  select new.id, new.org_id, r.id,
    exists (select 1 from role_permissions rp where rp.role_id = r.id and rp.permission = 'records.start'),
    exists (select 1 from role_permissions rp where rp.role_id = r.id and rp.permission = 'records.view_all')
  from roles r
  where r.org_id = new.org_id and not r.is_owner
    and exists (select 1 from role_permissions rp where rp.role_id = r.id and rp.permission in ('records.start', 'records.view_all'));
  return null;
end $$;
create trigger workflows_seed_access after insert on workflows for each row execute function workflows_seed_access();

-- save-workflow writes with the service role, so the actor comes from updated_by when auth.uid() is null.
create or replace function audit_workflows() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into audit_log (org_id, actor_id, action, target, after)
    values (new.org_id, coalesce(auth.uid(), new.created_by), 'workflow.create', new.id::text, jsonb_build_object('name', new.name));
  elsif tg_op = 'UPDATE' then
    insert into audit_log (org_id, actor_id, action, target, before, after)
    values (new.org_id, coalesce(auth.uid(), new.updated_by),
      case when new.status = 'published' and old.status = 'draft' then 'workflow.publish' else 'workflow.update' end, new.id::text,
      jsonb_build_object('name', old.name, 'status', old.status, 'steps', jsonb_array_length(old.graph->'nodes')),
      jsonb_build_object('name', new.name, 'status', new.status, 'steps', jsonb_array_length(new.graph->'nodes')));
  else
    insert into audit_log (org_id, actor_id, action, target, before)
    values (old.org_id, auth.uid(), 'workflow.delete', old.id::text, jsonb_build_object('name', old.name));
  end if;
  return null;
end $$;
create trigger workflows_audit after insert or update or delete on workflows for each row execute function audit_workflows();

create or replace function audit_workflow_access() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return null; end if; -- rows seeded by workflows_seed_access belong to workflow.create
  perform audit(coalesce(new.org_id, old.org_id), 'workflow.access', coalesce(new.workflow_id, old.workflow_id)::text,
    case when tg_op = 'INSERT' then null else jsonb_build_object('role', old.role_id, 'can_start', old.can_start, 'can_view_all', old.can_view_all) end,
    case when tg_op = 'DELETE' then null else jsonb_build_object('role', new.role_id, 'can_start', new.can_start, 'can_view_all', new.can_view_all) end);
  return null;
end $$;
create trigger workflow_access_audit after insert or update or delete on workflow_access for each row execute function audit_workflow_access();

revoke execute on function workflows_before_write(), workflows_guard_steps(), workflows_seed_access(), audit_workflows(), audit_workflow_access()
  from public, anon, authenticated;

create or replace function claim_task(p_task uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_t tasks;
begin
  select * into v_t from tasks where id = p_task;
  if v_t.id is null or not is_member(v_t.org_id) or v_t.assignee_role_id is null
     or not exists (select 1 from member_roles where member_id = current_member_id(v_t.org_id) and role_id = v_t.assignee_role_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update tasks set claimed_by = auth.uid() where id = p_task and status = 'open' and claimed_by is null;
  if not found then raise exception 'This task was already claimed or completed.'; end if;
  insert into record_events (org_id, record_id, kind, node_id, actor_id) values (v_t.org_id, v_t.record_id, 'claimed', v_t.node_id, auth.uid());
  perform audit(v_t.org_id, 'task.claim', p_task::text, null, jsonb_build_object('record', v_t.record_id));
end $$;

create or replace function open_record_counts(p_workflow uuid) returns table (node_id text, n int)
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := (select org_id from workflows where id = p_workflow);
begin
  if v_org is null or not has_permission(v_org, 'workflows.manage') then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
    select r.current_node_id, count(*)::int from records r
    where r.workflow_id = p_workflow and r.status in ('open', 'error') and r.current_node_id is not null
    group by r.current_node_id;
end $$;
revoke execute on function claim_task(uuid), open_record_counts(uuid) from public, anon;

-- Every minute: wake `resume` when a timer is due. URL and secret live in Vault (seed.sql locally, README for hosted).
select cron.schedule('resume-workflows', '* * * * *', $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'resume_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb)
  where exists (select 1 from public.scheduled_actions where status = 'pending' and run_at <= now())
$cron$);
```

- [ ] **Step 4: Seed** — append to `supabase/seed.sql`, and change the count in `supabase/tests/05_forms.test.sql`

```sql
-- Phase 3: an approval form and a published "Leave approval" workflow (same shape as _shared/workflow/fixture.ts).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into forms (id, org_id, name, schema) values ('0000000a-0000-0000-0000-0000000000f3', '0000000a-0000-0000-0000-000000000001', 'Manager approval',
  '[{"key":"comment","type":"long_text","label":"Comment"}]');
insert into workflows (id, org_id, name) values ('0000000a-0000-0000-0000-00000000c001', '0000000a-0000-0000-0000-000000000001', 'Leave approval');
update workflows set status = 'published', updated_by = '00000000-0000-0000-0000-0000000000a1', graph = replace($json${
  "nodes": [
    {"id":"start","type":"start","formId":"0000000a-0000-0000-0000-0000000000f1","position":{"x":0,"y":0}},
    {"id":"approve","type":"form","label":"Manager approval","formId":"0000000a-0000-0000-0000-0000000000f3","assignee":{"role":"ROLE_ADMIN"},"mode":"approve","due":{"amount":2,"unit":"days"},"position":{"x":240,"y":0}},
    {"id":"long","type":"condition","label":"More than 2 days?","rule":{"field":"days","operator":"gt","value":2},"position":{"x":480,"y":0}},
    {"id":"wait","type":"time","label":"Wait a minute","after":{"amount":1,"unit":"minutes"},"position":{"x":720,"y":0}},
    {"id":"done","type":"end","label":"Approved","status":"done","position":{"x":960,"y":0}},
    {"id":"rejected","type":"end","label":"Rejected","status":"rejected","position":{"x":480,"y":160}}
  ],
  "edges": [
    {"id":"e1","from":"start","outcome":"submitted","to":"approve","actions":[]},
    {"id":"e2","from":"approve","outcome":"approved","to":"long","actions":[{"type":"send_message"}]},
    {"id":"e3","from":"approve","outcome":"rejected","to":"rejected","actions":[{"type":"set_status","label":"Rejected by manager"}]},
    {"id":"e4","from":"long","outcome":"yes","to":"wait","actions":[]},
    {"id":"e5","from":"long","outcome":"no","to":"done","actions":[]},
    {"id":"e6","from":"wait","outcome":"next","to":"done","actions":[{"type":"generate_pdf"}]}
  ]
}$json$, 'ROLE_ADMIN', (select id::text from roles where org_id = '0000000a-0000-0000-0000-000000000001' and name = 'Admin'))::jsonb
where id = '0000000a-0000-0000-0000-00000000c001';

-- pg_cron → resume (local values only; hosted projects set their own, see README).
select vault.create_secret('http://host.docker.internal:54321/functions/v1/resume', 'resume_url');
select vault.create_secret('local-cron-secret', 'cron_secret');
```

In `supabase/tests/05_forms.test.sql` the seed now has three Alpha forms (Leave request, Manager approval, and the test's Trip consent):

```sql
select results_eq(format($$ select count(*)::int from forms where org_id = %L $$, :'alpha'), array[3], 'member reads the org forms');
```

- [ ] **Step 5: Run — expect PASS**

Run: `supabase db reset && supabase test db`
Expected: `All tests successful.` — 6 files, 111 tests (70 from Phases 1–2 + 41).

- [ ] **Step 6: Regenerate types and commit**

```bash
pnpm db:types
git add supabase/migrations/20261014000001_workflows.sql supabase/tests/06_workflows.test.sql supabase/tests/05_forms.test.sql supabase/seed.sql src/data/database.types.ts
git commit -m "feat: add workflows, records, tasks, timers and workflow access with RLS"
```

---

### Task 3: Runtime engine with a locking test store

**Owner:** Backend engineer · **Depends on:** Task 1

**Files:**
- Create: `supabase/functions/_shared/forms/uploads.ts`, `supabase/functions/advance/engine.ts`, `supabase/functions/advance/testkit.ts`
- Test: `supabase/functions/advance/engine.test.ts`
- Modify: `supabase/functions/_shared/forms/index.ts`, `supabase/functions/submit-form/handler.ts`

**Interfaces:**
- Consumes: `validateAnswers`, `validateSchema`, `evaluate`, `Field`, `Answers` (Phase 2); `readGraph`, `nextEdge`, `nodeById`, `nodeName`, `outcomesOf`, `durationMs`, `timeRunAt`, graph types (Task 1). Table and column names from Task 2 (the pg adapter in Task 4 maps them 1:1).
- Produces:
  - `missingUploads(fields: Field[], answers: Answers, fileExists: (path: string) => Promise<boolean>): Promise<Record<string, string>>` (shared forms module; `submit-form` now uses it)
  - `type RecordRow`, `WorkflowRow`, `TaskRow`, `ScheduledRow`, `EventKind`, `NewRecord`, `NewSubmission`, `NewTask`, `NewEvent`
  - `interface Tx` (one transaction; methods listed in the code) · `interface Store { tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> }`
  - `type Ctx = { now: Date; actor: string; fileExists(path: string): Promise<boolean> }` · `type Result = { status: number; body: Record<string, unknown> }`
  - `class StepError extends Error`
  - `recordTitle(fields: Field[], answers: Answers, fallback: string): string`
  - `walk(tx: Tx, rec: RecordRow, graph: Graph, from: string, outcome: Outcome, ctx: { now: Date; actor: string | null }): Promise<RecordRow>`
  - `startRecord(tx: Tx, input: { workflowId: string; answers: Answers }, ctx: Ctx): Promise<Result>` → `200 { recordId, status }` · `400 { error, fieldErrors }` · `403` · `404` · `409`
  - `submitTask(tx: Tx, input: { taskId: string; outcome: string; answers: Answers }, ctx: Ctx): Promise<Result>` → `200 { recordId, status }` · `400` · `403` · `404` · `409`
  - `resumeOne(tx: Tx, id: string, now: Date): Promise<'done' | 'skipped' | 'failed' | 'gone'>` · `failScheduled(tx: Tx, id: string, message: string): Promise<void>`
  - Tests only: `fakeStore(db: Db): Store`, `type Db`, `setup(graph?: Graph)` in `testkit.ts`

- [ ] **Step 1: Move `missingUploads` into the shared forms module** — `supabase/functions/_shared/forms/uploads.ts`

```ts
import type { Answers, Field } from './types.ts'

const isObj = (v: unknown): v is Answers => !!v && typeof v === 'object' && !Array.isArray(v)

/** Shape and prefix are already checked by validateAnswers; this proves each referenced object was really uploaded (QA-P2-1). */
export async function missingUploads(fields: Field[], answers: Answers, fileExists: (path: string) => Promise<boolean>): Promise<Record<string, string>> {
  const jobs: Promise<[string, string] | null>[] = []
  const probe = (f: Field, v: unknown, key: string) => {
    if ((f.type !== 'file' && f.type !== 'signature') || typeof v !== 'string') return
    const msg = f.type === 'file' ? 'Upload the file again.' : 'Sign again.'
    jobs.push(fileExists(v).then((ok) => (ok ? null : [key, msg])))
  }
  for (const f of fields) {
    const v = answers[f.key]
    if (f.type === 'group' && Array.isArray(v)) {
      v.forEach((row, i) => { for (const c of f.fields ?? []) if (isObj(row)) probe(c, row[c.key], `${f.key}.${i}.${c.key}`) })
    } else probe(f, v, f.key)
  }
  return Object.fromEntries((await Promise.all(jobs)).filter((x): x is [string, string] => !!x))
}
```

`supabase/functions/_shared/forms/index.ts` — add the line:
```ts
export * from './uploads.ts'
```

`supabase/functions/submit-form/handler.ts` — delete the local `missingUploads` function, add `missingUploads` to the import from `'../_shared/forms/index.ts'`, and change the call to:
```ts
  const missing = await missingUploads(form.schema as Field[], checked.answers, deps.fileExists)
```

- [ ] **Step 2: Write the test kit** — `supabase/functions/advance/testkit.ts` (tests only)

```ts
import type { NewEvent, NewSubmission, RecordRow, ScheduledRow, Store, TaskRow, Tx, WorkflowRow } from './engine.ts'
import { startRecord, submitTask, resumeOne, type Ctx } from './engine.ts'
import type { Graph } from '../_shared/workflow/graph.ts'
import { FORM, ORG, VALID } from '../_shared/forms/fixture.ts'
import { ADMIN, F_APPROVAL, F_LEAVE, LEAVE, MEMBER, ROLE_ADMIN, WF } from '../_shared/workflow/fixture.ts'

type Sched = ScheduledRow & { run_at: Date; status: 'pending' | 'done' | 'skipped' | 'failed'; error: string | null }
export type Db = {
  workflows: WorkflowRow[]
  forms: { id: string; org_id: string; schema: unknown }[]
  members: { user_id: string; org_id: string }[]
  roles: { id: string; org_id: string }[]
  starters: Set<string> // `${userId}:${workflowId}` pairs that pass has_permission(org, 'records.start', workflow)
  records: RecordRow[]
  tasks: (TaskRow & { due_at: Date | null })[]
  submissions: (NewSubmission & { id: string })[]
  scheduled: Sched[]
  events: NewEvent[]
}

/** Yields so two transactions interleave the way two connections would. */
const tick = () => new Promise((r) => setTimeout(r, 0))

/**
 * In-memory Tx with real per-record and per-timer locks held until the transaction ends, like FOR UPDATE.
 * shortcut: no rollback; every engine path either fails before its first write or commits, and the race test (Task 4)
 * covers real Postgres.
 */
export function fakeStore(db: Db): Store {
  const locks = new Map<string, Promise<void>>()
  let seq = 0
  const id = (p: string) => `${p}-${++seq}`
  return {
    async tx(fn) {
      const held: (() => void)[] = []
      const lock = async (key: string) => {
        const prev = locks.get(key) ?? Promise.resolve()
        let release!: () => void
        const mine = new Promise<void>((r) => { release = r })
        locks.set(key, prev.then(() => mine))
        await prev
        held.push(release)
      }
      const tx: Tx = {
        workflow: async (wid) => { await tick(); return db.workflows.find((w) => w.id === wid) ?? null },
        lockRecord: async (rid) => {
          await lock(`r:${rid}`)
          const r = db.records.find((x) => x.id === rid)
          return r ? structuredClone(r) : null
        },
        task: async (tid) => { await tick(); const t = db.tasks.find((x) => x.id === tid); return t ? { ...t } : null },
        form: async (fid, org) => db.forms.find((f) => f.id === fid && f.org_id === org) ?? null,
        can: async (user, _org, _perm, wid) => db.starters.has(`${user}:${wid}`),
        isActiveMember: async (user, org) => db.members.some((m) => m.user_id === user && m.org_id === org),
        roleExists: async (role, org) => db.roles.some((r) => r.id === role && r.org_id === org),
        lastSubmitter: async (rid, nid) => db.submissions.filter((s) => s.record_id === rid && s.node_id === nid).at(-1)?.submitted_by ?? null,
        insertRecord: async (row) => {
          const r: RecordRow = { ...row, id: id('rec'), current_node_id: null, status: 'open', label: null, error: null, step: 0 }
          db.records.push(r)
          await lock(`r:${r.id}`)
          return structuredClone(r)
        },
        saveRecord: async (rec) => { db.records[db.records.findIndex((x) => x.id === rec.id)] = structuredClone(rec) },
        insertSubmission: async (row) => {
          if (row.task_id && db.submissions.some((s) => s.task_id === row.task_id)) throw new Error('duplicate key value violates unique constraint "form_submissions_task_id_key"')
          const s = { ...row, id: id('sub') }
          db.submissions.push(s)
          return s.id
        },
        finishTask: async (tid) => {
          await tick()
          const t = db.tasks.find((x) => x.id === tid && x.status === 'open')
          if (!t) return false
          t.status = 'done'
          return true
        },
        insertTask: async (row) => {
          if (db.tasks.some((t) => t.record_id === row.record_id && t.status === 'open')) throw new Error('duplicate key value violates unique constraint "tasks_one_open_per_record"')
          const t = { ...row, id: id('task'), claimed_by: null, status: 'open' as const }
          db.tasks.push(t)
          return t.id
        },
        schedule: async (row) => { db.scheduled.push({ ...row, id: id('sched'), status: 'pending', error: null }) },
        event: async (row) => { db.events.push(row) },
        dueScheduled: async (now, limit) => db.scheduled.filter((s) => s.status === 'pending' && s.run_at <= now).slice(0, limit).map((s) => s.id),
        lockScheduled: async (sid) => {
          await lock(`s:${sid}`)
          const s = db.scheduled.find((x) => x.id === sid && x.status === 'pending')
          return s ? { id: s.id, org_id: s.org_id, record_id: s.record_id, resume_node_id: s.resume_node_id, state_at_schedule: s.state_at_schedule } : null
        },
        finishScheduled: async (sid, status, error) => {
          const s = db.scheduled.find((x) => x.id === sid)
          if (s) { s.status = status; s.error = error }
        },
      }
      try { return await fn(tx) } finally { for (const r of held) r() }
    },
  }
}

export const NOW = new Date('2026-10-11T12:00:00Z')
export const BETA_USER = '00000000-0000-0000-0000-0000000000b1'

/** The seeded Leave approval, one member who may start it, one admin holding the approval role. */
export function setup(graph: Graph = LEAVE) {
  const db: Db = {
    workflows: [{ id: WF, org_id: ORG, name: 'Leave approval', status: 'published', graph }],
    forms: [{ id: F_LEAVE, org_id: ORG, schema: FORM }, { id: F_APPROVAL, org_id: ORG, schema: [{ key: 'comment', type: 'long_text', label: 'Comment' }] }],
    members: [{ user_id: MEMBER, org_id: ORG }, { user_id: ADMIN, org_id: ORG }],
    roles: [{ id: ROLE_ADMIN, org_id: ORG }],
    starters: new Set([`${MEMBER}:${WF}`]),
    records: [], tasks: [], submissions: [], scheduled: [], events: [],
  }
  const store = fakeStore(db)
  const ctx = (actor: string): Ctx => ({ now: NOW, actor, fileExists: () => Promise.resolve(true) })
  const start = (answers: Record<string, unknown> = VALID, actor = MEMBER) =>
    store.tx((tx) => startRecord(tx, { workflowId: WF, answers }, ctx(actor)))
  const act = (taskId: string, outcome: string, actor = ADMIN, answers: Record<string, unknown> = { comment: 'Fine' }) =>
    store.tx((tx) => submitTask(tx, { taskId, outcome, answers }, ctx(actor)))
  /** Stands in for claim_task (Task 2), which is SQL. */
  const claim = (actor = ADMIN) => { const t = db.tasks.find((x) => x.status === 'open')!; t.claimed_by = actor; return t.id }
  const resume = async (now: Date) => {
    const ids = await store.tx((tx) => tx.dueScheduled(now, 50))
    return Promise.all(ids.map((sid) => store.tx((tx) => resumeOne(tx, sid, now))))
  }
  return { db, store, start, act, claim, resume }
}
```

- [ ] **Step 3: Write the failing tests** — `supabase/functions/advance/engine.test.ts`

```ts
import { assertEquals, assertMatch } from 'jsr:@std/assert@1'
import { BETA_USER, setup } from './testkit.ts'
import { VALID } from '../_shared/forms/fixture.ts'
import { F_APPROVAL, MEMBER, ROLE_ADMIN, leave } from '../_shared/workflow/fixture.ts'
import type { FormNode, TimeNode } from '../_shared/workflow/graph.ts'

const SHORT = { ...VALID, end: '2026-10-12' } // 1 day, so the condition takes "no"

Deno.test('start: stores the record, the start submission and a role task on the approval step', async () => {
  const { db, start } = setup()
  const res = await start()
  assertEquals(res.status, 200)
  const [rec] = db.records
  assertEquals(res.body, { recordId: rec.id, status: 'open' })
  assertEquals([rec.title, rec.current_node_id, rec.step, rec.status, rec.data.days], ['Leave approval: Ada', 'approve', 1, 'open', 3])
  assertEquals(db.submissions.map((s) => [s.node_id, s.outcome, s.task_id]), [['start', 'submitted', null]])
  assertEquals(db.tasks.map((t) => [t.node_id, t.assignee_role_id, t.due_at?.toISOString()]), [['approve', ROLE_ADMIN, '2026-10-13T12:00:00.000Z']])
  assertEquals(db.events.map((e) => e.kind), ['started', 'task'])
})

Deno.test('start is refused without access, on a draft, from another org, and with bad answers', async () => {
  const noAccess = setup(); noAccess.db.starters.clear()
  assertEquals((await noAccess.start()).status, 403)
  const draft = setup(); draft.db.workflows[0].status = 'draft'
  assertEquals((await draft.start()).status, 409)
  const stranger = setup()
  assertEquals((await stranger.start(VALID, BETA_USER)).status, 404)
  const bad = setup()
  const res = await bad.start({ ...VALID, name: '' })
  assertEquals([res.status, res.body.fieldErrors], [400, { name: 'This field is required.' }])
  for (const s of [noAccess, draft, stranger, bad]) assertEquals([s.db.records.length, s.db.submissions.length], [0, 0])
})

Deno.test('a role task must be claimed; approving runs the condition and schedules the Time step', async () => {
  const { db, start, act, claim } = setup()
  await start()
  const taskId = db.tasks[0].id
  const early = await act(taskId, 'approved')
  assertEquals([early.status, early.body.error], [409, 'Claim this task before you act on it.'])
  claim()
  const res = await act(taskId, 'approved')
  assertEquals([res.status, db.tasks[0].status], [200, 'done'])
  const rec = db.records[0]
  assertEquals([rec.current_node_id, rec.step, rec.status, rec.data.comment], ['wait', 3, 'open', 'Fine'])
  assertEquals(db.scheduled.map((s) => [s.resume_node_id, s.run_at.toISOString(), s.state_at_schedule]), [['wait', '2026-10-12T12:00:00.000Z', 3]])
  assertEquals(db.events.filter((e) => e.kind === 'action').map((e) => e.detail),
    [{ type: 'send_message', edge: 'e2', status: 'pending', config: { type: 'send_message' } }])
  assertEquals(db.events.find((e) => e.kind === 'condition')?.detail, { outcome: 'yes' })
})

Deno.test('reject runs the set_status action and closes the record as rejected', async () => {
  const { db, start, act, claim } = setup()
  await start()
  const res = await act(claim(), 'rejected')
  assertEquals(res.body.status, 'rejected')
  assertEquals([db.records[0].status, db.records[0].label, db.records[0].current_node_id], ['rejected', 'Rejected by manager', 'rejected'])
  assertEquals(db.events.at(-1)?.kind, 'closed')
})

Deno.test('a short leave takes the No path and closes as done', async () => {
  const { db, start, act, claim } = setup()
  await start(SHORT)
  await act(claim(), 'approved')
  assertEquals([db.records[0].status, db.records[0].current_node_id, db.scheduled.length], ['done', 'done', 0])
})

Deno.test('an outcome the step does not offer is refused', async () => {
  const { db, start, act, claim } = setup()
  await start()
  const res = await act(claim(), 'submitted')
  assertEquals([res.status, res.body.error, db.tasks[0].status], [400, 'Choose Approve or Reject.', 'open'])
})

Deno.test('only the assignee or the person who claimed the task may act', async () => {
  const { start, act, claim } = setup()
  await start()
  const res = await act(claim(), 'approved', MEMBER)
  assertEquals([res.status, res.body.error], [403, 'This task is assigned to someone else.'])
})

Deno.test('two simultaneous approvals advance the record once', async () => {
  const { db, start, act, claim } = setup()
  await start()
  const taskId = claim()
  const results = await Promise.all([act(taskId, 'approved'), act(taskId, 'approved')])
  assertEquals(results.map((r) => r.status).sort(), [200, 409])
  assertEquals(results.find((r) => r.status === 409)?.body.error, 'This task is already done.')
  assertEquals([db.submissions.filter((s) => s.task_id === taskId).length, db.records[0].step, db.scheduled.length], [1, 3, 1])
})

Deno.test('acting on a task whose record moved on is refused', async () => {
  const { db, start, act, claim } = setup()
  await start()
  db.records[0].current_node_id = 'long'
  const res = await act(claim(), 'approved')
  assertEquals(res.status, 409)
  assertMatch(String(res.body.error), /moved on/)
})

Deno.test('a failing action stops the record with the reason; nothing after it runs', async () => {
  const g = leave()
  g.edges[1].actions = [{ type: 'set_status', label: '' }]
  const { db, start, act, claim } = setup(g)
  await start()
  const res = await act(claim(), 'approved')
  assertEquals([res.status, res.body.status], [200, 'error'])
  const rec = db.records[0]
  assertEquals([rec.status, rec.current_node_id, db.scheduled.length, db.submissions.length], ['error', 'approve', 0, 2])
  assertMatch(rec.error ?? '', /Set status/)
  assertEquals(db.events.at(-1)?.kind, 'error')
})

Deno.test('a removed role stops the record with an error', async () => {
  const { db, start } = setup()
  db.roles = []
  await start()
  assertEquals([db.records[0].status, db.tasks.length], ['error', 0])
  assertMatch(db.records[0].error ?? '', /role .* no longer exists/)
})

Deno.test('a step assigned from a step nobody submitted stops with an error', async () => {
  const g = leave()
  ;(g.nodes[1] as FormNode).assignee = { step: 'approve' }
  const { db, start } = setup(g)
  await start()
  assertEquals(db.records[0].status, 'error')
  assertMatch(db.records[0].error ?? '', /Nobody has submitted/)
})

Deno.test('a Time step relative to an unreadable date stops with an error', async () => {
  const g = leave()
  const wait = g.nodes[3] as TimeNode
  delete wait.after
  wait.relative = { field: 'reason', amount: 1, unit: 'days', direction: 'before' }
  const { db, start, act, claim } = setup(g)
  await start()
  await act(claim(), 'approved')
  assertEquals([db.records[0].status, db.records[0].current_node_id, db.scheduled.length], ['error', 'wait', 0])
  assertMatch(db.records[0].error ?? '', /date/)
})

Deno.test('a loop of Condition steps stops with an error instead of spinning', async () => {
  const g = leave()
  g.edges = g.edges.map((e) => (e.id === 'e4' ? { ...e, to: 'long' } : e)) // long --yes--> long; the publish check refuses this
  const { db, start, act, claim } = setup(g)
  await start()
  await act(claim(), 'approved')
  assertEquals(db.records[0].status, 'error')
  assertMatch(db.records[0].error ?? '', /loops without stopping/)
})

Deno.test('a loop back through a Form step creates a fresh task each visit', async () => {
  const g = leave()
  g.nodes.push({ id: 'fix', type: 'form', label: 'Fix request', formId: F_APPROVAL, assignee: { step: 'start' }, mode: 'fill', position: { x: 0, y: 200 } })
  g.edges = g.edges.map((e) => (e.id === 'e3' ? { ...e, to: 'fix', actions: [] } : e))
  g.edges.push({ id: 'e7', from: 'fix', outcome: 'submitted', to: 'approve', actions: [] })
  const { db, start, act, claim } = setup(g)
  await start()
  await act(claim(), 'rejected')
  assertEquals([db.tasks[1].node_id, db.tasks[1].assignee_user_id], ['fix', MEMBER])
  assertEquals((await act(db.tasks[1].id, 'submitted', MEMBER, { comment: 'Dates fixed' })).status, 200)
  assertEquals([db.tasks.length, db.tasks[2].node_id, db.tasks[2].status, db.records[0].data.comment], [3, 'approve', 'open', 'Dates fixed'])
})

Deno.test('resume continues a due Time step and runs its edge actions', async () => {
  const { db, start, act, claim, resume } = setup()
  await start()
  await act(claim(), 'approved')
  assertEquals(await resume(new Date('2026-10-12T11:59:00Z')), []) // not due yet
  assertEquals(await resume(new Date('2026-10-12T12:00:00Z')), ['done'])
  assertEquals([db.records[0].status, db.records[0].current_node_id, db.scheduled[0].status], ['done', 'done', 'done'])
  assertEquals(db.events.filter((e) => e.kind === 'action').at(-1)?.detail.type, 'generate_pdf')
})

Deno.test('resume skips a row whose record moved on, or closed, since it was scheduled', async () => {
  const moved = setup()
  await moved.start()
  await moved.act(moved.claim(), 'approved')
  moved.db.records[0].step = 7
  assertEquals(await moved.resume(new Date('2026-10-13T00:00:00Z')), ['skipped'])
  assertEquals([moved.db.records[0].status, moved.db.records[0].current_node_id, moved.db.scheduled[0].status], ['open', 'wait', 'skipped'])
  assertEquals(moved.db.events.at(-1)?.kind, 'skipped')

  const closed = setup()
  await closed.start()
  await closed.act(closed.claim(), 'approved')
  closed.db.records[0].status = 'done'
  assertEquals(await closed.resume(new Date('2026-10-13T00:00:00Z')), ['skipped'])
})
```

- [ ] **Step 4: Run — expect FAIL**

Run: `DENO_NO_PACKAGE_JSON=1 deno test supabase/functions/advance`
Expected: `Module not found "…/advance/engine.ts"`.

- [ ] **Step 5: Implement** — `supabase/functions/advance/engine.ts`

```ts
import { evaluate, missingUploads, validateAnswers, validateSchema, type Answers, type Field } from '../_shared/forms/index.ts'
import {
  durationMs, nextEdge, nodeById, nodeName, outcomesOf, readGraph, timeRunAt,
  type Edge, type FormNode, type Graph, type Outcome, type StartNode,
} from '../_shared/workflow/graph.ts'

export type RecordStatus = 'open' | 'done' | 'rejected' | 'error'
export type RecordRow = {
  id: string; org_id: string; workflow_id: string; title: string; current_node_id: string | null
  status: RecordStatus; label: string | null; error: string | null; data: Answers; step: number; started_by: string
}
export type WorkflowRow = { id: string; org_id: string; name: string; status: 'draft' | 'published'; graph: unknown }
export type TaskRow = {
  id: string; org_id: string; record_id: string; node_id: string
  assignee_role_id: string | null; assignee_user_id: string | null; claimed_by: string | null; status: 'open' | 'done' | 'cancelled'
}
export type ScheduledRow = { id: string; org_id: string; record_id: string; resume_node_id: string; state_at_schedule: number }
export type EventKind = 'started' | 'submitted' | 'task' | 'condition' | 'waiting' | 'resumed' | 'skipped' | 'action' | 'error' | 'closed'
export type NewRecord = Pick<RecordRow, 'org_id' | 'workflow_id' | 'title' | 'data' | 'started_by'>
export type NewSubmission = {
  org_id: string; record_id: string; node_id: string; form_id: string; task_id: string | null
  answers: Answers; submitted_by: string; outcome: 'submitted' | 'approved' | 'rejected'
}
export type NewTask = { org_id: string; record_id: string; node_id: string; assignee_role_id: string | null; assignee_user_id: string | null; due_at: Date | null }
export type NewEvent = { org_id: string; record_id: string; kind: EventKind; node_id: string | null; actor_id: string | null; detail: Record<string, unknown> }

/** One database transaction. The pg adapter (Task 4) and the test fake both implement it. */
export interface Tx {
  /** FOR SHARE: a concurrent save-workflow waits until this transaction ends. */
  workflow(id: string): Promise<WorkflowRow | null>
  /** FOR UPDATE: one advance per record at a time; a second one waits, then sees the first one's result. */
  lockRecord(id: string): Promise<RecordRow | null>
  task(id: string): Promise<TaskRow | null>
  form(id: string, orgId: string): Promise<{ id: string; schema: unknown } | null>
  /** has_permission(org, perm, workflow) evaluated as `userId`. */
  can(userId: string, orgId: string, perm: string, workflowId: string): Promise<boolean>
  isActiveMember(userId: string, orgId: string): Promise<boolean>
  roleExists(roleId: string, orgId: string): Promise<boolean>
  lastSubmitter(recordId: string, nodeId: string): Promise<string | null>
  insertRecord(row: NewRecord): Promise<RecordRow>
  saveRecord(rec: RecordRow): Promise<void>
  insertSubmission(row: NewSubmission): Promise<string>
  /** open → done; false when it was no longer open. */
  finishTask(id: string): Promise<boolean>
  insertTask(row: NewTask): Promise<string>
  schedule(row: { org_id: string; record_id: string; resume_node_id: string; run_at: Date; state_at_schedule: number }): Promise<void>
  event(row: NewEvent): Promise<void>
  dueScheduled(now: Date, limit: number): Promise<string[]>
  /** FOR UPDATE SKIP LOCKED, pending rows only. */
  lockScheduled(id: string): Promise<ScheduledRow | null>
  finishScheduled(id: string, status: 'done' | 'skipped' | 'failed', error: string | null): Promise<void>
}
export interface Store { tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> }
export type Ctx = { now: Date; actor: string; fileExists(path: string): Promise<boolean> }
export type Result = { status: number; body: Record<string, unknown> }

/** A step that cannot run: the record stops in `error` with this message, which is shown to people as is. */
export class StepError extends Error {}

const MAX_HOPS = 100
const SETUP = 'This workflow has a setup problem. Ask a workflow manager to fix it.'
const NO_WORKFLOW = 'This workflow does not exist or you do not have access to it.'
const NO_TASK = 'This task does not exist or you do not have access to it.'
const SOME_ANSWERS = 'Some answers need fixing.'
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Result => ({ status, body: { error, ...extra } })
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** "Workflow name: first short-text answer", else the workflow name. */
export function recordTitle(fields: Field[], answers: Answers, fallback: string): string {
  const f = fields.find((x) => x.type === 'short_text' && typeof answers[x.key] === 'string' && (answers[x.key] as string).trim())
  return (f ? `${fallback}: ${(answers[f.key] as string).trim()}` : fallback).slice(0, 200)
}

type Checked = { ok: true; fields: Field[]; answers: Answers } | { ok: false; res: Result }

/** Same authority as submit-form: hidden answers stripped, calculated values recomputed, uploads proven. */
async function checkAnswers(tx: Tx, orgId: string, formId: string, raw: Answers, ctx: Ctx): Promise<Checked> {
  const form = await tx.form(formId, orgId)
  if (!form || validateSchema(form.schema).length) return { ok: false, res: fail(409, SETUP) }
  const fields = form.schema as Field[]
  const checked = validateAnswers(fields, raw, { now: ctx.now, filePrefix: `${orgId}/${ctx.actor}/` })
  if (!checked.ok) return { ok: false, res: fail(400, SOME_ANSWERS, { fieldErrors: checked.errors }) }
  const missing = await missingUploads(fields, checked.answers, ctx.fileExists)
  if (Object.keys(missing).length) return { ok: false, res: fail(400, SOME_ANSWERS, { fieldErrors: missing }) }
  return { ok: true, fields, answers: checked.answers }
}

export async function startRecord(tx: Tx, input: { workflowId: string; answers: Answers }, ctx: Ctx): Promise<Result> {
  const wf = await tx.workflow(input.workflowId)
  if (!wf || !(await tx.isActiveMember(ctx.actor, wf.org_id))) return fail(404, NO_WORKFLOW)
  if (wf.status !== 'published') return fail(409, 'This workflow is not published yet.')
  if (!(await tx.can(ctx.actor, wf.org_id, 'records.start', wf.id))) return fail(403, 'You cannot start this workflow. Ask an admin for access.')
  const graph = readGraph(wf.graph)
  const start = graph?.nodes.find((n): n is StartNode => n.type === 'start')
  if (!graph || !start) return fail(409, SETUP)
  const checked = await checkAnswers(tx, wf.org_id, start.formId, input.answers, ctx)
  if (!checked.ok) return checked.res

  const rec = await tx.insertRecord({
    org_id: wf.org_id, workflow_id: wf.id, title: recordTitle(checked.fields, checked.answers, wf.name), data: checked.answers, started_by: ctx.actor,
  })
  rec.current_node_id = start.id
  const submissionId = await tx.insertSubmission({
    org_id: wf.org_id, record_id: rec.id, node_id: start.id, form_id: start.formId, task_id: null,
    answers: checked.answers, submitted_by: ctx.actor, outcome: 'submitted',
  })
  await tx.event({ org_id: wf.org_id, record_id: rec.id, kind: 'started', node_id: start.id, actor_id: ctx.actor, detail: { submissionId } })
  const after = await walk(tx, rec, graph, start.id, 'submitted', ctx)
  return { status: 200, body: { recordId: rec.id, status: after.status } }
}

export async function submitTask(tx: Tx, input: { taskId: string; outcome: string; answers: Answers }, ctx: Ctx): Promise<Result> {
  const peek = await tx.task(input.taskId) // a task never changes record, so reading it before the lock is safe
  if (!peek) return fail(404, NO_TASK)
  const rec = await tx.lockRecord(peek.record_id)
  const task = await tx.task(input.taskId) // re-read under the lock: a concurrent submit has committed by now
  if (!rec || !task || !(await tx.isActiveMember(ctx.actor, task.org_id))) return fail(404, NO_TASK)
  if (task.status !== 'open') return fail(409, 'This task is already done.')
  if (task.assignee_user_id !== ctx.actor && task.claimed_by !== ctx.actor) {
    return task.assignee_role_id && !task.claimed_by
      ? fail(409, 'Claim this task before you act on it.')
      : fail(403, 'This task is assigned to someone else.')
  }
  if (rec.status !== 'open' || rec.current_node_id !== task.node_id) return fail(409, 'This record has moved on. Reload to see where it is now.')

  const graph = readGraph((await tx.workflow(rec.workflow_id))?.graph)
  const node = graph ? nodeById(graph, task.node_id) : undefined
  if (!graph || !node || node.type !== 'form') return fail(409, SETUP)
  const outcome = outcomesOf(node).find((o) => o === input.outcome)
  if (!outcome) return fail(400, node.mode === 'approve' ? 'Choose Approve or Reject.' : 'Send the outcome "submitted".')
  const checked = await checkAnswers(tx, rec.org_id, node.formId, input.answers, ctx)
  if (!checked.ok) return checked.res
  if (!(await tx.finishTask(task.id))) return fail(409, 'This task is already done.')

  const submissionId = await tx.insertSubmission({
    org_id: rec.org_id, record_id: rec.id, node_id: node.id, form_id: node.formId, task_id: task.id,
    answers: checked.answers, submitted_by: ctx.actor, outcome: outcome as NewSubmission['outcome'],
  })
  rec.data = { ...rec.data, ...checked.answers }
  await tx.event({ org_id: rec.org_id, record_id: rec.id, kind: 'submitted', node_id: node.id, actor_id: ctx.actor, detail: { submissionId, outcome, taskId: task.id } })
  const after = await walk(tx, rec, graph, node.id, outcome, ctx)
  return { status: 200, body: { recordId: rec.id, status: after.status } }
}

/**
 * Follows `outcome` out of `from` until the record waits (Form, Time) or closes (End). Saves the record.
 * A StepError stops the walk where it is and puts the record in `error`; it is never skipped (spec §5.4, §10).
 */
export async function walk(tx: Tx, rec: RecordRow, graph: Graph, from: string, outcome: Outcome, ctx: { now: Date; actor: string | null }): Promise<RecordRow> {
  const ev = (kind: EventKind, nodeId: string | null, detail: Record<string, unknown> = {}) =>
    tx.event({ org_id: rec.org_id, record_id: rec.id, kind, node_id: nodeId, actor_id: ctx.actor, detail })
  let at = from
  let out = outcome
  try {
    for (let hop = 0; ; hop++) {
      if (hop >= MAX_HOPS) throw new StepError('This workflow loops without stopping. Ask a workflow manager to add a Form or Time step to the loop.')
      const edge = nextEdge(graph, at, out)
      if (!edge) throw new StepError(`"${nodeName(nodeById(graph, at))}" has no path for "${out}". Ask a workflow manager to connect it.`)
      for (const a of edge.actions) await runAction(rec, edge, a, ev)
      const node = nodeById(graph, edge.to)
      if (!node) throw new StepError('The next step was deleted. Ask a workflow manager to reconnect this path.')
      rec.current_node_id = node.id
      rec.step += 1
      if (node.type === 'condition') {
        out = evaluate(node.rule, rec.data, ctx.now) ? 'yes' : 'no'
        at = node.id
        await ev('condition', node.id, { outcome: out })
        continue
      }
      if (node.type === 'form') { await createTask(tx, rec, node, ctx.now, ev); break }
      if (node.type === 'time') {
        const runAt = timeRunAt(node, rec.data, ctx.now)
        if (!runAt) throw new StepError(`"${nodeName(node)}" needs a valid date in its date field.`)
        await tx.schedule({ org_id: rec.org_id, record_id: rec.id, resume_node_id: node.id, run_at: runAt, state_at_schedule: rec.step })
        await ev('waiting', node.id, { runAt: runAt.toISOString() })
        break
      }
      if (node.type === 'end') { rec.status = node.status; await ev('closed', node.id, { status: node.status }); break }
      throw new StepError('A workflow cannot return to its Start step.')
    }
  } catch (e) {
    if (!(e instanceof StepError)) throw e
    rec.status = 'error'
    rec.error = e.message
    await ev('error', rec.current_node_id, { message: e.message })
  }
  await tx.saveRecord(rec)
  return rec
}

async function runAction(rec: RecordRow, edge: Edge, a: unknown, ev: (k: EventKind, n: string | null, d?: Record<string, unknown>) => Promise<void>) {
  if (isObj(a) && a.type === 'set_status') {
    const label = typeof a.label === 'string' ? a.label.trim() : ''
    if (!label || label.length > 60) throw new StepError('A "Set status" action on this path has no status text. Ask a workflow manager to fix it.')
    rec.label = label
    return ev('action', edge.from, { type: 'set_status', edge: edge.id, label })
  }
  if (isObj(a) && (a.type === 'send_message' || a.type === 'generate_pdf')) {
    // shortcut: recorded as pending only; Phase 4 (messages) and Phase 5 (PDF) process pending action events.
    return ev('action', edge.from, { type: a.type, edge: edge.id, status: 'pending', config: a })
  }
  throw new StepError('This path has an action the workflow cannot run. Ask a workflow manager to remove it.')
}

async function createTask(tx: Tx, rec: RecordRow, node: FormNode, now: Date, ev: (k: EventKind, n: string | null, d?: Record<string, unknown>) => Promise<void>) {
  const a: unknown = node.assignee
  const name = nodeName(node)
  let role: string | null = null
  let user: string | null = null
  if (isObj(a) && typeof a.role === 'string' && a.role) {
    if (!(await tx.roleExists(a.role, rec.org_id))) throw new StepError(`The role for "${name}" no longer exists. Ask a workflow manager to choose another.`)
    role = a.role
  } else if (isObj(a) && typeof a.user === 'string' && a.user) {
    if (!(await tx.isActiveMember(a.user, rec.org_id))) throw new StepError(`The person assigned to "${name}" is no longer a member.`)
    user = a.user
  } else if (isObj(a) && typeof a.step === 'string' && a.step) {
    user = await tx.lastSubmitter(rec.id, a.step)
    if (!user) throw new StepError(`Nobody has submitted the step that "${name}" is assigned from.`)
  } else {
    throw new StepError(`"${name}" has nobody assigned. Ask a workflow manager to choose someone.`)
  }
  const due = node.due ? durationMs(node.due) : null
  const dueAt = due === null ? null : new Date(now.getTime() + due)
  const taskId = await tx.insertTask({ org_id: rec.org_id, record_id: rec.id, node_id: node.id, assignee_role_id: role, assignee_user_id: user, due_at: dueAt })
  await ev('task', node.id, { taskId, role, user, dueAt: dueAt?.toISOString() ?? null })
}

/** Continues one due Time step, or skips it when the record left that step (or closed) since it was scheduled. */
export async function resumeOne(tx: Tx, id: string, now: Date): Promise<'done' | 'skipped' | 'failed' | 'gone'> {
  const row = await tx.lockScheduled(id)
  if (!row) return 'gone' // another resume took it, or it is no longer pending
  const rec = await tx.lockRecord(row.record_id)
  if (!rec || rec.status !== 'open' || rec.step !== row.state_at_schedule) {
    await tx.finishScheduled(id, 'skipped', null)
    if (rec) await tx.event({ org_id: rec.org_id, record_id: rec.id, kind: 'skipped', node_id: row.resume_node_id, actor_id: null, detail: {} })
    return 'skipped'
  }
  const graph = readGraph((await tx.workflow(rec.workflow_id))?.graph) ?? { nodes: [], edges: [] }
  await tx.event({ org_id: rec.org_id, record_id: rec.id, kind: 'resumed', node_id: row.resume_node_id, actor_id: null, detail: {} })
  const after = await walk(tx, rec, graph, row.resume_node_id, 'next', { now, actor: null })
  const failed = after.status === 'error'
  await tx.finishScheduled(id, failed ? 'failed' : 'done', failed ? after.error : null)
  return failed ? 'failed' : 'done'
}

/** An unexpected error rolled a resume back: record it on the row and the record, so it is never retried silently. */
export async function failScheduled(tx: Tx, id: string, message: string): Promise<void> {
  const row = await tx.lockScheduled(id)
  if (!row) return
  await tx.finishScheduled(id, 'failed', message)
  const rec = await tx.lockRecord(row.record_id)
  if (!rec || rec.status !== 'open') return
  rec.status = 'error'
  rec.error = message
  await tx.saveRecord(rec)
  await tx.event({ org_id: rec.org_id, record_id: rec.id, kind: 'error', node_id: rec.current_node_id, actor_id: null, detail: { message } })
}
```

- [ ] **Step 6: Run — expect PASS**

Run: `DENO_NO_PACKAGE_JSON=1 deno test supabase/functions`
Expected: `ok | 83 passed | 0 failed` (54 from Phase 2 + 12 graph + 17 engine; the 7 submit-form tests still pass with `missingUploads` moved).

Run: `pnpm test`
Expected: `# pass 75` (unchanged; nothing under `advance/` is picked up by the node glob).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/forms/uploads.ts supabase/functions/_shared/forms/index.ts supabase/functions/submit-form/handler.ts \
  supabase/functions/advance/engine.ts supabase/functions/advance/testkit.ts supabase/functions/advance/engine.test.ts
git commit -m "feat: add workflow runtime engine with record locking"
```

---

### Task 4: Edge Functions `advance` and `resume`

**Owner:** Backend engineer · **Depends on:** Tasks 2, 3

**Files:**
- Create: `supabase/functions/_shared/storage.ts`, `supabase/functions/advance/pgStore.ts`, `supabase/functions/advance/handler.ts`, `supabase/functions/advance/index.ts`, `supabase/functions/resume/handler.ts`, `supabase/functions/resume/index.ts`
- Test: `supabase/functions/advance/handler.test.ts`, `supabase/functions/advance/race.test.ts`, `supabase/functions/resume/handler.test.ts`
- Modify: `supabase/functions/submit-form/index.ts`, `supabase/config.toml`, `README.md`, `deno.lock`

**Interfaces:**
- Consumes: `Store`, `Tx`, `startRecord`, `submitTask`, `resumeOne`, `failScheduled`, `Result` (Task 3); tables and `has_permission(uuid, text, uuid)` (Task 2); `OUTCOMES` (Task 1).
- Produces:
  - `fileExists(client: SupabaseClient, path: string): Promise<boolean>` (`_shared/storage.ts`, used by `submit-form` and `advance`)
  - `pgStore(url: string): Store & { end(): Promise<void> }`
  - `POST /functions/v1/advance` (user JWT) body `{ action: 'start', workflowId, answers }` or `{ action: 'submit', taskId, outcome: 'submitted' | 'approved' | 'rejected', answers }` →
    - `200 { recordId, status: 'open' | 'done' | 'rejected' | 'error' }` (a step failure is a 200 with `status: 'error'`: the submission was stored, the record stopped)
    - `400 { error }` bad body · `400 { error: 'Some answers need fixing.', fieldErrors }` · `401 { error }` · `403 { error }` · `404 { error }` · `409 { error }` (already done, claim first, moved on, not published, setup problem) · `413` · `500 { error: 'We could not save this step. Try again.' }`
  - `advance(body: unknown, deps: { userId(): Promise<string | null>; store: Store; fileExists(path: string): Promise<boolean>; now(): Date }): Promise<Result>`
  - `POST /functions/v1/resume` (no JWT; `Authorization: Bearer <CRON_SECRET>`) → `200 { done, skipped, failed }` · `401`
  - `resume(deps: { authorised: boolean; store: Store; now(): Date }): Promise<Result>`

- [ ] **Step 1: Write the failing handler tests**

`supabase/functions/advance/handler.test.ts`
```ts
import { assertEquals } from 'jsr:@std/assert@1'
import { advance, type Deps } from './handler.ts'
import { setup } from './testkit.ts'
import { VALID } from '../_shared/forms/fixture.ts'
import { MEMBER, WF } from '../_shared/workflow/fixture.ts'

const deps = (store: Deps['store'], user: string | null = MEMBER): Deps =>
  ({ userId: () => Promise.resolve(user), store, fileExists: () => Promise.resolve(true), now: () => new Date('2026-10-11T12:00:00Z') })

Deno.test('rejects a malformed body before touching the database', async () => {
  const { store, db } = setup()
  for (const body of [null, [], { action: 'start', workflowId: 'x', answers: {} }, { action: 'start', workflowId: WF }, { action: 'submit', taskId: WF, outcome: 'maybe', answers: {} }, { action: 'delete', workflowId: WF, answers: {} }]) {
    assertEquals((await advance(body, deps(store))).status, 400)
  }
  assertEquals(db.records.length, 0)
})
Deno.test('401 without a session', async () => {
  const { store } = setup()
  assertEquals((await advance({ action: 'start', workflowId: WF, answers: VALID }, deps(store, null))).status, 401)
})
Deno.test('start and submit reach the engine', async () => {
  const { store, db } = setup()
  const started = await advance({ action: 'start', workflowId: WF, answers: VALID }, deps(store))
  assertEquals([started.status, started.body.recordId], [200, db.records[0].id])
  const early = await advance({ action: 'submit', taskId: db.tasks[0].id, outcome: 'approved', answers: {} }, deps(store))
  assertEquals([early.status, early.body.error], [409, 'Claim this task before you act on it.']) // a role task, unclaimed
})
```

`supabase/functions/resume/handler.test.ts`
```ts
import { assertEquals } from 'jsr:@std/assert@1'
import { resume } from './handler.ts'
import { setup } from '../advance/testkit.ts'
import type { Store } from '../advance/engine.ts'

const LATER = () => new Date('2026-10-13T00:00:00Z')

async function waiting() {
  const s = setup()
  await s.start()
  await s.act(s.claim(), 'approved') // now waiting on the Time step
  return s
}

Deno.test('401 without the cron secret, and nothing runs', async () => {
  const { store, db } = await waiting()
  assertEquals((await resume({ authorised: false, store, now: LATER })).status, 401)
  assertEquals(db.scheduled[0].status, 'pending')
})
Deno.test('runs every due timer and reports the counts', async () => {
  const { store, db } = await waiting()
  const res = await resume({ authorised: true, store, now: LATER })
  assertEquals([res.status, res.body], [200, { done: 1, skipped: 0, failed: 0 }])
  assertEquals(db.records[0].status, 'done')
})
Deno.test('an unexpected error marks the row failed and the record error', async () => {
  const { store, db } = await waiting()
  const flaky: Store = { tx: (fn) => store.tx((tx) => fn({ ...tx, workflow: () => Promise.reject(new Error('connection lost')) })) }
  const res = await resume({ authorised: true, store: flaky, now: LATER })
  assertEquals(res.body, { done: 0, skipped: 0, failed: 1 })
  assertEquals([db.scheduled[0].status, db.scheduled[0].error], ['failed', 'This step could not run: connection lost'])
  assertEquals([db.records[0].status, db.records[0].error], ['error', 'This step could not run: connection lost'])
})
```

- [ ] **Step 2: Write the real-Postgres race test** — `supabase/functions/advance/race.test.ts` (skipped unless `RNR_TEST_DB_URL` is set and readable, so CI's edge job, which has no database, ignores it)

```ts
import { assertEquals } from 'jsr:@std/assert@1'
import postgres from 'npm:postgres@3.4.5'
import { startRecord, submitTask } from './engine.ts'
import { pgStore } from './pgStore.ts'
import { VALID } from '../_shared/forms/fixture.ts'
import { ADMIN, MEMBER, WF } from '../_shared/workflow/fixture.ts'

const url = Deno.permissions.querySync({ name: 'env', variable: 'RNR_TEST_DB_URL' }).state === 'granted'
  ? Deno.env.get('RNR_TEST_DB_URL')
  : undefined

Deno.test({
  name: 'real Postgres: two simultaneous approvals advance the record once',
  ignore: !url,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const store = pgStore(url!)
    const sql = postgres(url!, { max: 1 })
    const ctx = (actor: string) => ({ now: new Date(), actor, fileExists: () => Promise.resolve(true) })
    try {
      const started = await store.tx((tx) => startRecord(tx, { workflowId: WF, answers: VALID }, ctx(MEMBER)))
      assertEquals(started.status, 200)
      const recordId = started.body.recordId as string
      const [task] = await sql`update tasks set claimed_by = ${ADMIN} where record_id = ${recordId} and status = 'open' returning id`
      const both = await Promise.all([1, 2].map(() =>
        store.tx((tx) => submitTask(tx, { taskId: task.id, outcome: 'approved', answers: { comment: 'ok' } }, ctx(ADMIN)))))
      assertEquals(both.map((r) => r.status).sort(), [200, 409])
      const [row] = await sql`select
        (select count(*)::int from form_submissions where task_id = ${task.id}) as subs,
        (select count(*)::int from scheduled_actions where record_id = ${recordId}) as waits,
        (select step from records where id = ${recordId}) as step`
      assertEquals([row.subs, row.waits, row.step], [1, 1, 3])
      await sql`delete from records where id = ${recordId}`
    } finally {
      await store.end()
      await sql.end()
    }
  },
})
```

- [ ] **Step 3: Run — expect FAIL**

Run: `DENO_NO_PACKAGE_JSON=1 deno test supabase/functions/advance supabase/functions/resume`
Expected: `Module not found "…/advance/handler.ts"` and `"…/resume/handler.ts"`.

- [ ] **Step 4: Implement the shared storage probe** — `supabase/functions/_shared/storage.ts`

```ts
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

/** Service-level lookup: does this object exist in the form-files bucket? */
export async function fileExists(client: SupabaseClient, path: string): Promise<boolean> {
  const i = path.lastIndexOf('/')
  const { data, error } = await client.storage.from('form-files').list(path.slice(0, i), { search: path.slice(i + 1), limit: 10 })
  if (error) throw error
  return data.some((o) => o.name === path.slice(i + 1))
}
```

`supabase/functions/submit-form/index.ts` — add `import { fileExists } from '../_shared/storage.ts'` and replace the inline `fileExists: async (path) => { … }` dependency with:
```ts
      fileExists: (path) => fileExists(admin, path),
```

- [ ] **Step 5: Implement the Postgres adapter** — `supabase/functions/advance/pgStore.ts`

```ts
import postgres from 'npm:postgres@3.4.5'
import type { RecordRow, ScheduledRow, Store, TaskRow, Tx, WorkflowRow } from './engine.ts'

const RECORD = ['id', 'org_id', 'workflow_id', 'title', 'current_node_id', 'status', 'label', 'error', 'data', 'step', 'started_by']

/** Connects as `postgres` (RLS bypassed): the engine checks membership, permission and assignment itself. */
export function pgStore(url: string): Store & { end(): Promise<void> } {
  const sql = postgres(url, { max: 3, prepare: false, onnotice: () => {} })
  return {
    tx: <T>(fn: (tx: Tx) => Promise<T>) => sql.begin((t) => fn(pgTx(t))) as Promise<T>,
    end: () => sql.end(),
  }
}

function pgTx(t: postgres.TransactionSql): Tx {
  const one = async <R>(q: Promise<readonly unknown[]>) => ((await q)[0] as R | undefined) ?? null
  const json = (v: unknown) => t.json(v as postgres.JSONValue)
  return {
    workflow: (id) => one<WorkflowRow>(t`select id, org_id, name, status, graph from workflows where id = ${id} for share`),
    lockRecord: (id) => one<RecordRow>(t`select ${t(RECORD)} from records where id = ${id} for update`),
    task: (id) => one<TaskRow>(t`select id, org_id, record_id, node_id, assignee_role_id, assignee_user_id, claimed_by, status from tasks where id = ${id}`),
    form: (id, org) => one<{ id: string; schema: unknown }>(t`select id, schema from forms where id = ${id} and org_id = ${org}`),
    can: async (user, org, perm, wf) => {
      // has_permission reads auth.uid() from the claims: set them for this transaction only. No trigger on the
      // runtime tables reads auth.uid(), so later writes in this transaction are unaffected.
      await t`select set_config('request.jwt.claims', ${JSON.stringify({ sub: user, role: 'authenticated' })}, true)`
      const [row] = await t`select has_permission(${org}::uuid, ${perm}, ${wf}::uuid) as ok`
      return row.ok === true
    },
    isActiveMember: async (user, org) => (await t`select 1 from members where user_id = ${user} and org_id = ${org} and status = 'active'`).length > 0,
    roleExists: async (role, org) => (await t`select 1 from roles where id = ${role} and org_id = ${org}`).length > 0,
    lastSubmitter: async (rec, node) =>
      (await one<{ submitted_by: string }>(t`select submitted_by from form_submissions where record_id = ${rec} and node_id = ${node} order by created_at desc limit 1`))?.submitted_by ?? null,
    insertRecord: async (r) => (await one<RecordRow>(t`
      insert into records (org_id, workflow_id, title, data, started_by)
      values (${r.org_id}, ${r.workflow_id}, ${r.title}, ${json(r.data)}, ${r.started_by}) returning ${t(RECORD)}`))!,
    saveRecord: async (r) => {
      await t`update records set current_node_id = ${r.current_node_id}, status = ${r.status}, label = ${r.label}, error = ${r.error},
        data = ${json(r.data)}, step = ${r.step}, updated_at = now() where id = ${r.id}`
    },
    insertSubmission: async (s) => (await one<{ id: string }>(t`
      insert into form_submissions (org_id, record_id, node_id, form_id, task_id, answers, submitted_by, outcome)
      values (${s.org_id}, ${s.record_id}, ${s.node_id}, ${s.form_id}, ${s.task_id}, ${json(s.answers)}, ${s.submitted_by}, ${s.outcome}) returning id`))!.id,
    finishTask: async (id) => (await t`update tasks set status = 'done', done_at = now() where id = ${id} and status = 'open' returning id`).length === 1,
    insertTask: async (x) => (await one<{ id: string }>(t`
      insert into tasks (org_id, record_id, node_id, assignee_role_id, assignee_user_id, due_at)
      values (${x.org_id}, ${x.record_id}, ${x.node_id}, ${x.assignee_role_id}, ${x.assignee_user_id}, ${x.due_at}) returning id`))!.id,
    schedule: async (x) => {
      await t`insert into scheduled_actions (org_id, record_id, resume_node_id, run_at, state_at_schedule)
        values (${x.org_id}, ${x.record_id}, ${x.resume_node_id}, ${x.run_at}, ${x.state_at_schedule})`
    },
    event: async (e) => {
      await t`insert into record_events (org_id, record_id, kind, node_id, actor_id, detail)
        values (${e.org_id}, ${e.record_id}, ${e.kind}, ${e.node_id}, ${e.actor_id}, ${json(e.detail)})`
    },
    dueScheduled: async (now, limit) =>
      (await t`select id from scheduled_actions where status = 'pending' and run_at <= ${now} order by run_at limit ${limit}`).map((r) => r.id as string),
    lockScheduled: (id) => one<ScheduledRow>(t`
      select id, org_id, record_id, resume_node_id, state_at_schedule from scheduled_actions
      where id = ${id} and status = 'pending' for update skip locked`),
    finishScheduled: async (id, status, error) => {
      await t`update scheduled_actions set status = ${status}, error = ${error}, finished_at = now() where id = ${id}`
    },
  }
}
```

- [ ] **Step 6: Implement the handlers**

`supabase/functions/advance/handler.ts`
```ts
import type { Answers } from '../_shared/forms/index.ts'
import { OUTCOMES, type Outcome } from '../_shared/workflow/graph.ts'
import { startRecord, submitTask, type Result, type Store } from './engine.ts'

export type Deps = { userId(): Promise<string | null>; store: Store; fileExists(path: string): Promise<boolean>; now(): Date }
type Req = { action: 'start'; workflowId: string; answers: Answers } | { action: 'submit'; taskId: string; outcome: Outcome; answers: Answers }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

function parse(b: unknown): Req | null {
  if (!isObj(b) || !isObj(b.answers)) return null
  if (b.action === 'start' && isUuid(b.workflowId)) return { action: 'start', workflowId: b.workflowId, answers: b.answers }
  if (b.action === 'submit' && isUuid(b.taskId) && (OUTCOMES as readonly unknown[]).includes(b.outcome)) {
    return { action: 'submit', taskId: b.taskId, outcome: b.outcome as Outcome, answers: b.answers }
  }
  return null
}

/** The authority for every workflow move a person makes; the browser only sends answers and an outcome. */
export async function advance(body: unknown, deps: Deps): Promise<Result> {
  const req = parse(body)
  if (!req) return { status: 400, body: { error: 'Send a start or submit request.' } }
  const actor = await deps.userId()
  if (!actor) return { status: 401, body: { error: 'Sign in again to continue.' } }
  const ctx = { now: deps.now(), actor, fileExists: deps.fileExists }
  return deps.store.tx((tx) => (req.action === 'start' ? startRecord(tx, req, ctx) : submitTask(tx, req, ctx)))
}
```

`supabase/functions/resume/handler.ts`
```ts
import { failScheduled, resumeOne, type Result, type Store } from '../advance/engine.ts'

export type Deps = { authorised: boolean; store: Store; now(): Date }
const BATCH = 50 // shortcut: 50 timers a minute; raise or loop when an org schedules more

/** Called by pg_cron every minute. Each timer runs in its own transaction so one failure cannot block the rest. */
export async function resume(deps: Deps): Promise<Result> {
  if (!deps.authorised) return { status: 401, body: { error: 'Not allowed.' } }
  const now = deps.now()
  const ids = await deps.store.tx((tx) => tx.dueScheduled(now, BATCH))
  const counts = { done: 0, skipped: 0, failed: 0 }
  for (const id of ids) {
    try {
      const r = await deps.store.tx((tx) => resumeOne(tx, id, now))
      if (r !== 'gone') counts[r] += 1
    } catch (e) {
      console.error('resume failed for', id, e)
      await deps.store.tx((tx) => failScheduled(tx, id, `This step could not run: ${e instanceof Error ? e.message : String(e)}`))
      counts.failed += 1
    }
  }
  return { status: 200, body: counts }
}
```

- [ ] **Step 7: Wire the functions**

`supabase/functions/advance/index.ts`
```ts
import { createClient } from 'npm:@supabase/supabase-js@2'
import { advance } from './handler.ts'
import { pgStore } from './pgStore.ts'
import { fileExists } from '../_shared/storage.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const MAX_BODY = 1_000_000
const url = Deno.env.get('SUPABASE_URL')!
const store = pgStore(Deno.env.get('SUPABASE_DB_URL')!) // one small pool per worker
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  const text = await req.text()
  if (text.length > MAX_BODY) return json(413, { error: 'These answers are too large to send.' })
  let body: unknown = null
  try { body = JSON.parse(text) } catch { /* body stays null; advance answers 400 */ }
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  try {
    const res = await advance(body, {
      userId: async () => (await asCaller.auth.getUser()).data.user?.id ?? null,
      store,
      fileExists: (path) => fileExists(admin, path),
      now: () => new Date(),
    })
    return json(res.status, res.body)
  } catch (e) {
    console.error('advance failed', e)
    return json(500, { error: 'We could not save this step. Try again.' })
  }
})
```

`supabase/functions/resume/index.ts`
```ts
import { resume } from './handler.ts'
import { pgStore } from '../advance/pgStore.ts'

const store = pgStore(Deno.env.get('SUPABASE_DB_URL')!)
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  const secret = Deno.env.get('CRON_SECRET') ?? ''
  try {
    const res = await resume({ authorised: secret.length >= 16 && req.headers.get('Authorization') === `Bearer ${secret}`, store, now: () => new Date() })
    return json(res.status, res.body)
  } catch (e) {
    console.error('resume failed', e)
    return json(500, { error: 'Resume failed.' })
  }
})
```

`supabase/config.toml` — append:
```toml
# pg_cron calls resume with its own shared secret (CRON_SECRET), not a user JWT.
[functions.resume]
verify_jwt = false
```

- [ ] **Step 8: Run — expect PASS**

Run: `DENO_NO_PACKAGE_JSON=1 deno test supabase/functions`
Expected: `ok | 89 passed | 0 failed | 1 ignored` (83 + 3 advance + 3 resume; the race test is ignored without `RNR_TEST_DB_URL`).

- [ ] **Step 9: Run the race test and the cron path against the local stack** (Review Focus #1, #2)

```bash
supabase db reset
RNR_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres deno test --allow-env --allow-net supabase/functions/advance/race.test.ts
```
Expected: `ok | 1 passed | 0 failed`.

```bash
echo 'CRON_SECRET=local-cron-secret' > supabase/functions/.env.local
supabase functions serve --env-file supabase/functions/.env.local &
ANON=$(supabase status -o json | jq -r .ANON_KEY)
tok() { curl -s 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' -H "apikey: $ANON" -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"password\":\"password123\"}" | jq -r .access_token; }
MEMBER=$(tok member@alpha.test); ADMIN=$(tok admin@alpha.test)
SIG='0000000a-0000-0000-0000-000000000001/00000000-0000-0000-0000-0000000000a3/sig.png'
curl -s -X PUT "http://127.0.0.1:54321/storage/v1/object/form-files/$SIG" -H "Authorization: Bearer $MEMBER" -H 'Content-Type: image/png' --data-binary 'x'
curl -s http://127.0.0.1:54321/functions/v1/advance -H "Authorization: Bearer $MEMBER" -H 'Content-Type: application/json' \
  -d "{\"action\":\"start\",\"workflowId\":\"0000000a-0000-0000-0000-00000000c001\",\"answers\":{\"name\":\"Ada\",\"leave_type\":\"Annual\",\"start\":\"2026-10-12\",\"end\":\"2026-10-14\",\"agree\":true,\"sig\":\"$SIG\"}}"
```
Expected: `{"recordId":"…","status":"open"}`. Then:
```bash
TASK=$(psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -Atc "select id from tasks where status = 'open'")
curl -s http://127.0.0.1:54321/rest/v1/rpc/claim_task -H "apikey: $ANON" -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d "{\"p_task\":\"$TASK\"}"
curl -s http://127.0.0.1:54321/functions/v1/advance -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d "{\"action\":\"submit\",\"taskId\":\"$TASK\",\"outcome\":\"approved\",\"answers\":{\"comment\":\"Enjoy\"}}"
```
Expected: `{"recordId":"…","status":"open"}` and one `pending` row in `scheduled_actions`. Wait 2 minutes, then `select status from records` → `done`, `select status from scheduled_actions` → `done` (pg_cron → pg_net → resume). `curl -s -X POST http://127.0.0.1:54321/functions/v1/resume` → `401`. The same submit replayed → `409 {"error":"This task is already done."}`.

- [ ] **Step 10: README** — in `README.md`:

```bash
echo 'CRON_SECRET=local-cron-secret' > supabase/functions/.env.local   # once; matches the Vault secret in seed.sql
supabase functions serve --env-file supabase/functions/.env.local &    # invite-member, submit-form, advance, resume, save-workflow
```
```markdown
- `deno test supabase/functions` — Edge Functions, the workflow engine and the shared tests under Deno
- `RNR_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres deno test --allow-env --allow-net supabase/functions/advance/race.test.ts` — two simultaneous approvals against the local database

Hosted projects: set the `CRON_SECRET` function secret (16+ characters) and create the Vault secrets `resume_url` (`https://<ref>.supabase.co/functions/v1/resume`) and `cron_secret` (same value).
```

- [ ] **Step 11: Commit**

```bash
git add supabase/functions/_shared/storage.ts supabase/functions/advance/pgStore.ts supabase/functions/advance/handler.ts supabase/functions/advance/handler.test.ts \
  supabase/functions/advance/race.test.ts supabase/functions/advance/index.ts supabase/functions/resume/handler.ts supabase/functions/resume/handler.test.ts \
  supabase/functions/resume/index.ts supabase/functions/submit-form/index.ts supabase/config.toml README.md deno.lock
git commit -m "feat: add advance and resume edge functions with transactional record locking"
```

---

### Task 5: Edge Function `save-workflow`

**Owner:** Backend engineer · **Depends on:** Tasks 1, 2

**Files:**
- Create: `supabase/functions/save-workflow/handler.ts`, `supabase/functions/save-workflow/index.ts`
- Test: `supabase/functions/save-workflow/handler.test.ts`

**Interfaces:**
- Consumes: `readGraph`, `checkGraph`, `Refs`, `Issue` (Task 1); `workflows`, guard message `A step with open records cannot be deleted: <node> (<n> open)` (Task 2).
- Produces: `POST /functions/v1/save-workflow` body `{ workflowId, name, graph, updatedAt, publish?: boolean }` →
  - `200 { updatedAt, status, issues }` (a draft may carry issues; they come back for the canvas)
  - `400 { error }` · `401` · `403 { error }` (no `workflows.manage`; publishing without `workflows.publish`) · `404`
  - `409 { error, issues }` publish check failed (publishing, or editing a published workflow) · `409 { error, conflict: true }` changed by someone else · `409 { error, nodeId }` a deleted step has open records
- Produces (for tests): `saveWorkflow(body: unknown, deps: Deps): Promise<Result>` with `Deps = { userId(); loadWorkflow(id); can(orgId, perm); refs(orgId); save(row) }` as in the code.

- [ ] **Step 1: Write the failing test** — `supabase/functions/save-workflow/handler.test.ts`

```ts
import { assertEquals } from 'jsr:@std/assert@1'
import { saveWorkflow, type Deps, type SaveOutcome } from './handler.ts'
import { LEAVE, REFS, WF, leave } from '../_shared/workflow/fixture.ts'

const ORG = '0000000a-0000-0000-0000-000000000001'
const USER = '00000000-0000-0000-0000-0000000000a2'
const VERSION = '2026-10-11T12:00:00.000000+00:00'

function setup(over: Partial<Deps> = {}, status: 'draft' | 'published' = 'draft', perms = ['workflows.manage', 'workflows.publish']) {
  const saved: Parameters<Deps['save']>[0][] = []
  const deps: Deps = {
    userId: () => Promise.resolve(USER),
    loadWorkflow: (id) => Promise.resolve(id === WF ? { id, org_id: ORG, status } : null),
    can: (_org, perm) => Promise.resolve(perms.includes(perm)),
    refs: () => Promise.resolve(REFS),
    save: (row) => { saved.push(row); return Promise.resolve<SaveOutcome>({ ok: true, updatedAt: 'v2', status: row.status }) },
    ...over,
  }
  return { deps, saved }
}
const body = (over: Record<string, unknown> = {}) => ({ workflowId: WF, name: ' Leave approval ', graph: LEAVE, updatedAt: VERSION, ...over })
const broken = () => { const g = leave(); g.edges = g.edges.filter((e) => e.id !== 'e3'); return g }

Deno.test('rejects a malformed body', async () => {
  const { deps, saved } = setup()
  for (const b of [null, body({ workflowId: 'x' }), body({ graph: { nodes: 'x' } }), body({ name: '' }), body({ publish: 'yes' }), body({ updatedAt: 1 })]) {
    assertEquals((await saveWorkflow(b, deps)).status, 400)
  }
  assertEquals(saved.length, 0)
})
Deno.test('401, 404 and 403 before any write', async () => {
  assertEquals((await saveWorkflow(body(), setup({ userId: () => Promise.resolve(null) }).deps)).status, 401)
  assertEquals((await saveWorkflow(body({ workflowId: '0000000b-0000-0000-0000-00000000c009' }), setup().deps)).status, 404)
  const viewer = setup({}, 'draft', [])
  assertEquals((await saveWorkflow(body(), viewer.deps)).status, 403)
  const noPublish = setup({}, 'draft', ['workflows.manage'])
  const res = await saveWorkflow(body({ publish: true }), noPublish.deps)
  assertEquals([res.status, res.body.error, noPublish.saved.length], [403, 'You need permission to publish workflows.', 0])
})
Deno.test('a draft saves with issues and returns them', async () => {
  const { deps, saved } = setup()
  const res = await saveWorkflow(body({ graph: broken() }), deps)
  assertEquals([res.status, saved[0].status, saved[0].name, saved[0].updated_by, saved[0].expected], [200, 'draft', 'Leave approval', USER, VERSION])
  assertEquals((res.body.issues as unknown[]).length, 2)
})
Deno.test('publishing runs the check and refuses a broken graph', async () => {
  const { deps, saved } = setup()
  const res = await saveWorkflow(body({ graph: broken(), publish: true }), deps)
  assertEquals([res.status, res.body.error, saved.length], [409, 'Fix the issues on the canvas before publishing.', 0])
  const ok = await saveWorkflow(body({ publish: true }), deps)
  assertEquals([ok.status, ok.body.status, saved[0].status], [200, 'published', 'published'])
})
Deno.test('a published workflow must stay valid when edited', async () => {
  const { deps, saved } = setup({}, 'published')
  const res = await saveWorkflow(body({ graph: broken() }), deps)
  assertEquals([res.status, saved.length], [409, 0])
  assertEquals(res.body.error, 'This workflow is published, so it must stay valid. Fix the issues on the canvas, then save.')
})
Deno.test('a concurrent edit is a conflict, not a lost update', async () => {
  const { deps } = setup({ save: () => Promise.resolve<SaveOutcome>({ ok: false, conflict: true }) })
  const res = await saveWorkflow(body(), deps)
  assertEquals([res.status, res.body.conflict], [409, true])
})
Deno.test('an open step cannot be deleted', async () => {
  const { deps } = setup({ save: () => Promise.resolve<SaveOutcome>({ ok: false, openOn: 'approve' }) })
  const res = await saveWorkflow(body(), deps)
  assertEquals([res.status, res.body.nodeId], [409, 'approve'])
  assertEquals(res.body.error, 'A step with open records cannot be deleted. Put it back, or wait until those records move on.')
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `DENO_NO_PACKAGE_JSON=1 deno test supabase/functions/save-workflow`
Expected: `Module not found "…/save-workflow/handler.ts"`.

- [ ] **Step 3: Implement the handler** — `supabase/functions/save-workflow/handler.ts`

```ts
import { checkGraph, readGraph, type Refs } from '../_shared/workflow/graph.ts'

export type Loaded = { id: string; org_id: string; status: 'draft' | 'published' }
export type SaveOutcome =
  | { ok: true; updatedAt: string; status: 'draft' | 'published' }
  | { ok: false; conflict: true }
  | { ok: false; openOn: string }
export type Deps = {
  userId(): Promise<string | null>
  /** Caller-scoped read: RLS returns drafts only to workflows.manage holders of that org. */
  loadWorkflow(id: string): Promise<Loaded | null>
  can(orgId: string, perm: 'workflows.manage' | 'workflows.publish'): Promise<boolean>
  /** Ids that a graph in this org may reference: forms, roles, active members. */
  refs(orgId: string): Promise<Refs>
  /** Conditional on updated_at; the database guard refuses deleting a step with open records. */
  save(row: { id: string; name: string; graph: unknown; status: 'draft' | 'published'; updated_by: string; expected: string }): Promise<SaveOutcome>
}
export type Result = { status: number; body: Record<string, unknown> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const out = (status: number, body: Record<string, unknown>): Result => ({ status, body })

/** The only writer of a workflow's name, graph and status, so a published graph always passes the check. */
export async function saveWorkflow(body: unknown, deps: Deps): Promise<Result> {
  if (!isObj(body) || typeof body.workflowId !== 'string' || !UUID.test(body.workflowId) || typeof body.name !== 'string' ||
      typeof body.updatedAt !== 'string' || (body.publish !== undefined && typeof body.publish !== 'boolean') || !readGraph(body.graph)) {
    return out(400, { error: 'Send the workflow id, name, steps and version.' })
  }
  const name = body.name.trim()
  if (name.length < 1 || name.length > 120) return out(400, { error: 'Enter a name of up to 120 characters.' })
  const userId = await deps.userId()
  if (!userId) return out(401, { error: 'Sign in again to save this workflow.' })
  const wf = await deps.loadWorkflow(body.workflowId)
  if (!wf) return out(404, { error: 'This workflow does not exist or you do not have access to it.' })
  if (!(await deps.can(wf.org_id, 'workflows.manage'))) return out(403, { error: 'You do not have permission to do that.' })
  const publishing = body.publish === true && wf.status === 'draft'
  if (publishing && !(await deps.can(wf.org_id, 'workflows.publish'))) return out(403, { error: 'You need permission to publish workflows.' })
  const status = publishing || wf.status === 'published' ? 'published' : 'draft'

  const issues = checkGraph(body.graph, await deps.refs(wf.org_id))
  if (status === 'published' && issues.length) {
    return out(409, {
      error: publishing ? 'Fix the issues on the canvas before publishing.' : 'This workflow is published, so it must stay valid. Fix the issues on the canvas, then save.',
      issues,
    })
  }
  const saved = await deps.save({ id: wf.id, name, graph: body.graph, status, updated_by: userId, expected: body.updatedAt })
  if (saved.ok) return out(200, { updatedAt: saved.updatedAt, status: saved.status, issues })
  if ('conflict' in saved) return out(409, { error: 'This workflow was changed by someone else. Reload to see their changes.', conflict: true })
  return out(409, { error: 'A step with open records cannot be deleted. Put it back, or wait until those records move on.', nodeId: saved.openOn })
}
```

- [ ] **Step 4: Wire the function** — `supabase/functions/save-workflow/index.ts`

```ts
import { createClient } from 'npm:@supabase/supabase-js@2'
import { saveWorkflow } from './handler.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const MAX_BODY = 1_000_000
const OPEN_STEP = /A step with open records cannot be deleted: (\S+)/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  const text = await req.text()
  if (text.length > MAX_BODY) return json(413, { error: 'This workflow is too large to save.' })
  let body: unknown = null
  try { body = JSON.parse(text) } catch { /* body stays null; saveWorkflow answers 400 */ }

  const url = Deno.env.get('SUPABASE_URL')!
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const ids = async (q: PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>, col: string) => {
    const { data, error } = await q
    if (error) throw error
    return new Set((data ?? []).map((r) => r[col] as string))
  }
  try {
    const res = await saveWorkflow(body, {
      userId: async () => (await asCaller.auth.getUser()).data.user?.id ?? null,
      loadWorkflow: async (id) => {
        const { data, error } = await asCaller.from('workflows').select('id, org_id, status').eq('id', id).maybeSingle()
        if (error) throw error
        return data
      },
      can: async (orgId, perm) => {
        const { data, error } = await asCaller.rpc('has_permission', { p_org: orgId, p_perm: perm })
        if (error) throw error
        return data === true
      },
      refs: async (orgId) => ({
        forms: await ids(admin.from('forms').select('id').eq('org_id', orgId), 'id'),
        roles: await ids(admin.from('roles').select('id').eq('org_id', orgId), 'id'),
        users: await ids(admin.from('members').select('user_id').eq('org_id', orgId).eq('status', 'active'), 'user_id'),
      }),
      save: async (row) => {
        const { data, error } = await admin.from('workflows')
          .update({ name: row.name, graph: row.graph, status: row.status, updated_by: row.updated_by })
          .eq('id', row.id).eq('updated_at', row.expected).select('updated_at, status')
        if (error) {
          const m = OPEN_STEP.exec(error.message)
          if (m) return { ok: false, openOn: m[1] }
          throw error
        }
        return data.length ? { ok: true, updatedAt: data[0].updated_at, status: data[0].status } : { ok: false, conflict: true }
      },
    })
    return json(res.status, res.body)
  } catch (e) {
    console.error('save-workflow failed', e)
    return json(500, { error: 'We could not save this workflow. Try again.' })
  }
})
```

- [ ] **Step 5: Run — expect PASS**

Run: `DENO_NO_PACKAGE_JSON=1 deno test supabase/functions`
Expected: `ok | 96 passed | 0 failed | 1 ignored` (89 + 7).

- [ ] **Step 6: Manual check** (Review Focus #5) — with the Task 4 stack running (same `tok` helper):

```bash
V=$(psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -Atc "select to_json(updated_at) #>> '{}' from workflows where id = '0000000a-0000-0000-0000-00000000c001'")
curl -s http://127.0.0.1:54321/functions/v1/save-workflow -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d "{\"workflowId\":\"0000000a-0000-0000-0000-00000000c001\",\"name\":\"Leave approval\",\"graph\":{\"nodes\":[],\"edges\":[]},\"updatedAt\":\"$V\"}"
```
Expected: `409` — `"Fix the issues on the canvas…"` with `issues` (the workflow is published, so an empty graph fails the check first). Start and approve a fresh record (Task 4 Step 9) so it waits on `wait`; within the minute, send the seeded graph with the `wait` node and `e6` removed and `e4` pointed at `done` → `409` with `"nodeId":"wait"`. As `member@alpha.test` → `403`. With a stale `updatedAt` → `409` with `"conflict":true`.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/save-workflow/handler.ts supabase/functions/save-workflow/handler.test.ts supabase/functions/save-workflow/index.ts
git commit -m "feat: add save-workflow edge function with publish check and step guard"
```

---

### Task 6: Design spec for Phase 3 screens

**Owner:** Senior Designer · **Depends on:** — (must be committed before Task 7 starts)

**Files:**
- Create: `docs/superpowers/design/phase-3-screens.md`

**Interfaces:**
- Consumes: `design/README.md`, `design/tokens.css`, `design/components/*` (Canvas, Button, Field, Dialog, DataTable, Badge, Segmented, Menu, Icon), `docs/superpowers/design/phase-1-screens.md` §0 and `phase-2-screens.md` §0 (still apply, incl. the `src/index.css` additions), this plan's Tasks 7–10 code, and `@xyflow/react` v12's built-in accessibility (focusable nodes and edges, Enter/Space to select, arrow keys move the selected node, its live region).
- Produces: the spec the frontend engineer follows in Tasks 7–10 wherever it differs from this plan's markup or copy.

- [ ] **Step 1: Write the spec** in the format of `phase-2-screens.md` (tables, exact classes/tokens, "DD" where the system is silent), with these sections:
  1. Global additions: nav order and visibility (Inbox and Records for everyone, Workflows for `workflows.manage`; which nav item is current for `#/start/…`, `#/tasks/…`, `#/records/…`), page widths (canvas editor full `max-w-5xl` with the board at least 480px tall, side panel placement at `lg` and below), status words for records (`open` "In progress", `done` "Done", `rejected` "Rejected", `error` "Stopped") and workflows (Draft / Published) as `rnr-status` (grey icon + word, never a coloured pill), the overdue mark, date/time format (en-GB, as Phase 2).
  2. Workflows list: columns, per-row actions (Edit, Access, Delete) and their button kinds, the four empty states, the delete confirmation and the "has records" failure copy.
  3. Canvas editor: the palette of the five cards (Canvas README: blocks with icon, name, one-line description; click or Enter adds at the board centre, drag adds at the drop point; bottom sheet on phones), the board (`.rnr-canvas` dot grid, 16px snap, xyflow's default chrome restyled with tokens only — no xyflow blue, no default shadows; list every `.react-flow__*` override to add to `src/index.css`), the card (`.rnr-block`, type caption, name, one labelled handle per outcome on the right, the input handle on the left, selected / issue / open-records / current-step states, never colour alone), edges (label with the outcome, actions count), the side panel per node type (Start, Form, Condition, Time, End) and per outcome ("Goes to" select = the keyboard way to connect; action list with Set status, Send message, Generate PDF and the copy explaining that messages and PDFs are queued until Communication and Reports arrive), the delete guard ("3 open records are on this step, so it cannot be deleted." in place of the Delete button), the issues list (pinned to cards; "Show" focuses and centres the card), the Save / Publish bar for draft vs published, conflict and saved states, the unsaved-changes warning, and the keyboard path end to end (Tab to a card, Enter to select, arrows to move 16px, panel selects to connect, announcements wording).
  4. Access tab: roles × "Can start" / "Can view all records" table, the Owner row ("Always"), the hint that a role also needs the org permission on the Roles page, saving per toggle (status line), errors.
  5. Inbox: My tasks (title, workflow, step, due, overdue mark, Claim vs Open, claimed-by-someone-else state), Start new list, empty states for both, after-claim focus.
  6. Start page and task view: the start form; earlier submissions read-only (collapsed `<details>` per step, newest last), my form below, Submit vs Approve / Reject (which one is primary; Reject never `rnr-btn-danger` unless the system says so), success state, the role-task "Claim this task" state, "assigned to someone else" and "already done" states, the `error` status after a submit ("This record stopped: …").
  7. Records list and record page: list columns and the All / Open / Stopped / Closed filter (`rnr-seg`), the record header (title, status, label), the stopped-record alert, the timeline (one line per event kind with who and when, answers expandable), the read-only mini canvas (height, current-step mark, a text equivalent "Current step: Manager approval" so the map is never the only source).
  8. Copy table for every new string, and an accessibility summary (canvas keyboard path, live announcements, focus after claim/submit/delete, 44px touch targets, 375px with no page-level horizontal scroll — the board scrolls inside its card).
  9. Conflicts with Tasks 7–10 and the corrections the frontend must make.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/design/phase-3-screens.md
git commit -m "docs: add phase 3 screen design spec"
```

---

### Task 7: Frontend — routes, nav, workflows list, data layer

**Owner:** Frontend engineer · **Depends on:** Tasks 1, 2, 6

**Files:**
- Create: `src/workflows/logic.ts`, `src/workflows/api.ts`, `src/workflows/WorkflowGate.tsx`, `src/workflows/WorkflowsPage.tsx`, `src/members/useMemberEmails.ts`
- Modify: `src/rbac/route.ts`, `src/rbac/route.test.ts`, `src/ui/errors.ts`, `src/ui/errors.test.ts`, `src/forms/submissions/SubmissionsPage.tsx`, `src/forms/api.ts`, `src/forms/fill/FormRunner.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `useOrg()` (`orgId`, `userId`, `can`), `supabase`, `friendlyError`, `useAction`, `useNotice`, `useFocusAfterRender`, `ConfirmDialog`, `Skeleton`; the graph module (Task 1); tables, RPCs and computed columns (Task 2); `advance` and `save-workflow` contracts (Tasks 4, 5).
- Produces:
  - `type Route = … | { page: 'workflows' | 'inbox' | 'records' } | { page: 'workflow-edit' | 'workflow-access' | 'start' | 'task' | 'record'; id: string }`; hashes `#/workflows`, `#/workflows/<id>/edit`, `#/workflows/<id>/access`, `#/inbox`, `#/start/<workflowId>`, `#/tasks/<id>`, `#/records`, `#/records/<id>`
  - `type Perms = { roles: boolean; forms: boolean; workflows: boolean }`, `guardHash(hash: string, perms: Perms): string`
  - `useMemberEmails(orgId: string | null)` → `Map<userId, email>` under key `['member-emails', orgId]`
  - `SubmitResult = { ok: true; id: string } | { ok: false; error: string; fieldErrors?: Record<string, string> }` (was `submissionId`)
  - `src/workflows/api.ts`: `WorkflowRow`, `LoadedWorkflow`, `useWorkflows`, `useWorkflow`, `useOpenCounts`, `useStartable`, `MyTask`, `useMyTasks`, `TaskDetail`, `useTask`, `RecordFilter`, `RecordRow`, `useRecords`, `useRecord`, `RecordEvent`, `useRecordEvents`, `RecordSubmission`, `useRecordSubmissions`, `SaveResult`, `saveWorkflow`, `advance`, `claimTask`, `RECORD_LIMIT`
  - `WorkflowGate({ id, back?, children(wf) })`, `WorkflowsPage()`

- [ ] **Step 1: Write the failing tests**

`src/rbac/route.test.ts` — change `all` / `none` and add:
```ts
const all = { roles: true, forms: true, workflows: true }
const none = { roles: false, forms: false, workflows: false }

test('parses workflow, inbox, task, start and record pages', () => {
  assert.deepEqual(parseRoute('#/workflows'), { page: 'workflows' })
  assert.deepEqual(parseRoute(`#/workflows/${id}/edit`), { page: 'workflow-edit', id })
  assert.deepEqual(parseRoute(`#/workflows/${id}/access`), { page: 'workflow-access', id })
  assert.deepEqual(parseRoute('#/inbox'), { page: 'inbox' })
  assert.deepEqual(parseRoute(`#/start/${id}`), { page: 'start', id })
  assert.deepEqual(parseRoute(`#/tasks/${id}`), { page: 'task', id })
  assert.deepEqual(parseRoute('#/records'), { page: 'records' })
  assert.deepEqual(parseRoute(`#/records/${id}`), { page: 'record', id })
  assert.deepEqual(parseRoute('#/records/nope'), { page: 'members' })
  assert.deepEqual(parseRoute('#/workflows/x/edit'), { page: 'members' })
})
test('workflow pages fall back to the inbox without workflows.manage', () => {
  assert.equal(guardHash('#/workflows', none), '#/inbox')
  assert.equal(guardHash(`#/workflows/${id}/edit`, none), '#/inbox')
  assert.equal(guardHash(`#/workflows/${id}/access`, none), '#/inbox')
  assert.equal(guardHash(`#/workflows/${id}/edit`, all), `#/workflows/${id}/edit`)
  assert.equal(guardHash(`#/records/${id}`, none), `#/records/${id}`)
})
```

`src/ui/errors.test.ts` — add:
```ts
test('workflow messages', () => {
  assert.equal(
    friendlyError({ code: '23503', message: 'update or delete on table "workflows" violates foreign key constraint "records_workflow_id_org_id_fkey" on table "records"' }),
    'This workflow has records, so it cannot be deleted. Keep it, or rename it so people know it is no longer used.',
  )
  assert.equal(friendlyError({ code: 'P0001', message: 'This task was already claimed or completed.' }), 'Someone else claimed this task first, or it is already done.')
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test`
Expected: the new route and error tests fail.

- [ ] **Step 3: Implement routes and messages**

`src/rbac/route.ts`
```ts
export type Route =
  | { page: 'members' } | { page: 'roles' } | { page: 'forms' } | { page: 'workflows' } | { page: 'inbox' } | { page: 'records' }
  | { page: 'form-edit' | 'form-fill' | 'form-submissions'; id: string }
  | { page: 'workflow-edit' | 'workflow-access' | 'start' | 'task' | 'record'; id: string }
export type Perms = { roles: boolean; forms: boolean; workflows: boolean }

const ID = '([0-9a-f-]{36})'
const FORM_PAGE = new RegExp(`^#/forms/${ID}/(edit|fill|submissions)$`)
const WORKFLOW_PAGE = new RegExp(`^#/workflows/${ID}/(edit|access)$`)
const ITEM_PAGE = new RegExp(`^#/(start|tasks|records)/${ID}$`)
const LISTS: Record<string, 'roles' | 'forms' | 'workflows' | 'inbox' | 'records'> = {
  '#/roles': 'roles', '#/forms': 'forms', '#/workflows': 'workflows', '#/inbox': 'inbox', '#/records': 'records',
}
const ITEM = { start: 'start', tasks: 'task', records: 'record' } as const

export function parseRoute(hash: string): Route {
  if (Object.hasOwn(LISTS, hash)) return { page: LISTS[hash] }
  const f = FORM_PAGE.exec(hash)
  if (f) return { page: `form-${f[2]}` as 'form-edit' | 'form-fill' | 'form-submissions', id: f[1] }
  const w = WORKFLOW_PAGE.exec(hash)
  if (w) return { page: `workflow-${w[2]}` as 'workflow-edit' | 'workflow-access', id: w[1] }
  const i = ITEM_PAGE.exec(hash)
  if (i) return { page: ITEM[i[1] as keyof typeof ITEM], id: i[2] }
  return { page: 'members' }
}

/** Pages the signed-in user may not see fall back to one they can. UI hint only; RLS and the Edge Functions decide. */
export function guardHash(hash: string, perms: Perms): string {
  const r = parseRoute(hash)
  if (r.page === 'roles' && !perms.roles) return '#/members'
  if (r.page === 'form-edit' && !perms.forms) return `#/forms/${r.id}/fill`
  if ((r.page === 'workflows' || r.page === 'workflow-edit' || r.page === 'workflow-access') && !perms.workflows) return '#/inbox'
  return hash
}
```

`src/ui/errors.ts` — add before the `row-level security` entry:
```ts
  [/on table "records"/, 'This workflow has records, so it cannot be deleted. Keep it, or rename it so people know it is no longer used.'],
  [/already claimed or completed/, 'Someone else claimed this task first, or it is already done.'],
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm test`
Expected: `# pass 78` `# fail 0` (75 + 2 route + 1 errors).

- [ ] **Step 5: Shared pieces** — extract the member lookup and generalise the submit result

`src/members/useMemberEmails.ts`
```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../data/supabase'

/** user id → email for the org. One key, one select shape, shared by every page that names people (QA-2). */
export const useMemberEmails = (orgId: string | null) => useQuery({
  queryKey: ['member-emails', orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data, error } = await supabase.from('members').select('user_id, email').eq('org_id', orgId!)
    if (error) throw error
    return new Map(data.filter((m) => m.user_id).map((m) => [m.user_id as string, m.email]))
  },
})
```

`src/forms/submissions/SubmissionsPage.tsx` — replace the inline `emails` query with `const emails = useMemberEmails(orgId)` (import from `../../members/useMemberEmails`).

`src/forms/api.ts` — `SubmitResult` carries a generic id, because the workflow start returns a record id through the same runner:
```ts
export type SubmitResult = { ok: true; id: string } | { ok: false; error: string; fieldErrors?: Record<string, string> }
```
and in `submitAnswers`: `if (!error) return { ok: true, id: data.submissionId }`. In `src/forms/fill/FormRunner.tsx`: `if (res.ok) { onDone?.(res.id); return }`.

- [ ] **Step 6: Data layer**

`src/workflows/logic.ts`
```ts
// The same module runs inside save-workflow and advance; the server's check is the one that counts.
export * from '../../supabase/functions/_shared/workflow/graph.ts'
```

`src/workflows/api.ts`
```ts
import { useQuery } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../data/supabase'
import type { Answers, Field } from '../forms/logic'
import type { SubmitResult } from '../forms/api'
import { readGraph, type Graph, type Issue, type Outcome } from './logic'

export type WorkflowStatus = 'draft' | 'published'
export type WorkflowRow = { id: string; name: string; status: WorkflowStatus; updated_at: string }
export type LoadedWorkflow = WorkflowRow & { org_id: string; graph: Graph }
export const RECORD_LIMIT = 200 // shortcut: newest 200 only; paging arrives with aggregate reports (Phase 5)

const graphOf = (raw: unknown): Graph => readGraph(raw) ?? { nodes: [], edges: [] }

export const useWorkflows = (orgId: string | null) => useQuery({
  queryKey: ['workflows', orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data, error } = await supabase.from('workflows').select('id, name, status, updated_at').eq('org_id', orgId!).order('name')
    if (error) throw error
    return data as WorkflowRow[]
  },
})

export const useWorkflow = (id: string) => useQuery({
  queryKey: ['workflow', id],
  queryFn: async () => {
    const { data, error } = await supabase.from('workflows').select('id, org_id, name, status, graph, updated_at').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? ({ ...data, graph: graphOf(data.graph) } as LoadedWorkflow) : null
  },
})

/** Open and stopped records per step, for the delete guard (workflows.manage only). */
export const useOpenCounts = (id: string) => useQuery({
  queryKey: ['open-counts', id],
  queryFn: async () => {
    const { data, error } = await supabase.rpc('open_record_counts', { p_workflow: id })
    if (error) throw error
    return new Map((data ?? []).map((r: { node_id: string; n: number }) => [r.node_id, r.n]))
  },
})

export type Startable = { id: string; name: string }
export const useStartable = (orgId: string | null) => useQuery({
  queryKey: ['startable', orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data, error } = await supabase.from('workflows').select('id, name, can_start').eq('org_id', orgId!).eq('can_start', true).order('name')
    if (error) throw error
    return data as unknown as Startable[]
  },
})

type WorkflowRef = { name: string; graph: Graph }
const withGraph = <T extends { workflow: { name: string; graph: unknown } }>(row: T) => ({ ...row, workflow: { ...row.workflow, graph: graphOf(row.workflow.graph) } })

export type MyTask = {
  id: string; node_id: string; due_at: string | null; claimed_by: string | null; assignee_role_id: string | null
  assignee_user_id: string | null; created_at: string; record: { id: string; title: string; workflow: WorkflowRef }
}
export const useMyTasks = (orgId: string | null) => useQuery({
  queryKey: ['my-tasks', orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data, error } = await supabase.from('tasks')
      .select('id, node_id, due_at, claimed_by, assignee_role_id, assignee_user_id, created_at, record:records(id, title, workflow:workflows(name, graph))')
      .eq('org_id', orgId!).eq('is_mine', true).order('created_at')
    if (error) throw error
    return (data as unknown as MyTask[]).map((t) => ({ ...t, record: withGraph(t.record) }))
  },
})

export type TaskDetail = {
  id: string; org_id: string; record_id: string; node_id: string; status: 'open' | 'done' | 'cancelled'; due_at: string | null
  claimed_by: string | null; assignee_role_id: string | null; assignee_user_id: string | null; is_mine: boolean
  record: { id: string; title: string; status: RecordStatus; error: string | null; workflow: WorkflowRef }
}
export const useTask = (id: string) => useQuery({
  queryKey: ['task', id],
  queryFn: async () => {
    const { data, error } = await supabase.from('tasks')
      .select('id, org_id, record_id, node_id, status, due_at, claimed_by, assignee_role_id, assignee_user_id, is_mine, record:records(id, title, status, error, workflow:workflows(name, graph))')
      .eq('id', id).maybeSingle()
    if (error) throw error
    const t = data as unknown as TaskDetail | null
    return t ? { ...t, record: withGraph(t.record) } : null
  },
})

export type RecordStatus = 'open' | 'done' | 'rejected' | 'error'
export type RecordFilter = 'all' | 'open' | 'error' | 'closed'
export type RecordRow = {
  id: string; org_id: string; title: string; status: RecordStatus; label: string | null; error: string | null
  current_node_id: string | null; started_by: string; created_at: string; workflow: WorkflowRef
}
const RECORD_COLS = 'id, org_id, title, status, label, error, current_node_id, started_by, created_at, workflow:workflows(name, graph)'

export const useRecords = (orgId: string | null, filter: RecordFilter) => useQuery({
  queryKey: ['records', orgId, filter],
  enabled: !!orgId,
  queryFn: async () => {
    let q = supabase.from('records').select(RECORD_COLS).eq('org_id', orgId!)
    if (filter === 'open' || filter === 'error') q = q.eq('status', filter)
    if (filter === 'closed') q = q.in('status', ['done', 'rejected'])
    const { data, error } = await q.order('created_at', { ascending: false }).limit(RECORD_LIMIT)
    if (error) throw error
    return (data as unknown as RecordRow[]).map(withGraph)
  },
})

export const useRecord = (id: string) => useQuery({
  queryKey: ['record', id],
  queryFn: async () => {
    const { data, error } = await supabase.from('records').select(RECORD_COLS).eq('id', id).maybeSingle()
    if (error) throw error
    return data ? withGraph(data as unknown as RecordRow) : null
  },
})

export type RecordEvent = { id: number; kind: string; node_id: string | null; actor_id: string | null; detail: Record<string, unknown>; created_at: string }
export const useRecordEvents = (recordId: string) => useQuery({
  queryKey: ['record-events', recordId],
  queryFn: async () => {
    const { data, error } = await supabase.from('record_events').select('id, kind, node_id, actor_id, detail, created_at').eq('record_id', recordId).order('id')
    if (error) throw error
    return data as RecordEvent[]
  },
})

export type RecordSubmission = {
  id: string; node_id: string; answers: Answers; submitted_by: string; outcome: 'submitted' | 'approved' | 'rejected'
  created_at: string; form: { name: string; schema: Field[] } | null
}
export const useRecordSubmissions = (recordId: string) => useQuery({
  queryKey: ['record-submissions', recordId],
  queryFn: async () => {
    const { data, error } = await supabase.from('form_submissions')
      .select('id, node_id, answers, submitted_by, outcome, created_at, form:forms(name, schema)').eq('record_id', recordId).order('created_at')
    if (error) throw error
    return data as unknown as RecordSubmission[]
  },
})

type Reply = { ok: true; data: Record<string, unknown> } | { ok: false; body: Record<string, unknown> }
/** The Edge Functions write their own user-facing sentences; anything else falls back to `fallback`. */
async function call(fn: string, body: unknown, fallback: string): Promise<Reply> {
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (!error) return { ok: true, data }
  if (error instanceof FunctionsHttpError) {
    const b = await error.context.json().catch(() => null)
    if (typeof b?.error === 'string') return { ok: false, body: b }
  }
  return { ok: false, body: { error: fallback } }
}

export type SaveResult =
  | { ok: true; updatedAt: string; status: WorkflowStatus }
  | { ok: false; error: string; conflict?: boolean; nodeId?: string; issues?: Issue[] }
export async function saveWorkflow(input: { workflowId: string; name: string; graph: Graph; updatedAt: string; publish: boolean }): Promise<SaveResult> {
  const r = await call('save-workflow', input, 'We could not save this workflow. Try again.')
  if (r.ok) return { ok: true, updatedAt: r.data.updatedAt as string, status: r.data.status as WorkflowStatus }
  return { ok: false, ...(r.body as { error: string; conflict?: boolean; nodeId?: string; issues?: Issue[] }) }
}

export type AdvanceBody =
  | { action: 'start'; workflowId: string; answers: Answers }
  | { action: 'submit'; taskId: string; outcome: Outcome; answers: Answers }
/** Same shape FormRunner expects; `id` is the record id. */
export async function advance(body: AdvanceBody): Promise<SubmitResult> {
  const r = await call('advance', body, 'We could not save this step. Try again.')
  if (r.ok) return { ok: true, id: r.data.recordId as string }
  return { ok: false, error: r.body.error as string, fieldErrors: r.body.fieldErrors as Record<string, string> | undefined }
}

export async function claimTask(id: string): Promise<void> {
  const { error } = await supabase.rpc('claim_task', { p_task: id })
  if (error) throw error
}
```

`src/workflows/WorkflowGate.tsx`
```tsx
import type { ReactNode } from 'react'
import { useOrg } from '../rbac/useOrg'
import { BackIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { useWorkflow, type LoadedWorkflow } from './api'

function Notice({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rnr-card gap-3 max-w-xl">
      <h1 className="page-title">{title}</h1>
      <p className="rnr-muted">{body}</p>
      {action && <div>{action}</div>}
    </div>
  )
}

/** Loading, error and not-found states for the editor, the Access tab and the start page; adds the way back. */
export function WorkflowGate({ id, back = { href: '#/workflows', label: 'Back to workflows' }, children }:
  { id: string; back?: { href: string; label: string }; children(wf: LoadedWorkflow): ReactNode }) {
  const { orgId } = useOrg()
  const wf = useWorkflow(id)
  const shell = (inner: ReactNode) => (
    <div className="flex flex-col gap-4"><a className="rnr-btn rnr-btn-ghost self-start" href={back.href}><BackIcon />{back.label}</a>{inner}</div>
  )
  if (wf.isPending) return shell(<Skeleton rows={[{ w: '240px', h: 32 }, { w: '100%', h: 480 }]} />)
  if (wf.isError) {
    return shell(<Notice title="We could not load this workflow" body="Check your connection and try again."
      action={<button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => wf.refetch()}>Try again</button>} />)
  }
  if (!wf.data || wf.data.org_id !== orgId) {
    return shell(<Notice title="This workflow does not exist" body="It may have been deleted, or it belongs to another organisation." />)
  }
  return shell(children(wf.data))
}
```

- [ ] **Step 7: Workflows list** — `src/workflows/WorkflowsPage.tsx`

```tsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../data/supabase'
import { useOrg } from '../rbac/useOrg'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { friendlyError } from '../ui/errors'
import { CheckIcon, PlusIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { useAction } from '../ui/useAction'
import { useFocusAfterRender } from '../ui/useFocusAfterRender'
import { useNotice } from '../ui/useNotice'
import { useWorkflows, type WorkflowRow } from './api'

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function WorkflowsPage() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  const list = useWorkflows(orgId)
  const create = useAction()
  const removal = useAction()
  const [createError, setCreateError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<WorkflowRow | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [notice, setNotice] = useNotice()
  const focusLater = useFocusAfterRender()
  const refresh = () => qc.invalidateQueries({ queryKey: ['workflows', orgId] })

  const add = () => create.run(async () => {
    setCreateError(null)
    const { data, error } = await supabase.from('workflows').insert({ org_id: orgId!, name: 'Untitled workflow' }).select('id').single()
    if (error) return setCreateError(friendlyError(error))
    await refresh()
    location.hash = `#/workflows/${data.id}/edit`
  })
  const remove = () => removal.run(async () => {
    setDeleteError(null)
    const { data, error } = await supabase.from('workflows').delete().eq('id', deleting!.id).select('id')
    if (error) return setDeleteError(friendlyError(error))
    if (!data.length) return setDeleteError('You do not have permission to do that.')
    setNotice(`${deleting!.name} deleted.`)
    setDeleting(null)
    await refresh()
    focusLater('wf-h')
  })
  const newButton = (
    <button className="rnr-btn rnr-btn-primary" type="button" aria-busy={create.busy} onClick={add}>
      {create.busy ? <span className="rnr-spin" aria-hidden="true" /> : <PlusIcon />}{create.busy ? 'Creating…' : 'New workflow'}
    </button>
  )

  return (
    <section className="flex flex-col gap-4" aria-labelledby="wf-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="wf-h" tabIndex={-1} className="page-title">Workflows</h1>
        {!!list.data?.length && newButton}
      </div>
      {createError && <p className="rnr-error" role="alert">{createError}</p>}
      <p className="rnr-status" role="status">{notice && <><CheckIcon size={14} />{notice}</>}</p>
      {list.isPending && <Skeleton rows={[{ w: '100%', h: 48 }, { w: '100%', h: 48 }]} />}
      {list.isError && (
        <div className="rnr-card gap-3">
          <p role="alert">We could not load the workflows. Check your connection and try again.</p>
          <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => list.refetch()}>Try again</button></div>
        </div>
      )}
      {list.data?.length === 0 && (
        <div className="rnr-card gap-3">
          <h2 className="dialog-title">No workflows yet</h2>
          <p className="rnr-muted">Chain your forms into steps, approvals and timers. Start with a new workflow.</p>
          <div>{newButton}</div>
        </div>
      )}
      {!!list.data?.length && (
        <div className="rnr-card p-0 overflow-x-auto">
          <table className="rnr-table">
            <thead><tr><th>Name</th><th>Status</th><th className="num">Updated</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {list.data.map((w) => (
                <tr key={w.id}>
                  <td><a href={`#/workflows/${w.id}/edit`}>{w.name}</a></td>
                  <td><span className="rnr-status">{w.status === 'published' ? 'Published' : 'Draft'}</span></td>
                  <td className="num rnr-num">{day(w.updated_at)}</td>
                  <td className="text-right whitespace-nowrap">
                    <a className="rnr-btn rnr-btn-ghost" href={`#/workflows/${w.id}/access`}>Access</a>
                    <button className="rnr-btn rnr-btn-ghost" type="button" onClick={() => { setDeleteError(null); setDeleting(w) }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog open={!!deleting} title={`Delete ${deleting?.name ?? 'workflow'}?`}
        body="People can no longer start it. A workflow that has records cannot be deleted."
        confirmLabel="Delete workflow" busyLabel="Deleting…" busy={removal.busy} error={deleteError}
        onConfirm={remove} onClose={() => { setDeleting(null); setDeleteError(null) }} />
    </section>
  )
}
```

- [ ] **Step 8: Shell** — `src/App.tsx`

```tsx
import { WorkflowsPage } from './workflows/WorkflowsPage'
```
In `Shell`: `const hash = loading ? rawHash : guardHash(rawHash, { roles: can('roles.manage'), forms: can('forms.manage'), workflows: can('workflows.manage') })`. In `Page`: `case 'workflows': return <WorkflowsPage />`. In the nav, before Forms:
```tsx
            {can('workflows.manage') && link('#/workflows', 'Workflows', route.page.startsWith('workflow'))}
```
Tasks 8–10 add their own `Page` cases and the Inbox and Records links.

- [ ] **Step 9: Typecheck, lint and browser check**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: no errors, no warnings, `# pass 78`.

Browser pane (`supabase db reset`, `supabase functions serve …`, `pnpm dev`): `admin@alpha.test` → Workflows lists "Leave approval · Published"; New workflow opens `#/workflows/<id>/edit` (blank until Task 8); Delete on "Leave approval" after a record exists → the mapped "has records" sentence in the dialog. `member@alpha.test` → no Workflows link; `#/workflows` redirects to `#/inbox`. Forms → a submission still shows the submitter's email (shared `useMemberEmails`), and filling a form still lands on "Form submitted".

- [ ] **Step 10: Commit**

```bash
git add src/workflows/logic.ts src/workflows/api.ts src/workflows/WorkflowGate.tsx src/workflows/WorkflowsPage.tsx src/members/useMemberEmails.ts \
  src/rbac/route.ts src/rbac/route.test.ts src/ui/errors.ts src/ui/errors.test.ts src/forms/submissions/SubmissionsPage.tsx \
  src/forms/api.ts src/forms/fill/FormRunner.tsx src/App.tsx
git commit -m "feat: add workflow routes, data layer and workflows list"
```

---

### Task 8: Frontend — canvas editor and Access tab

**Owner:** Frontend engineer · **Depends on:** Tasks 5, 7

**Files:**
- Create: `src/workflows/canvas/canvasOps.ts`, `src/workflows/canvas/NodeCard.tsx`, `src/workflows/canvas/SidePanel.tsx`, `src/workflows/canvas/WorkflowEditor.tsx`, `src/workflows/AccessPage.tsx`
- Test: `src/workflows/canvas/canvasOps.test.ts`
- Modify: `package.json`, `pnpm-lock.yaml`, `src/index.css`, `src/App.tsx`

**Interfaces:**
- Consumes: graph module (Task 1); `useWorkflow`, `useOpenCounts`, `saveWorkflow`, `WorkflowGate` (Task 7); `useForms` (Phase 2), `useMemberEmails` (Task 7), the `['roles', orgId]` query with Members' exact select (`id, name, is_owner`); `DraftInput`, `RuleEditor` (Phase 2 builder); `setNavGuard`, `ConfirmDialog`, `useAction`, `useNotice`, `useFocusAfterRender`; `workflow_access` RLS (Task 2).
- Produces:
  - `GRID`, `snap(p)`, `newId(prefix, taken)`, `addNode(g, type, at): { graph; id }`, `setNode(g, node)`, `moveNode(g, id, at)`, `removeNode(g, id)`, `connect(g, from, outcome, to)`, `setActions(g, edgeId, actions)`, `issuesByNode(g, issues): Map<string, string[]>`
  - `type CardData = { node: WfNode; issues: string[]; open: number; current: boolean; readOnly: boolean }`, `type CardNode = Node<CardData, 'card'>`, `toFlow(g, opts?): { nodes: CardNode[]; edges: Edge[] }`
  - `NodeCard`, `SidePanel`, `WorkflowEditor({ id })`, `AccessPage({ id })`

- [ ] **Step 1: Add the canvas package**

Run: `pnpm add @xyflow/react@^12`
Expected: `package.json` dependencies gain `"@xyflow/react": "^12.x.x"`; `pnpm-lock.yaml` updated.

- [ ] **Step 2: Write the failing test** — `src/workflows/canvas/canvasOps.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addNode, connect, issuesByNode, removeNode, setActions, snap, toFlow } from './canvasOps.ts'
import { LEAVE, leave } from '../../../supabase/functions/_shared/workflow/fixture.ts'

test('new steps get unique ids and snap to the 16px grid', () => {
  const a = addNode(LEAVE, 'form', { x: 101, y: 7 })
  const b = addNode(a.graph, 'form', { x: 0, y: 0 })
  assert.deepEqual([a.id, b.id], ['form1', 'form2'])
  assert.deepEqual(a.graph.nodes.at(-1)?.position, { x: 96, y: 0 })
  assert.equal(addNode(LEAVE, 'condition', { x: 0, y: 0 }).id, 'if1')
  assert.deepEqual(snap({ x: 8, y: -9 }), { x: 16, y: -16 })
  assert.equal(LEAVE.nodes.length, 6) // never mutates
})
test('one connection per outcome: reconnecting replaces it and keeps its actions; empty disconnects', () => {
  const g = connect(LEAVE, 'approve', 'rejected', 'done')
  const e3 = g.edges.find((e) => e.id === 'e3')
  assert.deepEqual([e3?.to, e3?.actions.length, g.edges.length], ['done', 1, 6])
  assert.equal(connect(LEAVE, 'approve', 'rejected', '').edges.some((e) => e.id === 'e3'), false)
  const added = connect(removeNode(leave(), 'rejected'), 'approve', 'rejected', 'done')
  assert.equal(added.edges.at(-1)?.id, 'e3') // removing "rejected" freed e3; newId takes the first free e<n>
})
test('removing a step drops every connection into or out of it', () => {
  const g = removeNode(LEAVE, 'long')
  assert.deepEqual(g.edges.map((e) => e.id), ['e1', 'e3', 'e6'])
  assert.deepEqual(setActions(g, 'e6', []).edges.find((e) => e.id === 'e6')?.actions, [])
})
test('issues on connections are pinned to the step they leave', () => {
  const pinned = issuesByNode(LEAVE, [{ message: 'a', nodeId: 'long' }, { message: 'b', edgeId: 'e3' }, { message: 'c' }])
  assert.deepEqual([...pinned], [['long', ['a']], ['approve', ['b']]])
})
test('toFlow: one source handle per outcome, labelled edges, selection and the current step', () => {
  const { nodes, edges } = toFlow(LEAVE, { selected: 'long', current: 'approve', open: new Map([['approve', 2]]) })
  assert.deepEqual(nodes.filter((n) => n.selected).map((n) => n.id), ['long'])
  assert.deepEqual(nodes.find((n) => n.id === 'approve')?.data.open, 2)
  assert.equal(nodes.find((n) => n.data.current)?.id, 'approve')
  assert.deepEqual(edges.find((e) => e.id === 'e3'), { id: 'e3', source: 'approve', sourceHandle: 'rejected', target: 'rejected', label: 'Rejected · 1 action' })
  assert.equal(edges.find((e) => e.id === 'e4')?.label, 'Yes')
})
```

- [ ] **Step 3: Run — expect FAIL**

Run: `pnpm test`
Expected: `Cannot find module '…/canvas/canvasOps.ts'`.

- [ ] **Step 4: Implement** — `src/workflows/canvas/canvasOps.ts`

```ts
import type { Edge as FlowEdge, Node as FlowNode } from '@xyflow/react'
import { OUTCOME_LABELS, TYPE_LABELS, nodeName, type Action, type Graph, type Issue, type NodeType, type Outcome, type WfNode } from '../logic.ts'

export const GRID = 16
export const snap = (p: { x: number; y: number }) => ({ x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID })

export function newId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  let i = 1
  while (used.has(`${prefix}${i}`)) i++
  return `${prefix}${i}`
}

type At = { x: number; y: number }
const DEFAULTS: Record<NodeType, (id: string, position: At) => WfNode> = {
  start: (id, position) => ({ id, type: 'start', formId: '', position }),
  form: (id, position) => ({ id, type: 'form', formId: '', assignee: { role: '' }, mode: 'fill', position }),
  condition: (id, position) => ({ id, type: 'condition', rule: { field: '', operator: 'is', value: '' }, position }),
  time: (id, position) => ({ id, type: 'time', after: { amount: 1, unit: 'days' }, position }),
  end: (id, position) => ({ id, type: 'end', status: 'done', position }),
}

export function addNode(g: Graph, type: NodeType, at: At): { graph: Graph; id: string } {
  const id = newId(type === 'condition' ? 'if' : type, g.nodes.map((n) => n.id))
  return { graph: { ...g, nodes: [...g.nodes, DEFAULTS[type](id, snap(at))] }, id }
}
export const setNode = (g: Graph, node: WfNode): Graph => ({ ...g, nodes: g.nodes.map((n) => (n.id === node.id ? node : n)) })
export const moveNode = (g: Graph, id: string, at: At): Graph => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, position: snap(at) } : n)) })
/** Drops the step and every connection into or out of it. */
export const removeNode = (g: Graph, id: string): Graph =>
  ({ nodes: g.nodes.filter((n) => n.id !== id), edges: g.edges.filter((e) => e.from !== id && e.to !== id) })

/** One connection per outcome: connecting again replaces it (keeping its actions); `to === ''` disconnects. */
export function connect(g: Graph, from: string, outcome: Outcome, to: string): Graph {
  const old = g.edges.find((e) => e.from === from && e.outcome === outcome)
  const rest = g.edges.filter((e) => e !== old)
  if (!to) return { ...g, edges: rest }
  const id = old?.id ?? newId('e', g.edges.map((e) => e.id))
  return { ...g, edges: [...rest, { id, from, outcome, to, actions: old?.actions ?? [] }] }
}
export const setActions = (g: Graph, edgeId: string, actions: Action[]): Graph =>
  ({ ...g, edges: g.edges.map((e) => (e.id === edgeId ? { ...e, actions } : e)) })

/** Issues pinned to cards: a connection's issue shows on the step it leaves. */
export function issuesByNode(g: Graph, issues: Issue[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const i of issues) {
    const id = i.nodeId ?? g.edges.find((e) => e.id === i.edgeId)?.from
    if (id) out.set(id, [...(out.get(id) ?? []), i.message])
  }
  return out
}

export type CardData = { node: WfNode; issues: string[]; open: number; current: boolean; readOnly: boolean }
export type CardNode = FlowNode<CardData, 'card'>
type FlowOpts = { issues?: Map<string, string[]>; open?: Map<string, number>; selected?: string | null; current?: string | null; readOnly?: boolean }

export function toFlow(g: Graph, opts: FlowOpts = {}): { nodes: CardNode[]; edges: FlowEdge[] } {
  return {
    nodes: g.nodes.map((n) => ({
      id: n.id,
      type: 'card' as const,
      position: n.position,
      selected: n.id === opts.selected,
      ariaLabel: `${TYPE_LABELS[n.type]} step: ${nodeName(n)}`,
      data: { node: n, issues: opts.issues?.get(n.id) ?? [], open: opts.open?.get(n.id) ?? 0, current: n.id === opts.current, readOnly: !!opts.readOnly },
    })),
    edges: g.edges.map((e) => ({
      id: e.id,
      source: e.from,
      sourceHandle: e.outcome,
      target: e.to,
      label: e.actions.length ? `${OUTCOME_LABELS[e.outcome]} · ${e.actions.length} ${e.actions.length === 1 ? 'action' : 'actions'}` : OUTCOME_LABELS[e.outcome],
    })),
  }
}
```

The `toFlow` test compares the whole edge object, so `toFlow` must not add other keys to edges.

- [ ] **Step 5: Run — expect PASS**

Run: `pnpm test`
Expected: `# pass 83` `# fail 0` (78 + 5).

- [ ] **Step 6: The card** — `src/workflows/canvas/NodeCard.tsx`

```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { OUTCOME_LABELS, TYPE_LABELS, nodeName, outcomesOf } from '../logic'
import type { CardNode } from './canvasOps'

/** One labelled source handle per outcome on the right, the input on the left (Start has none). */
export function NodeCard({ data, selected }: NodeProps<CardNode>) {
  const { node, issues, open, current, readOnly } = data
  const outs = outcomesOf(node)
  return (
    <div className="rnr-block wf-card" data-selected={selected ? 'true' : undefined} data-current={current ? 'true' : undefined}>
      {node.type !== 'start' && <Handle type="target" position={Position.Left} isConnectable={!readOnly} />}
      <span className="rnr-caption">{TYPE_LABELS[node.type]}{current ? ' · Current step' : ''}</span>
      <span className="label">{nodeName(node)}</span>
      {open > 0 && <span className="rnr-caption">{open} open {open === 1 ? 'record' : 'records'}</span>}
      {issues.length > 0 && <span className="rnr-error">{issues.length === 1 ? '1 issue' : `${issues.length} issues`}</span>}
      {outs.length > 0 && (
        <ul className="wf-outs">
          {outs.map((o) => (
            <li key={o} className="wf-out">
              <span className="rnr-caption">{OUTCOME_LABELS[o]}</span>
              <Handle id={o} type="source" position={Position.Right} isConnectable={!readOnly} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 7: The side panel** — `src/workflows/canvas/SidePanel.tsx`

```tsx
import { useId } from 'react'
import type { Field } from '../../forms/logic'
import { DraftInput } from '../../forms/builder/DraftInput'
import { RuleEditor } from '../../forms/builder/RuleEditor'
import {
  OUTCOME_LABELS, TYPE_LABELS, UNITS, nodeName, outcomesOf,
  type Action, type Duration, type Graph, type Unit, type WfNode,
} from '../logic'
import { connect, setActions, setNode } from './canvasOps'

export type FormOption = { id: string; name: string; schema: Field[] }
type Props = {
  graph: Graph; node: WfNode; open: number; forms: FormOption[]; roles: { id: string; name: string }[]; members: Map<string, string>
  onChange(g: Graph): void; onDelete(): void
}
const ACTION_LABELS: Record<string, string> = { set_status: 'Set status', send_message: 'Send message', generate_pdf: 'Generate PDF' }

function Select({ label, value, options, onChange, hint }: { label: string; value: string; options: [string, string][]; onChange(v: string): void; hint?: string }) {
  const id = useId()
  return (
    <div className="rnr-field">
      <label className="rnr-label" htmlFor={id}>{label}</label>
      <select id={id} className="rnr-input" value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}-hint` : undefined}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {hint && <p id={`${id}-hint`} className="rnr-hint">{hint}</p>}
    </div>
  )
}

function DurationInput({ label, value, optional, onChange }: { label: string; value?: Duration; optional?: boolean; onChange(d?: Duration): void }) {
  return (
    <fieldset className="rnr-field">
      <legend className="rnr-label">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <DraftInput key={value?.amount ?? ''} label="Amount" inputMode="numeric" value={value ? String(value.amount) : ''}
          hint={optional ? 'Leave empty for no due time.' : undefined}
          onCommit={(t) => onChange(t.trim() === '' && optional ? undefined : { amount: Number.isInteger(Number(t)) ? Number(t) : 0, unit: value?.unit ?? 'days' })} />
        <Select label="Unit" value={value?.unit ?? 'days'} options={UNITS.map((u) => [u, u])} onChange={(u) => onChange({ amount: value?.amount ?? 1, unit: u as Unit })} />
      </div>
    </fieldset>
  )
}

function ActionList({ actions, onChange }: { actions: Action[]; onChange(a: Action[]): void }) {
  return (
    <div className="flex flex-col gap-2">
      {actions.map((a, i) => (
        <div key={i} className="rnr-block flex-col items-stretch gap-2">
          <div className="flex items-center gap-2">
            <span className="label flex-1">{ACTION_LABELS[a.type] ?? 'Unknown action'}</span>
            <button className="rnr-btn rnr-btn-ghost" type="button" onClick={() => onChange(actions.filter((_, j) => j !== i))}>Remove</button>
          </div>
          {a.type === 'set_status'
            ? <DraftInput key={a.label} label="Status text" value={a.label} onCommit={(t) => onChange(actions.map((x, j) => (j === i ? { type: 'set_status', label: t.trim() } : x)))} />
            : <p className="rnr-caption">{a.type === 'send_message' ? 'Queued for now. Messages start sending once Communication is set up.' : 'Queued for now. PDFs are made once Reports are set up.'}</p>}
        </div>
      ))}
      <Select label="Add an action" value="" onChange={(t) => t && onChange([...actions, t === 'set_status' ? { type: 'set_status', label: '' } : ({ type: t } as Action)])}
        options={[['', 'Choose an action…'], ['set_status', 'Set status'], ['send_message', 'Send message'], ['generate_pdf', 'Generate PDF']]} />
    </div>
  )
}

/** Answers a Condition or a date-relative Time step can read: every field of the forms this workflow uses. */
function usedFields(graph: Graph, forms: FormOption[]): Field[] {
  const ids = new Set(graph.nodes.flatMap((n) => (n.type === 'start' || n.type === 'form' ? [n.formId] : [])))
  const byKey = new Map<string, Field>()
  for (const f of forms) if (ids.has(f.id)) for (const fld of f.schema) if (fld.type !== 'page_break' && !byKey.has(fld.key)) byKey.set(fld.key, fld)
  return [...byKey.values()]
}

export function SidePanel({ graph, node, open, forms, roles, members, onChange, onDelete }: Props) {
  const update = (n: WfNode) => onChange(setNode(graph, n))
  const choose: [string, string] = ['', 'Choose…']
  const targets: [string, string][] = graph.nodes.filter((n) => n.type !== 'start').map((n) => [n.id, `${nodeName(n)} (${TYPE_LABELS[n.type]})`])
  const fields = usedFields(graph, forms)
  return (
    <div className="rnr-card gap-4" aria-labelledby="sp-h">
      <h2 id="sp-h" tabIndex={-1} className="rnr-card-title">{TYPE_LABELS[node.type]} step</h2>
      <DraftInput key={`${node.id}-label`} label="Step name" value={node.label ?? ''} onCommit={(t) => update({ ...node, label: t.trim() || undefined })} />

      {(node.type === 'start' || node.type === 'form') && (
        <Select label="Form" value={node.formId} options={[choose, ...forms.map((f): [string, string] => [f.id, f.name])]} onChange={(formId) => update({ ...node, formId })} />
      )}
      {node.type === 'form' && (
        <>
          <Select label="What they do" value={node.mode} options={[['fill', 'Fill in the form'], ['approve', 'Approve or reject']]}
            onChange={(m) => update({ ...node, mode: m as 'fill' | 'approve' })} />
          <Select label="Who completes it" value={'role' in node.assignee ? 'role' : 'user' in node.assignee ? 'user' : 'step'}
            options={[['role', 'Anyone with a role'], ['user', 'A person'], ['step', 'Whoever submitted an earlier step']]}
            onChange={(k) => update({ ...node, assignee: k === 'role' ? { role: '' } : k === 'user' ? { user: '' } : { step: '' } })} />
          {'role' in node.assignee && <Select label="Role" value={node.assignee.role} options={[choose, ...roles.map((r): [string, string] => [r.id, r.name])]}
            onChange={(role) => update({ ...node, assignee: { role } })} hint="Someone with this role claims the task, then completes it." />}
          {'user' in node.assignee && <Select label="Person" value={node.assignee.user} options={[choose, ...[...members].map(([id, email]): [string, string] => [id, email])]}
            onChange={(user) => update({ ...node, assignee: { user } })} />}
          {'step' in node.assignee && <Select label="Earlier step" value={node.assignee.step}
            options={[choose, ...graph.nodes.filter((n) => (n.type === 'start' || n.type === 'form') && n.id !== node.id).map((n): [string, string] => [n.id, nodeName(n)])]}
            onChange={(step) => update({ ...node, assignee: { step } })} />}
          <DurationInput label="Due" optional value={node.due} onChange={(due) => update({ ...node, due })} />
        </>
      )}
      {node.type === 'condition' && (
        <RuleEditor rule={node.rule.field ? node.rule : undefined} scope={fields} self=""
          onChange={(rule) => update({ ...node, rule: rule ?? { field: '', operator: 'is', value: '' } })} />
      )}
      {node.type === 'time' && (
        <>
          <Select label="Continue" value={node.relative ? 'relative' : 'after'} options={[['after', 'After a wait'], ['relative', 'Before or after a date answer']]}
            onChange={(m) => update(m === 'after'
              ? { ...node, after: { amount: 1, unit: 'days' }, relative: undefined }
              : { ...node, after: undefined, relative: { field: '', amount: 1, unit: 'days', direction: 'before' } })} />
          {node.after && <DurationInput label="Wait" value={node.after} onChange={(after) => update({ ...node, after: after ?? { amount: 1, unit: 'days' } })} />}
          {node.relative && (
            <>
              <Select label="Date answer" value={node.relative.field}
                options={[choose, ...fields.filter((f) => f.type === 'date').map((f): [string, string] => [f.key, f.label])]}
                onChange={(field) => update({ ...node, relative: { ...node.relative!, field } })} />
              <DurationInput label="How long" value={{ amount: node.relative.amount, unit: node.relative.unit }}
                onChange={(d) => update({ ...node, relative: { ...node.relative!, amount: d?.amount ?? 0, unit: d?.unit ?? 'days' } })} />
              <Select label="When" value={node.relative.direction} options={[['before', 'Before the date'], ['after', 'After the date']]}
                onChange={(direction) => update({ ...node, relative: { ...node.relative!, direction: direction as 'before' | 'after' } })} />
            </>
          )}
        </>
      )}
      {node.type === 'end' && (
        <Select label="Close the record as" value={node.status} options={[['done', 'Done'], ['rejected', 'Rejected']]}
          onChange={(s) => update({ ...node, status: s as 'done' | 'rejected' })} />
      )}

      {outcomesOf(node).map((o) => {
        const edge = graph.edges.find((e) => e.from === node.id && e.outcome === o)
        return (
          <fieldset key={o} className="rnr-field gap-2">
            <legend className="rnr-label">When {OUTCOME_LABELS[o].toLowerCase()}</legend>
            {/* The keyboard way to connect: same result as dragging from the card's handle. */}
            <Select label="Goes to" value={edge?.to ?? ''} options={[['', 'Not connected'], ...targets]} onChange={(to) => onChange(connect(graph, node.id, o, to))} />
            {edge && <ActionList actions={edge.actions} onChange={(acts) => onChange(setActions(graph, edge.id, acts))} />}
          </fieldset>
        )
      })}

      {open > 0
        ? <p className="rnr-muted">{open} open {open === 1 ? 'record is' : 'records are'} on this step, so it cannot be deleted.</p>
        : <div><button className="rnr-btn rnr-btn-ghost" type="button" onClick={onDelete}>Delete step</button></div>}
    </div>
  )
}
```

- [ ] **Step 8: The editor** — `src/workflows/canvas/WorkflowEditor.tsx`

```tsx
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Background, ReactFlow, ReactFlowProvider, useReactFlow, type Connection, type NodeChange } from '@xyflow/react'
import { supabase } from '../../data/supabase'
import { useForms } from '../../forms/api'
import { DraftInput } from '../../forms/builder/DraftInput'
import { useMemberEmails } from '../../members/useMemberEmails'
import { useOrg } from '../../rbac/useOrg'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { CheckIcon } from '../../ui/icons'
import { setNavGuard, type Next } from '../../ui/navGuard'
import { useAction } from '../../ui/useAction'
import { useFocusAfterRender } from '../../ui/useFocusAfterRender'
import { NODE_TYPES, TYPE_LABELS, checkGraph, nodeName, type NodeType, type Outcome } from '../logic'
import { saveWorkflow, useOpenCounts, type LoadedWorkflow } from '../api'
import { WorkflowGate } from '../WorkflowGate'
import { addNode, connect, issuesByNode, moveNode, removeNode, toFlow, type CardNode } from './canvasOps'
import { NodeCard } from './NodeCard'
import { SidePanel } from './SidePanel'

const CARD_TYPES = { card: NodeCard }
const DRAG_TYPE = 'application/x-rnr-step'
const HINTS: Record<NodeType, string> = {
  start: 'The form that starts a record', form: 'Someone fills in or approves a form', condition: 'Branch on an answer',
  time: 'Wait, then continue', end: 'Close the record',
}
type Role = { id: string; name: string; is_owner: boolean }

function Editor({ wf, onReload }: { wf: LoadedWorkflow; onReload(): void }) {
  const { orgId, can } = useOrg()
  const qc = useQueryClient()
  const flow = useReactFlow()
  const board = useRef<HTMLDivElement>(null)
  const focusLater = useFocusAfterRender()
  const save = useAction()
  const [graph, setGraph] = useState(wf.graph)
  const [name, setName] = useState(wf.name)
  const [saved, setSaved] = useState({ graph: wf.graph, name: wf.name, version: wf.updated_at, status: wf.status })
  const [sel, setSel] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [conflict, setConflict] = useState(false)
  const [leaveTo, setLeaveTo] = useState<Next | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const forms = useForms(orgId)
  const roles = useQuery({ queryKey: ['roles', orgId], queryFn: async () => {
    const { data, error } = await supabase.from('roles').select('id, name, is_owner').eq('org_id', orgId!).order('name')
    if (error) throw error
    return data as Role[]
  } })
  const members = useMemberEmails(orgId)
  const counts = useOpenCounts(wf.id)
  const refs = useMemo(() => (forms.data && roles.data && members.data
    ? { forms: new Set(forms.data.map((f) => f.id)), roles: new Set(roles.data.map((r) => r.id)), users: new Set(members.data.keys()) }
    : null), [forms.data, roles.data, members.data])
  const issues = useMemo(() => (refs ? checkGraph(graph, refs) : []), [graph, refs])
  const pinned = useMemo(() => issuesByNode(graph, issues), [graph, issues])
  const view = useMemo(() => toFlow(graph, { issues: pinned, open: counts.data, selected: sel }), [graph, pinned, counts.data, sel])
  const selected = graph.nodes.find((n) => n.id === sel)
  const dirty = graph !== saved.graph || name !== saved.name
  const publishable = saved.status === 'draft' && can('workflows.publish')

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    addEventListener('beforeunload', warn)
    setNavGuard((next) => { if (next === `#/workflows/${wf.id}/edit`) return false; setLeaveTo(() => next); return true })
    return () => { removeEventListener('beforeunload', warn); setNavGuard(null) }
  }, [dirty, wf.id])

  const onNodesChange = (changes: NodeChange<CardNode>[]) => {
    for (const c of changes) {
      if (c.type === 'position' && c.position) { const at = c.position; setGraph((g) => moveNode(g, c.id, at)) }
      if (c.type === 'select') setSel((s) => (c.selected ? c.id : s === c.id ? null : s))
    }
  }
  const onConnect = (c: Connection) => { if (c.sourceHandle) setGraph((g) => connect(g, c.source, c.sourceHandle as Outcome, c.target)) }
  const add = (type: NodeType, screen?: { x: number; y: number }) => {
    const r = board.current!.getBoundingClientRect()
    const { graph: g, id } = addNode(graph, type, flow.screenToFlowPosition(screen ?? { x: r.left + r.width / 2, y: r.top + r.height / 2 }))
    setGraph(g)
    setSel(id)
    focusLater('sp-h') // keyboard users continue in the panel
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    const t = e.dataTransfer.getData(DRAG_TYPE)
    if ((NODE_TYPES as readonly string[]).includes(t)) add(t as NodeType, { x: e.clientX, y: e.clientY })
  }
  const show = (id: string) => {
    setSel(id)
    flow.fitView({ nodes: [{ id }], maxZoom: 1, duration: 0 })
    focusLater(() => board.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`))
  }
  const submit = (publish: boolean) => save.run(async () => {
    setMessage(null)
    setConflict(false)
    if (publish && issues.length) {
      setMessage({ text: `Fix the ${issues.length === 1 ? 'issue' : `${issues.length} issues`} listed below before publishing.`, error: true })
      focusLater('wf-issues')
      return false
    }
    const res = await saveWorkflow({ workflowId: wf.id, name: name.trim(), graph, updatedAt: saved.version, publish })
    if (!res.ok) {
      setMessage({ text: res.error, error: true })
      setConflict(!!res.conflict)
      if (res.nodeId) show(res.nodeId)
      return false
    }
    setSaved({ graph, name: name.trim(), version: res.updatedAt, status: res.status })
    qc.setQueryData(['workflow', wf.id], { ...wf, name: name.trim(), graph, status: res.status, updated_at: res.updatedAt })
    await qc.invalidateQueries({ queryKey: ['workflows', orgId] })
    setMessage({ text: publish ? 'Workflow published. People with access can start it from their Inbox.' : 'Workflow saved.', error: false })
  }, true)

  const label = save.busy ? 'Saving…' : save.saved ? 'Saved' : publishable ? 'Publish workflow' : saved.status === 'published' ? 'Save changes' : 'Save draft'
  return (
    <section className="flex flex-col gap-4" aria-labelledby="wf-edit-h">
      <h1 id="wf-edit-h" tabIndex={-1} className="page-title">Edit workflow</h1>
      <div className="rnr-card gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1"><DraftInput key={name} label="Workflow name" value={name} onCommit={(t) => setName(t)} /></div>
          <span className="rnr-status">{saved.status === 'published' ? 'Published' : 'Draft'}</span>
          <a className="rnr-btn rnr-btn-ghost" href={`#/workflows/${wf.id}/access`}>Access</a>
          {publishable && <button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => submit(false)}>Save draft</button>}
          <button className="rnr-btn rnr-btn-primary" type="button" aria-busy={save.busy} onClick={() => submit(publishable)}>
            {save.busy && <span className="rnr-spin" aria-hidden="true" />}{save.saved && !save.busy && <CheckIcon />}{label}
          </button>
        </div>
        {message?.error && <p className="rnr-error" role="alert">{message.text}</p>}
        <p className="rnr-status" role="status">{message && !message.error && <><CheckIcon size={14} />{message.text}</>}</p>
        {conflict && <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={onReload}>Reload workflow</button></div>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[176px_minmax(0,1fr)_320px]">
        <div className="rnr-card gap-2" role="group" aria-labelledby="wf-pal-h">
          <h2 id="wf-pal-h" className="rnr-card-title">Add a step</h2>
          {NODE_TYPES.map((t) => (
            <button key={t} type="button" className="rnr-block rnr-pick flex-col items-start" draggable
              onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, t); e.dataTransfer.effectAllowed = 'move' }} onClick={() => add(t)}>
              <span className="label">{TYPE_LABELS[t]}</span><span className="rnr-caption">{HINTS[t]}</span>
            </button>
          ))}
        </div>
        <div ref={board} className="rnr-canvas min-h-[480px]" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <ReactFlow nodes={view.nodes} edges={view.edges} nodeTypes={CARD_TYPES} onNodesChange={onNodesChange} onConnect={onConnect}
            onPaneClick={() => setSel(null)} snapToGrid snapGrid={[16, 16]} deleteKeyCode={null} fitView>
            <Background gap={16} />
          </ReactFlow>
        </div>
        <div className="flex flex-col gap-4 min-w-0">
          {selected
            ? <SidePanel key={selected.id} graph={graph} node={selected} open={counts.data?.get(selected.id) ?? 0} forms={forms.data ?? []}
                roles={roles.data ?? []} members={members.data ?? new Map()} onChange={setGraph} onDelete={() => setDeleting(selected.id)} />
            : <div className="rnr-card"><p className="rnr-muted">Select a step to set it up, or add one from the list.</p></div>}
          <div id="wf-issues" tabIndex={-1} className="rnr-card gap-2">
            <h2 className="rnr-card-title">{issues.length ? `${issues.length} ${issues.length === 1 ? 'issue' : 'issues'} to fix before publishing` : 'Ready to publish'}</h2>
            {issues.length > 0 && (
              <ul className="flex flex-col gap-2">
                {issues.map((i, n) => {
                  const at = i.nodeId ?? graph.edges.find((e) => e.id === i.edgeId)?.from
                  return (
                    <li key={n} className="flex items-start gap-2">
                      <span className="flex-1">{i.message}</span>
                      {at && graph.nodes.some((x) => x.id === at) && <button className="rnr-btn rnr-btn-ghost" type="button" onClick={() => show(at)}>Show</button>}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog open={!!deleting} title={`Delete ${nodeName(graph.nodes.find((n) => n.id === deleting))}?`}
        body="Its connections are removed too. Save the workflow to apply the change."
        confirmLabel="Delete step" busyLabel="Deleting…" busy={false} error={null}
        onConfirm={() => { setGraph(removeNode(graph, deleting!)); setSel(null); setDeleting(null); focusLater('wf-edit-h') }}
        onClose={() => setDeleting(null)} />
      <ConfirmDialog open={!!leaveTo} title="Leave without saving?" body={`Your changes to ${name.trim() || 'this workflow'} will be lost.`}
        confirmLabel="Leave without saving" busyLabel="Leaving…" busy={false} error={null}
        onConfirm={() => { const to = leaveTo; setNavGuard(null); setLeaveTo(null); if (typeof to === 'function') to(); else if (to) location.hash = to }}
        onClose={() => setLeaveTo(null)} />
    </section>
  )
}

export function WorkflowEditor({ id }: { id: string }) {
  const qc = useQueryClient()
  const [round, setRound] = useState(0)
  const reload = async () => {
    setNavGuard(null)
    await Promise.all([qc.refetchQueries({ queryKey: ['workflow', id] }), qc.invalidateQueries({ queryKey: ['open-counts', id] })])
    setRound((r) => r + 1)
  }
  return (
    <WorkflowGate id={id}>
      {(wf) => <ReactFlowProvider><Editor key={round} wf={wf} onReload={reload} /></ReactFlowProvider>}
    </WorkflowGate>
  )
}
```

- [ ] **Step 9: The Access tab** — `src/workflows/AccessPage.tsx`

```tsx
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../data/supabase'
import { useOrg } from '../rbac/useOrg'
import { friendlyError } from '../ui/errors'
import { CheckIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { useAction } from '../ui/useAction'
import { useNotice } from '../ui/useNotice'
import type { LoadedWorkflow } from './api'
import { WorkflowGate } from './WorkflowGate'

type Role = { id: string; name: string; is_owner: boolean }
type Grant = { role_id: string; can_start: boolean; can_view_all: boolean }
type Key = 'can_start' | 'can_view_all'

function Access({ wf }: { wf: LoadedWorkflow }) {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  const write = useAction()
  const [notice, setNotice] = useNotice()
  const [error, setError] = useState<string | null>(null)
  const roles = useQuery({ queryKey: ['roles', orgId], queryFn: async () => {
    const { data, error } = await supabase.from('roles').select('id, name, is_owner').eq('org_id', orgId!).order('name')
    if (error) throw error
    return data as Role[]
  } })
  const grants = useQuery({ queryKey: ['workflow-access', wf.id], queryFn: async () => {
    const { data, error } = await supabase.from('workflow_access').select('role_id, can_start, can_view_all').eq('workflow_id', wf.id)
    if (error) throw error
    return new Map((data as Grant[]).map((g) => [g.role_id, g]))
  } })

  const toggle = (role: Role, key: Key, value: boolean) => write.run(async () => {
    setError(null)
    const cur = grants.data?.get(role.id) ?? { role_id: role.id, can_start: false, can_view_all: false }
    const row = { workflow_id: wf.id, org_id: wf.org_id, role_id: role.id, can_start: cur.can_start, can_view_all: cur.can_view_all, [key]: value }
    const { data, error } = await supabase.from('workflow_access').upsert(row, { onConflict: 'workflow_id,role_id' }).select('role_id')
    if (error) return setError(friendlyError(error))
    if (!data.length) return setError('You do not have permission to do that.')
    await qc.invalidateQueries({ queryKey: ['workflow-access', wf.id] })
    setNotice(`Access for ${role.name} saved.`)
  })
  const box = (role: Role, key: Key, label: string) => (
    <label className="rnr-check">
      <input type="checkbox" checked={!!grants.data?.get(role.id)?.[key]} onChange={(e) => toggle(role, key, e.target.checked)} />
      <span className="sr-only">{label} for {role.name}</span>
    </label>
  )

  return (
    <section className="flex flex-col gap-4" aria-labelledby="acc-h">
      <div>
        <h1 id="acc-h" tabIndex={-1} className="page-title">Workflow access</h1>
        <p className="rnr-muted">{wf.name}</p>
      </div>
      <p className="rnr-caption">A role also needs Start records or View all records on the Roles page before these take effect. Everyone always sees the records they started, submitted to or have a task on.</p>
      {error && <p className="rnr-error" role="alert">{error}</p>}
      <p className="rnr-status" role="status">{notice && <><CheckIcon size={14} />{notice}</>}</p>
      {(roles.isPending || grants.isPending) && <Skeleton rows={[{ w: '100%', h: 160 }]} />}
      {(roles.isError || grants.isError) && (
        <div className="rnr-card gap-3">
          <p role="alert">We could not load access for this workflow. Check your connection and try again.</p>
          <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => { roles.refetch(); grants.refetch() }}>Try again</button></div>
        </div>
      )}
      {roles.data && grants.data && (
        <div className="rnr-card p-0 overflow-x-auto">
          <table className="rnr-table">
            <thead><tr><th>Role</th><th>Can start</th><th>Can view all records</th></tr></thead>
            <tbody>
              {roles.data.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  {r.is_owner
                    ? <><td>Always</td><td>Always</td></>
                    : <><td>{box(r, 'can_start', 'Can start')}</td><td>{box(r, 'can_view_all', 'Can view all records')}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function AccessPage({ id }: { id: string }) {
  return <WorkflowGate id={id}>{(wf) => <Access wf={wf} />}</WorkflowGate>
}
```

- [ ] **Step 10: Styles and routes**

`src/index.css` — append (values are placeholders the design spec §3 confirms or replaces; tokens only):
```css
/* Phase 3: workflow canvas (xyflow restyled with tokens) */
.rnr-canvas .react-flow__pane { cursor: default; }
.wf-card { min-width: 176px; flex-direction: column; align-items: stretch; gap: var(--space-1); padding: var(--space-3); }
.wf-card[data-current="true"] { border-color: var(--ink); box-shadow: 0 0 0 2px var(--ink); }
.wf-outs { display: flex; flex-direction: column; gap: var(--space-1); margin-top: var(--space-2); }
.wf-out { position: relative; text-align: right; padding-right: var(--space-3); }
.rnr-canvas .react-flow__handle { width: 10px; height: 10px; background: var(--surface-100); border: 2px solid var(--ink-label); }
.rnr-canvas .react-flow__edge-path { stroke: var(--ink-muted); }
.rnr-canvas .react-flow__edge-text { fill: var(--ink-label); font-size: 12px; }
.rnr-canvas .react-flow__edge-textbg { fill: var(--surface-100); }
.rnr-canvas .react-flow__node:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; border-radius: var(--radius-xl); }
```

`src/App.tsx` — import `WorkflowEditor` and `AccessPage`; in `Page`:
```tsx
    case 'workflow-edit': return <WorkflowEditor id={route.id} />
    case 'workflow-access': return <AccessPage id={route.id} />
```

- [ ] **Step 11: Typecheck, lint and browser check** (Browser pane; fresh tab)

Run: `pnpm build && pnpm lint && pnpm test`
Expected: no errors, no warnings, `# pass 83`.

1. `admin@alpha.test` → Workflows → New workflow → canvas shows "Add a Start step." in the issues card. Add Start, Form, Condition, End from the palette by click; drag a Time card onto the board.
2. Keyboard only: Tab to the Form card, Enter to select it, arrow keys move it in 16px steps (announced); in the panel choose Form "Manager approval", "Approve or reject", Role "Admin"; under "When approved" pick the Condition in "Goes to" → an edge labelled "Approved" appears. Connect the rest; issues drop to "Ready to publish".
3. Add a "Set status" action with empty text → the issue "Enter the status text…" is pinned on the card leaving it; "Show" centres and focuses the card.
4. Publish workflow → "Workflow published."; the list shows Published. Edit the Leave approval workflow in a second tab and save → the first tab's save says "changed by someone else" with Reload workflow.
5. With a record waiting on `approve` (Task 4 Step 9), open Leave approval: the card shows "1 open record", the panel says it cannot be deleted and offers no Delete.
6. Unsaved change → click Forms in the nav → "Leave without saving?"; Cancel keeps the work; Sign out with unsaved work asks the same.
7. Access tab: untick Member "Can start" → "Access for Member saved."; `member@alpha.test` no longer sees Leave approval under Start new (Task 9). The Owner row says Always.
8. 375px: palette, board and panel stack; the board scrolls inside its card; no page-level horizontal scroll. Reset the viewport.

- [ ] **Step 12: Commit**

```bash
git add package.json pnpm-lock.yaml src/workflows/canvas/canvasOps.ts src/workflows/canvas/canvasOps.test.ts src/workflows/canvas/NodeCard.tsx \
  src/workflows/canvas/SidePanel.tsx src/workflows/canvas/WorkflowEditor.tsx src/workflows/AccessPage.tsx src/index.css src/App.tsx
git commit -m "feat: add workflow canvas editor with publish check and access tab"
```

---

### Task 9: Frontend — Inbox, start and task view

**Owner:** Frontend engineer · **Depends on:** Tasks 4, 7

**Files:**
- Create: `src/inbox/InboxPage.tsx`, `src/inbox/StartPage.tsx`, `src/inbox/TaskPage.tsx`, `src/forms/submissions/AnswerList.tsx`
- Modify: `src/forms/fill/FormRunner.tsx`, `src/forms/submissions/SubmissionsPage.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `useMyTasks`, `useStartable`, `useTask`, `useRecordSubmissions`, `advance`, `claimTask`, `WorkflowGate` (Task 7); `useForm`, `FormRunner`, `uploadFile`, `hiddenKeys`, `formatDay` (Phase 2); `useMemberEmails` (Task 7); `nodeById`, `nodeName`, `OUTCOME_LABELS` (Task 1).
- Produces:
  - `FormRunner` props gain `outcomes?: { value: string; label: string; busyLabel: string }[]` and `onSubmit?(answers: Answers, outcome?: string): Promise<SubmitResult>`; with `outcomes`, the last page shows one button per outcome and Enter never submits (no accidental approval).
  - `AnswerList({ fields, answers, createdAt, by })` — the Phase 2 answer renderer, extracted unchanged.
  - `InboxPage()`, `StartPage({ id })`, `TaskPage({ id })`.

- [ ] **Step 1: Extract the answer renderer** — `src/forms/submissions/AnswerList.tsx`

Move `FileLink`, `Pair`, `GRID` and `Value` from `SubmissionsPage.tsx` into this file unchanged (with their imports: `useQuery`, `supabase`, `fileName`, `FILE_BUCKET`, `formatDay`, `hiddenKeys`, `Answers`, `Field`, `ReactNode`), and add:
```tsx
/** Answers as submitted; fields hidden by show_if at submit time are left out rather than shown as "Not answered". */
export function AnswerList({ fields, answers, createdAt, by }: { fields: Field[]; answers: Answers; createdAt: string; by: string }) {
  const hidden = hiddenKeys(fields, answers, createdAt)
  return (
    <dl className={GRID}>
      {fields.filter((f) => f.type !== 'page_break' && !hidden.has(f.key)).map((f) => (
        <Pair key={f.key} label={f.label}><Value field={f} value={answers[f.key]} by={by} /></Pair>
      ))}
    </dl>
  )
}
```
In `SubmissionsPage.tsx`, `Row` becomes:
```tsx
function Row({ sub, fields, by }: { sub: Sub; fields: Field[]; by: string }) {
  const [open, setOpen] = useState(false) // file links are signed only for rows that are open
  return (
    <li className="rnr-card">
      <details onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="rnr-focus" style={{ cursor: 'pointer' }}><span className="label">{by}</span> <span className="rnr-muted">· {when(sub.created_at)}</span></summary>
        {open && <div className="pt-3"><AnswerList fields={fields} answers={sub.answers} createdAt={sub.created_at} by={by} /></div>}
      </details>
    </li>
  )
}
```

- [ ] **Step 2: Outcome buttons in the runner** — `src/forms/fill/FormRunner.tsx`

Change the props and the finish path:
```tsx
type Outcome = { value: string; label: string; busyLabel: string }
type Props = {
  fields: Field[]; idPrefix: string; filePrefix?: string; upload?: Uploader; outcomes?: Outcome[]
  onSubmit?(answers: Answers, outcome?: string): Promise<SubmitResult>; onDone?(id: string): void
}
```
```tsx
  const [pressed, setPressed] = useState<string | null>(null)
  const finish = (outcome?: string) => submit.run(async () => {
    setFormError(null); setChecked(false); setPressed(outcome ?? null)
    const r = validateAnswers(fields, answers, { filePrefix })
    if (!r.ok) return showErrors(r.errors)
    setErrors({})
    if (!onSubmit) { setChecked(true); return }
    const res = await onSubmit(answers, outcome)
    if (res.ok) { onDone?.(res.id); return }
    if (res.fieldErrors) showErrors(res.fieldErrors)
    else setFormError(res.error)
  })
```
The form's submit handler — with outcomes, Enter on the last page does nothing:
```tsx
    <form noValidate className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (!last) next(); else if (!outcomes) finish() }}>
```
The button row — on the last page with outcomes, one button per outcome (the first is the primary):
```tsx
      <div className="flex flex-col gap-2 sm:flex-row">
        {current > 0 && <button type="button" className="rnr-btn rnr-btn-secondary w-full sm:w-auto" onClick={back}>Back</button>}
        {last && onSubmit && outcomes
          ? outcomes.map((o, i) => (
            <button key={o.value} type="button" className={`rnr-btn w-full sm:w-auto ${i === 0 ? 'rnr-btn-primary' : 'rnr-btn-secondary'}`}
              aria-busy={submit.busy && pressed === o.value} onClick={() => finish(o.value)}>
              {submit.busy && pressed === o.value && <span className="rnr-spin" aria-hidden="true" />}
              {submit.busy && pressed === o.value ? o.busyLabel : o.label}
            </button>
          ))
          : (
            <button type="submit" className={`rnr-btn w-full sm:w-auto ${onSubmit ? 'rnr-btn-primary' : 'rnr-btn-secondary'}`} aria-busy={submit.busy}>
              {submit.busy && <span className="rnr-spin" aria-hidden="true" />}
              {!last ? 'Next page' : !onSubmit ? 'Check answers' : submit.busy ? 'Submitting…' : 'Submit form'}
            </button>
          )}
      </div>
```

- [ ] **Step 3: Inbox** — `src/inbox/InboxPage.tsx`

```tsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { friendlyError } from '../ui/errors'
import { CheckIcon, ClockIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { useAction } from '../ui/useAction'
import { useFocusAfterRender } from '../ui/useFocusAfterRender'
import { useNotice } from '../ui/useNotice'
import { nodeById, nodeName } from '../workflows/logic'
import { claimTask, useMyTasks, useStartable, type MyTask } from '../workflows/api'

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

export function InboxPage() {
  const { orgId, userId } = useOrg()
  const qc = useQueryClient()
  const tasks = useMyTasks(orgId)
  const startable = useStartable(orgId)
  const claim = useAction()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useNotice()
  const focusLater = useFocusAfterRender()
  const now = Date.now()

  const take = (t: MyTask) => claim.run(async () => {
    setError(null)
    try {
      await claimTask(t.id)
    } catch (e) {
      setError(friendlyError(e as { message?: string; code?: string }))
      await qc.invalidateQueries({ queryKey: ['my-tasks', orgId] })
      focusLater('inbox-h') // the row may be gone (someone else claimed it)
      return
    }
    setNotice(`You claimed ${t.record.title}.`)
    await qc.invalidateQueries({ queryKey: ['my-tasks', orgId] })
    focusLater(`open-${t.id}`) // its Claim button is now an Open link
  })

  return (
    <section className="flex flex-col gap-6" aria-labelledby="inbox-h">
      <h1 id="inbox-h" tabIndex={-1} className="page-title">Inbox</h1>
      <div className="flex flex-col gap-3" aria-labelledby="tasks-h">
        <h2 id="tasks-h" className="dialog-title">My tasks</h2>
        {error && <p className="rnr-error" role="alert">{error}</p>}
        <p className="rnr-status" role="status">{notice && <><CheckIcon size={14} />{notice}</>}</p>
        {tasks.isPending && <Skeleton rows={[{ w: '100%', h: 48 }, { w: '100%', h: 48 }]} />}
        {tasks.isError && (
          <div className="rnr-card gap-3">
            <p role="alert">We could not load your tasks. Check your connection and try again.</p>
            <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => tasks.refetch()}>Try again</button></div>
          </div>
        )}
        {tasks.data?.length === 0 && (
          <div className="rnr-card gap-2">
            <h3 className="rnr-card-title">Nothing to do</h3>
            <p className="rnr-muted">Steps that need you, or a role you hold, appear here.</p>
          </div>
        )}
        {!!tasks.data?.length && (
          <div className="rnr-card p-0 overflow-x-auto">
            <table className="rnr-table">
              <thead><tr><th>Record</th><th>Step</th><th className="num">Due</th><th><span className="sr-only">Action</span></th></tr></thead>
              <tbody>
                {tasks.data.map((t) => {
                  const mine = t.assignee_user_id === userId || t.claimed_by === userId
                  const overdue = !!t.due_at && Date.parse(t.due_at) < now
                  return (
                    <tr key={t.id}>
                      <td><span className="label">{t.record.title}</span><br /><span className="rnr-caption">{t.record.workflow.name}</span></td>
                      <td>{nodeName(nodeById(t.record.workflow.graph, t.node_id))}</td>
                      <td className="num rnr-num">
                        {t.due_at ? when(t.due_at) : <span className="rnr-muted">No due date</span>}
                        {overdue && <span className="rnr-status"><ClockIcon size={14} />Overdue</span>}
                      </td>
                      <td className="text-right">
                        {mine
                          ? <a id={`open-${t.id}`} className="rnr-btn rnr-btn-secondary" href={`#/tasks/${t.id}`}>Open</a>
                          : <button className="rnr-btn rnr-btn-secondary" type="button" aria-busy={claim.busy} onClick={() => take(t)}>Claim</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3" aria-labelledby="new-h">
        <h2 id="new-h" className="dialog-title">Start new</h2>
        {startable.isPending && <Skeleton rows={[{ w: '100%', h: 48 }]} />}
        {startable.isError && (
          <div className="rnr-card gap-3">
            <p role="alert">We could not load the workflows you can start. Check your connection and try again.</p>
            <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => startable.refetch()}>Try again</button></div>
          </div>
        )}
        {startable.data?.length === 0 && (
          <div className="rnr-card gap-2">
            <h3 className="rnr-card-title">No workflows to start</h3>
            <p className="rnr-muted">When an admin publishes a workflow you have access to, it appears here.</p>
          </div>
        )}
        {!!startable.data?.length && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {startable.data.map((w) => (
              <li key={w.id} className="rnr-card gap-2">
                <span className="label">{w.name}</span>
                <div><a className="rnr-btn rnr-btn-secondary" href={`#/start/${w.id}`}>Start</a></div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Start page** — `src/inbox/StartPage.tsx`

```tsx
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { CheckIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { useForm } from '../forms/api'
import { FormRunner } from '../forms/fill/FormRunner'
import { uploadFile } from '../forms/upload'
import { validateSchema } from '../forms/logic'
import { advance, type LoadedWorkflow } from '../workflows/api'
import { WorkflowGate } from '../workflows/WorkflowGate'
import type { StartNode } from '../workflows/logic'

const SETUP = 'This workflow has a setup problem. Ask a workflow manager to fix it.'

function StartForm({ wf, formId }: { wf: LoadedWorkflow; formId: string }) {
  const { orgId, userId } = useOrg()
  const qc = useQueryClient()
  const form = useForm(formId)
  const [recordId, setRecordId] = useState<string | null>(null)
  const success = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (recordId) success.current?.focus() }, [recordId]) // the pressed Submit button is unmounted

  if (form.isPending) return <Skeleton rows={[{ w: '100%', h: 320 }]} />
  if (form.isError) {
    return (
      <div className="rnr-card gap-3">
        <p role="alert">We could not load the form. Check your connection and try again.</p>
        <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => form.refetch()}>Try again</button></div>
      </div>
    )
  }
  if (!form.data || validateSchema(form.data.schema).length) return <div className="rnr-card"><p className="rnr-error" role="alert">{SETUP}</p></div>
  if (recordId) {
    return (
      <div className="rnr-card gap-3">
        <span className="rnr-pop" aria-hidden="true"><CheckIcon size={24} /></span>
        <h2 ref={success} tabIndex={-1} className="dialog-title">Record started</h2>
        <p className="rnr-muted">Your answers were saved and {wf.name} has moved to its next step.</p>
        <div className="flex flex-wrap gap-2">
          <a className="rnr-btn rnr-btn-primary" href={`#/records/${recordId}`}>View record</a>
          <a className="rnr-btn rnr-btn-ghost" href="#/inbox">Back to inbox</a>
        </div>
      </div>
    )
  }
  return (
    <div className="rnr-card gap-4">
      <FormRunner fields={form.data.schema} idPrefix="start" filePrefix={`${wf.org_id}/${userId}/`}
        upload={(blob, name) => uploadFile(wf.org_id, userId, blob, name)}
        onSubmit={(answers) => advance({ action: 'start', workflowId: wf.id, answers })}
        onDone={(id) => { setRecordId(id); qc.invalidateQueries({ queryKey: ['my-tasks', orgId] }) }} />
    </div>
  )
}

function Start({ wf }: { wf: LoadedWorkflow }) {
  const start = wf.graph.nodes.find((n): n is StartNode => n.type === 'start')
  return (
    <section className="flex flex-col gap-4 max-w-2xl" aria-labelledby="start-h">
      <h1 id="start-h" tabIndex={-1} className="page-title">{wf.name}</h1>
      {wf.status !== 'published' || !start
        ? <div className="rnr-card"><p className="rnr-error" role="alert">{wf.status !== 'published' ? 'This workflow is not published yet.' : SETUP}</p></div>
        : <StartForm wf={wf} formId={start.formId} />}
    </section>
  )
}

export function StartPage({ id }: { id: string }) {
  return <WorkflowGate id={id} back={{ href: '#/inbox', label: 'Back to inbox' }}>{(wf) => <Start wf={wf} />}</WorkflowGate>
}
```

- [ ] **Step 5: Task view** — `src/inbox/TaskPage.tsx`

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { friendlyError } from '../ui/errors'
import { BackIcon, CheckIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { useAction } from '../ui/useAction'
import { useForm } from '../forms/api'
import { FormRunner } from '../forms/fill/FormRunner'
import { uploadFile } from '../forms/upload'
import { validateSchema } from '../forms/logic'
import { AnswerList } from '../forms/submissions/AnswerList'
import { useMemberEmails } from '../members/useMemberEmails'
import { nodeById, nodeName, type FormNode } from '../workflows/logic'
import { advance, claimTask, useRecordSubmissions, useTask, type TaskDetail } from '../workflows/api'

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
const VERB = { submitted: 'submitted', approved: 'approved', rejected: 'rejected' } as const
const APPROVE = [{ value: 'approved', label: 'Approve', busyLabel: 'Approving…' }, { value: 'rejected', label: 'Reject', busyLabel: 'Rejecting…' }]

function Earlier({ task }: { task: TaskDetail }) {
  const { orgId, userId } = useOrg()
  const subs = useRecordSubmissions(task.record_id)
  const emails = useMemberEmails(orgId)
  const who = (id: string) => (id === userId ? 'You' : emails.data?.get(id) ?? 'Former member')
  if (subs.isPending) return <Skeleton rows={[{ w: '100%', h: 48 }]} />
  if (subs.isError) return <p role="alert">We could not load the earlier steps. Reload the page to try again.</p>
  if (!subs.data.length) return null
  return (
    <div className="flex flex-col gap-2" aria-labelledby="earlier-h">
      <h2 id="earlier-h" className="dialog-title">Earlier steps</h2>
      <ul className="flex flex-col gap-2">
        {subs.data.map((s) => (
          <li key={s.id} className="rnr-card">
            <details>
              <summary className="rnr-focus" style={{ cursor: 'pointer' }}>
                <span className="label">{nodeName(nodeById(task.record.workflow.graph, s.node_id))}</span>{' '}
                <span className="rnr-muted">· {who(s.submitted_by)} {VERB[s.outcome]} · {when(s.created_at)}</span>
              </summary>
              {s.form && <div className="pt-3"><AnswerList fields={s.form.schema} answers={s.answers} createdAt={s.created_at} by={who(s.submitted_by)} /></div>}
            </details>
          </li>
        ))}
      </ul>
    </div>
  )
}

function MyForm({ task, node }: { task: TaskDetail; node: FormNode }) {
  const { orgId, userId } = useOrg()
  const qc = useQueryClient()
  const form = useForm(node.formId)
  const [done, setDone] = useState(false)
  const success = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (done) success.current?.focus() }, [done])
  if (form.isPending) return <Skeleton rows={[{ w: '100%', h: 240 }]} />
  if (form.isError || !form.data || validateSchema(form.data.schema).length) {
    return <div className="rnr-card"><p className="rnr-error" role="alert">This step has a setup problem. Ask a workflow manager to fix it.</p></div>
  }
  if (done) {
    return (
      <div className="rnr-card gap-3">
        <span className="rnr-pop" aria-hidden="true"><CheckIcon size={24} /></span>
        <h2 ref={success} tabIndex={-1} className="dialog-title">Step completed</h2>
        <p className="rnr-muted">{task.record.title} has moved on.</p>
        <div className="flex flex-wrap gap-2">
          <a className="rnr-btn rnr-btn-primary" href={`#/records/${task.record_id}`}>View record</a>
          <a className="rnr-btn rnr-btn-ghost" href="#/inbox">Back to inbox</a>
        </div>
      </div>
    )
  }
  return (
    <div className="rnr-card gap-4" aria-labelledby="mine-h">
      <h2 id="mine-h" className="dialog-title">{node.mode === 'approve' ? 'Your decision' : 'Your answers'}</h2>
      <FormRunner fields={form.data.schema} idPrefix="task" filePrefix={`${task.org_id}/${userId}/`}
        upload={(blob, name) => uploadFile(task.org_id, userId, blob, name)}
        outcomes={node.mode === 'approve' ? APPROVE : undefined}
        onSubmit={(answers, outcome) => advance({ action: 'submit', taskId: task.id, outcome: outcome === 'approved' || outcome === 'rejected' ? outcome : 'submitted', answers })}
        onDone={() => {
          setDone(true)
          for (const key of [['my-tasks', orgId], ['task', task.id], ['record', task.record_id], ['record-events', task.record_id]]) qc.invalidateQueries({ queryKey: key })
        }} />
    </div>
  )
}

function TaskView({ task }: { task: TaskDetail }) {
  const { orgId, userId } = useOrg()
  const qc = useQueryClient()
  const claim = useAction()
  const [claimError, setClaimError] = useState<string | null>(null)
  const node = nodeById(task.record.workflow.graph, task.node_id)
  const mine = task.assignee_user_id === userId || task.claimed_by === userId
  const take = () => claim.run(async () => {
    setClaimError(null)
    try { await claimTask(task.id) } catch (e) { setClaimError(friendlyError(e as { message?: string; code?: string })) }
    await Promise.all([qc.invalidateQueries({ queryKey: ['task', task.id] }), qc.invalidateQueries({ queryKey: ['my-tasks', orgId] })])
  })
  let body: ReactNode
  if (task.status !== 'open') body = <div className="rnr-card gap-2"><p>This task is already done.</p><div><a className="rnr-btn rnr-btn-secondary" href={`#/records/${task.record_id}`}>View record</a></div></div>
  else if (!node || node.type !== 'form') body = <div className="rnr-card"><p className="rnr-error" role="alert">This step has a setup problem. Ask a workflow manager to fix it.</p></div>
  else if (mine) body = <MyForm task={task} node={node} />
  else if (task.is_mine) {
    body = (
      <div className="rnr-card gap-3">
        <p>This task is for everyone with a role. Claim it so others know you are on it.</p>
        {claimError && <p className="rnr-error" role="alert">{claimError}</p>}
        <div>
          <button className="rnr-btn rnr-btn-primary" type="button" aria-busy={claim.busy} onClick={take}>
            {claim.busy && <span className="rnr-spin" aria-hidden="true" />}{claim.busy ? 'Claiming…' : 'Claim this task'}
          </button>
        </div>
      </div>
    )
  } else body = <div className="rnr-card"><p>This task is assigned to someone else.</p></div>

  return (
    <section className="flex flex-col gap-4 max-w-2xl" aria-labelledby="task-h">
      <div>
        <h1 id="task-h" tabIndex={-1} className="page-title">{task.record.title}</h1>
        <p className="rnr-muted">{task.record.workflow.name} · {nodeName(node)}{task.due_at ? ` · due ${when(task.due_at)}` : ''}</p>
      </div>
      <Earlier task={task} />
      {body}
    </section>
  )
}

export function TaskPage({ id }: { id: string }) {
  const { orgId } = useOrg()
  const task = useTask(id)
  const back = <a className="rnr-btn rnr-btn-ghost self-start" href="#/inbox"><BackIcon />Back to inbox</a>
  const notice = (title: string, text: string, action?: ReactNode) => (
    <div className="rnr-card gap-3 max-w-xl"><h1 className="page-title">{title}</h1><p className="rnr-muted">{text}</p>{action && <div>{action}</div>}</div>
  )
  return (
    <div className="flex flex-col gap-4">
      {back}
      {task.isPending && <Skeleton rows={[{ w: '240px', h: 32 }, { w: '100%', h: 320 }]} />}
      {task.isError && notice('We could not load this task', 'Check your connection and try again.',
        <button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => task.refetch()}>Try again</button>)}
      {task.isSuccess && (!task.data || task.data.org_id !== orgId) && notice('This task does not exist', 'It may be finished and no longer visible to you, or it belongs to another organisation.')}
      {task.data && task.data.org_id === orgId && <TaskView task={task.data} />}
    </div>
  )
}
```

- [ ] **Step 6: Routes and nav** — `src/App.tsx`

Import the three pages; in `Page`:
```tsx
    case 'inbox': return <InboxPage />
    case 'start': return <StartPage id={route.id} />
    case 'task': return <TaskPage id={route.id} />
```
Nav, first item:
```tsx
            {link('#/inbox', 'Inbox', route.page === 'inbox' || route.page === 'start' || route.page === 'task')}
```

- [ ] **Step 7: Typecheck, lint and browser check** (`alpha.localhost:5173` for the member, `admin.localhost:5173` for the admin, so their sessions do not share cookies)

Run: `pnpm build && pnpm lint && pnpm test`
Expected: no errors, no warnings, `# pass 83`.

1. `member@alpha.test` → Inbox → Start new lists Leave approval → Start → fill the Leave request (3 days), sign, Submit form → "Record started", focus on the heading, View record link.
2. `admin@alpha.test` → Inbox → the record under My tasks, step "Manager approval", due in 2 days, Claim → "You claimed …", focus on Open → task view shows "Earlier steps: Start · member@alpha.test submitted …" with answers → Approve and Reject buttons; pressing Enter in Comment submits nothing → Approve → "Step completed".
3. Second admin tab on the same task before step 2's Approve → Approve after the first → "This task is already done."
4. `viewer@alpha.test` → Inbox → "Nothing to do"; Start new → "No workflows to start".
5. Forms → Leave request → Submissions still renders answers the same way (shared `AnswerList`).
6. 375px: inbox table scrolls in its card; Approve / Reject stack full width. Reset the viewport.

- [ ] **Step 8: Commit**

```bash
git add src/inbox/InboxPage.tsx src/inbox/StartPage.tsx src/inbox/TaskPage.tsx src/forms/submissions/AnswerList.tsx \
  src/forms/submissions/SubmissionsPage.tsx src/forms/fill/FormRunner.tsx src/App.tsx
git commit -m "feat: add inbox, workflow start and task view"
```

---

### Task 10: Frontend — records list, record page, end-to-end check

**Owner:** Frontend engineer · **Depends on:** Tasks 4, 8, 9

**Files:**
- Create: `src/records/timeline.ts`, `src/records/RecordsPage.tsx`, `src/records/RecordPage.tsx`, `src/workflows/canvas/MiniCanvas.tsx`
- Test: `src/records/timeline.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useRecords`, `useRecord`, `useRecordEvents`, `useRecordSubmissions`, `RECORD_LIMIT` (Task 7); `toFlow`, `NodeCard` (Task 8); `AnswerList` (Task 9); `useMemberEmails`; graph helpers (Task 1).
- Produces: `STATUS_WORDS: Record<RecordStatus, string>`, `eventText(e: { kind: string; node_id: string | null; detail: Record<string, unknown> }, graph: Graph, who: string | null): string`; `MiniCanvas({ graph, current })`; `RecordsPage()`, `RecordPage({ id })`.

- [ ] **Step 1: Write the failing test** — `src/records/timeline.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventText } from './timeline.ts'
import { LEAVE } from '../../supabase/functions/_shared/workflow/fixture.ts'

const ev = (kind: string, node_id: string | null, detail: Record<string, unknown> = {}) => ({ kind, node_id, detail })

test('people events name who did what on which step', () => {
  assert.equal(eventText(ev('started', 'start'), LEAVE, 'You'), 'You started the record')
  assert.equal(eventText(ev('submitted', 'approve', { outcome: 'approved' }), LEAVE, 'admin@alpha.test'), 'admin@alpha.test approved Manager approval')
  assert.equal(eventText(ev('submitted', 'approve', { outcome: 'rejected' }), LEAVE, null), 'Someone rejected Manager approval')
  assert.equal(eventText(ev('claimed', 'approve'), LEAVE, 'You'), 'You claimed Manager approval')
})
test('runtime events say what the workflow did', () => {
  assert.equal(eventText(ev('task', 'approve'), LEAVE, null), 'Waiting for Manager approval')
  assert.equal(eventText(ev('condition', 'long', { outcome: 'yes' }), LEAVE, null), 'More than 2 days?: Yes')
  assert.match(eventText(ev('waiting', 'wait', { runAt: '2026-10-12T12:00:00.000Z' }), LEAVE, null), /^Waiting until 12 Oct 2026/)
  assert.equal(eventText(ev('skipped', 'wait'), LEAVE, null), 'A timer on Wait a day was skipped because the record had moved on')
  assert.equal(eventText(ev('action', 'approve', { type: 'set_status', label: 'Rejected by manager' }), LEAVE, null), 'Status set to “Rejected by manager”')
  assert.equal(eventText(ev('action', 'approve', { type: 'send_message', status: 'pending' }), LEAVE, null), 'Message queued. It sends once Communication is set up.')
  assert.equal(eventText(ev('error', 'approve', { message: 'The role for "Manager approval" no longer exists.' }), LEAVE, null), 'Stopped: The role for "Manager approval" no longer exists.')
  assert.equal(eventText(ev('closed', 'rejected', { status: 'rejected' }), LEAVE, null), 'Closed as rejected')
})
test('a deleted step and an unknown event still read', () => {
  assert.equal(eventText(ev('task', 'gone'), LEAVE, null), 'Waiting for A deleted step')
  assert.equal(eventText(ev('mystery', null), LEAVE, null), 'The workflow recorded a step')
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test`
Expected: `Cannot find module '…/records/timeline.ts'`.

- [ ] **Step 3: Implement** — `src/records/timeline.ts`

```ts
import { nodeById, nodeName, type Graph } from '../workflows/logic.ts'

export type RecordStatus = 'open' | 'done' | 'rejected' | 'error'
export const STATUS_WORDS: Record<RecordStatus, string> = { open: 'In progress', done: 'Done', rejected: 'Rejected', error: 'Stopped' }

const when = (iso: unknown) => (typeof iso === 'string'
  ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  : 'later')

/** One plain sentence per timeline event; `who` is "You", an email or "Former member", null for the workflow itself. */
export function eventText(e: { kind: string; node_id: string | null; detail: Record<string, unknown> }, graph: Graph, who: string | null): string {
  const step = nodeName(e.node_id ? nodeById(graph, e.node_id) : undefined)
  const actor = who ?? 'Someone'
  const d = e.detail ?? {}
  switch (e.kind) {
    case 'started': return `${actor} started the record`
    case 'submitted': return `${actor} ${d.outcome === 'approved' ? 'approved' : d.outcome === 'rejected' ? 'rejected' : 'submitted'} ${step}`
    case 'claimed': return `${actor} claimed ${step}`
    case 'task': return `Waiting for ${step}`
    case 'condition': return `${step}: ${d.outcome === 'yes' ? 'Yes' : 'No'}`
    case 'waiting': return `Waiting until ${when(d.runAt)}`
    case 'resumed': return `${step} finished waiting`
    case 'skipped': return `A timer on ${step} was skipped because the record had moved on`
    case 'action':
      if (d.type === 'set_status') return `Status set to “${String(d.label)}”`
      return d.type === 'send_message' ? 'Message queued. It sends once Communication is set up.' : 'PDF queued. It is made once Reports are set up.'
    case 'error': return `Stopped: ${String(d.message)}`
    case 'closed': return d.status === 'rejected' ? 'Closed as rejected' : 'Closed as done'
    default: return 'The workflow recorded a step'
  }
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm test`
Expected: `# pass 86` `# fail 0` (83 + 3).

- [ ] **Step 5: Mini canvas** — `src/workflows/canvas/MiniCanvas.tsx`

```tsx
import '@xyflow/react/dist/style.css'
import { useMemo } from 'react'
import { Background, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { nodeById, nodeName, type Graph } from '../logic'
import { toFlow } from './canvasOps'
import { NodeCard } from './NodeCard'

const CARD_TYPES = { card: NodeCard }

/** Read-only map. The page states the current step in text as well, so the picture is never the only source. */
export function MiniCanvas({ graph, current }: { graph: Graph; current: string | null }) {
  const view = useMemo(() => toFlow(graph, { current, readOnly: true }), [graph, current])
  return (
    <div className="rnr-canvas h-[280px]" role="img" aria-label={`Workflow map. Current step: ${nodeName(current ? nodeById(graph, current) : undefined)}.`}>
      <ReactFlowProvider>
        <ReactFlow nodes={view.nodes} edges={view.edges} nodeTypes={CARD_TYPES} nodesDraggable={false} nodesConnectable={false}
          elementsSelectable={false} nodesFocusable={false} edgesFocusable={false} zoomOnScroll={false} fitView>
          <Background gap={16} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  )
}
```

- [ ] **Step 6: Records list** — `src/records/RecordsPage.tsx`

```tsx
import { useState } from 'react'
import { useOrg } from '../rbac/useOrg'
import { Skeleton } from '../ui/Skeleton'
import { nodeById, nodeName } from '../workflows/logic'
import { RECORD_LIMIT, useRecords, type RecordFilter } from '../workflows/api'
import { STATUS_WORDS } from './timeline'

const FILTERS: [RecordFilter, string][] = [['all', 'All'], ['open', 'In progress'], ['error', 'Stopped'], ['closed', 'Closed']]
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function RecordsPage() {
  const { orgId } = useOrg()
  const [filter, setFilter] = useState<RecordFilter>('all')
  const list = useRecords(orgId, filter)
  const n = list.data?.length ?? 0
  return (
    <section className="flex flex-col gap-4" aria-labelledby="records-h">
      <h1 id="records-h" tabIndex={-1} className="page-title">Records</h1>
      <div className="rnr-seg self-start" role="radiogroup" aria-label="Show records">
        {FILTERS.map(([value, label]) => (
          <button key={value} type="button" role="radio" aria-checked={filter === value} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>
      {list.isPending && <Skeleton rows={[{ w: '100%', h: 48 }, { w: '100%', h: 48 }]} />}
      {list.isError && (
        <div className="rnr-card gap-3">
          <p role="alert">We could not load the records. Check your connection and try again.</p>
          <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => list.refetch()}>Try again</button></div>
        </div>
      )}
      {list.data?.length === 0 && (
        <div className="rnr-card gap-3">
          <h2 className="dialog-title">{filter === 'all' ? 'No records yet' : 'No records match this filter'}</h2>
          <p className="rnr-muted">{filter === 'all' ? 'Records appear here when you start a workflow or a step needs you.' : 'Choose All to see every record you can view.'}</p>
          {filter === 'all' && <div><a className="rnr-btn rnr-btn-primary" href="#/inbox">Go to inbox</a></div>}
        </div>
      )}
      {n === RECORD_LIMIT && <p className="rnr-caption">Showing the newest {RECORD_LIMIT} records.</p>}
      {n > 0 && (
        <div className="rnr-card p-0 overflow-x-auto">
          <table className="rnr-table">
            <thead><tr><th>Record</th><th>Status</th><th>Step</th><th className="num">Started</th></tr></thead>
            <tbody>
              {list.data!.map((r) => (
                <tr key={r.id}>
                  <td><a href={`#/records/${r.id}`}>{r.title}</a><br /><span className="rnr-caption">{r.workflow.name}</span></td>
                  <td><span className="rnr-status">{STATUS_WORDS[r.status]}{r.label ? ` · ${r.label}` : ''}</span></td>
                  <td>{nodeName(r.current_node_id ? nodeById(r.workflow.graph, r.current_node_id) : undefined)}</td>
                  <td className="num rnr-num">{day(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 7: Record page** — `src/records/RecordPage.tsx`

```tsx
import type { ReactNode } from 'react'
import { useOrg } from '../rbac/useOrg'
import { BackIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { AnswerList } from '../forms/submissions/AnswerList'
import { useMemberEmails } from '../members/useMemberEmails'
import { nodeById, nodeName } from '../workflows/logic'
import { useRecord, useRecordEvents, useRecordSubmissions, type RecordRow } from '../workflows/api'
import { MiniCanvas } from '../workflows/canvas/MiniCanvas'
import { STATUS_WORDS, eventText } from './timeline'

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

function RecordView({ rec }: { rec: RecordRow }) {
  const { orgId, userId } = useOrg()
  const events = useRecordEvents(rec.id)
  const subs = useRecordSubmissions(rec.id)
  const emails = useMemberEmails(orgId)
  const graph = rec.workflow.graph
  const who = (id: string | null) => (!id ? null : id === userId ? 'You' : emails.data?.get(id) ?? 'Former member')
  const byId = new Map((subs.data ?? []).map((s) => [s.id, s]))
  const step = nodeName(rec.current_node_id ? nodeById(graph, rec.current_node_id) : undefined)
  return (
    <section className="flex flex-col gap-4" aria-labelledby="rec-h">
      <div>
        <h1 id="rec-h" tabIndex={-1} className="page-title">{rec.title}</h1>
        <p className="rnr-muted">{rec.workflow.name} · started {when(rec.created_at)} by {who(rec.started_by)}</p>
      </div>
      <p className="rnr-status">{STATUS_WORDS[rec.status]}{rec.label ? ` · ${rec.label}` : ''}</p>
      {rec.status === 'error' && (
        <div className="rnr-card gap-2" role="alert">
          <h2 className="dialog-title">This record stopped</h2>
          <p>{rec.error}</p>
          <p className="rnr-muted">Nothing after this step has run. Ask a workflow manager to fix the workflow.</p>
        </div>
      )}
      <div className="rnr-card gap-3">
        <h2 className="rnr-card-title">{rec.status === 'open' || rec.status === 'error' ? `Current step: ${step}` : `Finished at: ${step}`}</h2>
        <MiniCanvas graph={graph} current={rec.current_node_id} />
      </div>
      <div className="rnr-card gap-3" aria-labelledby="timeline-h">
        <h2 id="timeline-h" className="rnr-card-title">Timeline</h2>
        {(events.isPending || subs.isPending) && <Skeleton rows={[{ w: '100%', h: 32 }, { w: '100%', h: 32 }]} />}
        {(events.isError || subs.isError) && <p role="alert">We could not load the timeline. Reload the page to try again.</p>}
        {events.data && subs.data && (
          <ol className="flex flex-col gap-3">
            {events.data.map((e) => {
              const sub = typeof e.detail.submissionId === 'string' ? byId.get(e.detail.submissionId) : undefined
              return (
                <li key={e.id} className="flex flex-col gap-1">
                  <p><span className="label">{eventText(e, graph, who(e.actor_id))}</span> <span className="rnr-muted">· {when(e.created_at)}</span></p>
                  {sub?.form && (
                    <details>
                      <summary className="rnr-focus" style={{ cursor: 'pointer' }}>Answers</summary>
                      <div className="pt-2"><AnswerList fields={sub.form.schema} answers={sub.answers} createdAt={sub.created_at} by={who(sub.submitted_by) ?? 'Someone'} /></div>
                    </details>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}

export function RecordPage({ id }: { id: string }) {
  const { orgId } = useOrg()
  const rec = useRecord(id)
  const notice = (title: string, text: string, action?: ReactNode) => (
    <div className="rnr-card gap-3 max-w-xl"><h1 className="page-title">{title}</h1><p className="rnr-muted">{text}</p>{action && <div>{action}</div>}</div>
  )
  return (
    <div className="flex flex-col gap-4">
      <a className="rnr-btn rnr-btn-ghost self-start" href="#/records"><BackIcon />Back to records</a>
      {rec.isPending && <Skeleton rows={[{ w: '240px', h: 32 }, { w: '100%', h: 320 }]} />}
      {rec.isError && notice('We could not load this record', 'Check your connection and try again.',
        <button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => rec.refetch()}>Try again</button>)}
      {rec.isSuccess && (!rec.data || rec.data.org_id !== orgId) && notice('This record does not exist', 'You may not have access to it, or it belongs to another organisation.')}
      {rec.data && rec.data.org_id === orgId && <RecordView rec={rec.data} />}
    </div>
  )
}
```

- [ ] **Step 8: Routes and nav** — `src/App.tsx`

Import `RecordsPage` and `RecordPage`; in `Page`:
```tsx
    case 'records': return <RecordsPage />
    case 'record': return <RecordPage id={route.id} />
```
Nav, after Inbox:
```tsx
            {link('#/records', 'Records', route.page === 'records' || route.page === 'record')}
```

- [ ] **Step 9: Typecheck, lint, unit tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: no errors, no warnings, `# pass 86`.

- [ ] **Step 10: End-to-end browser check** (spec §11 "one end-to-end flow per phase"; `supabase db reset`, `supabase functions serve --env-file supabase/functions/.env.local`, `pnpm dev`; Browser pane, one fresh tab per user: `member.localhost:5173`, `admin.localhost:5173`, `beta.localhost:5173`)

1. `admin@alpha.test`: Workflows → New workflow "Trip consent" → Start (form Leave request) → Form (Manager approval, Approve or reject, role Admin, due 1 day) → Condition (Days is more than 2) → Yes: Time (wait 1 minute) → End Done; No: End Done; Rejected: End Rejected with a Set status "Declined" action → publish check reaches "Ready to publish" → Publish workflow.
2. `member@alpha.test`: Inbox → Start new → Trip consent → submit a 3-day leave → "Record started" → View record → status "In progress", "Current step: Manager approval", timeline "You started the record" with Answers, "Waiting for Manager approval"; the mini map marks Manager approval.
3. `admin@alpha.test`: Inbox → Claim → Open → Earlier steps shows the member's answers → Approve. The record shows "Waiting until …"; after about a minute (pg_cron → resume) it shows "… finished waiting" and "Closed as done"; Records → Closed lists it.
4. A second record → Reject → status "Rejected · Declined"; timeline "Status set to “Declined”", "Closed as rejected".
5. A third record waiting on Manager approval, then as admin open Trip consent: the Form card shows "1 open record", and its panel says "1 open record is on this step, so it cannot be deleted." with no Delete button (the server-side guard is exercised in Task 5 Step 6 and `06_workflows.test.sql`).
6. Access tab: untick Member "Can start" → the member's Start new no longer lists Trip consent, but the member still opens their own earlier records from Records.
7. A stopped record: as admin create the role "Approvers" (Roles page), build and publish "Approver test" whose Form step is assigned to Approvers, then delete the Approvers role; as member start "Approver test" → the record shows "Stopped", the alert "The role for "…" no longer exists. Ask a workflow manager to choose another." and the timeline line "Stopped: …"; Records → Stopped lists it.
8. `owner@beta.test`: paste a Trip consent record URL → "This record does not exist"; paste the task URL → "This task does not exist"; Inbox shows "Nothing to do".
9. 375px on the record page: map, timeline and answers fit with no page-level horizontal scroll. Reset the viewport.

- [ ] **Step 11: Commit**

```bash
git add src/records/timeline.ts src/records/timeline.test.ts src/records/RecordsPage.tsx src/records/RecordPage.tsx src/workflows/canvas/MiniCanvas.tsx src/App.tsx
git commit -m "feat: add records list and record page with timeline and workflow map"
```

---

## Self-review notes

- §5.1 storage → Task 2: `workflows` (status, graph `{nodes, edges}`, `created_by`, `published_by`, `published_at`), `records` (`current_node_id`, status open/done/rejected/error, `error`, `data`, `started_by`), `submissions` = `form_submissions` extended with `record_id`, `node_id`, `outcome` (+ `task_id`; Global Constraints decision 1), `tasks` (role / user assignee, `claimed_by`, `due_at`, status, `overdue_notified_at` for Phase 4), `scheduled_actions` (`resume_node_id`, `run_at`, `state_at_schedule`, status pending/done/skipped/failed, `error`). The graph stores ids only. No versioning: records read the live graph; the deletion guard is a trigger (Task 2) and the editor shows the open count and withholds Delete (Task 8).
- §5.2 graph → Task 1 types: five nodes with every listed setting (Start `formId`; Form `formId`, `assignee` role/user/step, `mode` fill/approve, `due`; Condition one rule; Time `after` or `relative` field/amount/unit/before-after; End done/rejected); edges `{ id, from, outcome, to, actions[] }` with the six outcomes; actions `send_message`, `set_status`, `generate_pdf`.
- §5.3 canvas → Task 8: `@xyflow/react` board, palette of the five cards (click, Enter or drag), one labelled handle per outcome, side panel per card and per outcome (incl. actions), publish check issues pinned on cards and listed with "Show". Check items → Task 1 `checkGraph`: one Start; every outcome connected; no unreachable nodes; every cycle contains a Form or Time node; forms, roles and people exist. Templates do not exist until Phase 4: `shortcut:` noted in `actionIssue`.
- §5.4 runtime → Tasks 3–4: submission recorded with outcome, answers merged into `records.data` by field key, edge actions run in order, Form → task, Condition → shared `evaluate` and continue, Time → `scheduled_actions`, End → close; one transaction with `FOR UPDATE` on the record (`pgStore.lockRecord`); a failing action → `error` + reason, never skipped; pg_cron every minute → `resume`, rows whose record moved off `state_at_schedule` → `skipped`. `send_message` / `generate_pdf` recorded as pending action events (decision 6, `shortcut:` in `runAction`); `set_status` works.
- §6 → Task 9 (My tasks with role claiming, overdue mark, Start new from `can_start`, task view with earlier submissions read-only and Submit / Approve / Reject) and Task 10 (record page timeline with who, when, outcome and answers; read-only mini canvas highlighting the current node, with a text equivalent).
- §7 → Task 2: `workflow_access(workflow_id, role_id, can_start, can_view_all)` (+ `org_id` for tenancy), `has_permission(org, perm, workflow)` narrowing `records.start` / `records.view_all` (decision 2), members always see records they started, submitted to or hold a task on (`record_visible`); Task 8 Access tab (roles × start / view).
- §10 → browser never trusted (graph checked in `save-workflow`, answers re-validated and recomputed in `advance`, permission and assignment checked server-side); failed actions and timers carry explicit `error` / `failed` status and text; the record shows the reason and Records has a Stopped filter. §11 → unit: publish check under node and deno (Task 1), canvas ops and timeline text (Tasks 8, 10); pgTAP: RLS allow/deny per permission, `workflow_access` scoping, cross-org, claim, deletion guard, the two concurrency backstops (Task 2); Deno: `advance` per node type, cron resume + skip, unexpected failure (Tasks 3–4), and the lock itself against real Postgres (`race.test.ts`, run locally: pgTAP is single-session, so the lock is pinned there rather than in `supabase test db`); `save-workflow` (Task 5); one browser end-to-end flow (Task 10). §12 phase 3 "5 cards, publish check, advance, inbox, record page, timers" → Tasks 1–10. §15 → designer spec first (Task 6); tokens and `rnr-*` classes only; xyflow restyled with tokens.
- Review Focus 1 → Task 3 test + Task 4 race test + Task 2 backstops; 2 → Task 3 and Task 4 resume tests + Task 2 cron job; 3 → Task 1 and Task 3 loop tests; 4 → Task 2 pgTAP + Task 3 refusal test; 5 → Task 2 pgTAP + Task 5 test + Task 8 panel; 6 → Task 3 failure tests.
- Expected counts: `pnpm test` 63 → 75 (Task 1) → 78 (Task 7) → 83 (Task 8) → 86 (Task 10); `deno test supabase/functions` 54 → 66 (Task 1) → 83 (Task 3) → 89 + 1 ignored (Task 4) → 96 + 1 ignored (Task 5); `supabase test db` 70 → 111 in 6 files (Task 2).
- Out of scope, by the spec: workflow versioning, parallel branches. Deferred with a `shortcut:` note: template/recipient checks and message sending (Phase 4), PDF generation (Phase 5), retrying a stopped record (Phase 5 admin tools), tasks left unassigned by a deleted role (Phase 5), resume batch of 50 per minute, newest 200 records only (Phase 5 paging), the fake store's missing rollback (covered by the race test).
