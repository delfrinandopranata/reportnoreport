# Badge

Small status marks: the In/Out kind badge, info chips, initials avatars and the saved check.

Hand-written from `KindBadge` and `Avatar` in `src/ui.tsx` and the "Includes sample data" chip in `src/Dashboard.tsx`.

## Rules
- Kind badge: 32px circle, `in`/`out` at 10% fill with the arrow icon; `aria-label` "In"/"Out". B&W: outlined.
- Chip: `radius-full`, 12/500, `info-surface` with `info-ink`.
- Avatar: initials (two letters), 32px. The app picks one of six Tailwind tints by name hash (sky, amber, emerald, violet, rose, teal 100/700, dark 950/300); this system shows the neutral fallback.
- Saved check: `rnr-pop` micro-interaction (skipped in flat motion).
