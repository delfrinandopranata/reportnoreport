import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Avatar, Icon, field } from '../ui'
import { callAdmin } from './api'
import { makeMoney } from '../ledger'
import { today, type Period } from '../ledger'
import { formatDate } from '../settings/constants'

type SupportClient = { client_id: string; name: string }
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

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <strong>Support view</strong> — read-only. Access is logged.
        </div>

        <div className="mb-4 flex items-center gap-3">
          <Avatar name={firmName} size="size-8" />
          <div>
            <h2 className="font-semibold">{firmName}</h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">ID: {firmId.slice(0, 8)}…</p>
          </div>
        </div>

        <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
          {(['clients', 'balances', 'ledger'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium transition ${
                tab === t
                  ? 'border-b-2 border-zinc-900 text-zinc-900 dark:border-white dark:text-white'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'clients' && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          {clients.isPending && <div className="text-sm text-zinc-600 dark:text-zinc-400">Loading clients...</div>}
          {clients.isError && <div className="text-sm text-red-600 dark:text-red-400">Failed to load clients</div>}
          {!clients.isPending && !clients.isError && (!clients.data?.clients || clients.data.clients.length === 0) && (
            <div className="text-sm text-zinc-600 dark:text-zinc-400">No clients</div>
          )}
          {clients.data?.clients && clients.data.clients.length > 0 && (
            <div className="space-y-2">
              {clients.data.clients.map((c) => (
                <div key={c.client_id} className="flex items-center gap-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
                  <Avatar name={c.name} size="size-6" />
                  <span className="text-sm font-medium">{c.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'balances' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm font-medium">From:</label>
              <input
                type="date"
                value={period.from}
                max={period.to}
                onChange={(e) => setPeriod({ ...period, from: e.target.value })}
                className={`${field} py-1.5`}
              />
              <label className="text-sm font-medium">To:</label>
              <input
                type="date"
                value={period.to}
                min={period.from}
                max={today()}
                onChange={(e) => setPeriod({ ...period, to: e.target.value })}
                className={`${field} py-1.5`}
              />
            </div>
          </div>

          {/* Balances cards */}
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            {balances.isPending && <div className="text-sm text-zinc-600 dark:text-zinc-400">Loading balances...</div>}
            {balances.isError && <div className="text-sm text-red-600 dark:text-red-400">Failed to load balances</div>}
            {!balances.isPending && !balances.isError && (!balances.data?.balances || balances.data.balances.length === 0) && (
              <div className="text-sm text-zinc-600 dark:text-zinc-400">No balances in this period</div>
            )}
            {balances.data?.balances && balances.data.balances.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800">
                      <th className="px-4 py-2 text-left font-medium">Client</th>
                      <th className="px-4 py-2 text-right font-medium">Opening</th>
                      <th className="px-4 py-2 text-right font-medium">Receipts</th>
                      <th className="px-4 py-2 text-right font-medium">Payments</th>
                      <th className="px-4 py-2 text-right font-medium">Closing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.data.balances.map((b) => (
                      <tr key={b.client_id} className="border-b border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800">
                        <td className="px-4 py-2 text-sm font-medium">{b.client_name}</td>
                        <td className="px-4 py-2 text-right font-mono text-sm">{money.format(b.opening)}</td>
                        <td className="px-4 py-2 text-right font-mono text-sm text-green-600 dark:text-green-400">{money.format(b.receipts)}</td>
                        <td className="px-4 py-2 text-right font-mono text-sm text-red-600 dark:text-red-400">{money.format(b.payments)}</td>
                        <td className="px-4 py-2 text-right font-mono text-sm font-medium">{money.format(b.closing)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'ledger' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm font-medium">From:</label>
              <input
                type="date"
                value={period.from}
                max={period.to}
                onChange={(e) => setPeriod({ ...period, from: e.target.value })}
                className={`${field} py-1.5`}
              />
              <label className="text-sm font-medium">To:</label>
              <input
                type="date"
                value={period.to}
                min={period.from}
                max={today()}
                onChange={(e) => setPeriod({ ...period, to: e.target.value })}
                className={`${field} py-1.5`}
              />
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            {ledger.isPending && <div className="p-4 text-sm text-zinc-600 dark:text-zinc-400">Loading ledger...</div>}
            {ledger.isError && <div className="p-4 text-sm text-red-600 dark:text-red-400">Failed to load ledger</div>}
            {!ledger.isPending && !ledger.isError && (!ledger.data?.ledger || ledger.data.ledger.length === 0) && (
              <div className="p-4 text-sm text-zinc-600 dark:text-zinc-400">No transactions in this period</div>
            )}
            {ledger.data?.ledger && ledger.data.ledger.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800">
                      <th className="px-4 py-2 text-left font-medium">Date</th>
                      <th className="px-4 py-2 text-left font-medium">Client</th>
                      <th className="px-4 py-2 text-left font-medium">Kind</th>
                      <th className="px-4 py-2 text-right font-medium">Amount</th>
                      <th className="px-4 py-2 text-left font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.data.ledger.map((line) => (
                      <tr key={line.id} className="border-b border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800">
                        <td className="px-4 py-2 text-xs text-zinc-600 dark:text-zinc-400">{formatDate(line.date, 'text')}</td>
                        <td className="px-4 py-2 text-sm font-medium">{line.client_name}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-flex gap-1 items-center text-xs font-medium ${
                              line.kind === 'receipt' ? 'text-in' : 'text-out'
                            }`}
                          >
                            <Icon name={line.kind === 'receipt' ? 'in' : 'out'} className="size-3" />
                            {line.kind === 'receipt' ? 'Receipt' : 'Payment'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-sm">{money.format(line.amount_minor)}</td>
                        <td className="px-4 py-2 text-xs text-zinc-600 dark:text-zinc-400">{line.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
