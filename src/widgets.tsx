import { useMemo, useState, type ComponentType } from 'react'
import { byDateDesc, formatCompact, formatMoney, monthlyFlow, today, totals, totalsByClient, type Txn } from './ledger'
import { useStore, type Span, type WidgetType } from './store'
import { Avatar, Icon, KindBadge, TxnForm } from './ui'

const thisMonth = () => today().slice(0, 7)

function useMonthSplit(txns: Txn[]) {
  return useMemo(() => {
    const month = thisMonth()
    return { all: totals(txns), month: totals(txns.filter((t) => t.date.startsWith(month))) }
  }, [txns])
}

function MoneyKpi({ metric }: { metric: 'net' | 'in' | 'out' }) {
  const txns = useStore((s) => s.txns)
  const { all, month } = useMonthSplit(txns)
  const value = all[metric]
  const tone = metric === 'in' ? 'bg-in/10 text-in' : metric === 'out' ? 'bg-out/10 text-out' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className={`truncate text-2xl font-semibold tracking-tight tabular-nums ${value < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{formatMoney(value)}</p>
        <p className="mt-1 text-sm text-zinc-500 tabular-nums">
          {metric === 'net' ? 'Net movement' : metric === 'in' ? 'Receipts' : 'Payments'} MTD {formatMoney(month[metric])}
        </p>
      </div>
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone}`}>
        <Icon name={metric === 'net' ? 'wallet' : metric} className="size-5" />
      </span>
    </div>
  )
}

function ClientsKpi() {
  const clients = useStore((s) => s.clients)
  const txns = useStore((s) => s.txns)
  const overdrawn = useMemo(() => [...totalsByClient(txns).values()].filter((t) => t.net < 0).length, [txns])
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{clients.filter((c) => c.status === 'active').length}</p>
        <p className="mt-1 text-sm text-zinc-500">{overdrawn ? `${overdrawn} in debit balance` : 'No debit balances'}</p>
      </div>
      <span className="grid size-10 place-items-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
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
  return <CashflowChart txns={useStore((s) => s.txns)} />
}

export function CashflowChart({ txns }: { txns: Txn[] }) {
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
                {formatCompact(t)}
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
            <p className="flex justify-between gap-2 tabular-nums"><span className="flex items-center gap-1.5 text-zinc-500"><i className="size-2 rounded-sm bg-in" />Receipts</span>{formatMoney(active.in)}</p>
            <p className="flex justify-between gap-2 tabular-nums"><span className="flex items-center gap-1.5 text-zinc-500"><i className="size-2 rounded-sm bg-out" />Payments</span>{formatMoney(active.out)}</p>
            <p className="mt-1.5 flex justify-between gap-2 border-t border-zinc-100 pt-1.5 font-medium tabular-nums dark:border-zinc-800"><span>Net cash flow</span>{formatMoney(active.in - active.out)}</p>
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>Receipts and payments by month</caption>
        <thead><tr><th>Month</th><th>Receipts</th><th>Payments</th></tr></thead>
        <tbody>{flow.map((f) => <tr key={f.key}><td>{f.label}</td><td>{formatMoney(f.in)}</td><td>{formatMoney(f.out)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

function Balances() {
  const clients = useStore((s) => s.clients)
  const txns = useStore((s) => s.txns)
  const rows = useMemo(() => {
    const byClient = totalsByClient(txns)
    return clients.map((c) => ({ ...c, net: byClient.get(c.id)?.net ?? 0 })).sort((a, b) => b.net - a.net)
  }, [clients, txns])
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.net)))
  if (!rows.length) return <Empty text="No clients yet." />
  return (
    <ul className="grid gap-3">
      {rows.slice(0, 6).map((r) => (
        <li key={r.id} className="flex items-center gap-3">
          <Avatar name={r.name} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <a href={`#clients/${r.id}`} className="truncate text-sm font-medium hover:underline">{r.name}</a>
              <span className={`text-sm font-medium tabular-nums ${r.net < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{formatMoney(r.net)}</span>
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
  const clients = useStore((s) => s.clients)
  const txns = useStore((s) => s.txns)
  const recent = useMemo(() => [...txns].sort(byDateDesc).slice(0, 6), [txns])
  const names = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients])
  if (!recent.length) return <Empty text="No transactions posted yet." />
  return <TxnList txns={recent} names={names} />
}

function TxnList({ txns, names }: { txns: Txn[]; names?: Map<string, string> }) {
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
            {formatMoney(t.amount)}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function Empty({ text }: { text: string }) {
  return <p className="grid h-24 place-items-center rounded-xl border border-dashed border-zinc-200 text-sm text-zinc-500 dark:border-zinc-800">{text}</p>
}

export const WIDGETS: Record<WidgetType, { title: string; blurb: string; span: Span; Component: ComponentType }> = {
  net: { title: 'Client funds held', blurb: 'Receipts less payments', span: 1, Component: () => <MoneyKpi metric="net" /> },
  in: { title: 'Total receipts', blurb: 'All funds received', span: 1, Component: () => <MoneyKpi metric="in" /> },
  out: { title: 'Total payments', blurb: 'All funds disbursed', span: 1, Component: () => <MoneyKpi metric="out" /> },
  clients: { title: 'Active clients', blurb: 'Count and debit balances', span: 1, Component: ClientsKpi },
  cashflow: { title: 'Cash flow', blurb: 'Receipts vs payments, 6 months', span: 2, Component: Cashflow },
  balances: { title: 'Client balances', blurb: 'Funds held per client', span: 2, Component: Balances },
  recent: { title: 'Recent transactions', blurb: 'Latest ledger entries', span: 2, Component: Recent },
  'quick-add': { title: 'Record transaction', blurb: 'Post a receipt or payment', span: 2, Component: () => <TxnForm /> },
}
