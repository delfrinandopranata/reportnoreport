import { useState, type KeyboardEvent } from 'react'
import { addTag, CLIENT_STATUSES, DIAL_CODES, joinPhone, splitPhone, STATUS_LABEL, type ClientStatus } from '../ledger'
import { field, Icon, input } from '../ui'
import { useMembers } from '../data/queries'

const VIEW: Record<ClientStatus, { icon: 'check' | 'alert' | 'file'; tone?: 'ok' | 'warn' }> = {
  active: { icon: 'check', tone: 'ok' },
  inactive: { icon: 'alert', tone: 'warn' },
  archived: { icon: 'file' },
}

export function StatusBadge({ status }: { status: ClientStatus }) {
  return <span className="rnr-status" data-tone={VIEW[status].tone}><Icon name={VIEW[status].icon} />{STATUS_LABEL[status]}</span>
}

/** The status chip is really a native <select>, so keyboard and screen readers just work. */
export function StatusSelect({ status, onChange, disabled }: { status: ClientStatus; onChange: (status: ClientStatus) => void; disabled?: boolean }) {
  if (disabled) return <StatusBadge status={status} />
  return (
    <span className="rnr-select inline-block">
      <select value={status} onChange={(e) => onChange(e.target.value as ClientStatus)} aria-label="Client status" className="rnr-input w-auto min-h-9 py-1">
        {CLIENT_STATUSES.map((s) => (
          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
        ))}
      </select>
    </span>
  )
}

export function TagPill({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  return (
    <span className="rnr-chip">
      {tag}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove tag ${tag}`} className="relative -mr-1 grid size-5 place-items-center rounded-(--r-chip) text-ink-3 hover:text-ink print:hidden after:absolute after:-inset-3 after:content-['']">
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
      {!tags.length && !onChange && <span className="rnr-muted">—</span>}
      {onChange && (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
          maxLength={24}
          aria-label={label}
          placeholder="+ Add tag"
          className="rnr-input w-28 min-h-8 px-2 py-0.5 text-xs print:hidden"
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
        className={`${input} min-w-0`}
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
