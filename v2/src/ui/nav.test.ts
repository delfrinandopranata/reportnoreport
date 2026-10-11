import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jumpItems, matchJump, navGroups, phoneItems, type NavPerms } from './nav.ts'

const none: NavPerms = { reports: false, workflows: false, comms: false, broadcast: false, roles: false }
const all: NavPerms = { reports: true, workflows: true, comms: true, broadcast: true, roles: true }
const labels = (page: Parameters<typeof navGroups>[0], p: NavPerms) => navGroups(page, p).map((g) => [g.label, g.items.map((i) => i.label)])

test('a member without extra permissions sees what the old header showed', () => {
  assert.deepEqual(labels('inbox', none), [['Work', ['Inbox', 'Records']], ['Build', ['Forms']], ['Admin', ['Members']]])
})

test('every permission adds its page to its group', () => {
  assert.deepEqual(labels('inbox', all), [
    ['Work', ['Inbox', 'Records', 'Dashboard', 'Reports']],
    ['Build', ['Forms', 'Workflows', 'Templates', 'Campaigns']],
    ['Admin', ['Members', 'Roles', 'Messages']],
  ])
  assert.deepEqual(labels('inbox', { ...none, broadcast: true })[1], ['Build', ['Forms', 'Campaigns']])
})

test('the current item matches the old header rules', () => {
  const current = (page: Parameters<typeof navGroups>[0]) => navGroups(page, all).flatMap((g) => g.items).filter((i) => i.current).map((i) => i.label)
  assert.deepEqual(current('task'), ['Inbox'])
  assert.deepEqual(current('start'), ['Inbox'])
  assert.deepEqual(current('record'), ['Records'])
  assert.deepEqual(current('form-fill'), ['Forms'])
  assert.deepEqual(current('workflow-report'), ['Workflows'])
  assert.deepEqual(current('template'), ['Templates'])
  assert.deepEqual(current('campaign'), ['Campaigns'])
  assert.deepEqual(current('settings'), [])
})

test('phones get the first four pages; the jump bar offers every page plus Settings', () => {
  assert.deepEqual(phoneItems(navGroups('inbox', all)).map((i) => i.label), ['Inbox', 'Records', 'Dashboard', 'Reports'])
  assert.deepEqual(phoneItems(navGroups('inbox', none)).map((i) => i.label), ['Inbox', 'Records', 'Forms', 'Members'])
  const items = jumpItems(navGroups('inbox', none))
  assert.deepEqual(items.map((i) => i.label), ['Inbox', 'Records', 'Forms', 'Members', 'Settings'])
  assert.deepEqual(matchJump(items, '  REC ').map((i) => i.href), ['#/records'])
  assert.equal(matchJump(items, '').length, 5)
  assert.deepEqual(matchJump(items, 'campaigns'), []) // not offered without comms.broadcast
})
