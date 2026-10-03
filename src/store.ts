import { arrayMove } from '@dnd-kit/sortable'
import { temporal } from 'zundo'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { today, type Client, type Kind, type Txn } from './ledger'

export type WidgetType = 'net' | 'in' | 'out' | 'clients' | 'cashflow' | 'balances' | 'recent' | 'quick-add'
export type Span = 1 | 2 | 4
export type Widget = { id: string; type: WidgetType; span: Span }

type Data = { businessName: string; clients: Client[]; txns: Txn[]; widgets: Widget[] }

type Actions = {
  setBusinessName: (name: string) => void
  addClient: (client: Omit<Client, 'id' | 'createdAt'>) => void
  removeClient: (id: string) => void
  addTxn: (txn: Omit<Txn, 'id'>) => void
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
  const people: [string, string, string][] = [
    ['Harbourline Logistics', 'Aisha Rahman', 'aisha@harbourline.example'],
    ['Tan & Co Bakery', 'Marcus Tan', 'marcus@tanco.example'],
    ['Northwind Studio', 'Priya Nair', 'priya@northwind.example'],
    ['Meridian Dental', 'Daniel Lim', 'daniel@meridian.example'],
    ['Lumen Analytics', 'Sofia Reyes', 'sofia@lumen.example'],
    ['Kopi Corner', 'Wei Jie Ong', 'weijie@kopicorner.example'],
  ]
  const clients = people.map(([name, contact, email]) => ({ id: uid(), name, contact, email, createdAt: dayOf(6) }))
  const ins = ['Retainer received', 'Invoice settlement', 'Funds received', 'Escrow deposit']
  const outs = ['Supplier payment', 'Disbursement', 'Filing fees', 'Refund to client', 'Payroll disbursement']
  const txns: Txn[] = clients.flatMap((c, ci) =>
    Array.from({ length: 6 }, (_, monthsAgo) => {
      const scale = 1 + ci * 0.6
      const make = (kind: Kind, notes: string[], base: number) => ({
        id: uid(),
        clientId: c.id,
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
  return { businessName: 'Your Business Pte Ltd', clients, txns, widgets: DEFAULT_WIDGETS }
}

// persist wraps temporal so undo/redo go through persist's setter and get saved too.
export const useStore = create<Data & Actions>()(
  persist(
    temporal(
      (set) => ({
        ...demoData(),
        setBusinessName: (businessName) => set({ businessName }),
        addClient: (client) =>
          set((s) => ({ clients: [...s.clients, { ...client, id: uid(), createdAt: today() }] })),
        removeClient: (id) =>
          set((s) => ({ clients: s.clients.filter((c) => c.id !== id), txns: s.txns.filter((t) => t.clientId !== id) })),
        addTxn: (txn) => set((s) => ({ txns: [...s.txns, { ...txn, id: uid() }] })),
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
    { name: 'platform-internal', version: 1 },
  ),
)

// Hydrating from localStorage goes through the wrapped setter; don't let it be the first undo step.
useStore.temporal.getState().clear()
