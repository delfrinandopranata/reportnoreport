# Progress and spinner

`<progress class="rnr-progress">` (native, determinate or indeterminate) and `rnr-spin` (16px ring).

## Anatomy
8px bar, radius `--r-bar` 3px, `--soft` track, `--acc` fill (width transitions 700ms; none under flat). Indeterminate slides a 30% segment (static under reduced motion).

## States
determinate · indeterminate · complete (hold at 100% then replace with the result). The spinner runs even under flat motion (slowed to 1.4s): it is feedback, not decoration.

## Do
Label every bar ("Rendering PDF, 60%") with a visible or `aria-label` name. Use the spinner inside a busy button, a bar for work longer than ~2s.

## Don't
Don't fake progress. Don't use a spinner for a whole page (use Skeleton).

## Accessibility
Native `progress` semantics; the spinner has `role="status"` and a name when it stands alone.

## Copy
"Saving…", "Rendering PDF…"; never "Please wait".
