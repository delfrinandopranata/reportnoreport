# Ledger table

The client-money ledger: dated rows, a receipts column, a payments column and a **running balance**. `rnr-table-card rnr-wide` > `table.rnr-ledger`; reuses `rnr-th-sort`, `rnr-status`, `rnr-kind`, `rnr-pager`. Also serves the balances view (client, funds held, last activity) and the read-only support view.

## Anatomy
Sticky header (micro mono caps, `--ink-3` on `--surface`), then rows at `--row-pad`. Amount columns are `th.num` / `td.num`: right-aligned, IBM Plex Mono, tabular. Receipts have `data-series="in"`, payments `data-series="out"`: a 3px edge mark on the cell, **solid** for money in and **hatched** for money out, so the two read apart in greyscale. The balance column is `td.bal` (600 weight). An opening-balance row is `tr[data-open]`; a date group is `tr.rnr-ledger-day` with one `th colspan`. `tfoot` holds period totals and the closing balance. `.rnr-ledger-resize` is a button at the right edge of a `th[data-resizable]`.

## Money rules
ISO code, minor units, never a symbol: "MYR 1,234.50". Negative uses the true minus "−" (U+2212), never a hyphen: "−MYR 120.00". A negative balance is `td[data-neg]` (`--down`) and always carries the minus sign; colour is an addition. Empty amount cells render "–" (`td:empty`).

## In / out semantics
Direction is never colour alone: the column header carries an arrow icon and the words "Receipts" / "Payments" (`th[data-series]`); a Kind column or `rnr-amt-dir` ("Receipt" with arrow-down-left, "Payment" with arrow-up-right) gives each row an icon and a word. Receipts use `--series-1`, payments `--ink-3` (`--series-2`) with the hatch. In Black & White both are ink and still differ by hatch, icon and word.

## States
rest · hover (row wash, hover devices only) · selected (`aria-selected`, `--tint`) · sorted (`aria-sort` on the `th`, the sort icon at full strength) · resizing (`data-active` on the handle) · loading (skeleton rows) · empty (`rnr-empty` in the card).

## Sizes and density
Minimum width 44rem; the card scrolls inside itself, never the page. Below 640px the first column sticks. Compact density tightens `--row-pad`. Handles are 12px wide, 24px on coarse pointers.

## Do
Give the table a `caption`. Put sort on a `button.rnr-th-sort` inside the `th` and set `aria-sort` on the `th`. Make the resize handle a real button with `aria-label="Resize Amount column"` and arrow-key support. Show the closing balance in `tfoot`.

## Don't
Don't use a symbol or "RM". Don't show money in/out by colour or sign alone. Don't write `flex` on a `td`. Don't scroll the page horizontally.

## Accessibility
`scope` on headers, `aria-sort` on the sorted column, header contrast ≥ 4.5:1, resize handle focus ring inset, 44px rows on coarse pointers.

## Copy
Headers: "Date", "Description", "Receipts", "Payments", "Balance". Empty: "No transactions in this period." plus "Record a transaction".
