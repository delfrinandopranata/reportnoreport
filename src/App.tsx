import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ClientProfile, type ClientTab } from './ClientProfile'
import { ClientsPage } from './ClientsPage'
import { ContractsPage } from './contracts/ContractsPage'
import { StatementPage } from './Statement'
import { Dashboard } from './Dashboard'
import { Avatar, btn, Icon, Dialog, ThemeToggle, Wordmark } from './ui'
import { useSession } from './data/session'
import { ROLE_LABEL } from './users/rules'
import { currentItem, navItems, phoneItems, type NavItem } from './nav'
import { SettingsPage } from './settings/SettingsPage'
import { UsersPage } from './users/UsersPage'
import { trialState } from './trial'
import { Tour } from './tour'
import { useTour } from './tour/useTour'
import { useSampleDataExists, useLoadSampleData, useRemoveSampleData } from './data/queries'
import { useAppearance } from './useAppearance'
import { sampleControls } from './data/sampleData'
import { formatMoney } from './ledger'

type View = 'dashboard' | 'clients' | 'contracts' | 'users' | 'settings' | 'billing'

/** Live matchMedia: the shell mounts the tour's data-tour hooks only on the layout that is actually visible. */
const useDesktop = () =>
  useSyncExternalStore(
    (notify) => { const m = matchMedia('(min-width: 768px)'); m.addEventListener('change', notify); return () => m.removeEventListener('change', notify) },
    () => matchMedia('(min-width: 768px)').matches,
  )
type Route = { view: View; clientId: string | null; statement: boolean; tab?: ClientTab }

const readRoute = (): Route => {
  const hashPart = location.hash.slice(1).split('?')[0]
  const [view, clientId, sub] = hashPart.split('/')
  if (view === 'users') return { view, clientId: null, statement: false }
  if (view === 'contracts') return { view, clientId: null, statement: false }
  if (view === 'settings' && clientId === 'billing') return { view: 'billing', clientId: null, statement: false }
  if (view === 'settings') return { view, clientId: null, statement: false }
  if (view === 'clients') return { view, clientId: clientId ?? null, statement: sub === 'statement', tab: sub === 'transactions' ? 'transactions' : 'client' }
  // '#statement' was the old consolidated page; it now lives on Clients.
  return view === 'statement' ? { view: 'clients', clientId: null, statement: false } : { view: 'dashboard', clientId: null, statement: false }
}

/** The one-off licence price, in ISO form like every other amount. */
const PRICE = formatMoney(1000)

/** Pages whose body is `rnr-wide`: their header follows, so the left edges line up. */
const WIDE = new Set<View>(['clients', 'contracts', 'users'])

const HEADINGS: Record<View, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Receipts, payments and funds held across all clients.' },
  clients: { title: 'Clients', subtitle: 'Client balances and every receipt and payment, in one ledger.' },
  contracts: { title: 'Contract Manager', subtitle: "Your clients' contracts with their own clients, and when each one ends." },
  users: { title: 'Users', subtitle: 'Who has access to your business\'s accounts, and what each role can do.' },
  settings: { title: 'Settings', subtitle: 'Your organisation\'s details, bank accounts and statement options.' },
  billing: { title: 'Settings', subtitle: 'Your organisation\'s details, bank accounts and statement options.' },
}

export default function App() {
  const [route, setRoute] = useState(readRoute)
  const [editing, setEditing] = useState(false)
  const [trialCheckTime, setTrialCheckTime] = useState<Date | null>(null)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)

  const queryClient = useQueryClient()
  const { profile, firm, signOut } = useSession()
  const [appearance, saveAppearance] = useAppearance(profile.id)
  const desktop = useDesktop()
  const drawer = useRef<HTMLDialogElement>(null)
  const items = navItems(profile.role)
  const current = currentItem(route.view)
  const tourId = (n: NavItem) => (n.view === 'dashboard' ? 'dashboard' : n.view === 'clients' ? 'clients' : n.view === 'users' ? 'users-and-invites' : n.view === 'settings' ? 'settings-and-billing' : undefined)
  const sideLink = (n: NavItem, inDrawer: boolean) => (
    <li key={n.view}>
      <a
        className="rnr-side-link"
        href={`#${n.view}`}
        data-tour={desktop !== inDrawer ? tourId(n) : undefined}
        aria-current={current === n.view ? 'page' : undefined}
        onClick={inDrawer ? () => drawer.current?.close() : undefined}
      >
        <Icon name={n.icon} className="size-5" />
        {n.label}
      </a>
    </li>
  )
  const account = (
    <div className="rnr-account">
      <Avatar name={profile.name} size="size-8" />
      <div className="min-w-0 flex-1">
        <p className="rnr-account-email">{profile.name}</p>
        <p className="rnr-caption truncate">{ROLE_LABEL[profile.role]}</p>
      </div>
      <ThemeToggle theme={appearance.theme} setTheme={(theme) => void saveAppearance({ ...appearance, theme })} className="shrink-0" />
      <button type="button" className="rnr-icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out">
        <Icon name="logout" className="size-5" />
      </button>
    </div>
  )
  const sideBody = (inDrawer: boolean) => (
    <>
      <p className="truncate px-3 text-sm font-medium text-ink" title={firm.name}>{firm.name}</p>
      <nav aria-label={inDrawer ? 'Main menu' : 'Main'}>
        <ul className="grid gap-0.5 p-0 list-none">{items.filter((n) => n.place === 'main').map((n) => sideLink(n, inDrawer))}</ul>
      </nav>
      <div className="rnr-side-foot">
        <ul className="grid gap-0.5 p-0 list-none">{items.filter((n) => n.place === 'foot').map((n) => sideLink(n, inDrawer))}</ul>
        {account}
      </div>
    </>
  )
  const tour = useTour()
  const sampleDataExists = useSampleDataExists()
  const loadSample = useLoadSampleData()
  const removeSample = useRemoveSampleData()
  const { canImport, canRemove, canViewBanner } = sampleControls(profile.role, sampleDataExists)
  const removeSampleErrorMsg = removeSample.error instanceof Error ? removeSample.error.message : (removeSample.error ? String(removeSample.error) : '')

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

  const title = HEADINGS[route.view].title
  const at = title.lastIndexOf(' ')
  return (
    <div className="rnr-shell">
      <a
        href="#main"
        onClick={(e) => {
          // Hash routing owns location.hash, so focus the content directly.
          e.preventDefault()
          document.getElementById('main')?.focus()
        }}
        className="rnr-skip rnr-btn rnr-btn-secondary print:hidden"
      >
        Skip to content
      </a>
      <aside className="rnr-side rnr-folder print:hidden">
        <span className="rnr-folder-tab rnr-side-tab"><Wordmark href="#dashboard" /></span>
        <div className="rnr-folder-body rnr-side-body">{desktop && sideBody(false)}</div>
      </aside>
      <header className="rnr-topbar print:hidden">
        <span className="rnr-topbar-mark"><Wordmark href="#dashboard" /></span>
      </header>
      <nav className="rnr-phonebar print:hidden" aria-label="Quick">
        {phoneItems(items).map((n) => (
          <a key={n.view} href={`#${n.view}`} aria-label={n.short} aria-current={current === n.view ? 'page' : undefined} data-tour={!desktop ? tourId(n) : undefined}>
            <Icon name={n.icon} className="size-5" />
          </a>
        ))}
        <button type="button" aria-label="Menu" aria-haspopup="dialog" onClick={() => drawer.current?.showModal()}>
          <Icon name="layout" className="size-5" />
        </button>
      </nav>
      <dialog ref={drawer} className="rnr-dialog rnr-drawer print:hidden" aria-label="Menu">
        <button type="button" className="rnr-icon-btn self-end" aria-label="Close menu" onClick={() => drawer.current?.close()}>
          <Icon name="x" className="size-5" />
        </button>
        {!desktop && sideBody(true)}
      </dialog>

      <main id="main" tabIndex={-1} className="rnr-page outline-none print:p-0">
        {canViewBanner && (
          <div role="status" className="rnr-note rnr-note--bar mb-6 rounded-(--r-card) border print:hidden" data-tone="info">
            <Icon name="info" className="size-5" />
            <div>You're exploring with sample data</div>
            {canRemove && (
              <div className="rnr-note-actions">
                <button type="button" onClick={() => setShowRemoveConfirm(true)} className={btn.ghost}>
                  Remove
                </button>
              </div>
            )}
          </div>
        )}

        <Dialog
          open={showRemoveConfirm}
          onClose={() => setShowRemoveConfirm(false)}
          title="Remove sample data?"
        >
          <p className="rnr-muted mb-6">This deletes the sample clients, bank account and transactions. Your own records are kept.</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button className={btn.ghost} onClick={() => setShowRemoveConfirm(false)}>Cancel</button>
            <button
              className={btn.danger}
              onClick={async () => {
                await removeSample.mutateAsync()
                setShowRemoveConfirm(false)
              }}
              disabled={removeSample.isPending}
            >
              {removeSample.isPending ? 'Removing…' : 'Remove sample data'}
            </button>
          </div>
          {!!removeSample.error && <p className="rnr-error mt-3" role="alert"><Icon name="alert" />{removeSampleErrorMsg}</p>}
        </Dialog>

        {trial.kind !== 'none' && (
          <div
            role={trial.kind === 'active' ? 'status' : 'region'}
            aria-live={trial.kind === 'active' ? 'polite' : 'assertive'}
            aria-label={trial.kind === 'active' ? 'Trial status' : 'Trial ended'}
            data-tone={trial.kind === 'active' ? (trial.daysLeft <= 3 ? 'warn' : 'info') : 'down'}
            className="rnr-note rnr-note--bar mb-6 rounded-(--r-card) border print:hidden"
          >
            {trial.kind === 'active' && (
              <>
                <Icon name={trial.daysLeft <= 3 ? 'alert' : 'info'} className="size-5" />
                <div>
                  <p className="font-medium">
                    {trial.daysLeft} {trial.daysLeft === 1 ? 'day' : 'days'} left in your free trial
                    <span className="block text-xs">(ends {trial.endsOn})</span>
                  </p>
                  {profile.role === 'owner' && (
                    <p className="mt-2 text-xs">
                      <a href="#settings/billing" className="rnr-link font-medium">Pay {PRICE}</a> to keep using ReportNoReport.
                    </p>
                  )}
                </div>
              </>
            )}
            {(trial.kind === 'ended' || trial.kind === 'read_only') && (
              <>
                <Icon name="alert" className="size-5" />
                <div>
                  <p className="font-medium">
                    {trial.kind === 'ended' ? `Your free trial ended on ${trial.endedOn}` : 'This firm is read-only'}
                    <span className="mt-1 block text-xs">Your data is read-only. You can still view, export and print.</span>
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
        <header className={`rnr-page-head print:hidden${WIDE.has(route.view) ? ' rnr-wide' : ''}`}>
          <div>
            <h1 className="rnr-page-title">{at > 0 ? <>{title.slice(0, at)} <em>{title.slice(at + 1)}</em></> : title}</h1>
            <p className="rnr-lede">{HEADINGS[route.view].subtitle}</p>
          </div>
          <div className="rnr-page-actions">
          <button type="button" className={`${btn.ghost} pointer-coarse:min-w-11`} onClick={tour.replay} aria-label="Take the tour" title="Take the tour" data-tour="help-menu">
            <Icon name="search" />
          </button>
          {isDashboard && canImport && (
            <button
              type="button"
              className={`${btn.ghost} pointer-coarse:min-w-11`}
              onClick={() => loadSample.mutate()}
              disabled={loadSample.isPending}
              title="Import sample data"
            >
              <Icon name="plus" />
              <span className="hidden sm:inline">Import sample</span>
            </button>
          )}
          {isDashboard && (
            <button type="button" className={editing ? btn.primary : btn.secondary} onClick={() => setEditing(!editing)}>
              <Icon name={editing ? 'check' : 'layout'} />
              {editing ? 'Done' : 'Edit layout'}
            </button>
          )}
          </div>
        </header>
        {route.view === 'users' ? <UsersPage /> : route.view === 'contracts' ? <ContractsPage /> : route.view === 'settings' || route.view === 'billing' ? <SettingsPage /> : isDashboard ? <Dashboard editing={editing} /> : <ClientsPage />}
          </>
        )}
      </main>

      {tour.open && tour.currentStep && (
        <Tour
          open={tour.open}
          step={tour.currentStep}
          currentIndex={tour.currentIndex}
          totalSteps={tour.steps.length}
          onNext={tour.onNext}
          onPrev={tour.onPrev}
          onSkip={tour.onSkip}
        />
      )}
    </div>
  )
}
