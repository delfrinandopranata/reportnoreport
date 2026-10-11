import { assertEquals } from 'jsr:@std/assert@1'
import postgres from 'npm:postgres@3.4.5'
import { startRecord, submitTask } from './engine.ts'
import { pgStore } from './pgStore.ts'
import { VALID } from '../_shared/forms/fixture.ts'
import { ADMIN, MEMBER, WF } from '../_shared/workflow/fixture.ts'

const url = Deno.permissions.querySync({ name: 'env', variable: 'RNR_TEST_DB_URL' }).state === 'granted'
  ? Deno.env.get('RNR_TEST_DB_URL')
  : undefined

Deno.test({
  name: 'real Postgres: two simultaneous approvals advance the record once',
  ignore: !url,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const store = pgStore(url!)
    const sql = postgres(url!, { max: 1 })
    const ctx = (actor: string) => ({ now: new Date(), actor, fileExists: () => Promise.resolve(true) })
    try {
      const started = await store.tx((tx) => startRecord(tx, { workflowId: WF, answers: VALID }, ctx(MEMBER)))
      assertEquals(started.status, 200)
      const recordId = started.body.recordId as string
      const [task] = await sql`update tasks set claimed_by = ${ADMIN} where record_id = ${recordId} and status = 'open' returning id`
      const both = await Promise.all([1, 2].map(() =>
        store.tx((tx) => submitTask(tx, { taskId: task.id, outcome: 'approved', answers: { comment: 'ok' } }, ctx(ADMIN)))))
      assertEquals(both.map((r) => r.status).sort(), [200, 409])
      const [row] = await sql`select
        (select count(*)::int from form_submissions where task_id = ${task.id}) as subs,
        (select count(*)::int from scheduled_actions where record_id = ${recordId}) as waits,
        (select step from records where id = ${recordId}) as step`
      assertEquals([row.subs, row.waits, row.step], [1, 1, 3])
      await sql`delete from records where id = ${recordId}`
    } finally {
      await store.end()
      await sql.end()
    }
  },
})
