import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toUserMessage } from './errors.ts'

test('RLS denials explain a blocked firm', () => {
  assert.equal(
    toUserMessage({ code: '42501', message: 'new row violates row-level security policy' }, { writeBlockReason: 'The free trial ended on 17 Oct 2026.' }),
    "Your firm can't make changes right now: The free trial ended on 17 Oct 2026.",
  )
  assert.equal(toUserMessage({ code: '42501', message: 'x' }), "You don't have permission to do that.")
})

test('P0001 messages are written for people and shown as-is', () => {
  assert.equal(toUserMessage({ code: 'P0001', message: 'Row 3: bank account "X" not found.' }), 'Row 3: bank account "X" not found.')
})

test('network failures and unknown errors are plain', () => {
  assert.equal(toUserMessage(new TypeError('Failed to fetch')), "Couldn't save. Check your connection and try again.")
  assert.equal(toUserMessage({ code: '23505', message: 'duplicate key' }), 'That already exists.')
  assert.equal(toUserMessage('weird'), 'Something went wrong. Try again.')
})
