# Meter

A segmented bar that shows how a total splits, with a mono legend underneath. It replaces donut charts.

## Rules
- Order segments good → neutral → bad → empty: `m-in`, `m-ink` (55%), `m-out`, `m-rest`.
- Lead with the one number that matters as a `.rnr-kpi`; the legend gives the rest, right-aligned in mono.
- Give the bar `role="img"` and an `aria-label` that reads the counts.
- In Black & White the `out` segment becomes a hatch.
