# Widget

A dashboard card that can be dragged, resized (Small / Medium / Full width) and removed in "Edit layout" mode.

Hand-written from `Card` in `src/Dashboard.tsx` (dnd-kit sortable).

## States (`data-state`)
| State | Look |
|---|---|
| idle | `line-200` border, `shadow-xs`, `radius-2xl`, padding `space-5` (compact `space-4`). |
| `editing` | `line-300` border, `shadow-sm`, 4px faint ring; grip handle and resize / remove icon buttons appear; the body is non-interactive. |
| `overlay` | The copy under the pointer: rotate 1deg, `shadow-2xl` (B&W: hard 6px offset shadow; flat motion: no tilt). |
| `placeholder` | Dashed `line-300`, `opacity-placeholder`. |

## Rules
- Title: 14/500 `ink-muted`, truncates. Figure: `kpi` style, tabular numerals, ISO currency.
- Spans: 1 column, `sm:` 2, `lg:` 4. On mobile every widget is full width and reordering uses the keyboard/“Move up/down” menu as well as drag.
- Drag handle: `aria-label="Drag <title>"`, keyboard sortable (Space to lift, arrows, Space to drop); 44px hit area on touch.
- Style modes re-skin the surface only (glass, neumorphic); content and spacing never change.

## The consumer provides
Title, body (a KPI, chart, list or form), optional chip such as "Includes sample data".
