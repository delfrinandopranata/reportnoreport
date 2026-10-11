# Phase 2 screens: implementation spec

Sources: `design/README.md`, `tokens.css`, `components/bundle.css` + component READMEs/previews (Canvas, Field, Widget, Dialog, Menu, Segmented, Icon, DataTable, Button), `phase-1-screens.md` (its §0 Global, §8 dialog and the `src/index.css` additions still apply), Phase 2 plan Tasks 6–9, and the shipped `src/ui/*` (ConfirmDialog, useAction, useNotice, Skeleton, errors, icons, Wordmark). Tailwind utilities are for **layout only** (flex, grid, gap, max-w, sr-only); colour, type, radius and controls come from `rnr-*` classes and tokens. "DD" = design decision (design system silent; most conservative option). Where this file differs from Tasks 6–9, this file wins (§9 lists every difference).

Selectors verified in `bundle.css`: `rnr-card`, `rnr-card-head`, `rnr-card-title`, `rnr-canvas`, `rnr-block`, `rnr-drop`, `rnr-handle`, `rnr-icon-btn`, `rnr-btn(-primary|-secondary|-ghost|-danger)`, `rnr-field`, `rnr-label`, `rnr-hint`, `rnr-input`, `rnr-error`, `rnr-error-text`, `rnr-status`, `rnr-chip`, `rnr-kbd`, `rnr-seg`, `rnr-menu(-item)`, `rnr-dialog(-head|-body)`, `rnr-table` (+ `.num`), `rnr-skeleton`, `rnr-spin`, `rnr-pop`, `rnr-reveal`, `rnr-muted`, `rnr-num`, `rnr-focus`. From Phase 1 `src/index.css`: `rnr-check`, `rnr-fieldset-label`, `rnr-caption`. **Not in the bundle** (so do not use): `rnr-btn-sm`, a progress bar, a sheet, a toast, a textarea style, a read-only field style, a palette-block icon set.

## 0. Global additions

| Item | Spec |
|---|---|
| Nav | Order: **Members, Forms, Roles**. "Forms" is visible to every member. `aria-current="page"` on Forms for all four form routes (`route.page.startsWith('form')`). Links stay `rnr-btn rnr-btn-ghost` / current `rnr-btn-secondary` as in `App.tsx`. |
| Page widths | Forms list, submissions: `max-w-5xl` (the `<main>`). Builder: the same 1024px, split into two equal columns from `lg` (`grid gap-4 lg:grid-cols-2`, columns `min-w-0`). Fill page: `max-w-2xl` (672px), left-aligned, not centred (DD, matches every other page). |
| Back link | Every form sub-page (builder, fill, submissions) starts with `<a class="rnr-btn rnr-btn-ghost self-start" href="#/forms"><svg back 16/>Back to forms</a>` above the h1. Needs one new icon `BackIcon` (the Icon set's `back`, chevron-left: `m15 18-6-6 6-6`). `FormGate` notices already use the same words. |
| One h1 | Forms: "Forms". Builder: "Edit form". Fill: the form's name. Submissions: "Submissions" (manager) / "Your submissions" (member), with the form name beneath as `<p class="rnr-muted">`. |
| One primary | List: "New form" (or the empty-state one, never both). Builder: "Save form". Fill: "Next page" / "Submit form" (only one is on screen). Submissions: none, except the empty state's "Fill in this form". Preview inside the builder: **secondary** only. |
| Shortcut | design/README: "N for new form". On the Forms page show `<kbd class="rnr-kbd" aria-hidden="true">N</kbd>` inside the "New form" button and make `N` (no modifier, focus not in an input/textarea/select, no dialog open) create a form. Only on the list. |
| Field error presentation | The shared validator's messages are JS-produced, so `.rnr-error-text` (shown only on `:user-invalid`) and `.rnr-field:has(:user-invalid)` never fire. Use instead, on every input: `aria-invalid="true"` + `aria-describedby="{id}-err"` + a sibling `<p id="{id}-err" class="rnr-error">message</p>` (14/500 `danger`, below the control). `.rnr-input[aria-invalid="true"]` already draws the `danger` border. The label turns `danger` through one new rule (DD, add to `src/index.css`): `.rnr-field[data-invalid="true"] > .rnr-label { color: var(--danger); }`; put `data-invalid="true"` on the `rnr-field` wrapper when it has an error. The message is **not** `role="alert"` (ten of them would be ten interruptions); instead §6 gives one page-level alert and focus goes to the first invalid control. Colour is never the only signal: message text and `aria-invalid` always present. |
| Groups of controls | `<fieldset class="rnr-field">` + `<legend class="rnr-label">`. `aria-invalid` is not valid on a fieldset: do not set it; set `aria-describedby` on the fieldset and `data-invalid` on it; focus goes to the first checkbox/radio inside (`id={id}`). |
| Required | Visible `*` after the label (`aria-hidden`) plus `aria-required="true"`. When the form has any required field, show once under the h1: `<p class="rnr-caption">Fields marked * are required.</p>` (DD: an unexplained asterisk fails the "say what it means" rule). |
| Checkbox | Phase 1 `.rnr-check` (flex, `gap-2`, `ink-label`, `min-height: var(--touch-min)` on coarse pointers) around every `<input type="checkbox">`. **Do not** use Tailwind `accent-brand`: Phase 1 shipped `accent-color: var(--ink)` because `brand-solid` is reserved for four things. |
| `<textarea class="rnr-input">` | `.rnr-input` forces `height: var(--rnr-control-h)` and `padding: 0 12px`, so a bare textarea is 36px tall and ignores `rows`. DD, add to `src/index.css`: `textarea.rnr-input { height: auto; padding: var(--space-2) var(--space-3); resize: vertical; }`. |
| Read-only value box | No class exists (DD, add): `.rnr-readout { display: flex; align-items: center; min-height: var(--rnr-control-h); padding: 0 var(--space-3); border: 1px solid var(--line-200); border-radius: var(--radius-lg); background: var(--surface-200); color: var(--ink); font-variant-numeric: tabular-nums; }`. Used for `calculated`. |
| Icon buttons inside a block | `.rnr-block svg` (last rule in `bundle.css`) outranks `.rnr-icon-btn svg` and makes every icon 16px with `margin-top: 2px`. DD, add to `src/index.css`: `.rnr-block .rnr-icon-btn svg { width: 14px; height: 14px; margin-top: 0; }` (the system says 14px in icon buttons). |
| Bare button in a block | DD, add: `.rnr-pick { flex: 1; min-width: 0; text-align: left; font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }` plus `@media (pointer: coarse) { .rnr-pick { min-height: var(--touch-min); } }`. Add `rnr-focus` for the ring. Replaces the unstyled `<button className="flex-1 text-left">`. |
| Sheet | DD, add: `dialog.rnr-sheet { margin: auto 0 0; width: 100%; max-width: none; max-height: 80dvh; padding: 0; border-radius: var(--radius-2xl) var(--radius-2xl) 0 0; }` + `dialog.rnr-sheet::backdrop` same as `dialog.rnr-dialog`. Always together with `rnr-dialog` (`class="rnr-dialog rnr-sheet"`). Body scrolls: `.rnr-sheet .rnr-dialog-body { overflow-y: auto; }`. |
| Dragged row | DD, add: `.rnr-block[data-dragging="true"] { position: relative; z-index: 1; box-shadow: var(--shadow-2xl); border-color: var(--line-300); }` and `[data-theme^="bw"] .rnr-block[data-dragging="true"] { box-shadow: 6px 6px 0 0 var(--ink); }`. No tilt (a CSS `rotate` would fight dnd-kit's inline `transform`), no `DragOverlay`. |
| Selected row | Confirmed: `.rnr-block[data-selected="true"] { border-color: var(--focus-ring); box-shadow: 0 0 0 1px var(--focus-ring); }` in `src/index.css` (bundle's `aria-selected` rule is invalid on `<li>`). It sits after the bundle's `:hover` rule at equal specificity, so selected wins. Selection is also announced (`aria-pressed` on the row button) and shown by the settings panel title, so it never depends on colour. |
| Skeleton / empty / error | Phase 1 rules (§0): empty `rnr-skeleton` shapes in `role="status"` with `sr-only` "Loading…"; empty states give the next step; errors say what to do. |
| Status line | Success/info lines are `<p class="rnr-status" role="status"><svg 14/>text</p>` (grey icon + word). The `role="status"` element stays mounted and only its text changes. |

## 1. Forms list (`#/forms`)

**Layout:** `<section class="flex flex-col gap-4" aria-labelledby="forms-h">`: header row `flex flex-wrap items-center gap-3` (h1 `page-title` with `tabIndex={-1}`, then "New form" `ml-auto`), live status line, page alert, then one of the four states below. Table in `<div class="rnr-card" style="padding:0;overflow-x:auto">` (DataTable preview).

**Header button:** `<button class="rnr-btn rnr-btn-primary ml-auto" aria-busy>`: idle `<PlusIcon/>New form <kbd class="rnr-kbd">N</kbd>`; busy `<span class="rnr-spin"/>Creating…`. Hidden while the list is in its first-run state (the empty card carries the one primary). Second click while busy ignored (useAction).

```html
<table class="rnr-table"><caption class="sr-only">Forms in {org}</caption>
 <thead><tr><th scope="col">Name</th><th scope="col" class="num">Fields</th><th scope="col" class="num">Updated</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
 <tbody><tr>
  <td>{name}</td><td class="num">{n}</td><td class="num">{11 Oct 2026}</td>
  <td><div class="flex justify-end gap-1 whitespace-nowrap">
    <a class="rnr-btn rnr-btn-secondary" href="…/fill" aria-label="Fill in {name}">Fill in</a>
    <a class="rnr-btn rnr-btn-ghost" href="…/edit" aria-label="Edit {name}">Edit</a>            <!-- forms.manage -->
    <a class="rnr-btn rnr-btn-ghost" href="…/submissions" aria-label="Submissions of {name}">Submissions</a>
    <button class="rnr-btn rnr-btn-danger" aria-label="Delete {name}">Delete</button>         <!-- forms.manage -->
  </div></td></tr></tbody></table>
```
- Right-aligned columns use **`class="num"`** (the bundle's `.rnr-table .num`), not `rnr-num`.
- "Fields" counts everything except `page_break`; a section counts as one.
- Date: `toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'})` (DD: the settings format does not exist yet).
- Delete is `rnr-btn-danger` (Button README: Delete is always danger), not ghost. Below `sm` the card scrolls horizontally with the first column sticky (`position:sticky;left:0;background:var(--rnr-card-bg)`); actions never wrap and never squeeze under 96px. No Menu component (DD: it is CSS only in `src/`, and DataTable's mobile rule is scroll, not collapse).
- Each action's `aria-label` carries the form name (several identical "Edit" buttons otherwise).

**States**

| State | Spec |
|---|---|
| Loading | Inside the card: three `rnr-skeleton` rows (h 20, widths 40% / 10% / 14%) in `role="status"`. The header and (if allowed) "New form" render at once. |
| First run, with `forms.manage` | `<div class="rnr-card gap-3">`: ghost preview `<div class="rnr-card" data-state="placeholder" aria-hidden="true">` containing "Leave request" (label) and "6 fields" (muted) — a faded sample form (README: ghost preview of a real item); `<h2 class="dialog-title">Build your first form</h2>`; `<p class="rnr-muted">Add fields, set rules and preview it as you build. Members can fill it in once you save it.</p>`; the one primary "New form". |
| First run, without it | Same card, no button, no ghost: h2 "No forms yet", muted "Ask a form manager to build one." |
| Error | Card: "We could not load your forms. Check your connection and try again." (`role="alert"`) + `rnr-btn-secondary` "Try again". |
| No results / filtered out | Not applicable (no search or filter in Phase 2). |

**Delete confirmation** (shared `ConfirmDialog`, Cancel autofocused):
- Title `Delete {name}?`
- Body: `{name} will be deleted for everyone and cannot be recovered. A form that already has submissions cannot be deleted.`
- Buttons: secondary "Cancel", danger "Delete form" (busy "Deleting…").
- **Blocked** (FK restrict): dialog stays open; `rnr-error role="alert"`: `This form has submissions, so it cannot be deleted. Keep it, or rename it so people know it is no longer used.` (the next step is the new part). RLS 0 rows: "You do not have permission to do that."
- Success: dialog closes, status line `Form deleted.` (5s), focus moves to the h1 (the row is gone).

## 2. Form builder (`#/forms/:id/edit`)

### 2.1 Layout

Desktop (`lg`+): two columns. **Left:** palette, field canvas, settings panels (in that order). **Right:** the preview card, `lg:sticky lg:top-4 lg:self-start` (DD: so the preview stays in view while the left column scrolls). Below `lg`: one column in the order save bar, "Add a field" button, canvas, settings, preview. No horizontal page scroll at 375px.

```
Back to forms
Edit form                                                  (h1.page-title)
[Form name ______________] [Unsaved changes] [Open form] [Save form]   (rnr-field + row)
(alert: save error / conflict)
┌ left ───────────────────────────┐ ┌ right (sticky) ───────────┐
│ Add a field  (palette, §2.2)     │ │ Preview        [Not saved] │
│ Fields (canvas + list, §2.3)     │ │ <FormRunner/>              │
│ {Type} settings (§2.5)           │ └────────────────────────────┘
│ Fields in {section} (groups)     │
└──────────────────────────────────┘
```

**Save bar:** `<div class="flex flex-wrap items-end gap-3">`: name field `rnr-field flex-1 min-w-[240px]` (label "Form name", `required`, `maxLength=120`, `aria-invalid`/`aria-describedby` on error "Enter a name for this form."), `rnr-status` text `Unsaved changes` (pencil 14px; only when dirty), ghost link "Open form" (to `/fill`), primary "Save form". Not sticky (DD, as the header). Primary states: idle "Save form"; busy `<span class="rnr-spin"/>Saving…` (`aria-busy`, live); saved `<CheckIcon/>Saved` for 1.6s (`rnr-pop` on the icon). The button is never `disabled`, including when clean.

### 2.2 Field palette

DD: the plan's `<select>` is replaced by the Canvas README's palette of blocks. A closed native `<select>` fires `change` on every ArrowDown, so keyboard users would add a field on each key press.

```html
<section aria-labelledby="pal-h" class="rnr-card gap-3">
 <div class="rnr-card-head"><h2 id="pal-h" class="rnr-card-title">Add a field</h2></div>
 <ul class="grid gap-2 sm:grid-cols-2">
  <li><button type="button" class="rnr-block rnr-focus w-full text-left" aria-label="Add Short text field">
        <svg plus/><span><span class="label block">Short text</span><span class="rnr-caption block">One line, up to 500 characters</span></span></button></li>
  …12 blocks…
 </ul></section>
```
- Every block uses the `plus` icon (DD: the Icon set has no per-type glyphs; a wrong glyph is worse than a consistent "add" cue). `rnr-block` hover raises to `shadow-sm`; button text colour `ink`.
- Click/Enter/Space **appends** the field to the end (DD, simpler than "after selected"), selects it, and on `lg`+ moves focus to its Label input; on phones closes the sheet, scrolls the settings into view and focuses the settings heading. Announce via the list's live region: `Short text added at position 5 of 5.`
- Inside a repeating section the same palette markup shows only the nine allowed types, titled "Add a field to this section", inside the section card.
- No drag-from-palette in Phase 2 (DD): reorder is the only drag. `rnr-drop` is used for the empty canvas only.

| Type | Block name | Description (caption) |
|---|---|---|
| short_text | Short text | One line, up to 500 characters |
| long_text | Long text | A paragraph, up to 10,000 characters |
| number | Number | Any number |
| date | Date | A calendar day |
| single_select | Single select | Choose one option |
| multi_select | Multi select | Choose any options |
| checkbox | Checkbox | A box to tick |
| file | File upload | One file, up to 10 MB |
| signature | Signature | Drawn or typed |
| page_break | Page break | Starts a new page |
| group | Repeating section | A set of fields people can repeat |
| calculated | Calculated | A number worked out from other answers |

**Phone (< `lg`): bottom sheet.** The inline palette card is `hidden lg:block`. Above the canvas sits a full-width `rnr-btn rnr-btn-secondary`: `<PlusIcon/>Add a field` (`aria-haspopup="dialog"`). It opens `<dialog class="rnr-dialog rnr-sheet" aria-labelledby>` (title "Add a field", close `rnr-icon-btn aria-label="Close dialog"`, body = the same one-column block list). Native `<dialog>` gives focus trap, Esc and backdrop close; choosing a block closes it and focus goes to the new field's settings heading. The button is not fixed to the viewport (DD: no overlap with the on-screen keyboard or the save bar). Blocks are 44px high minimum (`rnr-block` padding + two lines).

### 2.3 Canvas and field list

- Wrap the list in `<div class="rnr-canvas">` (dotted board, `radius-2xl`, padding `space-4`). `<h2 class="sr-only">Fields</h2>` precedes the `<ol aria-label="Fields" class="flex flex-col gap-2">`.
- Empty: `<div class="rnr-drop">No fields yet. Choose a field type to add your first one.</div>` (min-height 64px).
- Snap-to-16px-grid is not applicable (a vertical list, not free placement; DD).

**Row** (`<li class="rnr-block" data-selected data-dragging data-key>`, `items-center` override: `style align-items:center` is not needed; keep the bundle's `flex-start` and let rows be 44px+ on touch):

```html
<li class="rnr-block" data-selected="false">
 <button class="rnr-handle" aria-label="Drag {name}" …dnd-kit attrs><svg grip/></button>
 <button class="rnr-pick rnr-focus" aria-pressed="false">
   <span class="label block">{name}</span>
   <span class="rnr-caption block">Short text · Required · Shown only if … · Needs fixing</span></button>
 <button class="rnr-icon-btn" aria-label="Move {name} up"><svg up 14/></button>
 <button class="rnr-icon-btn" aria-label="Move {name} down"><svg down 14/></button>
</li>
```
- Meta line (`rnr-caption`, `ink-muted`): type label, then ` · Required` / ` · Conditional` / ` · Needs fixing` as applicable. "Needs fixing" is text, never colour alone.
- **Move up / Move down are always both rendered** (plan hides them at the ends, which unmounts the button the person just pressed and drops focus to `<body>`). At the ends the button has `aria-disabled="true"` (not `disabled`, so focus stays) and `style="opacity: var(--opacity-disabled)"`; activating it only announces `{name} is already first.` / `is already last.`
- After any move (drag, keyboard or button) focus returns to the same control of the moved row (by `data-key`), because React re-parents the node.
- Handle: `aria-label="Drag {name}"`, `rnr-handle` (44px on coarse pointers; `touch-action: none` is already in the bundle, so the handle is the touch lift and no long-press is needed — DD, replaces the Canvas README's 200ms long-press because the handle never conflicts with scrolling). Keyboard: Tab to the handle, **Space** lift, **↑/↓** move, **Space** drop, **Esc** cancel. Pointer sensor `distance: 4`.
- Dragging: `data-dragging="true"` on the row (§0), the others slide via dnd-kit transform. Flat motion / `prefers-reduced-motion`: no transition (`transition: undefined` when `data-motion="flat"`; dnd-kit's own transition is disabled by passing `transition: null`).
- Keyboard path 2 (menu path of design/README): the two icon buttons. Change width does not apply (forms are single column).

**Live-region wording** (dnd-kit `accessibility.announcements`, plus the plan's polite `sr-only` region for button moves, plus `screenReaderInstructions`):

| Event | Text |
|---|---|
| Instructions (`screenReaderInstructions.draggable`) | `Press Space to pick up this field. Use the up and down arrow keys to move it. Press Space to drop it, or Escape to cancel.` |
| Pick up | `Picked up {name}. Position {n} of {total}.` |
| Over | `{name} is over position {n} of {total}.` |
| Drop | `{name} moved to position {n} of {total}.` (same position: `{name} dropped in position {n} of {total}.`) |
| Cancel | `Moving {name} was cancelled.` |
| Button move | `{name} moved to position {n} of {total}.` |
| At the end | `{name} is already first.` / `{name} is already last.` |
| Add | `{Type} added at position {n} of {total}.` |
| Remove | `{name} removed. {total} fields left.` |

`{name}` is the field's label, or its type name when the label is empty.

### 2.4 Repeating section inside the canvas

A selected `group` shows a second card **after its settings**: `<div class="rnr-card gap-3"><div class="rnr-card-head"><h2 class="rnr-card-title">Fields in {label}</h2></div>` + the same list component (`aria-label="Fields in {label}"`, same rows, same announcements, nine types only) + the §2.2 palette block grid titled "Add a field to this section". The selected child's settings appear after that card. Row meta for a section: `Repeating section · 1–5 rows`. A section's rows cannot hold sections, page breaks or calculated fields (the palette simply does not offer them).

### 2.5 Field settings panel

`<section class="rnr-card gap-3" aria-labelledby>`, heading `<div class="rnr-card-head"><h2 class="rnr-card-title" tabIndex={-1}>{Type} settings</h2></div>`. Control order, always: Label, Key, Help text, type-specific controls, Required, Show only when…, Remove field. All controls are `rnr-field` + `rnr-label` + `rnr-input`. Commit-on-blur inputs (`DraftInput`) also commit on **Enter** and keep focus (plan's Enter calls `blur()`, which drops focus).

- Issues list: when the field has schema issues, a `<ul class="rnr-error">` at the top with the plain-English messages from `validateSchema`. It is **static** (no `role="alert"`; it changes on every keystroke). A persistent text description, not a live announcement; the save-time alert (§2.8) is the announcement.
- Label (`maxLength 200`; for `page_break` the label reads "Page title"). Key: hint "Used in rules and formulas. Changing it breaks anything that uses the old key." error "Use lowercase letters, numbers and underscores, starting with a letter." / "Another field already uses this key. Choose a different one."
- Help text: textarea, 2 rows, `maxLength 500`, hidden for `page_break`.
- Required: `.rnr-check` "Required", hidden for `page_break` and `calculated`. For a section it means "at least one row".
- Remove field: `rnr-btn rnr-btn-danger` with `aria-label="Remove {name}"`, no confirm (DD: undoable until Save; copy "Remove field"). After removal: announce (§2.3), clear the selection, move focus to the "Fields" `<ol>` heading (`<h2 class="sr-only" tabIndex={-1}>Fields</h2>`).

| Type | Extra controls |
|---|---|
| short_text, long_text | none (limits shown in the palette caption only) |
| number | none |
| date | none (value is an ISO UTC day) |
| single_select | **Options**: textarea (`rnr-input`, 4 rows), label "Options", hint "One option per line.", commit on blur. Error from schema ("Add between 1 and 100 options.", "Each option must be different.") shown through the issues list. |
| multi_select | Same as single_select. |
| checkbox | none |
| file | none (hint line under Help text: "People can upload one file, up to 10 MB.") |
| signature | none (hint: "People draw it or type their name.") |
| page_break | Page title only. No Required, Help text or Show-only-when. Meta in list: `Page break`. |
| group | Two `rnr-field` number inputs side by side (`grid grid-cols-2 gap-3`): "Fewest rows" (min), "Most rows" (max), `min=0 max=50 step=1`, `rnr-num`. A cleared input must not store `NaN` (React warns on `value={NaN}`; store `''` in local state and commit a number on blur). Hint: "Between 0 and 50. The fewest rows must not be more than the most." |
| calculated | **Formula** (§2.7). No Required. Preview output is read-only. |

### 2.6 Show-only-when rule editor

`<fieldset class="rnr-field"><legend class="rnr-label">Show this field</legend>` + `.rnr-check` "Only when a condition is met". When ticked, a **single column** (`grid gap-3`, all widths; DD: three columns of ~150px do not fit the half-width panel with labels like "Children: Name (any row)") of three `rnr-field`s with **visible labels**: "Field" (select), "Condition" (select), "Value" (control by target type below). When unticked the rule is removed.

| Condition | Label |
|---|---|
| is / is_not | is / is not |
| is_one_of | is one of |
| contains | contains |
| is_empty / is_not_empty | is empty / is not empty |
| gt / lt | is more than / is less than |
| within_days | is within … days of today (Value label becomes "Days") |

Value control (DD): target is a select field → `<select class="rnr-input">` of its options (`is_one_of`: a `.rnr-check` group of the options); target is a `date` → `<input type="date">`; target is a `checkbox` → select Yes / No; else text (`is_one_of` text hint "Separate values with commas."). Reason: a typo in a free-text value silently hides the field for ever.
- If there is no other field to point at: the checkbox is `disabled` (a toggle, not a submit) with `rnr-hint` "Add another field first to use as a condition."
- Rule on a field that is later deleted or renamed shows as an issue ("The show-if rule points at a field that does not exist.") in the list meta and the settings issues list.

### 2.7 Calculated field: formula editor

`rnr-field`: label "Formula"; hint (id `{uid}-expr-hint`) `Use + - * / or × ÷ −, brackets, field keys, and sum, count, min, max, days_between, round, if. Example: days_between(start, end) + 1`; input `rnr-input rnr-num`-free (plain text, `maxLength 500`, `spellcheck="false"`, `autocapitalize="off"`).
- **Inline error:** `<p id="{uid}-expr-err" class="rnr-error">{compile error}</p>`, `aria-invalid="true"`, `aria-describedby="{uid}-expr-hint {uid}-expr-err"`. Shown **after the field loses focus** (DD, design/README: errors appear after the person leaves the field, never while typing). Cleared as soon as the formula compiles. `data-invalid` on the wrapper.
- In the preview the output is read-only (§4).

### 2.8 Save, conflict, unsaved changes

| Case | Spec |
|---|---|
| Blank name | Inline error on the name field "Enter a name for this form."; focus the name field. |
| Issues present | `<p class="rnr-error" role="alert">Fix {n} problem(s) before saving. Fields that need fixing are marked in the list.</p>` below the save bar; select the first problem field and focus its row button. Do not call the server. |
| Saved | Primary shows "Saved" 1.6s; "Unsaved changes" status clears; `role="status"` text `Form saved.` (5s). |
| **Concurrent edit** (0 rows from the conditional `updated_at` update) | `role="alert"` card above the columns: `This form was changed by someone else, or you can no longer edit it. Reload to see the latest version. Your unsaved changes will be lost.` + `rnr-btn rnr-btn-secondary` "Reload form". Save stays live; pressing it again repeats the message. |
| Server error | `friendlyError`, same alert slot. |
| Unsaved changes | `beforeunload` covers closing or reloading the tab only. In-app navigation (a nav link, "Back to forms", browser back) must also be guarded: revert the hash change and open a `ConfirmDialog`: title `Leave without saving?`, body `Your changes to {name} will be lost.`, buttons "Cancel" (autofocus) and danger "Leave without saving". "Open form" is a link, so it is guarded the same way. |

### 2.9 Live preview

`<aside aria-labelledby="preview-h" class="rnr-card gap-3">`: `rnr-card-head` with `h2.rnr-card-title` "Preview" and `<span class="rnr-chip ml-auto">Not saved</span>`, then `<p class="rnr-caption">Changes appear here as you edit. Nothing you enter is saved.</p>`, then `FormRunner` (no `onSubmit`). The runner's last button is `rnr-btn-secondary` "Check answers"; success line "These answers are valid. The preview does not save them." File input shows "Uploads are turned off in the preview." and the signature pad "Signatures are not saved in the preview." (both `rnr-caption`, not `rnr-muted` body-size).

### 2.10 Builder states

| State | Spec |
|---|---|
| Loading | `FormGate` skeleton: h1-sized bar + a 320px block, `role="status"`. |
| Not found / no access | `FormGate` notice (`rnr-card`, h1, body, secondary "Back to forms"). |
| Load error | `FormGate` notice with "Try again" (secondary). |
| Empty canvas | §2.3 `rnr-drop`; preview shows `This form has no fields yet.` |
| Busy | Save button spinner; all other controls stay live. |
| Saved / conflict / issues | §2.8. |

**Phone layout:** one column; save bar wraps (name full width; status, "Open form" and "Save form" on the next line); "Add a field" sheet button (§2.2); canvas rows ≥44px; selecting a row (below `lg` only) scrolls its settings into view and focuses the settings heading; preview last. Rows: handle 44, pick (flex), up 44, down 44 = ~170px for the label at 375px; label and meta truncate with `text-overflow: ellipsis` (`min-width: 0` on `.rnr-pick`).

## 3. Field inputs (shared by preview and fill page)

Wrapper for every single control: `<div class="rnr-field" data-invalid?>` → `<label for class="rnr-label">Label<span aria-hidden="true"> *</span></label>` → optional `<span id="{id}-help" class="rnr-hint">help</span>` → control → `<p id="{id}-err" class="rnr-error">`. Gap between fields `gap-4` (16px). `aria-describedby` = help id + error id.

| Type | Control | Notes |
|---|---|---|
| short_text | `<input class="rnr-input" type="text" maxLength=500>` | |
| long_text | `<textarea class="rnr-input" rows=4 maxLength=10000>` | needs the §0 textarea rule |
| number | `<input class="rnr-input rnr-num" type="number" inputMode="decimal" step="any">` | left-aligned in a form (right-alignment is for tables), `rnr-num` for tabular figures |
| date | `<input class="rnr-input" type="date">` | ISO value |
| single_select | `<select class="rnr-input">` first option "Choose an option" | |
| multi_select | `<fieldset class="rnr-field"><legend class="rnr-label">…</legend>` + `.rnr-check` per option | error on the fieldset (§0); focus goes to first checkbox |
| checkbox | `.rnr-check` containing the label (with `*`), help below | `aria-describedby` on the input |
| file | §5 | |
| signature | §5 | |
| calculated | `<label>` + `<output id class="rnr-readout" aria-live="off">` | value `toLocaleString('en-GB')`; empty shows `—` with `<span class="sr-only">No value yet</span>`. **Remove `aria-live="polite"`** (every keystroke elsewhere would announce it). Caption under it, `rnr-hint`: "Worked out for you." |
| page_break | not an input | page heading, §6 |
| group | §4 | |

Money, if ever used in a formula label, follows design/README (ISO code in the label); Phase 2 has no currency type.

### 4. Repeating section (fill + preview)

```html
<fieldset id="{id}" tabindex="-1" class="rnr-card gap-3" aria-describedby="{id}-hint {id}-err">
 <legend class="rnr-label">{label}</legend>
 <p id="{id}-hint" class="rnr-hint">{help} {min}–{max} rows.</p>          <!-- omit the rows text when 0–50 -->
 <div role="group" aria-label="{label}, row 1" class="flex flex-col gap-3 border-t border-line-200 pt-3">
   <p class="label">Row 1</p>  …inputs…
   <button class="rnr-btn rnr-btn-ghost self-start" aria-label="Remove row 1 of {label}">Remove row</button>
 </div>
 <button class="rnr-btn rnr-btn-secondary self-start" aria-label="Add a row to {label}"><svg plus/>Add row</button>
 <p id="{id}-err" class="rnr-error">…</p>
 <p class="sr-only" role="status"></p>
</fieldset>
```
- Plan copy "Remove {label lowercased} 1" / "Add {label lowercased}" produces "Remove contacts 1" / "Add contacts": replaced by "Remove row" / "Add row" with the section name in `aria-label`.
- Each row shows a visible `Row {n}` (`.label`) because `<ol>`/`<li>` markers do not render under Tailwind's reset.
- At the minimum, the Remove button is not rendered; at the maximum the Add button is replaced by `<p class="rnr-caption">You have added the most rows allowed ({max}).</p>` so the control does not vanish unexplained. Zero rows: `<p class="rnr-muted">No rows yet.</p>` above Add row.
- Focus: after **Add row**, focus the first input of the new row; after **Remove row**, focus the section fieldset (`tabIndex={-1}`; the removed button no longer exists). Announce in the live region: `Row {n} added. {total} rows.` / `Row removed. {total} rows.`
- Section-level errors (`Add at least 2 rows.`) render under the Add button with `data-invalid` on the fieldset; per-input errors use the key `group.{i}.{child}` and the same §0 pattern.
- Nested rows are not cards; the `border-t border-line-200` separator is a token colour.

## 5. File upload and signature

### 5.1 File

`<input id type="file" class="rnr-input" style="height:auto;padding:var(--space-2) var(--space-3)">` (DD: the fixed 36px height clips the native button; native file chooser kept for system consistency).

| State | UI |
|---|---|
| Idle | Native input, no extra text. |
| Uploading | Input `aria-busy="true"`; below it `<p class="rnr-status" role="status"><span class="rnr-spin" aria-hidden="true"/>Uploading…</p>`. Submit/Next stay live (a required file whose upload is in flight shows "This field is required." until it completes; DD, no new message). |
| Uploaded | `<p class="rnr-status"><svg check 14/>{file name}</p>` (when reloading the page the name is the path tail after the uuid prefix) + `<button class="rnr-btn rnr-btn-ghost" aria-label="Remove {name}">Remove file</button>` (DD: clears the answer; the stored object is not deleted, the plan's known shortcut). Choosing a new file replaces it. |
| Too large | `rnr-error role="alert"`: `Choose a file under 10 MB.` Previous uploaded value (if any) is kept. |
| Failed | `rnr-error role="alert"`: `We could not upload that file. Check your connection and choose it again.` (the generic fallback is replaced for upload failures; DD) |
| Required, not uploaded | Standard field error "This field is required." (validator). |
| Preview | `<p class="rnr-caption">Uploads are turned off in the preview.</p>`; input stays focusable. |

### 5.2 Signature

DD (decision): **a typed-name alternative is offered.** A canvas cannot be operated from a keyboard, switch or screen reader, so a second route to the same stored result (a PNG in `form-files`) is required. No server or schema change.

```html
<div class="rnr-field" data-invalid?>
 <span id="{id}-l" class="rnr-label">Signature *</span>
 <div class="rnr-seg" role="radiogroup" aria-labelledby="{id}-l">
   <button role="radio" aria-checked="true" tabindex="0">Draw</button>
   <button role="radio" aria-checked="false" tabindex="-1">Type</button></div>
 <!-- Draw -->
 <canvas id="{id}" width="600" height="240" tabindex="-1" role="img"
   aria-label="Signature pad. Draw with a mouse, pen or finger, or choose Type to sign with your name."
   style="width:100%;aspect-ratio:5/2;border:1px solid var(--line-200);border-radius:var(--radius-xl);touch-action:none"/>
 <!-- Type -->
 <input class="rnr-input" id="{id}" type="text" autocomplete="name" maxlength="80" placeholder="Type your full name"/>
 <div class="flex flex-wrap items-center gap-2">
   <button class="rnr-btn rnr-btn-secondary" aria-busy>Save signature</button>   <!-- busy: Saving signature… -->
   <button class="rnr-btn rnr-btn-ghost">Clear</button>
   <span class="rnr-status" role="status"><svg check 14/>Signature saved</span> </div>
 <p class="rnr-error">…</p></div>
```
- Segmented: 2 options, `role="radiogroup"`/`radio`, roving tabindex, arrow keys (Segmented README). Switching mode clears the pad/text and any saved value.
- Canvas: internal 600×240 (5:2, taller than the plan's 600×160 so a thumb has room at 327px wide), stroke 3px round, **black ink on a white page** (confirmed: the PNG is a document, so it reads in every theme; the white block is intentional in dark themes), `radius-xl` border `line-200` (token, not Tailwind `rounded-lg border-line-200`). `tabIndex={-1}` so validation can focus it programmatically.
- Type mode: on Save, the name is drawn on the same white canvas in `italic 56px var(--font-sans)` black and uploaded as `signature.png` through the same uploader.
- **A new stroke after saving clears the saved value** (`onChange(undefined)`), otherwise the stored PNG no longer matches what is shown. While drawn but unsaved, show `<p class="rnr-caption">Not saved yet. Select Save signature to keep it.</p>`.
- Save with nothing drawn/typed: `rnr-error` "Draw or type your signature first." (the plan silently does nothing).
- Failure: "We could not save your signature. Clear it and sign again." Upload too large cannot happen (PNG).
- Preview: `<p class="rnr-caption">Signatures are not saved in the preview.</p>`.

## 6. Fill page (`#/forms/:id/fill`)

**Layout:** `<section class="flex flex-col gap-4 max-w-2xl" aria-labelledby="fill-h">`: Back to forms, `h1#fill-h tabIndex=-1.page-title` (form name), required legend, then the runner (a `rnr-card gap-4`; DD: fields sit on a `surface-100` card like every other form). Primary is the page's single button.

**Runner header** (`<div tabindex="-1" ref>` — the focus target after Next/Back, so a screen reader hears the page title and position together):
```html
<div tabindex="-1">
 <p class="rnr-caption">Page 2 of 3</p>
 <div aria-hidden="true" style="height:4px;border-radius:var(--radius-full);background:var(--rnr-track-bg)"><div style="height:100%;width:66.67%;border-radius:inherit;background:var(--ink-label)"></div></div>   <!-- DD progress; not brand-solid -->
 <h2 class="dialog-title">Dates</h2>                                         <!-- page_break label; omit on the untitled first page -->
</div>
```
Only when more than one visible page. The plan's `FormRenderer` rendering the page_break as `<h2 class="rnr-card-title">` (muted 14px, truncating) is removed: the runner renders the title; `FormRenderer` skips `page_break`.

**Buttons** (`flex gap-2` row; on phones `flex-col-reverse` full width with Back last in DOM order after Next so the primary is first for thumbs? DD: keep DOM order Back, Next; below `sm` make both `w-full`):
- Back: `rnr-btn rnr-btn-secondary` "Back" (not on page 1). Next: `rnr-btn rnr-btn-primary` "Next page". Last page: "Submit form" / busy "Submitting…" (`rnr-spin`, `aria-busy`). Never `disabled`.
- Preview mode: last button `rnr-btn-secondary` "Check answers".

**Validation**
- Next validates the current page only; Submit validates everything and jumps to the first page with an error.
- On errors: `formError` alert `<p class="rnr-error" role="alert">Some answers need fixing. The fields to fix are marked below.</p>` above the buttons (replaces the server's duplicate "Some answers need fixing."), focus to the first invalid control (`document.getElementById(inputId).focus()`; for a signature the canvas has `tabIndex=-1`; for a fieldset the first checkbox).
- A field's error clears as soon as its value changes (DD: otherwise a corrected field stays red until the next click).
- Server `fieldErrors` use the same display. Other server errors: `res.error` in the same alert slot.
- Messages come from the validator verbatim: "This field is required." / "Tick this box to continue." / "Enter a number." / "Enter a valid date." / "Choose one of the options." / "Choose from the listed options." / "Upload the file again." / "Sign again." / "Add at least {n} row(s)." / "Add no more than {n} row(s)." / "Keep this under {n} characters." — all say what to do, keep.

**Success** (replaces the runner; `FillPage` `done`):
```html
<div class="rnr-card gap-3">
 <svg check 24 class="rnr-pop" aria-hidden="true"/>
 <h2 class="dialog-title" tabindex="-1">Form submitted</h2>             <!-- focus lands here -->
 <p class="rnr-muted">Your answers to {name} were saved.</p>
 <div class="flex flex-wrap gap-2">
   <button class="rnr-btn rnr-btn-primary" type="button">Fill in again</button>
   <a class="rnr-btn rnr-btn-ghost" href="…/submissions">View submissions</a>
   <a class="rnr-btn rnr-btn-ghost" href="#/forms">Back to forms</a></div></div>
```
Focus moves to the success heading, not the page h1 (the plan's target is the form name, which says nothing about the result). "View submissions" reads "View your submissions" for members without `forms.manage`.

**Other states**

| State | Spec |
|---|---|
| Loading / not found / error | `FormGate` (§2.10). |
| Setup problem (schema invalid) | `<p class="rnr-error" role="alert">This form has a setup problem. Ask a form manager to fix it.</p>`; with `forms.manage`: `This form has a setup problem. Open the builder to fix it.` + secondary "Edit form". |
| Nothing to fill in | Zero fields: card, h2 "This form has no fields yet", muted "Ask a form manager to add some." (manager: "Add some in the builder." + secondary "Edit form"). All fields hidden by rules: `This form has no questions to answer right now.` |
| Offline / submit failed | The alert slot with `submitAnswers`' sentence ("We could not save your answers. Try again."). Answers stay in the form. |
| Draft | No autosave or draft persistence in Phase 2 (DD); reloading loses unsubmitted answers. |
| Phone (375px) | Full-width card, `p-4` gutter, inputs full width, buttons full width, the signature pad `width:100%`; `.rnr-input` is already 44px on coarse pointers; no horizontal scroll. |

## 7. Submissions (`#/forms/:id/submissions`)

**Layout:** `<section class="flex flex-col gap-4" aria-labelledby="subs-h">`: Back to forms; `<div>` h1 + form name (`rnr-muted`); `rnr-caption` count ("12 submissions"); list.

**Row** — a `<li class="rnr-card">` wrapping `<details>` (DD: browsers have not all supported `display:flex` on `<details>` itself, so the card is the `<li>`; no `onToggle` render-gating needed for correctness):
```html
<summary class="rnr-focus" style="cursor:pointer"><span class="label">{email|You|Former member}</span> <span class="rnr-muted">· 11 Oct 2026, 14:30</span></summary>
<dl class="grid gap-x-3 gap-y-2 pt-3 sm:grid-cols-[minmax(120px,max-content)_1fr]">
 <dt class="rnr-fieldset-label">{field label}</dt><dd>{answer}</dd> …
</dl>
```
- Replace plan's `font-medium` with `.label`, and `text-ink-label font-medium` on `dt` with `.rnr-fieldset-label`. Below `sm` the grid is a single column.
- Submitter: own row shows "You"; unknown shows "Former member".
- Date/time: `toLocaleString('en-GB', {dateStyle:'medium', timeStyle:'short'})`.
- Open rows keep their state (no accordion).

**Answer rendering**

| Type | Rendering |
|---|---|
| Unanswered / hidden | `<span class="rnr-muted">Not answered</span>` |
| short_text, single_select | text |
| long_text | text with `whitespace-pre-wrap` (plan collapses newlines) |
| number, calculated | `rnr-num`, `toLocaleString('en-GB')` |
| date | ISO as stored (`2026-10-12`) |
| multi_select | `A, B, C` |
| checkbox | `Yes` / `No` |
| file | `<a href target="_blank" rel="noopener noreferrer" aria-label="Open {file name} (opens in a new tab)">Open {file name}</a>`; loading `Loading…`; error `We could not open this file. Reload the page to try again.` |
| signature | `<img alt="Signature of {name}" style="max-height:96px;max-width:100%;object-fit:contain;background:#fff;border:1px solid var(--line-200);border-radius:var(--radius-lg)">` (white because the PNG is; 96px, not the plan's 64) |
| group | per row: `<p class="rnr-caption">Row {n}</p>` + nested `<dl>`; zero rows `No rows` |

**States**

| State | Spec |
|---|---|
| Loading | Two 48px `rnr-skeleton` rows in `role="status"`. |
| Empty (manager) | Card: `h2.dialog-title` "No submissions yet", muted "Answers appear here as soon as someone submits this form.", primary "Fill in this form". |
| Empty (member) | Same card: "You have not submitted this form yet." / "Answers you submit appear here." |
| Error | Card: "We could not load the submissions. Check your connection and try again." (`role="alert"`) + secondary "Try again". |
| Cap | When exactly 200: `<p class="rnr-caption">Showing the newest 200 submissions. Older ones are not shown yet.</p>`. |
| Phone | Single-column `dl`; images and long text wrap; no horizontal scroll. |

## 8. Copy table (every new string)

| Place | String |
|---|---|
| Nav | Forms |
| List h1 | Forms |
| List actions | New form / Creating… / Fill in / Edit / Submissions / Delete |
| List table | Name, Fields, Updated, (sr-only) Actions · caption "Forms in {org}" |
| First run (manage) | Build your first form · Add fields, set rules and preview it as you build. Members can fill it in once you save it. |
| First run (member) | No forms yet · Ask a form manager to build one. |
| List error | We could not load your forms. Check your connection and try again. / Try again |
| Delete dialog | Delete {name}? · {name} will be deleted for everyone and cannot be recovered. A form that already has submissions cannot be deleted. · Cancel / Delete form / Deleting… |
| Delete blocked | This form has submissions, so it cannot be deleted. Keep it, or rename it so people know it is no longer used. |
| Delete done | Form deleted. |
| Back link | Back to forms |
| Builder | Edit form · Form name · Unsaved changes · Open form · Save form / Saving… / Saved · Form saved. |
| Builder name error | Enter a name for this form. |
| Builder save issues | Fix {n} problem(s) before saving. Fields that need fixing are marked in the list. |
| Conflict | This form was changed by someone else, or you can no longer edit it. Reload to see the latest version. Your unsaved changes will be lost. / Reload form |
| Leave dialog | Leave without saving? · Your changes to {name} will be lost. · Cancel / Leave without saving |
| Palette | Add a field · Add a field to this section · Add {Type} field (aria-label) · captions per §2.2 |
| Canvas | Fields · Fields in {label} · No fields yet. Choose a field type to add your first one. · Drag {name} · Move {name} up / down · Required · Conditional · Needs fixing |
| Live region | §2.3 table |
| Settings | {Type} settings · Label · Page title · Key · Help text · Required · Options · Fewest rows · Most rows · Formula · Remove field |
| Key hint/errors | Used in rules and formulas. Changing it breaks anything that uses the old key. · Use lowercase letters, numbers and underscores, starting with a letter. · Another field already uses this key. Choose a different one. |
| Options hint | One option per line. |
| Rows hint | Between 0 and 50. The fewest rows must not be more than the most. |
| Formula hint | Use + - * / or × ÷ −, brackets, field keys, and sum, count, min, max, days_between, round, if. Example: days_between(start, end) + 1 |
| Rule editor | Show this field · Only when a condition is met · Field · Condition · Value · Days · Separate values with commas. · Add another field first to use as a condition. |
| Preview | Preview · Not saved · Changes appear here as you edit. Nothing you enter is saved. · Check answers · These answers are valid. The preview does not save them. · This form has no fields yet. · Uploads are turned off in the preview. · Signatures are not saved in the preview. |
| Fill | Fields marked * are required. · Page {n} of {total} · Back / Next page / Submit form / Submitting… · Some answers need fixing. The fields to fix are marked below. |
| Group | Add row / Remove row · Row {n} · {min}–{max} rows. · No rows yet. · You have added the most rows allowed ({max}). · Row {n} added. {total} rows. · Row removed. {total} rows. |
| File | Choose a file under 10 MB. · We could not upload that file. Check your connection and choose it again. · Uploading… · Remove file |
| Signature | Draw / Type · Signature pad. Draw with a mouse, pen or finger, or choose Type to sign with your name. · Type your full name · Save signature / Saving signature… · Clear · Signature saved · Not saved yet. Select Save signature to keep it. · Draw or type your signature first. · We could not save your signature. Clear it and sign again. |
| Calculated | Worked out for you. · No value yet (sr-only) |
| Success | Form submitted · Your answers to {name} were saved. · Fill in again · View submissions (members: View your submissions) · Back to forms |
| Setup problem | This form has a setup problem. Ask a form manager to fix it. / …Open the builder to fix it. · Edit form |
| Nothing to fill in | This form has no fields yet · Ask a form manager to add some. · This form has no questions to answer right now. |
| Submissions | Submissions / Your submissions · {n} submissions · No submissions yet · Answers appear here as soon as someone submits this form. · You have not submitted this form yet. · Answers you submit appear here. · Fill in this form · Not answered · Yes / No · Open {file name} · No rows · Row {n} · You · Former member · Showing the newest 200 submissions. Older ones are not shown yet. · We could not load the submissions. Check your connection and try again. |
| Errors map (`src/ui/errors.ts`) | form submissions FK → the Delete-blocked sentence above (test updated); RLS → You do not have permission to do that. |

## 9. Accessibility summary

| Concern | Rule |
|---|---|
| Landmarks / headings | Shell landmarks unchanged. One h1 per view; panels use h2; the success state and settings panel headings are focusable (`tabIndex={-1}`). |
| Drag and drop | Handle `aria-label="Drag {name}"`; Space lift, arrows move, Space drop, Esc cancel; Move up / Move down buttons are a second path; both announced (§2.3); focus restored to the moved control; ends use `aria-disabled`, not unmounting. |
| Live regions | dnd-kit announcer (assertive), one polite `sr-only` region per list, a persistent `role="status"` status line per page, `role="alert"` only for page-level errors and the save/submit failure. Per-field errors are linked, not alerts. |
| Focus | First invalid control after a failed Next/Submit/Save; heading after the triggering row disappears (QA-8: delete form → h1; remove field → "Fields" heading; remove row → section fieldset; submit → success heading); dialogs focus Cancel and return focus to the trigger. |
| Names | Repeated row buttons carry the row name (`Edit {name}`, `Remove row 2 of {label}`). Icon-only: handle, up, down, close dialog. |
| Colour | Selected, invalid, needs-fixing and saved always have text or an icon as well. Placeholders (`ink-faint`) never carry meaning. |
| Touch | `.rnr-btn`, `.rnr-input`, `.rnr-check`, `.rnr-pick`, `.rnr-icon-btn`, `.rnr-handle` all ≥44px on coarse pointers; palette blocks ≥44px. |
| 375px | Single column everywhere; tables scroll inside their card with a sticky first column; no `min-width` over 327px; the builder's two-column grid exists only from `lg`; the canvas, signature pad and preview are `width:100%`; rule editor stacks. |
| Motion | `rnr-pop` on saved/success only; no tilt; `data-motion="flat"` and reduced motion remove dnd transitions and the pop. |
| Alternatives | Signature has a typed alternative (§5.2); file upload uses the native chooser; every pointer drag has a keyboard and button path. |

## 10. Conflicts with Tasks 6–9 and the corrections

| # | Plan code | Conflict | Correction |
|---|---|---|---|
| 1 | Builder "Add a field" is a `<select>` that adds on `change` (Task 8 `AddField`) | A closed select fires `change` on each ArrowDown, so keyboard users add fields by accident; Canvas README calls for a palette of blocks; phones need a bottom sheet | Palette of `rnr-block` buttons (§2.2); phone sheet `rnr-dialog rnr-sheet` |
| 2 | Field list never uses `.rnr-canvas`; the list is a bare `<ol>` | Canvas README: the board is a dotted `surface-canvas` | Wrap in `.rnr-canvas` (§2.3) |
| 3 | `.rnr-block` rows contain `.rnr-icon-btn` | `.rnr-block svg` (end of bundle) overrides `.rnr-icon-btn svg`: icons 16px and shifted down 2px | `src/index.css`: `.rnr-block .rnr-icon-btn svg { width:14px; height:14px; margin-top:0 }` |
| 4 | Row button is `<button className="flex-1 text-left">` with `font-medium` | Unstyled browser button (wrong font/size/colour), Tailwind weight instead of the type style | `.rnr-pick` class + `.label` / `.rnr-caption` (§0, §2.3) |
| 5 | Move up/down rendered only when `index > 0` / `< count-1` | Pressing Move down on the second-last row unmounts the button and focus falls to `<body>` | Render both always; `aria-disabled` at the ends; restore focus after any move |
| 6 | No dragging style; no `isDragging` | Widget README: dragged item lifts under `shadow-2xl`; nothing marks the dragged row | `data-dragging` + CSS (§0) |
| 7 | dnd-kit default `screenReaderInstructions` | Generic "draggable item" text; no Escape | Custom instructions and announcements (§2.3) |
| 8 | Texts "Move {name} up/down" exist but at-end and add/remove events are silent | Moves must be announced in a live region (design/README) | Full wording table (§2.3) |
| 9 | `<textarea className="rnr-input" rows={4}>` (fill, builder help, options) | `.rnr-input` sets `height: 36px`, padding `0 12px` → one-line box, `rows` ignored | `textarea.rnr-input { height:auto; padding-block }` (§0) |
| 10 | Calculated shown as `<output className="rnr-input rnr-num" aria-live="polite">` | `<output>` is inline, so `.rnr-input`'s height does not apply; looks like an editable field; polite live region announces on every edit elsewhere | `.rnr-readout`, `aria-live="off"`, "Worked out for you." |
| 11 | Table cells `className="rnr-num"` for right alignment (list) | Right alignment is `.rnr-table .num`; `rnr-num` only sets tabular figures, so columns stay left-aligned | `class="num"` on `th`/`td` |
| 12 | Forms table bare, no card, no caption; actions in a wrapping flex | DataTable README: card wrapper, sticky first column on mobile, no squeezing; Phase 1 conflicts #8, #9 | `rnr-card` with `padding:0;overflow-x:auto`, `<caption class="sr-only">`, `whitespace-nowrap` actions |
| 13 | Row actions "Edit", "Delete" have the same accessible name on every row | Screen readers cannot tell rows apart (Phase 1 #21) | `aria-label` with form name |
| 14 | Delete is `rnr-btn-ghost` | Button README: Delete is `rnr-btn-danger` | `rnr-btn rnr-btn-danger` |
| 15 | First-run empty state is a card with no action; `h2.rnr-card-title` | design/README: each empty state has one primary action and a ghost preview; `rnr-card-title` is a muted truncating widget title, not an empty-state heading | §1 states; `h2.dialog-title` |
| 16 | "New form" is always primary, also in the empty state; no `N` hint | One primary per view; design/README: "N for new form", show shortcuts with `rnr-kbd` | Hide header button in first run; add `rnr-kbd` N and the key handler |
| 17 | `{notice && <p role="status">…}` conditionally rendered; plain `rnr-muted` | Live region must exist before its text changes or it is not announced (Phase 1 §7); success lines are `rnr-status` | Keep the `role="status"` element mounted; `rnr-status` with check icon |
| 18 | Delete blocked message ends at "cannot be deleted." | Errors say what to do (design/README) | Add "Keep it, or rename it so people know it is no longer used." (`errors.ts` + its test) |
| 19 | Delete dialog title "Delete this form?" / body quotes the name | Phase 1 pattern is `Delete {name}?`; body must state consequence plainly | §1 copy |
| 20 | Per-field errors are `<p id className="rnr-error">`, no label colour, no `data-invalid`; fieldset gets `aria-invalid` | `aria-invalid` is invalid on `fieldset`; label never turns `danger` for JS errors (`:user-invalid` does not fire); `.rnr-error-text` is `display:none` | §0 pattern: `data-invalid` + one new CSS rule; `aria-invalid` only on real controls |
| 21 | Multi-select and checkbox use `className="accent-brand"` and `min-h-[24px]` | Phase 1 shipped `accent-color: var(--ink)` (`brand-solid` is reserved for 4 uses); 24px is below `touch-min` 44px | `.rnr-check` everywhere (RuleEditor and FieldSettings too) |
| 22 | Page title from `page_break` rendered `h2.rnr-card-title` inside the renderer; counter in a bare `<p class="rnr-muted">` | Muted 14px truncating text as a page heading; no progress shown; Next focus target reads only "Page 2 of 3" | Runner header with counter, track (DD) and `dialog-title` heading as one focus target (§6); renderer skips `page_break` |
| 23 | Failed validation only focuses the first field; no summary | Phase 1: server/page errors as `rnr-error role="alert"`; screen readers need the summary | Page alert "Some answers need fixing…" (§6) |
| 24 | Field errors never clear until the next Next/Submit click | Corrected fields stay red | Clear a field's error on change |
| 25 | Group buttons "Remove {noun} {i+1}" / "Add {noun}" with lowercased label | "Remove contacts 1", "Add contacts" read badly; no row heading | "Remove row" / "Add row" + `aria-label`, visible "Row n" (§4) |
| 26 | Removing a row or adding one does not manage focus; at max the Add button silently disappears | Removed button → focus lost (QA-8); unexplained vanishing control | Focus rules and the "most rows allowed" caption (§4) |
| 27 | File input is `className="rnr-input"` as-is, spinner and text unstyled `rnr-muted`, no remove, generic failure | Fixed 36px height clips the native chooser; `.rnr-spin` needs `rnr-status` alignment; no way to clear an upload | Style and states per §5.1 |
| 28 | Signature: 600×160 canvas, 2px stroke, `bg-surface-100 border border-line-200 rounded-lg`, `role="img"` only | Too small for a finger at 327px; Tailwind radius instead of token; not keyboard or assistive operable (WCAG 2.1.1); canvas not focusable so error focus fails; a stroke after saving leaves a stale saved PNG; Save with nothing drawn silently does nothing | §5.2: Draw/Type alternative, 600×240, `tabIndex=-1`, clear-on-stroke, empty-save message |
| 29 | Success `<p>Form submitted.</p>` in `role="status"` card; focus on the form-name h1 | Inserted live region is often not announced; focus on the form name says nothing of the outcome | Success heading is the focus target (§6) |
| 30 | "Setup problem" and "no questions" are bare `<p>` | Errors say what to do; empty states give a next step | §6 states with Edit form action for managers |
| 31 | Submissions row: `<details className="rnr-card">`, `font-medium`, `grid-cols-[auto_1fr]`, `String(value)` | `<details>` as flex card is unreliable; Tailwind weight; two-column grid squeezes at 375px; long text loses newlines; group rows have no numbers (lists reset); signature 64px | §7 (card on `li`, `.label`, single column on phones, `whitespace-pre-wrap`, "Row n", 96px) |
| 32 | `h2.rnr-card-title` "No submissions yet"; secondary "Try again" without alert role; no member variant | Empty state heading style; error needs `role="alert"`; members see a different title | §7 states |
| 33 | `<img alt="Signature" className="… rounded-lg">`, link text "Open file" | Alt names no person; identical link text for every file; Tailwind radius | Alt `Signature of {name}`; link text/`aria-label` includes the file name |
| 34 | `ul.rnr-error role="alert"` of schema issues inside the settings panel | Re-announces on every keystroke | Static list, no role; the save-time alert announces (§2.5, §2.8) |
| 35 | Formula error shown live on every keystroke, not linked to the input | design/README: errors appear after leaving the field; field README: link with `aria-describedby` | Show on blur; `aria-describedby` hint + error (§2.7) |
| 36 | Rule editor: three columns at `sm`, selects labelled only by `aria-label`, free-text value, field with no peers gives an invalid rule | Cramped in the half-width panel; every control needs a visible label; typos silently hide a field for ever | §2.6: single column, visible labels, value control by target type, disabled toggle with hint |
| 37 | `onBlur` commit and `onKeyDown Enter → blur()` in `DraftInput` | Enter drops focus to `<body>` | Enter commits and keeps focus |
| 38 | Group min/max inputs store `valueAsNumber` | Clearing the input stores `NaN` → React warning and `null` in JSON | Keep text state, commit a number on blur |
| 39 | `onRemove` sets selection to `null` with no focus target or announcement | QA-8 (focus lost when the trigger disappears) | Announce and focus the "Fields" heading |
| 40 | `beforeunload` only | Hash navigation (nav links, back) never fires it, so unsaved changes vanish silently | Guard hash navigation with `ConfirmDialog` (§2.8); add the "Unsaved changes" status |
| 41 | Conflict text "Someone else changed this form, or you no longer have access. Reload the page…" shown as the generic alert, no action | design/README conflict example names the next step; reload loses edits without saying so | §2.8 copy and "Reload form" button |
| 42 | Blank name: alert text "Give the form a name." with no field state | Phase 1 field-error pattern (`aria-invalid`, linked message); wording "Enter …" | "Enter a name for this form." inline on the field |
| 43 | Preview card header `gap-3`, no chip, caption missing | Preview must say it does not save; info chip pattern exists | `rnr-card-head`, `rnr-chip` "Not saved", caption (§2.9) |
| 44 | Preview/fill "Page {n} of {total}" and Back/Next buttons same width on phones | Touch and thumb reach | Full-width buttons below `sm` (§6) |
| 45 | `FormGate` notices use `rnr-card gap-3 max-w-xl` and "Back to forms" only there | Sub-pages need the same way back once loaded | Back link on every sub-page (§0) |
| 46 | Nav order Members, Forms, Roles uses plan's order; `Forms` highlight uses `startsWith('form')` | Matches; only confirm | No change (recorded so QA does not flag it) |

## 11. Where the design system is silent (DD summary)

Palette block icons (all `plus`) · adding to the end of the list · bottom-sheet dialog classes · dragged-row style (shadow, no tilt) · handle as the touch lift (no long-press) · no grid snapping in a list · no drag-from-palette · `rnr-pick`, `rnr-readout`, `data-invalid` label rule, textarea sizing · progress track (`ink-label` fill, not `brand-solid`) · signature typed alternative and white page · file "Remove file" · no draft persistence · no confirm when removing a field · hash-navigation unsaved guard · sticky preview, non-sticky save bar · rule value control by target type · date display format in lists (`11 Oct 2026`) and ISO in submissions · "You" / "Former member" labels · expand-in-place submission detail.
