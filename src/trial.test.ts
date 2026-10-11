import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { trialState } from './trial.ts'

test('trialState: paid firm returns none', () => {
  const firm = { billingStatus: 'paid' as const, trialEndsAt: '2026-10-17T00:00:00Z' }
  const now = new Date('2026-10-03T12:00:00Z')
  const result = trialState(firm, now)
  assert.deepEqual(result, { kind: 'none' })
})

test('trialState: complimentary firm returns none', () => {
  const firm = { billingStatus: 'complimentary' as const, trialEndsAt: null }
  const now = new Date('2026-10-03T12:00:00Z')
  const result = trialState(firm, now)
  assert.deepEqual(result, { kind: 'none' })
})

test('trialState: read_only firm returns read_only state', () => {
  // Oct 1, 2026 at 00:00 local time
  const end = new Date(2026, 9, 1, 0, 0)
  const now = new Date(2026, 9, 3, 12, 0)
  const firm = { billingStatus: 'read_only' as const, trialEndsAt: end.toISOString() }
  const result = trialState(firm, now)
  assert.deepEqual(result, { kind: 'read_only', endedOn: '1 Oct 2026' })
})

test('trialState: null trialEndsAt with trial status returns none', () => {
  const firm = { billingStatus: 'trial' as const, trialEndsAt: null }
  const now = new Date(2026, 9, 3, 12, 0)
  const result = trialState(firm, now)
  assert.deepEqual(result, { kind: 'none' })
})

test('trialState: 13.2 days left returns 14 days', () => {
  // Oct 16, 2026 at 19:12 local time; Oct 3, 2026 at 12:00 local time
  const end = new Date(2026, 9, 16, 19, 12)
  const now = new Date(2026, 9, 3, 12, 0)
  const firm = { billingStatus: 'trial' as const, trialEndsAt: end.toISOString() }
  const result = trialState(firm, now)
  assert.deepEqual(result, {
    kind: 'active',
    daysLeft: 14,
    endsOn: '16 Oct 2026'
  })
})

test('trialState: 0.5 days left returns 1 day minimum', () => {
  // Oct 4, 2026 at 00:00 local time (0.5 days from Oct 3 12:00 local)
  const now = new Date(2026, 9, 3, 12, 0)
  const end = new Date(2026, 9, 4, 0, 0)
  const firm = { billingStatus: 'trial' as const, trialEndsAt: end.toISOString() }
  const result = trialState(firm, now)
  assert.deepEqual(result, {
    kind: 'active',
    daysLeft: 1,
    endsOn: '4 Oct 2026'
  })
})

test('trialState: past trial date returns ended', () => {
  // Oct 1, 2026 at 00:00 local time
  const end = new Date(2026, 9, 1, 0, 0)
  const now = new Date(2026, 9, 3, 12, 0)
  const firm = { billingStatus: 'trial' as const, trialEndsAt: end.toISOString() }
  const result = trialState(firm, now)
  assert.deepEqual(result, {
    kind: 'ended',
    endedOn: '1 Oct 2026'
  })
})

test('trialState: exactly at trial end time returns ended', () => {
  // Oct 3, 2026 at 12:00 local time
  const now = new Date(2026, 9, 3, 12, 0)
  const end = new Date(2026, 9, 3, 12, 0)
  const firm = { billingStatus: 'trial' as const, trialEndsAt: end.toISOString() }
  const result = trialState(firm, now)
  assert.deepEqual(result, {
    kind: 'ended',
    endedOn: '3 Oct 2026'
  })
})

test('the write-block reason names the same trial end date Billing shows', async () => {
  const { localiseBlockReason } = await import('./trial.ts')
  const trialEndsAt = '2026-10-10T23:30:00Z'
  const ended = trialState({ billingStatus: 'trial', trialEndsAt }, new Date('2026-10-12T00:00:00Z'))
  assert.equal(ended.kind, 'ended')
  assert.equal(localiseBlockReason('The free trial ended on 10 Oct 2026.', trialEndsAt), `The free trial ended on ${(ended as { endedOn: string }).endedOn}.`)
  assert.equal(localiseBlockReason("This firm's access is suspended.", trialEndsAt), "This firm's access is suspended.")
  assert.equal(localiseBlockReason(null, trialEndsAt), null)
})
