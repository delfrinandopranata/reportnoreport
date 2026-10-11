import { useState, useId } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Avatar, Icon, field, Field } from '../ui'
import { callAdmin } from './api'
import { makeMoney } from '../ledger'
import { today, type Period } from '../ledger'
import { formatDate } from '../settings/constants'

type SupportClient = { id: string; name: string }
type SupportBalance = {
  client_id: string
  client_name: string
  opening: number
  receipts: number
  payments: number
  closing: number
  txn_count: number
  last_txn_date: string | null
}
type SupportLedgerLine = {
  id: string
  date: string
  client_id: string
  client_name: string
  kind: 'receipt' | 'payment'
  amount_minor: number
  description: string
}

const getDateString = (daysAgo: number) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toLocaleDateString('en-CA')
}

export function SupportView({ firmId, firmName, currency }: { firmId: string; firmName: string; currency: string }) {
  const [tab, setTab] = useState<'clients' | 'balances' | 'ledger'>('clients')
  const [period, setPeriod] = useState<Period>({ from: getDateString(30), to: today() })
  const tabId = useId()

  const money = makeMoney(currency)

  const clients = useQuery({
    queryKey: ['admin', 'support', firmId, 'clients'],
    queryFn: async () => {
      const result = await callAdmin('support', { firmId, view: 'clients' })
      return result as { clients?: SupportClient[] }
    },
  })

  const balances = useQuery({
    queryKey: ['admin', 'support', firmId, 'balances', period],
    queryFn: async () => {
      const result = await callAdmin('support', {
        firmId,
        view: 'balances',
        from: period.from,
        to: period.to,
      })
      return result as { balances?: SupportBalance[] }
    },
  })

  const ledger = useQuery({
    queryKey: ['admin', 'support', firmId, 'ledger', period],
    queryFn: async () => {
      const result = await callAdmin('support', {
        firmId,
        view: 'ledger',
        from: period.from,
        to: period.to,
      })
      return result as { ledger?: SupportLedgerLine[] }
    },
  })

  const loadFailed = (what: string) => (
    <div className="p-4"><div className="rnr-note" data-tone="down" role="alert"><Icon name="alert" className="size-5" /><div>Failed to load {what}</div></div></div>
  )
  const loading = (what: string) => <p className="p-4 text-center text-ink-2" role="status">Loading {what}…</p>
  const none = (what: string) => <p className="p-4 text-center text-ink-2">{what}</p>

  return (
    <div className="grid gap-6">
      <div className="rnr-note rnr-note--bar" data-tone="info" role="status">
        <Icon name="info" className="size-5" />
        <div>You are viewing {firmName} in read-only support view. Access is logged.</div>
      </div>

      <div className="rnr-card">
        <div className="flex items-center gap-3">
          <Avatar name={firmName} size="size-8" />
          <div className="min-w-0 flex-1">
            <h2 className="rnr-heading truncate text-xl">{firmName}</h2>
            <p className="rnr-caption">Firm ID: {firmId.slice(0, 8)}…</p>
          </div>
        </div>

        <div className="rnr-tabs mt-4" role="tablist">
          {(['clients', 'balances', 'ledger'] as const).map((t) => (
            <button
              key={t}
              type="button"
              id={`${tabId}-${t}`}
              role="tab"
              className="rnr-tab"
              aria-selected={tab === t}
              aria-controls={`${tabId}-panel-${t}`}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'clients' && (
        <div id={`${tabId}-panel-clients`} role="tabpanel" aria-labelledby={`${tabId}-clients`} className="rnr-card">
          {clients.isPending && loading('clients')}
          {clients.isError && loadFailed('clients')}
          {!clients.isPending && !clients.isError && (!clients.data?.clients || clients.data.clients.length === 0) && none('No clients')}
          {clients.data?.clients && clients.data.clients.length > 0 && (
            <ul className="m-0 grid list-none gap-2 p-0">
              {clients.data.clients.map((c) => (
                <li key={c.id} className="flex items-center gap-3 rounded-(--r-ctl) bg-soft p-3">
                  <Avatar name={c.name} size="size-6" />
                  <span className="font-medium">{c.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'balances' && (
        <div id={`${tabId}-panel-balances`} role="tabpanel" aria-labelledby={`${tabId}-balances`} className="grid gap-4">
          <div className="rnr-card">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="From">
                <input
                  type="date"
                  value={period.from}
                  max={period.to}
                  onChange={(e) => setPeriod({ ...period, from: e.target.value })}
                  className={field}
                />
              </Field>
              <Field label="To">
                <input
                  type="date"
                  value={period.to}
                  min={period.from}
                  max={today()}
                  onChange={(e) => setPeriod({ ...period, to: e.target.value })}
                  className={field}
                />
              </Field>
            </div>
          </div>

          <div className="rnr-card rnr-table-card">
            {balances.isPending && loading('balances')}
            {balances.isError && loadFailed('balances')}
            {!balances.isPending && !balances.isError && (!balances.data?.balances || balances.data.balances.length === 0) && none('No balances in this period')}
            {balances.data?.balances && balances.data.balances.length > 0 && (
              <table className="rnr-ledger">
                <caption className="rnr-sr-only">Client balances</caption>
                <thead>
                  <tr>
                    <th scope="col">Client</th>
                    <th scope="col" className="num">Opening</th>
                    <th scope="col" className="num" data-series="in"><Icon name="in" />Receipts</th>
                    <th scope="col" className="num" data-series="out"><Icon name="out" />Payments</th>
                    <th scope="col" className="num">Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.data.balances.map((b) => (
                    <tr key={b.client_id}>
                      <th scope="row">{b.client_name}</th>
                      <td className="num">{money.format(b.opening)}</td>
                      <td className="num" data-series="in">{money.format(b.receipts)}</td>
                      <td className="num" data-series="out">{money.format(b.payments)}</td>
                      <td className="num bal">{money.format(b.closing)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'ledger' && (
        <div id={`${tabId}-panel-ledger`} role="tabpanel" aria-labelledby={`${tabId}-ledger`} className="grid gap-4">
          <div className="rnr-card">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="From">
                <input
                  type="date"
                  value={period.from}
                  max={period.to}
                  onChange={(e) => setPeriod({ ...period, from: e.target.value })}
                  className={field}
                />
              </Field>
              <Field label="To">
                <input
                  type="date"
                  value={period.to}
                  min={period.from}
                  max={today()}
                  onChange={(e) => setPeriod({ ...period, to: e.target.value })}
                  className={field}
                />
              </Field>
            </div>
          </div>

          <div className="rnr-card rnr-table-card">
            {ledger.isPending && loading('ledger')}
            {ledger.isError && loadFailed('ledger')}
            {!ledger.isPending && !ledger.isError && (!ledger.data?.ledger || ledger.data.ledger.length === 0) && none('No transactions in this period')}
            {ledger.data?.ledger && ledger.data.ledger.length > 0 && (
              <table className="rnr-ledger">
                <caption className="rnr-sr-only">Ledger</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Client</th>
                    <th scope="col">Kind</th>
                    <th scope="col" className="num">Amount</th>
                    <th scope="col">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.data.ledger.map((line) => (
                    <tr key={line.id}>
                      <td>{formatDate(line.date, 'text')}</td>
                      <th scope="row">{line.client_name}</th>
                      <td>
                        <span className="rnr-amt-dir" data-dir={line.kind === 'receipt' ? 'in' : 'out'}>
                          <Icon name={line.kind === 'receipt' ? 'in' : 'out'} />
                          {line.kind === 'receipt' ? 'Receipt' : 'Payment'}
                        </span>
                      </td>
                      <td className="num" data-series={line.kind === 'receipt' ? 'in' : 'out'}>{money.format(line.amount_minor)}</td>
                      <td>{line.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
