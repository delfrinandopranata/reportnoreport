# ReportNoReport v2 design system: "Paper that moves"

The single authoritative design system for every screen of v2 (the app under `/app/`, the public site, the emails' look). Phase 7 replaced the zinc / Inter / preset / glass / neumorphic system wholesale. Where a screen spec or a plan differs from this folder on a visual, copy or accessibility point, **this folder wins**.

| File | What it is |
|---|---|
| `tokens.json` | The source: two themes, eight accents × light and dark, type, shape, space, motion, layers, sizes |
| `tokens.css` | Generated from `tokens.json` by `node scripts/build-tokens.mjs`; custom properties keyed on `<html>` attributes |
| `components/bundle.css` | Every `rnr-*` class, in `@layer components`; reads tokens only |
| `components/<Name>/README.md` | Anatomy, variants, sizes, states, do / don't, accessibility, copy for 31 components |
| `preview.html` | Living preview of every component in every state, with a theme / accent / density / motion switcher |
| `screens/*.png` | Screenshots of the preview (midnight light and dark, saffron light, Black & White dark) |
| `fonts/`, `icons/` | The OFL fonts and the Phosphor subset the previews use (production gets both from npm) |

Tests: `pnpm test` runs `scripts/tokens.test.mjs`: WCAG contrast for all 16 accent × theme combinations, `tokens.css` ↔ `tokens.json` parity, the corner scale, "bundle.css reads only tokens", "every custom property it uses exists", the layer rule, and "every component has a README and a preview". Previews are rebuilt with `node scripts/build-previews.mjs`.

## 1. Principles
1. **Paper, not glass.** Surfaces are paper: a quiet fill, a hairline, a faint perforation. No blur, no neumorphism, no gradients except the accent fill.
2. **One accent, used sparingly.** The accent marks the primary action, the current place, steps, KPI bars, avatars, the strike, the stamp and chart series 1. Never body text on paper.
3. **Colour is never alone.** Status keeps its word and icon; the stamp, accent and series colours are additions. In Black & White an error is ink with an outline, a word and an icon.
4. **Names over chrome.** A section has a folder tab; a form has named steps; a number has a mono figure and a label.
5. **Apple's corners.** 10 for controls, 14 for cards, 20 for panels, circles only for avatars; nested corners are concentric; smooth continuous corners where the browser supports them.
6. **Motion explains.** Only `transform` and `opacity`; everything stops under reduced motion; the app never decorates with motion.
7. **Behaviour before beauty.** The design changes classes, wrappers and icons, never queries, permissions, routes, copy (unless a spec names it), focus or validation.

## 2. Content fundamentals
- **British English**: organisation, colour, centre, licence, enrol. "Organisation", never "Company". Sentence case everywhere: buttons, titles, menu items, tabs.
- **Verb first, name the object**: "Publish form", "Invite member", "Send invite". While it runs, the -ing form ("Saving…"); afterwards, past tense ("Saved").
- **No "we"** in product copy (including errors, the 404 and Appearance captions). Address the reader as "you" and the organisation as "your organisation". The marketing site may use "we"; the Phase 7 landing does not need to.
- **Errors say what to do**, in plain words: "Enter a number of days.", "This was changed by Alice at 3 pm. Reload to see their changes." Never a raw code, never "Something went wrong" when something specific is known.
- **Empty states** give the next step; four kinds (first run, no results, filtered out, error), one action each.
- **Money** is the ISO code and two decimals, never a symbol: "MYR 1,250.00", negatives with a true minus "−MYR 75.50". **Dates** show as the settings format them ("12 Oct 2026"); inputs use ISO `YYYY-MM-DD`. Times use the 24-hour clock unless the settings say otherwise. Percentages: "86%", "<1%" for a non-zero share under 1%.
- No emoji. No exclamation marks in errors. The brand line is "Report without complicated reporting."

## 3. Colour
Two orthogonal attributes on `<html>`: `data-theme="light|dark"` (System resolves to one of them and is re-resolved when the OS changes) and `data-accent="midnight|ocean|bw|graphite|fern|rosewood|iris|saffron"`. Default: System + Midnight ink.

**Neutrals (theme)**: `--canvas` (page), `--surface` (paper, folders, cards, menus), `--field` (inputs, secondary buttons), `--side` (sidebar and phone bar backing), `--ink` / `--ink-2` / `--ink-3` (text: primary, label, muted; placeholder is `--ink-3`), `--line` (hairlines), `--soft` (washes, tracks, hover), `--line-strong` (decorative stronger rule, secondary button border), `--edge` (the border of a form control, ≥ 3:1), `--perf` (perforation dots), `--focus` (ring), `--scrim`, shadows (`--sh-float`, `--sh-menu`, `--sh-dialog`, folder `--fshadow`).
**Status**: `--down` / `--down-bg` (error), `--ok` / `--ok-bg`, `--warn` / `--warn-bg`, `--info` / `--info-bg`. Rosewood moves `--down` to an orange-red so an error never reads as the accent. Black & White makes every status ink with an outline.
**Accent (per accent × theme)**: `--acc` (gradient, 120°) from `--acc-a` to `--acc-b` with `--on-acc` text; `--chip-bg` / `--chip-fg` (the arrow chip and step number, contrast-tested over the fill); `--pill-dot`; `--strike` (wordmark, tab bar, chart series 1); `--stamp` and `--link` (the colour of a link on paper); `--ok-ink` and `--tint` (accent-tinted text and wash: trends, selected rows); `--pulse`, `--trail`, `--halo`, `--wash-a/b/c` (landing); `--series-1` (= strike). `--series-2` is `--ink-3`.
**What the accent is for**: primary button, current nav row, current step, selected segment, checked controls, KPI/trend tint, avatars, the strike, the stamp, series 1. **Never**: body text, large backgrounds, status.

| Accent | Light fill | Dark fill | Notes |
|---|---|---|---|
| Midnight ink | #2453D6 → #16204A | same | Default |
| Ocean glow | #1AA7FF → #2FE3A0 | same | Dark text on the fill |
| Black & White | #000 → #000 | #FFF → #FFF | Overrides canvas, lines, shadows: pure black/white, hard 1px borders, hard offset shadows; no soft shadows |
| Graphite | #5B6475 → #1F2633 | same | |
| Fern | #14805A → #0E5A43 | same | |
| Rosewood | #CC3A53 → #7A1E33 | same | `--down` orange-red |
| Iris | #6E4EF0 → #3B2A8C | same | |
| Saffron | #F7C948 → #E39B12 | same | Dark text on the fill |

### Contrast: all 16 combinations (WCAG; computed by `scripts/tokens.test.mjs`)
Text pairs need 4.5:1, non-text pairs (strike, focus ring, series, control edge) 3:1; translucent tints are composited over the surface they sit on. The test also checks `ink`, `ink-2`, `ink-3` on canvas / surface / field, stamp and link on surface and canvas, `ok`, `warn`, `info`, `down` on surface and on their tints, `focus` on surface. Lowest values are listed; every cell passes.

| Accent / theme | on-acc vs start | on-acc vs end | chip text | stamp / link on surface | status (ok-ink) on tint | strike on canvas | focus on canvas | series-1 on surface | edge on field | down on surface |
|---|---|---|---|---|---|---|---|---|---|---|
| Midnight ink light | 6.40 | 15.68 | 9.41 | 10.09 | 8.44 | 5.86 | 15.82 | 6.23 | 3.43 | 7.12 |
| Midnight ink dark | 6.40 | 15.68 | 9.41 | 7.58 | 6.71 | 8.25 | 16.46 | 7.58 | 3.34 | 7.56 |
| Ocean glow light | 7.10 | 11.18 | 11.18 | 5.57 | 6.31 | 5.24 | 15.82 | 5.57 | 3.43 | 7.12 |
| Ocean glow dark | 7.10 | 11.18 | 11.18 | 10.51 | 7.40 | 11.08 | 16.46 | 10.17 | 3.34 | 7.56 |
| Black & White light | 21.00 | 21.00 | 21.00 | 21.00 | 17.62 | 21.00 | 21.00 | 21.00 | 21.00 | 21.00 |
| Black & White dark | 21.00 | 21.00 | 21.00 | 19.80 | 13.97 | 21.00 | 21.00 | 19.80 | 19.80 | 19.80 |
| Graphite light | 5.96 | 15.18 | 8.90 | 11.63 | 9.65 | 5.46 | 15.82 | 5.80 | 3.43 | 7.12 |
| Graphite dark | 5.96 | 15.18 | 8.90 | 9.14 | 7.57 | 9.12 | 16.46 | 8.37 | 3.34 | 7.56 |
| Fern light | 4.92 | 8.20 | 7.82 | 7.98 | 6.91 | 3.99 | 15.82 | 4.24 | 3.43 | 7.12 |
| Fern dark | 4.92 | 8.20 | 7.82 | 9.85 | 8.19 | 9.84 | 16.46 | 9.03 | 3.34 | 7.56 |
| Rosewood light | 4.89 | 10.19 | 8.04 | 8.34 | 7.12 | 4.48 | 15.82 | 4.76 | 3.43 | 5.80 |
| Rosewood dark | 4.89 | 10.19 | 8.04 | 8.69 | 8.00 | 8.59 | 16.46 | 7.89 | 3.34 | 8.69 |
| Iris light | 5.24 | 11.08 | 8.18 | 8.49 | 8.61 | 4.80 | 15.82 | 5.10 | 3.43 | 7.12 |
| Iris dark | 5.24 | 11.08 | 8.18 | 8.31 | 7.75 | 8.45 | 16.46 | 7.76 | 3.34 | 7.56 |
| Saffron light | 11.01 | 7.37 | 11.01 | 6.94 | 7.33 | 5.43 | 15.82 | 5.77 | 3.43 | 7.12 |
| Saffron dark | 11.01 | 7.37 | 11.01 | 10.89 | 7.11 | 11.86 | 16.46 | 10.89 | 3.34 | 7.56 |

Changes made to the mockup's values while writing the test: the step-number / arrow chip background `rgba(255,255,255,.2)` over a white-on-accent fill measured about 4.3:1, so white-on-accent themes now use `rgba(11,18,38,.32)` (7.8:1 or better); Black & White dark fills are white (the mockup's block kept black fills in dark, invisible on a black canvas, a regression the "fills read against the canvas" test now guards); a control `--edge` was added (the mockup's `line-strong` inputs measure about 1.9:1, below WCAG 1.4.11); status colours `ok`, `warn`, `info` were added. Known and accepted: the gradient *start* against the page is below 3:1 for Ocean light (2.4), Saffron light (1.4) and several dark fills; buttons are identified by their label (≥ 7:1 in every combination), not by the fill edge.

## 4. Typography
Three families, self-hosted (SIL OFL 1.1, no runtime font host):
- **Fraunces** (display; weight 450, `"SOFT" 100`, `"opsz"` set per size; italic for one accent word). Needs the `full` fontsource files (`@fontsource-variable/fraunces/full.css` and `full-italic.css`): the default import is weight-only and silently ignores `font-variation-settings`.
- **Hanken Grotesk** (UI).
- **IBM Plex Mono** (figures, micro labels, stamp; tabular numerals).
Metric-matched fallback faces (`Fraunces Fallback` over Georgia at 89.7%, `Hanken Grotesk Fallback` over Arial at 99.5%, measured) keep the font swap under CLS 0.05; see `fonts/fonts.css`.

| Style | Family | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|---|
| hero | Fraunces | clamp(52, 7vw, 96) / 1.02 | 450 | −0.03em | Landing headline |
| section | Fraunces | clamp(40, 5vw, 68) / 1.05 | 450 | −0.02em | Landing sections |
| page | Fraunces | clamp(36, 4vw + 20, 64) / 1.04 | 450 | −0.02em | Page title (one per view) |
| heading | Fraunces | 28 / 34 | 450 | −0.01em | Large card and panel headings |
| title | Hanken | 18 / 26 | 600 | −0.005em | Dialog and card titles |
| title-sm | Hanken | 16 / 24 | 600 | 0 | Small titles |
| kpi | Plex Mono | 40 / 44 | 500 | −0.02em | KPI figure |
| body | Hanken | 16 / 24 | 400 | 0 | Body, inputs |
| body-sm | Hanken | 14 / 20 | 400 | 0 | Tables, menus, dense lists |
| label | Hanken | 14 / 20 | 500 | 0 | Field labels |
| button | Hanken | 15 / 20 | 500 | 0 | Buttons |
| caption | Hanken | 13 / 18 | 400 | 0 | Hints, errors |
| figure | Plex Mono | 14 / 20 | 400 | 0 | Numbers in tables and charts |
| micro | Plex Mono | 11 / 1 | 500 | .14em, caps | Folder tabs, group labels, table headers |
| stamp | Plex Mono | 12 / 1 | 500 | .16em, caps | Stamp |
| wordmark | Fraunces | 20 / 1 | 500 | −0.02em | Wordmark |
Each is `--type-<name>` (a `font` shorthand) and `--tracking-<name>`. One page title per view. Every number in a table, KPI, field or chart axis is tabular. Text sits on `--ink`, `--ink-2` or `--ink-3` only.

## 5. Shape, paper and the folder tab
- **Corner scale** (tokens `--r-*`): control **10** (8 compact), card / KPI tile / menu / popover / table container **14**, panel / dialog / sheet / sidebar folder / landing window **20**, avatar circle. Small marks: key cap 6, bar 3. Nested corners are concentric: inner = outer − padding, floor 6 (menu 14 − 4 = item 10; sidebar 20 − 10 = nav row 10; segmented track 14 − 4 = item 10). A chip's radius is ≤ ~40% of its height: no pills.
- **Smooth corners**: `corner-shape: squircle` under `@supports`; plain `border-radius` elsewhere. Avatars, radios, dots and the spinner opt out (`round`).
- **Paper** (`rnr-paper`): raised, with the perforation. **Card** (`rnr-card`): flat, hairline. **Folder** (`rnr-folder`): a titled section, tab 32px (44 for the sidebar, 22 for a node), `min-width: max-content`, concave shoulder; never nested. **Perf** (`rnr-perf`): 4px band, 10px pitch, `--perf` dots.
- Elevation: cards separate by hairline, shadows mean "raised" (paper, menus, dialogs, dragging). Black & White: hard offsets, never blur.

## 6. Spacing, density, layout
- 4px base: `--space-1` 4, 2 8, 3 12, 4 16, 5 20, 6 24, 8 32, 10 40, 12 48, 16 64, 20 80; half steps `--space-0-5`, `-1-5`, `-2-5`, `-3-5`.
- **Density** (`data-density`, the one mode kept): comfortable controls 44px / inputs 48px / rows 12px, compact 36 / 40 / 8 with 8px control radius; coarse pointers always 44 / 48.
- **Sizes**: sidebar 248, page 960 (`rnr-wide` up to 1280), form card 640, Appearance panel 420, top and phone bars 64, touch target 44.
- **Breakpoints** (match Tailwind): sm 640, md 768 (shell collapses to top bar + phone bar + drawer), lg 1024, xl 1280. Specific: 480 (swatches 2 × 4), 900 (landing window flat).
- **Layers** (`--z-*`): sticky 10, side 20, topbar 30, menu 40, drawer 50, dialog 60, toast 70, tip 80.

### Page templates
| Template | Structure |
|---|---|
| **List page** | `rnr-page-head` (micro crumb, title, primary on the right) → filter row (search input + segmented / selects) → `rnr-table-card` with `rnr-table` and `rnr-pager`, or an `rnr-empty` → nothing below. Wide tables use `rnr-wide`. |
| **Detail page** | `rnr-crumb` back link → `rnr-page-head` (title, lede, actions) → a stack of folders (gap 24px): summary, timeline, PDF panel; the stamp sits in the record's header folder. |
| **Form page** | Centred `rnr-form` (640px) inside a folder: tab names the form, `rnr-steps` when > 1 page, fields stacked at 20px, `rnr-actions` row (Back left, Next / Submit right, one primary). |
| **Dashboard** | `rnr-page-head` → KPI tiles in `rnr-grid` → widgets in `rnr-grid` (1 / 2 / 4 columns, spans 1, 2, 4); edit mode shows handles and the menu path. |
| **Settings** | Folders stacked in `max-w` form width: Appearance first, then Email notifications, Campaign emails; each folder is one concern. |
| **Auth** | No sidebar. Wordmark on top, `rnr-page-head` (`data-align="center"`), one `rnr-paper` form card (640 max). |
| **Public page** | Landing chrome (header, footer), light theme only; legal pages are `.rnr-prose` on paper with Fraunces headings, max 70ch; 404 and unsubscribe are one folder card. |
Shell: sidebar folder (desktop) or top bar + phone bar + drawer (< 768px); skip link first; the page heading takes focus after navigation.

## 7. Motion
Tokens: `--t-fast` 150ms, `--t-base` 240ms, `--t-slow` 700ms, `--t-bars` 1100ms, `--t-stagger` 50ms, `--ease` cubic-bezier(.2,.7,.2,1), `--ease-spring` for confirmations only.
- **Full** (default): primary buttons lift 2px on hover and scale .97 on press; dialogs rise 8px; sheets and drawers slide; toasts rise; the wordmark strike is drawn once; a dragged widget tilts 1°; hovering one chart datum dims the others to 40%.
- **Flat**: `data-motion="flat"` is set before first paint whenever the OS prefers reduced motion (and `@media (prefers-reduced-motion: reduce)` enforces it in CSS): every duration is 0, no lift, tilt, slide, shimmer, drift, pulse, ticker, typing or stamp animation; the strike is drawn; content is visible. Spinners slow to 1.4s but never stop (feedback).
- Hover styles apply only under `@media (hover: hover)`. Never hide a primary action behind hover.

## 8. Iconography
Phosphor **regular**, `currentColor`, through `src/ui/icons.tsx` only (see `components/Icon/README.md`). 16px inline (buttons' leading icon, menus, status, chips), 20px navigation / icon buttons / notices, 24px empty-state tiles. Decorative icons `aria-hidden`; icon-only buttons `aria-label`. Drag handle `dots-six-vertical`. No second icon library, no emoji.

## 9. Accessibility
- **Contrast**: section 3, enforced by test. **Focus**: every focusable element gets a 3px `--focus` ring with a 2px offset (`:focus-visible`); the ring is ≥ 3:1 on canvas and surface in all 16 combinations. Menus and scroll containers draw it inset.
- **Targets**: ≥ 44px on coarse pointers (`--ctl-h`, `--field-h`, rows, nav, icon buttons, handles); at 375px no page-level horizontal scroll (tables scroll inside their card, first column sticky).
- **Keyboard**: tab order follows the visual order; menus and tabs rove with arrows; every drag has a keyboard and a menu path; Esc closes menus and dialogs and returns focus to the trigger; ⌘K / Ctrl+K opens the jump bar.
- **Forms**: native inputs and `<dialog>`; labels, hints and errors linked; submit stays live, `aria-busy` while saving; the first blocking field takes focus; errors are icon + sentence + outline, never colour alone.
- **Motion**: section 7. **Colour**: never the only cue. **Language**: `lang="en-GB"`.
- Charts have `role="img"`, a title and description, and a table alternative.

## 10. Cascade layers (the layer trap, fixed)
`bundle.css` starts with `@layer theme, base, components, utilities;` (Tailwind 4's order) and puts every rule in `@layer components`. A Tailwind utility on an element (`p-0`, `w-80`, `gap-3`, `flex`, `items-stretch`) therefore always beats an `rnr-*` class: `rnr-card p-0`, `rnr-menu w-72`, `td.flex` work as written. v1's unlayered bundle beat every utility, which produced the recurring QA defect (Phase 4, 5, 6).
Rules: never write unlayered CSS that targets `rnr-*` selectors (it beats both layers and re-creates the trap); put a screen's own rules in `src/index.css`'s batch blocks using utilities or new classes, not by overriding `rnr-*`; tokens are unlayered custom properties on purpose. **`src/index.css` currently holds unlayered duplicates of many of these classes (Phase 2–6 additions); Task 2 must delete every `rnr-*` and `wf-*` rule there that the bundle now owns, or they will override the new design.** Import order does not matter (the first statement fixes the layer order); the test fails if a rule is added outside `@layer components`.

## 11. Components
Authoritative specs in `components/<Name>/README.md`: Button · Field (input, textarea, select, combobox) · Choice (checkbox, radio, switch) · Segmented · Tabs · Paper (surfaces and the corner scale) · FolderCard · KpiTile · Stamp · Badge (status, chip, trend) · Avatar · DataTable · Menu (menu, popover, tooltip) · Dialog (dialog, sheet, drawer) · Toast (toast, notice) · Steps · Progress · Skeleton · EmptyState · Shell (sidebar, nav row, groups, phone bar) · TopBar (⌘K jump bar) · BellPanel · PageHeader (breadcrumb, back link) · Widget (dashboard grid) · Charts · Canvas (workflow node, handle, edge) · FormBuilder (palette, blocks, sign pad) · AppearancePanel · Wordmark · Landing (wash, window, reveal, pulse) · Icon.

## 12. The retired modes
`data-preset` (default / ocean / forest / sunset) and `data-style` (solid / glass / neu) are removed with their tokens and CSS: the eight accents replace presets, and paper replaces the surface styles. `bw-light` / `bw-dark` become the `bw` accent with either theme. **Motion is no longer a person's setting.** Density stays. No screen ever wrote `preset`, `style` or `motion` (only previews did), and unknown stored keys are ignored.

## 13. Migration map (engineers)
### Tokens
| Old | New |
|---|---|
| `--surface-000`, `--surface-canvas` | `--canvas` |
| `--surface-100` | `--surface` (inputs and secondary buttons: `--field`) |
| `--surface-200` | `--soft` |
| `--line-100` | `--soft` |
| `--line-200` | `--line` (a control's border: `--edge`) |
| `--line-300` | `--line-strong` (a control's border: `--edge`) |
| `--ink`, `--ink-label` | `--ink`, `--ink-2` |
| `--ink-muted`, `--ink-faint` | `--ink-3` (placeholders too; `ink-faint` was decorative-only and is gone) |
| `--brand-solid` / `--brand-solid-ink` | `--acc` (fill) or `--acc-a` (solid) / `--on-acc` |
| `--brand-ocean/forest/sunset(-ink)` | removed; choose an accent |
| `--focus-ring` | `--focus` |
| `--in` / `--out` | `--series-1` / `--series-2` |
| `--success` | `--ok` (text and icon) or `--ok-ink` (accent-tinted) |
| `--danger` / `--danger-surface` | `--down` / `--down-bg` |
| `--info-surface` / `--info-ink` | `--info-bg` / `--info` (accent marks: `--tint` / `--ok-ink`) |
| `--chart-grid` | `--chart-grid` (= `--soft`) |
| `--scrim` | `--scrim` |
| `--glass-*`, `--neu-*`, `--shadow-glass`, `--shadow-neu-*`, `--rnr-blur` | removed |
| `--shadow-xs`, `--shadow-sm` | none (hairline) |
| `--shadow-lg` / `--shadow-2xl` | `--sh-menu` / `--sh-dialog`; raised paper `--sh-float` |
| `--radius-sm`, `--radius-md` | `--r-key` (6) or `--r-control-sm` (8) |
| `--radius-lg` (8) | `--r-control` / `--r-ctl` (10) |
| `--radius-xl` (12), `--radius-2xl` (16, widgets) | `--r-card` (14) |
| `--radius-2xl` (dialogs and panels) | `--r-panel` (20) |
| `--radius-full` | removed; avatars `--r-avatar` |
| `--space-0.5`, `-1.5`, `-2.5`, `-3.5` | `--space-0-5`, `--space-1-5`, `--space-2-5`, `--space-3-5` (others unchanged) |
| `--control-h` (36) / `--control-h-compact` | `--ctl-h` (44; 36 compact; 44 coarse) |
| `--row-comfortable` / `--row-compact` | `--row-pad` (12 / 8) |
| `--touch-min` | `--touch` |
| `--duration-hover`, `-fast`, `-exit` | `--t-fast` |
| `--duration-enter`, `-base` | `--t-base` |
| `--duration-slow` / `-stagger` / `-instant` | `--t-slow` / `--t-stagger` / `--t-instant` |
| `--opacity-disabled/placeholder/dim` | unchanged |
| `--font-sans` | `--font-ui` (new `--font-display`; `--font-mono` is now IBM Plex Mono) |
| `--rnr-control-h`, `--rnr-card-pad`, `--rnr-row-pad` | `--ctl-h`, `--card-pad`, `--row-pad` |
| `--rnr-t`, `-t-hover`, `-t-enter`, `-t-exit`, `--rnr-lift`, `--rnr-ease`, `--rnr-spring` | `--t`, `--t-fast`, `--t-base`, `--t-fast`, `--lift`, `--ease`, `--ease-spring` |
| `--rnr-card-bg/border/shadow`, `--rnr-field-bg`, `--rnr-track-bg` | `--surface` / `--line`, none, `--field`, `--soft` |

### Attributes
`data-theme="bw-light|bw-dark"` → `data-accent="bw"` + `data-theme="light|dark"` · `data-preset` → `data-accent` · `data-style` → removed · `data-motion` → set by the OS preference, not chosen · `data-density` unchanged.

### Type classes
`.display`, `.headline` → `.rnr-display` / `--type-hero`, `--type-section` · `.page-title` → `.rnr-page-title` (the old name is kept as an alias) · `.dialog-title` → `.rnr-dialog-title` (alias kept) · `.kpi` → `.rnr-kpi-figure` (`.rnr-kpi` kept as an alias) · `.wordmark` → `.rnr-wordmark` (markup changes, see Wordmark) · `.body`, `.label`, `.caption` → `--type-body-sm`, `--type-label`, `.rnr-caption` · `.overline` → `.rnr-micro` · `.axis` → `.rnr-chart-axis`.

### Classes
| Old | New |
|---|---|
| `rnr-card`, `rnr-card-head`, `rnr-card-title` | same names; card is flat (14px, hairline, no shadow); title wraps instead of truncating |
| `rnr-btn*`, `rnr-icon-btn`, `rnr-input`, `rnr-field`, `rnr-label`, `rnr-hint`, `rnr-error(-text)`, `rnr-seg`, `rnr-menu(-item/-sep)`, `rnr-dialog(-head/-body)`, `rnr-table`, `rnr-status`, `rnr-kbd`, `rnr-skeleton`, `rnr-spin`, `rnr-pop`, `rnr-block`, `rnr-drop`, `rnr-handle`, `rnr-grid`, `rnr-avatar`, `rnr-ground`, `rnr-muted`, `rnr-num`, `rnr-focus` | same names, restyled (the busy spinner may always be in markup) |
| `rnr-chip` (blue) | `rnr-chip` neutral, tones via `data-tone`; count: `rnr-chip--count` |
| `rnr-kind.is-in` / `.is-out` | `rnr-kind` / `rnr-kind.is-out` |
| `rnr-pill` (plan name) | `rnr-input` (same rules; 10px, not a pill) |
| `dialog.rnr-sheet` | `.rnr-dialog.rnr-sheet` |
| `.rnr-seg button` | same; native radios may use `rnr-seg-i` |
| `rnr-reveal` | `rnr-rise` (landing); app screens do not reveal |
| `rnr-strike` (red bar) | wordmark `rnr-strike` (svg path) |
| `rnr-kpi` | `rnr-kpi-figure` inside `rnr-kpi-tile` |
| `rnr-paper*` (the Phase 5 PDF page preview) | **rename to `rnr-pdf-page*` in Task 9**; `rnr-paper` is now the identity surface |
| `rnr-card-open`, `rnr-table-card`, `rnr-pref-caption` | same, now in the bundle |
| `wf-board` / `wf-card` / `wf-outs` / `wf-out` / `wf-outcome` | `rnr-flow` / `rnr-node` (with `rnr-folder rnr-folder--node`) / `rnr-node-outs` / `rnr-node-out` / `rnr-outcome` |
| `rnr-chart-dot[data-series="out"]` | `rnr-chart-mark[data-series="out"]` (a square `<rect>`) |
| Header nav (`rnr-btn rnr-btn-secondary` for the current item) | `rnr-side-link` with `aria-current="page"` |
| Tailwind `@theme` names | `surface-000`/`surface-canvas` → `canvas`, `surface-100` → `surface`, `surface-200`/`line-100` → `soft`, `line-200` → `line`, `line-300` → `line-strong`, `ink-label` → `ink-2`, `ink-muted`/`ink-faint` → `ink-3`, `brand` → `acc-a`, `brand-ink` → `on-acc`, `in` → `series-1`, `out` → `series-2`, `success` → `ok-ink`, `danger` → `down`; new: `field`, `edge`, `down-bg`, `tint`, `stamp`, `strike` |

## 14. Not covered by this system (on purpose)
Record PDFs stay ink on white in Inter (`render-pdfs/fonts/`); the in-app PDF panel is restyled, the generated file is not. Email HTML keeps its own inline styles. No dark-only landing, no illustration set, no photography.
