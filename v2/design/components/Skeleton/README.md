# Skeleton

The shape of content that is on its way. `rnr-skeleton`.

## Anatomy
`--soft` block, radius 8, a shimmer sweep (1.2s, linear) that is removed under flat motion and reduced motion.

## Do
Paint skeletons the instant a view opens (feedback within 400ms) in the exact shape of what will arrive: a card with a tab, a table with rows. Mark the region `aria-busy="true"`.

## Don't
Don't skeleton text that is already known (titles). Don't leave a skeleton in place after an error: show the error empty state.

## Accessibility
Skeletons are `aria-hidden`; the container announces busy. No content changes on arrival except the swap.

## Copy
None.
