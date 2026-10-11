// Structural type so tests can pass a fake; the real supabase-js client satisfies it.
// deno-lint-ignore no-explicit-any
type Admin = { from: (t: string) => any }

// Atomic insert-or-find: on (org_id, email) conflict nothing is inserted and we return the existing row,
// so a concurrent duplicate invite yields `existing` instead of a unique-violation 500.
export async function claimInvite(admin: Admin, orgId: string, email: string, invitedBy: string | undefined) {
  const { data: inserted, error } = await admin.from('members')
    .upsert({ org_id: orgId, email, status: 'invited', invited_by: invitedBy }, { onConflict: 'org_id,email', ignoreDuplicates: true })
    .select('id')
  if (error) throw error
  if (inserted?.length) return { id: inserted[0].id as string, created: true }
  const { data: existing } = await admin.from('members').select('id').eq('org_id', orgId).eq('email', email).maybeSingle()
  if (!existing) throw new Error('invite vanished')
  return { id: existing.id as string, created: false }
}
