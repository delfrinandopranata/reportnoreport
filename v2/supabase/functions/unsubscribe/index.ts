import postgres from 'npm:postgres@3.4.5'
import { handleUnsubscribe, type UnsubscribeStore } from './handler.ts'
import { readUnsubscribeConfig } from '../_shared/comms/campaign.ts'
import { readAppUrl } from '../_shared/comms/render.ts'

const { secret } = readUnsubscribeConfig(Deno.env.get('UNSUBSCRIBE_URL'), Deno.env.get('UNSUBSCRIBE_SECRET')) // throws at boot when unset
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 2, prepare: false, onnotice: () => {} })
const store: UnsubscribeStore = {
  message: async (id) => ((await sql`
    select m.org_id, o.name as org_name, m.recipient_email::text as email from messages m join orgs o on o.id = m.org_id
    where m.id = ${id} and m.campaign_id is not null`)[0] as { org_id: string; org_name: string; email: string } | undefined) ?? null,
  isOptedOut: async (org, email) => (await sql`select 1 from email_optouts where org_id = ${org} and email = ${email}`).length > 0,
  optOut: async (org, email) => { await sql`insert into email_optouts (org_id, email, reason) values (${org}, ${email}, 'unsubscribe') on conflict do nothing` },
}
// Only the public site's page calls this from a browser; mail clients' one-click POSTs send no Origin and need no CORS.
const origin = new URL(readAppUrl(Deno.env.get('APP_URL'))).origin
const HEADERS = {
  'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': origin, Vary: 'Origin',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type',
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: HEADERS })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS })
  try {
    const type = req.headers.get('content-type') ?? ''
    const body = req.method === 'POST' ? (type.includes('json') ? await req.json().catch(() => null) : await req.text()) : undefined
    const res = await handleUnsubscribe(req.method, new URL(req.url).searchParams.get('t'), body, { secret, store })
    return json(res.status, res.body)
  } catch (e) {
    console.error('unsubscribe failed', e)
    return json(500, { error: 'Your request did not go through. Try the link again in a minute.' })
  }
})
