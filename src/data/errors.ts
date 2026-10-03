type PgError = { code?: string; message?: string }

/** Turns Supabase/Postgres/network failures into a sentence a person can act on. */
export function toUserMessage(error: unknown, ctx: { writeBlockReason?: string | null } = {}): string {
  if (error instanceof TypeError) return "Couldn't save. Check your connection and try again."
  if (typeof error !== 'object' || error === null) return 'Something went wrong. Try again.'
  const { code, message } = error as PgError
  if (code === 'P0001' && message) return message
  if (code === '42501' || code === 'PGRST301') {
    return ctx.writeBlockReason ? `Your firm can't make changes right now: ${ctx.writeBlockReason}` : "You don't have permission to do that."
  }
  if (code === '23505') return 'That already exists.'
  if (code === 'PGRST116') return 'That record no longer exists.'
  return 'Something went wrong. Try again.'
}
