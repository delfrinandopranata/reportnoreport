import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { mailpitTransport, resendTransport, transportFromEnv } from './transport.ts'

const KEY = 're_test_0123456789abcdefABCDEF'
const FROM = 'ReportNoReport <noreply@reportnoreport.com>'
const mail = { id: '00000000-0000-4000-8000-000000000001', to: 'ada@example.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' }
type Call = { url: string; init: RequestInit }
const fake = (status: number, body: unknown, calls: Call[] = []) => {
  const f = (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init! }); return Promise.resolve(new Response(JSON.stringify(body), { status })) }
  return f as typeof fetch
}

Deno.test('resend: posts the message with the key and an idempotency key per message', async () => {
  const calls: Call[] = []
  const res = await resendTransport(KEY, FROM, fake(200, { id: 'rs_1' }, calls)).send(mail)
  assertEquals(res, { ok: true, providerId: 'rs_1' })
  assertEquals(calls[0].url, 'https://api.resend.com/emails')
  const h = new Headers(calls[0].init.headers)
  assertEquals([h.get('authorization'), h.get('idempotency-key')], [`Bearer ${KEY}`, mail.id])
  assertEquals(JSON.parse(String(calls[0].init.body)), { from: FROM, to: ['ada@example.com'], subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' })
})
Deno.test('resend: 429 and 5xx are retryable; other refusals are final; errors never echo the key', async () => {
  assertEquals(await resendTransport(KEY, FROM, fake(429, { message: 'Too many requests' })).send(mail),
    { ok: false, retry: true, rateLimited: true, error: 'The email service refused this message: Too many requests' })
  assertEquals((await resendTransport(KEY, FROM, fake(503, {})).send(mail)), { ok: false, retry: true, error: 'The email service refused this message: HTTP 503' })
  const final = await resendTransport(KEY, FROM, fake(422, { message: 'Invalid `to` field.' })).send(mail)
  assertEquals(final, { ok: false, retry: false, error: 'The email service refused this message: Invalid `to` field.' })
})
Deno.test('mailpit: posts to the send API in Mailpit\'s shape', async () => {
  const calls: Call[] = []
  const res = await mailpitTransport('http://host.docker.internal:54324/', FROM, fake(200, { ID: 'mp_1' }, calls)).send(mail)
  assertEquals(res, { ok: true, providerId: 'mp_1' })
  assertEquals(calls[0].url, 'http://host.docker.internal:54324/api/v1/send')
  assertEquals(JSON.parse(String(calls[0].init.body)), {
    From: { Email: 'noreply@reportnoreport.com', Name: 'ReportNoReport' }, To: [{ Email: 'ada@example.com' }], Subject: 'Hi', HTML: '<p>Hi</p>', Text: 'Hi',
  })
})
Deno.test('configuration is checked at boot and a bad value stops the function', () => {
  const env = (vars: Record<string, string>) => (k: string) => vars[k]
  assertEquals(typeof transportFromEnv(env({ EMAIL_TRANSPORT: 'mailpit', EMAIL_FROM: FROM })).send, 'function')
  assertEquals(typeof transportFromEnv(env({ EMAIL_TRANSPORT: 'resend', EMAIL_FROM: FROM, RESEND_API_KEY: KEY })).send, 'function')
  assertThrows(() => transportFromEnv(env({ EMAIL_FROM: FROM })), Error, 'EMAIL_TRANSPORT must be "resend" or "mailpit".')
  assertThrows(() => transportFromEnv(env({ EMAIL_TRANSPORT: 'mailpit', EMAIL_FROM: 'not an address' })), Error, 'EMAIL_FROM')
  assertThrows(() => transportFromEnv(env({ EMAIL_TRANSPORT: 'resend', EMAIL_FROM: FROM })), Error, 'RESEND_API_KEY is missing or malformed.')
  const err = assertThrows(() => transportFromEnv(env({ EMAIL_TRANSPORT: 'resend', EMAIL_FROM: FROM, RESEND_API_KEY: 'sk_live_secret' })))
  assertEquals((err as Error).message.includes('sk_live_secret'), false)
})

Deno.test('resend and mailpit pass extra headers through', async () => {
  const headers = { 'List-Unsubscribe': '<https://x.test/u?m=1&t=2>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
  const rc: Call[] = []
  await resendTransport(KEY, FROM, fake(200, { id: 'rs_1' }, rc)).send({ ...mail, headers })
  assertEquals(JSON.parse(String(rc[0].init.body)).headers, headers)
  const mc: Call[] = []
  await mailpitTransport('http://mailpit.test', FROM, fake(200, { ID: 'mp_1' }, mc)).send({ ...mail, headers })
  assertEquals(JSON.parse(String(mc[0].init.body)).Headers, headers)
  const plain: Call[] = []
  await resendTransport(KEY, FROM, fake(200, { id: 'rs_2' }, plain)).send(mail)
  assertEquals('headers' in JSON.parse(String(plain[0].init.body)), false)
})
