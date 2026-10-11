import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moveAnswer, normaliseTemplate, toggleAnswer, toggleSignoff } from './templateOrder.ts'
import type { ReportTemplate, StepFields } from './logic.ts'

const steps = [{ nodeId: 'a', step: 'Start', fields: [] }, { nodeId: 'b', step: 'Approval', fields: [] }] as StepFields[]
const ref = (nodeId: string, key: string) => ({ nodeId, key })
const keys = (t: { fields: { nodeId: string; key: string }[] }) => t.fields.map((f) => `${f.nodeId}:${f.key}`)

test('answers are kept in workflow order whatever order they were ticked', () => {
  let t: ReportTemplate = { header: '', fields: [], signoff: [] }
  t = toggleAnswer(t, steps, ref('b', 'x'), true)
  t = toggleAnswer(t, steps, ref('a', 'y'), true)
  t = toggleAnswer(t, steps, ref('a', 'z'), true)
  assert.deepEqual(keys(t), ['a:y', 'a:z', 'b:x'])
  assert.deepEqual(keys(toggleAnswer(t, steps, ref('a', 'y'), false)), ['a:z', 'b:x'])
})
test('sign-off follows workflow order, not click order', () => {
  const t = toggleSignoff(toggleSignoff({ header: '', fields: [], signoff: [] }, steps, 'b', true), steps, 'a', true)
  assert.deepEqual(t.signoff, ['a', 'b'])
})
test('a move stays inside its step and stops at the ends', () => {
  const t = normaliseTemplate({ header: '', fields: [ref('a', '1'), ref('a', '2'), ref('b', '3')], signoff: [] }, steps)
  const m = moveAnswer(t, 'a', '1', 1)!
  assert.deepEqual([keys(m.t), m.position, m.total], [['a:2', 'a:1', 'b:3'], 2, 2])
  assert.equal(moveAnswer(t, 'a', '2', 1), null)
  assert.equal(moveAnswer(t, 'b', '3', -1), null)
})
test('answers of a deleted step go last instead of vanishing', () => {
  assert.deepEqual(keys(normaliseTemplate({ header: '', fields: [ref('gone', 'q'), ref('a', 'y')], signoff: [] }, steps)), ['a:y', 'gone:q'])
})
