import { createClient } from 'npm:@supabase/supabase-js@2'
import { isSuperAdmin, validateCreateFirm, extendTrialEnd, validateSettings, isValidUuid, type ProfileRow } from './rules.ts'
import { resolveAppUrl } from '../team/rules.ts'

const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const appUrl = resolveAppUrl(Deno.env.get('APP_URL'), url)
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })

  const admin = createClient(url, serviceKey)
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /, '')
  const { data: auth } = await admin.auth.getUser(jwt ?? '')
  if (!auth.user) return json(401, { error: 'Please sign in again.' })

  const { data: callerRow } = await admin.from('profiles').select('*').eq('user_id', auth.user.id).single<ProfileRow>()
  if (!isSuperAdmin(callerRow)) return json(403, { error: 'Super-admin access only.' })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return json(400, { error: 'Invalid request.' })

  const action = body.action

  // list_firms — no body needed
  if (action === 'list_firms') {
    const { data: firms, error } = await admin.from('firms')
      .select(`id, name, currency, source, status, billing_status, trial_ends_at, paid_at, created_at`)
      .order('created_at', { ascending: true })
    if (error) {
      console.error('list_firms error:', error)
      return json(500, { error: 'Something went wrong.' })
    }

    const firmIds = (firms ?? []).map((f) => f.id)
    const { data: members } = await admin.from('profiles')
      .select('firm_id')
      .in('firm_id', firmIds)
    const memberCount = new Map<string, number>()
    ;(members ?? []).forEach((m) => {
      memberCount.set(m.firm_id, (memberCount.get(m.firm_id) ?? 0) + 1)
    })

    const { data: activities } = await admin.from('profiles')
      .select('firm_id, last_active_at')
      .in('firm_id', firmIds)
      .order('last_active_at', { ascending: false })
    const lastActive = new Map<string, string | null>()
    ;(activities ?? []).forEach((a) => {
      if (!lastActive.has(a.firm_id)) {
        lastActive.set(a.firm_id, a.last_active_at)
      }
    })

    const result = (firms ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      currency: f.currency,
      source: f.source,
      status: f.status,
      billing_status: f.billing_status,
      trial_ends_at: f.trial_ends_at,
      paid_at: f.paid_at,
      created_at: f.created_at,
      members: memberCount.get(f.id) ?? 0,
      last_active_at: lastActive.get(f.id) ?? null,
    }))
    return json(200, { firms: result })
  }

  // create_firm
  if (action === 'create_firm') {
    const err = validateCreateFirm(body)
    if (err) return json(400, { error: err })

    const owner_email = String(body.owner_email).trim().toLowerCase()
    const { data: settings } = await admin.from('platform_settings').select('trial_days').single()
    const trial_days = settings?.trial_days ?? 14

    const { data: firm, error: firmError } = await admin.from('firms')
      .insert({
        name: String(body.name).trim(),
        currency: String(body.currency),
        source: 'admin',
        status: 'active',
        billing_status: body.start === 'complimentary' ? 'complimentary' : 'trial',
        trial_ends_at: body.start === 'trial' ? new Date(Date.now() + trial_days * 24 * 60 * 60 * 1000).toISOString() : null,
      })
      .select('id')
      .single()
    if (firmError || !firm) {
      console.error('create_firm insert error:', firmError)
      return json(500, { error: 'Something went wrong.' })
    }

    const { data: user, error: userError } = await admin.auth.admin.inviteUserByEmail(owner_email, {
      redirectTo: `${appUrl}/app/?flow=set-password`,
      data: { name: String(body.owner_name).trim() },
    })
    if (userError || !user.user) {
      console.error('create_firm invite error:', userError)
      return json(502, { error: 'The invitation email could not be sent. Try again.' })
    }

    const { data: profile, error: profileError } = await admin.from('profiles')
      .insert({
        user_id: user.user.id,
        firm_id: firm.id,
        name: String(body.owner_name).trim(),
        email: owner_email,
        role: 'owner',
        status: 'invited',
      })
      .select('id')
      .single()
    if (profileError) {
      await admin.auth.admin.deleteUser(user.user.id)
      console.error('create_firm profile error:', profileError)
      return json(500, { error: 'Something went wrong.' })
    }

    const { error: bankError } = await admin.from('bank_accounts')
      .insert({ firm_id: firm.id, name: 'Client account', is_default: true })
    if (bankError) {
      await admin.from('profiles').delete().eq('user_id', user.user.id)
      await admin.auth.admin.deleteUser(user.user.id)
      await admin.from('firms').delete().eq('id', firm.id)
      console.error('create_firm bank error:', bankError)
      return json(500, { error: 'Something went wrong.' })
    }

    await admin.from('change_log').insert({
      firm_id: firm.id,
      table_name: 'firms',
      row_id: firm.id,
      action: 'insert',
      after: {
        name: String(body.name).trim(),
        currency: String(body.currency),
        source: 'admin',
        status: 'active',
        billing_status: body.start === 'complimentary' ? 'complimentary' : 'trial',
      },
      actor: callerRow?.id,
    })

    return json(201, { firmId: firm.id })
  }

  // set_status
  if (action === 'set_status') {
    const firmId = body.firmId
    const status = body.status
    if (!isValidUuid(firmId) || !['active', 'suspended'].includes(String(status))) {
      return json(400, { error: 'Invalid request.' })
    }

    const { data: firm, error: fetchError } = await admin.from('firms')
      .select('status')
      .eq('id', firmId)
      .single()
    if (fetchError || !firm) return json(404, { error: 'Firm not found.' })

    const { error: updateError } = await admin.from('firms')
      .update({ status })
      .eq('id', firmId)
    if (updateError) {
      console.error('set_status error:', updateError)
      return json(500, { error: 'Something went wrong.' })
    }

    await admin.from('change_log').insert({
      firm_id: firmId,
      table_name: 'firms',
      row_id: firmId,
      action: 'update',
      before: { status: firm.status },
      after: { status },
      actor: callerRow?.id,
    })

    return json(200, {})
  }

  // extend_trial
  if (action === 'extend_trial') {
    const firmId = body.firmId
    const days = body.days
    if (!isValidUuid(firmId) || ![7, 14].includes(Number(days))) {
      return json(400, { error: 'Invalid request.' })
    }

    const { data: firm, error: fetchError } = await admin.from('firms')
      .select('trial_ends_at, billing_status')
      .eq('id', firmId)
      .single()
    if (fetchError || !firm) return json(404, { error: 'Firm not found.' })

    const newEnd = extendTrialEnd(firm.trial_ends_at, new Date(), days as 7 | 14)
    const { error: updateError } = await admin.from('firms')
      .update({ trial_ends_at: newEnd, billing_status: 'trial' })
      .eq('id', firmId)
    if (updateError) {
      console.error('extend_trial error:', updateError)
      return json(500, { error: 'Something went wrong.' })
    }

    await admin.from('change_log').insert({
      firm_id: firmId,
      table_name: 'firms',
      row_id: firmId,
      action: 'billing',
      before: { trial_ends_at: firm.trial_ends_at, billing_status: firm.billing_status },
      after: { trial_ends_at: newEnd, billing_status: 'trial' },
      actor: callerRow?.id,
    })

    return json(200, { trial_ends_at: newEnd })
  }

  // set_billing
  if (action === 'set_billing') {
    const firmId = body.firmId
    const billing_status = body.billing_status
    if (!isValidUuid(firmId) || !['complimentary', 'trial'].includes(String(billing_status))) {
      return json(400, { error: 'Invalid request.' })
    }

    const { data: firm, error: fetchError } = await admin.from('firms')
      .select('billing_status, trial_ends_at')
      .eq('id', firmId)
      .single()
    if (fetchError || !firm) return json(404, { error: 'Firm not found.' })

    const updateData: Record<string, unknown> = { billing_status }
    if (billing_status === 'trial' && !firm.trial_ends_at) {
      const { data: settings } = await admin.from('platform_settings').select('trial_days').single()
      const trial_days = settings?.trial_days ?? 14
      updateData.trial_ends_at = new Date(Date.now() + trial_days * 24 * 60 * 60 * 1000).toISOString()
    }

    const { error: updateError } = await admin.from('firms')
      .update(updateData)
      .eq('id', firmId)
    if (updateError) {
      console.error('set_billing error:', updateError)
      return json(500, { error: 'Something went wrong.' })
    }

    await admin.from('change_log').insert({
      firm_id: firmId,
      table_name: 'firms',
      row_id: firmId,
      action: 'billing',
      before: { billing_status: firm.billing_status },
      after: { billing_status, ...updateData },
      actor: callerRow?.id,
    })

    return json(200, {})
  }

  // get_settings / set_settings
  if (action === 'get_settings') {
    const { data: settings } = await admin.from('platform_settings').select('firm_cap, trial_days').single()
    if (!settings) return json(500, { error: 'Something went wrong.' })
    const { data: selfServe } = await admin.from('firms')
      .select('id', { count: 'exact' })
      .eq('source', 'self_serve')
    return json(200, {
      firm_cap: settings.firm_cap,
      trial_days: settings.trial_days,
      self_serve_firms: selfServe?.length ?? 0,
    })
  }

  if (action === 'set_settings') {
    const err = validateSettings(body)
    if (err) return json(400, { error: err })

    const updateData: Record<string, unknown> = {}
    if (body.firm_cap !== undefined) updateData.firm_cap = body.firm_cap
    if (body.trial_days !== undefined) updateData.trial_days = body.trial_days

    const { error: updateError } = await admin.from('platform_settings')
      .update(updateData)
      .eq('id', true)
    if (updateError) {
      console.error('set_settings error:', updateError)
      return json(500, { error: 'Something went wrong.' })
    }

    const { data: settings } = await admin.from('platform_settings').select('firm_cap, trial_days').single()
    if (!settings) return json(500, { error: 'Something went wrong.' })
    const { data: selfServe } = await admin.from('firms')
      .select('id', { count: 'exact' })
      .eq('source', 'self_serve')
    return json(200, {
      firm_cap: settings.firm_cap,
      trial_days: settings.trial_days,
      self_serve_firms: selfServe?.length ?? 0,
    })
  }

  // list_waitlist
  if (action === 'list_waitlist') {
    const { data: waitlist, error } = await admin.from('waitlist')
      .select('email, firm_name, created_at')
      .order('created_at', { ascending: true })
    if (error) {
      console.error('list_waitlist error:', error)
      return json(500, { error: 'Something went wrong.' })
    }
    return json(200, { waitlist })
  }

  // support
  if (action === 'support') {
    const firmId = body.firmId
    const view = body.view
    const from = body.from ? new Date(String(body.from)).toISOString().split('T')[0] : null
    const to = body.to ? new Date(String(body.to)).toISOString().split('T')[0] : null

    if (!isValidUuid(firmId) || !['clients', 'balances', 'ledger'].includes(String(view))) {
      return json(400, { error: 'Invalid request.' })
    }

    // Verify the firm exists
    const { data: firm } = await admin.from('firms').select('id').eq('id', firmId).single()
    if (!firm) return json(404, { error: 'Firm not found.' })

    if (view === 'clients') {
      const { data: clients, error } = await admin.from('clients')
        .select('id, name, contact, email, phone, status')
        .eq('firm_id', firmId)
        .eq('status', 'active')
        .order('name')
      if (error) {
        console.error('support/clients error:', error)
        return json(500, { error: 'Something went wrong.' })
      }
      await admin.from('change_log').insert({
        firm_id: firmId,
        action: 'support_access',
        after: { view: 'clients', from, to },
        actor: callerRow?.id,
      })
      return json(200, { clients })
    }

    if (view === 'balances') {
      const balanceFrom = from ?? '2000-01-01'
      const balanceTo = to ?? new Date().toISOString().split('T')[0]
      const { data: balances, error } = await admin.rpc('support_client_balances', {
        p_firm: firmId,
        p_from: balanceFrom,
        p_to: balanceTo,
      })
      if (error) {
        console.error('support/balances error:', error)
        return json(500, { error: 'Something went wrong.' })
      }
      await admin.from('change_log').insert({
        firm_id: firmId,
        action: 'support_access',
        after: { view: 'balances', from, to },
        actor: callerRow?.id,
      })
      return json(200, { balances })
    }

    if (view === 'ledger') {
      const ledgerFrom = from ?? '2000-01-01'
      const ledgerTo = to ?? new Date().toISOString().split('T')[0]
      const { data: ledger, error } = await admin.from('transactions')
        .select('id, client_id, bank_account_id, kind, amount_minor, date, description, created_at, updated_at')
        .eq('firm_id', firmId)
        .gte('date', ledgerFrom)
        .lte('date', ledgerTo)
        .order('date')
        .order('created_at')
      if (error) {
        console.error('support/ledger error:', error)
        return json(500, { error: 'Something went wrong.' })
      }
      await admin.from('change_log').insert({
        firm_id: firmId,
        action: 'support_access',
        after: { view: 'ledger', from, to },
        actor: callerRow?.id,
      })
      return json(200, { ledger })
    }
  }

  return json(400, { error: 'Unknown action.' })
})
