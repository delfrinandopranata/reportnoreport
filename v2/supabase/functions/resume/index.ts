import { resume } from './handler.ts'
import { readAppUrl } from '../_shared/comms/render.ts'
import { pgStore } from '../advance/pgStore.ts'

const store = pgStore(Deno.env.get('SUPABASE_DB_URL')!)
const appUrl = readAppUrl(Deno.env.get('APP_URL'))
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  const secret = Deno.env.get('CRON_SECRET') ?? ''
  try {
    const res = await resume({ authorised: secret.length >= 16 && req.headers.get('Authorization') === `Bearer ${secret}`, store, now: () => new Date(), appUrl })
    return json(res.status, res.body)
  } catch (e) {
    console.error('resume failed', e)
    return json(500, { error: 'Resume failed.' })
  }
})
