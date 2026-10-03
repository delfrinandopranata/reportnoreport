import { useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { monthlyFlow, today, type Txn } from './ledger'
import { sumBalances } from './data/mappers'
import { useMoney } from './data/money'
import { useBalances, useClients, useLedger, useRecentTxns } from './data/queries'
import type { Span, WidgetType } from './Dashboard'
import { LoadError, Skeleton, useGate } from './clients/shared'
import { Avatar, btn, Icon, KindBadge, TxnForm } from './ui'

const ALL_TIME = '1900-01-01'

type QueryState = { isPending: boolean; error: Error | null }

/** Loading placeholders sized like each widget's real content, so the grid doesn't jump when data lands. */
const LOADING = {
  kpi: (
    <div className="flex items-end justify-between gap-3">
      <div className="grid gap-2"><Skeleton className="h-8 w-36" /><Skeleton className="h-4 w-44" /></div>
      <Skeleton className="size-10 rounded-xl" />
    </div>
  ),
  chart: <Skeleton className="h-[248px] w-full rounded-xl" />,
  list: (
    <div className="grid gap-3.5">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3"><Skeleton className="size-8 rounded-full" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-20" /></div>
      ))}
    </div>
  ),
}

/** Loading / error stand-in for a widget; null once every query has data. */
function queryStatus(shape: keyof typeof LOADING, ...qs: QueryState[]) {
  const error = qs.find((q) => q.error)?.error
  if (error) return <LoadError error={error} what="this widget" compact />
  if (qs.some((q) => q.isPending)) {
    return (
      <div role="status" aria-label="Loading">
        {LOADING[shape]}
        <span className="sr-only">Loading…</span>
      </div>
    )
  }
  return null
}

function MoneyKpi({ metric }: { metric: 'net' | 'in' | 'out' }) {
  const money = useMoney()
  const monthStart = `${today().slice(0, 7)}-01`
  const allQ = useBalances({ from: ALL_TIME, to: today() })
  const monthQ = useBalances({ from: monthStart, to: today() })
  const status = queryStatus('kpi', allQ, monthQ)
  if (status) return status
  const all = sumBalances(allQ.data ?? [])
  const m = sumBalances(monthQ.data ?? [])
  const value = { net: all.closing, in: all.receipts, out: all.payments }[metric]
  const month = { net: m.receipts - m.payments, in: m.receipts, out: m.payments }[metric]
  const tone = metric === 'in' ? 'bg-in/10 text-in' : metric === 'out' ? 'bg-out/10 text-out' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className={`truncate text-xl font-semibold tracking-tight tabular-nums 2xl:text-2xl ${value < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{money.format(value)}</p>
        <p className="mt-1 text-sm text-zinc-500 tabular-nums">
          {metric === 'net' ? 'Net movement' : metric === 'in' ? 'Receipts' : 'Payments'} MTD {money.format(month)}
        </p>
      </div>
      <span aria-hidden className={`hidden size-10 shrink-0 place-items-center rounded-xl 2xl:grid ${tone}`}>
        <Icon name={metric === 'net' ? 'wallet' : metric} className="size-5" />
      </span>
    </div>
  )
}

function ClientsKpi() {
  const clientsQ = useClients()
  const balancesQ = useBalances({ from: ALL_TIME, to: today() })
  const status = queryStatus('kpi', clientsQ, balancesQ)
  if (status) return status
  const clients = clientsQ.data ?? []
  const overdrawn = (balancesQ.data ?? []).filter((r) => r.closing < 0).length
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{clients.filter((c) => c.status === 'active').length}</p>
        <p className="mt-1 text-sm text-zinc-500">{overdrawn ? `${overdrawn} in debit balance` : 'No debit balances'}</p>
      </div>
      <span aria-hidden className="hidden size-10 place-items-center rounded-xl bg-zinc-100 2xl:grid text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        <Icon name="users" className="size-5" />
      </span>
    </div>
  )
}

const CHART = { w: 640, h: 220, top: 12, bottom: 28, left: 52 }

const barPath = (x: number, y: number, w: number, h: number) => {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

function Cashflow() {
  const d = new Date()
  const sixMonthsAgo = new Date(d.getFullYear(), d.getMonth() - 5, 1).toLocaleDateString('en-CA')
  const ledger = useLedger({ from: sixMonthsAgo, to: today() })
  return queryStatus('chart', ledger) ?? <CashflowChart txns={ledger.data ?? []} />
}

export function CashflowChart({ txns }: { txns: Txn[] }) {
  const money = useMoney()
  const flow = useMemo(() => monthlyFlow(txns, 6, today()), [txns])
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...flow.flatMap((f) => [f.in, f.out]))
  const plotH = CHART.h - CHART.top - CHART.bottom
  const slot = (CHART.w - CHART.left) / flow.length
  const barW = Math.min(28, slot * 0.28)
  const y = (v: number) => CHART.top + plotH - (v / max) * plotH
  const ticks = [0, 0.5, 1].map((p) => p * max)
  const active = hover === null ? null : flow[hover]

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs text-zinc-500" aria-hidden>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-in" /> Receipts</span>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-out" /> Payments</span>
        <span className="ml-auto">Last 6 months</span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${CHART.w} ${CHART.h}`} className="w-full" role="img" aria-label="Receipts and payments by month" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={CHART.left} x2={CHART.w} y1={y(t)} y2={y(t)} className="stroke-zinc-200 dark:stroke-zinc-800" strokeDasharray={t ? '3 4' : undefined} />
              <text x={CHART.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-zinc-400 text-[11px] tabular-nums">
                {money.compact(t)}
              </text>
            </g>
          ))}
          {flow.map((f, i) => {
            const cx = CHART.left + slot * i + slot / 2
            return (
              <g key={f.key} onMouseEnter={() => setHover(i)} className={hover !== null && hover !== i ? 'opacity-40 transition-opacity' : 'transition-opacity'}>
                <rect x={cx - slot / 2} y={CHART.top} width={slot} height={plotH + CHART.bottom} fill="transparent" />
                {f.in > 0 && <path d={barPath(cx - barW - 1, y(f.in), barW, y(0) - y(f.in))} className="fill-in" />}
                {f.out > 0 && <path d={barPath(cx + 1, y(f.out), barW, y(0) - y(f.out))} className="fill-out" />}
                <text x={cx} y={CHART.h - 8} textAnchor="middle" className="fill-zinc-500 text-[11px]">
                  {f.label}
                </text>
              </g>
            )
          })}
        </svg>
        {active && hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white p-3 text-xs shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
            style={{ left: `${((CHART.left + slot * hover + slot / 2) / CHART.w) * 100}%` }}
          >
            <p className="mb-1.5 font-medium">{active.label} {active.key.slice(0, 4)}</p>
            <p className="flex justify-between gap-2 tabular-nums"><span className="flex items-center gap-1.5 text-zinc-500"><i className="size-2 rounded-sm bg-in" />Receipts</span>{money.format(active.in)}</p>
            <p className="flex justify-between gap-2 tabular-nums"><span className="flex items-center gap-1.5 text-zinc-500"><i className="size-2 rounded-sm bg-out" />Payments</span>{money.format(active.out)}</p>
            <p className="mt-1.5 flex justify-between gap-2 border-t border-zinc-100 pt-1.5 font-medium tabular-nums dark:border-zinc-800"><span>Net cash flow</span>{money.format(active.in - active.out)}</p>
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>Receipts and payments by month</caption>
        <thead><tr><th>Month</th><th>Receipts</th><th>Payments</th></tr></thead>
        <tbody>{flow.map((f) => <tr key={f.key}><td>{f.label}</td><td>{money.format(f.in)}</td><td>{money.format(f.out)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

function Balances() {
  const money = useMoney()
  const clientsQ = useClients()
  const balancesQ = useBalances({ from: ALL_TIME, to: today() })
  const clients = clientsQ.data ?? []
  const balances = balancesQ.data ?? []
  const rows = useMemo(() => {
    const byClient = new Map(balances.map((r) => [r.client_id, r.closing]))
    return clients.map((c) => ({ ...c, net: byClient.get(c.id) ?? 0 })).sort((a, b) => b.net - a.net)
  }, [clients, balances])
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.net)))
  const status = queryStatus('list', clientsQ, balancesQ)
  if (status) return status
  if (!rows.length) return <Empty text="No clients yet." action={<a href="#clients" className={btn.ghost}>Go to clients</a>} />
  return (
    <ul className="grid gap-3">
      {rows.slice(0, 6).map((r) => (
        <li key={r.id} className="flex items-center gap-3">
          <Avatar name={r.name} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <a href={`#clients/${r.id}`} className="truncate text-sm font-medium hover:underline">{r.name}</a>
              <span className={`text-sm font-medium tabular-nums ${r.net < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{money.format(r.net)}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className={`h-full rounded-full ${r.net < 0 ? 'bg-red-500' : 'bg-zinc-800 dark:bg-zinc-300'}`} style={{ width: `${(Math.abs(r.net) / max) * 100}%` }} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function Recent() {
  const clientsQ = useClients()
  const recentQ = useRecentTxns(6)
  const clients = clientsQ.data ?? []
  const recent = recentQ.data ?? []
  const names = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients])
  const status = queryStatus('list', clientsQ, recentQ)
  if (status) return status
  if (!recent.length) return <Empty text="No transactions posted yet." action={<a href="#clients" className={btn.ghost}>Open a client to record one</a>} />
  return <TxnList txns={recent} names={names} />
}

function TxnList({ txns, names }: { txns: Txn[]; names?: Map<string, string> }) {
  const money = useMoney()
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {txns.map((t) => (
        <li key={t.id} className="group flex items-center gap-3 py-2.5">
          <KindBadge kind={t.kind} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{names?.get(t.clientId) ?? (t.note || (t.kind === 'in' ? 'Receipt' : 'Payment'))}</p>
            <p className="truncate text-xs text-zinc-500">
              {names && t.note ? `${t.note} · ` : ''}
              {new Date(`${t.date}T00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <span className={`text-sm font-medium tabular-nums ${t.kind === 'in' ? 'text-in' : ''}`}>
            {t.kind === 'in' ? '+' : '−'}
            {money.format(t.amount)}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Empty state: says what happened and, via `action`, what to do next. */
export function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="grid min-h-24 content-center justify-items-center gap-3 rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
      <p>{text}</p>
      {action}
    </div>
  )
}

function QuickAdd() {
  const gate = useGate('transactions.post', 'record transactions')
  return gate.ok ? <TxnForm /> : <p className="text-sm text-zinc-500">{gate.title}</p>
}

export const WIDGETS: Record<WidgetType, { title: string; blurb: string; span: Span; Component: ComponentType }> = {
  net: { title: 'Client funds held', blurb: 'Receipts less payments', span: 1, Component: () => <MoneyKpi metric="net" /> },
  in: { title: 'Total receipts', blurb: 'All funds received', span: 1, Component: () => <MoneyKpi metric="in" /> },
  out: { title: 'Total payments', blurb: 'All funds disbursed', span: 1, Component: () => <MoneyKpi metric="out" /> },
  clients: { title: 'Active clients', blurb: 'Count and debit balances', span: 1, Component: ClientsKpi },
  cashflow: { title: 'Cash flow', blurb: 'Receipts vs payments, 6 months', span: 2, Component: Cashflow },
  balances: { title: 'Client balances', blurb: 'Funds held per client', span: 2, Component: Balances },
  recent: { title: 'Recent transactions', blurb: 'Latest ledger entries', span: 2, Component: Recent },
  'quick-add': { title: 'Record transaction', blurb: 'Post a receipt or payment', span: 2, Component: QuickAdd },
}
