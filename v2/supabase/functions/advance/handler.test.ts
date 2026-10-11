import { assertEquals } from 'jsr:@std/assert@1'
import { advance, type Deps } from './handler.ts'
import { setup } from './testkit.ts'
import { VALID } from '../_shared/forms/fixture.ts'
import { MEMBER, WF } from '../_shared/workflow/fixture.ts'

const deps = (store: Deps['store'], user: string | null = MEMBER): Deps =>
  ({ userId: () => Promise.resolve(user), store, fileExists: () => Promise.resolve(true), now: () => new Date('2026-10-11T12:00:00Z') })

Deno.test('rejects a malformed body before touching the database', async () => {
  const { store, db } = setup()
  for (const body of [null, [], { action: 'start', workflowId: 'x', answers: {} }, { action: 'start', workflowId: WF }, { action: 'submit', taskId: WF, outcome: 'maybe', answers: {} }, { action: 'delete', workflowId: WF, answers: {} }]) {
    assertEquals((await advance(body, deps(store))).status, 400)
  }
  assertEquals(db.records.length, 0)
})
Deno.test('401 without a session', async () => {
  const { store } = setup()
  assertEquals((await advance({ action: 'start', workflowId: WF, answers: VALID }, deps(store, null))).status, 401)
})
Deno.test('start and submit reach the engine', async () => {
  const { store, db } = setup()
  const started = await advance({ action: 'start', workflowId: WF, answers: VALID }, deps(store))
  assertEquals([started.status, started.body.recordId], [200, db.records[0].id])
  const early = await advance({ action: 'submit', taskId: db.tasks[0].id, outcome: 'approved', answers: {} }, deps(store))
  assertEquals([early.status, early.body.error], [409, 'Claim this task before you act on it.']) // a role task, unclaimed
})
