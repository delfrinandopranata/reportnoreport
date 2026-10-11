# Phase 7 screens: implementation spec ("Paper that moves")

Sources: `design/README.md` (the system; **it wins** over this file on any visual, copy or accessibility point), `design/tokens.json` / `tokens.css`, `design/components/bundle.css` and the 31 component READMEs, the approved mockup `design/v3-mockup/` (`app.html`, `landing.html`, `tokens-draft.md`), `phase-1-screens.md` to `phase-6-screens.md` (their §0 rules still apply except where this file restyles them), the Phase 7 plan.

**Behaviour is unchanged.** Every section below changes classes, wrappers and icons only. "Existing copy" means the string already in the code; copy changes are listed in §6 and nowhere else.

**Traps (all fixed by the system, still worth knowing):**
1. *Layer trap*: `bundle.css` is now `@layer components`, so Tailwind utilities win. `rnr-card p-0`, `rnr-menu w-72`, `td.flex`, `rnr-block flex-col` are legal and work. The reverse trap is new: **unlayered rules in `src/index.css` that target `rnr-*` beat the bundle.** Task 2 deletes the old duplicates (§7).
2. *Corner trap*: no `rounded-full`, `rounded-3xl` or `rounded-[…]` on a control, card or panel. Radii come from the classes. Circles: avatars (and the documented glyph marks) only.
3. *Folder-in-folder*: never nest `rnr-folder`; a folder inside a dialog is a card.
4. *Filter trap*: `rnr-folder` uses `filter: drop-shadow`, which makes a stacking context and a containing block for `position: fixed`. Dialogs are in the top layer and unaffected; anything else fixed inside a folder must be portalled.
5. *Chip trap*: `rnr-chip` is a mark, never a status. Status is `rnr-status` (icon + word).
6. *Confirm-colour trap*: destructive confirm is `rnr-btn-danger`; sending a campaign is not destructive.
7. *Strike trap*: the old `rnr-strike` (red bar on a letter) is gone; the strike lives only in the wordmark.

## 1. Global

| Item | Spec |
|---|---|
| `<html>` | `lang="en-GB"`, `data-theme`, `data-accent`, `data-density`, `data-motion` set before first paint (Task 2). `<body class="rnr rnr-ground">`. |
| Shell, desktop (≥ 768px) | `rnr-shell` grid `248px | 1fr`, areas `side top / side main`. Sidebar `<aside class="rnr-side rnr-folder">` with `span.rnr-folder-tab.rnr-side-tab` (the wordmark, 44px tab, panel radius 20) and `div.rnr-folder-body.rnr-side-body`: organisation switcher (`rnr-org`, under the wordmark) · `nav[aria-label="Main"]` with groups **Work** (Inbox, Records, Dashboard, Reports), **Build** (Forms, Workflows, Templates, Campaigns), **Admin** (Members, Roles, **Messages**) · `rnr-side-foot` (Notifications, Settings, `rnr-account`: avatar, email, Sign out). Rows `rnr-side-link` 44px, radius 10, Phosphor 20px; current page `aria-current="page"` = accent fill. Visibility rules exactly as today (`nav.test.ts`). Top bar `header.rnr-topbar` holds the ⌘K dock (`rnr-dock`); its wordmark and bell copies are `display: none`. Skip link: `a.rnr-skip href="#main"`. |
| Shell, phone (< 768px) | Sidebar hidden. `rnr-topbar` (sticky): wordmark, dock (icon + "Go to a page", the ⌘K hint hidden), bell. `rnr-phonebar` (fixed bottom, 64px + safe area): the first four items + **Menu**, 44px targets, current = accent fill. Menu opens `dialog.rnr-dialog.rnr-drawer` (left, 320px) containing the switcher, nav and foot; focus returns to Menu on close. `rnr-page` bottom padding reserves the bar. |
| Page | `main#main.rnr-page` (padding 16 / 40, content ≤ 960px; `rnr-wide` up to 1280px for tables and dashboards). Page heading takes focus (`tabindex="-1"`) as in Phases 3–6. |
| Page header | `rnr-crumb` back link where there is a parent ("Back to inbox") → `header.rnr-page-head`: `p.rnr-micro` crumb ("Work · Leave approval") → `h1.rnr-page-title` (one per view; **italic accent word** on titles of two or more words: the last noun, e.g. "Leave *approval*", "Your *inbox*", "New *campaign*"; one-word titles stay upright) → optional `p.rnr-lede` → actions (`rnr-page-actions`) holding the one primary. |
| Folders vs paper vs card | Folder: a **named** section with its own heading (form card, settings groups, KPI tiles, PDF panel, campaign sections, pricing plans). Paper: the one raised surface on a page (auth form card, ⌘K dock, landing window). Card: any flat group (list rows, widgets, filter blocks, review blocks). Never nest folders. |
| List / table pattern | `rnr-card rnr-table-card` > `table.rnr-table` (+ `caption.rnr-sr-only`), `th scope="row"` for the record name, numbers `.num` (mono, tabular), status as `rnr-status`, `rnr-pager` under the table inside the card. |
| Empty / loading / error | `rnr-empty` (four kinds, one action, no illustration); skeletons shaped like the real content, `aria-busy`, no text inside; errors `rnr-note data-tone="down" role="alert"` or the empty-state error kind. |
| Dialogs and menus | Native `<dialog class="rnr-dialog">` via `ConfirmDialog` (panel radius 20, `rnr-dialog-head/body/foot`); menus `rnr-menu` (radius 14, items 10). `rnr-sheet` for the phone palette. |
| Status and the stamp | Status stays `rnr-status` with its word and icon. A record with status approved shows `Stamp "Approved"`, rejected `Stamp "Rejected"`, beside the status mark in the record header folder (`rnr-stamp--corner`), `aria-hidden`, never animated. |
| Fonts | `font-display: swap` with the metric-matched fallbacks in `design/fonts/fonts.css` (`Fraunces Fallback` = Georgia at 89.7%, ascent 109% / descent 29%; `Hanken Grotesk Fallback` = Arial at 99.5%, ascent 100.5% / descent 30.2%; measured with canvas `measureText` on a 105-character pangram), so the swap moves no line break and CLS stays under 0.05. |
| Corners | Controls 10 (8 compact), cards / tiles / menus / tables 14, panels / dialogs / sheets / sidebar / landing window 20, avatars circle; concentric nesting; `corner-shape: squircle` where supported. |
| Icons | Phosphor regular via `src/ui/icons.tsx`: 16px inline, 20px nav, 24px empty states. |

## 2. Screens (grouped as Tasks 6 to 10)

Each row lists the components and the layout notes; nothing else about the screen changes.

### Task 6: auth, organisations, inbox, records, members, roles
| Screen | Components and layout |
|---|---|
| Sign in, create account, reset, set password | No sidebar. Wordmark (large, `data-draw`) centred above one `rnr-paper` form card (`max-w` 440): `rnr-page-head data-align="center"` ("Sign *in*", "Create *account*", "Reset *password*", "Set *password*"), `rnr-field`s (`rnr-input`, 48px), one primary, ghost toggle, errors as `rnr-note data-tone="down" role="alert"` above the buttons. |
| Create organisation | Same auth chrome inside the shell-less layout; folder tab "New organisation"; one field, one primary. |
| Organisation switcher | `rnr-org` button (avatar `--sm` with initials, name, caret) opening a `rnr-menu` (`menuitemradio` per organisation, current ticked, last item "Create organisation…"); `<select>` is replaced only if the existing behaviour already uses a menu; otherwise a `.rnr-select`. |
| Inbox | `rnr-page-head` ("Your *inbox*"); the existing task list as `rnr-table-card`; due / overdue as `rnr-status` (`data-tone="warn"` for overdue with the word "Overdue"); empty state "Nothing waiting" (first run). The mockup's three summary tiles are **not built** (new queries). |
| Start | Centred `rnr-form` folder per the form-page template; tab = the workflow name. |
| Task | Detail template: back link, header, folder with the form answers, outcome buttons (`rnr-outcome`, one primary), status. |
| Records list | List template; columns: reference (mono), name, status (`rnr-status`), updated; status filter as `rnr-seg`; pager. |
| Record page | Detail template: header folder (title, status mark + **stamp** when approved or rejected, PDF actions), timeline folder (`ol` of events, mono times, `rnr-status` icons), PDF panel folder (Task 9 restyles its internals; placement: right column ≥ 1024px, below the timeline otherwise). |
| Members | List template: invite as a `rnr-card` form row (email field + role select + primary "Invite member"); members table with avatar + name, role chips (`rnr-chip`), status; Remove is `rnr-btn-ghost` opening ConfirmDialog (`rnr-btn-danger` "Remove member"). |
| Roles | List of roles as `rnr-card`s; editor is a `rnr-folder` ("Role") above the list: name field, permission checkboxes (`rnr-check`, in `fieldset` groups with `legend`), primary "Save role"; saved state "Saved" with a check for 1.6s. |

### Task 7: forms and workflows
| Screen | Components and layout |
|---|---|
| Forms list | List template; primary "New form" with `rnr-kbd` N; table of forms (name, status, submissions, updated); sticky first column below 640px; empty = first-run state. |
| Form builder | Three regions: palette (`rnr-palette` of `rnr-palette-item`s; a bottom sheet on phones), canvas (`rnr-canvas` with `rnr-block`s, `rnr-drop` slots, handles), field settings (a `rnr-folder` "Field settings": label, hint, required `rnr-check`, options list, show-only-when rule editor `rnr-filter`, calculated formula, repeating section as a nested card). Save bar: `rnr-card` with the one primary "Save form", unsaved chip. Draft input and preview (`rnr-preview`). |
| Form fill | `rnr-form` folder, tab = form name; `rnr-steps` (**named steps**, shown only with > 1 visible page; labels from page breaks, fallback "Step N"); `rnr-input` 48px; file input and signature pad (`rnr-sign`, 5:2, "Clear" ghost); outcome buttons; `rnr-actions` row (Back ghost left, Next / Submit primary right). |
| Form gate | `rnr-empty` error kind for "You do not have access". |
| Submissions | List template (submissions table, answers list as `rnr-review` description list inside a folder per submission). |
| Workflows list | List template; status as `rnr-status`. |
| Workflow editor, Map | `rnr-canvas rnr-flow` board: node cards `rnr-node` (folder with 22px tab = step type), handles, edges, controls; palette; side panel as a `rnr-folder` ("Step"); issues card; save bar. **Map and List** toggled by `rnr-seg` (`aria-pressed`). |
| Workflow editor, List | Step list of `rnr-block`s; step sheet = `rnr-dialog rnr-sheet`; mini canvas = read-only `rnr-flow--readonly`. |
| Workflow gate, Access | Gate = empty error kind; Access page = settings template (folder "Access", role checkboxes). |

### Task 8: communication and campaigns
| Screen | Components and layout |
|---|---|
| Templates list | List template; channel column "Email" / "In-app" / "Email and in-app" words; `rnr-chip` "System" on built-ins. |
| Template editor | Form folder: subject, body (`textarea.rnr-input`), variable menu (`rnr-menu--wide`, items `rnr-menu-item--stack`), unknown variables as `rnr-status data-tone="warn" data-wrap`, preview folder (`rnr-preview`), save / conflict / guard unchanged. |
| Messages | List template; Source segmented (System / Campaign / All); status `rnr-status`; pager "Showing 7,201–7,250 of 13,001". |
| Settings | Settings template: **Appearance first** (Task 5), then Email notifications, then Campaign emails; each a folder; switches use `rnr-switch` where a setting applies at once, checkboxes where Save exists (as today). |
| Notification bell | `rnr-bell` + `rnr-notices` (§ BellPanel). |
| Campaigns list | List template; status `rnr-status` (Draft, Scheduled, Sending, Sent, Not sent); first-run empty state. |
| Campaign editor | Folders **Message**, **Audience**, **Completion tracking**, **When to send** (`max-w` 640 column), action row (Save draft secondary, Send now / Schedule the one primary), draft / scheduled / failed states as `rnr-note`s. |
| Send dialog | `rnr-dialog` with `rnr-review` list; confirm is `rnr-btn-primary` "Send now" (not danger). |
| Campaign report | KPI tiles (`rnr-campaign-tiles` of `KpiTile`s; "<1%" for tiny shares; `data-empty` "No data yet"), chart (§ Charts) + "Show as table", completion block folder, follow-up / failure reasons, recipient table (`rnr-table-card`, filter `rnr-seg`, pager, CSV). |

### Task 9: reports
| Screen | Components and layout |
|---|---|
| Reports list | List template. |
| Report builder (`ReportPage`) | Settings folder (source, columns with `rnr-order`, filters `rnr-filter`, grouping, save) and results card; results `rnr-table rnr-results` with sticky header, pager, CSV; errors `rnr-note`. |
| Dashboard | KPI widgets are `KpiTile`s; chart and table widgets are `rnr-card`s; grid `rnr-grid` 1 / 2 / 4; edit layout mode per the Widget README; add widget dialog; guard. |
| Report template page | Form folders; `TemplatePreview` is the PDF page preview (rename its classes `rnr-pdf-page*`: ink on white, Inter, **not** restyled). |
| PDF panel | Folder "PDF" on the record page: generate (primary), status (`rnr-status`), download link, the script-coverage note ("Tamil, Chinese, Japanese and other scripts print as empty boxes.") as a `rnr-caption`. |

### Task 10: public site
| Page | Layout |
|---|---|
| Landing | See §5. |
| Privacy, terms | Landing header and footer; `.rnr-prose` (Fraunces headings, Hanken body, max 70ch) on one `rnr-paper`; "Last updated" in `rnr-micro`. |
| 404 | One folder card, tab "404", heading "This page is not here." with links "Go to the home page" and "Open the app"; no "we". |
| Unsubscribe | One folder card; existing states (confirm, done, error) and copy unchanged; markup classes only; the button is the one primary. |

## 3. Settings → Appearance

A `FolderCard` with tab "Appearance", first on the Settings page (`rnr-appearance` inside the page, not floating):
- **Theme**: `fieldset` + `legend` ("Theme", micro), native radios Light / Dark / System as `rnr-seg` with `rnr-seg-i`.
- **Accent**: `fieldset` ("Accent"), `rnr-swatches` 4 × 2 (2 × 4 below 480px) of `rnr-swatch` radios; chip carries `data-accent`; label is the accent's name ("Midnight ink", "Ocean glow", "Black & White", "Graphite", "Fern", "Rosewood", "Iris", "Saffron"); selected = 2px ink border + check badge.
- **Density**: `fieldset` ("Density"), Comfortable / Compact.
- **Preview** (`aria-hidden`): primary button "Start free" with the arrow chip, `rnr-trend` "+12.4%", `Stamp "Approved"`.
- Notices: "Appearance saved." (`role="status"`); failure `rnr-note data-tone="down" role="alert"`: "Your appearance is saved on this device only. Try again to keep it on your other devices."; caption "Your choice follows you to every device you sign in on."
- Every change applies at once and saves once at a time (a newer change while saving is queued).

## 4. Charts per accent

`--series-1` is the accent's `strike` (≥ 3:1 on paper in all 16 combinations); `--series-2` is `--ink-3`, drawn **dashed with square markers** (`rnr-chart-line[data-series="out"]`, `rnr-chart-mark`); bars for series 2 are hatched in Black & White (`#rnr-hatch`). Gridlines `--chart-grid`, axis text mono 11px `--ink-3`, tooltip on paper (`rnr-chart-tip`: `--surface`, 1px `--line-strong`). Every chart: `role="img"` + title + description, legend with both marker shapes, "Show as table" toggle (`rnr-btn-ghost` with `aria-pressed`) revealing a `rnr-table`. `chart.ts` geometry is untouched; the only markup change is that series 2's markers become `<rect class="rnr-chart-mark">` instead of circles (Task 4).

## 5. Landing (`/`)

Light theme only; accent from the visitor's stored choice, else Midnight. All layouts below are static HTML; motion is added by `landing.ts` only when `shouldAnimate(...)` is true.

| Section | 1440px | 375px | Still (reduced motion / `?motion=off`) |
|---|---|---|---|
| Header | Wordmark left (`data-draw`), links "How it works", "Pricing", "Sign in", primary "Start free" with chip | Wordmark + primary; links collapse into the footer | Strike drawn |
| Wash | Fixed behind, three blobs, left 36% masked clean | Same, blobs scaled to 120vw | Blobs static |
| Hero | Two columns: copy (micro, `h1` "Turn paperwork into *processes that run.*", lede, primary, "No card needed · Free for 3 workflows") and the tilted `rnr-window` (workflow SVG, pulse, stamp, "Last runs" ticker) | Single column, window flat | Pulse parked on Ask HR, stamp shown still, four ticker rows static |
| Run trace | Heading "Most of a process is *paperwork*." + trace card, rows fill in on reveal | Stacked | Rows filled |
| Approvals where people are | Notification card and chat-style card, request types itself in, "Approve" press, stamp | Stacked | Final state shown |
| Integrations hub | Wordmark centre, four nodes (Email, Chat, Calendar, Storage), dots travelling the paths | Two columns | Dots at rest on the nodes |
| Boring in the ways that matter | Three folder cards: Audit trail, Roles and permissions, PDF records | Stacked | n/a |
| Dashboard | Three KPI tiles with `rnr-trend` chips that sharpen (opacity + scale from .98) on reveal | Stacked | Sharp |
| Pricing | Three folder cards (Free up to 3 workflows, Team, Organisation); the middle one highlighted with an accent border and a "Most popular" micro label; prices `[TBD price]` until the owner supplies them | Stacked | n/a |
| Closing CTA + footer | Accent-gradient card with primary "Start free"; footer © 2026 ReportNoReport, Privacy policy, Terms and conditions, Cookie settings | Stacked | n/a |
Motion timeline (6.2s loop): 0–1.0s pulse trigger → condition; 1.0–2.2s pulse → Ask HR (or, every third loop, → Log); stamp thumps (450ms) when the pulse rests at Ask HR and shows until 5.2s; ticker adds a row every 2.4s; strike drawn once on load; reveals 700ms. `landing.ts` sets `data-motion="flat"` on `<html>` when `shouldAnimate` is false so the CSS freezes the wash and reveals.

## 6. Copy table (new or changed strings)

| Where | Existing | New |
|---|---|---|
| ⌘K placeholder and dock | none | "Go to a page" |
| Jump bar footer | none | "Enter opens the page. Esc closes." |
| Nav group labels | none | "Work", "Build", "Admin" |
| Skip link | "Skip to content" | unchanged |
| Admin nav | Messages between Templates and Campaigns | Messages in Admin |
| Appearance | none | Theme, Accent, Density, "Comfortable", "Compact", "Light", "Dark", "System", accent names (§3), "Appearance saved.", "Your appearance is saved on this device only. Try again to keep it on your other devices.", "Your choice follows you to every device you sign in on." |
| Stamps | none | "Approved", "Rejected" |
| Form steps | none | page-break label, else "Step 1", "Step 2"… |
| Empty state error kind | per screen | "<Thing> did not load" + "Check your connection, then try again." + "Try again" |
| 404 | existing page | "This page is not here." + "Go to the home page" / "Open the app" |
| Landing | existing | see §5 (no "we") |
| Pricing prices | none | `[TBD price]` (owner supplies) |
Everything else keeps its existing string; no "we" anywhere in product copy.

## 7. Accessibility summary

- **Focus order**: skip link → sidebar (switcher, groups top to bottom, foot) → top bar (dock) → page heading → page content. On phones: top bar → page → phone bar. The drawer and ⌘K return focus to their trigger.
- **Landmarks**: `aside`, `nav[aria-label="Main"]`, `nav[aria-label="Quick"]` (phone), `header`, `main#main`.
- **Radiogroups** (Theme, Density, Accent): native radios, arrows move and select, one tab stop; names via `legend`.
- **Targets**: 44px on coarse pointers for every control (`--ctl-h` / `--field-h`), nav rows, icon buttons, swatches, handles. **375px**: no page-level horizontal scroll; tables scroll inside their card with the first column sticky; folder tabs capped to the card width.
- **Contrast**: tested for all 16 combinations (README §3). Colour is never alone: status = icon + word, stamp is decoration, selected swatch = border + check, errors = icon + sentence + outline, charts = dash + square markers.
- **Reduced motion**: `data-motion="flat"` + `prefers-reduced-motion`: no drift, pulse, ticker, typing, stamp thump, slide or shimmer; strike drawn; all content visible.

## 8. `bundle.css` classes (Task 1) and the `src/index.css` mapping (Task 2)

**Added or restyled in `bundle.css`**: `rnr-paper(--plain|--panel)`, `rnr-perf`, `rnr-folder(--panel|--lg|--node)`, `-tab`, `-body`, `rnr-stamp(--sm|--corner)`, `rnr-btn(-primary|-secondary|-ghost|-danger|-sm|-chip)`, `rnr-icon-btn(--soft)`, `rnr-spin`, `rnr-field`, `rnr-label`, `rnr-hint`, `rnr-error(-text)`, `rnr-input` (+ alias `rnr-pill`), `rnr-select`, `rnr-input-wrap`, `rnr-readout`, `rnr-sign`, `rnr-combo`, `rnr-check`, `rnr-check-desc`, `rnr-switch`, `rnr-seg`, `rnr-seg-i`, `rnr-tabs`, `rnr-tab`, `rnr-tabpanel`, `rnr-status`, `rnr-chip(--count)`, `rnr-trend`, `rnr-kind`, `rnr-avatar(--sm|--lg|--soft)`, `rnr-dot`, `rnr-kbd`, `rnr-table(--sticky)`, `rnr-table-card`, `rnr-th-sort`, `rnr-results`, `rnr-cell`, `rnr-pager(-size)`, `rnr-menu(--wide)`, `rnr-menu-anchor`, `rnr-menu-item(--stack)`, `rnr-menu-sep`, `rnr-menu-label`, `rnr-popover`, `rnr-tip`, `rnr-dialog(-head|-body|-foot)`, `rnr-sheet`, `rnr-drawer`, `rnr-toasts`, `rnr-toast`, `rnr-note`, `rnr-steps`, `rnr-step`, `rnr-step-n`, `rnr-progress`, `rnr-skeleton`, `rnr-empty`, `rnr-shell`, `rnr-skip`, `rnr-side*`, `rnr-account*`, `rnr-org`, `rnr-page`, `rnr-wide`, `rnr-topbar*`, `rnr-dock`, `rnr-jump*`, `rnr-phonebar`, `rnr-crumb`, `rnr-page-head`, `rnr-page-title`, `rnr-page-actions`, `rnr-actions`, `rnr-lede`, `rnr-form`, `rnr-two`, `rnr-grid`, `rnr-bell`, `rnr-notices*`, `rnr-notice*`, `rnr-kpi-tile`, `rnr-kpi-figure`, `rnr-campaign-tiles`, `rnr-chart*`, `rnr-canvas`, `rnr-flow`, `rnr-node*`, `rnr-outcome`, `rnr-block`, `rnr-palette*`, `rnr-drop`, `rnr-handle`, `rnr-filter`, `rnr-order*`, `rnr-pick`, `rnr-preview`, `rnr-problem`, `rnr-review`, `rnr-appearance`, `rnr-swatches`, `rnr-swatch*`, `rnr-prefs-preview`, `rnr-pref-caption`, `rnr-wordmark*`, `rnr-strike`, `rnr-wash*`, `rnr-window`, `rnr-rise`, `rnr-pulse|trail|halo`, `rnr-ticker`, `rnr-prose`, `rnr-display`, `rnr-heading`, `rnr-micro`, `rnr-caption`, `rnr-mono`, `rnr-num`, `rnr-muted`, `rnr-link`, `rnr-sr-only`, `rnr-pop`.

**Task 2 `@theme inline` mapping** (old Tailwind names → new tokens): `surface-000` → `canvas`, `surface-canvas` → `canvas`, `surface-100` → `surface`, `surface-200` → `soft`, `line-100` → `soft`, `line-200` → `line`, `line-300` → `line-strong`, `ink` → `ink`, `ink-label` → `ink-2`, `ink-muted` → `ink-3`, `ink-faint` → `ink-3`, `brand` → `acc-a`, `brand-ink` → `on-acc`, `in` → `series-1`, `out` → `series-2`, `success` → `ok-ink`, `danger` → `down`, `font-sans` → `font-ui`; **new names to add**: `field`, `edge`, `down-bg`, `tint`, `stamp`, `strike`, `link`, `font-display`, `font-mono`. Where a mapping is not one-to-one: `success` is used as an icon colour in some screens (use `ok`), `brand` as a *fill* uses `--acc` (a gradient, so `bg-brand` becomes `bg-[image:var(--acc)]` or the class `rnr-btn-primary`): **DD, check each use**.
**Delete from `src/index.css`** (they are now in the bundle, and unlayered copies would override it): everything for `rnr-check`, `rnr-fieldset-label`, `rnr-caption`, `rnr-field[...]`, `textarea.rnr-input`, `input[type="file"].rnr-input`, `rnr-readout`, `rnr-sign`, `rnr-block*`, `rnr-icon-btn[...]`, `rnr-pick`, `dialog.rnr-sheet`, `dialog.rnr-dialog`, the sticky-first rule, all `wf-*` and `.wf-board *` rules, `rnr-bell`, `rnr-notices*`, `rnr-notice*`, `rnr-menu--wide`, `rnr-menu-item*`, `rnr-preview`, `rnr-problem`, `rnr-table*`, `rnr-card*` overrides, `rnr-status*`, `rnr-btn[aria-disabled]`, `rnr-pager*`, `rnr-filter`, `rnr-order*`, `rnr-paper*` (renamed `rnr-pdf-page*`, kept in the reports batch block), `rnr-menu-anchor`, `rnr-widget-menu`, `rnr-chart*`, `rnr-campaign-tiles`, `rnr-kpi[data-empty]`, `rnr-review`, `rnr-hint-warn`, the `rnr-seg[role="group"]` rule, `rnr-pref-caption`; and the `body`, `a:focus-visible`, checkbox and coarse-pointer blocks (the bundle owns them). What stays: the Tailwind imports, `@theme inline`, `body { background: var(--canvas); color: var(--ink); font: var(--type-body); }`, and the four `phase 7: batch N` blocks.

## 9. Conflicts with the Phase 7 plan and the corrections

| # | Plan says | Design spec | Correction |
|---|---|---|---|
| 1 | Goal and Global Constraints: "pill inputs", pill nav and step indicator; tokens "pill 999 / card 22 / inner 14" | The owner's corner rule: controls 10 (8 compact), cards 14, panels 20, avatars alone circles, concentric nesting, squircle | No pill anywhere. The plan's `rnr-pill` class is kept only as an alias of `rnr-input`. Sidebar nav rows, steps, segmented items, chips and inputs are 10px. |
| 2 | Task 1 shape tokens `pill 999 / card 22 / inner 14`, folder tab 32 / sidebar 44 / node 22 | Radii `--r-control` 10, `-control-sm` 8, `-card` 14, `-panel` 20, `-key` 6, `-bar` 3, `-avatar` 9999; folder tab heights unchanged | `tokens.json` `shape.radius`; the test pins the scale. |
| 3 | `rnr-paper` is the identity surface | Phase 5's PDF page preview already uses `rnr-paper*` in `src/index.css` | Task 9 renames the PDF preview classes to `rnr-pdf-page*`; `rnr-paper` belongs to the identity. |
| 4 | Task 2 imports `@fontsource-variable/fraunces` | The wordmark and titles need the `opsz` and `SOFT` axes | Import `@fontsource-variable/fraunces/full.css` and `full-italic.css`; the default import is weight-only and drops `font-variation-settings` silently. |
| 5 | Task 3 skip link `sr-only focus:not-sr-only rnr-btn rnr-btn-secondary` | `.rnr-shell` is a grid; a static focused link would take a cell | Use `a.rnr-skip`. |
| 6 | Task 3 `.rnr-shell` children are placed implicitly | Grid areas `side top / side main` | Keep the plan's markup order (aside, header, main); no wrapper needed. |
| 7 | Task 3 wordmark: SVG line, `aria-label` on a link or `role="img"` | Exact markup and `text-transform: none` in the Wordmark README | Use that markup; the folder tab uppercases text, the class opts out. |
| 8 | Task 4 "chart.ts untouched; only token names change" | Series 2 uses a square marker | `CampaignChart` and `ChartWidget` change one thing: series-2 markers are `<rect class="rnr-chart-mark">`. |
| 9 | Plan wraps `rnr-menu rnr-notices` as `.rnr-menu.rnr-notices` | `rnr-notices` is its own class that also carries the menu surface | Keep `class="rnr-menu rnr-notices"`; both work. |
| 10 | Task 10 pre-paint script sets only `theme` and `accent` | `?motion=off` must freeze the CSS wash and reveals | `landing.ts` sets `data-motion="flat"` when `shouldAnimate(...)` is false; the pre-paint script and its parity test stay as written. |
| 11 | `rnr-btn-chip` is not named | The arrow chip needs a class | `rnr-btn-chip` (28px, radius 8, `--chip-bg` / `--chip-fg`). |
| 12 | Decision 8: no trend chip in the app | Same | Confirmed: `rnr-trend` is for the landing and the Appearance preview. |
| 13 | Decision 10: "series 1 = `strike`" | Same; test adds `series-1` on surface ≥ 3:1 | Confirmed. |
| 14 | The `bw` accent "replaces canvas, lines and shadows" | Also fixes the dark fill (white) | Black & White dark fills are white, guarded by a test. |
| 15 | Task 1 test list has five tests | Fifteen now: adds the corner scale, no colour literals, only existing custom properties, the layer rule, retired modes, component READMEs, B&W fills, same accent keys, same neutral keys | Run `pnpm test`. |

## 10. Decisions the designer took where the mockup was silent (owner review)

Status colours `ok` / `warn` / `info`; a control `edge` token (≥ 3:1) instead of `line-strong`; the chip background for white-on-accent fills; table headers in micro mono caps; tabs as underline with a `--strike` bar; tooltip inverted (`--ink` on `--canvas`); switch as a rounded rectangle; checkbox 20px / radius 6; progress bar radius 3; toast 6s then dismiss; page title `clamp(36px, 4vw + 20px, 64px)` (the mockup's 44 minimum is 36 at 375px so long titles wrap in two lines, not three); Fraunces fallback metrics measured in Chrome on macOS (not on Linux, where Georgia is absent); pricing prices left as `[TBD price]`. "DD": no value was invented for the landing's copy beyond the mockup's.
