import { assertEquals } from 'jsr:@std/assert@1'
import { backoffMs, sendMessages, type Deps } from './handler.ts'
import type { Mail, SendResult, Transport } from './transport.ts'
import { APP, setup } from '../advance/testkit.ts'
import { ADMIN } from '../_shared/workflow/fixture.ts'

const T0 = new Date('2026-10-11T12:00:00Z') // the testkit's NOW: Task assigned is queued at start
const at = (ms: number) => new Date(T0.getTime() + ms)
const MIN = 60_000

function transport(results: (SendResult | Error)[]) {
  const sent: Mail[] = []
  const t: Transport = {
    send: (m) => {
      sent.push(m)
      const r = results.length > 1 ? results.shift()! : results[0]
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r)
    },
  }
  return { t, sent }
}
const run = (store: Deps['store'], t: Transport, now: Date, authorised = true) =>
  sendMessages({ authorised, store, transport: t, now: () => now, appUrl: APP })

Deno.test('401 without the cron secret, and nothing is sent', async () => {
  const s = setup()
  await s.start()
  const { t, sent } = transport([{ ok: true, providerId: 'x' }])
  assertEquals((await run(s.store, t, T0, false)).status, 401)
  assertEquals([sent.length, s.db.messages[0].status], [0, 'queued'])
})
Deno.test('sends a queued message and records it as sent', async () => {
  const s = setup()
  await s.start()
  const { t, sent } = transport([{ ok: true, providerId: 'rs_1' }])
  const res = await run(s.store, t, T0)
  assertEquals(res.body, { overdue: 0, sent: 1, retrying: 0, failed: 0 })
  assertEquals(sent.map((m) => [m.id, m.to, m.subject]), [[s.db.messages[0].id, 'admin@alpha.test', 'New task: Leave approval: Ada']])
  const m = s.db.messages[0]
  assertEquals([m.status, m.attempts, m.error, m.provider_id, m.sent_at?.toISOString()], ['sent', 1, null, 'rs_1', T0.toISOString()])
  assertEquals((await run(s.store, t, at(MIN))).body, { overdue: 0, sent: 0, retrying: 0, failed: 0 }) // never sent twice
})
Deno.test('a failing send retries after 1, 2 and 4 minutes, then fails with the error', async () => {
  const s = setup()
  await s.start()
  const { t, sent } = transport([{ ok: false, retry: true, error: 'The email service refused this message: HTTP 503' }])
  const m = s.db.messages[0]
  assertEquals((await run(s.store, t, T0)).body, { overdue: 0, sent: 0, retrying: 1, failed: 0 })
  assertEquals([m.status, m.attempts, m.next_attempt_at.toISOString()], ['queued', 1, at(MIN).toISOString()])
  assertEquals((await run(s.store, t, at(MIN - 1))).body.retrying, 0) // not due yet
  await run(s.store, t, at(MIN))
  assertEquals([m.attempts, m.next_attempt_at.toISOString()], [2, at(3 * MIN).toISOString()])
  await run(s.store, t, at(3 * MIN))
  assertEquals([m.attempts, m.next_attempt_at.toISOString()], [3, at(7 * MIN).toISOString()])
  assertEquals((await run(s.store, t, at(7 * MIN))).body, { overdue: 0, sent: 0, retrying: 0, failed: 1 })
  assertEquals([m.status, m.attempts, m.error], ['failed', 4, 'The email service refused this message: HTTP 503'])
  assertEquals(sent.length, 4)
  assertEquals((await run(s.store, t, at(60 * MIN))).body.failed, 0) // a failed row is left for a person to retry
  assertEquals([backoffMs(1), backoffMs(2), backoffMs(3)], [MIN, 2 * MIN, 4 * MIN])
})
Deno.test('a refusal that can never succeed fails at once', async () => {
  const s = setup()
  await s.start()
  const { t } = transport([{ ok: false, retry: false, error: 'The email service refused this message: Invalid `to` field.' }])
  assertEquals((await run(s.store, t, T0)).body.failed, 1)
  assertEquals([s.db.messages[0].status, s.db.messages[0].attempts], ['failed', 1])
})
Deno.test('a thrown transport error is retried, and a later success clears the error', async () => {
  const s = setup()
  await s.start()
  const { t } = transport([new Error('connection reset'), { ok: true, providerId: 'rs_2' }])
  await run(s.store, t, T0)
  assertEquals([s.db.messages[0].status, s.db.messages[0].error], ['queued', 'Could not reach the email service: connection reset'])
  await run(s.store, t, at(MIN))
  assertEquals([s.db.messages[0].status, s.db.messages[0].attempts, s.db.messages[0].error], ['sent', 2, null])
})
Deno.test('two overlapping runs send Task overdue once per task', async () => {
  const s = setup()
  await s.start() // the approval task is due two days after T0
  const { t } = transport([{ ok: true, providerId: 'x' }])
  const late = at(3 * 24 * 60 * MIN)
  const both = await Promise.all([run(s.store, t, late), run(s.store, t, late)])
  assertEquals(both.map((r) => r.body.overdue).sort(), [0, 1])
  assertEquals(s.db.notifications.filter((n) => n.kind === 'task_overdue').map((n) => [n.user_id, n.link]), [[ADMIN, `#/tasks/${s.db.tasks[0].id}`]])
  assertEquals(s.db.messages.filter((m) => m.subject.startsWith('Overdue:')).length, 1)
  assertEquals(s.db.tasks[0].overdue_notified_at?.toISOString(), late.toISOString())
  assertEquals((await run(s.store, t, at(4 * 24 * 60 * MIN))).body.overdue, 0)
})
Deno.test('tasks that are done or not yet due get no overdue notice', async () => {
  const early = setup()
  await early.start()
  const { t } = transport([{ ok: true, providerId: 'x' }])
  assertEquals((await run(early.store, t, at(MIN))).body.overdue, 0)
  const done = setup()
  await done.start()
  done.claim()
  await done.act(done.db.tasks[0].id, 'approved')
  assertEquals((await run(done.store, t, at(3 * 24 * 60 * MIN))).body.overdue, 0)
  assertEquals(done.db.notifications.filter((n) => n.kind === 'task_overdue').length, 0)
})
