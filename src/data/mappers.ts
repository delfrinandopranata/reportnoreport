import { parseCents, type Client, type Statement, type StatementLine } from '../ledger.ts'
import type { Role } from '../users/rules'
import type { Database } from './database.types'

type Tables = Database['public']['Tables']
export type ClientRow = Tables['clients']['Row']
export type FirmRow = Tables['firms']['Row']
export type BankRow = Tables['bank_accounts']['Row']
export type ProfileRow = Tables['profiles']['Row']
export type ContractRow = Tables['contracts']['Row']

export const AMOUNT_CAP = 10_000_000_000_000 // matches transactions.amount_minor check

export function rowToClient(r: ClientRow): Client {
  return {
    id: r.id, name: r.name, contact: r.contact, email: r.email, createdAt: new Date(r.created_at).toLocaleDateString('en-CA'), updatedAt: r.updated_at,
    type: r.type, registrationNo: r.registration_no, industry: r.industry, phone: r.phone, website: r.website,
    address1: r.address1, address2: r.address2, city: r.city, state: r.state, postcode: r.postcode, country: r.country,
    status: r.status, tags: r.tags, assignedUserId: r.assigned_to ?? undefined, notes: r.notes,
  }
}

const CLIENT_COLUMNS: [keyof Client, keyof ClientRow][] = [
  ['name', 'name'], ['contact', 'contact'], ['email', 'email'], ['type', 'type'], ['registrationNo', 'registration_no'],
  ['industry', 'industry'], ['phone', 'phone'], ['website', 'website'], ['address1', 'address1'], ['address2', 'address2'],
  ['city', 'city'], ['state', 'state'], ['postcode', 'postcode'], ['country', 'country'], ['status', 'status'], ['tags', 'tags'],
  ['notes', 'notes'],
]

/** Only keys present in `c` are written, so partial patches never blank other fields. */
export function clientToRow(c: Partial<Client>): Partial<ClientRow> {
  const out: Record<string, unknown> = {}
  for (const [from, to] of CLIENT_COLUMNS) if (from in c) out[to] = c[from]
  if ('assignedUserId' in c) out.assigned_to = c.assignedUserId ?? null
  return out as Partial<ClientRow>
}

export type LedgerRow = { id: string; client_id: string; bank_account_id: string; kind: 'receipt' | 'payment'; amount_minor: number; date: string; description: string; created_at: string; updated_at: string; balance: number }

export function rowToLine(r: LedgerRow): StatementLine {
  return {
    id: r.id, clientId: r.client_id, bankAccountId: r.bank_account_id, kind: r.kind === 'receipt' ? 'in' : 'out',
    amount: r.amount_minor, date: r.date, note: r.description, createdAt: r.created_at, updatedAt: r.updated_at, balance: r.balance,
  }
}

export type BalanceRow = { client_id: string; opening: number; receipts: number; payments: number; closing: number; txn_count: number; last_txn_date: string | null }

export function toStatement(b: BalanceRow | undefined, lines: StatementLine[]): Statement {
  return { opening: b?.opening ?? 0, receipts: b?.receipts ?? 0, payments: b?.payments ?? 0, closing: b?.closing ?? 0, lines }
}

export function sumBalances(rows: BalanceRow[]): Statement {
  return rows.reduce<Statement>(
    (s, r) => ({ opening: s.opening + r.opening, receipts: s.receipts + r.receipts, payments: s.payments + r.payments, closing: s.closing + r.closing, lines: [] }),
    { opening: 0, receipts: 0, payments: 0, closing: 0, lines: [] },
  )
}

export type Firm = {
  id: string; name: string; tradingName: string; registrationNo: string; sstNo: string; phone: string; email: string; website: string
  address1: string; address2: string; postcode: string; city: string; state: string; country: string; logoPath: string | null
  currency: string; statementNote: string; discrepancyDays: number; showRegistrationOnStatement: boolean; fyStartMonth: number
  dateFormat: 'text' | 'numeric'; billingStatus: 'trial' | 'paid' | 'complimentary' | 'read_only'; trialEndsAt: string | null; paidAt: string | null
}

export function rowToFirm(r: FirmRow): Firm {
  return {
    id: r.id, name: r.name, tradingName: r.trading_name, registrationNo: r.registration_no, sstNo: r.sst_no, phone: r.phone, email: r.email,
    website: r.website, address1: r.address1, address2: r.address2, postcode: r.postcode, city: r.city, state: r.state, country: r.country,
    logoPath: r.logo_path, currency: r.currency, statementNote: r.statement_note, discrepancyDays: r.discrepancy_days,
    showRegistrationOnStatement: r.show_registration_on_statement, fyStartMonth: r.fy_start_month, dateFormat: r.date_format as Firm['dateFormat'],
    billingStatus: r.billing_status, trialEndsAt: r.trial_ends_at, paidAt: r.paid_at,
  }
}

const FIRM_COLUMNS: [keyof Firm, keyof FirmRow][] = [
  ['name', 'name'], ['tradingName', 'trading_name'], ['registrationNo', 'registration_no'], ['sstNo', 'sst_no'], ['phone', 'phone'],
  ['email', 'email'], ['website', 'website'], ['address1', 'address1'], ['address2', 'address2'], ['postcode', 'postcode'], ['city', 'city'],
  ['state', 'state'], ['country', 'country'], ['logoPath', 'logo_path'], ['statementNote', 'statement_note'],
  ['discrepancyDays', 'discrepancy_days'], ['showRegistrationOnStatement', 'show_registration_on_statement'],
  ['fyStartMonth', 'fy_start_month'], ['dateFormat', 'date_format'],
]

export function firmToRow(f: Partial<Firm>): Partial<FirmRow> {
  const out: Record<string, unknown> = {}
  for (const [from, to] of FIRM_COLUMNS) if (from in f) out[to] = f[from]
  return out as Partial<FirmRow>
}

export type BankAccount = { id: string; name: string; bankName: string; accountName: string; accountNo: string; isDefault: boolean; isActive: boolean }
export const rowToBank = (r: BankRow): BankAccount => ({
  id: r.id, name: r.name, bankName: r.bank_name, accountName: r.account_name, accountNo: r.account_no, isDefault: r.is_default, isActive: r.is_active,
})

export type Member = { id: string; userId: string; name: string; email: string; role: Role; status: 'active' | 'invited' | 'suspended'; lastActiveAt: string | null; createdAt: string }
export const rowToMember = (r: ProfileRow): Member => ({
  id: r.id, userId: r.user_id, name: r.name, email: r.email, role: r.role, status: r.status, lastActiveAt: r.last_active_at, createdAt: r.created_at,
})

export type Contract = {
  id: string; clientId: string; title: string; startDate: string; endDate: string
  status: 'pending_review' | 'approved' | 'rejected'; reviewedBy: string | null; createdAt: string
}
export const rowToContract = (r: ContractRow): Contract => ({
  id: r.id, clientId: r.client_id, title: r.title, startDate: r.start_date, endDate: r.end_date,
  status: r.status as Contract['status'], reviewedBy: r.reviewed_by, createdAt: r.created_at,
})

export function parseAmount(input: string): { ok: true; cents: number } | { ok: false; error: string } {
  const cents = parseCents(input)
  if (cents === null) return { ok: false, error: 'Enter an amount greater than 0, up to 2 decimal places.' }
  if (cents > AMOUNT_CAP) return { ok: false, error: 'That amount is too large. The maximum is 100,000,000,000.00.' }
  return { ok: true, cents }
}
