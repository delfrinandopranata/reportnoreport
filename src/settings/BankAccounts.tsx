import { useState, type FormEvent } from 'react'
import type { BankAccount } from '../data/mappers'
import { useBankAccounts, useSaveBank } from '../data/queries'
import { useSession } from '../data/session'
import { bankPayload } from './bankForm'
import { btn, Dialog, Field, Icon, input } from '../ui'

export function BankAccountsCard() {
  const { data: banks = [], isPending, error } = useBankAccounts()
  const save = useSaveBank()
  const s = useSession()
  const canEdit = s.can('settings.manage') && s.canWrite
  const [editing, setEditing] = useState<Partial<BankAccount> | null>(null)
  const [formError, setFormError] = useState('')

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const d = new FormData(e.currentTarget)
    const name = String(d.get('name')).trim()
    if (!name) return setFormError('Enter a name, e.g. "Maybank client account".')
    try {
      await save.mutateAsync(bankPayload(editing, { name, bankName: String(d.get('bankName')).trim(), accountName: String(d.get('accountName')).trim(), accountNo: String(d.get('accountNo')).trim(), isDefaultChecked: d.get('isDefault') === 'on' }, banks.length))
      setEditing(null); setFormError('')
    } catch (err) { setFormError((err as Error).message) }
  }

  return (
    <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Bank accounts</h2>
          <p className="text-sm text-zinc-500">Where you hold client money. The default account is used for new transactions and shown on statements.</p>
        </div>
        <button type="button" className={btn.ghost} disabled={!canEdit} title={canEdit ? undefined : s.writeBlockReason ?? "Your role can't change settings"} onClick={() => setEditing({})}>
          <Icon name="plus" /> Add account
        </button>
      </header>
      {isPending ? <p className="text-sm text-zinc-500">Loading…</p> : error ? <p role="alert" className="text-sm text-red-600">{error.message}</p> : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {banks.map((b) => (
            <li key={b.id} className={`flex items-center gap-3 py-3 ${b.isActive ? '' : 'opacity-50'}`}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{b.name} {b.isDefault && <span className="ml-1 rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">Default</span>} {!b.isActive && <span className="ml-1 text-xs text-zinc-500">Inactive</span>}</p>
                <p className="truncate text-sm text-zinc-500">{[b.bankName, b.accountName, b.accountNo].filter(Boolean).join(' · ') || 'No bank details yet'}</p>
              </div>
              {canEdit && (
                <>
                  {!b.isDefault && b.isActive && <button type="button" className={btn.ghost} onClick={() => save.mutate({ id: b.id, isDefault: true })}>Make default</button>}
                  {!b.isDefault && <button type="button" className={btn.ghost} onClick={() => save.mutate({ id: b.id, isActive: !b.isActive })}>{b.isActive ? 'Deactivate' : 'Reactivate'}</button>}
                  <button type="button" className={btn.ghost} onClick={() => setEditing(b)}>Edit</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {save.error && !editing && <p role="alert" className="mt-2 text-sm text-red-600">{save.error.message}</p>}
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit bank account' : 'Add bank account'}>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <Field label="Name"><input name="name" defaultValue={editing?.name} placeholder="e.g. Maybank client account" className={input} /></Field>
          <Field label="Bank"><input name="bankName" defaultValue={editing?.bankName} className={input} /></Field>
          <Field label="Account name"><input name="accountName" defaultValue={editing?.accountName} className={input} /></Field>
          <Field label="Account no."><input name="accountNo" defaultValue={editing?.accountNo} className={input} /></Field>
          {!editing?.isDefault && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isDefault" className="size-4 accent-zinc-900" /> Make this the default account</label>}
          {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end gap-2"><button type="button" className={btn.ghost} onClick={() => setEditing(null)}>Cancel</button><button className={btn.primary} disabled={save.isPending}>Save</button></div>
        </form>
      </Dialog>
    </section>
  )
}
