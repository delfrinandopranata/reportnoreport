import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROGRAMMES, stats, edgeKey } from './programmes.ts'
import { isPort, cardRect, ROW_H, TAIL, LANE_W, COL_W } from './layout.ts'

const hit = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

test('every beat is reached along the programme’s own edges', () => {
  for (const p of PROGRAMMES) {
    const ids = new Set(p.steps.map((s) => s.id))
    const edges = new Set(p.edges.map(([a, b]) => edgeKey(a, b)))
    for (const [a, b] of p.edges) assert.ok(ids.has(a) && ids.has(b), `${p.key} ${a}>${b}`)
    for (const id of p.beats.flat()) assert.ok(ids.has(id), `${p.key} beat ${id}`)
    for (let j = 1; j < p.beats.length; j++) for (const c of p.beats[j]) {
      const ok = p.beats[j - 1].includes(c) || p.beats[j - 1].some((a) => edges.has(edgeKey(a, c)))
      assert.ok(ok, `${p.key} beat ${j}: nothing leads to ${c}`)
    }
  }
})

test('cards never overlap and stay inside the stage', () => {
  for (const p of PROGRAMMES) {
    const rects = p.steps.map((s) => [s.id, cardRect(s)] as const)
    const cols = Math.max(...p.steps.map((s) => s.col)) + 1
    for (const [id, r] of rects) assert.ok(r.y + r.h <= p.lanes.length * ROW_H + TAIL && r.x + r.w <= LANE_W + cols * COL_W, `${p.key} ${id} outside`)
    rects.forEach(([a, r], i) => rects.slice(i + 1).forEach(([b, o]) => assert.ok(!hit(r, o), `${p.key} ${a} overlaps ${b}`)))
  }
})

test('options belong to branch and parallel cards, and each has exactly one line out', () => {
  for (const p of PROGRAMMES) for (const s of p.steps.filter((x) => x.options)) {
    assert.ok(s.type === 'BRANCH' || s.type === 'PARALLEL', `${p.key} ${s.id}`)
    for (const o of s.options as string[]) assert.equal(p.edges.filter(([a, , l]) => a === s.id && l === o).length, 1, `${p.key} ${s.id} ${o}`)
    assert.ok(p.edges.filter(([a]) => a === s.id).every(([, , l]) => isPort(s, l)), `${p.key} ${s.id} has an unlabelled exit`)
  }
})

test('the busiest programme runs paths in parallel', () => {
  assert.ok(PROGRAMMES.every((p) => p.beats.some((b) => b.length > 1)))
})

test('the caption is counted from the steps', () => {
  assert.equal(stats(PROGRAMMES[2]).join(' · '), '15 steps · 3 people · 3 automatic emails · 1 PDF · 1 dashboard · 3 forms · 2 timers · 2 decisions · 1 parallel split')
})
