import { whenText } from '../ui/dates.ts'
import type { Cell, RunResult } from './logic.ts'

const NUM = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 10 })
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const count = (n: number, one: string, many: string) => `${NUM.format(n)} ${n === 1 ? one : many}`

/** en-GB grouping, up to 10 decimals, a true minus (design README); the CSV keeps the ASCII hyphen. */
export const numText = (n: number) => NUM.format(n).replace(/^-/, '−')

export function totalsText(r: RunResult): string {
  if (r.kind === 'rows') return count(r.total, 'record', 'records')
  return `${count(r.total, 'group', 'groups')} from ${count(r.totalRecords, 'record', 'records')}`
}

/** A data-quality warning, shown on its own line and never folded into the headline. */
export function skippedText(n: number): string {
  if (!n) return ''
  return n === 1 ? '1 value was not a number and was left out.' : `${NUM.format(n)} values were not numbers and were left out.`
}

/** Timestamps in the reader's zone; date-only values from their parts, so no zone moves the day. */
export function cellText(v: Cell): string {
  if (v === null) return ''
  if (typeof v === 'number') return numText(v)
  if (ISO_DAY.test(v)) return new Date(`${v}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return ISO_TIME.test(v) ? whenText(v) : v
}

export const keyText = (k: Cell) => (k === null ? 'No answer' : cellText(k))

export const lastPage = (pageSize: number, total: number) => Math.max(1, Math.ceil(total / pageSize))
export const pageText = (page: number, pageSize: number, total: number) => `Page ${page} of ${lastPage(pageSize, total)}`

/** Empty when nothing is hidden; otherwise the full count, never a silent cut. */
export function shownText(shown: number, total: number, noun: 'record' | 'group'): string {
  if (shown >= total) return ''
  return noun === 'group' ? `Showing the first ${NUM.format(shown)} of ${NUM.format(total)} groups` : `Showing ${NUM.format(shown)} of ${NUM.format(total)} records`
}
