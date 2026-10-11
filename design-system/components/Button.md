# Button

The action trigger: one primary per view, secondary for alternatives, ghost for toolbars, danger for destructive steps.

Hand-written from `src/ui.tsx` (`btn.primary`, `btn.ghost`, `btn.danger`); the secondary variant is the landing page's outlined CTA brought into the app.

## Variants
| Class | Use when |
|---|---|
| `rnr-btn rnr-btn-primary` | The one committing action (Post receipt, Save form, Publish report). `brand-solid` fill, `brand-solid-ink` text, `shadow-sm`. |
| `rnr-btn rnr-btn-secondary` | A real alternative (Export, Preview). `line-300` border. |
| `rnr-btn rnr-btn-ghost` | Toolbars, widget headers, table controls. `ink-muted` until hover. |
| `rnr-btn rnr-btn-danger` | Remove, Delete, Suspend — always with a word, never an icon alone. |

## States
- Hover: primary lifts 2px (`duration-base`) and drops to 90% opacity; ghost/secondary fill `surface-200`. Flat motion: no lift.
- Press: scale 0.98 (solid/glass) or swaps to `shadow-neu-inset` (neumorphic).
- Disabled: `opacity-disabled`, `cursor: not-allowed`; pair with `aria-busy` and a verb in -ing while saving ("Posting…").
- Saved: swap the icon to `check` and the label to the past tense for 1.6s, then back.
- Focus: `focus-ring` 2px outline, 2px offset.

## The consumer provides
Label text (British English, sentence case, verb first), optional leading icon (16px), `type`, `disabled`/`aria-busy`.

## Do / Don't
- Do keep height to the density's `control-h` / `control-h-compact`.
- Don't place two primaries side by side; don't use colour alone to mark danger.
