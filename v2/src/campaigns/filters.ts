import type { RecipientFilter } from './api'

export type Op = readonly ['eq' | 'is' | 'notnull', string, string | null]

/** One definition of "not opened": the follow-up audience (send-campaigns pgStore.parentRecipients) selects the same rows, complained included. */
export const NOT_OPENED: readonly Op[] = [['eq', 'status', 'sent'], ['is', 'opened_at', null], ['is', 'bounced_at', null], ['is', 'complained_at', null]]

export const recipientOps = (f: RecipientFilter): readonly Op[] =>
  f === 'not_opened' ? NOT_OPENED : f === 'bounced' ? [['notnull', 'bounced_at', null]] : f === 'failed' ? [['eq', 'status', 'failed']] : []

type Q<T> = { eq(c: string, v: string): T; is(c: string, v: null): T; not(c: string, op: 'is', v: null): T }
export function applyOps<T extends Q<T>>(q: T, ops: readonly Op[]): T {
  return ops.reduce((acc, [op, col, v]) => (op === 'eq' ? acc.eq(col, v as string) : op === 'is' ? acc.is(col, null) : acc.not(col, 'is', null)), q)
}
