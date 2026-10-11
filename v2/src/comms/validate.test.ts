import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateTemplate } from './validate.ts'

const ok = { name: 'Welcome', channel: 'email' as const, subject: 'Hi', body: 'Hello' }

test('a complete template has no problems', () => {
  assert.deepEqual(validateTemplate(ok), {})
})
test('each blank field says what to do, in field order', () => {
  const e = validateTemplate({ ...ok, name: '  ', subject: '', body: '\n' })
  assert.deepEqual(e, { name: 'Enter a name for this template.', subject: 'Enter a subject.', body: 'Write a message.' })
  assert.deepEqual(Object.keys(e), ['name', 'subject', 'body'])
})
test('too-long fields name the limit', () => {
  const e = validateTemplate({ ...ok, name: 'n'.repeat(121), subject: 's'.repeat(201), body: 'b'.repeat(10001) })
  assert.equal(e.name, 'Shorten the name to 120 characters or fewer.')
  assert.equal(e.subject, 'Shorten the subject to 200 characters or fewer.')
  assert.equal(e.body, 'Shorten the message to 10,000 characters or fewer.')
})
test('the limits themselves are allowed', () => {
  assert.deepEqual(validateTemplate({ ...ok, name: 'n'.repeat(120), subject: 's'.repeat(200), body: 'b'.repeat(10000) }), {})
})
