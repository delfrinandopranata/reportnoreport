# Canvas

The drag-and-drop board for the form, dashboard and report builders: a palette of blocks on the left, a dotted board with drop zones on the right.

v2 addition designed from the brief; it extends the dashboard's dnd-kit pattern (`src/Dashboard.tsx`) to free-form building.

## Parts
- `.rnr-canvas` — `surface-canvas` with a 16px `chart-grid` dot grid (the snap pitch), `radius-2xl`.
- `.rnr-block` — a palette item or a placed block; `radius-xl`, hover raises to `shadow-sm`, selected uses a `focus-ring` border (`aria-selected="true"`).
- `.rnr-drop` — a dashed `line-300` zone; `data-over="true"` while a block hovers it (border `focus-ring`, fill `surface-200`).

## Rules
- Every drag has a keyboard path (select, then Move up/down/to section) and a touch path (long-press 200ms to lift).
- Snap to the 16px grid; announce moves with a live region ("Leave type moved to position 2 of 5").
- On phones the palette becomes a bottom sheet and blocks stack in one column.
- Flat motion: blocks jump into place, no settle animation.

## The consumer provides
Block definitions (icon, name, description), the ordered placed blocks, selection and drop handlers.
