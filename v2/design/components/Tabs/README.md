# Tabs

Switches panels inside one page (`role=tablist` > `rnr-tab` buttons, `rnr-tabpanel`). Not for page navigation.

## Anatomy
Row on a 1px `--line` rule; each tab 44px high (`--ctl-h`), 16px padding, label `--ink-3`; selected label `--ink` with a 3px `--strike` bar sitting on the rule (the strike colour is ≥ 3:1 on the canvas in every accent).

## States
rest · hover (wash) · focus-visible · selected (`aria-selected="true"`) · disabled (40%). Roving `tabindex` (selected = 0).

## Do
Arrow keys move and select; Home/End jump. Give every tab an `aria-controls` panel. Keep labels to one word where possible ("Steps", "Access", "History").

## Don't
No more than five tabs; no icons-only tabs; don't put a primary button in the tab row.

## Accessibility
`role="tablist"`, `role="tab"`, `role="tabpanel"` with `aria-labelledby`. The bar is an addition to the weight/ink change, not the only cue.

## Copy
Nouns, sentence case.
