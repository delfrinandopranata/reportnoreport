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
  return (
    <section className="rnr-folder" aria-labelledby="bank-heading">
      <span className="rnr-folder-tab" id="bank-heading">Bank accounts</span>
      <div className="rnr-folder-body">
        <div className="rnr-perf" aria-hidden="true" />
        <div className="mb-4 flex flex-wrap items-start gap-3">
          <p className="rnr-muted min-w-0 flex-1 basis-64">Where you hold client money. The default account is used for new transactions and shown on statements.</p>
          <button type="button" className={`${btn.secondary} rnr-btn-sm whitespace-nowrap`} disabled={!canEdit} aria-describedby={canEdit ? undefined : 'bank-why'} onClick={() => (setNotice(''), setEditing({}))}>
            <Icon name="plus" /> Add account
          </button>
        </div>
        {!canEdit && <p id="bank-why" className="rnr-note mb-4" data-tone="info"><Icon name="info" className="size-5" /><span>Read-only. {reason}</span></p>}
        <div role="status">{notice && <p className="rnr-note mb-4" data-tone="ok"><Icon name="check" className="size-5" /><span>{notice}</span></p>}</div>
        {isPending ? <p className="rnr-muted py-3">Loading…</p> : error ? <p role="alert" className="rnr-error py-3">{error.message}</p> : banks.length === 0 ? (
          <div className="rnr-empty">
            <h3>No bank accounts yet</h3>
            <p>{canEdit ? 'Add the account where you hold client money so receipts and statements show the right details.' : 'An owner or admin can add the account where client money is held.'}</p>
          </div>
        ) : (
          <div className="rnr-table-card rnr-card">
            <table className="rnr-table">
              <caption className="rnr-sr-only">Bank accounts</caption>
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Details</th>
                  <th scope="col">Status</th>
                  {canEdit && <th scope="col"><span className="rnr-sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {banks.map((b) => (
                  <tr key={b.id}>
                    <th scope="row" className={`min-w-32 ${b.isActive ? '' : 'rnr-muted'}`}>{b.name}</th>
                    <td className="rnr-cell min-w-48">{[b.bankName, b.accountName, b.accountNo].filter(Boolean).join(' · ') || 'No bank details yet'}</td>
                    <td>
                      <span className="flex flex-wrap gap-1">
                        {b.isDefault && <span className="rnr-chip" data-tone="accent">Default</span>}
                        {!b.isActive && <span className="rnr-chip">Inactive</span>}
                      </span>
                    </td>
                    {canEdit && (
                      <td>
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {!b.isDefault && b.isActive && <button type="button" className={btn.ghost} disabled={save.isPending} aria-label={`Make ${b.name} the default`} onClick={() => run({ id: b.id, isDefault: true }, `${b.name} is now the default account.`)}>Make default</button>}
                          {!b.isDefault && <button type="button" className={b.isActive ? btn.danger : btn.ghost} disabled={save.isPending} aria-label={`${b.isActive ? 'Deactivate' : 'Reactivate'} ${b.name}`} onClick={() => (b.isActive ? setConfirming(b) : run({ id: b.id, isActive: true }, `${b.name} is active again.`))}>{b.isActive ? 'Deactivate' : 'Reactivate'}</button>}
                          <button type="button" className={btn.ghost} aria-label={`Edit ${b.name}`} onClick={() => (setNotice(''), setEditing(b))}>Edit</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {save.error && !editing && !confirming && <p role="alert" className="rnr-error pt-3">{save.error.message}</p>}
      </div>
      <Dialog open={!!confirming} onClose={() => setConfirming(null)} title="Deactivate bank account">
        {confirming && (
          <div className="grid gap-4 text-sm">
            <p>Deactivate {confirming.name}? It can't be chosen for new transactions. Existing transactions and statements keep their details, and you can reactivate it later.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className={btn.ghost} onClick={() => setConfirming(null)}>Cancel</button>
              <button type="button" className={btn.danger} disabled={save.isPending} onClick={() => { run({ id: confirming.id, isActive: false }, `${confirming.name} was deactivated.`); setConfirming(null) }}>Deactivate account</button>
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
          {!editing?.isDefault && <label className="rnr-check"><input type="checkbox" name="isDefault" /> Make this the default account</label>}
          {formError && <p role="alert" className="rnr-error">{formError}</p>}
          <div className="flex justify-end gap-2"><button type="button" className={btn.ghost} onClick={() => setEditing(null)}>Cancel</button><button className={btn.primary} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save account'}</button></div>
        </form>
      </Dialog>
    </section>
  )
}
