# Paper, card and the corner scale

The three surfaces and the radii every component draws from.

## Surfaces
| Class | Looks like | Use |
|---|---|---|
| `rnr-paper` | `--surface`, 1px `--line`, `--sh-float`, perforation 7px below the top edge | The single raised surface on a page: form card, ⌘K dock, landing window. Variants `rnr-paper--plain` (no perforation), `rnr-paper--panel` (radius 20) |
| `rnr-card` | `--surface`, 1px `--line`, no shadow | The default container for any group (padding `--card-pad`: 20px, 16px compact) |
| `rnr-folder` | Titled section, see FolderCard | A section that has a name |
| `rnr-perf` | A 4px perforation band (`--perf`, 10px pitch) | Inside a card or folder body, under the title |
Cards on the canvas are separated by a hairline, never by shadow; shadow means "raised".

## Corner scale (Apple's iOS/macOS language)
| Token | px | Used for |
|---|---|---|
| `--r-control` (`--r-ctl` at runtime) | **10** (8 compact) | Buttons, inputs, selects, nav rows, segmented items, chips, tags, steps, palette items |
| `--r-control-sm` | 8 | Compact controls, small buttons, tooltips, step numbers, stamp keycap marks, node tabs |
| `--r-card` | **14** | Cards, KPI tiles, menus, popovers, table containers, blocks, empty states |
| `--r-panel` | **20** | Panels, dialogs, sheets, the sidebar folder, the landing window |
| `--r-key` | 6 | Key caps (`rnr-kbd`), checkboxes, stamp |
| `--r-bar` | 3 | Progress bars, tab bar |
| `--r-avatar` | 9999 | **Avatars only** (plus radio buttons, 8px status dots and the spinner, which are marks, not containers) |
Rules: nested corners are concentric, inner = outer − padding (menu 14 − 4 = item 10; sidebar folder 20 − 10 = nav row 10; segmented track 14 − 4 = item 10); never less than 6px. A chip's radius is at most ~40% of its height, so a 26px chip uses 10, never a pill.

## Smooth corners
`corner-shape: squircle` is applied to everything inside `@supports (corner-shape: squircle)` (Chrome 139+); everywhere else the same `border-radius` draws a normal arc. The values do not change; do not design for one rendering. Avatars, radios, dots and the spinner opt out with `corner-shape: round`.

## Accessibility
Surfaces change no meaning; text on `--surface` and `--canvas` is tested in all 16 combinations. In Black & White the border is 1px ink and the shadow is a hard offset.

## Don't
No `rounded-full` or `rounded-3xl` utilities on controls; no nested border radii that ignore the scale.
