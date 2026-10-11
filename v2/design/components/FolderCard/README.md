# Folder card

A titled section drawn as a folder: a tab sized to its label joined to the body by a concave shoulder. Classes `rnr-folder`, `rnr-folder-tab`, `rnr-folder-body`; React: `FolderCard({ tab, headingId?, children })`.

## Anatomy
```html
<section class="rnr-folder" aria-labelledby="h1">
  <span class="rnr-folder-tab" id="h1">Audience</span>
  <div class="rnr-folder-body"><div class="rnr-perf" aria-hidden="true"></div> … </div>
</section>
```
Tab: 32px high, 16px side padding, mono 11px caps, `min-width: max-content; white-space: nowrap`, so **the tab grows with its label and never clips**. Shoulder: 14px concave radial gradient to the right of the tab. Body radius `0 14 14 14`; padding 12px top (the perforation sits 11px below the edge), 20px sides.

## Variants and sizes
| Variant | Class | Tab | Radius |
|---|---|---|---|
| Default | `rnr-folder` | 32px | 14 |
| Panel | `rnr-folder--panel` | 32px | 20 |
| Large tab (sidebar wordmark) | `rnr-folder--lg` | 44px | with panel 20 |
| Node (workflow canvas) | `rnr-folder--node` | 22px, 10px type | tab 8, body 14 |

## States
A folder is a container: it has no hover. `:focus-within` raises its `z-index` (the folder's `filter` makes a stacking context; without this an open menu would sit under the next folder).

## Do
Use a folder for a named section (form card, settings group, KPI tile, appearance, pricing plan). Put the same words in the tab and the section's accessible name. Keep tab labels to a few words.

## Don't
Don't nest folders; don't use a tab as a heading level; don't put actions in the tab. A tab label that runs past the card on a 375px screen (cap: card width − 28px) is a copy bug, not a CSS bug.

## Accessibility
The tab is a visual label: give the section `aria-labelledby` pointing at it (or an `h2` inside). Tab text `--ink-3` on `--surface` ≥ 4.5:1.

## Copy
Short, sentence-style nouns in mono caps: "Form · HR", "Audience", "Settings · Appearance".
