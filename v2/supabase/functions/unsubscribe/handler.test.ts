import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1'
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
const link = async (id = M1) => new URL(await unsubscribeLink(BASE, SECRET, id))

Deno.test('GET shows a confirmation and unsubscribes nobody', async () => {
  const { s, out } = store()
  const page = await handleUnsubscribe('GET', await link(), { secret: SECRET, store: s })
  assertEquals(page.status, 200)
  assertMatch(page.html, /<form method="post">/)
  assertMatch(page.html, /<button type="submit">Unsubscribe<\/button>/)
  assertEquals(out.size, 0) // mail scanners open links; only the button unsubscribes
})

Deno.test('one-click POST unsubscribes, a forged token is refused', async () => {
  const { s, out } = store()
  const page = await handleUnsubscribe('POST', await link(), { secret: SECRET, store: s })
  assertEquals(page.status, 200)
  assertMatch(page.html, /You are unsubscribed from Alpha School campaign emails\./)
  assertEquals([...out], [`${ORG}:ada@example.test`])
  const forged = await link()
  forged.searchParams.set('t', 'A'.repeat(43))
  const refused = await handleUnsubscribe('POST', forged, { secret: SECRET, store: s })
  assertEquals(refused.status, 400)
  const noToken = new URL(`${BASE}?m=${M1}`)
  assertEquals((await handleUnsubscribe('GET', noToken, { secret: SECRET, store: s })).status, 400)
})

Deno.test('an address already unsubscribed is told so; an unknown message is 404; other methods 405', async () => {
  const { s } = store()
  await handleUnsubscribe('POST', await link(), { secret: SECRET, store: s })
  const again = await handleUnsubscribe('GET', await link(), { secret: SECRET, store: s })
  assertMatch(again.html, /You are already unsubscribed/)
  const unknown = await handleUnsubscribe('GET', await link('00000000-0000-4000-8000-000000000009'), { secret: SECRET, store: s })
  assertEquals(unknown.status, 404)
  assertEquals((await handleUnsubscribe('PUT', await link(), { secret: SECRET, store: s })).status, 405)
})

Deno.test('the page escapes the organisation name, shows no address and never says we', async () => {
  const { s } = store('<script>alert(1)</script> & Co')
  const page = await handleUnsubscribe('GET', await link(), { secret: SECRET, store: s })
  assertMatch(page.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; Co/)
  assert(!page.html.includes('<script>'))
  assert(!page.html.includes('ada@example.test'))
  assert(!/\bwe\b/i.test(page.html))
})
