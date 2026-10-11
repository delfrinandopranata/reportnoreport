import type { Op } from '../campaigns/filters'

export type MessageFilter = 'all' | 'failed' | 'queued' | 'sent'
export type MessageSource = 'system' | 'campaign' | 'all'
export const MESSAGE_PAGE = 50

/** Source and status combine; both are applied in the query so paging runs over exactly what the filters show. */
export function messageOps(source: MessageSource, status: MessageFilter): Op[] {
  return [
    ...(source === 'system' ? [['is', 'campaign_id', null] as Op] : source === 'campaign' ? [['notnull', 'campaign_id', null] as Op] : []),
    ...(status === 'all' ? [] : [['eq', 'status', status] as Op]),
  ]
}

export const pageRange = (page: number) => [(page - 1) * MESSAGE_PAGE, page * MESSAGE_PAGE - 1] as const
export const lastPage = (total: number) => Math.max(1, Math.ceil(total / MESSAGE_PAGE))
export const pageText = (page: number, total: number) =>
  total === 0 ? 'No messages' : `Showing ${((page - 1) * MESSAGE_PAGE + 1).toLocaleString('en-GB')}–${Math.min(page * MESSAGE_PAGE, total).toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')}`
