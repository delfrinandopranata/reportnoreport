# Field

A labelled form control — the atom of every form, survey and HR / school-admin record in the builder.

Hand-written from `src/ui.tsx` (`Field`, `field`, `input`).

## Anatomy
`<label class="rnr-field">` → `.rnr-label` (14/500, `ink-label`) → optional `.rnr-hint` (12px, `ink-muted`) → `.rnr-input` (any `input`, `select`, `textarea`). Errors sit below as `.rnr-error` with `role="alert"`, linked by `aria-describedby`, and the control gets `aria-invalid="true"` (border turns `danger`).

## Rules
- Height follows density: `control-h` (36px) or `control-h-compact` (32px).
- Focus: border to `ink-muted` plus a 2px `focus-ring` halo.
- Money fields: `inputmode="decimal"`, `rnr-num` (tabular numerals), label carries the ISO code — "Amount (MYR)", never a symbol.
- Glass: translucent fill with blur; neumorphic: inset well, no border.
- Error copy says what to do: "Enter a number of days.", not "Invalid".

## The consumer provides
Label, optional hint, the control, error text.
