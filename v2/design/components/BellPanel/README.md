# Bell panel

The notifications menu. `rnr-bell` (icon button + `rnr-chip--count`), `rnr-notices` (a `rnr-menu`), `rnr-notices-head|sub|list|foot`, `rnr-notice`, `rnr-notice-dot|title|body`.

## Anatomy
Button (44px, `aria-haspopup="menu"`, `aria-expanded`, `aria-label="Notifications, 2 unread"`) with the count chip. Panel 360px wide (full-width minus 16px gutters on phones, fixed below the top bar), max-height 70dvh, scrolls. Each item: unread dot (`--acc-a`) + title (600 when unread) + body (2 lines) + time.

## States
unread (`data-unread="true"`: dot + bold title: not colour alone) · read · hover/focus (menu item) · empty ("You have no notifications") · mark-read failed ("Your notifications could not be marked as read. Try again.", unread state restored) · live update (polite announcement, not noisy).

## Do
Mark read optimistically and roll back with a message on failure. Link each item to its record.

## Don't
No toast for every new notification; no sound.

## Accessibility
`role="menu"` with link items; Esc closes and returns focus to the bell; the count is in the button's name, the chip is `aria-hidden`.

## Copy
Titles: "Leave approval: Aisha Khan". Footer: "See every message".
