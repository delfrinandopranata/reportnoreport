# Dialog, sheet and drawer

Native `<dialog>` opened with `showModal()` (via `src/ui/ConfirmDialog.tsx` for confirmations). Classes `rnr-dialog`, `rnr-dialog-head|body|foot`, `rnr-sheet`, `rnr-drawer`.

## Anatomy
Panel radius **20**, `--surface`, `--sh-dialog`, backdrop `--scrim` + 4px blur. Head (title 18/600 + optional close icon button) · body (24px sides) · foot (buttons right-aligned, hairline above). Width `calc(100% - 2rem)` capped at 480px.

## Variants
| Variant | Class | Position | Use |
|---|---|---|---|
| Dialog | `rnr-dialog` | centred | 1–5 fields, confirmations |
| Sheet | `rnr-dialog rnr-sheet` | bottom, radius `20 20 0 0`, max-height 80dvh | the form builder palette and pickers on phones |
| Drawer | `rnr-dialog rnr-drawer` | left, 320px, full height | the phone menu |
Six or more fields: use a page or a side panel, not a dialog.

## States
closed (`display: none`: the bundle restores it, because `display` on the class would otherwise show a closed dialog) · open (rises 8px, 240ms; sheet and drawer slide; none under flat motion) · busy (primary shows `aria-busy`) · error (an `rnr-note` inside the body, `role="alert"`).

## Do
Return focus to the trigger on close. Make the safe action the left button ("Keep member") and the confirm the right (`rnr-btn-danger` for destructive, primary otherwise). Sending a campaign is not destructive: it gets its own dialog with `rnr-btn-primary`.

## Don't
Don't use `ConfirmDialog` for non-destructive confirms. Don't stack dialogs. Don't close on a backdrop click when there is unsaved input.

## Accessibility
`aria-labelledby` the title; focus is trapped and Esc closes by the platform; body scroll is locked while open (`body:has(dialog[open])`). Close icon buttons have `aria-label`.

## Copy
Title is a question or a short action: "Remove Ben Tan?", "Invite a member". Body says the consequence. Buttons repeat the action.
