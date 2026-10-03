import { useState, type KeyboardEvent } from 'react'
import { addTag, CLIENT_STATUSES, DIAL_CODES, joinPhone, splitPhone, STATUS_LABEL, type ClientStatus } from '../ledger'
import { field, Icon, input } from '../ui'
import { useMembers } from '../data/queries'

const TONE: Record<ClientStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/20',
  inactive: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/20',
  archived: 'bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-400/20',
}
const pill = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset'

export function StatusBadge({ status }: { status: ClientStatus }) {
  return <span className={`${pill} ${TONE[status]}`}>{STATUS_LABEL[status]}</span>
}

/** Coloured pill that is really a native <select>, so keyboard and screen readers just work. */
export function StatusSelect({ status, onChange, disabled }: { status: ClientStatus; onChange: (status: ClientStatus) => void; disabled?: boolean }) {
  if (disabled) return <StatusBadge status={status} />
  return (
    <span className="relative inline-flex">
      <select
        value={status}
        onChange={(e) => onChange(e.target.value as ClientStatus)}
        aria-label="Client status"
        className={`${pill} ${TONE[status]} cursor-pointer appearance-none py-1 pr-7 pl-3 outline-none focus-visible:ring-2`}
      >
        {CLIENT_STATUSES.map((s) => (
          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
        ))}
      </select>
      <Icon name="down" className="pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2" />
    </span>
  )
}

export function TagPill({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      {tag}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove tag ${tag}`} className="-mr-1 rounded-full p-0.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white print:hidden">
          <Icon name="x" className="size-3" />
        </button>
      )}
    </span>
  )
}

/** Tag pills with an inline "add" box. Without `onChange` it is read-only. */
export function TagList({ tags, onChange, label = 'Add tag' }: { tags: string[]; onChange?: (tags: string[]) => void; label?: string }) {
  const [draft, setDraft] = useState('')
  const commit = () => {
    if (onChange) onChange(addTag(tags, draft))
    setDraft('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && !draft && tags.length && onChange) onChange(tags.slice(0, -1))
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <TagPill key={t} tag={t} onRemove={onChange && (() => onChange(tags.filter((x) => x !== t)))} />
      ))}
      {!tags.length && !onChange && <span className="text-zinc-400">—</span>}
      {onChange && (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
          maxLength={24}
          aria-label={label}
          placeholder="+ Add tag"
          className="w-24 rounded-full bg-transparent px-2 py-0.5 text-xs outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 print:hidden"
        />
      )}
    </div>
  )
}

/** Country-code select + national number; emits one E.164-style string. */
export function PhoneField({ value, onChange, invalid }: { value: string; onChange: (phone: string) => void; invalid?: boolean }) {
  const [code, national] = splitPhone(value)
  // Keep the chosen code even while the number is empty (value is '' then).
  const [pickedCode, setPickedCode] = useState(code)
  const activeCode = value ? code : pickedCode
  return (
    <div className="flex gap-2">
      <select
        value={activeCode}
        onChange={(e) => {
          setPickedCode(e.target.value)
          onChange(joinPhone(e.target.value, national))
        }}
        aria-label="Country code"
        className={`${field} w-40 shrink-0 px-2`}
      >
        {DIAL_CODES.map(([c, country]) => (
          <option key={c} value={c}>{c} {country}</option>
        ))}
      </select>
      <input
        type="tel"
        inputMode="tel"
        defaultValue={national}
        key={code}
        onChange={(e) => onChange(joinPhone(activeCode, e.target.value))}
        placeholder="12-345 6789"
        aria-label="Phone number"
        aria-invalid={invalid}
        className={`${input} min-w-0 tabular-nums`}
      />
    </div>
  )
}

/** Active members only; a member who has since left stays selectable so the record isn't silently changed. */
export function AssigneeSelect({ value, onChange, className = input }: { value?: string; onChange: (id: string | undefined) => void; className?: string }) {
  const { data: users = [] } = useMembers()
  const options = users.filter((u) => u.status === 'active' || u.id === value)
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} aria-label="Assigned member" className={className}>
      <option value="">Unassigned</option>
      {options.map((u) => (
        <option key={u.id} value={u.id}>{u.name}{u.status === 'active' ? '' : ' (inactive)'}</option>
      ))}
    </select>
  )
}
