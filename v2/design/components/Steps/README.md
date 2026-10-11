# Steps

Named form steps. `rnr-steps` (`ol`) > `rnr-step` (`li`) with `rnr-step-n`; React: `Steps({ labels, current })`.

## Anatomy
Step row (44px, radius **10**, 6px inner padding) containing a 32px number square (radius 8) and the label. The row scrolls sideways on phones.

## States
upcoming (`--soft` square, `--ink-3` label) · current (`aria-current="step"`: `--acc` fill, `--on-acc`, the number uses the contrast-tested chip `--chip-bg`/`--chip-fg`) · done (`data-done`: accent square with a check icon, `--ink-2` label) · error (`data-error`: 1.5px outlined square with "!" and a sentence elsewhere).

## Do
Name each step from its page break's label; fall back to "Step N". Show steps only when the form has more than one visible page. Scroll the current step into view on phones.

## Don't
Don't show steps for a one-page form; don't skip ahead by clicking unless that page is valid.

## Accessibility
`ol` with `aria-current="step"`; the number is not announced twice (label text includes meaning). Colour is never alone: done has a check, current has the fill and the position.

## Copy
Labels are short nouns: "Your details", "Dates", "Sign".
