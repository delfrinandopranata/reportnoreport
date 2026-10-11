# Segmented control

One choice from 2–4 short options (Theme, Density, Map / List, widget width). Class `rnr-seg` with `button[role=radio|aria-pressed]` items, or native radios in `label.rnr-seg-i`.

## Shape (concentric corners)
Track radius `--r-track` = **14px** (12px compact), 4px padding, item radius = track − 4px = **10px** (8px compact). The selected item is filled with `--acc` and `--on-acc` (ink in Black & White).

## Sizes
Item height `--ctl-h − 8px` (36px comfortable, 28px compact, 36px+ on coarse pointers because `--ctl-h` becomes 44).

## States
rest (item `--ink-2` on `--soft`) · hover (item lifts to `--surface`) · focus-visible (3px ring) · selected (`aria-checked="true"` / `aria-pressed="true"` / `:checked`) · disabled (40%).

## Do
Use native radios for Theme-style settings (arrow keys come free). Use `role="group"` with `aria-pressed` for view toggles. Four options wrap to two columns below 640px.

## Don't
Don't use it for navigation (use Tabs) or for more than four options (use a select).

## Accessibility
Selected state is fill + weight, never fill alone for the only cue in B&W (ink fill). Radiogroups have an accessible name (`aria-label` or `legend`).

## Copy
One or two words, sentence case: "Comfortable", "Compact", "Map", "List".
