import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROGRAMMES, stats, edgeKey } from './programmes.ts'

test('every programme walks only along its own edges, with unique cells', () => {
  for (const p of PROGRAMMES) {
    const ids = new Set(p.steps.map((s) => s.id))
    const edges = new Set(p.edges.map(([a, b]) => edgeKey(a, b)))
    for (const [a, b] of p.edges) assert.ok(ids.has(a) && ids.has(b), `${p.key} ${a}>${b}`)
    for (let i = 1; i < p.order.length; i++) assert.ok(edges.has(edgeKey(p.order[i - 1], p.order[i])), `${p.key} ${p.order[i - 1]}>${p.order[i]}`)
    assert.equal(new Set(p.steps.map((s) => `${s.lane},${s.col}`)).size, p.steps.length, `${p.key} overlapping cards`)
    assert.ok(p.steps.every((s) => s.lane < p.lanes.length))
  }
})

test('the caption is counted from the steps', () => {
  assert.equal(stats(PROGRAMMES[0]).join(' · '), '11 steps · 3 people · 2 approvals · 2 automatic emails · 1 campaign · 1 PDF · 1 dashboard · 2 forms · 1 timer')
})
