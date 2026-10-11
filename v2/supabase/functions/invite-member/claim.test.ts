import { assertEquals } from 'jsr:@std/assert@1'
import { claimInvite } from './claim.ts'

// Fake admin client: upsert(ignoreDuplicates) returns no row on conflict, like PostgREST.
const fake = (insertedId: string | null, existingId: string | null) => ({
  from: () => ({
    upsert: () => ({ select: () => Promise.resolve({ data: insertedId ? [{ id: insertedId }] : [], error: null }) }),
    select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: existingId ? { id: existingId } : null, error: null }) }) }) }),
  }),
})

Deno.test('first invite is created', async () => {
  assertEquals(await claimInvite(fake('m1', null), 'o', 'a@b.test', 'u'), { id: 'm1', created: true })
})

Deno.test('losing a concurrent race returns the existing member', async () => {
  assertEquals(await claimInvite(fake(null, 'm0'), 'o', 'a@b.test', 'u'), { id: 'm0', created: false })
})
