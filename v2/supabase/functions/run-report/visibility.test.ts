import { assertEquals } from 'jsr:@std/assert@1'
import { createClient } from 'npm:@supabase/supabase-js@2'
import postgres from 'npm:postgres@3.4.5'
import { runReportRequest } from './handler.ts'
import { callerSource } from './source.ts'

const env = (k: string) => (Deno.permissions.querySync({ name: 'env', variable: k }).state === 'granted' ? Deno.env.get(k) : undefined)
const url = env('RNR_TEST_SUPABASE_URL')
const anon = env('RNR_TEST_ANON_KEY')
const db = env('RNR_TEST_DB_URL')
const ALPHA = '0000000a-0000-0000-0000-000000000001'
const WF = '0000000a-0000-0000-0000-00000000c001'
const ADMIN = '00000000-0000-0000-0000-0000000000a2'
const MEMBER = '00000000-0000-0000-0000-0000000000a3'

/** Runs the real handler with the real caller source, as the signed-in user. */
async function runAs(email: string, tag: string) {
  const c = createClient(url!, anon!, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: 'password123' })
  if (error) throw error
  const res = await runReportRequest(
    { orgId: ALPHA, workflowId: WF, definition: { columns: [{ meta: 'title' }], filters: [{ field: 'tag', operator: 'is', value: tag }] } },
    { userId: async () => (await c.auth.getUser()).data.user?.id ?? null, source: callerSource(c), now: () => new Date() })
  await c.auth.signOut()
  if (res.status !== 200 || !('body' in res)) return res.status
  return ((res.body.result as { rows: { cells: string[] }[] }).rows.map((r) => r.cells[0]) as string[]).sort()
}

Deno.test({
  name: 'real Supabase: a report returns only the records the caller can see',
  ignore: !(url && anon && db),
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const sql = postgres(db!, { max: 1 })
    const tag = crypto.randomUUID()
    const data = sql.json({ tag })
    const [prev] = await sql`select wa.can_view_all from workflow_access wa join roles r on r.id = wa.role_id
      where wa.workflow_id = ${WF} and r.org_id = ${ALPHA} and r.name = 'Admin'`
    try {
      const rows = await sql`
        insert into records (org_id, workflow_id, title, current_node_id, data, started_by) values
          (${ALPHA}, ${WF}, 'V1 member started', null, ${data}, ${MEMBER}),
          (${ALPHA}, ${WF}, 'V2 admin started', null, ${data}, ${ADMIN}),
          (${ALPHA}, ${WF}, 'V3 member holds a task', 'approve', ${data}, ${ADMIN})
        returning id, title`
      const r3 = rows.find((r) => r.title === 'V3 member holds a task')!
      await sql`insert into tasks (org_id, record_id, node_id, assignee_user_id) values (${ALPHA}, ${r3.id}, 'approve', ${MEMBER})`

      assertEquals(await runAs('member@alpha.test', tag), ['V1 member started', 'V3 member holds a task'])
      assertEquals(await runAs('admin@alpha.test', tag), ['V1 member started', 'V2 admin started', 'V3 member holds a task'])
      assertEquals(await runAs('viewer@alpha.test', tag), [])
      assertEquals(await runAs('owner@beta.test', tag), 403)

      await sql`update workflow_access set can_view_all = false where workflow_id = ${WF}
        and role_id = (select id from roles where org_id = ${ALPHA} and name = 'Admin')`
      assertEquals(await runAs('admin@alpha.test', tag), ['V2 admin started', 'V3 member holds a task']) // narrowed to what admin started
    } finally {
      await sql`update workflow_access set can_view_all = ${prev?.can_view_all ?? true} where workflow_id = ${WF}
        and role_id = (select id from roles where org_id = ${ALPHA} and name = 'Admin')`
      await sql`delete from records where data->>'tag' = ${tag}` // tasks cascade
      await sql.end()
    }
  },
})
