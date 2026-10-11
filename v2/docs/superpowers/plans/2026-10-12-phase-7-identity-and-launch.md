# Phase 7 — Visual Identity "Paper that moves", Animated Landing and Go-live Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** v2 gets its own identity, "Paper that moves": paper surfaces with a subtle perforation, folder-tab cards whose tab always fits its label, an approval stamp, a wordmark with a drawn strike, pill inputs, named form steps, KPI tiles with mono figures, and a sidebar-in-a-folder shell (Work / Build / Admin, a ⌘K jump bar, notifications, settings and account at the bottom; a bottom bar and a drawer on phones). Every person chooses Light / Dark / System and one of 8 accents (Midnight ink, Ocean glow, Black & White, Graphite, Fern, Rosewood, Iris, Saffron) in Settings → Appearance; the choice follows them to every device and is applied before first paint. Fraunces, Hanken Grotesk and IBM Plex Mono are bundled with the app (no runtime font host), and Phosphor replaces the hand-rolled icons. Every existing screen is restyled onto the new system with its behaviour unchanged. The public site gets a hand-built animated landing page and matching privacy, terms, 404 and unsubscribe pages. Finally the repository is made ready for v2 to take `reportnoreport.com` while v1 moves to `ledger.reportnoreport.com`: a `deploy-v2.yml` workflow with v2-only secrets, a minimal change to v1's `deploy.yml`, and `docs/go-live.md`, the owner's ordered runbook with verification and rollback. Nothing is deployed by this phase.

**Architecture:** `design/` stays the single authoritative design system and is rewritten, not layered: `design/tokens.json` holds the two neutral themes and the 8 accents (each with a light and a dark value set, 16 combinations); `design/tokens.css` is the same values as CSS custom properties keyed on `<html data-theme="light|dark" data-accent="…" data-density="…" data-motion="…">`; `design/components/bundle.css` is rewritten around the new primitives (`rnr-folder`, `rnr-paper`, `rnr-perf`, `rnr-stamp`, `rnr-pill`, `rnr-steps`, `rnr-kpi-tile`, `rnr-trend`, the sidebar shell), keeping the `rnr-*` class names screens already use (`rnr-btn*`, `rnr-card`, `rnr-input`, `rnr-table-card`, `rnr-seg`, `rnr-menu`, `rnr-dialog`…) so the restyle is mostly CSS. A node test computes WCAG contrast for every accent × theme from `tokens.json` and checks `tokens.css` carries the same values. A pure module `src/ui/appearance.ts` reads and validates a stored appearance and computes the `<html>` attributes; the inline pre-paint scripts in `app/index.html` and the site pages are tested against it by extracting and running them, as `scripts/site-config.test.mjs` already does for the hash forwarder. The person's choice is stored in their Supabase Auth `user_metadata.appearance` (one write per change through `supabase.auth.updateUser`, read back from the session on every device) with `localStorage['rnr.appearance']` as the pre-paint cache. Navigation becomes a pure `src/ui/nav.ts` (groups, current item, phone bar, ⌘K matching) rendered by a new `src/ui/Shell.tsx`. The landing is static HTML (so the headline is the LCP element and indexes without JavaScript) plus `src/site/landing.ts` for reveals, the workflow loop and the run ticker, with the loop timing in a pure `src/site/loop.ts`. Deployment adds `workflow_call` to `ci-v2.yml` and a `deploy-v2.yml` that reuses it, then migrates, sets function secrets and deploys the functions to the **new** v2 Supabase project and the `v2/` Vercel project; v1's `deploy.yml` only gains `paths-ignore` and the ledger URL.

**Tech Stack:** React 19, TypeScript, Vite 8, Tailwind CSS 4, TanStack Query, supabase-js 2 (`auth.updateUser`), `node --test`, oxlint, GitHub Actions, Supabase CLI 2.120.0, Vercel CLI. **New dependencies (approved):** `@phosphor-icons/react` (per-icon named imports, tree-shaken by Vite), `@fontsource-variable/fraunces`, `@fontsource-variable/hanken-grotesk`, `@fontsource/ibm-plex-mono` (OFL 1.1 fonts, bundled as hashed same-origin `woff2` with per-script `unicode-range`, so a page fetches only the Latin subset). No change to `deno.lock`, no database migration, no Edge Function change.

**Spec:** `docs/superpowers/specs/2026-10-11-reportnoreport-v2-design.md` (§15 Design system, §11 Testing); the approved mockup `docs/superpowers/design/v3-mockup/` (`app.html`, `landing.html`, `tokens-draft.md`, the PNGs).

## Global Constraints

- Everything from the Phase 1–6 Global Constraints still holds (British English, sentence-case verb-first buttons, no emoji, `design/` authoritative, tokens and `rnr-*` classes only, one primary button per view, never `disabled` on submit, `aria-busy` + `rnr-spin` while saving, native `<dialog>` via `src/ui/ConfirmDialog.tsx`, the app served from `/app/`, `pnpm build` runs `scripts/check-dist.mjs`). No "we" in product copy (the marketing site may use it, but this plan's landing copy does not need it). No Prettier. No tool branding in commits or branch names. **v1 app code (everything outside `v2/` except `.github/workflows/deploy.yml`) is not touched.** Nothing is pushed or deployed.
- **Behaviour is unchanged.** Screen tasks change markup classes, wrappers and icons only: no query, permission, route, copy (except where the design spec names a copy change), focus or validation change. A reviewer can check a screen task by confirming its diff touches no `api.ts`, `logic.ts`, `route.ts`, `errors.ts` or hook file except where this plan lists one.
- **Decisions this plan takes (reviewer: check these):**
  1. **Theme and accent are two orthogonal attributes.** `data-theme` is `light | dark` on `<html>` (System resolves to one of them, re-resolved when the OS changes); `data-accent` is one of `midnight | ocean | bw | graphite | fern | rosewood | iris | saffron`. Default `system` + `midnight`. An accent may override neutral tokens (Black & White replaces canvas, lines and shadows with pure black/white and hard 1px borders; Rosewood moves `--down` to an orange-red so an error never reads as the accent). The designer finalises all 16 value sets in `tokens.json`; the contrast test (Task 1) is the gate.
  2. **The old modes are retired, two are kept.** `data-preset` (default/ocean/forest/sunset) and `data-style` (solid/glass/neu) are removed with their tokens and CSS: the 8 accents replace presets, and paper replaces the three surface styles. The `bw-light` / `bw-dark` themes become the `bw` accent with either theme. **Density is kept** (`comfortable | compact`, already in `bundle.css`, a few tokens, one more radio group in Appearance). **Motion is no longer a person's setting:** `data-motion` is `flat` whenever the OS asks for reduced motion, otherwise `full`; everything that moves checks it or `prefers-reduced-motion`. Nobody loses a saved choice: no app screen ever wrote `preset`, `style` or `motion` (only the design previews did), and unknown stored keys are ignored.
  3. **Where the choice lives: Supabase Auth `user_metadata.appearance`, not a new table.** It is stored per user in the database (`auth.users.raw_user_meta_data`), arrives with the session on every device with no extra query (so a signed-in person never sees their old accent flash after the session loads), and needs no migration, RLS policy, pgTAP test or Edge Function. The person can write their own metadata, which is fine because appearance is never trusted for anything: `readAppearance` validates whatever comes back and falls back to the defaults. `localStorage['rnr.appearance']` (the key the pre-paint script already reads) is the pre-paint cache; the session value wins whenever it differs. A failed save keeps the choice on this device and says so ("Your appearance is saved on this device only. Try again to keep it on your other devices.").
  4. **Fonts are bundled, never fetched from a font host.** The fontsource packages are imported from `src/index.css` and `src/site/site.css`, so Vite emits hashed `woff2` files under `/assets/` (already `immutable` in `vercel.json`). `check-dist` gains a rule that fails the build on any `fonts.googleapis.com` / `fonts.gstatic.com` reference in built HTML, CSS or JS. **There is no Content-Security-Policy header in `v2/vercel.json` today**; this phase does not add one (the inline pre-paint and forwarder scripts, `consent.js` and the Supabase connect origin would all need allowances and a separate test), but after it every font, script and stylesheet is same-origin, so a later `font-src 'self'` passes. The `og.png` card and favicons are unchanged.
  5. **Phosphor through the existing icon module.** `src/ui/icons.tsx` keeps its exported names (`CheckIcon`, `XIcon`, …, size prop, `aria-hidden`) and maps each to a Phosphor component, so callers do not change; the shell's nav icons are added there. Phosphor `regular` weight, 20px in navigation, 16px inline. No other file imports `@phosphor-icons/react` directly (checked by a grep in Task 2), so the icon set has one home.
  6. **Navigation groups.** Work: Inbox, Records, Dashboard, Reports. Build: Forms, Workflows, Templates, Campaigns. Admin: Members, Roles, **Messages** (the sent-message log moves here from between Templates and Campaigns; it is an audit view). Visibility rules are exactly today's (`App.tsx` header), pinned by `nav.test.ts`. Bottom of the sidebar: Notifications (the existing `NotificationBell`), Settings, and the account (email, Sign out). The organisation switcher sits under the wordmark. Phones (< 768px): a top bar with the wordmark, the ⌘K button and the bell, and a bottom bar with the first four items plus "Menu", which opens the full sidebar in a native `<dialog>` drawer.
  7. **⌘K is a jump bar over pages, not a search engine.** It lists the pages the person can open (the nav items plus Settings), filters by label as they type, and goes there on Enter. Searching records, forms or people would be a new query surface and is out of scope; the placeholder says "Go to a page" rather than the mockup's "Search or run a command". The mockup's top-bar calendar, "+" and "Synced" chips have no behaviour behind them in v2 and are not built.
  8. **KPI tiles and trend chips.** Existing figures become KPI tiles (Dashboard KPI widgets, the campaign report tiles): folder-tab label, mono figure. No screen has a comparison figure today, so **no trend chip appears in the app** and none is invented; `rnr-trend` is in the design system and used on the landing page. The mockup's inbox tiles (Open records / Waiting on you / Done this week) would be new queries and are not added.
  9. **The stamp** appears on a record whose status is approved ("Approved") or rejected ("Rejected"), next to the existing status mark (which keeps the word and icon, so the stamp is decoration, `aria-hidden`), in the Appearance preview, and on the landing page. It never animates in the app.
  10. **Charts follow the accent.** Series 1 (`--series-1`, was `--in`) is each accent's `strike` value (designed to reach 3:1 on paper); series 2 (`--series-2`, was `--out`) is `ink-3` drawn with the existing dash/hatch and square markers, so the two never depend on colour alone. Gridlines use `--soft`. `chart.ts` geometry is untouched; only token names change.
  11. **The PDF is not restyled.** Record PDFs stay ink on white in Inter (`render-pdfs/fonts/Inter-*.ttf`). Swapping in Hanken Grotesk would change every advance width the unshaped layout in `render.ts` measures, re-open the QA-P5-2 script-coverage note and spend part of `RENDER_BUDGET_MS` on a third embedded font, for a document most people print. The in-app PDF panel (Task 9) is restyled; the generated file is not.
  12. **Landing.** Static HTML in `index.html`, light theme only, accent from the visitor's stored choice or Midnight. Hand-built CSS + inline SVG + one small module script; no canvas library, no three.js, no video. Only `transform` and `opacity` animate (the wash blobs are rasterised once and drifted with `translate3d`/`scale`). Reveals use `IntersectionObserver` and only hide content after `landing.ts` has added `html.js`, so the page is complete without JavaScript. Everything that moves is off under `prefers-reduced-motion` (and `?motion=off` for screenshots). Targets: LCP < 2.5 s and CLS < 0.05 on Lighthouse mobile, measured in Task 12. The mockup's "Watch a 2-minute build", "Customers" and "All systems normal" have no destination and are not built.
  13. **Pricing needs the owner.** The pricing section has three plans with the middle one highlighted. Plan names and limits come from the mockup ("Free for 3 workflows"); **prices are not invented**: the HTML carries `[TBD price]` until the owner supplies them, and `check-dist`'s existing placeholder rule fails `pnpm build` while any remains, so the page cannot ship with a made-up price. Task 10 leaves them in; the owner replaces them before go-live (`docs/go-live.md` step 0).
  14. **Go-live separation.** v2 uses a **new** Supabase project and the `v2/` Vercel project; v1 keeps its Supabase project, users and Vercel project. `deploy-v2.yml` reads only v2-namespaced secrets and variables (`SUPABASE_V2_*`, `V2_*`, `VERCEL_V2_PROJECT_ID`) plus the shared `VERCEL_TOKEN` / `VERCEL_ORG_ID`, from a separate `production-v2` GitHub environment, under its own concurrency group. v1's `deploy.yml` gets `paths-ignore` for v2 and its two workflow files, and the ledger URL. Because merging #45 changes `deploy.yml` itself, **v1 deploys once on that merge** and sets its `APP_URL` to the ledger URL, so `ledger.reportnoreport.com` must be live before the merge (runbook section A). `ci-v2.yml` drops its `push: main` trigger (the deploy calls it, so it would otherwise run twice) and gains `workflow_call`.
  15. **Task order:** the designer's tokens and spec first (Task 1); the foundation (Task 2); shell, components and Appearance (Tasks 3–5); then four screen batches by folder in parallel (Tasks 6–9) alongside the landing (Task 10); the backend's deploy and runbook task (Task 11) has no dependency and runs any time; QA last (Task 12).
- **Parallel-safe screen batches.** Tasks 6–9 each own a disjoint set of folders. All shared classes come from `design/components/bundle.css` (Task 1) and the shell/components work (Tasks 3–5). If a batch needs a new class, it adds it only inside its own pre-created block in `src/index.css` (`/* phase 7: batch 6 */` … `/* phase 7: batch 9 */`, created empty in Task 4), so batches never edit the same lines.
- **Defect classes from Phase 1–6 QA that must not recur:**
  - **no inline `style` props** (QA-P4-5): the current `Wordmark` and landing inline styles are removed; every style is a class; SVG geometry uses attributes (the landing loop moves dots with `setAttribute('cx'|'cy'|'opacity')`);
  - **the layer trap**: `bundle.css` is unlayered and beats Tailwind utilities — never `rnr-card p-0`, `rnr-menu w-…`, `td.flex`; use the designer's classes;
  - **no "we" in copy** (QA-P5-9), including the landing, the 404 and the Appearance captions;
  - **colour never alone**: status keeps its word and icon; the stamp, accent and chart colours are additions; Black & White's `--down` is ink, so errors always carry the X icon and a sentence;
  - **focus**: the drawer and ⌘K return focus to their trigger on close; the page heading still takes focus where Phases 3–6 put it; the sidebar is a `<nav aria-label="Main">` with `aria-current="page"`;
  - **44px targets** on coarse pointers, pill inputs 48px; 375px with no page-level horizontal scroll;
  - **`prefers-reduced-motion`**: no wash drift, pulse, ticker, typing or stamp animation; the strike is drawn; all content visible;
  - TanStack Query keys, mutations and their tests are untouched by screen tasks;
  - `shortcut:` notes always name the limit and when to upgrade.
- The Senior Designer's `design/` rewrite and `docs/superpowers/design/phase-7-screens.md` (Task 1) are committed before Tasks 2–10 start. Where the spec differs from this plan on a visual, copy or accessibility point, the design spec wins; behaviour, data and deployment stay as this plan says.

## Review Focus

1. **Every accent meets contrast in both themes** → text pairs ≥ 4.5:1 and non-text (strike, focus ring, chart series) ≥ 3:1 for all 16 combinations, with translucent tints composited over the surface they sit on. (test "every accent and theme meets WCAG contrast" in Task 1)
2. **The CSS is the JSON** → every value in `tokens.json` is in the matching `tokens.css` rule, and an accent that overrides a neutral token overrides it in both themes (otherwise a light override leaks into dark). (tests "tokens.css carries every tokens.json value", "an accent overrides the same tokens in both themes" in Task 1)
3. **No flash, no mismatch** → the inline pre-paint scripts set exactly the attributes the app sets for the same stored value, including garbage. (tests "the app pre-paint script sets the same attributes as htmlAttrs", "site pages take the stored accent, always light" in Task 2)
4. **Stored appearance is untrusted** → unknown themes, accents, densities, non-objects and old `preset`/`style`/`bw` keys fall back to the defaults. (test "unknown or old values fall back to the defaults" in Task 2)
5. **No runtime font host** → a built page referencing Google Fonts fails `check-dist`. (test "external font hosts are refused" in Task 2; `pnpm build` in Task 12)
6. **Navigation shows exactly what it showed before** → per permission set, the same pages appear, the current item is the same, phones get the first four plus Menu, ⌘K only offers reachable pages. (tests in `src/ui/nav.test.ts`, Task 3)
7. **Form steps are named** → steps use each page break's label and fall back to "Step N". (test "steps are named by their page breaks" in Task 7)
8. **The landing is still when it should be** → reduced motion and `?motion=off` start nothing; the loop stamps at Ask HR and takes the log branch every third loop. (tests in `src/site/loop.test.ts`, Task 10; reduced-motion screenshot in Task 12)
9. **v2 deploys cannot touch v1** → v1's deploy ignores v2 paths and points at the ledger; v2's deploy reads only v2-namespaced secrets, sets `APP_URL=https://reportnoreport.com/app/` and runs CI v2 first. (tests in `scripts/deploy-config.test.mjs`, Task 11)
10. **Every screen, every combination** → screenshots of every screen × Midnight and Saffron × light and dark × 1440px and 375px, plus all 8 accents on the shell and Appearance, reviewed against the spec. (Task 12)

---

## Owners and order

| Task | Owner | Depends on |
|---|---|---|
| 1. Design system: 8-accent tokens, contrast test, `bundle.css`, component specs, `phase-7-screens.md` | Senior Designer | — |
| 2. Foundation: fonts, Phosphor, appearance module, pre-paint scripts, `check-dist` font rule | Senior UX engineer | 1 |
| 3. Shell: sidebar-in-a-folder, nav groups, ⌘K jump bar, phone bar and drawer, wordmark | Senior UX engineer | 1, 2 |
| 4. Identity components and charts: folder card, paper, stamp, KPI tile, steps, pills, series tokens | Senior UX engineer | 1, 2 |
| 5. Settings → Appearance and per-user persistence | Senior UX engineer | 2, 4 |
| 6. Screens batch A: auth, organisations, inbox, records, members, roles | Frontend engineer | 3, 4 |
| 7. Screens batch B: forms (list, builder, fill, submissions) and workflows (list, canvas, access) | Frontend engineer | 3, 4 |
| 8. Screens batch C: communication (templates, messages, settings) and campaigns | Frontend engineer | 3, 4, 5 |
| 9. Screens batch D: reports, report builder and results, dashboard, PDF panel, report template | Frontend engineer | 3, 4 |
| 10. Landing page and site pages (privacy, terms, 404, unsubscribe) | Senior UX engineer | 1, 2 |
| 11. Go-live prep: `deploy-v2.yml`, v1 `deploy.yml`, `ci-v2.yml`, `docs/go-live.md`, README | Backend engineer | — |
| 12. QA: checks, Lighthouse, visual regression sweep | QA engineer | 1–11 |

The designer runs Task 1 first; the backend engineer can run Task 11 at any time. After Task 1, the senior UX engineer runs 2, then 3 and 4 (either order), then 5, and Task 10 any time after 2. Tasks 6, 7 and 9 start once 3 and 4 are committed and can run in parallel (two frontend engineers, or one after another); Task 8 also waits for 5 because it shares `SettingsPage.tsx`. Task 12 runs last.

---

## File Structure

```
docs/superpowers/design/v3-mockup/                     the approved mockup (committed as the reference, Task 1)
docs/superpowers/design/phase-7-screens.md             per-screen mapping, copy, accessibility (Task 1)
design/tokens.json                                     rewritten: themes {light, dark}, accents {8 × {label, light, dark}}, type, shape, motion
design/tokens.css                                      rewritten: same values as custom properties; data-theme × data-accent × data-density
design/components/bundle.css                           rewritten: paper, folder, perf, stamp, pill, steps, kpi tile, trend, shell, buttons, fields,
                                                       tables, dialogs, menus, segmented, badges; preset/style/glass/neu removed
design/components/{FolderCard,Paper,Stamp,Steps,KpiTile,Shell,Wordmark,Field,Button,AppearancePanel,…}/README.md + preview.html
design/components/Cover/                               deleted (glass/neu cover preview)
design/README.md                                       rewritten for "Paper that moves"
scripts/tokens.test.mjs                                contrast for 16 combinations; tokens.css ↔ tokens.json
package.json, pnpm-lock.yaml                           @phosphor-icons/react, @fontsource-variable/fraunces, @fontsource-variable/hanken-grotesk, @fontsource/ibm-plex-mono
src/index.css                                          font imports, @theme names re-pointed, batch blocks, shell and component classes
src/ui/appearance.ts, appearance.test.ts               ACCENTS, THEMES, readAppearance, htmlAttrs, sameAppearance, pre-paint parity
src/ui/useAppearance.ts                                apply, cache, save to user_metadata, follow the OS
src/ui/icons.tsx                                       Phosphor behind the same names; NAV_ICONS, SearchIcon, GearIcon, MenuIcon, ArrowRightIcon
app/index.html                                         pre-paint script (theme, accent, density, motion); Google Fonts links removed
scripts/check-dist.mjs, check-dist.test.mjs            findExternalFonts
src/ui/nav.ts, nav.test.ts                             navGroups, phoneItems, jumpItems, matchJump
src/ui/Shell.tsx                                       sidebar folder, phone bar, drawer, account
src/ui/JumpBar.tsx                                     ⌘K dialog
src/ui/Wordmark.tsx                                    Fraunces wordmark with the strike, no inline styles
src/App.tsx                                            Shell replaces the header; session appearance sync
src/ui/FolderCard.tsx, Stamp.tsx, KpiTile.tsx          identity components
src/forms/fill/steps.ts, steps.test.ts                 stepLabels
src/forms/fill/Steps.tsx                               named steps
src/ui/AppearanceSettings.tsx                          Settings → Appearance
src/comms/SettingsPage.tsx                             renders AppearanceSettings first (Task 5); restyled (Task 8)
src/{auth,orgs,inbox,records,members,roles}/**         restyled (Task 6)
src/{forms,workflows}/**                               restyled (Task 7)
src/{comms,campaigns}/**                               restyled (Task 8)
src/reports/**                                         restyled (Task 9)
index.html                                             animated landing
privacy.html, terms.html, 404.html, unsubscribe.html   restyled; Google Fonts links removed
src/site/site.css                                      landing and site styles
src/site/loop.ts, loop.test.ts                         loopState, runLine, shouldAnimate
src/site/landing.ts                                    reveals, workflow loop, ticker, typing card, integration dots
src/site/unsubscribe.ts                                unchanged behaviour; markup classes only
.github/workflows/ci-v2.yml                            workflow_call; push trigger removed
.github/workflows/deploy-v2.yml                        new
.github/workflows/deploy.yml                           paths-ignore v2; ledger APP_URL and environment URL
scripts/deploy-config.test.mjs                         workflow separation
docs/go-live.md                                        owner runbook
README.md                                              Deploy section points at go-live.md; design and fonts notes
docs/superpowers/qa/phase-7-round-1.md                 QA report (Task 12)
```

---

### Task 1: Design system — 8-accent tokens, contrast test, `bundle.css`, component specs, screen spec

**Owner:** Senior Designer · **Depends on:** — (must be committed before Tasks 2–10 start)

**Files:**
- Create: `scripts/tokens.test.mjs`, `docs/superpowers/design/phase-7-screens.md`, `design/components/{FolderCard,Paper,Stamp,Steps,KpiTile,Shell}/README.md` + `preview.html`
- Modify (rewrite): `design/tokens.json`, `design/tokens.css`, `design/components/bundle.css`, `design/README.md`, the existing `design/components/*/README.md` + `preview.html` (Button, Field, Badge, DataTable, Dialog, Menu, Segmented, Widget, Canvas, Icon, Wordmark, AppearancePanel)
- Delete: `design/components/Cover/`
- Add to git: `docs/superpowers/design/v3-mockup/` (re-read `tokens-draft.md` and `app.html` first: the 8 accents are in `app.html` lines 23–43; `tokens-draft.md` still lists two)

**Interfaces:**
- Consumes: the mockup (`app.html` `:root` / `[data-theme]` / `[data-accent]` blocks, `landing.html`, `tokens-draft.md`, PNGs), the current `design/` (class names screens use), `src/index.css` (`@theme inline` names), `docs/superpowers/design/phase-1-screens.md`–`phase-6-screens.md` (their §0 rules still apply).
- Produces:
  - `design/tokens.json` shape (the test depends on it):
    ```json
    {
      "theme": { "light": { "canvas": "#F3F5FA", "surface": "#FBFCFE", "field": "#FFFFFF", "ink": "#141A2E", "ink-2": "#2E3550", "ink-3": "#565C70", "line": "rgba(20,26,46,.14)", "soft": "rgba(20,26,46,.07)", "perf": "rgba(20,26,46,.2)", "line-strong": "rgba(20,26,46,.26)", "side": "#EEF1F8", "down": "#A3262E", "down-bg": "rgba(163,38,46,.12)", "focus": "#141A2E" }, "dark": { "…": "…" } },
      "accent": {
        "midnight": { "label": "Midnight ink", "light": { "acc-a": "#2453D6", "acc-b": "#16204A", "on-acc": "#FFFFFF", "chip-bg": "…", "chip-fg": "#FFFFFF", "pill-dot": "#9DB8FF", "strike": "#2453D6", "stamp": "#1E3A8A", "ok-ink": "#1E3A8A", "tint": "rgba(36,83,214,.12)", "pulse": "#2453D6", "trail": "#16204A", "series-1": "#2453D6" }, "dark": { "…": "…" } },
        "ocean": { "…": "…" }, "bw": { "…": "…" }, "graphite": { "…": "…" }, "fern": { "…": "…" }, "rosewood": { "…": "…" }, "iris": { "…": "…" }, "saffron": { "…": "…" }
      },
      "type": { "…": "…" }, "shape": { "…": "…" }, "motion": { "…": "…" }
    }
    ```
    An accent's `light` / `dark` object may also carry neutral keys (`canvas`, `down`, …); the effective palette for a combination is `{ ...theme[t], ...accent[a][t] }`. Only colours are tested; `type`, `shape` and `motion` hold the values from `tokens-draft.md` (Fraunces / Hanken Grotesk / IBM Plex Mono, sizes, pill 999 / card 22 / inner 14, folder tab 32 / sidebar 44 / node 22, durations 150 / 240 / 700, easing `cubic-bezier(.2,.7,.2,1)`, touch 44, input 48, sidebar 248, form card 640, page max 960).
  - `design/tokens.css`: `:root, [data-theme="light"] { … }`, `[data-theme="dark"] { … }`, then for every accent `[data-accent="x"] { … }` and `[data-accent="x"][data-theme="dark"] { … }` (Midnight's light rule also carries `:root`), each declaring exactly the keys of its JSON object as `--key:value`, plus `--acc: linear-gradient(120deg, var(--acc-a), var(--acc-b))`, `--series-2: var(--ink-3)`, the type/shape/motion custom properties, `[data-density="compact"]` and `[data-motion="flat"]`.
  - `design/components/bundle.css` class list (named in the README and spec §12): `rnr-paper`, `rnr-perf`, `rnr-folder` / `rnr-folder-tab` / `rnr-folder-body`, `rnr-stamp`, `rnr-pill` (inputs and selects; `rnr-input` becomes an alias selector of it), `rnr-steps` / `rnr-step` / `rnr-step-n`, `rnr-kpi-tile` / `rnr-kpi-figure`, `rnr-trend` (`[data-dir="up|down|flat"]`), `rnr-micro` (mono caps), `rnr-display` (Fraunces), `rnr-shell` / `rnr-side` / `rnr-side-group` / `rnr-side-link` / `rnr-side-foot` / `rnr-topbar` / `rnr-phonebar` / `rnr-drawer`, `rnr-jump` / `rnr-jump-option`, `rnr-wordmark` / `rnr-strike`, `rnr-swatch`, plus every existing `rnr-*` class screens use, restyled.

- [ ] **Step 1: Write the failing test** — `scripts/tokens.test.mjs`

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const tokens = JSON.parse(readFileSync(new URL('../design/tokens.json', import.meta.url)))
const css = readFileSync(new URL('../design/tokens.css', import.meta.url), 'utf8').replace(/\s+/g, '').toLowerCase()
const ACCENTS = ['midnight', 'ocean', 'bw', 'graphite', 'fern', 'rosewood', 'iris', 'saffron']
const THEMES = ['light', 'dark']

/** '#RRGGBB' or 'rgba(r,g,b,a)' → [r, g, b, a] (0–255, alpha 0–1). */
export const parse = (c) => {
  const hex = c.match(/^#([0-9a-f]{6})$/i)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1)
  const m = c.replace(/\s/g, '').match(/^rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)$/i)
  if (!m) throw new Error(`Not a colour: ${c}`)
  return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]]
}
/** A translucent colour as it looks painted over an opaque base. */
export const over = (top, base) => {
  const [r, g, b, a] = parse(top), [R, G, B] = parse(base)
  return `rgba(${Math.round(r * a + R * (1 - a))},${Math.round(g * a + G * (1 - a))},${Math.round(b * a + B * (1 - a))},1)`
}
const lum = (c) => {
  const [r, g, b] = parse(c).map((v, i) => (i < 3 ? v / 255 : v)).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const contrast = (fg, bg) => {
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

const palette = (a, t) => ({ ...tokens.theme[t], ...tokens.accent[a][t] })

test('contrast maths matches WCAG reference values', () => {
  assert.equal(contrast('#000000', '#FFFFFF').toFixed(2), '21.00')
  assert.equal(contrast('#767676', '#FFFFFF').toFixed(2), '4.54')
  assert.equal(over('rgba(0,0,0,.5)', '#FFFFFF'), 'rgba(128,128,128,1)')
})

test('every accent and theme meets WCAG contrast', () => {
  const problems = []
  for (const a of ACCENTS) for (const t of THEMES) {
    const p = palette(a, t)
    const on = (top, base) => (parse(p[top])[3] < 1 ? over(p[top], p[base]) : p[top])
    const pairs = [
      // [label, foreground, background, minimum]
      ['ink on canvas', p.ink, p.canvas, 4.5], ['ink on surface', p.ink, p.surface, 4.5], ['ink-2 on surface', p['ink-2'], p.surface, 4.5],
      ['ink-3 on canvas', p['ink-3'], p.canvas, 4.5], ['ink-3 on surface', p['ink-3'], p.surface, 4.5], ['ink-3 on field', p['ink-3'], p.field, 4.5],
      ['on-acc on acc start', p['on-acc'], p['acc-a'], 4.5], ['on-acc on acc end', p['on-acc'], p['acc-b'], 4.5],
      ['chip-fg on chip-bg over acc start', p['chip-fg'], parse(p['chip-bg'])[3] < 1 ? over(p['chip-bg'], p['acc-a']) : p['chip-bg'], 4.5],
      ['stamp on surface', p.stamp, p.surface, 4.5], ['ok-ink on tint', p['ok-ink'], on('tint', 'surface'), 4.5],
      ['down on surface', p.down, p.surface, 4.5], ['down on down-bg', p.down, on('down-bg', 'surface'), 4.5],
      ['strike on canvas', p.strike, p.canvas, 3], ['focus on canvas', p.focus, p.canvas, 3],
      ['series-1 on surface', p['series-1'], p.surface, 3], ['series-2 on surface', p['ink-3'], p.surface, 3],
    ]
    for (const [label, fg, bg, min] of pairs) {
      const ratio = contrast(fg, bg)
      if (ratio < min) problems.push(`${a}/${t}: ${label} is ${ratio.toFixed(2)} (needs ${min})`)
    }
  }
  assert.deepEqual(problems, [])
})

test('tokens.css carries every tokens.json value', () => {
  const bodies = (selector) => [...css.matchAll(new RegExp(`${selector.replace(/[[\]"=]/g, '\\$&')}\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join(';')
  const missing = []
  const check = (selector, values) => {
    const body = bodies(selector)
    for (const [k, v] of Object.entries(values)) if (k !== 'label' && !body.includes(`--${k}:${v.replace(/\s+/g, '').toLowerCase()}`)) missing.push(`${selector} --${k}`)
  }
  check('[data-theme="light"]', tokens.theme.light)
  check('[data-theme="dark"]', tokens.theme.dark)
  for (const a of ACCENTS) {
    check(`[data-accent="${a}"]`, tokens.accent[a].light)
    check(`[data-accent="${a}"][data-theme="dark"]`, tokens.accent[a].dark)
  }
  assert.deepEqual(missing, [])
})

test('an accent overrides the same tokens in both themes', () => {
  // A neutral overridden only in the light rule (same specificity as [data-theme="dark"]) would leak into dark.
  for (const a of ACCENTS) assert.deepEqual(Object.keys(tokens.accent[a].light).sort(), Object.keys(tokens.accent[a].dark).sort(), a)
})

test('eight accents, each labelled', () => {
  assert.deepEqual(Object.keys(tokens.accent), ACCENTS)
  for (const a of ACCENTS) assert.ok(tokens.accent[a].label, a)
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test` → `scripts/tokens.test.mjs` fails (`tokens.theme` is undefined in the current zinc `tokens.json`).

- [ ] **Step 3: Write `design/tokens.json` and `design/tokens.css`** from the mockup's `app.html` blocks (lines 8–43): the two themes, the 8 accents, Rosewood's `down` override and Black & White's neutral and shadow overrides, each present in both themes. Split each `--acc` gradient into `acc-a` / `acc-b`. Add `series-1` per accent (start from `strike`). Run the test; where a pair fails, change the value and record the change in the README's contrast table. Known from `tokens-draft.md`: Midnight's `chip-bg rgba(255,255,255,.2)` over `#2453D6` gives about 4.3 against white, so the step-number chip needs a darker chip background (for example a translucent ink) in every white-on-accent theme. No value is invented where the mockup is silent: write "DD" in the spec and ask the owner.

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm test` → the five `tokens.test.mjs` tests pass.

- [ ] **Step 5: Rewrite `design/components/bundle.css`** around the primitives listed under Interfaces. The folder tab is the one place the mockup's geometry is load-bearing, so it is fixed here:

```css
.rnr-folder { position: relative; padding-top: var(--folder-tab-h); filter: var(--fshadow); }
.rnr-folder-tab {
  position: absolute; top: 0; left: 0; z-index: 2; height: var(--folder-tab-h);
  min-width: max-content; padding: 0 16px; white-space: nowrap; /* the tab grows with its label and never clips */
  display: flex; align-items: center; border-radius: var(--r-sm) var(--r-sm) 0 0; background: var(--surface);
  font: 500 11px/1 var(--font-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--ink-3);
}
.rnr-folder-tab::after {
  content: ""; position: absolute; right: -14px; bottom: 0; width: 14px; height: 14px;
  background: radial-gradient(circle at 100% 0, transparent 13.5px, var(--surface) 14px); /* concave shoulder */
}
.rnr-folder-body { background: var(--surface); border-radius: 0 var(--r-card) var(--r-card) var(--r-card); padding: var(--space-5); }
.rnr-perf { height: 2px; margin: 11px 0 var(--space-4); background: radial-gradient(circle, var(--perf) 1px, transparent 1.4px) 0 0 / 8px 2px repeat-x; }
@media (max-width: 640px) { .rnr-folder-tab { max-width: calc(100% - 28px); } } /* still nowrap; a label this long is a copy bug the spec lists */
```

Remove every `data-preset`, `data-style`, `glass-*`, `neu-*`, `bw-*` rule and token. Keep `[data-density="compact"]` and `[data-motion="flat"]`. Primary buttons are `background: var(--acc); color: var(--on-acc)` with the arrow chip; there is still exactly one primary per view.

- [ ] **Step 6: Write the component READMEs and previews** (FolderCard, Paper, Stamp, Steps, KpiTile, Shell new; the others rewritten; Cover deleted). Each preview has the theme × accent switcher from the mockup so the designer can check all 16 combinations. Rewrite `design/README.md`: content fundamentals (unchanged rules, "you" not "we"), colour (themes, accents, what the accent is used for — primary button, active nav, steps, KPI bars, avatars, the strike, the stamp, series 1 — and never as body text on paper), the contrast table generated from the test, type (three families, sizes, tabular mono figures), shape and paper, folder tab rules, motion and reduced motion, icons (Phosphor regular, 20 nav / 16 inline, `currentColor`, through `src/ui/icons.tsx` only), density, layout (shell 248px, page max 960, form card 640), and the retired modes with the reason.

- [ ] **Step 7: Write `docs/superpowers/design/phase-7-screens.md`** in the format of `phase-6-screens.md`, with:
  1. Global: the shell (desktop and phone), page header pattern (micro crumb in `rnr-micro`, `rnr-display` title with an optional italic accent word — which titles get one is listed, never decided per screen), where folder cards versus plain paper are used, list and table pattern (`rnr-table-card` on paper, mono numbers), empty, loading and error states, dialogs and menus, badges and status marks with the stamp, the font fallback faces (`size-adjust` / `ascent-override` for Georgia → Fraunces and system-ui → Hanken Grotesk, measured, so the font swap stays under CLS 0.05).
  2. One section per screen with the components it uses and any copy change, grouped exactly as Tasks 6–10: auth (sign in, sign up, reset, set password); create organisation; organisation switcher; inbox, start, task; records list, record page (timeline, stamp, PDF panel position); members (table, invite form); roles (list, editor); forms list, form builder (palette, field list, field settings, rule editor), form fill (named steps, pill inputs, file and signature inputs), submissions; workflows list, workflow canvas Map and List views (node cards with the 22px tab, side panel, step sheet, mini canvas), access page; templates list, template editor (variable menu, preview); messages; settings (appearance, email notifications, campaign emails); reports list, report builder (`ReportPage`), results table, dashboard and widgets (KPI tiles, charts), report template page and preview, PDF panel; campaigns list, editor, send dialog, report (tiles, chart, recipient table); the landing sections; privacy, terms, 404, unsubscribe.
  3. Settings → Appearance: Theme (Light / Dark / System) and Density (Comfortable / Compact) as segmented radio groups, Accent as 8 swatches in a 4 × 2 grid (gradient chip + name, selected state = 2px ink border and check, never colour alone), the live preview row (primary button with chip, trend chip, stamp), the saved / failed notices.
  4. Charts per accent: `--series-1`, `--series-2` with dash and square markers, gridlines `--soft`, tooltip on paper.
  5. Landing: every section's layout at 1440 and 375, the motion timeline, and what each looks like still.
  6. Copy table for every new or changed string, and an accessibility summary (focus order through sidebar, ⌘K and drawer; radiogroups; 44px targets; 375px; reduced motion).
  7. §12: every class added to `bundle.css`, and the `src/index.css` `@theme inline` mapping the UX engineer applies in Task 2 (old Tailwind colour names → new tokens: `surface-000` → `canvas`, `surface-100` → `surface`, `surface-200` → `soft`, `surface-canvas` → `canvas`, `line-100` → `soft`, `line-200` → `line`, `line-300` → `line-strong`, `ink-label` → `ink-2`, `ink-muted` and `ink-faint` → `ink-3`, `brand` → `acc-a`, `in` → `series-1`, `out` → `series-2`, `success` → `ok-ink`, `danger` → `down`; DD where a mapping is not one-to-one).
  8. Conflicts with this plan and the corrections the frontend must make.

- [ ] **Step 8: Commit**

```bash
git add design scripts/tokens.test.mjs docs/superpowers/design/phase-7-screens.md docs/superpowers/design/v3-mockup
git commit -m "feat: replace the design system with paper that moves"
```

---

### Task 2: Foundation — fonts, Phosphor, appearance module, pre-paint scripts, `check-dist` font rule

**Owner:** Senior UX engineer · **Depends on:** 1

**Files:**
- Create: `src/ui/appearance.ts`, `src/ui/appearance.test.ts`
- Modify: `package.json`, `pnpm-lock.yaml`, `src/index.css`, `src/ui/icons.tsx`, `app/index.html`, `scripts/check-dist.mjs`, `scripts/check-dist.test.mjs`

**Interfaces:**
- Consumes: `design/tokens.css`, `design/components/bundle.css`, spec §12 mapping (Task 1).
- Produces:
  - `src/ui/appearance.ts`: `ACCENTS`, `type Accent`, `ACCENT_LABEL: Record<Accent, string>`, `THEMES`, `type Theme`, `DENSITIES`, `type Density`, `type Appearance = { theme; accent; density }`, `DEFAULT_APPEARANCE`, `STORAGE_KEY = 'rnr.appearance'`, `readAppearance(raw: unknown): Appearance`, `type HtmlAttrs`, `htmlAttrs(a, prefersDark, reducedMotion): HtmlAttrs`, `sameAppearance(a, b): boolean`
  - `src/ui/icons.tsx`: the 16 existing exports unchanged in name and props, plus `NAV_ICONS: Record<NavIcon, IconComponent>`, `SearchIcon`, `GearIcon`, `MenuIcon`, `ArrowRightIcon`, `ArrowUpRightIcon`, `MinusIcon`, `type IconComponent`
  - `scripts/check-dist.mjs`: `findExternalFonts(text): string[]`

- [ ] **Step 1: Write the failing tests**

`src/ui/appearance.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ACCENTS, DEFAULT_APPEARANCE, htmlAttrs, readAppearance, sameAppearance } from './appearance.ts'

test('a valid stored appearance is kept', () => {
  assert.deepEqual(readAppearance({ theme: 'dark', accent: 'saffron', density: 'compact' }), { theme: 'dark', accent: 'saffron', density: 'compact' })
  assert.equal(ACCENTS.length, 8)
})

test('unknown or old values fall back to the defaults', () => {
  for (const raw of [null, undefined, 'dark', 42, [], { theme: 'blue', accent: 'forest', density: 'tiny' }, { preset: 'ocean', style: 'glass', bw: true, motion: 'flat' }]) {
    assert.deepEqual(readAppearance(raw), DEFAULT_APPEARANCE, JSON.stringify(raw))
  }
  assert.deepEqual(readAppearance({ accent: 'iris' }), { ...DEFAULT_APPEARANCE, accent: 'iris' })
})

test('system follows the OS; reduced motion is always flat', () => {
  const sys = { ...DEFAULT_APPEARANCE, theme: 'system' as const }
  assert.equal(htmlAttrs(sys, true, false).theme, 'dark')
  assert.equal(htmlAttrs(sys, false, false).theme, 'light')
  assert.equal(htmlAttrs({ ...sys, theme: 'light' }, true, false).theme, 'light')
  assert.equal(htmlAttrs(sys, false, true).motion, 'flat')
  assert.equal(htmlAttrs(sys, false, false).motion, 'full')
  assert.ok(sameAppearance(DEFAULT_APPEARANCE, { ...DEFAULT_APPEARANCE }))
  assert.ok(!sameAppearance(DEFAULT_APPEARANCE, { ...DEFAULT_APPEARANCE, accent: 'fern' }))
})

/** Runs an inline <script> from an HTML file against a fake document, storage and matchMedia. */
const runPrePaint = (file: string, marker: RegExp, stored: string | null, dark: boolean, reduce: boolean) => {
  const html = readFileSync(new URL(file, import.meta.url), 'utf8')
  const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => marker.test(s))
  assert.ok(src, `no pre-paint script in ${file}`)
  const dataset: Record<string, string> = {}
  const localStorage = { getItem: () => stored }
  const matchMedia = (q: string) => ({ matches: q.includes('dark') ? dark : q.includes('reduced-motion') ? reduce : false })
  new Function('document', 'localStorage', 'matchMedia', src)({ documentElement: { dataset } }, localStorage, matchMedia)
  return dataset
}

test('the app pre-paint script sets the same attributes as htmlAttrs', () => {
  const cases: [string | null, boolean, boolean][] = [
    [null, true, false], [JSON.stringify({ theme: 'light', accent: 'bw', density: 'compact' }), true, true],
    [JSON.stringify({ theme: 'system', accent: 'ocean' }), false, false], ['{not json', true, false],
    [JSON.stringify({ theme: 'neon', accent: 'forest', density: 9 }), false, true],
  ]
  for (const [stored, dark, reduce] of cases) {
    let parsed: unknown = {}
    try { parsed = JSON.parse(stored ?? '{}') } catch { /* garbage stays {} */ }
    assert.deepEqual(runPrePaint('../../app/index.html', /rnr\.appearance/, stored, dark, reduce),
      { ...htmlAttrs(readAppearance(parsed), dark, reduce) }, String(stored))
  }
})
```

(The site-page parity test is added in Task 10 with the site scripts.)

Append to `scripts/check-dist.test.mjs` (and import `findExternalFonts` with the others):

```js
test('external font hosts are refused', () => {
  assert.deepEqual(findExternalFonts('<link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet">'),
    ['https://fonts.googleapis.com/css2?family=Inter&display=swap'])
  assert.deepEqual(findExternalFonts('@font-face{src:url(https://fonts.gstatic.com/s/inter/v1.woff2)}'), ['https://fonts.gstatic.com/s/inter/v1.woff2'])
  assert.deepEqual(findExternalFonts('@font-face{src:url(/assets/fraunces-latin-wght-normal-AbC123.woff2)}'), [])
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test` → `appearance.test.ts` cannot import `./appearance.ts`; `findExternalFonts` is not exported.

- [ ] **Step 3: Implement `src/ui/appearance.ts`**

```ts
export const ACCENTS = ['midnight', 'ocean', 'bw', 'graphite', 'fern', 'rosewood', 'iris', 'saffron'] as const
export type Accent = (typeof ACCENTS)[number]
export const ACCENT_LABEL: Record<Accent, string> = {
  midnight: 'Midnight ink', ocean: 'Ocean glow', bw: 'Black & White', graphite: 'Graphite',
  fern: 'Fern', rosewood: 'Rosewood', iris: 'Iris', saffron: 'Saffron',
}
export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]
export const DENSITIES = ['comfortable', 'compact'] as const
export type Density = (typeof DENSITIES)[number]
export type Appearance = { theme: Theme; accent: Accent; density: Density }
export const DEFAULT_APPEARANCE: Appearance = { theme: 'system', accent: 'midnight', density: 'comfortable' }
export const STORAGE_KEY = 'rnr.appearance'

const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  (list as readonly unknown[]).includes(v) ? (v as T) : fallback

/** Anything stored (localStorage, user_metadata) is untrusted: unknown keys and values fall back to the defaults. */
export function readAppearance(raw: unknown): Appearance {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return {
    theme: pick(THEMES, o.theme, DEFAULT_APPEARANCE.theme),
    accent: pick(ACCENTS, o.accent, DEFAULT_APPEARANCE.accent),
    density: pick(DENSITIES, o.density, DEFAULT_APPEARANCE.density),
  }
}

export type HtmlAttrs = { theme: 'light' | 'dark'; accent: Accent; density: Density; motion: 'full' | 'flat' }
/** The <html> data attributes for a choice; the pre-paint script in app/index.html must produce the same (tested). */
export const htmlAttrs = (a: Appearance, prefersDark: boolean, reducedMotion: boolean): HtmlAttrs => ({
  theme: a.theme === 'system' ? (prefersDark ? 'dark' : 'light') : a.theme,
  accent: a.accent,
  density: a.density,
  motion: reducedMotion ? 'flat' : 'full',
})

export const sameAppearance = (a: Appearance, b: Appearance) => a.theme === b.theme && a.accent === b.accent && a.density === b.density
```

- [ ] **Step 4: Replace the pre-paint script in `app/index.html`** and delete its three Google Fonts `<link>` lines:

```html
    <script>
      (() => {
        // Mirrors src/ui/appearance.ts htmlAttrs(readAppearance(stored)); appearance.test.ts runs this against it.
        let s = {}
        try { s = JSON.parse(localStorage.getItem('rnr.appearance') || '{}') || {} } catch {}
        const pick = (list, v, d) => (list.includes(v) ? v : d)
        const theme = pick(['light', 'dark', 'system'], s.theme, 'system')
        const h = document.documentElement.dataset
        h.theme = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme
        h.accent = pick(['midnight', 'ocean', 'bw', 'graphite', 'fern', 'rosewood', 'iris', 'saffron'], s.accent, 'midnight')
        h.density = pick(['comfortable', 'compact'], s.density, 'comfortable')
        h.motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'flat' : 'full'
      })()
    </script>
```

(`JSON.parse('null')` and `JSON.parse('[]')` reach `pick` as `null` / an array; `s.theme` on an array is `undefined`, so both fall back like `readAppearance`. The `|| {}` covers `null`.)

- [ ] **Step 5: Add `findExternalFonts` to `scripts/check-dist.mjs`** and run it on HTML, CSS and JS:

```js
export const findExternalFonts = (text) => text.match(/https?:\/\/fonts\.(?:googleapis|gstatic)\.com[^\s"')]*/g) ?? []
```

In `checkDist`, after the secrets loop (which already runs for `.html|js|css|…`):

```js
    if (/\.(html|css|js)$/.test(rel)) for (const url of findExternalFonts(text)) problems.push(`${rel}: loads a font from ${url} (bundle it instead)`)
```

- [ ] **Step 6: Run — expect PASS**

Run: `pnpm test` → the four appearance tests and the font test pass.

- [ ] **Step 7: Add the dependencies**

```bash
pnpm add @phosphor-icons/react @fontsource-variable/fraunces @fontsource-variable/hanken-grotesk @fontsource/ibm-plex-mono
ls node_modules/@fontsource-variable/fraunces    # pick the stylesheet that includes the SOFT and opsz axes (full.css / full-italic.css); if absent, opsz.css / opsz-italic.css and note it in the PR
```

- [ ] **Step 8: Wire fonts and tokens in `src/index.css`.** At the top, before the design imports:

```css
@import "@fontsource-variable/fraunces/full.css";
@import "@fontsource-variable/fraunces/full-italic.css";
@import "@fontsource-variable/hanken-grotesk/index.css";
@import "@fontsource/ibm-plex-mono/400.css";
@import "@fontsource/ibm-plex-mono/500.css";
```

Re-point `@theme inline` to the spec §12 mapping (Tailwind class names such as `bg-surface-100` keep working; their zinc values are gone), set `--font-sans: var(--font-ui)`, add `--font-mono` and `--font-display`, and replace every `data-theme^="bw"` and `data-motion="full"` rule in this file with its spec equivalent (`[data-accent="bw"]`, and `[data-motion="full"]` stays as is). Remove `"Inter"` everywhere in `src/`.

- [ ] **Step 9: Rewrite `src/ui/icons.tsx`** on Phosphor, same export names. Use the names the installed version exports without deprecation (from 2.1.8 they carry an `Icon` suffix):

```tsx
import type { ComponentType } from 'react'
import {
  ArrowLeftIcon, ArrowRightIcon as PhArrowRight, ArrowUpRightIcon as PhArrowUpRight, BellIcon as PhBell, CaretDownIcon, CaretRightIcon,
  CaretUpIcon, ChartLineUpIcon, CheckIcon as PhCheck, ClockIcon as PhClock, DatabaseIcon, DotsSixVerticalIcon, DotsThreeVerticalIcon,
  DownloadSimpleIcon, EnvelopeSimpleIcon, GearSixIcon, GitBranchIcon, ListIcon, MagnifyingGlassIcon, MegaphoneIcon, MinusIcon as PhMinus,
  NotePencilIcon, PaperPlaneTiltIcon, PencilSimpleIcon, PlusIcon as PhPlus, ShieldCheckIcon, SquaresFourIcon, StopIcon as PhStop,
  TrashIcon as PhTrash, TrayIcon, UsersThreeIcon, XIcon as PhX, type Icon,
} from '@phosphor-icons/react'
import type { NavIcon } from './nav'

export type IconComponent = ComponentType<{ size?: number }>
/** Every icon is decorative: the control around it carries the name. Phosphor regular, currentColor. */
const icon = (C: Icon): IconComponent => ({ size = 16 }) => <C size={size} aria-hidden="true" focusable="false" />

export const CheckIcon = icon(PhCheck)
export const XIcon = icon(PhX)
export const ClockIcon = icon(PhClock)
export const PlusIcon = icon(PhPlus)
export const TrashIcon = icon(PhTrash)
export const GripIcon = icon(DotsSixVerticalIcon)
export const UpIcon = icon(CaretUpIcon)
export const DownIcon = icon(CaretDownIcon)
export const BackIcon = icon(ArrowLeftIcon)
export const PencilIcon = icon(PencilSimpleIcon)
export const StopIcon = icon(PhStop)
export const RightIcon = icon(CaretRightIcon)
export const BellIcon = icon(PhBell)
export const DownloadIcon = icon(DownloadSimpleIcon)
export const MoreIcon = icon(DotsThreeVerticalIcon)
export const SearchIcon = icon(MagnifyingGlassIcon)
export const GearIcon = icon(GearSixIcon)
export const MenuIcon = icon(ListIcon)
export const ArrowRightIcon = icon(PhArrowRight)
export const ArrowUpRightIcon = icon(PhArrowUpRight)
export const MinusIcon = icon(PhMinus)

export const NAV_ICONS: Record<NavIcon, IconComponent> = {
  inbox: icon(TrayIcon), records: icon(DatabaseIcon), dashboard: icon(SquaresFourIcon), reports: icon(ChartLineUpIcon),
  forms: icon(NotePencilIcon), workflows: icon(GitBranchIcon), templates: icon(EnvelopeSimpleIcon), campaigns: icon(MegaphoneIcon),
  members: icon(UsersThreeIcon), roles: icon(ShieldCheckIcon), messages: icon(PaperPlaneTiltIcon),
}
```

(Task 2 creates `src/ui/nav.ts` with only the `NavIcon` union from Task 3 Step 3, so this file compiles; Task 3 adds the rest of that module.)

- [ ] **Step 10: Verify**

```bash
grep -rn "@phosphor-icons/react" src --include='*.ts*' | grep -v src/ui/icons.tsx   # expect nothing
grep -rn "Inter\b\|fonts.googleapis" src app index.html   # expect only index.html and the site pages (Task 10 removes those)
pnpm lint && pnpm build                                   # build fails on the site pages' Google Fonts until Task 10; confirm the only check-dist problems are those
```

Open `/app/` in the Browser pane: fonts load from `/assets/*.woff2` (Network panel), icons render, `<html>` carries `data-theme`, `data-accent`, `data-density`, `data-motion` before React mounts.

- [ ] **Step 11: Commit**

```bash
git add package.json pnpm-lock.yaml src/index.css src/ui/icons.tsx src/ui/nav.ts src/ui/appearance.ts src/ui/appearance.test.ts app/index.html scripts/check-dist.mjs scripts/check-dist.test.mjs
git commit -m "feat: bundle the new fonts and icons and apply theme and accent before first paint"
```

---

### Task 3: Shell — sidebar-in-a-folder, nav groups, ⌘K jump bar, phone bar and drawer, wordmark

**Owner:** Senior UX engineer · **Depends on:** 1, 2

**Files:**
- Create: `src/ui/nav.test.ts`, `src/ui/Shell.tsx`, `src/ui/JumpBar.tsx`
- Modify: `src/ui/nav.ts`, `src/ui/Wordmark.tsx`, `src/App.tsx`, `src/orgs/OrgSwitcher.tsx` (markup classes only), `src/comms/NotificationBell.tsx` (markup classes only), `src/index.css`

**Interfaces:**
- Consumes: `Route` (`rbac/route`), `useOrg().can`, `NAV_ICONS`, `SearchIcon`, `GearIcon`, `MenuIcon` (Task 2), `OrgSwitcher`, `NotificationBell`, `useAction`, `guarded` (`navGuard`), `useMedia`, spec §1 shell and §2 per-screen.
- Produces:
  - `src/ui/nav.ts`: `type NavIcon`, `type NavPerms = { reports; workflows; comms; broadcast; roles }`, `type NavItem = { href; label; icon; current }`, `type NavGroup = { label: 'Work' | 'Build' | 'Admin'; items: NavItem[] }`, `navGroups(page, perms): NavGroup[]`, `phoneItems(groups): NavItem[]`, `jumpItems(groups): { href; label }[]`, `matchJump(items, query)`
  - `src/ui/Shell.tsx`: `Shell({ page, perms, email, children })`
  - `src/ui/JumpBar.tsx`: `JumpBar({ items })` (button + `<dialog>`; ⌘K / Ctrl+K opens it)
  - `src/ui/Wordmark.tsx`: `Wordmark({ href? })` (same props)

- [ ] **Step 1: Write the failing test** — `src/ui/nav.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jumpItems, matchJump, navGroups, phoneItems, type NavPerms } from './nav.ts'

const none: NavPerms = { reports: false, workflows: false, comms: false, broadcast: false, roles: false }
const all: NavPerms = { reports: true, workflows: true, comms: true, broadcast: true, roles: true }
const labels = (page: Parameters<typeof navGroups>[0], p: NavPerms) => navGroups(page, p).map((g) => [g.label, g.items.map((i) => i.label)])

test('a member without extra permissions sees what the old header showed', () => {
  assert.deepEqual(labels('inbox', none), [['Work', ['Inbox', 'Records']], ['Build', ['Forms']], ['Admin', ['Members']]])
})

test('every permission adds its page to its group', () => {
  assert.deepEqual(labels('inbox', all), [
    ['Work', ['Inbox', 'Records', 'Dashboard', 'Reports']],
    ['Build', ['Forms', 'Workflows', 'Templates', 'Campaigns']],
    ['Admin', ['Members', 'Roles', 'Messages']],
  ])
  assert.deepEqual(labels('inbox', { ...none, broadcast: true })[1], ['Build', ['Forms', 'Campaigns']])
})

test('the current item matches the old header rules', () => {
  const current = (page: Parameters<typeof navGroups>[0]) => navGroups(page, all).flatMap((g) => g.items).filter((i) => i.current).map((i) => i.label)
  assert.deepEqual(current('task'), ['Inbox'])
  assert.deepEqual(current('start'), ['Inbox'])
  assert.deepEqual(current('record'), ['Records'])
  assert.deepEqual(current('form-fill'), ['Forms'])
  assert.deepEqual(current('workflow-report'), ['Workflows'])
  assert.deepEqual(current('template'), ['Templates'])
  assert.deepEqual(current('campaign'), ['Campaigns'])
  assert.deepEqual(current('settings'), [])
})

test('phones get the first four pages; the jump bar offers every page plus Settings', () => {
  assert.deepEqual(phoneItems(navGroups('inbox', all)).map((i) => i.label), ['Inbox', 'Records', 'Dashboard', 'Reports'])
  assert.deepEqual(phoneItems(navGroups('inbox', none)).map((i) => i.label), ['Inbox', 'Records', 'Forms', 'Members'])
  const items = jumpItems(navGroups('inbox', none))
  assert.deepEqual(items.map((i) => i.label), ['Inbox', 'Records', 'Forms', 'Members', 'Settings'])
  assert.deepEqual(matchJump(items, '  REC ').map((i) => i.href), ['#/records'])
  assert.equal(matchJump(items, '').length, 5)
  assert.deepEqual(matchJump(items, 'campaigns'), []) // not offered without comms.broadcast
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test` → `navGroups` is not exported.

- [ ] **Step 3: Implement `src/ui/nav.ts`**

```ts
import type { Route } from '../rbac/route'

export type NavIcon = 'inbox' | 'records' | 'dashboard' | 'reports' | 'forms' | 'workflows' | 'templates' | 'campaigns' | 'members' | 'roles' | 'messages'
export type NavPerms = { reports: boolean; workflows: boolean; comms: boolean; broadcast: boolean; roles: boolean }
export type NavItem = { href: string; label: string; icon: NavIcon; current: boolean }
export type NavGroup = { label: 'Work' | 'Build' | 'Admin'; items: NavItem[] }

/** The sidebar. Visibility is exactly the old header's (App.tsx before Phase 7); nav.test.ts pins it. */
export function navGroups(page: Route['page'], p: NavPerms): NavGroup[] {
  const item = (show: boolean, href: string, label: string, icon: NavIcon, current: boolean): NavItem[] =>
    show ? [{ href, label, icon, current }] : []
  return [
    { label: 'Work', items: [
      ...item(true, '#/inbox', 'Inbox', 'inbox', page === 'inbox' || page === 'start' || page === 'task'),
      ...item(true, '#/records', 'Records', 'records', page === 'records' || page === 'record'),
      ...item(p.reports, '#/dashboard', 'Dashboard', 'dashboard', page === 'dashboard'),
      ...item(p.reports, '#/reports', 'Reports', 'reports', page === 'reports' || page === 'report'),
    ] },
    { label: 'Build', items: [
      ...item(true, '#/forms', 'Forms', 'forms', page.startsWith('form')),
      ...item(p.workflows, '#/workflows', 'Workflows', 'workflows', page.startsWith('workflow')),
      ...item(p.comms, '#/templates', 'Templates', 'templates', page === 'templates' || page === 'template'),
      ...item(p.broadcast, '#/campaigns', 'Campaigns', 'campaigns', page === 'campaigns' || page === 'campaign'),
    ] },
    { label: 'Admin', items: [
      ...item(true, '#/members', 'Members', 'members', page === 'members'),
      ...item(p.roles, '#/roles', 'Roles', 'roles', page === 'roles'),
      ...item(p.comms, '#/messages', 'Messages', 'messages', page === 'messages'),
    ] },
  ]
}

export const phoneItems = (groups: NavGroup[]) => groups.flatMap((g) => g.items).slice(0, 4)

export const jumpItems = (groups: NavGroup[]) =>
  [...groups.flatMap((g) => g.items.map(({ href, label }) => ({ href, label }))), { href: '#/settings', label: 'Settings' }]

export const matchJump = (items: { href: string; label: string }[], query: string) => {
  const q = query.trim().toLowerCase()
  return items.filter((i) => i.label.toLowerCase().includes(q))
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm test` → the four nav tests pass.

- [ ] **Step 5: Build `src/ui/JumpBar.tsx`.** A `rnr-jump` button ("Go to a page", `⌘K` / `Ctrl K` hint by platform, `aria-keyshortcuts="Meta+K Control+K"`) that opens a native `<dialog className="rnr-dialog rnr-jump">` containing a labelled `rnr-pill` input (`role="combobox"`, `aria-controls`, `aria-activedescendant`, `aria-expanded="true"`) and a `role="listbox"` of `rnr-jump-option` items from `matchJump`. Up/Down move the active option, Enter sets `location.hash` (so `useHash` and `navGuard` handle unsaved changes as for any link), Escape closes; focus returns to the button. A `keydown` listener on `document` opens it for `(e.metaKey || e.ctrlKey) && e.key === 'k'` and calls `preventDefault()`. Empty result: "No page matches “…”."

- [ ] **Step 6: Build `src/ui/Shell.tsx`** and replace the `<header>` in `App.tsx`:

```tsx
import { useRef, type ReactNode } from 'react'
import { supabase } from '../data/supabase'
import { OrgSwitcher } from '../orgs/OrgSwitcher'
import { NotificationBell } from '../comms/NotificationBell'
import { Wordmark } from './Wordmark'
import { JumpBar } from './JumpBar'
import { useAction } from './useAction'
import { guarded } from './navGuard'
import { GearIcon, MenuIcon, NAV_ICONS, XIcon } from './icons'
import { jumpItems, navGroups, phoneItems, type NavPerms } from './nav'
import type { Route } from '../rbac/route'

export function Shell({ page, perms, email, children }: { page: Route['page']; perms: NavPerms; email: string; children: ReactNode }) {
  const groups = navGroups(page, perms)
  const drawer = useRef<HTMLDialogElement>(null)
  const out = useAction()
  const links = (onPick?: () => void) => groups.map((g) => (
    <div key={g.label} className="rnr-side-group">
      <p className="rnr-micro" id={`nav-${g.label}`}>{g.label}</p>
      <ul aria-labelledby={`nav-${g.label}`}>
        {g.items.map((i) => {
          const Icon = NAV_ICONS[i.icon]
          return <li key={i.href}><a className="rnr-side-link" href={i.href} aria-current={i.current ? 'page' : undefined} onClick={onPick}><Icon size={20} />{i.label}</a></li>
        })}
      </ul>
    </div>
  ))
  const foot = (
    <div className="rnr-side-foot">
      <NotificationBell />
      <a className="rnr-side-link" href="#/settings" aria-current={page === 'settings' ? 'page' : undefined}><GearIcon size={20} />Settings</a>
      <div className="rnr-account">
        <span className="rnr-account-email">{email}</span>
        <button className="rnr-btn rnr-btn-ghost" type="button" aria-busy={out.busy}
          onClick={() => guarded(() => out.run(() => supabase.auth.signOut()))}>
          {out.busy && <span className="rnr-spin" aria-hidden="true" />}{out.busy ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  )
  return (
    <div className="rnr-shell">
      <a href="#main" className="sr-only focus:not-sr-only rnr-btn rnr-btn-secondary">Skip to content</a>
      <aside className="rnr-side rnr-folder">
        <span className="rnr-folder-tab rnr-side-tab"><Wordmark href="#/inbox" /></span>
        <div className="rnr-folder-body rnr-side-body">
          <OrgSwitcher />
          <nav aria-label="Main">{links()}</nav>
          {foot}
        </div>
      </aside>
      <header className="rnr-topbar">
        <span className="rnr-topbar-mark"><Wordmark href="#/inbox" /></span>
        <JumpBar items={jumpItems(groups)} />
        <span className="rnr-topbar-bell"><NotificationBell /></span>
      </header>
      <main id="main" className="rnr-page">{children}</main>
      <nav className="rnr-phonebar" aria-label="Quick">
        {phoneItems(groups).map((i) => {
          const Icon = NAV_ICONS[i.icon]
          return <a key={i.href} href={i.href} aria-current={i.current ? 'page' : undefined} aria-label={i.label}><Icon size={20} /></a>
        })}
        <button type="button" aria-label="Menu" aria-haspopup="dialog" onClick={() => drawer.current?.showModal()}><MenuIcon size={20} /></button>
      </nav>
      <dialog ref={drawer} className="rnr-dialog rnr-drawer" aria-label="Menu">
        <button type="button" className="rnr-btn rnr-btn-ghost" aria-label="Close menu" onClick={() => drawer.current?.close()}><XIcon size={20} /></button>
        <OrgSwitcher />
        <nav aria-label="Main">{links(() => drawer.current?.close())}</nav>
        {foot}
      </dialog>
    </div>
  )
}
```

The second `NotificationBell` and `OrgSwitcher` instances are only displayed at their breakpoint (`rnr-side` hidden below 768px; `rnr-topbar-bell`, `rnr-phonebar`, the drawer hidden at and above it), so a person never meets two of either; the hidden copy is `display: none` and out of the accessibility tree. `App.tsx`'s `Shell` component keeps its loading, failed and create-organisation branches and its guard, and renders `<Shell page={route.page} perms={…} email={session.user.email ?? ''}><Page key={`${orgId}${hash}`} route={route} /></Shell>` — pass the email down from `App` as a prop, the only signature change.

- [ ] **Step 7: Rewrite `src/ui/Wordmark.tsx`** with classes only (no inline `style`): Fraunces "Report**No**Report" with the strike through the second "R" drawn once (`.7s`, `.5s` delay, `stroke-dashoffset` on an inline SVG line; drawn and still under `data-motion="flat"`), `aria-label="ReportNoReport"` on the link or `role="img"` wrapper as today.

- [ ] **Step 8: Verify in the Browser pane** at 1440 and 375, Midnight and Saffron, light and dark: sidebar groups and bottom items, `aria-current`, org switcher, bell menu, sign out, ⌘K and Ctrl+K open the jump bar, arrow keys and Enter navigate, Escape returns focus, an unsaved form still asks before the jump bar leaves it, phone bar and drawer (focus trapped by `<dialog>`, returns to Menu), no page-level horizontal scroll at 375.

- [ ] **Step 9: Commit**

```bash
git add src/ui/nav.ts src/ui/nav.test.ts src/ui/Shell.tsx src/ui/JumpBar.tsx src/ui/Wordmark.tsx src/App.tsx src/orgs/OrgSwitcher.tsx src/comms/NotificationBell.tsx src/index.css
git commit -m "feat: move navigation into a folder sidebar with a jump bar and a phone menu"
```

---

### Task 4: Identity components and charts — folder card, paper, stamp, KPI tile, pills, series tokens

**Owner:** Senior UX engineer · **Depends on:** 1, 2

**Files:**
- Create: `src/ui/FolderCard.tsx`, `src/ui/Stamp.tsx`, `src/ui/KpiTile.tsx`
- Modify: `src/index.css` (component classes not already in `bundle.css`; the four empty batch blocks), `src/reports/ChartWidget.tsx`, `src/campaigns/CampaignChart.tsx` (token names only)

**Interfaces:**
- Consumes: `bundle.css` classes (Task 1), spec §1 and §4.
- Produces:
  - `FolderCard({ tab, headingId?, children, className? })` — `<section className="rnr-folder"><span className="rnr-folder-tab" id={headingId}>{tab}</span><div className="rnr-folder-body"><div className="rnr-perf" aria-hidden="true" />{children}</div></section>`; `aria-labelledby` set when `headingId` is given
  - `Stamp({ label })` — `<span className="rnr-stamp" aria-hidden="true">{label}</span>` (decoration; the status word is always shown elsewhere)
  - `KpiTile({ label, value, caption? })` — a `FolderCard` with the label as tab, `rnr-kpi-figure` (mono, tabular) and an optional caption
  - `src/index.css` blocks `/* phase 7: batch 6 */` … `/* phase 7: batch 9 */`, empty

- [ ] **Step 1: Write the components** above exactly as specified (they hold no logic, so no unit test; QA's screenshots cover the long-label tab at 375px).

- [ ] **Step 2: Recolour the charts by token.** In `src/index.css` and the two chart components, replace `--in` with `--series-1`, `--out` with `--series-2`, `--chart-grid` with `--soft`; keep the dash, hatch and square-marker rules (now keyed on `[data-accent="bw"]` where they were keyed on `bw` themes). No geometry, label or test change: `pnpm test` still passes `chart.test.ts` in both folders unchanged.

- [ ] **Step 3: Add the batch blocks** at the end of `src/index.css`:

```css
/* phase 7: batch 6 — auth, orgs, inbox, records, members, roles (Task 6 only) */
/* phase 7: batch 7 — forms, workflows (Task 7 only) */
/* phase 7: batch 8 — comms, campaigns (Task 8 only) */
/* phase 7: batch 9 — reports (Task 9 only) */
```

- [ ] **Step 4: Verify** the three components on a scratch route in the Browser pane in all 8 accents (light and dark), including a 40-character tab label at 375px (the tab grows, never clips), then remove the scratch route.

- [ ] **Step 5: Commit**

```bash
git add src/ui/FolderCard.tsx src/ui/Stamp.tsx src/ui/KpiTile.tsx src/index.css src/reports/ChartWidget.tsx src/campaigns/CampaignChart.tsx
git commit -m "feat: add folder cards, stamps and KPI tiles and colour charts by accent"
```

---

### Task 5: Settings → Appearance and per-user persistence

**Owner:** Senior UX engineer · **Depends on:** 2, 4

**Files:**
- Create: `src/ui/useAppearance.ts`, `src/ui/AppearanceSettings.tsx`
- Modify: `src/App.tsx` (apply the session's appearance), `src/comms/SettingsPage.tsx` (render `<AppearanceSettings />` first; nothing else in this file changes here)

**Interfaces:**
- Consumes: `readAppearance`, `htmlAttrs`, `sameAppearance`, `STORAGE_KEY`, `ACCENTS`, `ACCENT_LABEL`, `THEMES`, `DENSITIES` (Task 2), `supabase.auth.updateUser`, `Session.user.user_metadata`, `useAction`, `useNotice`, `Stamp`, spec §3.
- Produces:
  - `src/ui/useAppearance.ts`: `currentAppearance(): Appearance` (from `localStorage`), `applyAppearance(a): void` (sets the four attributes, writes the cache), `syncFromSession(meta: unknown): void` (applies `meta.appearance` when present and different), `saveAppearance(a): Promise<{ error: string | null }>`, `useFollowSystem()` (re-applies the cached choice when `prefers-color-scheme` or `prefers-reduced-motion` changes)
  - `src/ui/AppearanceSettings.tsx`

- [ ] **Step 1: Implement `src/ui/useAppearance.ts`**

```ts
import { useEffect } from 'react'
import { supabase } from '../data/supabase'
import { htmlAttrs, readAppearance, sameAppearance, STORAGE_KEY, type Appearance } from './appearance'

const dark = () => matchMedia('(prefers-color-scheme: dark)').matches
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export function currentAppearance(): Appearance {
  try { return readAppearance(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')) } catch { return readAppearance(null) }
}

export function applyAppearance(a: Appearance) {
  Object.assign(document.documentElement.dataset, htmlAttrs(a, dark(), reduce()))
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(a)) } catch { /* private mode: this page still shows it */ }
}

/** The session's choice follows the person between devices; it wins over this device's cache. */
export function syncFromSession(meta: unknown) {
  const stored = meta && typeof meta === 'object' ? (meta as { appearance?: unknown }).appearance : undefined
  if (stored === undefined) return
  const a = readAppearance(stored)
  if (!sameAppearance(a, currentAppearance())) applyAppearance(a)
}

export async function saveAppearance(a: Appearance): Promise<{ error: string | null }> {
  applyAppearance(a)
  const { error } = await supabase.auth.updateUser({ data: { appearance: a } })
  if (error) console.error(error)
  return { error: error ? 'Your appearance is saved on this device only. Try again to keep it on your other devices.' : null }
}

/** Re-reads the cached choice on every OS change, so it needs no React state. */
export function useFollowSystem() {
  useEffect(() => {
    const queries = [matchMedia('(prefers-color-scheme: dark)'), matchMedia('(prefers-reduced-motion: reduce)')]
    const on = () => applyAppearance(currentAppearance())
    queries.forEach((q) => q.addEventListener('change', on))
    return () => queries.forEach((q) => q.removeEventListener('change', on))
  }, [])
}
```

In `App.tsx`'s `apply(s)`: `if (s) syncFromSession(s.user.user_metadata)`; and call `useFollowSystem()` once at the top of `App`, so System follows an OS change while the app is open.

- [ ] **Step 2: Build `src/ui/AppearanceSettings.tsx`** — a `FolderCard` with tab "Appearance" placed first on the Settings page:
  - "Theme": `<fieldset>` with `<legend>` and three native radios (Light / Dark / System) styled as `rnr-seg` — native radios give the keyboard radiogroup (arrow keys move and select, one tab stop) for free.
  - "Accent": `<fieldset>` of 8 native radios styled as `rnr-swatch` (gradient chip + `ACCENT_LABEL`), 4 × 2 grid, 2 × 4 below 480px; the selected swatch has the 2px ink border and a check icon.
  - "Density": Comfortable / Compact, same pattern as Theme.
  - Every change calls `saveAppearance` through `useAction` (so the page updates immediately — that is the live preview — and the save runs once at a time; a newer change while one is saving is queued like `SettingsPage`'s `chains`), then sets the notice "Appearance saved." or shows the returned error with `role="alert"`.
  - Preview row (`aria-hidden="true"`, decoration): a primary button "Start free" with the arrow chip, an `rnr-trend` "+12.4%", and `<Stamp label="Approved" />`.
  - Caption: "Your choice follows you to every device you sign in on."

- [ ] **Step 3: Verify in the Browser pane:** each theme, accent and density applies at once; keyboard only (Tab into each group, arrows change it); reload keeps it; sign in on a second cookie jar (`beta.localhost`) as the same user and the choice is there with no flash after the session loads; with the network offline a change still applies and shows the device-only sentence; switch the OS (emulated `prefers-color-scheme`) while on System and the app follows.

- [ ] **Step 4: Commit**

```bash
git add src/ui/useAppearance.ts src/ui/AppearanceSettings.tsx src/App.tsx src/comms/SettingsPage.tsx
git commit -m "feat: let people choose theme, accent and density and keep it across devices"
```

---

### Task 6: Screens batch A — auth, organisations, inbox, records, members, roles

**Owner:** Frontend engineer · **Depends on:** 3, 4

**Files:**
- Modify (markup and classes only): `src/auth/AuthPage.tsx`, `src/orgs/CreateOrgPage.tsx`, `src/orgs/OrgSwitcher.tsx` (only what Task 3 left), `src/inbox/InboxPage.tsx`, `src/inbox/StartPage.tsx`, `src/inbox/TaskPage.tsx`, `src/records/RecordsPage.tsx`, `src/records/RecordPage.tsx`, `src/records/StatusMark.tsx`, `src/members/MembersPage.tsx`, `src/members/MembersTable.tsx`, `src/members/InviteForm.tsx`, `src/roles/RolesPage.tsx`, `src/roles/RoleEditor.tsx`, `src/index.css` (batch 6 block only)

**Interfaces:**
- Consumes: `FolderCard`, `Stamp`, `KpiTile`, `bundle.css`, spec §2 sections for these screens.
- Produces: no new exports.

**Screens covered (each must be checked off in the commit message body):** sign in, sign up, reset password, set password (`AuthPage` flows); create organisation; organisation switcher; inbox; start a record; task; records list; record page (header with status mark and the stamp for approved / rejected, answers, timeline, the PDF panel's position — its inside is Task 9); members list and table; invite form; roles list; role editor.

- [ ] **Step 1: Restyle each screen** per spec §2: page header (micro crumb, `rnr-display` title), forms on paper with `rnr-pill` fields (48px), lists in `rnr-table-card`, the auth card as a folder card centred on the canvas with the wordmark, the record page's status: keep `StatusMark` (word + icon) and add `<Stamp label="Approved" />` / `<Stamp label="Rejected" />` beside it when `status` is `approved` / `rejected`. No change to any hook, query, permission check, focus call or copy except those the spec lists.

- [ ] **Step 2: Check behaviour is untouched**

```bash
git diff --stat -- src/auth src/orgs src/inbox src/records src/members src/roles   # only .tsx files listed above
git diff -- src/auth src/orgs src/inbox src/records src/members src/roles | grep -E "^[-+].*(useQuery|useMutation|supabase\.|\.rpc\(|can\(|focus\(|friendlyError)"   # expect nothing
pnpm test && pnpm lint
```

- [ ] **Step 3: Verify every listed screen in the Browser pane** at 1440 and 375, Midnight light and Saffron dark: no clipped tab, no horizontal page scroll, focus rings visible, every flow still works (sign in with a seed user; create an organisation; start a record from the inbox; approve a task and see the stamp; invite a member; edit a role).

- [ ] **Step 4: Commit**

```bash
git add src/auth src/orgs src/inbox src/records src/members src/roles src/index.css
git commit -m "feat: restyle auth, inbox, records, members and roles on the new design system"
```

---

### Task 7: Screens batch B — forms and workflows

**Owner:** Frontend engineer · **Depends on:** 3, 4

**Files:**
- Create: `src/forms/fill/steps.ts`, `src/forms/fill/steps.test.ts`, `src/forms/fill/Steps.tsx`
- Modify (markup and classes only, except `FormRunner.tsx` rendering `Steps`): `src/forms/FormsPage.tsx`, `src/forms/FormGate.tsx`, `src/forms/builder/*.tsx`, `src/forms/fill/FillPage.tsx`, `src/forms/fill/FormRunner.tsx`, `src/forms/fill/FormRenderer.tsx`, `src/forms/fill/FieldInput.tsx`, `src/forms/fill/FileInput.tsx`, `src/forms/fill/SignaturePad.tsx`, `src/forms/submissions/*.tsx`, `src/workflows/WorkflowsPage.tsx`, `src/workflows/WorkflowGate.tsx`, `src/workflows/AccessPage.tsx`, `src/workflows/StatusMark.tsx`, `src/workflows/canvas/*.tsx`, `src/index.css` (batch 7 block only)

**Interfaces:**
- Consumes: `pages`, `visiblePages`, `Field` (`forms/logic`), `FolderCard`, spec §2.
- Produces: `stepLabels(pages: Field[][]): string[]`; `Steps({ labels, current })` — an `<ol className="rnr-steps">` with `aria-current="step"` on the current step and the number in `rnr-step-n`, shown only when there is more than one visible page.

**Screens covered:** forms list; form builder (palette, field list, field settings, rule editor, draft input, the phone bottom-sheet palette); form fill (named steps, pill inputs, file input, signature pad, outcome buttons); form gate; submissions list and answer list; workflows list; workflow editor Map view (board, node cards with the 22px folder tab, palette, side panel, message action) and List view (step list, step sheet); mini canvas; workflow gate; access page.

- [ ] **Step 1: Write the failing test** — `src/forms/fill/steps.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stepLabels } from './steps.ts'
import type { Field } from '../logic'

const f = (key: string, type: string, label?: string) => ({ key, type, label }) as unknown as Field

test('steps are named by their page breaks', () => {
  assert.deepEqual(stepLabels([
    [f('name', 'text', 'Full name')],
    [f('p2', 'page_break', 'Dates'), f('from', 'date', 'From')],
    [f('p3', 'page_break', '   '), f('sig', 'signature', 'Sign')],
    [f('p4', 'page_break')],
  ]), ['Step 1', 'Dates', 'Step 3', 'Step 4'])
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test` → cannot find `./steps.ts`.

- [ ] **Step 3: Implement `src/forms/fill/steps.ts`**

```ts
import type { Field } from '../logic'

/** Each step is named by its page break's label; a page without one (the first never has one) is "Step N". */
export const stepLabels = (pages: Field[][]): string[] =>
  pages.map((page, i) => (page[0]?.type === 'page_break' && page[0].label?.trim()) || `Step ${i + 1}`)
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm test` → the steps test passes.

- [ ] **Step 5: Render the steps** in `FormRunner.tsx` above the page: `const labels = stepLabels(all)` and `{visible.length > 1 && <Steps labels={visible.map((i) => labels[i])} current={current} />}`. The existing page title (`title`) stays as the page heading. Nothing else in `FormRunner` changes.

- [ ] **Step 6: Restyle every listed screen** per spec §2. React Flow node cards get the folder tab via classes only; drag, connect, keyboard and List-view behaviour are untouched.

- [ ] **Step 7: Check behaviour is untouched** — the same three commands as Task 6 Step 2 over `src/forms src/workflows`, allowing only the `FormRunner.tsx` lines above.

- [ ] **Step 8: Verify in the Browser pane** at 1440 and 375, Midnight light and Saffron dark: build a form with two page breaks, fill it (steps named "Step 1", then the break labels; Next/Back), sign, upload, see the submission; open a workflow in Map and List, move a node, connect, open the side panel, save; change access.

- [ ] **Step 9: Commit**

```bash
git add src/forms src/workflows src/index.css
git commit -m "feat: restyle forms and workflows and name each form step"
```

---

### Task 8: Screens batch C — communication and campaigns

**Owner:** Frontend engineer · **Depends on:** 3, 4, 5

**Files:**
- Modify (markup and classes only): `src/comms/TemplatesPage.tsx`, `src/comms/TemplateEditor.tsx`, `src/comms/VariableMenu.tsx`, `src/comms/MessagesPage.tsx`, `src/comms/SettingsPage.tsx` (the email-notification and campaign-email sections; `AppearanceSettings` from Task 5 stays first), `src/comms/NotificationBell.tsx` (only what Task 3 left), `src/campaigns/CampaignsPage.tsx`, `src/campaigns/CampaignPage.tsx`, `src/campaigns/CampaignEditor.tsx`, `src/campaigns/SendDialog.tsx`, `src/campaigns/CampaignReport.tsx`, `src/campaigns/RecipientTable.tsx`, `src/campaigns/StatusMark.tsx`, `src/index.css` (batch 8 block only)

**Interfaces:**
- Consumes: `FolderCard`, `KpiTile`, spec §2.
- Produces: no new exports.

**Screens covered:** templates list; template editor (variable menu, preview); messages; settings (email notifications, campaign emails, around the Appearance card); notification bell menu; campaigns list; campaign editor (draft, scheduled, failed states); send dialog; campaign report (KPI tiles, the opens note, exclusions line, completion block, chart already recoloured in Task 4, recipient table with filters, pager and CSV, follow-up actions).

- [ ] **Step 1: Restyle every listed screen** per spec §2; campaign tiles become `KpiTile`s with the same figures, captions and "No data yet" text.
- [ ] **Step 2: Check behaviour is untouched** — Task 6 Step 2's commands over `src/comms src/campaigns`.
- [ ] **Step 3: Verify in the Browser pane** at 1440 and 375, Midnight light and Saffron dark: edit and preview a template, open messages, toggle an email preference and the campaign-email switch, open the bell, create, schedule and cancel a campaign, open a sent campaign's report, filter recipients, download CSV.
- [ ] **Step 4: Commit**

```bash
git add src/comms src/campaigns src/index.css
git commit -m "feat: restyle templates, messages, settings and campaigns"
```

---

### Task 9: Screens batch D — reports, results, dashboard, PDF panel, report template

**Owner:** Frontend engineer · **Depends on:** 3, 4

**Files:**
- Modify (markup and classes only): `src/reports/ReportsPage.tsx`, `src/reports/ReportPage.tsx`, `src/reports/ResultTable.tsx`, `src/reports/DashboardPage.tsx`, `src/reports/Widget.tsx`, `src/reports/ChartWidget.tsx` (beyond Task 4's tokens), `src/reports/PdfPanel.tsx`, `src/reports/ReportTemplatePage.tsx`, `src/reports/TemplatePreview.tsx`, `src/index.css` (batch 9 block only)

**Interfaces:**
- Consumes: `FolderCard`, `KpiTile`, spec §2 and §4.
- Produces: no new exports.

**Screens covered:** reports list; report builder (`ReportPage`: source, columns, filters, grouping, save); results table (pager, CSV); dashboard (edit layout, widget grid 1 / 2 / 4, KPI widgets as `KpiTile`, chart widgets, table widgets, empty states); PDF panel on the record page (generate, status, download link); workflow report template page and its preview.

- [ ] **Step 1: Restyle every listed screen** per spec §2 and §4 (KPI widgets keep their figures, formatting and captions; no trend chip, decision 8).
- [ ] **Step 2: Check behaviour is untouched** — Task 6 Step 2's commands over `src/reports`.
- [ ] **Step 3: Verify in the Browser pane** at 1440 and 375, Midnight light and Saffron dark: build and run a report, page and download results, edit the dashboard layout and add a widget, hover a chart (other series dims), generate a record PDF and open it (the PDF itself unchanged, decision 11), edit the report template.
- [ ] **Step 4: Commit**

```bash
git add src/reports src/index.css
git commit -m "feat: restyle reports, dashboard and the PDF panel"
```

---

### Task 10: Landing page and site pages

**Owner:** Senior UX engineer · **Depends on:** 1, 2

**Files:**
- Create: `src/site/loop.ts`, `src/site/loop.test.ts`, `src/site/landing.ts`
- Modify: `index.html`, `privacy.html`, `terms.html`, `404.html`, `unsubscribe.html`, `src/site/site.css`, `src/site/unsubscribe.ts` (markup classes only), `src/ui/appearance.test.ts` (site pre-paint parity), `public/sitemap.xml` (unchanged URLs; check only)

**Interfaces:**
- Consumes: `design/tokens.css`, `bundle.css` (`rnr-folder`, `rnr-stamp`, `rnr-trend`, `rnr-wordmark`, `rnr-btn-primary`), the fontsource stylesheets, spec §5, the mockup `landing.html` (wash, hero window, run trace, loop and ticker logic).
- Produces:
  - `src/site/loop.ts`: `LOOP_MS = 6200`, `type LoopState = { path: 'p1' | 'p2' | 'p3' | null; u: number; stamp: boolean }`, `loopState(t: number): LoopState`, `runLine(n, name, days): string`, `shouldAnimate(reduce: boolean, search: string): boolean`
  - `src/site/landing.ts`: side-effect module loaded by `index.html`

- [ ] **Step 1: Write the failing tests**

`src/site/loop.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LOOP_MS, loopState, runLine, shouldAnimate } from './loop.ts'

test('the pulse reaches the condition, then Ask HR, and the stamp lands there', () => {
  assert.deepEqual(loopState(500), { path: 'p1', u: 0.5, stamp: false })
  assert.deepEqual(loopState(1600), { path: 'p2', u: 0.5, stamp: false })
  assert.deepEqual(loopState(3000), { path: null, u: 0, stamp: true })
  assert.deepEqual(loopState(5300), { path: null, u: 0, stamp: false })
})

test('every third loop takes the log branch and does not stamp', () => {
  assert.equal(loopState(2 * LOOP_MS + 1600).path, 'p3')
  assert.equal(loopState(2 * LOOP_MS + 3000).stamp, false)
  assert.equal(loopState(3 * LOOP_MS + 3000).stamp, true)
})

test('run lines read as sentences', () => {
  assert.equal(runLine(4821, 'Aisha K.', 7), '#4821 Aisha K. · 7 days · asked HR')
  assert.equal(runLine(4822, 'Ben T.', 1), '#4822 Ben T. · 1 day · logged')
})

test('nothing moves under reduced motion or ?motion=off', () => {
  assert.equal(shouldAnimate(false, ''), true)
  assert.equal(shouldAnimate(true, ''), false)
  assert.equal(shouldAnimate(false, '?motion=off'), false)
  assert.equal(shouldAnimate(false, '?a=1&motion=off'), false)
  assert.equal(shouldAnimate(false, '?motion=offline'), true)
})
```

Append to `src/ui/appearance.test.ts`:

```ts
test('site pages take the stored accent, always light', () => {
  for (const file of ['../../index.html', '../../privacy.html', '../../terms.html', '../../404.html', '../../unsubscribe.html']) {
    assert.deepEqual(runPrePaint(file, /rnr\.appearance/, JSON.stringify({ theme: 'dark', accent: 'fern' }), true, false), { theme: 'light', accent: 'fern' }, file)
    assert.deepEqual(runPrePaint(file, /rnr\.appearance/, '{not json', true, false), { theme: 'light', accent: 'midnight' }, file)
    assert.deepEqual(runPrePaint(file, /rnr\.appearance/, JSON.stringify({ accent: 'forest' }), false, false), { theme: 'light', accent: 'midnight' }, file)
  }
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test` → `./loop.ts` missing; the site pages still set only `theme` from the old script.

- [ ] **Step 3: Implement `src/site/loop.ts`**

```ts
export const LOOP_MS = 6200

export type LoopState = { path: 'p1' | 'p2' | 'p3' | null; u: number; stamp: boolean }

/** t ms after the hero started: the pulse runs to the condition (1 s), then to Ask HR or, every third loop, to Log (1.2 s);
 *  the stamp shows while the pulse rests at Ask HR, until 5.2 s into the loop. */
export function loopState(t: number): LoopState {
  const at = t % LOOP_MS
  const logLoop = Math.floor(t / LOOP_MS) % 3 === 2
  if (at < 1000) return { path: 'p1', u: at / 1000, stamp: false }
  if (at < 2200) return { path: logLoop ? 'p3' : 'p2', u: (at - 1000) / 1200, stamp: false }
  return { path: null, u: 0, stamp: !logLoop && at < 5200 }
}

export const runLine = (n: number, name: string, days: number) =>
  `#${n} ${name} · ${days} ${days === 1 ? 'day' : 'days'} · ${days > 5 ? 'asked HR' : 'logged'}`

export const shouldAnimate = (reduce: boolean, search: string) => !reduce && !/[?&]motion=off(&|$)/.test(search)
```

- [ ] **Step 4: Replace each site page's pre-paint script** (and delete every Google Fonts `<link>`):

```html
    <script>
      (() => {
        // Public pages are always light; the accent follows a signed-in person's choice. appearance.test.ts runs this.
        let s = {}
        try { s = JSON.parse(localStorage.getItem('rnr.appearance') || '{}') || {} } catch {}
        const h = document.documentElement.dataset
        h.theme = 'light'
        h.accent = ['midnight', 'ocean', 'bw', 'graphite', 'fern', 'rosewood', 'iris', 'saffron'].includes(s.accent) ? s.accent : 'midnight'
      })()
    </script>
```

- [ ] **Step 5: Run — expect PASS**

Run: `pnpm test` → the loop tests and the site parity test pass.

- [ ] **Step 6: Build the landing** in `index.html` (static, semantic, one `<h1>`) and `src/site/site.css`, following spec §5 and the mockup. Keep the `<head>` meta, canonical, Open Graph, the hash forwarder script (its test in `scripts/site-config.test.mjs` must still pass unchanged) and `consent.js`. Sections, top to bottom:
  1. **Header:** wordmark, links to `#how`, `#pricing`, "Sign in" (`/app/`), primary "Start free" (`/app/#/members`, as today).
  2. **Wash:** `<div class="wash" aria-hidden="true">` with three blobs, fixed behind the page, masked so the left 36% (headline and copy) stays clean, drifting with `translate3d` + `scale` (24 / 30 / 27 s, alternate). Never under text.
  3. **Hero:** micro "Workflow platform · Forms to records"; `<h1>` "Turn paperwork into <em>processes that run.</em>" (Fraunces, italic accent — the LCP element, rendered with the fallback face first); the body sentence from the mockup; "Start free"; "No card needed · Free for 3 workflows". Beside it the tilted window (`transform: perspective() rotateX() rotateY()`; flat below 900px): the inline SVG workflow (Trigger → Condition "Days over 5" → Ask HR / Log), the pulse dot with two trail dots moved along `p1` / `p2` / `p3` by `loopState`, the stamp thumping in (scale 2.2 → .92 → 1 in 450 ms) at Ask HR, and a "Last runs" list ticking a new `runLine` every 2.4 s (four rows, oldest removed; names from the mockup).
  4. **Run trace:** "Most of a process is <em>paperwork</em>." with the trace card (submit form 91 ms, check days 12 ms, branch 4 ms, ask HR 26 min) whose rows fill in as it scrolls into view.
  5. **Approvals where people are:** a notification card and a chat-style card; the request types itself in (CSS `steps()` on a width, or characters revealed by `landing.ts`), then an "Approve" press, then the stamp. Generic, unbranded chat styling — no product names or logos.
  6. **Integrations hub:** the wordmark in the centre and four nodes around it — Email, Chat, Calendar, Storage — with Phosphor-style inline SVG glyphs (no third-party logos), dots travelling along the connecting paths (`offset-path` or `loopState`-style `setAttribute`).
  7. **Boring in the ways that matter:** three folder cards — Audit trail, Roles and permissions, PDF records — each with one sentence describing what v2 already does.
  8. **Dashboard:** three KPI tiles with `rnr-trend` chips that sharpen into focus (`opacity` + `transform: scale` from .98, no `filter: blur` animation) on reveal.
  9. **Pricing** (`id="pricing"`): three folder cards — Free (up to 3 workflows), Team, Organisation — the middle one highlighted with the accent border and "Most popular" micro label; prices are `[TBD price]` (decision 13); each card's button goes to `/app/#/members`.
  10. **Closing CTA card** on the accent gradient ("Start free" with the chip) and the **footer** (© 2026 ReportNoReport, Privacy policy, Terms and conditions, Cookie settings — as today).

  `src/site/landing.ts` (loaded with `<script type="module" src="/src/site/landing.ts">`) adds `html.js`, observes `.rise` elements with one `IntersectionObserver` (threshold .25, adds `.in`, then unobserves), and — only when `shouldAnimate(matchMedia('(prefers-reduced-motion: reduce)').matches, location.search)` — starts one `requestAnimationFrame` loop for the hero (moving the dots with `setAttribute`, toggling the stamp class from `loopState`), the 2.4 s ticker, the typing card and the hub dots; it stops the loop while `document.hidden`. Otherwise it marks everything `.in`, shows the stamp still and draws nothing that moves. CSS mirrors this with `@media (prefers-reduced-motion: reduce)` and `html[data-motion-off]` so a page without JavaScript is still and complete. Only `transform` and `opacity` are animated; elements that animate get `will-change` only while animating.

- [ ] **Step 7: Restyle the site pages:** privacy and terms (`.prose` on paper, Fraunces headings), 404 (folder card "This page is not here." with links to the home page and the app; no "we"), unsubscribe (one folder card; `unsubscribe.ts` logic and copy unchanged). Remove every inline `style` from the site pages.

- [ ] **Step 8: Verify**

```bash
pnpm test && pnpm build      # check-dist must report only the [TBD price] placeholders (decision 13)
```

In the Browser pane: the landing at 1440 and 375 in Midnight and Ocean (set `localStorage['rnr.appearance']`), with `?motion=off`, and with emulated reduced motion; DevTools Performance shows no layout or paint in the animation frames (compositor only); privacy, terms, 404 (`/nope`) and `/unsubscribe` render; `/#/members` still forwards to `/app/#/members`.

- [ ] **Step 9: Commit**

```bash
git add index.html privacy.html terms.html 404.html unsubscribe.html src/site src/ui/appearance.test.ts
git commit -m "feat: add the animated landing page and restyle the public pages"
```

---

### Task 11: Go-live prep — `deploy-v2.yml`, v1 `deploy.yml`, `ci-v2.yml`, `docs/go-live.md`, README

**Owner:** Backend engineer · **Depends on:** — (any time)

**Files:**
- Create: `../.github/workflows/deploy-v2.yml`, `scripts/deploy-config.test.mjs`, `docs/go-live.md`
- Modify: `../.github/workflows/ci-v2.yml`, `../.github/workflows/deploy.yml`, `README.md` (Deploy and Known limits sections)

(Paths are from `v2/`; the workflows live at the repository root `.github/workflows/`.)

**Interfaces:**
- Consumes: v1 `deploy.yml` (structure, `environment: production`, `concurrency: production`), `ci-v2.yml`, `supabase/functions/.env.example` (function secret names), `supabase/seed.sql` (Vault secret names: `cron_secret`, `resume_url`, `send_messages_url`, `render_pdfs_url`, `send_campaigns_url`), README "Deploy", root `docs/operations.md` (v1's Auth and SMTP settings).
- Produces:
  - GitHub environment `production-v2` with secrets `SUPABASE_V2_ACCESS_TOKEN`, `SUPABASE_V2_DB_PASSWORD`, `V2_CRON_SECRET`, `V2_RESEND_API_KEY`, `V2_UNSUBSCRIBE_SECRET`, `V2_RESEND_WEBHOOK_SECRET`, `VERCEL_TOKEN`, and variables `SUPABASE_V2_PROJECT_REF`, `VERCEL_ORG_ID`, `VERCEL_V2_PROJECT_ID`, `V2_EMAIL_FROM` (names only; the owner creates them)
  - `docs/go-live.md`

- [ ] **Step 1: Write the failing test** — `scripts/deploy-config.test.mjs`

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const wf = (name) => readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8')

test('v1 deploy skips v2 changes and points at the ledger subdomain', () => {
  const v1 = wf('deploy.yml')
  assert.match(v1, /paths-ignore:\s*\[\s*'v2\/\*\*',\s*'\.github\/workflows\/deploy-v2\.yml',\s*'\.github\/workflows\/ci-v2\.yml'\s*\]/)
  assert.match(v1, /APP_URL=https:\/\/ledger\.reportnoreport\.com\/app\//)
  assert.match(v1, /url: https:\/\/ledger\.reportnoreport\.com/)
  assert.doesNotMatch(v1, /APP_URL=https:\/\/reportnoreport\.com/)
  assert.match(v1, /group: production\n/)
})

test('v2 deploy uses only v2 secrets and variables', () => {
  const v2 = wf('deploy-v2.yml')
  const shared = new Set(['VERCEL_TOKEN', 'VERCEL_ORG_ID'])
  const refs = [...v2.matchAll(/\$\{\{\s*(?:secrets|vars)\.([A-Z0-9_]+)\s*\}\}/g)].map((m) => m[1])
  assert.ok(refs.length > 5)
  for (const name of refs) assert.ok(shared.has(name) || /(^|_)V2(_|$)/.test(name), `${name} is not namespaced for v2`)
  assert.match(v2, /environment:\s*(?:\n\s*name:\s*)?production-v2/)
  assert.match(v2, /group: production-v2/)
  assert.match(v2, /paths:\s*\[\s*'v2\/\*\*'/)
  assert.match(v2, /uses: \.\/\.github\/workflows\/ci-v2\.yml/)
  assert.match(v2, /APP_URL=https:\/\/reportnoreport\.com\/app\//)
  assert.match(v2, /vercel deploy --prebuilt --prod/)
})

test('ci-v2 can be called by the deploy and no longer runs twice on main', () => {
  const ci = wf('ci-v2.yml')
  assert.match(ci, /workflow_call:/)
  assert.doesNotMatch(ci, /^\s*push:/m)
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test` → `deploy-v2.yml` does not exist; `deploy.yml` has no `paths-ignore`.

- [ ] **Step 3: Change `ci-v2.yml`'s trigger** (jobs unchanged):

```yaml
on:
  pull_request:
    paths: ['v2/**', '.github/workflows/ci-v2.yml']
  workflow_call:
```

- [ ] **Step 4: Change v1 `deploy.yml`** — exactly three edits:

```yaml
on:
  push:
    branches: [main]
    paths-ignore: ['v2/**', '.github/workflows/deploy-v2.yml', '.github/workflows/ci-v2.yml']
  workflow_dispatch:
```

```yaml
      - run: supabase secrets set --project-ref "$PROJECT_REF" APP_URL=https://ledger.reportnoreport.com/app/
```

```yaml
    environment:
      name: production
      url: https://ledger.reportnoreport.com
```

- [ ] **Step 5: Create `deploy-v2.yml`**

```yaml
name: Deploy v2

on:
  push:
    branches: [main]
    paths: ['v2/**', '.github/workflows/deploy-v2.yml', '.github/workflows/ci-v2.yml']
  workflow_dispatch:

permissions:
  contents: read

# One v2 production deploy at a time, independent of v1's "production" group.
concurrency:
  group: production-v2
  cancel-in-progress: false

jobs:
  ci:
    uses: ./.github/workflows/ci-v2.yml

  supabase:
    name: Migrate the v2 database and deploy its Edge Functions
    needs: ci
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment: production-v2
    defaults:
      run:
        working-directory: v2
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_V2_ACCESS_TOKEN }}
      SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_V2_DB_PASSWORD }}
      PROJECT_REF: ${{ vars.SUPABASE_V2_PROJECT_REF }}
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: 2.120.0
      - run: supabase link --project-ref "$PROJECT_REF"
      # v2 migrations are numbered in apply order, so a plain push (no --include-all) refuses an out-of-order file loudly.
      - run: supabase db push
      - name: Set function secrets
        env:
          CRON_SECRET: ${{ secrets.V2_CRON_SECRET }}
          RESEND_API_KEY: ${{ secrets.V2_RESEND_API_KEY }}
          UNSUBSCRIBE_SECRET: ${{ secrets.V2_UNSUBSCRIBE_SECRET }}
          RESEND_WEBHOOK_SECRET: ${{ secrets.V2_RESEND_WEBHOOK_SECRET }}
          EMAIL_FROM: ${{ vars.V2_EMAIL_FROM }}
        # Written to a private temp file so no value is on a command line; GitHub masks them in the log either way.
        run: |
          umask 077
          f="$(mktemp)"
          trap 'rm -f "$f"' EXIT
          {
            echo "APP_URL=https://reportnoreport.com/app/"
            echo "EMAIL_TRANSPORT=resend"
            echo "EMAIL_FROM=$EMAIL_FROM"
            echo "CRON_SECRET=$CRON_SECRET"
            echo "RESEND_API_KEY=$RESEND_API_KEY"
            echo "UNSUBSCRIBE_URL=https://$PROJECT_REF.supabase.co/functions/v1/unsubscribe"
            echo "UNSUBSCRIBE_SECRET=$UNSUBSCRIBE_SECRET"
            echo "RESEND_WEBHOOK_SECRET=$RESEND_WEBHOOK_SECRET"
          } > "$f"
          supabase secrets set --project-ref "$PROJECT_REF" --env-file "$f"
      - run: supabase functions deploy --project-ref "$PROJECT_REF"

  vercel:
    name: Deploy v2 web to Vercel
    needs: supabase
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment:
      name: production-v2
      url: https://reportnoreport.com
    env:
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ vars.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ vars.VERCEL_V2_PROJECT_ID }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: v2/pnpm-lock.yaml
      - run: npm install --global vercel@latest
      # Run from the repository root: the v2 Vercel project's Root Directory setting (v2) selects the app.
      - run: vercel pull --yes --environment=production --token="$VERCEL_TOKEN"
      - run: vercel build --prod --token="$VERCEL_TOKEN"
      - run: vercel deploy --prebuilt --prod --token="$VERCEL_TOKEN"
```

- [ ] **Step 6: Run — expect PASS**

Run: `pnpm test` → the three deploy-config tests pass. Also read both workflows once more against v1's: no v1 secret or variable name appears in `deploy-v2.yml`, and v1's jobs are unchanged apart from the three edits.

- [ ] **Step 7: Write `docs/go-live.md`**

````markdown
# Go live: v2 on reportnoreport.com, v1 on ledger.reportnoreport.com

Every step is done by the owner, in this order, in the Supabase, Vercel, DNS (Cloudflare), Resend and GitHub dashboards. Secret **values** never go in this file, a pull request, an issue or a chat; where a step says "generate", store the value in the password manager first, then paste it where the step says.

## 0. Before you start

- [ ] PR #45 is green and the Phase 7 QA report (`docs/superpowers/qa/phase-7-round-1.md`) passes.
- [ ] The landing page prices are filled in: `grep -n "TBD price" v2/index.html` prints nothing (`pnpm build` refuses to build while it does).
- [ ] You can sign in to: the Supabase organisation that owns the v1 project, the Vercel team that owns the v1 project, Cloudflare for `reportnoreport.com`, Resend, and the GitHub repository settings.
- [ ] Pick a quiet hour for section D (the domain move); sections A–C cause no downtime.

## A. Move v1 to ledger.reportnoreport.com (before merging)

Merging #45 changes v1's `deploy.yml`, so v1 deploys once on that merge and sets its `APP_URL` to the ledger address. The ledger address must work before then.

1. **Cloudflare → DNS:** add `CNAME ledger → cname.vercel-dns.com`, proxy status **DNS only**.
2. **Vercel → v1 project → Settings → Domains:** add `ledger.reportnoreport.com`; wait until it shows a valid certificate.
3. **Supabase → v1 project → Authentication → URL Configuration → Redirect URLs:** add
   `https://ledger.reportnoreport.com/app/`, `https://ledger.reportnoreport.com/app/?flow=set-password`, `https://ledger.reportnoreport.com/app/**`, `https://ledger.reportnoreport.com/**`.
   Keep the existing `reportnoreport.com` entries and the Site URL for now.
4. Check: `https://ledger.reportnoreport.com/app/` shows v1 and a v1 user can sign in.
5. **Vercel → v1 project → Settings → Git:** confirm production deploys come only from the GitHub workflow (no automatic Git production deploys), so merging #45 cannot trigger a second v1 build.

## B. Create the v2 backend

6. **Supabase → New project** `reportnoreport-v2`, same organisation and region as v1. Generate a database password and store it.
7. **Supabase → v2 → Authentication → URL Configuration:** Site URL `https://reportnoreport.com/app/`; Redirect URLs `https://reportnoreport.com/app/`, `https://reportnoreport.com/app/?flow=set-password`, `https://reportnoreport.com/app/**`.
8. **Supabase → v2 → Authentication → SMTP:** the same Resend SMTP settings as v1 (root `docs/operations.md`), sender `noreply@reportnoreport.com`.
9. **Supabase → Account → Access tokens:** create a token named `github-deploy-v2` and store it.
10. **Resend:** the `reportnoreport.com` domain is already verified for v1; nothing to change there. Create an API key `v2 production` (sending access) and store it. Add a webhook to `https://<v2 project ref>.supabase.co/functions/v1/resend-webhook` for `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`, and store its signing secret (`whsec_…`). Open and click tracking are per domain, so turning them on also rewrites links in v1's Resend emails; if v1 must stay untracked, send v2 from a subdomain (for example `mail.reportnoreport.com`) instead and use it in `V2_EMAIL_FROM`.
11. **Generate** two random values of 32+ characters (`openssl rand -hex 32`) for `V2_CRON_SECRET` and `V2_UNSUBSCRIBE_SECRET`, and store them.
12. **GitHub → Settings → Environments → New environment** `production-v2`.
    Secrets: `SUPABASE_V2_ACCESS_TOKEN` (step 9), `SUPABASE_V2_DB_PASSWORD` (step 6), `V2_CRON_SECRET`, `V2_UNSUBSCRIBE_SECRET` (step 11), `V2_RESEND_API_KEY`, `V2_RESEND_WEBHOOK_SECRET` (step 10), `VERCEL_TOKEN` (the same Vercel token v1's `production` environment uses, or a new one).
    Variables: `SUPABASE_V2_PROJECT_REF` (the v2 project ref), `VERCEL_ORG_ID` (as v1), `VERCEL_V2_PROJECT_ID` (step 13), `V2_EMAIL_FROM` (`ReportNoReport <noreply@reportnoreport.com>`).
13. **Vercel → v2 project** (create it, or reuse the existing v2 preview project): Root Directory `v2`, framework Vite (build and output come from `v2/vercel.json`). Settings → Environment Variables → Production: `VITE_SUPABASE_URL` = `https://<v2 project ref>.supabase.co`, `VITE_SUPABASE_ANON_KEY` = the v2 project's anon (publishable) key. Settings → Git: no automatic production deploys (the workflow deploys). Copy the Project ID into `VERCEL_V2_PROJECT_ID`.

## C. Merge and deploy

14. **Merge #45** into `main`. Two workflows start:
    - **Deploy** (v1): runs because `deploy.yml` changed; redeploys v1 unchanged and sets v1's `APP_URL` to `https://ledger.reportnoreport.com/app/`.
    - **Deploy v2**: CI v2, then `supabase db push` and the function secrets and functions on the v2 project, then the Vercel production deploy of `v2/` (live on the v2 project's `*.vercel.app` address; the domain is still v1's).
    If `db push` stops at `create extension pg_cron` / `pg_net`, enable both in **Supabase → v2 → Database → Extensions** and re-run the workflow.
15. **Supabase → v2 → SQL editor**, once, with your values in place of the angle brackets (these are the Vault secrets `supabase/seed.sql` creates locally):
    ```sql
    select vault.create_secret('<V2_CRON_SECRET>', 'cron_secret');
    select vault.create_secret('https://<ref>.supabase.co/functions/v1/resume', 'resume_url');
    select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-messages', 'send_messages_url');
    select vault.create_secret('https://<ref>.supabase.co/functions/v1/render-pdfs', 'render_pdfs_url');
    select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-campaigns', 'send_campaigns_url');
    select jobname, schedule, active from cron.job order by jobname;   -- expect render-pdfs, resume, send-campaigns, send-messages
    ```
16. **Smoke test on the `*.vercel.app` address:** add it temporarily to the v2 Redirect URLs (step 7), sign up, create an organisation, publish a form and a workflow, submit a record, receive the workflow email, render a PDF, send a campaign to yourself and unsubscribe from it. Then remove the temporary redirect URL.

## D. Move the domain (quiet hour)

17. **Vercel → v1 project → Domains:** remove `reportnoreport.com` (and `www.reportnoreport.com` if present). **Vercel → v2 project → Domains:** add them (`www` redirecting to the apex). DNS already points at Vercel, so no DNS change is needed; expect under a minute while the certificate attaches.
18. **Supabase → v1 → Authentication → URL Configuration:** Site URL `https://ledger.reportnoreport.com/app/`; remove the `reportnoreport.com` redirect entries so a v1 email can never land on v2.
19. Tell v1 users their address is now `https://ledger.reportnoreport.com/app/`. Links in emails v1 sent before the move (invites, password resets) now open v2 and will fail there; resend any pending v1 invites from the ledger address.

## E. Verify

- [ ] `https://reportnoreport.com/` shows the v2 landing; `/app/` signs in to v2; `/privacy`, `/terms`, `/unsubscribe` and a missing page (404) render.
- [ ] `curl -sI https://reportnoreport.com/ | grep -i strict-transport-security` shows the header from `v2/vercel.json`.
- [ ] `https://ledger.reportnoreport.com/app/` signs in to v1 with an existing v1 user; a v1 email (invite or reset) links to the ledger address.
- [ ] A v2 workflow email links to `https://reportnoreport.com/app/`; a v2 campaign email's unsubscribe link opens `https://reportnoreport.com/unsubscribe`.
- [ ] Resend → Webhooks shows 200 responses from the v2 endpoint.
- [ ] Supabase → v2 → SQL: `select jobname, status, start_time from cron.job_run_details order by start_time desc limit 8;` shows succeeded runs.
- [ ] GitHub → Actions: the latest **Deploy v2** run is green; the latest **Deploy** (v1) run is green.

## F. Roll back

- **Domain (back to v1 on reportnoreport.com):** Vercel → v2 project → Domains: remove `reportnoreport.com` / `www`; v1 project: add them back. Supabase → v1 → Authentication: Site URL `https://reportnoreport.com/app/` and re-add its redirect URLs. Set v1's `APP_URL` back with `supabase secrets set --project-ref <v1 ref> APP_URL=https://reportnoreport.com/app/`, and revert the `deploy.yml` edits in a pull request before v1's next deploy (or it sets the ledger URL again). `ledger.reportnoreport.com` can stay attached to v1.
- **Stop v2 sending while rolled back:** Supabase → v2 → SQL: `update cron.job set active = false;` (`true` to resume).
- **A bad v2 web deploy:** Vercel → v2 project → Deployments → promote the previous production deployment.
- **A bad v2 migration:** migrations are forward-only; write a fixing migration and merge it. Never `supabase db reset` against a hosted project.

## Never

- Never put a secret value in this repository, a pull request, an issue, a chat or a screenshot.
- Never point v2's workflow at v1's project, or v1's at v2's: v1 uses the `production` environment, v2 uses `production-v2`.
````

- [ ] **Step 8: Update `README.md`:** the Deploy section becomes one paragraph pointing at `docs/go-live.md` and `.github/workflows/deploy-v2.yml` (merging to `main` deploys v2; the list of function secrets and Vault secrets stays, by name); Known limits gains "**PDF fonts.** Record PDFs stay in Inter, ink on white, after the Phase 7 identity change." and replaces "Inter (Google Fonts)" with the bundled families; Run locally is unchanged.

- [ ] **Step 9: Commit**

```bash
git add ../.github/workflows/deploy-v2.yml ../.github/workflows/deploy.yml ../.github/workflows/ci-v2.yml scripts/deploy-config.test.mjs docs/go-live.md README.md
git commit -m "feat: add the v2 production deploy and the go-live runbook"
```

---

### Task 12: QA — checks, Lighthouse, visual regression sweep

**Owner:** QA engineer · **Depends on:** 1–11

**Files:**
- Create: `docs/superpowers/qa/phase-7-round-1.md`
- Screenshots: saved under the scratchpad (`qa-phase-7/<screen>/<accent>-<theme>-<width>.png`), not committed; the report links the failing ones by name and embeds at most one contact sheet per batch under 200 KB.

**Interfaces:**
- Consumes: every screen, the spec, this plan's Review Focus.
- Produces: the QA report with a pass / fail row per Review Focus item and per screen.

- [ ] **Step 1: Run the checks**

```bash
pnpm lint
pnpm test                                  # tokens, appearance, nav, steps, loop, check-dist, deploy-config included
pnpm build                                 # expect only the [TBD price] placeholders until the owner fills them; report them as the one known failure
deno test --allow-read supabase/functions  # with DENO_NO_PACKAGE_JSON=1; unchanged by this phase, must still pass
```

Report any red check as red. No Playwright; browser checks use the Claude Browser pane.

- [ ] **Step 2: Visual regression sweep.** For every screen below, screenshot **Midnight and Saffron × light and dark × 1440px and 375px** (8 per screen), signed in as the seed admin (and as a plain member for the shell, to show the reduced nav):
  - Shell: sidebar (admin, member), phone bar, drawer open, ⌘K open with a query, notification menu, organisation switcher open.
  - Auth: sign in, sign up, reset password, set password. Create organisation.
  - Inbox, start a record, task. Records list, record page (pending; approved with stamp; rejected with stamp).
  - Members (table, invite form). Roles (list, editor).
  - Forms list; form builder (desktop and the phone palette sheet); form fill (step 1 and a named step, a validation error, signature, file); submissions.
  - Workflows list; workflow editor Map and List; access page.
  - Templates list, template editor; messages; settings (Appearance, email notifications, campaign emails).
  - Reports list, report builder, results; dashboard (view and edit layout); report template page; PDF panel.
  - Campaigns list, editor (draft, scheduled, failed), send dialog, report (with chart and recipient table).
  - Landing (top, each section, `?motion=off`, emulated reduced motion), privacy, terms, 404, unsubscribe (confirm and done states).
  Then all **8 accents** × light and dark at 1440px on the shell and Settings → Appearance (16 + 16 screenshots).

  For each, check against the spec: tokens only, folder tabs never clip (including the longest real labels), perforation never on text, one primary per view, focus ring visible, error states carry the X icon and a sentence (especially in Black & White), no page-level horizontal scroll at 375px, 44px targets, Phosphor icons everywhere (no old hand-rolled glyphs), fonts are Fraunces / Hanken Grotesk / IBM Plex Mono with no request to a font host (Network panel).

- [ ] **Step 3: Behaviour spot checks** (one pass, Midnight light): every flow listed in Tasks 6–9 Step 3 still works; ⌘K respects unsaved-changes guards; Appearance follows the person to a second cookie jar; System follows an emulated OS change.

- [ ] **Step 4: Lighthouse** (mobile, the landing page on `pnpm build && pnpm preview`): record LCP, CLS, TBT and the Performance and Accessibility scores. Pass: LCP < 2.5 s, CLS < 0.05, Accessibility ≥ 95. Record the result even when it fails.

- [ ] **Step 5: Write `docs/superpowers/qa/phase-7-round-1.md`** in the format of `phase-6-round-1.md`: summary, Review Focus table (pass / fail with evidence), per-screen table, defects numbered `QA-P7-n` with steps, expected, actual and screenshot names, and the Lighthouse figures.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/qa/phase-7-round-1.md
git commit -m "docs: add phase 7 QA report"
```

---

## Self-review notes

- Mockup → plan: tokens and 8 accents × 2 themes (Task 1, contrast-tested); fonts bundled (Task 2, `check-dist` rule); Phosphor (Task 2, one module); `data-theme` / `data-accent` before first paint (Task 2 app, Task 10 site, both parity-tested); Settings → Appearance with theme, 8 swatches, density, keyboard radiogroups and live preview, persisted per user (Task 5, decision 3); folder-tab cards, paper, perforation, stamp, wordmark strike, pill inputs (Tasks 1, 3, 4); sidebar-in-a-folder shell with Work / Build / Admin, ⌘K, bottom notifications / settings / account, phone bar and drawer (Task 3); named form steps (Task 7); KPI tiles with mono figures (Tasks 4, 8, 9; trend chips only on the landing, decision 8); charts recoloured per accent (Task 4, decision 10); `design/` rewritten as the authoritative system (Task 1).
- Every screen named in the brief is in exactly one of Tasks 3 and 5–10, and in Task 12's sweep list: auth, shell, inbox, records, record page, forms list / builder / fill / submissions, workflows list / canvas Map + List / access, members, roles, templates, messages, settings, reports / builder / results, dashboard, campaigns list / editor / report, PDF panel, unsubscribe page; plus create organisation, start, task, report template, privacy, terms, 404.
- Old modes: preset and style retired, B&W kept as an accent, density kept, motion follows the OS only (decision 2).
- PDF output unchanged, with the reason (decision 11).
- Landing: hero, tilted window with pulses, stamp at Ask HR and ticking runs; run trace; approvals card typing to approved; integrations hub with travelling dots; "Boring in the ways that matter"; dashboard tiles sharpening; pricing with the middle plan highlighted; closing CTA and footer; hand-built, transform / opacity only, IntersectionObserver reveals, off under reduced motion, LCP and CLS targets measured (Task 10, Task 12).
- Go-live: `deploy-v2.yml` with CI first, link, `db push`, secrets including `APP_URL=https://reportnoreport.com/app/`, functions, Vercel `--prod`, v2-namespaced names in a `production-v2` environment; v1 `deploy.yml` with `paths-ignore` and the ledger `APP_URL`; the one-time v1 deploy on merge handled by runbook section A; `docs/go-live.md` with Supabase, Vercel, DNS, Resend and GitHub steps, Vault and pg_cron, verification and rollback, no secret values (Task 11, tests pin the separation).
- Expected counts: `pnpm test` gains 5 (Task 1) + 5 (Task 2) + 4 (Task 3) + 1 (Task 7) + 5 (Task 10, four loop + one site parity) + 3 (Task 11) = 23; `deno test` and `supabase test db` unchanged (no Edge Function or migration change).
- Out of scope, by decision: record / people search in ⌘K, new inbox KPI queries, trend comparisons in the app, the mockup's calendar / "+" / "Synced" chips, video, a customers page, a status page, a CSP header, restyling the PDF document, v1 code and docs (only `deploy.yml` changes).
