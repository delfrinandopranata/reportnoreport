import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkGraph, durationMs, nextEdge, outcomesOf, readGraph, timeRunAt, type ConditionNode, type EndNode, type FormNode, type Graph, type TimeNode, type WfNode } from './graph.ts'
import { LEAVE, REFS, T_APPROVED, leave } from './fixture.ts'

const msgs = (g: unknown, refs = REFS) => checkGraph(g, refs).map((i) => i.message)
const find = <T extends WfNode = WfNode>(g: Graph, id: string) => g.nodes.find((n) => n.id === id) as T

test('the fixture workflow passes the publish check', () => {
  assert.deepEqual(checkGraph(LEAVE, REFS), [])
})
test('exactly one Start', () => {
  const none = leave()
  none.nodes = none.nodes.filter((n) => n.id !== 'start')
  none.edges = none.edges.filter((e) => e.from !== 'start')
  assert.ok(msgs(none).includes('Add a Start step.'))
  const two = leave()
  two.nodes.push({ ...find(two, 'start'), id: 'start2' })
  two.edges.push({ id: 'e9', from: 'start2', outcome: 'submitted', to: 'approve', actions: [] })
  assert.ok(msgs(two).includes('Keep only one Start step.'))
})
test('every outcome is connected', () => {
  const g = leave()
  g.edges = g.edges.filter((e) => e.id !== 'e3')
  assert.deepEqual(checkGraph(g, REFS), [
    { message: 'Connect the "Rejected" outcome of "Manager approval".', nodeId: 'approve' },
    { message: '"Rejected" cannot be reached from Start.', nodeId: 'rejected' },
  ])
})
test('unreachable steps are reported', () => {
  const g = leave()
  g.nodes.push({ id: 'orphan', type: 'end', status: 'done', position: { x: 0, y: 300 } })
  assert.deepEqual(checkGraph(g, REFS), [{ message: '"End" cannot be reached from Start.', nodeId: 'orphan' }])
})
test('a loop without a Form or Time step is refused; one with either is allowed', () => {
  const stuck = leave()
  stuck.nodes.push({ id: 'c2', type: 'condition', rule: { field: 'days', operator: 'lt', value: 9 }, position: { x: 0, y: 400 } })
  stuck.edges = stuck.edges.filter((e) => e.id !== 'e5')
  stuck.edges.push(
    { id: 'e7', from: 'long', outcome: 'no', to: 'c2', actions: [] },
    { id: 'e8', from: 'c2', outcome: 'yes', to: 'long', actions: [] },
    { id: 'e9', from: 'c2', outcome: 'no', to: 'done', actions: [] },
  )
  const issues = checkGraph(stuck, REFS)
  assert.deepEqual(issues.map((i) => i.nodeId).sort(), ['c2', 'long'])
  assert.match(issues[0].message, /would never stop/)

  const viaForm = leave()
  viaForm.edges = viaForm.edges.map((e) => (e.id === 'e5' ? { ...e, to: 'approve' } : e))
  assert.deepEqual(checkGraph(viaForm, REFS), [])
  const viaTime = leave()
  viaTime.edges = viaTime.edges.map((e) => (e.id === 'e6' ? { ...e, to: 'long' } : e))
  assert.deepEqual(checkGraph(viaTime, REFS), [])
})
test('a condition that loops to itself is refused', () => {
  const g = leave()
  g.edges = g.edges.map((e) => (e.id === 'e4' ? { ...e, to: 'long' } : e))
  assert.ok(checkGraph(g, REFS).some((i) => i.nodeId === 'long' && /would never stop/.test(i.message)))
})
test('referenced forms, roles, people, templates and steps must exist', () => {
  const empty = { forms: new Set<string>(), roles: new Set<string>(), users: new Set<string>(), templates: new Set<string>() }
  assert.deepEqual(msgs(LEAVE, empty), [
    'The form for "Start" no longer exists. Choose another.',
    'The form for "Manager approval" no longer exists. Choose another.',
    'The role assigned to "Manager approval" no longer exists.',
    'The message template for "Send message" no longer exists. Choose another.',
  ])
  const g = leave()
  find<FormNode>(g, 'approve').assignee = { step: 'long' }
  assert.deepEqual(msgs(g), ['"Manager approval" must be assigned from an earlier Start or Form step.'])
  find<FormNode>(g, 'approve').assignee = { user: 'nobody' }
  assert.deepEqual(msgs(g), ['The person assigned to "Manager approval" is no longer a member.'])
  find<FormNode>(g, 'approve').assignee = { role: '' }
  assert.deepEqual(msgs(g), ['Choose who completes "Manager approval".'])
})
test('a Send message action needs a template and recipients that exist; issues pin to the connection', () => {
  const g = leave()
  g.edges[1].actions = [{ type: 'send_message', templateId: T_APPROVED, recipients: [{ step: 'long' }] }]
  assert.deepEqual(checkGraph(g, REFS), [{ message: '"Send message" can only send to the person who completed a Start or Form step.', edgeId: 'e2' }])
  g.edges[1].actions = [{ type: 'send_message' } as never]
  assert.deepEqual(msgs(g), ['Choose a message template for "Send message".'])
})
test('connections must fit their steps', () => {
  const g = leave()
  g.edges.push(
    { id: 'e10', from: 'long', outcome: 'next', to: 'done', actions: [] },
    { id: 'e11', from: 'wait', outcome: 'next', to: 'start', actions: [] },
    { id: 'e12', from: 'wait', outcome: 'next', to: 'ghost', actions: [] },
  )
  assert.deepEqual(msgs(g), [
    '"More than 2 days?" has no "Next" outcome. Delete this connection.',
    'Nothing can lead back to Start. Connect to another step.',
    '"Wait a day" has two paths for "Next". Keep one.',
    'A connection points at a deleted step. Delete it.',
  ])
})
test('actions are checked', () => {
  const g = leave()
  g.edges[2].actions = [{ type: 'set_status', label: ' ' }, { type: 'launch_rocket' } as never]
  assert.deepEqual(msgs(g), ['Enter the status text (up to 60 characters).', 'Remove the unknown action from this connection.'])
})
test('step settings are checked', () => {
  const g = leave()
  find<FormNode>(g, 'approve').due = { amount: 0, unit: 'days' }
  find<ConditionNode>(g, 'long').rule = { field: 'Days!', operator: 'gt' } as never
  find<TimeNode>(g, 'wait').relative = { field: 'start', amount: 1, unit: 'days', direction: 'before' }
  find<EndNode>(g, 'done').status = 'maybe' as never
  assert.deepEqual(msgs(g), [
    'Enter a due time for "Manager approval" between 1 minute and 366 days.',
    'Set the rule for "More than 2 days?".',
    'Choose either a wait time or a date field for "Wait a day".',
    'Choose whether "Approved" ends as done or rejected.',
  ])
})
test('an unreadable graph is one issue, never a throw', () => {
  for (const raw of [null, 'x', { nodes: 'x', edges: [] }, { nodes: [{ id: 1 }], edges: [] }, { nodes: [], edges: [{}] }]) {
    assert.deepEqual(msgs(raw), ['This workflow could not be read. Reload the page.'])
  }
  assert.equal(readGraph(LEAVE), LEAVE)
})
test('next-step resolution', () => {
  assert.equal(nextEdge(LEAVE, 'approve', 'rejected')?.to, 'rejected')
  assert.equal(nextEdge(LEAVE, 'approve', 'submitted'), null)
  assert.deepEqual(outcomesOf(find(LEAVE, 'approve')), ['approved', 'rejected'])
  assert.deepEqual(outcomesOf({ ...find<FormNode>(LEAVE, 'approve'), mode: 'fill' }), ['submitted'])
  assert.deepEqual(outcomesOf(find(LEAVE, 'done')), [])
})
test('time steps: a wait, or a date field before/after', () => {
  const now = new Date('2026-10-11T12:00:00Z')
  const wait = find<TimeNode>(LEAVE, 'wait')
  assert.equal(timeRunAt(wait, {}, now)?.toISOString(), '2026-10-12T12:00:00.000Z')
  const rel = (direction: 'before' | 'after', amount = 1): TimeNode =>
    ({ ...wait, after: undefined, relative: { field: 'start', amount, unit: 'days', direction } })
  assert.equal(timeRunAt(rel('before'), { start: '2026-10-20' }, now)?.toISOString(), '2026-10-19T00:00:00.000Z')
  assert.equal(timeRunAt(rel('after', 0), { start: '2026-10-20' }, now)?.toISOString(), '2026-10-20T00:00:00.000Z')
  assert.equal(timeRunAt(rel('after'), { start: 'soon' }, now), null)
  assert.equal(timeRunAt(rel('after'), {}, now), null)
  assert.equal(durationMs({ amount: 1, unit: 'minutes' }), 60_000)
  assert.equal(durationMs({ amount: 367, unit: 'days' }), null)
  assert.equal(durationMs({ amount: 1.5, unit: 'hours' }), null)
  assert.equal(durationMs({ amount: 1, unit: 'weeks' }), null)
})
