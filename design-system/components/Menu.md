# Menu

A dropdown of actions anchored to a trigger (account menu, widget overflow, row actions).

Hand-written from `Menu` / `AccountMenu` in `src/ui.tsx`.

## Rules
- 224px wide, `radius-lg`, `line-200` border, `shadow-lg`; opens up or down, left or right of the trigger.
- Items: 14px `ink-label`, 16px icon, hover `surface-200`; destructive items last, after a `line-100` separator, in `danger`.
- Esc and outside click close it; trigger has `aria-haspopup="menu"` and `aria-expanded`.
