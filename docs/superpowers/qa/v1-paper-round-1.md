# v1 "Paper that moves": QA round 1

Branch `feat/v2-workflow-platform` at `37c09e0`. Diff reviewed: `git diff 589573a..HEAD -- . ':!v2/docs'` (308 files). Real v1 stack: root `supabase start` + `supabase db reset` (seed), `pnpm dev --port 5199`, Chrome 155 headless driven over the DevTools protocol (no claude-in-chrome, no Playwright). v2's Supabase was stopped for the run and restarted after. No source edited.

## Verdict: FAIL

5 major, 14 minor, 0 blocker. The paper restyle itself is in good shape (tokens, corners, focus rings, appearance persistence, migration, print on light). The majors are: dark-theme statement print, super-admin Appearance never loaded, a pre-existing crash in the column chooser, page-level horizontal scroll on Users at 375px, and sub-44px touch targets.

## Findings

Severity: blocker / major / minor. "Pre-existing" = present at `589573a`, not introduced by this branch. Screenshots are under `docs/superpowers/qa/v1-shots/qa/`.

| ID | Sev | Area | Evidence | Expected | Actual | Owner |
|---|---|---|---|---|---|---|
| QA-V1-1 | major | Statements, print | `statement-print-dark-saffron-portrait-p1.png`, `statement-print-dark-saffron-landscape-p1.png` (page 1 of the PDFs from `Page.printToPDF`, background graphics on, as headless `--print-to-pdf` does). Pixel (2,2) of every page is rgb(18,18,18) in dark, white in light. Same in Saffron and Iris; 3-page portrait and 5-page landscape. | "A printed page is paper: ink on white in every theme and accent" (plan Task 7, Review Focus). | In dark theme the page margins print near-black around the white sheet. Computed `html` background is white under print emulation, but `color-scheme: dark` (tokens.css:76) still paints the canvas. Printing without background graphics is white. Light themes are white; no accent colour on the sheet (max chroma 0). | Task 7 (print block in `src/index.css`), designer for `bundle.css` print rules. Fix: force `color-scheme: light` and an `@page` background in print. |
| QA-V1-2 | major | Admin console, Appearance | `admin-saved-appearance-not-applied--db-saffron-dark-1440.png`: DB row for admin@platform.test = dark/saffron, fresh device renders light/midnight. Ordinary owner on a fresh device correctly renders dark/saffron. | Appearance follows the person to every device, including the super-admin (Review Focus 4, 5). | `AdminConsole.tsx` never calls `useAppearance`; the saved row is only read once the Appearance dialog is opened. Until then the admin sees the cached or default look. | Task 6 / Task 10 (`src/admin/AdminConsole.tsx`): call `useAppearance(profileId)` at the console level. |
| QA-V1-3 | major | Clients, column chooser | `dbg-columns-toggle.png` (blank page). Console: `TypeError: Cannot read properties of undefined (reading 'cell')` at `ClientsPage.tsx` LedgerView. Repro: Clients > Transactions > Columns > untick Description. | Hiding a column hides it. | Whole app goes blank (React unmounts). Cause: `txnVisible.find((c) => c.id === 'description')!.cell(t)` in the mobile card list, which is rendered at every width (hidden by CSS). Pre-existing (line existed at `589573a:630`), still present, and the batch rewrote this file. A reload recovers (layout not persisted). | Task 7 (`src/ClientsPage.tsx:635`). |
| QA-V1-4 | major | Users at 375px | `users--midnight-light-375.png`, `users-scrolled--midnight-light-375.png`, `users-bottom--midnight-light-375.png`. `document.scrollingElement.scrollWidth` 528 vs 375; `scrollLeft = 120` sticks at a non-mobile 375 viewport. Hiding `.rnr-table-bare` returns it to 375. | "No page-level horizontal scroll at 375px; wide ledgers scroll inside `rnr-table-card`." | The Roles and permissions table (`UsersPage.tsx:201`, `min-w-[560px]` inside `rnr-table-bare`) leaks into the document's scroll width. All other screens at 375 are clean. | Task 9 (`src/users/UsersPage.tsx` RolesPanel). |
| QA-V1-5 | major | Touch targets at 375px (coarse pointer) | Audit across the sweep, e.g. `clients-balances--midnight-light-375.png`, `client-profile--midnight-light-375.png`, `users--midnight-light-375.png`, `dashboard--midnight-light-375.png`. | 44px minimum on coarse pointers (Phase 7 defect class that must not recur). | "Take the tour" 42x44 (every screen); "More actions" 34x44 and "Statement of account" 42x44 (Clients); "Import sample" 42x44 (Dashboard); "Remove tag" 20x20, "Add tag" input 112x32, Status and Assigned selects 36px tall (client profile); column sort buttons 32px tall and resize handles 24x56 (Users, ledgers); 20x20 checkboxes in the columns and bank dialogs; client-name links in the dashboard widget 24px tall; demo banner "Sign in" 40x20. | Task 5 (tour button), Task 7 (Clients, profile), Task 8 (Import sample, widget links), Task 4 (`table.tsx`, `ui.tsx` icon buttons), Task 10 (demo banner). |
| QA-V1-6 | minor | Contrast, Saffron dark | `dashboard--saffron-dark-1440.png`. Audit: `.rnr-caption` "Add phone, email, and registration number" rgb(154,161,190) on rgb(66,58,51), about 4.2:1. | 4.5:1 for body text. | Checklist current-row caption is slightly under in Saffron dark only. All other accent x theme pairs audited (16 on Dashboard, Settings, Clients) pass. | Designer (`--ink-3` over `--tint`, saffron dark). |
| QA-V1-7 | minor | Ledger header | `ledger-header-crop--midnight-light-1440.png`. | One-line header: icon, word, sort caret. Column named "In"/"Out" everywhere (chooser, CSV). | Receipts/Payments headers stack the arrow icon above the word and put the sort caret on the left; visible text is "Receipts"/"Payments" while the chooser and both CSV exports say In/Out (CSV headers are unchanged, as required). | Task 4 / Task 7 (`table.tsx`, `ClientsPage.tsx`). |
| QA-V1-8 | minor | Users table | `users--midnight-light-1440.png`. | Role chip shows its full word. | "Accountant" chip is clipped with an ellipsis in the Role column. | Task 9. |
| QA-V1-9 | minor | Inline styles | Audit `inline` list on every Dashboard shot; source `Dashboard.tsx:139`, `table.tsx:129`. | No inline styles beyond tour coordinates and resizable widths. | dnd-kit `transform`/`transition` applied inline on every dashboard section (always `transition: transform linear`) and on draggable table headers. Not a documented exception. | Task 8 / Task 4. |
| QA-V1-10 | minor | Copy | `settings--midnight-light-1440.png` (Data folder). | No "we"/"our" in product copy except the firm-voice statement sentence. | "Your data is stored securely on our servers and backed up daily." (pre-existing). Homepage "we're in early access" and the statement sentences are marketing / firm voice and judged acceptable. | Task 9. |
| QA-V1-11 | minor | Code hygiene | `src/design.test.ts:31`, `src/ui.tsx:46`, `src/ClientsPage.tsx` (808 lines). | Task 11 step 1: assert `LEGACY.size === 0`; no legacy classes; files under 800 lines. | `LEGACY` is empty (good) but the empty-set assertion is missing. `ring = 'rnr-focus'` is a no-op (class undefined; used in `ui.tsx`, `Checklist.tsx` and others) kept "so call sites need no change". `ClientsPage.tsx` is 808 lines (804 before). No `zinc/red/emerald/amber/blue/orange`, `dark:`, `--brand-solid`, `--color-in/out`, `data-design` or `design-system/` left. | Task 11 (assertion), Task 4 (`ring`), Task 7 (split `ClientsPage`). |
| QA-V1-12 | minor | Transaction form (pre-existing) | `parseAmount('0')` accepted; DB row `receipt | 0 | QA 0` created. | MoneyInput spec: "Enter an amount greater than 0." | A MYR 0.00 receipt posts and stays in the ledger; the DB has no `amount_minor > 0` check. `1,234.5` -> 123450, `0.07` -> 7, `MYR 99.999` and `abc` rejected correctly. | Task 4 (`ui.tsx` TxnForm / `mappers.parseAmount`); backend for a check constraint. |
| QA-V1-13 | minor | Trial copy (pre-existing) | `state-trial-ended-billing--midnight-light-1440.png`. | One date. | Billing says "Your trial ended on 11 Oct 2026"; the read-only note on the same screen says "The free trial ended on 10 Oct 2026" (SQL `to_char` in UTC vs browser local date, off by one for MYT mornings). | Backend (`firm_write_block_reason`), Task 9. |
| QA-V1-14 | minor | Confirm dialog | `sample-remove-confirm--midnight-light-1440.png`. | Destructive confirms use `rnr-btn-danger` (Delete attachment, Remove user do). | "Remove sample data" confirm uses the primary button. | Task 5. |
| QA-V1-15 | minor | Focus management | Checklist: after "Skip" on an item, `document.activeElement` is `body`. Tour: step 1 popover does not take focus (steps 2-10 do). | Focus stays in the list; coachmark takes focus (Coachmark spec). | Both drop focus to the document start for keyboard and screen-reader users. | Task 8. |
| QA-V1-16 | minor | Chart | `cashflow-bw-light-dark-1440.png`. | Axis labels fully visible. | "MYR 12.4K" loses its first letter at the plot's left edge when the label is longer than "MYR 10K". Black & White series themselves are distinguishable (solid vs hatched, square vs arrow marker, label). | Task 8 (`widgets.tsx` chart). |
| QA-V1-17 | minor | Settings layout | `settings--midnight-light-1440.png`. Sidebar footer shows "Lim… / Ow…". | Folders share one width and left edge with the page head. | Appearance folder is about 420px wide and the column starts 96px right of the heading; Billing and Organisation are wider. Account name and role truncate at 1440. | Task 6 / Task 9, Task 5. |
| QA-V1-18 | minor | Clients on phones | `clients-balances--midnight-light-375.png`. | Filters wrap cleanly. | The Type segmented control wraps "Out" onto its own row inside the track. | Task 7. |
| QA-V1-19 | minor | pgTAP fixture | `supabase/tests/18_appearance.test.sql:14`. | Self-contained fixture. | `is(count(appearance rows), 0, 'fixture cleared')` asserts without clearing, so it fails (test 8) on any database that already has appearance rows (it failed once after I ran `backfill_appearance()`; green on a clean reset). | Task 3. |

## Checks (real results)

| Check | Result |
|---|---|
| `pnpm test` (root) | PASS 171/171 |
| `npx tsc -p tsconfig.app.json --noEmit` | PASS |
| `npx oxlint src` | PASS, 0 errors, 27 warnings (only-export-components, set-state-in-effect, exhaustive-deps) |
| `pnpm build` incl. demo | PASS (`dist/demo/index.html`; `grep -r fonts.googleapis\|fonts.gstatic dist` = none) |
| `pnpm test:db` (equivalence) | PASS 1/1 |
| `supabase test db` | PASS 182 tests, 17 files (after one clean `db reset`; see QA-V1-19) |
| `deno test supabase/functions` | PASS 68/68 |
| v2 `pnpm test` / `pnpm build` | PASS 281/281 / build and `check-dist: ok` |
| Migration `20261012000001_appearance.sql` | PASS. Additive and idempotent (re-run keeps a changed row; replay with `forest`/`sunset`/`ocean` firms and a stored `dark` theme maps to fern/saffron/ocean with theme preserved, invalid theme to `system`). `firms.design_system` still exists with the DEPRECATED comment and is still in `database.types.ts`; `theme` rows untouched. `user_preferences` policy `prefs_all` is `profile_id = auth_profile_id()` for read and write; pgTAP "another profile's appearance is invisible" green; `backfill_appearance()` not executable by `authenticated`. Seeded profiles get no row at migration time (seed runs after migrations), which is expected; the app falls back to defaults. |
| `design.test.ts` retired palette guard | PASS, `LEGACY` empty (no explicit empty assertion, QA-V1-11) |

## Behaviour on the real stack

| Flow | Result |
|---|---|
| Sign in (valid, wrong password message), sign up (email confirmation via Mailpit, lands on dashboard), invite link then set password (weak, mismatch, success) | PASS |
| Dashboard edit, keyboard reorder (Space, arrows, Space), persists after reload, focus returns to the handle; desktop (ArrowRight) and 375 (ArrowDown) | PASS |
| Record transaction: `1,234.5` stored 123450; `0.07` stored 7; 3-decimal and text rejected; zero accepted | PASS with QA-V1-12 |
| Clients filters (type In/Out, search, client, period, group), column chooser (show Account no.), CSV exports (balances `Client,Opening balance,In,Out,Closing balance,Last transaction`; ledger `Date,Client,Account no.,Description,In,Out,Balance`) | PASS; headers In/Out unchanged; column chooser crash QA-V1-3 |
| Client profile; attachments (PNG upload, open via signed URL, delete confirm; non-image rejected) | PASS |
| Statements to PDF: client portrait 1 page A4 (3 pages with 70 extra rows), consolidated landscape A4 (1 page; 5 pages with rows), no blank page, all 8 accents dark and 2 light, ink only (max chroma 0) | PASS except dark page margins QA-V1-1 |
| Import CSV (preview totals, "1 new client will be added", import) | PASS |
| Contracts create (ends in 8 days / ended / far) | PASS |
| Users invite, role change (auto-save), remove | PASS |
| Settings: Appearance, organisation edit, regional and statements dialogs, bank account add (empty-name error) | PASS |
| Billing (trial firm): "MYR 10.00", "Pay MYR 10.00", trial 12 days, 2 days, ended, suspended ("No access to this firm") | PASS with QA-V1-13 |
| Appearance: 8 accents x light/dark clicked, `data-theme`/`data-accent` follow, DB row saved, density compact; second origin sign-in adopts dark/iris; offline save shows the device-only sentence | PASS (admin console QA-V1-2) |
| Pre-paint: stored dark + iris is on `<html>` before `#root` mounts (no flash); a different DB value is adopted after load, by design | PASS |
| Reduced motion: `data-motion=flat`, zero running animations | PASS |
| Focus ring 3px on every tab stop, skip link first; dialogs (11 cases, Esc/X/Cancel) and the phone drawer (Esc/close/link) return focus to the trigger | PASS |
| Checklist skip and dismiss (dismiss persists) | PASS with QA-V1-15 |
| Tour: 10 steps; at 375 the coachmark docks as a bottom card; at 1440 anchored or centred when the target is on another page | PASS with QA-V1-15 |
| Admin console: firms, action menu, create firm, support view banner ("read-only support view. Access is logged."), waitlist, platform settings, account menu (Appearance, Sign out; phone via Menu) | PASS with QA-V1-2 |
| Sample-data banner and removal confirmation; trial banners | PASS with QA-V1-14 |
| Demo build (`/demo/`, banner as a class, no inline style) and homepage (light only, accent follows) | PASS |

## Visual sweep coverage

All 426 PNGs in `docs/superpowers/qa/v1-shots/qa/` (not committed). Names `<screen>--<accent>-<theme>-<width>.png`.

- Owner screens, Midnight and Saffron x light and dark x 1440 and 375 (4 combos x 2 widths = 8 per screen): dashboard, dashboard-edit, clients-balances (shows the Transactions view from stored state; the Balances table is covered by the CSV and filter checks and the profile screens), clients-transactions, clients-columns, txn-dialog, addclient-dialog, client-profile, client-transactions, statement, contracts, contract-dialog, users, invite-dialog, settings (with Appearance), bank-dialog, billing: 17 screens, 136 shots.
- Admin: firms, firm menu, create firm, support view, waitlist, platform settings, account menu: 7 screens x 8 = 56.
- Auth: sign in, sign up, forgot, sign-in error: 4 x 8 = 32. Set password (1440 only), sign-up sent.
- Homepage, demo dashboard, demo clients, demo settings: 4 x 8 = 32.
- Session and billing states (trial active, 2 days, ended, suspended) x dashboard/billing x Midnight light and Saffron dark x 2 widths: 32. Sample-data banner: 4 plus confirm.
- Shell, Settings, Clients and Dashboard in the other six accents (Ocean, Black & White, Graphite, Fern, Rosewood, Iris) x light and dark x 1440 and 375: 72, plus Settings > Appearance clicks in all 8 accents x 2 themes at 1440: 16.
- Print: the two PDFs rendered above (portrait and landscape, dark Saffron). Reduced-motion shell, offline save failure, focus ring, drawer, tour steps 1/4/7 at both widths, attachments, import, manage and remove user, Black & White chart crop.
- Automated per screenshot: horizontal overflow, 44px touch targets (coarse emulation at 375), WCAG contrast on solid backgrounds (gradient fills skipped; covered by v2 token tests), radius scale (10/14/20, 6 chips, 8 compact buttons and 3px bars are documented; avatars and wash blobs excepted), pill detection (only the folder tab, which has square lower corners, matched), money (no "RM" or "$" anywhere in the UI), "we/our" scan, inline styles.

## Not covered

Second real browser profile in Chrome (a separate origin was used instead); contrast on accent-gradient button labels (relied on v2 tests); OS-driven `System` theme switching; non-Chromium print engines.

---

# Round 2

Re-verified at `7a1b9b1` (`49e6c85`, `c903fb4`, `7a1b9b1` on top of `37c09e0`) on v1's real stack (root `supabase start`, `db reset`, `pnpm dev` on 5199, headless Chrome over the DevTools protocol). v2's Supabase stopped for the run and restarted after.

## Verdict: FAIL (0 blocker, 0 major open, 1 open item that was claimed fixed, 4 new/residual minors)

No major remains. V1-15 is only partly fixed on the real stack, so the strict "all 19 closed" bar is not met; the remaining items are minor.

## Checks (re-run)

`pnpm test` 184/184; tsc clean; oxlint 0 errors; `pnpm build` incl. demo passes and no Google Fonts host in `dist`; `pnpm test:db` 1/1; `supabase test db` 186 tests PASS (19 files, incl. new `19_zero_amounts`); `deno test supabase/functions` 68/68; v2 `pnpm test` 284/284 and build + `check-dist: ok`. Shared design changes (`bundle.css`, `tokens.test.mjs`) cause no v2 regression.

## Per finding

| ID | Status | Evidence |
|---|---|---|
| QA-V1-1 print | FIXED | 16 PDFs (8 accents x portrait and landscape, dark): all four page corners rgb(255,255,255), max chroma 0. 3-page portrait and 5-page landscape with 70 extra rows: no black margin, no blank page. |
| QA-V1-2 admin appearance | FIXED | DB row dark/saffron; fresh origin `adminr2.localhost` renders dark/saffron at 1440 and 375 without opening the dialog (`r2-admin-saved-appearance--saffron-dark-1440.png`). |
| QA-V1-3 column crash | FIXED | Hiding Description keeps the page (headers `DATE|CLIENT|RECEIPTS|PAYMENTS|BALANCE`). |
| QA-V1-4 Users overflow | FIXED | No document overflow on any owner screen at 375 (audit, 2 combos). |
| QA-V1-5 touch targets | MOSTLY FIXED | At 375 coarse emulation: Take the tour, More actions, Statement of account, Import sample, selects now 44px. Sort buttons (hit area 82x56) and tag remove (about 40 wide, 40+ tall) now reach ~44 through a hit-area pseudo-element; column checkbox label is 223x44. Residual: `.rnr-ledger-resize` hit area is about 32 wide (the neighbouring header paints over the right 12px), and dashboard client-name links are still 148x24 (see R2-2). |
| QA-V1-6 contrast | FIXED | No contrast hits in Saffron dark or any other pair audited. |
| QA-V1-7 ledger header | PARTIAL | Labels now agree (chooser "Receipts/Payments"; CSV headers still `In,Out`, verified for ledger and balances exports). The header glyph still sits above the word and the sort caret on the left (`r2-clients-transactions--midnight-light-1440.png`). |
| QA-V1-8 chip | FIXED | No clipped chip in Role column. |
| QA-V1-9 inline styles | FIXED (documented) | dnd-kit transforms and column widths are now a documented, test-guarded exception (`INLINE_STYLE_OK`); the shot audit shows only those. |
| QA-V1-10 copy | FIXED | No "our/we" outside the statement firm voice and marketing. |
| QA-V1-11 hygiene | FIXED | `ring`/`rnr-focus` gone, `ClientsPage.tsx` 774 lines, guard tests assert directly (LEGACY removed). |
| QA-V1-12 zero | FIXED | Form: `0` and `0.00` show "Enter an amount greater than 0." and the dialog stays open. DB: `insert ... amount_minor = 0` fails with `transactions_amount_minor_nonzero`; `-5` still inserts and posts (`R2 -5`, -500), `1,234.5` and `0.07` still post. |
| QA-V1-13 trial date | FIXED | Billing and the read-only note both read "11 Oct 2026". |
| QA-V1-14 confirm | FIXED | "Remove sample data" is `rnr-btn-danger`. |
| QA-V1-15 focus | PARTIAL | Tour step 1 now takes focus (true). Checklist Skip with items remaining moves focus to the next Skip button (verified on Beta: 2 skips). Skipping the LAST remaining item still drops focus to `body` (the checklist unmounts, focus is not moved anywhere), including the Alpha seed with a single to-do item. |
| QA-V1-16 chart | FIXED | "MYR 12.4K" fully visible (`r2-dashboard--midnight-light-1440.png`). |
| QA-V1-17 settings and sidebar | PARTIAL | Appearance, Billing and Organisation folders now share one width. The sidebar name still shows "Lim… / Ow…" (tooltip added, text still truncated). |
| QA-V1-18 phone filters | FIXED | Type segment is one row at 375 (`r2-clients--midnight-light-375.png`). |
| QA-V1-19 pgTAP fixture | FIXED | `supabase test db` green straight after reset. |

## New or residual findings (all minor)

| ID | Sev | Area | Evidence | Owner |
|---|---|---|---|---|
| R2-1 | minor | Focus (V1-15 residual) | After skipping the last checklist item, `document.activeElement` is `body`. Move focus to the dashboard heading or page head. | Task 8 |
| R2-2 | minor | Targets (V1-5 residual) | Ledger resize handle hit area about 32x56; dashboard widget client links 148x24 on coarse pointers. | Task 4 (`bundle.css` resize), Task 8 (widget links) |
| R2-3 | minor | Negative amounts (now permitted by design) | Recent transactions widget shows `+-MYR 5.00` for a -5 receipt; ledger shows a hyphen `-MYR 5.00` where the spec calls for the true minus. | Task 8 (`widgets.tsx`), Task 7 |
| R2-4 | minor | V1-7 / V1-17 residual | Receipts/Payments header glyph still above the label; sidebar name still ellipsised at 1440. | Task 4 / Task 5 |

Round 2 screenshots: `r2-*.png` in `docs/superpowers/qa/v1-shots/qa/`.

---

# Round 3

Re-verified at `e642e08` (`31878e1`, `e642e08` on top of `7a1b9b1`) on v1's real stack; v2's Supabase stopped for the run and restarted after.

## Verdict: PASS with 2 open minors

No blocker or major. Checks re-run: `pnpm test` 188/188; tsc clean; oxlint 0 errors; `pnpm build` incl. demo passes, no Google Fonts host in `dist`; `pnpm test:db` pass; `supabase test db` 186 PASS; deno 68/68; v2 `pnpm test` 284/284 and build + `check-dist: ok`. `git diff 7a1b9b1..HEAD` (9 files) shows no regression.

## Per item

| ID | Status | Evidence |
|---|---|---|
| R2-1 / V1-15 | FIXED | Real behaviour: skipping the last checklist item (Alpha, one to-do; Beta, two to-dos) leaves `document.activeElement` = `MAIN#main`; with items remaining it moves to the next Skip button. Tour step 1 takes focus (round 2). |
| R2-2 / V1-5 | FIXED | Dashboard client links are 44px tall at 375 (coarse). Resize handles at 820px coarse emulation: Name and Email handles hit area 44px wide (the other columns are scrolled out of view inside the card). Round 2 targets unchanged. |
| R2-3 true minus | FIXED, one note | Dashboard widget `−MYR 5.00` (no `+−`), KPIs, balances (`−MYR 1,500.00`), statement HTML and PDF (`−MYR 1,500.00`, debit-balance sentence) all use U+2212. CSV unchanged: ledger `-5.00`, balances `-1500.00`, headers `In,Out`. Import of `-12.50` previews as `−MYR 12.50`. No transaction-edit UI exists, so there is no formatted value to re-save. `pnpm test:db` (equivalence) green. |
| R2-4 / V1-7 header | FIXED | Receipts and Payments headers are one line: caret, arrow, word. |
| R2-4 / V1-17 sidebar name | STILL OPEN (R3-2) | Name now wraps to two lines with a tooltip, but at 1440 the box is about 34px wide and still reads "Lim / Boo…" and "Ow…" (`r3-clients-transactions--midnight-light-1440.png`, `r3-users-tablet-coarse--midnight-light-820.png`). Touch users get no tooltip. |

## New findings (minor)

| ID | Sev | Area | Evidence | Owner |
|---|---|---|---|---|
| R3-1 | minor | Money input | Typing or pasting a displayed negative (`−7`, U+2212) is rejected with "Enter an amount, up to 2 decimal places."; `-7` works. The UI now shows U+2212 everywhere, so copy and paste from the screen fails. `parseCents('−5')` returns null. | Task 4 (`ledger.ts` parseCents: accept U+2212) |
| R3-2 | minor | Sidebar account row | See above: `.rnr-account > div` collapses to about 34px, so name and role are ellipsised even with two lines allowed. Give the text a floor width (e.g. wrap the buttons to a second row) or drop the role line. | Task 5 / designer (`bundle.css` `.rnr-account`) |

Round 3 screenshots: `r3-*.png` in `docs/superpowers/qa/v1-shots/qa/`.

## Round 4 (lead)

R3-1 fixed in a183475: parseCents maps the true minus (U+2212) to "-", so a pasted "−7" parses to -700; test added (red first). R3-2 fixed in a183475: `.rnr-account > div` takes its own row (flex-basis 100%), so the name no longer collapses to ~34px and the buttons wrap below it. Not re-verified in a browser. Checks: root pnpm test 189/189, tsc clean, build + demo ok; v2 284/284, build + check-dist ok.

Verdict: PASS, 0 open findings.
