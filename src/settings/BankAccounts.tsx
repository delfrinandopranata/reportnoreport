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
  const [confirming, setConfirming] = useState<BankAccount | null>(null)
  const [notice, setNotice] = useState('')

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const d = new FormData(e.currentTarget)
    const name = String(d.get('name')).trim()
    if (!name) return setFormError('Enter a name, e.g. "Maybank client account".')
    try {
      await save.mutateAsync(bankPayload(editing, { name, bankName: String(d.get('bankName')).trim(), accountName: String(d.get('accountName')).trim(), accountNo: String(d.get('accountNo')).trim(), isDefaultChecked: d.get('isDefault') === 'on' }, banks.length))
      setNotice(editing?.id ? 'Bank account updated.' : 'Bank account added.')
      setEditing(null); setFormError('')
    } catch (err) { setFormError((err as Error).message) }
  }

  const reason = s.writeBlockReason ?? "Your role can't change settings"
  const run = (input: Parameters<typeof save.mutate>[0], message: string) => save.mutate(input, { onSuccess: () => setNotice(message) })
  const tag = 'ml-1.5 inline-flex rounded-full px-2 py-0.5 text-xs font-medium'

  return (
    <section className="rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900" aria-labelledby="bank-heading">
      <header className="flex flex-wrap items-start gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id="bank-heading" className="font-semibold">Bank accounts</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Where you hold client money. The default account is used for new transactions and shown on statements.</p>
        </div>
        <button type="button" className={`${btn.ghost} whitespace-nowrap border border-zinc-200 dark:border-zinc-800`} disabled={!canEdit} aria-describedby={canEdit ? undefined : 'bank-why'} onClick={() => (setNotice(''), setEditing({}))}>
          <Icon name="plus" /> Add account
        </button>
      </header>
      {!canEdit && <p id="bank-why" className="border-b border-zinc-100 bg-zinc-50 px-5 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-400">Read-only. {reason}</p>}
      <div role="status">{notice && <p className="px-5 pt-3 text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}</div>
      <div className="px-5 py-2">
        {isPending ? <p className="py-3 text-sm text-zinc-500 dark:text-zinc-400">Loading…</p> : error ? <p role="alert" className="py-3 text-sm text-red-600 dark:text-red-400">{error.message}</p> : banks.length === 0 ? (
          <div className="py-6 text-center text-sm">
            <p className="font-medium">No bank accounts yet</p>
            <p className="mt-1 text-zinc-500 dark:text-zinc-400">{canEdit ? 'Add the account where you hold client money so receipts and statements show the right details.' : 'An owner or admin can add the account where client money is held.'}</p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {banks.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                <div className={`min-w-0 flex-1 basis-56 ${b.isActive ? '' : 'opacity-70'}`}>
                  <p className="flex flex-wrap items-center gap-y-1 font-medium">
                    <span className="min-w-0 break-words">{b.name}</span>
                    {b.isDefault && <span className={`${tag} bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300`}>Default</span>}
                    {!b.isActive && <span className={`${tag} bg-zinc-100 text-zinc-700 dark:bg-zinc-500/20 dark:text-zinc-300`}>Inactive</span>}
                  </p>
                  <p className="break-words text-sm text-zinc-500 dark:text-zinc-400">{[b.bankName, b.accountName, b.accountNo].filter(Boolean).join(' · ') || 'No bank details yet'}</p>
                </div>
                {canEdit && (
                  <div className="flex flex-wrap items-center gap-1">
                    {!b.isDefault && b.isActive && <button type="button" className={btn.ghost} disabled={save.isPending} aria-label={`Make ${b.name} the default`} onClick={() => run({ id: b.id, isDefault: true }, `${b.name} is now the default account.`)}>Make default</button>}
                    {!b.isDefault && <button type="button" className={b.isActive ? btn.danger : btn.ghost} disabled={save.isPending} aria-label={`${b.isActive ? 'Deactivate' : 'Reactivate'} ${b.name}`} onClick={() => (b.isActive ? setConfirming(b) : run({ id: b.id, isActive: true }, `${b.name} is active again.`))}>{b.isActive ? 'Deactivate' : 'Reactivate'}</button>}
                    <button type="button" className={btn.ghost} aria-label={`Edit ${b.name}`} onClick={() => (setNotice(''), setEditing(b))}>Edit</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {save.error && !editing && !confirming && <p role="alert" className="pb-3 text-sm text-red-600 dark:text-red-400">{save.error.message}</p>}
      </div>
      <Dialog open={!!confirming} onClose={() => setConfirming(null)} title="Deactivate bank account">
        {confirming && (
          <div className="grid gap-4 text-sm">
            <p>Deactivate {confirming.name}? It can't be chosen for new transactions. Existing transactions and statements keep their details, and you can reactivate it later.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className={btn.ghost} onClick={() => setConfirming(null)}>Cancel</button>
              <button type="button" className="inline-flex items-center justify-center rounded-lg bg-red-700 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-red-800 disabled:opacity-40 dark:bg-red-600 dark:hover:bg-red-500" disabled={save.isPending} onClick={() => { run({ id: confirming.id, isActive: false }, `${confirming.name} was deactivated.`); setConfirming(null) }}>Deactivate account</button>
            </div>
          </div>
        )}
      </Dialog>
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit bank account' : 'Add bank account'}>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <Field label="Name"><input name="name" defaultValue={editing?.name} placeholder="e.g. Maybank client account" className={input} /></Field>
          <Field label="Bank"><input name="bankName" defaultValue={editing?.bankName} className={input} /></Field>
          <Field label="Account name"><input name="accountName" defaultValue={editing?.accountName} className={input} /></Field>
          <Field label="Account no."><input name="accountNo" defaultValue={editing?.accountNo} className={input} /></Field>
          {!editing?.isDefault && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isDefault" className="size-4 accent-zinc-900 dark:accent-white" /> Make this the default account</label>}
          {formError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
          <div className="flex justify-end gap-2"><button type="button" className={btn.ghost} onClick={() => setEditing(null)}>Cancel</button><button className={btn.primary} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save account'}</button></div>
        </form>
      </Dialog>
    </section>
  )
}
