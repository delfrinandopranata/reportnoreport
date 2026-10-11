# Segmented

A pill track holding 2–5 options. The same component is used for page tabs (`.rnr-tabs` + `.rnr-tab` links) and for choices (`role="radiogroup"`) and view toggles (`aria-pressed`).

## Rules
- Selected item: a raised pill (`surface-100` with the inner highlight) in light; a lumen-outlined graphite pill in dark.
- Never an underline tab and never a coloured fill for the selected item.
- Radio groups use roving tabindex and arrow keys; tabs are links with `aria-current="page"`.
