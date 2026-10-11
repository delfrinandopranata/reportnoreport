import { createClient } from 'npm:@supabase/supabase-js@2'
import { validateInvite } from './validate.ts'
import { claimInvite } from './claim.ts'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } })
  const parsed = validateInvite(await req.json().catch(() => null))
  if (!parsed.ok) return json(400, { error: parsed.error })
  const { orgId, email, roleIds } = parsed.value

  const url = Deno.env.get('SUPABASE_URL')!
  // Caller-scoped client: permission checks run as the caller, under RLS.
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: allowed, error: permError } = await asCaller.rpc('has_permission', { p_org: orgId, p_perm: 'members.manage' })
  if (permError || !allowed) return json(403, { error: 'You do not have permission to invite members.' })

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: { user: caller } } = await asCaller.auth.getUser()
  let claim
  try { claim = await claimInvite(admin, orgId, email, caller?.id) } catch { return json(500, { error: 'Could not create the invite.' }) }
  if (!claim.created) return json(200, { memberId: claim.id, status: 'existing' })
  const member = { id: claim.id }

  // Role assignment reuses the RPC so the Owner / no-escalation guards apply to invites too.
  const { error: rolesError } = await asCaller.rpc('set_member_roles', { p_member_id: member.id, p_role_ids: roleIds })
  if (rolesError) {
    await admin.from('members').delete().eq('id', member.id)
    return json(403, { error: rolesError.message })
  }

  const { error: mailError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${req.headers.get('origin') ?? ''}/app/` })
  // An existing auth user cannot be re-invited; they accept on next sign-in via accept_invites().
  if (mailError && !/already been registered/i.test(mailError.message)) {
    await admin.from('members').delete().eq('id', member.id)
    return json(500, { error: 'Could not send the invite email.' })
  }
  await admin.from('audit_log').insert({ org_id: orgId, actor_id: caller?.id, action: 'member.invite', target: member.id, after: { email, roleIds } })
  return json(200, { memberId: member.id, status: 'invited' })
})
