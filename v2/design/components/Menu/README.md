# Menu, popover and tooltip

Floating surfaces. `rnr-menu` (+ `rnr-menu-item`, `rnr-menu-sep`, `rnr-menu-label`, `rnr-menu--wide`, `rnr-menu-item--stack`), `rnr-menu-anchor`, `rnr-popover`, `rnr-tip`.

## Anatomy and corners
Menu: radius **14**, padding 4px, `--sh-menu`, items radius **10** (14 − 4, concentric), 40px high (44px coarse), 14px text, icon 16px. Popover: radius 14, padding 16px, same shadow. Tooltip: `--ink` fill with `--canvas` text, radius 8, 13px, `pointer-events: none`.

## Items
Plain · with icon · stack (title + caption) · radio (`role="menuitemradio"`, a tick plus weight when `aria-checked="true"`) · danger (`.is-danger`, `--down`) · disabled (`aria-disabled="true"`, `--ink-3`) · active (`data-active`, roving focus).

## States
rest · hover (soft wash) · focus (soft wash plus inset 3px ring; also when focus is set by script) · open/closed (`aria-expanded` on the trigger) · disabled.

## Positioning
`rnr-menu-anchor` is `position: relative`; the menu is absolute below the trigger, right-aligned, `z-index: --z-menu`. Menus that scroll or clip draw their focus ring inside. A menu inside a folder lifts the folder with `:focus-within`.

## Behaviour (not in CSS)
Esc closes and returns focus to the trigger; arrows rove; Home/End; outside click closes; type-ahead optional.

## Do
Keep menus to ~7 items; separate destructive items with a separator and put them last.

## Don't
No nested menus; no menu for a single action; no tooltip for essential information (it is a supplement, not the label).

## Accessibility
`role="menu"` + `menuitem*`; triggers have `aria-haspopup="menu"` and `aria-expanded`; tooltips use `role="tooltip"` with `aria-describedby`, and show on focus as well as hover.

## Copy
Verb first: "Duplicate", "Remove widget". Danger items name the object.
