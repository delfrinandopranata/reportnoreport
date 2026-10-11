# Button

Starts or confirms an action. Primary, secondary, ghost, danger and icon variants; classes `rnr-btn`, `rnr-btn-primary|secondary|ghost|danger`, `rnr-btn-sm`, `rnr-btn-chip`, `rnr-icon-btn`.

## Anatomy
`[icon 20] label [arrow chip]`. The label is a verb plus the object. The arrow chip (`rnr-btn-chip`, 28px rounded square, `--chip-bg` / `--chip-fg`) is for the single primary call to action on landing and Appearance previews and forms' "Next"; do not add it to every primary.

## Variants
| Variant | Use | Surface |
|---|---|---|
| `rnr-btn-primary` | The one main action of a view. **One per view.** | `--acc` gradient, `--on-acc` text |
| `rnr-btn-secondary` | Any other action | `--field`, 1px `--line-strong` |
| `rnr-btn-ghost` | Back, Cancel, low-key actions, toggles (`aria-pressed`) | transparent, `--ink-2` |
| `rnr-btn-danger` | Destructive confirm only ("Remove member") | `--down-bg`, 1px `--down` outline, `--down` text |
| `rnr-icon-btn` | Icon-only action; always `aria-label` | transparent; `rnr-icon-btn--soft` adds a soft fill |

## Sizes
Default height is `--ctl-h` (44px comfortable, 36px compact, 44px on coarse pointers); `rnr-btn-sm` is 8px shorter. Radius is `--r-ctl`: **10px** (8px compact, 8px for small). Icons 20px (16px in menus and chips).

## States
rest · hover (`filter: brightness(1.12)` on primary, border darkens on secondary, wash on ghost; only under `@media (hover: hover)`) · active (`scale(.97)`) · focus-visible (3px `--focus` ring, 2px offset) · busy (`aria-busy="true"`, the `rnr-spin` inside shows, the label becomes the -ing form, the button keeps focus and its size) · disabled (`aria-disabled="true"`, 40% opacity, `not-allowed`) · pressed (`aria-pressed="true"`, ghost only).

## Do
- Keep the submit button live; validate on click, mark the blocking fields and move focus to the first. Use `aria-busy` while a request runs.
- Put the spinner in markup always (`<span class="rnr-spin" aria-hidden="true">`); CSS shows it only while busy.
- Pair a destructive confirm with a "Keep …" safe action: "Keep member" / "Remove member".

## Don't
- Never `disabled` on a submit button. `aria-disabled` is for actions that are unavailable (a pager at its end).
- No second primary in a view. No `rnr-btn rnr-btn-primary w-full` conflicts: Tailwind utilities (`w-full`, `gap-3`) win by design (see the layer strategy in `bundle.css`).
- No pill buttons, no gradient on secondary.

## Accessibility
Contrast: `--on-acc` on both gradient stops ≥ 4.5:1 in all 16 combinations (tested). Targets ≥ 44px on coarse pointers. Icon-only buttons need `aria-label`; decorative icons `aria-hidden`. The keyboard hint (`rnr-kbd`) is `aria-hidden`.

## Copy
Sentence case, verb first, name the object: "Publish form", "Invite member", "Send invite". Busy: "Saving…", "Sending…". Never "OK", "Submit" or "Click here". Destructive confirm repeats the action ("Remove member"), not "Yes".
