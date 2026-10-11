import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EMAIL_RE, MAX_RECIPIENT_RULES, readRecipient, readSendMessage, sendMessageIssue, type RecipientRefs } from './recipients.ts'

const T = '0000000a-0000-0000-0000-00000000a0e1'
const ROLE = '0000000a-0000-0000-0000-00000000a001'
const USER = '00000000-0000-0000-0000-0000000000a2'
const refs: RecipientRefs = { templates: new Set([T]), roles: new Set([ROLE]), users: new Set([USER]), steps: new Set(['start', 'approve']) }
const action = (recipients: unknown[], templateId: unknown = T) => ({ type: 'send_message', templateId, recipients })

test('each recipient has exactly one valid key', () => {
  assert.deepEqual(readRecipient({ role: ROLE }), { role: ROLE })
  assert.deepEqual(readRecipient({ starter: true }), { starter: true })
  assert.deepEqual(readRecipient({ field: 'parent_email' }), { field: 'parent_email' })
  for (const bad of [null, [], {}, { role: '' }, { starter: false }, { field: 'Parent Email' }, { role: ROLE, user: USER }, { step: 'Bad Id!' }, { group: 'x' }]) {
    assert.equal(readRecipient(bad), null)
  }
})
test('a send_message action needs a template and 1 to 20 recipients', () => {
  assert.deepEqual(readSendMessage(action([{ starter: true }])), { type: 'send_message', templateId: T, recipients: [{ starter: true }] })
  assert.equal(readSendMessage(action([])), null)
  assert.equal(readSendMessage(action([{ starter: true }], '')), null)
  assert.equal(readSendMessage(action(Array.from({ length: MAX_RECIPIENT_RULES + 1 }, () => ({ starter: true })))), null)
  assert.equal(readSendMessage({ type: 'send_message' }), null)
})
test('publish check messages', () => {
  assert.equal(sendMessageIssue(action([{ starter: true }, { role: ROLE }, { user: USER }, { step: 'approve' }, { field: 'email' }]), refs), null)
  assert.equal(sendMessageIssue({ type: 'send_message' }, refs), 'Choose a message template for "Send message".')
  assert.equal(sendMessageIssue(action([{ starter: true }], 'gone'), refs), 'The message template for "Send message" no longer exists. Choose another.')
  assert.equal(sendMessageIssue(action([]), refs), 'Add at least one recipient to "Send message".')
  assert.equal(sendMessageIssue(action([{ field: '' }]), refs), 'A recipient of "Send message" is incomplete. Finish it or remove it.')
  assert.equal(sendMessageIssue(action([{ role: 'gone' }]), refs), 'A role that "Send message" sends to no longer exists.')
  assert.equal(sendMessageIssue(action([{ user: 'gone' }]), refs), 'A person that "Send message" sends to is no longer a member.')
  assert.equal(sendMessageIssue(action([{ step: 'long' }]), refs), '"Send message" can only send to the person who completed a Start or Form step.')
})
test('email addresses', () => {
  for (const ok of ['a@b.co', 'Parent.Name+tag@school.example.org']) assert.equal(EMAIL_RE.test(ok), true)
  for (const bad of ['', 'a@b', 'a b@c.co', 'a@b.co\nBcc: x@y.z', '<a@b.co>', 'a@b.co,c@d.co']) assert.equal(EMAIL_RE.test(bad), false)
})
