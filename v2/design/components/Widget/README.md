# Widget

A dashboard card that can be dragged, resized (1, 2 or 4 columns) and removed in Edit layout mode. Its content is usually a `Kpi`, a `Meter`, a chart or a list.

## States (`data-state`)
| State | Look |
|---|---|
| idle | Glass card, `radius-xl`, `shadow-card`. |
| `editing` | Dashed hairline border; a grip handle and a remove button appear. |
| `overlay` | The copy under the pointer: 1° tilt and `shadow-lg` (plus a lumen ring in dark). |
| `placeholder` | Dashed outline, transparent. |

Every drag has a keyboard path (Space to lift, arrows, Space to drop) and a menu path.
