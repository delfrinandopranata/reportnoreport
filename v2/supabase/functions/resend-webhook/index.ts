import postgres from 'npm:postgres@3.4.5'
import { handleWebhook } from './handler.ts'
import { pgApply } from './pgApply.ts'
import { readWebhookSecret } from '../_shared/comms/webhook.ts'

// Throws at boot when the secret is missing or malformed, so no unverifiable request is ever accepted.
const secret = readWebhookSecret(Deno.env.get('RESEND_WEBHOOK_SECRET'))
const apply = pgApply(postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 2, prepare: false, onnotice: () => {} }))
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  try {
    const res = await handleWebhook(req.headers, await req.text(), { secret, now: () => new Date(), apply })
    return json(res.status, res.body)
  } catch (e) {
    console.error('resend-webhook failed', e) // a 500 makes Resend retry; the replay is harmless
    return json(500, { error: 'Not recorded. Resend will try again.' })
  }
})
