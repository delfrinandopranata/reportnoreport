import { useMemo, useState, type FormEvent } from 'react'
import { today } from '../ledger'
import { card } from '../clients/shared'
import { btn, Dialog, Field, Icon, input } from '../ui'
import { useApproveContract, useClients, useContracts, useCreateContract, useMembers } from '../data/queries'
import { useSession } from '../data/session'
import { endingSoonHint, STATUS_LABEL, STATUS_TONE, type ContractStatus } from './status'

const pill = 'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-black/5 dark:ring-white/10'
const ContractBadge = ({ status }: { status: ContractStatus }) => <span className={`${pill} ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>

function NewContractDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: clients = [] } = useClients()
  const create = useCreateContract()
  const [error, setError] = useState('')
  const close = () => {
    setError('')
    create.reset()
    onClose()
  }
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const clientId = String(data.get('clientId'))
    const title = String(data.get('title')).trim()
    const startDate = String(data.get('startDate'))
    const endDate = String(data.get('endDate'))
    if (!title) return setError('Enter a contract title.')
    if (!endDate || endDate <= startDate) return setError('Enter an end date after the start date.')
    try {
      await create.mutateAsync({ clientId, title, startDate, endDate })
      close()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Dialog open={open} onClose={close} title="New contract">
      {clients.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Add a client before recording a contract.</p>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-3" noValidate>
          <Field label="Client">
            <select name="clientId" className={input} defaultValue={clients[0]?.id}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Title">
            <input name="title" autoFocus placeholder="e.g. Retainer agreement" className={input} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <input name="startDate" type="date" defaultValue={today()} className={input} />
            </Field>
            <Field label="End date">
              <input name="endDate" type="date" className={input} />
            </Field>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={btn.ghost} onClick={close}>Cancel</button>
            <button className={btn.primary} disabled={create.isPending}>{create.isPending ? 'Adding…' : 'Add contract'}</button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

export function ContractsPage() {
  const { data: contracts = [], isPending, error: loadError } = useContracts()
  const { data: clients = [] } = useClients()
  const { data: members = [] } = useMembers()
  const approve = useApproveContract()
  const session = useSession()
  const canReview = session.can('clients.edit') && session.canWrite
  const [dialogOpen, setDialogOpen] = useState(false)
  const nameOf = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients])
  const reviewerOf = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members])
  const todayStr = today()

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex items-center justify-end">
        <button type="button" className={btn.primary} disabled={!canReview} title={canReview ? undefined : "Your role can't add contracts."} onClick={() => setDialogOpen(true)}>
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
                  <th scope="col" className="px-4 py-2.5 font-medium">Title</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Start date</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">End date</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Reviewer</th>
                  <th scope="col" className="px-4 py-2.5 font-medium"><span className="sr-only">Review</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {contracts.map((c) => {
                  const hint = endingSoonHint(c.status, c.endDate, todayStr)
                  return (
                    <tr key={c.id} className="transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <td className="px-4 py-2.5 font-medium">{nameOf.get(c.clientId) ?? 'Unknown client'}</td>
                      <td className="px-4 py-2.5">{c.title}</td>
                      <td className="px-4 py-2.5 tabular-nums text-zinc-500">{c.startDate}</td>
                      <td className="px-4 py-2.5 tabular-nums text-zinc-500">
                        {c.endDate}
                        {hint && <span className="ml-2 text-xs font-medium text-amber-600 dark:text-amber-400">{hint}</span>}
                      </td>
                      <td className="px-4 py-2.5"><ContractBadge status={c.status} /></td>
                      <td className="px-4 py-2.5 text-zinc-500">{c.reviewedBy ? (reviewerOf.get(c.reviewedBy) ?? 'Former member') : '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        {c.status === 'pending_review' && canReview && (
                          <div className="flex justify-end gap-1">
                            <button type="button" className={`${btn.ghost} py-1`} disabled={approve.isPending} onClick={() => approve.mutate({ id: c.id, approve: true })}>Approve</button>
                            <button type="button" className={`${btn.danger} py-1`} disabled={approve.isPending} onClick={() => approve.mutate({ id: c.id, approve: false })}>Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">No contracts yet.</p>
        )}
        {!!approve.error && <p role="alert" className="border-t border-zinc-100 px-5 py-3 text-sm text-red-600 dark:border-zinc-800 dark:text-red-400">{approve.error.message}</p>}
      </div>

      <NewContractDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}
