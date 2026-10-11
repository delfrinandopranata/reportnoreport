/** A filter on a messages column; the follow-up SQL (send-campaigns) and the recipient list (frontend) both build from it. */
export type Op = readonly ['eq' | 'is' | 'notnull', string, string | null]

/**
 * The one definition of "not opened": sent, never opened, and neither bounced nor complained (a complaint opts the address
 * out, so a follow-up would never reach it). The "Not opened" list, the follow-up audience and `campaign_stats.not_opened`
 * select the same rows.
 */
export const NOT_OPENED: readonly Op[] = [['eq', 'status', 'sent'], ['is', 'opened_at', null], ['is', 'bounced_at', null], ['is', 'complained_at', null]]

type Tracked = { status: string; opened_at: unknown; bounced_at: unknown; complained_at: unknown }
export const isNotOpened = (m: Tracked): boolean => NOT_OPENED.every(([op, col, v]) => (op === 'eq' ? (m as Record<string, unknown>)[col] === v : (m as Record<string, unknown>)[col] == null))

/** How many people "Send follow-up to not opened" would reach; the button shows only above zero. */
export const followUpCount = (s: { notOpened: number }): number => s.notOpened
