# Phase 3 screens: implementation spec

Sources: `design/README.md`, `tokens.css`, `components/bundle.css` + component READMEs/previews (Canvas, Widget, DataTable, Dialog, Menu, Segmented, Badge, Icon, Button, Field), `phase-1-screens.md` and `phase-2-screens.md` (their §0 sections, the dialog/sheet rules and every `src/index.css` addition still apply), Phase 3 plan Tasks 6–10 and Global Constraints, and the shipped `src/ui/*` (ConfirmDialog, useAction, useNotice, Skeleton, errors, icons). Tailwind utilities are for **layout only** (flex, grid, gap, max-w, sr-only); colour, type, radius and controls come from `rnr-*` classes and tokens. "DD" = design decision (design system silent; most conservative option). Where this file differs from Tasks 7–10, this file wins (§11 lists every difference).

Selectors verified in `bundle.css`: `rnr-card(-head|-title)`, `rnr-canvas`, `rnr-block`, `rnr-drop`, `rnr-handle`, `rnr-icon-btn`, `rnr-btn(-primary|-secondary|-ghost|-danger)`, `rnr-field`, `rnr-label`, `rnr-hint`, `rnr-input`, `rnr-error`, `rnr-error-text`, `rnr-status`, `rnr-chip`, `rnr-kbd`, `rnr-seg`, `rnr-dialog(-head|-body)`, `rnr-table` (+ `.num`), `rnr-skeleton`, `rnr-spin`, `rnr-pop`, `rnr-muted`, `rnr-num`, `rnr-focus`; type classes `page-title`, `dialog-title`, `label`. From `src/index.css`: `rnr-check`, `rnr-caption`, `rnr-readout`, `rnr-pick`, `rnr-sheet`, `rnr-sticky-first`, `.rnr-block[data-selected]`, `.rnr-block[data-dragging]`. **Not in the bundle** (so do not use): `rnr-btn-sm`, a menu component (CSS only), a tab bar, a toast, a stepper, a timeline, an alert/warning icon, a clock icon in the Icon README (the app's `ClockIcon` exists from Phase 2).

**Layer trap (affects every table card):** `bundle.css` is unlayered; Tailwind utilities are in a layer, so **unlayered CSS wins**. `rnr-card p-0` keeps the card's 20px padding. Use `style="padding:0;overflow-x:auto"` (Phase 2 §1), never `p-0`.

## 0. Global additions

| Item | Spec |
|---|---|
| Nav | Order (DD, daily work first, set-up last): **Inbox, Records, Forms, Workflows, Members, Roles**. Inbox and Records for every member; Workflows only with `workflows.manage`; Roles as before. `aria-current="page"` and `rnr-btn-secondary` on: Inbox for `inbox`, `start`, `task`; Records for `records`, `record`; Forms for the four form routes; Workflows for `workflows`, `workflow-edit`, `workflow-access` (`route.page.startsWith('workflow')`). The nav gets `flex-wrap` (six items at 375px). No count badge on Inbox (a number in a pill is a coloured badge; the page itself lists the tasks). |
| Landing page | DD: the default hash and the wordmark link become `#/inbox` (was `#/members`). Inbox is the daily page; Members is admin set-up. |
| Page widths | All lists, the editor, record page: `max-w-5xl` (the `<main>`). Workflow editor uses the full 1024px. Start page, task page: `max-w-2xl`, left-aligned. Access page: `max-w-3xl` (DD). |
| Back link | Every sub-page starts with `<a class="rnr-btn rnr-btn-ghost self-start" href="…"><BackIcon/>Back to …</a>` above the h1 (`WorkflowGate` and `TaskPage` already do; also Record page, Access page, Start page). Targets: editor/access → Workflows; start/task → Inbox; record → Records. Access page has a second link "Edit workflow". |
| One h1, one primary | Workflows: "Workflows", primary "New workflow". Editor: h1 "Edit workflow"; primary = Publish workflow (draft, with `workflows.publish`) / Save draft (draft, without it) / Save changes (published). Access: h1 "Workflow access", no primary. Inbox: no primary. Start: "Start record". Task: Submit / Approve (one primary) or "Claim this task". Records list: none (the first-run state's "Go to inbox"). Record page: none. Every `h1` has `tabIndex={-1}` for programmatic focus. |
| Status = grey icon + word | `rnr-status` (14px grey icon, `ink-label` word). Never a coloured pill, never a chip. Icons (DD, the Icon set has no clock/alert/stop; add `StopIcon` and `RightIcon` to `src/ui/icons.tsx`, 24 grid, same `base` props): |

| Status | Icon | Word |
|---|---|---|
| Workflow draft | `PencilIcon` | Draft |
| Workflow published | `CheckIcon` | Published |
| Record open | `ClockIcon` | In progress |
| Record done | `CheckIcon` | Done |
| Record rejected | `XIcon` | Rejected |
| Record error | `StopIcon` (`<rect x="6" y="6" width="12" height="12" rx="2"/>`) | Stopped |
| Task overdue | `ClockIcon` | Overdue |
| Unsaved edits | `PencilIcon` | Unsaved changes |
| Pending action (timeline) | `ClockIcon` | Not sent yet / Not made yet |

A record's free-text label follows the word: `In progress · Awaiting HR`. Implement once as `RecordStatusMark({ status, label })` in `src/records/timeline.ts`'s neighbour (`StatusMark.tsx`), used by the list, the record page and the task header. `RightIcon` = `m9 18 6-6-6-6`; used only in the Steps list ("goes to").
| Dates | Dates `toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'})` ("11 Oct 2026"); date and time `toLocaleString('en-GB', {dateStyle:'medium', timeStyle:'short'})` ("11 Oct 2026, 14:30"). Wrap in `<time dateTime={iso}>`. Right-aligned in tables via `class="num"`. |
| Status line | Reuse Phase 2: `<p class="rnr-status" role="status">` stays mounted; text swaps; clears after 5s (`useNotice`). |
| Segmented as filter / view toggle | A **view toggle** uses `<div class="rnr-seg" role="group" aria-label="…">` with `<button aria-pressed>` (Segmented README), not `radiogroup` (that needs roving tabindex and arrows). Add to `src/index.css` (DD, inactive label on the track is 4.4:1): `.rnr-seg button[aria-pressed="false"] { color: var(--ink-label); }`. |
| Pending actions | `send_message` and `generate_pdf` are stored but not carried out. Everywhere they appear the copy is honest: "Not sent yet. Available when Communication ships." / "Not made yet. Available when Reports ship." (panel, timeline, issues). |

## 1. Workflows list (`#/workflows`)

**Layout:** like Forms (`phase-2-screens.md` §1): `<section class="flex flex-col gap-4" aria-labelledby="wf-h">`; header row `flex flex-wrap items-center gap-3` (h1 `page-title`, then "New workflow" `ml-auto` primary), live status line, page alert, then one state. `N` (no modifier, focus not in a field, no dialog open) creates a workflow; show `<kbd class="rnr-kbd" aria-hidden="true">N</kbd>` inside the button (DD, same as Forms).

```html
<div class="rnr-card" style="padding:0;overflow-x:auto">
 <table class="rnr-table rnr-sticky-first"><caption class="sr-only">Workflows in {org}</caption>
  <thead><tr><th scope="col">Name</th><th scope="col">Status</th><th scope="col" class="num">Updated</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
  <tbody><tr>
   <td>{name}</td>
   <td><span class="rnr-status"><svg 14/>Published</span></td>
   <td class="num"><time>11 Oct 2026</time></td>
   <td><div class="flex justify-end gap-1 whitespace-nowrap">
     <a class="rnr-btn rnr-btn-secondary" href="…/edit" aria-label="Edit {name}">Edit</a>
     <a class="rnr-btn rnr-btn-ghost" href="…/access" aria-label="Access for {name}">Access</a>
     <button class="rnr-btn rnr-btn-danger" aria-label="Delete {name}">Delete</button>
   </div></td></tr></tbody></table></div>
```
Name is plain text (not a link), like Forms. Sorted by name. Below `sm` the card scrolls sideways with the name column sticky; actions never wrap.

| State | Spec |
|---|---|
| Loading | Three `rnr-skeleton` rows in `Skeleton` (`role="status"`); header and "New workflow" render at once. |
| First run | `<div class="rnr-card gap-3">`: ghost preview `<div class="rnr-card" data-state="placeholder" aria-hidden="true">` ("Leave approval", muted "5 steps · Draft"); `<h2 class="dialog-title">Build your first workflow</h2>`; `<p class="rnr-muted">Chain your forms into steps, approvals and timers. Members start it from their Inbox once you publish it.</p>`; the one primary "New workflow" (header button hidden meanwhile). |
| Error | Card: "We could not load the workflows. Check your connection and try again." (`role="alert"`) + secondary "Try again". |
| No results / filtered out | Not applicable (no search or filter). |
| Creating | Primary `aria-busy`, `rnr-spin`, "Creating…". Failure: `rnr-error role="alert"` under the header. |

**Delete confirmation** (`ConfirmDialog`, Cancel autofocused): title `Delete {name}?`; body `{name} will be deleted for everyone and cannot be recovered. A workflow that already has records cannot be deleted.`; buttons "Cancel" / danger "Delete workflow" (busy "Deleting…"). **Blocked:** dialog stays open with `rnr-error role="alert"`: `This workflow has records, so it cannot be deleted. Keep it, or rename it so people know it is no longer used.` RLS 0 rows: "You do not have permission to do that." Success: status line `{name} deleted.`, focus to h1.

## 2. Workflow editor (`#/workflows/:id/edit`)

### 2.1 Layout

```
Back to workflows
Edit workflow                                                          (h1)
┌ save bar (rnr-card) ─────────────────────────────────────────────────┐
│ [Workflow name ____________]  Draft   Unsaved changes   Access  [Save draft] [Publish workflow] │
│ alert / status / conflict / caption                                   │
└───────────────────────────────────────────────────────────────────────┘
┌ issues (rnr-card) ───────────────────────────────────────────────────┐   "2 issues to fix before publishing" + list
┌ Add a step (rnr-card): five blocks in a row ─────────────────────────┐
┌ board card ───────────────────────────────┐ ┌ panel (320px, lg+) ────┐
│ [Map | List]  Skip the map                 │ │ {Type} step settings    │
│ .rnr-canvas board  ≥ 480px                 │ │ …                       │
└────────────────────────────────────────────┘ └─────────────────────────┘
```
- DD, replaces the plan's 3-column grid (`176px / 1fr / 320px` leaves the board 448px wide inside 976px): palette is a **strip above the board** (`grid gap-2 sm:grid-cols-2 md:grid-cols-5`), the grid below is `lg:grid-cols-[minmax(0,1fr)_320px]`, giving the board about 640px. Gap `space-4`.
- Panel at `lg`+: right column, `lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto` with `tabIndex={0}` `role="region"` `aria-labelledby="sp-h"` (a scrollable region must be focusable). Below `lg`: **bottom sheet** (`dialog.rnr-dialog.rnr-sheet`, Phase 2 §0): opens when a step becomes selected, title `{Type} step`, close icon button "Close dialog", footer `rnr-btn-secondary` "Done". Esc/Done closes it and focus returns to the card (map) or its row (list). Edits apply to the unsaved graph at once; "Done" does not save.
- Issues card sits above the board (DD: next to the Publish button it blocks), always mounted (focus target), `max-height: 11rem; overflow-y: auto` with `tabIndex={0}` `role="region"` `aria-labelledby`.

### 2.2 Save bar

| Part | Spec |
|---|---|
| Name | `rnr-field flex-1 min-w-[240px]`, label "Workflow name", `required`, `maxLength=120`. Blank on save: `aria-invalid`, `aria-describedby`, `rnr-error` "Enter a name for this workflow.", focus to the field (Phase 2 pattern). |
| Status | `rnr-status` Draft / Published (§0). Beside it, when dirty only, `rnr-status` "Unsaved changes" (pencil). |
| Access | `rnr-btn rnr-btn-ghost` "Access" to `#/workflows/:id/access`. Navigating with unsaved edits asks first (guard). |
| Buttons | **Draft:** secondary "Save draft" + primary "Publish workflow" (needs `workflows.publish`; without it, "Save draft" is the primary and the caption below shows). **Published:** primary "Save changes" only. Never `disabled`. Busy: `aria-busy`, `rnr-spin`, "Saving…" (publish: "Publishing…"). Saved: `CheckIcon` + "Saved" for 1.6s (`rnr-pop`), plus the status line below. |
| Status line | `role="status"`: draft saved `Draft saved.` (with issues: `Draft saved. {n} issues still to fix before publishing.`); published `Workflow published. People with access can start it from their Inbox.`; changes `Changes saved.` |
| Captions (`rnr-caption`) | Published and dirty: `This workflow is published. Saved changes apply to records already in progress.` Draft without publish right: `You can save drafts. Someone with the Publish workflows permission can publish this one.` |
| Errors (`rnr-error role="alert"`) | Publish with issues: `Fix the {n} issues listed below before publishing.` (singular: `Fix the issue listed below before publishing.`), focus moves to the issues card. Server sentences (conflict, open-record step, check failed) are shown as sent. Network: `We could not save this workflow. Try again.` |
| Conflict | Alert text from the function ("This workflow was changed by someone else. Reload to see their changes.") then a secondary **"Reload workflow"** button and the caption `Reloading discards your unsaved changes.` After reload: focus the h1 and status line `Workflow reloaded.` The graph is not auto-merged (DD). |
| Unsaved guard | `beforeunload` + hash/sign-out/org-switch guard via `ConfirmDialog`: title `Leave without saving?`, body `Your changes to {name} will be lost.`, "Cancel" (autofocus) / danger "Leave without saving". |

### 2.3 Palette ("Add a step")

`<section aria-labelledby="pal-h" class="rnr-card gap-3"><div class="rnr-card-head"><h2 id="pal-h" class="rnr-card-title">Add a step</h2></div><ul class="grid gap-2 sm:grid-cols-2 md:grid-cols-5">` with one `<li><button type="button" draggable class="rnr-block rnr-focus w-full text-left" aria-label="Add {Type} step"><svg plus/><span><span class="label block">{Type}</span><span class="rnr-caption block">{hint}</span></span></button></li>`. **Do not** add `rnr-pick` (it strips the block's border/background and its `> *` rule forces `nowrap`, clipping the hint).

| Block | Hint |
|---|---|
| Start | The form that starts a record |
| Form | Someone fills in or approves a form |
| Condition | Branch on an answer |
| Time | Wait, then continue |
| End | Close the record |

- Icon: all `plus` (DD, as Phase 2: no per-type glyphs in the set). Blocks are 44px+ high.
- Click, Enter, Space: adds the step at the board centre (snapped to 16px). If a card already sits within 16px, nudge by +32px,+32px until free (DD; otherwise repeated adds stack invisibly). The step is selected; focus goes to the panel heading (`lg`+) or the sheet opens (below `lg`). Announce `{Type} step added. {n} steps in total.`
- Drag a block onto the board (mouse/pen) adds at the drop point.
- Start: there is exactly one. If one exists, activating "Start" selects it and announces `A workflow has one Start step. Selected it.` instead of adding a second.
- Below `md` the strip collapses to a full-width secondary button `<PlusIcon/>Add a step` (`aria-haspopup="dialog"`) opening the one-column list in a `rnr-sheet` titled "Add a step" (Phase 2 §2.2).

### 2.4 Board, map and list

**View toggle** (the accessible alternative, §2.9): inside the board card header, `<div class="rnr-seg" role="group" aria-label="View"><button aria-pressed>Map</button><button aria-pressed>List</button></div>`. Default Map at `md`+, List below `md`. Remembered per browser (`localStorage` in try/catch). Only the chosen view is mounted. A "Skip the map" link (`sr-only focus:not-sr-only`) follows the toggle and moves focus to the panel (or the issues card when nothing is selected).

**Map** (`.rnr-canvas.wf-board`):
- Container height `clamp(480px, 70dvh, 720px)` set with `style`, **not** `min-h` (ReactFlow needs a definite parent height, `min-h` gives it zero). `.wf-board { padding: 0; overflow: hidden; background-image: none; }` (the dot grid comes from `<Background>`, so panning moves it).
- `<ReactFlow … snapToGrid snapGrid={[16,16]} deleteKeyCode={null} selectionKeyCode={null} multiSelectionKeyCode={null} edgesFocusable={false} proOptions={{ hideAttribution: false }} defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: 'currentColor' } }} fitView>` with `<Background gap={16} size={1} />` and `<Controls showInteractive={false} />` (zoom in/out/fit; each button has xyflow's `aria-label`). **No MiniMap.** Edge markers go through `defaultEdgeOptions` so `toFlow`'s edge shape stays as the test expects.
- Below `md` the map is **read-only** (DD): `nodesDraggable={false} nodesConnectable={false}`; pan, zoom and select still work; selecting opens the sheet. Caption under the board: `Switch to List to add, connect or move steps on a phone.`
- Edge labels: outcome word, plus ` · n action(s)` (as `toFlow`).

**List** (phone editor and screen-reader alternative; reuses `canvasOps`, `SidePanel` and the palette, no new graph logic):

```html
<ol aria-label="Steps" class="flex flex-col gap-2">
 <li class="rnr-block" data-selected="false">
  <button type="button" class="rnr-pick rnr-focus" aria-pressed="false" aria-describedby="…">
   <span class="rnr-caption block">Form</span>
   <span class="label block">Manager approval</span>
   <span class="rnr-caption block"><RightIcon 14/> Approved: Wait a day</span>
   <span class="rnr-caption block"><RightIcon 14/> Rejected: Not connected</span>
   <span class="rnr-error block">2 issues</span>   <!-- only if any -->
   <span class="rnr-caption block">3 records on this step</span>
  </button></li>
```
- Order: follow the path from Start (depth-first, outcome order), then unreachable steps under a sub-heading `<h3 class="label">Not connected to Start</h3>`. Selecting a row selects the step and opens the panel (`lg`+ in the right column, below `lg` as the sheet).
- Empty: `<div class="rnr-drop">No steps yet. Add a Start step to begin.</div>`.

### 2.5 Card anatomy (`NodeCard`)

```html
<div class="rnr-block wf-card" data-selected data-issue data-current data-readonly>
  <Handle type="target" position="left" aria-hidden="true"/>           <!-- not on Start -->
  <span class="rnr-caption">Form</span>                                <!-- type; + " · Current step" on the record map -->
  <span class="label">Manager approval</span>                         <!-- nodeName, wraps, overflow-wrap:anywhere -->
  <span class="rnr-caption">Closes as rejected</span>                 <!-- End only -->
  <span class="rnr-caption">3 records on this step</span>             <!-- only if > 0 -->
  <span class="rnr-error">2 issues</span>                              <!-- only if > 0 -->
  <ul class="wf-outs"><li class="wf-out"><span class="rnr-caption">Approved</span><Handle id="approved" type="source" position="right" aria-hidden="true"/></li>…</ul>
</div>
```
- One labelled source handle per outcome: the outcome word is the label (visible text beside the handle); the handle itself is `aria-hidden` (decorative; the keyboard/screen-reader connect path is the panel's "Goes to").
- Size: `width: 208px`. Padding `space-3`, column gap `space-1`. Radius `radius-xl` (from `.rnr-block`).

| State | Look (never colour alone) |
|---|---|
| Rest | `.rnr-block`: `line-200` border (`rnr-card-border`), `shadow-xs`. |
| Hover | `.rnr-block:hover` (already `shadow-sm` + `line-300`). |
| Selected | `data-selected="true"` (existing Phase 2 rule: `focus-ring` border + 1px ring); also the panel heading names it. |
| Keyboard focus | xyflow puts `tabindex` on the node wrapper: `.react-flow__node:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; border-radius: var(--radius-xl); }`. |
| Dragging | `.react-flow__node.dragging .wf-card { box-shadow: var(--shadow-2xl); border-color: var(--line-300); }`; `[data-theme^="bw"]` hard `6px 6px 0 0 var(--ink)`. No tilt. |
| Issues | text "n issue(s)" in `rnr-error` (danger text) plus `border-color: var(--danger)`. In B&W the word still carries it. |
| Records on step | caption "n records on this step" (counts open **and stopped** records). |
| Current step (record map) | `data-current="true"`: `border-color: var(--ink); box-shadow: 0 0 0 2px var(--ink)` plus the words "Current step" in the type caption. |
| Read-only | `data-readonly="true"`: handles `pointer-events: none`. |

- Handle chrome: `.wf-card .react-flow__handle { width: 12px; height: 12px; }` with a 28px hit area (`::after { content:''; position:absolute; inset:-8px }`). Handles sit **on the card border**: `.wf-out { position: relative; text-align: right; min-height: 28px; display:flex; align-items:center; justify-content:flex-end; margin-right: calc(-1 * var(--space-3)); padding-right: var(--space-3); }` and `.wf-card .react-flow__handle-right { right: -6px; }`, `.react-flow__handle-left { left: -6px; }`. (The plan's `.wf-out` kept the handle 12px inside the card.)
- Node accessible name (`toFlow` → `ariaLabel`): `Form step: Manager approval. 2 issues. 3 records on this step.` (omit the parts that are zero).

### 2.6 xyflow chrome overrides (add to `src/index.css`, tokens only)

Prefer xyflow's own variables on the container; the selector fallbacks cover anything the installed `style.css` does not expose (verify names against `node_modules/@xyflow/react/dist/style.css`).

```css
/* Phase 3: workflow board */
.wf-board { padding: 0; overflow: hidden; background-image: none; }
.wf-board .react-flow {
  --xy-background-color: transparent;
  --xy-edge-stroke: var(--ink-muted);
  --xy-edge-stroke-selected: var(--ink);
  --xy-edge-stroke-width: 1.5;
  --xy-edge-label-color: var(--ink-label);
  --xy-edge-label-background-color: var(--surface-100);
  --xy-handle-background-color: var(--surface-100);
  --xy-handle-border-color: var(--ink-label);
  --xy-controls-button-background-color: var(--surface-100);
  --xy-controls-button-background-color-hover: var(--surface-200);
  --xy-controls-button-color: var(--ink-label);
  --xy-controls-button-border-color: var(--line-200);
  --xy-attribution-background-color: transparent;
  color: var(--ink-muted);                       /* markerEnd colour:'currentColor' */
  font-family: var(--font-sans);
}
.wf-board .react-flow__background-pattern { fill: var(--chart-grid); stroke: none; }
.wf-board .react-flow__edge-text { font-size: 12px; fill: var(--ink-label); }
.wf-board .react-flow__edge-textbg { fill: var(--surface-100); stroke: var(--line-200); }
.wf-board .react-flow__connection-path { stroke: var(--focus-ring); stroke-width: 1.5; }
.wf-board .react-flow__handle { border-radius: var(--radius-full); background: var(--surface-100); border: 2px solid var(--ink-label); }
.wf-board .react-flow__handle.connectionindicator:hover, .wf-board .react-flow__handle.connectingfrom { border-color: var(--focus-ring); }
.wf-board .react-flow__controls { box-shadow: var(--shadow-xs); border: 1px solid var(--line-200); border-radius: var(--radius-lg); overflow: hidden; }
.wf-board .react-flow__controls-button { background: var(--surface-100); color: var(--ink-label); border-bottom: 1px solid var(--line-100); min-width: 28px; min-height: 28px; }
.wf-board .react-flow__controls-button:hover { background: var(--surface-200); }
.wf-board .react-flow__controls-button svg { fill: currentColor; }
.wf-board .react-flow__attribution { background: transparent; font-size: 12px; }
.wf-board .react-flow__attribution a { color: var(--ink-muted); }
.wf-board .react-flow__node:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; border-radius: var(--radius-xl); }
.wf-board .react-flow__node.dragging .wf-card { box-shadow: var(--shadow-2xl); border-color: var(--line-300); }
[data-theme^="bw"] .wf-board .react-flow__node.dragging .wf-card { box-shadow: 6px 6px 0 0 var(--ink); }
@media (pointer: coarse) { .wf-board .react-flow__controls-button { min-width: var(--touch-min); min-height: var(--touch-min); } }
.wf-board--readonly { /* record page */ }
@media (pointer: coarse) { .wf-board--readonly { pointer-events: none; } }  /* a static picture on touch: page scroll is never trapped */

.wf-card { width: 208px; flex-direction: column; align-items: stretch; gap: var(--space-1); padding: var(--space-3); overflow-wrap: anywhere; }
.wf-card[data-issue="true"] { border-color: var(--danger); }
.wf-card[data-current="true"] { border-color: var(--ink); box-shadow: 0 0 0 2px var(--ink); }
.wf-card[data-readonly="true"] .react-flow__handle { pointer-events: none; }
.wf-outs { display: flex; flex-direction: column; gap: var(--space-1); margin: var(--space-2) 0 0; padding: 0; list-style: none; }
.wf-out { position: relative; display: flex; align-items: center; justify-content: flex-end; min-height: 28px; margin-right: calc(-1 * var(--space-3)); padding-right: var(--space-3); }
.wf-card .react-flow__handle { width: 12px; height: 12px; }
.wf-card .react-flow__handle::after { content: ''; position: absolute; inset: -8px; }
.wf-card .react-flow__handle-right { right: -6px; }
.wf-card .react-flow__handle-left { left: -6px; }
.rnr-seg button[aria-pressed="false"] { color: var(--ink-label); }
```
Motion: edges and cards have no transitions of their own; `data-motion="flat"` needs nothing extra. xyflow zoom/pan animations (`fitView duration`) are 0 (Show) or 200ms max and skipped when `prefers-reduced-motion` (pass `duration: 0` when `matchMedia('(prefers-reduced-motion: reduce)')` or `[data-motion="flat"]`).

### 2.7 Side panel (`SidePanel`)

Container: `<section class="rnr-card gap-4" aria-labelledby="sp-h">` (the plan's `div aria-labelledby` has no role). Heading `<h2 id="sp-h" tabIndex={-1} class="dialog-title">{Type} step</h2>` with `<p class="rnr-caption">{name}</p>` under it (DD: `rnr-card-title` is a muted truncating widget title, not a panel heading).

| Block | Controls and copy |
|---|---|
| All | `Step name` (`DraftInput`), hint `Shown on the card and on the record's timeline.` |
| Start | Select **Form to start with** (placeholder option "Choose a form…"), hint `People fill this in to start a record.` |
| Form | **Form** select. **What they do**: "Fill in the form" / "Approve or reject"; hint for approve: `They see earlier answers, then choose Approve or Reject. Add a comments field to the form if they should explain a rejection.` **Who completes it**: "Anyone with a role" / "A person" / "Whoever submitted an earlier step". Then **Role** (hint `Someone with this role claims the task, then completes it.`) / **Person** / **Earlier step**. **Due** fieldset: Amount + Unit, hint `Leave empty for no due time.` |
| Condition | The Phase 2 `RuleEditor` (visible labels, value control by target type). Hint above: `Looks at answers from the forms this workflow uses.` Empty scope: `Choose a form on the Start or a Form step first.` |
| Time | **Continue**: "After a wait" / "Before or after a date answer". Wait: Amount + Unit. Date mode: **Date answer**, **How long**, **When** ("Before the date" / "After the date"). Hint: `Waiting steps check once a minute, so a wait can run up to a minute late.` |
| End | **Close the record as**: "Done" / "Rejected". |

**Outcomes.** For each outcome a `<fieldset class="rnr-field gap-2" id="out-{outcome}">` with `<legend class="rnr-label">When approved</legend>` (`When submitted`, `When rejected`, `If yes`, `If no`, `Next`):
- **Goes to** select: "Not connected" + every non-Start step as `Name (Type)`. This is the keyboard/screen-reader way to connect, and the way to connect on a phone. Changing it connects or replaces the connection (actions are kept) and announces `{Outcome} of {step} now goes to {target}.` / `{Outcome} of {step} is not connected.`
- **Actions** (only when connected): heading `<h3 class="label">Actions</h3>`, caption `Actions run in the order you add them. Send message and Generate PDF are recorded on the timeline but not carried out yet: available when Communication and Reports ship.`
  - Each action is `<div class="rnr-block flex-col items-stretch gap-2">`: title `label` ("Set status", "Send message", "Generate PDF"), `rnr-btn rnr-btn-ghost` "Remove" with `aria-label="Remove {title} action"`, and for Set status the `Status text` input (hint `Shown next to the record's status.`), for the other two the caption `Not active yet. Available when Communication ships.` / `Not active yet. Available when Reports ship.`
  - **Adding is two steps, not a select that fires on change** (a closed select changes on every ArrowDown, so keyboard users would add an action per key press): `<div class="flex items-end gap-2">` a select **Action to add** (options "Choose an action…", "Set status", "Send message (not active yet)", "Generate PDF (not active yet)") and a secondary button **"Add action"**. Empty choice on click: inline `rnr-error` "Choose an action to add." After adding: announce `{Title} action added.` and focus the new action's first control (the Status text input, or its Remove button).
- Clicking an **edge** on the map selects its source step and focuses that outcome's fieldset legend (DD).

**Delete.** `open === 0`: `<button class="rnr-btn rnr-btn-danger" aria-label="Delete {name}">Delete step</button>` (opens `ConfirmDialog`: title `Delete {name}?`, body `Its connections are removed too. Save the workflow to apply the change.`, "Cancel" / danger "Delete step"). `open > 0`: **no button**; `<p class="rnr-caption" id="del-hint">{n} {record is|records are} on this step, including any that stopped, so it cannot be deleted. Let {it|them} finish first.</p>`. After deleting: announce `{name} deleted. {n} steps left.`, focus the board card's heading (the "View" toggle) or the Steps list heading.

### 2.8 Issues card

```html
<section id="wf-issues" class="rnr-card gap-2" tabindex="0" role="region" aria-labelledby="iss-h" style="max-height:11rem;overflow-y:auto">
 <h2 id="iss-h" class="dialog-title">2 issues to fix before publishing</h2>
 <ul class="flex flex-col gap-2"><li class="flex items-start gap-2"><span class="flex-1">Connect the "Rejected" outcome of "Manager approval".</span>
   <button class="rnr-btn rnr-btn-ghost" type="button" aria-label="Show Manager approval">Show</button></li></ul></section>
```
- Zero issues: heading `Ready to publish` (draft) / `No issues` (published). Singular: `1 issue to fix before publishing`.
- The same issues are pinned on cards ("n issues") and in the list rows.
- **Show**: selects the step, centres it (`fitView({ nodes:[{id}], maxZoom:1, duration:0 })` in Map; scrolls the row into view in List), and focuses the card/row. Announce `Showing {name}: {first issue}`. Issues with no step (for example "Add a Start step.") have no Show button.
- Issues are static text; no `role="alert"` (they change on every edit).

### 2.9 Keyboard path and announcements

The Map is for pointer users; the **List + panel path is the complete keyboard/screen-reader alternative** (add, select, connect, set actions, delete, issues, all without xyflow). The Map is also operable by keyboard for what xyflow supports natively (select, move).

| Task | Keys |
|---|---|
| Reach the editor | Tab: save bar, issues card, palette, view toggle, "Skip the map", then the cards in node order, then the panel. "Skip the map" jumps past all cards. |
| Add a step | Tab to a palette block, Enter or Space. Focus lands on the panel heading (`lg`+) or in the sheet. |
| Select a step | Tab to the card (or its row in List), Enter or Space. |
| Move a step (Map) | With the card selected and focused, Arrow keys move it one 16px grid step (Shift: four). |
| Connect | Select the step, then the panel: **Goes to** select under the outcome. Dragging handles is a pointer shortcut only. |
| Configure | The panel, in reading order. |
| Delete | Panel "Delete step" then the dialog (Delete/Backspace on a card does nothing: `deleteKeyCode={null}`). |
| Fix an issue | Issues card, "Show". |
| Save | Tab to the primary in the save bar. (No global shortcut: DD, `⌘S` is hijackable and the pattern is not used elsewhere.) |

Announcements (one `<p class="sr-only" role="status" aria-live="polite">` mounted in the editor, text replaced per event):

| Event | Text |
|---|---|
| Step added | `{Type} step added. {n} steps in total.` |
| Second Start | `A workflow has one Start step. Selected it.` |
| Step selected from the list or Show | `Showing {name}. {n} issues.` (omit when 0) |
| Moved (xyflow's own live region, localised) | If `ariaLabelConfig` exists in the installed version: `'node.a11yDescription.ariaLiveMessage': ({ direction }) => \`Moved ${direction}.\``, `'node.a11yDescription.default': 'Press Enter or Space to select this step. With it selected, press the arrow keys to move it.'`, `'node.a11yDescription.keyboardDisabled': ''`. Otherwise keep the defaults. |
| Connected | `{Outcome} of {step} now goes to {target}.` |
| Disconnected | `{Outcome} of {step} is not connected.` |
| Action added / removed | `{Title} action added.` / `{Title} action removed.` |
| Step deleted | `{name} deleted. {n} steps left.` |
| Saved / published | (the save bar status line is its own live region) |

## 3. Access tab (`#/workflows/:id/access`)

```
Back to workflows
Workflow access                                  (h1)   {workflow name} (rnr-muted)    Edit workflow (ghost link)
caption, alert, status
┌ rnr-card (padding 0, overflow-x auto) ─────────────────────────────┐
│ Role            Can start        Can view all records               │
│ Owner           Always           Always                             │
│ Member          [ ]              [ ]                                │
└─────────────────────────────────────────────────────────────────────┘
```
- Table: `<caption class="sr-only">Workflow access for {name}</caption>`, `th scope="col"` / `scope="row"` on the role name, `rnr-sticky-first`. Checkbox cells: `<label class="rnr-check"><input type="checkbox"><span class="sr-only">Can start for {role}</span></label>`; the cell content is left-aligned under its header (not `num`). Owner row text `Always` (`rnr-muted`).
- Caption above (`rnr-caption`): `A role also needs Start records or View all records on the Roles page before these take effect. Everyone always sees the records they started, submitted to or have a task on.`
- **Saves per toggle, optimistically** (cheap and reversible, design/README): flip the checkbox at once with `setQueryData`; on error roll back and show the alert. A second toggle while another is in flight is allowed (queue per role+key), never silently ignored. Success: `Access for {role} saved.` (status line, 5s). Error: `We could not save access for {role}. Try again.` (`rnr-error role="alert"`; RLS 0 rows: "You do not have permission to do that."). Focus stays on the checkbox.
- States: loading `Skeleton` card (h 160); error card "We could not load access for this workflow. Check your connection and try again." + "Try again"; no custom roles: the table shows only the Owner row and the caption `Add roles on the Roles page to control who can start this workflow.`

## 4. Inbox (`#/inbox`)

`<section class="flex flex-col gap-6" aria-labelledby="inbox-h">`, h1 "Inbox", two sections each `<section aria-labelledby>` (the plan's `div aria-labelledby` has no role) with `<h2 class="dialog-title">`: **My tasks**, **Start new**.

**My tasks table** (card `padding:0`, caption "Your open tasks", `rnr-sticky-first`):

| Column | Content |
|---|---|
| Record | `<span class="label">{title}</span><br><span class="rnr-caption">{workflow name}</span>` |
| Step | `{step name}`; second line `rnr-caption`: `Not claimed yet` (role task, no claimant) / `Claimed by you` / `Claimed by {email}` |
| Due (`num`) | `<time>` or `<span class="rnr-muted">No due date</span>`; **below it, on its own line,** `<div class="rnr-status justify-end"><ClockIcon 14/>Overdue</div>` when `due_at < now` (the plan puts it inline after the date, which misaligns right-aligned cells) |
| Action | Mine: `<a id="open-{id}" class="rnr-btn rnr-btn-secondary" aria-label="Open {title}">Open</a>`. Role task I can claim: `<button class="rnr-btn rnr-btn-secondary" aria-label="Claim {title}">Claim</button>`. Claimed by someone else: no button, the Step caption says who. |

- Order: oldest first (DD).
- Claim: only the pressed row shows busy (`aria-busy`, `rnr-spin`, "Claiming…"); other rows' buttons stay live (the plan sets `aria-busy` on all of them). Success: status line `You claimed {title}.`, the row's button becomes Open, focus moves to it. Failure: alert from `friendlyError`; the list refetches; if the row disappeared, focus goes to the h1.
- Tasks empty: `<div class="rnr-card gap-2"><h3 class="dialog-title">Nothing to do</h3><p class="rnr-muted">When a step needs you, or a role you hold, it appears here. You can start a workflow below.</p></div>`. Error: "We could not load your tasks. Check your connection and try again." + "Try again". Loading: two skeleton rows.

**Start new:** `<ul class="grid gap-3 sm:grid-cols-2">`; each `<li class="rnr-card gap-2"><span class="label">{name}</span><div><a class="rnr-btn rnr-btn-secondary" href="#/start/{id}" aria-label="Start {name}">Start</a></div></li>`. Empty: h3 "No workflows to start", `When a workflow manager publishes a workflow you have access to, it appears here.` Error and loading as above.

## 5. Start page (`#/start/:id`)

Back link "Back to inbox"; h1 = workflow name; `<p class="rnr-muted">Fill in this form to start a record.</p>`; required note as Phase 2; the form in `rnr-card gap-4` via `FormRunner`.
- Primary: **"Start record"**, busy **"Starting…"** (DD; the plan's "Submit form" names the wrong object). `FormRunner` gains `submitLabel?: { idle: string; busy: string }`.
- Field and page errors: Phase 2 §6 unchanged (page alert "Some answers need fixing…", first invalid focused). Server error: `rnr-error role="alert"` above the buttons.
- Guards, each a card with a next step: not published `This workflow is not published yet.` + (with `workflows.manage`) "Open in editor" / (without) `Ask a workflow manager to publish it.`; setup problem `This workflow has a setup problem. Ask a workflow manager to fix it.`; **no access** (new, the plan never checks; also check `useStartable` contains the id) h2 `You cannot start this workflow`, `Ask a workflow manager to give your role access.`
- **Success** (focus target is the heading): by the status `advance` returns (plan loses it; `SubmitResult` ok must carry `status`):

| Status | Heading | Body | Actions |
|---|---|---|---|
| open | Record started | `Your answers were saved and {workflow} has moved to its next step.` | primary "View record", ghost "Back to inbox" |
| done / rejected | Record started and closed | `Your answers were saved and the record is already {done|rejected}.` | same |
| error | Saved, but the record stopped | `Your answers were saved, but the workflow stopped at a later step: {reason}. Ask a workflow manager to fix it, then start a new record.` (reason from `useRecord(id).error`; skeleton line while loading) | primary "View record", ghost "Back to inbox" |

The success check mark is `rnr-pop` + `CheckIcon 24` for open/closed; for error use `StopIcon 24` (no pop).

## 6. Task view (`#/tasks/:id`)

Back link "Back to inbox". Header: h1 = record title; `<p class="rnr-muted">{workflow} · {step}{ · Due 12 Oct 2026, 14:30}</p>`; when overdue a `rnr-status` "Overdue" line beneath.

**Earlier steps** (`<section aria-labelledby="earlier-h">`, h2 `dialog-title` "Earlier steps"), a list of `li.rnr-card > details`, oldest first, newest last. DD: the **newest earlier step is `open`**, the rest closed (the approver's job is reading the latest request). Summary: `<span class="label">{step}</span> <span class="rnr-muted">· {who} {submitted|approved|rejected} · {when}</span>`. Body renders `AnswerList` only while open (file links are signed on open: render lazily on toggle, like Submissions' `Row`; the plan renders them into closed `<details>`, signing every file at mount). Everything here is read-only text (`dl`).

**My form** (card, `<h2 class="dialog-title" id="mine-h" tabIndex={-1}>`): "Your decision" (approve mode) or "Your answers" (fill mode).
- Fill: one primary **"Submit form"** (busy "Submitting…").
- Approve: **"Approve"** `rnr-btn-primary` (busy "Approving…") and **"Reject"** `rnr-btn-secondary` (busy "Rejecting…"); Approve first. **Reject is not `rnr-btn-danger`**: it is a decision, not a deletion (Button README reserves danger for Remove/Delete/Suspend). Full width and stacked on phones (Approve on top), side by side from `sm`. No confirm dialog and **no required reason** (DD: the engine takes `outcome` and `answers` only; a rejection reason belongs in a comments field the workflow manager adds to the approval form, see the Form step hint). Only the pressed button is busy; the other stays live and a second press is ignored.
- Required fields are validated for both outcomes (a required "Comments" field is required to reject too).

| State | Spec |
|---|---|
| Role task, not claimed | Card: `Anyone with this role can do this step. Claim it so others know you are on it.` + primary "Claim this task" (busy "Claiming…"); error as alert. After success: the form mounts and **focus moves to `#mine-h`** (the Claim button unmounts). |
| Claimed by someone else | Card: `{email} has claimed this task.` + secondary "Back to inbox". No Claim button (the plan would show it and fail on press). |
| Assigned to someone else | Card: `This task is assigned to someone else. Only they can complete it.` |
| Done | Card: `This task is already done.` + secondary "View record". |
| Cancelled | Card: `This task was cancelled because the record moved on.` + "View record". |
| Setup problem | `rnr-error role="alert"`: `This step has a setup problem. Ask a workflow manager to fix it.` |
| Submit conflict | The form stays; alert `This task is already done. Go back to your inbox to see what is next.` (copy lives in the function; see §11). |
| Success | Heading **"Step completed"**, body by returned status as §5 (`{title} has moved on.` / `has closed as {done|rejected}.` / error variant `…stopped at a later step: {reason}`), primary "View record", ghost "Back to inbox". Focus on the heading. |
| Not found | Notice card (plan): "This task does not exist" / "It may be finished and no longer visible to you, or it belongs to another organisation." |

## 7. Records list (`#/records`)

`<section aria-labelledby="records-h">`, h1 "Records". Under it: the filter and a live count.

- Filter: `<div class="rnr-seg" role="group" aria-label="Show records">` buttons **All · In progress · Stopped · Closed** with `aria-pressed` (the plan's `radiogroup` has no roving tabindex or arrow keys). Words match the status words (the brief's "Open" is "In progress" here). Closed = Done + Rejected.
- Count line: `<p class="rnr-caption" role="status">{n} records</p>` (`1 record`); at the limit `Showing the newest 200 records.`
- Keep the previous list visible while a new filter loads (`placeholderData: keepPreviousData`), table `aria-busy`.

| Column | Content |
|---|---|
| Record | `<a href="#/records/{id}">{title}</a><br><span class="rnr-caption">{workflow}</span>` |
| Status | `RecordStatusMark` (icon + word + ` · label`) |
| Step | current step name, or `Finished at {name}` for closed (`rnr-muted` prefix) |
| Started by | email / "You" / "Former member" (DD, useful for `records.view_all`) |
| Started (`num`) | date |

Table in a `padding:0` card, caption "Records", `rnr-sticky-first`.

| State | Spec |
|---|---|
| Loading | Two skeleton rows. |
| First run (All, none) | Card with ghost preview ("Leave approval · Jo Tan", `data-state="placeholder"`), h2 `dialog-title` "No records yet", `Records appear here when you start a workflow or a step needs you.`, primary "Go to inbox". |
| Filtered out | h2 "No records match this filter", `Show every record you can view.`, secondary **"Show all records"** (resets the filter and moves focus to the table/h1). |
| Error | "We could not load the records. Check your connection and try again." + "Try again". |

## 8. Record page (`#/records/:id`)

Back link "Back to records". Order: header, status, (stopped alert), map card, timeline card.

- **Header:** h1 title; `<p class="rnr-muted">{workflow} · started <time>11 Oct 2026, 14:30</time> by {who}</p>`; below it `RecordStatusMark`.
- **Stopped alert** (`status === 'error'`): `<div class="rnr-card gap-2" role="alert"><h2 class="dialog-title">This record stopped</h2><p>{reason}</p><p class="rnr-muted">Nothing after this step has run. Ask a workflow manager to fix the workflow, then start a new record.</p></div>` (retry arrives in Phase 5; the copy does not promise it).
- **Map card:** `<h2 class="rnr-card-title">Current step: {name}</h2>` (closed: `Finished at: {name}`; this text is the equivalent of the map, so the map is never the only source) then `MiniCanvas`: `.rnr-canvas.wf-board.wf-board--readonly`, height `clamp(240px, 40dvh, 360px)` set inline, `role="img"` with `aria-label="Workflow map. Current step: {name}."`, `nodesDraggable/Connectable/Focusable/elementsSelectable={false}`, `zoomOnScroll={false}`, `preventScrolling={false}`, `fitView`, no Controls, current card `data-current`. Pointer devices can pan; on `(pointer: coarse)` it is a static picture (`pointer-events:none`).
- **Timeline card:** `<h2 class="dialog-title" id="timeline-h">Timeline</h2>` then `<ol class="flex flex-col">`, oldest first. Item: `<li class="flex gap-3 py-3 border-t border-line-100 first:border-t-0">` with a 14px icon slot (grey, `aria-hidden`; empty spacer when none), then `<div><p class="label">{sentence}</p><p class="rnr-caption"><time>…</time></p></div>` (sentence and time on separate lines; the plan runs them together with " ·" and wraps badly at 375px).
  - Icons: waiting / task / pending action → `ClockIcon`; error → `StopIcon`; closed → `CheckIcon` (done) / `XIcon` (rejected); others none.
  - Items that carry a submission get `<details class="mt-2"><summary class="rnr-focus" style="cursor:pointer">Show answers</summary>{AnswerList, rendered only while open}</details>`.
  - **Pending actions are shown honestly:** `<p class="rnr-status"><ClockIcon 14/>Not sent yet</p>` / `Not made yet` followed by the caption `Available when Communication ships.` / `Available when Reports ship.`
- States: skeleton rows while loading; `We could not load the timeline. Reload the page to try again.` (`role="alert"`); record not found / not visible: notice card "This record does not exist" / "You may not have access to it, or it belongs to another organisation." No polling (react-query refetches on window focus); a record waiting on a timer updates when the person returns to the tab (DD).

**Event sentences** (`eventText`, replaces the plan's; British English, no emoji; `who` = "You", an email, "Former member" or `null` = "Someone"):

| Kind | Sentence |
|---|---|
| started | `{who} started the record` |
| submitted | `{who} submitted {step}` / `approved {step}` / `rejected {step}` |
| claimed | `{who} claimed {step}` |
| task | `Waiting for {step}` |
| condition | `Checked “{step}”: Yes` / `No` (the plan's `More than 2 days?: Yes` doubles the punctuation) |
| waiting | `Waiting until 12 Oct 2026, 12:00` |
| resumed | `Finished waiting at {step}` |
| skipped | `A timer on {step} was skipped because the record had moved on` |
| action set_status | `Status set to “{label}”` |
| action send_message | `Message not sent yet. Available when Communication ships.` |
| action generate_pdf | `PDF not made yet. Available when Reports ship.` |
| error | `Stopped: {message}` |
| closed | `Closed as done` / `Closed as rejected` |
| other | `The workflow recorded a step` |

## 9. Copy table (every new string)

British English, sentence case, verb-first buttons, -ing while busy, errors say what to do.

| Where | String |
|---|---|
| Nav | Inbox · Records · Forms · Workflows · Members · Roles |
| Workflows | "Workflows" · "New workflow" / "Creating…" · "Build your first workflow" · "Chain your forms into steps, approvals and timers. Members start it from their Inbox once you publish it." · Edit · Access · Delete · "Delete {name}?" · "Delete workflow" / "Deleting…" · "{name} deleted." |
| Editor bar | "Edit workflow" · "Workflow name" · "Enter a name for this workflow." · Draft · Published · "Unsaved changes" · "Save draft" · "Publish workflow" · "Save changes" · "Saving…" · "Publishing…" · "Saved" · "Draft saved." · "Workflow published. People with access can start it from their Inbox." · "Changes saved." · "Reload workflow" · "Reloading discards your unsaved changes." · "Workflow reloaded." |
| Editor misc | "Add a step" · "View" · Map · List · "Skip the map" · "Steps" · "Not connected to Start" · "No steps yet. Add a Start step to begin." · "Select a step to set it up, or add one from Add a step." · "Switch to List to add, connect or move steps on a phone." · "{n} issues to fix before publishing" · "Ready to publish" · "No issues" · Show · "Done" · "Leave without saving?" |
| Panel | "Step name" · "Form to start with" · "What they do" · "Fill in the form" · "Approve or reject" · "Who completes it" · "Anyone with a role" · "A person" · "Whoever submitted an earlier step" · Role · Person · "Earlier step" · Due · Amount · Unit · Continue · "After a wait" · "Before or after a date answer" · Wait · "Date answer" · "How long" · When · "Close the record as" · "When approved" · "Goes to" · "Not connected" · Actions · "Action to add" · "Choose an action…" · "Add action" · "Choose an action to add." · Remove · "Delete step" |
| Panel hints | See §2.7 verbatim. |
| Access | "Workflow access" · "Can start" · "Can view all records" · Always · caption §3 · "Access for {role} saved." · "We could not save access for {role}. Try again." |
| Inbox | "Inbox" · "My tasks" · "Nothing to do" · "Start new" · "No workflows to start" · Open · Claim · "Claiming…" · "Not claimed yet" · "Claimed by you" · "Claimed by {email}" · Overdue · "No due date" · "You claimed {title}." · Start |
| Start / task | "Start record" / "Starting…" · "Fill in this form to start a record." · "You cannot start this workflow" · "Ask a workflow manager to give your role access." · "Record started" · "Earlier steps" · "Your decision" · "Your answers" · Approve / "Approving…" · Reject / "Rejecting…" · "Claim this task" · "Step completed" · "View record" · "Back to inbox" |
| Records | "Records" · All · "In progress" · Stopped · Closed · "{n} records" · "No records yet" · "No records match this filter" · "Show all records" · "Go to inbox" · "This record stopped" · Timeline · "Show answers" · "Current step: {name}" · "Finished at: {name}" · "Back to records" |

## 10. Accessibility summary

| Area | Spec |
|---|---|
| Canvas alternative | The List view plus the panel does everything the Map does except spatial position; it is the default below `md`, one toggle away elsewhere, and "Skip the map" jumps past every card. |
| Map semantics | Cards are xyflow focusable nodes with a computed `aria-label` (type, name, issues, records). Handles and edges are not in the tab order (`aria-hidden` handles, `edgesFocusable={false}`); connections are read and set in the panel and shown in List rows ("Approved: Wait a day"). |
| Live regions | One editor-level polite `role="status"` plus xyflow's live region for moves; the save bar, Access and Inbox keep their own mounted `role="status"` lines. Errors are `role="alert"` once, never per keystroke (issues are not alerts). |
| Focus | Add step → panel heading/sheet; Show → the card/row; delete step → editor heading; claim (Inbox) → Open link; claim (Task) → `#mine-h`; submit/start → success heading; delete workflow → h1; filter reset → table. No path leaves focus on `<body>`. |
| Colour | Status is icon + word everywhere. Issues = word + border; current step = word + ink ring; selected = ring + panel heading. Presets only recolour `brand-solid`. |
| Touch | Buttons and checkboxes reach `touch-min` (44px) on coarse pointers (`rnr-btn`, `rnr-check`, controls buttons); handle hit area 28px (connect by touch is via "Goes to"). |
| 375px | Nav wraps; save bar wraps; palette becomes one button + sheet; board card scrolls inside itself; tables scroll inside their cards with a sticky first column; panel is a bottom sheet; Approve/Reject stack; no page-level horizontal scroll, no `min-width` over 327px (the 208px card is inside the board's own pan area). |
| Motion | `rnr-pop` only on saved/success; no tilt; `fitView` duration 0 under flat motion or reduced motion; `[data-motion="flat"]` needs no extra rule for xyflow. |
| Dialogs | Native `<dialog>` via `ConfirmDialog` and `rnr-sheet`; Esc closes; Cancel/Done first-focus for destructive confirms. |

## 11. Conflicts with Tasks 7–10 and the corrections

| # | Plan code | Conflict | Correction |
|---|---|---|---|
| 1 | Task 7/9: `rnr-card p-0 overflow-x-auto` on every table card (list, access, inbox, records) | Unlayered `.rnr-card` padding beats Tailwind's layered `p-0`; card keeps 20px padding around the table | `style="padding:0;overflow-x:auto"` (Phase 2 §1) |
| 2 | Tables have no `<caption>`, `th` without `scope`, identical "Access"/"Delete"/"Claim"/"Open" names on every row | Phase 1 #21, Phase 2 #13 | Caption, `scope`, `aria-label` with the record/workflow name |
| 3 | Workflows: Access/Delete `rnr-btn-ghost`, name is a link, no Edit button | Button README: Delete is `rnr-btn-danger`; list needs Edit | §1 markup |
| 4 | Workflows first run: card without ghost preview; no `N` shortcut; delete body "People can no longer start it…" | design/README empty states + shortcuts; Phase 2 #15, #16 | §1 |
| 5 | Nav: Inbox first, Records after; landing and wordmark stay `#/members`; Workflows position unspecified; nav not wrapping | Six items overflow at 375px; Members is not the daily page | §0 nav order, `flex-wrap`, landing `#/inbox` (`useHash` default and `Wordmark href`) |
| 6 | Task 8 editor grid `176px / 1fr / 320px` | Board is 448px wide in a 976px page | Palette strip above, grid `1fr / 320px` (§2.1) |
| 7 | Board `div.rnr-canvas.min-h-[480px]` around `ReactFlow` | xyflow needs a definite parent height; `min-h` renders a 0px board | Inline `height: clamp(480px, 70dvh, 720px)` and `.wf-board` (§2.4) |
| 8 | `<Background gap={16}/>` on top of `.rnr-canvas`'s own dot gradient; `.rnr-canvas` padding stays | Two dot grids, one of which does not pan; 16px inset around the flow | `.wf-board { padding:0; background-image:none }`, one `Background` with `--chart-grid` (§2.6) |
| 9 | Palette block `className="rnr-block rnr-pick flex-col items-start"`, 176px wide | `rnr-pick` strips border/background/padding from the block and its `> *` rule forces `nowrap` (hints clipped) | Phase 2 markup: `rnr-block rnr-focus w-full text-left`, no `rnr-pick` (§2.3) |
| 10 | Click add stacks at the exact board centre; second Start allowed | Repeated adds pile up invisibly; a second Start only creates an issue | Nudge to free space; select the existing Start (§2.3) (`addNode` takes taken positions) |
| 11 | `.wf-card { min-width:176px }`, `.wf-out` padding keeps handle 12px inside the card; `.react-flow__handle` hit area 10px | Handles should sit on the card edge, labelled, with a usable target; card width unstable | `width:208px`, edge-aligned `.wf-out`, 28px hit area (§2.5, §2.6) |
| 12 | Card has no End summary, no issue/current/dragging states beyond data attributes; handles keyboard-inert but announced | "Closes as done/rejected" is invisible until opened; extra anonymous nodes for AT | §2.5: End caption, `data-issue`, drag shadow, `aria-hidden` handles |
| 13 | `toFlow` `ariaLabel` is `Form step: Manager approval` only | Issues and record counts are not announced | `Form step: Manager approval. 2 issues. 3 records on this step.` (update `canvasOps.test.ts` if it asserts it) |
| 14 | Edge arrowheads absent; xyflow default blue/grey chrome (controls, selection, connection line, attribution) | Direction of a one-way workflow is ambiguous; non-token colours | `defaultEdgeOptions.markerEnd` (not in `toFlow`, the test compares the edge object) and the §2.6 overrides |
| 15 | `SidePanel` root `div aria-labelledby="sp-h"`, title `h2.rnr-card-title` | `aria-labelledby` on a roleless div; `rnr-card-title` truncates and is muted | `section` + `h2.dialog-title` with the step name beneath (§2.7) |
| 16 | "Add an action" is a `<select>` that adds on `change` | Same defect as Phase 2 #1: ArrowDown on a closed select adds an action per key | Select + "Add action" button, empty-choice error, focus the new action (§2.7) |
| 17 | Send message / Generate PDF presented as normal options with a caption inside the block | Misleading: choosing them looks functional | "(not active yet)" in the option, section caption, "Available when Communication ships." everywhere |
| 18 | Remove action is `rnr-btn-ghost` "Remove" with no step context; Delete step `rnr-btn-ghost` | Button README: Delete is danger; identical names | Ghost "Remove" with `aria-label="Remove {title} action"` (low stakes); "Delete step" `rnr-btn-danger` with `aria-label` |
| 19 | Delete guard text `{open} open record(s) is/are on this step…` and card caption "n open records" | Counts include stopped records, which Phase 3 cannot clear; no next step | §2.7 / §2.5 wording; see Notes in the hand-back |
| 20 | Panel is the third grid item at every width | Below `lg` it lands under a 480px+ board; selecting a card gives no visible result | Bottom sheet below `lg`, sticky column at `lg`+ (§2.1) |
| 21 | Issues card in the right column under the panel; `div tabIndex=-1` with `h2.rnr-card-title`; "Show" buttons all named "Show" | Publish blockers are far from the Publish button; roleless div; identical names | §2.8: above the board, region, `aria-label="Show {name}"` |
| 22 | Save bar: no "Unsaved changes" indicator, no published-edit caption, conflict button without explaining the loss, blank name unchecked | Phase 2 #40, #41, #42; published workflows have no versions so edits hit running records | §2.2 |
| 23 | `deleteKeyCode={null}` but multi-selection and `edgesFocusable` defaults on | Shift-drag selection box has no panel meaning; 200 tab stops through edges | `selectionKeyCode={null} multiSelectionKeyCode={null} edgesFocusable={false}` |
| 24 | No accessible alternative to the board beyond xyflow defaults; phones use the same editable map | Connecting needs a pointer on handles; unusable on a 375px touch screen | Map | List toggle, List default below `md`, Map read-only below `md` (§2.4, §2.9) |
| 25 | Moves announced only by xyflow's English default ("New position, x:…") | Pixel coordinates mean nothing | `ariaLabelConfig` override when available (§2.9) |
| 26 | Task 8 Access: `await` the write then invalidate; one shared `useAction` ignores a second click while busy; `Always` cells; no `scope`; checkbox flips only after the round trip | Lost clicks; laggy; design/README: cheap reversible actions are optimistic | §3 optimistic per toggle with rollback |
| 27 | Task 9 Inbox: `aria-busy={claim.busy}` on every row's button; claimed-by-other rows still show Claim; Overdue inline beside the date; empty headings `h3.rnr-card-title`; `div aria-labelledby` sections | Wrong busy target; Claim fails for the user; misaligned right cell; Phase 2 #15 | §4 |
| 28 | Start page: runner button "Submit form"; no `can_start` check; success text always "has moved to its next step" | Wrong object in the verb; a user without access fills the form then fails; the record may have stopped | `submitLabel` "Start record"/"Starting…", `useStartable` guard, `SubmitResult` carries `status` and success branches on it (§5) |
| 29 | Task view: closed `<details>` render `AnswerList` (signs every file at mount); no state for claimed-by-someone-else or cancelled; Claim success unmounts the focused button; `div aria-labelledby="mine-h"` | Wasted signing; wrong copy; QA-8 focus loss; roleless label | §6 |
| 30 | `FormRunner` outcome buttons: first outcome primary, Reject secondary | None; matches. Recorded so QA does not flag it. Reject has no required reason | No change; §6 records the decision |
| 31 | Task 10 filter `role="radiogroup"` + `role="radio"` on plain buttons, no arrow keys | Segmented README: view toggles are `aria-pressed` buttons; radiogroup needs roving tabindex | §0 / §7 `role="group"` + `aria-pressed`; add the inactive-label contrast rule |
| 32 | `RecordStatus` shown as `rnr-status` with text only (list and record page) | design/README: status is a grey icon plus a word | `RecordStatusMark` with the §0 icons (adds `StopIcon`, `RightIcon`) |
| 33 | `eventText` strings: `Message queued. It sends once Communication is set up.`, `More than 2 days?: Yes`, `X finished waiting` | "Queued" implies it will send; doubled punctuation; awkward | §8 sentences. **Update `timeline.test.ts` expectations** for the condition, resumed, send_message and (new) generate_pdf rows |
| 34 | Timeline item `<p>sentence · time</p>` | Wraps badly at 375px; `time` not semantic | Two lines, `<time>`, icon slot (§8) |
| 35 | `MiniCanvas` height 280, `role="img"`, pannable/scrollable by touch | Unreadable at 280px with 8 steps; touch pan traps page scroll; wheel prevented | §8: `clamp(240px,40dvh,360px)`, `preventScrolling={false}`, static on coarse pointers |
| 36 | Stopped alert: "Ask a workflow manager to fix the workflow." | Next step incomplete (a fixed workflow does not resume the record) | "…fix the workflow, then start a new record." |
| 37 | Records list: no count line, no "Started by", filter change flashes to skeleton, filtered-out copy "Choose All…" without a control | Orientation and next step | §7 |
| 38 | Server copy: `claim_task` message "Someone else claimed this task first, or it is already done." and function sentence "This task is already done." | Errors must say what to do | Append " Check your inbox for what is left." to the `errors.ts` entry (and test); advance 409 text "This task is already done. Go back to your inbox to see what is next." (Task 3/4 tests) |
| 39 | `Time` step has no hint about timer granularity | `resume` runs once a minute | Panel hint (§2.7) |
| 40 | Not carried by the plan: `index.css` Phase 3 block is "placeholders the design spec confirms" | — | §2.6 is the confirmed block; replace the plan's snippet entirely |

## 12. Where the design system is silent (DD summary)

Nav order and landing page · status icons (`StopIcon`, `RightIcon`) · palette icons all `plus` · palette strip above the board · Map | List toggle, List as the accessible and phone editor, Map read-only on phones · panel as a sheet below `lg` · board chrome via `--xy-*` variables and a `.wf-board` class · arrowheads via `currentColor` · issues card above the board · actions added by select + button · reject without a required reason and without a confirm · newest earlier step open by default · optimistic access toggles · filters as `aria-pressed` buttons · static record map on touch · no polling on the record page · "Started by" column · pending-action copy · published-edit caption (changes apply to running records).
