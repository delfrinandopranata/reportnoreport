export const FALLBACK = 'Something went wrong. Try again, and contact support if it keeps happening.'

type Err = { message?: string; code?: string } | null | undefined

const SENTENCES: [RegExp, string][] = [
  [/at least one Owner/, 'An organisation needs at least one Owner. Make someone else an Owner first.'],
  [/cannot grant permissions you do not hold|cannot assign a role with permissions/, 'You cannot give a permission you do not hold. Untick it and save again.'],
  [/Only an Owner can assign/, 'Only an Owner can assign the Owner role.'],
  [/Owner role cannot be (changed|deleted)/, 'The Owner role cannot be changed or deleted.'],
  [/Not allowed|permission to invite/, 'You do not have permission to do that.'],
  [/Invalid login credentials/, 'That email or password is incorrect. Check them and try again.'],
  [/already registered/i, 'That email already has an account. Sign in instead.'],
]

/** Maps known server messages to user-facing sentences; never shows raw codes. */
export function friendlyError(err: Err, context?: { duplicate?: string; inUse?: string }): string {
  if (!err) return FALLBACK
  if (err.code === '23505' && context?.duplicate) return context.duplicate
  if (err.code === '23503' && context?.inUse) return context.inUse
  return SENTENCES.find(([re]) => re.test(err.message ?? ''))?.[1] ?? FALLBACK
}
