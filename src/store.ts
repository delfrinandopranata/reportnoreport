import { arrayMove } from '@dnd-kit/sortable'
import { temporal } from 'zundo'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { fillClient, today, type Client, type ClientInput, type Kind, type Txn } from './ledger'

export type WidgetType = 'net' | 'in' | 'out' | 'clients' | 'cashflow' | 'balances' | 'recent' | 'quick-add'
export type Span = 1 | 2 | 4
export type Widget = { id: string; type: WidgetType; span: Span }

type Data = { businessName: string; clients: Client[]; txns: Txn[]; widgets: Widget[] }

type Actions = {
  setBusinessName: (name: string) => void
  addClient: (client: ClientInput) => void
  updateClient: (id: string, patch: Partial<Omit<Client, 'id' | 'createdAt' | 'updatedAt'>>) => void
  removeClient: (id: string) => void
  addTxn: (txn: Omit<Txn, 'id' | 'bankAccountId' | 'createdAt' | 'updatedAt'>) => void
  importLedger: (clients: Client[], txns: Txn[]) => void
  removeTxn: (id: string) => void
  addWidget: (type: WidgetType, span: Span) => void
  removeWidget: (id: string) => void
  moveWidget: (activeId: string, overId: string) => void
  resizeWidget: (id: string) => void
  resetDemo: () => void
}

const uid = () => crypto.randomUUID()
const NEXT_SPAN: Record<Span, Span> = { 1: 2, 2: 4, 4: 1 }

const DEFAULT_WIDGETS: Widget[] = [
  { type: 'net', span: 1 },
  { type: 'in', span: 1 },
  { type: 'out', span: 1 },
  { type: 'clients', span: 1 },
  { type: 'cashflow', span: 2 },
  { type: 'balances', span: 2 },
  { type: 'recent', span: 2 },
  { type: 'quick-add', span: 2 },
].map((w) => ({ ...w, id: uid() }) as Widget)

/** Deterministic demo ledger so a first visit looks like a real business. */
function demoData(): Data {
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const asOf = new Date()
  const dayOf = (monthsAgo: number) => {
    const maxDay = monthsAgo === 0 ? asOf.getDate() : 28
    return new Date(asOf.getFullYear(), asOf.getMonth() - monthsAgo, 1 + Math.floor(rand() * maxDay)).toLocaleDateString('en-CA')
  }
  const base = (name: string, contact: string, email: string, rest: Partial<Client>) =>
    fillClient({ id: uid(), name, contact, email, createdAt: dayOf(6), ...rest })
  const clients = [
    base('Harbourline Logistics Sdn Bhd', 'Aisha Rahman', 'aisha@harbourline.example', {
      registrationNo: '201901023456 (1334521-K)', industry: 'Freight & logistics', phone: '+60123456781', website: 'harbourline.example',
      address1: 'Lot 12, Jalan Perusahaan 3', address2: 'Kawasan Perindustrian Klang', city: 'Klang', state: 'Selangor', postcode: '41200', tags: ['Retainer', 'Priority'],
    }),
    base('Tan & Co Bakery Sdn Bhd', 'Marcus Tan', 'marcus@tanco.example', {
      registrationNo: '201601009876 (1189034-T)', industry: 'Food & beverage', phone: '+60164455210',
      address1: '48, Lebuh Chulia', city: 'George Town', state: 'Pulau Pinang', postcode: '10200', tags: ['Retainer'],
    }),
    base('Northwind Studio Sdn Bhd', 'Priya Nair', 'priya@northwind.example', {
      registrationNo: '202001014567 (1372210-W)', industry: 'Design & creative', phone: '+60122398840', website: 'northwind.example',
      address1: 'Level 7, Menara UOA Bangsar', address2: 'No. 5, Jalan Bangsar Utama 1', city: 'Kuala Lumpur', state: 'Kuala Lumpur', postcode: '59000', tags: ['Project'],
    }),
    base('Meridian Dental Clinic', 'Dr Daniel Lim', 'daniel@meridian.example', {
      registrationNo: '201801030011 (1288876-D)', industry: 'Healthcare', phone: '+60376614400',
      address1: '22, Jalan SS 2/67', city: 'Petaling Jaya', state: 'Selangor', postcode: '47300', status: 'inactive', tags: ['Escrow'],
    }),
    base('Lumen Analytics Sdn Bhd', 'Sofia Reyes', 'sofia@lumen.example', {
      registrationNo: '202201045678 (1456789-A)', industry: 'Technology', phone: '+60183302217', website: 'lumen.example',
      address1: 'Unit 3A-05, Block 3A, Plaza Sentral', city: 'Kuala Lumpur', state: 'Kuala Lumpur', postcode: '50470', tags: ['Priority', 'Project'],
    }),
    base('Wei Jie Ong', 'Wei Jie Ong', 'weijie@kopicorner.example', {
      type: 'individual', registrationNo: '880412-14-5521', industry: 'Food & beverage (Kopi Corner)', phone: '+60197745012',
      address1: '15, Jalan Kenari 5', address2: 'Bandar Puchong Jaya', city: 'Puchong', state: 'Selangor', postcode: '47100', status: 'archived',
    }),
  ]
  const ins = ['Retainer received', 'Invoice settlement', 'Funds received', 'Escrow deposit']
  const outs = ['Supplier payment', 'Disbursement', 'Filing fees', 'Refund to client', 'Payroll disbursement']
  const txns: Txn[] = clients.flatMap((c, ci) =>
    Array.from({ length: 6 }, (_, monthsAgo) => {
      const scale = 1 + ci * 0.6
      const make = (kind: Kind, notes: string[], base: number) => ({
        id: uid(),
        clientId: c.id,
        bankAccountId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        kind,
        amount: Math.round((base * scale * (0.5 + rand())) / 10) * 1000,
        date: dayOf(monthsAgo),
        note: notes[Math.floor(rand() * notes.length)],
      })
      return [
        make('in', ins, 3200),
        ...(rand() > 0.4 ? [make('in', ins, 1500)] : []),
        make('out', outs, 1800),
        ...(rand() > 0.6 ? [make('out', outs, 900)] : []),
      ]
    }).flat(),
  )
  return { businessName: 'Your Business Sdn Bhd', clients, txns, widgets: DEFAULT_WIDGETS }
}

// persist wraps temporal so undo/redo go through persist's setter and get saved too.
export const useStore = create<Data & Actions>()(
  persist(
    temporal(
      (set) => ({
        ...demoData(),
        setBusinessName: (businessName) => set({ businessName }),
        addClient: (client) => set((s) => ({ clients: [...s.clients, fillClient({ ...client, id: uid(), createdAt: today() })] })),
        updateClient: (id, patch) =>
          set((s) => ({ clients: s.clients.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c)) })),
        removeClient: (id) =>
          set((s) => ({ clients: s.clients.filter((c) => c.id !== id), txns: s.txns.filter((t) => t.clientId !== id) })),
        addTxn: (txn) => set((s) => ({ txns: [...s.txns, { ...txn, id: uid(), bankAccountId: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] })),
        // One set() so a whole import is a single undo step.
        importLedger: (clients, txns) => set((s) => ({ clients: [...s.clients, ...clients], txns: [...s.txns, ...txns] })),
        removeTxn: (id) => set((s) => ({ txns: s.txns.filter((t) => t.id !== id) })),
        addWidget: (type, span) => set((s) => ({ widgets: [...s.widgets, { id: uid(), type, span }] })),
        removeWidget: (id) => set((s) => ({ widgets: s.widgets.filter((w) => w.id !== id) })),
        moveWidget: (activeId, overId) =>
          set((s) => {
            const from = s.widgets.findIndex((w) => w.id === activeId)
            const to = s.widgets.findIndex((w) => w.id === overId)
            return from < 0 || to < 0 ? s : { widgets: arrayMove(s.widgets, from, to) }
          }),
        resizeWidget: (id) =>
          set((s) => ({ widgets: s.widgets.map((w) => (w.id === id ? { ...w, span: NEXT_SPAN[w.span] } : w)) })),
        resetDemo: () => set(({ businessName }) => ({ ...demoData(), businessName })),
      }),
      {
        limit: 100,
        partialize: ({ businessName, clients, txns, widgets }): Data => ({ businessName, clients, txns, widgets }),
      },
    ),
    {
      name: 'platform-internal',
      version: 3,
      // v2: currency moved to MYR; swap the old Singapore default issuer name if it was never edited.
      // v3: clients became full business records; fill the new fields on older ones.
      migrate: (state) => {
        const s = state as Data
        const renamed = s.businessName === 'Your Business Pte Ltd' ? { ...s, businessName: 'Your Business Sdn Bhd' } : s
        return { ...renamed, clients: renamed.clients.map((c) => fillClient({ ...c, updatedAt: c.updatedAt ?? c.createdAt })) }
      },
    },
  ),
)

// Hydrating from localStorage goes through the wrapped setter; don't let it be the first undo step.
useStore.temporal.getState().clear()
