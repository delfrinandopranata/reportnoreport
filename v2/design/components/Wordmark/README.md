# Wordmark

The product name set in type — there is no drawn logo file in the repository.

Recreated from the landing page header and hero in `index.html` (the favicon in `public/` is Vite's default, not a brand mark).

## Rules
- Lockup: a 40px `radius-lg` tile in `brand-solid` with a bold 14px "R" in `brand-solid-ink`, 12px gap, then "Report**No**Report" in the `wordmark` style with "No" in `ink-faint`.
- Screen readers get `aria-label="ReportNoReport"`.
- The hero joke "Report without repo~~r~~t." uses `rnr-strike`: a `danger` bar drawn in over 500ms after a 450ms delay (static in flat motion).
