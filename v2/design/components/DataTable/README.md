# Table

Sortable, scannable records. `rnr-table-card` (container) > `rnr-table`; `rnr-th-sort`, `rnr-pager`, `rnr-empty`; modifiers `rnr-table--sticky`, `rnr-sticky-first`, `rnr-table-bare`, `rnr-results`, `rnr-cell`, `.num`.

## Anatomy
Container: card radius 14, 1px `--line`, `overflow-x: auto`, padding 0. Header cells: micro mono caps, `--ink-3`. Cells: 14px, `--row-pad` (12px comfortable, 8px compact) × 16px, hairline `--soft` between rows. Numbers: `.num` right-aligned, IBM Plex Mono, tabular. Row header: first cell is `th scope="row"` (the record's name).

## Variants
Plain · sortable (a `button.rnr-th-sort` in the `th`, `aria-sort` on the `th`, a Phosphor sort icon) · sticky header (`rnr-table--sticky` inside a scroll container) · sticky first column below 640px (`rnr-sticky-first`) · bare inside a widget (`rnr-table-bare`) · footer totals (`tfoot`) · selected row (`aria-selected="true"`, `--tint`).

## States
rest · hover (row wash `--hover`, only on hover devices) · focus-visible (3px ring inset on a row that is a link) · selected · loading (skeleton rows) · empty (`rnr-empty` in the card, kind: no results / filtered out) · error (empty with "Try again").

## Pager
`rnr-pager`: Previous / "Showing 1–3 of 248" / Next / page size. Unavailable ends use `aria-disabled="true"`, never `disabled`.

## Density
Compact tightens `--row-pad`. Columns are never narrower than 96px (`rnr-results`). Long text wraps (`rnr-cell`, max 24rem).

## Do
Left-align labels, right-align numbers and dates in mono. Give every table a `caption` (visually hidden is fine). Show status as `rnr-status`.

## Don't
Don't put `flex` on a `td` (the utility wins, but it breaks table layout): wrap the content in a `div`. Don't nest a card inside a table card. Don't truncate names; wrap.

## Accessibility
`scope` on headers, `aria-sort` on the sorted column, rows that navigate are links not click handlers, sr-only cells need the positioned container (`rnr-table-card` already is). Header contrast `--ink-3` on `--surface` ≥ 4.5:1.

## Copy
Headers: nouns, sentence case in the markup (the CSS capitalises). Empty: "No records match" + one next step.
