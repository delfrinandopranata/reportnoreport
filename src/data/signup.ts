/** Extract pending firm creation data from user metadata. Returns null if no metadata present. */
export function pendingFirmFromMetadata(meta: unknown): {
  firmName: string
  currency: 'MYR' | 'SGD' | 'USD'
  personName: string
} | null {
  if (!meta || typeof meta !== 'object') return null
  const { firm_name, currency, name } = meta as Record<string, unknown>
  if (typeof firm_name === 'string' && typeof currency === 'string' && typeof name === 'string') {
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
