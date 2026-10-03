import { useMemo, useState, type FormEvent } from 'react'
import { byDateDesc, formatMoney, totals, totalsByClient, type Client } from './ledger'
import { useStore } from './store'
import { Avatar, btn, Dialog, Field, Icon, input, TxnForm } from './ui'
import { Empty, TxnList } from './widgets'

function AddClient({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addClient = useStore((s) => s.addClient)
  const [error, setError] = useState('')
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const value = (k: string) => String(data.get(k)).trim()
    if (!value('name')) return setError('Client name is required.')
    if (value('email') && !/^\S+@\S+\.\S+$/.test(value('email'))) return setError('Enter a valid email address.')
    addClient({ name: value('name'), contact: value('contact'), email: value('email') })
    setError('')
    onClose()
  }
  return (
    <Dialog open={open} onClose={onClose} title="New client">
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Field label="Client name">
          <input name="name" autoFocus placeholder="e.g. Harbourline Logistics" className={input} />
        </Field>
        <Field label="Contact person">
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

function ClientDetail({ client }: { client: Client }) {
  const txns = useStore((s) => s.txns)
  const removeTxn = useStore((s) => s.removeTxn)
  const removeClient = useStore((s) => s.removeClient)
  const ledger = useMemo(() => txns.filter((t) => t.clientId === client.id).sort(byDateDesc), [txns, client.id])
  const sum = totals(ledger)

  const onDelete = () => {
    if (confirm(`Delete ${client.name} and all ${ledger.length} transactions? You can undo this.`)) {
      removeClient(client.id)
      location.hash = 'clients'
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <Avatar name={client.name} size="size-12" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{client.name}</p>
          <p className="truncate text-sm text-zinc-500">{[client.contact, client.email].filter(Boolean).join(' · ') || 'No contact details'}</p>
        </div>
      </div>
      <dl className="grid grid-cols-3 divide-x divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {([['Balance', sum.net], ['Money in', sum.in], ['Money out', sum.out]] as const).map(([label, value]) => (
          <div key={label} className="p-3">
            <dt className="text-xs text-zinc-500">{label}</dt>
            <dd className={`mt-0.5 truncate font-semibold tabular-nums ${value < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{formatMoney(value)}</dd>
          </div>
        ))}
      </dl>
      <section>
        <h3 className="mb-3 text-sm font-semibold">Record money</h3>
        <TxnForm clientId={client.id} />
      </section>
      <section>
        <h3 className="mb-1 text-sm font-semibold">Ledger <span className="font-normal text-zinc-500">· {ledger.length}</span></h3>
        {ledger.length ? <TxnList txns={ledger} onRemove={removeTxn} /> : <Empty text="No money in or out yet." />}
      </section>
      <button type="button" className={`${btn.danger} justify-self-start`} onClick={onDelete}>
        <Icon name="trash" /> Delete client
      </button>
    </div>
  )
}

export function Clients({ selectedId }: { selectedId: string | null }) {
  const clients = useStore((s) => s.clients)
  const txns = useStore((s) => s.txns)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const selected = clients.find((c) => c.id === selectedId)

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
          <Icon name="plus" /> New client
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800">
              <th className="px-5 py-3 font-medium">Client</th>
              <th className="px-5 py-3 text-right font-medium">Money in</th>
              <th className="px-5 py-3 text-right font-medium">Money out</th>
              <th className="px-5 py-3 text-right font-medium">Balance</th>
              <th className="px-5 py-3 text-right font-medium">Last activity</th>
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
                <td className="px-5 py-3 text-right text-in tabular-nums">{formatMoney(r.sum.in)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{formatMoney(r.sum.out)}</td>
                <td className={`px-5 py-3 text-right font-semibold tabular-nums ${r.sum.net < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{formatMoney(r.sum.net)}</td>
                <td className="px-5 py-3 text-right text-zinc-500 tabular-nums">
                  {r.last ? new Date(`${r.last}T00:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="p-6"><Empty text={query ? 'No clients match your search.' : 'No clients yet. Add your first one.'} /></div>}
      </div>

      <AddClient open={adding} onClose={() => setAdding(false)} />
      <Dialog open={!!selected} onClose={() => (location.hash = 'clients')} title="Client" side>
        {selected && <ClientDetail client={selected} />}
      </Dialog>
    </>
  )
}
