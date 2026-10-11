# Landing primitives

For the public home page only. Classes `rnr-wash`, `rnr-wash-blob`, `rnr-window`, `rnr-rise`, `rnr-pulse`, `rnr-trail`, `rnr-halo`, `rnr-ticker`, plus `rnr-stamp[data-thump]`.

## Wash
A fixed layer behind the page (`z-index: -1`): three blurred blobs from each accent's `--wash-a/b/c`, masked so the left 36% (headline and copy) stays clean, opacity `--wash-op` (.5 light, .16 Black & White). Rasterised once; only `transform` drifts (24 / 30 / 27 s alternate). Never under text.

## Window
The tilted hero window: radius 20, perforation, `perspective(1400px) rotateX(4deg) rotateY(-9deg)`, flat below 900px. Contains the inline SVG workflow, the pulse (accent head + halo + two trail dots moved with `setAttribute`), the stamp (thump at Ask HR) and the "Last runs" ticker (a new `runLine` every 2.4s).

## Reveal
`.rnr-rise` fades and lifts 14px when `.in` is added by an `IntersectionObserver`; content is hidden **only after `html.js` is set**, so the page is complete without JavaScript.

## Reduced motion
`prefers-reduced-motion`, `data-motion="flat"` and `?motion=off`: no drift, pulse, ticker, typing or stamp animation; the strike is drawn; everything visible and in its final state.

## Rules
Light theme only; the accent follows the visitor's stored choice, else Midnight. Only `transform` and `opacity` animate (no `filter: blur` animation). Targets: LCP < 2.5s, CLS < 0.05 (headline is the LCP element, rendered with the metric-matched fallback face first).

## Don't
No canvas library, video or third-party logos. Pricing shows `[TBD price]` until the owner supplies prices.

## Accessibility
Decorative layers are `aria-hidden`; one `h1`; the workflow loop has a text equivalent in the copy.

## Copy
Marketing copy may use "we"; this plan's landing does not need to.
