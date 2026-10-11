# Workflow canvas

The workflow editor's board: node card, handle, edge, controls. Classes `rnr-canvas` (dotted board), `rnr-flow` (xyflow wrapper that maps `--xy-*` variables to tokens), `rnr-node` (+ `rnr-folder rnr-folder--node`), `rnr-node-outs|out`, `rnr-outcome`.

## Node card
A folder card: **22px tab** (the step type in 10px mono caps: Trigger, Condition, Ask HR), tab radius 8, body radius 14, 208px wide, 12px padding. Outputs (`rnr-node-out`) sit right with a handle each.
States: rest · hover (cursor) · focus-visible (3px ring on the xyflow node) · selected · dragging (`--ncshadow` heavier outline) · **current** (`data-current="true"`: 2px ink inset) · **issue** (`data-issue="true"`: 1.5px `--down` inset, `--down` tab text, plus a sentence with an icon in the body) · read-only (`data-readonly`: handles inert).

## Handle and edge
Handle: 12px rounded square (radius 4), 2px `--ink-2` border, 24px hit area; hover/connecting border `--focus` and `--tint` fill. Edge: 1.5px `--ink-3`; selected `--ink`; label chip mono 11px on `--surface` with a `--line` outline. Controls: 14px-radius stack, 32px buttons (44px coarse).

## Behaviour (unchanged)
Drag, connect, Map and List views, side panel, step sheet, keyboard path and announcements are as Phase 3 §2.9; read-only view is a static picture on touch.

## Don't
No colour-only issue marking; no node wider than 208px; no handle without a visible label on its output.

## Accessibility
Every node is a labelled group; the List view is the accessible equivalent; issues are listed in an issues card.

## Copy
Step names are verbs or nouns the person chose; outputs: "Yes", "No", "Next".
