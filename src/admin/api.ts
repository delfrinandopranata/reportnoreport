import { supabase } from '../data/supabase'

export type AdminListFirmsResponse = {
  firms: Array<{
    id: string
    name: string
    currency: string
    source: string
    status: 'active' | 'suspended'
    billing_status: 'trial' | 'paid' | 'complimentary' | 'read_only'
    trial_ends_at: string | null
    paid_at: string | null
    created_at: string
    members: number
    last_active_at: string | null
  }>
}

export type AdminCreateFirmRequest = {
  action: 'create_firm'
  name: string
  currency: string
  owner_name: string
  owner_email: string
  start: 'complimentary' | 'trial'
}

export type AdminCreateFirmResponse = { firmId: string }

export type AdminSetStatusRequest = {
  action: 'set_status'
  firmId: string
  status: 'active' | 'suspended'
}

export type AdminExtendTrialRequest = {
  action: 'extend_trial'
  firmId: string
  days: 7 | 14
}

export type AdminExtendTrialResponse = { trial_ends_at: string }

export type AdminSetBillingRequest = {
  action: 'set_billing'
  firmId: string
  billing_status: 'complimentary' | 'trial'
}

export type AdminGetSettingsResponse = {
  firm_cap: number
  trial_days: number
  self_serve_firms: number
}

export type AdminSetSettingsRequest = {
  action: 'set_settings'
  firm_cap?: number
  trial_days?: number
}

export type AdminListWaitlistResponse = {
  waitlist: Array<{
    email: string
    firm_name: string
    created_at: string
  }>
}

export type AdminSupportRequest = {
  action: 'support'
  firmId: string
  view: 'clients' | 'balances' | 'ledger'
  from?: string
  to?: string
}

/**
 * Call the admin Edge Function with typed request/response.
 * Extracts error message from response context on failure.
 * Throws Error with user-readable message on any error.
 */
export async function callAdmin(
  action: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('admin', { body: { action, ...body } })
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(detail?.error ?? "Couldn't reach the server. Try again.")
  }
  return data
}
