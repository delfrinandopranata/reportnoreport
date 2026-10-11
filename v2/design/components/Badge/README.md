# Badge, status, chip and trend

Small marks that sit beside a word. Classes `rnr-status`, `rnr-chip`, `rnr-chip--count`, `rnr-trend`, `rnr-kind`, `rnr-dot`.

## Status (`rnr-status`)
Icon (16px) + word, no coloured pill. Default is grey; `data-tone="ok|warn|down|info"` tints the icon and word (`--ok`, `--warn`, `--down`, `--info`, each ≥ 4.5:1 on surface and on its tint). **The word and the icon are always present**; tone is an addition. In Black & White all tones are ink. Wrapping statuses use `data-wrap`.
Words: Draft, Scheduled, Sending, Sent, Not sent, Approved, Rejected, Overdue.

## Chip (`rnr-chip`)
A mark like "System", "Beta", "Needs fixing", or a count. Radius `--r-chip` (6px in every density, Apple's small-badge corner), 26px high, mono 12px. Tones: neutral, `accent`, `ok`, `warn`, `info`, `down` (down adds a 1.5px outline and should carry an icon and the word "Error"). `rnr-chip--count` is the unread count on the bell (positioned absolutely).

## Trend (`rnr-trend`)
Landing and design system only. `data-dir="up|flat|down"`; arrow icon + signed figure; down is outlined so it never relies on red.

## Kind tile (`rnr-kind`)
32px rounded-square tile for an icon (income / expense style marks, empty-state icon). `is-out` is neutral.

## Do
Pair every mark with text. Keep chips to one or two words.

## Don't
No coloured pill for status (use `rnr-status`); no chip as a button; no tone-only difference between two statuses.

## Accessibility
Tone is never the only cue; Rosewood moves `--down` to an orange-red so an error never reads as the accent. Count chips are covered by the button's `aria-label` ("Notifications, 3 unread").

## Copy
Sentence case. Status says what happened: "Not sent", "PDF not made", not "Failed".
