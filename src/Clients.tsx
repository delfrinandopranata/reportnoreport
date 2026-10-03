import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { formatMoney, totals, totalsByClient } from './ledger'
import { useStore } from './store'
import { Avatar, btn, Dialog, Field, Icon, input, KindBadge, TxnForm } from './ui'
import { CashflowChart, Empty } from './widgets'

function AddClient({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addClient = useStore((s) => s.addClient)
  const [error, setError] = useState('')
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const value = (k: string) => String(data.get(k)).trim()
    if (!value('name')) return setError('Enter the client name.')
    if (value('email') && !/^\S+@\S+\.\S+$/.test(value('email'))) return setError('Enter a valid email address.')
    addClient({ name: value('name'), contact: value('contact'), email: value('email') })
    setError('')
    onClose()
  }
  return (
    <Dialog open={open} onClose={onClose} title="Add client">
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Field label="Client name">
          <input name="name" autoFocus placeholder="e.g. Harbourline Logistics Pte Ltd" className={input} />
        </Field>
        <Field label="Primary contact">
          <input name="contact" placeholder="Optional" className={input} />
        </Field>
        <Field label="Email">
          <input name="email" type="email" placeholder="Optional" className={input} />
        </Field>
        {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btn.ghost} onClick={onClose}>Cancel</button>
          <button className={btn.primary}>Add client</button>
        </div>
      </form>
    </Dialog>
  )
}

const card = 'rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900'
const shortDate = (date: string) => new Date(`${date}T00:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })

export function ClientProfile({ id, actions }: { id: string; actions: ReactNode }) {
  const client = useStore((s) => s.clients.find((c) => c.id === id))
  const txns = useStore((s) => s.txns)
  const removeTxn = useStore((s) => s.removeTxn)
  const removeClient = useStore((s) => s.removeClient)
  const own = useMemo(() => txns.filter((t) => t.clientId === id), [txns, id])
  // Running balance is computed oldest-first, then shown newest-first.
  const ledger = useMemo(() => {
    let balance = 0
    return [...own]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => ({ ...t, balance: (balance += t.kind === 'in' ? t.amount : -t.amount) }))
      .reverse()
  }, [own])
  const sum = totals(own)

  if (!client) {
    return (
      <div className="grid place-items-center gap-3 py-24 text-center">
        <p className="font-medium">This client doesn’t exist any more.</p>
        <div className="flex items-center gap-2">
          {actions}
          <a href="#clients" className={btn.primary}>Back to clients</a>
        </div>
      </div>
    )
  }

  const onDelete = () => {
    if (confirm(`Delete ${client.name} and its ${own.length} ledger entries? You can undo this.`)) {
      removeClient(client.id)
      location.hash = 'clients'
    }
  }

  const stats = [
    { label: 'Client balance', value: formatMoney(sum.net), negative: sum.net < 0 },
    { label: 'Total receipts', value: formatMoney(sum.in) },
    { label: 'Total payments', value: formatMoney(sum.out) },
    { label: 'Transactions', value: String(sum.count), sub: ledger[0] ? `Last posted ${shortDate(ledger[0].date)}` : 'None posted' },
  ]

  return (
    <div className="grid grid-cols-1 gap-6">
      <a href="#clients" className="inline-flex items-center gap-1 justify-self-start text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
        <Icon name="back" /> Clients
      </a>

      <header className="flex flex-wrap items-center gap-4">
        <Avatar name={client.name} size="size-14 text-base" />
        <div className="mr-auto max-w-full min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{client.name}</h1>
          <p className="truncate text-sm text-zinc-500">
            {[client.contact, client.email, `Client since ${shortDate(client.createdAt)}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        {actions}
        <button type="button" className={btn.danger} onClick={onDelete}>
          <Icon name="trash" /> Delete
        </button>
      </header>

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={card}>
            <dt className="text-sm text-zinc-500">{s.label}</dt>
            <dd className={`mt-2 text-lg font-semibold sm:text-2xl tracking-tight tabular-nums ${s.negative ? 'text-red-600 dark:text-red-400' : ''}`}>{s.value}</dd>
            {s.sub && <dd className="mt-1 text-sm text-zinc-500">{s.sub}</dd>}
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 grid-cols-1 gap-6 lg:col-span-2">
          <section className={card}>
            <h2 className="mb-4 text-sm font-medium text-zinc-500">Cash flow</h2>
            <CashflowChart txns={own} />
          </section>

          <section className={`${card} min-w-0 p-0`}>
            <h2 className="px-5 pt-5 pb-3 text-sm font-medium text-zinc-500">
              Client ledger <span className="text-zinc-400">· {own.length}</span>
            </h2>
            {ledger.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-y border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800">
                      <th className="px-5 py-2.5 font-medium">Date</th>
                      <th className="px-5 py-2.5 font-medium">Description</th>
                      <th className="px-5 py-2.5 text-right font-medium">Receipts</th>
                      <th className="px-5 py-2.5 text-right font-medium">Payments</th>
                      <th className="px-5 py-2.5 text-right font-medium">Balance</th>
                      <th className="w-10" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {ledger.map((t) => (
                      <tr key={t.id} className="group">
                        <td className="px-5 py-3 whitespace-nowrap text-zinc-500 tabular-nums">{shortDate(t.date)}</td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className="flex items-center gap-2.5">
                            <KindBadge kind={t.kind} />
                            {t.note || (t.kind === 'in' ? 'Receipt' : 'Payment')}
                          </span>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-right text-in tabular-nums">{t.kind === 'in' ? formatMoney(t.amount) : ''}</td>
                        <td className="px-5 py-3 whitespace-nowrap text-right tabular-nums">{t.kind === 'out' ? formatMoney(t.amount) : ''}</td>
                        <td className={`px-5 py-3 whitespace-nowrap text-right font-medium tabular-nums ${t.balance < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{formatMoney(t.balance)}</td>
                        <td className="pr-3">
                          <button
                            type="button"
                            onClick={() => removeTxn(t.id)}
                            className="rounded p-1 text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:text-red-600 focus:opacity-100"
                            aria-label={`Delete ledger entry ${t.note || (t.kind === 'in' ? 'Receipt' : 'Payment')}, ${shortDate(t.date)}`}
                          >
                            <Icon name="trash" className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-5 pb-5"><Empty text="No transactions posted to this ledger yet." /></div>
            )}
          </section>
        </div>

        <section className={`${card} lg:sticky lg:top-6`}>
          <h2 className="mb-4 text-sm font-medium text-zinc-500">Record transaction</h2>
          <TxnForm clientId={client.id} />
        </section>
      </div>
    </div>
  )
}

export function Clients() {
  const clients = useStore((s) => s.clients)
  const txns = useStore((s) => s.txns)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)

  const rows = useMemo(() => {
    const byClient = totalsByClient(txns)
    const last = new Map<string, string>()
    for (const t of txns) if ((last.get(t.clientId) ?? '') < t.date) last.set(t.clientId, t.date)
    const q = query.trim().toLowerCase()
    return clients
      .filter((c) => !q || `${c.name} ${c.contact} ${c.email}`.toLowerCase().includes(q))
      .map((c) => ({ ...c, sum: byClient.get(c.id) ?? { in: 0, out: 0, net: 0, count: 0 }, last: last.get(c.id) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [clients, txns, query])

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search clients" className={`${input} pl-9`} aria-label="Search clients" />
        </div>
        <button type="button" className={`${btn.primary} sm:ml-auto`} onClick={() => setAdding(true)}>
          <Icon name="plus" /> Add client
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800">
              <th className="px-5 py-3 font-medium">Client</th>
              <th className="px-5 py-3 text-right font-medium">Receipts</th>
              <th className="px-5 py-3 text-right font-medium">Payments</th>
              <th className="px-5 py-3 text-right font-medium">Balance</th>
              <th className="px-5 py-3 text-right font-medium">Last transaction</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((r) => (
              <tr key={r.id} className="cursor-pointer transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50" onClick={() => (location.hash = `clients/${r.id}`)}>
                <td className="px-5 py-3">
                  <a href={`#clients/${r.id}`} className="flex items-center gap-3 outline-none" onClick={(e) => e.stopPropagation()}>
                    <Avatar name={r.name} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.name}</span>
                      <span className="block truncate text-xs text-zinc-500">{r.contact || r.email || '—'}</span>
                    </span>
                  </a>
                </td>
                <td className="px-5 py-3 whitespace-nowrap text-right text-in tabular-nums">{formatMoney(r.sum.in)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{formatMoney(r.sum.out)}</td>
                <td className={`px-5 py-3 text-right font-semibold tabular-nums ${r.sum.net < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{formatMoney(r.sum.net)}</td>
                <td className="px-5 py-3 text-right text-zinc-500 tabular-nums">
                  {r.last ? new Date(`${r.last}T00:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="p-6"><Empty text={query ? 'No clients match your search.' : 'No clients yet. Add a client to open their ledger.'} /></div>}
      </div>

      <AddClient open={adding} onClose={() => setAdding(false)} />
    </>
  )
}
