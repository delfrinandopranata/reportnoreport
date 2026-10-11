import { assertEquals } from 'jsr:@std/assert@1'
import { submitForm, type Deps } from './handler.ts'
import { FORM, ORG, PREFIX, USER, VALID } from '../_shared/forms/fixture.ts'

const FORM_ID = '0000000a-0000-0000-0000-0000000000f1'

function setup(over: Partial<Deps> = {}) {
  const inserted: Record<string, unknown>[] = []
  const deps: Deps = {
    userId: () => Promise.resolve(USER),
    loadForm: (id) => Promise.resolve(id === FORM_ID ? { id, org_id: ORG, schema: FORM } : null),
    insert: (row) => { inserted.push(row); return Promise.resolve('sub-1') },
    now: () => new Date('2026-10-11T12:00:00Z'),
    fileExists: () => Promise.resolve(true),
    ...over,
  }
  return { deps, inserted }
}

Deno.test('rejects a malformed body', async () => {
  const { deps } = setup()
  assertEquals((await submitForm(null, deps)).status, 400)
  assertEquals((await submitForm({ formId: 'x', answers: {} }, deps)).status, 400)
  assertEquals((await submitForm({ formId: FORM_ID, answers: [] }, deps)).status, 400)
})
Deno.test('401 without a session', async () => {
  const { deps } = setup({ userId: () => Promise.resolve(null) })
  assertEquals((await submitForm({ formId: FORM_ID, answers: VALID }, deps)).status, 401)
})
Deno.test('404 when the form is not visible to the caller', async () => {
  const { deps } = setup()
  const res = await submitForm({ formId: '0000000b-0000-0000-0000-0000000000f9', answers: VALID }, deps)
  assertEquals(res.status, 404)
})
Deno.test('409 when the stored form definition is invalid', async () => {
  const { deps, inserted } = setup({ loadForm: (id) => Promise.resolve({ id, org_id: ORG, schema: [{ key: 'Bad', type: 'x' }] }) })
  assertEquals((await submitForm({ formId: FORM_ID, answers: {} }, deps)).status, 409)
  assertEquals(inserted.length, 0)
})
Deno.test('400 with field errors and nothing stored', async () => {
  const { deps, inserted } = setup()
  const res = await submitForm({ formId: FORM_ID, answers: { ...VALID, name: '' } }, deps)
  assertEquals(res.status, 400)
  assertEquals(res.body.fieldErrors, { name: 'This field is required.' })
  assertEquals(inserted.length, 0)
})
Deno.test('recomputes calculated values and discards client values', async () => {
  const { deps, inserted } = setup()
  const res = await submitForm({ formId: FORM_ID, answers: { ...VALID, days: 99, total: 9999, hack: 'x' } }, deps)
  assertEquals(res.status, 200)
  assertEquals(res.body.submissionId, 'sub-1')
  const row = inserted[0] as { org_id: string; submitted_by: string; answers: Record<string, unknown> }
  assertEquals([row.org_id, row.submitted_by], [ORG, USER])
  assertEquals([row.answers.days, row.answers.total, 'hack' in row.answers], [3, 12.5, false])
})
Deno.test("rejects a file from another user's folder", async () => {
  const { deps } = setup()
  const other = PREFIX.replace(USER, '00000000-0000-0000-0000-0000000000a2') + 'sig.png'
  const res = await submitForm({ formId: FORM_ID, answers: { ...VALID, sig: other } }, deps)
  assertEquals([res.status, res.body.fieldErrors], [400, { sig: 'Sign again.' }])
})
Deno.test('rejects a file or signature that was never uploaded', async () => {
  const { deps, inserted } = setup({ fileExists: (p) => Promise.resolve(!p.endsWith('sig.png')) })
  const res = await submitForm({ formId: FORM_ID, answers: VALID }, deps)
  assertEquals([res.status, res.body.fieldErrors], [400, { sig: 'Sign again.' }])
  assertEquals(inserted.length, 0)
})
Deno.test('looks up uploads under the caller prefix', async () => {
  const seen: string[] = []
  const { deps } = setup({ fileExists: (p) => { seen.push(p); return Promise.resolve(true) } })
  await submitForm({ formId: FORM_ID, answers: VALID }, deps)
  assertEquals(seen, [PREFIX + 'sig.png'])
})
