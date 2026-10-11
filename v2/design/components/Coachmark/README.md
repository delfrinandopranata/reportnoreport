# Coachmark (tour popover)

One step of the product tour, anchored to an element. `div.rnr-coach[role="dialog"]` with an optional `div.rnr-coach-spot` ring behind it.

## Anatomy
Step count (`.rnr-micro.rnr-coach-count`: "2 of 5") · title (`h2`) · body (`p`) · actions `.rnr-coach-actions`: ghost "Back" and "Skip tour", primary "Next" (or "Done" on the last step). Card radius 14, `--sh-menu`, 320px wide (clamped to the viewport). An arrow (`data-arrow="top|bottom|left|right"`, the side of the popover the arrow sits on) points at the target. The spotlight `rnr-coach-spot` draws a 3px `--focus` ring round the target and dims the rest with `--scrim`; it passes pointer events through.

## Positioning: the one inline-style exception
The tour computes pixel coordinates at run time, so position cannot be a class. Pass them as **CSS custom properties on the `style` attribute and nothing else**: `--coach-top`, `--coach-left` on the popover; `--spot-top`, `--spot-left`, `--spot-width`, `--spot-height` on the spotlight. All values are px. No other property is ever set inline. Below 640px the popover ignores them and docks above the phone bar as a bottom card (no arrow), so a small target never pushes it off screen.

## States
entering (rises 8px over 200ms; none under flat or reduced motion) · step 1 (no Back) · middle · last ("Done") · target missing (centred, no arrow, no spotlight).

## Do
Move focus to the popover on each step and back to the trigger on end. Esc ends the tour. Keep text to two sentences. Let people skip at any time.

## Don't
Don't block the page without a way out. Don't animate the spotlight. Don't hold more than one popover.

## Accessibility
`role="dialog"` (non-modal), `aria-labelledby` the title, `aria-describedby` the body; focus ring ≥ 3:1; targets 44px on coarse pointers; reduced motion removes the entrance; the count is text.

## Copy
"1 of 5" · "Back" · "Next" · "Done" · "Skip tour". Titles are nouns ("Your dashboard"); bodies say what the thing does.
