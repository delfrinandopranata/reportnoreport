import { notifyTask } from '../advance/notify.ts'
import type { Result, Store, Tx } from '../advance/engine.ts'
import type { SendResult, Transport } from './transport.ts'

export type Deps = { authorised: boolean; store: Store; transport: Transport; now(): Date; appUrl: string }
type Outcome = 'sent' | 'retrying' | 'failed' | 'paused'

export const MAX_ATTEMPTS = 4 // the first try plus 3 retries (spec §8)
/** 1, 2, then 4 minutes after the 1st, 2nd and 3rd failure. */
export const backoffMs = (attempts: number) => 60_000 * 2 ** (attempts - 1)
const BATCH = 50
// shortcut: at most 20 batches of 50 (1,000 emails) a run, so a 10,000-person campaign drains in ten minutes or more;
// move to Resend's batch endpoint when organisations need faster. Anything past the cap stays queued for the next minute.
export const MAX_BATCHES = 20
export const RATE_LIMITED = 'The email service asked to slow down. This email will be sent in a minute.'

/** Called by pg_cron every minute: overdue reminders first (they queue mail), then the queue in batches. One transaction per item. */
export async function sendMessages(deps: Deps): Promise<Result> {
  if (!deps.authorised) return { status: 401, body: { error: 'Not allowed.' } }
  const now = deps.now()
  const counts = { overdue: await queueOverdue(deps, now), sent: 0, retrying: 0, failed: 0, paused: 0, campaigns: 0 }
  batches: for (let b = 0; b < MAX_BATCHES; b++) {
    const ids = await deps.store.tx((tx) => tx.dueMessages(now, BATCH))
    if (!ids.length) break
    for (const id of ids) {
      const r = await deps.store.tx((tx) => sendOne(tx, id, deps.transport, now))
      if (r) counts[r] += 1
      if (r === 'paused') break batches // the provider is pacing us: the rest waits for the next run
    }
  }
  counts.campaigns = await deps.store.tx((tx) => tx.finishCampaigns(now))
  return { status: 200, body: counts }
}

/**
 * Record lock first, then the task row: the order advance uses, so the two never deadlock. markOverdue's UPDATE re-checks
 * overdue_notified_at under the row lock, so an overlapping run gets no row and sends nothing. A failure rolls back the
 * mark with the notice, and the next minute tries again.
 */
async function queueOverdue(deps: Deps, now: Date): Promise<number> {
  const due = await deps.store.tx((tx) => tx.overdueTasks(now, BATCH))
  let n = 0
  for (const { id, record_id } of due) {
    try {
      const marked = await deps.store.tx(async (tx) => {
        const rec = await tx.lockRecord(record_id)
        const task = await tx.markOverdue(id, now)
        if (!task) return false
        if (rec?.status === 'open') await notifyTask(tx, 'task_overdue', rec, task, { now, appUrl: deps.appUrl })
        return true
      })
      if (marked) n += 1
    } catch (e) {
      console.error('overdue notice failed, retrying next run', id, e)
    }
  }
  return n
}

async function sendOne(tx: Tx, id: string, transport: Transport, now: Date): Promise<Outcome | null> {
  const m = await tx.lockMessage(id, now)
  if (!m) return null // another run has it, or it is no longer due
  const attempts = m.attempts + 1
  // RFC 8058 one-click unsubscribe; only campaign emails have a link (decision 5).
  const headers = m.unsubscribe_url
    ? { 'List-Unsubscribe': `<${m.unsubscribe_url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    : undefined
  let res: SendResult
  try {
    res = await transport.send({ id: m.id, to: m.recipient_email, subject: m.subject, html: m.body_html, text: m.body_text, headers })
  } catch (e) {
    console.error('email transport threw', id, e) // detail stays in the server log; the stored reason is shown to admins
    res = { ok: false, retry: true, error: 'The email service could not be reached.' }
  }
  if (res.ok) {
    await tx.finishMessage(id, { status: 'sent', attempts, error: null, sentAt: now, providerId: res.providerId })
    return 'sent'
  }
  if (res.rateLimited) { // pacing, not a failure of this email: no attempt is spent
    await tx.finishMessage(id, { status: 'queued', attempts: m.attempts, error: RATE_LIMITED, nextAttemptAt: new Date(now.getTime() + 60_000) })
    return 'paused'
  }
  const error = res.error.slice(0, 500)
  if (res.retry && attempts < MAX_ATTEMPTS) {
    await tx.finishMessage(id, { status: 'queued', attempts, error, nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)) })
    return 'retrying'
  }
  await tx.finishMessage(id, { status: 'failed', attempts, error })
  return 'failed'
}
