import { assertEquals } from 'jsr:@std/assert@1'
import postgres from 'npm:postgres@3.4.5'
import { startRecord } from '../advance/engine.ts'
import { pgStore } from '../advance/pgStore.ts'
import { sendMessages } from './handler.ts'
import { VALID } from '../_shared/forms/fixture.ts'
import { MEMBER, WF } from '../_shared/workflow/fixture.ts'

const url = Deno.permissions.querySync({ name: 'env', variable: 'RNR_TEST_DB_URL' }).state === 'granted'
  ? Deno.env.get('RNR_TEST_DB_URL')
  : undefined
const APP = 'http://localhost:5173/app/'

Deno.test({
  name: 'real Postgres: two overlapping runs notify an overdue task once',
  ignore: !url,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const store = pgStore(url!)
    const sql = postgres(url!, { max: 1 })
    const transport = { send: () => Promise.resolve({ ok: true as const, providerId: null }) }
    try {
      const started = await store.tx((tx) => startRecord(tx, { workflowId: WF, answers: VALID }, { now: new Date(), actor: MEMBER, appUrl: APP, fileExists: () => Promise.resolve(true) }))
      assertEquals(started.status, 200)
      const recordId = started.body.recordId as string
      const [task] = await sql`update tasks set due_at = now() - interval '1 hour' where record_id = ${recordId} and status = 'open' returning id`
      const deps = { authorised: true, store, transport, now: () => new Date(), appUrl: APP }
      await Promise.all([sendMessages(deps), sendMessages(deps)])
      const [row] = await sql`select
        (select count(*)::int from notifications where kind = 'task_overdue' and link = ${`#/tasks/${task.id}`}) as notices,
        (select count(*)::int from messages where record_id = ${recordId} and subject like 'Overdue:%') as emails,
        (select count(*)::int from tasks where id = ${task.id} and overdue_notified_at is not null) as marked`
      assertEquals([row.notices, row.emails, row.marked], [1, 1, 1])
      await sql`delete from notifications where link in (${`#/tasks/${task.id}`}, ${`#/records/${recordId}`})`
      await sql`delete from records where id = ${recordId}`
    } finally {
      await store.end()
      await sql.end()
    }
  },
})
