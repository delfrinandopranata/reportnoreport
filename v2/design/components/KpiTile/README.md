# KPI tile

A single headline figure: a folder tab with the label, a mono figure, an optional caption or trend. Classes `rnr-kpi-tile` (on a `rnr-folder`), `rnr-kpi-figure`, `rnr-trend`; React: `KpiTile({ label, value, caption? })`. The old `rnr-kpi` stays as an alias of `rnr-kpi-figure`.

## Anatomy
Tab (label) · perforation · figure (IBM Plex Mono 500, 40/44, −0.02em, tabular numerals) · caption or trend chip. Stamp optional (`rnr-stamp--corner`).

## Variants
Figure only · figure + caption ("1,092 of 1,270 people") · figure + trend (`data-dir="up|down|flat"`) · empty (`data-empty`: "No data yet", 16px, `--ink-3`, same 44px line so tiles stay level).

## States
Static. In a dashboard the tile is a widget (see Widget) with the usual editing / overlay / placeholder states.

## Do
Show the figure the way tables do: thousands separators, one decimal for percentages, `<1%` for a non-zero share under 1%.
Use a trend only when a real comparison exists; **no trend chip appears in the app today**, so none is invented.

## Don't
Don't colour the figure. Don't put two figures in one tile. Don't use a tile for a table row.

## Accessibility
Wrap tiles in `<section aria-label="Summary">` or a list; each tile is `aria-label="Open records"`-style or reads label then figure in DOM order (tab first). Trend chips carry an arrow icon and a word/sign; "worse" is spoken, not only red.

## Copy
Label: plural noun ("Open records"). Caption: what the figure is out of. Percentages: "86%", "<1%".
