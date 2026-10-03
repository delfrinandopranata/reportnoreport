export type Kind = 'in' | 'out'

export type Client = {
  id: string
  name: string
  contact: string
  email: string
  createdAt: string
}

/** Amounts are integer cents — never floats — so totals never drift. */
export type Txn = {
  id: string
  clientId: string
  kind: Kind
  amount: number
  date: string
  note: string
}

export type Totals = { in: number; out: number; net: number; count: number }

const CURRENCY = 'SGD'
const money = new Intl.NumberFormat('en-SG', { style: 'currency', currency: CURRENCY })
const compact = new Intl.NumberFormat('en-SG', {
  style: 'currency',
  currency: CURRENCY,
  notation: 'compact',
  maximumFractionDigits: 1,
})

export const formatMoney = (cents: number) => money.format(cents / 100)
export const formatCompact = (cents: number) => compact.format(cents / 100)

/** Local YYYY-MM-DD. */
export const today = () => new Date().toLocaleDateString('en-CA')

/** "1,234.5" → 123450. Returns null for anything that isn't a positive amount with ≤2 decimals. */
export function parseCents(input: string): number | null {
  const clean = input.replace(/[,\s]/g, '')
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(clean)
  if (!match) return null
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return cents > 0 ? cents : null
}

export function totals(txns: Txn[]): Totals {
  let inSum = 0
  let outSum = 0
  for (const t of txns) {
    if (t.kind === 'in') inSum += t.amount
    else outSum += t.amount
  }
  return { in: inSum, out: outSum, net: inSum - outSum, count: txns.length }
}

export function totalsByClient(txns: Txn[]): Map<string, Totals> {
  const groups = new Map<string, Txn[]>()
  for (const t of txns) groups.set(t.clientId, [...(groups.get(t.clientId) ?? []), t])
  return new Map([...groups].map(([id, list]) => [id, totals(list)]))
}

export type MonthFlow = { key: string; label: string; in: number; out: number }

export function monthlyFlow(txns: Txn[], months: number, asOf: string): MonthFlow[] {
  const [y, m] = asOf.split('-').map(Number)
  const buckets = Array.from({ length: months }, (_, i) => {
    const d = new Date(y, m - 1 - (months - 1 - i), 1)
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleString('en-SG', { month: 'short' }),
      in: 0,
      out: 0,
    }
  })
  const index = new Map(buckets.map((b, i) => [b.key, i]))
  for (const t of txns) {
    const i = index.get(t.date.slice(0, 7))
    if (i !== undefined) buckets[i][t.kind] += t.amount
  }
  return buckets
}

export const byDateDesc = (a: Txn, b: Txn) => b.date.localeCompare(a.date)
