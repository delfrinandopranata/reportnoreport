import postgres from 'npm:postgres@3.4.5'
import type { RecordRow, ScheduledRow, Store, TaskRow, Tx, WorkflowRow } from './engine.ts'

const RECORD = ['id', 'org_id', 'workflow_id', 'title', 'current_node_id', 'status', 'label', 'error', 'data', 'step', 'started_by']

/** Connects as `postgres` (RLS bypassed): the engine checks membership, permission and assignment itself. */
export function pgStore(url: string): Store & { end(): Promise<void> } {
  const sql = postgres(url, { max: 3, prepare: false, onnotice: () => {} })
  return {
    tx: <T>(fn: (tx: Tx) => Promise<T>) => sql.begin((t) => fn(pgTx(t))) as Promise<T>,
    end: () => sql.end(),
  }
}

function pgTx(t: postgres.TransactionSql): Tx {
  const one = async <R>(q: Promise<readonly unknown[]>) => ((await q)[0] as R | undefined) ?? null
  const json = (v: unknown) => t.json(v as postgres.JSONValue)
  return {
    workflow: (id) => one<WorkflowRow>(t`select id, org_id, name, status, graph from workflows where id = ${id} for share`),
    lockRecord: (id) => one<RecordRow>(t`select ${t(RECORD)} from records where id = ${id} for update`),
    task: (id) => one<TaskRow>(t`select id, org_id, record_id, node_id, assignee_role_id, assignee_user_id, claimed_by, status from tasks where id = ${id}`),
    form: (id, org) => one<{ id: string; schema: unknown }>(t`select id, schema from forms where id = ${id} and org_id = ${org}`),
    can: async (user, org, perm, wf) => {
      // has_permission reads auth.uid() from the claims: set them for this transaction only. No trigger on the
      // runtime tables reads auth.uid(), so later writes in this transaction are unaffected.
      await t`select set_config('request.jwt.claims', ${JSON.stringify({ sub: user, role: 'authenticated' })}, true)`
      const [row] = await t`select has_permission(${org}::uuid, ${perm}, ${wf}::uuid) as ok`
      return row.ok === true
    },
    isActiveMember: async (user, org) => (await t`select 1 from members where user_id = ${user} and org_id = ${org} and status = 'active'`).length > 0,
    holdsRole: async (user, org, role) =>
      (await t`select 1 from member_roles mr join members m on m.id = mr.member_id where m.user_id = ${user} and m.org_id = ${org} and mr.role_id = ${role} and m.status = 'active'`).length > 0,
    roleExists: async (role, org) => (await t`select 1 from roles where id = ${role} and org_id = ${org}`).length > 0,
    lastSubmitter: async (rec, node) =>
      (await one<{ submitted_by: string }>(t`select submitted_by from form_submissions where record_id = ${rec} and node_id = ${node} order by created_at desc limit 1`))?.submitted_by ?? null,
    insertRecord: async (r) => (await one<RecordRow>(t`
      insert into records (org_id, workflow_id, title, data, started_by)
      values (${r.org_id}, ${r.workflow_id}, ${r.title}, ${json(r.data)}, ${r.started_by}) returning ${t(RECORD)}`))!,
    saveRecord: async (r) => {
      await t`update records set current_node_id = ${r.current_node_id}, status = ${r.status}, label = ${r.label}, error = ${r.error},
        data = ${json(r.data)}, step = ${r.step}, updated_at = now() where id = ${r.id}`
    },
    insertSubmission: async (s) => (await one<{ id: string }>(t`
      insert into form_submissions (org_id, record_id, node_id, form_id, task_id, answers, submitted_by, outcome)
      values (${s.org_id}, ${s.record_id}, ${s.node_id}, ${s.form_id}, ${s.task_id}, ${json(s.answers)}, ${s.submitted_by}, ${s.outcome}) returning id`))!.id,
    finishTask: async (id) => (await t`update tasks set status = 'done', done_at = now() where id = ${id} and status = 'open' returning id`).length === 1,
    insertTask: async (x) => (await one<{ id: string }>(t`
      insert into tasks (org_id, record_id, node_id, assignee_role_id, assignee_user_id, due_at)
      values (${x.org_id}, ${x.record_id}, ${x.node_id}, ${x.assignee_role_id}, ${x.assignee_user_id}, ${x.due_at}) returning id`))!.id,
    schedule: async (x) => {
      await t`insert into scheduled_actions (org_id, record_id, resume_node_id, run_at, state_at_schedule)
        values (${x.org_id}, ${x.record_id}, ${x.resume_node_id}, ${x.run_at}, ${x.state_at_schedule})`
    },
    event: async (e) => {
      await t`insert into record_events (org_id, record_id, kind, node_id, actor_id, detail)
        values (${e.org_id}, ${e.record_id}, ${e.kind}, ${e.node_id}, ${e.actor_id}, ${json(e.detail)})`
    },
    dueScheduled: async (now, limit) =>
      (await t`select id from scheduled_actions where status = 'pending' and run_at <= ${now} order by run_at limit ${limit}`).map((r) => r.id as string),
    lockScheduled: (id) => one<ScheduledRow>(t`
      select id, org_id, record_id, resume_node_id, state_at_schedule from scheduled_actions
      where id = ${id} and status = 'pending' for update skip locked`),
    finishScheduled: async (id, status, error) => {
      await t`update scheduled_actions set status = ${status}, error = ${error}, finished_at = now() where id = ${id}`
    },
  }
}
