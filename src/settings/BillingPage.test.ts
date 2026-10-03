import assert from 'node:assert/strict'
import { test } from 'node:test'
import { billingView } from './billing.ts'

const now = new Date('2026-10-04T12:00:00Z')

test('billingView: shows active trial', () => {
  const firm = {
    billingStatus: 'trial',
    trialEndsAt: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    paidAt: null,
  }
  const view = billingView(firm, true, now)
  assert.equal(view.kind, 'trial')
  if (view.kind === 'trial') {
    assert.equal(view.daysLeft, 5)
  }
})

test('billingView: shows ended trial', () => {
  const firm = {
    billingStatus: 'trial',
    trialEndsAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    paidAt: null,
  }
  const view = billingView(firm, true, now)
  assert.equal(view.kind, 'ended')
})

test('billingView: shows read_only state', () => {
  const firm = {
    billingStatus: 'read_only',
    trialEndsAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    paidAt: null,
  }
  const view = billingView(firm, true, now)
  assert.equal(view.kind, 'read_only')
})

test('billingView: shows paid status', () => {
  const firm = {
    billingStatus: 'paid',
    trialEndsAt: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    paidAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  }
  const view = billingView(firm, true, now)
  assert.equal(view.kind, 'paid')
  if (view.kind === 'paid') {
    assert.ok(view.paidOn)
  }
})

test('billingView: shows complimentary status', () => {
  const firm = {
    billingStatus: 'complimentary',
    trialEndsAt: null,
    paidAt: null,
  }
  const view = billingView(firm, true, now)
  assert.equal(view.kind, 'complimentary')
})

test('billingView: handles trial with 1 day left', () => {
  const firm = {
    billingStatus: 'trial',
    trialEndsAt: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString(),
    paidAt: null,
  }
  const view = billingView(firm, true, now)
  assert.equal(view.kind, 'trial')
  if (view.kind === 'trial') {
    assert.equal(view.daysLeft, 1)
  }
})

test('billingView: handles trial ending in less than a day', () => {
  const firm = {
    billingStatus: 'trial',
    trialEndsAt: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(),
    paidAt: null,
  }
  const view = billingView(firm, true, now)
  assert.equal(view.kind, 'trial')
  if (view.kind === 'trial') {
    assert.equal(view.daysLeft, 1)
  }
})

test('billingView: handles paid without paidAt timestamp', () => {
  const firm = {
    billingStatus: 'paid',
    trialEndsAt: null,
    paidAt: null,
  }
  const view = billingView(firm, true, now)
  assert.equal(view.kind, 'paid')
  if (view.kind === 'paid') {
    assert.equal(view.paidOn, 'recently')
  }
})
