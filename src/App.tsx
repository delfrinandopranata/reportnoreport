import { Fragment, useEffect, useState } from 'react'
import { ClientProfile, type ClientTab } from './ClientProfile'
import { ClientsPage } from './ClientsPage'
import { StatementPage } from './Statement'
import { Dashboard } from './Dashboard'
import { Avatar, btn, Icon } from './ui'
import { useSession } from './data/session'
import { ROLE_LABEL } from './users/rules'
import { SettingsPage } from './settings/SettingsPage'
import { UsersPage } from './users/UsersPage'

type View = 'dashboard' | 'clients' | 'users' | 'settings'
type Route = { view: View; clientId: string | null; statement: boolean; tab?: ClientTab }

const readRoute = (): Route => {
  const [view, clientId, sub] = location.hash.slice(1).split('/')
  if (view === 'users' || view === 'settings') return { view, clientId: null, statement: false }
  if (view === 'clients') return { view, clientId: clientId ?? null, statement: sub === 'statement', tab: sub === 'transactions' ? 'transactions' : 'client' }
  // '#statement' was the old consolidated page; it now lives on Clients.
  return view === 'statement' ? { view: 'clients', clientId: null, statement: false } : { view: 'dashboard', clientId: null, statement: false }
}

const NAV = [
  { view: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { view: 'clients', label: 'Clients', icon: 'users' },
] as const

const NAV_OTHERS = [
  { view: 'users', label: 'Users', icon: 'user' },
  { view: 'settings', label: 'Settings', icon: 'sliders' },
] as const

const HEADINGS: Record<View, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Receipts, payments and funds held across all client accounts.' },
  clients: { title: 'Clients', subtitle: 'Client accounts, balances and every receipt and payment, in one ledger.' },
  users: { title: 'Users', subtitle: 'Who has access to your business’s accounts, and what each role can do.' },
  settings: { title: 'Settings', subtitle: 'Your organisation’s details, bank accounts and statement options.' },
}

export default function App() {
  const [route, setRoute] = useState(readRoute)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  const { profile, firm, signOut } = useSession()
  const isDashboard = route.view === 'dashboard'

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="flex items-center print:hidden gap-1 border-b border-zinc-200 bg-white px-4 py-3 lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:flex-col lg:items-stretch lg:border-r lg:border-b-0 lg:px-3 lg:py-5 dark:border-zinc-800 dark:bg-zinc-900">
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
          {[...NAV, ...NAV_OTHERS].map((n, i) => (
            <Fragment key={n.view}>
              {i === NAV.length && (
              <span className="mx-1 w-px self-stretch bg-zinc-200 lg:mx-0 lg:mt-4 lg:mb-1 lg:w-auto lg:self-auto lg:bg-transparent lg:px-3 lg:text-xs lg:font-medium lg:tracking-wide lg:text-zinc-400 lg:uppercase dark:bg-zinc-800">
                <span className="max-lg:hidden">Others</span>
              </span>
              )}
            <a
              href={`#${n.view}`}
              aria-current={route.view === n.view ? 'page' : undefined}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 aria-[current=page]:bg-zinc-100 aria-[current=page]:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white dark:aria-[current=page]:bg-zinc-800 dark:aria-[current=page]:text-white"
            >
              <Icon name={n.icon} />
              <span className="max-sm:sr-only">{n.label}</span>
            </a>
            </Fragment>
          ))}
        </nav>
        <a href="#users" className="ml-auto lg:hidden" aria-label={`Signed in as ${profile.name}. Open users`}>
          <Avatar name={profile.name} />
        </a>
        <button type="button" className={`${btn.ghost} lg:hidden`} onClick={signOut} aria-label="Sign out" title="Sign out"><Icon name="x" /></button>
        <div className="mt-auto hidden items-center gap-2 px-2 lg:flex">
          <Avatar name={profile.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{profile.name}</p>
            <p className="truncate text-xs text-zinc-500">{firm.name} · {ROLE_LABEL[profile.role]}</p>
          </div>
          <button type="button" className={btn.ghost} onClick={signOut} aria-label="Sign out" title="Sign out"><Icon name="x" /></button>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-8 sm:py-8 print:max-w-none print:p-0">
        {route.clientId && route.statement ? (
          <StatementPage id={route.clientId} />
        ) : route.clientId ? (
          <ClientProfile key={route.clientId} id={route.clientId} tab={route.tab ?? 'client'} />
        ) : (
          <>
        <header className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
          <div className="mr-auto">
            <h1 className="text-2xl font-semibold tracking-tight">{HEADINGS[route.view].title}</h1>
            <p className="text-sm text-zinc-500">{HEADINGS[route.view].subtitle}</p>
          </div>
          {isDashboard && (
            <button type="button" className={editing ? btn.primary : `${btn.ghost} border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900`} onClick={() => setEditing(!editing)}>
              <Icon name={editing ? 'check' : 'layout'} />
              {editing ? 'Done' : 'Edit layout'}
            </button>
          )}
        </header>
        {route.view === 'users' ? <UsersPage /> : route.view === 'settings' ? <SettingsPage /> : isDashboard ? <Dashboard editing={editing} /> : <ClientsPage />}
          </>
        )}
      </main>
    </div>
  )
}
