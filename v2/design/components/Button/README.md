# Button

Every button is a pill: one primary per view, secondary for alternatives, ghost for toolbars, danger for destructive steps.

## Variants
| Class | Use when |
|---|---|
| `rnr-btn rnr-btn-primary` | The one committing action. `brand-solid` (charcoal in light, light in dark) with a soft lift shadow; in dark a faint lumen glow. |
| `rnr-btn rnr-btn-secondary` | A real alternative. Glass pill with a hairline and inner highlight. |
| `rnr-btn rnr-btn-ghost` | Toolbars and rows. No fill until hover. |
| `rnr-btn rnr-btn-danger` | Remove, Delete — always with a word. |

## States
- Hover (pointer devices only): primary lifts 1px and brightens; others gain a hairline or a track fill. `duration-hover`.
- Press: scale 0.97 on the spring curve.
- Busy: `aria-busy="true"` plus `rnr-spin`; the button stays focusable. Don't disable a submit to block it — validate on click.
- Focus: 2px `focus-ring` outline in light; a lumen line with glow (`shadow-lumen`) in dark.

## Don't
- Don't use a blue fill or an underline link style for actions.
- Don't place two primaries side by side.
