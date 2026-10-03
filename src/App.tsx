import { useEffect, useState } from 'react'
import { useStore as useZustand } from 'zustand'
import { ClientProfile, Clients } from './Clients'
import { Dashboard } from './Dashboard'
import { useStore } from './store'
import { btn, Icon } from './ui'

type Route = { view: 'dashboard' | 'clients'; clientId: string | null }

const readRoute = (): Route => {
  const [view, clientId] = location.hash.slice(1).split('/')
  return view === 'clients' ? { view, clientId: clientId ?? null } : { view: 'dashboard', clientId: null }
}

function History() {
  const { undo, redo } = useStore.temporal.getState()
  const canUndo = useZustand(useStore.temporal, (s) => s.pastStates.length > 0)
  const canRedo = useZustand(useStore.temporal, (s) => s.futureStates.length > 0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [undo, redo])

  return (
    <div className="flex items-center rounded-lg border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
      <button type="button" className={`${btn.ghost} px-2 py-1.5`} onClick={() => undo()} disabled={!canUndo} title="Undo (⌘Z)" aria-label="Undo">
        <Icon name="undo" />
      </button>
      <button type="button" className={`${btn.ghost} px-2 py-1.5`} onClick={() => redo()} disabled={!canRedo} title="Redo (⇧⌘Z)" aria-label="Redo">
        <Icon name="redo" />
      </button>
    </div>
  )
}

const NAV = [
  { view: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { view: 'clients', label: 'Clients', icon: 'users' },
] as const

export default function App() {
  const [route, setRoute] = useState(readRoute)
  const [editing, setEditing] = useState(false)
  const resetDemo = useStore((s) => s.resetDemo)

  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  const isDashboard = route.view === 'dashboard'

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="flex items-center gap-1 border-b border-zinc-200 bg-white px-4 py-3 lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:flex-col lg:items-stretch lg:border-r lg:border-b-0 lg:px-3 lg:py-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mr-3 flex items-center gap-2.5 lg:mr-0 lg:mb-6 lg:px-2">
          <span className="grid size-8 place-items-center rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
            <Icon name="wallet" />
          </span>
          <span className="hidden text-sm leading-tight font-semibold sm:block">
            Platform
            <span className="block text-xs font-normal text-zinc-500">Client accounts</span>
          </span>
        </div>
        <nav className="flex gap-1 lg:flex-col">
          {NAV.map((n) => (
            <a
              key={n.view}
              href={`#${n.view}`}
              aria-current={route.view === n.view ? 'page' : undefined}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 aria-[current=page]:bg-zinc-100 aria-[current=page]:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white dark:aria-[current=page]:bg-zinc-800 dark:aria-[current=page]:text-white"
            >
              <Icon name={n.icon} />
              {n.label}
            </a>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => confirm('Replace all clients and transactions with sample data? You can undo this.') && resetDemo()}
          className="ml-auto hidden text-xs text-zinc-400 hover:text-zinc-600 lg:mt-auto lg:ml-0 lg:block lg:px-3 lg:text-left dark:hover:text-zinc-300"
        >
          Load sample data
        </button>
      </aside>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
        {route.clientId ? (
          <ClientProfile id={route.clientId} actions={<History />} />
        ) : (
          <>
        <header className="mb-6 flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="text-2xl font-semibold tracking-tight">{isDashboard ? 'Dashboard' : 'Clients'}</h1>
            <p className="text-sm text-zinc-500">
              {isDashboard ? 'Receipts, payments and funds held across all client accounts.' : 'Client accounts and the funds held on their behalf.'}
            </p>
          </div>
          <History />
          {isDashboard && (
            <button type="button" className={editing ? btn.primary : `${btn.ghost} border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900`} onClick={() => setEditing(!editing)}>
              <Icon name={editing ? 'check' : 'layout'} />
              {editing ? 'Done' : 'Edit layout'}
            </button>
          )}
        </header>
        {isDashboard ? <Dashboard editing={editing} /> : <Clients />}
          </>
        )}
      </main>
    </div>
  )
}
