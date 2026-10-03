import { useQueryClient } from '@tanstack/react-query'
import { ConflictError } from '../data/conflict'
import { useMoney } from '../data/money'
import { useMembers } from '../data/queries'
import { useSession } from '../data/session'
import type { Action } from '../users/rules'
import { field } from '../ui'

export const card = 'rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900 print:border-zinc-300 print:shadow-none'
export const select = `${field} py-1.5 pr-8`
export const shortDate = (date: string) => new Date(`${date}T00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
export const monthLabel = (key: string) => new Date(`${key}-01T00:00`).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })
export const neg = (value: number) => (value < 0 ? 'text-red-600 dark:text-red-400' : '')
/** Currency-aware money cell: red when negative. */
export function useMoneyCell() {
  const { format } = useMoney()
  return (value: number) => <span className={neg(value)}>{format(value)}</span>
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (value: T) => void; label: string }) {
  return (
    <div className="flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={`rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition ${value === key ? 'bg-white shadow-sm dark:bg-zinc-950' : 'text-zinc-500'}`}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

/** Mutation error line; a conflict also offers Reload, which refetches everything. */
export function MutationError({ error }: { error: Error | null }) {
  const qc = useQueryClient()
  if (!error) return null
  return (
    <p className="text-sm text-red-600 dark:text-red-400" role="alert">
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
