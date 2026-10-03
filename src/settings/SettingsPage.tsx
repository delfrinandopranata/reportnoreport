import { useState, type ChangeEvent, type ReactNode } from 'react'
import { BillingPage } from './BillingPage'
import { useLogoUrl, useUpdateFirm, useUploadLogo } from '../data/queries'
import { useSession } from '../data/session'
import type { DesignSystem, Firm } from '../data/mappers'
import { btn, Dialog, Field, Icon, input, ring } from '../ui'
import { BankAccountsCard } from './BankAccounts'
import { DEFAULT_NOTE, LOGO_MAX_BYTES, MONTHS, STATES } from './constants'

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
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="min-w-0 break-words">{value || <span className="text-zinc-500 dark:text-zinc-400">Not set</span>}</dd>
    </div>
  )
}

/** A card that shows values, and swaps to a form with Save / Cancel when editing. */
function EditableCard<T>({
  title,
  blurb,
  value,
  disabledReason,
  view,
  form,
  onSave,
}: {
  title: string
  blurb: string
  value: T
  /** Null when editing is allowed; otherwise the tooltip explaining why not. */
  disabledReason: string | null
  view: (v: T) => ReactNode
  form: (draft: T, set: (patch: Partial<T>) => void) => ReactNode
  /** Resolves to an error message, or null when saved. */
  onSave: (draft: T) => Promise<string | null>
}) {
  const [draft, setDraft] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const id = title.toLowerCase().replace(/\W+/g, '-')

  const save = async () => {
    if (!draft || saving) return
    setSaving(true)
    const message = await onSave(draft).catch((e: Error) => e.message)
    setSaving(false)
    if (message) return setError(message)
    setDraft(null)
    setError('')
    setSaved(true)
    setTimeout(() => setSaved(false), 4000)
  }

  return (
    <section className={card} aria-labelledby={id}>
      <header className="flex flex-wrap items-start gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id={id} className="font-semibold">
            {title}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{blurb}</p>
        </div>
        <span className="self-center text-sm text-emerald-700 dark:text-emerald-400" role="status">
          {saved ? `${title} saved` : ''}
        </span>
        {!draft && (
          <button type="button" disabled={!!disabledReason} aria-describedby={disabledReason ? `${id}-why` : undefined} aria-label={`Edit ${title.toLowerCase()}`} className={`${btn.ghost} border border-zinc-200 dark:border-zinc-800`} onClick={() => (setDraft(value), setError(''))}>
            <Icon name="pencil" /> Edit
          </button>
        )}
      </header>
      {disabledReason && !draft && (
        <p id={`${id}-why`} className="border-b border-zinc-100 bg-zinc-50 px-5 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-400">
          Read-only. {disabledReason}
        </p>
      )}
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
              <button type="button" className={btn.ghost} disabled={saving} onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button className={btn.primary} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        ) : (
          <dl className="grid gap-3 text-sm">{view(value)}</dl>
        )}
      </div>
    </section>
  )
}

const Grid = ({ children }: { children: ReactNode }) => <div className="grid gap-4 sm:grid-cols-2">{children}</div>

type Org = Pick<Firm, 'name' | 'tradingName' | 'registrationNo' | 'sstNo' | 'phone' | 'email' | 'website' | 'address1' | 'address2' | 'postcode' | 'city' | 'state' | 'country'>
const ORG_KEYS: (keyof Org)[] = ['name', 'tradingName', 'registrationNo', 'sstNo', 'phone', 'email', 'website', 'address1', 'address2', 'postcode', 'city', 'state', 'country']

/** Uploads straight away: the file goes to storage, then the firm's logo path is updated. */
function LogoField({ logoPath }: { logoPath: string | null }) {
  const [error, setError] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const upload = useUploadLogo()
  const update = useUpdateFirm()
  const url = useLogoUrl(logoPath)
  const removeLogo = () => {
    setConfirmRemove(false)
    update.mutate({ logoPath: null }, { onError: (e) => setError(e.message) })
  }
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return setError('Choose an image file (PNG, JPG, SVG or WebP).')
    if (file.size > LOGO_MAX_BYTES) return setError(`That logo is ${Math.round(file.size / 1024)} KB. The limit is ${LOGO_MAX_BYTES / 1024} KB, so choose a smaller image.`)
    setError('')
    try {
      await upload.mutateAsync(file)
    } catch (err) {
      setError((err as Error).message)
    }
  }
  return (
    <div className="grid gap-2 text-sm">
      <span className="font-medium text-zinc-700 dark:text-zinc-300">Logo (optional)</span>
      <div className="flex flex-wrap items-center gap-3">
        {url && <img src={url} alt="Logo preview" onError={(e) => (e.currentTarget.hidden = true)} className="max-h-14 max-w-40 rounded border border-zinc-200 bg-white object-contain p-1 dark:border-zinc-700" />}
        <label className={`${btn.ghost} cursor-pointer border border-zinc-200 dark:border-zinc-800`}>
          <Icon name="upload" /> {upload.isPending ? 'Uploading…' : logoPath ? 'Replace' : 'Upload image'}
          <input type="file" accept="image/*" onChange={onFile} disabled={upload.isPending} className="sr-only" />
        </label>
        {logoPath && (
          <button type="button" className={btn.danger} disabled={update.isPending} onClick={() => setConfirmRemove(true)}>
            {update.isPending ? 'Removing…' : 'Remove logo'}
          </button>
        )}
        <span className="text-zinc-500 dark:text-zinc-400">PNG, JPG, SVG or WebP, up to {LOGO_MAX_BYTES / 1024} KB. Saved as soon as you choose it.</span>
      </div>
      <Err text={error} />
      <Dialog open={confirmRemove} onClose={() => setConfirmRemove(false)} title="Remove logo">
        <div className="grid gap-4 text-sm">
          <p>Remove your logo? It will no longer appear on statements until you upload a new one.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className={btn.ghost} onClick={() => setConfirmRemove(false)}>Cancel</button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg bg-red-700 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-red-800 disabled:opacity-40 dark:bg-red-600 dark:hover:bg-red-500"
              disabled={update.isPending}
              onClick={removeLogo}
            >
              {update.isPending ? 'Removing…' : 'Remove logo'}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

/** Writes only the fields that changed. */
function useSaveDiff<T extends Partial<Firm>>(keys: (keyof T)[], current: T) {
  const update = useUpdateFirm()
  return async (d: T) => {
    const diff = Object.fromEntries(keys.filter((k) => d[k] !== current[k]).map((k) => [k, d[k]])) as Partial<Firm>
    if (Object.keys(diff).length) await update.mutateAsync(diff)
    return null
  }
}

function OrganisationCard({ disabledReason }: { disabledReason: string | null }) {
  const { firm } = useSession()
  const logoUrl = useLogoUrl(firm.logoPath)
  const value = Object.fromEntries(ORG_KEYS.map((k) => [k, firm[k]])) as Org
  const save = useSaveDiff(ORG_KEYS, value)

  return (
    <EditableCard<Org>
      title="Organisation"
      blurb="Who you are. Shown at the top of every statement."
      value={value}
      disabledReason={disabledReason}
      view={(v) => (
        <>
          <Row label="Logo" value={logoUrl && <img src={logoUrl} alt="Logo" onError={(e) => (e.currentTarget.hidden = true)} className="max-h-14 max-w-40 object-contain" />} />
          <Row label="Legal name" value={v.name} />
          <Row label="Trading name" value={v.tradingName} />
          <Row label="SSM registration no." value={v.registrationNo} />
          <Row label="SST no." value={v.sstNo} />
          <Row label="Phone" value={v.phone} />
          <Row label="Email" value={v.email} />
          <Row label="Website" value={v.website} />
          <Row label="Address" value={[v.address1, v.address2, [v.postcode, v.city].filter(Boolean).join(' '), v.state, v.country].filter(Boolean).map((line) => <span key={line} className="block">{line}</span>)} />
        </>
      )}
      form={(d, set) => (
        <>
          <LogoField logoPath={firm.logoPath} />
          <Grid>
            <Field label="Legal name">
              <input value={d.name} onChange={(e) => set({ name: e.target.value })} className={input} />
            </Field>
            <Field label="Trading name">
              <input value={d.tradingName} onChange={(e) => set({ tradingName: e.target.value })} className={input} />
            </Field>
            <Field label="SSM registration no.">
              <input value={d.registrationNo} onChange={(e) => set({ registrationNo: e.target.value })} placeholder="e.g. 202401012345 (1234567-A)" className={input} />
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
      onSave={async (d) => {
        if (!d.name.trim()) return 'Enter the legal name.'
        if (d.email.trim() && !/^\S+@\S+\.\S+$/.test(d.email.trim())) return 'Enter a valid email address.'
        if (d.postcode.trim() && !/^\d{5}$/.test(d.postcode.trim())) return 'Enter a 5-digit postcode.'
        return save(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.trim()])) as Org)
      }}
    />
  )
}

const DESIGN_SYSTEMS: { key: DesignSystem; label: string; swatch: string }[] = [
  { key: 'default', label: 'Default', swatch: 'bg-zinc-900' },
  { key: 'ocean', label: 'Ocean', swatch: 'bg-blue-600' },
  { key: 'forest', label: 'Forest', swatch: 'bg-emerald-700' },
  { key: 'sunset', label: 'Sunset', swatch: 'bg-amber-700' },
]

/** Firm-wide brand colour (sidebar mark, primary buttons, active nav, focus ring) — same for everyone in the firm,
 * unlike each person's own light/dark theme choice. Saves immediately, like the logo. */
function DesignSystemCard({ disabledReason }: { disabledReason: string | null }) {
  const { firm } = useSession()
  const update = useUpdateFirm()
  return (
    <section className={card} aria-labelledby="design-system-heading">
      <header className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <h2 id="design-system-heading" className="font-semibold">
          Design system
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">The brand colour everyone in your firm sees, separate from each person's own light/dark theme.</p>
      </header>
      <div className="flex flex-wrap gap-3 p-5" role="radiogroup" aria-label="Design system">
        {DESIGN_SYSTEMS.map((d) => (
          <button
            key={d.key}
            type="button"
            role="radio"
            aria-checked={firm.designSystem === d.key}
            disabled={!!disabledReason || update.isPending}
            onClick={() => update.mutate({ designSystem: d.key })}
            className={`${ring} flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
              firm.designSystem === d.key ? 'border-zinc-900 dark:border-white' : 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-700'
            }`}
          >
            <span className={`size-4 shrink-0 rounded-full ${d.swatch}`} aria-hidden />
            {d.label}
          </button>
        ))}
      </div>
    </section>
  )
}

type Stmt = Pick<Firm, 'statementNote' | 'discrepancyDays' | 'showRegistrationOnStatement'>
const STMT_KEYS: (keyof Stmt)[] = ['statementNote', 'discrepancyDays', 'showRegistrationOnStatement']

function StatementsCard({ disabledReason }: { disabledReason: string | null }) {
  const { firm } = useSession()
  const value = Object.fromEntries(STMT_KEYS.map((k) => [k, firm[k]])) as Stmt
  const save = useSaveDiff(STMT_KEYS, value)
  return (
    <EditableCard<Stmt>
      title="Statements"
      blurb="The footer and registration details printed on statements."
      value={value}
      disabledReason={disabledReason}
      view={(v) => (
        <>
          <Row label="Footer note" value={v.statementNote.replace('{days}', String(v.discrepancyDays))} />
          <Row label="Discrepancy period" value={`${v.discrepancyDays} days`} />
          <Row label="Registration no." value={v.showRegistrationOnStatement ? 'Shown on statements' : 'Hidden'} />
        </>
      )}
      form={(d, set) => (
        <>
          <Field label="Footer note">
            <textarea value={d.statementNote} rows={3} onChange={(e) => set({ statementNote: e.target.value })} className={input} />
            <span className="text-zinc-500 dark:text-zinc-400">
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
              <input type="checkbox" checked={d.showRegistrationOnStatement} onChange={(e) => set({ showRegistrationOnStatement: e.target.checked })} className="size-4 accent-zinc-900" />
              Show registration no. on statements
            </label>
          </Grid>
        </>
      )}
      onSave={async (d) => {
        if (!d.statementNote.trim()) return 'Enter a footer note.'
        if (!Number.isInteger(d.discrepancyDays) || d.discrepancyDays < 1 || d.discrepancyDays > 365) return 'Enter a whole number of days from 1 to 365.'
        return save({ ...d, statementNote: d.statementNote.trim() })
      }}
    />
  )
}

type Regional = Pick<Firm, 'dateFormat' | 'fyStartMonth'>
const REGIONAL_KEYS: (keyof Regional)[] = ['dateFormat', 'fyStartMonth']
const DATE_LABEL: Record<Firm['dateFormat'], string> = { text: '3 Oct 2026', numeric: '03/10/2026' }

function RegionalCard({ disabledReason }: { disabledReason: string | null }) {
  const { firm } = useSession()
  const value: Regional = { dateFormat: firm.dateFormat, fyStartMonth: firm.fyStartMonth }
  const save = useSaveDiff(REGIONAL_KEYS, value)
  return (
    <EditableCard<Regional>
      title="Regional"
      blurb="Currency and how dates and the financial year are shown."
      value={value}
      disabledReason={disabledReason}
      view={(v) => (
        <>
          <Row label="Currency" value={firm.currency} />
          <Row label="Date format" value={DATE_LABEL[v.dateFormat]} />
          <Row label="Financial year starts" value={MONTHS[v.fyStartMonth - 1]} />
        </>
      )}
      form={(d, set) => (
        <>
          <Field label="Currency">
            <input value={firm.currency} readOnly aria-readonly className={`${input} bg-zinc-50 text-zinc-500 dark:bg-zinc-800/50`} />
            <span className="text-zinc-500 dark:text-zinc-400">Set when your firm was created. It can't change once transactions exist.</span>
          </Field>
          <Grid>
            <Field label="Date format">
              <select value={d.dateFormat} onChange={(e) => set({ dateFormat: e.target.value as Firm['dateFormat'] })} className={input}>
                {(Object.keys(DATE_LABEL) as Firm['dateFormat'][]).map((k) => (
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
      onSave={save}
    />
  )
}

function DataCard() {
  return (
    <section className={card} aria-labelledby="data-heading">
      <header className="px-5 py-4">
        <h2 id="data-heading" className="font-semibold">
          Data
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Your data is stored securely on our servers and backed up daily. Nothing to set up here.</p>
      </header>
    </section>
  )
}

export function SettingsPage() {
  const s = useSession()
  const disabledReason = s.can('settings.manage') && s.canWrite ? null : (s.writeBlockReason ?? "Your role can't change settings")
  return (
    <div className="grid max-w-3xl grid-cols-1 gap-6">
      <BillingPage />
      <OrganisationCard disabledReason={disabledReason} />
      <DesignSystemCard disabledReason={disabledReason} />
      <BankAccountsCard />
      <StatementsCard disabledReason={disabledReason} />
      <RegionalCard disabledReason={disabledReason} />
      <DataCard />
    </div>
  )
}
