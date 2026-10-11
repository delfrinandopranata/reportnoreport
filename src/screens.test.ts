import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

test('a hidden column can never blank the ledger: no non-null assertion on a column lookup', () => {
  const src = read('./ClientsPage.tsx')
  assert.doesNotMatch(src, /\.find\([^)]*\)!/)
  assert.match(src, /heading=\{describe\(t\)\}/)
})

test('the ledger page stays under 800 lines', () => {
  assert.ok(read('./ClientsPage.tsx').split('\n').length < 800)
})

test('the tour focuses the first enabled button, not a disabled Back', () => {
  assert.match(read('./tour/Tour.tsx'), /querySelector<HTMLElement>\('button:not\(:disabled\)'\)/)
})

test('the roles table scrolls inside its own region at phone width', () => {
  const src = read('./users/UsersPage.tsx')
  assert.match(src, /rnr-table-bare relative max-w-full min-w-0 overflow-x-auto/)
  // `relative` contains the sr-only cells; absolutely positioned, they would otherwise escape the clip and widen the page.
  // A grid item defaults to min-width:auto, which would let the 560px table widen the page.
  assert.match(src, /rnr-folder min-w-0" aria-labelledby="roles-heading"/)
})

test('three-option segmented controls fit a phone row', () => {
  assert.match(read('./clients/shared.tsx'), /max-sm:grid-cols-3/)
})

test('touch targets: icon-only controls reach 44px wide on coarse pointers', () => {
  for (const f of ['./ClientsPage.tsx', './App.tsx']) assert.match(read(f), /pointer-coarse:min-w-11/)
  assert.match(read('./index.css'), /\.rnr-note--bar \.rnr-link \{[^}]*min-height: var\(--touch\)/)
})

test('the remove-sample-data confirm is a danger action', () => {
  const src = read('./App.tsx')
  assert.match(src, /className=\{btn\.danger\}\s+onClick=\{async \(\) => \{\s+await removeSample/)
})
