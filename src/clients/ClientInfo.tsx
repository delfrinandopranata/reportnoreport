import { useState, type FormEvent, type ReactNode } from 'react'
import { accountNo, COUNTRIES, formatPhone, MY_STATES, validateClient, type Client, type ClientErrors } from '../ledger'
import { Attachments } from '../attachments/Attachments'
import { useUpdateClient } from '../data/queries'
import { btn, Field, input } from '../ui'
import { AssigneeSelect, PhoneField, StatusSelect, TagList } from './fields'
import { card, MutationError, shortDate } from './shared'

function Row({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  )
}

const link = 'text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900 dark:text-white dark:decoration-zinc-600'
const idLabel = (c: Pick<Client, 'type'>) => (c.type === 'company' ? 'SSM registration no.' : 'NRIC / passport no.')

/** Read-only details for the header card; empty fields are omitted. */
export function ClientDetails({ client: c }: { client: Client }) {
  const website = c.website && (/^https?:\/\//.test(c.website) ? c.website : `https://${c.website}`)
  const address = [c.address1, c.address2, [c.postcode, c.city].filter(Boolean).join(' '), c.state, c.country].filter(Boolean)
  const rows: { label: string; value: ReactNode; wide?: boolean }[] = [
    { label: 'Type', value: c.type === 'company' ? 'Company' : 'Individual' },
    { label: idLabel(c), value: c.registrationNo },
    { label: 'Client ID', value: c.clientCode },
    { label: 'Industry', value: c.industry },
    { label: 'Website', value: website && <a href={website} target="_blank" rel="noreferrer" className={link}>{c.website}</a> },
    { label: 'Account no.', value: <span className="tabular-nums">{accountNo(c.id)}</span> },
    { label: 'Client since', value: shortDate(c.createdAt) },
    { label: 'Contact name', value: c.contact },
    { label: 'Phone', value: c.phone && <a href={`tel:${c.phone}`} className={`${link} tabular-nums`}>{formatPhone(c.phone)}</a> },
    { label: 'Email', value: c.email && <a href={`mailto:${c.email}`} className={link}>{c.email}</a> },
    { label: 'Address', value: address.length > 0 && address.map((line) => <span key={line} className="block">{line}</span>), wide: true },
    { label: 'Notes', value: c.notes && <span className="whitespace-pre-wrap">{c.notes}</span>, wide: true },
  ]
  return (
    <dl className="grid gap-x-6 gap-y-4 border-t border-zinc-100 pt-4 sm:grid-cols-2 lg:grid-cols-3 dark:border-zinc-800">
      {rows.filter((r) => r.value).map((r) => <Row key={r.label} label={r.label} wide={r.wide}>{r.value}</Row>)}
    </dl>
  )
}

export function ClientAttachments({ client: c }: { client: Client }) {
  return (
    <section className={`${card} min-w-0 p-5 print:hidden`}>
      <h2 className="mb-4 text-sm font-medium text-zinc-500">Attachments</h2>
      <Attachments clientId={c.id} />
    </section>
  )
}

type Draft = Omit<Client, 'id' | 'createdAt' | 'updatedAt'>

export function ClientForm({ client, onDone }: { client: Client; onDone: () => void }) {
  const update = useUpdateClient()
  const { id: _id, createdAt: _created, updatedAt: _updated, ...initial } = client
  const [draft, setDraft] = useState<Draft>(initial)
  const [errors, setErrors] = useState<ClientErrors>({})
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const malaysia = draft.country === 'Malaysia'
  const countries = COUNTRIES.includes(draft.country) ? COUNTRIES : [draft.country, ...COUNTRIES]

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const found = validateClient(draft)
    setErrors(found)
    if (Object.keys(found).length) return
    const clean = { ...draft, name: draft.name.trim(), email: draft.email.trim(), postcode: draft.postcode.trim() }
    // An untouched form isn't a change. On conflict the form stays open with the message.
    try {
      if (JSON.stringify(clean) !== JSON.stringify(initial)) await update.mutateAsync({ id: client.id, patch: clean, loadedUpdatedAt: client.updatedAt })
      onDone()
    } catch {
      // shown below via update.error
    }
  }
  const error = (key: keyof ClientErrors) => errors[key] && <span className="text-sm text-red-600 dark:text-red-400" role="alert">{errors[key]}</span>
  const text = (key: 'registrationNo' | 'clientCode' | 'industry' | 'website' | 'contact' | 'address1' | 'address2' | 'city', placeholder = '') => (
    <input value={draft[key]} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} className={input} />
  )

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6" aria-label="Edit client">
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className={`${card} grid gap-4 p-5 sm:grid-cols-2`}>
          <h2 className="text-sm font-medium text-zinc-500 sm:col-span-2">{draft.type === 'company' ? 'Company details' : 'Individual details'}</h2>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">Type</legend>
            <div className="flex gap-4 text-sm">
              {(['company', 'individual'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2">
                  <input type="radio" name="type" checked={draft.type === t} onChange={() => set('type', t)} className="accent-zinc-900" />
                  {t === 'company' ? 'Company' : 'Individual'}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="sm:col-span-2">
            <Field label={draft.type === 'company' ? 'Company name' : 'Full name'}>
              <input value={draft.name} onChange={(e) => set('name', e.target.value)} autoFocus aria-invalid={!!errors.name} className={input} />
              {error('name')}
            </Field>
          </div>
          <Field label={idLabel(draft)}>{text('registrationNo')}</Field>
          <Field label="Client ID">{text('clientCode')}</Field>
          <Field label="Industry">{text('industry')}</Field>
          <div className="sm:col-span-2"><Field label="Website">{text('website', 'example.com.my')}</Field></div>
        </section>

        <section className={`${card} grid gap-4 p-5 sm:grid-cols-2`}>
          <h2 className="text-sm font-medium text-zinc-500 sm:col-span-2">Primary contact</h2>
          <div className="sm:col-span-2"><Field label="Contact name">{text('contact')}</Field></div>
          <div className="grid gap-1.5 text-sm sm:col-span-2">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Phone</span>
            <PhoneField value={draft.phone} onChange={(v) => set('phone', v)} invalid={!!errors.phone} />
            {error('phone')}
          </div>
          <div className="sm:col-span-2">
            <Field label="Email">
              <input type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} aria-invalid={!!errors.email} className={input} />
              {error('email')}
            </Field>
          </div>
        </section>

        <section className={`${card} grid gap-4 p-5 sm:grid-cols-2`}>
          <h2 className="text-sm font-medium text-zinc-500 sm:col-span-2">Address</h2>
          <div className="sm:col-span-2"><Field label="Address line 1">{text('address1')}</Field></div>
          <div className="sm:col-span-2"><Field label="Address line 2">{text('address2')}</Field></div>
          <Field label="City">{text('city')}</Field>
          <Field label="State">
            {malaysia ? (
              <select value={draft.state} onChange={(e) => set('state', e.target.value)} className={input}>
                <option value="">Select state</option>
                {MY_STATES.map((s) => <option key={s}>{s}</option>)}
              </select>
            ) : (
              <input value={draft.state} onChange={(e) => set('state', e.target.value)} className={input} />
            )}
          </Field>
          <Field label="Postcode">
            <input value={draft.postcode} onChange={(e) => set('postcode', e.target.value)} inputMode="numeric" aria-invalid={!!errors.postcode} className={`${input} tabular-nums`} />
            {error('postcode')}
          </Field>
          <Field label="Country">
            <select
              value={draft.country}
              onChange={(e) => setDraft((d) => ({ ...d, country: e.target.value, state: e.target.value === 'Malaysia' && !MY_STATES.includes(d.state) ? '' : d.state }))}
              className={input}
            >
              {countries.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </section>

        <section className={`${card} grid gap-4 p-5 sm:grid-cols-2`}>
          <h2 className="text-sm font-medium text-zinc-500 sm:col-span-2">Account</h2>
          <div className="grid gap-1.5 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Status</span>
            <div><StatusSelect status={draft.status} onChange={(v) => set('status', v)} /></div>
          </div>
          <div className="grid gap-1.5 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Assigned member</span>
            <AssigneeSelect value={draft.assignedUserId} onChange={(v) => set('assignedUserId', v)} />
          </div>
          <div className="grid gap-1.5 text-sm sm:col-span-2">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Tags</span>
            <TagList tags={draft.tags} onChange={(v) => set('tags', v)} />
          </div>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <textarea value={draft.notes} onChange={(e) => set('notes', e.target.value)} rows={4} className={input} />
            </Field>
          </div>
        </section>
      </div>
      <MutationError error={update.error} />
      <div className="flex justify-end gap-2">
        <button type="button" className={btn.ghost} onClick={onDone}>Cancel</button>
        <button className={btn.primary} disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save changes'}</button>
      </div>
    </form>
  )
}
