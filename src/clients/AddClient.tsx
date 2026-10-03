import { useState, type FormEvent } from 'react'
import { validateClient, type ClientErrors, type ClientStatus, type ClientType } from '../ledger'
import { useCreateClient } from '../data/queries'
import { btn, Dialog, Field, input } from '../ui'
import { PhoneField, StatusSelect, TagList } from './fields'
import { MutationError, Segmented } from './shared'

const BLANK = { type: 'company' as ClientType, name: '', registrationNo: '', phone: '', email: '', contact: '', status: 'active' as ClientStatus, tags: [] as string[] }

/** The essentials only; the full record is edited on the client's page. */
export function AddClient({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateClient()
  const [form, setForm] = useState(BLANK)
  const [errors, setErrors] = useState<ClientErrors>({})
  const set = <K extends keyof typeof BLANK>(key: K, value: (typeof BLANK)[K]) => setForm((f) => ({ ...f, [key]: value }))
  const company = form.type === 'company'

  const close = () => {
    setForm(BLANK)
    setErrors({})
    create.reset()
    onClose()
  }
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const found = validateClient({ ...form, postcode: '', country: 'Malaysia' })
    setErrors(found)
    if (Object.keys(found).length) return
    try {
      await create.mutateAsync({ ...form, name: form.name.trim(), email: form.email.trim(), contact: form.contact.trim(), registrationNo: form.registrationNo.trim() })
      close()
    } catch {
      // shown below via create.error
    }
  }
  const error = (key: keyof ClientErrors) => errors[key] && <span className="text-sm text-red-600 dark:text-red-400" role="alert">{errors[key]}</span>

  return (
    <Dialog open={open} onClose={close} title="Add client">
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Segmented<ClientType> label="Client type" value={form.type} onChange={(v) => set('type', v)} options={[['company', 'Company'], ['individual', 'Individual']]} />
        <Field label={company ? 'Company name' : 'Full name'}>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder={company ? 'e.g. Harbourline Logistics Sdn Bhd' : 'e.g. Wei Jie Ong'} aria-invalid={!!errors.name} className={input} />
          {error('name')}
        </Field>
        <Field label={company ? 'SSM registration no.' : 'NRIC / passport no.'}>
          <input value={form.registrationNo} onChange={(e) => set('registrationNo', e.target.value)} placeholder="Optional" className={input} />
        </Field>
        <Field label="Primary contact">
          <input value={form.contact} onChange={(e) => set('contact', e.target.value)} placeholder="Optional" className={input} />
        </Field>
        <div className="grid gap-1.5 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Phone</span>
          <PhoneField value={form.phone} onChange={(v) => set('phone', v)} invalid={!!errors.phone} />
          {error('phone')}
        </div>
        <Field label="Email">
          <input value={form.email} onChange={(e) => set('email', e.target.value)} type="email" placeholder="Optional" aria-invalid={!!errors.email} className={input} />
          {error('email')}
        </Field>
        <div className="grid gap-1.5 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Status</span>
          <div><StatusSelect status={form.status} onChange={(v) => set('status', v)} /></div>
        </div>
        <div className="grid gap-1.5 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Tags</span>
          <TagList tags={form.tags} onChange={(v) => set('tags', v)} />
        </div>
        <MutationError error={create.error} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btn.ghost} onClick={close}>Cancel</button>
          <button className={btn.primary} disabled={create.isPending}>Add client</button>
        </div>
      </form>
    </Dialog>
  )
}
