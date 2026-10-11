import { useQueryClient } from '@tanstack/react-query'
import { ConflictError } from '../data/conflict'
import { useMoney } from '../data/money'
import { useMembers } from '../data/queries'
import { useSession } from '../data/session'
import type { Action } from '../users/rules'
import { btn, field, Icon } from '../ui'

export const card = 'rnr-card print:shadow-none'
export const select = `${field} max-sm:min-w-[calc(50%-0.25rem)] max-sm:flex-1`
export const shortDate = (date: string) => new Date(`${date}T00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
export const monthLabel = (key: string) => new Date(`${key}-01T00:00`).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })
/** A negative figure keeps its minus sign; --down is an addition, never the only cue. */
export const neg = (value: number) => (value < 0 ? 'text-down' : '')
/** Currency-aware money cell: red when negative. */
export function useMoneyCell() {
  const { format } = useMoney()
  return (value: number) => <span className={neg(value)}>{format(value)}</span>
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (value: T) => void; label: string }) {
  return (
    // The bundle makes a phone segmented control two columns wide; three options need their own row of three.
    <div className={`rnr-seg${options.length === 3 ? ' max-sm:grid-cols-3' : ''}`} role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)} className="whitespace-nowrap">
          {text}
        </button>
      ))}
    </div>
  )
}

/** Calm placeholder block; size it like the content it stands in for so nothing shifts on load. */
export const Skeleton = ({ className = '' }: { className?: string }) => <span aria-hidden className={`rnr-skeleton block ${className}`} />

/** Failed query: readable message plus Retry, which refetches everything that errored. */
export function LoadError({ error, what = 'this page', compact }: { error: Error; what?: string; compact?: boolean }) {
  const qc = useQueryClient()
  return (
    <div role="alert" className={`rnr-empty rounded-(--r-card) border border-down bg-down-bg ${compact ? 'px-4 py-5' : ''}`}>
      <p className="font-medium text-ink"><Icon name="alert" className="mr-1.5 inline size-5 align-text-bottom text-down" />{what.charAt(0).toUpperCase() + what.slice(1)} did not load. Check your connection, then try again.</p>
      <p className="max-w-md text-sm text-ink-2">{error.message}</p>
      <button type="button" className={compact ? btn.ghost : btn.primary} onClick={() => qc.invalidateQueries()}>Try again</button>
    </div>
  )
}

/** Mutation error line; a conflict also offers Reload, which refetches everything. */
export function MutationError({ error }: { error: Error | null }) {
  const qc = useQueryClient()
  if (!error) return null
  return (
    <p className="rnr-error" role="alert">
      <Icon name="alert" />
      {error.message}
      {error instanceof ConflictError && <button type="button" onClick={() => qc.invalidateQueries()} className="ml-2 font-medium underline">Reload</button>}
    </p>
  )
}

/** Whether the role allows `action` and the firm can write. */
export function useCan(action: Action) {
  const s = useSession()
  return s.can(action) && s.canWrite
}

/** Disabled-button state and tooltip for a write action; `verb` completes "Your role can't …". */
export function useGate(action: Action, verb: string) {
  const s = useSession()
  const ok = s.can(action) && s.canWrite
  return { ok, title: ok ? undefined : (s.writeBlockReason ?? `Your role can't ${verb}.`) }
}

/** Id → display name for the assigned-member column; unknown ids read as a removed member. */
export function useUserNames() {
  const { data: members = [] } = useMembers()
  return (id?: string) => (id ? (members.find((u) => u.id === id)?.name ?? 'Former member') : '')
}
