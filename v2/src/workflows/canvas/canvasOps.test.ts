import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STEP_GAP, addNode, connect, issuesByNode, nextSpot, removeNode, setActions, snap, stepLabel, stepOrder, toFlow } from './canvasOps.ts'
import { LEAVE, leave } from '../../../supabase/functions/_shared/workflow/fixture.ts'

test('new steps get unique ids and snap to the 16px grid', () => {
  const a = addNode(LEAVE, 'form', { x: 101, y: 7 })
  const b = addNode(a.graph, 'form', { x: 0, y: 200 })
  assert.deepEqual([a.id, b.id], ['form1', 'form2'])
  assert.deepEqual(a.graph.nodes.at(-1)?.position, { x: 96, y: 0 })
  assert.equal(addNode(LEAVE, 'condition', { x: 0, y: 200 }).id, 'if1')
  assert.deepEqual(snap({ x: 8, y: -9 }), { x: 16, y: -16 })
  assert.equal(LEAVE.nodes.length, 6) // never mutates
})
test('adding at a spot that is taken nudges the new step by 32px until it is free', () => {
  const first = addNode({ nodes: [], edges: [] }, 'form', { x: 100, y: 100 })
  const second = addNode(first.graph, 'form', { x: 100, y: 100 })
  const third = addNode(second.graph, 'form', { x: 100, y: 100 })
  assert.deepEqual(first.graph.nodes[0].position, { x: 96, y: 96 })
  assert.deepEqual(second.graph.nodes[1].position, { x: 128, y: 128 })
  assert.deepEqual(third.graph.nodes[2].position, { x: 160, y: 160 })
})
test('one connection per outcome: reconnecting replaces it and keeps its actions; empty disconnects', () => {
  const g = connect(LEAVE, 'approve', 'rejected', 'done')
  const e3 = g.edges.find((e) => e.id === 'e3')
  assert.deepEqual([e3?.to, e3?.actions.length, g.edges.length], ['done', 1, 6])
  assert.equal(connect(LEAVE, 'approve', 'rejected', '').edges.some((e) => e.id === 'e3'), false)
  const added = connect(removeNode(leave(), 'rejected'), 'approve', 'rejected', 'done')
  assert.equal(added.edges.at(-1)?.id, 'e3') // removing "rejected" freed e3; newId takes the first free e<n>
})
test('removing a step drops every connection into or out of it', () => {
  const g = removeNode(LEAVE, 'long')
  assert.deepEqual(g.edges.map((e) => e.id), ['e1', 'e3', 'e6'])
  assert.deepEqual(setActions(g, 'e6', []).edges.find((e) => e.id === 'e6')?.actions, [])
})
test('issues on connections are pinned to the step they leave', () => {
  const pinned = issuesByNode(LEAVE, [{ message: 'a', nodeId: 'long' }, { message: 'b', edgeId: 'e3' }, { message: 'c' }])
  assert.deepEqual([...pinned], [['long', ['a']], ['approve', ['b']]])
})
test('toFlow: one source handle per outcome, labelled edges, selection and the current step', () => {
  const { nodes, edges } = toFlow(LEAVE, { selected: 'long', current: 'approve', open: new Map([['approve', 2]]) })
  assert.deepEqual(nodes.filter((n) => n.selected).map((n) => n.id), ['long'])
  assert.deepEqual(nodes.find((n) => n.id === 'approve')?.data.open, 2)
  assert.equal(nodes.find((n) => n.data.current)?.id, 'approve')
  assert.deepEqual(edges.find((e) => e.id === 'e3'), { id: 'e3', source: 'approve', sourceHandle: 'rejected', target: 'rejected', label: 'Rejected · 1 action' })
  assert.equal(edges.find((e) => e.id === 'e4')?.label, 'Yes')
})
test('a card is announced with its issues and open records, and only the parts that are not zero', () => {
  const name = (opts: Parameters<typeof toFlow>[1]) => toFlow(LEAVE, opts).nodes.find((n) => n.id === 'approve')?.ariaLabel
  assert.equal(name({}), 'Form step: Manager approval')
  assert.equal(name({ issues: new Map([['approve', ['a', 'b']]]), open: new Map([['approve', 3]]) }), 'Form step: Manager approval. 2 issues. 3 open records on this step.')
  assert.equal(name({ issues: new Map([['approve', ['a']]]), open: new Map([['approve', 1]]) }), 'Form step: Manager approval. 1 issue. 1 open record on this step.')
})
test('the step list follows the path from Start, then lists unreachable steps apart', () => {
  const { reached, loose } = stepOrder(LEAVE)
  assert.deepEqual(reached.map((n) => n.id), ['start', 'approve', 'long', 'wait', 'done', 'rejected'])
  assert.deepEqual(loose, [])
  const detached = removeNode(LEAVE, 'approve')
  const o = stepOrder(detached)
  assert.deepEqual(o.reached.map((n) => n.id), ['start'])
  assert.deepEqual(o.loose.map((n) => n.id), ['long', 'wait', 'done', 'rejected'])
  assert.deepEqual(stepOrder({ nodes: [], edges: [] }), { reached: [], loose: [] })
})
test('unnamed steps read as a numbered default, named ones keep their name', () => {
  const g = addNode(addNode(addNode({ nodes: [], edges: [] }, 'form', { x: 0, y: 0 }).graph, 'form', { x: 400, y: 0 }).graph, 'condition', { x: 800, y: 0 }).graph
  assert.deepEqual(g.nodes.map((n) => stepLabel(g, n)), ['Form 1', 'Form 2', 'Condition 1'])
  assert.equal(stepLabel(LEAVE, LEAVE.nodes[1]), 'Manager approval')
})
test('new steps added without a pointer go one card gap to the right of the rightmost step', () => {
  assert.deepEqual(nextSpot({ nodes: [], edges: [] }), { x: 0, y: 0 })
  assert.deepEqual(nextSpot(LEAVE), { x: 960 + STEP_GAP, y: 0 })
  assert.ok(STEP_GAP >= 208 + 96) // room for a card plus its edge labels
})
