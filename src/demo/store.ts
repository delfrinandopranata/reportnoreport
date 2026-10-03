import { fillClient, type Client, type Txn } from '../ledger'
import type { BankAccount, Contract, Firm, Member } from '../data/mappers'

/** Set only for the `/demo/` build (scripts/build-demo.sh); never true for `/app/`. */
export const DEMO = import.meta.env.VITE_DEMO === 'true'

export type DemoStore = {
  firm: Firm
  profile: Member
  members: Member[]
  clients: Client[]
  transactions: Txn[]
  bankAccounts: BankAccount[]
  contracts: Contract[]
  preferences: Record<string, unknown>
}

const KEY = 'rnr-demo-store'

const DAY = 24 * 60 * 60 * 1000
const iso = (d: Date) => d.toLocaleDateString('en-CA')
const daysAgo = (n: number) => iso(new Date(Date.now() - n * DAY))
const daysFromNow = (n: number) => iso(new Date(Date.now() + n * DAY))

export const uid = (): string => crypto.randomUUID()

/** Realistic seed data, shaped like `load_sample_data()` (supabase/migrations/20261006000001_onboarding.sql). */
function seed(): DemoStore {
  const ownerId = 'demo-owner'
  const bankId = 'demo-bank-main'
  const now = new Date().toISOString()

  const clients: Client[] = [
    fillClient({ id: 'demo-c1', name: 'Kopi Corner Sdn Bhd', contact: 'Wei Jie Ong', email: 'weijie@kopicorner.example', phone: '+60123456789', clientCode: 'KC-001', industry: 'Food & Beverage', city: 'Petaling Jaya', state: 'Selangor', postcode: '46200', tags: ['Retainer'], createdAt: daysAgo(180) }),
    fillClient({ id: 'demo-c2', name: 'Harbourline Logistics Sdn Bhd', contact: 'Aisha Rahman', email: 'aisha@harbourline.example', phone: '+60123456781', industry: 'Logistics', city: 'Klang', state: 'Selangor', postcode: '41200', tags: ['Priority'], createdAt: daysAgo(150) }),
    fillClient({ id: 'demo-c3', name: 'Lim Boon Hock & Associates', contact: 'Lim Boon Hock', email: 'contact@limboonhock.example', phone: '+60198765432', type: 'individual', registrationNo: '850101-14-5523', industry: 'Legal', city: 'Kuala Lumpur', state: 'Kuala Lumpur', postcode: '50200', tags: ['Legal'], createdAt: daysAgo(120) }),
    fillClient({ id: 'demo-c4', name: 'Equity Legal Sdn Bhd', contact: 'Nur Aisyah', email: 'info@equitylegal.example', phone: '+60187654321', industry: 'Legal', city: 'Subang Jaya', state: 'Selangor', postcode: '40700', tags: ['Corporate'], createdAt: daysAgo(90) }),
    fillClient({ id: 'demo-c5', name: 'Rajesh Trading Co Sdn Bhd', contact: 'Rajesh Kumar', email: 'rajesh@rajeshtrading.example', phone: '+60176543210', industry: 'Retail', city: 'Ipoh', state: 'Perak', postcode: '30000', tags: ['Retainer'], status: 'inactive', createdAt: daysAgo(60) }),
  ]

  // ~5 transactions per client over the last 6 months; one is a negative correction (demo-c1).
  const transactions: Txn[] = [
    { id: 'demo-t1', clientId: 'demo-c1', bankAccountId: bankId, kind: 'in', amount: 150000, date: daysAgo(170), note: 'Retainer received', createdAt: now, updatedAt: now },
    { id: 'demo-t2', clientId: 'demo-c1', bankAccountId: bankId, kind: 'out', amount: 28000, date: daysAgo(140), note: 'Filing fees', createdAt: now, updatedAt: now },
    { id: 'demo-t3', clientId: 'demo-c1', bankAccountId: bankId, kind: 'in', amount: 150000, date: daysAgo(110), note: 'Retainer received', createdAt: now, updatedAt: now },
    { id: 'demo-t4', clientId: 'demo-c1', bankAccountId: bankId, kind: 'out', amount: -5000, date: daysAgo(80), note: 'Overpayment correction', createdAt: now, updatedAt: now },
    { id: 'demo-t5', clientId: 'demo-c1', bankAccountId: bankId, kind: 'in', amount: 150000, date: daysAgo(20), note: 'Retainer received', createdAt: now, updatedAt: now },

    { id: 'demo-t6', clientId: 'demo-c2', bankAccountId: bankId, kind: 'in', amount: 220000, date: daysAgo(145), note: 'Escrow deposit', createdAt: now, updatedAt: now },
    { id: 'demo-t7', clientId: 'demo-c2', bankAccountId: bankId, kind: 'out', amount: 31500, date: daysAgo(100), note: 'Port charges paid', createdAt: now, updatedAt: now },
    { id: 'demo-t8', clientId: 'demo-c2', bankAccountId: bankId, kind: 'in', amount: 95000, date: daysAgo(45), note: 'Service fee', createdAt: now, updatedAt: now },

    { id: 'demo-t9', clientId: 'demo-c3', bankAccountId: bankId, kind: 'in', amount: 480000, date: daysAgo(115), note: 'Legal fees', createdAt: now, updatedAt: now },
    { id: 'demo-t10', clientId: 'demo-c3', bankAccountId: bankId, kind: 'out', amount: 12000, date: daysAgo(90), note: 'Court fees', createdAt: now, updatedAt: now },
    { id: 'demo-t11', clientId: 'demo-c3', bankAccountId: bankId, kind: 'in', amount: 60000, date: daysAgo(10), note: 'Consultation fee', createdAt: now, updatedAt: now },

    { id: 'demo-t12', clientId: 'demo-c4', bankAccountId: bankId, kind: 'in', amount: 320000, date: daysAgo(85), note: 'Corporate fees received', createdAt: now, updatedAt: now },
    { id: 'demo-t13', clientId: 'demo-c4', bankAccountId: bankId, kind: 'out', amount: 18000, date: daysAgo(30), note: 'Stamp duty', createdAt: now, updatedAt: now },

    { id: 'demo-t14', clientId: 'demo-c5', bankAccountId: bankId, kind: 'in', amount: 175000, date: daysAgo(55), note: 'Payment received', createdAt: now, updatedAt: now },
    { id: 'demo-t15', clientId: 'demo-c5', bankAccountId: bankId, kind: 'out', amount: 42000, date: daysAgo(5), note: 'Supplier payment', createdAt: now, updatedAt: now },
  ]

  const members: Member[] = [
    { id: ownerId, userId: ownerId, name: 'Alex Tan', email: 'alex@demo.example', role: 'owner', status: 'active', lastActiveAt: now, createdAt: daysAgo(180) },
    { id: 'demo-admin', userId: 'demo-admin', name: 'Priya Nair', email: 'priya@demo.example', role: 'admin', status: 'active', lastActiveAt: daysAgo(1), createdAt: daysAgo(120) },
    { id: 'demo-viewer', userId: 'demo-viewer', name: 'Daniel Wong', email: 'daniel@demo.example', role: 'viewer', status: 'invited', lastActiveAt: null, createdAt: daysAgo(3) },
  ]

  const bankAccounts: BankAccount[] = [
    { id: bankId, name: 'Main account', bankName: 'Maybank', accountName: 'Demo Accounting Sdn Bhd', accountNo: '1234567890', isDefault: true, isActive: true },
    { id: 'demo-bank-petty', name: 'Petty cash', bankName: 'CIMB Bank', accountName: 'Demo Accounting Sdn Bhd', accountNo: '0987654321', isDefault: false, isActive: true },
  ]

  const contracts: Contract[] = [
    { id: 'demo-ct0', clientId: 'demo-c1', counterparty: 'Old Mill Traders', title: 'Distribution agreement', startDate: daysAgo(400), endDate: daysAgo(10), notes: '', createdAt: daysAgo(400) },
    { id: 'demo-ct1', clientId: 'demo-c1', counterparty: 'Harbour Foods Sdn Bhd', title: 'Supply agreement 2026', startDate: daysAgo(170), endDate: daysFromNow(18), notes: '', createdAt: daysAgo(170) },
    { id: 'demo-ct2', clientId: 'demo-c2', counterparty: 'Northgate Logistics', title: 'Logistics services contract', startDate: daysAgo(5), endDate: daysFromNow(360), notes: '', createdAt: daysAgo(5) },
  ]

  const firm: Firm = {
    id: 'demo-firm', name: 'Demo Accounting Sdn Bhd', tradingName: 'Demo Accounting', registrationNo: '202601012345', sstNo: '',
    phone: '+60312345678', email: 'hello@demoaccounting.example', website: 'https://demoaccounting.example',
    address1: 'Level 10, Menara Demo', address2: 'Jalan Contoh', postcode: '50450', city: 'Kuala Lumpur', state: 'Kuala Lumpur', country: 'Malaysia',
    logoPath: null, currency: 'MYR', statementNote: 'Thank you for your business.', discrepancyDays: 7, showRegistrationOnStatement: true,
    fyStartMonth: 1, dateFormat: 'text', billingStatus: 'complimentary', trialEndsAt: null, paidAt: null, designSystem: 'ocean',
  }

  return { firm, profile: members[0], members, clients, transactions, bankAccounts, contracts, preferences: {} }
}

let cache: DemoStore | null = null

export function getStore(): DemoStore {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      cache = JSON.parse(raw) as DemoStore
      return cache
    }
  } catch { /* private browsing */ }
  cache = seed()
  saveStore(cache)
  return cache
}

export function saveStore(store: DemoStore): void {
  cache = store
  try { localStorage.setItem(KEY, JSON.stringify(store)) } catch { /* private browsing, quota */ }
}
