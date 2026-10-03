import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { periodPresets, today, type Kind, type Period } from './ledger'
import { parseAmount } from './data/mappers'
import { useMoney } from './data/money'
import { useBankAccounts, useClients, usePostTxn } from './data/queries'
import { useSession } from './data/session'

const PATHS = {
  grip: 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01',
  x: 'M18 6 6 18M6 6l12 12',
  back: 'm15 18-6-6 6-6',
  up: 'm18 15-6-6-6 6',
  down: 'm6 9 6 6 6-6',
  right: 'm9 18 6-6-6-6',
  download: 'M12 15V3M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5',
  upload: 'M12 3v12M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5',
  columns: 'M9 3v18M15 3v18M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2',
  plus: 'M5 12h14M12 5v14',
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  in: 'M17 7 7 17M17 17H7V7',
  out: 'M7 7h10v10M7 17 17 7',
  trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  resize: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  check: 'M20 6 9 17l-5-5',
  file: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7ZM14 2v4a2 2 0 0 0 2 2h4M16 13H8M16 17H8M10 9H8',
  printer: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  wallet: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5M16 14h.01',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
  phone:
    'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6',
  pencil: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z',
  building: 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18ZM6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4',
  person: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  layout: 'M12 3v18M3 12h18M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2',
  user: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
}

export function Icon({ name, className = 'size-4' }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Visible keyboard focus in light and dark; colour follows the firm's design system. */
export const ring = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-solid)]'

const THEME_CYCLE = { light: 'dark', dark: 'system', system: 'light' } as const
const THEME_ICON = { light: 'sun', dark: 'moon', system: 'monitor' } as const

/** Cycles light -> dark -> system -> light. Visible to every role, no permission gate. */
export function ThemeToggle({ theme, setTheme, className = '' }: { theme: keyof typeof THEME_CYCLE; setTheme: (value: keyof typeof THEME_CYCLE) => void; className?: string }) {
  return (
    <button
      type="button"
      className={`${btn.ghost} ${className}`}
      onClick={() => setTheme(THEME_CYCLE[theme])}
      aria-label={`Theme: ${theme}. Click to switch.`}
      title={`Theme: ${theme}`}
    >
      <Icon name={THEME_ICON[theme]} />
    </button>
  )
}

export const btn = {
  primary:
    `inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--brand-solid)] px-3.5 py-2 text-sm font-medium text-[var(--brand-solid-ink)] shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${ring}`,
  ghost:
    `inline-flex items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-30 ${ring} dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white`,
  danger:
    `inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 ${ring} dark:text-red-400 dark:hover:bg-red-950`,
}

/** Base field look without a width, for inline controls. */
export const field =
  'rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-xs outline-none transition placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-900/25 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-zinc-400 dark:focus:ring-white/30'

export const input = `w-full ${field}`

const AVATAR_TONES = [
  'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
]

export function Avatar({ name, size = 'size-8' }: { name: string; size?: string }) {
  const tone = AVATAR_TONES[[...name].reduce((h, ch) => h + ch.charCodeAt(0), 0) % AVATAR_TONES.length]
  const initials = name.split(/\s+/).filter((w) => /\w/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  return (
    <span className={`${size} ${tone} grid shrink-0 place-items-center rounded-full text-xs font-semibold`} aria-hidden>
      {initials}
    </span>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      {children}
    </label>
  )
}

/** Native <dialog>: focus trap, Esc and backdrop for free. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // React drops autoFocus before showModal runs, so honour an opt-in marker here.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={`${id}-title`}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white text-zinc-900 shadow-2xl backdrop:bg-zinc-950/40 backdrop:backdrop-blur-sm dark:bg-zinc-900 dark:text-zinc-100`}
    >
      {open && (
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <h2 id={`${id}-title`} className="text-base font-semibold">{title}</h2>
            <button type="button" className={btn.ghost} onClick={onClose} aria-label="Close dialog">
              <Icon name="x" />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-6">{children}</div>
        </div>
      )}
    </dialog>
  )
}

export function KindBadge({ kind }: { kind: Kind }) {
  return (
    <span
      className={`grid size-8 shrink-0 place-items-center rounded-full ${kind === 'in' ? 'bg-in/10 text-in' : 'bg-out/10 text-out'}`}
      aria-label={kind === 'in' ? 'Receipt' : 'Payment'}
    >
      <Icon name={kind} />
    </span>
  )
}

export function TxnForm({ clientId, onDone, autoFocus = false }: { clientId?: string; onDone?: () => void; autoFocus?: boolean }) {
  const { data: clients = [] } = useClients()
  const { data: banks = [] } = useBankAccounts()
  const post = usePostTxn()
  const { currency } = useMoney()
  const active = banks.filter((b) => b.isActive)
  const [kind, setKind] = useState<Kind>('in')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)
  const errorId = useId()
  const hasForm = active.length > 0 && (!!clientId || clients.length > 0)
  // Only when the caller asks (dialog/tab), never on page load.
  useEffect(() => {
    if (autoFocus && hasForm) amountRef.current?.focus()
  }, [autoFocus, hasForm])

  if (!clientId && clients.length === 0) {
    return <p className="text-sm text-zinc-500">Add a client before recording a transaction.</p>
  }
  if (active.length === 0) return <p className="text-sm text-zinc-500">Add a bank account in Settings before recording a transaction.</p>

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const amount = parseAmount(String(data.get('amount')))
    const target = clientId ?? String(data.get('clientId'))
    if (!amount.ok) return setError(amount.error)
    if (!target) return setError('Select a client.')
    try {
      await post.mutateAsync({ clientId: target, bankAccountId: String(data.get('bankAccountId')), kind, amount: amount.cents, date: String(data.get('date')) || today(), note: String(data.get('note')).trim() })
      form.reset()
      setError('')
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
      onDone?.()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3" noValidate>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800" role="radiogroup" aria-label="Transaction type">
        {(['in', 'out'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            tabIndex={kind === k ? 0 : -1}
            onClick={() => setKind(k)}
            onKeyDown={(e) => {
              if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return
              e.preventDefault()
              const next = k === 'in' ? 'out' : 'in'
              setKind(next)
              e.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-kind="${next}"]`)?.focus()
            }}
            data-kind={k}
            className={`${ring} flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition ${
              kind === k ? `bg-white shadow-sm dark:bg-zinc-950 ${k === 'in' ? 'text-in' : 'text-out'}` : 'text-zinc-500'
            }`}
          >
            <Icon name={k} className="size-3.5" /> {k === 'in' ? 'Receipt' : 'Payment'}
          </button>
        ))}
      </div>
      {!clientId && (
        <Field label="Client">
          <select name="clientId" className={input} defaultValue={clients[0]?.id}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Bank account">
        <select name="bankAccountId" className={input} defaultValue={active.find((b) => b.isDefault)?.id ?? active[0].id}>
          {active.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Amount (${currency})`}>
          <input ref={amountRef} name="amount" inputMode="decimal" placeholder="0.00" className={`${input} tabular-nums`} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} />
        </Field>
        <Field label="Transaction date">
          <input name="date" type="date" defaultValue={today()} max={today()} className={input} />
        </Field>
      </div>
      <Field label="Description">
        <input name="note" placeholder={kind === 'in' ? 'e.g. Retainer received' : 'e.g. Supplier invoice INV-1042'} className={input} />
      </Field>
      {error && (
        <p id={errorId} className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      <button className={btn.primary} disabled={post.isPending} aria-busy={post.isPending}>
        <Icon name={saved ? 'check' : 'plus'} /> {post.isPending ? 'Posting…' : saved ? 'Posted' : kind === 'in' ? 'Post receipt' : 'Post payment'}
      </button>
    </form>
  )
}

/** Per-viewer UI preference (view options, not data). Falls back silently when storage is unavailable. */
export function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Storage blocked (private mode): the preference just isn't remembered.
    }
  }, [key, value])
  return [value, setValue] as const
}

export type Sort<K extends string> = { key: K; dir: 'asc' | 'desc' }

/** Same column flips direction; a new column starts at its natural direction. */
export const nextSort = <K extends string>(sort: Sort<K>, key: K, firstDir: 'asc' | 'desc' = 'asc'): Sort<K> =>
  sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: firstDir }

export function PeriodPicker({ period, onChange, firstDate }: { period: Period; onChange: (period: Period) => void; firstDate: string }) {
  const { fyStartMonth } = useSession().firm
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Period">
        {periodPresets(firstDate, fyStartMonth).map((o) => {
          const active = o.period.from === period.from && o.period.to === period.to
          return (
            <button
              key={o.label}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.period)}
              className={`rounded-full border px-3 py-1 text-sm transition ${
                active
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900'
                  : 'border-zinc-200 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-2">
        <input type="date" aria-label="Period from" value={period.from} max={period.to} onChange={(e) => e.target.value && onChange({ ...period, from: e.target.value })} className={`${field} py-1.5`} />
        <span className="text-sm text-zinc-400">to</span>
        <input type="date" aria-label="Period to" value={period.to} min={period.from} max={today()} onChange={(e) => e.target.value && onChange({ ...period, to: e.target.value })} className={`${field} py-1.5`} />
      </div>
    </div>
  )
}
