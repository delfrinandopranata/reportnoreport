import { assertEquals } from 'jsr:@std/assert@1'
import { resume } from './handler.ts'
import { setup } from '../advance/testkit.ts'
import type { Store } from '../advance/engine.ts'

const LATER = () => new Date('2026-10-13T00:00:00Z')

async function waiting() {
  const s = setup()
  await s.start()
  await s.act(s.claim(), 'approved') // now waiting on the Time step
  return s
}

Deno.test('401 without the cron secret, and nothing runs', async () => {
  const { store, db } = await waiting()
  assertEquals((await resume({ authorised: false, store, now: LATER })).status, 401)
  assertEquals(db.scheduled[0].status, 'pending')
})
Deno.test('runs every due timer and reports the counts', async () => {
  const { store, db } = await waiting()
  const res = await resume({ authorised: true, store, now: LATER })
  assertEquals([res.status, res.body], [200, { done: 1, skipped: 0, failed: 0 }])
  assertEquals(db.records[0].status, 'done')
})
Deno.test('an unexpected error marks the row failed and the record error', async () => {
  const { store, db } = await waiting()
  const flaky: Store = { tx: (fn) => store.tx((tx) => fn({ ...tx, workflow: () => Promise.reject(new Error('connection lost')) })) }
  const res = await resume({ authorised: true, store: flaky, now: LATER })
  assertEquals(res.body, { done: 0, skipped: 0, failed: 1 })
  assertEquals([db.scheduled[0].status, db.scheduled[0].error], ['failed', 'This step could not run: connection lost'])
  assertEquals([db.records[0].status, db.records[0].error], ['error', 'This step could not run: connection lost'])
})
