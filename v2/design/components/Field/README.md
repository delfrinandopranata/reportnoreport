# Field

A labelled control: a pill well for single-line inputs and selects, a rounded well for text areas.

## Anatomy
`<label class="rnr-field">` → `.rnr-label` (14/500, `ink-label`) → optional `.rnr-hint` → `.rnr-input`. Errors sit below as `.rnr-error` (or `.rnr-error-text`, shown by `:user-invalid`).

## Rules
- Height follows density: 40px comfortable, 34px compact.
- Focus: a soft lumen halo in light; a thin line of light with glow in dark.
- Numbers, money and IDs use `rnr-num` (Geist Mono, tabular).
- Errors appear after the person leaves the field, never on first render.
