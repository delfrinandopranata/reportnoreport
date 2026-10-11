ReportNoReport v2 is a drag-and-drop SaaS for building forms, dashboards and reports, used by school admins and HR teams. It is quiet and neutral by default, so people's own data is the colour on screen. Each person can change the look through five modes: theme, colour preset, surface style, density and motion.

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

- Pages sit on `surface-000`. Cards, widgets, dialogs, menus and fields sit on `surface-100`. Tracks, hover rows and icon tiles use `surface-200`. Builders draw their board on `surface-canvas`.
- Body text is `ink`. Labels are `ink-label`. Hints, widget titles and table headers are `ink-muted`. Placeholders are `ink-faint`, which is decorative only.
- On `neu-ground`, secondary text steps up to `ink-label`, because `ink-muted` fails contrast there. `bundle.css` does this for you.
- Hairlines inside a card use `line-100`. Field and card borders use `line-200`. Edit-mode and dashed placeholders use `line-300`.
- `brand-solid` (with `brand-solid-ink` on top) is used for exactly four things: primary buttons, active nav, the sidebar mark and the focus ring. Nothing else is brand-coloured.
- **Presets** swap `brand-solid` for a firm-wide colour:
  - `default`: zinc-900 in light, white in dark
  - `brand-ocean`
  - `brand-forest`
  - `brand-sunset`
  
  Each preset has its own light and dark value, and dark fills take dark ink.
- **Data series:** `in` (blue) is series 1, money in and positive flows. `out` (orange) is series 2, money out. Blue against orange is the colour-blind-safe pair. Always add an arrow icon or a label, and use these colours for fills and icons, not small text.
- `success` and `danger` always come with a word or an icon. Never rely on colour alone. `danger` also draws the strike-mark.

### Themes (`data-theme`)

| Theme | When |
|---|---|
| `light` | Default. |
| `dark` | The person picks Dark, or picks System and their OS is dark. Apply it before first paint. |
| `bw-light`, `bw-dark` | **Black & White.** Pure black and white with one mid-grey for `out` and muted text. Presets collapse to black or white. Borders become hard 1px `line-200`. Soft shadows become 6px offset solid shadows on overlays. Glass and neumorphic surfaces flatten. In B&W charts, the `out` series also gets a hatch. |

### Surface style (`data-style`)

- **`solid`** (default): `surface-100` on `line-200` with `shadow-xs`. This is the current app's look.
- **`glass`**: a `glass-surface` fill, 16px backdrop blur and a `glass-edge` border with `shadow-glass`. Paint the page `glass-tint` so the blur has something behind it. Keep text on solid tokens and never put body text over raw imagery. Don't use colour gradients.
- **`neu`** (neumorphic): every element shares `neu-ground`. Raised elements use `shadow-neu-raised`. Fields, tracks and pressed buttons use `shadow-neu-inset`, with no borders. Neumorphism is low-contrast, so the focus ring and `ink-label` text carry state. Never rely on the shadow alone.
- Style changes only the surface. Spacing, type, content and behaviour stay the same.

### Type

- Use **Inter** (Google Fonts, weights 400/500/600/700) for everything. `type.families.sans` falls back to the system UI font.
- Set UI text in `body` (14/20). Use `label` (14/20, 500) for labels, widget titles and buttons, and `caption` (12/16) for hints, chips and tooltips.
- Give each view one `page-title`. Set widget figures in `kpi` (24/32, 600, −0.025em).
- `display` and `headline` are for the marketing site only.
- Every number in tables, KPIs, fields and chart axes uses tabular numerals (`rnr-num`).

### Spacing, density and layout

- Spacing is on a 4px base. The source also uses half steps: `space-1.5`, `space-2.5`, `space-3.5`.
- **Density** (`data-density`):

  | | `comfortable` (default) | `compact` |
  |---|---|---|
  | Controls | `control-h` 36px | `control-h-compact` 32px |
  | Card padding | `space-5` | `space-4` |
  | Table rows | `row-comfortable` 10px | `row-compact` 6px |
  
  The setting is remembered per person.
- Lay out mobile-first. Dashboards use a grid of 1 column, 2 from `sm:` and 4 from `lg:`. Widgets span 1, 2 or 4 columns.
- On phones:
  - every widget is full width
  - the builder palette becomes a bottom sheet
  - tables scroll inside their card with the first column sticky
- Hit areas grow to `touch-min` (44px) on coarse pointers.
- Dialogs keep a 1rem gutter (`calc(100% - 2rem)`).

### Radii and elevation

| Radius | Used for |
|---|---|
| `radius-lg` (8px) | Buttons, fields, menus, tooltips |
| `radius-xl` (12px) | Icon tiles, palette blocks, drop zones |
| `radius-2xl` (16px) | Widgets, dialogs, panels |
| `radius-full` | Avatars, chips, kind badges |

| Shadow | Used for |
|---|---|
| `shadow-xs` | At rest |
| `shadow-sm` | Primary buttons, selected segments, edit mode |
| `shadow-lg` | Menus, tooltips |
| `shadow-2xl` | Dialogs, the widget being dragged |

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

- Every focusable control gets a 2px `focus-ring` outline at a 2px offset. The ring follows the preset.
- Body text holds 4.5:1 on its named grounds in all four themes. These source colours fall short and are kept exactly as in the code; their token notes say how to use them:
  - `danger` on `danger-surface` is about 4.4:1
  - `success` is 3.3:1 in light
  - `line-300` is decorative
- Every drag has a keyboard path (Space to lift, arrow keys to move, Space to drop) and a menu path (Move up / Move down / Change width). Moves are announced in a live region.
- Use native `<dialog>` for modals. Menus close on Esc and on an outside click.

## Iconography

- Use the app's own 24×24 stroke set: 34 glyphs, 2px stroke, round caps and joins, `currentColor`. It is copied verbatim into the **Icon** component from `src/ui.tsx`.
- Sizes:

  | Size | Where |
  |---|---|
  | 16px | Buttons and menus |
  | 14px | Icon buttons and segments |
  | 20px | Nav |
- Mark decorative icons `aria-hidden`. Every icon-only button needs an `aria-label`.
- In and out are always the diagonal arrows `in` and `out`. The drag handle is always `grip`.
- No emoji, and no second icon library.

## Wordmark

- There is no drawn logo file. Set the name in type: "Report**No**Report" in the `wordmark` style, with "No" in `ink-faint`.
- Pair it with a 40px `radius-lg` tile in `brand-solid` holding a bold "R" in `brand-solid-ink`.
- Don't redraw it as an image.

## Components

The component sheet is `components/bundle.css`. Its classes all start with `rnr-` and read only tokens. Put the five mode attributes on `<html>`.

| Component | What it is |
|---|---|
| Button | Primary, secondary, ghost and danger buttons |
| Field | A form control with its label |
| Segmented | A row of linked options, one selected |
| Widget | A dashboard card |
| Canvas | The drag-and-drop builder board |
| DataTable | A sortable data table |
| Dialog | A modal window |
| Menu | A dropdown list of actions |
| Badge | Small status marks |
| Icon | The icon set |
| Wordmark | The name set in type |
| AppearancePanel | The settings for theme, preset, style, density and motion |

## Not synced

- **Source:** `delfrinandopranata/reportnoreport` at `main@846662a`. Tokens come from `src/index.css`, `src/ui.tsx`, `src/Dashboard.tsx`, `src/table.tsx` and `index.html`. The neutrals are Tailwind zinc, as the code uses them.
- **Added for v2** (designed from the brief, not from the code):
  - the `bw-light` and `bw-dark` themes
  - glass and neumorphic surfaces
  - compact control heights and card padding (the code sets only row padding)
  - the motion modes
  - the canvas and builder tokens
  - the AppearancePanel and Canvas components
  - `in` in light is `#2873ce`, darkened from the app's `#2a78d6` so it reaches 4.5:1 as text (update `--color-in` in `src/index.css` to match)
- **Not carried over:**
  - the six avatar tint pairs (Tailwind sky, amber, emerald, violet, rose and teal)
  - Tailwind's `blue-100`/`blue-700` "sample data" chip, which maps to `info-surface`/`info-ink`
- **Fonts:** Inter is loaded from Google Fonts, so there are no font files to copy.
- **Logos:** the repository has none. `public/favicon.svg` is Vite's default mark and was not imported.
- **Components:** the code is Tailwind utility classes in React, with no packaged library. The components here are hand-written as static HTML/CSS from `src/ui.tsx`, `src/Dashboard.tsx` and `src/table.tsx`. No React bundle was built.
