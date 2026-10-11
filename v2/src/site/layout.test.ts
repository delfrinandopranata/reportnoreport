import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROGRAMMES } from './programmes.ts'
import { cardRect, placeLabels } from './layout.ts'

const hit = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

test('every edge label is placed and touches no card and no other label', () => {
  for (const p of PROGRAMMES) {
    const labelled = p.edges.map((e, i) => (e[2] ? i : -1)).filter((i) => i >= 0)
    const placed = placeLabels(p)
    assert.equal(placed.size, labelled.length, `${p.key} labels placed`)
    const rects = [...placed.values()]
    rects.forEach((r, i) => {
      for (const s of p.steps) assert.ok(!hit(r, cardRect(s)), `${p.key} label ${i} overlaps ${s.id}`)
      rects.slice(i + 1).forEach((o) => assert.ok(!hit(r, o), `${p.key} labels overlap`))
    })
  }
})
