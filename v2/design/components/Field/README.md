# Input, textarea, select, combobox and field

Text entry. `rnr-field` wraps a `rnr-label`, a control (`rnr-input`, `textarea.rnr-input`, `.rnr-select > select.rnr-input`, `.rnr-input-wrap`, `.rnr-combo`), a `rnr-hint` and an `rnr-error` / `rnr-error-text`.

## Anatomy
`label` (14/500, `--ink`) · control (16px text, 1px `--edge` border, `--field` fill, radius `--r-ctl` 10px / 8px compact) · hint (13px, `--ink-3`) · error (13px/500, `--down`, **icon + sentence**).

## Sizes
Height `--field-h`: 48px comfortable, 40px compact, 48px on coarse pointers. Text is 16px so iOS does not zoom. Textarea min-height 96px. Select adds a 40px right padding for the caret (drawn with a mask, `rnr-select` wrapper). Search/leading-icon: `rnr-input-wrap` with a 20px icon.

## States
rest · hover (edge darkens to `--ink-3`) · focus-visible (3px `--focus` ring; border `--focus`) · filled · placeholder (`--ink-3`, 4.5:1; never `ink-faint`) · invalid (`aria-invalid="true"`, border + inset ring `--down`, label `--down`, error with icon) · disabled (`--soft` fill, `--ink-3`) · read-only (`rnr-readout`, or the input with `readonly`) · busy (spinner sits beside, the field stays editable).
Validation comes from the DOM: `.rnr-field:has(:user-invalid)` shows `rnr-error-text`; errors appear after the person leaves the field, never on first render.

## Combobox
`rnr-combo` + `input[role=combobox]` + `.rnr-menu[role=listbox]`; the active option has `data-active`, the chosen one `aria-selected="true"` (tint + bold, never colour alone). Arrow keys move, Enter picks, Esc closes.

## Do
- One label per control, associated with `for`/`id`. Put the rule in the hint before the person gets it wrong.
- State the format ("Use YYYY-MM-DD") or the limit ("Up to 10,000 characters").

## Don't
- No placeholder-as-label. No red text without the icon and the sentence. No `rnr-field` directly beside Tailwind `gap-*` expecting it to lose: utilities win.

## Accessibility
`--edge` is ≥ 3:1 against `--field` and `--surface` (tested, WCAG 1.4.11). Errors are linked with `aria-describedby`; a summary moves focus to the first blocking field. Required is marked in the label ("Email (required)"), not by colour.

## Copy
Labels are nouns ("Work email"). Errors say what to do: "Enter a number of days.", "Enter a valid email address." Hints are one sentence ending in a full stop.
