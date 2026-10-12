import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROGRAMMES } from './programmes.ts'
import { cameraTarget, cardRect, glide, labelled, placeLabels, stampRect } from './layout.ts'

const hit = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

test('every edge label is placed and touches no card, stamp or other label', () => {
  for (const p of PROGRAMMES) {
    const placed = placeLabels(p)
    assert.equal(placed.size, labelled(p).length, `${p.key} labels placed`)
    const rects = [...placed.values()]
    rects.forEach((r, i) => {
      for (const s of p.steps) assert.ok(!hit(r, cardRect(s)), `${p.key} label ${i} overlaps ${s.id}`)
      for (const s of p.steps.filter((x) => x.type === 'APPROVAL')) assert.ok(!hit(r, stampRect(s)), `${p.key} label ${i} touches the stamp of ${s.id}`)
      rects.slice(i + 1).forEach((o) => assert.ok(!hit(r, o), `${p.key} labels overlap`))
    })
  }
})

test('the hero camera glides between beats and stays on the stage', () => {
  assert.equal(cameraTarget(500, 900, 0.5, 400, 2000, 0.5), 500) // halfway between the cards, centred
  assert.equal(cameraTarget(100, 100, 0, 400, 2000, 0.5), 0) // never left of the stage
  assert.equal(cameraTarget(1900, 1900, 0, 400, 2000, 0.5), 1600) // never past its right end
  const x = glide(0, 100, 450)
  assert.ok(x > 62 && x < 64, `one tau closes about 63%, got ${x}`)
  assert.equal(glide(100, 100, 16), 100)
})
