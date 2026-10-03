export type ProfileRow = { id: string; firm_id: string | null; is_super_admin: boolean }

/** Returns true if the profile is a super-admin. */
export function isSuperAdmin(profile: ProfileRow | null): boolean {
  return profile?.is_super_admin ?? false
}

/** Validates create_firm body. Returns error message, or null when allowed. */
export function validateCreateFirm(body: unknown): string | null {
  if (!body || typeof body !== 'object') return 'Invalid request.'
  const b = body as Record<string, unknown>
  const name = b.name
  const owner_name = b.owner_name
  const email = b.owner_email
  const currency = b.currency
  const start = b.start

  if (!name || typeof name !== 'string' || !name.trim()) return 'Enter the firm name.'
  if (!owner_name || typeof owner_name !== 'string' || !owner_name.trim()) return 'Enter the owner name.'
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.'
  if (!currency || !['MYR', 'SGD', 'USD'].includes(String(currency))) return 'Choose MYR, SGD or USD.'
  if (!start || !['complimentary', 'trial'].includes(String(start))) return 'Choose complimentary or trial.'
  return null
}

/** Validates UUID format. */
export function isValidUuid(value: unknown): boolean {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

/** Extends the trial end date. From a past or null end uses now; from a future end adds days. */
export function extendTrialEnd(currentEnd: string | null, now: Date, days: 7 | 14): string {
  const daysMs = days * 24 * 60 * 60 * 1000
  const current = currentEnd ? new Date(currentEnd) : null
  const base = !current || current <= now ? now : current
  return new Date(base.getTime() + daysMs).toISOString()
}

/** Validates platform settings. Returns error message, or null when allowed. */
export function validateSettings(body: unknown): string | null {
  if (!body || typeof body !== 'object') return 'Invalid request.'
  const b = body as Record<string, unknown>
  const cap = b.firm_cap
  const trial = b.trial_days

  if (cap !== undefined) {
    if (!Number.isInteger(cap) || (cap as number) < 0 || (cap as number) > 1000) return 'Firm cap must be 0–1000.'
  }
  if (trial !== undefined) {
    if (!Number.isInteger(trial) || (trial as number) < 1 || (trial as number) > 365) return 'Trial days must be 1–365.'
  }
  return null
}
