# Toast and notice

Feedback. **Notice** (`rnr-note`, inline) stays until the problem is fixed; **toast** (`rnr-toast` in `rnr-toasts`, fixed bottom-right) confirms something that already happened.

## Anatomy
Icon (20px) + sentence (+ action). `data-tone="ok|warn|info|down"` sets the tinted fill, 1px tone border (notice) and icon colour; the sentence stays `--ink`.

## States
Toast rises in (240ms; none under flat) and stays 6 seconds, or until dismissed; errors and toasts with an action stay until dismissed. Notices persist.

## Do
`role="alert"` for errors (`down`); `role="status"` / `aria-live="polite"` for the rest. Say what to do next: "Your appearance is saved on this device only. Try again to keep it on your other devices."

## Don't
No toast for something the person must act on (use a notice). No more than three toasts visible. Don't auto-dismiss errors.

## Accessibility
Tone is carried by the icon, the tinted background and the sentence, never colour alone. Tone text colours are tested ≥ 4.5:1 on their tints in all 16 combinations. Toasts never take focus.

## Copy
A full sentence, past tense for success ("Role saved."), plain words for errors, no raw codes, no "we".
