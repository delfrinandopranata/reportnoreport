import { failScheduled, resumeOne, type Result, type Store } from '../advance/engine.ts'

export type Deps = { authorised: boolean; store: Store; now(): Date; appUrl: string }
const BATCH = 50 // shortcut: 50 timers a minute; raise or loop when an org schedules more

/** Called by pg_cron every minute. Each timer runs in its own transaction so one failure cannot block the rest. */
export async function resume(deps: Deps): Promise<Result> {
  if (!deps.authorised) return { status: 401, body: { error: 'Not allowed.' } }
  const now = deps.now()
  const ids = await deps.store.tx((tx) => tx.dueScheduled(now, BATCH))
  const counts = { done: 0, skipped: 0, failed: 0 }
  for (const id of ids) {
    try {
      const r = await deps.store.tx((tx) => resumeOne(tx, id, { now, appUrl: deps.appUrl }))
      if (r !== 'gone') counts[r] += 1
    } catch (e) {
      console.error('resume failed for', id, e)
      await deps.store.tx((tx) => failScheduled(tx, id, `This step could not run: ${e instanceof Error ? e.message : String(e)}`))
      counts.failed += 1
    }
  }
  return { status: 200, body: counts }
}
