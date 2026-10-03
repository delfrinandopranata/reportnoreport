import { useMemo, useState, type FormEvent } from 'react'
import { today } from '../ledger'
import { card } from '../clients/shared'
import { btn, Dialog, Field, Icon, input } from '../ui'
import { useClients, useContracts, useCreateContract, useDeleteContract, useUpdateContract } from '../data/queries'
import type { Contract } from '../data/mappers'
import { useSession } from '../data/session'
import { endsInLabel, isEndingSoon } from './status'

/** Create when `contract` is null, edit otherwise. */
function ContractDialog({ contract, open, onClose }: { contract: Contract | null; open: boolean; onClose: () => void }) {
  const { data: clients = [] } = useClients()
  const create = useCreateContract()
  const update = useUpdateContract()
  const save = contract ? update : create
  const [error, setError] = useState('')
  const close = () => {
    setError('')
    save.reset()
    onClose()
  }
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const input = {
      clientId: String(data.get('clientId')),
      counterparty: String(data.get('counterparty')).trim(),
      title: String(data.get('title')).trim(),
      startDate: String(data.get('startDate')),
      endDate: String(data.get('endDate')),
    }
    if (!input.counterparty) return setError("Enter your client's client.")
    if (!input.title) return setError('Enter a contract title.')
    if (!input.endDate || input.endDate <= input.startDate) return setError('Enter an end date after the start date.')
    try {
      if (contract) await update.mutateAsync({ id: contract.id, ...input })
      else await create.mutateAsync(input)
      close()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Dialog open={open} onClose={close} title={contract ? 'Edit contract' : 'New contract'}>
      {clients.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Add a client before recording a contract.</p>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-3" noValidate>
          <Field label="Client">
            <select name="clientId" className={input} defaultValue={contract?.clientId ?? clients[0]?.id}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Counterparty" hint="Their client">
            <input name="counterparty" data-autofocus defaultValue={contract?.counterparty} placeholder="e.g. Harbour Foods Sdn Bhd" className={input} />
          </Field>
          <Field label="Title">
            <input name="title" defaultValue={contract?.title} placeholder="e.g. Supply agreement" className={input} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <input name="startDate" type="date" defaultValue={contract?.startDate ?? today()} className={input} />
            </Field>
            <Field label="End date">
              <input name="endDate" type="date" defaultValue={contract?.endDate} className={input} />
            </Field>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={btn.ghost} onClick={close}>Cancel</button>
            <button className={btn.primary} disabled={save.isPending}>{save.isPending ? 'Saving…' : contract ? 'Save changes' : 'Add contract'}</button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

export function ContractsPage() {
  const { data: contracts = [], isPending, error: loadError } = useContracts()
  const { data: clients = [] } = useClients()
  const remove = useDeleteContract()
  const session = useSession()
  const canEdit = session.can('clients.edit') && session.canWrite
  const [editing, setEditing] = useState<Contract | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState<Contract | null>(null)
  const nameOf = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients])
  const todayStr = today()
  const openDialog = (c: Contract | null) => {
    setEditing(c)
    setDialogOpen(true)
  }
  const onDelete = async () => {
    if (!deleting) return
    try {
      await remove.mutateAsync(deleting.id)
      setDeleting(null)
    } catch {
      // Surfaced via remove.error below.
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex items-center justify-end">
        <button type="button" className={btn.primary} disabled={!canEdit} title={canEdit ? undefined : "Your role can't add contracts."} onClick={() => openDialog(null)}>
          <Icon name="plus" /> New contract
        </button>
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="border-b border-zinc-100 px-5 py-3 text-sm font-medium dark:border-zinc-800">
          {isPending ? 'Contracts' : `${contracts.length} ${contracts.length === 1 ? 'contract' : 'contracts'}`}
        </div>
        {isPending ? (
          <p className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        ) : loadError ? (
          <p role="alert" className="p-6 text-center text-sm text-red-600">{loadError.message}</p>
        ) : contracts.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800">
                  <th scope="col" className="px-4 py-2.5 font-medium">Client</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Counterparty</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Title</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Start date</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">End date</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Ends</th>
                  <th scope="col" className="px-4 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {contracts.map((c) => (
                  <tr key={c.id} className="transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <td className="px-4 py-2.5 font-medium">{nameOf.get(c.clientId) ?? 'Unknown client'}</td>
                    <td className="px-4 py-2.5">{c.counterparty || '—'}</td>
                    <td className="px-4 py-2.5">{c.title}</td>
                    <td className="px-4 py-2.5 tabular-nums text-zinc-500">{c.startDate}</td>
                    <td className="px-4 py-2.5 tabular-nums text-zinc-500">{c.endDate}</td>
                    <td className={`px-4 py-2.5 whitespace-nowrap text-xs font-medium ${isEndingSoon(c.endDate, todayStr) ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500'}`}>{endsInLabel(c.endDate, todayStr)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {canEdit && (
                        <div className="flex justify-end gap-1">
                          <button type="button" className={`${btn.ghost} py-1`} onClick={() => openDialog(c)}>Edit</button>
                          <button type="button" className={`${btn.danger} py-1`} onClick={() => { remove.reset(); setDeleting(c) }}>Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">No contracts yet.</p>
        )}
      </div>

      <ContractDialog contract={editing} open={dialogOpen} onClose={() => setDialogOpen(false)} />

      <Dialog open={!!deleting} onClose={() => setDeleting(null)} title="Delete contract">
        <div className="grid gap-4 text-sm">
          <p>Delete {deleting?.title}? This can't be undone.</p>
          {!!remove.error && <p role="alert" className="text-red-600 dark:text-red-400">{remove.error.message}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={btn.ghost} onClick={() => setDeleting(null)}>Cancel</button>
            <button type="button" className={btn.danger} disabled={remove.isPending} onClick={onDelete}>{remove.isPending ? 'Deleting…' : 'Delete contract'}</button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
