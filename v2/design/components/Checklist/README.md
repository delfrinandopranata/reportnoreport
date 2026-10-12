# Checklist

The onboarding checklist on the dashboard. `rnr-folder` > `.rnr-checklist-summary` (`rnr-progress` + count) + `ol.rnr-checklist` > `li.rnr-checklist-item[data-state]`.

## Anatomy
Summary row: "3 of 6 done" (`rnr-caption`) and a `rnr-progress` bar. Each item: state icon (20px) · label (link or button to the task) · state word (`.rnr-checklist-state`). Items are 44px high with radius 10 (concentric in the folder).

## States (icon + word, never colour alone)
`done` (check-circle, "Done", label `--ink-3`) · `current` (arrow-right, "Next", `--tint` background, label ink, 500 weight) · `todo` (circle, no word needed; the label is the action) · `skipped` (minus-circle, "Skipped"). All complete: the folder is replaced by one line, "You're all set." with a "Hide checklist" ghost button.

## Do
Order tasks by dependency. Make the current item the primary path (the label is a link to the screen). Allow skipping any non-blocking task. Announce progress changes politely.

## Don't
Don't strike labels through (hurts reading). Don't use colour as the only difference between done and todo.

## Accessibility
An ordered list; the state word is in the DOM (visible, or `rnr-sr-only` for `todo`); the progress has a name ("Setup progress, 3 of 6"); `aria-live="polite"` on the count only.

## Copy
Labels are verbs ("Add your first client", "Record a transaction", "Upload your logo"). State words: "Done", "Next", "Skipped".
