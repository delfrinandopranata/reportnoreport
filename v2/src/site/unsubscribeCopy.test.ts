import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyFor, readReply, tokenFrom, unsubscribeUrl } from './unsubscribeCopy.ts'

test('the token is read from ?t= and nothing else', () => {
  assert.equal(tokenFrom('?t=abc.def'), 'abc.def')
  assert.equal(tokenFrom('?x=1'), null)
  assert.equal(tokenFrom(''), null)
  assert.equal(tokenFrom('?t='), null)
})

test('the function URL comes from the same env as the app and carries the token encoded', () => {
  assert.equal(unsubscribeUrl('http://127.0.0.1:54321/', 'a b.c'), 'http://127.0.0.1:54321/functions/v1/unsubscribe?t=a%20b.c')
  assert.equal(unsubscribeUrl(undefined, 'x'), null)
  assert.equal(unsubscribeUrl('', 'x'), null)
})

test('replies map to states: confirm, already, done and the four refusals', () => {
  assert.deepEqual(readReply('GET', 200, { valid: true, org: 'Alpha School', already: false }), { kind: 'confirm', org: 'Alpha School' })
  assert.deepEqual(readReply('GET', 200, { valid: true, org: 'Alpha School', already: true }), { kind: 'already', org: 'Alpha School' })
  assert.deepEqual(readReply('POST', 200, { done: true, org: 'Alpha School' }), { kind: 'done', org: 'Alpha School' })
  assert.deepEqual(readReply('GET', 400, { error: 'x' }), { kind: 'invalid' })
  assert.deepEqual(readReply('GET', 404, { error: 'x' }), { kind: 'gone' })
  assert.deepEqual(readReply('GET', 500, { error: 'x' }), { kind: 'error' })
  assert.deepEqual(readReply('GET', 405, { error: 'x' }), { kind: 'error' })
  assert.deepEqual(readReply('GET', 200, { surprise: 1 }), { kind: 'error' })
  assert.deepEqual(readReply('GET', 200, null), { kind: 'error' })
  assert.deepEqual(readReply('POST', 200, { valid: true, org: 'A', already: false }), { kind: 'error' })
})

test('every state has a heading that names the organisation, and none shows an address or says we', () => {
  const org = 'Alpha School'
  assert.deepEqual(copyFor({ kind: 'checking' }), { title: 'Checking your link', body: 'One moment.', action: null })
  assert.deepEqual(copyFor({ kind: 'confirm', org }), {
    title: 'Unsubscribe from Alpha School campaign emails',
    body: 'Stop receiving campaign emails from Alpha School? Emails about your own tasks and records still arrive.', action: 'Unsubscribe' })
  assert.equal(copyFor({ kind: 'already', org }).title, 'You are already unsubscribed')
  assert.equal(copyFor({ kind: 'already', org }).body, 'You are already unsubscribed from Alpha School campaign emails.')
  assert.equal(copyFor({ kind: 'done', org }).title, 'You are unsubscribed')
  assert.match(copyFor({ kind: 'done', org }).body, /^You are unsubscribed from Alpha School campaign emails\. Emails about your own tasks and records still arrive\. If you have a ReportNoReport account, you can turn campaign emails back on in Settings\.$/)
  assert.equal(copyFor({ kind: 'invalid' }).title, 'This link is not valid')
  assert.equal(copyFor({ kind: 'gone' }).title, 'This link no longer works')
  assert.equal(copyFor({ kind: 'error' }).title, 'Try again later')
  for (const s of [{ kind: 'checking' }, { kind: 'confirm', org }, { kind: 'already', org }, { kind: 'done', org }, { kind: 'invalid' }, { kind: 'gone' }, { kind: 'error' }] as const) {
    const c = copyFor(s)
    assert.doesNotMatch(`${c.title} ${c.body}`, /\bwe\b|@/i)
  }
})
