import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { computeChecklistItems, shouldShowChecklist } from './logic.ts'
import type { Firm } from '../data/mappers.ts'

const mockFirm = (overrides?: Partial<Firm>): Firm => ({
  id: 'firm-1',
  name: 'Acme',
  phone: '1234567890',
  email: 'info@acme.com',
  registrationNo: 'REG-123',
  ...overrides,
} as Firm)

test('Checklist: profile completes when phone, email, registration_no all set', () => {
  const items = computeChecklistItems(
    mockFirm(),
    0,
    0,
    1,
    { skipped: [], dismissed: false },
  )
  const profileItem = items.find((i) => i.id === 'profile')
  assert.equal(profileItem?.state, 'done')
})

test('Checklist: profile incomplete if phone missing', () => {
  const items = computeChecklistItems(
    mockFirm({ phone: '' }),
    0,
    0,
    1,
    { skipped: [], dismissed: false },
  )
  const profileItem = items.find((i) => i.id === 'profile')
  assert.equal(profileItem?.state, 'todo')
})

test('Checklist: profile incomplete if email missing', () => {
  const items = computeChecklistItems(
    mockFirm({ email: '' }),
    0,
    0,
    1,
    { skipped: [], dismissed: false },
  )
  const profileItem = items.find((i) => i.id === 'profile')
  assert.equal(profileItem?.state, 'todo')
})

test('Checklist: profile incomplete if registrationNo missing', () => {
  const items = computeChecklistItems(
    mockFirm({ registrationNo: '' }),
    0,
    0,
    1,
    { skipped: [], dismissed: false },
  )
  const profileItem = items.find((i) => i.id === 'profile')
  assert.equal(profileItem?.state, 'todo')
})

test('Checklist: team completes with 2+ members', () => {
  const items = computeChecklistItems(
    mockFirm(),
    0,
    0,
    2,
    { skipped: [], dismissed: false },
  )
  const teamItem = items.find((i) => i.id === 'team')
  assert.equal(teamItem?.state, 'done')
})

test('Checklist: team incomplete with 1 member', () => {
  const items = computeChecklistItems(
    mockFirm(),
    0,
    0,
    1,
    { skipped: [], dismissed: false },
  )
  const teamItem = items.find((i) => i.id === 'team')
  assert.equal(teamItem?.state, 'todo')
})

test('Checklist: client completes with 1+ non-sample clients', () => {
  const items = computeChecklistItems(
    mockFirm(),
    1,
    0,
    1,
    { skipped: [], dismissed: false },
  )
  const clientItem = items.find((i) => i.id === 'client')
  assert.equal(clientItem?.state, 'done')
})

test('Checklist: client incomplete with 0 clients', () => {
  const items = computeChecklistItems(
    mockFirm(),
    0,
    0,
    1,
    { skipped: [], dismissed: false },
  )
  const clientItem = items.find((i) => i.id === 'client')
  assert.equal(clientItem?.state, 'todo')
})

test('Checklist: transaction completes with 1+ non-sample transactions', () => {
  const items = computeChecklistItems(
    mockFirm(),
    1,
    1,
    1,
    { skipped: [], dismissed: false },
  )
  const txnItem = items.find((i) => i.id === 'transaction')
  assert.equal(txnItem?.state, 'done')
})

test('Checklist: transaction incomplete with 0 transactions', () => {
  const items = computeChecklistItems(
    mockFirm(),
    1,
    0,
    1,
    { skipped: [], dismissed: false },
  )
  const txnItem = items.find((i) => i.id === 'transaction')
  assert.equal(txnItem?.state, 'todo')
})

test('Checklist: skipped item shows as skipped even if not done', () => {
  const items = computeChecklistItems(
    mockFirm({ phone: '' }),
    0,
    0,
    1,
    { skipped: ['profile'], dismissed: false },
  )
  const profileItem = items.find((i) => i.id === 'profile')
  assert.equal(profileItem?.state, 'skipped')
})

test('Checklist: done item shows as done despite being skipped', () => {
  const items = computeChecklistItems(
    mockFirm(),
    0,
    0,
    1,
    { skipped: ['profile'], dismissed: false },
  )
  const profileItem = items.find((i) => i.id === 'profile')
  assert.equal(profileItem?.state, 'done')
})

test('Checklist: shouldShowChecklist returns false when dismissed', () => {
  const items = computeChecklistItems(
    mockFirm(),
    0,
    0,
    1,
    { skipped: [], dismissed: false },
  )
  const show = shouldShowChecklist(items, true)
  assert.equal(show, false)
})

test('Checklist: shouldShowChecklist returns false when all done or skipped', () => {
  const items = computeChecklistItems(
    mockFirm(),
    1,
    1,
    2,
    { skipped: ['profile', 'team'], dismissed: false },
  )
  const show = shouldShowChecklist(items, false)
  assert.equal(show, false)
})

test('Checklist: shouldShowChecklist returns true when there are incomplete items', () => {
  const items = computeChecklistItems(
    mockFirm(),
    0,
    0,
    1,
    { skipped: [], dismissed: false },
  )
  const show = shouldShowChecklist(items, false)
  assert.equal(show, true)
})
