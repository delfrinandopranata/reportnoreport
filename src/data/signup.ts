/** Extract pending firm creation data from user metadata. Returns null if no metadata present or values are empty. */
export function pendingFirmFromMetadata(meta: unknown): {
  firmName: string
  currency: 'MYR' | 'SGD' | 'USD'
  personName: string
} | null {
  if (!meta || typeof meta !== 'object') return null
  const { firm_name, currency, name } = meta as Record<string, unknown>
  if (typeof firm_name === 'string' && firm_name.trim() && typeof currency === 'string' && typeof name === 'string' && name.trim()) {
    if (['MYR', 'SGD', 'USD'].includes(currency)) {
      return { firmName: firm_name, currency: currency as 'MYR' | 'SGD' | 'USD', personName: name }
    }
  }
  return null
}

/** True when the error is the EARLY_ACCESS_FULL token from create_firm_for_current_user. */
export function isEarlyAccessFull(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { message } = error as { message?: unknown }
  return typeof message === 'string' && message.includes('EARLY_ACCESS_FULL')
}

/** Decide whether to create a firm for a user. Returns true if profile is null or has no firm_id and metadata has pending firm data. */
export function shouldCreateFirm(profile: unknown, metadata: unknown): boolean {
  if (!profile) return !!pendingFirmFromMetadata(metadata)
  const prof = profile as { firm_id?: unknown }
  return !prof.firm_id && !!pendingFirmFromMetadata(metadata)
}

/** Return user-facing message when early access is full. */
export function earlyAccessMessage(joined: boolean): string {
  if (joined) {
    return "Early access is full right now. We've added you to the waitlist and will email you when a place opens."
  }
  return 'Early access is full right now. Join the waitlist from our homepage and we\'ll email you when a place opens.'
}
