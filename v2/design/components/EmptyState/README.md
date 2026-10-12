# Empty state

`rnr-empty`: a dashed card with an icon tile, a Newsreader heading, one sentence and one action.

## Four kinds (each its own copy)
| Kind | Heading | Body | Action |
|---|---|---|---|
| First run | "No forms yet" | what to do first | primary: "New form" |
| No results | "No records match" | check spelling or search another way | secondary: "Clear search" |
| Filtered out | "Nothing matches these filters" | widen a range | secondary: "Clear filters" |
| Error | "Records did not load" | "Check your connection, then try again." | secondary: "Try again" |

## Anatomy
44px `rnr-kind` icon tile (Phosphor, 20–24px), heading 24/30 Newsreader, body `--ink-2` max 32em, one button. No illustration.

## Do
Give the next step. In a table card, drop the empty state inside the card so the header stays.

## Don't
Never a bare "No data". Never two actions. Never blame ("You have not …").

## Accessibility
Heading level fits the page (`h2`/`h3`); the error variant uses `role="alert"` when it replaces content that was loading.

## Copy
British English, sentence case, no "we".
