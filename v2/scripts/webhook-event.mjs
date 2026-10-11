// Signs a Resend-style event with the shared signer and posts it to the local resend-webhook (decision 6), so delivery,
// opens, clicks, bounces and complaints can be exercised without a Resend account. Mailpit's id is the provider id.
// Usage: node --env-file=supabase/functions/.env.local scripts/webhook-event.mjs email.opened <provider-id> [url]
import { readWebhookSecret, signWebhook } from '../supabase/functions/_shared/comms/webhook.ts'

const TYPES = ['email.delivered', 'email.opened', 'email.clicked', 'email.bounced', 'email.complained']
const [type, providerId, url = 'http://127.0.0.1:54321/functions/v1/resend-webhook'] = process.argv.slice(2)
if (!TYPES.includes(type) || !providerId) {
  console.error(`Usage: node scripts/webhook-event.mjs <${TYPES.join('|')}> <provider-id> [url]`)
  process.exit(2)
}
const secret = readWebhookSecret(process.env.RESEND_WEBHOOK_SECRET)
const body = JSON.stringify({ type, created_at: new Date().toISOString(), data: { email_id: providerId } })
const id = `msg_${crypto.randomUUID()}`
const timestamp = String(Math.floor(Date.now() / 1000))
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': await signWebhook(secret, id, timestamp, body) },
  body,
})
console.log(res.status, await res.text())
