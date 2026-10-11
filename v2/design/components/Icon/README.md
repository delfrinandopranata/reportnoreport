# Icons

Phosphor, **regular** weight, `currentColor`. In the app they come only through `src/ui/icons.tsx` (the module maps each exported name to a Phosphor component); no other file imports `@phosphor-icons/react`.

## Sizes
| Size | Where |
|---|---|
| 16px | inline with text, buttons' leading icons, menus, status, chips |
| 20px | navigation, icon buttons, toasts and notices |
| 24px | empty-state tiles |

## Rules
- Decorative icons are `aria-hidden`; every icon-only button has `aria-label`.
- Colour is inherited (`currentColor`); never hard-code a hex.
- One set only: no second icon library, no emoji.
- Arrows: `arrow-up-right` / `arrow-down-right` for trends, `arrow-right` inside the primary chip, `arrow-left` for back.
- The drag handle is always `dots-six-vertical`.

## The preview subset
`design/icons/sprite.svg` holds the 72 glyphs used by the previews (MIT licence: `design/icons/LICENSE-phosphor.txt`).

## Nav icons
Inbox `tray` · Records `database` · Dashboard `squares-four` · Reports `chart-line-up` · Forms `note-pencil` · Workflows `git-branch` · Templates `file-text` · Campaigns `megaphone` · Members `users-three` · Roles `shield-check` · Messages `envelope-simple` · Notifications `bell-simple` · Settings `gear-six` · Search `magnifying-glass` · Menu `list`.
