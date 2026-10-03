import { useEffect, useState, type ReactNode } from 'react'
import { toStatement } from './data/mappers'
import { useMoney } from './data/money'
import { useBalances, useBankAccounts, useClient, useLedger, useLogoUrl } from './data/queries'
import { useSession } from './data/session'
import { accountNo, periodPresets, today, type Client, type Period, type Statement } from './ledger'
import { formatDate } from './settings/store'
import { btn, Icon, PeriodPicker } from './ui'

const longDate = (date: string) => formatDate(date, true)
const shortDate = (date: string) => formatDate(date)

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
  const [period, setPeriod] = useState<Period>(() => periodPresets(firstDate)[1].period)
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
          <PeriodPicker period={period} onChange={setPeriod} firstDate={firstDate} />
          <p className="text-sm text-zinc-500">
            Issuer, registration, bank and footer details come from <a href="#settings" className="font-medium underline">Settings</a>.
          </p>
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
  const { firm: o } = useSession()
  const logo = useLogoUrl(o.logoPath)
  const address = [o.address1, o.address2, [o.postcode, o.city].filter(Boolean).join(' '), o.state !== o.city ? o.state : '', o.country !== 'Malaysia' ? o.country : ''].filter(Boolean)
  const reg = o.showRegistrationOnStatement ? [o.registrationNo && `Reg. no. ${o.registrationNo}`, o.sstNo && `SST no. ${o.sstNo}`].filter(Boolean) : []
  return (
    <header className="flex items-start justify-between gap-6 border-b-2 border-zinc-900 pb-5">
      <div className="flex gap-3">
        {logo && <img src={logo} alt="" className="max-h-14 max-w-32 shrink-0 object-contain" />}
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
          {[['Statement date', longDate(today())], ...meta, ['Currency', o.currency]].map(([k, v]) => (
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
  if (isPending) return <p className="py-24 text-center text-sm text-zinc-500">Loading…</p>
  if (error) return <p role="alert">{error.message}</p>
  if (!client) return <Missing />

  return (
    <StatementLayout
      back={{ href: `#clients/${client.id}`, label: client.name }}
      title="Statement of account"
      firstDate={client.createdAt}
      fileName={(p) => `Statement of Account - ${client.name} - ${p.from} to ${p.to}`}
    >
      {(period) => (
        <StatementBody client={client} period={period} />
      )}
    </StatementLayout>
  )
}

function StatementBody({ client, period }: { client: Client; period: Period }) {
  const { format: fmt } = useMoney()
  const { data: balances, error: balancesError } = useBalances({ from: period.from, to: period.to, clientId: client.id })
  const { data: lines, error: linesError } = useLedger({ from: period.from, to: period.to, clientId: client.id })
  const error = balancesError ?? linesError
  if (error) return <p role="alert">{error.message}</p>
  if (!balances || !lines) return <p className="text-zinc-500">Loading…</p>
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
