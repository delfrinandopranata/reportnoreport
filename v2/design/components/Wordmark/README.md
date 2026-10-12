# Wordmark

The name set in type: "ReportNoReport" in Newsreader with the second "R" struck through. Classes `rnr-wordmark`, `rnr-wordmark-rr`, `rnr-strike`; React: `Wordmark({ href? })`.

## Anatomy
```html
<span class="rnr-wordmark" data-draw role="img" aria-label="ReportNoReport">Report<span>No</span><span class="rnr-wordmark-rr">R<svg class="rnr-strike" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20C8 14 14 8 22 3"/></svg></span>eport</span>
```
Newsreader 500, 20px, −0.02em, opsz 36. Strike: `--strike` 3.2 stroke, round caps, `stroke-dasharray: 60`.

## Motion
With `data-draw` the strike is drawn once (0.7s, after 0.5s). Drawn already under `data-motion="flat"` and reduced motion. No loop.

## Do
Use it in the sidebar tab, the top bar, the landing header and public pages. Keep the casing exactly.

## Don't
Don't redraw it as an image, recolour the strike per surface (it is `--strike`), or set it in Hanken. Never uppercase it (the folder tab uppercases text; the class opts out with `text-transform: none`).

## Accessibility
One announced name via `role="img"`/`aria-label`; the link (if any) goes to the inbox or the home page. Strike ≥ 3:1 on canvas in every combination.

## Copy
"ReportNoReport", one word.
