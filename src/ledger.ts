export type Kind = 'in' | 'out'

export type ClientType = 'company' | 'individual'
export type ClientStatus = 'active' | 'inactive' | 'archived'

export type Client = {
  id: string
  name: string
  contact: string
  email: string
  createdAt: string
  type: ClientType
  /** SSM no. for companies, NRIC or passport no. for individuals. */
  registrationNo: string
  industry: string
  /** E.164-style, e.g. +60123456789. */
  phone: string
  website: string
  address1: string
  address2: string
  city: string
  state: string
  postcode: string
  country: string
  status: ClientStatus
  tags: string[]
  assignedUserId?: string
  notes: string
  /** ISO datetime of the last edit. */
  updatedAt: string
}

/** What a caller must supply to create a client; everything else is defaulted. */
export type ClientInput = Partial<Omit<Client, 'id' | 'createdAt' | 'updatedAt'>> & { name: string }

export const CLIENT_STATUSES: ClientStatus[] = ['active', 'inactive', 'archived']
export const STATUS_LABEL: Record<ClientStatus, string> = { active: 'Active', inactive: 'Inactive', archived: 'Archived' }

/** Fills every field an older or partial record is missing. */
export function fillClient(c: ClientInput & { id: string; createdAt?: string; updatedAt?: string }, now = new Date().toISOString()): Client {
  const createdAt = c.createdAt ?? today()
  return {
    contact: '',
    email: '',
    type: 'company',
    registrationNo: '',
    industry: '',
    phone: '',
    website: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    postcode: '',
    country: 'Malaysia',
    status: 'active',
    tags: [],
    notes: '',
    ...c,
    createdAt,
    updatedAt: c.updatedAt ?? now,
  }
}

export const MY_STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
  'Kuala Lumpur', 'Labuan', 'Putrajaya',
]

export const DIAL_CODES: [code: string, country: string][] = [
  ['+60', 'Malaysia'], ['+65', 'Singapore'], ['+62', 'Indonesia'], ['+66', 'Thailand'], ['+63', 'Philippines'], ['+84', 'Vietnam'],
  ['+673', 'Brunei'], ['+91', 'India'], ['+86', 'China'], ['+852', 'Hong Kong'], ['+44', 'United Kingdom'], ['+1', 'United States'], ['+61', 'Australia'],
]
export const COUNTRIES = DIAL_CODES.map(([, country]) => country)

/** "+60123456789" → ["+60", "123456789"]. Longest dial code wins; unknown prefixes fall back to +60. */
export function splitPhone(phone: string): [code: string, national: string] {
  const match = [...DIAL_CODES].sort((a, b) => b[0].length - a[0].length).find(([code]) => phone.startsWith(code))
  return match ? [match[0], phone.slice(match[0].length)] : ['+60', phone.replace(/\D/g, '')]
}

/** Digits only, trunk zero dropped; empty stays empty so "no phone" is storable. */
export function joinPhone(code: string, national: string): string {
  const digits = national.replace(/\D/g, '').replace(/^0+/, '')
  return digits ? `${code}${digits}` : ''
}

/** "+60123456789" → "+60 12-345 6789"; anything that doesn't fit the mobile shape is shown as stored. */
export function formatPhone(phone: string): string {
  if (!phone) return ''
  const [code, national] = splitPhone(phone)
  return `${code} ${national.replace(/^(\d{2})(\d{3,4})(\d{4})$/, '$1-$2 $3')}`
}

export type ClientErrors = Partial<Record<'name' | 'email' | 'phone' | 'postcode', string>>

export function validateClient(c: Pick<Client, 'name' | 'email' | 'phone' | 'postcode' | 'country'>): ClientErrors {
  const errors: ClientErrors = {}
  if (!c.name.trim()) errors.name = 'Enter the client name.'
  if (c.email.trim() && !/^\S+@\S+\.\S+$/.test(c.email.trim())) errors.email = 'Enter a valid email address.'
  if (c.phone && !/^\+\d{8,15}$/.test(c.phone)) errors.phone = 'Enter 6 to 12 digits for the phone number.'
  if (c.country === 'Malaysia' && c.postcode.trim() && !/^\d{5}$/.test(c.postcode.trim())) errors.postcode = 'Malaysian postcodes are 5 digits.'
  return errors
}

/** Adds a tag unless it is blank or already present (case-insensitive). */
export function addTag(tags: string[], raw: string): string[] {
  const tag = raw.trim().slice(0, 24)
  return !tag || tags.some((t) => t.toLowerCase() === tag.toLowerCase()) ? tags : [...tags, tag]
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

export const CURRENCY = 'MYR'
const money = new Intl.NumberFormat('en-MY', { style: 'currency', currency: CURRENCY })
const compact = new Intl.NumberFormat('en-MY', {
  style: 'currency',
  currency: CURRENCY,
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** Short, stable account reference shown on statements. */
export const accountNo = (clientId: string) => clientId.slice(0, 8).toUpperCase()

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

/** Groups in first-seen order. */
export function groupBy<T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const list = groups.get(key)
    if (list) list.push(item)
    else groups.set(key, [item])
  }
  return groups
}

export function totalsByClient(txns: Txn[]): Map<string, Totals> {
  return new Map([...groupBy(txns, (t) => t.clientId)].map(([id, list]) => [id, totals(list)]))
}

export type MonthFlow = { key: string; label: string; in: number; out: number }

export function monthlyFlow(txns: Txn[], months: number, asOf: string): MonthFlow[] {
  const [y, m] = asOf.split('-').map(Number)
  const buckets = Array.from({ length: months }, (_, i) => {
    const d = new Date(y, m - 1 - (months - 1 - i), 1)
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleString('en-MY', { month: 'short' }),
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

export type StatementLine = Txn & { balance: number }

export type Statement = {
  opening: number
  receipts: number
  payments: number
  closing: number
  lines: StatementLine[]
}

/** Oldest first; same-day entries keep the order they were posted in. */
export const chronological = (txns: Txn[]) => [...txns].sort((a, b) => a.date.localeCompare(b.date))

/** Statement for [from, to] inclusive (YYYY-MM-DD). Everything before `from` rolls into the opening balance. */
export function statement(txns: Txn[], from: string, to: string): Statement {
  const signed = (t: Txn) => (t.kind === 'in' ? t.amount : -t.amount)
  const opening = txns.filter((t) => t.date < from).reduce((sum, t) => sum + signed(t), 0)
  const inPeriod = chronological(txns.filter((t) => t.date >= from && t.date <= to))
  let balance = opening
  const lines = inPeriod.map((t) => ({ ...t, balance: (balance += signed(t)) }))
  const { in: receipts, out: payments } = totals(inPeriod)
  return { opening, receipts, payments, closing: opening + receipts - payments, lines }
}

export type Period = { from: string; to: string }

const iso = (d: Date) => d.toLocaleDateString('en-CA')

/** Financial year begins on the 1st of `fyStartMonth` (1 = January); "to date" counts from the latest start. */
export function periodPresets(firstDate: string, fyStartMonth = 1, now = new Date()): { label: string; period: Period }[] {
  const y = now.getFullYear()
  const m = now.getMonth()
  return [
    { label: 'This month', period: { from: iso(new Date(y, m, 1)), to: today() } },
    { label: 'Last month', period: { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) } },
    { label: 'Last 3 months', period: { from: iso(new Date(y, m - 2, 1)), to: today() } },
    {
      label: fyStartMonth === 1 ? 'Year to date' : 'Financial year to date',
      period: { from: iso(new Date(m + 1 >= fyStartMonth ? y : y - 1, fyStartMonth - 1, 1)), to: today() },
    },
    { label: 'All time', period: { from: firstDate, to: today() } },
  ]
}

export const earliestDate = (txns: Txn[], fallback: string) => txns.reduce((min, t) => (t.date < min ? t.date : min), fallback)

/** Cents → "1234.50" for spreadsheets (no currency symbol or grouping). */
export const plainAmount = (cents: number) => (cents / 100).toFixed(2)

/**
 * RFC 4180 CSV. Text that a spreadsheet would run as a formula (=, +, -, @) is prefixed with ' —
 * descriptions are user input. Plain numbers, including negatives, are left as numbers.
 */
export function toCsv(rows: string[][]): string {
  const cell = (value: string) => {
    const safe = /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? `'${value}` : value
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  return rows.map((row) => row.map(cell).join(',')).join('\r\n')
}

/** RFC 4180 parser: quoted fields, escaped quotes, CRLF/LF, optional BOM. Blank lines are dropped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) rows.push([...row, cell])
  return rows.filter((r) => r.some((c) => c.trim()))
}

export type ImportRow = { line: number; clientName: string; kind: Kind; amount: number; date: string; note: string }

/** YYYY-MM-DD or DD/MM/YYYY (Malaysian convention) → YYYY-MM-DD, or null if it isn't a real date. */
function readDate(value: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value)
  const [y, m, d] = iso ? [+iso[1], +iso[2], +iso[3]] : dmy ? [+dmy[3], +dmy[2], +dmy[1]] : [0, 0, 0]
  const date = new Date(y, m - 1, d)
  if (!y || date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Undo the export's formula guard and currency decoration. */
const text = (value = '') => value.trim().replace(/^'(?=[=+\-@])/, '')
const amountOf = (value = '') => parseCents(text(value).replace(/^RM\s*/i, ''))

/**
 * Reads a transactions CSV. Columns are matched by header name (any order, extra columns ignored):
 * Date, Client, Description, and either Receipts / Payments, or Type (Receipt|Payment) + Amount.
 */
export function readImport(csv: string): { rows: ImportRow[]; errors: string[] } {
  const [header = [], ...body] = parseCsv(csv)
  const col = new Map(header.map((h, i) => [h.trim().toLowerCase(), i]))
  const at = (cells: string[], name: string) => (col.has(name) ? cells[col.get(name)!] : undefined)
  const missing = ['date', 'client'].filter((c) => !col.has(c))
  if (!col.has('receipts') && !col.has('payments') && !(col.has('type') && col.has('amount'))) missing.push('receipts/payments (or type + amount)')
  if (missing.length) return { rows: [], errors: [`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`] }

  const rows: ImportRow[] = []
  const errors: string[] = []
  body.forEach((cells, i) => {
    const line = i + 2
    const date = readDate(text(at(cells, 'date')))
    const clientName = text(at(cells, 'client'))
    const receipt = text(at(cells, 'receipts')) ? amountOf(at(cells, 'receipts')) : undefined
    const payment = text(at(cells, 'payments')) ? amountOf(at(cells, 'payments')) : undefined
    const type = text(at(cells, 'type')).toLowerCase()
    const typed = /^(receipt|in)$/.test(type) ? 'in' : /^(payment|out)$/.test(type) ? 'out' : null
    const [kind, amount]: [Kind | null, number | null | undefined] =
      receipt !== undefined && payment !== undefined ? [null, null]
      : receipt !== undefined ? ['in', receipt]
      : payment !== undefined ? ['out', payment]
      : [typed, typed ? amountOf(at(cells, 'amount')) : undefined]

    if (!date) return void errors.push(`Row ${line}: date must be YYYY-MM-DD or DD/MM/YYYY.`)
    if (!clientName) return void errors.push(`Row ${line}: client is empty.`)
    if (receipt !== undefined && payment !== undefined) return void errors.push(`Row ${line}: has both a receipt and a payment — split it into two rows.`)
    if (!kind) return void errors.push(`Row ${line}: needs a receipt or payment amount.`)
    if (!amount) return void errors.push(`Row ${line}: amount must be greater than 0 with up to 2 decimals.`)
    rows.push({ line, clientName, kind, amount, date, note: text(at(cells, 'description')) })
  })
  return { rows, errors }
}

const nameKey = (name: string) => name.trim().toLowerCase()
const txnKey = (clientId: string, t: Pick<Txn, 'date' | 'kind' | 'amount' | 'note'>) => `${clientId}|${t.date}|${t.kind}|${t.amount}|${t.note}`

/** Matches clients by name (case-insensitive) and skips rows identical to a transaction already on the ledger. */
export function planImport(rows: ImportRow[], clients: Client[], txns: Txn[]) {
  const known = new Map(clients.map((c) => [nameKey(c.name), c.id]))
  const existing = new Set(txns.map((t) => txnKey(t.clientId, t)))
  // First spelling seen wins when the same new client appears with different casing.
  const newClients = [...groupBy(rows.filter((r) => !known.has(nameKey(r.clientName))), (r) => nameKey(r.clientName)).values()].map((g) => g[0].clientName.trim())
  const fresh = rows.filter((r) => {
    const id = known.get(nameKey(r.clientName))
    return !id || !existing.has(txnKey(id, r))
  })
  return { newClients, rows: fresh, duplicates: rows.length - fresh.length }
}
