# Segmented

A pill track of 2–4 mutually exclusive options: In/Out, Comfortable/Compact, report period, appearance modes.

Hand-written from the In/Out picker in `src/ui.tsx` (`TxnForm`) and the density toggle in `src/table.tsx`.

## Rules
- Track: `surface-200`, `space-1` padding, `radius-lg`. Selected segment: `surface-100` + `shadow-sm` (B&W: inverted, `ink` fill).
- As a choice in a form use `role="radiogroup"` + `role="radio"`/`aria-checked`, roving tabindex, arrow keys move. As a view toggle use buttons with `aria-pressed`.
- In/Out segments colour the selected label `in` / `out` and always show the arrow icon.
- More than 4 options → use a select.
