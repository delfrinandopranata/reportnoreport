# Admin table

Dense, scannable rows for the super-admin console: firms, waitlist. `rnr-table-card` > `.rnr-admin-bar` + `table.rnr-table.rnr-admin-table`.

## Anatomy
Toolbar `.rnr-admin-bar` (search `rnr-input`, filter segments, a count `rnr-caption` pushed right). Compact rows: `--row-pad` is 8px even in comfortable density. First cell `td.rnr-admin-id` stacks the name (`strong`) over a mono identifier or email. Status is `rnr-status` (word + icon). Money and counts are `.num`. The last cell `td.rnr-admin-act` holds a `.rnr-menu-anchor` with an icon button (`dots-three`, `aria-label="Actions for Lim & Partners"`) opening an `rnr-menu`.

## States
rest · hover · focus-visible · selected · muted (`tr[data-muted]`: suspended, archived; text `--ink-3` but the status word says so) · loading · empty · error. Sorting as DataTable.

## Do
One action menu per row; destructive items last, in danger tone, with a confirmation dialog. Keep the identifier selectable. Wrap long names.

## Don't
Don't truncate names. Don't put more than one button per row (use the menu). Don't signal muted rows by colour alone: the status word carries it.

## Accessibility
As DataTable: `scope`, `caption`, `aria-sort`; menu button has `aria-haspopup="menu"` and `aria-expanded`; Esc closes and returns focus to the button.

## Copy
Status words: "Active", "Trial", "Suspended", "Archived". Empty: "No firms match" / "Nobody is on the waitlist yet."
