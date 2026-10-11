import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sendProblem, zoneHint, SEND_NAME, SEND_TEMPLATE, SEND_AUDIENCE } from './send.ts'
import { TOO_BIG } from './logic.ts'

const ok = { name: 'Term starts', templateId: 't', audienceReady: true, tooBig: false, later: false, at: '', now: new Date('2026-10-11T10:00:00.000Z') }

test('the first problem wins, in the order of the page', () => {
  assert.equal(sendProblem(ok), null)
  assert.deepEqual(sendProblem({ ...ok, name: ' ', templateId: '' }), { field: 'name', message: SEND_NAME })
  assert.deepEqual(sendProblem({ ...ok, templateId: '', audienceReady: false }), { field: 'template', message: SEND_TEMPLATE })
  assert.deepEqual(sendProblem({ ...ok, audienceReady: false }), { field: 'audience', message: SEND_AUDIENCE })
  assert.deepEqual(sendProblem({ ...ok, tooBig: true }), { field: 'audience', message: TOO_BIG })
})

test('a later send needs a time between a minute and a year from now', () => {
  const at = (d: string) => ({ ...ok, later: true, at: d })
  assert.deepEqual(sendProblem(at('')), { field: 'at', message: 'Choose a time in the future.' })
  assert.deepEqual(sendProblem(at('2026-10-11T10:00:30.000Z')), { field: 'at', message: 'Choose a time in the future.' })
  assert.deepEqual(sendProblem(at('2027-10-12T10:00:00.000Z')), { field: 'at', message: 'Choose a time within the next year.' })
  assert.equal(sendProblem(at('2026-10-12T09:00:00.000Z')), null)
  assert.equal(sendProblem({ ...ok, at: '', later: false }), null)
})

test('the zone hint names the zone and its offset with spaces for underscores', () => {
  assert.equal(zoneHint('Asia/Kuala_Lumpur', 'GMT+8'), 'Your time zone: Asia/Kuala Lumpur (GMT+8). Sending can start up to a minute after this time.')
})
