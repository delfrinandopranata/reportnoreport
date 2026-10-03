import { assertEquals } from 'jsr:@std/assert'
import { verify, SIGNATURE_HEADER } from './verify.ts'

async function generateSignature(secret: string, timestamp: number, body: string): Promise<string> {
  const signedContent = `${timestamp}.${body}`
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const messageData = encoder.encode(signedContent)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
  const hex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  return hex
}

Deno.test('verify: valid signature passes', async () => {
  const secret = 'whsec_test123'
  const timestamp = Math.floor(Date.now() / 1000)
  const body = '{"id":"evt_test","type":"charge.refunded"}'

  const hex = await generateSignature(secret, timestamp, body)
  const headerValue = `t=${timestamp},v1=${hex}`
  const result = await verify(headerValue, body, secret)
  assertEquals(result, true)
})

Deno.test('verify: tampered body fails', async () => {
  const secret = 'whsec_test123'
  const timestamp = Math.floor(Date.now() / 1000)
  const body = '{"id":"evt_test","type":"charge.refunded"}'

  const hex = await generateSignature(secret, timestamp, body)
  const headerValue = `t=${timestamp},v1=${hex}`

  // Try to verify with a different body
  const tamperedBody = '{"id":"evt_test","type":"charge.refunded","extra":"data"}'
  const result = await verify(headerValue, tamperedBody, secret)
  assertEquals(result, false)
})

Deno.test('verify: wrong secret fails', async () => {
  const secret = 'whsec_test123'
  const wrongSecret = 'whsec_wrong456'
  const timestamp = Math.floor(Date.now() / 1000)
  const body = '{"id":"evt_test","type":"charge.refunded"}'

  const hex = await generateSignature(secret, timestamp, body)
  const headerValue = `t=${timestamp},v1=${hex}`

  const result = await verify(headerValue, body, wrongSecret)
  assertEquals(result, false)
})

Deno.test('verify: timestamp older than 300s fails', async () => {
  const secret = 'whsec_test123'
  const oldTimestamp = Math.floor(Date.now() / 1000) - 400
  const body = '{"id":"evt_test","type":"charge.refunded"}'

  const hex = await generateSignature(secret, oldTimestamp, body)
  const headerValue = `t=${oldTimestamp},v1=${hex}`

  const result = await verify(headerValue, body, secret)
  assertEquals(result, false)
})

Deno.test('verify: missing header fails', async () => {
  const result = await verify('', '{"id":"evt_test"}', 'whsec_test123')
  assertEquals(result, false)
})

Deno.test('verify: malformed header fails', async () => {
  const result = await verify('invalid_header', '{"id":"evt_test"}', 'whsec_test123')
  assertEquals(result, false)
})

Deno.test('verify: missing v1 fails', async () => {
  const timestamp = Math.floor(Date.now() / 1000)
  const headerValue = `t=${timestamp}`
  const result = await verify(headerValue, '{"id":"evt_test"}', 'whsec_test123')
  assertEquals(result, false)
})

Deno.test('verify: multiple v1 entries where one is valid passes', async () => {
  const secret = 'whsec_test123'
  const timestamp = Math.floor(Date.now() / 1000)
  const body = '{"id":"evt_test","type":"charge.refunded"}'

  const validHex = await generateSignature(secret, timestamp, body)
  const headerValue = `t=${timestamp},v1=wronghash,v1=${validHex}`

  const result = await verify(headerValue, body, secret)
  assertEquals(result, true)
})

Deno.test('verify: timestamp within 300s passes', async () => {
  const secret = 'whsec_test123'
  const recentTimestamp = Math.floor(Date.now() / 1000) - 299
  const body = '{"id":"evt_test","type":"charge.refunded"}'

  const hex = await generateSignature(secret, recentTimestamp, body)
  const headerValue = `t=${recentTimestamp},v1=${hex}`

  const result = await verify(headerValue, body, secret)
  assertEquals(result, true)
})

Deno.test('reads the header Stripe actually sends', () => {
  // Stripe sends `Stripe-Signature`; an `x-stripe-signature` lookup rejected every real event.
  assertEquals(SIGNATURE_HEADER, 'stripe-signature')
  assertEquals(new Headers({ 'Stripe-Signature': 't=1,v1=a' }).get(SIGNATURE_HEADER), 't=1,v1=a')
})
