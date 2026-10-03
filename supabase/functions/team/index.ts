import { createClient } from 'npm:@supabase/supabase-js@2'
import { decide, resolveAppUrl, type Member, type Role } from './rules.ts'

const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const appUrl = resolveAppUrl(Deno.env.get('APP_URL'), url)
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

type ProfileRow = { id: string; firm_id: string; role: Role; status: Member['status']; email: string; name: string; user_id: string }
const toMember = (p: ProfileRow): Member => ({ id: p.id, firmId: p.firm_id, role: p.role, status: p.status })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })

  if (!appUrl) {
    console.error('APP_URL is not set; refusing to send invite links.')
    return json(500, { error: 'Invites are not configured yet. Contact support.' })
  }
  const admin = createClient(url, serviceKey)
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /, '')
  const { data: auth } = await admin.auth.getUser(jwt ?? '')
  if (!auth.user) return json(401, { error: 'Please sign in again.' })

  const { data: actorRow } = await admin.from('profiles').select('*').eq('user_id', auth.user.id).single<ProfileRow>()
  if (!actorRow) return json(403, { error: "Your role can't manage users." })
  const { data: writable } = await admin.rpc('firm_can_write', { firm: actorRow.firm_id })
  if (!writable) return json(403, { error: "Your firm can't make changes right now." })

  const body = await req.json().catch(() => null) as
    | { action: 'invite'; name: string; email: string; role: Role }
    | { action: 'resend' | 'remove'; profileId: string }
    | null
  if (!body) return json(400, { error: 'Invalid request.' })

  if (body.action === 'invite') {
    const denied = decide(toMember(actorRow), null, 'invite')
    if (denied) return json(403, { error: denied })
    const email = body.email.trim().toLowerCase()
    const name = body.name.trim()
    if (!name) return json(400, { error: 'Enter their full name.' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'Enter a valid email address.' })
    if (body.role === 'owner') return json(400, { error: 'Use Transfer ownership to make someone the owner.' })
    const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
    if (existing) return json(409, { error: 'Someone with that email already has access.' })
    const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${appUrl}/app/?flow=set-password`, data: { name } })
    if (error || !invited.user) return json(502, { error: 'The invitation email could not be sent. Try again.' })
    const { data: profile, error: insertError } = await admin.from('profiles')
      .insert({ user_id: invited.user.id, firm_id: actorRow.firm_id, name, email, role: body.role, status: 'invited' })
      .select('id').single()
    if (insertError) {
      await admin.auth.admin.deleteUser(invited.user.id)
      return json(500, { error: 'The invitation could not be saved. Try again.' })
    }
    return json(201, { profileId: profile.id })
  }

  const { data: targetRow } = await admin.from('profiles').select('*').eq('id', body.profileId).maybeSingle<ProfileRow>()
  const denied = decide(toMember(actorRow), targetRow ? toMember(targetRow) : null, body.action)
  if (denied) return json(403, { error: denied })

  if (body.action === 'resend') {
    if (targetRow!.status !== 'invited') return json(400, { error: 'Only pending invitations can be resent.' })
    const { error } = await admin.auth.admin.inviteUserByEmail(targetRow!.email, { redirectTo: `${appUrl}/app/?flow=set-password` })
    return error ? json(502, { error: 'The invitation email could not be sent. Try again.' }) : json(200, {})
  }

  const { error } = await admin.auth.admin.deleteUser(targetRow!.user_id)
  return error ? json(500, { error: 'That person could not be removed. Try again.' }) : json(200, {})
})
