# Checkbox, radio and switch

Native `<input>`s drawn with tokens, inside `rnr-check` (a label row): `input[type=checkbox]`, `input[type=radio]`, `input.rnr-switch[role=switch]`.

## Anatomy
Control 20px (switch 44 × 26) + label (14px `--ink`) + optional description (`rnr-check-desc`). The whole row is the target.

## Shape
Checkbox: rounded square, radius `--r-key` 6px. Radio: circle (the single native glyph that stays round: round means "one of"). Switch: rounded rectangle, radius `--r-control-sm` 8px, thumb 5px; **not a capsule**.

## States
rest (1.5px `--edge`) · hover (cursor) · focus-visible (3px ring) · checked (`--acc-a` fill, `--on-acc` mark) · indeterminate (dash) · invalid (`aria-invalid`, `--down` border) · disabled (40% opacity, label `--ink-3`).

## Do
Use a checkbox for independent options, a radio group for one of a few (inside a `fieldset` with a `legend`), a switch for something that takes effect at once ("Email notifications"). Use `rnr-seg` for 2–4 short exclusive options.

## Don't
Don't use a switch inside a form that has a Save button (use a checkbox). Don't use colour alone to show checked: the mark is always drawn.

## Accessibility
Native inputs: Space toggles, arrows move through a radio group (one tab stop). Rows are 44px on coarse pointers. Switch has `role="switch"` and reflects state through `checked`.

## Copy
Label states the option positively: "Email me when a task is waiting", not "Don't email me".
