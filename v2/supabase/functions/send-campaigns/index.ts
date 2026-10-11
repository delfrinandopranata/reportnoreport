import { sendCampaigns } from './handler.ts'
import { pgCampaignStore } from './pgStore.ts'
import { readUnsubscribeConfig } from '../_shared/comms/campaign.ts'

// Throws at boot on a missing or malformed setting, before any campaign is touched.
const unsubscribe = readUnsubscribeConfig(Deno.env.get('UNSUBSCRIBE_URL'), Deno.env.get('UNSUBSCRIBE_SECRET'))
const store = pgCampaignStore(Deno.env.get('SUPABASE_DB_URL')!)
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  const secret = Deno.env.get('CRON_SECRET') ?? ''
  try {
    const authorised = secret.length >= 16 && req.headers.get('Authorization') === `Bearer ${secret}`
    const res = await sendCampaigns({ authorised, store, now: () => new Date(), unsubscribe })
    return json(res.status, res.body)
  } catch (e) {
    console.error('send-campaigns failed', e)
    return json(500, { error: 'Sending did not start. It will try again in a minute.' })
  }
})
