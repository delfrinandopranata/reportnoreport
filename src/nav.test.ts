import { test } from 'node:test'
import assert from 'node:assert/strict'
import { currentItem, navItems, phoneItems } from './nav.ts'

test('every role sees the same pages as before', () => {
  assert.deepEqual(navItems('owner').map((i) => i.view), ['dashboard', 'clients', 'contracts', 'users', 'settings'])
  assert.deepEqual(navItems('admin').map((i) => i.view), ['dashboard', 'clients', 'contracts', 'users', 'settings'])
  assert.deepEqual(navItems('accountant').map((i) => i.view), ['dashboard', 'clients', 'contracts', 'settings'])
  assert.deepEqual(navItems('viewer').map((i) => i.view), ['dashboard', 'clients', 'contracts', 'settings'])
})

test('phones get the three main pages; billing keeps Settings current', () => {
  assert.deepEqual(phoneItems(navItems('viewer')).map((i) => i.short), ['Dashboard', 'Clients', 'Contracts'])
  assert.equal(currentItem('billing'), 'settings')
  assert.equal(currentItem('clients'), 'clients')
})
