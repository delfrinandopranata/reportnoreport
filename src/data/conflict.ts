// Kept free of React/Supabase imports so node:test can load it.
export class ConflictError extends Error {
  constructor(by: string, at: string) {
    super(conflictMessage(by, at))
  }
}

export function conflictMessage(by: string, at: string, timeZone?: string): string {
  const time = new Date(at).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone }).replace(/\s?(AM|PM)$/i, (m) => ` ${m.trim().toLowerCase()}`)
  return `This client was changed by ${by} at ${time}. Reload to see their changes.`
}

/** Why an optimistic-concurrency UPDATE touched no rows: deleted, edited by someone else, or filtered out by RLS. */
export function classifyEmptyUpdate(current: { updated_at: string } | null, loadedUpdatedAt: string): 'gone' | 'conflict' | 'blocked' {
  if (!current) return 'gone'
  return current.updated_at === loadedUpdatedAt ? 'blocked' : 'conflict'
}
