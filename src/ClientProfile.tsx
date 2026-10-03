import { useMemo, useState, type ReactNode } from 'react'
import { LedgerView } from './ClientsPage'
import { AssigneeSelect, StatusBadge, StatusSelect, TagList } from './clients/fields'
import { ClientForm, ClientView } from './clients/ClientInfo'
import { card, neg, shortDate, useCan, useUserNames } from './clients/shared'
import { formatMoney, today, totals, type Client } from './ledger'
import { useStore } from './store'
import { Avatar, btn, Icon, TxnForm } from './ui'
import { CashflowChart } from './widgets'

export type ClientTab = 'client' | 'transactions'

const stamp = (iso: string) => {
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })} at ${d.toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })}`
}

const iconLink = 'grid size-8 place-items-center rounded-full border border-zinc-200 text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-white print:hidden'

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <span className="text-xs text-zinc-500">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  )
}

export function ClientProfile({ id, tab, actions }: { id: string; tab: ClientTab; actions: ReactNode }) {
  const client = useStore((s) => s.clients.find((c) => c.id === id))
  const txns = useStore((s) => s.txns)
  const businessName = useStore((s) => s.businessName)
  const updateClient = useStore((s) => s.updateClient)
  const removeClient = useStore((s) => s.removeClient)
  const canEdit = useCan('clients.edit')
  const canDelete = useCan('clients.delete')
  const nameOf = useUserNames()
  const [editing, setEditing] = useState(false)
  const own = useMemo(() => txns.filter((t) => t.clientId === id), [txns, id])
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

  const patch = (change: Partial<Client>) => updateClient(client.id, change)
  const startEdit = () => {
    if (tab !== 'client') location.hash = `clients/${client.id}`
    setEditing(true)
  }
  const onDelete = () => {
    if (confirm(`Delete ${client.name} and its ${own.length} ledger entries? You can undo this.`)) {
      removeClient(client.id)
      location.hash = 'clients'
    }
  }
  const leaveTab = (e: React.MouseEvent) => {
    if (!editing) return
    if (confirm('Discard your unsaved changes?')) setEditing(false)
    else e.preventDefault()
  }
  const onTxns = tab === 'transactions'
  const tabs = [
    { key: 'client', label: 'Client', href: `#clients/${client.id}`, headline: <StatusBadge status={client.status} /> },
    {
      key: 'transactions',
      label: 'Transactions',
      href: `#clients/${client.id}/transactions`,
      headline: <span className={`text-base font-semibold tabular-nums ${neg(sum.net)}`}>{formatMoney(sum.net)}</span>,
    },
  ] as const
  const meta = [client.industry, client.registrationNo, `Client since ${shortDate(client.createdAt)}`].filter(Boolean).join(' · ')
  const lastDate = own.reduce((max, t) => (t.date > max ? t.date : max), '')

  const stats = [
    { label: 'Client balance', value: formatMoney(sum.net), negative: sum.net < 0 },
    { label: 'Total receipts', value: formatMoney(sum.in) },
    { label: 'Total payments', value: formatMoney(sum.out) },
    { label: 'Transactions', value: String(sum.count), sub: lastDate ? `Last posted ${shortDate(lastDate)}` : 'None posted' },
  ]

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm text-zinc-500">
          <a href="#clients" className="font-medium hover:text-zinc-900 dark:hover:text-white">Clients</a>
          <Icon name="right" className="size-3.5 shrink-0" />
          <span className="truncate text-zinc-900 dark:text-white" aria-current="page">{client.name}</span>
        </nav>
        {actions}
      </div>

      {!onTxns && (
        <div className="hidden items-end justify-between border-b-2 border-zinc-900 pb-3 print:flex">
          <div>
            <p className="text-lg font-semibold">{businessName}</p>
            <h1 className="text-xl font-semibold">Client information sheet</h1>
          </div>
          <p className="text-sm text-zinc-600">Printed {shortDate(today())}</p>
        </div>
      )}

      <header className={`${card} grid gap-5 p-5 ${onTxns ? 'print:hidden' : ''}`}>
        <div className="flex flex-wrap items-start gap-4">
          <Avatar name={client.name} size="size-14 text-base" />
          <div className="mr-auto min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight break-words">{client.name}</h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                <Icon name={client.type === 'company' ? 'building' : 'person'} className="size-3" />
                {client.type === 'company' ? 'Company' : 'Individual'}
              </span>
              {client.phone && (
                <a href={`tel:${client.phone}`} className={iconLink} aria-label={`Call ${client.name}`} title="Call">
                  <Icon name="phone" />
                </a>
              )}
              {client.email && (
                <a href={`mailto:${client.email}`} className={iconLink} aria-label={`Email ${client.name}`} title="Email">
                  <Icon name="mail" />
                </a>
              )}
            </div>
            <p className="mt-1 text-sm text-zinc-500">{meta}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1 print:hidden">
            {canEdit ? (
              <button type="button" className={btn.ghost} onClick={startEdit} disabled={editing}>
                <Icon name="pencil" /> Edit
              </button>
            ) : (
              <span title="Your role can’t edit clients"><button type="button" className={btn.ghost} disabled><Icon name="pencil" /> Edit</button></span>
            )}
            <button type="button" className={btn.ghost} onClick={() => print()}>
              <Icon name="printer" /> Print
            </button>
            {canDelete ? (
              <button type="button" className={btn.danger} onClick={onDelete}>
                <Icon name="trash" /> Delete
              </button>
            ) : (
              <span title="Your role can’t delete clients"><button type="button" className={btn.danger} disabled><Icon name="trash" /> Delete</button></span>
            )}
            <a href={`#clients/${client.id}/statement`} className={btn.primary}>
              <Icon name="file" /> Statement of account
            </a>
          </div>
        </div>

        <div className="grid gap-4 border-t border-zinc-100 pt-4 sm:grid-cols-3 dark:border-zinc-800">
          <Labelled label="Status">
            <StatusSelect status={client.status} onChange={(status) => patch({ status })} disabled={!canEdit} />
          </Labelled>
          <Labelled label="Tags">
            <TagList tags={client.tags} onChange={canEdit ? (tags) => patch({ tags }) : undefined} />
          </Labelled>
          <Labelled label="Assigned member">
            {canEdit ? (
              <AssigneeSelect value={client.assignedUserId} onChange={(assignedUserId) => patch({ assignedUserId })} className="w-full max-w-60 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-800 dark:bg-zinc-900" />
            ) : client.assignedUserId ? (
              <span className="flex items-center gap-2"><Avatar name={nameOf(client.assignedUserId)} size="size-6 text-[10px]" />{nameOf(client.assignedUserId)}</span>
            ) : (
              <span className="text-zinc-400">Unassigned</span>
            )}
          </Labelled>
        </div>
        <p className="text-xs text-zinc-500">Last updated on {stamp(client.updatedAt)}</p>
      </header>

      <div role="tablist" aria-label="Client sections" className="-mt-2 flex gap-1 overflow-x-auto border-b border-zinc-200 print:hidden dark:border-zinc-800">
        {tabs.map((t) => (
          <a
            key={t.key}
            href={t.href}
            role="tab"
            aria-selected={tab === t.key}
            onClick={t.key === tab ? undefined : leaveTab}
            className="-mb-px grid shrink-0 gap-1 border-b-2 border-transparent px-4 py-2.5 text-sm text-zinc-500 transition hover:text-zinc-900 aria-selected:border-zinc-900 aria-selected:text-zinc-900 dark:hover:text-white dark:aria-selected:border-white dark:aria-selected:text-white"
          >
            <span className="font-medium">{t.label}</span>
            {t.headline}
          </a>
        ))}
      </div>

      {onTxns ? (
        <div className="grid gap-6">
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4 print:hidden">
            {stats.map((s) => (
              <div key={s.label} className={`${card} p-5`}>
                <dt className="text-sm text-zinc-500">{s.label}</dt>
                <dd className={`mt-2 text-lg font-semibold tracking-tight tabular-nums sm:text-2xl ${s.negative ? 'text-red-600 dark:text-red-400' : ''}`}>{s.value}</dd>
                {s.sub && <dd className="mt-1 text-sm text-zinc-500">{s.sub}</dd>}
              </div>
            ))}
          </dl>
          <div className="grid items-start gap-6 lg:grid-cols-3 print:hidden">
            <section className={`${card} min-w-0 p-5 lg:col-span-2`}>
              <h2 className="mb-4 text-sm font-medium text-zinc-500">Cash flow</h2>
              <CashflowChart txns={own} />
            </section>
            <section className={`${card} p-5`}>
              <h2 className="mb-4 text-sm font-medium text-zinc-500">Record transaction</h2>
              <PostTxn clientId={client.id} />
            </section>
          </div>
          <LedgerView key={client.id} fixedClientId={client.id} />
        </div>
      ) : editing ? (
        <ClientForm client={client} onDone={() => setEditing(false)} />
      ) : (
        <ClientView client={client} />
      )}
    </div>
  )
}

function PostTxn({ clientId }: { clientId: string }) {
  return useCan('transactions.post') ? <TxnForm clientId={clientId} /> : <p className="text-sm text-zinc-500">Your role can’t record transactions.</p>
}
