# Form builder blocks

The form builder's palette, canvas blocks and field editors. Classes `rnr-palette` / `rnr-palette-item`, `rnr-block` (+ `data-selected`, `data-dragging`), `rnr-drop`, `rnr-handle`, `rnr-pick`, `rnr-sign`, `rnr-filter`, `rnr-order`, `rnr-sheet` for the phone palette.

## Blocks
`rnr-block`: radius 14, 1px `--line`, handle · type icon · pick (name + caption) · actions. Selected: `--focus` 1px border + ring + `--tint` fill. Dragging: menu shadow, raised. Drop slot (`rnr-drop`): dashed 2px, radius 14; `data-over` = `--focus` border + tint.
Palette items: 44px, radius 10, 16px icon + label, grab cursor; on phones the palette is a bottom sheet.

## Field editors
Rule editor (`rnr-filter`, radius 14, hairline), reorder list (`rnr-order`, up/down icon buttons), signature pad (`rnr-sign`, 5:2, dashed `--edge` border, radius 10), file input (`input[type=file].rnr-input`).

## States
rest · hover (border to `--line-strong`) · focus-visible · selected · dragging · over (drop) · invalid ("Needs fixing" chip + sentence) · unknown type (name falls back to "Unknown field").

## Do
Every drag has a keyboard path (Space lifts, arrows move, Space drops) and a menu path. Announce moves in a live region.

## Don't
No inline styles for widths; no drag-only controls.

## Accessibility
Handles `aria-label="Move <field>"`; selection is outline + tint, not tint alone; 44px targets on coarse pointers.

## Copy
Types: "Short text", "Long text", "Number", "Date", "File", "Signature". Rule: "Show this field when …".
