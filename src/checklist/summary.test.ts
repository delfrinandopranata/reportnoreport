import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { summarise, type ChecklistItem } from './summary.ts'

test('summarise: groups items by state', () => {
  const items: ChecklistItem[] = [
    {
      id: '1',
      title: 'Complete firm profile',
      description: 'Add phone, email, and address',
      href: '/settings/profile',
      state: 'done',
    },
    {
      id: '2',
      title: 'Invite team',
      description: 'Add team members with roles',
      href: '/settings/users',
      state: 'todo',
    },
    {
      id: '3',
      title: 'Add a client',
      description: 'Create a client record',
      href: '/clients/new',
      state: 'skipped',
    },
    {
      id: '4',
      title: 'Record a transaction',
      description: 'Post a receipt or payment',
      href: '/transactions/new',
      state: 'todo',
    },
  ]

  const summary = summarise(items)

  assert.equal(summary.doneCount, 1, 'should count 1 done item')
  assert.equal(summary.totalCount, 4, 'should count 4 total items')
  assert.equal(summary.todoItems.length, 2, 'should have 2 todo items')
  assert.equal(summary.doneItems.length, 1, 'should have 1 done item')
  assert.equal(summary.skippedItems.length, 1, 'should have 1 skipped item')
})

test('summarise: doneItems in order', () => {
  const items: ChecklistItem[] = [
    { id: '1', title: 'First', description: '', href: '#', state: 'done' },
    { id: '2', title: 'Second', description: '', href: '#', state: 'todo' },
    { id: '3', title: 'Third', description: '', href: '#', state: 'done' },
  ]

  const summary = summarise(items)
  assert.deepEqual(
    summary.doneItems.map((i) => i.id),
    ['1', '3'],
    'should preserve order within done items'
  )
})

test('summarise: empty items', () => {
  const summary = summarise([])
  assert.equal(summary.doneCount, 0)
  assert.equal(summary.totalCount, 0)
  assert.equal(summary.todoItems.length, 0)
  assert.equal(summary.doneItems.length, 0)
  assert.equal(summary.skippedItems.length, 0)
})

test('summarise: all states identical', () => {
  const items: ChecklistItem[] = [
    { id: '1', title: 'A', description: '', href: '#', state: 'todo' },
    { id: '2', title: 'B', description: '', href: '#', state: 'todo' },
  ]

  const summary = summarise(items)
  assert.equal(summary.doneCount, 0)
  assert.equal(summary.todoItems.length, 2)
  assert.equal(summary.doneItems.length, 0)
  assert.equal(summary.skippedItems.length, 0)
})

test('summarise: all items done', () => {
  const items: ChecklistItem[] = [
    { id: '1', title: 'Complete profile', description: '', href: '#', state: 'done' },
    { id: '2', title: 'Invite team', description: '', href: '#', state: 'done' },
    { id: '3', title: 'Add client', description: '', href: '#', state: 'done' },
    { id: '4', title: 'Record transaction', description: '', href: '#', state: 'done' },
  ]

  const summary = summarise(items)
  assert.equal(summary.doneCount, 4)
  assert.equal(summary.totalCount, 4)
  assert.equal(summary.todoItems.length, 0)
  assert.equal(summary.doneItems.length, 4)
  assert.equal(summary.skippedItems.length, 0)
})

test('summarise: all items skipped', () => {
  const items: ChecklistItem[] = [
    { id: '1', title: 'Complete profile', description: '', href: '#', state: 'skipped' },
    { id: '2', title: 'Invite team', description: '', href: '#', state: 'skipped' },
    { id: '3', title: 'Add client', description: '', href: '#', state: 'skipped' },
    { id: '4', title: 'Record transaction', description: '', href: '#', state: 'skipped' },
  ]

  const summary = summarise(items)
  assert.equal(summary.doneCount, 0)
  assert.equal(summary.totalCount, 4)
  assert.equal(summary.todoItems.length, 0)
  assert.equal(summary.doneItems.length, 0)
  assert.equal(summary.skippedItems.length, 4)
})
