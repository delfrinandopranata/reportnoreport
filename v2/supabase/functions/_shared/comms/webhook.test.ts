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
  assert.equal(future !== 'ignored' && future?.at.getTime(), NOW.getTime())
})

test('other event types are ignored and malformed ones refused', () => {
  assert.equal(readTrackingEvent({ type: 'email.sent', data: { email_id: 'rs_1' } }, NOW), 'ignored')
  assert.equal(readTrackingEvent({ type: 'toString', data: { email_id: 'rs_1' } }, NOW), 'ignored')
  for (const bad of [null, [], { type: 'email.opened' }, { type: 'email.opened', data: {} }, { type: 'email.opened', data: { email_id: 'a b' } }]) {
    assert.equal(readTrackingEvent(bad, NOW), null)
  }
})

test('readWebhookSecret accepts whsec_ secrets only', () => {
  assert.equal(SECRET.length, 24)
  for (const bad of [undefined, '', 'MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw', 'whsec_short', 'whsec_not base64 at all!!']) {
    assert.throws(() => readWebhookSecret(bad), /RESEND_WEBHOOK_SECRET/)
  }
})
