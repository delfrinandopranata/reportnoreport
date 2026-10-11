# v1 on "Paper that moves" — Design System Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** v1, the client-money ledger at the repository root (moving to `ledger.reportnoreport.com` at go-live), adopts v2's design system "Paper that moves" as its only design system: paper surfaces, folder-tab cards, the wordmark with its strike, the stamp, Apple-style corners (control 10, card 14, panel 20, chip 6), Fraunces / Hanken Grotesk / IBM Plex Mono bundled with the app, Phosphor icons, and per-person Appearance (Light / Dark / System × 8 accents, plus density) applied before first paint and saved per user. Every v1 screen is restyled with its behaviour unchanged; the firm-wide "design system" picker (`firms.design_system`) is retired by a migration that carries each firm's choice into its members' personal Appearance. v1's own `design-system/` folder (the v2 reference copied in PR #44) is deleted, so there is one source of truth: `v2/design/`.

**Architecture:** v1 consumes `v2/design/` **in place, by relative path** — `src/index.css` imports `../v2/design/tokens.css`, `../v2/design/components/bundle.css` and `../v2/design/fonts/fonts.css`; `src/ui.tsx` references `../v2/design/icons/sprite.svg?url`; `src/appearance.ts` re-exports `../v2/design/appearance.ts`, the pure appearance module that Task 1 moves out of `v2/src/ui/appearance.ts` (which becomes a one-line re-export, so no v2 caller changes). Nothing is copied and no package, alias or workspace is introduced. The v1 Tailwind theme maps v2's token names onto utilities with `@theme inline` exactly as `v2/src/index.css` does, and the `dark:` variant is re-pointed from the `.dark` class to `[data-theme="dark"]` so v1 keeps one light/dark mechanism with v2. Appearance is stored in v1's existing `user_preferences` table under the key `appearance` (RLS: own profile only), with `localStorage['rnr.appearance']` as the pre-paint cache; the inline script in `app/index.html` is tested against `htmlAttrs` by extracting and running it, as v2 does. A staged guard test (`src/design.test.ts`) lists the files that still carry the old zinc / `dark:` / `--brand-solid` styling; each screen task deletes its files from the list, and QA asserts the list is empty.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Tailwind CSS 4, TanStack Query 5, supabase-js 2, @dnd-kit, `node --test`, pgTAP, Deno, oxlint, Supabase CLI 2.120.0, Vercel CLI. **No new dependencies:** fonts come from the `woff2` files already in `v2/design/fonts/` (OFL 1.1) and icons from `v2/design/icons/sprite.svg` (Phosphor, MIT), not from the fontsource / `@phosphor-icons/react` packages v2 uses. One migration (`20261012000001_appearance.sql`), no Edge Function change, no `deno.lock` change.

**Spec:** `v2/design/README.md` (the system: §3 colour, §5 shape, §6 page templates, §9 accessibility, §13 migration map) and the component READMEs under `v2/design/components/`; `docs/superpowers/specs/2026-10-03-platform-foundation-design.md` for v1 screens and copy; `v2/docs/superpowers/plans/2026-10-12-phase-7-identity-and-launch.md` for the decisions this plan inherits.

## Global Constraints

- v1 conventions hold (root `CLAUDE.md`): British English, sentence case, money in integer minor units shown as "MYR 1,234.50" with the ISO code (never a symbol), dates through `formatDate()`, errors through `toUserMessage()`, Tailwind 4 and no inline `style` props, no CSS modules, append-only migrations, no Prettier, oxlint only, no tool branding in commits or branch names, nothing pushed or deployed.
- **No business-logic change.** Screen tasks change markup, classes, wrappers and icons only. A reviewer can check a screen task by confirming its diff touches no `src/data/**`, `src/ledger.ts`, `src/trial.ts`, `src/users/rules.ts`, `**/logic.ts`, `**/status.ts`, `src/zip.ts`, `src/transfer.tsx` `downloadCsv`/parse code, `src/tour/{steps,positioning,useTour,autoStart}.ts`, `src/checklist/{logic,summary,useChecklist}.ts` or any TanStack Query key/mutation, except where a task lists one. Every existing unit, pgTAP, Deno and equivalence test passes unchanged, apart from the two `03_roles.test.sql` assertions Task 3 re-points.
- **Decisions this plan takes (reviewer: check these):**
  1. **One source of truth: v1 imports `v2/design/` by relative path.** Considered: (a) relative import from the root app; (b) moving `design/` to a top-level `design/` both apps import; (c) a pnpm workspace package. (b) and (c) put files outside `v2/`, which the v2 Vercel project (Root Directory `v2`) cannot reach in a Vercel Git build unless "Include files outside the root directory in the Build Step" is on, and (c) also turns two independent lockfiles into a workspace. (a) needs nothing: v1's Vercel project is rooted at the repository root, so `v2/design/` is inside it; `vercel build` runs on the GitHub runner after a full checkout in both `deploy.yml` and `deploy-v2.yml`, so no Vercel build ever needs a file outside its root; v1's `ci.yml` checks out the whole repository; Vite's default `server.fs.allow` is the repository root, which contains `v2/design/`; `tsc -b` follows the import into `v2/design/appearance.ts` (erasable syntax only, no dependencies). **No Vercel setting is needed**; `v2/docs/go-live.md` gains one line saying so and warning not to move `v2/design/` out of `v2/` (Task 3). Consequence: a change under `v2/design/**` must redeploy v1 too, so `deploy.yml` switches from `paths-ignore` to an ordered `paths` filter that re-includes `v2/design/**` (Task 3), and `ci.yml` already runs on every pull request.
  2. **`design-system/` is deleted, not redirected.** A redirect file would be a second place to read. `CLAUDE.md`, `docs/README.md` and the `src/index.css` comment point at `v2/design/README.md`; `src/design.test.ts` fails if anything under `src/`, `app/`, `index.html` or `CLAUDE.md` still names `design-system/` (Task 2).
  3. **Appearance lives in `user_preferences` (key `appearance`), not `user_metadata`.** v1 already stores per-person UI state there (`dashboard`, `table.*`, `tour`, `checklist`, `theme`) behind `prefs_all` RLS (own profile only), and its demo build already has a `preferences` store, so Appearance works in the demo with no new code path. Values are validated by `readAppearance` on every read, so a hand-written row cannot break the page. Saving awaits the upsert (not the debounced `usePreference` path) and on failure keeps the choice on this device with v2's sentence: "Your appearance is saved on this device only. Try again to keep it on your other devices."
  4. **`firms.design_system` is retired by migration `20261012000001_appearance.sql`.** It inserts an `appearance` preference for every profile that has none, taking `theme` from the person's old `theme` preference and `accent` from their firm's design system (`default` → `midnight`, `ocean` → `ocean`, `forest` → `fern`, `sunset` → `saffron`), deletes the old `theme` rows, and drops the column. Nobody loses a choice. The firm-wide picker disappears from Settings; Appearance is personal. The old client running during the deploy window could fail one Settings save of the retired picker (the column is gone); that is accepted and noted in Risks.
  5. **Theme mechanism.** `<html data-theme="light|dark" data-accent="…" data-density="…" data-motion="…">` exactly as v2. The `.dark` class, `data-design`, `theme-bootstrap` and `src/theme.ts` are removed. `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *))` keeps any remaining `dark:` utility correct while screens migrate. The header's sun/moon `ThemeToggle` stays (behaviour kept), now writing `appearance.theme`.
  6. **Navigation.** A sidebar-in-a-folder (`rnr-side-*`) with Dashboard, Clients and Contract Manager; Users (only with `users.manage`, as today) and Settings sit at the bottom with the account (name, role, Sign out). Phones (< 768px): top bar with the wordmark, and a bottom bar with Dashboard, Clients, Contracts and "Menu" (opens the full sidebar in a native `<dialog>` drawer). **No ⌘K jump bar**: v1 has five pages. The visibility rules are pinned by `src/nav.test.ts`.
  7. **Money and KPIs.** Figures use `rnr-kpi-figure` / `rnr-num` (IBM Plex Mono, `tabular-nums`) and keep `makeMoney(firm.currency)` output verbatim, so "MYR 1,234.50" and the existing sign handling are unchanged. KPI widgets become `rnr-kpi-tile` (folder-tab label, mono figure). No trend chip is shown: v1 has no comparison figure, and none is invented.
  8. **In/out semantics.** Receipts (money in) are `--series-1` (the accent's strike, ≥ 3:1 on paper in all 16 combinations); payments (money out) are `--series-2` (`--ink-3`) drawn with the hatch pattern and square markers (`rnr-chart-mark[data-series="out"]`). `KindBadge` keeps its word and arrow (`rnr-kind` / `rnr-kind.is-out`). In the Black & White accent both series are ink and remain distinguishable by pattern, marker and label: colour is never the only cue. `--down` is used only for errors and the existing negative-balance highlight, always alongside the minus sign or an X icon and a sentence.
  9. **Statements stay ink on white.** The A4 document (`Statement.tsx`, consolidated statement) keeps a fixed light palette in every theme and accent so screen and print match; it adopts Hanken Grotesk for text and Plex Mono tabular figures (browser print, so no layout measurement is affected), keeps the firm logo, and takes no accent colour. The on-screen frame around it is `rnr-paper`.
  10. **Fonts: Latin subset from `v2/design/fonts/`.** v1 copy is British English and its currencies are ISO codes, all inside the Latin range (the true minus U+2212 included). Non-Latin client names fall back to the system face through the metric-matched fallback stack. Google Fonts links are removed from `app/index.html` and `index.html`, and `vercel.json`'s CSP becomes `font-src 'self'` with `fonts.googleapis.com` dropped from `style-src` (a self-hosted font is otherwise blocked by the current `font-src https://fonts.gstatic.com`).
  11. **The marketing homepage (`index.html`, `src/home/home.ts`)** is restyled onto the public-page template with its behaviour (waitlist, availability RPC check) unchanged; whether `ledger.reportnoreport.com/` should instead redirect to `/app/` is an owner decision outside this plan.
  12. **The super-admin console** gets the same shell (admin nav: Firms, Waitlist, Platform settings) and an "Appearance" item in its account menu that opens the Appearance panel in a dialog; it persists through the same `user_preferences` row (super admins have a profile row, so `prefs_all` applies).
  13. **Task order:** designer first (Task 1) and backend any time (Task 3); foundation (Task 2); shared primitives (Task 4); shell and Appearance (Tasks 5–6); four screen batches by folder in parallel (Tasks 7–10); QA last (Task 11).
- **Parallel-safe screen batches.** Tasks 7–10 own disjoint files (listed per task). Shared classes come only from `v2/design/components/bundle.css` (Task 1). A batch that needs a v1-only class adds it inside its own empty block in `src/index.css` (`/* v1 paper: batch 7 */` … `/* v1 paper: batch 10 */`, created by Task 2), so batches never edit the same lines. A component v2 lacks is added to `v2/design/` by the designer, never invented in a batch.
- **Defect classes from v2 Phase 7 QA that must not recur:** the layer trap (bundle.css is `@layer components`; never write unlayered CSS targeting `rnr-*` in `src/index.css`); no inline `style` (the demo banner in `scripts/build-demo.sh` included); colour never alone; focus returns to the trigger when the drawer or a dialog closes, the skip link stays first; 44px targets on coarse pointers, 48px inputs, no page-level horizontal scroll at 375px (wide ledgers scroll inside `rnr-table-card`); `prefers-reduced-motion` stops every animation (no stamp or strike animation in the app); no "we" in product copy.

## Review Focus

1. **v1 reads v2's design system, never a copy** → `src/index.css` imports `../v2/design/…`, no file under `src/` re-declares a token value, and nothing names `design-system/`. (tests "v1 imports the design system from v2/design" and "nothing references the retired design-system folder" in `src/design.test.ts`, Task 2)
2. **No flash, no mismatch** → the pre-paint script in `app/index.html` sets exactly the attributes `htmlAttrs(readAppearance(stored))` sets, garbage included. (test "the v1 pre-paint script sets the same attributes as htmlAttrs" in `src/appearance.test.ts`, Task 2)
3. **No runtime font host** → no built page, HTML entry or CSP allowance references Google Fonts, and the CSP allows same-origin fonts. (test "fonts are same-origin and the CSP allows them" in `src/design.test.ts`, Task 2)
4. **Nobody loses a choice** → the migration gives every profile an `appearance` row built from their old theme and firm design system, removes `theme` rows and drops `firms.design_system`. (pgTAP `18_appearance.test.sql`; backfill replay steps in Task 3)
5. **Appearance is private** → a person reads and writes only their own `appearance` row. (pgTAP "another profile's appearance is invisible" in `18_appearance.test.sql`, Task 3)
6. **Stored appearance is untrusted, and a failed save says so** → unknown values fall back; `saveAppearance` returns the device-only sentence on error. (tests in `src/appearance.test.ts`, Tasks 2 and 6)
7. **Navigation shows exactly what it showed before** → per role, the same pages; Users only with `users.manage`; phones get three items plus Menu. (tests in `src/nav.test.ts`, Task 5)
8. **v1 redeploys when the shared design system changes, and v2 deploys still cannot touch v1** → `deploy.yml` includes `v2/design/**` and still excludes the rest of `v2/` and the v2 workflows. (test "v1 deploy ignores v2 except its design system" in `v2/scripts/deploy-config.test.mjs`, Task 3)
9. **Every screen has left the old styling** → the legacy list in `src/design.test.ts` is empty and no `.tsx` under `src/` contains a zinc/red/emerald/amber/blue/orange palette utility, `dark:`, `--brand-solid` or `--color-in/out`. (test "no screen uses the retired palette", Task 11)
10. **Behaviour unchanged** → `pnpm test`, `supabase test db`, `deno test supabase/functions`, `pnpm test:db` (equivalence) and `pnpm build` (including the demo build) are green. (Task 11)
11. **Every screen, every combination** → screenshots of every v1 screen × Midnight and Saffron × light and dark × 1440px and 375px, plus the shell and Appearance in all 8 accents and Black & White charts. (Task 11)

---

## Owners and order

| Task | Owner | Depends on |
|---|---|---|
| 1. Design system: shared appearance module, v1 components (ledger table, money input, statement A4, banner, admin table, coachmark, checklist, drop zone), sprite glyphs, `v1-screens.md` | Senior Designer | — |
| 2. Foundation: CSS wiring, fonts, icon sprite, pre-paint script, `src/appearance.ts`, guard tests, CSP, retire `design-system/` | Senior UX engineer | 1 |
| 3. Backend: appearance migration, pgTAP, types, `designSystem` removal, `deploy.yml` paths, go-live note | Backend engineer | — |
| 4. Shared primitives: `ui.tsx`, `table.tsx`, `clients/shared.tsx`, `clients/fields.tsx` | Senior UX engineer | 1, 2 |
| 5. Shell: sidebar folder, `nav.ts`, phone bar and drawer, wordmark, trial and sample-data banners | Senior UX engineer | 2, 3, 4 |
| 6. Appearance: `useAppearance.ts`, Settings → Appearance, ThemeToggle, retire `theme.ts` | Senior UX engineer | 2, 3, 4 |
| 7. Screens A: clients (balances, transactions, customisable table), client profile, add/edit client, import/export, attachments, statements | Frontend engineer | 4, 5 |
| 8. Screens B: dashboard and widgets (dnd-kit, KPI tiles, cash-flow chart), checklist, tour | Frontend engineer | 4, 5 |
| 9. Screens C: settings (organisation, logo, statements, regional, data, bank accounts, billing), users and roles, contracts | Frontend engineer | 4, 5, 6 |
| 10. Screens D: auth, session states, admin console (firms, create firm, support view, waitlist, platform settings), homepage, demo banner | Frontend engineer | 4, 5, 6 |
| 11. QA: checks, guard list empty, screenshot sweep | QA engineer | 1–10 |

The designer runs Task 1 first; the backend engineer can run Task 3 at any time (it is the only task that touches `supabase/` and `.github/`). After Task 1 the senior UX engineer runs 2, then 4, then 5 and 6 (either order). Tasks 7 and 8 start once 4 and 5 are committed; Tasks 9 and 10 also wait for 6 (Settings hosts Appearance; the admin console opens it). Tasks 7–10 can run in parallel with up to four frontend engineers. Task 11 runs last.

---

## File Structure

```
v2/design/appearance.ts                               moved from v2/src/ui/appearance.ts (pure: ACCENTS, THEMES, readAppearance, htmlAttrs, sameAppearance)
v2/src/ui/appearance.ts                               one-line re-export of ../../design/appearance.ts
v2/design/components/{LedgerTable,MoneyInput,StatementPaper,Banner,AdminTable,Coachmark,Checklist,DropZone}/README.md + preview.html
v2/design/components/bundle.css                       new classes for the above, inside @layer components
v2/design/icons/sprite.svg                            + the Phosphor glyphs v1's Icon names need
v2/design/README.md                                   §11 component list, §13 "Consumers: v1 imports by relative path"
docs/superpowers/design/v1-screens.md                 per-screen mapping, copy, accessibility (Task 1)
design-system/                                        deleted (Task 2)
src/index.css                                         imports v2/design, @theme inline map, dark variant on data-theme, batch blocks
src/appearance.ts, appearance.test.ts                 re-export + APPEARANCE_KEY; pre-paint parity
src/design.test.ts                                    guards: source of truth, fonts/CSP, retired palette (staged LEGACY list)
app/index.html                                        pre-paint script; Google Fonts removed
index.html                                            Google Fonts removed (Task 2); restyled (Task 10)
vercel.json                                           CSP font-src 'self'
CLAUDE.md, docs/README.md                             design system pointers → v2/design/README.md
supabase/migrations/20261012000001_appearance.sql     backfill appearance, drop firms.design_system
supabase/tests/18_appearance.test.sql                 new; 03_roles.test.sql re-pointed
src/data/database.types.ts, src/data/mappers.ts, src/demo/store.ts   designSystem removed
.github/workflows/deploy.yml                          paths filter re-includes v2/design/**
v2/scripts/deploy-config.test.mjs                     v1 path filter assertion
v2/docs/go-live.md                                    "no Vercel setting needed" note
docs/data-model-and-security.md                       user_preferences keys; firms column removed
src/ui.tsx, src/table.tsx, src/clients/shared.tsx, src/clients/fields.tsx   restyled primitives; Icon via sprite (Task 4)
src/nav.ts, nav.test.ts                               navItems, phoneItems (Task 5)
src/App.tsx                                           Shell, banners (Task 5)
src/useAppearance.ts                                  apply, cache, load and save the preference, follow the OS (Task 6)
src/settings/AppearanceSettings.tsx                   Settings → Appearance (Task 6)
src/theme.ts, src/theme.test.ts                       deleted (Task 6)
src/{ClientsPage,ClientProfile,Statement,transfer}.tsx, src/clients/{AddClient,ClientInfo}.tsx, src/attachments/**   (Task 7)
src/{Dashboard,widgets}.tsx, src/checklist/Checklist.tsx, src/tour/Tour.tsx                                     (Task 8)
src/settings/{SettingsPage,BankAccounts,BillingPage}.tsx, src/users/**.tsx, src/contracts/ContractsPage.tsx      (Task 9)
src/auth/AuthPages.tsx, src/data/session.tsx (FullPageMessage markup only), src/admin/**.tsx, src/home/home.ts, index.html, scripts/build-demo.sh (Task 10)
docs/superpowers/qa/v1-paper-round-1.md + screenshots                                                          (Task 11)
```

## Screen map (every v1 screen → template and components)

| Screen | Source | Template | Components |
|---|---|---|---|
| Sign in, sign up, forgot / set password | `src/auth/AuthPages.tsx` | Auth | wordmark, `rnr-paper` form card, `rnr-field` pill inputs, `rnr-btn-primary`, `rnr-note[data-tone=down]` |
| Loading, no firm, suspended, error states | `src/data/session.tsx` `FullPageMessage` | Auth | `rnr-paper`, `rnr-empty`, `rnr-spin` |
| Shell: sidebar, phone bar, drawer, account menu, skip link | `src/App.tsx`, `src/ui.tsx` `AccountMenu` | Shell | `rnr-side-*`, wordmark, `rnr-menu`, `rnr-avatar` |
| Trial banner (active, ≤ 3 days, ended, read-only) | `src/App.tsx` | Shell | Banner (`rnr-note` bar variant, tones info / warn / down) |
| Sample data banner + remove confirmation | `src/App.tsx` | Shell | Banner (info), `rnr-dialog` |
| Onboarding checklist | `src/checklist/Checklist.tsx` | Dashboard | Checklist (`rnr-steps` + `rnr-progress`), `rnr-folder` |
| Product tour | `src/tour/Tour.tsx` | overlay | Coachmark (`rnr-pop`, step count, Back / Next / Skip) |
| Dashboard, edit mode, add-widget menu, drag overlay | `src/Dashboard.tsx` | Dashboard | `rnr-grid`, `rnr-widget`, `rnr-handle` (`dots-six-vertical`), `rnr-drop`, `rnr-drag-overlay`, `rnr-menu` |
| Widgets: funds held, net this month, clients, cash-flow chart, recent transactions, top balances, quick transaction | `src/widgets.tsx` | Dashboard | `rnr-kpi-tile`, `rnr-kpi-figure`, Charts (series tokens, hatch, square marks), `rnr-kind`, `rnr-skeleton`, `rnr-empty`, MoneyInput |
| Clients: balances view, transactions view, period picker, filters, search | `src/ClientsPage.tsx`, `src/ui.tsx` `PeriodPicker` | List page (`rnr-wide`) | `rnr-page-head`, `rnr-seg`, `rnr-input`, LedgerTable (running balance), `rnr-pager` |
| Customisable table: column headers, sort, resize, columns dialog | `src/table.tsx` | List page | LedgerTable header states, `rnr-dialog`, `rnr-choice` |
| Clients on phones | `ClientsPage.tsx` `MobileCard` | List page | `rnr-card` row cards with mono figure |
| Record transaction / edit transaction | `src/ui.tsx` `TxnForm` | Form (dialog) | MoneyInput, `rnr-field`, `rnr-seg` (receipt / payment) |
| Add client, edit client, client details | `src/clients/{AddClient,ClientInfo}.tsx`, `fields.tsx` | Form / Detail | `rnr-dialog`, `rnr-field`, `rnr-chip` tags, `rnr-status` |
| Client profile: details and transactions tabs | `src/ClientProfile.tsx` | Detail page | `rnr-crumb`, `rnr-page-head`, `rnr-tabs`, `rnr-folder` stack, LedgerTable |
| Client statement (A4, print) | `src/Statement.tsx` | Detail page | StatementPaper, `rnr-btn-primary` "Print / Save PDF" |
| Consolidated statement | `src/Statement.tsx` `ConsolidatedStatement`, `src/clients/consolidatedStatement.ts` | Detail page | StatementPaper |
| Attachments (list, upload, delete) | `src/attachments/Attachments.tsx`, `ClientInfo.tsx` | inside Detail | DropZone, `rnr-table`, `rnr-dialog` confirm |
| Import (CSV / zip) and export | `src/transfer.tsx` `ImportDialog` | dialog | DropZone, `rnr-note`, `rnr-progress` |
| Contract Manager list and dialog | `src/contracts/ContractsPage.tsx` | List page | `rnr-table-card`, `rnr-status` (word + icon), `rnr-dialog`, `rnr-field` |
| Users: members, invite, manage, roles panel | `src/users/UsersPage.tsx`, `badges.tsx` | List page | `rnr-table-card`, `rnr-avatar`, `rnr-chip`, `rnr-dialog`, `rnr-folder` (roles) |
| Settings: Appearance, organisation, logo, statements, regional, data | `src/settings/SettingsPage.tsx`, `AppearanceSettings.tsx` | Settings | `rnr-folder` per concern, AppearancePanel, `rnr-field`, `rnr-btn-secondary` |
| Bank accounts | `src/settings/BankAccounts.tsx` | Settings | `rnr-table`, `rnr-dialog` |
| Billing | `src/settings/BillingPage.tsx` | Settings | `rnr-folder`, `rnr-kpi-tile` (RM 10 once), `rnr-stamp` "Paid" (decorative, `aria-hidden`) |
| Admin console shell | `src/admin/AdminConsole.tsx` | Shell (admin nav) | `rnr-side-*`, account menu with Appearance |
| Firms table, action menu, create firm | `src/admin/{FirmsTable,CreateFirmDialog}.tsx` | List page | AdminTable, `rnr-menu`, `rnr-dialog`, `rnr-status` |
| Support view (read-only firm ledger) | `src/admin/SupportView.tsx` | Detail page | Banner (info: "Read-only support view"), LedgerTable |
| Waitlist | `src/admin/Waitlist.tsx` | List page | AdminTable |
| Platform settings (firm cap, trial days) | `src/admin/PlatformSettings.tsx` | Settings | `rnr-folder`, `rnr-field` |
| Marketing homepage | `index.html`, `src/home/home.ts` | Public page | wordmark, `rnr-paper`, `rnr-btn-primary`, light theme only |
| Demo build (`/demo/`) | `scripts/build-demo.sh`, `src/demo/store.ts` | Shell | Banner (info) as a class, not inline style |

---

### Task 1: Design system — shared appearance module, v1 components, sprite, screen spec

**Owner:** Senior Designer · **Depends on:** — (committed before Tasks 2 and 4–10 start)

**Files:**
- Move: `v2/src/ui/appearance.ts` → `v2/design/appearance.ts`; `v2/src/ui/appearance.ts` becomes `export * from '../../design/appearance.ts'`
- Create: `v2/design/components/{LedgerTable,MoneyInput,StatementPaper,Banner,AdminTable,Coachmark,Checklist,DropZone}/README.md` + `preview.html`, `docs/superpowers/design/v1-screens.md`
- Modify: `v2/design/components/bundle.css`, `v2/design/icons/sprite.svg`, `v2/design/README.md` (§11, §13), `v2/design/preview.html` (links)

**Interfaces:**
- `v2/design/appearance.ts` exports exactly what `v2/src/ui/appearance.ts` exports today (`ACCENTS`, `ACCENT_LABEL`, `THEMES`, `DENSITIES`, `Appearance`, `DEFAULT_APPEARANCE`, `STORAGE_KEY`, `readAppearance`, `htmlAttrs`, `sameAppearance`), no imports, erasable syntax only.
- New classes (all in `@layer components`, tokens only, no hex): `rnr-ledger` (sticky header, `rnr-num` amount columns right-aligned, running-balance column, receipt/payment columns with `data-series`, resize handle, sorted header with `aria-sort`), `rnr-money` (ISO code prefix inside the field, Plex Mono, `inputmode="decimal"`, true minus), `rnr-statement` (A4 210mm sheet, fixed light palette in every theme, `@media print` rules, summary grid, landscape variant for wide ledgers), `rnr-note--bar` (full-width banner variant of `rnr-note`, tones info / warn / down), `rnr-admin-table` (compact rows, status chip, trailing action menu), `rnr-coach` (tour popover with arrow, step count), `rnr-checklist` (steps with done / skipped / current states, word + icon per state), `rnr-dropzone` (dashed `--line-strong`, drag-over state, keyboard-focusable button inside).
- `v1-screens.md`: one section per row of this plan's Screen map with the exact class list, copy changes (if any), focus order and the 375px layout.

- [ ] **Step 1: Move the module and keep v2 green.** Move the file; write the re-export; run `cd v2 && pnpm test` (the existing `appearance.test.ts` exercises the moved code through the re-export) and `pnpm build`.

- [ ] **Step 2: Extend the contrast test.** In `v2/scripts/tokens.test.mjs` add the new tokens the components use (if any) to the pairs checked, so `rnr-note--bar` text, `rnr-ledger` header text and the `rnr-dropzone` dashed border meet 4.5:1 / 3:1 in all 16 combinations. Run `cd v2 && node --test scripts/tokens.test.mjs`; expected FAIL until Step 3 if a new token is introduced.

- [ ] **Step 3: Write the classes, READMEs and previews.** Each README follows the existing format (anatomy, states, sizes, do/don't, accessibility). The statement sheet is specified ink on white in Hanken Grotesk with Plex Mono figures, no accent.

- [ ] **Step 4: Add the glyphs.** Map every key of `PATHS` in `src/ui.tsx` (`grip x back up down right download upload columns plus dashboard users in out trash resize check file printer wallet search phone mail pencil building person layout user logout sliders sun moon monitor more plans`) to a Phosphor regular glyph and add any missing symbol to `sprite.svg` with the same `id` as its Phosphor name; record the mapping table in `v1-screens.md` §Icons (e.g. `grip` → `dots-six-vertical`, `in` → `arrow-down-left`, `out` → `arrow-up-right`, `wallet` → `wallet`, `printer` → `printer`).

- [ ] **Step 5: Verify and commit.**

```bash
cd v2 && pnpm test && pnpm build && cd ..
git add v2/design v2/src/ui/appearance.ts v2/scripts/tokens.test.mjs docs/superpowers/design/v1-screens.md
git commit -m "feat: extend the design system for the v1 ledger"
```

---

### Task 2: Foundation — CSS wiring, fonts, icon sprite, pre-paint script, guards, CSP

**Owner:** Senior UX engineer · **Depends on:** 1

**Files:**
- Create: `src/appearance.ts`, `src/appearance.test.ts`, `src/design.test.ts`
- Modify: `src/index.css`, `app/index.html`, `index.html` (font links only), `vercel.json`, `CLAUDE.md`, `docs/README.md`
- Delete: `design-system/`

**Interfaces:**
- `src/appearance.ts`:

```ts
export * from '../v2/design/appearance.ts'
/** The user_preferences key that holds the person's Appearance. */
export const APPEARANCE_KEY = 'appearance'
```

- `src/index.css` head (replaces the Inter font, `--color-in/out`, `--brand-solid` and every `[data-design]` rule):

```css
@import "../v2/design/fonts/fonts.css";
@import "../v2/design/tokens.css";
@import "../v2/design/components/bundle.css";
@import "tailwindcss";

/* v2/design owns every rnr-* class (in @layer components). Never write unlayered CSS that targets rnr-* here. Spec: v2/design/README.md */
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

@theme inline {
  /* the same map as v2/src/index.css, current names only */
  --color-canvas: var(--canvas); --color-surface: var(--surface); --color-field: var(--field); --color-soft: var(--soft);
  --color-line: var(--line); --color-line-strong: var(--line-strong); --color-edge: var(--edge);
  --color-ink: var(--ink); --color-ink-2: var(--ink-2); --color-ink-3: var(--ink-3);
  --color-acc-a: var(--acc-a); --color-on-acc: var(--on-acc); --color-down: var(--down); --color-down-bg: var(--down-bg);
  --color-ok-ink: var(--ok-ink); --color-tint: var(--tint); --color-stamp: var(--stamp); --color-strike: var(--strike);
  --color-link: var(--link); --color-series-1: var(--series-1); --color-series-2: var(--series-2);
  --font-sans: var(--font-ui);
}

body { background: var(--canvas); color: var(--ink); font: var(--type-body); }

/* v1 paper: batch 7 — clients, ledger, statements (Task 7 only) */
/* v1 paper: batch 8 — dashboard, checklist, tour (Task 8 only) */
/* v1 paper: batch 9 — settings, users, contracts (Task 9 only) */
/* v1 paper: batch 10 — auth, admin, homepage (Task 10 only) */
```

  The existing `@media print` / `@page landscape` rules stay below the blocks.

- `app/index.html` pre-paint script (replaces the `theme-bootstrap` script and the three Google Fonts tags):

```html
<script>
  (() => {
    // Mirrors htmlAttrs(readAppearance(stored)) from v2/design/appearance.ts; src/appearance.test.ts runs this against it.
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

- `vercel.json` CSP: `style-src 'self' 'unsafe-inline'; font-src 'self';` (everything else unchanged).

- [ ] **Step 1: Write the failing tests.** `src/appearance.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ACCENTS, APPEARANCE_KEY, htmlAttrs, readAppearance, STORAGE_KEY } from './appearance.ts'

const runPrePaint = (stored: string | null, dark: boolean, reduce: boolean) => {
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8')
  const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('rnr.appearance'))
  assert.ok(src, 'no pre-paint script in app/index.html')
  const dataset: Record<string, string> = {}
  const matchMedia = (q: string) => ({ matches: q.includes('dark') ? dark : q.includes('reduced-motion') ? reduce : false })
  new Function('document', 'localStorage', 'matchMedia', src)({ documentElement: { dataset } }, { getItem: () => stored }, matchMedia)
  return dataset
}

test('the v1 pre-paint script sets the same attributes as htmlAttrs', () => {
  const samples = [null, '', 'not json', '42', '[]', '{"theme":"dark","accent":"saffron","density":"compact"}',
    '{"theme":"system","accent":"bw"}', '{"theme":"blue","accent":"forest"}', '{"preset":"ocean","style":"glass"}']
  for (const stored of samples) for (const dark of [true, false]) for (const reduce of [true, false]) {
    let parsed: unknown = null
    try { parsed = JSON.parse(stored || '{}') } catch { /* garbage falls back */ }
    assert.deepEqual({ ...runPrePaint(stored, dark, reduce) }, { ...htmlAttrs(readAppearance(parsed), dark, reduce) }, `${stored} dark=${dark} reduce=${reduce}`)
  }
})

test('v1 shares v2 storage and accent list', () => {
  assert.equal(STORAGE_KEY, 'rnr.appearance')
  assert.equal(APPEARANCE_KEY, 'appearance')
  assert.equal(ACCENTS.length, 8)
})
```

  `src/design.test.ts` (the `LEGACY` list starts as every `.tsx` under `src/` that matches `RETIRED` today; Tasks 4–10 remove entries):

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const walk = (dir: string): string[] => readdirSync(join(root, dir)).flatMap((n) => {
  const p = `${dir}/${n}`
  return statSync(join(root, p)).isDirectory() ? walk(p) : [p]
})

test('v1 imports the design system from v2/design', () => {
  const css = read('src/index.css')
  for (const f of ['fonts/fonts.css', 'tokens.css', 'components/bundle.css']) assert.ok(css.includes(`@import "../v2/design/${f}"`), f)
  // A copy would redeclare raw token values; v1 only maps names.
  for (const f of walk('src').filter((p) => p.endsWith('.css'))) assert.doesNotMatch(read(f), /--(canvas|surface|ink|acc-a)\s*:\s*#/, f)
})

test('nothing references the retired design-system folder', () => {
  for (const f of [...walk('src'), 'app/index.html', 'index.html', 'CLAUDE.md', 'docs/README.md']) assert.doesNotMatch(read(f), /design-system\//, f)
})

test('fonts are same-origin and the CSP allows them', () => {
  for (const f of ['app/index.html', 'index.html', 'vercel.json', 'src/index.css']) assert.doesNotMatch(read(f), /fonts\.(googleapis|gstatic)\.com/, f)
  assert.match(read('vercel.json'), /font-src 'self'/)
})

const RETIRED = /\b(?:zinc|red|emerald|green|amber|blue|sky|orange|rose|yellow)-\d{2,3}\b|\bdark:|--brand-solid|--color-(?:in|out)\b/
/** Files not yet on Paper that moves. Each screen task deletes its entries; Task 11 requires this list to be empty. */
const LEGACY = new Set<string>([
  // filled in Step 3 with every src/**/*.tsx that matches RETIRED today
])

test('no screen uses the retired palette', () => {
  const offenders = walk('src').filter((p) => p.endsWith('.tsx') && !LEGACY.has(p) && RETIRED.test(read(p)))
  assert.deepEqual(offenders, [])
  for (const p of LEGACY) assert.ok(RETIRED.test(read(p)), `${p} is migrated: remove it from LEGACY`)
})
```

  Run `pnpm test`. Expected: FAIL (no `src/appearance.ts`, old pre-paint script, Google Fonts present).

- [ ] **Step 2: Implement.** Write `src/appearance.ts`, `src/index.css`, the `app/index.html` script; remove the Google Fonts tags from `app/index.html` and `index.html` (the homepage then falls back to the bundled faces through `src/home/home.ts`'s existing `import '../index.css'`); change the CSP; `git rm -r design-system`; point `CLAUDE.md` (Design system bullet and the "Where things live" row) and `docs/README.md` at `v2/design/README.md`, with the sentence "v1 imports it by relative path; never copy it."

- [ ] **Step 3: Fill `LEGACY`.** `grep -rlE "<RETIRED pattern>" src --include='*.tsx' | sort` and paste the list. Also add `.dark` → `[data-theme]` in `src/App.tsx` only if `tsc` needs it (it should not: the `useTheme` effect still toggles the class until Task 6, and `dark:` now reads `data-theme`, which the pre-paint script sets).

- [ ] **Step 4: Verify and commit.**

```bash
npx tsc -p tsconfig.app.json --noEmit && npx oxlint src && pnpm test && pnpm build
git add src/appearance.ts src/appearance.test.ts src/design.test.ts src/index.css app/index.html index.html vercel.json CLAUDE.md docs/README.md
git commit -m "feat: wire v1 to the shared Paper that moves design system"
```

---

### Task 3: Backend — appearance migration, pgTAP, types, deploy path filter

**Owner:** Backend engineer · **Depends on:** —

**Files:**
- Create: `supabase/migrations/20261012000001_appearance.sql`, `supabase/tests/18_appearance.test.sql`
- Modify: `supabase/tests/03_roles.test.sql` (lines 14 and 27), `src/data/database.types.ts` (regenerated), `src/data/mappers.ts`, `src/data/mappers.test.ts` (if it lists firm columns), `src/demo/store.ts`, `src/App.tsx` (delete the `data-design` effect only), `src/settings/SettingsPage.tsx` (delete `DesignSystemCard` and its render only), `.github/workflows/deploy.yml`, `v2/scripts/deploy-config.test.mjs`, `v2/docs/go-live.md`, `docs/data-model-and-security.md`

**Interfaces:**
- `20261012000001_appearance.sql`:

```sql
-- Appearance becomes personal (Paper that moves): each person gets an `appearance` preference built from their old
-- `theme` preference and their firm's design system, then the firm-wide column is dropped. Readers validate the value.
insert into user_preferences (profile_id, key, value)
select p.id, 'appearance', jsonb_build_object(
  'theme', coalesce((select t.value #>> '{}' from user_preferences t
                     where t.profile_id = p.id and t.key = 'theme' and t.value #>> '{}' in ('light', 'dark', 'system')), 'system'),
  'accent', case f.design_system when 'ocean' then 'ocean' when 'forest' then 'fern' when 'sunset' then 'saffron' else 'midnight' end,
  'density', 'comfortable')
from profiles p left join firms f on f.id = p.firm_id
on conflict (profile_id, key) do nothing;

delete from user_preferences where key = 'theme';

alter table firms drop column design_system;
```

- `deploy.yml` trigger (order matters: later patterns win):

```yaml
on:
  push:
    branches: [main]
    # v1 imports v2/design (docs/superpowers/plans/2026-10-12-v1-paper-that-moves.md decision 1), so a design change redeploys v1.
    paths: ['**', '!v2/**', 'v2/design/**', '!.github/workflows/deploy-v2.yml', '!.github/workflows/ci-v2.yml']
  workflow_dispatch:
```

- [ ] **Step 1: Write the failing tests.** `supabase/tests/18_appearance.test.sql`:

```sql
begin;
select plan(4);

select hasnt_column('firms', 'design_system', 'the firm-wide design system is retired');

-- Two profiles in the seeded alpha firm.
-- Same pattern as 03_roles.test.sql: claims for owner@alpha.test (seed user 00000000-…-0000000000a1), then the authenticated role.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok($$ insert into user_preferences (profile_id, key, value)
  values (auth_profile_id(), 'appearance', '{"theme":"dark","accent":"iris","density":"compact"}')
  on conflict (profile_id, key) do update set value = excluded.value $$, 'a person saves their own appearance');

select is((select value->>'accent' from user_preferences where profile_id = auth_profile_id() and key = 'appearance'), 'iris', 'and reads it back');

select is_empty($$ select 1 from user_preferences where key = 'appearance' and profile_id <> auth_profile_id() $$,
  'another profile''s appearance is invisible');

select * from finish();
rollback;
```

  In `03_roles.test.sql` replace `design_system = 'ocean'` / `'forest'` with `date_format = 'numeric'` / `'text'` and the descriptions with "viewer cannot change firm settings" / "admin can change firm settings (firm_can_write)". In `v2/scripts/deploy-config.test.mjs` replace the `paths-ignore` assertion:

```js
test('v1 deploy ignores v2 except its design system', () => {
  const v1 = wf('deploy.yml')
  assert.doesNotMatch(v1, /paths-ignore/)
  assert.match(v1, /paths:\s*\[\s*'\*\*',\s*'!v2\/\*\*',\s*'v2\/design\/\*\*',\s*'!\.github\/workflows\/deploy-v2\.yml',\s*'!\.github\/workflows\/ci-v2\.yml'\s*\]/)
})
```

  Run `supabase test db` and `cd v2 && node --test scripts/deploy-config.test.mjs`. Expected: FAIL.

- [ ] **Step 2: Replay the backfill against fixture rows (manual check, recorded in the commit body).**

```bash
supabase db reset --version 20261008000001
psql "$(supabase status -o env | sed -n 's/^DB_URL=//p' | tr -d '"')" -c "
  update firms set design_system = 'forest' where name like 'Alpha%';
  insert into user_preferences (profile_id, key, value) select id, 'theme', '\"dark\"' from profiles where email = 'owner@alpha.test';"
supabase migration up
psql "…same URL…" -c "select p.email, u.value from user_preferences u join profiles p on p.id = u.profile_id where u.key in ('appearance','theme') order by 1"
```

  Expected: every profile has one `appearance` row; `owner@alpha.test` → `{"theme":"dark","accent":"fern","density":"comfortable"}`; other alpha members → `system` + `fern`; other firms → `midnight`; no `theme` rows.

- [ ] **Step 3: Implement.** Add the migration; `supabase db reset && pnpm db:types`; remove `DesignSystem`, `designSystem` (type, `rowToFirm`, `FIRM_COLUMNS`) from `mappers.ts`, `designSystem: 'ocean'` from `demo/store.ts`, the `data-design` effect from `App.tsx`, `DesignSystemCard` from `SettingsPage.tsx`; change `deploy.yml`; add to `v2/docs/go-live.md` §B step 13: "v1 imports `v2/design/` by relative path; v1's Vercel project is rooted at the repository root and both projects build on the GitHub runner (`vercel build`), so no 'Include files outside the root directory' setting is needed. Keep `v2/design/` inside `v2/`."; update the `user_preferences` keys (`appearance`, no `theme`) and the firms columns in `docs/data-model-and-security.md`.

- [ ] **Step 4: Verify and commit.**

```bash
supabase test db && npx tsc -p tsconfig.app.json --noEmit && pnpm test && deno test supabase/functions && (cd v2 && node --test scripts/deploy-config.test.mjs)
git add supabase/migrations/20261012000001_appearance.sql supabase/tests/18_appearance.test.sql supabase/tests/03_roles.test.sql \
  src/data/database.types.ts src/data/mappers.ts src/demo/store.ts src/App.tsx src/settings/SettingsPage.tsx \
  .github/workflows/deploy.yml v2/scripts/deploy-config.test.mjs v2/docs/go-live.md docs/data-model-and-security.md
git commit -m "feat: make appearance personal and retire the firm design system"
```

---

### Task 4: Shared primitives — `ui.tsx`, `table.tsx`, `clients/shared.tsx`, `clients/fields.tsx`

**Owner:** Senior UX engineer · **Depends on:** 1, 2

**Files:**
- Modify: `src/ui.tsx`, `src/table.tsx`, `src/clients/shared.tsx`, `src/clients/fields.tsx`, `src/users/badges.tsx`, `src/design.test.ts` (remove these from `LEGACY`)

**Interfaces (names and props unchanged; only the classes behind them move):**
- `Icon({ name, className })` renders `<svg aria-hidden="true" className={`rnr-icon ${className}`}><use href={`${sprite}#${GLYPH[name]}`} /></svg>` with `import sprite from '../v2/design/icons/sprite.svg?url'` and `GLYPH: Record<keyof typeof PATHS, string>` from Task 1's mapping; `PATHS` is deleted and the `name` type becomes `keyof typeof GLYPH`.
- `ring` → `'rnr-focus'`; `btn.{primary,secondary,ghost,danger,…}` → `rnr-btn rnr-btn-*` (one primary per view); `field`/`input` → `rnr-input`; `Field` → `rnr-field` / `rnr-label` / `rnr-hint`; `Dialog` → native `<dialog className="rnr-dialog">` with `rnr-dialog-head`/`-body`; `Menu`, `menuItemClass` → `rnr-menu` / `rnr-menu-item`; `Avatar` → `rnr-avatar`; `KindBadge` → `rnr-kind` / `rnr-kind is-out` with the in/out glyph and the visible word; `TxnForm` amount → `rnr-money` (ISO code from `useMoney().currency`; parse/validation code unchanged); `PeriodPicker` → `rnr-seg` + `rnr-input`; `Segmented` → `rnr-seg`; `LoadError`/`MutationError` → `rnr-note[data-tone=down]` with the X icon; `Skeleton` → `rnr-skeleton`; `StatusBadge`/`TagPill`/role badges → `rnr-status` / `rnr-chip` (radius 6, word kept); `ColumnHeader`/`ColumnsDialog` → `rnr-ledger` header states (`aria-sort`, resize handle 44px hit area on coarse pointers).

- [ ] **Step 1:** Remove the five files from `LEGACY`; run `pnpm test` → FAIL ("no screen uses the retired palette").
- [ ] **Step 2:** Restyle per the interfaces above and `v1-screens.md`. No prop, hook, state or handler changes; `useLocalState`, `useUnloadGuard`, `nextSort`, `useTableLayout` untouched.
- [ ] **Step 3: Verify and commit.**

```bash
npx tsc -p tsconfig.app.json --noEmit && npx oxlint src && pnpm test
git add src/ui.tsx src/table.tsx src/clients/shared.tsx src/clients/fields.tsx src/users/badges.tsx src/design.test.ts
git commit -m "feat: move v1 primitives and icons onto the shared design system"
```

---

### Task 5: Shell — sidebar folder, navigation, phone bar and drawer, banners

**Owner:** Senior UX engineer · **Depends on:** 2, 3, 4

**Files:**
- Create: `src/nav.ts`, `src/nav.test.ts`
- Modify: `src/App.tsx`, `src/ui.tsx` (`AccountMenu` markup only), `src/design.test.ts`

**Interfaces:**

```ts
// src/nav.ts
import { can, type Role } from './users/rules'

export type View = 'dashboard' | 'clients' | 'contracts' | 'users' | 'settings'
export type NavItem = { view: View; label: string; short: string; icon: 'dashboard' | 'users' | 'file' | 'user' | 'sliders'; place: 'main' | 'foot' }

const ALL: NavItem[] = [
  { view: 'dashboard', label: 'Dashboard', short: 'Dashboard', icon: 'dashboard', place: 'main' },
  { view: 'clients', label: 'Clients', short: 'Clients', icon: 'users', place: 'main' },
  { view: 'contracts', label: 'Contract Manager', short: 'Contracts', icon: 'file', place: 'main' },
  { view: 'users', label: 'Users', short: 'Users', icon: 'user', place: 'foot' },
  { view: 'settings', label: 'Settings', short: 'Settings', icon: 'sliders', place: 'foot' },
]

/** The pages a role can open, in sidebar order. Users needs users.manage, as the account menu did before. */
export const navItems = (role: Role): NavItem[] => ALL.filter((i) => i.view !== 'users' || can(role, 'users.manage'))

/** The phone bottom bar: the main pages; "Menu" (rendered by the shell) opens the rest. */
export const phoneItems = (items: NavItem[]): NavItem[] => items.filter((i) => i.place === 'main')

/** Billing is a sub-page of Settings, so the Settings item stays current there. */
export const currentItem = (view: View | 'billing'): View => (view === 'billing' ? 'settings' : view)
```

- [ ] **Step 1: Write the failing test** `src/nav.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { currentItem, navItems, phoneItems } from './nav.ts'

test('every role sees the same pages as before', () => {
  assert.deepEqual(navItems('owner').map((i) => i.view), ['dashboard', 'clients', 'contracts', 'users', 'settings'])
  assert.deepEqual(navItems('admin').map((i) => i.view), ['dashboard', 'clients', 'contracts', 'users', 'settings'])
  assert.deepEqual(navItems('accountant').map((i) => i.view), ['dashboard', 'clients', 'contracts', 'settings'])
  assert.deepEqual(navItems('viewer').map((i) => i.view), ['dashboard', 'clients', 'contracts', 'settings'])
})

test('phones get the three main pages; billing keeps Settings current', () => {
  assert.deepEqual(phoneItems(navItems('viewer')).map((i) => i.short), ['Dashboard', 'Clients', 'Contracts'])
  assert.equal(currentItem('billing'), 'settings')
  assert.equal(currentItem('clients'), 'clients')
})
```

  (Confirm the role expectations against `src/users/rules.ts` before writing them: `users.manage` today decides `showUsers`.) Run → FAIL.

- [ ] **Step 2: Implement** `nav.ts`; in `App.tsx` replace the `<aside>` header with the sidebar folder (`<nav aria-label="Main">`, `rnr-side-link` with `aria-current="page"`, wordmark under which the firm name sits), the foot group and account, the phone top bar and bottom bar, and the drawer (`<dialog>`, focus returns to "Menu" on close). The trial and sample-data banners become `rnr-note rnr-note--bar` with the same `role`, `aria-live`, `aria-label`, copy and links; the remove-sample confirmation uses `Dialog`. `readRoute`, `HEADINGS`, the trial interval and every hook call stay as they are. Remove `src/App.tsx` from `LEGACY`.
- [ ] **Step 3: Verify and commit.**

```bash
npx tsc -p tsconfig.app.json --noEmit && npx oxlint src && pnpm test
git add src/nav.ts src/nav.test.ts src/App.tsx src/ui.tsx src/design.test.ts
git commit -m "feat: put the v1 app in the sidebar-in-a-folder shell"
```

---

### Task 6: Appearance — per-user persistence, Settings → Appearance, ThemeToggle

**Owner:** Senior UX engineer · **Depends on:** 2, 3, 4

**Files:**
- Create: `src/useAppearance.ts`, `src/settings/AppearanceSettings.tsx`
- Modify: `src/data/queries.ts` (delete `useTheme` only), `src/ui.tsx` (`ThemeToggle` props), `src/App.tsx` (swap `useTheme` for `useAppearance`), `src/settings/SettingsPage.tsx` (render `<AppearanceSettings />` first), `src/appearance.test.ts`
- Delete: `src/theme.ts`, `src/theme.test.ts` (superseded by `htmlAttrs`, tested in v2 and here)

**Interfaces:**

```ts
// src/useAppearance.ts
import { useEffect, useState } from 'react'
import { supabase } from './data/supabase'
import { DEMO, getStore, saveStore } from './demo/store'
import { APPEARANCE_KEY, htmlAttrs, readAppearance, sameAppearance, STORAGE_KEY, type Appearance } from './appearance'

export const SAVE_FAILED = 'Your appearance is saved on this device only. Try again to keep it on your other devices.'
const dark = () => matchMedia('(prefers-color-scheme: dark)').matches
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export function cachedAppearance(): Appearance {
  try { return readAppearance(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')) } catch { return readAppearance(null) }
}

export function applyAppearance(a: Appearance) {
  Object.assign(document.documentElement.dataset, htmlAttrs(a, dark(), reduce()))
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(a)) } catch { /* private mode: this page still shows it */ }
}

/** Pure save step, injectable for tests: persists and maps any failure to the device-only sentence. */
export async function persistAppearance(write: (a: Appearance) => Promise<{ error: unknown }>, a: Appearance): Promise<string | null> {
  try {
    const { error } = await write(a)
    if (error) console.error('Appearance not saved', error)
    return error ? SAVE_FAILED : null
  } catch (error) {
    console.error('Appearance not saved', error)
    return SAVE_FAILED
  }
}

/** Takes the profile id explicitly so the super-admin console (outside SessionProvider) can use it too. */
export function useAppearance(profileId: string): [Appearance, (a: Appearance) => Promise<string | null>] {
  const [value, setValue] = useState(cachedAppearance)
  useEffect(() => {
    if (DEMO) { const s = getStore().preferences[APPEARANCE_KEY]; if (s !== undefined) adopt(readAppearance(s)); return }
    supabase.from('user_preferences').select('value').eq('profile_id', profileId).eq('key', APPEARANCE_KEY).maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error('Appearance not loaded', error); return } // the cache stays in force
        if (data) adopt(readAppearance(data.value))
      })
    function adopt(a: Appearance) { if (!sameAppearance(a, cachedAppearance())) applyAppearance(a); setValue(a) }
  }, [profileId])
  useEffect(() => {
    const qs = [matchMedia('(prefers-color-scheme: dark)'), matchMedia('(prefers-reduced-motion: reduce)')]
    const on = () => applyAppearance(cachedAppearance())
    qs.forEach((q) => q.addEventListener('change', on))
    return () => qs.forEach((q) => q.removeEventListener('change', on))
  }, [])
  const save = (a: Appearance) => {
    applyAppearance(a); setValue(a)
    if (DEMO) { const s = getStore(); saveStore({ ...s, preferences: { ...s.preferences, [APPEARANCE_KEY]: a } }); return Promise.resolve(null) }
    return persistAppearance((v) => supabase.from('user_preferences').upsert({ profile_id: profileId, key: APPEARANCE_KEY, value: v }), a)
  }
  return [value, save]
}
```

  `persistAppearance` lives in a React-free module if `node --test` cannot load `useAppearance.ts` (it imports `supabase`); in that case move `SAVE_FAILED` and `persistAppearance` to `src/appearance.ts` and import them here.

- `AppearanceSettings` renders v2's AppearancePanel markup (`v2/design/components/AppearancePanel/README.md`): Theme (`rnr-seg`: Light / Dark / System), Accent (8 swatches as radios with `ACCENT_LABEL` names, 2 × 4 under 480px), Density (Comfortable / Compact), a live preview (KPI tile with a sample "MYR 12,480.00", a ledger row, the stamp), and a `rnr-note[data-tone=warn]` when `save` returns a message. Each change saves at once (no Save button), as v2.
- `ThemeToggle({ theme, setTheme })` keeps its cycle; `App.tsx` passes `appearance.theme` and `(t) => save({ ...appearance, theme: t })`.

- [ ] **Step 1: Failing test** appended to `src/appearance.test.ts`:

```ts
import { persistAppearance, SAVE_FAILED } from './appearance.ts' // or './useAppearance.ts', per the note above
import { DEFAULT_APPEARANCE } from './appearance.ts'

test('a failed save keeps the choice on this device and says so', async () => {
  assert.equal(await persistAppearance(async () => ({ error: null }), DEFAULT_APPEARANCE), null)
  assert.equal(await persistAppearance(async () => ({ error: { message: 'offline' } }), DEFAULT_APPEARANCE), SAVE_FAILED)
  assert.equal(await persistAppearance(async () => { throw new Error('network') }, DEFAULT_APPEARANCE), SAVE_FAILED)
})
```

  Run → FAIL.
- [ ] **Step 2: Implement** as above; delete `useTheme` (and its `resolveTheme`/`ThemePreference` imports) from `queries.ts`, delete `theme.ts` and `theme.test.ts`; remove the `classList.toggle('dark')` path entirely (nothing sets `.dark` any more).
- [ ] **Step 3: Verify and commit.**

```bash
npx tsc -p tsconfig.app.json --noEmit && npx oxlint src && pnpm test && pnpm build
git add src/useAppearance.ts src/settings/AppearanceSettings.tsx src/appearance.ts src/appearance.test.ts src/data/queries.ts src/ui.tsx src/App.tsx src/settings/SettingsPage.tsx
git rm src/theme.ts src/theme.test.ts
git commit -m "feat: let each person choose their appearance in v1"
```

---

### Task 7: Screens A — clients, ledger, client profile, import/export, attachments, statements

**Owner:** Frontend engineer · **Depends on:** 4, 5

**Files (owned):** `src/ClientsPage.tsx`, `src/ClientProfile.tsx`, `src/Statement.tsx`, `src/transfer.tsx` (`ImportDialog` markup only), `src/clients/AddClient.tsx`, `src/clients/ClientInfo.tsx`, `src/attachments/Attachments.tsx`, the `batch 7` block in `src/index.css`, their `LEGACY` entries.

- [ ] **Step 1:** Remove the owned files from `LEGACY`; `pnpm test` → FAIL.
- [ ] **Step 2:** Restyle per the Screen map and `v1-screens.md`: balances and transactions views on `rnr-ledger` inside `rnr-table-card rnr-wide` (running-balance column mono, receipts `data-series="in"`, payments `data-series="out"` with the hatch class, negative figures `--down` plus the minus already in `makeMoney` output); `MobileCard` → `rnr-card`; client profile → Detail page with `rnr-tabs`; statement and consolidated statement → `rnr-statement` (ink on white, landscape class kept for wide ledgers, `print()` button unchanged); `ImportDialog` and attachments → `rnr-dropzone` (the existing `<input type="file">` stays the control; compression and upload code untouched).
- [ ] **Step 3:** Print-preview check in the Browser pane (Chrome print emulation): statement fits A4 portrait, consolidated wide ledger A4 landscape, no theme or accent colour in the document in dark + Saffron.
- [ ] **Step 4: Verify and commit.**

```bash
npx tsc -p tsconfig.app.json --noEmit && npx oxlint src && pnpm test
git add src/ClientsPage.tsx src/ClientProfile.tsx src/Statement.tsx src/transfer.tsx src/clients/AddClient.tsx src/clients/ClientInfo.tsx src/attachments/Attachments.tsx src/index.css src/design.test.ts
git commit -m "feat: restyle clients, ledger and statements on paper"
```

---

### Task 8: Screens B — dashboard, widgets, checklist, tour

**Owner:** Frontend engineer · **Depends on:** 4, 5

**Files (owned):** `src/Dashboard.tsx`, `src/widgets.tsx`, `src/checklist/Checklist.tsx`, `src/tour/Tour.tsx`, the `batch 8` block in `src/index.css`, their `LEGACY` entries.

- [ ] **Step 1:** Remove the owned files from `LEGACY`; `pnpm test` → FAIL.
- [ ] **Step 2:** Restyle: grid → `rnr-grid` (spans 1 / 2 / 4 unchanged, `Span` values unchanged), widget chrome → `rnr-widget` with `rnr-handle` (`dots-six-vertical`) in edit mode, drop target `rnr-drop`, drag overlay `rnr-drag-overlay`; every dnd-kit sensor, `sortableKeyboardCoordinates`, `arrayMove` and the `dashboard` preference write stay as they are. KPI widgets → `rnr-kpi-tile` / `rnr-kpi-figure` with `makeMoney` output verbatim; `LOADING` skeleton sizes match the new tiles so the grid does not jump. `CashflowChart`: receipts fill `var(--series-1)`, payments `var(--series-2)` with the hatch pattern and `rnr-chart-mark[data-series="out"]` squares, gridlines `var(--soft)`, axis text `rnr-chart-axis`; the legend keeps the words "Receipts" / "Payments" with their arrows; `monthlyFlow` and the geometry are untouched. Checklist → `rnr-checklist` (done / skipped / current each with a word and icon); Tour → `rnr-coach` (`positioning.ts` output drives placement through classes or SVG attributes, never `style`; if positioning needs runtime coordinates, use CSS custom properties set via `element.style.setProperty` in an effect — note it with a `shortcut:` comment — because `top/left` cannot be expressed as static classes).
- [ ] **Step 3: Verify and commit.**

```bash
npx tsc -p tsconfig.app.json --noEmit && npx oxlint src && pnpm test
git add src/Dashboard.tsx src/widgets.tsx src/checklist/Checklist.tsx src/tour/Tour.tsx src/index.css src/design.test.ts
git commit -m "feat: restyle the dashboard, widgets, checklist and tour on paper"
```

---

### Task 9: Screens C — settings, users and roles, contracts

**Owner:** Frontend engineer · **Depends on:** 4, 5, 6

**Files (owned):** `src/settings/SettingsPage.tsx` (below `AppearanceSettings`), `src/settings/BankAccounts.tsx`, `src/settings/BillingPage.tsx`, `src/users/UsersPage.tsx`, `src/contracts/ContractsPage.tsx`, the `batch 9` block in `src/index.css`, their `LEGACY` entries.

- [ ] **Step 1:** Remove the owned files from `LEGACY`; `pnpm test` → FAIL.
- [ ] **Step 2:** Restyle: Settings → one `rnr-folder` per concern (Appearance, Organisation with logo, Statements, Regional, Bank accounts, Data, Billing link), `EditableCard` keeps its edit/save/cancel behaviour and `disabledReason` copy; Billing → `rnr-folder` with the RM 10 figure in `rnr-kpi-tile` and the decorative "Paid" stamp only when `billingStatus === 'paid'` (status word kept beside it); Users → `rnr-table-card`, invite/manage dialogs, roles panel as a folder; Contracts → List page with `rnr-status` (word + icon from `contracts/status.ts`, unchanged).
- [ ] **Step 3: Verify and commit.**

```bash
npx tsc -p tsconfig.app.json --noEmit && npx oxlint src && pnpm test
git add src/settings/SettingsPage.tsx src/settings/BankAccounts.tsx src/settings/BillingPage.tsx src/users/UsersPage.tsx src/contracts/ContractsPage.tsx src/index.css src/design.test.ts
git commit -m "feat: restyle settings, users and contracts on paper"
```

---

### Task 10: Screens D — auth, session states, admin console, homepage, demo banner

**Owner:** Frontend engineer · **Depends on:** 4, 5, 6

**Files (owned):** `src/auth/AuthPages.tsx`, `src/data/session.tsx` (`FullPageMessage` markup only), `src/admin/{AdminConsole,FirmsTable,CreateFirmDialog,SupportView,Waitlist,PlatformSettings}.tsx`, `index.html`, `src/home/home.ts` (selectors only if markup ids change — keep ids), `scripts/build-demo.sh`, the `batch 10` block in `src/index.css`, their `LEGACY` entries.

- [ ] **Step 1:** Remove the owned files from `LEGACY`; `pnpm test` → FAIL.
- [ ] **Step 2:** Restyle: auth → Auth template (wordmark, `rnr-paper` card, pill inputs, `PasswordField` show/hide unchanged); `FullPageMessage` → `rnr-paper` + `rnr-empty`; admin console → the Task 5 shell layout with admin nav (Firms, Waitlist, Platform settings) and an account menu item "Appearance" opening `<AppearanceSettings />` in a `Dialog`, using `useAppearance(profileId)` (pass the profile id `session.tsx` already holds); firms and waitlist → `rnr-admin-table`; support view → `rnr-note--bar` "Read-only support view" + `rnr-ledger`; homepage → public-page template, light theme only, same ids and copy; demo banner in `build-demo.sh` → `<div class="rnr-note rnr-note--bar" data-tone="info">Demo — data stays in your browser. <a href="/app/">Sign in</a></div>` (no inline style; the bundle is in the demo's CSS).
- [ ] **Step 3: Verify and commit.**

```bash
npx tsc -p tsconfig.app.json --noEmit && npx oxlint src && pnpm test && pnpm build
git add src/auth/AuthPages.tsx src/data/session.tsx src/admin index.html src/home/home.ts scripts/build-demo.sh src/index.css src/design.test.ts
git commit -m "feat: restyle auth, the admin console and the homepage on paper"
```

---

### Task 11: QA — checks, guard list empty, screenshot sweep

**Owner:** QA engineer · **Depends on:** 1–10

**Files:** Create `docs/superpowers/qa/v1-paper-round-1.md`, `docs/superpowers/qa/v1-paper-round-1/*.png`; Modify `src/design.test.ts` (assert `LEGACY` is empty).

- [ ] **Step 1: Close the guard.** Replace the `LEGACY` entries with an empty set and add `assert.equal(LEGACY.size, 0)` to "no screen uses the retired palette". `pnpm test` must pass; any offender is a finding for its batch owner.
- [ ] **Step 2: Full checks (all must pass; report failures as failures).**

```bash
npx tsc -p tsconfig.app.json --noEmit
npx oxlint src
pnpm test
supabase start && supabase test db
deno test supabase/functions
pnpm test:db
pnpm build                     # includes scripts/build-demo.sh → dist/demo/index.html
(cd v2 && pnpm test && pnpm build)   # the shared design/ and the moved appearance module
grep -rn "fonts.googleapis\|fonts.gstatic" dist && exit 1 || true
```

- [ ] **Step 3: Screenshot sweep** in the Claude in-app Browser pane at `http://alpha.localhost:5199/app/` (owner), `http://beta.localhost:5199/app/` (viewer of another firm, if seeded) and the super-admin, plus `pnpm preview` for `/demo/` and `/`. For every row of the Screen map: **Midnight and Saffron × light and dark × 1440px and 375px** (8 shots per screen), named `<screen>--<accent>-<theme>-<width>.png`. Also: the shell and Settings → Appearance in all 8 accents (light and dark); the dashboard cash-flow chart in Black & White (series distinguishable by pattern, marker and label); the statement print preview (A4 portrait, consolidated landscape) in dark + Saffron (document stays ink on white); `prefers-reduced-motion` on the shell; a forced save failure (offline) on Appearance showing the device-only sentence.
- [ ] **Step 4: Check against the spec.** For each screenshot: tokens only (no zinc), one primary per view, 44px targets, no page-level horizontal scroll at 375px, focus visible and returned after dialogs and the drawer, status never colour-only, copy unchanged except where `v1-screens.md` names a change. Reload with a stored dark + Iris appearance and confirm no flash before React mounts. Sign in on a second browser profile and confirm the Appearance followed the person.
- [ ] **Step 5: Report and commit.** `docs/superpowers/qa/v1-paper-round-1.md`: one row per check and per screen with PASS / FAIL, findings numbered `QA-V1P-n` with owner task.

```bash
git add src/design.test.ts docs/superpowers/qa/v1-paper-round-1.md docs/superpowers/qa/v1-paper-round-1
git commit -m "docs: add the v1 paper QA report"
```

---

## Risks

- **Shared-file coupling.** A v2 change to `bundle.css`, `tokens.css` or a class name now restyles v1 too. Mitigation: v1 CI runs on every pull request; `deploy.yml` redeploys v1 on `v2/design/**`; `v2/design/README.md` §13 lists v1 as a consumer, so renames go through the migration map.
- **Deploy window.** The migration drops `firms.design_system` before the new v1 web build is live; for a few minutes the old Settings picker can fail one save. No data is lost.
- **Latin-only fonts.** Non-Latin client names render in the fallback face. Acceptable for v1's market; upgrade by switching to the fontsource packages (as v2) if a firm reports it.
- **Tour positioning** needs runtime coordinates; Task 8 sets CSS custom properties from an effect instead of a `style` prop and notes it with a `shortcut:` comment.
- **Scale.** About 376 lines of zinc utilities across 30 `.tsx` files are rewritten; the staged `LEGACY` guard makes progress and completion checkable, and the screen batches are disjoint by file.
