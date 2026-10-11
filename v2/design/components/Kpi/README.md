# Kpi

A metric card: mono uppercase label, a large mono figure, a delta pill with context, and a sparkline. No icon tiles and no ↗ buttons — the whole card is the link (`.rnr-card.is-link`) when it opens a detail view.

## Anatomy
`.rnr-card` → `.rnr-card-head > .rnr-card-title` (mono, uppercase) → `.rnr-kpi` (Geist Mono 32/36, tabular; unit in `<small>`) → `.rnr-kpi-foot` with `.rnr-delta` (`is-up` / `is-down`) and one line of context → `.rnr-spark` in `in` colour.

## Rules
- The figure is the hero; never put an icon square beside it.
- Deltas carry a sign and a unit; colour is a second cue, not the only one.
- Sparklines draw in once (`is-draw`, skipped in flat motion) and never animate again.
