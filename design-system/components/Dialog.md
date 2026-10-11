# Dialog

A modal for a single focused task (record a transaction, invite a user, confirm a removal).

Hand-written from `Dialog` in `src/ui.tsx` (native `<dialog>`: focus trap, Esc and backdrop close for free).

## Rules
- Max width 448px (`w-[calc(100%-2rem)]` on phones), `radius-2xl`, `shadow-2xl`, backdrop `scrim` with 4px blur.
- Header: `dialog-title` style, `line-100` rule, close icon button labelled "Close dialog". Body padding `space-6`.
- Focus the first field via `data-autofocus` on open; one primary action at the end.
- B&W: hard 6px offset shadow instead of the soft one.
