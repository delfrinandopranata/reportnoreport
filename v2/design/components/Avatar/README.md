# Avatar

A person's initials. `rnr-avatar` (32px), `--sm` (24), `--lg` (40), `--soft` (ink on soft). **The only element drawn as a circle** (`--r-avatar`, `corner-shape: round`).

## Anatomy
Two letters, IBM Plex Mono 500 12px, `--acc` gradient with `--on-acc` (≥ 4.5:1 on both stops). The account row, the organisation switcher and member rows use it.

## States
Static; inside a button it takes that button's states.

## Do
Take initials from the display name, falling back to the email's first two letters. Put the person's name in text beside it.

## Don't
No photos (v2 has none), no status ring, no avatar as the only identifier.

## Accessibility
Decorative (`aria-hidden`) when the name is shown next to it; otherwise `role="img"` with `aria-label`.

## Copy
None.
