# Top bar and jump bar (⌘K)

`rnr-topbar` holds the dock button (`rnr-dock`, a plain paper pill-free surface, radius 14) and on phones the wordmark and bell. `rnr-jump` is the `<dialog>` it opens.

## Jump bar
A modal dialog (radius 20, top-aligned at 12vh) with a search input (`role="combobox"`) and a listbox (`rnr-jump-list` > `rnr-jump-option`, 44px, radius 10). It is a **jump bar over pages, not a search engine**: it lists the pages the person can open (nav items plus Settings), filters by label as they type, Enter goes there. The placeholder is "Go to a page".

## Keyboard
⌘K / Ctrl+K opens; ↑↓ move (`aria-selected`), Enter opens the page, Esc closes and returns focus to the dock. Leaving an unsaved form still asks first (the navigation guard).

## States
dock: rest · hover · focus-visible · open. Option: rest · selected (accent fill) · hover.

## Don't
Don't search records, forms or people here (a new query surface, out of scope). The mockup's calendar, "+" and "Synced" chips are not built.

## Accessibility
Dialog is labelled; the combobox controls the listbox; the active option is announced via `aria-selected`; keys are listed in the footer hint.

## Copy
"Go to a page"; footer "Enter opens the page. Esc closes."
