import { assert, assertEquals } from 'jsr:@std/assert@1'
import { handleUnsubscribe, type UnsubscribeStore } from './handler.ts'
import { unsubscribeLink } from '../_shared/comms/campaign.ts'

const SECRET = 'a-local-unsubscribe-secret-of-32+chars'
const BASE = 'http://127.0.0.1:54321/functions/v1/unsubscribe'
const M1 = '00000000-0000-4000-8000-000000000001'
const ORG = '0000000a-0000-0000-0000-000000000001'

function store(name = 'Alpha School') {
  const out = new Set<string>()
  const s: UnsubscribeStore = {
    message: async (id) => (id === M1 ? { org_id: ORG, org_name: name, email: 'ada@example.test' } : null),
    isOptedOut: async (org, email) => out.has(`${org}:${email}`),
    optOut: async (org, email) => { out.add(`${org}:${email}`) },
  }
  return { s, out }
}
const token = async (id = M1) => new URL(await unsubscribeLink(BASE, SECRET, id)).searchParams.get('t')!
const run = (method: string, t: string | null, body: unknown, s: UnsubscribeStore) =>
  handleUnsubscribe(method, t, body, { secret: SECRET, store: s })

Deno.test('GET names the organisation and unsubscribes nobody', async () => {
  const { s, out } = store()
  assertEquals(await run('GET', await token(), undefined, s), { status: 200, body: { valid: true, org: 'Alpha School', already: false } })
  assertEquals(out.size, 0) // mail scanners open links; only a POST unsubscribes
})

Deno.test('POST with a JSON token, or a form-encoded one-click, unsubscribes; a forged token is refused', async () => {
  const { s, out } = store()
  assertEquals(await run('POST', null, { t: await token() }, s), { status: 200, body: { done: true, org: 'Alpha School' } })
  assertEquals([...out], [`${ORG}:ada@example.test`])
  const one = store()
  // RFC 8058: the token stays in the URL query and the body is the fixed form field
  assertEquals((await run('POST', await token(), 'List-Unsubscribe=One-Click', one.s)).body, { done: true, org: 'Alpha School' })
  assertEquals(one.out.size, 1)
  const bad = store()
  for (const forged of ['x', `${M1}.${'A'.repeat(43)}`, '']) {
    const r = await run('POST', null, { t: forged }, bad.s)
    assertEquals(r.status, 400)
  }
  assertEquals((await run('GET', null, undefined, bad.s)).status, 400)
  assertEquals(bad.out.size, 0)
})

Deno.test('an address already unsubscribed is told so; an unknown message is 404; other methods 405', async () => {
  const { s } = store()
  await run('POST', null, { t: await token() }, s)
  assertEquals((await run('GET', await token(), undefined, s)).body, { valid: true, org: 'Alpha School', already: true })
  assertEquals((await run('GET', await token('00000000-0000-4000-8000-000000000009'), undefined, s)).status, 404)
  assertEquals((await run('PUT', await token(), undefined, s)).status, 405)
})

Deno.test('responses are data only and never show an address or say we', async () => {
  const { s } = store('<script>alert(1)</script> & Co')
  const ok = await run('GET', await token(), undefined, s)
  assertEquals((ok.body as { org: string }).org, '<script>alert(1)</script> & Co') // JSON: the page escapes it, not the function
  const all = JSON.stringify([ok, await run('GET', 'x', undefined, s), await run('GET', await token('00000000-0000-4000-8000-000000000009'), undefined, s), await run('PUT', null, undefined, s)])
  assert(!all.includes('ada@example.test'))
  assert(!/\bwe\b/i.test(all))
})
