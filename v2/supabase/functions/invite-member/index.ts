import { createClient } from 'npm:@supabase/supabase-js@2'
import { validateInvite } from './validate.ts'
import { claimInvite } from './claim.ts'
import { inviteMessage } from './message.ts'
import { readAppUrl } from '../_shared/comms/render.ts'

const appUrl = readAppUrl(Deno.env.get('APP_URL')) // throws at boot

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
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

  // Invites go through the queue with the org's editable "Invite to org" template; always email, whatever its channel.
  const [{ data: tpl }, { data: org }] = await Promise.all([
    admin.from('message_templates').select('id, subject, body').eq('org_id', orgId).eq('kind', 'invite').eq('is_system', true).maybeSingle(),
    admin.from('orgs').select('name').eq('id', orgId).maybeSingle(),
  ])
  const { error: queueError } = tpl && org
    ? await admin.from('messages').insert(inviteMessage(tpl, { orgId, orgName: org.name, email, appUrl }))
    : { error: new Error('invite template missing') }
  if (queueError) {
    await admin.from('members').delete().eq('id', member.id)
    return json(500, { error: 'Could not send the invite email.' })
  }
  await admin.from('audit_log').insert({ org_id: orgId, actor_id: caller?.id, action: 'member.invite', target: member.id, after: { email, roleIds } })
  return json(200, { memberId: member.id, status: 'invited' })
})
