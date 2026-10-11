# Statement paper (A4)

The client statement and the consolidated statement as a printable document. `div.rnr-statement-frame` (screen only) > `article.rnr-statement`. Also `rnr-no-print` for anything that must not reach the page.

## Ink on white, always
The sheet reads `--sheet-*` (paper `#FFFFFF`, ink `#111111`, rule `#8C8C8C`, overdrawn `#9B1C1C`), declared in `tokens.css` and **not** keyed to theme or accent: dark mode and all eight accents print identically, and what you see is what the printer gets. It takes no accent colour. Text is Hanken Grotesk, figures Plex Mono with tabular numbers. The frame around it is the only themed part (`--soft`, panel radius 20) and scrolls sideways on narrow screens.

## Anatomy
`.rnr-statement-head` (firm logo `.rnr-statement-logo`, title, period) · `dl.rnr-statement-meta` (client, reference, currency, generated on) · `dl.rnr-statement-summary` (opening, receipts, payments, closing; four cells) · the ledger `table` (`th.num` / `td.num` mono, right-aligned; `tfoot` totals) · `.rnr-statement-foot` (page note, firm address). Money: ISO code, true minus, `td[data-neg]` in `--sheet-down` plus the minus sign; in and out are told apart by column headers ("Receipts" / "Payments") and signs, never colour.

## Sizes
210 × 297 mm, 16mm × 15mm padding. `data-orientation="landscape"` gives 297 × 210 mm for wide ledgers. Fixed width, so the frame scrolls rather than reflows.

## Print
`@media print`: frame and shadow vanish, the sheet fills the printable area (`@page { size: A4; margin: 14mm }`), the header row repeats on every page (`display: table-header-group`), rows and the summary never split, backgrounds print (`print-color-adjust: exact`), and `.rnr-no-print` is hidden. The app hides its own chrome (sidebar, bars) with `.rnr-no-print`, and sets landscape by swapping `data-orientation` and its own `@page` rule if it needs one.

## Do
Show a "Print / Save PDF" `rnr-btn-primary` above the sheet with `rnr-no-print`. Keep the firm logo `alt` as the firm name. Keep dates through `formatDate()`.

## Don't
Don't apply the accent, `--ink-*` or theme tokens inside the sheet. Don't animate. Don't put interactive controls on the sheet.

## Accessibility
`article` with an accessible name, real `table` with `caption` and `scope`, `dl` for the summary. Sheet text ≥ 4.5:1 on white (enforced in `tokens.test.mjs`).

## Copy
Title "Client statement" or "Consolidated statement"; "Opening balance", "Closing balance"; "Generated on 12 October 2026".
