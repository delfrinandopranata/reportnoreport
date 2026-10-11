# Banner (full-width note)

A bar that spans the shell, above the page: trial status, read-only support view, sample data, demo build. `div.rnr-note.rnr-note--bar[data-tone]` (the base `rnr-note`, full width) with an icon, a sentence and optional actions.

## Anatomy
Icon (20px) · sentence (`div`, ink) · optional `.rnr-note-fig` (mono, tabular: "3 days") · `.rnr-note-actions` (a secondary or primary button, a dismiss icon button). Square corners (it is a bar, not a card), a bottom hairline, tone background with the tone border. The sentence stays ink; the tint, border and icon carry the tone (≥ 4.5:1 for ink and tone on every tint, enforced).

## Tones (icon + word, never colour alone)
`info` (trial active, sample data, support view, demo) · `warn` (3 days or fewer left) · `down` (trial ended, read-only) · none (neutral `--soft`). Each says what it means in words: "Trial ends in 3 days." with a warning icon.

## States
visible · dismissible (X button, returns focus to the main region) · sticky (`data-sticky`, sits under the skip link, above the top bar). Wraps on phones: sentence first, actions below.

## Do
`role="status"` for info and warn, `role="alert"` when writes were just blocked (ended, read-only). One banner per concern; stack at most two. Give a next step: "Upgrade", "Remove sample data".

## Don't
Don't use it for transient results (use Toast) or form errors (use the inline note). Don't rely on colour: keep the icon and the sentence.

## Accessibility
Not a landmark; do not steal focus on mount. Buttons 44px on coarse pointers. Reduced motion: it does not animate.

## Copy
"Your trial ends in 3 days. Upgrade to keep editing." · "Your trial has ended. Your data is read-only." · "You are viewing Lim & Partners in read-only support view." · "This is sample data. Remove it when you are ready." No "we".
