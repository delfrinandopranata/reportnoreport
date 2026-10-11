import postgres from 'npm:postgres@3.4.5'
import { handleUnsubscribe, type UnsubscribeStore } from './handler.ts'
import { readUnsubscribeConfig } from '../_shared/comms/campaign.ts'

const { secret } = readUnsubscribeConfig(Deno.env.get('UNSUBSCRIBE_URL'), Deno.env.get('UNSUBSCRIBE_SECRET')) // throws at boot when unset
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 2, prepare: false, onnotice: () => {} })
const store: UnsubscribeStore = {
  message: async (id) => ((await sql`
    select m.org_id, o.name as org_name, m.recipient_email::text as email from messages m join orgs o on o.id = m.org_id
    where m.id = ${id} and m.campaign_id is not null`)[0] as { org_id: string; org_name: string; email: string } | undefined) ?? null,
  isOptedOut: async (org, email) => (await sql`select 1 from email_optouts where org_id = ${org} and email = ${email}`).length > 0,
  optOut: async (org, email) => { await sql`insert into email_optouts (org_id, email, reason) values (${org}, ${email}, 'unsubscribe') on conflict do nothing` },
}
const HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; form-action 'self'", 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }

Deno.serve(async (req) => {
  try {
    const res = await handleUnsubscribe(req.method, new URL(req.url), { secret, store })
    return new Response(res.html, { status: res.status, headers: HEADERS })
  } catch (e) {
    console.error('unsubscribe failed', e)
    return new Response('<!doctype html><title>Try again</title><p>Your request did not go through. Try the link again in a minute.</p>', { status: 500, headers: HEADERS })
  }
})
