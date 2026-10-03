import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { toStatement } from './data/mappers'
import { useMoney } from './data/money'
import { useBalances, useBankAccounts, useClient, useLedger, useLogoUrl } from './data/queries'
import { useSession } from './data/session'
import { accountNo, periodPresets, today, type Client, type Period, type Statement, type StatementLine } from './ledger'
import { formatDate } from './settings/constants'
import { LoadError, Skeleton } from './clients/shared'
import { buildConsolidatedStatement } from './clients/consolidatedStatement'
import { btn, Icon, PeriodPicker } from './ui'
import type { Column } from './table'

function useDates() {
  const { dateFormat } = useSession().firm
  return { longDate: (date: string) => formatDate(date, dateFormat, true), shortDate: (date: string) => formatDate(date, dateFormat) }
}

const cell = 'px-3 py-2'
const num = `${cell} text-right whitespace-nowrap tabular-nums`
const neg = (value: number) => (value < 0 ? 'text-red-700' : '')

/** Period controls, issuer, print button and the A4 paper wrapper shared by every statement. */
export function StatementLayout({
  back,
  title,
  firstDate,
  fileName,
  period,
  setPeriod,
  ready,
  children,
}: {
  back: { href: string; label: string; onClick?: () => void }
  title: string
  firstDate: string
  fileName: (period: Period) => string
  period: Period
  setPeriod: (period: Period) => void
  ready: boolean
  children: ReactNode
}) {
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
        <a href={back.href} onClick={back.onClick ? (e) => { e.preventDefault(); back.onClick?.() } : undefined} className="inline-flex items-center gap-1 justify-self-start text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
          <Icon name="back" /> {back.label}
        </a>
        <header className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-zinc-500">Choose the statement period, then print or save as PDF.</p>
          </div>
          <button type="button" className={`${btn.primary} max-sm:w-full`} onClick={() => print()} disabled={invalid || !ready} aria-describedby={invalid ? 'period-error' : undefined}>
            <Icon name="printer" /> Print / Save PDF
          </button>
        </header>

        <div className="grid gap-4 rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <PeriodPicker period={period} onChange={setPeriod} firstDate={firstDate} />
          <p className="text-sm text-zinc-500">
            Issuer, registration, bank and footer details come from <a href="#settings" className="font-medium underline">Settings</a>.
          </p>
          {invalid && <p id="period-error" className="text-sm text-red-600 dark:text-red-400" role="alert">The start date must be on or before the end date.</p>}
        </div>
      </div>

      {/* The document itself: fixed light palette so print and screen match regardless of theme. */}
      <article className="mx-auto w-full max-w-[210mm] overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-900 shadow-sm sm:p-10 print:max-w-none print:overflow-visible print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="min-w-[560px] print:min-w-0">{children}</div>
      </article>
    </div>
  )
}

function DocHeader({ title, subtitle, meta }: { title: string; subtitle: string; meta: [string, string][] }) {
  const { firm: o } = useSession()
  const { longDate } = useDates()
  const logo = useLogoUrl(o.logoPath)
  const address = [o.address1, o.address2, [o.postcode, o.city].filter(Boolean).join(' '), o.state !== o.city ? o.state : '', o.country !== 'Malaysia' ? o.country : ''].filter(Boolean)
  const reg = o.showRegistrationOnStatement ? [o.registrationNo && `Reg. no. ${o.registrationNo}`, o.sstNo && `SST no. ${o.sstNo}`].filter(Boolean) : []
  return (
    <header className="flex items-start justify-between gap-6 border-b-2 border-zinc-900 pb-5">
      <div className="flex gap-3">
        {logo && <img src={logo} alt="" onError={(e) => (e.currentTarget.hidden = true)} className="max-h-14 max-w-32 shrink-0 object-contain" />}
        <div className="text-zinc-600">
          <p className="text-lg font-semibold text-zinc-900">{o.name || 'Your business name'}</p>
          {o.tradingName && <p>Trading as {o.tradingName}</p>}
          {reg.length > 0 && <p>{reg.join(' · ')}</p>}
          {address.length > 0 && <p>{address.join(', ')}</p>}
          {(o.phone || o.email) && <p>{[o.phone, o.email].filter(Boolean).join(' · ')}</p>}
          <p className="mt-0.5 text-zinc-500">{subtitle}</p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <h2 className="text-xl font-semibold tracking-wide uppercase">{title}</h2>
        <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-4 gap-y-0.5 text-zinc-600">
          {[['Statement date', longDate(today())], ...meta, ['Currency', o.currency.split(' ')[0]]].map(([k, v]) => (
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

function Summary({ opening, receipts, payments, closing }: Statement) {
  const { format: fmt } = useMoney()
  const items = [
    ['Opening balance', opening],
    ['Total receipts', receipts],
    ['Total payments', payments],
    ['Closing balance', closing],
  ] as const
  return (
    <section className="mb-6 grid grid-cols-4 overflow-hidden rounded-lg border border-zinc-200 print:break-inside-avoid">
      {items.map(([label, value], i) => (
        <div key={label} className={`p-3 ${i ? 'border-l border-zinc-200' : ''} ${i === 3 ? 'bg-zinc-50' : ''}`}>
          <p className="text-xs text-zinc-500">{label}</p>
          <p className={`mt-0.5 font-semibold tabular-nums ${i === 3 ? 'text-base' : ''} ${neg(value)}`}>{fmt(value)}</p>
        </div>
      ))}
    </section>
  )
}

const Label = ({ children }: { children: ReactNode }) => <p className="mb-1 text-xs font-medium tracking-wide text-zinc-500 uppercase">{children}</p>

function DocFooter({ children }: { children: ReactNode }) {
  const { firm: o } = useSession()
  const { data: banks = [] } = useBankAccounts()
  const bank = banks.find((b) => b.isDefault)
  return (
    <footer className="mt-10 border-t border-zinc-200 pt-4 text-xs leading-relaxed text-zinc-500 print:break-inside-avoid">
      {children}
      <p className="mt-1">{o.statementNote.replace('{days}', String(o.discrepancyDays))}</p>
      {bank?.accountNo && (
        <p className="mt-3">
          <span className="font-medium text-zinc-700">Settlement details:</span> {[bank.bankName, bank.accountName, bank.accountNo].filter(Boolean).join(' · ')}
        </p>
      )}
      <p className="mt-4">This is a computer-generated statement. No signature is required.</p>
    </footer>
  )
}

function LedgerTable({ soa, period }: { soa: Statement; period: Period }) {
  const { format: fmt } = useMoney()
  const { shortDate } = useDates()
  // Fixed widths keep columns aligned when several ledgers stack on one statement.
  return (
    <table className="w-full table-fixed">
      <colgroup>
        <col className="w-[17%]" />
        <col />
        <col className="w-[16%]" />
        <col className="w-[16%]" />
        <col className="w-[17%]" />
      </colgroup>
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
          <td className={`${num} font-medium text-zinc-900`}>{fmt(soa.opening)}</td>
        </tr>
        {soa.lines.map((l) => (
          <tr key={l.id} className="print:break-inside-avoid">
            <td className={`${cell} whitespace-nowrap tabular-nums`}>{shortDate(l.date)}</td>
            <td className={cell}>{l.note || (l.kind === 'in' ? 'Receipt' : 'Payment')}</td>
            <td className={num}>{l.kind === 'in' ? fmt(l.amount) : ''}</td>
            <td className={num}>{l.kind === 'out' ? fmt(l.amount) : ''}</td>
            <td className={`${num} ${neg(l.balance)}`}>{fmt(l.balance)}</td>
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
          <td className={num}>{fmt(soa.receipts)}</td>
          <td className={num}>{fmt(soa.payments)}</td>
          <td className={`${num} ${neg(soa.closing)}`}>{fmt(soa.closing)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

const Missing = () => (
  <div className="grid place-items-center gap-3 py-24 text-center">
    <p className="font-medium">This client doesn’t exist any more.</p>
    <a href="#clients" className={btn.primary}>Back to clients</a>
  </div>
)

export function StatementPage({ id }: { id: string }) {
  const { data: client, isPending, error } = useClient(id)
  if (isPending) {
    return (
      <div role="status" aria-label="Loading statement" className="grid gap-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-16 w-full max-w-md" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <span className="sr-only">Loading…</span>
      </div>
    )
  }
  if (error) return <LoadError error={error} what="this client" />
  if (!client) return <Missing />

  return <StatementLoaded client={client} />
}

function StatementLoaded({ client }: { client: Client }) {
  const [period, setPeriod] = useState<Period>(() => periodPresets(client.createdAt)[1].period)
  const balancesQ = useBalances({ from: period.from, to: period.to, clientId: client.id })
  const linesQ = useLedger({ from: period.from, to: period.to, clientId: client.id })
  // Previous data is kept while refetching; never present it as the new period's or client's figures.
  const ready = !!balancesQ.data && !!linesQ.data && !balancesQ.isPlaceholderData && !linesQ.isPlaceholderData && !balancesQ.error && !linesQ.error
  return (
    <StatementLayout
      back={{ href: `#clients/${client.id}`, label: client.name }}
      title="Statement of account"
      firstDate={client.createdAt}
      fileName={(p) => `Statement of Account - ${client.name} - ${p.from} to ${p.to}`}
      period={period}
      setPeriod={setPeriod}
      ready={ready}
    >
      <StatementBody client={client} period={period} balancesQ={balancesQ} linesQ={linesQ} ready={ready} />
    </StatementLayout>
  )
}

type BalancesQ = ReturnType<typeof useBalances>
type LinesQ = ReturnType<typeof useLedger>

function StatementBody({ client, period, balancesQ, linesQ, ready }: { client: Client; period: Period; balancesQ: BalancesQ; linesQ: LinesQ; ready: boolean }) {
  const { format: fmt } = useMoney()
  const { longDate } = useDates()
  const { data: balances } = balancesQ
  const { data: lines } = linesQ
  const error = balancesQ.error ?? linesQ.error
  const qc = useQueryClient()
  if (error) {
    return (
      <div role="alert" className="grid justify-items-start gap-2 py-6">
        <p className="font-medium text-red-700">We couldn’t load this statement.</p>
        <p className="text-zinc-600">{error.message}</p>
        <button type="button" className="rounded-lg border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-50" onClick={() => qc.invalidateQueries()}>Try again</button>
      </div>
    )
  }
  if (!ready || !balances || !lines) {
    return (
      <div role="status" aria-label="Preparing statement" className="grid animate-pulse gap-4 py-2">
        <div className="h-24 rounded-md bg-zinc-100" /><div className="h-16 rounded-md bg-zinc-100" /><div className="h-40 rounded-md bg-zinc-100" />
        <span className="text-sm text-zinc-500">Preparing statement…</span>
      </div>
    )
  }
  const soa = toStatement(balances[0], lines)
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
            <LedgerTable soa={soa} period={period} />
            <DocFooter>
              <p>
                {soa.closing < 0
                  ? `This account is in a debit balance of ${fmt(-soa.closing)}. Please arrange settlement at your earliest convenience.`
                  : `We hold ${fmt(soa.closing)} in client funds on your behalf as at ${longDate(period.to)}.`}
              </p>
            </DocFooter>
          </>
  )
}

type ConsolidatedStatementProps = {
  period: Period
  summary: Statement
  groups: Array<{
    key: string
    label: string
    rows: StatementLine[]
    receipts: number
    payments: number
    closing?: number
  }>
  txnVisible: Column<any>[]
  balanceVisible: Column<any>[]
  filterNote: string[]
  mode: 'none' | 'client' | 'month'
  view: 'transactions' | 'balances'
  rows: StatementLine[] | any[]
  columns: Column<any>[]
  txnFooterText: Record<string, string>
  balanceFooterText: Record<string, string>
}

export function ConsolidatedStatement({
  period,
  summary,
  groups,
  txnVisible,
  balanceVisible,
  filterNote,
  mode,
  view,
  rows,
  columns,
  txnFooterText,
  balanceFooterText,
}: ConsolidatedStatementProps) {
  const { longDate } = useDates()

  const visibleColumns = view === 'transactions' ? txnVisible : balanceVisible
  const footerRecord = view === 'transactions' ? txnFooterText : balanceFooterText

  const soa = buildConsolidatedStatement({
    view,
    groups,
    rows,
    columns,
    visibleColumns,
    footer: footerRecord,
    filterNote,
    mode,
  })

  return (
    <>
      <DocHeader
        title="Statement of Account"
        subtitle="Consolidated client account statement"
        meta={[['Clients', String(soa.clientCount)]]}
      />
      <section className="grid grid-cols-2 gap-6 py-6">
        <div>
          <Label>Statement period</Label>
          <p className="font-semibold">{longDate(period.from)} – {longDate(period.to)}</p>
        </div>
        <div>
          <Label>Prepared from</Label>
          <p className="font-semibold text-sm">{soa.preparedFrom}</p>
        </div>
      </section>
      <Summary {...summary} />
      {view === 'transactions' ? (
        <>
          {soa.sections.map((section, i) => (
            <table key={i} className="mb-8 w-full table-fixed print:break-inside-avoid">
              <colgroup>
                {visibleColumns.map((c) => (
                  <col key={c.id} style={{ width: c.flex ? undefined : '150px' }} />
                ))}
              </colgroup>
              {section.heading && (
                <thead>
                  <tr className="border-y border-zinc-300 bg-zinc-50 text-left text-xs text-zinc-600 font-semibold">
                    <th className={`${cell} font-medium`} colSpan={visibleColumns.length}>
                      {section.heading}
                    </th>
                  </tr>
                </thead>
              )}
              <thead>
                <tr className="border-y border-zinc-300 bg-zinc-50 text-left text-xs text-zinc-600">
                  {visibleColumns.map((c) => (
                    <th
                      key={c.id}
                      className={`${cell} font-medium ${c.align === 'right' ? 'text-right' : ''}`}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {section.rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="print:break-inside-avoid">
                    {row.map((cellContent, cellIdx) => {
                      const col = visibleColumns[cellIdx]
                      return (
                        <td
                          key={cellIdx}
                          className={`${cell} ${col?.align === 'right' ? 'text-right tabular-nums' : ''}`}
                        >
                          {cellContent}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
              {section.subtotal && (
                <tfoot>
                  <tr className="border-t border-zinc-300 font-semibold text-zinc-900">
                    {visibleColumns.map((c, idx) => (
                      <td
                        key={c.id}
                        className={`${cell} ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${idx === 0 ? 'text-left' : ''}`}
                      >
                        {idx === 0 ? 'Subtotal' : section.subtotal?.[c.id] ?? ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          ))}
          <table className="w-full table-fixed print:break-inside-avoid">
            <tbody>
              <tr className="border-t-2 border-zinc-900 font-semibold text-zinc-900">
                {visibleColumns.map((c, idx) => (
                  <td
                    key={c.id}
                    className={`${cell} ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${idx === 0 ? 'text-left' : ''}`}
                  >
                    {idx === 0 ? 'Total' : soa.total[c.id] ?? ''}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </>
      ) : (
        <table className="w-full table-fixed">
          <colgroup>
            {visibleColumns.map((c) => (
              <col key={c.id} style={{ width: c.flex ? undefined : '150px' }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-y border-zinc-300 bg-zinc-50 text-left text-xs text-zinc-600">
              {visibleColumns.map((c) => (
                <th
                  key={c.id}
                  className={`${cell} font-medium ${c.align === 'right' ? 'text-right' : ''}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {soa.sections[0]?.rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="print:break-inside-avoid">
                {row.map((cellContent, cellIdx) => {
                  const col = visibleColumns[cellIdx]
                  return (
                    <td
                      key={cellIdx}
                      className={`${cell} ${col?.align === 'right' ? 'text-right tabular-nums' : ''}`}
                    >
                      {cellContent}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-900 font-semibold text-zinc-900">
              {visibleColumns.map((c, idx) => (
                <td
                  key={c.id}
                  className={`${cell} ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${idx === 0 ? 'text-left' : ''}`}
                >
                  {idx === 0 ? 'Total' : soa.total[c.id] ?? ''}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      )}
      <DocFooter>
        <p>This statement lists the client-account entries shown on screen when it was prepared.</p>
      </DocFooter>
    </>
  )
}
