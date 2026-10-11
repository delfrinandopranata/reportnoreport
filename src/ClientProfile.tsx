import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { LedgerView } from './ClientsPage'
import { AssigneeSelect, StatusSelect, TagList } from './clients/fields'
import { ClientAttachments, ClientDetails, ClientForm } from './clients/ClientInfo'
import { LoadError, MutationError, Skeleton, useGate, useUserNames } from './clients/shared'
import { useBalances, useClient, useDeleteClient, useUpdateClient } from './data/queries'
import { today, type Client } from './ledger'
import { Avatar, btn, Dialog, Icon, TxnForm } from './ui'

export type ClientTab = 'client' | 'transactions'

const stamp = (iso: string) => {
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })} at ${d.toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })}`
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <span className="rnr-muted text-xs">{label}</span>
      <div>{children}</div>
    </div>
  )
}

const TABS: [ClientTab, string][] = [['client', 'Details'], ['transactions', 'Transactions']]

export function ClientProfile({ id, tab: initialTab }: { id: string; tab: ClientTab }) {
  const tabsId = useId()
  const [tab, setTab] = useState<ClientTab>(initialTab)
  const { data: client, isPending, error: loadError } = useClient(id)
  const update = useUpdateClient()
  const remove = useDeleteClient()
  const edit = useGate('clients.edit', 'edit clients')
  const del = useGate('clients.delete', 'delete clients')
  const canEdit = edit.ok
  const gateHint = edit.title ?? del.title
  const nameOf = useUserNames()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [recording, setRecording] = useState(false)
  const post = useGate('transactions.post', 'record transactions')
  const { data: balances } = useBalances({ from: '1900-01-01', to: today(), clientId: id })

  if (isPending) return <ProfileSkeleton />
  if (loadError) return <LoadError error={loadError} what="this client" />
  if (!client) {
    return (
      <div className="rnr-empty">
        <p className="font-medium">This client doesn’t exist any more.</p>
        <a href="#clients" className={btn.primary}>Back to clients</a>
      </div>
    )
  }

  const patch = (change: Partial<Client>) => update.mutate({ id: client.id, patch: change, loadedUpdatedAt: client.updatedAt })
  const startEdit = () => {
    setTab('client')
    setEditing(true)
  }
  const onTabKey = (e: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key]
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : step === undefined ? -1 : (TABS.findIndex(([k]) => k === tab) + step + TABS.length) % TABS.length
    if (next < 0) return
    e.preventDefault()
    setTab(TABS[next][0])
    document.getElementById(`${tabsId}-${TABS[next][0]}`)?.focus()
  }
  const onDelete = async () => {
    setConfirmDelete(false)
    try {
      await remove.mutateAsync(client.id)
      location.hash = 'clients'
    } catch {
      // shown below via remove.error
    }
  }

  return (
    <div className="rnr-wide grid grid-cols-1 gap-6">
      <a href="#clients" className="rnr-crumb justify-self-start print:hidden">
        <Icon name="back" /> Back to clients
      </a>

      <header className="rnr-page-head print:hidden" data-tour="client-profile">
        <div>
          <div className="flex items-center gap-3">
            <Avatar name={client.name} size="size-12" />
            <h1 className="rnr-page-title break-words">{client.name}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rnr-chip">
              <Icon name={client.type === 'company' ? 'building' : 'person'} className="size-3.5" />
              {client.type === 'company' ? 'Company' : 'Individual'}
            </span>
            {client.phone && (
              <a href={`tel:${client.phone}`} className="rnr-icon-btn" aria-label={`Call ${client.name}`} title="Call">
                <Icon name="phone" />
              </a>
            )}
            {client.email && (
              <a href={`mailto:${client.email}`} className="rnr-icon-btn" aria-label={`Email ${client.name}`} title="Email">
                <Icon name="mail" />
              </a>
            )}
          </div>
        </div>
        <div className="rnr-page-actions">
          <button type="button" className={btn.ghost} onClick={startEdit} disabled={!edit.ok || editing} title={edit.title} aria-describedby={gateHint ? 'client-gate' : undefined}>
            <Icon name="pencil" /> Edit
          </button>
          <button type="button" className={btn.ghost} onClick={() => print()}>
            <Icon name="printer" /> Print
          </button>
          <button type="button" className={btn.danger} onClick={() => setConfirmDelete(true)} disabled={!del.ok || remove.isPending} title={del.title} aria-describedby={gateHint ? 'client-gate' : undefined}>
            <Icon name="trash" /> Delete
          </button>
          <a href={`#clients/${client.id}/statement`} className={btn.secondary}>
            <Icon name="file" /> Statement of account
          </a>
          <button type="button" className={btn.primary} data-tour="record-transaction" onClick={() => setRecording(true)} disabled={!post.ok} title={post.title}>
            <Icon name="plus" /> Record transaction
          </button>
        </div>
      </header>

      {gateHint && <p id="client-gate" className="rnr-muted -mt-3 text-xs print:hidden">{gateHint}</p>}
      <MutationError error={update.error ?? remove.error} />

      <div role="tablist" aria-label="Client" className="rnr-tabs print:hidden" onKeyDown={onTabKey}>
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" id={`${tabsId}-${key}`} aria-selected={tab === key} aria-controls={`${tabsId}-panel`} tabIndex={tab === key ? 0 : -1} className="rnr-tab" onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`} className="rnr-tabpanel grid gap-6">
        {tab === 'client' ? (
          editing ? (
            <ClientForm client={client} onDone={() => setEditing(false)} />
          ) : (
            <>
              <section className="rnr-folder" aria-labelledby={`${tabsId}-details`}>
                <span className="rnr-folder-tab" id={`${tabsId}-details`}>Details</span>
                <div className="rnr-folder-body grid gap-5">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Labelled label="Status">
                      <StatusSelect status={client.status} onChange={(status) => patch({ status })} disabled={!canEdit} />
                    </Labelled>
                    <Labelled label="Tags">
                      <TagList tags={client.tags} onChange={canEdit ? (tags) => patch({ tags }) : undefined} />
                    </Labelled>
                    <Labelled label="Assigned member">
                      {canEdit ? (
                        <AssigneeSelect value={client.assignedUserId} onChange={(assignedUserId) => patch({ assignedUserId })} className="rnr-input w-full max-w-60 min-h-9 py-1" />
                      ) : client.assignedUserId ? (
                        <span className="flex items-center gap-2"><Avatar name={nameOf(client.assignedUserId)} size="size-6 text-[10px]" />{nameOf(client.assignedUserId)}</span>
                      ) : (
                        <span className="rnr-muted">Unassigned</span>
                      )}
                    </Labelled>
                  </div>
                  <ClientDetails client={client} />
                  <p className="rnr-muted text-xs">Last updated on {stamp(client.updatedAt)}</p>
                </div>
              </section>
              <section className="rnr-folder print:hidden" aria-labelledby={`${tabsId}-attachments`}>
                <span className="rnr-folder-tab" id={`${tabsId}-attachments`}>Attachments</span>
                <div className="rnr-folder-body"><ClientAttachments client={client} /></div>
              </section>
            </>
          )
        ) : (
          <LedgerView key={client.id} fixedClientId={client.id} />
        )}
      </div>

      <Dialog open={recording} onClose={() => setRecording(false)} title="Record transaction">
        <TxnForm clientId={client.id} autoFocus onDone={() => setRecording(false)} />
      </Dialog>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete client">
        <div className="grid gap-4">
          <p>Delete {client.name} and its {balances?.[0]?.txn_count ?? 0} ledger entries? This can't be undone.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className={btn.ghost} onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button
              type="button"
              className={btn.danger}
              disabled={remove.isPending}
              onClick={onDelete}
            >
              {remove.isPending ? 'Deleting…' : 'Delete client'}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

/** Same shape as the loaded page (crumb, head, tabs) so nothing jumps when data lands. */
function ProfileSkeleton() {
  return (
    <div role="status" aria-label="Loading client" className="rnr-wide grid grid-cols-1 gap-6">
      <Skeleton className="h-5 w-48" />
      <div className="flex items-start gap-4">
        <Skeleton className="size-12" />
        <div className="grid flex-1 gap-2"><Skeleton className="h-10 w-64 max-w-full" /><Skeleton className="h-4 w-48 max-w-full" /></div>
      </div>
      <Skeleton className="h-11 w-72 max-w-full" />
      <Skeleton className="h-40 w-full" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
