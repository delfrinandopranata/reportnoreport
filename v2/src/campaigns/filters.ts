import type { RecipientFilter } from './api'
import { NOT_OPENED, type Op } from '../../supabase/functions/_shared/comms/followup.ts'

export type { Op }

export const recipientOps = (f: RecipientFilter): readonly Op[] =>
  f === 'not_opened' ? NOT_OPENED : f === 'bounced' ? [['notnull', 'bounced_at', null]] : f === 'failed' ? [['eq', 'status', 'failed']] : []

type Q<T> = { eq(c: string, v: string): T; is(c: string, v: null): T; not(c: string, op: 'is', v: null): T }
export function applyOps<T extends Q<T>>(q: T, ops: readonly Op[]): T {
  return ops.reduce((acc, [op, col, v]) => (op === 'eq' ? acc.eq(col, v as string) : op === 'is' ? acc.is(col, null) : acc.not(col, 'is', null)), q)
}
