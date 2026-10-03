import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { parseCents, today, type Kind } from './ledger'
import { useStore } from './store'

const PATHS = {
  grip: 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01',
  x: 'M18 6 6 18M6 6l12 12',
  back: 'm15 18-6-6 6-6',
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'm15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  plus: 'M5 12h14M12 5v14',
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  in: 'M17 7 7 17M17 17H7V7',
  out: 'M7 7h10v10M7 17 17 7',
  trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  resize: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  check: 'M20 6 9 17l-5-5',
  wallet: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5M16 14h.01',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
  layout: 'M12 3v18M3 12h18M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2',
}

export function Icon({ name, className = 'size-4' }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  )
}

export const btn = {
  primary:
    'inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200',
  ghost:
    'inline-flex items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:pointer-events-none disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white',
  danger:
    'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950',
}

export const input =
  'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-xs outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-zinc-600 dark:focus:ring-white/5'

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
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white text-zinc-900 shadow-2xl backdrop:bg-zinc-950/40 backdrop:backdrop-blur-sm dark:bg-zinc-900 dark:text-zinc-100`}
    >
      {open && (
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <h2 className="text-base font-semibold">{title}</h2>
            <button type="button" className={btn.ghost} onClick={onClose} aria-label="Close">
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

export function TxnForm({ clientId, onDone }: { clientId?: string; onDone?: () => void }) {
  const clients = useStore((s) => s.clients)
  const addTxn = useStore((s) => s.addTxn)
  const [kind, setKind] = useState<Kind>('in')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  if (!clientId && clients.length === 0) {
    return <p className="text-sm text-zinc-500">Add a client before recording a transaction.</p>
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const amount = parseCents(String(data.get('amount')))
    const target = clientId ?? String(data.get('clientId'))
    if (amount === null) return setError('Enter an amount greater than 0, up to 2 decimal places.')
    if (!target) return setError('Select a client.')
    addTxn({ clientId: target, kind, amount, date: String(data.get('date')) || today(), note: String(data.get('note')).trim() })
    form.reset()
    setError('')
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
    onDone?.()
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
            onClick={() => setKind(k)}
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition ${
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (SGD)">
          <input name="amount" inputMode="decimal" placeholder="0.00" className={`${input} tabular-nums`} aria-invalid={!!error} />
        </Field>
        <Field label="Transaction date">
          <input name="date" type="date" defaultValue={today()} max={today()} className={input} />
        </Field>
      </div>
      <Field label="Description">
        <input name="note" placeholder={kind === 'in' ? 'e.g. Retainer received' : 'e.g. Supplier invoice INV-1042'} className={input} />
      </Field>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      <button className={btn.primary}>
        <Icon name={saved ? 'check' : 'plus'} /> {saved ? 'Posted' : kind === 'in' ? 'Post receipt' : 'Post payment'}
      </button>
    </form>
  )
}
