import { useQueryClient } from '@tanstack/react-query'
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { toStatement } from './data/mappers'
import { useMoney } from './data/money'
import { useBalances, useBankAccounts, useClient, useFirstTxnDate, useLedger, useLogoUrl } from './data/queries'
import { useSession } from './data/session'
import { accountNo, periodPresets, today, type Client, type Period, type Statement } from './ledger'
import { formatDate } from './settings/constants'
import { LoadError, Skeleton } from './clients/shared'
import type { StatementSection } from './clients/consolidatedStatement'
import { btn, Icon, PeriodPicker } from './ui'
import type { Column } from './table'

function useDates() {
  const { dateFormat } = useSession().firm
  return { longDate: (date: string) => formatDate(date, dateFormat, true), shortDate: (date: string) => formatDate(date, dateFormat) }
}

/** Sheet figures: a negative balance is data-neg (--sheet-down) as well as carrying its minus sign. */
const neg = (value: number) => (value < 0 ? true : undefined)

/** Period controls, issuer, print button and the A4 paper wrapper shared by every statement. */
export function StatementLayout({
  back,
  title,
  firstDate,
  fileName,
  period,
  setPeriod,
  ready,
  landscape = false,
  children,
}: {
  back: { href: string; label: string; onClick?: () => void }
  title: string
  firstDate: string
  fileName: (period: Period) => string
  period: Period
  setPeriod: (period: Period) => void
  ready: boolean
  /** Wide ledgers (more columns than the single-client statement) print A4 landscape. */
  landscape?: boolean
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
    <div className={`grid grid-cols-1 gap-6 ${landscape ? 'rnr-wide print-landscape' : ''}`} data-tour="statement">
      <div className="rnr-no-print grid gap-4">
        <a href={back.href} onClick={back.onClick ? (e) => { e.preventDefault(); back.onClick?.() } : undefined} className="rnr-crumb justify-self-start">
          <Icon name="back" /> {back.label}
        </a>
        <header className="rnr-page-head">
          <div>
            <h1 className="rnr-page-title">{title}</h1>
            <p className="rnr-lede">Choose the statement period, then print or save as PDF.</p>
          </div>
          <div className="rnr-page-actions">
            <button type="button" className={btn.primary} onClick={() => print()} disabled={invalid || !ready} aria-describedby={invalid ? 'period-error' : undefined}>
              <Icon name="printer" /> Print / Save PDF
            </button>
          </div>
        </header>

        <div className="rnr-card grid gap-4">
          <PeriodPicker period={period} onChange={setPeriod} firstDate={firstDate} />
          <p className="rnr-muted">
            Issuer, registration, bank and footer details come from <a href="#settings" className="rnr-link font-medium">Settings</a>.
          </p>
          {invalid && <p id="period-error" className="rnr-error" role="alert"><Icon name="alert" />The start date must be on or before the end date.</p>}
        </div>
      </div>

      {/* The document itself: ink on white in every theme and accent, so print and screen match. */}
      <div className="rnr-statement-frame">
        <article className="rnr-statement" data-orientation={landscape ? 'landscape' : undefined} aria-label={title}>{children}</article>
      </div>
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
    <header className="rnr-statement-head">
      <div className="flex gap-3">
        {logo && <img src={logo} alt={o.name} onError={(e) => (e.currentTarget.hidden = true)} className="rnr-statement-logo shrink-0" />}
        <div className="text-(--sheet-ink-2)">
          <p className="text-[11pt] font-semibold text-(--sheet-ink)">{o.name || 'Your business name'}</p>
          {o.tradingName && <p>Trading as {o.tradingName}</p>}
          {reg.length > 0 && <p>{reg.join(' · ')}</p>}
          {address.length > 0 && <p>{address.join(', ')}</p>}
          {(o.phone || o.email) && <p>{[o.phone, o.email].filter(Boolean).join(' · ')}</p>}
          <p className="text-(--sheet-ink-3)">{subtitle}</p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <h2 className="uppercase">{title}</h2>
        <dl className="rnr-statement-meta mt-2 mb-0 justify-end">
          {[['Statement date', longDate(today())], ...meta, ['Currency', o.currency.split(' ')[0]]].map(([k, v]) => (
            <Fragment key={k}>
              <dt>{k}</dt>
              <dd className="text-(--sheet-ink)">{v}</dd>
            </Fragment>
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
    <dl className="rnr-statement-summary">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd data-neg={neg(value)}>{fmt(value)}</dd>
        </div>
      ))}
    </dl>
  )
}

const Label = ({ children }: { children: ReactNode }) => <p className="mb-1 font-mono text-[7.5pt] tracking-wider text-(--sheet-ink-3) uppercase">{children}</p>

function DocFooter({ children }: { children: ReactNode }) {
  const { firm: o } = useSession()
  const { data: banks = [] } = useBankAccounts()
  const bank = banks.find((b) => b.isDefault)
  return (
    <footer className="rnr-statement-foot print:break-inside-avoid">
      {children}
      <p className="mt-1">{o.statementNote.replace('{days}', String(o.discrepancyDays))}</p>
      {bank?.accountNo && (
        <p className="mt-3">
          <span className="font-medium text-(--sheet-ink-2)">Settlement details:</span> {[bank.bankName, bank.accountName, bank.accountNo].filter(Boolean).join(' · ')}
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
    <table className="table-fixed">
      <caption className="rnr-sr-only">Statement of account</caption>
      <colgroup>
        <col className="w-[15%]" />
        <col />
        <col className="w-[19%]" />
        <col className="w-[19%]" />
        <col className="w-[19%]" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Description</th>
          <th scope="col" className="num">Receipts</th>
          <th scope="col" className="num">Payments</th>
          <th scope="col" className="num">Balance</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="whitespace-nowrap">{shortDate(period.from)}</td>
          <td className="italic" colSpan={3}>Balance brought forward</td>
          <td className="num font-medium" data-neg={neg(soa.opening)}>{fmt(soa.opening)}</td>
        </tr>
        {soa.lines.map((l) => (
          <tr key={l.id} className="print:break-inside-avoid">
            <td className="whitespace-nowrap">{shortDate(l.date)}</td>
            <td>{l.note || (l.kind === 'in' ? 'Receipt' : 'Payment')}</td>
            <td className="num">{l.kind === 'in' ? fmt(l.amount) : ''}</td>
            <td className="num">{l.kind === 'out' ? fmt(l.amount) : ''}</td>
            <td className="num" data-neg={neg(l.balance)}>{fmt(l.balance)}</td>
          </tr>
        ))}
        {!soa.lines.length && (
          <tr>
            <td colSpan={5}>No transactions in this period.</td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={2}>Closing balance as at {shortDate(period.to)}</td>
          <td className="num">{fmt(soa.receipts)}</td>
          <td className="num">{fmt(soa.payments)}</td>
          <td className="num" data-neg={neg(soa.closing)}>{fmt(soa.closing)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

const Missing = () => (
  <div className="rnr-empty">
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
        <Skeleton className="h-40 w-full" />
        <span className="sr-only">Loading…</span>
      </div>
    )
  }
  if (error) return <LoadError error={error} what="this client" />
  if (!client) return <Missing />

  return <StatementLoaded client={client} />
}

function StatementLoaded({ client }: { client: Client }) {
  const firstTxn = useFirstTxnDate(client.id).data
  const firstDate = firstTxn && firstTxn < client.createdAt ? firstTxn : client.createdAt
  const [period, setPeriod] = useState<Period>(() => periodPresets(client.createdAt)[1].period)
  const balancesQ = useBalances({ from: period.from, to: period.to, clientId: client.id })
  const linesQ = useLedger({ from: period.from, to: period.to, clientId: client.id })
  // Previous data is kept while refetching; never present it as the new period's or client's figures.
  const ready = !!balancesQ.data && !!linesQ.data && !balancesQ.isPlaceholderData && !linesQ.isPlaceholderData && !balancesQ.error && !linesQ.error
  return (
    <StatementLayout
      back={{ href: `#clients/${client.id}`, label: client.name }}
      title="Statement of account"
      firstDate={firstDate}
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
      <div role="alert" className="rnr-note" data-tone="down">
        <Icon name="alert" />
        <div className="grid justify-items-start gap-2">
          <p className="font-medium">We couldn’t load this statement.</p>
          <p>{error.message}</p>
          <button type="button" className={btn.secondary} onClick={() => qc.invalidateQueries()}>Try again</button>
        </div>
      </div>
    )
  }
  if (!ready || !balances || !lines) {
    return (
      <div role="status" aria-label="Preparing statement" className="grid gap-4 py-2">
        <Skeleton className="h-24 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-40 w-full" />
        <span>Preparing statement…</span>
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
                {client.email && <p className="text-(--sheet-ink-2)">{client.email}</p>}
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

type ConsolidatedStatementProps<R> = {
  period: Period
  summary: Statement
  columns: Column<R>[]
  sections: StatementSection<R>[]
  total: Record<string, ReactNode>
  preparedFrom: string
  clientCount: number
  rowKey: (row: R) => string
}

/** The Clients table as shown — same columns, groups and filters — laid out as a printable statement. */
export function ConsolidatedStatement<R>({ period, summary, columns, sections, total, preparedFrom, clientCount, rowKey }: ConsolidatedStatementProps<R>) {
  const { longDate } = useDates()
  const align = (c: Column<R>) => (c.align === 'right' ? 'num' : undefined)
  const totalRow = (label: string, values: Record<string, ReactNode>, className: string) => (
    <tr className={className}>
      {columns.map((c, i) => (
        <td key={c.id} className={align(c)}>{i === 0 ? label : values[c.id] ?? ''}</td>
      ))}
    </tr>
  )
  return (
    <>
      <DocHeader title="Statement of Account" subtitle="Consolidated client account statement" meta={[['Clients', String(clientCount)]]} />
      <section className="grid grid-cols-2 gap-6 py-6">
        <div>
          <Label>Statement period</Label>
          <p className="font-semibold">{longDate(period.from)} – {longDate(period.to)}</p>
        </div>
        <div>
          <Label>Prepared from</Label>
          <p className="font-semibold">{preparedFrom}</p>
        </div>
      </section>
      <Summary {...summary} />
      {/* Cells use the table's own renderers so the statement matches the screen; nothing in it is clickable. */}
      <table className="pointer-events-none">
        <caption className="rnr-sr-only">Consolidated statement</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.id} scope="col" className={align(c)}>{c.label}</th>
            ))}
          </tr>
        </thead>
        {sections.map((s) => (
          <tbody key={s.key}>
            {s.heading && (
              <tr className="print:break-after-avoid">
                <td colSpan={columns.length} className="pt-5 font-semibold">{s.heading}</td>
              </tr>
            )}
            {s.rows.map((r) => (
              <tr key={rowKey(r)} className="print:break-inside-avoid">
                {columns.map((c) => (
                  <td key={c.id} className={align(c)}>{c.cell(r)}</td>
                ))}
              </tr>
            ))}
            {s.subtotal && totalRow(`Subtotal – ${s.heading}`, s.subtotal, 'font-medium')}
          </tbody>
        ))}
        <tfoot>{totalRow('Total', total, '')}</tfoot>
      </table>
      <DocFooter>
        <p>This statement lists the client-account entries shown on screen when it was prepared.</p>
      </DocFooter>
    </>
  )
}
