# Charts

Hand-rolled SVG: bar, line, and the number tile. Geometry stays in SVG attributes (`chart.ts`); this spec is colour, type and interaction.

## Series
`--series-1` = the accent's `strike` value, tested ≥ 3:1 on paper. `--series-2` = `--ink-3`, drawn **dashed with square markers** (`<rect class="rnr-chart-mark">`), so the two never depend on colour. In Black & White, series-2 bars are hatched (`fill: url(#rnr-hatch)`; define the `#rnr-hatch` `<pattern>` once per document, see `design/preview.html`). Gridlines `--chart-grid` (= `--soft`), axes `--ink-3`, values `--ink`, mono 11px.

## Anatomy
`<figure>` > `figcaption` (title) > `<svg class="rnr-chart" viewBox role="img" aria-labelledby="title desc">` (`title`, `desc`, grid, bars `rnr-chart-bar` or `rnr-chart-line` + `rnr-chart-dot`, axis labels, optional `rnr-chart-tip`) > legend (`rnr-chart-legend`, with each series's marker and line style) > "Show as table" toggle revealing a `rnr-table` of the same data.

## States
rest · hover/focus on a datum (`data-active`: 2px `--focus` stroke, the others dim to 40% under full motion) · empty ("No data yet") · loading (skeleton) · narrow (labels thin out; table alternative stays).

## Do
Describe the finding in `desc` ("Thursday is highest at 22"). Format numbers like tables (mono, thousands separators). A tooltip sits on paper (`--surface`, 1px `--line-strong`).

## Don't
No pie charts, no 3D, no gradient fills, no more than two series, no colour as the only difference.

## Accessibility
`role="img"` with title and description plus the table alternative; the hit areas (`rnr-chart-hit`) are keyboard-reachable; marks are 8–10px.

## Copy
Titles name the measure and the span: "Opens and clicks, first 7 days". Percentages: "86%", "<1%".
