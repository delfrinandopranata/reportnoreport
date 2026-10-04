import { useState, type ReactNode } from 'react'
import { LedgerView } from './ClientsPage'
import { AssigneeSelect, StatusSelect, TagList } from './clients/fields'
import { ClientAttachments, ClientDetails, ClientForm, Expandable } from './clients/ClientInfo'
import { card, LoadError, MutationError, Skeleton, useGate, useUserNames } from './clients/shared'
import { useBalances, useClient, useDeleteClient, useUpdateClient } from './data/queries'
import { today, type Client } from './ledger'
import { Avatar, btn, Dialog, Icon, TxnForm } from './ui'

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
      <div className="flex min-h-8 items-center text-sm">{children}</div>
    </div>
  )
}

export function ClientProfile({ id }: { id: string; tab: ClientTab }) {
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
      <div className="grid place-items-center gap-3 py-24 text-center">
        <p className="font-medium">This client doesn’t exist any more.</p>
        <div className="flex items-center gap-2">
          <a href="#clients" className={btn.primary}>Back to clients</a>
        </div>
      </div>
    )
  }

  const patch = (change: Partial<Client>) => update.mutate({ id: client.id, patch: change, loadedUpdatedAt: client.updatedAt })
  const startEdit = () => setEditing(true)
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
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm text-zinc-500">
          <a href="#clients" className="font-medium hover:text-zinc-900 dark:hover:text-white">Clients</a>
          <Icon name="right" className="size-3.5 shrink-0" />
          <span className="truncate text-zinc-900 dark:text-white" aria-current="page">{client.name}</span>
        </nav>
      </div>

      <header className={`${card} grid gap-5 p-5 print:hidden`} data-tour="client-profile">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar name={client.name} size="size-14 text-base" />
          <div className="min-w-0 flex-1 basis-56">
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
          </div>
          <div className="flex w-full flex-wrap items-center gap-1 sm:w-auto print:hidden">
            <button type="button" className={btn.ghost} onClick={startEdit} disabled={!edit.ok || editing} title={edit.title} aria-describedby={gateHint ? 'client-gate' : undefined}>
              <Icon name="pencil" /> Edit
            </button>
            <button type="button" className={btn.ghost} onClick={() => print()}>
              <Icon name="printer" /> Print
            </button>
            <a href={`#clients/${client.id}/statement`} className={`${btn.primary} max-sm:w-full`}>
              <Icon name="file" /> Statement of account
            </a>
            <button type="button" className={`${btn.danger} sm:ml-2 sm:border-l sm:border-zinc-200 sm:rounded-l-none sm:dark:border-zinc-700`} onClick={() => setConfirmDelete(true)} disabled={!del.ok || remove.isPending} title={del.title} aria-describedby={gateHint ? 'client-gate' : undefined}>
              <Icon name="trash" /> Delete
            </button>
          </div>
        </div>

        {gateHint && <p id="client-gate" className="-mt-2 text-xs text-zinc-500 print:hidden">{gateHint}</p>}
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
        <Expandable title="Details" prefKey="client-details-open">
          <ClientDetails client={client} />
          <p className="mt-4 text-xs text-zinc-500">Last updated on {stamp(client.updatedAt)}</p>
        </Expandable>
        <div className="print:hidden">
          <Expandable title="Attachments" prefKey="client-attachments-open"><ClientAttachments client={client} /></Expandable>
        </div>
        <MutationError error={update.error ?? remove.error} />
      </header>

      {editing ? (
        <ClientForm client={client} onDone={() => setEditing(false)} />
      ) : (
        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-3 print:hidden">
            <h2 className="text-lg font-semibold tracking-tight">Ledger</h2>
            <button type="button" className={btn.primary} data-tour="record-transaction" onClick={() => setRecording(true)} disabled={!post.ok} title={post.title}>
              <Icon name="plus" /> Record transaction
            </button>
          </div>
          <LedgerView key={client.id} fixedClientId={client.id} />
        </div>
      )}

      <Dialog open={recording} onClose={() => setRecording(false)} title="Record transaction">
        <TxnForm clientId={client.id} autoFocus onDone={() => setRecording(false)} />
      </Dialog>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete client">
        <div className="grid gap-4 text-sm">
          <p>Delete {client.name} and its {balances?.[0]?.txn_count ?? 0} ledger entries? This can't be undone.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className={btn.ghost} onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg bg-red-700 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-red-800 disabled:opacity-40 dark:bg-red-600 dark:hover:bg-red-500"
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

/** Same shape as the loaded page (breadcrumb, header card, tabs) so nothing jumps when data lands. */
function ProfileSkeleton() {
  return (
    <div role="status" aria-label="Loading client" className="grid grid-cols-1 gap-6">
      <Skeleton className="h-5 w-48" />
      <div className={`${card} grid gap-5 p-5`}>
        <div className="flex items-start gap-4">
          <Skeleton className="size-14 rounded-full" />
          <div className="grid flex-1 gap-2"><Skeleton className="h-8 w-64 max-w-full" /><Skeleton className="h-4 w-80 max-w-full" /></div>
        </div>
        <div className="grid gap-4 border-t border-zinc-100 pt-4 sm:grid-cols-3 dark:border-zinc-800">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      </div>
      <Skeleton className="h-12 w-72 max-w-full" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
