# Stamp

An approval or rejection mark on a record. `rnr-stamp`; React: `Stamp({ label })`. Decoration only.

## Anatomy
Mono 12px caps (+.16em), 2px `--stamp` border, 1px dashed inner border at 70%, radius `--r-key` 6px, rotated −11°, roughened by an SVG turbulence filter. Sizes: default, `rnr-stamp--sm`; position `rnr-stamp--corner` (absolute top-right of a tile or record header).
Include the filter once per document (it is graceful if missing: no filter is applied):
```html
<svg width="0" height="0" aria-hidden="true"><filter id="rnr-rough"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.6"/></filter></svg>
```

## Where it appears
A record whose status is approved ("Approved") or rejected ("Rejected"), beside the existing status mark; the Appearance preview; the landing. **Never animates in the app.** The landing's thump (`data-thump`, scale 2.2 → .92 → 1 in 450ms) is the only motion and is removed under reduced motion.

## Accessibility
`aria-hidden="true"`: the word and icon of the status mark carry the meaning (stamp colour ≥ 4.5:1 on surface and canvas in all 16 combinations, but it is still not a state indicator). In Black & White it is ink with the same border.

## Don't
Don't stamp drafts or pending items; don't recolour per status; don't put two stamps on one record.

## Copy
"Approved" or "Rejected", one word, matching the status word.
