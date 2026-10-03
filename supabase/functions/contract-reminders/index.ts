import { createClient } from 'npm:@supabase/supabase-js@2'
import { groupByFirm, inReminderWindow, reminderEmailBody, type ExpiringContract } from './rules.ts'

const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const resendKey = Deno.env.get('RESEND_API_KEY')
const fromEmail = Deno.env.get('RESEND_FROM_EMAIL')
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

type ContractRow = { id: string; firm_id: string; title: string; end_date: string; clients: { name: string } | null }

// Called by the daily GitHub Actions cron, never a signed-in person: no user JWT, just the service role key (verify_jwt = false, like stripe-webhook).
Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  if (req.headers.get('Authorization')?.replace(/^Bearer /, '') !== serviceKey) return json(401, { error: 'Unauthorized.' })
  if (!resendKey || !fromEmail) return json(503, { error: 'Email is not configured.' })

  const admin = createClient(url, serviceKey)
  const today = new Date().toISOString().split('T')[0]

  const { data: rows, error } = await admin
    .from('contracts')
    .select('id, firm_id, title, end_date, clients(name)')
    .eq('status', 'approved')
    .is('reminder_sent_at', null)
    .returns<ContractRow[]>()
  if (error) {
    console.error('Failed to load contracts:', error.code)
    return json(500, { error: 'Failed to load contracts.' })
  }

  const expiring: ExpiringContract[] = (rows ?? [])
    .filter((r) => inReminderWindow(r.end_date, today))
    .map((r) => ({ id: r.id, firm_id: r.firm_id, title: r.title, end_date: r.end_date, client_name: r.clients?.name ?? 'Unknown client' }))

  let firmsEmailed = 0
  let contractsReminded = 0
  for (const [firmId, contracts] of groupByFirm(expiring)) {
    const { data: recipients } = await admin.from('profiles').select('email').eq('firm_id', firmId).eq('status', 'active').in('role', ['owner', 'admin'])
    const emails = (recipients ?? []).map((p) => p.email)
    if (!emails.length) continue

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to: emails, subject: 'Contracts approaching their end date', text: reminderEmailBody(contracts) }),
    })
    if (!res.ok) {
      // Don't log the response body: Resend echoes the recipient list back on validation errors.
      console.error('Resend send failed for firm', firmId, res.status)
      continue
    }
    // Marked only after a successful send, so a failed send is retried on the next run instead of silently skipped.
    await admin.from('contracts').update({ reminder_sent_at: new Date().toISOString() }).in('id', contracts.map((c) => c.id))
    firmsEmailed += 1
    contractsReminded += contracts.length
  }

  return json(200, { firms: firmsEmailed, contracts: contractsReminded })
})
