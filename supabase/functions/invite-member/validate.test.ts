import { assertEquals } from 'jsr:@std/assert@1'
import { validateInvite } from './validate.ts'

const org = '0000000a-0000-0000-0000-000000000001'

Deno.test('accepts and normalises a valid invite', () => {
  assertEquals(validateInvite({ orgId: org, email: '  Jo@School.test ', roleIds: [] }),
    { ok: true, value: { orgId: org, email: 'jo@school.test', roleIds: [] } })
})
Deno.test('rejects a bad email', () => {
  assertEquals(validateInvite({ orgId: org, email: 'nope', roleIds: [] }), { ok: false, error: 'Enter a valid email address.' })
})
Deno.test('rejects a non-uuid org or role', () => {
  assertEquals(validateInvite({ orgId: 'x', email: 'a@b.test', roleIds: [] }).ok, false)
  assertEquals(validateInvite({ orgId: org, email: 'a@b.test', roleIds: ['x'] }).ok, false)
})
Deno.test('rejects a non-object body', () => {
  assertEquals(validateInvite(null).ok, false)
})
