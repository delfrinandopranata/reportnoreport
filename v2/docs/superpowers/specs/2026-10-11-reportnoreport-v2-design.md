# ReportNoReport v2 — design

Date: 2026-10-11 · Status: approved in brainstorming, awaiting spec review

## 1. Purpose

School admins and HR teams build their own forms, chain them into multi-step workflows
(approvals, branching, multi-stage data collection), communicate with the people involved, and
generate reports — without a developer.

v2 is a new product, not an upgrade of v1 (client-money ledger). It reuses v1's stack and its
multi-tenant org pattern only.

**Success criteria**
- An admin builds a form, wires it into a workflow on a canvas, publishes it, and a member can
  start a record that moves through every step to a PDF report — with no code.
- Every access decision is enforced in Postgres (RLS), not only in the UI.
- No workflow step, message or scheduled action fails silently.

## 2. Stack and repo

- React 19 · TypeScript · Vite · Tailwind CSS 4 · dnd-kit · TanStack Query · `@xyflow/react` v12
- Supabase: Postgres (RLS, `pg_cron`), Auth, Storage, Realtime, Edge Functions (Deno)
- Email: Resend (Mailpit locally via `supabase start`)
- Repo: `~/ntucsm/personal/reportnoreport-v2`, GitHub account `delfrinandopranata`, branch `main`
  plus feature branches, CI copied from v1.

## 3. Tenancy

Every table carries `org_id`; every RLS policy checks org membership and permission through
`has_permission()` (§7). A user can belong to several orgs.

## 4. Forms module

### 4.1 Storage
`forms(id, org_id, name, schema jsonb, created_by, updated_at)`. The whole form definition is one
JSONB `schema`: an ordered list of fields.

### 4.2 Field types (12)
| Type | Notes |
|---|---|
| short text, long text, number, date | |
| single select, multi select, checkbox | `options` list |
| file upload | Supabase Storage, org-scoped bucket path |
| signature | drawn on canvas, stored as PNG in Storage |
| `page_break` | splits the form into pages |
| `group` | child fields + `repeat: { min, max }`; answers stored as an array |
| `calculated` | read-only, `expression` (§4.4) |

Each field: `key` (unique in form), `label`, `help`, `required`, `options?`, `show_if?` (a rule, §4.3).

### 4.3 Rules
One evaluator is shared by `show_if`, Condition cards, report filters and campaign audiences.

Rule: `{ field, operator, value? }`. Operators: `is`, `is_not`, `is_one_of`, `contains`,
`is_empty`, `is_not_empty`, `gt`, `lt`, `within_days`.

Paths address repeating groups: `family[].relation` (matches if any row matches) and
`family.count`. An unreadable value makes a rule **false**, never throws.

### 4.4 Calculated fields
A small hand-written parser — never `eval`. Supports `+ − × ÷`, parentheses, field references,
and `sum`, `count`, `min`, `max`, `days_between`, `round`, `if(cond, a, b)`. Recomputed live in
the browser and again on the server at save; the client value is discarded.

### 4.5 Behaviour
- Builder: drag-to-reorder field list (dnd-kit) + live preview.
- Multi-page: Next validates only the current page; pages whose fields are all hidden are skipped.
- Validation runs in the browser for UX and in the `submit` Edge Function as the authority.

## 5. Workflow module

### 5.1 Storage
| Table | Columns |
|---|---|
| `workflows` | `org_id`, `name`, `status` (`draft`/`published`), `graph jsonb { nodes, edges }`, `created_by`, `published_by`, `published_at` |
| `records` | `org_id`, `workflow_id`, `title`, `current_node_id`, `status` (`open`/`done`/`rejected`/`error`), `error`, `data jsonb`, `started_by` |
| `submissions` | `record_id`, `node_id`, `form_id`, `answers jsonb`, `submitted_by`, `outcome` (`submitted`/`approved`/`rejected`), `created_at` |
| `tasks` | `record_id`, `node_id`, `assignee_role_id?`, `assignee_user_id?`, `claimed_by?`, `due_at?`, `status` (`open`/`done`/`cancelled`), `overdue_notified_at?` |
| `scheduled_actions` | `record_id`, `resume_node_id`, `run_at`, `state_at_schedule`, `status` (`pending`/`done`/`skipped`/`failed`), `error` |

The graph stores references only (form ids, template ids, role ids).

**No versioning.** Records point at the live graph. Editing a published workflow is allowed, but
a node cannot be deleted while any open record sits on it; the editor shows the count.

### 5.2 Graph
Nodes (5):
- `start` — `formId`; submitting it creates a record.
- `form` — `formId`, `assignee` (`{ role }` | `{ user }` | `{ step: nodeId }`), `mode`
  (`fill` | `approve`), `due` (duration, optional).
- `condition` — one rule over `records.data`.
- `time` — `after` a duration, or `relative_to_field` (field, amount, unit, before/after).
- `end` — `status` (`done` | `rejected`).

Edges: `{ id, from, outcome, to, actions[] }`. Outcomes: Start/Form `submitted`; Form in approve
mode `approved` / `rejected`; Condition `yes` / `no`; Time `next`.

Actions: `send_message` (template + recipients, §8), `set_status` (record status/label),
`generate_pdf` (§9.1).

### 5.3 Canvas
`@xyflow/react`. Palette of the 5 cards; one handle per outcome; side panel to configure a card or
edge. Publish check, issues pinned on the canvas:
- exactly one Start;
- every outcome connected;
- no unreachable nodes;
- every cycle contains a Form or Time node;
- every referenced form, role and template exists.

### 5.4 Runtime — `advance` Edge Function
1. On submission: record outcome, merge answers into `records.data` (keyed by form field `key`).
2. Follow the edge for the outcome; run its actions in order.
3. By target node: Form → create task, stop · Condition → evaluate, continue · Time → insert
   `scheduled_actions`, stop · End → close record.
4. `pg_cron` every minute calls a resume Edge Function for due rows; a row whose record has moved
   off `state_at_schedule` is marked `skipped`.

Each advance runs in one transaction holding `SELECT … FOR UPDATE` on the record. A failing action
sets the record to `error` with the reason and stops — never skipped.

## 6. Inbox and record page
- **My tasks:** tasks assigned to me or to a role I hold — title, step, due, overdue badge. Role
  tasks must be claimed before acting.
- **Task view:** earlier submissions read-only above, my form below with Submit / Approve / Reject.
- **Start new:** published workflows where I have `can_start`.
- **Record page:** timeline of every step (who, when, outcome, answers) + read-only mini canvas
  highlighting the current node.

## 7. RBAC module

| Table | Holds |
|---|---|
| `roles` | `org_id`, `name`, `is_system` |
| `role_permissions` | `role_id`, `permission` |
| `member_roles` | `member_id`, `role_id` (many per member) |
| `workflow_access` | `workflow_id`, `role_id`, `can_start`, `can_view_all` |
| `audit_log` | `org_id`, `actor_id`, `action`, `target`, `before jsonb`, `after jsonb`, `created_at` |

Permissions are a fixed list in code: `forms.manage`, `workflows.manage`, `workflows.publish`,
`records.view_all`, `records.start`, `reports.view`, `reports.manage`, `members.manage`,
`roles.manage`, `comms.manage`, `comms.broadcast`.

Seeded roles: Owner (all permissions, not editable or deletable), Admin, Member, Viewer (seeded,
editable).

- `has_permission(org_id, perm, workflow_id default null)` — SQL, `security definer`, used by
  every RLS policy. With `workflow_id`, `workflow_access` narrows `records.start` /
  `records.view_all`.
- A member always sees records they started, submitted to, or hold a task on.
- Frontend loads the caller's permissions once per org switch, to hide controls only.
- Guards: the last Owner cannot be removed; nobody grants a permission they lack; every role,
  permission and membership change writes `audit_log`.
- UI: Roles page (permission checklist grouped Forms / Workflows / Records / Reports / Comms /
  Admin), Members page (invite by email, assign roles), Workflow → Access tab (roles × start/view).

## 8. Communication module

| Table | Holds |
|---|---|
| `message_templates` | `org_id`, `name`, `channel` (`email`/`in_app`), `subject`, `body`, `is_system` |
| `messages` | `org_id`, `template_id`, `campaign_id?`, `record_id?`, `recipient_user_id?`, `recipient_email?`, `channel`, `status` (`queued`/`sent`/`failed`), `attempts`, `error`, `sent_at`, `delivered_at`, `opened_at`, `clicked_at`, `bounced_at`, `complained_at` |
| `notifications` | `user_id`, `org_id`, `title`, `body`, `link`, `read_at` |
| `notification_prefs` | `user_id`, `type`, `email_enabled` |

- Variables: `{{record.title}}`, `{{record.data.<key>}}`, `{{step.assignee.name}}`,
  `{{link.task}}`, `{{link.record}}`, `{{org.name}}`, `{{recipient.name}}`. Insert menu + preview
  against a real record. Values are HTML-escaped.
- System templates (seeded, editable): Task assigned, Task overdue, Record approved, Record
  rejected, Invite to org.
- Recipients for `send_message`: role, user, record starter, assignee of step X, or an email field
  in the record's data.
- Automatic: task created → Task assigned to assignee(s); cron sends Task overdue once per task.
- Delivery: every send is a queued `messages` row; a worker sends it, retries 3× with exponential
  backoff, then `failed` with the error shown on the Messages page.
- Users may mute email per notification type; in-app is always delivered (Realtime bell).

### 8.1 Campaigns
`campaigns(org_id, name, template_id, audience jsonb, audience_snapshot_at, scheduled_at, status
draft/scheduled/sending/sent, sent_by, linked_workflow_id?)`. Requires `comms.broadcast`.

Audience: a role, or the result of a saved report, snapshotted at send time.

Resend webhook → Edge Function (signature verified) writes delivered / opened / clicked / bounced /
complained timestamps onto `messages`.

Campaign report:
- Tiles: recipients, delivered %, opened %, clicked %, bounced + failed counts.
- Opens and clicks over the first 7 days.
- Recipient table (status, opened, clicked, error), filters "not opened" / "bounced", CSV export.
- "Send follow-up to not opened" → new draft campaign with that audience.
- With `linked_workflow_id`: completion % (recipients who started / finished a record) and
  "Remind non-completers".
- Campaigns list: status, send date, delivered / opened / clicked %.
- Opens are labelled approximate (Apple Mail Privacy Protection inflates them). In-app campaigns
  report read only.

## 9. Reports module

### 9.1 Per-record PDF
One report template per workflow: header text, chosen fields from any step, sign-off block
(names, outcomes, timestamps, signatures). Rendered in an Edge Function, saved to Storage, linked
on the record. Triggered by the `generate_pdf` action or a button.

### 9.2 Aggregate reports
`saved_reports(org_id, workflow_id, columns, filters, group_by, aggregate)`. Columns from
`records.data` / record metadata, filters use §4.3 rules, one group-by with count or sum. CSV
export. Requires `reports.view`; saving requires `reports.manage`.

### 9.3 Dashboard
v1's drag-and-drop widget grid; widgets are saved reports shown as a number, a table, or one
bar/line chart.

## 10. Error handling
- Trust boundary is the Edge Functions and RLS; the browser is never trusted for validation,
  calculated values, permissions or template rendering.
- Workflow: failed action → record `error` + reason, visible on the record and an admin filter.
- Scheduled actions and messages: explicit `failed` status with error text; nothing is dropped.
- Webhooks: unsigned or bad-signature requests are rejected (401) and not stored.

## 11. Testing
- Unit (`node --test`): rule evaluator incl. repeat paths, expression parser, publish check,
  template rendering + escaping.
- DB (`supabase test db`, pgTAP): RLS allow/deny per permission, `workflow_access` scoping,
  last-Owner guard, grant-only-what-you-hold, concurrent advance lock.
- Edge Functions (`deno test`): `advance` per node type, cron resume + skip, message retry,
  webhook signature.
- Browser: Claude Browser pane against `supabase start`, one end-to-end flow per phase.

## 12. Build order

| # | Phase | Ships | Est. |
|---|---|---|---|
| 1 | Foundation + RBAC | orgs, invites, roles, permissions, members page, audit log | 1 wk |
| 2 | Form builder | 12 field types, preview, standalone submit | 1.5 wk |
| 3 | Workflow canvas + runtime | 5 cards, publish check, `advance`, inbox, record page, timers | 2 wk |
| 4 | Communication | templates, in-app bell, task emails, Messages page | 1 wk |
| 5 | Reports | record PDF, aggregate tables + CSV, dashboard | 1 wk |
| 6 | Campaigns | broadcast, scheduling, webhook tracking, campaign report, follow-ups | 1 wk |

≈ 7.5 weeks solo. Each phase gets its own implementation plan.

## 13. Out of scope
SMS / WhatsApp, workflow versioning, form versioning, public (logged-out) forms, multiple report
templates per workflow, more than one group-by per report.

## 14. Constraints
Ideas may be informed by prior work, but no code is copied from employer repositories.

## 15. Design system
`design/` (imported from the ReportNoReport v2 design-system artifact, 2026-10-11) is authoritative for every visual decision: tokens, the five appearance modes (theme incl. Black & White, colour preset, surface style, density, motion), components (`rnr-*` classes), copy rules and accessibility rules. Where this spec and `design/README.md` disagree on a visual or copy point, `design/README.md` wins.
