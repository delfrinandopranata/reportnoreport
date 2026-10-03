import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { formatMoney, statement, today, type Txn } from './ledger'
import { useStore } from './store'
import { btn, Field, Icon, input } from './ui'

const iso = (d: Date) => d.toLocaleDateString('en-CA')
const longDate = (date: string) => new Date(`${date}T00:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })
const shortDate = (date: string) => new Date(`${date}T00:00`).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' })
const accountNo = (clientId: string) => clientId.slice(0, 8).toUpperCase()

type Period = { from: string; to: string }

function presets(firstDate: string): { label: string; period: Period }[] {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  return [
    { label: 'This month', period: { from: iso(new Date(y, m, 1)), to: today() } },
    { label: 'Last month', period: { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) } },
    { label: 'Last 3 months', period: { from: iso(new Date(y, m - 2, 1)), to: today() } },
    { label: 'Year to date', period: { from: iso(new Date(y, 0, 1)), to: today() } },
    { label: 'All time', period: { from: firstDate, to: today() } },
  ]
}

const earliest = (txns: Txn[], fallback: string) => txns.reduce((min, t) => (t.date < min ? t.date : min), fallback)

const cell = 'px-3 py-2'
const num = `${cell} text-right whitespace-nowrap tabular-nums`
const neg = (value: number) => (value < 0 ? 'text-red-700' : '')

/** Period controls, issuer, print button and the A4 paper wrapper shared by every statement. */
function StatementLayout({
  back,
  title,
  firstDate,
  fileName,
  children,
}: {
  back: { href: string; label: string }
  title: string
  firstDate: string
  fileName: (period: Period) => string
  children: (period: Period) => ReactNode
}) {
  const businessName = useStore((s) => s.businessName)
  const setBusinessName = useStore((s) => s.setBusinessName)
  const options = presets(firstDate)
  const [period, setPeriod] = useState<Period>(options[1].period)
  const invalid = period.from > period.to
  const docTitle = fileName(period)

  // The document title becomes the default file name when saving as PDF.
  useEffect(() => {
    const previous = document.title
    document.title = docTitle
    return () => {
      document.title = previous
    }
  }, [docTitle])

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid gap-4 print:hidden">
        <a href={back.href} className="inline-flex items-center gap-1 justify-self-start text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
          <Icon name="back" /> {back.label}
        </a>
        <header className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-zinc-500">Choose the statement period, then print or save as PDF.</p>
          </div>
          <button type="button" className={btn.primary} onClick={() => print()} disabled={invalid}>
            <Icon name="printer" /> Print / Save PDF
          </button>
        </header>

        <div className="grid gap-4 rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Statement period">
            {options.map((o) => {
              const active = o.period.from === period.from && o.period.to === period.to
              return (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPeriod(o.period)}
                  className={`rounded-full border px-3 py-1 text-sm transition ${
                    active
                      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900'
                      : 'border-zinc-200 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Period from">
              <input type="date" value={period.from} max={period.to} onChange={(e) => e.target.value && setPeriod({ ...period, from: e.target.value })} className={input} />
            </Field>
            <Field label="Period to">
              <input type="date" value={period.to} min={period.from} max={today()} onChange={(e) => e.target.value && setPeriod({ ...period, to: e.target.value })} className={input} />
            </Field>
            <Field label="Issued by">
              <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Your business name" className={input} />
            </Field>
          </div>
          {invalid && <p className="text-sm text-red-600 dark:text-red-400" role="alert">The start date must be on or before the end date.</p>}
        </div>
      </div>

      {/* The document itself: fixed light palette so print and screen match regardless of theme. */}
      <article className="mx-auto w-full max-w-[210mm] overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-900 shadow-sm sm:p-10 print:max-w-none print:overflow-visible print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="min-w-[560px] print:min-w-0">{children(period)}</div>
      </article>
    </div>
  )
}

function DocHeader({ title, subtitle, meta }: { title: string; subtitle: string; meta: [string, string][] }) {
  const businessName = useStore((s) => s.businessName)
  return (
    <header className="flex items-start justify-between gap-6 border-b-2 border-zinc-900 pb-5">
      <div>
        <p className="text-lg font-semibold">{businessName || 'Your business name'}</p>
        <p className="mt-0.5 text-zinc-500">{subtitle}</p>
      </div>
      <div className="text-right">
        <h2 className="text-xl font-semibold tracking-wide uppercase">{title}</h2>
        <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-4 gap-y-0.5 text-zinc-600">
          {[['Statement date', longDate(today())], ...meta, ['Currency', 'SGD']].map(([k, v]) => (
            <div key={k} className="contents">
              <dt>{k}</dt>
              <dd className="text-zinc-900 tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </header>
  )
}

function Summary({ opening, receipts, payments, closing, closingLabel = 'Closing balance' }: { opening: number; receipts: number; payments: number; closing: number; closingLabel?: string }) {
  const items = [
    ['Opening balance', opening],
    ['Total receipts', receipts],
    ['Total payments', payments],
    [closingLabel, closing],
  ] as const
  return (
    <section className="mb-6 grid grid-cols-4 overflow-hidden rounded-lg border border-zinc-200 print:break-inside-avoid">
      {items.map(([label, value], i) => (
        <div key={label} className={`p-3 ${i ? 'border-l border-zinc-200' : ''} ${i === 3 ? 'bg-zinc-50' : ''}`}>
          <p className="text-xs text-zinc-500">{label}</p>
          <p className={`mt-0.5 font-semibold tabular-nums ${i === 3 ? 'text-base' : ''} ${neg(value)}`}>{formatMoney(value)}</p>
        </div>
      ))}
    </section>
  )
}

const Label = ({ children }: { children: ReactNode }) => <p className="mb-1 text-xs font-medium tracking-wide text-zinc-500 uppercase">{children}</p>

function DocFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="mt-10 border-t border-zinc-200 pt-4 text-xs leading-relaxed text-zinc-500 print:break-inside-avoid">
      {children}
      <p className="mt-4">This is a computer-generated statement. No signature is required.</p>
    </footer>
  )
}

const Missing = () => (
  <div className="grid place-items-center gap-3 py-24 text-center">
    <p className="font-medium">This client doesn’t exist any more.</p>
    <a href="#clients" className={btn.primary}>Back to clients</a>
  </div>
)

export function StatementPage({ id }: { id: string }) {
  const client = useStore((s) => s.clients.find((c) => c.id === id))
  const txns = useStore((s) => s.txns)
  const own = useMemo(() => txns.filter((t) => t.clientId === id), [txns, id])
  if (!client) return <Missing />

  return (
    <StatementLayout
      back={{ href: `#clients/${client.id}`, label: client.name }}
      title="Statement of account"
      firstDate={earliest(own, client.createdAt)}
      fileName={(p) => `Statement of Account - ${client.name} - ${p.from} to ${p.to}`}
    >
      {(period) => {
        const soa = statement(own, period.from, period.to)
        return (
          <>
            <DocHeader title="Statement of Account" subtitle="Client account statement" meta={[['Account no.', accountNo(client.id)]]} />
            <section className="grid grid-cols-2 gap-6 py-6">
              <div>
                <Label>Statement to</Label>
                <p className="font-semibold">{client.name}</p>
                {client.contact && <p>Attn: {client.contact}</p>}
                {client.email && <p className="text-zinc-600">{client.email}</p>}
              </div>
              <div>
                <Label>Statement period</Label>
                <p className="font-semibold">{longDate(period.from)} – {longDate(period.to)}</p>
              </div>
            </section>
            <Summary {...soa} />
            <table className="w-full">
              <thead>
                <tr className="border-y border-zinc-300 bg-zinc-50 text-left text-xs text-zinc-600">
                  <th className={`${cell} font-medium`}>Date</th>
                  <th className={`${cell} font-medium`}>Description</th>
                  <th className={`${num} font-medium`}>Receipts</th>
                  <th className={`${num} font-medium`}>Payments</th>
                  <th className={`${num} font-medium`}>Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                <tr className="text-zinc-600">
                  <td className={`${cell} whitespace-nowrap tabular-nums`}>{shortDate(period.from)}</td>
                  <td className={`${cell} italic`} colSpan={3}>Balance brought forward</td>
                  <td className={`${num} font-medium text-zinc-900`}>{formatMoney(soa.opening)}</td>
                </tr>
                {soa.lines.map((l) => (
                  <tr key={l.id} className="print:break-inside-avoid">
                    <td className={`${cell} whitespace-nowrap tabular-nums`}>{shortDate(l.date)}</td>
                    <td className={cell}>{l.note || (l.kind === 'in' ? 'Receipt' : 'Payment')}</td>
                    <td className={num}>{l.kind === 'in' ? formatMoney(l.amount) : ''}</td>
                    <td className={num}>{l.kind === 'out' ? formatMoney(l.amount) : ''}</td>
                    <td className={`${num} ${neg(l.balance)}`}>{formatMoney(l.balance)}</td>
                  </tr>
                ))}
                {!soa.lines.length && (
                  <tr>
                    <td className={`${cell} text-zinc-500`} colSpan={5}>No transactions in this period.</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-900 font-semibold">
                  <td className={cell} colSpan={2}>Closing balance as at {shortDate(period.to)}</td>
                  <td className={num}>{formatMoney(soa.receipts)}</td>
                  <td className={num}>{formatMoney(soa.payments)}</td>
                  <td className={`${num} ${neg(soa.closing)}`}>{formatMoney(soa.closing)}</td>
                </tr>
              </tfoot>
            </table>
            <DocFooter>
              <p>
                {soa.closing < 0
                  ? `This account is in a debit balance of ${formatMoney(-soa.closing)}. Please arrange settlement at your earliest convenience.`
                  : `We hold ${formatMoney(soa.closing)} in client funds on your behalf as at ${longDate(period.to)}.`}
              </p>
              <p className="mt-1">Please review this statement and notify us of any discrepancies within 14 days of the statement date.</p>
            </DocFooter>
          </>
        )
      }}
    </StatementLayout>
  )
}

export function ConsolidatedStatementPage() {
  const clients = useStore((s) => s.clients)
  const txns = useStore((s) => s.txns)
  const sorted = useMemo(() => [...clients].sort((a, b) => a.name.localeCompare(b.name)), [clients])
  const byClient = useMemo(() => {
    const groups = new Map<string, Txn[]>()
    for (const t of txns) groups.set(t.clientId, [...(groups.get(t.clientId) ?? []), t])
    return groups
  }, [txns])
  const firstDate = earliest(txns, clients.reduce((min, c) => (c.createdAt < min ? c.createdAt : min), today()))

  return (
    <StatementLayout
      back={{ href: '#clients', label: 'Clients' }}
      title="Consolidated statement of account"
      firstDate={firstDate}
      fileName={(p) => `Consolidated Statement of Account - ${p.from} to ${p.to}`}
    >
      {(period) => {
        const rows = sorted.map((c) => ({ client: c, soa: statement(byClient.get(c.id) ?? [], period.from, period.to) }))
        const total = statement(txns, period.from, period.to)
        const debit = rows.filter((r) => r.soa.closing < 0)
        return (
          <>
            <DocHeader title="Consolidated Statement" subtitle="All client accounts" meta={[['Client accounts', String(rows.length)]]} />
            <section className="py-6">
              <Label>Statement period</Label>
              <p className="font-semibold">{longDate(period.from)} – {longDate(period.to)}</p>
            </section>
            <Summary {...total} closingLabel="Total client funds held" />
            <table className="w-full">
              <thead>
                <tr className="border-y border-zinc-300 bg-zinc-50 text-left text-xs text-zinc-600">
                  <th className={`${cell} font-medium`}>Client</th>
                  <th className={`${cell} font-medium`}>Account no.</th>
                  <th className={`${num} font-medium`}>Opening balance</th>
                  <th className={`${num} font-medium`}>Receipts</th>
                  <th className={`${num} font-medium`}>Payments</th>
                  <th className={`${num} font-medium`}>Closing balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map(({ client, soa }) => (
                  <tr key={client.id} className="print:break-inside-avoid">
                    <td className={`${cell} font-medium`}>{client.name}</td>
                    <td className={`${cell} text-zinc-600 tabular-nums`}>{accountNo(client.id)}</td>
                    <td className={`${num} ${neg(soa.opening)}`}>{formatMoney(soa.opening)}</td>
                    <td className={num}>{formatMoney(soa.receipts)}</td>
                    <td className={num}>{formatMoney(soa.payments)}</td>
                    <td className={`${num} font-medium ${neg(soa.closing)}`}>{formatMoney(soa.closing)}</td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td className={`${cell} text-zinc-500`} colSpan={6}>No client accounts.</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-900 font-semibold">
                  <td className={cell} colSpan={2}>Total as at {shortDate(period.to)}</td>
                  <td className={`${num} ${neg(total.opening)}`}>{formatMoney(total.opening)}</td>
                  <td className={num}>{formatMoney(total.receipts)}</td>
                  <td className={num}>{formatMoney(total.payments)}</td>
                  <td className={`${num} ${neg(total.closing)}`}>{formatMoney(total.closing)}</td>
                </tr>
              </tfoot>
            </table>
            <DocFooter>
              <p>
                Total client funds held across {rows.length} client accounts as at {longDate(period.to)}: {formatMoney(total.closing)}.
              </p>
              <p className="mt-1">
                {debit.length
                  ? `${debit.length} account${debit.length > 1 ? 's are' : ' is'} in debit balance: ${debit.map((r) => `${r.client.name} (${formatMoney(r.soa.closing)})`).join(', ')}.`
                  : 'No client accounts are in debit balance.'}
              </p>
            </DocFooter>
          </>
        )
      }}
    </StatementLayout>
  )
}
