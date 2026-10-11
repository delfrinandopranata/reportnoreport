# Phase 5 screens: implementation spec

Sources: `design/README.md` (content, dataviz, motion, drag rules), `tokens.css`, `components/bundle.css` + component READMEs/previews (Widget, DataTable, Canvas, Segmented, Menu, Dialog, Icon, Button, Field), `phase-1-screens.md` to `phase-4-screens.md` (their §0 sections, the dialog/sheet rules, the layer trap and every `src/index.css` addition still apply), Phase 5 plan Tasks 3, 5, 6 and 8–10 plus Global Constraints, and the shipped `src/**` (App shell, `ConfirmDialog`, `useAction`, `useNotice`, `useFocusAfterRender`, `useMedia`, `Skeleton`, `When`/`Day`, `navGuard`, `errors`, `icons`, `RecordPage`, forms `RuleEditor`, `FieldList` drag, `VariableMenu`, `TemplateEditor`). Tailwind utilities are for **layout only**; colour, type, radius and controls come from `rnr-*` classes and tokens. "DD" = design decision (design system or plan silent; most conservative option). Where this file differs from Tasks 3, 5, 8, 9 and 10, this file wins (§10 lists every difference). Read "designer §9" and "designer §11" in the plan as **§12** of this file (the CSS list).

Selectors verified in `bundle.css`: `rnr-card(-head|-title)`, `rnr-card[data-state=editing|overlay|placeholder]`, `rnr-handle`, `rnr-kpi`, `rnr-grid`, `rnr-btn(-primary|-secondary|-ghost|-danger)`, `rnr-icon-btn`, `rnr-field`, `rnr-label`, `rnr-hint`, `rnr-input`, `rnr-error`, `rnr-status`, `rnr-chip`, `rnr-seg`, `rnr-menu`, `rnr-menu-item` (+`is-danger`), `rnr-menu-sep`, `rnr-dialog(-head|-body)`, `rnr-table` (+ `.num`), `rnr-skeleton`, `rnr-spin`, `rnr-pop`, `rnr-muted`, `rnr-num`, `rnr-focus`, `rnr-kbd`; type classes `page-title`, `dialog-title`, `label`, `caption`, `axis`. From `src/index.css`: `rnr-check`, `rnr-caption`, `rnr-fieldset-label`, `rnr-sticky-first`, `rnr-table-card`, `rnr-card-open`, `rnr-menu--wide`, `rnr-menu-item--stack`, `rnr-pick`, `rnr-preview`, `rnr-sheet`. **Not in the bundle** (do not use): `rnr-btn-sm`, a toast, a tab bar, a tooltip component, an alert/warning icon, a chart component, a progress bar. Tokens: `--chart-grid` exists (dot grid and gridlines); there is **no hatch token** (see §8.5).

**Traps this file keeps hitting (they bite the plan's code in §10):**
1. *Layer trap* (Phase 3): `bundle.css` is unlayered and beats Tailwind utilities. `rnr-card p-0`, `rnr-menu w-…`, `td.flex` do nothing or break. Use the classes in §12.
2. *Row-header trap*: `.rnr-table th` is the 12px muted header style, so `<th scope="row">` in a body renders like a column header. §12 adds `.rnr-table tbody th[scope="row"]`.
3. *Re-parent trap*: React moves a reordered keyed node with `insertBefore`, which drops focus. Every Move up/down/Remove in this phase refocuses by `data-key` (Phase 2 §2.3) with `useFocusAfterRender`.
4. *Transform trap*: dnd-kit writes an inline `transform` on the dragged `li`, so a CSS `rotate(1deg)` tilt on the same element never shows. The tilt and the placeholder need `DragOverlay` (§7.4).

## 1. Global additions

| Item | Spec |
|---|---|
| Naming (DD) | Two different things both said "report" in the plan. User-facing words: **Reports** = saved aggregate reports (list, builder, CSV). **PDF** = the per-record document. The per-workflow layout is the **"PDF template"** everywhere a person reads it (editor title, link, hints, errors, the engine's stop reason). Routes, tables and code keep `report_templates` and `#/workflows/<id>/report`. |
| Nav | Order (DD, daily work first, set-up last): **Inbox, Records, Dashboard, Reports, Forms, Workflows, Templates, Messages, Members, Roles**. Dashboard and Reports for `reports.view` or `reports.manage`, after Records. `aria-current="page"` and `rnr-btn-secondary` on Dashboard for `dashboard`; on Reports for `reports` and `report`. Nothing extra for `workflow-report`: `route.page.startsWith('workflow')` already marks Workflows (a reports manager without `workflows.manage` sees no current item, as Settings). Ten items wrap on the nav's existing `flex-wrap` at 375px. No count badge. |
| Page widths | Dashboard `max-w-5xl` (the `<main>`, full width). Reports list `max-w-5xl`. Report page `max-w-5xl`: two columns from `lg` (`lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]`, both `min-w-0`), stacked below. PDF template editor `max-w-5xl`: form left, preview right from `lg` (`lg:grid-cols-2`). Record page unchanged. |
| One h1, one primary | Dashboard: h1 "Dashboard"; primary "Save layout" only in edit mode (empty state: "Add widget"). Reports: h1 "Reports"; primary "New report" (first run: the card's, header button hidden). Report page: h1 = report name; primary "Save report" (managers); viewers none. PDF template: h1 "PDF template: {workflow}"; primary "Save template". PDF panel: exactly one primary at a time (§2). Every h1 has `id` and `tabIndex={-1}`. |
| Back link | `<a class="rnr-btn rnr-btn-ghost self-start" href="…"><BackIcon/>Back to …</a>` above the h1 (the plan's links have no icon). Report page: "Back to reports" → `#/reports`. PDF template: "Back to workflows" → `#/workflows` **only with `workflows.manage`**; otherwise "Back to reports" → `#/reports` (`guardHash` sends a reports-only manager from `#/workflows` to the inbox). |
| Numbers (DD) | Tabular (`rnr-num`, `.num` right-aligned) en-GB grouping, up to 10 decimals, as typed: "1,240", "34.5". No currency: no form field type is money. If one arrives, the README money rule (ISO code, two decimals) applies to cells, axis, tooltips and PDF alike. **Negatives use a true minus U+2212** ("−3", README) in cells, ticks, tooltips, totals, the PDF and `answerText`; the CSV keeps ASCII `-` (machine format). |
| Dates | UI times by `whenText`/`When` ("11 Oct 2026, 14:30", reader's zone), days by `dayText`/`Day` ("11 Oct 2026"). **Date-only values** (`YYYY-MM-DD` from date fields) are formatted from their parts in UTC so no zone shifts the day. The PDF prints UTC and says so. The CSV keeps ISO. |
| Words | "No answer" = the group of records with an empty group key (sorted last). "No numbers" = a group whose answers held no numbers (not 0). Status words (same as the Records list): In progress, Done, Rejected, Stopped. |
| Status line | Phase 2 to 4 pattern: `<p class="rnr-caption" role="status">` stays mounted, text swaps, clears after 5s (`useNotice`). Never two live regions announcing the same change. |
| Reading level | Errors say what to do and never show codes. The plan's "Not allowed." from `run-report` becomes a sentence (§6.9). |
| Icons | Add `DownloadIcon` and `MoreIcon` to `src/ui/icons.tsx` with the Icon set's **verbatim** paths (24 grid, same `base` props): download `M12 15V3M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5` (the plan's path differs), more `M12 4.5v1M12 11.5v1M12 18.5v1`. **Do not add `ChartIcon`**: it is not in the set and nothing uses it. |

## 2. Record page: PDF panel

Placement (DD): after the "This record stopped" alert (when present), before the map card. `PdfPanel` receives `recordId`, `workflowId`, `recordTitle`, `recordStatus` (the plan passes two props). Back link and h1 block are unchanged.

```html
<section class="rnr-card gap-3" aria-labelledby="pdf-h">
  <h2 id="pdf-h" class="dialog-title">PDF</h2>
  <!-- one state block, see table -->
  <div class="flex flex-wrap items-center gap-2"> <!-- buttons, stable keys --> </div>
  <p class="rnr-caption">Times in the PDF are shown in UTC.</p>
  <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">…</p>   <!-- always mounted, the ONLY live region -->
  <p class="rnr-error" role="alert">…</p>                                          <!-- request or link errors -->
</section>
```

| State | Body | Buttons (exactly one primary) |
|---|---|---|
| No template, `reports.manage` | `<p class="rnr-muted">This workflow has no PDF template yet, so its records cannot be made into PDFs.</p>` | `<a class="rnr-btn rnr-btn-secondary" href="#/workflows/{id}/report">Set up a PDF template</a>` (no primary: nothing else on the page is one). |
| No template, no `reports.manage`, no PDF | Panel not rendered. | |
| Never made (template exists, `reports.view`) | `<p class="rnr-muted">No PDF has been made for this record yet.</p>` | Primary **Generate PDF**. |
| Never made, no `reports.view` | Panel not rendered. | |
| Queued or rendering (one state; the table has only `queued`, DD) | `<p class="rnr-status"><span class="rnr-spin" aria-hidden="true"></span>Making the PDF…</p>` | The same button element stays mounted: primary, `aria-busy="true"`, `rnr-spin`, label **Generating…** (the plan unmounts it, dropping focus). A second press is a no-op (the server returns the same job). |
| Queued longer than 60 s (DD) | Adds `<p class="rnr-caption">This is taking longer than usual. You can leave this page. The PDF appears here when it is ready.</p>` | as above |
| Done | `<p class="rnr-muted">Made <When/>.</p>` | Primary `<a class="rnr-btn rnr-btn-primary" href target="_blank" rel="noopener noreferrer">Open PDF<span class="sr-only"> (opens in a new tab)</span></a>`; secondary `<a class="rnr-btn rnr-btn-secondary" href download>` with `<DownloadIcon/>Download PDF`; ghost button **Generate new PDF** (`reports.view` only). |
| Failed, closed record | `<p class="rnr-status" data-wrap><XIcon size={14}/>PDF not made</p>` then `<p class="rnr-muted">{stored reason}</p>` | Primary **Try again**. |
| Failed, open record (record is `error`) | as above, plus `<p class="rnr-caption">The record stays stopped. A new PDF does not restart it.</p>` | Primary **Try again**. |
| Panel load error | Card `aria-label="PDF"`: `<p role="alert">We could not load the PDF for this record. Check your connection and try again.</p>` | Secondary **Try again** (refetch both queries). |
| Link error | `rnr-error role="alert"`: "We could not open the PDF. Reload the page and try again." | |

- **Download name (DD):** `usePdfUrl(path, downloadName?)` asks for a second signed URL with `{ download: name }`, `name` = `csvFilename`-style slug of the record title + made date + `.pdf` (`incident-ada-lovelace-2026-10-13.pdf`). Open uses the plain URL so the browser's viewer shows it inline.
- **Busy copy:** every request button says **Generating…** (the plan's "Requesting…" is a different verb). After the request resolves the sr-only region says "PDF requested. It will be ready in a few seconds."; when the polled status turns `done`, "The PDF is ready."; `failed`, "The PDF could not be made." Announce only transitions seen in this session (the first load is silent).
- **Focus:** a click on Generate/Try again keeps focus on that button through queued, done and failed (stable `key="generate"`; label swaps in place). Nothing steals focus when polling completes.
- Polling every 2 s only while queued (as the plan); stops on done/failed.
- **Timeline** (`eventText`/`eventIcon`, replaces Task 8): action `status:'pending'` → `PDF not made: recorded before reports were available.` (icon `x`); `queued` → `PDF requested` (`clock`); `done` → `PDF made` (`check`); **`kind:'error'` with `detail.type === 'generate_pdf'` → `PDF not made: {message}`** (`x`), because on a closed record the generic `Stopped: …` is false. No new icons.
- A reader who may only *see* the record (no `reports.view`) still gets Open and Download when a PDF exists; they never get a Generate button.

## 3. PDF template (`#/workflows/:id/report`) and the PDF document

### 3.1 Layout

`<section class="flex flex-col gap-4" aria-labelledby="tpl-h">`: back link, h1 `PDF template: {workflow}`, `<p class="rnr-muted">Every PDF of this workflow's records uses this template. Questions hidden by their rules are always left out.</p>`, then at `lg` `<div class="grid gap-4 lg:grid-cols-2">`: the form (left, three cards) and the preview card (right, `lg:sticky lg:top-4 lg:self-start`). Below `lg` the preview follows the form.

### 3.2 Form cards (all `rnr-card gap-3`, no `overflow:hidden`)

1. **Header** (`rnr-field`): `<label class="rnr-label">Header</label>` + `<textarea class="rnr-input" rows="3">` + `<p class="rnr-hint">` "Printed under the record title. Each line you type prints on its own line, for example a department and an address." **No `maxLength` attribute** (the browser silently cuts a paste); a counter `rnr-caption` "{n} of 2,000 characters" shows from 1,800; over 2,000 the save is blocked with the plan's error "Keep the header under 2,000 characters." and focus goes to the textarea (`aria-invalid`, `aria-describedby`).
2. **Answers to include** (`h2 dialog-title`): one `fieldset.rnr-field` per step (legend `rnr-fieldset-label` = step name), one `label.rnr-check` per field with the field label. Three types get a caption after the label (`rnr-caption`, `ink-muted`): signature "Prints the signature image", file "Prints the file name only", repeating section "Prints one line per row". Steps with no answerable fields show `rnr-caption` "This step has no questions."
3. **Order in the PDF** (appears when ≥1 answer is chosen; `h3 label`): **grouped by step, in workflow order** (DD; the plan's flat list lets a person interleave steps, which prints "Start / Approval / Start" headings). Per step with chosen answers: `<li><p class="label">{step}</p><ol class="rnr-order">` and per answer
   ```html
   <li data-key="{nodeId}:{key}"><span class="rnr-order-label">{label}</span>
     <button type="button" class="rnr-icon-btn" data-ctl="up" aria-label="Move {label} up" aria-disabled="true|undefined"><UpIcon 14/></button>
     <button type="button" class="rnr-icon-btn" data-ctl="down" aria-label="Move {label} down" aria-disabled="true|undefined"><DownIcon 14/></button></li>
   ```
   Move works **within the step only**; first/last buttons stay mounted with `aria-disabled` (existing `.rnr-icon-btn[aria-disabled]` dimming) and announce "{label} is already first in {step}." / "…last…". After a move, focus returns to the same control by `data-key`; the status line says "{label} moved to position {n} of {total} in {step}." On toggle the saved `fields` array is **normalised**: stable-sorted by step index in the graph, then by the chosen order inside the step (a newly ticked answer joins the end of its step). No drag here (plan and README: a short list; the buttons are the path).
4. **Sign-off** (`fieldset.rnr-card gap-2`, legend `dialog-title`): `<p class="rnr-caption">Each chosen step prints who completed it, the outcome, the time in UTC and their signature if its form has one.</p>` and one `label.rnr-check` per step. Saved `signoff` is **sorted in workflow order**, not click order (the plan appends in click order, so the PDF order would depend on which box was ticked first).

Under the cards: error line (`rnr-error role="alert"`), conflict block (copy as the plan, secondary "Reload template"), then `Save template` primary (busy `Saving…`, saved check `rnr-pop` + "Saved") and the `rnr-status` "Unsaved changes" with `PencilIcon` when dirty; status line `Template saved.`.

States: loading (`Skeleton`: 40% × 32 and 100% × 320); load error card "We could not load this PDF template. Check your connection and try again." + "Try again"; workflow missing "This workflow does not exist"; **no steps with a form**: card "This workflow has no steps with a form yet. Add a Start form in the workflow editor first." (a `workflows.manage` user also gets `<a class="rnr-btn rnr-btn-secondary">Open workflow editor</a>`); first save creates the row, later saves compare `updated_at` (conflict copy as the plan). Unsaved changes are guarded by `useLeaveGuard` with the Phase 2 dialog: title "Leave without saving?", body "Your changes to this PDF template will be lost.", buttons "Cancel" (autofocus) / "Leave" (danger).

### 3.3 Preview (new component `src/reports/TemplatePreview.tsx`; the plan has none)

A **layout preview with example text**, rendered from the unsaved template (live while typing), not a server render.

```html
<section class="rnr-card gap-3" aria-labelledby="prev-h">
  <h2 id="prev-h" class="dialog-title">Preview</h2>
  <p class="rnr-caption">The layout with example text. Real PDFs use the record's answers and print black on white.</p>
  <p class="sr-only">Preview: {n} answers in {m} steps and {k} sign-offs.</p>
  <div class="rnr-paper" aria-hidden="true">
    <p class="rnr-caption">{org name}</p>
    <p class="dialog-title">Example record title</p>
    <p class="rnr-paper-header">{header, line breaks kept}</p>
    <p class="rnr-caption">Workflow: {name}</p> <p class="rnr-caption">Status: In progress</p> <p class="rnr-caption">Started 12 Oct 2026, 08:30 UTC by Example person</p>
    <h3 class="label">{step}</h3><hr class="rnr-paper-rule"/>
    <div><p class="rnr-paper-label">{field label}</p><p>Example answer</p></div>        <!-- signature: <div class="rnr-paper-sig"></div> ; group: two example rows -->
    <h3 class="label">Sign-off</h3><hr class="rnr-paper-rule"/>
    <div><p class="rnr-paper-label">{step}</p><p>Approved by Example person · 12 Oct 2026, 14:05 UTC</p></div>
    <p class="rnr-caption">Generated 13 Oct 2026, 09:00 UTC · Page 1 of 1</p>
  </div>
</section>
```
Empty template: the paper shows only the title block and `rnr-caption` "Choose answers or a sign-off to see them here." Colours follow the user's theme tokens (the document itself is always black on white; the caption says so). `aria-hidden` because it repeats the form's own content; the sr-only line is the text alternative.

### 3.4 The PDF document (exact; `layout.ts` and `render.ts` implement this)

One A4 portrait document, light only (no theme, preset or brand colour). Units are PDF points; origin bottom-left as in `layoutPdf`.

| Item | Value |
|---|---|
| Page | A4 595.28 × 841.89. Margin 56 on all four sides (text column 483.28 wide). Footer band 24 reserved above the bottom margin, so body text stops at y = 80. |
| Fonts | Embedded Inter Regular (400) and Inter SemiBold (600), subset. Text is selectable. Line height 1.4 × size. Bold = SemiBold (no italics anywhere). |
| Colours | `INK #18181b` (ink) for values and titles; `MUTED #71717a` (ink-muted) for labels, meta, placeholders, footer; rules `#e4e4e7` (line-200), 1pt. Muted on white is 4.8:1. |
| Type scale | Org line 9 Regular muted · Title 18 SemiBold ink · Header 11 Regular ink · Meta 9 Regular muted · Step heading 12 SemiBold ink with a 1pt rule 4pt under the baseline · Field label 9 SemiBold muted · Value 10.5 Regular ink · Footer 8 Regular muted. |
| Order, page 1 | Org name; record title (wrapped); header text (blank line above only if non-empty, 4pt gap; the author's line breaks are kept); 6pt gap; three meta lines (`Workflow: …`, `Status: …`, `Started 12 Oct 2026, 08:30 UTC by …`). Then sections. |
| Spacing | Step heading: 14pt gap above, 8pt below its rule. Field: 6pt gap above. Sign-off entry: 6pt above. Group rows: 2pt between rows (DD, so a wrapped row is not read as two). |
| Running head, pages 2 and up (DD, new) | One line at the top margin, 8 Regular muted, `{org} · {record title}` truncated with "…" to the text column; body then starts 16pt lower on those pages. Without it a loose sheet cannot be matched to its record. |
| Footer, every page | Baseline y = 28. Left: `Generated 13 Oct 2026, 09:00 UTC`. Right-aligned to the text column: `Page 1 of 3` (DD: split so the page number is findable; the plan's single string pins the old format and its test changes). |
| Time zone | Every time is `D Mon YYYY, HH:mm UTC`; the word "UTC" is always printed. Dates (date fields) are `D Mon YYYY`. Reader time zones are not available to the server (plan decision 6). |
| Document metadata | Title = record title, creator/producer "ReportNoReport". Not a tagged PDF (a `shortcut:` of pdf-lib); reading order is drawing order, which is also top-to-bottom. |

**Field rendering (value line(s) under the 9pt label):**

| Type | Prints |
|---|---|
| `short_text`, `single_select` | The text as typed; wraps; a word wider than the column breaks by character. |
| `long_text` | Wrapped at the column, paragraph breaks and blank lines kept, control characters removed, tabs as spaces. Splits across pages at line level; the label plus at least the first two lines stay together (DD widow/orphan control); an answer of any length continues, nothing is cut. |
| `number`, `calculated` | en-GB grouping, up to 10 decimals, true minus ("−3"); not finite prints "Not answered". |
| `date` | `12 Oct 2026`. |
| `checkbox` | `Yes` / `No`. |
| `multi_select` | Selected options joined with ", " in option order. |
| `file` | The original file name only (the uploaded id prefix is removed). Files are not embedded and not linked. |
| `signature` | The drawn PNG scaled to fit 180 × 72 (aspect kept), left aligned, with a 1pt `line-200` baseline 2pt under it (DD). The label and the image never separate across a page. |
| `group` (repeating section) | One indented line per row (indent 12): `1. Name: Ben · Age: 40`, wrapping inside the indent; an empty section prints "Not answered". |
| Hidden by `show_if` | **Omitted completely**, label included, judged against the answers as submitted. `page_break` fields never print and are not offered in the picker. |
| Empty answer | `Not answered`, in **muted** (DD; the item carries `placeholder: true` so a person who typed "Not answered" still looks different). |
| Removed question | `This question is no longer on the form.` muted. |
| Step not submitted yet | `Not submitted yet` muted. |

**Sign-off block:** heading `Sign-off`; per chosen step (workflow order): 9 SemiBold muted step name, then `Approved by Grace Hopper · 12 Oct 2026, 14:05 UTC` (verbs Submitted, Approved, Rejected; "Former member" if the person left), then that step's signature image with its baseline. `Not done yet` (muted) if the step has no submission. An entry never splits across pages (label, line and image together).

**Page breaks:** only when content needs them. A step heading never ends a page (it stays with its first label and two value lines). Text splits at line boundaries; images, signature labels and sign-off entries do not split. There is no forced page break per step.

## 4. Reports list (`#/reports`)

`<section class="flex flex-col gap-4" aria-labelledby="reports-h">`: header row (`flex flex-wrap items-center gap-3`): h1 "Reports", primary `New report` with `<kbd class="rnr-kbd" aria-hidden="true">N</kbd>` and `ml-auto` (manage only); `N` (no modifier, focus not in a field, no dialog open) creates one (DD, as Forms and Workflows). Status line.

```html
<div class="rnr-card rnr-table-card">
 <table class="rnr-table rnr-sticky-first"><caption class="sr-only">Reports in {org}</caption>
  <thead><tr><th scope="col">Name</th><th scope="col">Workflow</th><th scope="col">Kind</th><th scope="col" class="num">Updated</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
  <tbody><tr>
   <td>{name}</td> <td>{workflow or "A workflow you cannot see"}</td> <td>Table | Grouped</td>
   <td class="num"><Day iso/></td>
   <td><div class="flex justify-end gap-1 whitespace-nowrap">
     <a class="rnr-btn rnr-btn-secondary" href="#/reports/{id}" aria-label="Open {name}">Open</a>
     <button class="rnr-btn rnr-btn-danger" type="button" aria-label="Delete {name}">Delete</button></div></td></tr></tbody></table></div>
```
Name is plain text, like Forms and Workflows (the plan's link-in-`th` and trash icon-button are replaced); Delete only with `reports.manage`; sorted by name. "Updated" is a day, as Workflows.

| State | Spec |
|---|---|
| Loading | `Skeleton` one 100% × 200 row; header renders at once. |
| First run, manager | Card `gap-3`: ghost preview `<div class="rnr-card" data-state="placeholder" aria-hidden="true">` ("Leave days by type", muted "Grouped · Leave approval"); `h2 dialog-title` "Build your first report"; `<p class="rnr-muted">Count, add up and export the records of a workflow. Build a report here, then show it on the dashboard.</p>`; the one primary `New report` (header button hidden meanwhile). |
| First run, viewer | `h2` "No reports yet", `rnr-muted` "No reports yet. Ask a reports manager to create one." and `<a class="rnr-btn rnr-btn-secondary" href="#/inbox">Go to inbox</a>`. |
| Error | Card: "We could not load the reports. Check your connection and try again." (`role="alert"`) + secondary "Try again". |
| Filtered out | Not applicable. |

**New report dialog** (`rnr-dialog`, Phase 2 §8): title "New report"; fields **Name** (`data-autofocus`, `maxLength` 120) and **Workflow** (select, first option "Choose a workflow"); with no workflows the select is replaced by `rnr-muted` "There are no workflows yet. Create a workflow before making a report." (+ link "Go to workflows" when `workflows.manage`). Buttons Cancel (secondary) and primary `Create report` (busy `Creating…`). Errors: "Enter a name for the report." / "Choose the workflow to report on." (`rnr-error` + focus the field). Success navigates to the new report.

**Delete confirm** (`ConfirmDialog`, Cancel autofocused): title `Delete {name}?` (no quotation marks, as Phase 3/4); body `{name} will be deleted for everyone and cannot be recovered. Records are not changed.`; with widgets using it: `{n} dashboard widget(s) show this report and will be removed too. {name} will be deleted for everyone and cannot be recovered.`; **while the widgets query is loading or failed** the count is unknown, so the body says `Any dashboard widgets that show this report will be removed too. …` (the plan would say "Records are not changed" with a count of 0). Buttons "Cancel" / danger `Delete report` (busy `Deleting…`). Success: status `{name} deleted.` and focus to the h1.

## 5. Report page (`#/reports/:id`)

`<section class="flex flex-col gap-4" aria-labelledby="rpt-h">`: back link; h1 = saved name (`base.name`); `<p class="rnr-muted">Records of <a href="#/workflows/{id}/report">{workflow}</a> that you can see.</p>` (the workflow name links to its PDF template **for `reports.manage` only**; the plan promises this entry point but never renders it). Then the two-column grid of §1.

### 5.1 Settings panel (`reports.manage`)

Below `lg` the panel is `<details class="rnr-card">` with `<summary class="label rnr-focus">Report settings</summary>`, closed by default, opened by a save or validation error (DD; otherwise the results sit a screen and a half down). From `lg` it is always open and the summary is hidden (`useMedia('(min-width: 1024px)')`). Contents (`gap-4`, inside a `<form aria-label="Report settings" noValidate>`):

1. **Name** — `rnr-field` input (`maxLength` 120).
2. **Columns** — `fieldset.rnr-field`, legend `rnr-fieldset-label` "Columns". `<ol class="rnr-order">`, one `<li data-key="{columnId}">`: label (`rnr-order-label`), `Move {label} up`, `Move {label} down` (`aria-disabled` at the ends, never unmounted), `Remove {label}` (`TrashIcon`). After Move, focus returns to the same control; after **Remove**, focus goes to the next row's Remove (or the previous one, or the Add column button when the list is empty); the plan loses focus in both. Status line: "{label} moved to position {n} of {total}." / "{label} removed. {total} columns left."
   **Add column** (DD, replaces the plan's `<select>` that adds on `change`, which adds a column on every arrow key in Chrome): `<button class="rnr-btn rnr-btn-secondary self-start" aria-haspopup="menu" aria-expanded>Add column</button>` opening the Phase 4 menu pattern (`role="menu" class="rnr-menu rnr-menu--wide"`, roving tabindex, arrows, Home/End, Esc, Tab closes, as `VariableMenu`), with `role="group" aria-label="Record"` (Title, Status, Status label, Current step, Started by, Started, Last updated) and `role="group" aria-label="Answers"` (every answer path; columns already added are omitted). After a pick the menu closes, the column is appended, focus returns to Add column and the status line says "{label} added as column {n}." At 20 columns the button stays, `aria-disabled`, with `rnr-caption` "A report can have 20 columns."
3. **Filters** — `fieldset.rnr-field`, legend "Filters". Empty: `rnr-caption` "Every record is included." Each filter is `<div class="rnr-filter" data-key="filter-{i}">` containing the shared `RuleEditor` (`required`, legend `Filter {n}`) and `<button class="rnr-btn rnr-btn-ghost self-start"><TrashIcon/>Remove filter {n}</button>`. `Add filter` (`rnr-btn rnr-btn-secondary self-start`, hidden from 10 filters: replaced by the caption "A report can have 10 filters.") focuses the new filter's Field select; **Remove filter** focuses the next filter's Field select, the previous one, or Add filter. All filters must match (`rnr-caption` under the legend when there are two or more: "Records must match every filter.").
4. **Group by** — `rnr-field` with visible `<label>`; select: "No grouping" then `optgroup` Record / Answers. Choosing a column sets the aggregate to Count and keeps a prior Sum.
5. **For each group** (only with a group): `fieldset.rnr-field`, legend "For each group"; **`<div class="rnr-seg self-start" role="group" aria-label="For each group">` with `<button type="button" aria-pressed>` "Count records" / "Add up a number"** (the plan's `radiogroup` has no roving tabindex or arrow keys; Phase 3 §0). With Sum: a visible `rnr-field` label "Number to add up" and its select (the plan has only `aria-label`). With no number fields, "Add up a number" is `aria-disabled="true"` with `aria-describedby` on `rnr-caption` "This workflow's forms have no number fields to add up." (the plan's button does nothing, silently).
6. Error line, conflict block ("This report was changed by someone else. Reload to see their changes." + "Reload report"), `Save report` primary (busy `Saving…`, saved check, "Saved"), `rnr-status` `<PencilIcon 14/>Unsaved changes. The results already show them.` when dirty. Status line "Report saved."

Viewer (`reports.view` only): `<div class="rnr-card gap-2"><h2 class="dialog-title">About this report</h2>` Columns, filters count, grouping as `rnr-muted` lines (plan copy). Guard dialog as §3.2 with body `Your changes to {name} will be lost.`

### 5.2 Results panel

Order: totals row, notes, CSV error, status line, then one state.

```html
<div class="flex flex-wrap items-center gap-3">
  <p class="label">31 groups from 240 records</p>                      <!-- plain text: not live -->
  <button type="button" class="rnr-btn rnr-btn-secondary ml-auto" aria-busy="false"><DownloadIcon/>Download CSV</button>
</div>
<p>2 values were not numbers and were left out.</p>                     <!-- only when skipped > 0; its own line, ink -->
<p class="rnr-caption">Saves every row as leave-days-by-type-2026-10-13.csv, not just this page.</p>   <!-- + " It includes your unsaved changes." when dirty -->
<p class="sr-only" role="status" aria-live="polite">31 groups from 240 records. 2 values were not numbers and were left out.</p>
```
- **One live region.** The sr-only line announces only when a run for a *changed report body* (settings or filters) completes; paging does not re-announce it (the plan marks the totals `role="status"` and also the pager text `aria-live`, so every page change is read twice).
- **Table** (`rnr-card rnr-table-card` with `aria-busy`, table `rnr-table rnr-sticky-first rnr-results`, `<caption class="sr-only">{name}, {workflow}</caption>`):
  - Rows report: `th scope="col"` per column; a column is numeric when every non-empty cell on the page is a number: its `th` and `td` get `class="num"` (the plan right-aligns cells but not headers). First cell of each row is `<th scope="row"><a href="#/records/{id}">{cellText || 'Untitled'}</a></th>`; if the first column is not Title the link gets `aria-label="Open record: {cell}"`. Other cells `td.rnr-cell` (max 24rem, wraps, never silently cut).
  - Groups report: `th` group label, `th.num` aggregate label ("Records" or "Total days"), with Sum a `th.num` "Records" and, **only when any group left values out**, `th.num` "Left out" (blank for 0). Row header `th scope="row"` = `keyText`; Sum cell "No numbers" when null.
  - **`<tfoot>`** on groups reports: `<tr><th scope="row">All groups</th><td class="num">{grandTotal | No numbers}</td>` plus the Records and Left out totals; separated by a heavier rule (§12). The plan's response already holds `grandTotal`, `totalRecords`, `skipped`.
  - Dates and times: `When`-style for timestamps, `Day`-style for date-only values; numbers by §1.
- **Pager** `<nav class="rnr-pager" aria-label="Results pages">`: ghost `Previous`, `<span class="rnr-num" aria-live="polite">Page 2 of 5</span>`, ghost `Next` (both `aria-disabled`, never unmounted, styled by §12), `<span class="rnr-spin" aria-hidden="true">` shown while a page is fetching, and `<label class="rnr-pager-size">Per page <select class="rnr-input">25 50 100</select></label>` at the right. If the page is past the last (a total that shrank), clamp to the last page. Changing page keeps focus on the pressed button; the previous page stays visible with `aria-busy` (no dimming).
- **CSV** (`reports.view`): busy label `Preparing CSV…` (`aria-busy`, `rnr-spin`, button keeps focus); success status `Downloaded {filename}.`; if the settings are invalid the click says `Finish the report settings before downloading.` (focus the first invalid setting; the plan returns silently). Errors in `rnr-error role="alert"` under the row, e.g. the 413 sentence.

| State | Spec |
|---|---|
| Loading | `Skeleton` one 100% × 240 row (`role="status"`). The settings panel renders at once. |
| First run (no matching records, no filters) | `rnr-card gap-2`: `h2 dialog-title` "No records to show yet"; `<p class="rnr-muted">Records of {workflow} that you can see appear here once people start it.</p>` (also true for a viewer who sees none). |
| Filtered out | `h2` "No records match these filters"; `rnr-muted` "Remove or change a filter to see more." |
| Network error (status null) | Card: `<p role="alert">We could not run this report. Try again.</p>` + secondary "Try again". |
| Refusal 403 / 404 / 409 | Card, `role="alert"`, sentence only (§6.9). |
| Too many records (413) | Card: `h2` "Too many records for one report"; `<p class="rnr-muted">` the server sentence verbatim: "This workflow has more than 10,000 records you can see, which is more than one report can read. Ask an admin to split the work into separate workflows." No retry (permanent); CSV shows the same sentence. |
| Invalid draft (managers) | Card `rnr-muted`: `Finish the settings to see results. {reason}`. |

### 5.3 `ReportError` sentences (§6.9)

`reportError()` maps by status before display: **403** "You do not have permission to view reports. Ask an admin to give you access."; **404** "This report does not exist. It may have been deleted."; **409** `{server sentence}` plus, for people without `reports.manage`, " Ask a reports manager to fix it."; 401 "Sign in again to continue."; 413 and 500 as the server wrote them. (The plan shows the server's bare "Not allowed." which says nothing to do.)

## 6. Dashboard (`#/dashboard`)

`<section class="flex flex-col gap-4" aria-labelledby="dash-h">`: h1 "Dashboard" and, right-aligned, the toolbar; under it one `rnr-muted` line (DD, explains the shared layout): **"This dashboard is shared by everyone in {org}. Each person sees numbers for the records they can see."** In edit mode the line reads "Layout changes apply to everyone in {org}." Then the sr-only status line (`role="status"`, the plan's), the error block, then one state.

Toolbar: view mode, managers: secondary `Edit layout`. Edit mode: secondary `Add widget` (`PlusIcon`), ghost `Cancel`, primary `Save layout` (busy `Saving…`, `aria-busy`). Entering edit mode **moves focus to the h1** (the pressed button unmounts) and the status line says "Editing layout. Drag a widget by its handle, or use its options menu." Cancel and Save also return focus to the h1.

### 6.1 Grid and widgets

`<ol class="rnr-grid grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4" aria-label="Dashboard widgets">`. Spans (static class strings): Small `""`, Medium `sm:col-span-2`, Full width `sm:col-span-2 lg:col-span-4`. Below `sm` every widget is full width. Nine or more widgets tighten the gap automatically (bundle `.rnr-grid:has`).

**View mode card** (per `design/components/Widget`; no `gap-*` utility, the head supplies the spacing):
```html
<li class="rnr-card {span}">
 <header class="rnr-card-head">
  <h2 class="rnr-card-title">{title}</h2>
  <a class="rnr-btn rnr-btn-ghost ml-auto" href="#/reports/{id}" aria-label="Open report: {title}">Open report</a>
 </header>
 <WidgetBody/>
</li>
```
The accessible name contains the visible words "Open report" (the plan's "Open the report for …" does not, WCAG 2.5.3).

**Number widget:** `<p class="rnr-kpi">1,240</p>` and `<p class="rnr-caption">Records</p>` (for a Sum report the aggregate label, e.g. "Total days"; "No numbers" in the KPI when null). Skipped values: `rnr-caption` with the **same** sentence as elsewhere, "2 values were not numbers and were left out." (the plan words it differently).
**Table widget:** the first 10 rows or groups in a bare table (`ResultTable bare`, `.rnr-table-bare`, **not** a card inside the card); under it `rnr-caption` "Showing 10 of 240 records. " + link "Open the report" (`shownText`). Groups: "Showing the first 10 of 31 groups."
**Chart widgets:** §8. Same link-and-note line.
**States per widget:** loading `Skeleton` 60% × 32; empty "No records to show yet."; error `rnr-error role="alert"` (server sentence, §5.3) + ghost "Try again" for network errors only; a report that is not grouped under a chart: "This report is not grouped, so it cannot be drawn. Group it by a column, or show it as a number or a table."
Each widget runs the report **as the viewer**; a different person sees different numbers (the shared-layout line says so).

### 6.2 Edit mode (README Widget editing state; keyboard and menu paths)

```html
<li class="rnr-card {span}" data-state="editing" data-id="{id}">
 <header class="rnr-card-head">
  <button type="button" class="rnr-handle" data-ctl="handle" aria-label="Drag {title}" {dnd attrs}><GripIcon/></button>
  <h2 class="rnr-card-title">{title}</h2>
  <div class="rnr-menu-anchor ml-auto">
   <button type="button" class="rnr-icon-btn" data-ctl="options" aria-haspopup="menu" aria-expanded aria-label="Options for {title}"><MoreIcon 14/></button>
   <div role="menu" aria-label="Options for {title}" class="rnr-menu rnr-widget-menu">
     <button role="menuitem" class="rnr-menu-item" aria-disabled="true|undefined">Move up</button>
     <button role="menuitem" class="rnr-menu-item">Move down</button>
     <div class="rnr-menu-sep" role="separator"></div>
     <div role="group" aria-label="Width">
       <button role="menuitemradio" aria-checked="true" class="rnr-menu-item">Small</button> … Medium … Full width</div>
     <div class="rnr-menu-sep" role="separator"></div>
     <button role="menuitem" class="rnr-menu-item is-danger">Remove widget</button></div></div>
 </header>
 <div inert><WidgetBody/></div>     <!-- the real body stays visible so width changes are previewed; it is not interactive -->
</li>
```
- Two tab stops per card (handle, options) instead of the plan's five; the menu is the README's menu path (Move up / Move down / Change width). Menu behaviour as Phase 4: roving tabindex, arrows, Home/End, Esc, Tab closes; first/last `Move` items `aria-disabled` (existing rule) and activating them only announces "{title} is already first." / "…last.".
- After a menu action the menu closes and focus returns to that card's **options** button (by `data-id`). Width changes apply to the draft at once.
- **Remove widget** opens `ConfirmDialog`: title `Remove {title}?`, body "The widget leaves the dashboard for everyone straight away, even if you cancel your layout changes. The report is kept.", buttons "Cancel" / danger `Remove widget` (busy `Removing…`). Success: status "{title} removed.", focus to the h1.
- Pointer and keyboard drag (dnd-kit): `PointerSensor` distance 4, `KeyboardSensor` with `sortableKeyboardCoordinates`; Space lifts, arrow keys move, Space drops, Esc cancels. Touch: the handle is the lift (bundle: `touch-action:none`, 44px on coarse pointers).
- **Drag visuals (README): tilt and placeholder** via `DragOverlay`. The overlay renders a presentational copy of the card with `data-state="overlay"` (rotate 1°, `shadow-2xl`, B&W hard 6px offset shadow, flat motion no tilt: already in the bundle); the original slot gets `data-state="placeholder"` (dashed `line-300`, `opacity-placeholder`). The only allowed inline `style` stays dnd-kit's `transform`/`transition` on the sortable `li`s (and none for the overlay itself).
- Mixed spans use `rectSortingStrategy`: dnd-kit's neighbour sliding is approximate when cards differ in width (DD, accepted); the order committed on drop is exact, and the menu path is the reliable one.

**Live announcements** (`accessibility.announcements`, plus the sr-only status line for menu moves):

| Event | Text |
|---|---|
| Instructions | `Press Space to pick up this widget. Use the arrow keys to move it. Press Space to drop it, or Escape to cancel.` |
| Pick up | `Picked up {title}. Position {n} of {total}.` |
| Over | `{title} is over position {n} of {total}.` |
| Drop | `Moved {title} to position {n} of {total}.` (same place: `{title} dropped in position {n} of {total}.`) |
| Cancel | `Moving {title} was cancelled.` |
| Menu move | `Moved {title} to position {n} of {total}.` |
| At the end | `{title} is already first.` / `{title} is already last.` |
| Width | `{title} is now {Small|Medium|Full width}.` |
| Save / add / remove | `Layout saved.` · `{title} added.` · `{title} removed.` |

### 6.3 Add widget dialog

`rnr-dialog`, title "Add widget". Fields: **Report** (select, "Choose a report", grouped ones suffixed " (grouped)"); **Show as** — `<div class="rnr-seg" role="group" aria-label="Show as">` of `aria-pressed` buttons Number · Table · Bar chart · Line chart (the plan's `radiogroup` again); **Title** with `rnr-hint` "Leave empty to use the report name." (not a placeholder); **Width** select. **Default width follows the kind** (DD): Number Small, Bar/Line chart Medium, Table Full width; the person may change it. A chart needs about 240px (§8.3), so under Show as: `rnr-caption` "Charts need a grouped report and fit best at Medium width or wider." Choosing a chart for an ungrouped report fails with the plan's sentence, `aria-invalid` on the Report select, focus there. Primary `Add widget` (busy `Adding…`).
**Adding keeps edit mode**: the new row is appended to the *draft* (the plan drops the whole draft with `setLayout(null)`, silently discarding unsaved reorders), status "{title} added.", focus returns to Add widget. The new widget is already stored, so the draft's id set still matches the database at Save.

### 6.4 Save, cancel, stale layout, unsaved guard

- `Save layout` sends the draft; success → status "Layout saved.", focus h1. Failure shows `rnr-error` in the alert block; the stale sentence "The dashboard changed. Reload to see the latest layout." adds secondary `Reload dashboard` (discards the draft, refetches, focus h1).
- **Unsaved layout is guarded** (the plan has no guard): `useLeaveGuard(dirty, '#/dashboard')` with title "Leave without saving?", body "Your layout changes will be lost." (`dirty` = draft order or spans differ from the stored list). `Cancel` is an explicit discard and needs no confirmation.

### 6.5 States

| State | Spec |
|---|---|
| Loading | `Skeleton` 100% × 160. |
| First run, manager | Card `gap-3`: ghost preview `rnr-card data-state="placeholder"` (title "Leave days by type", `rnr-kpi` 12, caption "Records"); `h2` "Build your dashboard"; `rnr-muted` "Show a saved report as a number, a table or a chart. Everyone in {org} sees the same layout."; primary `Add widget` (enters edit mode and opens the dialog; the toolbar's Edit layout is hidden while there are no widgets). If there are no reports yet, the body says "Create a report first, then add it here." with secondary `Go to reports`. |
| First run, viewer | `h2` "Nothing on the dashboard yet"; `rnr-muted` "Ask a reports manager to add widgets." |
| Error | Card: "We could not load the dashboard. Check your connection and try again." (`role="alert"`) + "Try again". |
| Widgets removed by a report delete | They disappear on the next refetch; no message. |

## 7. Charts (hand-rolled SVG; `design/README` dataviz)

### 7.1 Series, colour, B&W

One series. Fill/stroke **`var(--in)`** (series 1, README); the `out` colour and the B&W `out` hatch **never apply** (nothing in this phase has a second series), so no hatch pattern is defined and none is needed. B&W: `--in` is black (white in dark), so bars stay solid, which is correct; the active-state cue there is the tooltip and the dimming of the others, never colour. Meaning never rests on colour alone: every bar has a value label, the SVG has a text summary and the table alternative holds the same numbers. Negative values sit below the zero line in the same colour and carry the true minus.

### 7.2 Anatomy (`<svg class="rnr-chart" viewBox="0 0 {W} {H}" role="img" aria-labelledby>`)

| Part | Spec |
|---|---|
| Size | `W` = the **measured width of the widget body** (ResizeObserver, no library), `H` 200 (160 when `W` < 320). The plan's fixed `viewBox 480×200` scales text with the card: at a Small widget (about 186px) 11px axis text renders at 4px. SVG geometry uses attributes only, never `style`. |
| Margins | left 48, right 8, top 8, bottom 28 (the plan's `chartGeometry`), left grows to fit the widest tick label (measured by character count × 6.5). |
| Gridlines | `<line class="rnr-chart-grid">` horizontal at every tick, `stroke: var(--chart-grid)`, 1px. No vertical gridlines. |
| Zero line | `rnr-chart-zero`, 1px `var(--ink-muted)` (a baseline is information, so not decorative `line-300`), drawn over the grid. Ticks always include 0 (`niceTicks`). |
| Axis text | `.axis` type (Inter 11/14), `fill: var(--ink-muted)`, tabular numerals via `rnr-num` on **every numeric label** (tick labels, value labels, tooltip numbers). Y labels right-aligned at `left - 6`. |
| X labels | Category text, centred under each band, clipped to 12 characters with "…". When the band is under 56px every k-th label is drawn (k = ceil(56 / band)), always the first and last; the table alternative and tooltip hold the rest. |
| Value labels | `rnr-chart-value` (11/14, 500, `ink`), above positive bars and below negative ones, drawn when the band is at least 36px (so up to about 8 bars at a medium width); otherwise values live in the tooltip and the table. |
| Bars | `rnr-chart-bar`, width 70% of the band, minimum height 1px (a 0 value stays visible as a line, labelled "0", or "No numbers" for a null sum). |
| Line | `rnr-chart-line`: one polyline, 2px `var(--in)`, round joins; points `rnr-chart-dot` r 4 with a 2px `surface-100` ring; a null sum plots at 0 and is labelled "No numbers". |
| Hit areas | One transparent full-band `<rect class="rnr-chart-hit">` per category (hover and tap anywhere in the band). |
| Max | 24 categories. Beyond that the note below the chart: `Showing the first 24 of 31 groups. Open the report to see them all.` |

### 7.3 Interaction

- **Tooltip (DD; the plan's `<title>` children only appear after a long hover and never for keyboard or touch).** An SVG `<g class="rnr-chart-tip" aria-hidden="true">` (`<rect rx="8">` `surface-100` fill, `line-300` stroke; `<text>` caption 12/16 `ink`) with two lines: category and value (`Annual` / `12`, `No numbers` for null). Shown on pointer enter/move over a band and on tap; hidden on leave, outside tap, scroll and Esc. Width is estimated from character count and the box is clamped inside the plot. `pointer-events: none`. It repeats information that is also in the table, so it is `aria-hidden`.
- **Hover dim (README):** with `data-motion="full"` and `(hover: hover)`, the chart root gets `data-hovering` and the hovered mark `data-active`; the other marks fall to `opacity: var(--opacity-dim)`. Flat motion: no dimming and no transition; the tooltip and an outline on the active mark (`stroke: var(--focus-ring)`) still show.
- **Keyboard path:** the marks are not tab stops (24 stops per chart would be hostile). The keyboard and screen-reader path is the **table alternative**, one button away and placed *before* the chart in the DOM order so it is reached first.

### 7.4 Text alternative and the table toggle

- `<title>`: "Bar chart of Leave days by type: Annual 12, Medical 4." (`Line chart of …`; "no numbers" for null sums; clipped at 24 as drawn).
- Constant-label toggle (the plan swaps the label while also setting `aria-pressed`, which double-signals): `<button type="button" class="rnr-btn rnr-btn-ghost self-start" aria-pressed="false">Show as table</button>`, pressed state styled by §12. Pressed replaces the SVG with `<table class="rnr-table rnr-table-bare">` (caption sr-only = title; `th` group label, `th.num` aggregate label; the same points, "No numbers" for null) and keeps the note line. Focus stays on the button.
- Automatic switch (DD): when the measured width is under **240px** the table is shown and the toggle is replaced by `rnr-caption` "Too narrow for a chart, so this is shown as a table." (A Small widget at `lg` is about 186px wide, which is why the Add dialog defaults charts to Medium.)
- Notes under the chart: more-groups sentence (§7.2) and, when any value is a null sum, `rnr-caption` "Groups with no numbers show as 0."

## 8. Mobile (375px) and touch

- Header group and nav per Phase 4; ten nav items wrap. No page-level horizontal scroll anywhere.
- **Dashboard:** every widget full width, one column. Chart width is measured (≈ 303px), so text stays 11px. Tables scroll inside their card; first column sticky below `sm` (`rnr-sticky-first`; bare widget tables keep the same class on the table). Edit mode: the handle is 44px on coarse pointers; the options menu is the primary phone path; the menu opens inside the card (`right: 0`) and never wider than the viewport.
- **Report page:** settings are a closed `<details>` above the results; results and the pager follow. The results card scrolls sideways inside itself; the pager wraps (`flex-wrap`); "Per page" drops to its own row; Download CSV stays reachable (wraps below the totals).
- **PDF template:** preview stacks under the form. **Record page panel:** buttons wrap, each at least 44px tall on coarse pointers (`rnr-btn` rule).
- Dialogs keep the 1rem gutter; the Add widget dialog scrolls inside itself (`rnr-dialog` body). No new bottom sheet.
- Touch targets: every icon-only or repeated button has a specific `aria-label`; `rnr-icon-btn`, `rnr-btn`, `rnr-check`, `rnr-input` and `rnr-menu-item` reach 44px on `(pointer: coarse)`.

## 9. Copy table (every new or changed string)

| Where | String |
|---|---|
| Nav | Dashboard · Reports |
| PDF panel | `PDF` · `No PDF has been made for this record yet.` · `Making the PDF…` · `Made {when}.` · `PDF not made` · `The record stays stopped. A new PDF does not restart it.` · `Times in the PDF are shown in UTC.` · buttons `Generate PDF` · `Generating…` · `Open PDF` (+ sr-only ` (opens in a new tab)`) · `Download PDF` · `Generate new PDF` · `Try again` · `Set up a PDF template` · `This workflow has no PDF template yet, so its records cannot be made into PDFs.` · `This is taking longer than usual. You can leave this page. The PDF appears here when it is ready.` · announcements `PDF requested. It will be ready in a few seconds.` · `The PDF is ready.` · `The PDF could not be made.` · errors `We could not load the PDF for this record. Check your connection and try again.` · `We could not open the PDF. Reload the page and try again.` |
| Timeline | `PDF requested` · `PDF made` · `PDF not made: recorded before reports were available.` · `PDF not made: {message}` |
| Server messages mapped (`friendlyError`) | `This workflow has no PDF template yet. Ask a reports manager to set one up.` (match `/no report template yet/`, as the plan) · `The dashboard changed. Reload to see the latest layout.` · engine stop reason `This path makes a PDF, but the workflow has no PDF template. Ask a reports manager to set one up.` |
| Workflow editor / list | Generate PDF hint: `Makes a PDF of the record from the workflow's PDF template. If there is no template, the record stops. A reports manager sets it up from the Workflows list.` · Workflows row link `PDF template` (aria-label `PDF template for {name}`) |
| PDF template page | `PDF template: {workflow}` · `Back to workflows` · `Back to reports` · intro (§3.1) · `Header` · hint (§3.2) · `{n} of 2,000 characters` · `Keep the header under 2,000 characters.` · `Answers to include` · `Prints the signature image` · `Prints the file name only` · `Prints one line per row` · `This step has no questions.` · `Order in the PDF` · `Move {label} up` / `down` · `{label} moved to position {n} of {total} in {step}.` · `{label} is already first in {step}.` / `last` · `Sign-off` · sign-off caption (§3.2) · `Save template` / `Saving…` / `Saved` · `Template saved.` · `Unsaved changes` · `This template was changed by someone else. Reload to see their changes.` · `Reload template` / `Reloading…` · `This workflow already has a PDF template. Reload to edit it.` (the plan's sentence is ungrammatical) · `This workflow has no steps with a form yet. Add a Start form in the workflow editor first.` · `Open workflow editor` · `We could not load this PDF template. Check your connection and try again.` · `This workflow does not exist` / `It may have been deleted.` · `Leave without saving?` · `Your changes to this PDF template will be lost.` · Preview: `Preview` · `The layout with example text. Real PDFs use the record's answers and print black on white.` · `Preview: {n} answers in {m} steps and {k} sign-offs.` · `Choose answers or a sign-off to see them here.` · `Example record title` · `Example answer` · `Example person` |
| PDF document | `Workflow: {name}` · `Status: {In progress|Done|Rejected|Stopped}` · `Started {when} by {name}` · `Sign-off` · `Submitted|Approved|Rejected by {name} · {when}` · `Not done yet` · `Not answered` · `Not submitted yet` · `This question is no longer on the form.` · `Yes` / `No` · `Former member` · `Generated {when}` · `Page {n} of {total}` · `{org} · {title}` (running head) · PdfProblem sentences as the plan |
| Reports list | `Reports` · `New report` · `Build your first report` · `Count, add up and export the records of a workflow. Build a report here, then show it on the dashboard.` · `No reports yet. Ask a reports manager to create one.` · `Go to inbox` · columns `Name` `Workflow` `Kind` `Updated` · `Table` / `Grouped` · `A workflow you cannot see` · `Open` / `Open {name}` · `Delete` / `Delete {name}` · `Delete {name}?` · confirm bodies (§4) · `Delete report` / `Deleting…` · `{name} deleted.` · `We could not load the reports. Check your connection and try again.` · dialog `New report` · `Name` · `Workflow` · `Choose a workflow` · `There are no workflows yet. Create a workflow before making a report.` · `Go to workflows` · `Cancel` · `Create report` / `Creating…` · `Enter a name for the report.` · `Choose the workflow to report on.` |
| Report page | `Back to reports` · `Records of {workflow} that you can see.` · `Report settings` · `Name` · `Columns` · `Add column` · `Record` · `Answers` · `{label} added as column {n}.` · `{label} removed. {total} columns left.` · `Move {label} up` / `down` · `Remove {label}` · `A report can have 20 columns.` · `Filters` · `Every record is included.` · `Records must match every filter.` · `Filter {n}` · `Add filter` · `Remove filter {n}` · `A report can have 10 filters.` · `Group by` · `No grouping` · `For each group` · `Count records` · `Add up a number` · `Number to add up` · `This workflow's forms have no number fields to add up.` · `Save report` / `Saving…` / `Saved` · `Report saved.` · `Unsaved changes. The results already show them.` · `This report was changed by someone else. Reload to see their changes.` · `Reload report` · `About this report` · `Leave without saving?` · `Your changes to {name} will be lost.` · `This report does not exist` / `It may have been deleted.` |
| Results | totals `{n} record(s)` · `{n} group(s) from {m} record(s)` · `1 value was not a number and was left out.` / `{n} values were not numbers and were left out.` · columns `Records` · `Total {label}` · `Left out` · `No numbers` · `No answer` · `Untitled` · `Open record: {cell}` · tfoot `All groups` · pager `Results pages` · `Previous` · `Next` · `Page {n} of {m}` · `Per page` · `Download CSV` · `Preparing CSV…` · `Saves every row as {filename}, not just this page.` · ` It includes your unsaved changes.` · `Downloaded {filename}.` · `Finish the report settings before downloading.` · `Finish the settings to see results. {reason}` · states `No records to show yet` / `Records of {workflow} that you can see appear here once people start it.` · `No records match these filters` / `Remove or change a filter to see more.` · `Too many records for one report` + the 413 sentence verbatim · `We could not run this report. Try again.` · `You do not have permission to view reports. Ask an admin to give you access.` · `This report does not exist. It may have been deleted.` · ` Ask a reports manager to fix it.` |
| Dashboard | `Dashboard` · shared line (§6) · `Layout changes apply to everyone in {org}.` · `Edit layout` · `Add widget` · `Cancel` · `Save layout` / `Saving…` · `Reload dashboard` · `Editing layout. Drag a widget by its handle, or use its options menu.` · `Drag {title}` · `Options for {title}` · `Move up` · `Move down` · `Width` · `Small` · `Medium` · `Full width` · `Remove widget` · `Remove {title}?` · remove body (§6.2) · `Removing…` · `Open report` / `Open report: {title}` · `Showing {n} of {m} records` · `Showing the first {n} of {m} groups` · `Open the report` · `Records` · `No records to show yet.` · `We could not load this widget.` · `This report is not grouped, so it cannot be drawn. Group it by a column, or show it as a number or a table.` · empty-state strings (§6.5) · dialog `Add widget` · `Report` · `Choose a report` · ` (grouped)` · `Show as` · `Number` · `Table` · `Bar chart` · `Line chart` · `Title` · `Leave empty to use the report name.` · `Charts need a grouped report and fit best at Medium width or wider.` · `Choose a report to show.` · `Charts need a grouped report. Choose a grouped report, or show this one as a number or a table.` · `Adding…` · live-region strings (§6.2) · `The dashboard changed. Reload to see the latest layout.` · `Leave without saving?` / `Your layout changes will be lost.` · `We could not load the dashboard. Check your connection and try again.` |
| Chart | `Bar chart of {title}: {label} {value}, …` · `Line chart of …` · `no numbers` · `Show as table` · `Too narrow for a chart, so this is shown as a table.` · `Groups with no numbers show as 0.` · `Showing the first 24 of {m} groups.` · tooltip `{label}` / `{value}` |

## 10. Accessibility summary

| Area | Rule |
|---|---|
| Focus after actions | Generate/Try again → stays on the button. Report delete → h1. Dashboard Edit layout / Cancel / Save / Remove widget → h1. Menu move/width → that card's options button. Keyboard drag drop → the handle. Column / filter / answer Move → same control by `data-key`; Remove → neighbouring Remove, next Field select or the Add control. Add column → the Add column button. Add widget → the Add widget button. Reload (conflict, stale) → h1. Pager press → stays. |
| Live regions | Always-mounted `role="status"`: the PDF panel's single sr-only region (transitions only), the status lines on every page, the report totals announcer (changed definitions only), the pager's page text, the dashboard line plus dnd-kit's own announcer. Alerts only for failures. The chart and tooltip announce nothing; the table alternative is the path. |
| Keyboard drag | Handle focusable; Space lift, arrows move, Space drop, Esc cancel; instructions via `screenReaderInstructions`; menu path equivalent for every move and width change. |
| Menus | Widget options and Add column are true ARIA menus (roving tabindex, arrows, Home/End, Esc, Tab closes, `aria-expanded`); width uses `menuitemradio`. |
| Names | Label in name for every repeated or icon-only control (`Open report: {title}`, `Delete {name}`, `Move {label} up`); new-tab link says so; tooltips are never the only carrier of a value. |
| Colour | Status = icon + word; data = value labels + table + text summary; the single series colour never carries meaning alone; `danger` only on `rnr-error` text and danger buttons. |
| Tables | Caption (sr-only), `th scope`, row headers styled as body text (§12), `tfoot` totals, sticky first column below `sm`, right-aligned numbers incl. headers. |
| Forms | Visible labels (incl. "Number to add up"), `aria-invalid` + `aria-describedby`, focus to the first invalid field, never `disabled` on submit, `aria-busy` + `rnr-spin` while working, `aria-disabled` (styled) where an action is unavailable. |
| Motion | Only `rnr-spin`, `rnr-pop`, drag tilt (full motion only), hover dimming (full motion only). `flat` and `prefers-reduced-motion` need no extra rules beyond §12's `[data-motion]` guards. |
| Targets | 44px on coarse pointers for every control; icons stay 14 to 20px. |
| 375px | No page-level horizontal scroll; tables and the pager's row scroll or wrap inside their card; chart text stays 11px (measured width, table under 240px). |
| Documents | The PDF is untagged (known pdf-lib limit); text is real, selectable and in reading order; the record page always offers the same facts on screen. |

## 11. DD summary (where the system or the plan was silent)

Naming "PDF template" · PDF panel placement, one-primary rule, queued and rendering as one state, slow-queue sentence, download name · PDF running head, split footer, widow/orphan control, signature baseline, muted placeholders, true minus · template order grouped by step, sign-off in workflow order, preview as an example layout · Add column menu · settings as a phone `details` · numeric header alignment, `tfoot` total, Left out column, bare table in widgets · "All groups" wording · toolbar and focus rules for edit mode, options menu in place of five controls, `DragOverlay` for tilt and placeholder, mixed-span sorting accepted, default width per widget kind, guard for unsaved layouts, Add widget keeping the draft · SVG tooltip, value labels, label thinning, 240px chart minimum, measured width, zero line in `ink-muted`, no hatch, table-first keyboard path · shared-layout sentence.

## 12. `src/index.css` additions (tokens only)

(The plan's "designer §9 / §11" is this section.) Already present and reused: `rnr-table-card`, `rnr-card-open`, `rnr-sticky-first`, `rnr-menu--wide`, `rnr-caption`, `rnr-check`, `rnr-menu-item[aria-disabled]`, `rnr-icon-btn[aria-disabled]`, `.rnr-table tbody tr:focus-visible`.

```css
/* Phase 5: PDF template, reports, dashboard, charts (design/phase-5-screens.md §12). */
.rnr-btn[aria-disabled="true"] { opacity: var(--opacity-disabled); cursor: not-allowed; }       /* pager and unavailable actions; never disabled="" */
.rnr-btn-ghost[aria-pressed="true"] { background: var(--surface-200); color: var(--ink); }      /* Show as table */

/* Results and lists. */
.rnr-table tbody th[scope="row"] { font-size: 14px; line-height: 20px; font-weight: 400; color: var(--ink); border-bottom: 1px solid var(--line-100); }
.rnr-table tfoot th, .rnr-table tfoot td { border-top: 1px solid var(--line-200); border-bottom: 0; font-size: 14px; line-height: 20px; font-weight: 600; color: var(--ink); }
.rnr-results th, .rnr-results td { min-width: 96px; }                                          /* DataTable README: never squeeze under 96px */
.rnr-cell { max-width: 24rem; overflow-wrap: anywhere; }
.rnr-table-bare { overflow-x: auto; }                                                          /* a table inside a widget: not a card inside a card */
.rnr-pager { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.rnr-pager select { width: auto; }
.rnr-pager-size { display: flex; align-items: center; gap: var(--space-2); margin-left: auto; color: var(--ink-label); }

/* Builder and template editor. */
.rnr-filter { display: grid; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--line-200); border-radius: var(--radius-xl); }
.rnr-order { display: grid; gap: var(--space-1); margin: 0; padding: 0; list-style: none; }
.rnr-order li { display: flex; align-items: center; gap: var(--space-1); min-height: var(--rnr-control-h); }
.rnr-order-label { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.rnr-paper { display: grid; gap: var(--space-2); padding: var(--space-5); border: 1px solid var(--line-200); border-radius: var(--radius-lg); background: var(--surface-100); color: var(--ink); }
.rnr-paper-header { white-space: pre-wrap; overflow-wrap: anywhere; }
.rnr-paper-label { font-size: 12px; line-height: 16px; font-weight: 600; color: var(--ink-muted); }
.rnr-paper-rule { margin: 0; border: 0; border-top: 1px solid var(--line-200); }
.rnr-paper-sig { width: 120px; height: 48px; border-bottom: 1px solid var(--line-300); }

/* Dashboard. */
.rnr-menu-anchor { position: relative; }
.rnr-menu.rnr-widget-menu { position: absolute; z-index: 20; top: calc(100% + var(--space-1)); right: 0; }
.rnr-drag-overlay > .rnr-card { height: 100%; }

/* Chart (single series, --in; geometry in SVG attributes). */
.rnr-chart-wrap { min-width: 0; }
.rnr-chart { display: block; width: 100%; height: auto; }
.rnr-chart-grid { stroke: var(--chart-grid); stroke-width: 1; }
.rnr-chart-zero { stroke: var(--ink-muted); stroke-width: 1; }
.rnr-chart-axis { fill: var(--ink-muted); font: 400 11px/14px var(--font-sans); }
.rnr-chart-value { fill: var(--ink); font: 500 11px/14px var(--font-sans); }
.rnr-chart-bar { fill: var(--in); }
.rnr-chart-line { fill: none; stroke: var(--in); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.rnr-chart-dot { fill: var(--in); stroke: var(--surface-100); stroke-width: 2; }
.rnr-chart-hit { fill: transparent; }
.rnr-chart-bar[data-active], .rnr-chart-dot[data-active] { stroke: var(--focus-ring); stroke-width: 2; }
.rnr-chart-tip { pointer-events: none; }
.rnr-chart-tip rect { fill: var(--surface-100); stroke: var(--line-300); }
.rnr-chart-tip text { fill: var(--ink); font: 400 12px/16px var(--font-sans); }
.rnr-chart-bar, .rnr-chart-dot { transition: opacity var(--rnr-t); }
@media (hover: hover) {
  [data-motion="full"] .rnr-chart[data-hovering] :is(.rnr-chart-bar, .rnr-chart-dot):not([data-active]) { opacity: var(--opacity-dim); }
}
```
Notes: all colours are `in`, `ink`, `ink-muted`, `surface-100`, `surface-200`, `line-100/200/300`, `chart-grid`, `focus-ring`; B&W needs no override (series `--in` flips to black/white, borders go hard through the tokens). The `[data-motion="full"]` guard is the only motion switch (`flat` and reduced motion simply never match). `.rnr-paper` follows the theme tokens by design (§3.3). Allowed inline `style`: dnd-kit's `transform`/`transition` on the sortable `li`s only; widget spans are `col-span` classes; chart geometry is SVG attributes.

## 13. Conflicts with Tasks 3, 5, 8, 9 and 10 and the corrections

| # | Plan code | Problem | Correction |
|---|---|---|---|
| 1 | T3/T5 footer `Generated … · Page n of N`, no running head | A loose page 2 cannot be matched to its record | §3.4: split footer (left generated, right page), running head on pages 2+; update the footer test |
| 2 | T3 `layoutPdf` signature item: `need(label + one line)` then `image()` runs its own `need` | The label can end one page and its signature start the next | One `need(label + SIG.height + 6 + baseline)` before a signature item |
| 3 | T3 signature drawn with no baseline | Floats on the page | Add a `rule` op 2pt under the image, 180pt wide |
| 4 | T3 placeholders ("Not answered", "Not submitted yet", "This question is no longer on the form.") print as ordinary values | Indistinguishable from an answer typed with those words | `PdfItem` text gets `placeholder?: true`; layout draws it muted |
| 5 | T3 `answerText` `NUM.format(-3)` → ASCII hyphen | README: true minus | Replace a leading `-` with U+2212 for number/calculated (Inter has the glyph) |
| 6 | T3 `need(9*LEAD + 10.5*LEAD)` for any item | A long answer can leave one line at the page foot | Keep the label with at least two value lines (§3.4) |
| 7 | T3 group rows with no spacing | A wrapped row reads as two rows | 2pt gap between rows |
| 8 | T8 UI calls it "report template" (editor h1, link, hint, SidePanel hint, `friendlyError`, T4 engine stop reason) | Clashes with the Reports module | "PDF template" in every string (§1, §9); the SQL exception text and regex stay; the engine's stop reason is changed |
| 9 | T8 `PdfPanel` renders the button only `!queued` | Pressing it unmounts the focused button on the next render | Keep one stable button, busy while queued (§2) |
| 10 | T8 queued line has `aria-live` and a separate `role="status"` caption | Two regions for one change; conditional live region may not announce | One always-mounted sr-only region, transitions only |
| 11 | T8 "Requesting…", "Make a new PDF" | Verb changes mid-flow | "Generating…", "Generate new PDF" |
| 12 | T8 only "Open PDF" | The brief asks for download; save-as of an inline URL gives the object name | Add "Download PDF" with a filename (`usePdfUrl(path, downloadName)`); pass `recordTitle` |
| 13 | T8 two secondary buttons, no primary | Main action unclear | Exactly one primary per state (§2) |
| 14 | T8 `target="_blank"` link with no hint | Surprise new tab for screen readers | sr-only " (opens in a new tab)" |
| 15 | T8 no UTC note | PDF times are UTC, the page shows local | Caption "Times in the PDF are shown in UTC." |
| 16 | T8 Try again on a stopped open record | Reads as if it restarts the record; `request_record_pdf` does not | Caption "The record stays stopped…" (needs `recordStatus`) |
| 17 | T8 timeline: failed PDF is a `kind:'error'` event with `detail.type:'generate_pdf'`, shown as "Stopped: …" | False for a closed record | `PDF not made: {message}` for that event (§2) |
| 18 | Plan decision 7 says a 60-second signed URL; T8 code uses 300 s with refresh | Plan disagrees with itself | Not visual; keep the code (5 minutes, refreshed), correct decision 7's text |
| 19 | T8 template back link: no icon; always `#/workflows` | A reports-only manager is bounced to the inbox by `guardHash` | `BackIcon`; `Back to reports` for people without `workflows.manage` |
| 20 | T8 header textarea `maxLength={2000}` plus a >2000 check | The browser silently cuts a paste, so the check never fires | No `maxLength`; counter from 1,800; save error over 2,000 |
| 21 | T8 flat "Order in the PDF" list with cross-step moves | Interleaved steps print repeated headings | Grouped by step, moves within a step, saved array normalised to workflow order |
| 22 | T8 sign-off appended in click order | PDF order depends on tick order | Store in workflow order |
| 23 | T8 has no preview | The brief and Task 7 require one | `TemplatePreview.tsx` (§3.3); add to the file list |
| 24 | T8 Move up/down: no refocus, no announcement | Re-parented node loses focus | `data-key` refocus and status text (§3.2) |
| 25 | T8 caption "…for example your school's name…" | The PDF already prints the organisation name above the title | New hint (§3.2) |
| 26 | T9 `ReportsPage` name as `<a>` in `th scope="row"` + trash icon button | Row header styled as a column header; differs from Forms/Workflows | Plain name, `Open` secondary, `Delete` danger text button (§4); row-header CSS fix (§12) |
| 27 | T9 "Last updated" with `When`; delete title/notice with curly quotes | Lists use "Updated" + day; Phase 3/4 use `Delete {name}?` | `Day`; no quotation marks |
| 28 | T9 delete body shows "Records are not changed." while widgets still load | States a count of 0 it does not know | Generic widget sentence while unknown (§4) |
| 29 | T9 first-run card has no primary; header "New report" always; no `N` | README: first run has one primary | §4 |
| 30 | T9 `NewReportDialog`: no `data-autofocus`, no empty-workflows case | Focus lands on the close button | §4 |
| 31 | T9 `ResultTable` is a `rnr-card` | Card inside a widget card | `bare` prop → `.rnr-table-bare` |
| 32 | T9 headers never right-aligned, cells are | Misaligned numeric columns | Numeric column detection (§5.2) |
| 33 | T9 `cellText`: date-only strings print raw ISO; negatives print ASCII `-` (the test pins `'-3'`) | README: dates as formatted, true minus | Date-only branch (UTC parts); U+2212; change the `cellText` test |
| 34 | T9 `totalsText` folds the skipped sentence into the totals line | A data-quality warning hides in a headline | Own line + "Left out" column; split `totalsText` / `skippedText` and update its tests |
| 35 | T9 totals `role="status"` and pager `aria-live` | Every page change is read twice | One announcer for changed definitions (§5.2) |
| 36 | T9 no grand total although `grandTotal` is returned | "Totals" requirement | `tfoot` (§5.2) |
| 37 | T9 pager: `aria-disabled` has no style, select is 100% wide, page can exceed the count, no busy cue | Unreadable controls | §12 classes, clamp, spinner |
| 38 | T9/T10 `rnr-seg` `role="radiogroup"` on plain buttons | No roving tabindex or arrow keys (Phase 3 #31) | `role="group"` + `aria-pressed` (Report "For each group", Add widget "Show as") |
| 39 | T9 Add column `<select>` acts on `change` | Arrow keys add columns | Add column menu (§5.1) |
| 40 | T9 Remove / Move: no refocus or announcement | Focus to `<body>` | `data-key` refocus, status text |
| 41 | T9 filters unboxed; Add/Remove lose focus | Hard to scan, focus loss | `.rnr-filter`, focus rules |
| 42 | T9 Sum select `aria-label` only; "Add up a number" silently does nothing with no numbers | Invisible label; dead button | Visible label; `aria-disabled` + `aria-describedby` |
| 43 | T9 subtitle never links the workflow, though T8 relies on it | A reports manager has no route to the PDF template | Link for `reports.manage` (§5) |
| 44 | T9 Download CSV: silent return when the draft is invalid; no filename; no unsaved note | Dead button | §5.2 |
| 45 | T9/T6 `ReportError` shows "Not allowed."; 409 for viewers asks nothing | README: say what to do | §5.3 sentences |
| 46 | T9 empty states: bare `<p>` | README forbids bare empty states | §5.2 cards with headings |
| 47 | T9 settings panel is a tall form above the results at 375px | Results a screen and a half down | `details` below `lg` (§5.1) |
| 48 | T10 `viewBox 0 0 480 200` scaled by the card | 11px text becomes 4 to 7px | Measured width, `H` 200/160, table under 240px (§7.2) |
| 49 | T10 `<title>` children as tooltips | Slow, no keyboard or touch | SVG tooltip group (§7.3) |
| 50 | T10 no value labels; all x labels drawn | Colour/position alone; overlap at 24 bars | Value labels and label thinning |
| 51 | T10 "Show as table"/"Show as chart" with `aria-pressed` | Label swap plus pressed state double-signals | Constant "Show as table" + `aria-pressed` (§7.4) |
| 52 | T10 gridlines/zero line unnamed colours | Tokens only | `--chart-grid`, zero line `--ink-muted` (§12) |
| 53 | T10 DownloadIcon path (T9) differs from the Icon set; `ChartIcon` unused | "Copied verbatim", no second set | §1 paths; drop `ChartIcon` |
| 54 | T10 widget head hand-rolled (`label rnr-muted`, `gap-3`) | `rnr-card-head/-title` are the Widget component | §6.1 |
| 55 | T10 `aria-label="Open the report for …"` | Visible words not in the name | `Open report: {title}` |
| 56 | T10 edit card hides the body; five controls per card | Widget README keeps the body; menu path is a menu | §6.2 (handle + options menu, inert body) |
| 57 | T10 `data-state="overlay"` on the `li` with dnd-kit's inline `transform` | Tilt never shows; no placeholder | `DragOverlay` + `placeholder` (§6.2) |
| 58 | T10 Edit layout button unmounts on click | Focus lost | Focus h1 (§6) |
| 59 | T10 no leave guard for a dirty layout | QA-P2-4 class | §6.4 |
| 60 | T10 `onAdded` → `setLayout(null)` | Silently discards unsaved reorders | Append to the draft (§6.3) |
| 61 | T10 Remove is immediate in a draft that Cancel can discard | Surprise | Confirm body says so; copy without quotes |
| 62 | T10 Add dialog: placeholder as the hint; default width Small for all; chart error without focus | Faint hint; a Small chart is unreadable | §6.3 |
| 63 | T10 first-run: prose telling people to find Edit layout | README: one primary action | §6.5 |
| 64 | T10 no statement of the shared layout | Brief asks for it explained | Shared line (§6) |
| 65 | T10 number widget skipped copy differs from the report page | Same fact, two sentences | One sentence (`skippedText`) |
| 66 | T1 `save_dashboard_layout` compares only the id set | Two tabs reordering never conflict, so Task 10 Step 9 item 5 ("The dashboard changed…") cannot pass; last write silently wins | Not visual, flagged: either the RPC also compares the base order/spans (e.g. a `p_base` or an `updated_at` token) or the QA step is dropped |
| 67 | T10 `rectSortingStrategy` with mixed spans | Neighbour sliding is approximate | Accepted (§6.2); the committed order is exact |
| 68 | T8 says "designer §9", the file list says "designer §11" | Sections mismatch | The CSS list is §12 of this file |
