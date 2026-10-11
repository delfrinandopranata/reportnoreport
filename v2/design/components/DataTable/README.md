# DataTable

The customisable ledger / roster / report table: show-hide and reorder columns, drag column edges to resize, Comfortable or Compact rows, remembered per browser.

Hand-written from `src/table.tsx`, `src/ClientsPage.tsx` and `src/users/UsersPage.tsx`.

## Rules
- Cells: `space-4` inline padding; block padding `row-comfortable` (10px) or `row-compact` (6px) via `data-density`.
- Header: 12/500 `ink-muted`, `line-200` rule; body rows `line-100` rules, hover `surface-200`.
- Numbers right-aligned, tabular, ISO currency ("MYR 1,234.50"); negatives with a true minus "−".
- Column chooser and density toggle live in a ghost-button toolbar above; export CSV and print (A4 landscape) sit beside them.
- Mobile: below `sm` the table scrolls inside its card with the first column sticky; never squeeze columns under 96px.
