import { notifyTask } from '../advance/notify.ts'
import type { Result, Store, Tx } from '../advance/engine.ts'
import type { SendResult, Transport } from './transport.ts'

export type Deps = { authorised: boolean; store: Store; transport: Transport; now(): Date; appUrl: string }
type Outcome = 'sent' | 'retrying' | 'failed'

export const MAX_ATTEMPTS = 4 // the first try plus 3 retries (spec §8)
/** 1, 2, then 4 minutes after the 1st, 2nd and 3rd failure. */
export const backoffMs = (attempts: number) => 60_000 * 2 ** (attempts - 1)
const BATCH = 50 // shortcut: 50 overdue tasks and 50 emails a minute; loop until empty or raise when an org sends more

/** Called by pg_cron every minute: overdue reminders first (they queue mail), then the queue. One transaction per item. */
export async function sendMessages(deps: Deps): Promise<Result> {
  if (!deps.authorised) return { status: 401, body: { error: 'Not allowed.' } }
  const now = deps.now()
  const counts = { overdue: await queueOverdue(deps, now), sent: 0, retrying: 0, failed: 0 }
  const ids = await deps.store.tx((tx) => tx.dueMessages(now, BATCH))
  for (const id of ids) {
    const r = await deps.store.tx((tx) => sendOne(tx, id, deps.transport, now))
    if (r) counts[r] += 1
  }
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
  let res: SendResult
  try {
    res = await transport.send({ id: m.id, to: m.recipient_email, subject: m.subject, html: m.body_html, text: m.body_text })
  } catch (e) {
    res = { ok: false, retry: true, error: `Could not reach the email service: ${e instanceof Error ? e.message : String(e)}` }
  }
  if (res.ok) {
    await tx.finishMessage(id, { status: 'sent', attempts, error: null, sentAt: now, providerId: res.providerId })
    return 'sent'
  }
  const error = res.error.slice(0, 500)
  if (res.retry && attempts < MAX_ATTEMPTS) {
    await tx.finishMessage(id, { status: 'queued', attempts, error, nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)) })
    return 'retrying'
  }
  await tx.finishMessage(id, { status: 'failed', attempts, error })
  return 'failed'
}
