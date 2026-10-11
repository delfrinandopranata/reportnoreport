# ReportNoReport v3 tokens (draft): "Paper that moves"

Two orthogonal switches on `<html>`: `data-theme="light|dark"` and `data-accent="midnight|ocean|bw|graphite|fern|rosewood|iris|saffron"`: 8 accents x 2 themes = 16 combinations. One accent per theme, never mixed. Everything reads CSS custom properties (the selectors are plain attribute selectors, so any element can carry them, which `accents-grid.html` uses). The Settings → Appearance panel in `app.html` sets both (Light / Dark / System plus 8 swatches in a native radiogroup, arrow keys move the selection; a check marks the selected one) and stores them in localStorage (`rnr-theme`, `rnr-accent`).
Preview URLs: `?theme=dark`, `?accent=ocean` (any accent), `?panel=appearance` (app), `?t=2800` (landing, jumps the workflow loop to the stamp moment), `?motion=off` (landing, reduced-motion state).

## Neutrals (theme)
| Token | Light | Dark |
|---|---|---|
| canvas / surface / field | #F3F5FA / #FBFCFE / #FFFFFF | #101126 / #1A1A2E / #22233D |
| ink / ink-2 / ink-3 (muted) | #141A2E / #2E3550 / #565C70 | #EEF1FA / #C5CAE0 / #9AA1BE |
| line / soft / perf | ink at .14 / .07 / .20 | #EEF1FA at .14 / .10 / .22 |
| down (error) / down-bg | #A3262E / rgba(163,38,46,.12) | #FF8A93 / rgba(255,138,147,.16) |
| focus ring (2-3px, 2px offset) | ink #141A2E | #EEF1FA |
| wash opacity | .50 | .34 |
Black & White overrides the neutrals: canvas/surface #FFFFFF, ink #000000, muted #595959 (7.0:1), hairlines and borders hard 1px #000000 (`line-200`); dark: canvas #000000, surface #0A0A0A, ink #FFFFFF, muted #A6A6A6, borders #FFFFFF. Shadows become hard: folders get a 1px solid outline (four `drop-shadow(±1px 0 0)`), the landing window gets `0 0 0 1px, 6px 6px 0` and the Appearance overlay gets outline plus `drop-shadow(6px 6px 0)`. No glass, no soft shadows. Stamp and strike are black (light) or white (dark). Wash is greyscale at .16 / .14 opacity.

## Accent tokens
Common to each accent: `acc` = `linear-gradient(120deg, a, b)`, `on-acc` text colour, `chip-bg / chip-fg` (arrow chip, step number), `pill-dot`, `strike` (wordmark), `stamp` (also the link-on-paper colour), `ok-ink` (status text), `tint` (pending, trend up), `pulse / trail / halo`, `wash a / b / c` (rgb).


### Midnight ink
| Token | Light | Dark |
|---|---|---|
| acc start | #2453D6 | #2453D6 |
| acc end | #16204A | #16204A |
| on-acc | #FFFFFF | #FFFFFF |
| strike | #2453D6 | #8DAAFF |
| stamp / link | #1E3A8A | #8DAAFF |
| ok-ink | #1E3A8A | #A9C0FF |
| tint | #2453D6 at 0.12 | #8DAAFF at 0.18 |

### Ocean glow
| Token | Light | Dark |
|---|---|---|
| acc start | #1AA7FF | #1AA7FF |
| acc end | #2FE3A0 | #2FE3A0 |
| on-acc | #0B1226 | #0B1226 |
| strike | #006E96 | #5CD6FF |
| stamp / link | #006E96 | #6FD8FF |
| ok-ink | #005C80 | #7FD3FF |
| tint | #1AA7FF at 0.14 | #1AA7FF at 0.2 |

### Black & White
| Token | Light | Dark |
|---|---|---|
| acc start | #000000 | #FFFFFF |
| acc end | #000000 | #FFFFFF |
| on-acc | #FFFFFF | #000000 |
| strike | #000000 | #FFFFFF |
| stamp / link | #000000 | #FFFFFF |
| ok-ink | #000000 | #FFFFFF |
| tint | #000000 at 0.08 | #FFFFFF at 0.14 |

### Graphite
| Token | Light | Dark |
|---|---|---|
| acc start | #5B6475 | #5B6475 |
| acc end | #1F2633 | #1F2633 |
| on-acc | #FFFFFF | #FFFFFF |
| strike | #5B6475 | #AEB6C6 |
| stamp / link | #2F3747 | #B7BECC |
| ok-ink | #2F3747 | #C9CFDB |
| tint | #5B6475 at 0.14 | #AEB6C6 at 0.18 |

### Fern
| Token | Light | Dark |
|---|---|---|
| acc start | #14805A | #14805A |
| acc end | #0E5A43 | #0E5A43 |
| on-acc | #FFFFFF | #FFFFFF |
| strike | #178A5B | #4FD39A |
| stamp / link | #0E5A43 | #5BDBA6 |
| ok-ink | #0B5A3F | #7FE3B8 |
| tint | #22A06B at 0.14 | #22A06B at 0.22 |

### Rosewood
| Token | Light | Dark |
|---|---|---|
| acc start | #CC3A53 | #CC3A53 |
| acc end | #7A1E33 | #7A1E33 |
| on-acc | #FFFFFF | #FFFFFF |
| strike | #CC3A53 | #FF8FA3 |
| stamp / link | #8F2238 | #FF9DAF |
| ok-ink | #8F2238 | #FFB3C0 |
| tint | #D9485F at 0.12 | #D9485F at 0.22 |

### Iris
| Token | Light | Dark |
|---|---|---|
| acc start | #6E4EF0 | #6E4EF0 |
| acc end | #3B2A8C | #3B2A8C |
| on-acc | #FFFFFF | #FFFFFF |
| strike | #6E4EF0 | #B4A2FF |
| stamp / link | #4A34B0 | #BBA9FF |
| ok-ink | #42308F | #CBBEFF |
| tint | #7C5CFA at 0.12 | #7C5CFA at 0.22 |

### Saffron
| Token | Light | Dark |
|---|---|---|
| acc start | #F7C948 | #F7C948 |
| acc end | #E39B12 | #E39B12 |
| on-acc | #141A2E | #141A2E |
| strike | #8A5A00 | #F7C948 |
| stamp / link | #7A4F00 | #F7C948 |
| ok-ink | #6B4500 | #F7C948 |
| tint | #F7C948 at 0.28 | #F7C948 at 0.18 |

Chip, dot, pulse and wash colours per accent are in the `[data-accent]` blocks of `app.html` / `landing.html` (single source; same recipe for all). Rosewood error treatment below.

## Error stays distinct in Rosewood
Rosewood's accent is red-pink, so errors cannot be red there. `--down` becomes an orange-red (#B33A0A light, #FFA27A dark) on a pale orange tint, and every error chip carries a warning icon plus the word "Error" with a 1.5px outline (`box-shadow: inset 0 0 0 1.5px currentColor`), so it is never colour-only. In the other accents errors use the deep red (#A3262E / #FF8A93) with the same icon, word and outline; in Black & White they are black or white with the outline and word. Contrast: default down on surface 7.12 light / 7.56 dark (on its tint 5.82 / 5.67); Rosewood orange-red on surface 5.80 light / 8.69 dark (on its tint 4.84 / 6.08).

## Contrast: all 16 combinations (WCAG, computed)
Pairs: text on the lightest accent end (on-acc vs start and end of the gradient, body needs 4.5), stamp / link on surface (4.5), status text on its tint (4.5), wordmark strike on canvas (UI, 3), focus ring on canvas (UI, 3). Muted text on canvas: 6.09 light, 7.27 dark in every colour accent; 7.0 / 8.6 in Black & White.
| Accent / theme | on-acc vs start | on-acc vs end | stamp / link on surface | status on tint | strike on canvas | focus ring on canvas |
|---|---|---|---|---|---|---|
| Midnight ink light | 6.4 | 15.68 | 10.09 | 8.44 | 5.86 | 15.82 |
| Midnight ink dark | 6.4 | 15.68 | 7.58 | 6.71 | 8.25 | 16.46 |
| Ocean glow light | 7.1 | 11.18 | 5.57 | 6.31 | 5.24 | 15.82 |
| Ocean glow dark | 7.1 | 11.18 | 10.51 | 7.4 | 11.08 | 16.46 |
| Black & White light | 21.0 | 21.0 | 21.0 | 17.62 | 21.0 | 21.0 |
| Black & White dark | 21.0 | 21.0 | 19.8 | 13.97 | 21.0 | 21.0 |
| Graphite light | 5.96 | 15.18 | 11.63 | 9.65 | 5.46 | 15.82 |
| Graphite dark | 5.96 | 15.18 | 9.14 | 7.57 | 9.12 | 16.46 |
| Fern light | 4.92 | 8.2 | 7.98 | 6.91 | 3.99 | 15.82 |
| Fern dark | 4.92 | 8.2 | 9.85 | 8.19 | 9.84 | 16.46 |
| Rosewood light | 4.89 | 10.19 | 8.34 | 7.12 | 4.48 | 15.82 |
| Rosewood dark | 4.89 | 10.19 | 8.69 | 8.0 | 8.59 | 16.46 |
| Iris light | 5.24 | 11.08 | 8.49 | 8.61 | 4.8 | 15.82 |
| Iris dark | 5.24 | 11.08 | 8.31 | 7.75 | 8.45 | 16.46 |
| Saffron light | 11.01 | 7.37 | 6.94 | 7.33 | 5.43 | 15.82 |
| Saffron dark | 11.01 | 7.37 | 10.89 | 7.11 | 11.86 | 16.46 |

All 16 rows pass 4.5:1 for text pairs and 3:1 for UI pairs. Not a text-contrast failure but worth knowing: the gradient start against the page is below 3:1 for Ocean glow light (2.4), Saffron light (1.4), and for the dark Midnight (2.9), Graphite (3.1), Rosewood (3.8) and Iris (3.6) fills (the last three pass 3). Buttons are identified by their label (7:1 and above), not by the fill edge.

## Wash (landing background, replaces the ribbon)
Fixed layer `z-index:-1`, three DOM blobs (58vw, 50vw, 42vw), each `radial-gradient(circle, rgba(wash-x,.7-.85), transparent 68%)`, `filter: blur(70px)`, `opacity: var(--wash-op)`. Container mask `linear-gradient(90deg, transparent 0, rgba(0,0,0,.12) 36%, #000 60%)` keeps the left 36% (headline and body copy) clean. Drift is `transform: translate3d + scale` only, 24 / 30 / 27 s `ease-in-out infinite alternate`, compositor-only (blur is rasterised once). Static under `prefers-reduced-motion` and `?motion=off`. Each accent supplies `wash-a/b/c`.

## Type
Fraunces (display; `"SOFT" 100, "opsz" 144`, weight 450, italic accent), Hanken Grotesk (UI), IBM Plex Mono (figures, micro-labels, run log, stamp). Hero 52-96 (clamp), H2 40-68, page title 44-64, KPI figure 40 mono, body 16/1.55, small 14, micro 11 mono caps +.14em, wordmark 20 Fraunces 500.

## Shape, paper, folder tab
pill 999 · card 22 · inner 14. Folder body radius `0 22 22 22`; tab 32px (sidebar 44px, nodes 22px), radius `14 14 0 0`, concave shoulder via `radial-gradient(circle at 100% 0, transparent 13.5px, surface 14px)`. Tab is `min-width:max-content` with 16px side padding, so it always fits its label. KPI body has 32px top padding; perforation sits 11px below the body edge. Paper: stacked `drop-shadow` filters via `--fshadow / --nshadow / --ncshadow / --oshadow` (swapped for hard outlines in Black & White).

## Motifs and motion
Wordmark strike draws once (.7s, .5s delay). Stamp: Plex Mono caps, 2px border, dashed inner border, -11deg, turbulence texture; thump scale 2.2 to .92 to 1 in 450ms when the pulse reaches Ask HR (6.2s loop, every third loop takes the log branch); static on the "Done this week" tile and in the Appearance preview. Pulse: accent head with halo plus two trail dots. Durations: fast 150, base 240, slow 700, bars 1100, pulse 1.0 s then 1.2 s, ticker 2.4 s. Easing cubic-bezier(.2,.7,.2,1). Reduced motion: no wash drift, pulse, ticker or stamp animation; strike drawn; content visible.

## Sizes and icons
Touch target 44px, input 48, sidebar 248, form card 640, Appearance panel 420 (8 swatches in 4 columns), page max 960. Phosphor regular, 20px nav (mockup: @phosphor-icons/web@2.1.1; production: per-icon `@phosphor-icons/react`).
