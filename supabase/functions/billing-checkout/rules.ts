export type ProfileRow = {
  role: string
  is_super_admin: boolean
  status: string
  firm_id: string
}

export type FirmRow = {
  id: string
  billing_status: string
  stripe_customer_id: string | null
  status: string
}

/** Returns true if the profile is a firm owner (not super-admin, active). */
export function isOwner(profile: ProfileRow | null): boolean {
  return profile?.role === 'owner' && !profile.is_super_admin && profile.status === 'active'
}

/** Validates that the firm can make payments. Returns error message, or null when allowed. */
export function validateNotAlreadyPaid(firm: FirmRow | null): string | null {
  if (!firm) return 'Firm not found.'
  if (firm.status === 'suspended') return 'This firm cannot make payments right now.'
  if (firm.billing_status === 'paid' || firm.billing_status === 'complimentary') {
    return 'This firm is already paid.'
  }
  return null
}

/** Builds form-encoded body for Stripe checkout.sessions.create. */
export function buildCheckoutBody(firmId: string, customerId: string, successUrl?: string, cancelUrl?: string): string {
  const p = (k: string, v: string) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
  const parts = [
    p('customer', customerId),
    p('mode', 'payment'),
    p('client_reference_id', firmId),
    p('metadata[firm_id]', firmId),
    p('line_items[0][price_data][currency]', 'myr'),
    p('line_items[0][price_data][unit_amount]', '1000'),
    p('line_items[0][price_data][product_data][name]', 'ReportNoReport — one-time licence'),
    p('line_items[0][quantity]', '1'),
  ]
  if (successUrl) parts.push(p('success_url', successUrl))
  if (cancelUrl) parts.push(p('cancel_url', cancelUrl))
  return parts.join('&')
}
