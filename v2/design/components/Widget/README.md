# Widget and dashboard grid

A dashboard card. `rnr-card` with `rnr-card-head` (`rnr-handle`, `rnr-card-title`, menu) in `rnr-grid` (1 column; 2 from 640px; 4 from 1024px; nine or more widgets tighten the gap). Widgets span 1, 2 or 4 columns.

## States (`data-state`)
rest · editing (`editing`: stronger hairline + 4px soft ring) · overlay (`overlay`: dragged, tilt 1°, menu shadow; no tilt under flat motion) · placeholder (`placeholder`: dashed, 40% opacity) · empty (`rnr-kpi-figure[data-empty]`) · loading (skeleton shaped like the widget) · error (empty state inside).

## Edit mode
Drag by the handle (44px on coarse pointers) or by keyboard (Space lifts, arrows move, Space drops); a menu offers Move up / Move down / Change width (`menuitemradio`, tick + weight for the current). Moves are announced in a live region. Unsaved changes are guarded.

## Do
Let titles wrap (`overflow-wrap: anywhere`); never truncate a widget name. KPI widgets become KPI tiles.

## Don't
No hover-only actions; no chart without a text alternative.

## Accessibility
`h3` titles under the page `h2`; grid has no ARIA table semantics. Handles have `aria-label="Move widget, <title>"`.

## Copy
Widget titles are plain nouns ("Leave days by team"). Link: "Open report".
