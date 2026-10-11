import { assertEquals } from 'jsr:@std/assert@1'
import { saveWorkflow, type Deps, type SaveOutcome } from './handler.ts'
import { LEAVE, REFS, WF, leave } from '../_shared/workflow/fixture.ts'

const ORG = '0000000a-0000-0000-0000-000000000001'
const USER = '00000000-0000-0000-0000-0000000000a2'
const VERSION = '2026-10-11T12:00:00.000000+00:00'

function setup(over: Partial<Deps> = {}, status: 'draft' | 'published' = 'draft', perms = ['workflows.manage', 'workflows.publish']) {
  const saved: Parameters<Deps['save']>[0][] = []
  const deps: Deps = {
    userId: () => Promise.resolve(USER),
    loadWorkflow: (id) => Promise.resolve(id === WF ? { id, org_id: ORG, status } : null),
    can: (_org, perm) => Promise.resolve(perms.includes(perm)),
    refs: () => Promise.resolve(REFS),
    save: (row) => { saved.push(row); return Promise.resolve<SaveOutcome>({ ok: true, updatedAt: 'v2', status: row.status }) },
    ...over,
  }
  return { deps, saved }
}
const body = (over: Record<string, unknown> = {}) => ({ workflowId: WF, name: ' Leave approval ', graph: LEAVE, updatedAt: VERSION, ...over })
const broken = () => { const g = leave(); g.edges = g.edges.filter((e) => e.id !== 'e3'); return g }

Deno.test('rejects a malformed body', async () => {
  const { deps, saved } = setup()
  for (const b of [null, body({ workflowId: 'x' }), body({ graph: { nodes: 'x' } }), body({ name: '' }), body({ publish: 'yes' }), body({ updatedAt: 1 })]) {
    assertEquals((await saveWorkflow(b, deps)).status, 400)
  }
  assertEquals(saved.length, 0)
})
Deno.test('401, 404 and 403 before any write', async () => {
  assertEquals((await saveWorkflow(body(), setup({ userId: () => Promise.resolve(null) }).deps)).status, 401)
  assertEquals((await saveWorkflow(body({ workflowId: '0000000b-0000-0000-0000-00000000c009' }), setup().deps)).status, 404)
  const viewer = setup({}, 'draft', [])
  assertEquals((await saveWorkflow(body(), viewer.deps)).status, 403)
  const noPublish = setup({}, 'draft', ['workflows.manage'])
  const res = await saveWorkflow(body({ publish: true }), noPublish.deps)
  assertEquals([res.status, res.body.error, noPublish.saved.length], [403, 'You need permission to publish workflows.', 0])
})
Deno.test('a draft saves with issues and returns them', async () => {
  const { deps, saved } = setup()
  const res = await saveWorkflow(body({ graph: broken() }), deps)
  assertEquals([res.status, saved[0].status, saved[0].name, saved[0].updated_by, saved[0].expected], [200, 'draft', 'Leave approval', USER, VERSION])
  assertEquals((res.body.issues as unknown[]).length, 2)
})
Deno.test('publishing runs the check and refuses a broken graph', async () => {
  const { deps, saved } = setup()
  const res = await saveWorkflow(body({ graph: broken(), publish: true }), deps)
  assertEquals([res.status, res.body.error, saved.length], [409, 'Fix the issues on the canvas before publishing.', 0])
  const ok = await saveWorkflow(body({ publish: true }), deps)
  assertEquals([ok.status, ok.body.status, saved[0].status], [200, 'published', 'published'])
})
Deno.test('a published workflow must stay valid when edited', async () => {
  const { deps, saved } = setup({}, 'published')
  const res = await saveWorkflow(body({ graph: broken() }), deps)
  assertEquals([res.status, saved.length], [409, 0])
  assertEquals(res.body.error, 'This workflow is published, so it must stay valid. Fix the issues on the canvas, then save.')
})
Deno.test('a concurrent edit is a conflict, not a lost update', async () => {
  const { deps } = setup({ save: () => Promise.resolve<SaveOutcome>({ ok: false, conflict: true }) })
  const res = await saveWorkflow(body(), deps)
  assertEquals([res.status, res.body.conflict], [409, true])
})
Deno.test('an open step cannot be deleted', async () => {
  const { deps } = setup({ save: () => Promise.resolve<SaveOutcome>({ ok: false, openOn: 'approve' }) })
  const res = await saveWorkflow(body(), deps)
  assertEquals([res.status, res.body.nodeId], [409, 'approve'])
  assertEquals(res.body.error, 'A step with open records cannot be deleted. Put it back, or wait until those records move on.')
})
