# Phase 5 — Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A record ends in a real PDF: each workflow has one report template (header text, chosen answers from any step, a sign-off block with names, outcomes, times and signatures), the `generate_pdf` action and a "Generate PDF" button on the record page queue it, a worker renders it server-side into an org-scoped private bucket and links it on the record, and a failure stops the record with the reason. Reports managers save aggregate reports over one workflow's records (columns from answers and record details, filters with the shared rule operators, one group-by with count or sum), anyone with `reports.view` runs them with explicit totals and paging and exports CSV, and a shared dashboard shows saved reports as numbers, tables and one bar or line chart with a data-table alternative, reordered by drag or keyboard.

**Architecture:** A pure TypeScript module, `supabase/functions/_shared/reports/` (report definition parsing, the column catalogue, the runner with filters/group/sum, CSV, the PDF model and its page layout), runs in the browser (builder pickers, labels, chart data), in the Edge Functions and under both `node --test` and `deno test`, like `_shared/forms`, `_shared/workflow` and `_shared/comms`. **Filters are evaluated by the forms module's `evaluate()`** — the one evaluator spec §4.3 names for show_if, Condition cards and report filters — so report execution is an Edge Function, `run-report`, that reads records **with the caller's own JWT** (supabase-js, PostgREST, RLS `record_visible` decides every row) and then filters, projects, groups and pages them in TypeScript. PDFs follow the Phase 4 queue pattern: the engine's `generate_pdf` action (Phase 3 recorded it as `pending`) now inserts a `record_pdfs` row in the advancing transaction and wakes the worker through pg_net; `request_record_pdf` (the button) does the same; a new `render-pdfs` Edge Function, woken by that call and by pg_cron every minute (Vault URL + `cron_secret`, the `resume`/`send-messages` pattern), claims a job with a lease, builds the PDF model from the record's submissions, lays it out, renders it with `pdf-lib` + embedded Inter, uploads it to the private `record-pdfs` bucket, and notifies the requester in the Realtime bell. Postgres adds `report_templates`, `record_pdfs`, `saved_reports`, `dashboard_widgets`, the `record-pdfs` bucket and its read policy, `request_record_pdf`, `save_dashboard_layout`, audit triggers and the cron job. The frontend adds a PDF panel on the record page, a report-template editor per workflow, Reports (list, builder, results, CSV), and a Dashboard with a hand-rolled SVG chart.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, dnd-kit (already a dependency), supabase-js 2, Supabase CLI (Postgres 17, pgTAP, `pg_cron`, `pg_net`, Vault, Storage), Deno 2 Edge Functions, `npm:postgres@3.4.5` (already in `deno.lock`), **`npm:pdf-lib@1.17.1` + `npm:@pdf-lib/fontkit@1.1.1` (Deno only, new)**, Inter 4.1 TTF (SIL OFL, committed), `node --test`, oxlint. No new web dependencies.

**Spec:** `docs/superpowers/specs/2026-10-11-reportnoreport-v2-design.md` (§9 Reports module: 9.1, 9.2, 9.3; §10 Error handling; §11 Testing; §12 phase 5; §15 Design system)

## Global Constraints

- Everything from the Phase 1–4 Global Constraints still holds (org-scoped tables, `has_permission()` in every policy, British English, sentence-case verb-first buttons, no emoji, `design/` authoritative, tokens and `rnr-*` classes only, one `rnr-btn-primary` per view, never `disabled` on submit, `aria-busy` + `rnr-spin` while saving, native `<dialog>` via `src/ui/ConfirmDialog.tsx`, the browser never trusted, the app served from `/app/`, `pnpm build` runs `scripts/check-dist.mjs`).
- **Decisions this plan takes (reviewer: check these):**
  1. **PDF library: `pdf-lib` 1.17.1 with `@pdf-lib/fontkit` 1.1.1, imported with `npm:` in Deno only.** Pure JavaScript with no native code, no filesystem or Node streams and no headless browser (the Edge runtime has no Chromium, which rules out HTML-to-PDF; `pdfkit` needs Node streams and `fs`; `jsPDF` targets the browser and its Unicode font path is a base64 VFS). `pdf-lib` embeds PNGs directly (signatures are PNG, Phase 2), embeds and **subsets** TrueType fonts through fontkit, and its `widthOfTextAtSize` gives the exact metrics the layout needs for wrapping. It never reaches the browser bundle.
  2. **Inter is embedded, never a standard-14 fallback.** `Inter-Regular.ttf` and `Inter-SemiBold.ttf` from the Inter 4.1 release (SIL Open Font Licence, `OFL.txt` committed beside them) live in `supabase/functions/render-pdfs/fonts/`, are shipped through `static_files` in `config.toml`, are read **once at boot**, and the function throws before serving if either is missing: Helvetica's WinAnsi encoding throws on any character outside Latin-1 (a Tamil, Chinese or Malay name with a special character would crash the render), so a silent fallback would turn into broken PDFs. Characters Inter has no glyph for (CJK) draw as the font's empty box; that is a `shortcut:` with an upgrade note (add a Noto subset when an org needs it).
  3. **A PDF is a queued job, rendered outside the database transaction.** `generate_pdf` and the button insert `record_pdfs(status 'queued')` (one queued job per record, a second request returns the same job), and wake `render-pdfs` immediately with `net.http_post` (sent after commit; a rolled-back step never wakes it). The worker **claims** a job with `UPDATE … SET attempts = attempts + 1, next_attempt_at = now + 5 minutes WHERE status = 'queued' AND next_attempt_at <= now RETURNING` (a lease: a concurrent run gets no row, and a worker that dies mid-render leaves the job to be retried after five minutes), reads its sources in a second short transaction, renders and uploads with no lock held, then finishes in a third. Rendering never holds the record lock that `advance` needs, and every finishing transaction locks the **record first, then the job** — the order `advance` uses (record `FOR UPDATE`, then the `record_pdfs` insert) — so the two cannot deadlock.
  4. **Retries and failure.** At most 3 attempts, the next 1 and 2 minutes after a failure. A problem that cannot succeed by retrying (`PdfProblem`: the template was deleted, a signature file is missing or outside the record's org) fails at once. After the last failure the job is `failed` with a plain reason (never exception text), an `error` event goes on the record's timeline, the requester gets a bell notice, and **an open record is put in `error` with that reason** (spec §5.4/§10: a failing action stops the record). A closed record keeps its `done`/`rejected` status — reopening finished work to `error` would be wrong — and its record page shows the failure and a "Try again" button. A job stuck after its third lease expires is failed the same way by the next run.
  5. **The PDF shows the record as it is when rendered** (normally within seconds, at most a minute), from each step's latest submission, not a snapshot at queue time. Hidden fields are omitted using the shared `resolve()` on that submission (the server already strips them at save; this is a second guard). A field no longer on the form prints "This question is no longer on the form." instead of vanishing.
  6. **Times in a PDF are UTC and say so** ("12 Oct 2026, 14:05 UTC"): the server has no reader time zone and orgs have no time-zone setting yet (`shortcut:` until an org setting exists).
  7. **The PDF bucket is private and follows record visibility.** Path `<org_id>/<record_id>/<job_id>.pdf` in bucket `record-pdfs` (20 MB cap, `application/pdf` only). Only the service role writes. The read policy is `record_visible(<record from path>)` **and** the path's org equals the record's org. Anyone who can see the record can open its PDF through a signed URL the page mints for 300 seconds and refreshes before it lapses (`src/reports/api.ts`); pressing "Generate PDF" additionally needs `reports.view`. Storage lets whoever may read an object choose the `expiresIn` of a URL for it, so a client can mint a longer one for itself; that grants nothing it could not already read, and a viewer, another org's member or a guessed path still get 404 or 400 (QA-P5-5), so there is no PDF-specific expiry policy to enforce server-side.
  8. **Report execution is an Edge Function that reads as the caller.** `run-report` builds a supabase-js client with the caller's `Authorization` header and selects `records` through PostgREST, so `records_read` (`record_visible`: started, submitted to, holds a task, or `records.view_all` narrowed per workflow by `workflow_access.can_view_all`) decides every row — the function never uses the service role and cannot read a record the caller cannot. The function itself checks `reports.view` (via `my_permissions`). Spec §4.3 makes `evaluate()` the one rule evaluator, so filters run in TypeScript after the RLS read; there is no second SQL implementation of the nine operators to drift from it.
  9. **No silent truncation.** `run-report` reads every visible record of the workflow in keyset pages of 1,000 (`order by id`, `id > last`, so concurrent inserts cannot duplicate or skip rows) up to 10,000; **more than 10,000 visible records is refused with 413 and a sentence**, never cut (`shortcut:` push filters into SQL when an org outgrows it). Every response carries `total` (rows or groups after filtering), `totalRecords`, `page` and `pageSize`; a page past the end returns no rows and the same totals. CSV returns every row or group, never a page. Dashboard table and chart widgets that show the first N say "Showing 10 of 240" / "Showing the first 24 of 31 groups" with a link to the full report.
  10. **Group and sum semantics.** One group-by column; its key is the cell's display value (multi-select and repeating values joined with ", "; empty → the "No answer" group, sorted last; other keys sorted numerically when both are numbers, else `localeCompare('en-GB', { numeric: true })`). `count` counts matching records per group. `sum` adds only finite JSON **numbers** (number and calculated fields store numbers); a numeric-looking string, text, `true` or an object is **left out and counted** in `skipped` per group and in total, and the UI says "2 values were not numbers and were left out"; empty values are neither added nor counted as skipped. A group with no numbers has `sum: null` ("No numbers"), not 0. Sums are rounded to 10 decimal places so 0.1 + 0.2 shows 0.3.
  11. **CSV.** RFC 4180 (comma, CRLF, a field with `"`, `,`, CR or LF is quoted and `"` doubled), a UTF-8 BOM so Excel reads non-ASCII names, and a **formula-injection guard on every text cell, headers included**: a value starting with `=`, `+`, `-`, `@`, TAB or CR is prefixed with `'`. Numbers (JSON numbers, including negatives) are written unguarded because they are not text; a typed answer "-5" is text and is guarded.
  12. **Report columns.** A column is `{ meta: 'title' | 'status' | 'label' | 'step' | 'started_by' | 'created_at' | 'updated_at' }` or `{ field: '<path>' }` using the forms path syntax (`days`, `claims[].item`, `claims.count`). Field labels come from the workflow's Start/Form steps (first step wins for a key, matching how `records.data` merges answers); a path with no field any more shows its key as the header and empty cells. Filters are §4.3 rules over `records.data` (all must match). Saved definitions are written by `reports.manage` through RLS, like forms; `run-report` re-validates them and answers 409 "This report needs fixing: …" instead of guessing.
  13. **One shared dashboard per org, not per person.** Widgets are org rows (`dashboard_widgets`) backed by org-level saved reports; `reports.manage` adds, removes, reorders and resizes them, `reports.view` sees them, and every viewer's widgets show only the records *they* can see (each widget runs `run-report` as the viewer). This is v1's dashboard (one firm board) and keeps one source of truth; personal layouts would need a per-user layout table and merge rules for widgets added later, which nobody has asked for. Order and width change through `save_dashboard_layout`, which refuses a stale layout ("The dashboard changed…") so two tabs cannot silently overwrite each other.
  14. **The chart is hand-rolled SVG** (`src/reports/chart.ts` geometry + `ChartWidget.tsx`): one series, `--in` fill (series 1 per design/README; there is no second series, so the B&W `out` hatch never applies), tabular numerals on axis labels (`rnr-num`), "nice" ticks with a zero baseline that handles negative sums, bars or one polyline with point markers, at most 24 groups. No chart library: a single-series bar/line needs about 120 lines, and Recharts or Chart.js would add 100–200 kB for features the spec excludes. Every chart has a "Show as table" toggle rendering the same numbers in an `rnr-table`, and its SVG is `role="img"` with a text summary.
  15. **Old Phase 3 pending `generate_pdf` events stay as history** ("PDF not made: recorded before reports were available."). No workflow had a template then, so there is nothing to render; people press "Generate PDF". From this phase the action needs the workflow's report template; a workflow with none stops the record with "This path makes a PDF, but the workflow has no report template. Ask a reports manager to set one up." (a runtime check, not a publish check: templates are edited by `reports.manage`, not by the workflow editor).
  16. **Task order:** the database task runs first so `database.types.ts` knows the new tables; the shared module next; then the backend (engine, `render-pdfs`, `run-report`) and, once the designer's spec is in, the frontend can run in parallel with it.
- **Shared module rules:** files under `supabase/functions/_shared/reports/` import only each other, `../forms/*.ts` and `../workflow/*.ts`, always with the `.ts` extension. No `Deno.*`, `process`, `window`, npm or jsr imports; erasable TypeScript only; tests use `node:test` + `node:assert/strict` and run under node and Deno. `pdf-lib` code (`render-pdfs/render.ts`) stays outside `_shared/`.
- **Defect classes from Phase 1–4 QA that must not recur:**
  - **no silent truncation** (QA-P4-1): the 10,000-record cap refuses with 413; every limit that trims what a person sees is stated on screen with the full count; `run-report` tests pin totals and the cap;
  - **no raw error leaks** (QA-P4-3): `record_pdfs.error`, timeline events and every 500 carry fixed plain sentences; exception detail goes to `console.error` only; storage and PostgREST errors are never echoed;
  - every client-visible write is audited (QA-7): `report_template.*`, `report.*`, `widget.create/delete` by trigger, `dashboard.layout` and `record.pdf_request` in their RPCs;
  - no `security definer` function callable by clients unless meant to be (QA-5): `wake_render_pdfs` and every trigger function are revoked from `public, anon, authenticated`; `request_record_pdf` and `save_dashboard_layout` check permission themselves;
  - every new server message reaching `friendlyError` has an entry in `src/ui/errors.ts` with a test (QA-11);
  - TanStack Query keys carry `orgId`, and per-person results carry `userId` (QA-2): `['report-template', workflowId]`, `['record-pdfs', recordId]`, `['reports', orgId]`, `['report', id]`, `['report-run', userId, orgId, key]`, `['widgets', orgId]`;
  - a write RLS turns into 0 rows is reported (`.select()` on every update/delete); report and template saves detect concurrent edits on `updated_at` (Phase 2 pattern);
  - focus moves to the page heading when the row that triggered an action disappears (QA-8): report delete, widget remove; focus is kept on the drag handle during keyboard reorder (Phase 2 builder) and moved with `useFocusAfterRender`;
  - unsaved report and template edits are guarded on hash change, sign-out and org switch (QA-P2-4): `setNavGuard` + `guarded()`;
  - **no inline `style` props** (QA-P4-5): every new style is an `rnr-*` class in `src/index.css`; the only allowed `style` is computed geometry with no token equivalent — dnd-kit's `transform`/`transition` on the dragged widget, as `FieldList.tsx` already does (widget spans are Tailwind `col-span` classes, which `bundle.css` does not set, so no layer trap) — and the designer lists it; SVG geometry uses attributes, not `style`;
  - **the layer trap** (Phase 3/4 design specs): `bundle.css` is unlayered and beats Tailwind utilities — never `rnr-card p-0`, `rnr-menu w-…`, `td.flex`; use the classes the designer adds (`rnr-table-card`, `rnr-card-open` already exist);
  - a two-tab race shows the moved-on state (QA-P3-6): a stale dashboard layout reloads with a sentence; a report saved elsewhere shows the conflict;
  - `shortcut:` notes always name the limit and when to upgrade.
- New dependencies: `npm:pdf-lib@1.17.1` and `npm:@pdf-lib/fontkit@1.1.1` in Deno only (locked in `deno.lock`); none in `package.json`. No new secret; `render-pdfs` uses the existing `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET`.
- The Senior Designer's `docs/superpowers/design/phase-5-screens.md` (Task 7) is written before Tasks 8, 9 and 10. Where it differs from this plan on a visual, copy or accessibility point, the design spec wins; behaviour, data and security stay as this plan says.

## Review Focus

1. **A report never shows a record the runner cannot see** → member sees what they started, submitted to or hold a task on; `records.view_all` sees all; `workflow_access.can_view_all = false` narrows it back; a Viewer sees none; another org's member is refused. (test "real Supabase: a report returns only the records the caller can see" in Task 6, which runs the real handler with `callerSource` over each seeded user's own JWT; the function has no service-role client)
2. **Group and sum are right with nulls and non-numbers** → counts per group, "No answer" group last, numeric-string/text/boolean values left out and counted, a group with no numbers is `null`, 0.1 + 0.2 = 0.3, repeating paths sum every row. (tests "groups count records, empty keys go last as No answer", "sum adds numbers only and counts what it left out", "a group with no numbers sums to null", "sums are rounded so 0.1 + 0.2 is 0.3", "a repeating path sums every row" in Task 2)
3. **CSV cannot inject formulas or break rows** → quotes, commas and line breaks quoted, `=`, `+`, `-`, `@`, TAB, CR prefixed with `'` in data and headers, numbers untouched, BOM + CRLF. (tests "csv quotes commas, quotes and line breaks", "csv guards cells that start a formula, headers included", "csv writes numbers as numbers" in Task 2; "csv export returns every row, not a page" in Task 6)
4. **A PDF covers every field type, long text, signatures and hidden fields** → all 11 answerable types render, an 11,000-character answer wraps inside the margins and breaks onto further pages, signatures are embedded images, a hidden field never appears, a missing signature fails the job at once. (tests "the model renders every field type and omits hidden fields", "long text wraps inside the margin and breaks pages", "sign-off lists name, outcome, UTC time and signature" in Task 3; "renders a valid multi-page PDF with embedded signatures" and "a missing signature fails at once and stops an open record" in Task 5)
5. **Cross-org isolation** → Beta reads and edits no Alpha template, saved report or widget, cannot request an Alpha PDF, cannot read an Alpha PDF object, and a PDF path whose org folder does not match the record's org is unreadable. (`08_reports.test.sql`, Task 1)
6. **Pagination totals are explicit** → `total` and `totalRecords` are the full counts on every page, a page past the end has no rows and the same totals, more than 10,000 visible records is 413. (tests "rows are paged with the full total", "a page past the end keeps the totals" in Task 2; "more than 10,000 records is refused, never cut" in Task 6)
7. **A failing PDF is never silent** → retried at 1 and 2 minutes, then `failed` with a plain reason, an `error` event, a bell notice and an open record in `error`; closed records keep their status; a dead worker's lease expires and the job is failed. (tests in Task 5)

---

## Owners and order

| Task | Owner | Depends on |
|---|---|---|
| 1. Database: templates, PDF jobs, bucket, saved reports, widgets, RPCs, cron | Backend engineer | — |
| 2. Shared: report definitions, column catalogue, runner, CSV | Backend engineer | 1 |
| 3. Shared: PDF model and page layout | Backend engineer | 2 |
| 4. Engine: `generate_pdf` queues a real job | Backend engineer | 1, 3 |
| 5. Edge Function `render-pdfs`: worker, pdf-lib renderer, fonts | Backend engineer | 3, 4 |
| 6. Edge Function `run-report`: execution as the caller, paging, CSV | Backend engineer | 2 |
| 7. Design spec `phase-5-screens.md` | Senior Designer | — (parallel with 1–6) |
| 8. Frontend: data layer, routes, record PDF panel, template editor, timeline | Frontend engineer | 1, 2, 7 |
| 9. Frontend: Reports list, builder, results, CSV | Frontend engineer | 6, 8 |
| 10. Frontend: Dashboard grid, widgets, SVG chart, end-to-end check | Frontend engineer | 5, 9 |

Backend runs 1 → 2 → 3 → 4 → 5, and 6 any time after 2; the designer runs 7 alongside; the frontend engineer starts 8 once 1, 2 and 7 are committed, then 9 once 6 is in, then 10 once the backend is done.

---

## File Structure

```
supabase/migrations/20261016000001_reports.sql           tables, bucket + policy, RPCs, audit, wake + cron
supabase/tests/08_reports.test.sql
supabase/seed.sql                                        render_pdfs_url Vault secret; Leave approval template + a saved report + widgets
supabase/config.toml                                     [functions.render-pdfs] verify_jwt = false + static_files
src/data/database.types.ts                               regenerated (pnpm db:types)
supabase/functions/_shared/reports/definition.ts         META_KEYS, META_LABELS, Column, Aggregate, ReportDef, readReportDef, ReportTemplate, readTemplate
supabase/functions/_shared/reports/catalogue.ts          stepFields, dataColumns, filterScope, columnLabel
supabase/functions/_shared/reports/run.ts                ReportRecord, Cell, cellOf, runReport, PAGE_SIZE, MAX_PAGE_SIZE
supabase/functions/_shared/reports/csv.ts                csvCell, toCsv
supabase/functions/_shared/reports/pdf.ts                PdfSource, PdfModel, buildPdfModel, formatWhen
supabase/functions/_shared/reports/layout.ts             PAGE, Measure, Op, wrapText, layoutPdf
supabase/functions/_shared/reports/index.ts              re-exports
supabase/functions/_shared/reports/fixture.ts            ALL_TYPES form, records, a 1x1 PNG
supabase/functions/_shared/reports/run.test.ts           node + deno
supabase/functions/_shared/reports/csv.test.ts           node + deno
supabase/functions/_shared/reports/pdf.test.ts           node + deno
supabase/functions/advance/engine.ts                     Tx PDF methods; generate_pdf queues
supabase/functions/advance/pgStore.ts                    PDF Tx methods
supabase/functions/advance/testkit.ts                    templates, pdf jobs in the fake
supabase/functions/advance/engine.test.ts                + generate_pdf tests
supabase/functions/render-pdfs/fonts/Inter-Regular.ttf, Inter-SemiBold.ttf, OFL.txt
supabase/functions/render-pdfs/render.ts                 Fonts, renderPdf
supabase/functions/render-pdfs/render.test.ts
supabase/functions/render-pdfs/handler.ts                renderPdfs, MAX_PDF_ATTEMPTS, pdfBackoffMs
supabase/functions/render-pdfs/handler.test.ts
supabase/functions/render-pdfs/index.ts
supabase/functions/run-report/handler.ts                 runReportRequest, ReportSource, MAX_SCAN
supabase/functions/run-report/handler.test.ts
supabase/functions/run-report/source.ts                  callerSource (supabase-js with the caller's JWT)
supabase/functions/run-report/visibility.test.ts         real Supabase, runs only with RNR_TEST_* env
supabase/functions/run-report/index.ts
docs/superpowers/design/phase-5-screens.md               designer spec (Task 7)
src/reports/logic.ts                                     re-exports the shared reports module for Vite
src/reports/api.ts                                       templates, PDFs, saved reports, run, widgets, layout
src/reports/chart.ts, chart.test.ts                      niceTicks, chartGeometry (pure)
src/reports/PdfPanel.tsx                                 record page: latest PDF, Generate / Try again
src/reports/ReportTemplatePage.tsx                       #/workflows/<id>/report
src/reports/ReportsPage.tsx                              list, New report dialog, delete
src/reports/ReportPage.tsx                               builder + results + CSV
src/reports/ResultTable.tsx                              rows or groups table, pager
src/reports/DashboardPage.tsx                            grid, edit layout, add widget
src/reports/Widget.tsx                                   number / table / chart widget body
src/reports/ChartWidget.tsx                              SVG chart + table alternative
src/records/RecordPage.tsx                               PdfPanel
src/records/timeline.ts, timeline.test.ts                generate_pdf sentences
src/workflows/canvas/SidePanel.tsx                       Generate PDF active
src/workflows/WorkflowsPage.tsx                          "Report template" link for reports.manage
src/rbac/route.ts, route.test.ts                         reports, report, dashboard, workflow-report routes
src/ui/errors.ts, errors.test.ts                         report and PDF messages
src/ui/icons.tsx                                         ChartIcon, DownloadIcon
src/index.css                                            rnr-dash, rnr-chart, rnr-pager classes (designer §11)
src/App.tsx                                              routes, nav (Dashboard, Reports)
README.md                                                render-pdfs, fonts, run-report, tests
```

---

### Task 1: Database — templates, PDF jobs, bucket, saved reports, widgets, RPCs, cron

**Owner:** Backend engineer · **Depends on:** —

**Files:**
- Create: `supabase/migrations/20261016000001_reports.sql`, `supabase/tests/08_reports.test.sql`
- Modify: `supabase/seed.sql`, `supabase/config.toml`, `src/data/database.types.ts` (regenerated)

**Interfaces:**
- Consumes: `orgs`, `workflows`, `records`, `form_submissions` (Phases 1–3), `is_member(uuid)`, `has_permission(uuid, text)`, `record_visible(uuid)`, `storage_path_org(text)`, `audit(uuid, text, text, jsonb, jsonb)`, the `pg_cron` / `pg_net` / Vault pattern of `send-messages` (Phase 4).
- Produces:
  - tables `report_templates(id, org_id, workflow_id unique, header, fields jsonb, signoff jsonb, updated_by, created_at, updated_at)`, `record_pdfs(id, org_id, record_id, requested_by, status, attempts, next_attempt_at, path, error, created_at, finished_at)`, `saved_reports(id, org_id, workflow_id, name, columns jsonb, filters jsonb, group_by jsonb, aggregate jsonb, created_by, updated_by, created_at, updated_at)`, `dashboard_widgets(id, org_id, report_id, kind, title, span, position, created_at)`
  - bucket `record-pdfs` (private, 20 MB, `application/pdf`), function `storage_path_record(text) returns uuid`, policy `record_pdfs_read`
  - `request_record_pdf(p_record uuid) returns uuid` (definer; errors "Not allowed" 42501, "This workflow has no report template yet.")
  - `save_dashboard_layout(p_org uuid, p_layout jsonb) returns void` (definer; errors "Not allowed" 42501, "The dashboard changed. Reload to see the latest layout.")
  - `wake_render_pdfs() returns void` (definer, revoked from clients); cron job `render-pdfs`; Vault secret `render_pdfs_url` (seed)

- [ ] **Step 1: Write the failing test** — `supabase/tests/08_reports.test.sql`

```sql
begin;
select plan(40);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

\set alpha 0000000a-0000-0000-0000-000000000001
\set beta 0000000b-0000-0000-0000-000000000001
\set wf 0000000a-0000-0000-0000-00000000c001
\set rec 0000000a-0000-0000-0000-00000000d0f1
\set rec2 0000000a-0000-0000-0000-00000000d0f2
\set rep 0000000a-0000-0000-0000-00000000e0f1
\set wid 0000000a-0000-0000-0000-00000000e0f2
\set wid2 0000000a-0000-0000-0000-00000000e0f3
\set admin 00000000-0000-0000-0000-0000000000a2
\set member 00000000-0000-0000-0000-0000000000a3
\set viewer 00000000-0000-0000-0000-0000000000a4
\set betaowner 00000000-0000-0000-0000-0000000000b1

reset role;
delete from report_templates where workflow_id = :'wf'; -- the seed adds a template and widgets; this file builds its own
delete from dashboard_widgets where org_id = :'alpha';
insert into records (id, org_id, workflow_id, title, current_node_id, status, started_by)
values (:'rec', :'alpha', :'wf', 'Leave approval: Test', null, 'done', :'member'),
       (:'rec2', :'alpha', :'wf', 'Leave approval: Admin', null, 'done', :'admin');

-- PDF request without a template is refused with a sentence
select pg_temp.act_as(:'member');
select throws_ok(format($$ select request_record_pdf(%L) $$, :'rec'), 'P0001', 'This workflow has no report template yet.', 'no template, no PDF');

-- Report templates: reports.view reads, reports.manage writes, Beta sees nothing
select throws_ok(format($$ insert into report_templates (org_id, workflow_id, header) values (%L, %L, 'x') $$, :'alpha', :'wf'),
  '42501', null, 'a member cannot create a report template');
select pg_temp.act_as(:'admin');
select lives_ok(format($$ insert into report_templates (org_id, workflow_id, header, fields, signoff)
  values (%L, %L, 'Leave record', '[{"nodeId":"start","key":"name"}]', '["approve"]') $$, :'alpha', :'wf'), 'reports.manage creates a template');
select isnt_empty(format($$ select 1 from audit_log where action = 'report_template.create' and org_id = %L $$, :'alpha'), 'template create audited');
select throws_ok(format($$ insert into report_templates (org_id, workflow_id) values (%L, %L) $$, :'alpha', :'wf'),
  '23505', null, 'one template per workflow');
select throws_ok(format($$ update report_templates set org_id = %L where workflow_id = %L $$, :'beta', :'wf'), '42501', null, 'a template cannot move org');
select pg_temp.act_as(:'member');
select is((select count(*)::int from report_templates where workflow_id = :'wf'), 1, 'reports.view reads the template');
select is_empty(format($$ update report_templates set header = 'x' where workflow_id = %L returning id $$, :'wf'), 'a member cannot edit it');
select pg_temp.act_as(:'betaowner');
select is((select count(*)::int from report_templates where org_id = :'alpha'), 0, 'beta reads no alpha templates');
select is_empty(format($$ update report_templates set header = 'x' where org_id = %L returning id $$, :'alpha'), 'beta cannot edit alpha templates');

-- PDF jobs: who may request, one queued job per record, visibility of the job rows
select pg_temp.act_as(:'member');
select isnt(request_record_pdf(:'rec'), null::uuid, 'the starter requests a PDF');
select is(request_record_pdf(:'rec'), (select id from record_pdfs where record_id = :'rec' and status = 'queued'), 'a second request returns the queued job');
select is((select count(*)::int from record_pdfs where record_id = :'rec'), 1, 'still one job');
select isnt_empty(format($$ select 1 from audit_log where action = 'record.pdf_request' and target = %L $$, :'rec'), 'request audited');
select throws_ok(format($$ select request_record_pdf(%L) $$, :'rec2'), '42501', null, 'a member cannot request a PDF for a record they cannot see');
select is((select count(*)::int from record_pdfs where record_id = :'rec2'), 0, 'and cannot see its jobs');
select throws_ok(format($$ insert into record_pdfs (org_id, record_id) values (%L, %L) $$, :'alpha', :'rec'), '42501', null, 'clients cannot queue jobs directly');
select pg_temp.act_as(:'viewer');
select throws_ok(format($$ select request_record_pdf(%L) $$, :'rec'), '42501', null, 'a viewer who cannot see the record cannot request');
select pg_temp.act_as(:'admin');
select isnt(request_record_pdf(:'rec2'), null::uuid, 'records.view_all requests any record');
select pg_temp.act_as(:'betaowner');
select throws_ok(format($$ select request_record_pdf(%L) $$, :'rec'), '42501', null, 'beta cannot request an alpha PDF');
select is((select count(*)::int from record_pdfs), 0, 'beta reads no alpha jobs');

-- PDF objects: readable exactly where the record is visible, never across orgs
reset role;
insert into storage.objects (bucket_id, name) values
  ('record-pdfs', :'alpha' || '/' || :'rec' || '/a.pdf'),
  ('record-pdfs', :'beta' || '/' || :'rec' || '/forged.pdf');
select pg_temp.act_as(:'member');
select results_eq($$ select name from storage.objects where bucket_id = 'record-pdfs' $$,
  format($$ values (%L::text) $$, :'alpha' || '/' || :'rec' || '/a.pdf'), 'the starter reads the PDF, not a forged org path');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('record-pdfs', %L) $$, :'alpha' || '/' || :'rec' || '/b.pdf'),
  '42501', null, 'clients cannot upload PDFs');
select pg_temp.act_as(:'viewer');
select is_empty($$ select 1 from storage.objects where bucket_id = 'record-pdfs' $$, 'a viewer who cannot see the record cannot read its PDF');
select pg_temp.act_as(:'betaowner');
select is_empty($$ select 1 from storage.objects where bucket_id = 'record-pdfs' $$, 'beta reads no alpha PDF');

-- Saved reports: reports.view reads, reports.manage writes
select pg_temp.act_as(:'member');
select throws_ok(format($$ insert into saved_reports (org_id, workflow_id, name, columns) values (%L, %L, 'x', '[{"meta":"title"}]') $$, :'alpha', :'wf'),
  '42501', null, 'a member cannot save a report');
select pg_temp.act_as(:'admin');
select lives_ok(format($$ insert into saved_reports (id, org_id, workflow_id, name, columns, group_by, aggregate)
  values (%L, %L, %L, 'Leave by type', '[{"field":"leave_type"}]', '{"field":"leave_type"}', '{"fn":"count"}') $$, :'rep', :'alpha', :'wf'),
  'reports.manage saves a report');
select isnt_empty(format($$ select 1 from audit_log where action = 'report.create' and target = %L $$, :'rep'), 'report save audited');
select pg_temp.act_as(:'viewer');
select is((select count(*)::int from saved_reports where id = :'rep'), 1, 'reports.view reads saved reports');
select is_empty(format($$ delete from saved_reports where id = %L returning id $$, :'rep'), 'reports.view cannot delete them');
select pg_temp.act_as(:'betaowner');
select is((select count(*)::int from saved_reports where org_id = :'alpha'), 0, 'beta reads no alpha reports');

-- Widgets and the layout RPC
select pg_temp.act_as(:'admin');
select lives_ok(format($$ insert into dashboard_widgets (id, org_id, report_id, kind, title, span, position) values
  (%L, %L, %L, 'number', 'Leave records', 1, 1), (%L, %L, %L, 'bar', 'By type', 2, 2) $$,
  :'wid', :'alpha', :'rep', :'wid2', :'alpha', :'rep'), 'reports.manage adds widgets');
select lives_ok(format($$ select save_dashboard_layout(%L, %L::jsonb) $$, :'alpha',
  json_build_array(json_build_object('id', :'wid2', 'span', 4), json_build_object('id', :'wid', 'span', 1))::text), 'reports.manage saves a layout');
select results_eq(format($$ select id::text, span, position from dashboard_widgets where org_id = %L order by position $$, :'alpha'),
  format($$ values (%L::text, 4, 1), (%L::text, 1, 2) $$, :'wid2', :'wid'), 'order and widths applied');
select isnt_empty(format($$ select 1 from audit_log where action = 'dashboard.layout' and org_id = %L $$, :'alpha'), 'layout audited');
select throws_ok(format($$ select save_dashboard_layout(%L, %L::jsonb) $$, :'alpha', json_build_array(json_build_object('id', :'wid', 'span', 1))::text),
  'P0001', 'The dashboard changed. Reload to see the latest layout.', 'a stale layout is refused');
select pg_temp.act_as(:'member');
select is((select count(*)::int from dashboard_widgets where org_id = :'alpha'), 2, 'reports.view sees the dashboard');
select throws_ok(format($$ select save_dashboard_layout(%L, '[]'::jsonb) $$, :'alpha'), '42501', null, 'a member cannot change the layout');
select pg_temp.act_as(:'betaowner');
select is((select count(*)::int from dashboard_widgets where org_id = :'alpha'), 0, 'beta sees no alpha widgets');

-- The worker's wake-up
reset role;
select isnt_empty($$ select 1 from cron.job where jobname = 'render-pdfs' $$, 'the render-pdfs cron job exists');

select * from finish();
rollback;
```

- [ ] **Step 2: Run — expect FAIL**

Run: `supabase test db`
Expected: `08_reports.test.sql` fails at `relation "report_templates" does not exist`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261016000001_reports.sql`

```sql
-- Phase 5: report templates and PDF jobs (spec §9.1), saved reports (§9.2), the dashboard (§9.3).

create table report_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  workflow_id uuid not null unique, -- one template per workflow (spec §13: never several)
  header text not null default '' check (length(header) <= 2000),
  fields jsonb not null default '[]' check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) <= 100),
  signoff jsonb not null default '[]' check (jsonb_typeof(signoff) = 'array' and jsonb_array_length(signoff) <= 20),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workflow_id, org_id) references workflows (id, org_id) on delete cascade
);

create table record_pdfs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  record_id uuid not null,
  requested_by uuid references auth.users(id) on delete set null, -- null when a workflow action queued it
  status text not null default 'queued' check (status in ('queued', 'done', 'failed')),
  attempts int not null default 0 check (attempts between 0 and 3),
  next_attempt_at timestamptz not null default now(),
  path text check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'),
  error text check (length(error) <= 500),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check ((status = 'done') = (path is not null)),
  foreign key (record_id, org_id) references records (id, org_id) on delete cascade
);
create index record_pdfs_record_idx on record_pdfs (record_id, created_at desc);
create index record_pdfs_due_idx on record_pdfs (next_attempt_at) where status = 'queued';
create unique index record_pdfs_one_queued on record_pdfs (record_id) where status = 'queued';

create table saved_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  workflow_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  columns jsonb not null default '[]' check (jsonb_typeof(columns) = 'array'),
  filters jsonb not null default '[]' check (jsonb_typeof(filters) = 'array'),
  group_by jsonb check (group_by is null or jsonb_typeof(group_by) = 'object'),
  aggregate jsonb check (aggregate is null or jsonb_typeof(aggregate) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (workflow_id, org_id) references workflows (id, org_id) on delete cascade
);
create index saved_reports_org_idx on saved_reports (org_id, name);

create table dashboard_widgets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  report_id uuid not null,
  kind text not null check (kind in ('number', 'table', 'bar', 'line')),
  title text not null check (length(btrim(title)) between 1 and 80),
  span int not null default 1 check (span in (1, 2, 4)), -- design/README: widgets span 1, 2 or 4 columns
  position int not null default 0,
  created_at timestamptz not null default now(),
  foreign key (report_id, org_id) references saved_reports (id, org_id) on delete cascade
);
create index dashboard_widgets_org_idx on dashboard_widgets (org_id, position);

alter table report_templates enable row level security;
alter table record_pdfs enable row level security;
alter table saved_reports enable row level security;
alter table dashboard_widgets enable row level security;

create policy report_templates_read on report_templates for select
  using (has_permission(org_id, 'reports.view') or has_permission(org_id, 'reports.manage'));
create policy report_templates_insert on report_templates for insert with check (has_permission(org_id, 'reports.manage'));
create policy report_templates_update on report_templates for update
  using (has_permission(org_id, 'reports.manage')) with check (has_permission(org_id, 'reports.manage'));
create policy report_templates_delete on report_templates for delete using (has_permission(org_id, 'reports.manage'));

-- A job is part of its record: whoever sees the record sees whether its PDF is ready.
create policy record_pdfs_read on record_pdfs for select using (record_visible(record_id));
-- No write policies: advance and request_record_pdf queue, render-pdfs (direct connection) finishes.

create policy saved_reports_read on saved_reports for select
  using (has_permission(org_id, 'reports.view') or has_permission(org_id, 'reports.manage'));
create policy saved_reports_insert on saved_reports for insert with check (has_permission(org_id, 'reports.manage'));
create policy saved_reports_update on saved_reports for update
  using (has_permission(org_id, 'reports.manage')) with check (has_permission(org_id, 'reports.manage'));
create policy saved_reports_delete on saved_reports for delete using (has_permission(org_id, 'reports.manage'));

create policy dashboard_widgets_read on dashboard_widgets for select
  using (has_permission(org_id, 'reports.view') or has_permission(org_id, 'reports.manage'));
create policy dashboard_widgets_insert on dashboard_widgets for insert with check (has_permission(org_id, 'reports.manage'));
create policy dashboard_widgets_delete on dashboard_widgets for delete using (has_permission(org_id, 'reports.manage'));
-- No update policy: order and width change only through save_dashboard_layout.

create or replace function reports_before_write() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.org_id is distinct from old.org_id then raise exception 'Not allowed' using errcode = '42501'; end if;
    new.created_at := old.created_at;
  end if;
  if tg_table_name = 'saved_reports' and tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;
create trigger report_templates_before_write before insert or update on report_templates
  for each row execute function reports_before_write();
create trigger saved_reports_before_write before insert or update on saved_reports
  for each row execute function reports_before_write();

create or replace function audit_reports() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_kind text := case tg_table_name when 'report_templates' then 'report_template' when 'saved_reports' then 'report' else 'widget' end;
  v_op text := case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end;
begin
  perform audit(coalesce(new.org_id, old.org_id), v_kind || '.' || v_op, coalesce(new.id, old.id)::text,
    case when tg_op = 'INSERT' then null else to_jsonb(old) - 'org_id' end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) - 'org_id' end);
  return null;
end $$;
create trigger report_templates_audit after insert or update or delete on report_templates
  for each row execute function audit_reports();
create trigger saved_reports_audit after insert or update or delete on saved_reports
  for each row execute function audit_reports();
-- Layout moves are audited once by save_dashboard_layout, not per row.
create trigger dashboard_widgets_audit after insert or delete on dashboard_widgets
  for each row execute function audit_reports();

-- PDFs: <org_id>/<record_id>/<job_id>.pdf, private; only the service role writes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('record-pdfs', 'record-pdfs', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

-- Plain SQL like storage_path_org: the record folder of a PDF path, null when the path is not ours.
create or replace function storage_path_record(p_name text) returns uuid language sql immutable as $$
  select case when p_name ~ '^[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    then split_part(p_name, '/', 2)::uuid end
$$;

create policy record_pdfs_read on storage.objects for select to authenticated
  using (bucket_id = 'record-pdfs'
    and public.record_visible(public.storage_path_record(name))
    and public.storage_path_org(name) = (select r.org_id from public.records r where r.id = public.storage_path_record(name)));
-- No insert/update/delete policies on record-pdfs: render-pdfs uploads with the service role.

-- Wakes render-pdfs now instead of at the next cron minute. pg_net sends after commit, so a rolled-back step never wakes it.
create or replace function wake_render_pdfs() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'render_pdfs_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb);
end $$;

create or replace function request_record_pdf(p_record uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_r records; v_id uuid;
begin
  select * into v_r from records where id = p_record;
  if v_r.id is null or not record_visible(p_record) or not has_permission(v_r.org_id, 'reports.view') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from report_templates where workflow_id = v_r.workflow_id) then
    raise exception 'This workflow has no report template yet.';
  end if;
  insert into record_pdfs (org_id, record_id, requested_by) values (v_r.org_id, p_record, auth.uid())
  on conflict (record_id) where status = 'queued' do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from record_pdfs where record_id = p_record and status = 'queued';
    return v_id; -- already queued: no second audit row or wake-up
  end if;
  perform audit(v_r.org_id, 'record.pdf_request', p_record::text, null, jsonb_build_object('job', v_id));
  perform wake_render_pdfs();
  return v_id;
end $$;

create or replace function save_dashboard_layout(p_org uuid, p_layout jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if not has_permission(p_org, 'reports.manage') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if jsonb_typeof(p_layout) <> 'array'
     or exists (select 1 from jsonb_array_elements(p_layout) e
                where jsonb_typeof(e->'id') <> 'string' or coalesce(e->>'span', '') not in ('1', '2', '4'))
     or (select array_agg((e->>'id') order by e->>'id') from jsonb_array_elements(p_layout) e)
        is distinct from (select array_agg(id::text order by id::text) from dashboard_widgets where org_id = p_org)
  then
    raise exception 'The dashboard changed. Reload to see the latest layout.';
  end if;
  select jsonb_agg(jsonb_build_object('id', id, 'span', span) order by position) into v_before from dashboard_widgets where org_id = p_org;
  update dashboard_widgets w set position = l.ord, span = (l.e->>'span')::int
  from jsonb_array_elements(p_layout) with ordinality l(e, ord)
  where w.org_id = p_org and w.id = (l.e->>'id')::uuid;
  perform audit(p_org, 'dashboard.layout', p_org::text, v_before, p_layout);
end $$;

revoke execute on function wake_render_pdfs(), reports_before_write(), audit_reports() from public, anon, authenticated;
revoke execute on function request_record_pdf(uuid), save_dashboard_layout(uuid, jsonb) from public, anon;

-- Every minute: pick up retries and anything a missed wake-up left behind.
select cron.schedule('render-pdfs', '* * * * *', $cron$
  select public.wake_render_pdfs()
  where exists (select 1 from public.record_pdfs where status = 'queued' and next_attempt_at <= now())
$cron$);
```

- [ ] **Step 4: Seed and config**

Append to `supabase/seed.sql`:
```sql
-- Phase 5: pg_cron / request_record_pdf → render-pdfs (local value only; hosted projects set their own, see README).
select vault.create_secret('http://host.docker.internal:54321/functions/v1/render-pdfs', 'render_pdfs_url');

-- The seeded Leave approval gets a report template, a saved report and a two-widget dashboard.
insert into report_templates (org_id, workflow_id, header, fields, signoff, updated_by) values
  ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-00000000c001',
   E'Leave record\nAlpha School, Human Resources',
   '[{"nodeId":"start","key":"name"},{"nodeId":"start","key":"leave_type"},{"nodeId":"start","key":"reason"},
     {"nodeId":"start","key":"start"},{"nodeId":"start","key":"end"},{"nodeId":"start","key":"days"},
     {"nodeId":"start","key":"claims"},{"nodeId":"start","key":"total"},{"nodeId":"approve","key":"comment"}]',
   '["start","approve"]', '00000000-0000-0000-0000-0000000000a1');
insert into saved_reports (id, org_id, workflow_id, name, columns, filters, group_by, aggregate, created_by, updated_by) values
  ('0000000a-0000-0000-0000-00000000e001', '0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-00000000c001',
   'Leave days by type', '[{"meta":"title"},{"field":"leave_type"},{"field":"days"},{"meta":"status"}]', '[]',
   '{"field":"leave_type"}', '{"fn":"sum","field":"days"}', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1');
insert into dashboard_widgets (org_id, report_id, kind, title, span, position) values
  ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-00000000e001', 'number', 'Leave days taken', 1, 1),
  ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-00000000e001', 'bar', 'Leave days by type', 2, 2);
```

Append to `supabase/config.toml`, after `[functions.send-messages]`:
```toml
[functions.render-pdfs]
verify_jwt = false
static_files = ["./functions/render-pdfs/fonts/*.ttf"]

[functions.run-report]
verify_jwt = true
```

- [ ] **Step 5: Run — expect PASS**

Run: `supabase db reset && supabase test db`
Expected: `All tests successful.` — 8 files, 198 tests (158 + 40).

- [ ] **Step 6: Regenerate types**

Run: `pnpm db:types && pnpm build`
Expected: `src/data/database.types.ts` gains `report_templates`, `record_pdfs`, `saved_reports`, `dashboard_widgets`, `request_record_pdf`, `save_dashboard_layout`; the build passes with `check-dist: ok`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261016000001_reports.sql supabase/tests/08_reports.test.sql supabase/seed.sql supabase/config.toml src/data/database.types.ts
git commit -m "feat: add report templates, pdf jobs, saved reports and dashboard widgets"
```

---
### Task 2: Shared — report definitions, column catalogue, runner, CSV

**Owner:** Backend engineer · **Depends on:** 1

**Files:**
- Create: `supabase/functions/_shared/reports/definition.ts`, `catalogue.ts`, `run.ts`, `csv.ts`, `index.ts`, `fixture.ts`, `run.test.ts`, `csv.test.ts`

**Interfaces:**
- Consumes: `evaluate`, `readPath`, `parsePath`, `OPERATORS`, `KEY_RE`, `Field`, `FieldType`, `Rule`, `Answers` (`_shared/forms`); `Graph`, `nodeName`, `ID_RE` (`_shared/workflow/graph.ts`).
- Produces:
  - `META_KEYS`, `type MetaKey`, `META_LABELS: Record<MetaKey, string>`, `type Column = { meta: MetaKey } | { field: string }`, `type Aggregate = { fn: 'count' } | { fn: 'sum'; field: string }`, `type ReportDef = { columns: Column[]; filters: Rule[]; groupBy: Column | null; aggregate: Aggregate | null }`, `type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }`, `readColumn(v: unknown): Column | null`, `columnId(c: Column): string`, `readReportDef(raw: { columns?: unknown; filters?: unknown; group_by?: unknown; aggregate?: unknown }): Parsed<ReportDef>`, `type ReportTemplate = { header: string; fields: { nodeId: string; key: string }[]; signoff: string[] }`, `readTemplate(raw: { header?: unknown; fields?: unknown; signoff?: unknown }): ReportTemplate | null`, `MAX_COLUMNS = 20`, `MAX_FILTERS = 10`
  - `type StepFields = { nodeId: string; step: string; fields: Field[] }`, `stepFields(graph: Graph, forms: ReadonlyMap<string, Field[]>): StepFields[]`, `type DataColumn = { path: string; label: string; type: FieldType }`, `dataColumns(steps: StepFields[]): DataColumn[]`, `filterScope(steps: StepFields[]): Field[]`, `columnLabel(c: Column, cols: DataColumn[]): string`, `aggregateLabel(a: Aggregate, cols: DataColumn[]): string`
  - `type ReportRecord`, `type Cell = string | number | null`, `type RunCtx = { now: Date; stepName(nodeId: string): string; personName(userId: string): string }`, `type Group = { key: Cell; count: number; sum: number | null; skipped: number }`, `type RowsResult`, `type GroupsResult`, `type RunResult = RowsResult | GroupsResult`, `cellOf(r: ReportRecord, c: Column, ctx: RunCtx): Cell`, `runReport(records: ReportRecord[], def: ReportDef, ctx: RunCtx, paging: { page: number; pageSize: number } | null): RunResult` (null = every row, for CSV), `PAGE_SIZE = 50`, `MAX_PAGE_SIZE = 100`, `STATUS_WORDS`
  - `csvCell(v: Cell): string`, `toCsv(header: string[], rows: Cell[][]): string`, `csvFilename(name: string, day: string): string`

- [ ] **Step 1: Write the fixture** — `supabase/functions/_shared/reports/fixture.ts`

```ts
import type { Answers, Field } from '../forms/index.ts'
import { ORG, PREFIX, USER } from '../forms/fixture.ts'
import type { Graph } from '../workflow/graph.ts'
import type { ReportRecord, RunCtx } from './run.ts'
import type { PdfSource } from './pdf.ts'

export { ORG, USER }
export const APPROVER = '00000000-0000-0000-0000-0000000000a2'
export const F_ALL = '0000000a-0000-0000-0000-0000000000f7'
export const F_OK = '0000000a-0000-0000-0000-0000000000f8'
export const SIG_PATH = `${PREFIX}sig.png`
export const APPROVER_SIG = `${ORG}/${APPROVER}/ok.png`

/** Every answerable field type, one hidden by show_if, and a page break that never prints. */
export const ALL_TYPES: Field[] = [
  { key: 'name', type: 'short_text', label: 'Full name' },
  { key: 'story', type: 'long_text', label: 'What happened' },
  { key: 'age', type: 'number', label: 'Age' },
  { key: 'when', type: 'date', label: 'Date' },
  { key: 'kind', type: 'single_select', label: 'Kind', options: ['Fall', 'Other'] },
  { key: 'details', type: 'short_text', label: 'Other details', show_if: { field: 'kind', operator: 'is', value: 'Other' } },
  { key: 'tags', type: 'multi_select', label: 'Tags', options: ['Urgent', 'Outdoor'] },
  { key: 'agree', type: 'checkbox', label: 'Confirmed' },
  { key: 'photo', type: 'file', label: 'Photo' },
  { key: 'pb', type: 'page_break', label: 'More' },
  {
    key: 'witnesses', type: 'group', label: 'Witnesses', repeat: { min: 0, max: 5 }, fields: [
      { key: 'who', type: 'short_text', label: 'Name' },
      { key: 'age', type: 'number', label: 'Age' },
    ],
  },
  { key: 'score', type: 'calculated', label: 'Score', expression: 'age + 1' },
  { key: 'sig', type: 'signature', label: 'Signature' },
]
export const OK_FORM: Field[] = [
  { key: 'comment', type: 'long_text', label: 'Comment' },
  { key: 'ok_sig', type: 'signature', label: 'Approver signature' },
]
export const ALL_ANSWERS: Answers = {
  name: 'Ada Lovelace', story: 'Slipped on the wet floor.', age: 34.5, when: '2026-10-12', kind: 'Fall',
  details: 'smuggled', tags: ['Urgent', 'Outdoor'], agree: true,
  photo: `${PREFIX}0f0e0d0c-0000-4000-8000-000000000001-floor.jpg`,
  witnesses: [{ who: 'Ben', age: 40 }, { who: 'Cy' }], score: 35.5, sig: SIG_PATH,
}

const at = { x: 0, y: 0 }
export const GRAPH: Graph = {
  nodes: [
    { id: 'start', type: 'start', formId: F_ALL, position: at },
    { id: 'approve', type: 'form', label: 'Manager approval', formId: F_OK, assignee: { user: APPROVER }, mode: 'approve', position: at },
    { id: 'done', type: 'end', status: 'done', position: at },
  ],
  edges: [
    { id: 'e1', from: 'start', outcome: 'submitted', to: 'approve', actions: [] },
    { id: 'e2', from: 'approve', outcome: 'approved', to: 'done', actions: [{ type: 'generate_pdf' }] },
  ],
}

const FIELD_KEYS = ['name', 'story', 'age', 'when', 'kind', 'details', 'tags', 'agree', 'photo', 'witnesses', 'score', 'sig']
export const SOURCE: PdfSource = {
  orgId: ORG, orgName: 'Alpha School', workflowName: 'Incident report', graph: GRAPH,
  record: { id: '0000000a-0000-0000-0000-00000000d001', title: 'Incident: Ada Lovelace', status: 'done', started_by: USER, created_at: '2026-10-12T08:30:00Z' },
  template: {
    header: 'Incident record\nAlpha School, Health and Safety',
    fields: [...FIELD_KEYS.map((key) => ({ nodeId: 'start', key })), { nodeId: 'approve', key: 'comment' }],
    signoff: ['start', 'approve'],
  },
  forms: { [F_ALL]: ALL_TYPES, [F_OK]: OK_FORM },
  submissions: [
    { node_id: 'start', answers: ALL_ANSWERS, submitted_by: USER, outcome: 'submitted', created_at: '2026-10-12T08:30:00Z' },
    { node_id: 'approve', answers: { comment: 'Seen.', ok_sig: APPROVER_SIG }, submitted_by: APPROVER, outcome: 'approved', created_at: '2026-10-12T14:05:00Z' },
  ],
  names: { [USER]: 'Ada Lovelace', [APPROVER]: 'Grace Hopper' },
}

/** A valid 1×1 PNG, for signatures in render tests. */
export const PNG_1X1 = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))

export const CTX: RunCtx = {
  now: new Date('2026-10-11T12:00:00Z'),
  stepName: (id) => (id === 'approve' ? 'Manager approval' : 'Start'),
  personName: (id) => (id === USER ? 'Ada Lovelace' : 'Former member'),
}
export const rec = (id: string, data: Answers, extra: Partial<ReportRecord> = {}): ReportRecord => ({
  id, title: `Leave: ${id}`, status: 'done', label: null, current_node_id: null, started_by: USER,
  created_at: '2026-10-01T09:00:00Z', updated_at: '2026-10-02T09:00:00Z', data, ...extra,
})
```

- [ ] **Step 2: Write the failing tests** — `supabase/functions/_shared/reports/run.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cellOf, runReport, type GroupsResult, type RowsResult } from './run.ts'
import { readReportDef, readTemplate, type Column, type ReportDef } from './definition.ts'
import { dataColumns } from './catalogue.ts'
import { CTX, rec } from './fixture.ts'

const def = (d: Partial<ReportDef>): ReportDef => ({ columns: [{ meta: 'title' }], filters: [], groupBy: null, aggregate: null, ...d })
const page1 = { page: 1, pageSize: 50 }

test('cells read answers, record details and repeating rows', () => {
  const r = rec('a', {
    name: 'Ada', days: 3, cover: ['Team lead', 'Peer'], agree: true, blank: '  ',
    claims: [{ item: 'Taxi', amount: 12.5 }, { item: 'Meal', amount: 8 }],
  }, { current_node_id: 'approve', status: 'open' })
  const cols: Column[] = [
    { field: 'name' }, { field: 'days' }, { field: 'cover' }, { field: 'agree' }, { field: 'claims[].item' }, { field: 'claims.count' },
    { field: 'blank' }, { field: 'missing' }, { meta: 'status' }, { meta: 'step' }, { meta: 'started_by' }, { meta: 'created_at' },
  ]
  assert.deepEqual(cols.map((c) => cellOf(r, c, CTX)),
    ['Ada', 3, 'Team lead, Peer', 'Yes', 'Taxi, Meal', 2, null, null, 'In progress', 'Manager approval', 'Ada Lovelace', '2026-10-01T09:00:00Z'])
})

test('filters use the shared rule operators and all must match', () => {
  const rows = [rec('a', { leave_type: 'Annual', days: 3 }), rec('b', { leave_type: 'Medical', days: 9 }), rec('c', { leave_type: 'Annual', days: 5 })]
  const r = runReport(rows, def({ filters: [{ field: 'leave_type', operator: 'is', value: 'Annual' }, { field: 'days', operator: 'gt', value: 4 }] }), CTX, page1) as RowsResult
  assert.deepEqual([r.rows.map((x) => x.id), r.total], [['c'], 1])
})

test('rows are paged with the full total', () => {
  const rows = Array.from({ length: 120 }, (_, i) => rec(`r${i}`, {}))
  const r = runReport(rows, def({}), CTX, { page: 2, pageSize: 50 }) as RowsResult
  assert.deepEqual([r.kind, r.rows.length, r.rows[0].id, r.rows[49].id, r.total, r.totalRecords, r.page], ['rows', 50, 'r50', 'r99', 120, 120, 2])
  assert.equal((runReport(rows, def({}), CTX, { page: 1, pageSize: 500 }) as RowsResult).pageSize, 100)
  const all = runReport(rows, def({}), CTX, null) as RowsResult
  assert.deepEqual([all.rows.length, all.total, all.pageSize], [120, 120, 120])
})

test('a page past the end keeps the totals', () => {
  const rows = Array.from({ length: 120 }, (_, i) => rec(`r${i}`, {}))
  const r = runReport(rows, def({}), CTX, { page: 4, pageSize: 50 }) as RowsResult
  assert.deepEqual([r.rows, r.total, r.page], [[], 120, 4])
})

test('groups count records, empty keys go last as No answer', () => {
  const rows = [rec('a', { t: 'Annual' }), rec('b', { t: 'Medical' }), rec('c', {}), rec('d', { t: 'Annual' }), rec('e', { t: '' })]
  const r = runReport(rows, def({ groupBy: { field: 't' }, aggregate: { fn: 'count' } }), CTX, page1) as GroupsResult
  assert.deepEqual(r.groups, [
    { key: 'Annual', count: 2, sum: null, skipped: 0 },
    { key: 'Medical', count: 1, sum: null, skipped: 0 },
    { key: null, count: 2, sum: null, skipped: 0 },
  ])
  assert.deepEqual([r.total, r.totalRecords, r.grandTotal], [3, 5, 5])
  const byNumber = runReport([rec('a', { n: 10 }), rec('b', { n: 2 }), rec('c', { n: 10 })], def({ groupBy: { field: 'n' }, aggregate: { fn: 'count' } }), CTX, page1) as GroupsResult
  assert.deepEqual(byNumber.groups.map((g) => g.key), [2, 10])
})

test('sum adds numbers only and counts what it left out', () => {
  const rows = [
    rec('a', { t: 'Annual', days: 3 }), rec('b', { t: 'Annual', days: '4' }), rec('c', { t: 'Annual', days: null }),
    rec('d', { t: 'Medical', days: 2 }), rec('e', { t: 'Medical', days: true }),
  ]
  const r = runReport(rows, def({ groupBy: { field: 't' }, aggregate: { fn: 'sum', field: 'days' } }), CTX, page1) as GroupsResult
  assert.deepEqual(r.groups, [
    { key: 'Annual', count: 3, sum: 3, skipped: 1 },
    { key: 'Medical', count: 2, sum: 2, skipped: 1 },
  ])
  assert.deepEqual([r.grandTotal, r.skipped], [5, 2])
})

test('a group with no numbers sums to null', () => {
  const r = runReport([rec('a', { t: 'Other', days: 'n/a' })], def({ groupBy: { field: 't' }, aggregate: { fn: 'sum', field: 'days' } }), CTX, page1) as GroupsResult
  assert.deepEqual([r.groups, r.grandTotal], [[{ key: 'Other', count: 1, sum: null, skipped: 1 }], null])
})

test('sums are rounded so 0.1 + 0.2 is 0.3', () => {
  const rows = [rec('a', { t: 'x', v: 0.1 }), rec('b', { t: 'x', v: 0.2 }), rec('c', { t: 'y', v: -1.5 }), rec('d', { t: 'y', v: 1 })]
  const r = runReport(rows, def({ groupBy: { field: 't' }, aggregate: { fn: 'sum', field: 'v' } }), CTX, page1) as GroupsResult
  assert.deepEqual(r.groups.map((g) => g.sum), [0.3, -0.5])
  assert.equal(r.grandTotal, -0.2)
})

test('a repeating path sums every row', () => {
  const rows = [rec('a', { claims: [{ amount: 12.5 }, { amount: 8 }] }), rec('b', { claims: [{ amount: 'x' }] })]
  const r = runReport(rows, def({ groupBy: { meta: 'status' }, aggregate: { fn: 'sum', field: 'claims[].amount' } }), CTX, page1) as GroupsResult
  assert.deepEqual(r.groups, [{ key: 'Done', count: 2, sum: 20.5, skipped: 1 }])
})

test('readReportDef refuses broken definitions with a sentence', () => {
  const bad = (raw: Record<string, unknown>) => { const p = readReportDef(raw); return p.ok ? 'ok' : p.error }
  assert.equal(bad({ columns: [] }), 'Choose at least one column.')
  assert.equal(bad({ columns: [{ meta: 'nope' }] }), 'A column points at something that does not exist. Remove it and choose again.')
  assert.equal(bad({ columns: [{ meta: 'title' }], filters: [{ field: 'days', operator: 'between' }] }), 'Every filter needs a field and a condition.')
  assert.equal(bad({ columns: [{ meta: 'title' }], group_by: { field: 'x' } }), 'Choose whether to count records or add up a number for each group.')
  assert.equal(bad({ columns: [{ meta: 'title' }], group_by: { field: 'x' }, aggregate: { fn: 'sum', field: 'Bad Key' } }), 'Choose a number field to add up.')
  assert.equal(bad({ columns: [{ meta: 'title' }], aggregate: { fn: 'count' } }), 'Choose a column to group by, or remove the total.')
  assert.deepEqual(readReportDef({ columns: [{ meta: 'title' }, { field: 'claims[].item' }], filters: null, group_by: null, aggregate: null }),
    { ok: true, value: { columns: [{ meta: 'title' }, { field: 'claims[].item' }], filters: [], groupBy: null, aggregate: null } })
})

test('readTemplate keeps a valid template and refuses a broken one', () => {
  const ok = { header: 'Leave', fields: [{ nodeId: 'start', key: 'name' }], signoff: ['approve'] }
  assert.deepEqual(readTemplate(ok), ok)
  assert.equal(readTemplate({ ...ok, header: 'x'.repeat(2001) }), null)
  assert.equal(readTemplate({ ...ok, fields: [{ nodeId: 'Start Node', key: 'name' }] }), null)
  assert.equal(readTemplate({ ...ok, signoff: 'approve' }), null)
})

test('dataColumns: first step wins a key, groups give row paths and a count', () => {
  const cols = dataColumns([
    { nodeId: 'start', step: 'Start', fields: [
      { key: 'name', type: 'short_text', label: 'Full name' },
      { key: 'claims', type: 'group', label: 'Claims', fields: [{ key: 'amount', type: 'number', label: 'Amount' }] },
    ] },
    { nodeId: 'approve', step: 'Manager approval', fields: [
      { key: 'name', type: 'short_text', label: 'Approver name' },
      { key: 'comment', type: 'long_text', label: 'Comment' },
    ] },
  ])
  assert.deepEqual(cols.map((c) => [c.path, c.label]), [
    ['name', 'Full name'], ['claims.count', 'Claims: number of rows'], ['claims[].amount', 'Claims: Amount'], ['comment', 'Comment'],
  ])
})
```

`supabase/functions/_shared/reports/csv.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { csvCell, toCsv } from './csv.ts'

test('csv quotes commas, quotes and line breaks', () => {
  assert.deepEqual(['a,b', 'say "hi"', 'two\nlines', 'cr\rhere', 'plain'].map(csvCell),
    ['"a,b"', '"say ""hi"""', '"two\nlines"', '"cr\rhere"', 'plain'])
})

test('csv guards cells that start a formula, headers included', () => {
  assert.deepEqual(['=1+1', '+SUM(A1)', '-5', '@cmd', '\tx', '=HYPERLINK("http://x","a,b")'].map(csvCell),
    ["'=1+1", "'+SUM(A1)", "'-5", "'@cmd", "'\tx", `"'=HYPERLINK(""http://x"",""a,b"")"`])
  assert.equal(toCsv(['=Total'], []), "﻿'=Total\r\n")
})

test('csv writes numbers as numbers and empty cells as nothing', () => {
  assert.deepEqual([12.5, -3, 0, null, ''].map(csvCell), ['12.5', '-3', '0', '', ''])
})

test('csv starts with a BOM and ends every row with CRLF', () => {
  assert.equal(toCsv(['Name', 'Days'], [['Ada', 3], ['Ben, Jr', null]]), '﻿Name,Days\r\nAda,3\r\n"Ben, Jr",\r\n')
})
```

- [ ] **Step 3: Run — expect FAIL**

Run: `pnpm test`
Expected: FAIL with `Cannot find module '.../_shared/reports/run.ts'`.

- [ ] **Step 4: Write `definition.ts`**

```ts
import { KEY_RE, OPERATORS, parsePath, type Rule } from '../forms/index.ts'
import { ID_RE } from '../workflow/graph.ts'

export const META_KEYS = ['title', 'status', 'label', 'step', 'started_by', 'created_at', 'updated_at'] as const
export type MetaKey = (typeof META_KEYS)[number]
export const META_LABELS: Record<MetaKey, string> = {
  title: 'Title', status: 'Status', label: 'Status label', step: 'Current step',
  started_by: 'Started by', created_at: 'Started', updated_at: 'Last updated',
}
export type Column = { meta: MetaKey } | { field: string }
export type Aggregate = { fn: 'count' } | { fn: 'sum'; field: string }
export type ReportDef = { columns: Column[]; filters: Rule[]; groupBy: Column | null; aggregate: Aggregate | null }
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }
export type ReportTemplate = { header: string; fields: { nodeId: string; key: string }[]; signoff: string[] }

export const MAX_COLUMNS = 20
export const MAX_FILTERS = 10

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const fail = (error: string): Parsed<never> => ({ ok: false, error })

export function readColumn(v: unknown): Column | null {
  if (!isObj(v)) return null
  if (typeof v.meta === 'string' && (META_KEYS as readonly string[]).includes(v.meta)) return { meta: v.meta as MetaKey }
  if (typeof v.field === 'string' && parsePath(v.field)) return { field: v.field }
  return null
}

export const columnId = (c: Column) => ('meta' in c ? `meta:${c.meta}` : `field:${c.field}`)

function readAggregate(v: unknown): Aggregate | null {
  if (!isObj(v)) return null
  if (v.fn === 'count') return { fn: 'count' }
  if (v.fn === 'sum' && typeof v.field === 'string' && parsePath(v.field)) return { fn: 'sum', field: v.field }
  return null
}

/** Validates a saved_reports row (as stored) or a builder draft. Every message is shown to the person as it is. */
export function readReportDef(raw: { columns?: unknown; filters?: unknown; group_by?: unknown; aggregate?: unknown }): Parsed<ReportDef> {
  const cols = Array.isArray(raw.columns) ? raw.columns.map(readColumn) : []
  if (!cols.length) return fail('Choose at least one column.')
  if (cols.length > MAX_COLUMNS) return fail(`Use at most ${MAX_COLUMNS} columns.`)
  if (cols.some((c) => !c)) return fail('A column points at something that does not exist. Remove it and choose again.')
  const filters: unknown[] | null = raw.filters == null ? [] : Array.isArray(raw.filters) ? raw.filters : null
  if (!filters || filters.some((f) => !isObj(f) || !parsePath(f.field) || !(OPERATORS as readonly unknown[]).includes(f.operator))) {
    return fail('Every filter needs a field and a condition.')
  }
  if (filters.length > MAX_FILTERS) return fail(`Use at most ${MAX_FILTERS} filters.`)
  const groupBy = raw.group_by == null ? null : readColumn(raw.group_by)
  if (raw.group_by != null && !groupBy) return fail('Choose what to group by again.')
  const aggregate = raw.aggregate == null ? null : readAggregate(raw.aggregate)
  if (raw.aggregate != null && !aggregate) return fail('Choose a number field to add up.')
  if (groupBy && !aggregate) return fail('Choose whether to count records or add up a number for each group.')
  if (!groupBy && aggregate) return fail('Choose a column to group by, or remove the total.')
  return { ok: true, value: { columns: cols as Column[], filters: filters as Rule[], groupBy, aggregate } }
}

/** A report_templates row, or null when any part is malformed (render-pdfs then fails the job with a sentence). */
export function readTemplate(raw: { header?: unknown; fields?: unknown; signoff?: unknown }): ReportTemplate | null {
  const header = typeof raw.header === 'string' ? raw.header : ''
  if (header.length > 2000 || !Array.isArray(raw.fields) || !Array.isArray(raw.signoff)) return null
  if (raw.fields.length > 100 || raw.signoff.length > 20) return null
  const fields = raw.fields.map((f) => (isObj(f) && typeof f.nodeId === 'string' && ID_RE.test(f.nodeId) && typeof f.key === 'string' && KEY_RE.test(f.key)
    ? { nodeId: f.nodeId, key: f.key } : null))
  const signoff = raw.signoff.map((s) => (typeof s === 'string' && ID_RE.test(s) ? s : null))
  if (fields.some((f) => !f) || signoff.some((s) => !s)) return null
  return { header, fields: fields as ReportTemplate['fields'], signoff: signoff as string[] }
}
```

- [ ] **Step 5: Write `catalogue.ts`**

```ts
import type { Field, FieldType } from '../forms/index.ts'
import { nodeName, type Graph } from '../workflow/graph.ts'
import { META_LABELS, type Aggregate, type Column } from './definition.ts'

export type StepFields = { nodeId: string; step: string; fields: Field[] }
export type DataColumn = { path: string; label: string; type: FieldType }

/** The answerable fields of each Start/Form step in graph order; page breaks never hold an answer. */
export function stepFields(graph: Graph, forms: ReadonlyMap<string, Field[]>): StepFields[] {
  return graph.nodes.flatMap((n) => (n.type === 'start' || n.type === 'form'
    ? [{ nodeId: n.id, step: nodeName(n), fields: (forms.get(n.formId) ?? []).filter((f) => f.type !== 'page_break') }]
    : []))
}

/** Column choices over records.data. The first step wins a key, as it does when answers merge into the record. */
export function dataColumns(steps: StepFields[]): DataColumn[] {
  const out: DataColumn[] = []
  const seen = new Set<string>()
  const add = (path: string, label: string, type: FieldType) => {
    if (!seen.has(path)) { seen.add(path); out.push({ path, label, type }) }
  }
  for (const s of steps) {
    for (const f of s.fields) {
      if (f.type !== 'group') { add(f.key, f.label, f.type); continue }
      add(`${f.key}.count`, `${f.label}: number of rows`, 'number')
      for (const c of f.fields ?? []) add(`${f.key}[].${c.key}`, `${f.label}: ${c.label}`, c.type)
    }
  }
  return out
}

/** Top-level fields for the shared RuleEditor, which builds group paths itself. */
export function filterScope(steps: StepFields[]): Field[] {
  const seen = new Set<string>()
  return steps.flatMap((s) => s.fields).filter((f) => !seen.has(f.key) && (seen.add(f.key), true))
}

export const columnLabel = (c: Column, cols: DataColumn[]) =>
  'meta' in c ? META_LABELS[c.meta] : cols.find((x) => x.path === c.field)?.label ?? c.field

export const aggregateLabel = (a: Aggregate, cols: DataColumn[]) =>
  a.fn === 'count' ? 'Records' : `Total ${columnLabel({ field: a.field }, cols).toLowerCase()}`
```

- [ ] **Step 6: Write `run.ts`**

```ts
import { evaluate, readPath, type Answers } from '../forms/index.ts'
import type { Aggregate, Column, ReportDef } from './definition.ts'

export type ReportRecord = {
  id: string; title: string; status: string; label: string | null; current_node_id: string | null
  started_by: string; created_at: string; updated_at: string; data: Answers
}
export type Cell = string | number | null
export type RunCtx = { now: Date; stepName(nodeId: string): string; personName(userId: string): string }
export type Group = { key: Cell; count: number; sum: number | null; skipped: number }
type Page = { page: number; pageSize: number }
export type RowsResult = Page & { kind: 'rows'; rows: { id: string; cells: Cell[] }[]; total: number; totalRecords: number }
export type GroupsResult = Page & {
  kind: 'groups'; groups: Group[]; total: number; totalRecords: number; grandTotal: number | null; skipped: number
}
export type RunResult = RowsResult | GroupsResult

export const PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
// Same words as src/records/status.ts, so a report reads like the records list.
export const STATUS_WORDS: Record<string, string> = { open: 'In progress', done: 'Done', rejected: 'Rejected', error: 'Stopped' }

const blank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)
const round = (n: number) => Number(n.toFixed(10)) // 0.1 + 0.2 reads 0.3

function text(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() === '' ? null : v
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) {
    const parts = v.map(text).filter((t): t is string => t !== null)
    return parts.length ? parts.join(', ') : null
  }
  return null
}

/** One cell, as a report table, a CSV and a group key all show it. A lone number stays a number. */
export function cellOf(r: ReportRecord, c: Column, ctx: RunCtx): Cell {
  if ('meta' in c) {
    switch (c.meta) {
      case 'title': return r.title
      case 'status': return STATUS_WORDS[r.status] ?? r.status
      case 'label': return r.label
      case 'step': return r.current_node_id ? ctx.stepName(r.current_node_id) : null
      case 'started_by': return ctx.personName(r.started_by)
      case 'created_at': return r.created_at
      case 'updated_at': return r.updated_at
    }
  }
  const vals = readPath(r.data, c.field) ?? []
  if (vals.length === 1 && typeof vals[0] === 'number') return Number.isFinite(vals[0]) ? vals[0] : null
  const parts = vals.map(text).filter((t): t is string => t !== null)
  return parts.length ? parts.join(', ') : null
}

function byKey(a: Group, b: Group): number {
  if (a.key === null || b.key === null) return a.key === b.key ? 0 : a.key === null ? 1 : -1
  if (typeof a.key === 'number' && typeof b.key === 'number') return a.key - b.key
  return String(a.key).localeCompare(String(b.key), 'en-GB', { numeric: true })
}

function groupRecords(records: ReportRecord[], by: Column, agg: Aggregate, ctx: RunCtx): Group[] {
  const groups = new Map<string, Group>()
  for (const r of records) {
    const key = cellOf(r, by, ctx)
    const id = key === null ? '' : `${typeof key}:${key}`
    const g = groups.get(id) ?? { key, count: 0, sum: null, skipped: 0 }
    groups.set(id, g)
    g.count += 1
    if (agg.fn !== 'sum') continue
    for (const v of readPath(r.data, agg.field) ?? []) {
      if (typeof v === 'number' && Number.isFinite(v)) g.sum = (g.sum ?? 0) + v
      else if (!blank(v)) g.skipped += 1 // text, "4", true: left out and counted, never coerced
    }
  }
  return [...groups.values()].map((g) => ({ ...g, sum: g.sum === null ? null : round(g.sum) })).sort(byKey)
}

/**
 * Filters with the shared evaluator, then pages rows or groups. Totals are always the full counts.
 * `paging: null` returns everything (CSV export); a page is never more than MAX_PAGE_SIZE.
 */
export function runReport(records: ReportRecord[], def: ReportDef, ctx: RunCtx, paging: Page | null): RunResult {
  const size = paging ? Math.min(Math.max(Math.trunc(paging.pageSize) || PAGE_SIZE, 1), MAX_PAGE_SIZE) : Infinity
  const page = paging ? Math.max(Math.trunc(paging.page) || 1, 1) : 1
  const from = (page - 1) * size || 0
  const matched = records.filter((r) => def.filters.every((f) => evaluate(f, r.data, ctx.now)))
  if (!def.groupBy || !def.aggregate) {
    const rows = matched.slice(from, from + size).map((r) => ({ id: r.id, cells: def.columns.map((c) => cellOf(r, c, ctx)) }))
    return { kind: 'rows', rows, total: matched.length, totalRecords: matched.length, page, pageSize: paging ? size : matched.length }
  }
  const all = groupRecords(matched, def.groupBy, def.aggregate, ctx)
  const sums = all.filter((g) => g.sum !== null)
  const grandTotal = def.aggregate.fn === 'count' ? matched.length : sums.length ? round(sums.reduce((n, g) => n + (g.sum as number), 0)) : null
  return {
    kind: 'groups', groups: all.slice(from, from + size), total: all.length, totalRecords: matched.length,
    grandTotal, skipped: all.reduce((n, g) => n + g.skipped, 0), page, pageSize: paging ? size : all.length,
  }
}
```

- [ ] **Step 7: Write `csv.ts` and `index.ts`**

```ts
import type { Cell } from './run.ts'

// OWASP CSV injection: a spreadsheet runs a text cell that starts with one of these as a formula.
const FORMULA = /^[=+\-@\t\r]/

/** RFC 4180 cell. Numbers are not text, so they are never prefixed (a negative stays a number). */
export function csvCell(v: Cell): string {
  if (v === null) return ''
  if (typeof v === 'number') return String(v)
  const s = FORMULA.test(v) ? `'${v}` : v
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** BOM so Excel reads UTF-8 names; CRLF rows. Header labels are guarded like data. */
export function toCsv(header: string[], rows: Cell[][]): string {
  return `﻿${[header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`
}

/** "Leave days by type" on 2026-10-11 → leave-days-by-type-2026-10-11.csv; run-report and the browser name files alike. */
export const csvFilename = (name: string, day: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'report'}-${day}.csv`
```

`supabase/functions/_shared/reports/index.ts`:
```ts
export * from './definition.ts'
export * from './catalogue.ts'
export * from './run.ts'
export * from './csv.ts'
export * from './pdf.ts'
export * from './layout.ts'
```
(`pdf.ts` and `layout.ts` arrive in Task 3; until then this file exports the first four lines only, and Task 3 adds the last two.)

- [ ] **Step 8: Run — expect PASS**

Run: `pnpm test && DENO_NO_PACKAGE_JSON=1 deno test supabase/functions/_shared/reports`
Expected: node `pass 158` (142 + 16), deno `16 passed`.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/_shared/reports/definition.ts supabase/functions/_shared/reports/catalogue.ts supabase/functions/_shared/reports/run.ts supabase/functions/_shared/reports/csv.ts supabase/functions/_shared/reports/index.ts supabase/functions/_shared/reports/fixture.ts supabase/functions/_shared/reports/run.test.ts supabase/functions/_shared/reports/csv.test.ts
git commit -m "feat: add shared report definitions, runner and csv"
```

---

### Task 3: Shared — PDF model and page layout

**Owner:** Backend engineer · **Depends on:** 2

**Files:**
- Create: `supabase/functions/_shared/reports/pdf.ts`, `layout.ts`, `pdf.test.ts`
- Modify: `supabase/functions/_shared/reports/index.ts` (export `pdf.ts`, `layout.ts`)

**Interfaces:**
- Consumes: `resolve`, `toDay`, `Field`, `Answers` (`_shared/forms`); `readGraph` (`_shared/workflow/graph.ts`); `stepFields`, `ReportTemplate` (Task 2).
- Produces:
  - `class PdfProblem extends Error` (a failure retrying cannot fix; its message is shown as is)
  - `type PdfSubmission = { node_id: string; answers: Answers; submitted_by: string; outcome: 'submitted' | 'approved' | 'rejected'; created_at: string }`
  - `type PdfSource = { orgId: string; orgName: string; workflowName: string; graph: unknown; record: { id: string; title: string; status: string; started_by: string; created_at: string }; template: ReportTemplate; forms: Record<string, Field[]>; submissions: PdfSubmission[]; names: Record<string, string> }`
  - `type PdfItem = { kind: 'text'; label: string; text: string } | { kind: 'signature'; label: string; path: string } | { kind: 'rows'; label: string; rows: string[] }`
  - `type PdfModel = { org: string; title: string; header: string; meta: string[]; sections: { nodeId: string; step: string; items: PdfItem[] }[]; signoffs: { step: string; line: string; signature: string | null }[]; generated: string }`
  - `buildPdfModel(src: PdfSource, now: Date): PdfModel`, `formatWhen(iso: string): string`, `answerText(f: Field, v: unknown): string`
  - `PAGE = { width: 595.28, height: 841.89, margin: 56 }` (A4 in points), `SIG = { width: 180, height: 72 }`, `type Measure = (text: string, size: number, bold: boolean) => number`, `type Op`, `wrapText(text: string, width: number, size: number, bold: boolean, measure: Measure): string[]`, `layoutPdf(model: PdfModel, measure: Measure): Op[][]`

- [ ] **Step 1: Write the failing tests** — `supabase/functions/_shared/reports/pdf.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PdfProblem, buildPdfModel, formatWhen } from './pdf.ts'
import { PAGE, layoutPdf, wrapText, type Measure, type Op } from './layout.ts'
import { APPROVER_SIG, ORG, SIG_PATH, SOURCE } from './fixture.ts'

const NOW = new Date('2026-10-13T09:00:00Z')
const measure: Measure = (t, size) => t.length * size * 0.5
const texts = (pages: Op[][]) => pages.flat().filter((o): o is Extract<Op, { op: 'text' }> => o.op === 'text')

test('the model renders every field type and omits hidden fields', () => {
  const m = buildPdfModel(SOURCE, NOW)
  assert.deepEqual([m.org, m.title, m.header], ['Alpha School', 'Incident: Ada Lovelace', 'Incident record\nAlpha School, Health and Safety'])
  assert.deepEqual(m.meta, ['Workflow: Incident report', 'Status: Done', 'Started 12 Oct 2026, 08:30 UTC by Ada Lovelace'])
  assert.deepEqual(m.sections.map((s) => s.step), ['Start', 'Manager approval'])
  assert.deepEqual(m.sections[0].items, [
    { kind: 'text', label: 'Full name', text: 'Ada Lovelace' },
    { kind: 'text', label: 'What happened', text: 'Slipped on the wet floor.' },
    { kind: 'text', label: 'Age', text: '34.5' },
    { kind: 'text', label: 'Date', text: '12 Oct 2026' },
    { kind: 'text', label: 'Kind', text: 'Fall' },
    { kind: 'text', label: 'Tags', text: 'Urgent, Outdoor' },
    { kind: 'text', label: 'Confirmed', text: 'Yes' },
    { kind: 'text', label: 'Photo', text: 'floor.jpg' },
    { kind: 'rows', label: 'Witnesses', rows: ['1. Name: Ben · Age: 40', '2. Name: Cy · Age: Not answered'] },
    { kind: 'text', label: 'Score', text: '35.5' },
    { kind: 'signature', label: 'Signature', path: SIG_PATH },
  ])
  assert.equal(JSON.stringify(m).includes('smuggled'), false) // "Other details" was hidden by show_if
  assert.deepEqual(m.sections[1].items, [{ kind: 'text', label: 'Comment', text: 'Seen.' }])
  assert.equal(m.generated, 'Generated 13 Oct 2026, 09:00 UTC')
})

test('a question removed from the form and a step not yet submitted say so', () => {
  const src = structuredClone(SOURCE)
  src.template.fields.splice(-1, 0, { nodeId: 'start', key: 'gone' }) // before the approval step's field
  src.submissions = src.submissions.slice(0, 1)
  const m = buildPdfModel(src, NOW)
  assert.deepEqual(m.sections.map((s) => s.items.at(-1)), [
    { kind: 'text', label: 'gone', text: 'This question is no longer on the form.' },
    { kind: 'text', label: 'Comment', text: 'Not submitted yet' },
  ])
  assert.deepEqual(m.signoffs[1], { step: 'Manager approval', line: 'Not done yet', signature: null })
})

test('sign-off lists name, outcome, UTC time and signature', () => {
  assert.equal(formatWhen('2026-10-12T14:05:00Z'), '12 Oct 2026, 14:05 UTC')
  assert.deepEqual(buildPdfModel(SOURCE, NOW).signoffs, [
    { step: 'Start', line: 'Submitted by Ada Lovelace · 12 Oct 2026, 08:30 UTC', signature: SIG_PATH },
    { step: 'Manager approval', line: 'Approved by Grace Hopper · 12 Oct 2026, 14:05 UTC', signature: APPROVER_SIG },
  ])
})

test('a signature stored outside the record\'s organisation is refused', () => {
  const src = structuredClone(SOURCE)
  src.submissions[1].answers.ok_sig = `0000000b-0000-0000-0000-000000000001/${ORG.slice(0, 8)}/x.png`
  assert.throws(() => buildPdfModel(src, NOW), (e: unknown) =>
    e instanceof PdfProblem && e.message === 'A signature on "Manager approval" is not stored with this organisation, so the PDF was not made.')
})

test('long text wraps inside the margin and breaks pages', () => {
  const src = structuredClone(SOURCE)
  src.submissions[0].answers.story = 'The floor was wet near the entrance. '.repeat(300) // about 11,000 characters
  const pages = layoutPdf(buildPdfModel(src, NOW), measure)
  assert.ok(pages.length >= 3, `expected at least 3 pages, got ${pages.length}`)
  for (const t of texts(pages)) assert.ok(t.x + measure(t.text, t.size, t.bold) <= PAGE.width - PAGE.margin + 0.001, `overflows: ${t.text}`)
  const body = texts(pages).filter((t) => !t.text.includes(' · Page '))
  assert.ok(body.every((t) => t.y >= PAGE.margin + 24), 'body text runs into the footer')
  assert.deepEqual(pages.map((p) => (p.at(-1) as { text: string }).text),
    pages.map((_, i) => `Generated 13 Oct 2026, 09:00 UTC · Page ${i + 1} of ${pages.length}`))
  assert.equal(pages.flat().filter((o) => o.op === 'image').length, 3) // two sign-off signatures + the Signature answer
})

test('wrapText breaks a word longer than the line and keeps blank lines', () => {
  assert.deepEqual(wrapText('a'.repeat(25), 10 * 5, 10, false, measure), ['aaaaaaaaaa', 'aaaaaaaaaa', 'aaaaa'])
  assert.deepEqual(wrapText('one two\r\n\r\nthree\u0007', 1000, 10, false, measure), ['one two', '', 'three'])
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test`
Expected: FAIL with `Cannot find module '.../_shared/reports/pdf.ts'`.

- [ ] **Step 3: Write `pdf.ts`**

```ts
import { resolve, toDay, type Answers, type Field } from '../forms/index.ts'
import { readGraph } from '../workflow/graph.ts'
import { stepFields, type StepFields } from './catalogue.ts'
import type { ReportTemplate } from './definition.ts'
import { STATUS_WORDS } from './run.ts'

/** A PDF that retrying cannot fix. The message is shown to people as it is. */
export class PdfProblem extends Error {}

export type PdfSubmission = { node_id: string; answers: Answers; submitted_by: string; outcome: 'submitted' | 'approved' | 'rejected'; created_at: string }
export type PdfSource = {
  orgId: string; orgName: string; workflowName: string; graph: unknown
  record: { id: string; title: string; status: string; started_by: string; created_at: string }
  template: ReportTemplate
  forms: Record<string, Field[]> // by form id
  submissions: PdfSubmission[] // oldest first
  names: Record<string, string> // user id → display name
}
export type PdfItem =
  | { kind: 'text'; label: string; text: string }
  | { kind: 'signature'; label: string; path: string }
  | { kind: 'rows'; label: string; rows: string[] }
export type PdfModel = {
  org: string; title: string; header: string; meta: string[]
  sections: { nodeId: string; step: string; items: PdfItem[] }[]
  signoffs: { step: string; line: string; signature: string | null }[]
  generated: string
}

// shortcut: times print in UTC; add an org time-zone setting when an org outside UTC+0 asks for local times on PDFs.
const WHEN = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const NUM = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 10 })
const OUTCOMES = { submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected' } as const

export const formatWhen = (iso: string) => `${WHEN.format(new Date(iso))} UTC`
const fileLabel = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/^[0-9a-f-]{36}-/, '')
const unanswered = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

export function answerText(f: Field, v: unknown): string {
  if (unanswered(v)) return 'Not answered'
  switch (f.type) {
    case 'checkbox': return v === true ? 'Yes' : 'No'
    case 'date': { const d = toDay(v); return d === null ? String(v) : DAY.format(new Date(d * 86_400_000)) }
    case 'number': case 'calculated': return typeof v === 'number' && Number.isFinite(v) ? NUM.format(v) : 'Not answered'
    case 'multi_select': return Array.isArray(v) ? v.map(String).join(', ') : String(v)
    case 'file': return typeof v === 'string' ? fileLabel(v) : 'Not answered'
    case 'signature': return 'Signed'
    default: return String(v)
  }
}

function inOrg(path: string, orgId: string, step: string): string {
  if (!path.startsWith(`${orgId}/`)) throw new PdfProblem(`A signature on "${step}" is not stored with this organisation, so the PDF was not made.`)
  return path
}

function itemFor(step: StepFields, key: string, sub: PdfSubmission | undefined, orgId: string): PdfItem | null {
  const f = step.fields.find((x) => x.key === key)
  if (!f) return { kind: 'text', label: key, text: 'This question is no longer on the form.' }
  if (!sub) return { kind: 'text', label: f.label, text: 'Not submitted yet' }
  // Judged as it was when submitted, so a within_days rule gives the same answer it gave then.
  if (resolve(step.fields, sub.answers, new Date(sub.created_at)).hidden.has(key)) return null
  const v = sub.answers[key]
  if (f.type === 'signature' && typeof v === 'string' && v) return { kind: 'signature', label: f.label, path: inOrg(v, orgId, step.step) }
  if (f.type === 'group') {
    if (!Array.isArray(v) || !v.length) return { kind: 'text', label: f.label, text: 'Not answered' }
    const rows = v.map((row, i) => `${i + 1}. ${(f.fields ?? []).map((c) =>
      `${c.label}: ${answerText(c, row && typeof row === 'object' ? (row as Answers)[c.key] : undefined)}`).join(' · ')}`)
    return { kind: 'rows', label: f.label, rows }
  }
  return { kind: 'text', label: f.label, text: answerText(f, v) }
}

/** What the PDF says, from each step's latest submission. Pure: render-pdfs lays it out and draws it. */
export function buildPdfModel(src: PdfSource, now: Date): PdfModel {
  const graph = readGraph(src.graph)
  if (!graph) throw new PdfProblem('This workflow could not be read, so the PDF was not made. Ask a workflow manager to open and save it.')
  const steps = stepFields(graph, new Map(Object.entries(src.forms)))
  const latest = new Map<string, PdfSubmission>()
  for (const s of src.submissions) latest.set(s.node_id, s) // oldest first, so the last one wins
  const name = (id: string) => src.names[id] ?? 'Former member'
  const sections: PdfModel['sections'] = []
  for (const ref of src.template.fields) {
    const step = steps.find((s) => s.nodeId === ref.nodeId) ?? { nodeId: ref.nodeId, step: 'A deleted step', fields: [] }
    let section = sections.at(-1)
    if (!section || section.nodeId !== ref.nodeId) { section = { nodeId: ref.nodeId, step: step.step, items: [] }; sections.push(section) }
    const item = itemFor(step, ref.key, latest.get(ref.nodeId), src.orgId)
    if (item) section.items.push(item)
  }
  const signoffs = src.template.signoff.map((nodeId) => {
    const step = steps.find((s) => s.nodeId === nodeId)
    const sub = latest.get(nodeId)
    const label = step?.step ?? 'A deleted step'
    if (!step || !sub) return { step: label, line: 'Not done yet', signature: null }
    const hidden = resolve(step.fields, sub.answers, new Date(sub.created_at)).hidden
    const sig = step.fields.find((f) => f.type === 'signature' && !hidden.has(f.key) && typeof sub.answers[f.key] === 'string' && sub.answers[f.key])
    return {
      step: label,
      line: `${OUTCOMES[sub.outcome]} by ${name(sub.submitted_by)} · ${formatWhen(sub.created_at)}`,
      signature: sig ? inOrg(sub.answers[sig.key] as string, src.orgId, label) : null,
    }
  })
  return {
    org: src.orgName,
    title: src.record.title,
    header: src.template.header,
    meta: [
      `Workflow: ${src.workflowName}`,
      `Status: ${STATUS_WORDS[src.record.status] ?? src.record.status}`,
      `Started ${formatWhen(src.record.created_at)} by ${name(src.record.started_by)}`,
    ],
    sections: sections.filter((s) => s.items.length),
    signoffs,
    generated: `Generated ${formatWhen(now.toISOString())}`,
  }
}
```

- [ ] **Step 4: Write `layout.ts`**

```ts
import type { PdfModel } from './pdf.ts'

export const PAGE = { width: 595.28, height: 841.89, margin: 56 } as const // A4 in points
export const SIG = { width: 180, height: 72 } as const
const FOOTER = 24
const LEAD = 1.4
export type Measure = (text: string, size: number, bold: boolean) => number
export type Op =
  | { op: 'text'; x: number; y: number; size: number; bold: boolean; muted: boolean; text: string }
  | { op: 'image'; x: number; y: number; width: number; height: number; path: string }
  | { op: 'rule'; x: number; y: number; width: number }

// Control characters other than the line breaks wrapText handles would draw as boxes or break the content stream.
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/g

/** Greedy word wrap; a word wider than the line breaks by character. Blank lines are kept. */
export function wrapText(text: string, width: number, size: number, bold: boolean, measure: Measure): string[] {
  const fits = (s: string) => measure(s, size, bold) <= width
  const lines: string[] = []
  for (const para of text.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(CONTROL, '').split('\n')) {
    let line = ''
    for (const word of para.split(/ +/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (fits(next)) { line = next; continue }
      if (line) lines.push(line)
      let rest = Array.from(word) // by code point, so a surrogate pair is never split
      while (!fits(rest.join(''))) {
        let n = 1
        while (n < rest.length && fits(rest.slice(0, n + 1).join(''))) n++
        lines.push(rest.slice(0, n).join(''))
        rest = rest.slice(n)
      }
      line = rest.join('')
    }
    lines.push(line)
  }
  return lines
}

/** Places the model on A4 pages (PDF coordinates, origin bottom-left). A heading never ends a page; a sign-off entry never splits. */
export function layoutPdf(m: PdfModel, measure: Measure): Op[][] {
  const { width: W, height: H, margin: M } = PAGE
  const inner = W - 2 * M
  const pages: Op[][] = [[]]
  let y = H - M
  const page = () => pages[pages.length - 1]
  const need = (h: number) => { if (y - h < M + FOOTER) { pages.push([]); y = H - M } }
  const gap = (h: number) => { y -= h }
  const lines = (text: string, size: number, bold: boolean, muted: boolean, indent = 0) => {
    for (const l of wrapText(text, inner - indent, size, bold, measure)) {
      need(size * LEAD)
      y -= size * LEAD
      page().push({ op: 'text', x: M + indent, y, size, bold, muted, text: l })
    }
  }
  const image = (path: string) => {
    need(SIG.height + 6)
    y -= SIG.height + 6
    page().push({ op: 'image', x: M, y, width: SIG.width, height: SIG.height, path })
  }
  const heading = (text: string) => {
    gap(14)
    need(12 * LEAD + 8 + 9 * LEAD + 10.5 * LEAD)
    lines(text, 12, true, false)
    page().push({ op: 'rule', x: M, y: y - 4, width: inner })
    gap(8)
  }

  lines(m.org, 9, false, true)
  lines(m.title, 18, true, false)
  if (m.header.trim()) { gap(4); lines(m.header, 11, false, false) }
  gap(6)
  for (const t of m.meta) lines(t, 9, false, true)
  for (const s of m.sections) {
    heading(s.step)
    for (const it of s.items) {
      gap(6)
      need(9 * LEAD + 10.5 * LEAD)
      lines(it.label, 9, true, true)
      if (it.kind === 'text') lines(it.text, 10.5, false, false)
      else if (it.kind === 'rows') for (const r of it.rows) lines(r, 10.5, false, false, 12)
      else image(it.path)
    }
  }
  if (m.signoffs.length) {
    heading('Sign-off')
    for (const s of m.signoffs) {
      gap(6)
      need(9 * LEAD + 10.5 * LEAD * 2 + (s.signature ? SIG.height + 6 : 0))
      lines(s.step, 9, true, true)
      lines(s.line, 10.5, false, false)
      if (s.signature) image(s.signature)
    }
  }
  return pages.map((ops, i) => [...ops, {
    op: 'text', x: M, y: M / 2, size: 8, bold: false, muted: true, text: `${m.generated} · Page ${i + 1} of ${pages.length}`,
  } as Op])
}
```

Add the last two lines of `index.ts` from Task 2 Step 7 (`export * from './pdf.ts'`, `export * from './layout.ts'`).

- [ ] **Step 5: Run — expect PASS**

Run: `pnpm test && DENO_NO_PACKAGE_JSON=1 deno test supabase/functions/_shared/reports`
Expected: node `pass 164` (158 + 6), deno `22 passed`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/reports/pdf.ts supabase/functions/_shared/reports/layout.ts supabase/functions/_shared/reports/pdf.test.ts supabase/functions/_shared/reports/index.ts
git commit -m "feat: add the pdf model and page layout"
```

---

### Task 4: Engine — `generate_pdf` queues a real job

**Owner:** Backend engineer · **Depends on:** 1, 3

**Files:**
- Modify: `supabase/functions/advance/engine.ts`, `supabase/functions/advance/pgStore.ts`, `supabase/functions/advance/testkit.ts`, `supabase/functions/advance/engine.test.ts`

**Interfaces:**
- Consumes: `record_pdfs`, `report_templates`, `wake_render_pdfs()` (Task 1); `PdfSource` (Task 3); the engine's `walk` / `runAction` / `StepError`.
- Produces, on `Tx` in `engine.ts`:
  - `type PdfJob = { id: string; org_id: string; record_id: string; requested_by: string | null; attempts: number }`
  - `type PdfPatch = { status: 'queued' | 'done' | 'failed'; error: string | null; path?: string; nextAttemptAt?: Date }`
  - `type PdfSourceRow = Omit<PdfSource, 'template'> & { template: { header: unknown; fields: unknown; signoff: unknown } }`
  - `hasReportTemplate(workflowId: string): Promise<boolean>`
  - `queuePdf(row: { org_id: string; record_id: string; requested_by: string | null }): Promise<string>` — the queued job's id (an existing queued job is reused); wakes `render-pdfs` after commit
  - `duePdfs(now: Date, limit: number): Promise<string[]>`
  - `claimPdf(id: string, now: Date, leaseUntil: Date): Promise<PdfJob | null>` — bumps `attempts`, sets the lease; null when another run holds it or it is not due
  - `expiredPdfs(now: Date, limit: number): Promise<PdfJob[]>` — queued jobs whose third lease has run out
  - `finishPdf(id: string, patch: PdfPatch): Promise<boolean>` — false when the job is no longer queued
  - `pdfSource(recordId: string): Promise<PdfSourceRow | null>`
  - action event detail `{ type: 'generate_pdf', edge, status: 'queued', job }`

- [ ] **Step 1: Write the failing tests** — append to `supabase/functions/advance/engine.test.ts`

```ts
Deno.test('generate_pdf queues one job and records it on the timeline', async () => {
  const g = leave()
  g.edges.find((e) => e.id === 'e5')!.actions = [{ type: 'generate_pdf' }]
  const { db, start, act, claim } = setup(g)
  await start(SHORT)
  await act(claim(), 'approved')
  const [rec] = db.records
  assertEquals(rec.status, 'done')
  assertEquals(db.pdfs.map((p) => [p.record_id, p.status, p.requested_by]), [[rec.id, 'queued', null]])
  assertEquals(db.events.filter((e) => e.kind === 'action').at(-1)?.detail, { type: 'generate_pdf', edge: 'e5', status: 'queued', job: db.pdfs[0].id })
})

Deno.test('generate_pdf without a report template stops the record with the reason', async () => {
  const g = leave()
  g.edges.find((e) => e.id === 'e5')!.actions = [{ type: 'generate_pdf' }]
  const { db, start, act, claim } = setup(g)
  db.reportTemplates.clear()
  await start(SHORT)
  await act(claim(), 'approved')
  assertEquals([db.records[0].status, db.records[0].error], ['error',
    'This path makes a PDF, but the workflow has no report template. Ask a reports manager to set one up.'])
  assertEquals(db.pdfs.length, 0)
})

Deno.test('a second generate_pdf on the same record reuses the queued job', async () => {
  const g = leave()
  g.edges.find((e) => e.id === 'e5')!.actions = [{ type: 'generate_pdf' }, { type: 'generate_pdf' }]
  const { db, start, act, claim } = setup(g)
  await start(SHORT)
  await act(claim(), 'approved')
  const jobs = db.events.filter((e) => e.detail.type === 'generate_pdf').map((e) => e.detail.job)
  assertEquals([db.pdfs.length, jobs.length, jobs[0] === jobs[1]], [1, 2, true])
})
```

(`leave()` is the existing fixture factory that returns a fresh copy of `LEAVE`; `SHORT` is defined at the top of the file.)

- [ ] **Step 2: Run — expect FAIL**

Run: `DENO_NO_PACKAGE_JSON=1 deno test supabase/functions/advance/engine.test.ts`
Expected: FAIL — `db.pdfs` is undefined and the action event still says `status: 'pending'`.

- [ ] **Step 3: Extend `Tx` and `runAction`** — `supabase/functions/advance/engine.ts`

Add to the imports:
```ts
import type { PdfSource } from '../_shared/reports/pdf.ts'
```

Add after `export type NewEvent = …`:
```ts
export type PdfJob = { id: string; org_id: string; record_id: string; requested_by: string | null; attempts: number }
export type PdfPatch = { status: 'queued' | 'done' | 'failed'; error: string | null; path?: string; nextAttemptAt?: Date }
/** As stored: render-pdfs validates the template with readTemplate before it builds anything. */
export type PdfSourceRow = Omit<PdfSource, 'template'> & { template: { header: unknown; fields: unknown; signoff: unknown } }
```

Add to `interface Tx`, after `finishMessage`:
```ts
  hasReportTemplate(workflowId: string): Promise<boolean>
  /** The record's queued job, inserting one if there is none; wakes render-pdfs once the transaction commits. */
  queuePdf(row: { org_id: string; record_id: string; requested_by: string | null }): Promise<string>
  duePdfs(now: Date, limit: number): Promise<string[]>
  /** UPDATE … attempts + 1, lease until leaseUntil, WHERE queued and due: an overlapping run gets null. */
  claimPdf(id: string, now: Date, leaseUntil: Date): Promise<PdfJob | null>
  expiredPdfs(now: Date, limit: number): Promise<PdfJob[]>
  /** WHERE status = 'queued': false when another run already finished it. */
  finishPdf(id: string, patch: PdfPatch): Promise<boolean>
  pdfSource(recordId: string): Promise<PdfSourceRow | null>
```

Replace the `generate_pdf` branch of `runAction`:
```ts
  if (isObj(a) && a.type === 'generate_pdf') {
    if (!(await tx.hasReportTemplate(rec.workflow_id))) {
      throw new StepError('This path makes a PDF, but the workflow has no report template. Ask a reports manager to set one up.')
    }
    const job = await tx.queuePdf({ org_id: rec.org_id, record_id: rec.id, requested_by: null })
    return ev('action', edge.from, { type: 'generate_pdf', edge: edge.id, status: 'queued', job })
  }
```

- [ ] **Step 4: Implement the methods in `pgStore.ts`**

Add to the imports `import type { PdfJob, PdfSourceRow } from './engine.ts'` (extend the existing `engine.ts` type import) and inside `pgTx`, after `finishMessage`:
```ts
    hasReportTemplate: async (wf) => (await t`select 1 from report_templates where workflow_id = ${wf}`).length > 0,
    queuePdf: async (x) => {
      // The insert's own row, or the queued row it collided with (the CTE cannot see its own insert in the second branch).
      const [row] = await t`
        with ins as (
          insert into record_pdfs (org_id, record_id, requested_by) values (${x.org_id}, ${x.record_id}, ${x.requested_by})
          on conflict (record_id) where status = 'queued' do nothing returning id)
        select id from ins union all select id from record_pdfs where record_id = ${x.record_id} and status = 'queued' limit 1`
      await t`select wake_render_pdfs()` // pg_net sends after commit; a rollback sends nothing
      return row.id as string
    },
    duePdfs: async (now, limit) => (await t`
      select id from record_pdfs where status = 'queued' and attempts < 3 and next_attempt_at <= ${now}
      order by next_attempt_at limit ${limit}`).map((r) => r.id as string),
    claimPdf: (id, now, lease) => one<PdfJob>(t`
      update record_pdfs set attempts = attempts + 1, next_attempt_at = ${lease}
      where id = ${id} and status = 'queued' and attempts < 3 and next_attempt_at <= ${now}
      returning id, org_id, record_id, requested_by, attempts`),
    expiredPdfs: async (now, limit) => (await t`
      select id, org_id, record_id, requested_by, attempts from record_pdfs
      where status = 'queued' and attempts >= 3 and next_attempt_at <= ${now} limit ${limit}`) as unknown as PdfJob[],
    finishPdf: async (id, p) => (await t`
      update record_pdfs set status = ${p.status}, error = ${p.error}, path = ${p.path ?? null},
        next_attempt_at = coalesce(${p.nextAttemptAt ?? null}::timestamptz, next_attempt_at),
        finished_at = case when ${p.status} = 'queued' then null else now() end
      where id = ${id} and status = 'queued' returning id`).length === 1,
    pdfSource: async (recordId) => {
      const head = await one<Record<string, unknown>>(t`
        select r.id, r.org_id, r.title, r.status, r.started_by, r.created_at, w.name as workflow_name, w.graph, o.name as org_name,
               rt.header, rt.fields, rt.signoff
        from records r join workflows w on w.id = r.workflow_id join orgs o on o.id = r.org_id
        join report_templates rt on rt.workflow_id = r.workflow_id
        where r.id = ${recordId}`)
      if (!head) return null
      const subs = await t`select node_id, form_id, answers, submitted_by, outcome, created_at from form_submissions
        where record_id = ${recordId} order by created_at, id`
      const formIds = [...new Set(subs.map((s) => s.form_id as string))]
      const forms = formIds.length ? await t`select id, schema from forms where org_id = ${head.org_id as string} and id = any(${formIds}::uuid[])` : []
      const people = await t`select m.user_id, coalesce(nullif(btrim(m.full_name), ''), m.email::text) as name from members m where m.org_id = ${head.org_id as string}`
      return {
        orgId: head.org_id as string, orgName: head.org_name as string, workflowName: head.workflow_name as string, graph: head.graph,
        record: { id: head.id as string, title: head.title as string, status: head.status as string, started_by: head.started_by as string,
          created_at: (head.created_at as Date).toISOString() },
        template: { header: head.header, fields: head.fields, signoff: head.signoff },
        forms: Object.fromEntries(forms.map((f) => [f.id as string, f.schema])),
        submissions: subs.map((s) => ({ node_id: s.node_id, answers: s.answers, submitted_by: s.submitted_by, outcome: s.outcome,
          created_at: (s.created_at as Date).toISOString() })),
        names: Object.fromEntries(people.map((p) => [p.user_id as string, p.name as string])),
      } as PdfSourceRow
    },
```

- [ ] **Step 5: Mirror them in the fake** — `supabase/functions/advance/testkit.ts`

Add to `Db`:
```ts
  reportTemplates: Set<string> // workflow ids with a report template
  pdfs: (PdfJob & { status: 'queued' | 'done' | 'failed'; next_attempt_at: Date; path: string | null; error: string | null })[]
  pdfSources: Map<string, PdfSourceRow> // record id → what pdfSource returns
```
Extend the `engine.ts` type import with `PdfJob, PdfSourceRow`. Add to the fake `Tx`, after `finishMessage`:
```ts
        hasReportTemplate: async (wf) => db.reportTemplates.has(wf),
        queuePdf: async (x) => {
          const queued = db.pdfs.find((p) => p.record_id === x.record_id && p.status === 'queued')
          if (queued) return queued.id
          const p = { ...x, id: id('pdf'), attempts: 0, status: 'queued' as const, next_attempt_at: new Date(0), path: null, error: null }
          db.pdfs.push(p)
          return p.id
        },
        duePdfs: async (now, limit) => db.pdfs.filter((p) => p.status === 'queued' && p.attempts < 3 && p.next_attempt_at <= now).slice(0, limit).map((p) => p.id),
        claimPdf: async (pid, now, lease) => {
          await tick() // let an overlapping run reach the same row
          const p = db.pdfs.find((x) => x.id === pid && x.status === 'queued' && x.attempts < 3 && x.next_attempt_at <= now)
          if (!p) return null
          p.attempts += 1
          p.next_attempt_at = lease
          return { id: p.id, org_id: p.org_id, record_id: p.record_id, requested_by: p.requested_by, attempts: p.attempts }
        },
        expiredPdfs: async (now, limit) => db.pdfs.filter((p) => p.status === 'queued' && p.attempts >= 3 && p.next_attempt_at <= now).slice(0, limit)
          .map((p) => ({ id: p.id, org_id: p.org_id, record_id: p.record_id, requested_by: p.requested_by, attempts: p.attempts })),
        finishPdf: async (pid, patch) => {
          const p = db.pdfs.find((x) => x.id === pid && x.status === 'queued')
          if (!p) return false
          p.status = patch.status
          p.error = patch.error
          p.path = patch.path ?? null
          if (patch.nextAttemptAt) p.next_attempt_at = patch.nextAttemptAt
          return true
        },
        pdfSource: async (rid) => structuredClone(db.pdfSources.get(rid) ?? null),
```
In `setup()`, add to the `db` literal:
```ts
    reportTemplates: new Set([WF]), pdfs: [], pdfSources: new Map(),
```
(The seeded Leave approval runs `generate_pdf` on its Time path, so the default fixture has a template, as the seed does.)

- [ ] **Step 6: Run — expect PASS**

Run: `DENO_NO_PACKAGE_JSON=1 deno test supabase/functions`
Expected: every existing test still passes (the resume test still ends `done` with a `generate_pdf` action, now `queued`) plus the 3 new ones.

With the local stack running, also run the advance race test (it walks the seeded workflow, whose Time path now queues a PDF):
```bash
RNR_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres DENO_NO_PACKAGE_JSON=1 \
deno test --allow-env --allow-net supabase/functions/advance/race.test.ts
```
Expected: `ok | 1 passed`.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/advance/engine.ts supabase/functions/advance/pgStore.ts supabase/functions/advance/testkit.ts supabase/functions/advance/engine.test.ts
git commit -m "feat: queue a real pdf job from the generate_pdf action"
```

---

### Task 5: Edge Function `render-pdfs` — worker, pdf-lib renderer, fonts

**Owner:** Backend engineer · **Depends on:** 3, 4

**Files:**
- Create: `supabase/functions/render-pdfs/fonts/Inter-Regular.ttf`, `Inter-SemiBold.ttf`, `OFL.txt`, `render.ts`, `render.test.ts`, `handler.ts`, `handler.test.ts`, `index.ts`
- Modify: `supabase/functions/.env.example` (no new names; a comment that `render-pdfs` uses `CRON_SECRET`), `README.md`

**Interfaces:**
- Consumes: `Tx` PDF methods (Task 4), `lockRecord`, `saveRecord`, `event`, `notify` (Phases 3–4), `buildPdfModel`, `layoutPdf`, `readTemplate`, `PdfProblem`, `PdfSource` (Tasks 2–3), the `form-files` and `record-pdfs` buckets.
- Produces:
  - `type Fonts = { regular: Uint8Array; bold: Uint8Array }`, `loadFonts(): Promise<Fonts>`, `renderPdf(src: PdfSource, now: Date, fonts: Fonts, loadImage: (path: string) => Promise<Uint8Array | null>): Promise<Uint8Array>`
  - `type Deps = { authorised: boolean; store: Store; now(): Date; render(src: PdfSource, now: Date): Promise<Uint8Array>; upload(path: string, bytes: Uint8Array): Promise<void> }`, `renderPdfs(deps: Deps): Promise<Result>`, `MAX_PDF_ATTEMPTS = 3`, `LEASE_MS = 300000`, `pdfBackoffMs(attempts: number): number`, `PDF_FAILED = 'The PDF could not be made. Try again in a few minutes.'`
  - POST `/functions/v1/render-pdfs` with `Authorization: Bearer <CRON_SECRET>` → `{ done, retrying, failed }`; anything else 401/405

- [ ] **Step 1: Add the fonts**

```bash
mkdir -p supabase/functions/render-pdfs/fonts
curl -sSL -o /tmp/inter-4.1.zip https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip
unzip -j -o /tmp/inter-4.1.zip 'extras/ttf/Inter-Regular.ttf' 'extras/ttf/Inter-SemiBold.ttf' 'LICENSE.txt' -d supabase/functions/render-pdfs/fonts
mv supabase/functions/render-pdfs/fonts/LICENSE.txt supabase/functions/render-pdfs/fonts/OFL.txt
shasum -a 256 supabase/functions/render-pdfs/fonts/*.ttf
```
Expected: two `.ttf` files of roughly 300–420 kB each and `OFL.txt` beginning "Copyright (c) 2016 The Inter Project Authors"; record the two SHA-256 lines in the commit message body.

- [ ] **Step 2: Write the failing renderer tests** — `supabase/functions/render-pdfs/render.test.ts`

```ts
import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { PDFDocument, PDFName, PDFRawStream } from 'npm:pdf-lib@1.17.1'
import { loadFonts, renderPdf } from './render.ts'
import { PdfProblem } from '../_shared/reports/pdf.ts'
import { APPROVER_SIG, PNG_1X1, SIG_PATH, SOURCE } from '../_shared/reports/fixture.ts'

const NOW = new Date('2026-10-13T09:00:00Z')
const fonts = await loadFonts()
const images = (doc: PDFDocument) => doc.context.enumerateIndirectObjects()
  .filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')).length

Deno.test('renders a valid multi-page PDF with embedded signatures', async () => {
  const src = structuredClone(SOURCE)
  src.submissions[0].answers.story = 'The floor was wet near the entrance. '.repeat(300)
  const asked: string[] = []
  const bytes = await renderPdf(src, NOW, fonts, (p) => { asked.push(p); return Promise.resolve(PNG_1X1) })
  assertEquals(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-')
  const doc = await PDFDocument.load(bytes)
  assertEquals(doc.getTitle(), 'Incident: Ada Lovelace')
  assertEquals(doc.getPageCount() >= 3, true)
  assertEquals([...new Set(asked)].sort(), [APPROVER_SIG, SIG_PATH].sort()) // each image fetched, and embedded once
  assertEquals(images(doc) >= 2, true)
})

Deno.test('names outside Latin-1 render with the embedded font', async () => {
  const src = structuredClone(SOURCE)
  src.record.title = 'Siti Nurhaliza — Łódź, Ünïcødé, Tamil: தமிழ்'
  const bytes = await renderPdf(src, NOW, fonts, () => Promise.resolve(PNG_1X1))
  assertEquals((await PDFDocument.load(bytes)).getPageCount() >= 1, true)
})

Deno.test('a missing signature file is a PdfProblem', async () => {
  await assertRejects(() => renderPdf(SOURCE, NOW, fonts, () => Promise.resolve(null)), PdfProblem,
    'A signature file is missing, so the PDF was not made. Ask the person to sign again.')
})

Deno.test('a signature that is not a PNG is a PdfProblem', async () => {
  await assertRejects(() => renderPdf(SOURCE, NOW, fonts, () => Promise.resolve(new TextEncoder().encode('GIF89a'))), PdfProblem,
    'A signature image could not be read, so the PDF was not made. Ask the person to sign again.')
})
```

- [ ] **Step 3: Write `render.ts`**

```ts
import { PDFDocument, rgb, type PDFFont, type PDFImage } from 'npm:pdf-lib@1.17.1'
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1'
import { PdfProblem, buildPdfModel, layoutPdf, type Measure, type PdfSource } from '../_shared/reports/index.ts'

export type Fonts = { regular: Uint8Array; bold: Uint8Array }

// Light-theme tokens from design/tokens.css: ink #18181b, ink-muted #71717a, line-200 #e4e4e7. Paper is always light.
const INK = rgb(24 / 255, 24 / 255, 27 / 255)
const MUTED = rgb(113 / 255, 113 / 255, 122 / 255)
const LINE = rgb(228 / 255, 228 / 255, 231 / 255)
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

/** Read once at boot; throws when a font is missing, so a bad deploy fails before it renders anything. */
export async function loadFonts(): Promise<Fonts> {
  const read = (name: string) => Deno.readFile(new URL(`./fonts/${name}`, import.meta.url))
  return { regular: await read('Inter-Regular.ttf'), bold: await read('Inter-SemiBold.ttf') }
}

export async function renderPdf(src: PdfSource, now: Date, fonts: Fonts, loadImage: (path: string) => Promise<Uint8Array | null>): Promise<Uint8Array> {
  const model = buildPdfModel(src, now)
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  doc.setTitle(model.title)
  doc.setCreator('ReportNoReport')
  doc.setProducer('ReportNoReport')
  doc.setCreationDate(now)
  const regular = await doc.embedFont(fonts.regular, { subset: true })
  const bold = await doc.embedFont(fonts.bold, { subset: true })
  const font = (b: boolean): PDFFont => (b ? bold : regular)
  const measure: Measure = (t, size, b) => font(b).widthOfTextAtSize(t, size)
  const embedded = new Map<string, PDFImage>()
  const image = async (path: string) => {
    const hit = embedded.get(path)
    if (hit) return hit
    const bytes = await loadImage(path)
    if (!bytes) throw new PdfProblem('A signature file is missing, so the PDF was not made. Ask the person to sign again.')
    if (!PNG_MAGIC.every((b, i) => bytes[i] === b)) throw new PdfProblem('A signature image could not be read, so the PDF was not made. Ask the person to sign again.')
    const img = await doc.embedPng(bytes)
    embedded.set(path, img)
    return img
  }
  for (const ops of layoutPdf(model, measure)) {
    const page = doc.addPage([595.28, 841.89])
    for (const o of ops) {
      if (o.op === 'text') page.drawText(o.text, { x: o.x, y: o.y, size: o.size, font: font(o.bold), color: o.muted ? MUTED : INK })
      else if (o.op === 'rule') page.drawLine({ start: { x: o.x, y: o.y }, end: { x: o.x + o.width, y: o.y }, thickness: 1, color: LINE })
      else {
        const img = await image(o.path)
        const fit = img.scaleToFit(o.width, o.height) // keeps the drawn signature's proportions inside its box
        page.drawImage(img, { x: o.x, y: o.y + (o.height - fit.height), width: fit.width, height: fit.height })
      }
    }
  }
  return doc.save()
}
```

- [ ] **Step 4: Write the failing worker tests** — `supabase/functions/render-pdfs/handler.test.ts`

```ts
import { assertEquals } from 'jsr:@std/assert@1'
import { setup, NOW } from '../advance/testkit.ts'
import { PdfProblem } from '../_shared/reports/pdf.ts'
import { SOURCE } from '../_shared/reports/fixture.ts'
import { ORG } from '../_shared/forms/fixture.ts'
import { MEMBER } from '../_shared/workflow/fixture.ts'
import { PDF_FAILED, renderPdfs, type Deps } from './handler.ts'

const min = (n: number) => new Date(NOW.getTime() + n * 60_000)

/** A started record with one PDF job the member asked for, and a source for it. */
async function withJob(status: 'open' | 'done' = 'open') {
  const s = setup()
  await s.start()
  const rec = s.db.records[0]
  rec.status = status
  const job = await s.store.tx((tx) => tx.queuePdf({ org_id: ORG, record_id: rec.id, requested_by: MEMBER }))
  s.db.pdfSources.set(rec.id, { ...structuredClone(SOURCE), record: { ...SOURCE.record, id: rec.id } })
  const uploads: string[] = []
  const deps = (over: Partial<Deps> = {}, at = NOW): Deps => ({
    authorised: true, store: s.store, now: () => at,
    render: () => Promise.resolve(new Uint8Array([37, 80, 68, 70])),
    upload: (path) => { uploads.push(path); return Promise.resolve() },
    ...over,
  })
  return { ...s, rec, job, uploads, deps }
}

Deno.test('renders a queued PDF, uploads it under the org and record, and tells the requester', async () => {
  const { db, rec, job, uploads, deps } = await withJob()
  assertEquals((await renderPdfs(deps())).body, { done: 1, retrying: 0, failed: 0 })
  assertEquals(uploads, [`${ORG}/${rec.id}/${job}.pdf`])
  assertEquals([db.pdfs[0].status, db.pdfs[0].path, db.pdfs[0].attempts], ['done', uploads[0], 1])
  assertEquals(db.events.at(-1)?.detail, { type: 'generate_pdf', status: 'done', job })
  assertEquals(db.notifications.at(-1), { org_id: ORG, user_id: MEMBER, kind: 'report_ready', title: `PDF ready: ${SOURCE.record.title}`, body: '', link: `#/records/${rec.id}` })
})

Deno.test('a failing render retries after 1 and 2 minutes, then fails with a plain reason and stops an open record', async () => {
  const { db, deps } = await withJob()
  const boom = { render: () => Promise.reject(new Error('ENOENT /var/tmp/internal path')) }
  assertEquals((await renderPdfs(deps(boom))).body, { done: 0, retrying: 1, failed: 0 })
  assertEquals(db.pdfs[0].next_attempt_at, min(1))
  assertEquals((await renderPdfs(deps(boom, min(0.5)))).body, { done: 0, retrying: 0, failed: 0 }) // not due yet
  assertEquals((await renderPdfs(deps(boom, min(1)))).body, { done: 0, retrying: 1, failed: 0 })
  assertEquals(db.pdfs[0].next_attempt_at, min(3))
  assertEquals((await renderPdfs(deps(boom, min(3)))).body, { done: 0, retrying: 0, failed: 1 })
  assertEquals([db.pdfs[0].status, db.pdfs[0].attempts, db.pdfs[0].error], ['failed', 3, PDF_FAILED])
  assertEquals([db.records[0].status, db.records[0].error], ['error', PDF_FAILED])
  assertEquals(db.events.at(-1)?.kind, 'error')
  assertEquals(JSON.stringify(db).includes('ENOENT'), false) // the exception text never reaches people
  assertEquals(db.notifications.at(-1)?.title.startsWith('PDF not made: '), true)
})

Deno.test('a missing signature fails at once and stops an open record', async () => {
  const { db, deps } = await withJob()
  const missing = 'A signature file is missing, so the PDF was not made. Ask the person to sign again.'
  assertEquals((await renderPdfs(deps({ render: () => Promise.reject(new PdfProblem(missing)) }))).body, { done: 0, retrying: 0, failed: 1 })
  assertEquals([db.pdfs[0].attempts, db.pdfs[0].error, db.records[0].status, db.records[0].error], [1, missing, 'error', missing])
})

Deno.test('a closed record keeps its status when its PDF fails', async () => {
  const { db, deps } = await withJob('done')
  await renderPdfs(deps({ render: () => Promise.reject(new PdfProblem('This record or its report template no longer exists, so the PDF was not made.')) }))
  assertEquals([db.pdfs[0].status, db.records[0].status, db.events.at(-1)?.kind], ['failed', 'done', 'error'])
})

Deno.test('a job whose worker died is failed once its last lease ends, and only once', async () => {
  const { db, deps } = await withJob()
  Object.assign(db.pdfs[0], { attempts: 3, next_attempt_at: min(-1) })
  assertEquals((await renderPdfs(deps())).body, { done: 0, retrying: 0, failed: 1 })
  assertEquals((await renderPdfs(deps())).body, { done: 0, retrying: 0, failed: 0 })
  assertEquals([db.pdfs[0].status, db.events.filter((e) => e.kind === 'error').length], ['failed', 1])
})

Deno.test('two overlapping runs render a job once', async () => {
  const { uploads, deps } = await withJob()
  const [a, b] = await Promise.all([renderPdfs(deps()), renderPdfs(deps())])
  assertEquals([(a.body.done as number) + (b.body.done as number), uploads.length], [1, 1])
})

Deno.test('refuses a call without the cron secret', async () => {
  const { db, deps } = await withJob()
  assertEquals((await renderPdfs(deps({ authorised: false }))).status, 401)
  assertEquals(db.pdfs[0].status, 'queued')
})
```

- [ ] **Step 5: Write `handler.ts`**

```ts
import { PdfProblem, readTemplate, type PdfSource } from '../_shared/reports/index.ts'
import type { PdfJob, Result, Store, Tx } from '../advance/engine.ts'

export type Deps = {
  authorised: boolean; store: Store; now(): Date
  render(src: PdfSource, now: Date): Promise<Uint8Array>
  upload(path: string, bytes: Uint8Array): Promise<void>
}
type Outcome = 'done' | 'retrying' | 'failed'

export const MAX_PDF_ATTEMPTS = 3
export const LEASE_MS = 5 * 60_000 // a worker that dies mid-render frees its job after this
/** 1 then 2 minutes after the 1st and 2nd failure. */
export const pdfBackoffMs = (attempts: number) => 60_000 * 2 ** (attempts - 1)
export const PDF_FAILED = 'The PDF could not be made. Try again in a few minutes.'
const BATCH = 10 // shortcut: 10 PDFs per wake-up; every request wakes the worker again, raise it when bursts queue up
const clip = (s: string) => (s.length > 200 ? `${s.slice(0, 199)}…` : s)

/** Woken by request_record_pdf, by the engine's queuePdf, and by pg_cron every minute. */
export async function renderPdfs(deps: Deps): Promise<Result> {
  if (!deps.authorised) return { status: 401, body: { error: 'Not allowed.' } }
  const now = deps.now()
  const counts = { done: 0, retrying: 0, failed: 0 }
  for (const job of await deps.store.tx((tx) => tx.expiredPdfs(now, BATCH))) {
    if (await deps.store.tx((tx) => failJob(tx, job, PDF_FAILED))) counts.failed += 1
  }
  for (const id of await deps.store.tx((tx) => tx.duePdfs(now, BATCH))) {
    const r = await renderOne(deps, id, now)
    if (r) counts[r] += 1
  }
  return { status: 200, body: counts }
}

async function renderOne(deps: Deps, id: string, now: Date): Promise<Outcome | null> {
  const job = await deps.store.tx((tx) => tx.claimPdf(id, now, new Date(now.getTime() + LEASE_MS)))
  if (!job) return null // another run has it
  const path = `${job.org_id}/${job.record_id}/${job.id}.pdf`
  let title = ''
  try {
    const row = await deps.store.tx((tx) => tx.pdfSource(job.record_id))
    if (!row) throw new PdfProblem('This record or its report template no longer exists, so the PDF was not made.')
    const template = readTemplate(row.template)
    if (!template) throw new PdfProblem('The report template could not be read, so the PDF was not made. Ask a reports manager to open and save it.')
    title = row.record.title
    await deps.upload(path, await deps.render({ ...row, template }, now))
  } catch (e) {
    const permanent = e instanceof PdfProblem
    if (!permanent) console.error('render-pdfs: attempt failed', job.id, e) // detail stays in the log; people read PDF_FAILED
    const message = permanent ? e.message : PDF_FAILED
    if (!permanent && job.attempts < MAX_PDF_ATTEMPTS) {
      await deps.store.tx((tx) => tx.finishPdf(job.id, { status: 'queued', error: message, nextAttemptAt: new Date(now.getTime() + pdfBackoffMs(job.attempts)) }))
      return 'retrying'
    }
    return (await deps.store.tx((tx) => failJob(tx, job, message))) ? 'failed' : null
  }
  const finished = await deps.store.tx(async (tx) => {
    await tx.lockRecord(job.record_id) // record first, then the job: the order advance uses
    if (!(await tx.finishPdf(job.id, { status: 'done', error: null, path }))) return false
    await tx.event({ org_id: job.org_id, record_id: job.record_id, kind: 'action', node_id: null, actor_id: job.requested_by, detail: { type: 'generate_pdf', status: 'done', job: job.id } })
    if (job.requested_by) {
      await tx.notify([{ org_id: job.org_id, user_id: job.requested_by, kind: 'report_ready', title: clip(`PDF ready: ${title}`), body: '', link: `#/records/${job.record_id}` }])
    }
    return true
  })
  return finished ? 'done' : null
}

/** The last failure: the job, the timeline, the requester and an open record all say so (spec §5.4, §10). */
async function failJob(tx: Tx, job: PdfJob, message: string): Promise<boolean> {
  const rec = await tx.lockRecord(job.record_id) // record first, then the job
  if (!(await tx.finishPdf(job.id, { status: 'failed', error: message }))) return false
  if (!rec) return true
  await tx.event({ org_id: rec.org_id, record_id: rec.id, kind: 'error', node_id: rec.current_node_id, actor_id: null, detail: { type: 'generate_pdf', job: job.id, message } })
  if (rec.status === 'open') {
    rec.status = 'error'
    rec.error = message
    await tx.saveRecord(rec)
  }
  if (job.requested_by) {
    await tx.notify([{ org_id: rec.org_id, user_id: job.requested_by, kind: 'report_ready', title: clip(`PDF not made: ${rec.title}`), body: message, link: `#/records/${rec.id}` }])
  }
  return true
}
```

- [ ] **Step 6: Write `index.ts`**

```ts
import { createClient } from 'npm:@supabase/supabase-js@2'
import { renderPdfs } from './handler.ts'
import { loadFonts, renderPdf } from './render.ts'
import { pgStore } from '../advance/pgStore.ts'

const fonts = await loadFonts() // throws at boot when the fonts were not shipped (config.toml static_files)
const store = pgStore(Deno.env.get('SUPABASE_DB_URL')!)
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Signatures live in form-files; buildPdfModel has already checked each path is inside the record's org. */
async function loadImage(path: string): Promise<Uint8Array | null> {
  const { data, error } = await admin.storage.from('form-files').download(path)
  if (error) {
    if ((error as { statusCode?: string }).statusCode === '404' || /not found/i.test(error.message)) return null
    throw error // a storage outage is retried, not reported as a missing signature
  }
  return new Uint8Array(await data.arrayBuffer())
}

async function upload(path: string, bytes: Uint8Array): Promise<void> {
  const { error } = await admin.storage.from('record-pdfs').upload(path, bytes, { contentType: 'application/pdf', upsert: true })
  if (error) throw error
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  const secret = Deno.env.get('CRON_SECRET') ?? ''
  try {
    const authorised = secret.length >= 16 && req.headers.get('Authorization') === `Bearer ${secret}`
    const res = await renderPdfs({ authorised, store, now: () => new Date(), render: (src, now) => renderPdf(src, now, fonts, loadImage), upload })
    return json(res.status, res.body)
  } catch (e) {
    console.error('render-pdfs failed', e)
    return json(500, { error: 'Rendering failed.' })
  }
})
```

- [ ] **Step 7: Run — expect PASS**

Run: `DENO_NO_PACKAGE_JSON=1 deno test --allow-read supabase/functions`
Expected: the 4 renderer and 7 worker tests pass with every earlier test (`deno.lock` gains `pdf-lib` and `@pdf-lib/fontkit`).

Then, against the local stack (`supabase functions serve` restarted so `render-pdfs` is picked up), sign in as `member@alpha.test`, start and approve a short Leave approval in the app, and run:
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select status, attempts, path, error from record_pdfs order by created_at desc limit 1"
```
Expected: within a few seconds `done | 1 | <org>/<record>/<job>.pdf |` (empty error), and the object opens as a PDF from Studio → Storage → `record-pdfs`.

- [ ] **Step 8: Docs and commit**

Add to `README.md` under "Edge Functions": `render-pdfs` (pg_cron and `request_record_pdf` wake it with `CRON_SECRET`; hosted projects create the `render_pdfs_url` Vault secret like `send_messages_url`; fonts ship through `static_files`, Inter 4.1, SIL OFL).

```bash
git add supabase/functions/render-pdfs deno.lock supabase/functions/.env.example README.md
git commit -m "feat: render record pdfs in a queued edge function"
```

---

### Task 6: Edge Function `run-report` — execution as the caller, paging, CSV

**Owner:** Backend engineer · **Depends on:** 2

**Files:**
- Create: `supabase/functions/run-report/handler.ts`, `handler.test.ts`, `source.ts`, `visibility.test.ts`, `index.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `readReportDef`, `runReport`, `stepFields`, `dataColumns`, `columnLabel`, `aggregateLabel`, `toCsv`, `csvFilename`, `PAGE_SIZE`, `MAX_PAGE_SIZE` (Task 2); `readGraph`, `nodeById`, `nodeName` (`_shared/workflow`); RLS on `records`, `saved_reports`, `workflows`, `forms`, `members`; `my_permissions(uuid)` (Phase 1).
- Produces:
  - `interface ReportSource { permissions(orgId): Promise<ReadonlySet<string>>; savedReport(id, orgId): Promise<SavedRow | null>; workflow(id, orgId): Promise<{ name: string; graph: unknown } | null>; forms(orgId, ids: string[]): Promise<Map<string, Field[]>>; names(orgId): Promise<Map<string, string>>; records(orgId, workflowId): AsyncIterable<ReportRecord[]> }`
  - `type SavedRow = { name: string; workflow_id: string; columns: unknown; filters: unknown; group_by: unknown; aggregate: unknown }`
  - `type Deps = { userId(): Promise<string | null>; source: ReportSource; now(): Date }`
  - `runReportRequest(body: unknown, deps: Deps): Promise<Result | { status: 200; csv: string; filename: string }>`, `MAX_SCAN = 10000`
  - `callerSource(client: SupabaseClient): ReportSource`
  - POST `/functions/v1/run-report`, body `{ orgId, reportId }` or `{ orgId, workflowId, definition: { columns, filters, group_by, aggregate } }`, plus `page?`, `pageSize?` (1–100), `format?: 'json' | 'csv'`
  - JSON 200: `{ name: string; workflowName: string; columns: string[]; groupLabel: string | null; aggregateLabel: string | null; aggregateFn: 'count' | 'sum' | null; result: RunResult }`; CSV 200: `text/csv; charset=utf-8` with `Content-Disposition: attachment; filename="<csvFilename>"`
  - errors: 400 (bad body, or the draft's own sentence), 401 "Sign in again to continue.", 403 "Not allowed.", 404 "This report does not exist." / "This report's workflow does not exist.", 409 "This report needs fixing: …", 413 "This workflow has more than 10,000 records you can see, which is more than one report can read. Ask an admin to split the work into separate workflows.", 500 "We could not run this report. Try again."

- [ ] **Step 1: Write the failing handler tests** — `supabase/functions/run-report/handler.test.ts`

```ts
import { assertEquals } from 'jsr:@std/assert@1'
import { runReportRequest, type Deps, type ReportSource, type SavedRow } from './handler.ts'
import { rec } from '../_shared/reports/fixture.ts'
import { FORM, ORG } from '../_shared/forms/fixture.ts'
import { LEAVE, WF, F_LEAVE, F_APPROVAL } from '../_shared/workflow/fixture.ts'
import type { ReportRecord } from '../_shared/reports/run.ts'

const REPORT = '0000000a-0000-0000-0000-00000000e001'
const SAVED: SavedRow = { name: 'Leave days by type', workflow_id: WF, columns: [{ meta: 'title' }, { field: 'leave_type' }, { field: 'days' }], filters: [], group_by: null, aggregate: null }

function source(records: ReportRecord[], over: Partial<ReportSource> = {}, pageSize = 1000): ReportSource & { pagesRead: number } {
  const s = {
    pagesRead: 0,
    permissions: () => Promise.resolve(new Set(['reports.view'])),
    savedReport: (id: string) => Promise.resolve(id === REPORT ? structuredClone(SAVED) : null),
    workflow: () => Promise.resolve({ name: 'Leave approval', graph: LEAVE }),
    forms: () => Promise.resolve(new Map([[F_LEAVE, FORM], [F_APPROVAL, [{ key: 'comment', type: 'long_text' as const, label: 'Comment' }]]])),
    names: () => Promise.resolve(new Map([['00000000-0000-0000-0000-0000000000a3', 'Ada Lovelace']])),
    async *records() {
      for (let i = 0; i < records.length; i += pageSize) { s.pagesRead += 1; yield records.slice(i, i + pageSize) }
    },
    ...over,
  }
  return s
}
const deps = (src: ReportSource, user: string | null = 'u'): Deps => ({ userId: () => Promise.resolve(user), source: src, now: () => new Date('2026-10-11T12:00:00Z') })
const many = (n: number) => Array.from({ length: n }, (_, i) => rec(`r${String(i).padStart(5, '0')}`, { leave_type: i % 2 ? 'Annual' : 'Medical', days: i },
  { created_at: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString() }))

Deno.test('refuses a bad body, no session and a caller without reports.view', async () => {
  assertEquals((await runReportRequest({ orgId: 'x' }, deps(source([])))).status, 400)
  assertEquals((await runReportRequest({ orgId: ORG, reportId: REPORT, pageSize: 500 }, deps(source([])))).status, 400)
  assertEquals((await runReportRequest({ orgId: ORG, reportId: REPORT }, deps(source([]), null))).status, 401)
  const none = source([], { permissions: () => Promise.resolve(new Set<string>()) })
  assertEquals((await runReportRequest({ orgId: ORG, reportId: REPORT }, deps(none))), { status: 403, body: { error: 'Not allowed.' } })
})

Deno.test('a saved report runs newest first with labels and the full totals', async () => {
  const res = await runReportRequest({ orgId: ORG, reportId: REPORT, page: 2, pageSize: 2 }, deps(source(many(5))))
  assertEquals(res.status, 200)
  const body = (res as { body: Record<string, any> }).body
  assertEquals([body.name, body.workflowName, body.columns], ['Leave days by type', 'Leave approval', ['Title', 'Leave type', 'Days']])
  assertEquals([body.result.total, body.result.page, body.result.rows.map((r: { id: string }) => r.id)], [5, 2, ['r00002', 'r00001']])
})

Deno.test('a draft definition groups and sums with its labels', async () => {
  const res = await runReportRequest({ orgId: ORG, workflowId: WF, definition: { columns: [{ meta: 'title' }], group_by: { field: 'leave_type' }, aggregate: { fn: 'sum', field: 'days' } } },
    deps(source(many(4))))
  const body = (res as { body: Record<string, any> }).body
  assertEquals([body.groupLabel, body.aggregateLabel, body.result.groups.map((g: { key: string; sum: number }) => [g.key, g.sum])],
    ['Leave type', 'Total days', [['Annual', 4], ['Medical', 2]]])
})

Deno.test('a broken saved report is 409 with the reason, a missing one 404, a broken draft 400', async () => {
  const broken = source([], { savedReport: () => Promise.resolve({ ...SAVED, columns: [] }) })
  assertEquals(await runReportRequest({ orgId: ORG, reportId: REPORT }, deps(broken)), { status: 409, body: { error: 'This report needs fixing: Choose at least one column.' } })
  assertEquals(await runReportRequest({ orgId: ORG, reportId: '0000000a-0000-0000-0000-00000000e0ff' }, deps(source([]))), { status: 404, body: { error: 'This report does not exist.' } })
  assertEquals(await runReportRequest({ orgId: ORG, workflowId: WF, definition: { columns: [] } }, deps(source([]))), { status: 400, body: { error: 'Choose at least one column.' } })
})

Deno.test('more than 10,000 records is refused, never cut', async () => {
  const src = source(many(10_001))
  const res = await runReportRequest({ orgId: ORG, reportId: REPORT }, deps(src))
  assertEquals(res, { status: 413, body: { error: 'This workflow has more than 10,000 records you can see, which is more than one report can read. Ask an admin to split the work into separate workflows.' } })
  assertEquals(src.pagesRead, 11)
  assertEquals((await runReportRequest({ orgId: ORG, reportId: REPORT }, deps(source(many(10_000))))).status, 200)
})

Deno.test('csv export returns every row, not a page', async () => {
  const res = await runReportRequest({ orgId: ORG, reportId: REPORT, format: 'csv', page: 1, pageSize: 10 }, deps(source(many(120))))
  const out = res as { status: number; csv: string; filename: string }
  assertEquals([out.status, out.filename], [200, 'leave-days-by-type-2026-10-11.csv'])
  const lines = out.csv.split('\r\n')
  assertEquals([lines[0], lines.length], ['﻿Title,Leave type,Days', 122]) // header + 120 rows + the final empty string
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `DENO_NO_PACKAGE_JSON=1 deno test supabase/functions/run-report/handler.test.ts`
Expected: FAIL with `Module not found "…/run-report/handler.ts"`.

- [ ] **Step 3: Write `handler.ts`**

```ts
import type { Field } from '../_shared/forms/index.ts'
import { nodeById, nodeName, readGraph } from '../_shared/workflow/graph.ts'
import {
  MAX_PAGE_SIZE, PAGE_SIZE, aggregateLabel, columnLabel, csvFilename, dataColumns, readReportDef, runReport, stepFields, toCsv,
  type Cell, type ReportRecord,
} from '../_shared/reports/index.ts'
import type { Result } from '../advance/engine.ts'

export type SavedRow = { name: string; workflow_id: string; columns: unknown; filters: unknown; group_by: unknown; aggregate: unknown }
/** Every method reads as the caller: RLS decides which rows exist. */
export interface ReportSource {
  permissions(orgId: string): Promise<ReadonlySet<string>>
  savedReport(id: string, orgId: string): Promise<SavedRow | null>
  workflow(id: string, orgId: string): Promise<{ name: string; graph: unknown } | null>
  forms(orgId: string, ids: string[]): Promise<Map<string, Field[]>>
  names(orgId: string): Promise<Map<string, string>>
  records(orgId: string, workflowId: string): AsyncIterable<ReportRecord[]>
}
export type Deps = { userId(): Promise<string | null>; source: ReportSource; now(): Date }
export type Csv = { status: 200; csv: string; filename: string }

// shortcut: a report reads at most 10,000 visible records and filters them in TypeScript (spec §4.3's one evaluator);
// push filters into SQL when an org's workflow outgrows it.
export const MAX_SCAN = 10_000
const TOO_MANY = 'This workflow has more than 10,000 records you can see, which is more than one report can read. Ask an admin to split the work into separate workflows.'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const intIn = (v: unknown, fallback: number, max: number) => (v === undefined ? fallback : Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max ? v as number : null)
const keyText = (k: Cell) => (k === null ? 'No answer' : k)

type Req = { orgId: string; reportId: string | null; workflowId: string | null; definition: unknown; page: number; pageSize: number; format: 'json' | 'csv' }

function parse(b: unknown): Req | null {
  if (!isObj(b) || !isUuid(b.orgId)) return null
  const format = b.format === undefined || b.format === 'json' ? 'json' : b.format === 'csv' ? 'csv' : null
  const page = intIn(b.page, 1, 100_000)
  const pageSize = intIn(b.pageSize, PAGE_SIZE, MAX_PAGE_SIZE)
  if (!format || page === null || pageSize === null) return null
  if (isUuid(b.reportId)) return { orgId: b.orgId, reportId: b.reportId, workflowId: null, definition: null, page, pageSize, format }
  if (isUuid(b.workflowId) && isObj(b.definition)) return { orgId: b.orgId, reportId: null, workflowId: b.workflowId, definition: b.definition, page, pageSize, format }
  return null
}

/** Runs a saved report or a builder draft over the records the caller can see. */
export async function runReportRequest(body: unknown, deps: Deps): Promise<Result | Csv> {
  const req = parse(body)
  if (!req) return { status: 400, body: { error: 'Send a report to run.' } }
  if (!(await deps.userId())) return { status: 401, body: { error: 'Sign in again to continue.' } }
  const perms = await deps.source.permissions(req.orgId)
  if (!perms.has('reports.view') && !perms.has('reports.manage')) return { status: 403, body: { error: 'Not allowed.' } }

  let name = 'Report'
  let workflowId = req.workflowId as string
  let raw = req.definition as SavedRow
  if (req.reportId) {
    const saved = await deps.source.savedReport(req.reportId, req.orgId)
    if (!saved) return { status: 404, body: { error: 'This report does not exist.' } }
    ;({ name, workflow_id: workflowId } = saved)
    raw = saved
  }
  const parsed = readReportDef(raw)
  if (!parsed.ok) return req.reportId ? { status: 409, body: { error: `This report needs fixing: ${parsed.error}` } } : { status: 400, body: { error: parsed.error } }
  const def = parsed.value
  const wf = await deps.source.workflow(workflowId, req.orgId)
  if (!wf) return { status: 404, body: { error: "This report's workflow does not exist." } }

  const graph = readGraph(wf.graph) ?? { nodes: [], edges: [] }
  const formIds = [...new Set(graph.nodes.flatMap((n) => (n.type === 'start' || n.type === 'form' ? [n.formId] : [])))]
  const [forms, names] = await Promise.all([deps.source.forms(req.orgId, formIds), deps.source.names(req.orgId)])
  const records: ReportRecord[] = []
  for await (const page of deps.source.records(req.orgId, workflowId)) {
    records.push(...page)
    if (records.length > MAX_SCAN) return { status: 413, body: { error: TOO_MANY } }
  }
  records.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)) // newest first, stable

  const cols = dataColumns(stepFields(graph, forms))
  const ctx = { now: deps.now(), stepName: (id: string) => nodeName(nodeById(graph, id)), personName: (id: string) => names.get(id) ?? 'Former member' }
  const columns = def.columns.map((c) => columnLabel(c, cols))
  const groupLabel = def.groupBy ? columnLabel(def.groupBy, cols) : null
  const aggLabel = def.aggregate ? aggregateLabel(def.aggregate, cols) : null

  if (req.format === 'csv') {
    const all = runReport(records, def, ctx, null)
    const day = ctx.now.toISOString().slice(0, 10)
    const csv = all.kind === 'rows'
      ? toCsv(columns, all.rows.map((r) => r.cells))
      : def.aggregate?.fn === 'sum'
        ? toCsv([groupLabel!, aggLabel!, 'Records', 'Values left out'], all.groups.map((g) => [keyText(g.key), g.sum, g.count, g.skipped]))
        : toCsv([groupLabel!, aggLabel!], all.groups.map((g) => [keyText(g.key), g.count]))
    return { status: 200, csv, filename: csvFilename(name, day) }
  }
  const result = runReport(records, def, ctx, { page: req.page, pageSize: req.pageSize })
  return { status: 200, body: { name, workflowName: wf.name, columns, groupLabel, aggregateLabel: aggLabel, aggregateFn: def.aggregate?.fn ?? null, result } }
}
```

- [ ] **Step 4: Write `source.ts`**

```ts
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { Field } from '../_shared/forms/index.ts'
import type { ReportRecord } from '../_shared/reports/index.ts'
import type { ReportSource, SavedRow } from './handler.ts'

const RECORD_COLS = 'id, title, status, label, current_node_id, started_by, created_at, updated_at, data'
const PAGE = 1000 // PostgREST's max rows per request
const NIL = '00000000-0000-0000-0000-000000000000'

function must<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error // index.ts logs it and answers a plain 500; nothing from it reaches people
  return data as T
}

/** Built from the caller's Authorization header only: there is no service-role client in run-report. */
export function callerSource(c: SupabaseClient): ReportSource {
  return {
    permissions: async (orgId) => new Set(must<string[]>(await c.rpc('my_permissions', { p_org: orgId }))),
    savedReport: async (id, orgId) => must<SavedRow | null>(await c.from('saved_reports')
      .select('name, workflow_id, columns, filters, group_by, aggregate').eq('id', id).eq('org_id', orgId).maybeSingle()),
    workflow: async (id, orgId) => must<{ name: string; graph: unknown } | null>(await c.from('workflows')
      .select('name, graph').eq('id', id).eq('org_id', orgId).maybeSingle()),
    forms: async (orgId, ids) => (ids.length
      ? new Map(must<{ id: string; schema: Field[] }[]>(await c.from('forms').select('id, schema').eq('org_id', orgId).in('id', ids)).map((f) => [f.id, f.schema]))
      : new Map()),
    names: async (orgId) => new Map(must<{ user_id: string | null; email: string; full_name: string | null }[]>(
      await c.from('members').select('user_id, email, full_name').eq('org_id', orgId))
      .filter((m) => m.user_id).map((m) => [m.user_id as string, m.full_name?.trim() || m.email])),
    // Keyset by id: a record inserted while we read can neither repeat a row nor push one out of the pages.
    async *records(orgId, workflowId) {
      let last = NIL
      for (;;) {
        const rows = must<ReportRecord[]>(await c.from('records').select(RECORD_COLS)
          .eq('org_id', orgId).eq('workflow_id', workflowId).gt('id', last).order('id').limit(PAGE))
        yield rows
        if (rows.length < PAGE) return
        last = rows[rows.length - 1].id
      }
    },
  }
}
```

- [ ] **Step 5: Write `index.ts`**

```ts
import { createClient } from 'npm:@supabase/supabase-js@2'
import { runReportRequest } from './handler.ts'
import { callerSource } from './source.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'content-disposition',
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const MAX_BODY = 100_000
const url = Deno.env.get('SUPABASE_URL')!
const anon = Deno.env.get('SUPABASE_ANON_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  const text = await req.text()
  if (text.length > MAX_BODY) return json(413, { error: 'This report is too large to send.' })
  let body: unknown = null
  try { body = JSON.parse(text) } catch { /* body stays null; the handler answers 400 */ }
  const asCaller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } })
  try {
    const res = await runReportRequest(body, {
      userId: async () => (await asCaller.auth.getUser()).data.user?.id ?? null,
      source: callerSource(asCaller),
      now: () => new Date(),
    })
    if ('csv' in res) {
      return new Response(res.csv, { status: 200, headers: { ...CORS, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${res.filename}"` } })
    }
    return json(res.status, res.body)
  } catch (e) {
    console.error('run-report failed', e)
    return json(500, { error: 'We could not run this report. Try again.' })
  }
})
```

- [ ] **Step 6: Write the real visibility test** — `supabase/functions/run-report/visibility.test.ts`

```ts
import { assertEquals } from 'jsr:@std/assert@1'
import { createClient } from 'npm:@supabase/supabase-js@2'
import postgres from 'npm:postgres@3.4.5'
import { runReportRequest } from './handler.ts'
import { callerSource } from './source.ts'

const env = (k: string) => (Deno.permissions.querySync({ name: 'env', variable: k }).state === 'granted' ? Deno.env.get(k) : undefined)
const url = env('RNR_TEST_SUPABASE_URL')
const anon = env('RNR_TEST_ANON_KEY')
const db = env('RNR_TEST_DB_URL')
const ALPHA = '0000000a-0000-0000-0000-000000000001'
const WF = '0000000a-0000-0000-0000-00000000c001'
const ADMIN = '00000000-0000-0000-0000-0000000000a2'
const MEMBER = '00000000-0000-0000-0000-0000000000a3'

/** Runs the real handler with the real caller source, as the signed-in user. */
async function runAs(email: string, tag: string) {
  const c = createClient(url!, anon!, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: 'password123' })
  if (error) throw error
  const res = await runReportRequest(
    { orgId: ALPHA, workflowId: WF, definition: { columns: [{ meta: 'title' }], filters: [{ field: 'tag', operator: 'is', value: tag }] } },
    { userId: async () => (await c.auth.getUser()).data.user?.id ?? null, source: callerSource(c), now: () => new Date() })
  await c.auth.signOut()
  if (res.status !== 200 || !('body' in res)) return res.status
  return ((res.body.result as { rows: { cells: string[] }[] }).rows.map((r) => r.cells[0]) as string[]).sort()
}

Deno.test({
  name: 'real Supabase: a report returns only the records the caller can see',
  ignore: !(url && anon && db),
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const sql = postgres(db!, { max: 1 })
    const tag = crypto.randomUUID()
    const data = sql.json({ tag })
    const [prev] = await sql`select wa.can_view_all from workflow_access wa join roles r on r.id = wa.role_id
      where wa.workflow_id = ${WF} and r.org_id = ${ALPHA} and r.name = 'Admin'`
    try {
      const rows = await sql`
        insert into records (org_id, workflow_id, title, current_node_id, data, started_by) values
          (${ALPHA}, ${WF}, 'V1 member started', null, ${data}, ${MEMBER}),
          (${ALPHA}, ${WF}, 'V2 admin started', null, ${data}, ${ADMIN}),
          (${ALPHA}, ${WF}, 'V3 member holds a task', 'approve', ${data}, ${ADMIN})
        returning id, title`
      const r3 = rows.find((r) => r.title === 'V3 member holds a task')!
      await sql`insert into tasks (org_id, record_id, node_id, assignee_user_id) values (${ALPHA}, ${r3.id}, 'approve', ${MEMBER})`

      assertEquals(await runAs('member@alpha.test', tag), ['V1 member started', 'V3 member holds a task'])
      assertEquals(await runAs('admin@alpha.test', tag), ['V1 member started', 'V2 admin started', 'V3 member holds a task'])
      assertEquals(await runAs('viewer@alpha.test', tag), [])
      assertEquals(await runAs('owner@beta.test', tag), 403)

      await sql`update workflow_access set can_view_all = false where workflow_id = ${WF}
        and role_id = (select id from roles where org_id = ${ALPHA} and name = 'Admin')`
      assertEquals(await runAs('admin@alpha.test', tag), ['V2 admin started', 'V3 member holds a task']) // narrowed to what admin started
    } finally {
      await sql`update workflow_access set can_view_all = ${prev?.can_view_all ?? true} where workflow_id = ${WF}
        and role_id = (select id from roles where org_id = ${ALPHA} and name = 'Admin')`
      await sql`delete from records where data->>'tag' = ${tag}` // tasks cascade
      await sql.end()
    }
  },
})
```

Run (with `supabase start` and the seed loaded):
```bash
RNR_TEST_SUPABASE_URL=http://127.0.0.1:54321 RNR_TEST_ANON_KEY=<ANON_KEY from supabase status> \
RNR_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres DENO_NO_PACKAGE_JSON=1 \
deno test --allow-env --allow-net supabase/functions/run-report/visibility.test.ts
```
Expected: `ok | 1 passed`. Without the variables it is reported as ignored.

- [ ] **Step 7: Run — expect PASS**

Run: `DENO_NO_PACKAGE_JSON=1 deno test --allow-read supabase/functions`
Expected: the 6 handler tests pass with everything before; `visibility.test.ts` is ignored without its variables.

- [ ] **Step 8: Docs and commit**

Add `run-report` to `README.md` (reads only with the caller's JWT; 10,000-record ceiling; CSV export; how to run `visibility.test.ts`).

```bash
git add supabase/functions/run-report README.md
git commit -m "feat: run reports as the caller with paging and csv export"
```

---

### Task 7: Design spec for Phase 5 screens

**Owner:** Senior Designer · **Depends on:** — (must be committed before Task 8 starts)

**Files:**
- Create: `docs/superpowers/design/phase-5-screens.md`

**Interfaces:**
- Consumes: `design/README.md` (dataviz: series colours `in`/`out`, tabular numerals, B&W hatch, dashboard grid 1/2/4 columns, Widget drag states, keyboard and menu drag paths), `design/tokens.css`, `design/components/*` (Widget, DataTable, Button, Field, Dialog, Menu, Segmented, Badge, Icon), `docs/superpowers/design/phase-1-screens.md`–`phase-4-screens.md` (their §0 rules, the layer trap and every `src/index.css` addition still apply), this plan's Tasks 8, 9 and 10 code, and the shipped `src/**` (App shell, `ConfirmDialog`, `useAction`, `useNotice`, `useFocusAfterRender`, `Skeleton`, `When`, `navGuard`, `errors`, `RecordPage`, the forms `RuleEditor` and builder drag list).
- Produces: the spec the frontend engineer follows in Tasks 8, 9 and 10 wherever it differs from this plan's markup or copy.

- [ ] **Step 1: Write the spec** in the format of `phase-4-screens.md` (tables, exact classes/tokens, "DD" where the system is silent), with these sections:
  1. Global additions: nav order and visibility (Dashboard and Reports for `reports.view`, after Records; which item is current for `#/reports/<id>`), page widths (dashboard full `max-w-5xl`, builder two-column from `lg:`), number formatting (en-GB, tabular `rnr-num`, right-aligned `.num`), date cells (`whenText` for record times), the "No answer" group word, status words.
  2. Record page PDF panel: placement (after the status block, before the map), the states (no template — hidden for people without `reports.manage`, a hint with a "Set up a report template" link for those with it; never made; queued with `rnr-spin` and "Making the PDF…"; ready with "Open PDF" + made time; failed with the stored reason, `rnr-status` with the X icon, and "Try again"), what "Generate PDF" says while busy and after, focus after a click (stays on the button; the polite status line announces "PDF requested. It will be ready in a few seconds."), and the timeline sentences for `generate_pdf` (pending history, queued, done, failed).
  3. Report template editor (`#/workflows/<id>/report`): header textarea, the field picker (steps as fieldsets, one `rnr-check` per field, chosen fields listed in order with Move up / Move down icon buttons — no drag here), the sign-off step checklist, Save / saved / conflict states, the unsaved-changes dialog, the empty state when the workflow has no Start form yet.
  4. Reports list: columns (name, workflow, kind — "Table" or "Grouped", last updated), New report dialog (name + workflow select), per-row Open / Delete, delete confirmation copy (widgets using it are removed too — say how many), empty states (first run with one primary action; `reports.view` without manage sees "No reports yet. Ask a reports manager to create one.").
  5. Report page: builder panel for `reports.manage` (name; columns as an ordered list with add menu grouped "Record" / answers and Move up / Move down / Remove; filters with the shared `RuleEditor` plus Add filter / Remove; Group by select with "No grouping"; Total as `rnr-seg` "Count records" / "Add up a number" plus the number field select, enabled only with a group), Save / Saved / conflict, the read-only summary for `reports.view`; results panel: the totals line ("240 records", "31 groups from 240 records", "2 values were not numbers and were left out"), the table (sticky first column on phones, `rnr-table-card`), the pager ("Page 2 of 5", Previous / Next as `rnr-btn-ghost`, the page-size select 25/50/100), "Download CSV" with busy state and the filename it saves, the four empty states (no records, filtered out, error, too many records — the 413 sentence verbatim).
  6. Dashboard: the grid (`rnr-grid`, 1 / 2 from `sm:` / 4 from `lg:`, spans 1/2/4), each widget per `design/components/Widget` (title, body, "Open report" link), number widget (`kpi`, the label under it), table widget (first 10 rows, "Showing 10 of 240"), chart widget (bar and line, size, axis, gridlines in `line-100`, bars in `--in`, the `opacity-dim` hover rule, value labels, the "Showing the first 24 of 31 groups" note, the "Show as table" toggle as `rnr-btn-ghost` with `aria-pressed`), Edit layout mode (Widget `data-state` editing/overlay/placeholder, grip handle `aria-label="Drag <title>"`, the Move up / Move down / Width menu, Remove with confirm), Add widget dialog (report select, kind `rnr-seg`, title, width), the live region sentences for moves ("Moved By type to position 2 of 4."), empty states (first run; `reports.view` without widgets), and a stale layout ("The dashboard changed. Reload to see the latest layout." with Reload).
  7. Chart specifics (design/README dataviz): one series in `--in`, never colour alone (values labelled), B&W themes (one series, so no hatch needed — state it), tabular numerals on axis labels, the zero line in `line-300`, negative bars below it, the SVG text summary for screen readers ("Bar chart of Leave days by type: Annual 12, Medical 4."), and the minimum width before the chart switches to the table automatically (DD).
  8. Copy table for every new string, and an accessibility summary (focus after delete/remove/save/reorder, live regions, 44px targets, keyboard drag path, 375px with no page-level horizontal scroll, `prefers-reduced-motion`).
  9. `src/index.css` additions as a §11-style list of named classes (`rnr-dash`, `rnr-widget-*`, `rnr-chart*`, `rnr-pager`, …) with every value from tokens, and the only allowed inline `style` (dnd-kit's transform/transition on a dragged widget) — chart geometry is SVG attributes and widget spans are `col-span` classes; no other inline styles (QA-P4-5).
  10. Conflicts with Tasks 8, 9 and 10 and the corrections the frontend must make.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/design/phase-5-screens.md
git commit -m "docs: add phase 5 screen design spec"
```

---

### Task 8: Frontend — data layer, routes, record PDF panel, template editor, timeline

**Owner:** Frontend engineer · **Depends on:** 1, 2, 7

**Files:**
- Create: `src/reports/logic.ts`, `src/reports/api.ts`, `src/reports/PdfPanel.tsx`, `src/reports/ReportTemplatePage.tsx`, `src/ui/useLeaveGuard.ts`
- Modify: `src/rbac/route.ts`, `src/rbac/route.test.ts`, `src/ui/errors.ts`, `src/ui/errors.test.ts`, `src/records/timeline.ts`, `src/records/timeline.test.ts`, `src/records/RecordPage.tsx`, `src/workflows/canvas/SidePanel.tsx`, `src/workflows/WorkflowsPage.tsx`, `src/App.tsx`, `src/index.css` (designer §9 classes)

**Interfaces:**
- Consumes: `report_templates`, `record_pdfs`, `request_record_pdf`, the `record-pdfs` bucket (Task 1); `stepFields`, `ReportTemplate`, `RunResult`, `Column`, `Aggregate` (Task 2); `useWorkflow`, `useForms`, `useOrg`, `useAction`, `useNotice`, `useFocusAfterRender`, `ConfirmDialog`, `setNavGuard`, `friendlyError`, `Skeleton`, `When`.
- Produces:
  - `src/reports/api.ts`: `useReportTemplate(workflowId)`, `createReportTemplate(orgId, workflowId, t)`, `updateReportTemplate(id, t, updatedAt)`, `type PdfRow`, `useRecordPdf(recordId)`, `usePdfUrl(path)`, `requestPdf(recordId)`, `type SavedReport`, `useReports(orgId)`, `useReport(id)`, `createReport(orgId, workflowId, name)`, `updateReport(id, fields, updatedAt)`, `deleteReport(id)`, `type RunBody`, `type RunResponse`, `class ReportError`, `useRunReport(orgId, userId, body, page, pageSize)`, `downloadCsv(orgId, body, name)`, `type WidgetRow`, `useWidgets(orgId)`, `addWidget(row)`, `removeWidget(id)`, `saveLayout(orgId, layout)`
  - `useLeaveGuard(dirty: boolean, selfHash: string): { leaveTo: Next | null; stay(): void; leave(): void }`
  - routes `#/dashboard`, `#/reports`, `#/reports/<id>`, `#/workflows/<id>/report`; `Perms` gains `reports` (`reports.view` or `reports.manage`) and `reportsManage`

- [ ] **Step 1: Write the failing tests**

Append to `src/rbac/route.test.ts`, and add `reports: true, reportsManage: true` to `all` and `reports: false, reportsManage: false` to `none` at the top:
```ts
test('parses report, dashboard and report template pages', () => {
  assert.deepEqual(parseRoute('#/dashboard'), { page: 'dashboard' })
  assert.deepEqual(parseRoute('#/reports'), { page: 'reports' })
  assert.deepEqual(parseRoute(`#/reports/${id}`), { page: 'report', id })
  assert.deepEqual(parseRoute(`#/workflows/${id}/report`), { page: 'workflow-report', id })
})
test('report pages need reports.view; the template editor needs reports.manage', () => {
  for (const h of ['#/dashboard', '#/reports', `#/reports/${id}`, `#/workflows/${id}/report`]) assert.equal(guardHash(h, none), '#/inbox')
  const viewer = { ...none, reports: true }
  assert.equal(guardHash(`#/reports/${id}`, viewer), `#/reports/${id}`)
  assert.equal(guardHash(`#/workflows/${id}/report`, viewer), '#/inbox')
  assert.equal(guardHash(`#/workflows/${id}/report`, { ...none, reports: true, reportsManage: true }), `#/workflows/${id}/report`)
})
```

Append to `src/ui/errors.test.ts`:
```ts
test('report and pdf messages', () => {
  assert.equal(friendlyError({ message: 'This workflow has no report template yet.' }), 'This workflow has no report template yet. Ask a reports manager to set one up.')
  assert.equal(friendlyError({ message: 'The dashboard changed. Reload to see the latest layout.' }), 'The dashboard changed. Reload to see the latest layout.')
})
```

Replace the two `generate_pdf` assertions in `src/records/timeline.test.ts` and add one test:
```ts
  assert.equal(eventText(ev('action', 'approve', { type: 'generate_pdf', status: 'pending' }), LEAVE, null), 'PDF not made: recorded before reports were available.')
```
```ts
  assert.equal(eventIcon(ev('action', 'approve', { type: 'generate_pdf', status: 'pending' })), 'x')
```
```ts
test('a PDF says when it was requested and when it was made', () => {
  assert.equal(eventText(ev('action', 'approve', { type: 'generate_pdf', status: 'queued', job: 'j' }), LEAVE, null), 'PDF requested')
  assert.equal(eventText(ev('action', null, { type: 'generate_pdf', status: 'done', job: 'j' }), LEAVE, null), 'PDF made')
  assert.deepEqual([
    eventIcon(ev('action', 'approve', { type: 'generate_pdf', status: 'queued' })),
    eventIcon(ev('action', null, { type: 'generate_pdf', status: 'done' })),
  ], ['clock', 'check'])
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test`
Expected: FAIL on the four new or changed tests.

- [ ] **Step 3: Routes, errors, timeline**

`src/rbac/route.ts` — the full new file:
```ts
export type Route =
  | { page: 'members' } | { page: 'roles' } | { page: 'forms' } | { page: 'workflows' } | { page: 'inbox' } | { page: 'records' }
  | { page: 'templates' } | { page: 'messages' } | { page: 'settings' } | { page: 'dashboard' } | { page: 'reports' }
  | { page: 'form-edit' | 'form-fill' | 'form-submissions'; id: string }
  | { page: 'workflow-edit' | 'workflow-access' | 'workflow-report' | 'start' | 'task' | 'record' | 'template' | 'report'; id: string }
export type Perms = { roles: boolean; forms: boolean; workflows: boolean; comms: boolean; reports: boolean; reportsManage: boolean }

const ID = '([0-9a-f-]{36})'
const FORM_PAGE = new RegExp(`^#/forms/${ID}/(edit|fill|submissions)$`)
const WORKFLOW_PAGE = new RegExp(`^#/workflows/${ID}/(edit|access|report)$`)
const TEMPLATE_PAGE = new RegExp(`^#/templates/${ID}$`)
const REPORT_PAGE = new RegExp(`^#/reports/${ID}$`)
const ITEM_PAGE = new RegExp(`^#/(start|tasks|records)/${ID}$`)
type ListPage = 'roles' | 'forms' | 'workflows' | 'inbox' | 'records' | 'templates' | 'messages' | 'settings' | 'dashboard' | 'reports'
const LISTS: Record<string, ListPage> = {
  '#/roles': 'roles', '#/forms': 'forms', '#/workflows': 'workflows', '#/inbox': 'inbox', '#/records': 'records',
  '#/templates': 'templates', '#/messages': 'messages', '#/settings': 'settings', '#/dashboard': 'dashboard', '#/reports': 'reports',
}
const ITEM = { start: 'start', tasks: 'task', records: 'record' } as const

export function parseRoute(hash: string): Route {
  if (Object.hasOwn(LISTS, hash)) return { page: LISTS[hash] }
  const f = FORM_PAGE.exec(hash)
  if (f) return { page: `form-${f[2]}` as 'form-edit' | 'form-fill' | 'form-submissions', id: f[1] }
  const w = WORKFLOW_PAGE.exec(hash)
  if (w) return { page: `workflow-${w[2]}` as 'workflow-edit' | 'workflow-access' | 'workflow-report', id: w[1] }
  const i = ITEM_PAGE.exec(hash)
  if (i) return { page: ITEM[i[1] as keyof typeof ITEM], id: i[2] }
  const t = TEMPLATE_PAGE.exec(hash)
  if (t) return { page: 'template', id: t[1] }
  const r = REPORT_PAGE.exec(hash)
  if (r) return { page: 'report', id: r[1] }
  return { page: 'members' }
}

/** Pages the signed-in user may not see fall back to one they can. UI hint only; RLS and the Edge Functions decide. */
export function guardHash(hash: string, perms: Perms): string {
  const r = parseRoute(hash)
  if (r.page === 'roles' && !perms.roles) return '#/members'
  if (r.page === 'form-edit' && !perms.forms) return `#/forms/${r.id}/fill`
  if (r.page === 'workflow-report') return perms.reportsManage ? hash : '#/inbox'
  if ((r.page === 'workflows' || r.page === 'workflow-edit' || r.page === 'workflow-access') && !perms.workflows) return '#/inbox'
  if ((r.page === 'templates' || r.page === 'template' || r.page === 'messages') && !perms.comms) return '#/inbox'
  if ((r.page === 'dashboard' || r.page === 'reports' || r.page === 'report') && !perms.reports) return '#/inbox'
  return hash
}
```

`src/ui/errors.ts` — add to `SENTENCES`, before the `Not allowed` entry:
```ts
  [/no report template yet/, 'This workflow has no report template yet. Ask a reports manager to set one up.'],
  [/dashboard changed/, 'The dashboard changed. Reload to see the latest layout.'],
```

`src/records/timeline.ts` — in `eventText`, replace the last line of `case 'action'`:
```ts
      if (d.type === 'generate_pdf') return d.status === 'done' ? 'PDF made' : d.status === 'queued' ? 'PDF requested' : 'PDF not made: recorded before reports were available.'
      return 'The workflow recorded a step'
```
and in `eventIcon`, replace `if (e.detail?.type === 'generate_pdf') return 'clock'` with:
```ts
      if (e.detail?.type === 'generate_pdf') return e.detail?.status === 'done' ? 'check' : e.detail?.status === 'queued' ? 'clock' : 'x' // pending history will never be made
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm test`
Expected: `pass 168` (164 + 2 route + 1 errors + 1 timeline; the two changed `generate_pdf` assertions sit in existing tests).

- [ ] **Step 5: Shared re-export and the data layer**

`src/reports/logic.ts`:
```ts
// The same modules run inside run-report and render-pdfs; the server's result is the one that counts.
export * from '../../supabase/functions/_shared/reports/definition.ts'
export * from '../../supabase/functions/_shared/reports/catalogue.ts'
export * from '../../supabase/functions/_shared/reports/run.ts'
export { csvFilename } from '../../supabase/functions/_shared/reports/csv.ts'
```

`src/reports/api.ts`:
```ts
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../data/supabase'
import type { Rule } from '../forms/logic'
import { csvFilename, type Aggregate, type Column, type ReportTemplate, type RunResult } from './logic'

export type TemplateRow = ReportTemplate & { id: string; workflow_id: string; updated_at: string }
export const useReportTemplate = (workflowId: string) => useQuery({
  queryKey: ['report-template', workflowId],
  queryFn: async () => {
    const { data, error } = await supabase.from('report_templates').select('id, workflow_id, header, fields, signoff, updated_at')
      .eq('workflow_id', workflowId).maybeSingle()
    if (error) throw error
    return data as unknown as TemplateRow | null
  },
})
export const createReportTemplate = (orgId: string, workflowId: string, t: ReportTemplate) =>
  supabase.from('report_templates').insert({ org_id: orgId, workflow_id: workflowId, ...t }).select('id, updated_at').single()
/** Conditional on updated_at: zero rows back means someone else saved first. */
export const updateReportTemplate = (id: string, t: ReportTemplate, updatedAt: string) =>
  supabase.from('report_templates').update(t).eq('id', id).eq('updated_at', updatedAt).select('updated_at')

export type PdfRow = { id: string; status: 'queued' | 'done' | 'failed'; path: string | null; error: string | null; created_at: string; finished_at: string | null }
export const useRecordPdf = (recordId: string) => useQuery({
  queryKey: ['record-pdfs', recordId],
  queryFn: async () => {
    const { data, error } = await supabase.from('record_pdfs').select('id, status, path, error, created_at, finished_at')
      .eq('record_id', recordId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    return data as PdfRow | null
  },
  refetchInterval: (q) => (q.state.data?.status === 'queued' ? 2000 : false), // a queued PDF is usually ready within seconds
})
/** A 5-minute signed link, refreshed before it runs out, so "Open PDF" is a real link and no popup blocker interferes. */
export const usePdfUrl = (path: string | null) => useQuery({
  queryKey: ['pdf-url', path],
  enabled: !!path,
  staleTime: 240_000,
  refetchInterval: 240_000,
  queryFn: async () => {
    const { data, error } = await supabase.storage.from('record-pdfs').createSignedUrl(path!, 300)
    if (error) throw error
    return data.signedUrl
  },
})
export const requestPdf = (recordId: string) => supabase.rpc('request_record_pdf', { p_record: recordId })

export type SavedReport = {
  id: string; workflow_id: string; name: string; columns: Column[]; filters: Rule[]
  group_by: Column | null; aggregate: Aggregate | null; updated_at: string
}
export type ReportListRow = { id: string; name: string; group_by: Column | null; updated_at: string; workflow: { name: string } | null }
export const useReports = (orgId: string | null) => useQuery({
  queryKey: ['reports', orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data, error } = await supabase.from('saved_reports').select('id, name, group_by, updated_at, workflow:workflows(name)')
      .eq('org_id', orgId!).order('name')
    if (error) throw error
    return data as unknown as ReportListRow[]
  },
})
export const useReport = (id: string) => useQuery({
  queryKey: ['report', id],
  queryFn: async () => {
    const { data, error } = await supabase.from('saved_reports').select('id, workflow_id, name, columns, filters, group_by, aggregate, updated_at')
      .eq('id', id).maybeSingle()
    if (error) throw error
    return data as unknown as SavedReport | null
  },
})
export const createReport = (orgId: string, workflowId: string, name: string) => supabase.from('saved_reports')
  .insert({ org_id: orgId, workflow_id: workflowId, name, columns: [{ meta: 'title' }, { meta: 'status' }, { meta: 'created_at' }] })
  .select('id').single()
export type ReportFields = Pick<SavedReport, 'name' | 'columns' | 'filters' | 'group_by' | 'aggregate'>
export const updateReport = (id: string, f: ReportFields, updatedAt: string) =>
  supabase.from('saved_reports').update(f).eq('id', id).eq('updated_at', updatedAt).select('updated_at')
export const deleteReport = (id: string) => supabase.from('saved_reports').delete().eq('id', id).select('id')

export type RunBody = { reportId: string } | { workflowId: string; definition: Pick<SavedReport, 'columns' | 'filters' | 'group_by' | 'aggregate'> }
export type RunResponse = {
  name: string; workflowName: string; columns: string[]
  groupLabel: string | null; aggregateLabel: string | null; aggregateFn: 'count' | 'sum' | null; result: RunResult
}
/** run-report writes its own sentences (403, 409, 413…); anything else reads as the fallback. */
export class ReportError extends Error {
  status: number | null // null: the network or something unexpected; a number: run-report's own refusal
  constructor(message: string, status: number | null) { super(message); this.status = status }
}
const RUN_FAILED = 'We could not run this report. Try again.'
async function reportError(error: unknown): Promise<ReportError> {
  if (error instanceof FunctionsHttpError) {
    const b = await error.context.json().catch(() => null)
    if (typeof b?.error === 'string') return new ReportError(b.error, error.context.status)
  }
  return new ReportError(RUN_FAILED, null)
}
export const useRunReport = (orgId: string | null, userId: string, body: RunBody | null, page: number, pageSize: number) => useQuery({
  queryKey: ['report-run', userId, orgId, body, page, pageSize],
  enabled: !!orgId && !!body,
  placeholderData: keepPreviousData, // paging keeps the old page on screen, marked busy, instead of flashing a skeleton
  retry: (n, e) => !(e instanceof ReportError && e.status !== null) && n < 2,
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke<RunResponse>('run-report', { body: { orgId, ...body, page, pageSize } })
    if (error) throw await reportError(error)
    return data as RunResponse
  },
})
/** Every row (never a page). Response.text() drops the BOM, so it is put back for Excel. */
export async function downloadCsv(orgId: string, body: RunBody, name: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke<string>('run-report', { body: { orgId, ...body, format: 'csv' } })
  if (error) return (await reportError(error)).message
  const href = URL.createObjectURL(new Blob(['﻿', String(data).replace(/^﻿/, '')], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href, download: csvFilename(name, new Date().toISOString().slice(0, 10)) })
  a.click()
  setTimeout(() => URL.revokeObjectURL(href), 0)
  return null
}

export type WidgetKind = 'number' | 'table' | 'bar' | 'line'
export type WidgetRow = { id: string; report_id: string; kind: WidgetKind; title: string; span: 1 | 2 | 4; position: number }
export const useWidgets = (orgId: string | null) => useQuery({
  queryKey: ['widgets', orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data, error } = await supabase.from('dashboard_widgets').select('id, report_id, kind, title, span, position')
      .eq('org_id', orgId!).order('position').order('created_at')
    if (error) throw error
    return data as WidgetRow[]
  },
})
export const addWidget = (row: Omit<WidgetRow, 'id'> & { org_id: string }) => supabase.from('dashboard_widgets').insert(row).select('id').single()
export const removeWidget = (id: string) => supabase.from('dashboard_widgets').delete().eq('id', id).select('id')
export const saveLayout = (orgId: string, layout: { id: string; span: number }[]) =>
  supabase.rpc('save_dashboard_layout', { p_org: orgId, p_layout: layout })
```

`src/ui/useLeaveGuard.ts`:
```ts
import { useEffect, useState } from 'react'
import { setNavGuard, type Next } from './navGuard'

/** Unsaved edits ask before a hash change, sign-out or org switch (QA-P2-4); the page renders the confirm dialog. */
export function useLeaveGuard(dirty: boolean, selfHash: string) {
  const [leaveTo, setLeaveTo] = useState<Next | null>(null)
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    addEventListener('beforeunload', warn)
    setNavGuard((next) => { if (next === selfHash) return false; setLeaveTo(() => next); return true })
    return () => { removeEventListener('beforeunload', warn); setNavGuard(null) }
  }, [dirty, selfHash])
  const leave = () => {
    const to = leaveTo
    setNavGuard(null)
    setLeaveTo(null)
    if (typeof to === 'function') to()
    else if (to) location.hash = to
  }
  return { leaveTo, stay: () => setLeaveTo(null), leave }
}
```

- [ ] **Step 6: Record page PDF panel** — `src/reports/PdfPanel.tsx`

```tsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { friendlyError } from '../ui/errors'
import { XIcon } from '../ui/icons'
import { When } from '../ui/Time'
import { useAction } from '../ui/useAction'
import { useNotice } from '../ui/useNotice'
import { requestPdf, usePdfUrl, useRecordPdf, useReportTemplate } from './api'

/** Latest PDF of a record and the button that makes one. Hidden when there is nothing to show and nothing to do. */
export function PdfPanel({ recordId, workflowId }: { recordId: string; workflowId: string }) {
  const { can } = useOrg()
  const mayRequest = can('reports.view')
  const template = useReportTemplate(workflowId)
  const pdf = useRecordPdf(recordId)
  const latest = pdf.data ?? null
  const url = usePdfUrl(latest?.status === 'done' ? latest.path : null)
  const qc = useQueryClient()
  const act = useAction()
  const [notice, setNotice] = useNotice()
  const [error, setError] = useState<string | null>(null)

  if (template.isPending || pdf.isPending) return null // the record page is already painted; the panel appears when known
  if (pdf.isError || template.isError) {
    return (
      <section className="rnr-card gap-2" aria-label="PDF">
        <p role="alert">We could not load the PDF for this record.</p>
        <div><button type="button" className="rnr-btn rnr-btn-secondary" onClick={() => { void pdf.refetch(); void template.refetch() }}>Try again</button></div>
      </section>
    )
  }
  if (!template.data && !latest) {
    if (!can('reports.manage')) return null
    return (
      <section className="rnr-card gap-2" aria-labelledby="pdf-h">
        <h2 id="pdf-h" className="dialog-title">PDF</h2>
        <p className="rnr-muted">This workflow has no report template yet, so its records cannot be made into PDFs.</p>
        <div><a className="rnr-btn rnr-btn-secondary" href={`#/workflows/${workflowId}/report`}>Set up a report template</a></div>
      </section>
    )
  }

  const generate = () => act.run(async () => {
    setError(null)
    const { error: e } = await requestPdf(recordId)
    if (e) { setError(friendlyError(e)); return false }
    setNotice('PDF requested. It will be ready in a few seconds.')
    await qc.invalidateQueries({ queryKey: ['record-pdfs', recordId] })
  })
  const queued = latest?.status === 'queued'
  return (
    <section className="rnr-card gap-3" aria-labelledby="pdf-h">
      <h2 id="pdf-h" className="dialog-title">PDF</h2>
      {!latest && <p className="rnr-muted">No PDF has been made for this record yet.</p>}
      {queued && <p className="rnr-status" aria-live="polite"><span className="rnr-spin" aria-hidden="true" />Making the PDF…</p>}
      {latest?.status === 'done' && (
        <p className="rnr-muted">Made <When iso={latest.finished_at ?? latest.created_at} />.</p>
      )}
      {latest?.status === 'failed' && <p className="rnr-status" data-wrap><XIcon size={14} />PDF not made: {latest.error ?? 'The PDF could not be made.'}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {latest?.status === 'done' && url.data && <a className="rnr-btn rnr-btn-secondary" href={url.data} target="_blank" rel="noopener noreferrer">Open PDF</a>}
        {mayRequest && template.data && !queued && (
          <button type="button" className="rnr-btn rnr-btn-secondary" aria-busy={act.busy} onClick={() => void generate()}>
            {act.busy && <span className="rnr-spin" aria-hidden="true" />}
            {act.busy ? 'Requesting…' : latest?.status === 'failed' ? 'Try again' : latest ? 'Make a new PDF' : 'Generate PDF'}
          </button>
        )}
      </div>
      {url.isError && <p className="rnr-error" role="alert">We could not open the PDF. Reload the page and try again.</p>}
      {error && <p className="rnr-error" role="alert">{error}</p>}
      <p className="rnr-caption" role="status">{notice}</p>
    </section>
  )
}
```

In `src/records/RecordPage.tsx`, import `PdfPanel` and render `<PdfPanel recordId={rec.id} workflowId={rec.workflow_id} />` between the title block and the map section (add `workflow_id` to `RECORD_COLS` and to `RecordRow` in `src/workflows/api.ts`).

- [ ] **Step 7: Report template editor** — `src/reports/ReportTemplatePage.tsx`

```tsx
import { useId, useMemo, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { useForms } from '../forms/api'
import { useWorkflow, type LoadedWorkflow } from '../workflows/api'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { friendlyError } from '../ui/errors'
import { CheckIcon, DownIcon, PencilIcon, UpIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { useAction } from '../ui/useAction'
import { useLeaveGuard } from '../ui/useLeaveGuard'
import { useNotice } from '../ui/useNotice'
import { stepFields, type ReportTemplate } from './logic'
import { createReportTemplate, updateReportTemplate, useReportTemplate, type TemplateRow } from './api'
import type { Field } from '../forms/logic'

export function ReportTemplatePage({ id }: { id: string }) {
  const { orgId } = useOrg()
  const wf = useWorkflow(id)
  const forms = useForms(orgId)
  const tpl = useReportTemplate(id)
  const [generation, setGeneration] = useState(0) // bumped by "Reload template" to start again from the server copy
  if (wf.isPending || forms.isPending || tpl.isPending) return <Skeleton rows={[{ w: '40%', h: 32 }, { w: '100%', h: 320 }]} />
  if (wf.isError || forms.isError || tpl.isError) {
    return (
      <div className="rnr-card gap-3 max-w-xl">
        <p role="alert">We could not load this report template. Check your connection and try again.</p>
        <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => { void wf.refetch(); void forms.refetch(); void tpl.refetch() }}>Try again</button></div>
      </div>
    )
  }
  if (!wf.data) return <div className="rnr-card gap-3 max-w-xl"><h1 className="page-title">This workflow does not exist</h1><p className="rnr-muted">It may have been deleted.</p></div>
  const schemas = new Map(forms.data.map((f) => [f.id, f.schema as Field[]]))
  return <TemplateForm key={generation} workflow={wf.data} schemas={schemas} saved={tpl.data}
    onReload={async () => { await tpl.refetch(); setGeneration((g) => g + 1) }} />
}

const EMPTY: ReportTemplate = { header: '', fields: [], signoff: [] }

function TemplateForm({ workflow, schemas, saved, onReload }: { workflow: LoadedWorkflow; schemas: Map<string, Field[]>; saved: TemplateRow | null; onReload(): Promise<void> }) {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  const uid = useId()
  const steps = useMemo(() => stepFields(workflow.graph, schemas), [workflow.graph, schemas])
  const first = saved ? { header: saved.header, fields: saved.fields, signoff: saved.signoff } : EMPTY
  const [t, setT] = useState<ReportTemplate>(first)
  const [base, setBase] = useState<ReportTemplate>(first)
  const [row, setRow] = useState<{ id: string; updatedAt: string } | null>(saved ? { id: saved.id, updatedAt: saved.updated_at } : null)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [notice, setNotice] = useNotice()
  const save = useAction()
  const reloading = useAction()
  const dirty = JSON.stringify(t) !== JSON.stringify(base)
  const guard = useLeaveGuard(dirty, `#/workflows/${workflow.id}/report`)
  const has = (nodeId: string, key: string) => t.fields.some((f) => f.nodeId === nodeId && f.key === key)
  const toggle = (nodeId: string, key: string, on: boolean) => setT((x) => ({
    ...x, fields: on ? [...x.fields, { nodeId, key }] : x.fields.filter((f) => !(f.nodeId === nodeId && f.key === key)),
  }))
  const move = (i: number, by: -1 | 1) => setT((x) => {
    const j = i + by
    if (j < 0 || j >= x.fields.length) return x
    const fields = [...x.fields]
    ;[fields[i], fields[j]] = [fields[j], fields[i]]
    return { ...x, fields }
  })
  const labelOf = (ref: { nodeId: string; key: string }) => {
    const s = steps.find((x) => x.nodeId === ref.nodeId)
    return `${s?.step ?? 'A deleted step'}: ${s?.fields.find((f) => f.key === ref.key)?.label ?? ref.key}`
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void save.run(async () => {
      setError(null)
      if (t.header.length > 2000) { setError('Keep the header under 2,000 characters.'); document.getElementById(`${uid}-header`)?.focus(); return false }
      if (!row) {
        const { data, error: e2 } = await createReportTemplate(orgId!, workflow.id, t)
        if (e2) { setError(friendlyError(e2, { duplicate: 'This workflow already has a report template. Reload to edit it.' })); return false }
        setRow({ id: data.id, updatedAt: data.updated_at })
      } else {
        const { data, error: e2 } = await updateReportTemplate(row.id, t, row.updatedAt)
        if (e2) { setError(friendlyError(e2)); return false }
        if (!data.length) { setConflict(true); return false }
        setRow({ id: row.id, updatedAt: data[0].updated_at })
      }
      setBase(t)
      setNotice('Report template saved.')
      void qc.invalidateQueries({ queryKey: ['report-template', workflow.id] })
    }, true)
  }

  return (
    <section className="flex flex-col gap-4 max-w-3xl" aria-labelledby={`${uid}-h`}>
      <div className="flex flex-col gap-1">
        <a className="rnr-btn rnr-btn-ghost self-start" href="#/workflows">Back to workflows</a>
        <h1 id={`${uid}-h`} className="page-title" tabIndex={-1}>Report template: {workflow.name}</h1>
        <p className="rnr-muted">Every PDF of this workflow's records uses this template. Hidden questions are always left out.</p>
      </div>
      {steps.length === 0 ? (
        <div className="rnr-card"><p className="rnr-muted">This workflow has no steps with a form yet. Add a Start form in the workflow editor first.</p></div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <div className="rnr-card gap-3">
            <div className="rnr-field">
              <label className="rnr-label" htmlFor={`${uid}-header`}>Header</label>
              <textarea id={`${uid}-header`} className="rnr-input" rows={3} value={t.header} maxLength={2000}
                onChange={(e) => setT({ ...t, header: e.target.value })} aria-describedby={`${uid}-header-hint`} />
              <p id={`${uid}-header-hint`} className="rnr-caption">Printed under the record title, for example your school's name and department.</p>
            </div>
          </div>
          <div className="rnr-card gap-3">
            <h2 className="dialog-title">Answers to include</h2>
            {steps.map((s) => (
              <fieldset key={s.nodeId} className="rnr-field">
                <legend className="rnr-fieldset-label">{s.step}</legend>
                {s.fields.map((f) => (
                  <label key={f.key} className="rnr-check">
                    <input type="checkbox" checked={has(s.nodeId, f.key)} onChange={(e) => toggle(s.nodeId, f.key, e.target.checked)} />{f.label}
                  </label>
                ))}
              </fieldset>
            ))}
            {t.fields.length > 0 && (
              <>
                <h3 className="label">Order in the PDF</h3>
                <ol className="flex flex-col gap-1">
                  {t.fields.map((ref, i) => (
                    <li key={`${ref.nodeId}:${ref.key}`} className="flex items-center gap-2">
                      <span className="flex-1">{labelOf(ref)}</span>
                      <button type="button" className="rnr-icon-btn" aria-label={`Move ${labelOf(ref)} up`} aria-disabled={i === 0} onClick={() => move(i, -1)}><UpIcon /></button>
                      <button type="button" className="rnr-icon-btn" aria-label={`Move ${labelOf(ref)} down`} aria-disabled={i === t.fields.length - 1} onClick={() => move(i, 1)}><DownIcon /></button>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
          <fieldset className="rnr-card gap-2">
            <legend className="dialog-title">Sign-off</legend>
            <p className="rnr-caption">Each chosen step prints who completed it, the outcome, the time (UTC) and their signature if the form has one.</p>
            {steps.map((s) => (
              <label key={s.nodeId} className="rnr-check">
                <input type="checkbox" checked={t.signoff.includes(s.nodeId)}
                  onChange={(e) => setT({ ...t, signoff: e.target.checked ? [...t.signoff, s.nodeId] : t.signoff.filter((x) => x !== s.nodeId) })} />{s.step}
              </label>
            ))}
          </fieldset>
          {error && <p className="rnr-error" role="alert">{error}</p>}
          {conflict && (
            <div className="flex flex-col items-start gap-2" role="alert">
              <p className="rnr-error">This template was changed by someone else. Reload to see their changes.</p>
              <button type="button" className="rnr-btn rnr-btn-secondary" aria-busy={reloading.busy} onClick={() => void reloading.run(onReload)}>
                {reloading.busy && <span className="rnr-spin" aria-hidden="true" />}{reloading.busy ? 'Reloading…' : 'Reload template'}
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="rnr-btn rnr-btn-primary" aria-busy={save.busy}>
              {save.busy && <span className="rnr-spin" aria-hidden="true" />}
              {save.saved && !save.busy && <span className="rnr-pop" aria-hidden="true"><CheckIcon /></span>}
              {save.busy ? 'Saving…' : save.saved ? 'Saved' : 'Save template'}
            </button>
            {dirty && <span className="rnr-status"><PencilIcon size={14} />Unsaved changes</span>}
          </div>
          <p className="rnr-caption" role="status">{notice}</p>
        </form>
      )}
      <ConfirmDialog open={!!guard.leaveTo} title="Leave without saving?" body="Your changes to this report template will be lost."
        confirmLabel="Leave" busyLabel="Leaving…" busy={false} error={null} onClose={guard.stay} onConfirm={guard.leave} />
    </section>
  )
}
```

- [ ] **Step 8: Wire the app**

`src/workflows/canvas/SidePanel.tsx`: replace `NOT_ACTIVE` with
```ts
const HINTS = { generate_pdf: "Makes a PDF from this workflow's report template. Reports managers set it up from the Workflows list." } as const
```
use `HINTS` where `NOT_ACTIVE` was read, and change the option to `<option value="generate_pdf">Generate PDF</option>`.

`src/workflows/WorkflowsPage.tsx`: beside the row's Access link, for `can('reports.manage')`:
```tsx
<a className="rnr-btn rnr-btn-ghost" href={`#/workflows/${w.id}/report`} aria-label={`Report template for ${w.name}`}>Report template</a>
```
(`WorkflowsPage` is reachable by `workflows.manage`; a reports manager without it reaches the editor from the record page's "Set up a report template" link and from the report builder's workflow name.)

`src/App.tsx`:
- import `DashboardPage`, `ReportsPage`, `ReportPage` (Tasks 9–10; until they exist, route those pages to `null`) and `ReportTemplatePage`;
- in `Page`: `case 'workflow-report': return <ReportTemplatePage id={route.id} />`, `case 'dashboard': return <DashboardPage />`, `case 'reports': return <ReportsPage />`, `case 'report': return <ReportPage id={route.id} />`;
- `guardHash(rawHash, { …, reports: can('reports.view') || can('reports.manage'), reportsManage: can('reports.manage') })`;
- nav, after Records: `{(can('reports.view') || can('reports.manage')) && link('#/dashboard', 'Dashboard', route.page === 'dashboard')}` and `{(can('reports.view') || can('reports.manage')) && link('#/reports', 'Reports', route.page === 'reports' || route.page === 'report')}`.

Add the designer's §9 classes to `src/index.css`.

- [ ] **Step 9: Check and commit**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: `pass 168`, oxlint clean, build passes with `check-dist: ok`.

Browser pane (fresh tab, `alpha.localhost:5199/app/`, `supabase functions serve` running): as `admin@alpha.test` open a done Leave approval record → PDF panel → Generate PDF → "Making the PDF…" → Open PDF opens the file; as `member@alpha.test` the same record shows Open PDF; as `viewer@alpha.test` a record they cannot see is not reachable. Report template page: untick an answer, Save, reload: the change persisted; edit, click Records: "Leave without saving?" opens, real Esc keeps the edit.

```bash
git add src/reports/logic.ts src/reports/api.ts src/reports/PdfPanel.tsx src/reports/ReportTemplatePage.tsx src/ui/useLeaveGuard.ts src/rbac/route.ts src/rbac/route.test.ts src/ui/errors.ts src/ui/errors.test.ts src/records/timeline.ts src/records/timeline.test.ts src/records/RecordPage.tsx src/workflows/canvas/SidePanel.tsx src/workflows/WorkflowsPage.tsx src/App.tsx src/index.css src/workflows/api.ts
git commit -m "feat: add record pdf panel and report template editor"
```

---

### Task 9: Frontend — Reports list, builder, results, CSV

**Owner:** Frontend engineer · **Depends on:** 6, 8

**Files:**
- Create: `src/reports/text.ts`, `src/reports/text.test.ts`, `src/reports/ReportsPage.tsx`, `src/reports/ReportPage.tsx`, `src/reports/ResultTable.tsx`
- Modify: `src/App.tsx` (route `reports` / `report` to the new pages)

**Interfaces:**
- Consumes: `useReports`, `useReport`, `createReport`, `updateReport`, `deleteReport`, `useRunReport`, `downloadCsv`, `useWidgets`, `ReportError` (Task 8); `readReportDef`, `stepFields`, `dataColumns`, `filterScope`, `columnId`, `META_KEYS`, `META_LABELS`, `RunResult`, `Cell`, `Group` (Task 2); `RuleEditor` (`src/forms/builder/RuleEditor.tsx`); `useWorkflows`, `useWorkflow`, `useForms`; `useLeaveGuard`.
- Produces: `totalsText(r: RunResult): string`, `cellText(v: Cell): string`, `keyText(k: Cell): string`, `pageText(page: number, pageSize: number, total: number): string`, `shownText(shown: number, total: number, noun: 'record' | 'group'): string`; `ResultTable({ data, busy })`; pages `ReportsPage`, `ReportPage({ id })`.

- [ ] **Step 1: Write the failing tests** — `src/reports/text.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cellText, keyText, pageText, shownText, totalsText } from './text.ts'
import type { GroupsResult, RowsResult } from './logic.ts'

const rows = (total: number): RowsResult => ({ kind: 'rows', rows: [], total, totalRecords: total, page: 1, pageSize: 50 })
const groups = (total: number, totalRecords: number, skipped: number): GroupsResult =>
  ({ kind: 'groups', groups: [], total, totalRecords, grandTotal: null, skipped, page: 1, pageSize: 50 })

test('totals say how many records and groups, and what was left out of a sum', () => {
  assert.equal(totalsText(rows(1)), '1 record')
  assert.equal(totalsText(rows(1240)), '1,240 records')
  assert.equal(totalsText(groups(3, 240, 0)), '3 groups from 240 records')
  assert.equal(totalsText(groups(1, 1, 1)), '1 group from 1 record. 1 value was not a number and was left out.')
  assert.equal(totalsText(groups(3, 240, 2)), '3 groups from 240 records. 2 values were not numbers and were left out.')
})

test('cells and group keys read as people expect', () => {
  assert.deepEqual([cellText(null), cellText(1234.5), cellText(-3), cellText('Annual')], ['', '1,234.5', '-3', 'Annual'])
  assert.deepEqual([keyText(null), keyText(2), keyText('Annual')], ['No answer', '2', 'Annual'])
})

test('paging and partial views always state the full count', () => {
  assert.deepEqual([pageText(2, 50, 240), pageText(1, 50, 0), pageText(6, 50, 240)], ['Page 2 of 5', 'Page 1 of 1', 'Page 6 of 5'])
  assert.deepEqual([shownText(10, 240, 'record'), shownText(24, 31, 'group'), shownText(3, 3, 'record')],
    ['Showing 10 of 240 records', 'Showing the first 24 of 31 groups', ''])
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test`
Expected: FAIL with `Cannot find module '.../src/reports/text.ts'`.

- [ ] **Step 3: Write `src/reports/text.ts`**

```ts
import { whenText } from '../ui/dates'
import type { Cell, RunResult } from './logic'

const NUM = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 10 })
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const count = (n: number, one: string, many: string) => `${NUM.format(n)} ${n === 1 ? one : many}`

export function totalsText(r: RunResult): string {
  if (r.kind === 'rows') return count(r.total, 'record', 'records')
  const base = `${count(r.total, 'group', 'groups')} from ${count(r.totalRecords, 'record', 'records')}`
  if (!r.skipped) return base
  return `${base}. ${r.skipped === 1 ? '1 value was not a number and was left out.' : `${NUM.format(r.skipped)} values were not numbers and were left out.`}`
}

/** Numbers en-GB with tabular figures (the table adds `.num`); record times in the reader's locale. */
export function cellText(v: Cell): string {
  if (v === null) return ''
  if (typeof v === 'number') return NUM.format(v)
  return ISO_TIME.test(v) ? whenText(v) : v
}

export const keyText = (k: Cell) => (k === null ? 'No answer' : typeof k === 'number' ? NUM.format(k) : k)

export const pageText = (page: number, pageSize: number, total: number) => `Page ${page} of ${Math.max(1, Math.ceil(total / pageSize))}`

/** Empty when nothing is hidden; otherwise the full count, never a silent cut. */
export function shownText(shown: number, total: number, noun: 'record' | 'group'): string {
  if (shown >= total) return ''
  return noun === 'group' ? `Showing the first ${NUM.format(shown)} of ${NUM.format(total)} groups` : `Showing ${NUM.format(shown)} of ${NUM.format(total)} records`
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm test`
Expected: `pass 171` (168 + 3).

- [ ] **Step 5: Write `src/reports/ResultTable.tsx`**

```tsx
import type { RunResponse } from './api'
import { cellText, keyText } from './text'

/** Rows or groups, exactly as run-report returned them. The caller states totals and paging. */
export function ResultTable({ data, busy }: { data: RunResponse; busy: boolean }) {
  const r = data.result
  const isSum = data.aggregateFn === 'sum'
  return (
    <div className="rnr-card rnr-table-card" aria-busy={busy}>
      <table className="rnr-table rnr-sticky-first">
        <caption className="sr-only">{data.name}, {data.workflowName}</caption>
        <thead>
          {r.kind === 'rows' ? (
            <tr>{data.columns.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr>
          ) : (
            <tr>
              <th scope="col">{data.groupLabel}</th>
              <th scope="col" className="num">{data.aggregateLabel}</th>
              {isSum && <th scope="col" className="num">Records</th>}
            </tr>
          )}
        </thead>
        <tbody>
          {r.kind === 'rows'
            ? r.rows.map((row) => (
              <tr key={row.id}>
                {row.cells.map((c, i) => (i === 0
                  ? <th key={i} scope="row"><a href={`#/records/${row.id}`}>{cellText(c) || 'Untitled'}</a></th>
                  : <td key={i} className={typeof c === 'number' ? 'num' : undefined}>{cellText(c)}</td>))}
              </tr>
            ))
            : r.groups.map((g, i) => (
              <tr key={i}>
                <th scope="row">{keyText(g.key)}</th>
                <td className="num">{isSum ? (g.sum === null ? 'No numbers' : cellText(g.sum)) : cellText(g.count)}</td>
                {isSum && <td className="num">{cellText(g.count)}</td>}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}
```

(The first column links to the record only in row reports; the record's own RLS applies when it opens.)

- [ ] **Step 6: Write `src/reports/ReportsPage.tsx`**

```tsx
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { useWorkflows } from '../workflows/api'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { friendlyError } from '../ui/errors'
import { PlusIcon, TrashIcon, XIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { When } from '../ui/Time'
import { useAction } from '../ui/useAction'
import { useFocusAfterRender } from '../ui/useFocusAfterRender'
import { useNotice } from '../ui/useNotice'
import { createReport, deleteReport, useReports, useWidgets, type ReportListRow } from './api'

export function ReportsPage() {
  const { orgId, can } = useOrg()
  const manage = can('reports.manage')
  const reports = useReports(orgId)
  const widgets = useWidgets(orgId)
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [doomed, setDoomed] = useState<ReportListRow | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const removal = useAction()
  const [notice, setNotice] = useNotice()
  const focusLater = useFocusAfterRender()
  const usedBy = (id: string) => widgets.data?.filter((w) => w.report_id === id).length ?? 0

  const confirmDelete = () => removal.run(async () => {
    if (!doomed) return
    const { data, error } = await deleteReport(doomed.id)
    if (error || !data.length) { setDeleteError(error ? friendlyError(error) : 'This report was already deleted, or you no longer manage reports. Reload to see the latest list.'); return }
    setDoomed(null)
    setNotice(`“${doomed.name}” deleted.`)
    await Promise.all([qc.invalidateQueries({ queryKey: ['reports', orgId] }), qc.invalidateQueries({ queryKey: ['widgets', orgId] })])
    focusLater('reports-h') // the row that held the Delete button is gone
  })

  return (
    <section className="flex flex-col gap-4" aria-labelledby="reports-h">
      <div className="flex flex-wrap items-center gap-3">
        <h1 id="reports-h" className="page-title" tabIndex={-1}>Reports</h1>
        {manage && <button type="button" className="rnr-btn rnr-btn-primary ml-auto" onClick={() => setCreating(true)}><PlusIcon />New report</button>}
      </div>
      <p className="rnr-caption" role="status">{notice}</p>
      {reports.isPending && <Skeleton rows={[{ w: '100%', h: 200 }]} />}
      {reports.isError && (
        <div className="rnr-card gap-3">
          <p role="alert">We could not load the reports. Check your connection and try again.</p>
          <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => void reports.refetch()}>Try again</button></div>
        </div>
      )}
      {reports.data?.length === 0 && (
        <div className="rnr-card gap-3">
          <h2 className="dialog-title">No reports yet</h2>
          <p className="rnr-muted">{manage ? 'Create a report to count, add up and export the records of a workflow.' : 'No reports yet. Ask a reports manager to create one.'}</p>
        </div>
      )}
      {!!reports.data?.length && (
        <div className="rnr-card rnr-table-card">
          <table className="rnr-table rnr-sticky-first">
            <caption className="sr-only">Saved reports</caption>
            <thead><tr><th scope="col">Report</th><th scope="col">Workflow</th><th scope="col">Kind</th><th scope="col" className="num">Last updated</th>{manage && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
            <tbody>
              {reports.data.map((r) => (
                <tr key={r.id}>
                  <th scope="row"><a href={`#/reports/${r.id}`}>{r.name}</a></th>
                  <td>{r.workflow?.name ?? 'A workflow you cannot see'}</td>
                  <td>{r.group_by ? 'Grouped' : 'Table'}</td>
                  <td className="num"><When iso={r.updated_at} /></td>
                  {manage && (
                    <td><button type="button" className="rnr-icon-btn" aria-label={`Delete ${r.name}`} onClick={() => { setDeleteError(null); setDoomed(r) }}><TrashIcon /></button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <NewReportDialog onClose={() => setCreating(false)} />}
      <ConfirmDialog open={!!doomed} title={`Delete “${doomed?.name ?? ''}”?`}
        body={doomed && usedBy(doomed.id) ? `${usedBy(doomed.id)} dashboard ${usedBy(doomed.id) === 1 ? 'widget shows' : 'widgets show'} this report and will be removed too.` : 'The report is deleted for everyone. Records are not changed.'}
        confirmLabel="Delete report" busyLabel="Deleting…" busy={removal.busy} error={deleteError}
        onClose={() => setDoomed(null)} onConfirm={() => void confirmDelete()} />
    </section>
  )
}

function NewReportDialog({ onClose }: { onClose(): void }) {
  const { orgId } = useOrg()
  const workflows = useWorkflows(orgId)
  const ref = useRef<HTMLDialogElement>(null)
  const uid = useId()
  const [name, setName] = useState('')
  const [workflowId, setWorkflowId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const act = useAction()
  useEffect(() => { ref.current?.showModal() }, [])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void act.run(async () => {
      if (!name.trim()) { setError('Enter a name for the report.'); document.getElementById(`${uid}-n`)?.focus(); return }
      if (!workflowId) { setError('Choose the workflow to report on.'); document.getElementById(`${uid}-w`)?.focus(); return }
      const { data, error: e2 } = await createReport(orgId!, workflowId, name.trim())
      if (e2) { setError(friendlyError(e2)); return }
      location.hash = `#/reports/${data.id}`
    })
  }
  return (
    <dialog ref={ref} className="rnr-dialog" aria-labelledby={`${uid}-t`} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }}>
      <div className="rnr-dialog-head">
        <h2 id={`${uid}-t`}>New report</h2>
        <button className="rnr-icon-btn" type="button" aria-label="Close dialog" onClick={onClose}><XIcon /></button>
      </div>
      <form className="rnr-dialog-body" onSubmit={submit} noValidate>
        <div className="rnr-field">
          <label className="rnr-label" htmlFor={`${uid}-n`}>Name</label>
          <input id={`${uid}-n`} className="rnr-input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="rnr-field">
          <label className="rnr-label" htmlFor={`${uid}-w`}>Workflow</label>
          <select id={`${uid}-w`} className="rnr-input" value={workflowId} onChange={(e) => setWorkflowId(e.target.value)}>
            <option value="">Choose a workflow</option>
            {workflows.data?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        {error && <p className="rnr-error" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="rnr-btn rnr-btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="rnr-btn rnr-btn-primary" type="submit" aria-busy={act.busy}>
            {act.busy && <span className="rnr-spin" aria-hidden="true" />}{act.busy ? 'Creating…' : 'Create report'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
```

- [ ] **Step 7: Write `src/reports/ReportPage.tsx`**

```tsx
import { useId, useMemo, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { useForms } from '../forms/api'
import { RuleEditor } from '../forms/builder/RuleEditor'
import type { Field, Rule } from '../forms/logic'
import { useWorkflow } from '../workflows/api'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { friendlyError } from '../ui/errors'
import { CheckIcon, DownIcon, DownloadIcon, PencilIcon, TrashIcon, UpIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { useAction } from '../ui/useAction'
import { useLeaveGuard } from '../ui/useLeaveGuard'
import { useNotice } from '../ui/useNotice'
import { META_KEYS, META_LABELS, columnId, columnLabel, dataColumns, filterScope, readColumn, readReportDef, stepFields, type Column, type DataColumn } from './logic'
import { ReportError, downloadCsv, updateReport, useReport, useRunReport, type ReportFields, type RunBody, type SavedReport } from './api'
import { ResultTable } from './ResultTable'
import { pageText, totalsText } from './text'

export function ReportPage({ id }: { id: string }) {
  const report = useReport(id)
  const [generation, setGeneration] = useState(0)
  if (report.isPending) return <Skeleton rows={[{ w: '40%', h: 32 }, { w: '100%', h: 320 }]} />
  if (report.isError) {
    return (
      <div className="rnr-card gap-3 max-w-xl">
        <p role="alert">We could not load this report. Check your connection and try again.</p>
        <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => void report.refetch()}>Try again</button></div>
      </div>
    )
  }
  if (!report.data) return <div className="rnr-card gap-3 max-w-xl"><h1 className="page-title">This report does not exist</h1><p className="rnr-muted">It may have been deleted.</p></div>
  return <ReportView key={generation} saved={report.data} onReload={async () => { await report.refetch(); setGeneration((g) => g + 1) }} />
}

const fieldsOf = (r: SavedReport): ReportFields => ({ name: r.name, columns: r.columns, filters: r.filters, group_by: r.group_by, aggregate: r.aggregate })

function ReportView({ saved, onReload }: { saved: SavedReport; onReload(): Promise<void> }) {
  const { orgId, userId, can } = useOrg()
  const manage = can('reports.manage')
  const qc = useQueryClient()
  const uid = useId()
  const wf = useWorkflow(saved.workflow_id)
  const forms = useForms(orgId)
  const [f, setF] = useState<ReportFields>(fieldsOf(saved))
  const [base, setBase] = useState<ReportFields>(fieldsOf(saved))
  const [version, setVersion] = useState(saved.updated_at)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [csvError, setCsvError] = useState<string | null>(null)
  const [notice, setNotice] = useNotice()
  const save = useAction()
  const csv = useAction()
  const reloading = useAction()
  const dirty = JSON.stringify(f) !== JSON.stringify(base)
  const guard = useLeaveGuard(dirty, `#/reports/${saved.id}`)

  const steps = useMemo(() => (wf.data && forms.data ? stepFields(wf.data.graph, new Map(forms.data.map((x) => [x.id, x.schema as Field[]]))) : []), [wf.data, forms.data])
  const cols = useMemo(() => dataColumns(steps), [steps])
  const scope = useMemo(() => filterScope(steps), [steps])
  const numbers = cols.filter((c) => c.type === 'number' || c.type === 'calculated')
  const check = readReportDef(f)
  // Unsaved edits preview straight away; a saved, unchanged report runs by id like everyone else's.
  const body: RunBody | null = !dirty ? { reportId: saved.id } : check.ok ? { workflowId: saved.workflow_id, definition: { columns: f.columns, filters: f.filters, group_by: f.group_by, aggregate: f.aggregate } } : null
  const run = useRunReport(orgId, userId, body, page, pageSize)
  const edit = (patch: Partial<ReportFields>) => { setF((x) => ({ ...x, ...patch })); setPage(1) }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void save.run(async () => {
      setError(null)
      if (!f.name.trim()) { setError('Enter a name for the report.'); document.getElementById(`${uid}-name`)?.focus(); return false }
      if (!check.ok) { setError(check.error); return false }
      const { data, error: e2 } = await updateReport(saved.id, { ...f, name: f.name.trim() }, version)
      if (e2) { setError(friendlyError(e2)); return false }
      if (!data.length) { setConflict(true); return false }
      setVersion(data[0].updated_at)
      setBase(f)
      setNotice('Report saved.')
      void qc.invalidateQueries({ queryKey: ['reports', orgId] })
    }, true)
  }
  const exportCsv = () => csv.run(async () => {
    setCsvError(null)
    if (!body) return
    const err = await downloadCsv(orgId!, body, f.name)
    if (err) setCsvError(err)
    else setNotice('CSV downloaded with every row.')
  })

  const r = run.data?.result
  const failed = run.error instanceof ReportError ? run.error.message : run.error ? 'We could not run this report. Try again.' : null
  return (
    <section className="flex flex-col gap-4" aria-labelledby={`${uid}-h`}>
      <div className="flex flex-col gap-1">
        <a className="rnr-btn rnr-btn-ghost self-start" href="#/reports">Back to reports</a>
        <h1 id={`${uid}-h`} className="page-title" tabIndex={-1}>{base.name}</h1>
        <p className="rnr-muted">{wf.data ? `Records of ${wf.data.name} that you can see.` : 'Records that you can see.'}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {manage ? (
          <form className="rnr-card gap-4 lg:self-start" onSubmit={submit} noValidate aria-label="Report settings">
            <div className="rnr-field">
              <label className="rnr-label" htmlFor={`${uid}-name`}>Name</label>
              <input id={`${uid}-name`} className="rnr-input" value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </div>
            <ColumnList columns={f.columns} cols={cols} onChange={(columns) => edit({ columns })} />
            <fieldset className="rnr-field">
              <legend className="rnr-fieldset-label">Filters</legend>
              {f.filters.length === 0 && <p className="rnr-caption">Every record is included.</p>}
              {f.filters.map((rule, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <RuleEditor rule={rule} scope={scope} self="" required legend={`Filter ${i + 1}`}
                    onChange={(next?: Rule) => next && edit({ filters: f.filters.map((x, j) => (j === i ? next : x)) })} />
                  <button type="button" className="rnr-btn rnr-btn-ghost self-start" onClick={() => edit({ filters: f.filters.filter((_, j) => j !== i) })}><TrashIcon />Remove filter {i + 1}</button>
                </div>
              ))}
              {scope.length > 0 && f.filters.length < 10 && (
                <button type="button" className="rnr-btn rnr-btn-secondary self-start" onClick={() => edit({ filters: [...f.filters, { field: scope[0].key, operator: 'is_not_empty' }] })}>Add filter</button>
              )}
            </fieldset>
            <div className="rnr-field">
              <label className="rnr-label" htmlFor={`${uid}-g`}>Group by</label>
              <select id={`${uid}-g`} className="rnr-input" value={f.group_by ? columnId(f.group_by) : ''}
                onChange={(e) => {
                  const g = e.target.value ? readColumn(e.target.value.startsWith('meta:') ? { meta: e.target.value.slice(5) } : { field: e.target.value.slice(6) }) : null
                  edit({ group_by: g, aggregate: g ? f.aggregate ?? { fn: 'count' } : null })
                }}>
                <option value="">No grouping</option>
                <ColumnOptions cols={cols} />
              </select>
            </div>
            {f.group_by && (
              <fieldset className="rnr-field">
                <legend className="rnr-fieldset-label">For each group</legend>
                <div className="rnr-seg self-start" role="radiogroup" aria-label="For each group">
                  <button type="button" role="radio" aria-checked={f.aggregate?.fn !== 'sum'} onClick={() => edit({ aggregate: { fn: 'count' } })}>Count records</button>
                  <button type="button" role="radio" aria-checked={f.aggregate?.fn === 'sum'}
                    onClick={() => numbers[0] && edit({ aggregate: { fn: 'sum', field: numbers[0].path } })}>Add up a number</button>
                </div>
                {numbers.length === 0 && <p className="rnr-caption">This workflow's forms have no number fields to add up.</p>}
                {f.aggregate?.fn === 'sum' && (
                  <select aria-label="Number to add up" className="rnr-input" value={f.aggregate.field} onChange={(e) => edit({ aggregate: { fn: 'sum', field: e.target.value } })}>
                    {numbers.map((c) => <option key={c.path} value={c.path}>{c.label}</option>)}
                  </select>
                )}
              </fieldset>
            )}
            {error && <p className="rnr-error" role="alert">{error}</p>}
            {conflict && (
              <div className="flex flex-col items-start gap-2" role="alert">
                <p className="rnr-error">This report was changed by someone else. Reload to see their changes.</p>
                <button type="button" className="rnr-btn rnr-btn-secondary" aria-busy={reloading.busy} onClick={() => void reloading.run(onReload)}>
                  {reloading.busy && <span className="rnr-spin" aria-hidden="true" />}{reloading.busy ? 'Reloading…' : 'Reload report'}
                </button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" className="rnr-btn rnr-btn-primary" aria-busy={save.busy}>
                {save.busy && <span className="rnr-spin" aria-hidden="true" />}
                {save.saved && !save.busy && <span className="rnr-pop" aria-hidden="true"><CheckIcon /></span>}
                {save.busy ? 'Saving…' : save.saved ? 'Saved' : 'Save report'}
              </button>
              {dirty && <span className="rnr-status"><PencilIcon size={14} />Unsaved changes. The results below already show them.</span>}
            </div>
          </form>
        ) : (
          <div className="rnr-card gap-2 lg:self-start">
            <h2 className="dialog-title">About this report</h2>
            <p className="rnr-muted">Columns: {f.columns.map((c) => columnLabel(c, cols)).join(', ')}</p>
            <p className="rnr-muted">{f.filters.length ? `${f.filters.length} ${f.filters.length === 1 ? 'filter' : 'filters'}` : 'No filters'}{f.group_by ? `. Grouped by ${columnLabel(f.group_by, cols)}` : ''}</p>
          </div>
        )}
        <div className="flex flex-col gap-3 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="label" role="status">{r ? totalsText(r) : ''}</p>
            <button type="button" className="rnr-btn rnr-btn-secondary ml-auto" aria-busy={csv.busy} onClick={() => void exportCsv()}>
              {csv.busy ? <span className="rnr-spin" aria-hidden="true" /> : <DownloadIcon />}{csv.busy ? 'Preparing CSV…' : 'Download CSV'}
            </button>
          </div>
          {csvError && <p className="rnr-error" role="alert">{csvError}</p>}
          <p className="rnr-caption" role="status">{notice}</p>
          {!check.ok && dirty && <div className="rnr-card"><p className="rnr-muted">Finish the settings to see results. {check.error}</p></div>}
          {run.isPending && body && <Skeleton rows={[{ w: '100%', h: 240 }]} />}
          {failed && (
            <div className="rnr-card gap-3">
              <p role="alert">{failed}</p>
              {(run.error as ReportError).status === null && <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => void run.refetch()}>Try again</button></div>}
            </div>
          )}
          {run.data && r && r.total === 0 && (
            <div className="rnr-card"><p className="rnr-muted">{r.totalRecords === 0 && f.filters.length === 0 ? 'No records yet. Records appear here once people start this workflow.' : 'No records match these filters. Remove a filter to see more.'}</p></div>
          )}
          {run.data && r && r.total > 0 && (
            <>
              <ResultTable data={run.data} busy={run.isPlaceholderData || run.isFetching} />
              <nav className="flex flex-wrap items-center gap-2" aria-label="Pages">
                <button type="button" className="rnr-btn rnr-btn-ghost" aria-disabled={page <= 1} onClick={() => page > 1 && setPage(page - 1)}>Previous</button>
                <span className="rnr-num" aria-live="polite">{pageText(page, pageSize, r.total)}</span>
                <button type="button" className="rnr-btn rnr-btn-ghost" aria-disabled={page * pageSize >= r.total} onClick={() => page * pageSize < r.total && setPage(page + 1)}>Next</button>
                <label className="rnr-check ml-auto">Per page
                  <select className="rnr-input" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}>
                    {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </nav>
            </>
          )}
        </div>
      </div>
      <ConfirmDialog open={!!guard.leaveTo} title="Leave without saving?" body={`Your changes to ${f.name.trim() || 'this report'} will be lost.`}
        confirmLabel="Leave" busyLabel="Leaving…" busy={false} error={null} onClose={guard.stay} onConfirm={guard.leave} />
    </section>
  )
}

function ColumnOptions({ cols, skip = [] }: { cols: DataColumn[]; skip?: string[] }) {
  return (
    <>
      <optgroup label="Record">
        {META_KEYS.filter((k) => !skip.includes(`meta:${k}`)).map((k) => <option key={k} value={`meta:${k}`}>{META_LABELS[k]}</option>)}
      </optgroup>
      <optgroup label="Answers">
        {cols.filter((c) => !skip.includes(`field:${c.path}`)).map((c) => <option key={c.path} value={`field:${c.path}`}>{c.label}</option>)}
      </optgroup>
    </>
  )
}

function ColumnList({ columns, cols, onChange }: { columns: Column[]; cols: DataColumn[]; onChange(next: Column[]): void }) {
  const uid = useId()
  const move = (i: number, by: -1 | 1) => {
    const j = i + by
    if (j < 0 || j >= columns.length) return
    const next = [...columns]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <fieldset className="rnr-field">
      <legend className="rnr-fieldset-label">Columns</legend>
      <ol className="flex flex-col gap-1">
        {columns.map((c, i) => {
          const label = columnLabel(c, cols)
          return (
            <li key={columnId(c)} className="flex items-center gap-1">
              <span className="flex-1 min-w-0 truncate">{label}</span>
              <button type="button" className="rnr-icon-btn" aria-label={`Move ${label} up`} aria-disabled={i === 0} onClick={() => move(i, -1)}><UpIcon /></button>
              <button type="button" className="rnr-icon-btn" aria-label={`Move ${label} down`} aria-disabled={i === columns.length - 1} onClick={() => move(i, 1)}><DownIcon /></button>
              <button type="button" className="rnr-icon-btn" aria-label={`Remove ${label}`} onClick={() => onChange(columns.filter((_, j) => j !== i))}><TrashIcon /></button>
            </li>
          )
        })}
      </ol>
      {columns.length < 20 && (
        <select id={`${uid}-add`} aria-label="Add a column" className="rnr-input" value=""
          onChange={(e) => {
            const v = e.target.value
            const c = readColumn(v.startsWith('meta:') ? { meta: v.slice(5) } : { field: v.slice(6) })
            if (c) onChange([...columns, c])
          }}>
          <option value="">Add a column…</option>
          <ColumnOptions cols={cols} skip={columns.map(columnId)} />
        </select>
      )}
    </fieldset>
  )
}
```

Add to `src/ui/icons.tsx`:
```tsx
export const DownloadIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
export const ChartIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
```

In `src/App.tsx`, route `reports` and `report` to `ReportsPage` and `ReportPage`.

- [ ] **Step 8: Check and commit**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: `pass 171`, oxlint clean, build passes with `check-dist: ok`.

Browser pane (fresh tab): as `admin@alpha.test` open Reports → "Leave days by type" → the grouped table and the totals line; change Group by to "No grouping": the results switch to rows at once with "Unsaved changes. The results below already show them."; Next / Previous / Per page keep the totals line; Download CSV saves `leave-days-by-type-<today>.csv` that opens in a spreadsheet with names intact; Save, reload: persisted. As `viewer@alpha.test` the same report shows "About this report", no builder, and only rows the viewer can see (none in the seed: the empty-state sentence, not an error). Keyboard only: Tab through builder, column Move up/down, Remove; focus stays on the control.

```bash
git add src/reports/text.ts src/reports/text.test.ts src/reports/ReportsPage.tsx src/reports/ReportPage.tsx src/reports/ResultTable.tsx src/ui/icons.tsx src/App.tsx
git commit -m "feat: add reports list, builder, results and csv export"
```

---

### Task 10: Frontend — Dashboard grid, widgets, SVG chart, end-to-end check

**Owner:** Frontend engineer · **Depends on:** 5, 9

**Files:**
- Create: `src/reports/chart.ts`, `src/reports/chart.test.ts`, `src/reports/ChartWidget.tsx`, `src/reports/Widget.tsx`, `src/reports/DashboardPage.tsx`
- Modify: `src/App.tsx` (route `dashboard`), `src/index.css` (chart and widget classes from designer §9 if not added in Task 8)

**Interfaces:**
- Consumes: `useWidgets`, `addWidget`, `removeWidget`, `saveLayout`, `useReports`, `useRunReport`, `ReportError`, `RunResponse`, `WidgetRow` (Task 8); `ResultTable`, `cellText`, `keyText`, `shownText` (Task 9); `Group` (Task 2); dnd-kit `DndContext`, `SortableContext`, `rectSortingStrategy`, `useSortable`, `arrayMove`, `sortableKeyboardCoordinates`.
- Produces: `MAX_BARS = 24`, `type Point = { label: string; value: number; missing: boolean }`, `niceTicks(min: number, max: number, count?: number): number[]`, `chartPoints(groups: Group[], fn: 'count' | 'sum', total: number): { points: Point[]; more: number }`, `chartGeometry(points: Point[], width: number, height: number): Geometry`; components `ChartWidget`, `WidgetBody`, `DashboardPage`.

- [ ] **Step 1: Write the failing tests** — `src/reports/chart.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_BARS, chartGeometry, chartPoints, niceTicks } from './chart.ts'

const r1 = (n: number) => Math.round(n * 10) / 10

test('ticks are round numbers that always include zero', () => {
  assert.deepEqual(niceTicks(0, 87), [0, 25, 50, 75, 100])
  assert.deepEqual(niceTicks(-12, 30), [-20, 0, 20, 40])
  assert.deepEqual(niceTicks(0, 0), [0, 1])
})

test('bars grow from the zero line both ways, and the line joins the bar centres', () => {
  const g = chartGeometry([{ label: 'a', value: 10, missing: false }, { label: 'b', value: -5, missing: false }], 248, 136)
  assert.deepEqual(g.ticks.map((t) => t.value), [-5, 0, 5, 10])
  assert.deepEqual(g.bars.map((b) => [r1(b.x), r1(b.y), r1(b.w), r1(b.h)]), [[62.4, 8, 67.2, 66.7], [158.4, 74.7, 67.2, 33.3]])
  assert.equal(r1(g.zeroY), 74.7)
  assert.equal(g.line, 'M96.0 8.0 L192.0 108.0')
})

test('chart points label empty keys, mark groups with no numbers and say how many are not drawn', () => {
  const groups = Array.from({ length: 30 }, (_, i) => ({ key: i === 0 ? null : `G${i}`, count: i, sum: i === 1 ? null : i * 2, skipped: 0 }))
  const { points, more } = chartPoints(groups.slice(0, MAX_BARS), 'sum', 30)
  assert.deepEqual([points.length, more, points[0].label, points[1]], [24, 6, 'No answer', { label: 'G1', value: 0, missing: true }])
  assert.deepEqual(chartPoints(groups.slice(0, 2), 'count', 2).points.map((p) => p.value), [0, 1])
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test`
Expected: FAIL with `Cannot find module '.../src/reports/chart.ts'`.

- [ ] **Step 3: Write `src/reports/chart.ts`**

```ts
import type { Group } from './logic'
import { keyText } from './text'

export const MAX_BARS = 24 // more than this is unreadable in a widget; the widget says how many it left out
export type Point = { label: string; value: number; missing: boolean }
export type Bar = Point & { x: number; y: number; w: number; h: number; cx: number }
export type Geometry = {
  width: number; height: number; left: number; right: number; bottom: number
  ticks: { value: number; y: number }[]; zeroY: number; bars: Bar[]; line: string
}

const STEPS = [1, 2, 2.5, 5, 10]

/** About `count` round steps covering min..max and always zero, so bars start from a real baseline. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const lo = Math.min(0, min)
  const hi = Math.max(0, max)
  if (lo === hi) return [0, 1]
  const raw = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = STEPS.map((m) => m * mag).find((s) => s >= raw) as number
  const out: number[] = []
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step / 1e6; v += step) out.push(Number(v.toFixed(10)))
  return out
}

/** A group with no numbers draws as 0 and is flagged, so the caption can say so. */
export function chartPoints(groups: Group[], fn: 'count' | 'sum', total: number): { points: Point[]; more: number } {
  const points = groups.slice(0, MAX_BARS).map((g) => ({
    label: keyText(g.key), value: fn === 'sum' ? g.sum ?? 0 : g.count, missing: fn === 'sum' && g.sum === null,
  }))
  return { points, more: Math.max(0, total - points.length) }
}

export function chartGeometry(points: Point[], width: number, height: number): Geometry {
  const left = 48
  const right = 8
  const top = 8
  const bottom = 28
  const ticks = niceTicks(Math.min(...points.map((p) => p.value)), Math.max(...points.map((p) => p.value)))
  const lo = ticks[0]
  const hi = ticks[ticks.length - 1]
  const y = (v: number) => top + ((hi - v) / (hi - lo)) * (height - top - bottom)
  const band = (width - left - right) / Math.max(points.length, 1)
  const zeroY = y(0)
  const bars = points.map((p, i) => {
    const vy = y(p.value)
    return { ...p, x: left + i * band + band * 0.15, w: band * 0.7, y: Math.min(zeroY, vy), h: Math.abs(zeroY - vy), cx: left + i * band + band / 2 }
  })
  const line = bars.map((b, i) => `${i ? 'L' : 'M'}${b.cx.toFixed(1)} ${y(b.value).toFixed(1)}`).join(' ')
  return { width, height, left, right, bottom: height - bottom, ticks: ticks.map((v) => ({ value: v, y: y(v) })), zeroY, bars, line }
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm test`
Expected: `pass 174` (171 + 3).

- [ ] **Step 5: Write `src/reports/ChartWidget.tsx`**

```tsx
import { useId, useState } from 'react'
import type { RunResponse } from './api'
import { chartGeometry, chartPoints } from './chart'
import { cellText, shownText } from './text'

const W = 480
const H = 200
const clip = (s: string) => (s.length > 12 ? `${s.slice(0, 11)}…` : s)

/** One series in --in, values in the SVG title and the table alternative; never colour alone (design/README dataviz). */
export function ChartWidget({ kind, title, data, reportId }: { kind: 'bar' | 'line'; title: string; data: RunResponse; reportId: string }) {
  const uid = useId()
  const [asTable, setAsTable] = useState(false)
  const r = data.result
  if (r.kind !== 'groups') {
    return <p className="rnr-muted">This report is not grouped, so it cannot be drawn. Group it by a column, or show it as a number or a table.</p>
  }
  if (r.total === 0) return <p className="rnr-muted">No records yet.</p>
  const { points, more } = chartPoints(r.groups, data.aggregateFn === 'sum' ? 'sum' : 'count', r.total)
  const g = chartGeometry(points, W, H)
  const summary = `${kind === 'bar' ? 'Bar' : 'Line'} chart of ${title}: ${points.map((p) => `${p.label} ${p.missing ? 'no numbers' : cellText(p.value)}`).join(', ')}.`
  return (
    <div className="flex flex-col gap-2">
      {asTable ? (
        <table className="rnr-table">
          <caption className="sr-only">{title}</caption>
          <thead><tr><th scope="col">{data.groupLabel}</th><th scope="col" className="num">{data.aggregateLabel}</th></tr></thead>
          <tbody>{points.map((p, i) => <tr key={i}><th scope="row">{p.label}</th><td className="num">{p.missing ? 'No numbers' : cellText(p.value)}</td></tr>)}</tbody>
        </table>
      ) : (
        <svg className="rnr-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${uid}-t`} data-kind={kind}>
          <title id={`${uid}-t`}>{summary}</title>
          {g.ticks.map((t) => (
            <g key={t.value}>
              <line className="rnr-chart-grid" x1={g.left} x2={W - g.right} y1={t.y} y2={t.y} />
              <text className="rnr-chart-axis rnr-num" x={g.left - 6} y={t.y} textAnchor="end" dominantBaseline="middle">{cellText(t.value)}</text>
            </g>
          ))}
          <line className="rnr-chart-zero" x1={g.left} x2={W - g.right} y1={g.zeroY} y2={g.zeroY} />
          {kind === 'bar'
            ? g.bars.map((b, i) => <rect key={i} className="rnr-chart-bar" x={b.x} y={b.y} width={b.w} height={Math.max(b.h, 1)}><title>{`${b.label}: ${b.missing ? 'no numbers' : cellText(b.value)}`}</title></rect>)
            : (
              <>
                <path className="rnr-chart-line" d={g.line} />
                {g.bars.map((b, i) => <circle key={i} className="rnr-chart-dot" cx={b.cx} cy={b.value >= 0 ? b.y : b.y + b.h} r={3}><title>{`${b.label}: ${cellText(b.value)}`}</title></circle>)}
              </>
            )}
          {g.bars.map((b, i) => <text key={i} className="rnr-chart-axis" x={b.cx} y={g.bottom + 16} textAnchor="middle">{clip(b.label)}</text>)}
        </svg>
      )}
      {more > 0 && <p className="rnr-caption">{shownText(points.length, r.total, 'group')}. <a href={`#/reports/${reportId}`}>Open the report</a> to see them all.</p>}
      {points.some((p) => p.missing) && <p className="rnr-caption">Groups with no numbers show as 0.</p>}
      <button type="button" className="rnr-btn rnr-btn-ghost self-start" aria-pressed={asTable} onClick={() => setAsTable(!asTable)}>
        {asTable ? 'Show as chart' : 'Show as table'}
      </button>
    </div>
  )
}
```

- [ ] **Step 6: Write `src/reports/Widget.tsx`**

```tsx
import { useOrg } from '../rbac/useOrg'
import { Skeleton } from '../ui/Skeleton'
import { ReportError, useRunReport, type WidgetRow } from './api'
import { MAX_BARS } from './chart'
import { ChartWidget } from './ChartWidget'
import { ResultTable } from './ResultTable'
import { cellText, shownText } from './text'

const SIZE = { number: 1, table: 10, bar: MAX_BARS, line: MAX_BARS } as const

/** Runs the widget's report as the viewer, so each person's dashboard counts only the records they can see. */
export function WidgetBody({ w }: { w: WidgetRow }) {
  const { orgId, userId } = useOrg()
  const run = useRunReport(orgId, userId, { reportId: w.report_id }, 1, SIZE[w.kind])
  if (run.isPending) return <Skeleton rows={[{ w: '60%', h: 32 }]} />
  if (run.error) {
    return (
      <div className="flex flex-col gap-2">
        <p className="rnr-error" role="alert">{run.error instanceof ReportError ? run.error.message : 'We could not load this widget.'}</p>
        <div><button type="button" className="rnr-btn rnr-btn-ghost" onClick={() => void run.refetch()}>Try again</button></div>
      </div>
    )
  }
  const data = run.data
  const r = data.result
  if (w.kind === 'number') {
    const value = r.kind === 'groups' ? r.grandTotal : r.total
    const label = r.kind === 'groups' && data.aggregateFn === 'sum' ? data.aggregateLabel : 'Records'
    return (
      <div className="flex flex-col gap-1">
        <p className="rnr-kpi">{value === null ? 'No numbers' : cellText(value)}</p>
        <p className="rnr-caption">{label}{r.kind === 'groups' && r.skipped ? `. ${cellText(r.skipped)} left out because they were not numbers.` : ''}</p>
      </div>
    )
  }
  if (w.kind === 'table') {
    const shown = r.kind === 'rows' ? r.rows.length : r.groups.length
    return (
      <div className="flex flex-col gap-2">
        {r.total === 0 ? <p className="rnr-muted">No records yet.</p> : <ResultTable data={data} busy={run.isFetching} />}
        {shownText(shown, r.total, r.kind === 'rows' ? 'record' : 'group') && (
          <p className="rnr-caption">{shownText(shown, r.total, r.kind === 'rows' ? 'record' : 'group')}. <a href={`#/reports/${w.report_id}`}>Open the report</a> to see them all.</p>
        )}
      </div>
    )
  }
  return <ChartWidget kind={w.kind} title={w.title} data={data} reportId={w.report_id} />
}
```

- [ ] **Step 7: Write `src/reports/DashboardPage.tsx`**

```tsx
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type UniqueIdentifier } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useOrg } from '../rbac/useOrg'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { friendlyError } from '../ui/errors'
import { DownIcon, GripIcon, PlusIcon, TrashIcon, UpIcon, XIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { useAction } from '../ui/useAction'
import { useFocusAfterRender } from '../ui/useFocusAfterRender'
import { addWidget, removeWidget, saveLayout, useReports, useWidgets, type WidgetKind, type WidgetRow } from './api'
import { WidgetBody } from './Widget'

const SPAN = { 1: '', 2: 'sm:col-span-2', 4: 'sm:col-span-2 lg:col-span-4' } as const
const SPAN_WORDS = { 1: 'Small', 2: 'Medium', 4: 'Full width' } as const
const KIND_WORDS: Record<WidgetKind, string> = { number: 'Number', table: 'Table', bar: 'Bar chart', line: 'Line chart' }

export function DashboardPage() {
  const { orgId, can } = useOrg()
  const manage = can('reports.manage')
  const widgets = useWidgets(orgId)
  const qc = useQueryClient()
  const [layout, setLayout] = useState<WidgetRow[] | null>(null) // non-null while editing
  const [adding, setAdding] = useState(false)
  const [doomed, setDoomed] = useState<WidgetRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [note, setNote] = useState('')
  const saving = useAction()
  const removal = useAction()
  const focusLater = useFocusAfterRender()
  const grid = useRef<HTMLOListElement>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const shown = layout ?? widgets.data ?? []
  const count = shown.length
  const title = (id: UniqueIdentifier) => shown.find((w) => w.id === id)?.title ?? 'Widget'
  const pos = (id: UniqueIdentifier) => shown.findIndex((w) => w.id === id) + 1
  const refocus = (id: string, ctl: string) => focusLater(() => grid.current?.querySelector<HTMLElement>(`[data-id="${id}"] [data-ctl="${ctl}"]`))

  const step = (i: number, d: -1 | 1, ctl: 'up' | 'down') => {
    const w = shown[i]
    if (i + d < 0 || i + d >= count) { setNote(`${w.title} is already ${d < 0 ? 'first' : 'last'}.`); return }
    setLayout(arrayMove(shown, i, i + d))
    setNote(`Moved ${w.title} to position ${i + d + 1} of ${count}.`)
    refocus(w.id, ctl)
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    setLayout(arrayMove(shown, pos(active.id) - 1, pos(over.id) - 1))
    refocus(String(active.id), 'handle')
  }
  const save = () => saving.run(async () => {
    if (!layout) return
    setError(null)
    const { error: e } = await saveLayout(orgId!, layout.map((w) => ({ id: w.id, span: w.span })))
    if (e) { setStale(/dashboard changed/.test(e.message)); setError(friendlyError(e)); return false }
    await qc.invalidateQueries({ queryKey: ['widgets', orgId] })
    setLayout(null)
    setNote('Layout saved.')
    focusLater('dash-h')
  }, true)
  const reload = async () => { setLayout(null); setStale(false); setError(null); await widgets.refetch(); focusLater('dash-h') }
  const remove = () => removal.run(async () => {
    if (!doomed) return
    const { data, error: e } = await removeWidget(doomed.id)
    if (e || !data.length) { setError(e ? friendlyError(e) : 'This widget was already removed. Reload to see the latest dashboard.'); setDoomed(null); return }
    setLayout((l) => l && l.filter((w) => w.id !== doomed.id))
    setDoomed(null)
    setNote(`${doomed.title} removed.`)
    await qc.invalidateQueries({ queryKey: ['widgets', orgId] })
    focusLater('dash-h') // the card that held Remove is gone
  })

  return (
    <section className="flex flex-col gap-4" aria-labelledby="dash-h">
      <div className="flex flex-wrap items-center gap-2">
        <h1 id="dash-h" className="page-title" tabIndex={-1}>Dashboard</h1>
        {manage && !layout && <button type="button" className="rnr-btn rnr-btn-secondary ml-auto" onClick={() => setLayout(widgets.data ?? [])}>Edit layout</button>}
        {layout && (
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" className="rnr-btn rnr-btn-secondary" onClick={() => setAdding(true)}><PlusIcon />Add widget</button>
            <button type="button" className="rnr-btn rnr-btn-ghost" onClick={() => { setLayout(null); setError(null); focusLater('dash-h') }}>Cancel</button>
            <button type="button" className="rnr-btn rnr-btn-primary" aria-busy={saving.busy} onClick={() => void save()}>
              {saving.busy && <span className="rnr-spin" aria-hidden="true" />}{saving.busy ? 'Saving…' : 'Save layout'}
            </button>
          </div>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{note}</p>
      {error && (
        <div className="flex flex-col items-start gap-2" role="alert">
          <p className="rnr-error">{error}</p>
          {stale && <button type="button" className="rnr-btn rnr-btn-secondary" onClick={() => void reload()}>Reload dashboard</button>}
        </div>
      )}
      {widgets.isPending && <Skeleton rows={[{ w: '100%', h: 160 }]} />}
      {widgets.isError && (
        <div className="rnr-card gap-3">
          <p role="alert">We could not load the dashboard. Check your connection and try again.</p>
          <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => void widgets.refetch()}>Try again</button></div>
        </div>
      )}
      {widgets.data && count === 0 && (
        <div className="rnr-card gap-3">
          <h2 className="dialog-title">Nothing on the dashboard yet</h2>
          <p className="rnr-muted">{manage ? 'Choose Edit layout, then Add widget to show a saved report as a number, a table or a chart.' : 'Ask a reports manager to add widgets.'}</p>
        </div>
      )}
      {count > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}
          accessibility={{
            screenReaderInstructions: { draggable: 'Press Space to pick up this widget. Use the arrow keys to move it. Press Space to drop it, or Escape to cancel.' },
            announcements: {
              onDragStart: ({ active }) => `Picked up ${title(active.id)}. Position ${pos(active.id)} of ${count}.`,
              onDragOver: ({ active, over }) => (over ? `${title(active.id)} is over position ${pos(over.id)} of ${count}.` : undefined),
              onDragEnd: ({ active, over }) => (over && over.id !== active.id ? `Moved ${title(active.id)} to position ${pos(over.id)} of ${count}.` : `${title(active.id)} dropped in position ${pos(active.id)} of ${count}.`),
              onDragCancel: ({ active }) => `Moving ${title(active.id)} was cancelled.`,
            },
          }}>
          <SortableContext items={shown.map((w) => w.id)} strategy={rectSortingStrategy}>
            <ol ref={grid} className="rnr-grid grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4" aria-label="Dashboard widgets">
              {shown.map((w, i) => (layout
                ? <EditCard key={w.id} w={w} index={i} count={count} onStep={step} onRemove={() => setDoomed(w)}
                  onSpan={(span) => setLayout(layout.map((x) => (x.id === w.id ? { ...x, span } : x)))} />
                : (
                  <li key={w.id} className={`rnr-card gap-3 ${SPAN[w.span]}`}>
                    <div className="flex items-center gap-2">
                      <h2 className="label rnr-muted flex-1 truncate">{w.title}</h2>
                      <a className="rnr-btn rnr-btn-ghost" href={`#/reports/${w.report_id}`} aria-label={`Open the report for ${w.title}`}>Open report</a>
                    </div>
                    <WidgetBody w={w} />
                  </li>
                )))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      {adding && layout && <AddWidgetDialog position={count + 1} onClose={() => setAdding(false)}
        onAdded={async (title) => { setAdding(false); await qc.invalidateQueries({ queryKey: ['widgets', orgId] }); setLayout(null); setNote(`${title} added.`) }} />}
      <ConfirmDialog open={!!doomed} title={`Remove “${doomed?.title ?? ''}”?`} body="The widget leaves the dashboard for everyone. Its report is kept."
        confirmLabel="Remove widget" busyLabel="Removing…" busy={removal.busy} error={null} onClose={() => setDoomed(null)} onConfirm={() => void remove()} />
    </section>
  )
}

function EditCard({ w, index, count, onStep, onSpan, onRemove }: {
  w: WidgetRow; index: number; count: number; onStep(i: number, d: -1 | 1, ctl: 'up' | 'down'): void; onSpan(span: 1 | 2 | 4): void; onRemove(): void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: w.id })
  return (
    // dnd-kit positions the card being dragged with an inline transform; nothing else here is styled inline.
    <li ref={setNodeRef} data-id={w.id} className={`rnr-card gap-2 ${SPAN[w.span]}`} data-state={isDragging ? 'overlay' : 'editing'}
      style={{ transform: CSS.Transform.toString(transform), transition }}>
      <div className="flex items-center gap-1">
        <button ref={setActivatorNodeRef} type="button" className="rnr-handle" data-ctl="handle" aria-label={`Drag ${w.title}`} {...attributes} {...listeners}><GripIcon /></button>
        <h2 className="label flex-1 truncate">{w.title}</h2>
        <button type="button" className="rnr-icon-btn" data-ctl="up" aria-label={`Move ${w.title} up`} aria-disabled={index === 0} onClick={() => onStep(index, -1, 'up')}><UpIcon /></button>
        <button type="button" className="rnr-icon-btn" data-ctl="down" aria-label={`Move ${w.title} down`} aria-disabled={index === count - 1} onClick={() => onStep(index, 1, 'down')}><DownIcon /></button>
        <button type="button" className="rnr-icon-btn" aria-label={`Remove ${w.title}`} onClick={onRemove}><TrashIcon /></button>
      </div>
      <p className="rnr-caption">{KIND_WORDS[w.kind]}</p>
      <label className="rnr-check">Width
        <select className="rnr-input" value={w.span} onChange={(e) => onSpan(Number(e.target.value) as 1 | 2 | 4)}>
          {([1, 2, 4] as const).map((s) => <option key={s} value={s}>{SPAN_WORDS[s]}</option>)}
        </select>
      </label>
    </li>
  )
}

function AddWidgetDialog({ position, onClose, onAdded }: { position: number; onClose(): void; onAdded(title: string): Promise<void> }) {
  const { orgId } = useOrg()
  const reports = useReports(orgId)
  const ref = useRef<HTMLDialogElement>(null)
  const uid = useId()
  const [reportId, setReportId] = useState('')
  const [kind, setKind] = useState<WidgetKind>('number')
  const [title, setTitle] = useState('')
  const [span, setSpan] = useState<1 | 2 | 4>(1)
  const [error, setError] = useState<string | null>(null)
  const act = useAction()
  useEffect(() => { ref.current?.showModal() }, [])
  const picked = reports.data?.find((r) => r.id === reportId)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void act.run(async () => {
      if (!picked) { setError('Choose a report to show.'); document.getElementById(`${uid}-r`)?.focus(); return }
      if ((kind === 'bar' || kind === 'line') && !picked.group_by) { setError('Charts need a grouped report. Choose a grouped report, or show this one as a number or a table.'); return }
      const name = title.trim() || picked.name
      const { error: e2 } = await addWidget({ org_id: orgId!, report_id: picked.id, kind, title: name.slice(0, 80), span, position })
      if (e2) { setError(friendlyError(e2)); return }
      await onAdded(name)
    })
  }
  return (
    <dialog ref={ref} className="rnr-dialog" aria-labelledby={`${uid}-t`} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }}>
      <div className="rnr-dialog-head">
        <h2 id={`${uid}-t`}>Add widget</h2>
        <button className="rnr-icon-btn" type="button" aria-label="Close dialog" onClick={onClose}><XIcon /></button>
      </div>
      <form className="rnr-dialog-body" onSubmit={submit} noValidate>
        <div className="rnr-field">
          <label className="rnr-label" htmlFor={`${uid}-r`}>Report</label>
          <select id={`${uid}-r`} className="rnr-input" value={reportId} onChange={(e) => setReportId(e.target.value)}>
            <option value="">Choose a report</option>
            {reports.data?.map((r) => <option key={r.id} value={r.id}>{r.name}{r.group_by ? ' (grouped)' : ''}</option>)}
          </select>
        </div>
        <fieldset className="rnr-field">
          <legend className="rnr-label">Show as</legend>
          <div className="rnr-seg" role="radiogroup" aria-label="Show as">
            {(Object.keys(KIND_WORDS) as WidgetKind[]).map((k) => <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>{KIND_WORDS[k]}</button>)}
          </div>
        </fieldset>
        <div className="rnr-field">
          <label className="rnr-label" htmlFor={`${uid}-n`}>Title</label>
          <input id={`${uid}-n`} className="rnr-input" value={title} maxLength={80} placeholder={picked?.name ?? ''} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="rnr-field">
          <label className="rnr-label" htmlFor={`${uid}-s`}>Width</label>
          <select id={`${uid}-s`} className="rnr-input" value={span} onChange={(e) => setSpan(Number(e.target.value) as 1 | 2 | 4)}>
            {([1, 2, 4] as const).map((s) => <option key={s} value={s}>{SPAN_WORDS[s]}</option>)}
          </select>
        </div>
        {error && <p className="rnr-error" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="rnr-btn rnr-btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="rnr-btn rnr-btn-primary" type="submit" aria-busy={act.busy}>
            {act.busy && <span className="rnr-spin" aria-hidden="true" />}{act.busy ? 'Adding…' : 'Add widget'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
```

(Adding a widget leaves edit mode after saving the new row, so the order of the other widgets is never saved half-edited; the manager re-enters Edit layout to place it. The Add dialog is a second primary only inside its own modal.)

Route `dashboard` to `DashboardPage` in `src/App.tsx`.

- [ ] **Step 8: Check**

Run:
```bash
pnpm test && pnpm lint && pnpm build
DENO_NO_PACKAGE_JSON=1 deno test --allow-read supabase/functions
supabase db reset && supabase test db
```
Expected: `pass 174`; oxlint clean; build passes with `check-dist: ok`; deno: every test passes (DB-backed and Realtime tests ignored without their variables); pgTAP `All tests successful.` 8 files, 198 tests. Then, with the variables set, the DB-backed tests (advance race, send-messages race, Realtime, `run-report/visibility.test.ts`) each `ok | 1 passed`.

- [ ] **Step 9: End-to-end check in the Claude Browser pane** (fresh tab per user, `alpha.localhost:5199/app/` and `beta.localhost:5199/app/`, `supabase functions serve` running)

1. `member@alpha.test` starts a Leave approval for 3 days; `admin@alpha.test` claims and approves it; after "Wait a day" is forced due (`update scheduled_actions set run_at = now()`), the record ends `done`, the timeline says "PDF requested", then "PDF made" (no bell notice: a PDF made by a workflow action has no requester), and the record page shows Open PDF; the PDF opens with the header, every chosen answer, the sign-off with names, outcomes, UTC times and both signatures, and no hidden "Other reason".
2. On a record with a 6,000-character Reason, Generate PDF: the bell shows "PDF ready: …" within seconds; the PDF has several pages, no text past the margins, a footer "Page n of N".
3. Delete the signature object of a submission in Studio, press "Make a new PDF": "PDF not made: A signature file is missing…" with Try again; the closed record keeps "Done".
4. Reports → Leave days by type: totals line, page through, Download CSV, open it: one header row, names intact, a test answer `=1+1` reads as text `'=1+1`.
5. Dashboard as admin: Edit layout, move "Leave days by type" first with the keyboard (Tab to its handle, Space, Arrow left, Space) — the live region announces the move and focus stays on the handle; change its width to Full width; Save layout; reload: persisted. In a second admin tab save a different order first: the first tab's Save shows "The dashboard changed…" with Reload dashboard.
6. Bar chart: hover dims the other bars (design `opacity-dim`), "Show as table" shows the same numbers; switch the theme to Black & White: bars stay one series, axis numbers are tabular.
7. `viewer@alpha.test`: Dashboard and Reports visible, numbers count only records the viewer can see (0 in the seed), no Edit layout, no builder. `owner@beta.test`: an Alpha report id shows "This report does not exist", the Alpha dashboard is not reachable.
8. 375 px: dashboard widgets full width, chart scales, report tables scroll inside their card with the first column sticky, no page-level horizontal scroll; Esc closes every dialog and returns focus. Reset viewport and theme.

- [ ] **Step 10: Commit**

```bash
git add src/reports/chart.ts src/reports/chart.test.ts src/reports/ChartWidget.tsx src/reports/Widget.tsx src/reports/DashboardPage.tsx src/App.tsx src/index.css
git commit -m "feat: add the reports dashboard with an accessible svg chart"
```

---

## Self-review notes

- §9.1 → one template per workflow (`report_templates.workflow_id unique`, Task 1) with header text, chosen fields from any step (`fields: {nodeId, key}[]`) and a sign-off block (`signoff: nodeId[]` → name, outcome, UTC time, signature; Task 3 `buildPdfModel`); rendered server-side in an Edge Function (`render-pdfs`, pdf-lib + embedded Inter, decision 1–2; Task 5); long text wraps and breaks pages, signatures are embedded PNGs, hidden fields are omitted (Task 3 `layoutPdf`/`resolve`, Task 5 renderer); saved to the private org-scoped `record-pdfs` bucket whose read policy follows record visibility (decision 7, Task 1); linked on the record (`record_pdfs` + `PdfPanel`, Task 8); triggered by the `generate_pdf` action (Task 4 turns the Phase 3 pending event into a queued job) and a button (`request_record_pdf`, Tasks 1 and 8); queued because rendering is slow (decision 3); errors stop an open record per the engine's rules and are never silent (decision 4, Task 5); the requester is told in the Realtime bell (Task 5 `notify`).
- §9.2 → `saved_reports(org_id, workflow_id, columns, filters, group_by, aggregate)` (Task 1, + `name`); columns from `records.data` and record metadata (decision 12, Task 2 `cellOf`); filters with the §4.3 operators through the shared `evaluate()` (Task 2, decision 8); one group-by with count or sum, nulls and non-numbers handled explicitly (decision 10); executed in `run-report` as the caller so RLS record visibility decides every row (decision 8, Task 6, real-Supabase test); paging with explicit totals and no silent truncation (decision 9); CSV with escaping and the formula guard (decision 11); `reports.view` to run, `reports.manage` to save (RLS in Task 1, function check in Task 6, UI hints in Tasks 8–9).
- §9.3 → dashboard grid of widgets backed by saved reports (`dashboard_widgets`, Task 1) shown as a number, a table, or one bar/line chart (Task 10); drag-to-reorder with dnd-kit plus keyboard and Move up/down paths and live announcements; per-org layout, justified (decision 13); hand-rolled SVG, justified (decision 14); a data-table alternative for every chart.
- §10 → the browser is never trusted: definitions are re-validated in `run-report`, PDFs are built only on the server, permissions are RLS + RPC checks; failed PDFs carry `failed` + a plain reason and stop open records; nothing is dropped (expired leases are failed, the 10,000 cap refuses).
- §11 → unit (`node --test` + Deno): runner, group/sum, CSV, PDF model, layout, chart geometry, text helpers; pgTAP: RLS allow/deny per permission for templates, reports, widgets, jobs and PDF objects, cross-org, layout RPC, cron; Deno: `generate_pdf` in the engine, worker retries/backoff/terminal failure/lease expiry/overlap, real pdf-lib rendering, `run-report` paging, cap and CSV; real-Postgres/Supabase opt-in tests for visibility and the existing races; one browser end-to-end flow (Task 10 Step 9).
- §12 phase 5 "record PDF, aggregate tables + CSV, dashboard" → Tasks 1–10. §15 → designer spec first (Task 7); tokens and `rnr-*` classes only; dataviz rules applied in decision 14 and Task 10.
- Review Focus 1 → Task 6 visibility test; 2 → Task 2 tests; 3 → Task 2 CSV tests + Task 6 CSV export test; 4 → Task 3 tests + Task 5 renderer and worker tests; 5 → Task 1 pgTAP; 6 → Task 2 paging tests + Task 6 cap test; 7 → Task 5 worker tests.
- QA defect classes → Global Constraints list, each pinned to its task: silent truncation (decision 9, Task 6 413 test, widget "Showing … of …"), raw error leaks (`PDF_FAILED`, run-report 500 sentence, worker test asserting no exception text in the database), inline styles (only dnd-kit's transform), focus loss (heading focus after delete/remove/save; handle focus after keyboard moves), layer trap (`rnr-table-card`, `col-span` classes, designer §9).
- Expected counts: `pnpm test` 142 → 158 (Task 2) → 164 (Task 3) → 168 (Task 8) → 171 (Task 9) → 174 (Task 10); `deno test supabase/functions` gains 16 (Task 2) + 6 (Task 3) + 3 (Task 4) + 11 (Task 5) + 6 (Task 6) passing and 1 more ignored without variables (Task 6); `supabase test db` 158 in 7 files → 198 in 8 files (Task 1).
- Out of scope, by the spec: several templates per workflow, more than one group-by, campaigns built on saved reports (Phase 6 reads `saved_reports` through `run-report`'s runner). Deferred with a `shortcut:` note: 10,000 visible records per report, UTC times in PDFs, CJK glyphs in PDFs, 10 PDFs per wake-up.
