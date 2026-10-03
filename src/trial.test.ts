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
  const firm = { billingStatus: 'read_only' as const, trialEndsAt: '2026-10-01T00:00:00Z' }
  const now = new Date('2026-10-03T12:00:00Z')
  const result = trialState(firm, now)
  assert.deepEqual(result, { kind: 'read_only', endedOn: '1 Oct 2026' })
})

test('trialState: null trialEndsAt with trial status returns none', () => {
  const firm = { billingStatus: 'trial' as const, trialEndsAt: null }
  const now = new Date('2026-10-03T12:00:00Z')
  const result = trialState(firm, now)
  assert.deepEqual(result, { kind: 'none' })
})

test('trialState: 13.2 days left returns 14 days', () => {
  // Trial ends on 2026-10-16T19:12:00Z (13.2 days from now)
  // Compute expected date in local timezone to avoid TZ-dependent test
  const endDate = new Date('2026-10-16T19:12:00Z')
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const expectedDate = `${endDate.getDate()} ${monthNames[endDate.getMonth()]} ${endDate.getFullYear()}`

  const firm = { billingStatus: 'trial' as const, trialEndsAt: '2026-10-16T19:12:00Z' }
  const now = new Date('2026-10-03T12:00:00Z')
  const result = trialState(firm, now)
  assert.deepEqual(result, {
    kind: 'active',
    daysLeft: 14,
    endsOn: expectedDate
  })
})

test('trialState: 0.5 days left returns 1 day minimum', () => {
  // Trial ends on 2026-10-04T00:00:00Z (0.5 days from now)
  const firm = { billingStatus: 'trial' as const, trialEndsAt: '2026-10-04T00:00:00Z' }
  const now = new Date('2026-10-03T12:00:00Z')
  const result = trialState(firm, now)
  assert.deepEqual(result, {
    kind: 'active',
    daysLeft: 1,
    endsOn: '4 Oct 2026'
  })
})

test('trialState: past trial date returns ended', () => {
  const firm = { billingStatus: 'trial' as const, trialEndsAt: '2026-10-01T00:00:00Z' }
  const now = new Date('2026-10-03T12:00:00Z')
  const result = trialState(firm, now)
  assert.deepEqual(result, {
    kind: 'ended',
    endedOn: '1 Oct 2026'
  })
})

test('trialState: exactly at trial end time returns ended', () => {
  const firm = { billingStatus: 'trial' as const, trialEndsAt: '2026-10-03T12:00:00Z' }
  const now = new Date('2026-10-03T12:00:00Z')
  const result = trialState(firm, now)
  assert.deepEqual(result, {
    kind: 'ended',
    endedOn: '3 Oct 2026'
  })
})
