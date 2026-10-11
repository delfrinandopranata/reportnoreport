import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { periodPresets, today, type Kind, type Period } from './ledger'
import { parseAmount } from './data/mappers'
import { useMoney } from './data/money'
import { useBankAccounts, useClients, usePostTxn } from './data/queries'
import { useSession } from './data/session'

import sprite from '../v2/design/icons/sprite.svg?url'

/** v1 icon names -> Phosphor regular ids in v2/design/icons/sprite.svg (docs/superpowers/design/v1-screens.md). */
const GLYPH = {
  grip: 'dots-six-vertical', x: 'x', back: 'arrow-left', up: 'caret-up', down: 'caret-down', right: 'caret-right',
  download: 'download-simple', upload: 'upload-simple', columns: 'columns', plus: 'plus', dashboard: 'squares-four', users: 'users-three',
  in: 'arrow-down-left', out: 'arrow-up-right', trash: 'trash', resize: 'arrows-out-simple', check: 'check', file: 'file-text',
  printer: 'printer', wallet: 'wallet', search: 'magnifying-glass', phone: 'phone', mail: 'envelope-simple', pencil: 'pencil-simple',
  building: 'buildings', person: 'user', layout: 'layout', user: 'user', logout: 'sign-out', sliders: 'sliders-horizontal',
  sun: 'sun', moon: 'moon', monitor: 'monitor', more: 'dots-three', plans: 'credit-card', alert: 'warning-circle', clock: 'clock', info: 'info',
} as const

export function Icon({ name, className = 'size-4' }: { name: keyof typeof GLYPH; className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" fill="currentColor" className={`rnr-icon shrink-0 ${className}`}>
      <use href={`${sprite}#i-${GLYPH[name]}`} />
    </svg>
  )
}

/** The name in Fraunces with the second R struck through (v2/design/components/Wordmark). */
export function Wordmark({ href, size = 'md' }: { href?: string; size?: 'md' | 'lg' }) {
  const mark = (
    <>
      Report<span>No</span>
      <span className="rnr-wordmark-rr">
        R<svg className="rnr-strike" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20C8 14 14 8 22 3" /></svg>
      </span>
      eport
    </>
  )
  const cls = `rnr-wordmark${size === 'lg' ? ' text-[32px]' : ''}`
  return href
    ? <a href={href} className={cls} data-draw aria-label="ReportNoReport">{mark}</a>
    : <span className={cls} data-draw role="img" aria-label="ReportNoReport">{mark}</span>
}

/** The bundle draws the 3px --focus ring on :focus-visible for every element; this class is kept so call sites need no change. */
export const ring = 'rnr-focus'

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
  primary: 'rnr-btn rnr-btn-primary',
  secondary: 'rnr-btn rnr-btn-secondary',
  ghost: 'rnr-btn rnr-btn-ghost',
  danger: 'rnr-btn rnr-btn-danger',
}

/** Base field look without a width, for inline controls. */
export const field = 'rnr-input w-auto'

export const input = 'rnr-input'

/** Initials on the accent fill: the only circle in the system besides dots. */
export function Avatar({ name, size = 'size-8' }: { name: string; size?: string }) {
  const initials = name.split(/\s+/).filter((w) => /\w/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  return (
    <span className={`rnr-avatar ${size}`} aria-hidden>
      {initials}
    </span>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="rnr-field">
      <span className="rnr-label">{label}</span>
      {hint && <span className="rnr-hint">{hint}</span>}
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
      className="rnr-dialog"
    >
      {open && (
        <>
          <div className="rnr-dialog-head">
            <h2 id={`${id}-title`}>{title}</h2>
            <button type="button" className="rnr-icon-btn" onClick={onClose} aria-label="Close dialog">
              <Icon name="x" className="size-5" />
            </button>
          </div>
          <div className="rnr-dialog-body">{children}</div>
        </>
      )}
    </dialog>
  )
}

export const menuItemClass = 'rnr-menu-item'

/** Trigger button that opens a dropdown menu. Escape and outside-click close it, mirroring Dialog's dismissal. `children` receives `close`. */
export function Menu({
  trigger,
  triggerLabel,
  menuLabel,
  children,
  align = 'down',
  side = 'right',
  className = '',
  triggerClassName = `${ring} min-w-0 rounded-(--r-ctl)`,
  width = 'w-56',
}: {
  trigger: ReactNode
  triggerLabel: string
  menuLabel: string
  children: (close: () => void) => ReactNode
  align?: 'up' | 'down'
  side?: 'left' | 'right'
  className?: string
  triggerClassName?: string
  width?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <div ref={ref} className={`rnr-menu-anchor min-w-0 ${className}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={triggerLabel} title={triggerLabel} className={triggerClassName}>
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          aria-label={menuLabel}
          className={`rnr-menu ${width} ${side === 'left' ? 'left-0 right-auto' : 'right-0'} ${align === 'up' ? 'top-auto bottom-full mb-2' : ''}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/** Avatar/name trigger that opens a small menu (Users, Settings, Sign out). */
export function AccountMenu({
  trigger,
  name,
  roleLabel,
  showUsers,
  onSignOut,
  align = 'down',
  side = 'right',
  className = '',
}: {
  trigger: ReactNode
  name: string
  roleLabel: string
  showUsers: boolean
  onSignOut: () => void
  align?: 'up' | 'down'
  side?: 'left' | 'right'
  className?: string
}) {
  const itemClass = menuItemClass
  return (
    <Menu trigger={trigger} triggerLabel={`Account menu for ${name}`} menuLabel="Account" align={align} side={side} className={className}>
      {(close) => (
        <>
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-ink">{name}</p>
            <p className="rnr-caption truncate">{roleLabel}</p>
          </div>
          <div className="rnr-menu-sep" />
          {showUsers && (
            <a role="menuitem" href="#users" data-tour="users-and-invites" onClick={close} className={itemClass}>
              <Icon name="user" /> Users
            </a>
          )}
          <a role="menuitem" href="#settings" data-tour="settings-and-billing" onClick={close} className={itemClass}>
            <Icon name="sliders" /> Settings
          </a>
          <div className="rnr-menu-sep" />
          <button role="menuitem" type="button" onClick={() => { close(); onSignOut() }} className={`${itemClass} is-danger`}>
            <Icon name="logout" /> Sign out
          </button>
        </>
      )}
    </Menu>
  )
}

export function KindBadge({ kind }: { kind: Kind }) {
  return (
    <span
      className={`rnr-kind${kind === 'out' ? ' is-out' : ''}`}
      aria-label={kind === 'in' ? 'In' : 'Out'}
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
  const [dirty, setDirty] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)
  useUnloadGuard(dirty)
  const errorId = useId()
  const hasForm = active.length > 0 && (!!clientId || clients.length > 0)
  // Only when the caller asks (dialog/tab), never on page load.
  useEffect(() => {
    if (autoFocus && hasForm) amountRef.current?.focus()
  }, [autoFocus, hasForm])

  if (!clientId && clients.length === 0) {
    return <p className="rnr-muted">Add a client before recording a transaction.</p>
  }
  if (active.length === 0) return <p className="rnr-muted">Add a bank account in Settings before recording a transaction.</p>

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
      setDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
      onDone?.()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form onSubmit={onSubmit} onInput={() => setDirty(true)} className="grid gap-3" noValidate>
      <div className="rnr-seg" role="radiogroup" aria-label="Transaction type">
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
          >
            <Icon name={k} /> {k === 'in' ? 'In' : 'Out'}
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
          <span className="rnr-money">
            <input ref={amountRef} name="amount" inputMode="decimal" autoComplete="off" placeholder="0.00" className={input} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} />
            <span className="rnr-money-code" aria-hidden>{currency}</span>
          </span>
        </Field>
        <Field label="Transaction date">
          <input name="date" type="date" defaultValue={today()} max={today()} className={input} />
        </Field>
      </div>
      <Field label="Description">
        <input name="note" placeholder={kind === 'in' ? 'e.g. Retainer received' : 'e.g. Supplier invoice INV-1042'} className={input} />
      </Field>
      {error && (
        <p id={errorId} className="rnr-error" role="alert">
          <Icon name="alert" />
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

/** Warns before a browser tab close/refresh/navigate while `dirty` is true, so an in-progress draft isn't silently lost. */
export function useUnloadGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])
}

export type Sort<K extends string> = { key: K; dir: 'asc' | 'desc' }

/** Same column flips direction; a new column starts at its natural direction. */
export const nextSort = <K extends string>(sort: Sort<K>, key: K, firstDir: 'asc' | 'desc' = 'asc'): Sort<K> =>
  sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: firstDir }

const CUSTOM = 'custom'

export function PeriodPicker({ period, onChange, firstDate }: { period: Period; onChange: (period: Period) => void; firstDate: string }) {
  const { fyStartMonth } = useSession().firm
  const presets = periodPresets(firstDate, fyStartMonth)
  const [custom, setCustom] = useState(false)
  const matched = presets.find((o) => o.period.from === period.from && o.period.to === period.to)
  const value = custom || !matched ? CUSTOM : matched.label
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Period"
        value={value}
        onChange={(e) => {
          const next = presets.find((o) => o.label === e.target.value)
          setCustom(!next)
          if (next) onChange(next.period)
        }}
        className={field}
      >
        {presets.map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}
        <option value={CUSTOM}>Custom range…</option>
      </select>
      {value === CUSTOM && (
        <div className="flex items-center gap-2">
          <input type="date" aria-label="Period from" value={period.from} max={period.to} onChange={(e) => e.target.value && onChange({ ...period, from: e.target.value })} className={field} />
          <span className="rnr-muted">to</span>
          <input type="date" aria-label="Period to" value={period.to} min={period.from} max={today()} onChange={(e) => e.target.value && onChange({ ...period, to: e.target.value })} className={field} />
        </div>
      )}
    </div>
  )
}
