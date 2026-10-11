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
    const ctx = (actor: string) => ({ now: new Date(), actor, appUrl: 'http://localhost:5173/app/', fileExists: () => Promise.resolve(true) })
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
      await sql`delete from notifications where link in (${`#/tasks/${task.id}`}, ${`#/records/${recordId}`})`
      await sql`delete from records where id = ${recordId}`
    } finally {
      await store.end()
      await sql.end()
    }
  },
})

Deno.test({
  name: 'real Postgres: a role of 501 holders stops the Send message instead of dropping the 501st',
  ignore: !url,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const store = pgStore(url!)
    const sql = postgres(url!, { max: 1 })
    const ORG = '0000000a-0000-0000-0000-000000000001'
    const created = { users: [] as string[], recordId: '' }
    try {
      const [role] = await sql`insert into roles (org_id, name) values (${ORG}, 'Qa cap role') returning id`
      const users = await sql`insert into auth.users (id, email, instance_id, aud, role)
        select gen_random_uuid(), 'cap' || g || '@cap.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from generate_series(1, 501) g returning id`
      created.users = users.map((u) => u.id as string)
      const members = await sql`insert into members (org_id, user_id, email, status)
        select ${ORG}, id, 'cap' || row_number() over () || '@cap.test', 'active' from auth.users where email like 'cap%@cap.test' returning id`
      await sql`insert into member_roles (member_id, role_id) select id, ${role.id} from members where org_id = ${ORG} and email like 'cap%@cap.test'`
      assertEquals(members.length, 501)
      const [wf] = await sql`select graph from workflows where id = ${WF}`
      const tpl = (await sql`select id from message_templates where org_id = ${ORG} and kind = 'record_approved'`)[0].id
      const graph = structuredClone(wf.graph)
      graph.edges.find((e: { id: string }) => e.id === 'e2').actions = [{ type: 'send_message', templateId: tpl, recipients: [{ role: role.id }] }]
      await sql`update workflows set graph = ${sql.json(graph)} where id = ${WF}`
      try {
        const ctx = (actor: string) => ({ now: new Date(), actor, appUrl: 'http://localhost:5173/app/', fileExists: () => Promise.resolve(true) })
        const started = await store.tx((tx) => startRecord(tx, { workflowId: WF, answers: VALID }, ctx(MEMBER)))
        created.recordId = started.body.recordId as string
        await sql`update tasks set claimed_by = ${ADMIN} where record_id = ${created.recordId} and status = 'open'`
        const [task] = await sql`select id from tasks where record_id = ${created.recordId} and status = 'open'`
        await store.tx((tx) => submitTask(tx, { taskId: task.id, outcome: 'approved', answers: { comment: 'ok' } }, ctx(ADMIN)))
        const [rec] = await sql`select status, error from records where id = ${created.recordId}`
        assertEquals([rec.status, rec.error], ['error', '"Send message" would send "Record approved" to more than 500 people. Ask a workflow manager to narrow its recipients.'])
        const [n] = await sql`select count(*)::int as c from messages where record_id = ${created.recordId} and template_id = ${tpl}`
        assertEquals(n.c, 0)
      } finally {
        await sql`update workflows set graph = ${sql.json(wf.graph)} where id = ${WF}`
      }
    } finally {
      if (created.recordId) {
        await sql`delete from notifications where link like ${`%${created.recordId}`} or link in (select '#/tasks/' || id from tasks where record_id = ${created.recordId})`
        await sql`delete from records where id = ${created.recordId}`
      }
      await sql`delete from members where email like 'cap%@cap.test'`
      await sql`delete from roles where name = 'Qa cap role'`
      await sql`delete from auth.users where email like 'cap%@cap.test'`
      await store.end()
      await sql.end()
    }
  },
})
