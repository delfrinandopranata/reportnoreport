import { assertEquals } from 'jsr:@std/assert@1'
import { MAX_BATCHES, RATE_LIMITED, backoffMs, sendMessages, type Deps } from './handler.ts'
import type { Mail, SendResult, Transport } from './transport.ts'
import { APP, setup } from '../advance/testkit.ts'
import { ADMIN } from '../_shared/workflow/fixture.ts'
import { ORG } from '../_shared/forms/fixture.ts'

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
  assertEquals(res.body, { overdue: 0, sent: 1, retrying: 0, failed: 0, paused: 0, campaigns: 0 })
  assertEquals(sent.map((m) => [m.id, m.to, m.subject]), [[s.db.messages[0].id, 'admin@alpha.test', 'New task: Leave approval: Ada']])
  const m = s.db.messages[0]
  assertEquals([m.status, m.attempts, m.error, m.provider_id, m.sent_at?.toISOString()], ['sent', 1, null, 'rs_1', T0.toISOString()])
  assertEquals((await run(s.store, t, at(MIN))).body, { overdue: 0, sent: 0, retrying: 0, failed: 0, paused: 0, campaigns: 0 }) // never sent twice
})
Deno.test('a failing send retries after 1, 2 and 4 minutes, then fails with the error', async () => {
  const s = setup()
  await s.start()
  const { t, sent } = transport([{ ok: false, retry: true, error: 'The email service refused this message: HTTP 503' }])
  const m = s.db.messages[0]
  assertEquals((await run(s.store, t, T0)).body, { overdue: 0, sent: 0, retrying: 1, failed: 0, paused: 0, campaigns: 0 })
  assertEquals([m.status, m.attempts, m.next_attempt_at.toISOString()], ['queued', 1, at(MIN).toISOString()])
  assertEquals((await run(s.store, t, at(MIN - 1))).body.retrying, 0) // not due yet
  await run(s.store, t, at(MIN))
  assertEquals([m.attempts, m.next_attempt_at.toISOString()], [2, at(3 * MIN).toISOString()])
  await run(s.store, t, at(3 * MIN))
  assertEquals([m.attempts, m.next_attempt_at.toISOString()], [3, at(7 * MIN).toISOString()])
  assertEquals((await run(s.store, t, at(7 * MIN))).body, { overdue: 0, sent: 0, retrying: 0, failed: 1, paused: 0, campaigns: 0 })
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
  const { t } = transport([new Error('connection reset http://host.docker.internal:54324/api/v1/send'), { ok: true, providerId: 'rs_2' }])
  await run(s.store, t, T0)
  assertEquals([s.db.messages[0].status, s.db.messages[0].error], ['queued', 'The email service could not be reached.'])
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

type Row = ReturnType<typeof setup>['db']['messages'][number]
function queue(s: ReturnType<typeof setup>, n: number, over: Partial<Row> = {}) {
  for (let i = 0; i < n; i++) {
    s.db.messages.push({
      id: `bulk${i}`, org_id: ORG, template_id: null, record_id: null, recipient_user_id: null, recipient_email: `p${i}@example.test`,
      subject: 'Hello', body_html: '<p>Hello</p>', body_text: 'Hello', status: 'queued', attempts: 0, error: null,
      next_attempt_at: new Date(0), sent_at: null, provider_id: null, unsubscribe_url: null, ...over,
    } as Row)
  }
}

Deno.test('a run keeps sending batches until the queue is empty', async () => {
  const s = setup()
  queue(s, 120)
  const { t, sent } = transport([{ ok: true, providerId: 'x' }])
  const res = await run(s.store, t, T0)
  assertEquals(res.body, { overdue: 0, sent: 120, retrying: 0, failed: 0, paused: 0, campaigns: 0 })
  assertEquals([sent.length, s.db.messages.filter((m) => m.status === 'queued').length], [120, 0])
})

Deno.test('past 1,000 emails a run the rest stay queued for the next minute', async () => {
  const s = setup()
  queue(s, 1_500)
  const { t, sent } = transport([{ ok: true, providerId: 'x' }])
  const res = await run(s.store, t, T0)
  assertEquals([MAX_BATCHES * 50, sent.length, (res.body as { sent: number }).sent], [1_000, 1_000, 1_000])
  const left = s.db.messages.filter((m) => m.status === 'queued')
  assertEquals([left.length, left.every((m) => m.attempts === 0 && m.error === null)], [500, true]) // waiting, not failed or dropped
})

Deno.test('a rate limit waits a minute without using an attempt and ends the run', async () => {
  const s = setup()
  queue(s, 3)
  const { t, sent } = transport([{ ok: false, retry: true, rateLimited: true, error: 'The email service refused this message: Too many requests' }])
  const res = await run(s.store, t, T0)
  assertEquals(res.body, { overdue: 0, sent: 0, retrying: 0, failed: 0, paused: 1, campaigns: 0 })
  assertEquals(sent.length, 1)
  const m = s.db.messages[0]
  assertEquals([m.status, m.attempts, m.error, m.next_attempt_at.toISOString()], ['queued', 0, RATE_LIMITED, at(MIN).toISOString()])
})

Deno.test('a campaign email carries one-click unsubscribe headers; other emails carry none', async () => {
  const s = setup()
  queue(s, 1, { id: 'camp1', unsubscribe_url: 'https://x.test/functions/v1/unsubscribe?m=1&t=2' })
  queue(s, 1, { id: 'task1', recipient_email: 'task@example.test' })
  const { t, sent } = transport([{ ok: true, providerId: 'x' }])
  await run(s.store, t, T0)
  assertEquals(sent.find((m) => m.id === 'camp1')?.headers, {
    'List-Unsubscribe': '<https://x.test/functions/v1/unsubscribe?m=1&t=2>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  })
  assertEquals(sent.find((m) => m.id === 'task1')?.headers, undefined)
})
