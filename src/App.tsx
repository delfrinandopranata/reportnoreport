import { Fragment, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ClientProfile, type ClientTab } from './ClientProfile'
import { ClientsPage } from './ClientsPage'
import { StatementPage } from './Statement'
import { Dashboard } from './Dashboard'
import { Avatar, btn, Icon, ring } from './ui'
import { useSession } from './data/session'
import { ROLE_LABEL } from './users/rules'
import { SettingsPage } from './settings/SettingsPage'
import { UsersPage } from './users/UsersPage'
import { trialState } from './trial'

type View = 'dashboard' | 'clients' | 'users' | 'settings' | 'billing'
type Route = { view: View; clientId: string | null; statement: boolean; tab?: ClientTab }

const readRoute = (): Route => {
  const hashPart = location.hash.slice(1).split('?')[0]
  const [view, clientId, sub] = hashPart.split('/')
  if (view === 'users') return { view, clientId: null, statement: false }
  if (view === 'settings' && clientId === 'billing') return { view: 'billing', clientId: null, statement: false }
  if (view === 'settings') return { view, clientId: null, statement: false }
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
  users: { title: 'Users', subtitle: 'Who has access to your business\'s accounts, and what each role can do.' },
  settings: { title: 'Settings', subtitle: 'Your organisation\'s details, bank accounts and statement options.' },
  billing: { title: 'Settings', subtitle: 'Your organisation\'s details, bank accounts and statement options.' },
}

export default function App() {
  const [route, setRoute] = useState(readRoute)
  const [editing, setEditing] = useState(false)
  const [trialCheckTime, setTrialCheckTime] = useState<Date | null>(null)

  const queryClient = useQueryClient()
  const { profile, firm, signOut } = useSession()

  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    // Initialize trial check time on first render
    setTrialCheckTime(new Date())
  }, [])

  useEffect(() => {
    if (!trialCheckTime) return
    // Re-evaluate trial state every minute
    const interval = setInterval(() => {
      const now = new Date()
      const currentState = trialState(firm, now)

      // If trial just ended, invalidate session query to update canWrite
      const prevState = trialState(firm, new Date(now.getTime() - 60000))
      if ((prevState.kind === 'active' || prevState.kind === 'none') && currentState.kind === 'ended') {
        queryClient.invalidateQueries({ queryKey: ['session'] })
      }

      setTrialCheckTime(now)
    }, 60000) // Every minute

    return () => clearInterval(interval)
  }, [firm, queryClient, trialCheckTime])

  const isDashboard = route.view === 'dashboard'
  const trial: ReturnType<typeof trialState> = useMemo(() => trialCheckTime ? trialState(firm, trialCheckTime) : { kind: 'none' as const }, [firm, trialCheckTime])

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <a
        href="#main"
        onClick={(e) => {
          // Hash routing owns location.hash, so focus the content directly.
          e.preventDefault()
          document.getElementById('main')?.focus()
        }}
        className={`sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-zinc-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white print:hidden dark:focus:bg-white dark:focus:text-zinc-900 ${ring}`}
      >
        Skip to content
      </a>
      <aside className="flex items-center print:hidden gap-1 border-b border-zinc-200 bg-white px-4 py-3 lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:flex-col lg:items-stretch lg:border-r lg:border-b-0 lg:px-3 lg:py-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mr-3 flex items-center gap-2.5 lg:mr-0 lg:mb-6 lg:px-2">
          <span className="grid size-8 place-items-center rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
            <Icon name="wallet" />
          </span>
          <span className="hidden text-sm leading-tight font-semibold sm:block">
            ReportNoReport
            <span className="block text-xs font-normal text-zinc-500">Client accounts</span>
          </span>
        </div>
        <nav aria-label="Main" className="flex gap-1 lg:flex-col">
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
              className={`${ring} flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition lg:min-h-0 max-sm:min-w-11 max-sm:justify-center max-sm:px-2 hover:bg-zinc-100 hover:text-zinc-900 aria-[current=page]:bg-zinc-100 aria-[current=page]:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white dark:aria-[current=page]:bg-zinc-800 dark:aria-[current=page]:text-white aria-[current=page]:font-semibold aria-[current=page]:shadow-[inset_3px_0_0_currentColor] max-lg:aria-[current=page]:shadow-[inset_0_-3px_0_currentColor]`}
            >
              <Icon name={n.icon} />
              <span className="max-sm:sr-only">{n.label}</span>
            </a>
            </Fragment>
          ))}
        </nav>
        <a href="#users" className={`${ring} ml-auto grid min-h-11 min-w-11 place-items-center rounded-lg lg:hidden`} aria-label={`Signed in as ${profile.name}. Open users`}>
          <Avatar name={profile.name} />
        </a>
        <button type="button" className={`${btn.ghost} min-h-11 min-w-11 lg:hidden`} onClick={signOut} aria-label="Sign out" title="Sign out"><Icon name="logout" /></button>
        <div className="mt-auto hidden items-center gap-2 px-2 lg:flex">
          <Avatar name={profile.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{profile.name}</p>
            <p className="truncate text-xs text-zinc-500">{firm.name} · {ROLE_LABEL[profile.role]}</p>
          </div>
          <button type="button" className={`${btn.ghost} shrink-0`} onClick={signOut} aria-label="Sign out" title="Sign out"><Icon name="logout" /></button>
        </div>
      </aside>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-8 sm:py-8 outline-none print:max-w-none print:p-0">
        {trial.kind !== 'none' && (
          <div
            role={trial.kind === 'active' ? 'status' : 'region'}
            aria-live={trial.kind === 'active' ? 'polite' : 'assertive'}
            aria-label={trial.kind === 'active' ? 'Trial status' : 'Trial ended'}
            className={`mb-6 flex items-start gap-3 rounded-lg px-4 py-3 text-sm print:hidden ${
              trial.kind === 'active'
                ? trial.daysLeft <= 3
                  ? 'border border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-100'
                  : 'border border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100'
                : 'border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100'
            }`}
          >
            {trial.kind === 'active' && (
              <>
                <Icon
                  name="check"
                  className={`mt-0.5 size-5 shrink-0 ${
                    trial.daysLeft <= 3 ? 'text-orange-600 dark:text-orange-300' : 'text-blue-600 dark:text-blue-300'
                  }`}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">
                    {trial.daysLeft} {trial.daysLeft === 1 ? 'day' : 'days'} left in your free trial
                    <span className="block text-xs opacity-90">(ends {trial.endsOn})</span>
                  </p>
                  {profile.role === 'owner' && (
                    <p className="mt-2 text-xs opacity-90">
                      <a href="#settings/billing" className="font-medium underline opacity-100 hover:opacity-75">Pay RM 10</a> to keep using ReportNoReport.
                    </p>
                  )}
                </div>
              </>
            )}
            {(trial.kind === 'ended' || trial.kind === 'read_only') && (
              <>
                <Icon name="x" className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">
                    {trial.kind === 'ended' ? `Your free trial ended on ${trial.endedOn}` : 'This firm is read-only'}
                    <span className="block text-xs opacity-90 mt-1">Your data is read-only. You can still view, export and print.</span>
                  </p>
                </div>
              </>
            )}
          </div>
        )}
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
        {route.view === 'users' ? <UsersPage /> : route.view === 'settings' || route.view === 'billing' ? <SettingsPage /> : isDashboard ? <Dashboard editing={editing} /> : <ClientsPage />}
          </>
        )}
      </main>
    </div>
  )
}
