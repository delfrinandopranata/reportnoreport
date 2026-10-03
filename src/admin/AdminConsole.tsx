import { btn, Icon } from '../ui'

export function AdminConsole({ name, onSignOut }: { name: string; onSignOut: () => void }) {
  return (
    <div className="min-h-dvh bg-zinc-50 p-6 dark:bg-zinc-950">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
              <Icon name="wallet" className="size-6" />
            </span>
            <div>
              <h1 className="text-lg font-semibold">Super-admin console</h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Signed in as {name}</p>
            </div>
          </div>
          <button onClick={onSignOut} className={btn.ghost}>
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
