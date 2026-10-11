ReportNoReport v2 is a drag-and-drop SaaS for building forms, dashboards and reports, used by school admins and HR teams. It has two faces. **Aether** (light) is calm and optical: frosted glass panes and pill controls on a soft pearl ground, with charcoal as the only accent. **Lumen Edge** (dark) is quiet and technical: graphite surfaces lit softly from below, with controls outlined by a thin line of light. People's own data — teal and amber — is the only colour on screen.

## What this look is not

Admin products in this space tend to share one look. Avoid every part of it:

- **No royal blue.** No blue buttons, blue active tabs, blue nav highlights or underlined blue numbers. The accent is charcoal in light and light itself in dark.
- **No icon tiles.** KPIs never sit beside a pastel square holding an icon, and cards don't carry a ↗ corner button.
- **No donuts.** Splits are shown with a segmented `Meter`.
- **No underline tabs.** Tabs are a pill track.
- **No tinted status pills.** Status is a grey icon plus a word; groups are outlined mono tags.
- **No plain white page with nested white cards.** Cards float as glass on a pearl or graphite ground, one level deep.
- **No Inter.** Geist for text, Geist Mono for every figure.

## Content fundamentals

- Write in **British English**: organisation, colour, centre, licence, enrol.
- Use **sentence case** everywhere: buttons, titles, menu items ("Record transaction", "Edit layout").
- Start buttons with a verb and name the object: "Post receipt", "Publish report", "Invite user". While an action runs, use the -ing form ("Posting…"). Once it finishes, use the past tense ("Posted").
- Show **money** with its ISO code and two decimals, never a symbol: "MYR 1,250.00", "SGD 75.50". Write negatives with a true minus: "−MYR 75.50".
- Show **dates** as the settings format them. Inputs use ISO `YYYY-MM-DD`.
- **Errors** say what happened and what to do, in plain words: "Enter a number of days.", "Your trial has ended. Pay RM 10 to keep editing.", "This was changed by Alice at 3 pm. Reload to see their changes." Never show raw error codes.
- **Empty states** give the next step: "Add a client before recording a transaction."
- Address the reader as "you" and the organisation as "your firm" or "your school". Avoid "we" except on the marketing site.
- Don't use emoji in the product UI.
- The brand line is **"Report without complicated reporting."** The hero joke strikes through the "r" in "report" (see Wordmark).

## Visual foundations

### Colour

- The page sits on `surface-000`: cool pearl in light, near-black graphite in dark. The ground carries one soft radial light: from the top in light, from below in dark.
- Cards, menus and fields are glass by default: `glass-surface` with 20px backdrop blur, a `glass-edge` hairline and an `edge-light` inner highlight along the top. `surface-100` is the solid fallback.
- Body text is `ink`. Labels are `ink-label`. Hints, KPI labels and table headers are `ink-muted`. Placeholders are `ink-faint`, decorative only.
- `brand-solid` (charcoal in light, near-white in dark) is the only accent. Use it for primary pills, the active nav item and the mark.
- `lumen` is Lumen Edge's line of light (`#a5f3fc` in dark, charcoal in light). Use it for focus rings, selected blocks, active outlines and the beam in the mark. In dark, focus is a 1px line of `lumen` with a soft glow (`shadow-lumen`).
- **Data:** `in` (teal) is series 1: money in, on time, attended. `out` (amber) is series 2: money out, late, absent. Teal against amber is colour-blind safe. Use them for fills, icons and bars, not small text.
- `success` and `danger` always come with a sign, word or icon.
- **Presets** swap `brand-solid` for a firm accent: `brand-ocean` (deep teal), `brand-forest` (olive), `brand-sunset` (burnt amber). Each has a light and a dark value.

### Themes (`data-theme`)

| Theme | When |
|---|---|
| `light` | Aether. Default. |
| `dark` | Lumen Edge. When the person picks Dark, or picks System and their OS is dark. Apply before first paint. |
| `bw-light`, `bw-dark` | **Black & White.** Pure black and white with one mid-grey. Hard 1px borders, no blur or soft shadows, and a hatch for the `out` series. |

### Surface style (`data-style`)

- **`glass`** (default): translucent panes, 20px blur, hairline edge, inner highlight, soft ambient shadow (`shadow-card`).
- **`solid`**: the same shapes on opaque `surface-100`. Use it on low-powered devices or when printing.
- **`neu`** (neumorphic): every element shares `neu-ground`, with raised and inset shadows instead of borders. Secondary text steps up to `ink-label`.
- Style changes only the surface. Spacing, type, content and behaviour stay the same.

### Type

- **Geist** (400/500/600) for all text, with tight tracking on titles: `page-title` 26/32 at −0.025em, `display` 72 at −0.045em.
- **Geist Mono** for every figure, date, ID and label that reads like a ledger:
  - `kpi`: 32/36, 500 weight, −0.03em.
  - `overline`: 11px uppercase, +0.08em. Use it for KPI labels, table headers and status eyebrows.
  - `data`: 13px, for numbers in tables.
- UI text is `body` 14/20. Buttons and labels use `label` (500).

### Shape and elevation

| Token | Used for |
|---|---|
| `radius-full` | Every button, input, select, segmented track, tab, chip and avatar: they are all pills |
| `radius-xl` (20px) | Cards, widgets, the mark |
| `radius-2xl` (28px) | Dialogs, sheets, the landing page's product window |
| `radius-lg` (14px) | Menus, text areas, builder blocks |

| Shadow | Used for |
|---|---|
| `shadow-card` | Cards. A bevel highlight plus soft ambient shadow in light; a top edge of light plus deep shadow in dark |
| `shadow-lg` | Menus, popovers, dialogs, the dragged widget |
| `shadow-lumen` | Focus and active states in dark |

Never nest a card inside a card. Group with spacing and hairlines instead.

### Spacing, density and layout

- Spacing is on a 4px base, with half steps `space-1.5`, `space-2.5` and `space-3.5`.
- **Density** (`data-density`): controls are 40px comfortable and 34px compact; cards are `space-5` / `space-4`; table rows are `row-comfortable` / `row-compact`.
- **Layout:**
  - The app fills the window. A floating glass sidebar (240px) sits beside the content, which has no max-width.
  - Dashboards use a fluid grid of 280px minimum columns.
  - On phones the sidebar becomes a bottom bar, the builder palette becomes a bottom sheet, and tables scroll inside their card.
- Hit areas are at least `touch-min` (44px) on coarse pointers.

### Motion (`data-motion`) and micro-interactions

- **Timing.**
  - Hover and press feedback: `duration-hover` (80ms), so it lands under 100ms.
  - State changes: `duration-fast` (120ms), never over 150ms.
  - Entrances: `duration-enter` (250ms), ease-out.
  - Exits: `duration-exit` (150ms), faster than the entrance.
  - `duration-slow` (500ms) is only for attention: a toast arriving, the strike-mark.
- **Curves.**
  - Ease-out for anything that starts and stops.
  - A small spring overshoot for presses and confirmations only.
  - Linear only for things that keep moving: spinners, shimmer.
- **`full`** (default):
  - Primary CTAs lift 2px on hover.
  - Pressing scales to 0.98 with the spring.
  - A dragged widget tilts 1° under `shadow-2xl`, and its slot shows a dashed placeholder at `opacity-placeholder`.
  - Reveals rise 8px, staggered by `duration-stagger` (50ms).
  - A saved check pops in (`rnr-pop`).
  - Hovering one chart series dims the others to `opacity-dim`.
- **`flat`**: every transition becomes `duration-instant`, with no lifts, tilts, pops, reveals or shimmer. Colour and focus changes still show. `prefers-reduced-motion: reduce` always forces flat.
- Hover styles only apply under `@media (hover: hover)`. Never hide a primary action behind hover.
- Motion explains a change. Never loop or animate for decoration.

### Interaction rules

- **Feedback within 400ms.**
  - Paint `rnr-skeleton` shapes the moment a view opens.
  - Update cheap, reversible actions (approve, rename, reorder) optimistically.
  - Wait for the server on money and anything irreversible.
- **Don't disable submit.**
  - Keep the button live and validate on click.
  - Mark the blocking fields and move focus to the first one.
  - While a request runs, set `aria-busy="true"` and show `rnr-spin`. The button keeps focus and its place.
- **Validate from the DOM.** `.rnr-field:has(:user-invalid)` turns the border and label `danger` and shows `.rnr-error-text`. Errors appear after the person leaves the field, never on first render.
- **One accent, used sparingly.**
  - `brand-solid` marks only the primary action and the current place.
  - Status is a grey icon plus a word (`rnr-status`), not a coloured pill.
  - `in` and `out` are for data series.
- **Alignment.**
  - Labels and names go left; numbers and dates go right (`.num`).
  - Put 16px icons on the text line, and keep to the 4px grid.
- **Shortcuts.** Show the keyboard shortcut next to the actions people repeat, in `rnr-kbd`. Use ⌘K for search and N for new form.
- **Empty states.**
  - Write four kinds, each with its own copy and one primary action: first run, no results, filtered out, error.
  - Show a small illustration or a ghost preview of a real item.
  - Never a bare "No data".
- **Touch.** Hit areas are at least `touch-min` (44px) on coarse pointers, while icons stay 16–20px.

### Focus and accessibility

- Every focusable control shows `focus-ring`: a 2px charcoal outline in light, and a `lumen` line with glow in dark.
- Text holds 4.5:1 on its grounds in light and dark: `ink-muted` is 5.6:1 on pearl and 6.1–6.6:1 on graphite. `out` is for fills only (4.3:1).
- Glass never carries text over imagery. Panes sit on the flat ground, so contrast is measured against `surface-000`.
- Every drag has a keyboard path and a menu path, and moves are announced in a live region.

### Interaction rules

- **Feedback within 400ms.**
  - Paint `rnr-skeleton` shapes the moment a view opens.
  - Update cheap, reversible actions (approve, rename, reorder) optimistically.
  - Wait for the server on money and anything irreversible.
- **Don't disable submit.**
  - Keep the button live and validate on click.
  - Mark the blocking fields and move focus to the first one.
  - While a request runs, set `aria-busy="true"` and show `rnr-spin`. The button keeps focus and its place.
- **Validate from the DOM.** `.rnr-field:has(:user-invalid)` turns the border and label `danger` and shows `.rnr-error-text`. Errors appear after the person leaves the field, never on first render.
- **One accent, used sparingly.**
  - `brand-solid` marks only the primary action, the current place and the mark.
  - Status is a grey icon plus a word (`rnr-status`), not a coloured pill.
  - `in` and `out` are for data series.
- **Alignment.**
  - Labels and names go left; numbers and dates go right (`.num`).
  - Put 16px icons on the text line, and keep to the 4px grid.
- **Shortcuts.** Show the keyboard shortcut next to the actions people repeat, in `rnr-kbd`. Use ⌘K for search and N for new form.
- **Empty states.**
  - Write four kinds, each with its own copy and one primary action: first run, no results, filtered out, error.
  - Show a small illustration or a ghost preview of a real item.
  - Never a bare "No data".
- **Touch.** Hit areas are at least `touch-min` (44px) on coarse pointers, while icons stay 16–20px.

### Focus and accessibility

- Every focusable control gets a 2px `focus-ring` outline at a 2px offset. The ring follows the preset.
- Body text holds 4.5:1 on its named grounds in all four themes. These source colours fall short and are kept exactly as in the code; their token notes say how to use them:
  - `danger` on `danger-surface` is about 4.4:1
  - `success` is 3.3:1 in light
  - `line-300` is decorative
- Every drag has a keyboard path (Space to lift, arrow keys to move, Space to drop) and a menu path (Move up / Move down / Change width). Moves are announced in a live region.
- Use native `<dialog>` for modals. Menus close on Esc and on an outside click.

## Iconography

- Use the ReportNoReport duotone set (see **Icon**): a rounded 2px stroke over a soft 14% fill of the same colour, on a 24×24 grid, in `currentColor`.
- Sizes: 16px in buttons and menus, 18px in nav, 22px in empty states.
- In Black & White the fill drops out and only the stroke remains.
- Decorative icons are `aria-hidden`. Icon-only buttons get an `aria-label`. No emoji and no second icon set.

## Wordmark

- **The mark:** a rounded `brand-solid` tile holding two report lines crossed by a single beam ("report, no report").
- **The wordmark:** "Report**No**Report" in Geist 600 at −0.02em, with "No" in `ink-faint`.
- The plain "R" tile is retired.

## Components

The stylesheet is `components/bundle.css`. Its classes start with `rnr-` and read only tokens. Put the mode attributes on `<html>`.

| Component | What it is |
|---|---|
| Button | Pill buttons: primary, secondary, ghost, danger, plus a busy state |
| Field | Pill input wells with labels and errors |
| Segmented | Pill tracks for tabs, choices and toggles |
| Kpi | Mono label, mono figure, delta pill and sparkline |
| Meter | Segmented bar with a legend, replacing donut charts |
| Widget | A dashboard card with drag states |
| Canvas | The drag-and-drop builder board |
| DataTable | Tables with mono headers, status and tags |
| Dialog | A glass modal sheet |
| Menu | A glass dropdown |
| Badge | Tags, status, chips, deltas, kind marks, avatars and key hints |
| Icon | The duotone icon set |
| Wordmark | The mark and the name in type |
| AppearancePanel | Theme, accent, surface, density and motion settings |

## Not synced

- **Source:** `delfrinandopranata/reportnoreport` at `main@846662a`. Spacing, density, motion, the Black & White themes and the interaction rules come from there and from the B&W audit.
- **Look v2** (11 Oct 2026), designed to move away from the zinc and Inter look and from the common blue admin look. It covers colours, type, shapes, shadows, icons, the mark, the KPI and Meter patterns, and glass as the default surface.
- **Fonts:** Geist and Geist Mono from Google Fonts; there are no font files.
- **Components:** hand-written as HTML and CSS. No React bundle.
