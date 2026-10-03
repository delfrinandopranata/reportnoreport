type PgError = { code?: string; message?: string; name?: string }
const NETWORK = "Couldn't save. Check your connection and try again."
const NETWORK_NAMES = ['FunctionsFetchError', 'AuthRetryableFetchError']

/** Turns Supabase/Postgres/network failures into a sentence a person can act on. */
export function toUserMessage(error: unknown, ctx: { writeBlockReason?: string | null } = {}): string {
  if (error instanceof TypeError) return NETWORK
  if (typeof error !== 'object' || error === null) return 'Something went wrong. Try again.'
  const { code, message, name } = error as PgError
  if ((name && NETWORK_NAMES.includes(name)) || message?.includes('Failed to fetch')) return NETWORK
  if (code === 'PGRST301') return 'Your session has expired. Sign in again.'
  if (code === '23514') {
    return message?.includes('amount_minor')
      ? 'That amount is too large or not allowed. Amounts must be greater than 0 and at most 100,000,000,000.00.'
      : "One of the values isn't allowed. Check the form and try again."
  }
  if (code === 'P0001' && message) {
    if (message.includes('cannot remove sample data with non-sample transactions')) {
      return 'Some of your own transactions are recorded against sample clients. Move or delete those first.'
    }
    return message
  }
  if (code === '42501') {
    return ctx.writeBlockReason ? `Your firm can't make changes right now: ${ctx.writeBlockReason}` : "You don't have permission to do that."
  }
  if (code === '23505') return 'That already exists.'
  if (code === 'PGRST116') return 'That record no longer exists.'
  return 'Something went wrong. Try again.'
}

/** True when the server refused a write because of the firm's state or the person's role, so cached session context may be stale. */
export const isWriteBlock = (error: unknown): boolean => {
  const { code, message } = (typeof error === 'object' && error !== null ? error : {}) as PgError
  return code === '42501' || (code === 'P0001' && !!message?.includes("can't make changes"))
}
