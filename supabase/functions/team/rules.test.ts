import { assertEquals } from 'jsr:@std/assert@1'
import { decide, type Member } from './rules.ts'

const owner: Member = { id: 'o', firmId: 'f', role: 'owner', status: 'active' }
const admin: Member = { id: 'a', firmId: 'f', role: 'admin', status: 'active' }
const accountant: Member = { id: 'c', firmId: 'f', role: 'accountant', status: 'active' }
const otherFirm: Member = { id: 'x', firmId: 'g', role: 'viewer', status: 'active' }

Deno.test('admins and owners may invite', () => {
  assertEquals(decide(admin, null, 'invite'), null)
  assertEquals(decide(accountant, null, 'invite'), "Your role can't manage users.")
})

Deno.test('nobody removes themselves or the owner (except nobody)', () => {
  assertEquals(decide(owner, owner, 'remove'), "You can't remove yourself.")
  assertEquals(decide(admin, owner, 'remove'), 'Only the owner can change the owner.')
  assertEquals(decide(owner, admin, 'remove'), null)
})

Deno.test('targets must be in the same firm', () => {
  assertEquals(decide(owner, otherFirm, 'remove'), 'That person is not in your firm.')
})
