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
    <div className="grid gap-2"><Skeleton className="h-11 w-36" /><Skeleton className="h-4 w-44" /></div>
  ),
  chart: <Skeleton className="h-[248px] w-full" />,
  list: (
    <div className="grid gap-3.5">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3"><Skeleton className="size-8" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-20" /></div>
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
  return (
    <>
      <p className="rnr-kpi-figure">{money.format(value)}</p>
      <p className="rnr-caption rnr-num">
        {metric === 'net' ? 'Net movement' : metric === 'in' ? 'Receipts' : 'Payments'} MTD {money.format(month)}
      </p>
    </>
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
    <>
      <p className="rnr-kpi-figure">{clients.filter((c) => c.status === 'active').length}</p>
      <p className="rnr-caption">{overdrawn ? `${overdrawn} in debit balance` : 'No debit balances'}</p>
    </>
  )
}

const CHART = { w: 640, h: 220, top: 12, bottom: 28, left: 64 }

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

const TIP = { w: 232, h: 84 }

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
  const tipX = hover === null ? 0 : Math.min(Math.max(CHART.left + slot * hover + slot / 2 - TIP.w / 2, CHART.left), CHART.w - TIP.w)

  return (
    <div className="rnr-chart-wrap">
      <ul className="rnr-chart-legend mb-2" aria-hidden>
        <li><svg width="10" height="10"><rect width="10" height="10" className="rnr-chart-bar" /></svg><Icon name="in" className="size-3.5" />Receipts</li>
        <li><svg width="10" height="10"><rect width="10" height="10" className="rnr-chart-bar" data-series="out" /></svg><Icon name="out" className="size-3.5" />Payments</li>
        <li className="ml-auto">Last 6 months</li>
      </ul>
      <svg viewBox={`0 0 ${CHART.w} ${CHART.h}`} className="rnr-chart" role="img" aria-label="Receipts and payments by month" data-hovering={hover === null ? undefined : ''} onMouseLeave={() => setHover(null)}>
        <defs>
          <pattern id="rnr-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)" className="text-series-2">
            <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="2" />
          </pattern>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={CHART.left} x2={CHART.w} y1={y(t)} y2={y(t)} className={t ? 'rnr-chart-grid' : 'rnr-chart-zero'} strokeDasharray={t ? '3 4' : undefined} />
            <text x={CHART.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="rnr-chart-axis">
              {money.compact(t)}
            </text>
          </g>
        ))}
        {flow.map((f, i) => {
          const cx = CHART.left + slot * i + slot / 2
          const on = hover === i ? '' : undefined
          return (
            <g key={f.key} onMouseEnter={() => setHover(i)}>
              <rect x={cx - slot / 2} y={CHART.top} width={slot} height={plotH + CHART.bottom} className="rnr-chart-hit" />
              {f.in > 0 && <path d={barPath(cx - barW - 1, y(f.in), barW, y(0) - y(f.in))} className="rnr-chart-bar" data-active={on} />}
              {f.out > 0 && (
                <>
                  <path d={barPath(cx + 1, y(f.out), barW, y(0) - y(f.out))} className="rnr-chart-bar" data-series="out" data-active={on} />
                  <rect x={cx + 1 + barW / 2 - 4} y={y(f.out) - 11} width="8" height="8" className="rnr-chart-mark" data-series="out" data-active={on} />
                </>
              )}
              <text x={cx} y={CHART.h - 8} textAnchor="middle" className="rnr-chart-axis">
                {f.label}
              </text>
            </g>
          )
        })}
        {active && (
          <g className="rnr-chart-tip" transform={`translate(${tipX} ${CHART.top})`}>
            <rect width={TIP.w} height={TIP.h} rx="8" />
            <text x="12" y="20" fontWeight="500">{active.label} {active.key.slice(0, 4)}</text>
            <text x="12" y="40">Receipts</text><text x={TIP.w - 12} y="40" textAnchor="end" className="rnr-chart-value">{money.format(active.in)}</text>
            <text x="12" y="58">Payments</text><text x={TIP.w - 12} y="58" textAnchor="end" className="rnr-chart-value">{money.format(active.out)}</text>
            <text x="12" y="76" fontWeight="500">Net cash flow</text><text x={TIP.w - 12} y="76" textAnchor="end" className="rnr-chart-value">{money.format(active.in - active.out)}</text>
          </g>
        )}
      </svg>
      <table className="rnr-sr-only">
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
    <ul className="grid grid-cols-1 gap-3">
      {rows.slice(0, 6).map((r) => (
        <li key={r.id} className="flex items-center gap-3">
          <Avatar name={r.name} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <a href={`#clients/${r.id}`} className="rnr-link min-w-0 truncate">{r.name}</a>
              <span className="rnr-amt" data-neg={r.net < 0 || undefined}>{money.format(r.net)}</span>
            </div>
            <progress className="rnr-progress mt-1.5 h-1.5" value={Math.abs(r.net)} max={max} aria-hidden />
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
    <ul className="grid grid-cols-1">
      {txns.map((t) => (
        <li key={t.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
          <KindBadge kind={t.kind} />
          <div className="min-w-0 flex-1">
            <p className="truncate">{names?.get(t.clientId) ?? (t.note || (t.kind === 'in' ? 'Receipt' : 'Payment'))}</p>
            <p className="rnr-caption truncate">
              {names && t.note ? `${t.note} · ` : ''}
              {new Date(`${t.date}T00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <span className="rnr-amt">
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
    <div className="rnr-empty">
      <p>{text}</p>
      {action}
    </div>
  )
}

function QuickAdd() {
  const gate = useGate('transactions.post', 'record transactions')
  return gate.ok ? <TxnForm /> : <p className="rnr-muted">{gate.title}</p>
}

export const WIDGETS: Record<WidgetType, { title: string; blurb: string; span: Span; kpi?: true; Component: ComponentType }> = {
  net: { kpi: true, title: 'Client funds held', blurb: 'Receipts less payments', span: 1, Component: () => <MoneyKpi metric="net" /> },
  in: { kpi: true, title: 'Total receipts', blurb: 'All funds received', span: 1, Component: () => <MoneyKpi metric="in" /> },
  out: { kpi: true, title: 'Total payments', blurb: 'All funds disbursed', span: 1, Component: () => <MoneyKpi metric="out" /> },
  clients: { kpi: true, title: 'Active clients', blurb: 'Count and debit balances', span: 1, Component: ClientsKpi },
  cashflow: { title: 'Cash flow', blurb: 'Receipts vs payments, 6 months', span: 2, Component: Cashflow },
  balances: { title: 'Client balances', blurb: 'Funds held per client', span: 2, Component: Balances },
  recent: { title: 'Recent transactions', blurb: 'Latest ledger entries', span: 2, Component: Recent },
  'quick-add': { title: 'Record transaction', blurb: 'Post a receipt or payment', span: 2, Component: QuickAdd },
}
