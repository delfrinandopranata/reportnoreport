import { useState, type ChangeEvent, type ReactNode } from 'react'
import { useStore } from '../store'
import { fillClient } from '../ledger'
import { can } from '../users/rules'
import { useCurrentUser, useUsers } from '../users/store'
import { btn, Field, Icon, input } from '../ui'
import { makeBackup, parseBackup, type Backup } from './backup'
import { DEFAULT_NOTE, LOGO_MAX_BYTES, MONTHS, STATES, useSettings, type DateFormat, type Settings } from './store'

const card = 'rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900'

const Err = ({ text }: { text: string }) =>
  text ? (
    <p className="text-sm text-red-600 dark:text-red-400" role="alert">
      {text}
    </p>
  ) : null

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="break-words">{value || <span className="text-zinc-400">Not set</span>}</dd>
    </div>
  )
}

/** A card that shows values, and swaps to a form with Save / Cancel when editing. */
function EditableCard<T>({
  title,
  blurb,
  value,
  canEdit,
  view,
  form,
  onSave,
}: {
  title: string
  blurb: string
  value: T
  canEdit: boolean
  view: (v: T) => ReactNode
  form: (draft: T, set: (patch: Partial<T>) => void) => ReactNode
  /** Returns an error message, or null when saved. */
  onSave: (draft: T) => string | null
}) {
  const [draft, setDraft] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const id = title.toLowerCase().replace(/\W+/g, '-')

  const save = () => {
    if (!draft) return
    const message = onSave(draft)
    if (message) return setError(message)
    setDraft(null)
    setError('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <section className={card} aria-labelledby={id}>
      <header className="flex flex-wrap items-start gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <div className="mr-auto">
          <h2 id={id} className="font-semibold">
            {title}
          </h2>
          <p className="text-sm text-zinc-500">{blurb}</p>
        </div>
        {saved && (
          <span className="self-center text-sm text-emerald-700 dark:text-emerald-400" role="status">
            Saved
          </span>
        )}
        {canEdit && !draft && (
          <button type="button" className={`${btn.ghost} border border-zinc-200 dark:border-zinc-800`} onClick={() => (setDraft(value), setError(''))}>
            Edit
          </button>
        )}
      </header>
      <div className="p-5">
        {draft ? (
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            {form(draft, (patch) => setDraft({ ...draft, ...patch }))}
            <Err text={error} />
            <div className="flex justify-end gap-2">
              <button type="button" className={btn.ghost} onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button className={btn.primary}>Save</button>
            </div>
          </form>
        ) : (
          <dl className="grid gap-2.5 text-sm">{view(value)}</dl>
        )}
      </div>
    </section>
  )
}

const Grid = ({ children }: { children: ReactNode }) => <div className="grid gap-4 sm:grid-cols-2">{children}</div>

type Org = Pick<Settings, 'tradingName' | 'ssmNo' | 'sstNo' | 'phone' | 'email' | 'website' | 'address1' | 'address2' | 'postcode' | 'city' | 'state' | 'country' | 'logo'> & { legalName: string }

function LogoField({ logo, onChange }: { logo: string; onChange: (logo: string) => void }) {
  const [error, setError] = useState('')
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return setError('Choose an image file (PNG, JPG, SVG or WebP).')
    if (file.size > LOGO_MAX_BYTES) return setError(`That logo is ${Math.round(file.size / 1024)} KB. The limit is ${LOGO_MAX_BYTES / 1024} KB, so choose a smaller image.`)
    const reader = new FileReader()
    reader.onload = () => (setError(''), onChange(String(reader.result)))
    reader.onerror = () => setError('That file couldn’t be read. Try again.')
    reader.readAsDataURL(file)
  }
  return (
    <div className="grid gap-2 text-sm">
      <span className="font-medium text-zinc-700 dark:text-zinc-300">Logo (optional)</span>
      <div className="flex flex-wrap items-center gap-3">
        {logo && <img src={logo} alt="Logo preview" className="max-h-14 max-w-40 rounded border border-zinc-200 bg-white object-contain p-1 dark:border-zinc-700" />}
        <label className={`${btn.ghost} cursor-pointer border border-zinc-200 dark:border-zinc-800`}>
          <Icon name="upload" /> {logo ? 'Replace' : 'Upload image'}
          <input type="file" accept="image/*" onChange={onFile} className="sr-only" />
        </label>
        {logo && (
          <button type="button" className={btn.danger} onClick={() => onChange('')}>
            Remove
          </button>
        )}
        <span className="text-zinc-500">Up to {LOGO_MAX_BYTES / 1024} KB.</span>
      </div>
      <Err text={error} />
    </div>
  )
}

function OrganisationCard({ canEdit }: { canEdit: boolean }) {
  const legalName = useStore((s) => s.businessName)
  const setBusinessName = useStore((s) => s.setBusinessName)
  const s = useSettings()
  const value: Org = { legalName, tradingName: s.tradingName, ssmNo: s.ssmNo, sstNo: s.sstNo, phone: s.phone, email: s.email, website: s.website, address1: s.address1, address2: s.address2, postcode: s.postcode, city: s.city, state: s.state, country: s.country, logo: s.logo }

  return (
    <EditableCard<Org>
      title="Organisation"
      blurb="Who you are. Shown at the top of every statement."
      value={value}
      canEdit={canEdit}
      view={(v) => (
        <>
          <Row label="Logo" value={v.logo && <img src={v.logo} alt="Logo" className="max-h-14 max-w-40 object-contain" />} />
          <Row label="Legal name" value={v.legalName} />
          <Row label="Trading name" value={v.tradingName} />
          <Row label="SSM registration no." value={v.ssmNo} />
          <Row label="SST no." value={v.sstNo} />
          <Row label="Phone" value={v.phone} />
          <Row label="Email" value={v.email} />
          <Row label="Website" value={v.website} />
          <Row label="Address" value={[v.address1, v.address2, [v.postcode, v.city].filter(Boolean).join(' '), v.state, v.country].filter(Boolean).map((line) => <span key={line} className="block">{line}</span>)} />
        </>
      )}
      form={(d, set) => (
        <>
          <LogoField logo={d.logo} onChange={(logo) => set({ logo })} />
          <Grid>
            <Field label="Legal name">
              <input value={d.legalName} onChange={(e) => set({ legalName: e.target.value })} className={input} />
            </Field>
            <Field label="Trading name">
              <input value={d.tradingName} onChange={(e) => set({ tradingName: e.target.value })} className={input} />
            </Field>
            <Field label="SSM registration no.">
              <input value={d.ssmNo} onChange={(e) => set({ ssmNo: e.target.value })} placeholder="e.g. 202401012345 (1234567-A)" className={input} />
            </Field>
            <Field label="SST no. (optional)">
              <input value={d.sstNo} onChange={(e) => set({ sstNo: e.target.value })} className={input} />
            </Field>
            <Field label="Phone">
              <input type="tel" value={d.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+60 3-1234 5678" className={input} />
            </Field>
            <Field label="Email">
              <input type="email" value={d.email} onChange={(e) => set({ email: e.target.value })} className={input} />
            </Field>
            <Field label="Website">
              <input value={d.website} onChange={(e) => set({ website: e.target.value })} placeholder="www.example.com.my" className={input} />
            </Field>
          </Grid>
          <Field label="Address line 1">
            <input value={d.address1} onChange={(e) => set({ address1: e.target.value })} className={input} />
          </Field>
          <Field label="Address line 2">
            <input value={d.address2} onChange={(e) => set({ address2: e.target.value })} className={input} />
          </Field>
          <Grid>
            <Field label="Postcode">
              <input value={d.postcode} inputMode="numeric" maxLength={5} onChange={(e) => set({ postcode: e.target.value })} className={input} />
            </Field>
            <Field label="City">
              <input value={d.city} onChange={(e) => set({ city: e.target.value })} className={input} />
            </Field>
            <Field label="State">
              <select value={d.state} onChange={(e) => set({ state: e.target.value })} className={input}>
                <option value="">Select a state</option>
                {STATES.map((st) => (
                  <option key={st}>{st}</option>
                ))}
              </select>
            </Field>
            <Field label="Country">
              <input value={d.country} onChange={(e) => set({ country: e.target.value })} className={input} />
            </Field>
          </Grid>
        </>
      )}
      onSave={(d) => {
        if (!d.legalName.trim()) return 'Enter the legal name.'
        if (d.email.trim() && !/^\S+@\S+\.\S+$/.test(d.email.trim())) return 'Enter a valid email address.'
        if (d.postcode.trim() && !/^\d{5}$/.test(d.postcode.trim())) return 'Enter a 5-digit postcode.'
        const { legalName: name, ...rest } = d
        setBusinessName(name.trim())
        s.update(Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, typeof v === 'string' && k !== 'logo' ? v.trim() : v])))
        return null
      }}
    />
  )
}

type Stmt = Pick<Settings, 'statementNote' | 'discrepancyDays' | 'showRegNo' | 'bankName' | 'bankAccountName' | 'bankAccountNo'>

function StatementsCard({ canEdit }: { canEdit: boolean }) {
  const s = useSettings()
  const value: Stmt = { statementNote: s.statementNote, discrepancyDays: s.discrepancyDays, showRegNo: s.showRegNo, bankName: s.bankName, bankAccountName: s.bankAccountName, bankAccountNo: s.bankAccountNo }
  return (
    <EditableCard<Stmt>
      title="Statements"
      blurb="The footer, registration details and bank account printed on statements."
      value={value}
      canEdit={canEdit}
      view={(v) => (
        <>
          <Row label="Footer note" value={v.statementNote.replace('{days}', String(v.discrepancyDays))} />
          <Row label="Discrepancy period" value={`${v.discrepancyDays} days`} />
          <Row label="Registration no." value={v.showRegNo ? 'Shown on statements' : 'Hidden'} />
          <Row label="Bank" value={v.bankName} />
          <Row label="Account name" value={v.bankAccountName} />
          <Row label="Account no." value={v.bankAccountNo} />
        </>
      )}
      form={(d, set) => (
        <>
          <Field label="Footer note">
            <textarea value={d.statementNote} rows={3} onChange={(e) => set({ statementNote: e.target.value })} className={input} />
            <span className="text-zinc-500">
              Use <code>{'{days}'}</code> where the discrepancy period should appear.{' '}
              <button type="button" className="underline" onClick={() => set({ statementNote: DEFAULT_NOTE })}>
                Use the default
              </button>
            </span>
          </Field>
          <Grid>
            <Field label="Discrepancy period (days)">
              <input type="number" min={1} max={365} value={d.discrepancyDays} onChange={(e) => set({ discrepancyDays: Number(e.target.value) })} className={input} />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={d.showRegNo} onChange={(e) => set({ showRegNo: e.target.checked })} className="size-4 accent-zinc-900" />
              Show registration no. on statements
            </label>
          </Grid>
          <Grid>
            <Field label="Bank name">
              <input value={d.bankName} onChange={(e) => set({ bankName: e.target.value })} placeholder="e.g. Maybank" className={input} />
            </Field>
            <Field label="Account name">
              <input value={d.bankAccountName} onChange={(e) => set({ bankAccountName: e.target.value })} className={input} />
            </Field>
            <Field label="Account no.">
              <input value={d.bankAccountNo} inputMode="numeric" onChange={(e) => set({ bankAccountNo: e.target.value })} className={input} />
            </Field>
          </Grid>
          <p className="text-sm text-zinc-500">Bank details appear on statements once an account number is set.</p>
        </>
      )}
      onSave={(d) => {
        if (!d.statementNote.trim()) return 'Enter a footer note.'
        if (!Number.isInteger(d.discrepancyDays) || d.discrepancyDays < 1 || d.discrepancyDays > 365) return 'Enter a whole number of days from 1 to 365.'
        s.update({ ...d, statementNote: d.statementNote.trim(), bankName: d.bankName.trim(), bankAccountName: d.bankAccountName.trim(), bankAccountNo: d.bankAccountNo.trim() })
        return null
      }}
    />
  )
}

type Regional = Pick<Settings, 'dateFormat' | 'fyStartMonth'>
const DATE_LABEL: Record<DateFormat, string> = { text: '3 Oct 2026', numeric: '03/10/2026' }

function RegionalCard({ canEdit }: { canEdit: boolean }) {
  const s = useSettings()
  return (
    <EditableCard<Regional>
      title="Regional"
      blurb="Currency and how dates and the financial year are shown."
      value={{ dateFormat: s.dateFormat, fyStartMonth: s.fyStartMonth }}
      canEdit={canEdit}
      view={(v) => (
        <>
          <Row label="Currency" value="Malaysian Ringgit (MYR, RM)" />
          <Row label="Date format" value={DATE_LABEL[v.dateFormat]} />
          <Row label="Financial year starts" value={MONTHS[v.fyStartMonth - 1]} />
        </>
      )}
      form={(d, set) => (
        <>
          <Field label="Currency">
            <input value="Malaysian Ringgit (MYR, RM)" readOnly aria-readonly className={`${input} bg-zinc-50 text-zinc-500 dark:bg-zinc-800/50`} />
          </Field>
          <Grid>
            <Field label="Date format">
              <select value={d.dateFormat} onChange={(e) => set({ dateFormat: e.target.value as DateFormat })} className={input}>
                {(Object.keys(DATE_LABEL) as DateFormat[]).map((k) => (
                  <option key={k} value={k}>
                    {DATE_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Financial year starts">
              <select value={d.fyStartMonth} onChange={(e) => set({ fyStartMonth: Number(e.target.value) })} className={input}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
          </Grid>
        </>
      )}
      onSave={(d) => (s.update(d), null)}
    />
  )
}

function DataCard({ canEdit }: { canEdit: boolean }) {
  const [pending, setPending] = useState<{ fileName: string; backup: Backup } | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const exportBackup = () => {
    const { businessName, clients, txns, widgets } = useStore.getState()
    const { users, currentUserId } = useUsers.getState()
    const settings = readStoredSettings()
    const backup = makeBackup({ main: { businessName, clients, txns, widgets }, users: { users, currentUserId }, settings })
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
    Object.assign(document.createElement('a'), { href: url, download: `platform-backup-${backup.exportedAt.slice(0, 10)}.json` }).click()
    URL.revokeObjectURL(url)
    setDone('Backup downloaded. Keep it somewhere safe: it contains all client and team data.')
    setError('')
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setDone('')
    const result = parseBackup(await file.text())
    if (!result.ok) return (setPending(null), setError(result.error))
    setError('')
    setPending({ fileName: file.name, backup: result.backup })
  }

  const restore = () => {
    if (!pending) return
    const { main, users, settings } = pending.backup
    useStore.setState({ businessName: main.businessName, clients: main.clients.map((c) => fillClient(c)), txns: main.txns, widgets: main.widgets as ReturnType<typeof useStore.getState>['widgets'] })
    // A restore is a deliberate reset, so it isn't an undo step.
    useStore.temporal.getState().clear()
    useUsers.getState().replaceAll(users.users, users.currentUserId)
    useSettings.getState().replaceAll(settings)
    setPending(null)
    setDone('Backup restored.')
  }

  const b = pending?.backup
  return (
    <section className={card} aria-labelledby="data-heading">
      <header className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <h2 id="data-heading" className="font-semibold">
          Data
        </h2>
        <p className="text-sm text-zinc-500">Back up everything on this device (clients, transactions, team and settings), or restore from a backup file.</p>
      </header>
      <div className="grid gap-4 p-5 text-sm">
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btn.primary} onClick={exportBackup}>
              <Icon name="download" /> Export backup
            </button>
            <label className={`${btn.ghost} cursor-pointer border border-zinc-200 dark:border-zinc-800`}>
              <Icon name="upload" /> Restore from file
              <input type="file" accept=".json,application/json" onChange={onFile} className="sr-only" />
            </label>
          </div>
        ) : (
          <p className="text-zinc-500">Only an owner or admin can export or restore data.</p>
        )}
        {done && (
          <p className="rounded-lg bg-emerald-50 p-3 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" role="status">
            {done}
          </p>
        )}
        <Err text={error} />
        {b && (
          <div className="grid gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="font-medium">
              {pending.fileName} <span className="font-normal text-zinc-500">exported {b.exportedAt.slice(0, 10)}</span>
            </p>
            <p>
              Contains {b.main.clients.length} clients, {b.main.txns.length} transactions and {b.users.users.length} team members.{' '}
              <b>Restoring replaces all current data on this device and can’t be undone.</b>
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className={btn.ghost} onClick={() => setPending(null)}>
                Cancel
              </button>
              <button type="button" className={btn.primary} onClick={restore}>
                Replace data and restore
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/** Only the persisted fields, never the store's action functions. */
function readStoredSettings(): Settings {
  const s = useSettings.getState()
  const { update: _u, replaceAll: _r, ...data } = s
  return data
}

export function SettingsPage() {
  const me = useCurrentUser()
  const canEdit = can(me.role, 'settings.manage')
  return (
    <div className="grid max-w-3xl grid-cols-1 gap-6">
      {!canEdit && <p className="text-sm font-medium text-amber-700 dark:text-amber-400">You’re viewing as a {me.role}. Only an owner or admin can edit settings.</p>}
      <OrganisationCard canEdit={canEdit} />
      <StatementsCard canEdit={canEdit} />
      <RegionalCard canEdit={canEdit} />
      <DataCard canEdit={canEdit} />
    </div>
  )
}
