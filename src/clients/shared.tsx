import { formatMoney } from '../ledger'
import { field } from '../ui'
import { can, useUsers } from '../users/store'

export const card = 'rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900 print:border-zinc-300 print:shadow-none'
export const select = `${field} py-1.5 pr-8`
export const shortDate = (date: string) => new Date(`${date}T00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
export const monthLabel = (key: string) => new Date(`${key}-01T00:00`).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })
export const neg = (value: number) => (value < 0 ? 'text-red-600 dark:text-red-400' : '')
export const money = (value: number) => <span className={neg(value)}>{formatMoney(value)}</span>

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

type Action = Parameters<typeof can>[1]

/** Whether the signed-in user's role allows `action`. */
export function useCan(action: Action) {
  const role = useUsers((s) => s.users.find((u) => u.id === s.currentUserId)?.role)
  return !!role && can(role, action)
}

/** Id → display name for the assigned-member column; unknown ids read as a removed member. */
export function useUserNames() {
  const users = useUsers((s) => s.users)
  return (id?: string) => (id ? (users.find((u) => u.id === id)?.name ?? 'Former member') : '')
}
