import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Avatar, btn, Dialog, Icon, Menu, menuItemClass, Wordmark } from '../ui'
import { AppearancePanel } from '../settings/AppearanceSettings'
import { FirmsTable } from './FirmsTable'
import { CreateFirmDialog } from './CreateFirmDialog'
import { SupportView } from './SupportView'
import { PlatformSettings } from './PlatformSettings'
import { Waitlist } from './Waitlist'
import { callAdmin, type AdminListFirmsResponse } from './api'

type View = 'firms' | 'settings' | 'waitlist' | 'support'
type Route = { view: View; firmId: string | null; firmName?: string; currency?: string }

const readRoute = (): Route => {
  const hash = location.hash.slice(1)
  if (hash.startsWith('admin/support/')) {
    const parts = hash.split('/')
    const firmId = parts[2]
    return { view: 'support', firmId }
  }
  if (hash === 'admin/settings') return { view: 'settings', firmId: null }
  if (hash === 'admin/waitlist') return { view: 'waitlist', firmId: null }
  return { view: 'firms', firmId: null }
}

const setRoute = (route: Route) => {
  if (route.view === 'support' && route.firmId) {
    location.hash = `#admin/support/${route.firmId}`
  } else if (route.view === 'settings') {
    location.hash = '#admin/settings'
  } else if (route.view === 'waitlist') {
    location.hash = '#admin/waitlist'
  } else {
    location.hash = '#admin'
  }
}

const NAV: { view: View; label: string; icon: 'building' | 'mail' | 'sliders' }[] = [
  { view: 'firms', label: 'Firms', icon: 'building' },
  { view: 'waitlist', label: 'Waitlist', icon: 'mail' },
  { view: 'settings', label: 'Platform settings', icon: 'sliders' },
]

const TITLE: Record<Exclude<View, 'support'>, { title: string; lede: string }> = {
  firms: { title: 'Firms', lede: 'Manage all firms on the platform.' },
  waitlist: { title: 'Waitlist', lede: 'People waiting for a place in early access.' },
  settings: { title: 'Platform settings', lede: 'Limits that apply to every new firm.' },
}

const useDesktop = () =>
  useSyncExternalStore(
    (notify) => { const m = matchMedia('(min-width: 768px)'); m.addEventListener('change', notify); return () => m.removeEventListener('change', notify) },
    () => matchMedia('(min-width: 768px)').matches,
  )

export function AdminConsole({ profileId, name, onSignOut }: { profileId: string; name: string; onSignOut: () => void }) {
  const [route, setRouteState] = useState(readRoute)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showAppearance, setShowAppearance] = useState(false)
  const desktop = useDesktop()
  const drawer = useRef<HTMLDialogElement>(null)

  const firms = useQuery({
    queryKey: ['admin', 'firms'],
    queryFn: async () => (await callAdmin('list_firms', {})) as AdminListFirmsResponse,
  })

  useEffect(() => {
    const onHash = () => {
      setRouteState(readRoute())
    }
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  const supportFirm = route.view === 'support' && route.firmId
    ? (firms.data?.firms ?? []).find((f) => f.id === route.firmId) ?? null
    : null

  const navigate = (view: View, firmId: string | null = null) => {
    setRoute({ view, firmId })
  }

  const showSupport = (firmId: string) => {
    navigate('support', firmId)
  }

  const current = route.view === 'support' ? 'firms' : route.view
  const sideLink = (item: (typeof NAV)[number], inDrawer: boolean) => (
    <li key={item.view}>
      <a
        className="rnr-side-link"
        href={item.view === 'firms' ? '#admin' : `#admin/${item.view}`}
        aria-current={current === item.view ? 'page' : undefined}
        onClick={inDrawer ? () => drawer.current?.close() : undefined}
      >
        <Icon name={item.icon} className="size-5" />
        {item.label}
      </a>
    </li>
  )
  const sideBody = (inDrawer: boolean) => (
    <>
      <nav aria-label={inDrawer ? 'Main menu' : 'Main'}>
        <ul className="grid gap-0.5 p-0 list-none">{NAV.map((item) => sideLink(item, inDrawer))}</ul>
      </nav>
      <div className="rnr-side-foot">
        <div className="rnr-account">
          <Avatar name={name} size="size-8" />
          <div className="min-w-0 flex-1">
            <p className="rnr-account-email">{name}</p>
            <p className="rnr-caption truncate">Admin</p>
          </div>
          <Menu trigger={<Icon name="more" className="size-5" />} triggerLabel={`Account menu for ${name}`} menuLabel="Account" align="up" triggerClassName="rnr-icon-btn">
            {(close) => (
              <>
                <button type="button" role="menuitem" className={menuItemClass} onClick={() => { close(); drawer.current?.close(); setShowAppearance(true) }}>
                  <Icon name="sliders" /> Appearance
                </button>
                <div className="rnr-menu-sep" />
                <button type="button" role="menuitem" className={menuItemClass} onClick={onSignOut}>
                  <Icon name="logout" /> Sign out
                </button>
              </>
            )}
          </Menu>
        </div>
      </div>
    </>
  )

  const heading = route.view !== 'support' ? TITLE[route.view] : null
  const backToFirms = (
    <a href="#admin" className="rnr-crumb"><Icon name="back" />Back to firms</a>
  )

  return (
    <div className="rnr-shell">
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('main')?.focus()
        }}
        className="rnr-skip rnr-btn rnr-btn-secondary"
      >
        Skip to content
      </a>
      <aside className="rnr-side rnr-folder">
        <span className="rnr-folder-tab rnr-side-tab"><Wordmark href="#admin" /></span>
        <div className="rnr-folder-body rnr-side-body">{desktop && sideBody(false)}</div>
      </aside>
      <header className="rnr-topbar">
        <span className="rnr-topbar-mark"><Wordmark href="#admin" /></span>
      </header>
      <nav className="rnr-phonebar" aria-label="Quick">
        {NAV.map((item) => (
          <a key={item.view} href={item.view === 'firms' ? '#admin' : `#admin/${item.view}`} aria-label={item.label} aria-current={current === item.view ? 'page' : undefined}>
            <Icon name={item.icon} className="size-5" />
          </a>
        ))}
        <button type="button" aria-label="Menu" aria-haspopup="dialog" onClick={() => drawer.current?.showModal()}>
          <Icon name="layout" className="size-5" />
        </button>
      </nav>
      <dialog ref={drawer} className="rnr-dialog rnr-drawer" aria-label="Menu">
        <button type="button" className="rnr-icon-btn self-end" aria-label="Close menu" onClick={() => drawer.current?.close()}>
          <Icon name="x" className="size-5" />
        </button>
        {!desktop && sideBody(true)}
      </dialog>

      <main id="main" tabIndex={-1} className="rnr-page outline-none">
        {heading && (
          <header className="rnr-page-head">
            <div>
              <h1 className="rnr-page-title">{heading.title}</h1>
              <p className="rnr-lede">{heading.lede}</p>
            </div>
            {route.view === 'firms' && (
              <div className="rnr-page-actions">
                <button onClick={() => setShowCreateDialog(true)} className={btn.primary}>
                  <Icon name="plus" className="size-4" />
                  Create firm
                </button>
              </div>
            )}
          </header>
        )}

        {route.view === 'firms' && <FirmsTable onSupportView={showSupport} />}
        {route.view === 'settings' && <PlatformSettings />}
        {route.view === 'waitlist' && <Waitlist />}

        {route.view === 'support' && (
          <>
            {firms.isPending && <p className="text-ink-2" role="status">Loading…</p>}
            {!firms.isPending && !supportFirm && (
              <div className="grid gap-4">
                {backToFirms}
                <p className="rnr-error" role="alert"><Icon name="alert" />Firm not found</p>
              </div>
            )}
            {supportFirm && (
              <div className="grid gap-4">
                {backToFirms}
                <h1 className="rnr-page-title">{supportFirm.name}</h1>
                <SupportView
                  firmId={supportFirm.id}
                  firmName={supportFirm.name}
                  currency={supportFirm.currency}
                />
              </div>
            )}
          </>
        )}
      </main>

      <CreateFirmDialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} />
      <Dialog open={showAppearance} onClose={() => setShowAppearance(false)} title="Appearance">
        <AppearancePanel profileId={profileId} />
      </Dialog>
    </div>
  )
}
