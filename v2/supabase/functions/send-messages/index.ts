import { sendMessages } from './handler.ts'
import { transportFromEnv } from './transport.ts'
import { pgStore } from '../advance/pgStore.ts'
import { readAppUrl } from '../_shared/comms/render.ts'

// Both throw at boot on a missing or malformed setting (spec §8: the key is read from env and validated at startup).
const transport = transportFromEnv((k) => Deno.env.get(k))
const appUrl = readAppUrl(Deno.env.get('APP_URL'))
const store = pgStore(Deno.env.get('SUPABASE_DB_URL')!)
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  const secret = Deno.env.get('CRON_SECRET') ?? ''
  try {
    const authorised = secret.length >= 16 && req.headers.get('Authorization') === `Bearer ${secret}`
    const res = await sendMessages({ authorised, store, transport, now: () => new Date(), appUrl })
    return json(res.status, res.body)
  } catch (e) {
    console.error('send-messages failed', e)
    return json(500, { error: 'Sending failed.' })
  }
})
