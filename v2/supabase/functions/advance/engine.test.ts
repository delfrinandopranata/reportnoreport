import { assertEquals, assertMatch } from 'jsr:@std/assert@1'
import { VALID } from '../_shared/forms/fixture.ts'
import { APP, BETA_USER, GONE, setup } from './testkit.ts'
import { ADMIN, F_APPROVAL, MEMBER, ROLE_ADMIN, T_APPROVED, leave } from '../_shared/workflow/fixture.ts'
import type { FormNode, TimeNode } from '../_shared/workflow/graph.ts'

const SHORT = { ...VALID, end: '2026-10-12' } // 1 day, so the condition takes "no"

Deno.test('start: stores the record, the start submission and a role task on the approval step', async () => {
  const { db, start } = setup()
  const res = await start()
  assertEquals(res.status, 200)
  const [rec] = db.records
  assertEquals(res.body, { recordId: rec.id, status: 'open', error: null })
  assertEquals([rec.title, rec.current_node_id, rec.step, rec.status, rec.data.days], ['Leave approval: Ada', 'approve', 1, 'open', 3])
  assertEquals(db.submissions.map((s) => [s.node_id, s.outcome, s.task_id]), [['start', 'submitted', null]])
  assertEquals(db.tasks.map((t) => [t.node_id, t.assignee_role_id, t.due_at?.toISOString()]), [['approve', ROLE_ADMIN, '2026-10-13T12:00:00.000Z']])
  assertEquals(db.events.map((e) => e.kind), ['started', 'task'])
})

Deno.test('start is refused without access, on a draft, from another org, and with bad answers', async () => {
  const noAccess = setup(); noAccess.db.starters.clear()
  assertEquals((await noAccess.start()).status, 403)
  const draft = setup(); draft.db.workflows[0].status = 'draft'
  assertEquals((await draft.start()).status, 409)
  const stranger = setup()
  assertEquals((await stranger.start(VALID, BETA_USER)).status, 404)
  const bad = setup()
  const res = await bad.start({ ...VALID, name: '' })
  assertEquals([res.status, res.body.fieldErrors], [400, { name: 'This field is required.' }])
  for (const s of [noAccess, draft, stranger, bad]) assertEquals([s.db.records.length, s.db.submissions.length], [0, 0])
})

Deno.test('a non-holder of the role gets the claim_task refusal, with no hint the task exists', async () => {
  const { db, start, act } = setup()
  await start()
  const res = await act(db.tasks[0].id, 'approved', MEMBER)
  assertEquals([res.status, res.body.error], [403, 'Not allowed.'])
  assertEquals(db.tasks[0].status, 'open')
})
Deno.test('a role task must be claimed; approving runs the condition and schedules the Time step', async () => {
  const { db, start, act, claim } = setup()
  await start()
  const taskId = db.tasks[0].id
  const early = await act(taskId, 'approved')
  assertEquals([early.status, early.body.error], [409, 'Claim this task before you act on it.'])
  claim()
  const res = await act(taskId, 'approved')
  assertEquals([res.status, db.tasks[0].status], [200, 'done'])
  const rec = db.records[0]
  assertEquals([rec.current_node_id, rec.step, rec.status, rec.data.comment], ['wait', 3, 'open', 'Fine'])
  assertEquals(db.scheduled.map((s) => [s.resume_node_id, s.run_at.toISOString(), s.state_at_schedule]), [['wait', '2026-10-12T12:00:00.000Z', 3]])
  assertEquals(db.events.filter((e) => e.kind === 'action').map((e) => e.detail),
    [{ type: 'send_message', edge: 'e2', template: 'Record approved', people: 1, emails: 1, notices: 1, skipped: 0 }])
  assertEquals(db.events.find((e) => e.kind === 'condition')?.detail, { outcome: 'yes' })
})

Deno.test('reject runs the set_status action and closes the record as rejected', async () => {
  const { db, start, act, claim } = setup()
  await start()
  const res = await act(claim(), 'rejected')
  assertEquals(res.body.status, 'rejected')
  assertEquals(res.body.error, null)
  assertEquals([db.records[0].status, db.records[0].label, db.records[0].current_node_id], ['rejected', 'Rejected by manager', 'rejected'])
  assertEquals(db.events.at(-1)?.kind, 'closed')
})

Deno.test('a short leave takes the No path and closes as done', async () => {
  const { db, start, act, claim } = setup()
  await start(SHORT)
  await act(claim(), 'approved')
  assertEquals([db.records[0].status, db.records[0].current_node_id, db.scheduled.length], ['done', 'done', 0])
})

Deno.test('an outcome the step does not offer is refused', async () => {
  const { db, start, act, claim } = setup()
  await start()
  const res = await act(claim(), 'submitted')
  assertEquals([res.status, res.body.error, db.tasks[0].status], [400, 'Choose Approve or Reject.', 'open'])
})

Deno.test('only the assignee or the person who claimed the task may act', async () => {
  const { start, act, claim } = setup()
  await start()
  const res = await act(claim(), 'approved', MEMBER)
  assertEquals([res.status, res.body.error], [403, 'Not allowed.'])
})

Deno.test('a role holder who did not claim the task is told it is assigned to someone else', async () => {
  const { db, start, act, claim } = setup()
  db.holders.add(`${MEMBER}:${ROLE_ADMIN}`)
  await start()
  const res = await act(claim(), 'approved', MEMBER)
  assertEquals([res.status, res.body.error], [403, 'This task is assigned to someone else.'])
})
Deno.test('a non-assignee on a user-assigned task is told it is assigned to someone else', async () => {
  const g = leave()
  ;(g.nodes.find((n) => n.id === 'approve') as FormNode).assignee = { user: ADMIN }
  const { db, start, act } = setup(g)
  await start()
  const res = await act(db.tasks[0].id, 'approved', MEMBER)
  assertEquals([res.status, res.body.error], [403, 'This task is assigned to someone else.'])
  assertEquals(db.tasks[0].status, 'open')
})

Deno.test('two simultaneous approvals advance the record once', async () => {
  const { db, start, act, claim } = setup()
  await start()
  const taskId = claim()
  const results = await Promise.all([act(taskId, 'approved'), act(taskId, 'approved')])
  assertEquals(results.map((r) => r.status).sort(), [200, 409])
  assertEquals(results.find((r) => r.status === 409)?.body.error, 'This task is already done.')
  assertEquals([db.submissions.filter((s) => s.task_id === taskId).length, db.records[0].step, db.scheduled.length], [1, 3, 1])
})

Deno.test('acting on a task whose record moved on is refused', async () => {
  const { db, start, act, claim } = setup()
  await start()
  db.records[0].current_node_id = 'long'
  const res = await act(claim(), 'approved')
  assertEquals(res.status, 409)
  assertMatch(String(res.body.error), /moved on/)
})

Deno.test('a failing action stops the record with the reason; nothing after it runs', async () => {
  const g = leave()
  g.edges[1].actions = [{ type: 'set_status', label: '' }]
  const { db, start, act, claim } = setup(g)
  await start()
  const res = await act(claim(), 'approved')
  assertEquals([res.status, res.body.status], [200, 'error'])
  assertEquals(res.body.error, db.records[0].error)
  assertEquals(typeof res.body.error, 'string')
  const rec = db.records[0]
  assertEquals([rec.status, rec.current_node_id, db.scheduled.length, db.submissions.length], ['error', 'approve', 0, 2])
  assertMatch(rec.error ?? '', /Set status/)
  assertEquals(db.events.at(-1)?.kind, 'error')
})

Deno.test('a removed role stops the record with an error', async () => {
  const { db, start } = setup()
  db.roles = []
  await start()
  assertEquals([db.records[0].status, db.tasks.length], ['error', 0])
  assertMatch(db.records[0].error ?? '', /role .* no longer exists/)
})

Deno.test('a step assigned from a step nobody submitted stops with an error', async () => {
  const g = leave()
  ;(g.nodes[1] as FormNode).assignee = { step: 'approve' }
  const { db, start } = setup(g)
  await start()
  assertEquals(db.records[0].status, 'error')
  assertMatch(db.records[0].error ?? '', /Nobody has submitted/)
})

Deno.test('a Time step relative to an unreadable date stops with an error', async () => {
  const g = leave()
  const wait = g.nodes[3] as TimeNode
  delete wait.after
  wait.relative = { field: 'reason', amount: 1, unit: 'days', direction: 'before' }
  const { db, start, act, claim } = setup(g)
  await start()
  await act(claim(), 'approved')
  assertEquals([db.records[0].status, db.records[0].current_node_id, db.scheduled.length], ['error', 'wait', 0])
  assertMatch(db.records[0].error ?? '', /date/)
})

Deno.test('a loop of Condition steps stops with an error instead of spinning', async () => {
  const g = leave()
  g.edges = g.edges.map((e) => (e.id === 'e4' ? { ...e, to: 'long' } : e)) // long --yes--> long; the publish check refuses this
  const { db, start, act, claim } = setup(g)
  await start()
  await act(claim(), 'approved')
  assertEquals(db.records[0].status, 'error')
  assertMatch(db.records[0].error ?? '', /loops without stopping/)
})

Deno.test('a loop back through a Form step creates a fresh task each visit', async () => {
  const g = leave()
  g.nodes.push({ id: 'fix', type: 'form', label: 'Fix request', formId: F_APPROVAL, assignee: { step: 'start' }, mode: 'fill', position: { x: 0, y: 200 } })
  g.edges = g.edges.map((e) => (e.id === 'e3' ? { ...e, to: 'fix', actions: [] } : e))
  g.edges.push({ id: 'e7', from: 'fix', outcome: 'submitted', to: 'approve', actions: [] })
  const { db, start, act, claim } = setup(g)
  await start()
  await act(claim(), 'rejected')
  assertEquals([db.tasks[1].node_id, db.tasks[1].assignee_user_id], ['fix', MEMBER])
  assertEquals((await act(db.tasks[1].id, 'submitted', MEMBER, { comment: 'Dates fixed' })).status, 200)
  assertEquals([db.tasks.length, db.tasks[2].node_id, db.tasks[2].status, db.records[0].data.comment], [3, 'approve', 'open', 'Dates fixed'])
})

Deno.test('resume continues a due Time step and runs its edge actions', async () => {
  const { db, start, act, claim, resume } = setup()
  await start()
  await act(claim(), 'approved')
  assertEquals(await resume(new Date('2026-10-12T11:59:00Z')), []) // not due yet
  assertEquals(await resume(new Date('2026-10-12T12:00:00Z')), ['done'])
  assertEquals([db.records[0].status, db.records[0].current_node_id, db.scheduled[0].status], ['done', 'done', 'done'])
  assertEquals(db.events.filter((e) => e.kind === 'action').at(-1)?.detail.type, 'generate_pdf')
})

Deno.test('resume skips a row whose record moved on, or closed, since it was scheduled', async () => {
  const moved = setup()
  await moved.start()
  await moved.act(moved.claim(), 'approved')
  moved.db.records[0].step = 7
  assertEquals(await moved.resume(new Date('2026-10-13T00:00:00Z')), ['skipped'])
  assertEquals([moved.db.records[0].status, moved.db.records[0].current_node_id, moved.db.scheduled[0].status], ['open', 'wait', 'skipped'])
  assertEquals(moved.db.events.at(-1)?.kind, 'skipped')

  const closed = setup()
  await closed.start()
  await closed.act(closed.claim(), 'approved')
  closed.db.records[0].status = 'done'
  assertEquals(await closed.resume(new Date('2026-10-13T00:00:00Z')), ['skipped'])
})

const withEmailField = (s: ReturnType<typeof setup>) => {
  s.db.forms[1].schema = [{ key: 'comment', type: 'long_text', label: 'Comment' }, { key: 'notify', type: 'short_text', label: 'Email' }]
}
const sendTo = (recipients: unknown[]) => {
  const g = leave()
  g.edges[1].actions = [{ type: 'send_message', templateId: T_APPROVED, recipients } as never]
  return setup(g)
}

Deno.test('a new task notifies its holders in the app and by email, with escaped values', async () => {
  const { db, start } = setup()
  await start({ ...VALID, name: '<script>alert(1)</script>' })
  const task = db.tasks[0]
  assertEquals(db.notifications.map((n) => [n.user_id, n.kind, n.link, n.title]),
    [[ADMIN, 'task_assigned', `#/tasks/${task.id}`, 'New task: Leave approval: <script>alert(1)</script>']])
  assertEquals(db.messages.map((m) => [m.recipient_email, m.recipient_user_id, m.status, m.record_id]), [['admin@alpha.test', ADMIN, 'queued', db.records[0].id]])
  const link = `${APP}#/tasks/${task.id}`
  assertEquals(db.messages[0].body_html,
    `<p>Hello admin@alpha.test, &quot;Leave approval: &lt;script&gt;alert(1)&lt;/script&gt;&quot; needs Admin: <a href="${link}">${link}</a></p>`)
  assertEquals(db.messages[0].body_text, `Hello admin@alpha.test, "Leave approval: <script>alert(1)</script>" needs Admin: ${link}`)
  const ev = db.events.find((e) => e.kind === 'task')?.detail
  assertEquals([ev?.notified, ev?.emailed], [1, 1])
})
Deno.test('a muted email type still gets the in-app notice', async () => {
  const { db, start } = setup()
  db.muted.add(`${ADMIN}:task_assigned`)
  await start()
  assertEquals([db.notifications.length, db.messages.length], [1, 0])
})
Deno.test('Send message queues the template for the record starter; the approver is the step assignee', async () => {
  const { db, start, act, claim } = setup()
  await start()
  claim()
  await act(db.tasks[0].id, 'approved')
  const rec = db.records[0]
  const sent = db.messages.filter((m) => m.template_id === T_APPROVED)
  assertEquals(sent.map((m) => [m.recipient_email, m.subject]), [['member@alpha.test', 'Approved: Leave approval: Ada']])
  assertEquals(sent[0].body_text, `admin@alpha.test approved it. ${APP}#/records/${rec.id}`)
  assertEquals(db.notifications.filter((n) => n.kind === 'record_approved').map((n) => [n.user_id, n.link]), [[MEMBER, `#/records/${rec.id}`]])
})
Deno.test('recipients: role, person, step and an email field, each person once; unresolvable ones are skipped and counted', async () => {
  const s = sendTo([{ role: ROLE_ADMIN }, { user: ADMIN }, { step: 'start' }, { field: 'notify' }, { field: 'reason' }, { user: GONE }])
  withEmailField(s)
  await s.start()
  s.claim()
  await s.act(s.db.tasks[0].id, 'approved', ADMIN, { comment: 'Fine', notify: 'Parent@Example.com' })
  assertEquals(s.db.messages.filter((m) => m.template_id === T_APPROVED).map((m) => m.recipient_email).sort(),
    ['admin@alpha.test', 'member@alpha.test', 'parent@example.com'])
  assertEquals(s.db.notifications.filter((n) => n.kind === 'record_approved').map((n) => n.user_id).sort(), [ADMIN, MEMBER])
  assertEquals(s.db.events.find((e) => e.kind === 'action')?.detail,
    { type: 'send_message', edge: 'e2', template: 'Record approved', people: 3, emails: 3, notices: 2, skipped: 2 })
})
Deno.test('a Send message whose template is gone, or that finds nobody, stops the record with the reason', async () => {
  const gone = setup()
  gone.db.templates = gone.db.templates.filter((t) => t.id !== T_APPROVED)
  await gone.start()
  gone.claim()
  await gone.act(gone.db.tasks[0].id, 'approved')
  assertEquals([gone.db.records[0].status, gone.db.records[0].error],
    ['error', 'The message template of a "Send message" action no longer exists. Ask a workflow manager to choose another.'])
  const nobody = sendTo([{ field: 'reason' }])
  await nobody.start()
  nobody.claim()
  await nobody.act(nobody.db.tasks[0].id, 'approved')
  assertEquals([nobody.db.records[0].status, nobody.db.records[0].error],
    ['error', '"Send message" found nobody to send "Record approved" to. Ask a workflow manager to check its recipients.'])
  assertEquals(nobody.db.submissions.map((x) => x.node_id), ['start', 'approve']) // the approval that triggered it is kept
  assertEquals(nobody.db.messages.filter((m) => m.template_id === T_APPROVED).length, 0)
})
Deno.test('an in-app template notifies members and queues no email; raw addresses are skipped', async () => {
  const s = sendTo([{ starter: true }, { field: 'notify' }])
  withEmailField(s)
  s.db.templates = s.db.templates.map((t) => (t.id === T_APPROVED ? { ...t, channel: 'in_app' as const } : t))
  await s.start()
  s.claim()
  await s.act(s.db.tasks[0].id, 'approved', ADMIN, { comment: 'Fine', notify: 'parent@example.com' })
  assertEquals(s.db.messages.filter((m) => m.template_id === T_APPROVED).length, 0)
  assertEquals(s.db.notifications.filter((n) => n.kind === 'record_approved').map((n) => n.user_id), [MEMBER])
  assertEquals(s.db.events.find((e) => e.kind === 'action')?.detail.skipped, 1)
})
