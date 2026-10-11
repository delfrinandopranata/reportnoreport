# Phase 7 (Paper that moves, landing, go-live prep) QA, round 1

Verdict: **FAIL** (1 major, 9 minor, 3 notes). Scope: `docs/superpowers/plans/2026-10-12-phase-7-identity-and-launch.md` Task 12, against `git diff 5b9347f..HEAD -- v2 .github` at HEAD 63ab4f2. Screenshots (not committed) are under `docs/superpowers/qa/phase-7-shots/qa/`.

## Checks run

| Check | Result |
|---|---|
| `pnpm lint` (oxlint src) | exit 0, clean |
| `pnpm test` | 277 pass, 0 fail (tokens, appearance, nav, steps, loop, programmes, check-dist, deploy-config included) |
| `pnpm build` (tsc, vite, `check-dist`) | ok, `check-dist: ok`. No `[TBD price]` left, so it builds. Chunk-size warning only (app chunk 1,127 kB). Font-host rule passes: the built pages request only same-origin fonts (Network: 1 host) |
| `DENO_NO_PACKAGE_JSON=1 deno test --allow-read supabase/functions` | 243 passed, 0 failed, 14 ignored (the env-gated ones) |
| Env-gated (`advance/race` 2, `send-messages/race` 1, `send-campaigns/db` 7, `resend-webhook/db` 1, `run-report/visibility` 2, `_integration/realtime` 1) | 14 passed, 0 failed |
| `supabase test db` | 12 files, 262 tests, PASS |
| `node --test scripts/deploy-config.test.mjs` | 3 pass |

`supabase db reset` was run first; `functions serve --env-file` started on the second attempt (the first hit "container is marked for removal" right after the reset).

## Findings

| ID | Severity | Area | Evidence | Expected | Actual | Owner |
|---|---|---|---|---|---|---|
| QA-P7-1 | **Major** | frontend | `form-fill/midnight-light-375.jpg`, `start/midnight-light-375.jpg`. Measured at 375px: card 16–359, input 36–373. | Fields stay inside the folder card; step labels fit. | The step bar's min-content widens the grid column (`div.grid` client width 303, form 337). Every field overflows the card's right edge by 14px and sits against the screen edge, and "Expenses" touches the card edge. Page-level scroll is absent, so the automated check passes. Affects the start-a-record and form-fill flows on phones. | Frontend |
| QA-P7-2 | Minor | frontend, design | Audit over all 30 screens at 375. | 44px targets on coarse pointers (plan Global Constraints). | 36px: every `rnr-btn-sm` (Open, Edit, Delete in lists), Map/List toggle, segmented options (All, System, Send now, A role), "Report settings" tab (32px). 24px: `summary` rows (Show answers, submission rows). 20px: wordmark link in every phone bar, landing and site footer links (Privacy policy, Terms and conditions, How it works, Pricing, Sign in). | Frontend |
| QA-P7-3 | Minor | frontend | `inbox/midnight-light-1440.jpg`; at 900px tall `nav[aria-label=Main]` scrollHeight 594 vs clientHeight 572. | The last nav row is fully visible at a common laptop height. | Owner/admin see 11 rows; Messages is cut in half at 1440x900 behind a scroll area with no cue. Fine at 1100px tall. | Frontend |
| QA-P7-4 | Minor | frontend | `src/App.tsx:102` uses `page-title`; the alias is kept in `design/components/bundle.css:32-33`. | The legacy `page-title` alias is gone (plan Review: leftover legacy classes). | The "Your organisations did not load" screen still uses the alias. Remove both. | Frontend |
| QA-P7-5 | Minor | frontend | `public/consent.js:29` (banner on every public page and the app sign-in; `flows/cookie-banner-*-375.jpg`); `index.html:247` "Talk to us". | No "we" or "us" outside the legal pages (QA-P5-9); no inline styles. | Banner copy starts "We use anonymous, cookie-free analytics" and is built with `style=` and `style.cssText`. Pricing button reads "Talk to us". Banner is otherwise restyled (14px radius, 44px buttons, Hanken). | Frontend |
| QA-P7-6 | Minor | design | `site-landing/midnight-light-1440.jpg` (programme showcase, Mentorship). | Edge labels never collide with step text. | "good fit" and "waitlist" overlap the "Mentor matching" card title. | Design |
| QA-P7-7 | Minor | design | `.rnr-chip` 26px high with 10px radius; landing `span.rnr-chip.sl-tick` 22px high, 10px radius (flagged by the audit, `site-landing/*-1440.jpg`). | "No pills anywhere: chips" (owner). | The spec'd 10px control radius on a 22 to 26px chip reads as a near-pill. Needs a design ruling (smaller chip radius or taller chip). Folder tabs (20px, top corners only) and every control, card and panel are correct. | Design |
| QA-P7-8 | Minor | frontend | `node t12`: ⌘K "camp" then Enter went to `#/campaigns`; `document.activeElement` stayed on the "Go to a page" button. | After a jump, focus lands on the new page heading as navigation does elsewhere (Phases 3–6). | Focus remains on the trigger. Escape returns focus to the trigger correctly. | Frontend |
| QA-P7-9 | Minor | frontend, devops | `src` has no forgot, reset or set-password flow; `docs/go-live.md` steps 3 and 7 add `...?flow=set-password` redirect URLs that nothing uses. | The plan's sweep lists reset-password and set-password screens; redirect URLs match real routes. | Those screens do not exist (not shot). A user who forgets a password cannot recover at launch. The extra redirect URLs are harmless. Owner decision: build before go-live or accept. | Frontend, owner |
| QA-P7-10 | Minor | frontend | `workflow-edit/midnight-light-1440.jpg`. | Map view fits the whole graph. | The final "Approved" end node is cut at the canvas right edge on first load at 1440. | Frontend |
| QA-P7-11 | Note | design | `index.html:219-220`, commit 63ab4f2 (by the implementer). | Plan item 13: prices are not invented; the owner supplies them. | "from USD 199 / month" and "USD 166 / month billed yearly" are in the page and `go-live.md` step 0 still tells the owner to fill them in. Confirm the owner approved these figures. ISO code, no "$" anywhere. | Owner |
| QA-P7-12 | Note | design | `design/tokens.css` `--r-control-sm: 8px`, `--r-track: 12px` in compact density. | 10px controls. | Compact density uses 8px controls and 12px segmented tracks. Default density is exact (10/14/20). | Design |
| QA-P7-13 | Note | frontend | `t10`: second cookie jar. | Appearance follows the person. | It does (first paint shows Midnight light, then flips to the saved Iris dark once the session loads, one time per jar). A live OS reduced-motion change is applied on reload, not live. No fault on the same jar. | none |

## Owner requirements

| Requirement | Result |
|---|---|
| No Inter/Figtree in the app UI; no flat #3468E7 | PASS. Fonts measured on every screen: Fraunces, Hanken Grotesk, IBM Plex Mono. Inter appears only on the PDF template preview (workflow-report), by decision. No `3468e7` anywhere in `src`, `design`, site pages or `public`. Primary buttons are accent gradients. |
| Corners: 10 controls, 14 cards, 20 panels, circles only for avatars; no pills | PASS with QA-P7-7 and QA-P7-12. Audited radii on buttons, inputs, cards, papers; no pill nav row, step, input or button. `border-radius:50%` only on dots, radios and spinners. `corner-shape: squircle` under `@supports` in `bundle.css`. |
| 8 accents × light/dark, in Settings → Appearance, saved per user, no flash | PASS. Clicked Iris + Dark: `user_metadata.appearance` = `{accent:iris, theme:dark, density:comfortable}` on the server; after reload the pre-React (DOMContentLoaded) attributes already read dark/iris; garbage in storage falls back to light/midnight; System follows an emulated OS change (light to dark live and on reload). All 16 accent×theme combinations on shell and Settings: 0 text-contrast failures, 32 screenshots. |
| Folder-tab labels never clip | PASS. No tab flagged by the clip audit, including "COMPLETION TRACKING", "REPORT SETTINGS", "LEAVE REQUEST", "SETTINGS · APPEARANCE", at both widths. |
| Landing wash not under text; smooth; stops under reduced motion | PASS. `.rnr-wash` is `z-index:-1`; no wash over the hero copy in any shot. Motion runs in one rAF loop and moves only `translate3d`, opacity and SVG attributes. Under emulated reduced motion: 0 running animations, 0 changing wash transforms, 0 hidden elements; `?motion=off` identical. With motion on: 3 animations, wash moving. |
| Showcase keyboard-accessible with a text alternative | PASS. `role=tablist`, roving tabindex, Arrow, Home, End and wrap work; the panel is focusable, labelled by its tab, and carries an 11-item ordered list of steps plus counts. |
| Pricing in ISO codes, no "$" | PASS (see QA-P7-11 for sign-off). |

## Review Focus

| # | Item | Result |
|---|---|---|
| 1 | Every accent meets contrast, both themes | PASS: the 16-combination test passes; measured shell and Settings: 0 failures |
| 2 | CSS equals the JSON | PASS: tokens tests pass |
| 3 | No flash, no mismatch | PASS (above) |
| 4 | Stored appearance untrusted | PASS (garbage shot) |
| 5 | No runtime font host | PASS: `check-dist` passes; one request host on the preview |
| 6 | Navigation unchanged per permission set | PASS: nav tests; member sees Work and Members only |
| 7 | Form steps named | PASS: "Step 1 / Dates / Expenses" (QA-P7-1 for layout) |
| 8 | Landing still when it should be | PASS: loop tests; reduced-motion and motion-off checked live |
| 9 | v2 deploys cannot touch v1 | PASS (see Deploy) |
| 10 | Every screen, every combination | PARTIAL: see Screenshots |

## Behaviour regressions (Midnight light, owner, admin, member)

PASS: member started a leave record through the 3-step form (name, dates, signature) three times; admin claimed and approved one and rejected one (stamped Rejected on the record page); the approved record moved on to Done and a PDF was made and shows Open, Download and Generate new; report "All leave requests" downloads a CSV (BOM, 3 rows, correct columns); campaign "Term starts": review dialog (Esc returned focus to Send now, focus entered the dialog on Cancel), Send now moved it to Sending with a notice; drawer opens with focus inside and Esc returns focus to Menu; ⌘K opens with focus in the field, filters ("rep" gives Reports), Esc returns focus; canvas node moved from 240px to 272px with arrow keys (a leave guard then blocked navigation, as designed); dashboard "Move down" announces "Moved Leave days taken to position 2 of 2" and keeps focus on the options button; the form-builder uses up/down buttons per field; unsubscribe confirm, done, already, and invalid states render with no console error (400 for a bad token is the page's invalid state). No console errors on any of the 30 app screens.

## Landing performance

Lighthouse was not run (`npx lighthouse` would download; not approved). PerformanceObserver in headless Chrome on `vite preview` of the production build, mobile 375x812, 4x CPU, Slow 4G (150 ms, 1.6 Mbit), cache off:

| Run | FCP | LCP (before first scroll, hero h1) | CLS |
|---|---|---|---|
| Mobile throttled (2 runs) | 668 / 724 ms | 668 / 724 ms | 0.0020 |
| Mobile unthrottled | 64 ms | 64 ms | 0.00006 |
| Desktop 1440 (2 runs) | 172 / 88 ms | 172 / 88 ms | 0.0027 |
| Desktop `?motion=off` | 80 ms | 80 ms | 0.0011 |

Page weight: 371 kB over 9 requests uncached, one origin. Pass: LCP < 2.5 s and CLS < 0.05. TBT, the Performance score and the Accessibility score were not measured. Automated contrast, landmark and heading checks found no failure on the landing and site pages.

## Deploy prep

- `deploy-v2.yml`: runs CI v2 first (`workflow_call` added, `push: main` removed from `ci-v2.yml`, so it does not run twice); uses only `SUPABASE_V2_*`, `V2_*`, `VERCEL_V2_PROJECT_ID` plus shared `VERCEL_TOKEN`/`VERCEL_ORG_ID`; environment `production-v2`; own concurrency group; sets `APP_URL=https://reportnoreport.com/app/`; secrets go through a 0600 temp file, not the command line. Functions `resume`, `send-messages`, `render-pdfs`, `send-campaigns`, `resend-webhook`, `unsubscribe` are `verify_jwt = false` in `config.toml`, `run-report` true, matching how each is called. Correct.
- `deploy.yml` (v1): `paths-ignore` for `v2/**` and both v2 workflow files; ledger `APP_URL` and environment URL; deploys once on the #45 merge as documented (the file itself changes). The Supabase CLI is now pinned to 2.120.0 (was `latest`); matches the installed CLI.
- `go-live.md`: order is sound (ledger live before the merge, v2 backend, merge, Vault secrets, smoke test on the `*.vercel.app` address, domain move, verify, rollback). See QA-P7-9 for the unused `flow=set-password` URLs.
- Secret scan of the tree and diff (Supabase, Resend, Stripe, Vercel, AWS, JWT, PEM patterns): no secret values; only the `sk_test_...` style placeholders in old docs. `.env.example` files hold names only.

## Code review of the diff

354 files. No file over 800 lines except generated `database.types.ts` (851); next largest `CampaignEditor.tsx` 381. No `TODO`, `console.log` or `debugger` added. No raw palette classes or hex outside `SignaturePad.tsx` (canvas black on white, intended) and the PDF preview (literal on purpose, commented). Inline `style` only in `Skeleton` (size), dnd-kit transforms (`FieldList`, `DashboardPage`) and runtime animation values in `landing.ts`/`showcase.ts` (opacity and CSS variables). No `shortcut:` notes were added in the diff, so none to check. Legacy: the `page-title` alias (QA-P7-4); no `rnr-glass`, `neu`, `Cover`, `wf-` styling or `preset` classes remain (the `wf-` hits are element ids). British English and sentence case hold across `src` (no "organization", "color" or "center" in copy).

## Screenshots

330 taken. Matrix: all 30 app screens × Midnight and Saffron × light and dark × 1440 and 375 (240); landing, privacy, terms, 404, unsubscribe, landing `?motion=off` at Midnight light, Saffron light, Midnight dark × 1440 and 375 (36); unsubscribe confirm/done/invalid × light/dark × 2 widths (12); all 8 accents × light and dark on inbox and Settings at 1440 (32); shell (jump bar, notifications menu, organisation switcher, phone bar, drawer), PDF panel, campaign review dialogs, cookie banner (10). Needed about 360.

Not taken: sign-in and sign-up (signed-out) and create-organisation in light/dark combinations other than `new-org`; reset and set password (screens do not exist, QA-P7-9); landing and the other site pages in Saffron dark (landing is light-only by design; dark shots show it stays light); member shell (reduced nav); invite form; role editor; form builder phone palette sheet; form fill validation error, signature and file states; workflow List view; dashboard edit mode; campaign report with chart and recipient table (the one campaign sent has no delivery data without the cron); approved record with stamp in all 8 combos is covered by `record-approved`. Report builder and campaign screens are covered at the matrix level only.

## Test data left behind

Local DB holds three leave records (Pending, Approved with PDF, Rejected), two reports, four campaigns and an opt-out row. `supabase db reset` clears it. `supabase functions serve` and `vite preview` (port 4200) are still running.

## Result

**FAIL.** Fix QA-P7-1 (Major); the minors can ride along with it.

---

# Round 2 (recheck of ac33155, 8d6f163, 28b87a0 at HEAD)

Verdict: **PASS** (0 blocker, 0 major; 1 new minor, 3 notes). Screenshots: `phase-7-shots/qa-r2/` (round 1 stays in `qa/`).

## Checks re-run

| Check | Result |
|---|---|
| `pnpm lint` | exit 0 |
| `pnpm test` | 280 pass, 0 fail (3 more: password, layout, alias guard) |
| `pnpm build` + `check-dist` | ok |
| deno, `--allow-read` | 243 passed, 0 failed, 14 ignored |
| Env-gated Edge tests | 14 passed, 0 failed |
| `supabase test db` | 12 files, 262 tests, PASS on a freshly reset database. It fails (8 tests in 4 files) if the seed was changed by hand, which was my own leftover test data, not a defect. |
| `node --test scripts/deploy-config.test.mjs` | 3 pass |

## Round 1 findings

| ID | Status | Evidence |
|---|---|---|
| QA-P7-1 | Fixed (one residual, QA-P7-14) | At 375px input right edge 339, card right edge 359 on form fill and start (`verify-fill-375.jpg`). No page scroll. |
| QA-P7-2 | Fixed, residual noted | 375px campaigns: 0 targets under 44px high. Public pages: wordmark and footer links 44px high. Left: "Report settings" tab 32px at 375px; footer "Pricing" and "Sign in" are 42 and 40px wide (44 high). |
| QA-P7-3 | Fixed | At 1440x900 nav scrollHeight equals clientHeight (566) and the last row ends at the nav bottom (`verify-nav-900.jpg`). |
| QA-P7-4 | Fixed | `App.tsx` uses `rnr-page-title`; no `page-title` alias left in `src` or `design`; the guard test passes. |
| QA-P7-5 | Fixed | The banner reads "This site uses cookies for analytics. Choose whether to allow them."; no `style=` strings (a `<style>` block carries the rules); pricing button reads "Contact sales". |
| QA-P7-6 | Fixed | Mentorship showcase: "good fit" sits beside its edge and no longer overlaps "Mentor matching" (`site-landing-motionoff/midnight-light-1440.jpg`). The "waitlist" label touches the Approved stamp (QA-P7-15, note). |
| QA-P7-7 | Fixed | `.rnr-chip` is now 6px radius on 26px; the audit finds no pill on any screen, including the landing chip. |
| QA-P7-8 | Fixed | ⌘K then Enter on "camp": `#/campaigns`, focus on the h1 "Campaigns". |
| QA-P7-9 | Fixed | See the password flow below. Redirect URLs now match a real route. |
| QA-P7-10 | Accepted | The Map opening at 0.55 and panned to Start with the end reachable is the QA-P3-4 contract (round 3 of Phase 3 passed it). The cut-off end node is the same behaviour. |
| QA-P7-11 | Open (owner) | Prices unchanged; the owner still has to confirm USD 199 and 166. |
| QA-P7-12 | Open (note) | Compact density radius unchanged. |
| QA-P7-13 | Accepted | The sign-in page cannot know whose appearance to show; after sign-in the saved choice is applied with no further flash, and a same-jar reload shows no flash. |

## Password flow (local Supabase restarted, Mailpit at 54324, app on 5173 as in config.toml)

PASS end to end. Sign-in shows "Forgot password?". Entering `member@alpha.test` gives "Check your email … If member@alpha.test has an account …" (same wording for any address). Mailpit received "Reset your password" with a `/auth/v1/verify?type=recovery&redirect_to=…?flow=set-password` link. Opening it lands on "Set a new password" with a `main` landmark, h1, and focus in the password field. A 5-character password shows "Enter at least 8 characters." and focuses the password; a mismatch shows "The two passwords do not match." and focuses the confirmation. A valid pair signs in to `#/inbox`. The new password signs in (200) and the old one is refused (400). Opening the same link again shows "This link has expired … Ask for a new one" with Back to sign in. Password restored to `password123` afterwards. The reset link only works on the origin listed in `additional_redirect_urls` (5173 and the production domain), as the README port says.

## New findings

| ID | Severity | Area | Evidence | Expected | Actual | Owner |
|---|---|---|---|---|---|---|
| QA-P7-14 | Minor | frontend | `verify-fill-375.jpg`; `ol.rnr-steps` overflow-x auto, scrollWidth 337 vs clientWidth 303 | Three step labels fit at 375px, or scrolling is visible | "Expenses" shows as "Expen" with no scroll cue (the bar scrolls inside the card) | Frontend |
| QA-P7-15 | Note | design | showcase Mentorship, motion off | Stamps and edge labels clear | "waitlist" touches the Approved stamp beside it | Design |
| QA-P7-16 | Note | frontend | "Report settings" tab 32px high at 375; footer links 40 to 42px wide | 44px targets | Residual from QA-P7-2 | Frontend |

## Regression review (`git diff 63ab4f2..HEAD -- v2`, 27 files)

No regressions found. Re-ran the full matrix of 30 app screens × Midnight and Saffron × light and dark × 1440 and 375 (240 shots, `results` audited): 0 horizontal scroll, 0 console errors, 0 pills, fonts unchanged (Inter only in the PDF preview), no touch-target failures beyond QA-P7-16. The two contrast hits on "Count records", "Add column" and "Add filter" are the same transition artefact as round 1; measured settled they are 9:1 or better (light) and 8:1 (dark). The site pages (landing, motion off, privacy, terms, 404, unsubscribe) audited at 3 combinations and 2 widths: no contrast failure, no horizontal scroll, one expected 400 for a fake unsubscribe token. Landing performance not re-measured; the diff touches CSS and `showcase.ts` layout only.

## Screenshot coverage

394 taken in `qa-r2/` (240 app matrix; 36 site; 32 accents were kept from round 1; 116 for the missing states). Added states, each Midnight and Saffron × light and dark × 1440 and 375: sign-in, sign-up, forgot password, expired reset link, set password (signed in), member shell, members invite form, role editor, form fill validation, fill step 2, fill step 3 with signature, workflow List view, dashboard edit mode, campaign report with chart and recipient table (seeded 40-recipient sent campaign), and the builder phone palette sheet (375 only). Round 1 plus round 2 cover everything the plan lists. Still not taken: the file-upload field filled in (the seed form has none on screen), and the 8 accents for the new auth screens.

Test data left behind: three leave records, two reports, five campaigns with 40 messages. `supabase db reset` clears it. Vite is also running on 5173 and 5179; `functions serve` is running.

## Result

**PASS.** Phase 7 passes round 2. QA-P7-11 needs the owner's price sign-off before go-live.
