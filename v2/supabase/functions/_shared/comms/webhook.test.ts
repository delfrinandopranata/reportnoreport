import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TRACKING, readTrackingEvent, readWebhookSecret, signWebhook, verifyWebhook } from './webhook.ts'

const SECRET = readWebhookSecret('whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw') // a fixture, not a real secret
const NOW = new Date('2026-10-11T12:00:00Z')
const TS = String(NOW.getTime() / 1000)
const BODY = JSON.stringify({ type: 'email.opened', created_at: '2026-10-11T11:59:00.000Z', data: { email_id: 'rs_1' } })

test('a signature from the same secret verifies, any change is refused', async () => {
  const signature = await signWebhook(SECRET, 'msg_1', TS, BODY)
  assert.match(signature, /^v1,[A-Za-z0-9+/]{43}=$/)
  assert.equal(await verifyWebhook(SECRET, { id: 'msg_1', timestamp: TS, signature }, BODY, NOW), true)
  assert.equal(await verifyWebhook(SECRET, { id: 'msg_1', timestamp: TS, signature }, BODY.replace('rs_1', 'rs_2'), NOW), false)
  assert.equal(await verifyWebhook(SECRET, { id: 'msg_2', timestamp: TS, signature }, BODY, NOW), false)
  assert.equal(await verifyWebhook(readWebhookSecret('whsec_b3RoZXItc2VjcmV0LW9mLXNpeHRlZW4='), { id: 'msg_1', timestamp: TS, signature }, BODY, NOW), false)
  for (const h of [{ id: null, timestamp: TS, signature }, { id: 'msg_1', timestamp: null, signature }, { id: 'msg_1', timestamp: TS, signature: null }, { id: 'msg_1', timestamp: TS, signature: 'v1,' }]) {
    assert.equal(await verifyWebhook(SECRET, h, BODY, NOW), false)
  }
})

test('a stale or future timestamp is refused', async () => {
  for (const offset of [-301, 301]) {
    const ts = String(NOW.getTime() / 1000 + offset)
    assert.equal(await verifyWebhook(SECRET, { id: 'msg_1', timestamp: ts, signature: await signWebhook(SECRET, 'msg_1', ts, BODY) }, BODY, NOW), false)
  }
  assert.equal(await verifyWebhook(SECRET, { id: 'msg_1', timestamp: '1e9', signature: 'v1,x' }, BODY, NOW), false)
})

test('several signatures: any match passes', async () => {
  const good = await signWebhook(SECRET, 'msg_1', TS, BODY)
  assert.equal(await verifyWebhook(SECRET, { id: 'msg_1', timestamp: TS, signature: `v1,AAAA ${good}` }, BODY, NOW), true)
})

test('reads tracking events; an open proves delivery, a click proves both', () => {
  assert.deepEqual(readTrackingEvent(JSON.parse(BODY), NOW), { providerId: 'rs_1', columns: ['delivered_at', 'opened_at'], at: new Date('2026-10-11T11:59:00.000Z'), complaint: false })
  assert.deepEqual(TRACKING['email.clicked'], ['delivered_at', 'opened_at', 'clicked_at'])
  const complained = readTrackingEvent({ type: 'email.complained', created_at: 'garbage', data: { email_id: 'rs_9' } }, NOW)
  assert.deepEqual(complained, { providerId: 'rs_9', columns: ['complained_at'], at: NOW, complaint: true })
  const future = readTrackingEvent({ type: 'email.delivered', created_at: '2026-10-12T00:00:00Z', data: { email_id: 'rs_1' } }, NOW)
  assert.equal('at' in future && future.at.getTime(), NOW.getTime())
})

test('other event types are ignored and malformed ones ignored with a reason, never thrown or refused', () => {
  const NOT_TRACKED = { ignored: 'This event type is not tracked.' }
  assert.deepEqual(readTrackingEvent({ type: 'email.sent', data: { email_id: 'rs_1' } }, NOW), NOT_TRACKED)
  assert.deepEqual(readTrackingEvent({ type: 'toString', data: { email_id: 'rs_1' } }, NOW), NOT_TRACKED)
  // Resend also signs events with no email_id (domain.*, contact.*): ignoring them is what stops Resend retrying
  assert.deepEqual(readTrackingEvent({ type: 'domain.updated', data: { id: 'd_1' } }, NOW), NOT_TRACKED)
  assert.deepEqual(readTrackingEvent({ type: 'domain.updated' }, NOW), NOT_TRACKED)
  for (const bad of [null, [], 'text', 7, {}, { type: 5 }]) {
    assert.deepEqual(readTrackingEvent(bad, NOW), { ignored: 'This is not a Resend event.' })
  }
  for (const bad of [{ type: 'email.opened' }, { type: 'email.opened', data: null }, { type: 'email.opened', data: {} },
    { type: 'email.opened', data: { email_id: 5 } }, { type: 'email.opened', data: { email_id: 'a b' } }, { type: 'email.opened', data: { email_id: 'x'.repeat(101) } }]) {
    assert.deepEqual(readTrackingEvent(bad, NOW), { ignored: 'This event has no usable email id.' })
  }
})

test('readWebhookSecret accepts whsec_ secrets only', () => {
  assert.equal(SECRET.length, 24)
  for (const bad of [undefined, '', 'MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw', 'whsec_short', 'whsec_not base64 at all!!']) {
    assert.throws(() => readWebhookSecret(bad), /RESEND_WEBHOOK_SECRET/)
  }
})
