import { assertEquals } from 'jsr:@std/assert@1'
import { MAX_BODY, handleWebhook, type Deps } from './handler.ts'
import { readWebhookSecret, signWebhook, type TrackingEvent } from '../_shared/comms/webhook.ts'

const SECRET = readWebhookSecret('whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw')
const NOW = new Date('2026-10-11T12:00:00Z')
const TS = String(NOW.getTime() / 1000)
const event = (type: string, id = 'rs_1') => JSON.stringify({ type, created_at: '2026-10-11T11:58:00.000Z', data: { email_id: id } })
async function signed(body: string, over: Record<string, string> = {}) {
  return new Headers({ 'svix-id': 'msg_1', 'svix-timestamp': TS, 'svix-signature': await signWebhook(SECRET, 'msg_1', TS, body), ...over })
}
function deps(matched = true) {
  const applied: TrackingEvent[] = []
  const d: Deps = { secret: SECRET, now: () => NOW, apply: (e) => { applied.push(e); return Promise.resolve(matched) } }
  return { d, applied }
}

Deno.test('unsigned and badly signed requests are 401 and write nothing', async () => {
  const { d, applied } = deps()
  const body = event('email.opened')
  const stale = String(NOW.getTime() / 1000 - 600)
  const cases = [
    new Headers(),
    await signed(body, { 'svix-signature': 'v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' }),
    await signed(event('email.opened', 'rs_2')), // signed for another body
    new Headers({ 'svix-id': 'msg_1', 'svix-timestamp': stale, 'svix-signature': await signWebhook(SECRET, 'msg_1', stale, body) }),
  ]
  for (const h of cases) assertEquals(await handleWebhook(h, body, d), { status: 401, body: { error: 'Not allowed.' } })
  assertEquals(applied.length, 0)
})

Deno.test('a signed open is applied with delivery and its own time', async () => {
  const { d, applied } = deps()
  const body = event('email.opened')
  assertEquals(await handleWebhook(await signed(body), body, d), { status: 200, body: { matched: true } })
  assertEquals(applied, [{ providerId: 'rs_1', columns: ['delivered_at', 'opened_at'], at: new Date('2026-10-11T11:58:00.000Z'), complaint: false }])
})

Deno.test('an unknown message is 200 so Resend does not retry it', async () => {
  const { d } = deps(false)
  const body = event('email.delivered', 'rs_other_env')
  assertEquals(await handleWebhook(await signed(body), body, d), { status: 200, body: { matched: false } })
})

Deno.test('other types are ignored, a signed non-event is 400, an oversized body is 413', async () => {
  const { d, applied } = deps()
  const sent = event('email.sent')
  assertEquals(await handleWebhook(await signed(sent), sent, d), { status: 200, body: { ignored: true } })
  const junk = '{"hello":'
  assertEquals(await handleWebhook(await signed(junk), junk, d), { status: 400, body: { error: 'Not a Resend event.' } })
  const big = 'x'.repeat(MAX_BODY + 1)
  assertEquals((await handleWebhook(await signed(big), big, d)).status, 413)
  assertEquals(applied.length, 0)
})
