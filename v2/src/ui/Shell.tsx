import { useRef, type ReactNode } from 'react'
import { supabase } from '../data/supabase'
import { OrgSwitcher } from '../orgs/OrgSwitcher'
import { NotificationBell } from '../comms/NotificationBell'
import { Wordmark } from './Wordmark'
import { JumpBar } from './JumpBar'
import { useAction } from './useAction'
import { useMedia } from './useMedia'
import { guarded } from './navGuard'
import { GearIcon, MenuIcon, NAV_ICONS, XIcon } from './icons'
import { jumpItems, navGroups, phoneItems, type NavPerms } from './nav'
import type { Route } from '../rbac/route'

const initials = (email: string) => email.slice(0, 2).toUpperCase() || '?'

/** The app frame: sidebar folder (desktop), top bar + phone bar + drawer (below 768px). Spec: design/components/Shell. */
export function Shell({ page, perms, email, children }: { page: Route['page']; perms: NavPerms; email: string; children: ReactNode }) {
  const groups = navGroups(page, perms)
  const drawer = useRef<HTMLDialogElement>(null)
  const main = useRef<HTMLElement>(null)
  const out = useAction()
  // Only one bell is mounted at a time: each runs its own realtime feed and announcer.
  const desktop = useMedia('(min-width: 768px)')

  const links = (inDrawer: boolean) => groups.map((g) => (
    <div key={g.label} className="rnr-side-group">
      <p className="rnr-micro" id={`nav-${g.label}`}>{g.label}</p>
      <ul aria-labelledby={`nav-${g.label}`}>
        {g.items.map((i) => {
          const Icon = NAV_ICONS[i.icon]
          return (
            <li key={i.href}>
              <a className="rnr-side-link" href={i.href} aria-current={i.current ? 'page' : undefined} onClick={inDrawer ? () => drawer.current?.close() : undefined}><Icon size={20} />{i.label}</a>
            </li>
          )
        })}
      </ul>
    </div>
  ))
  const foot = (bell: boolean) => (
    <div className="rnr-side-foot">
      {bell && <NotificationBell variant="side" />}
      <a className="rnr-side-link" href="#/settings" aria-current={page === 'settings' ? 'page' : undefined}><GearIcon size={20} />Settings</a>
      <div className="rnr-account">
        <span className="rnr-avatar rnr-avatar--sm" aria-hidden="true">{initials(email)}</span>
        <span className="rnr-account-email">{email}</span>
        <button className="rnr-btn rnr-btn-ghost rnr-btn-sm" type="button" aria-busy={out.busy}
          onClick={() => guarded(() => out.run(() => supabase.auth.signOut()))}>
          {out.busy && <span className="rnr-spin" aria-hidden="true" />}{out.busy ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="rnr-shell">
      <a href="#main" className="rnr-skip rnr-btn rnr-btn-secondary" onClick={(e) => { e.preventDefault(); main.current?.focus() }}>Skip to content</a>
      <aside className="rnr-side rnr-folder">
        <span className="rnr-folder-tab rnr-side-tab"><Wordmark href="#/inbox" /></span>
        <div className="rnr-folder-body rnr-side-body">
          <OrgSwitcher />
          <nav aria-label="Main">{links(false)}</nav>
          {foot(desktop)}
        </div>
      </aside>
      <header className="rnr-topbar">
        <span className="rnr-topbar-mark"><Wordmark href="#/inbox" /></span>
        <JumpBar items={jumpItems(groups)} />
        {!desktop && <span className="rnr-topbar-bell"><NotificationBell /></span>}
      </header>
      <main id="main" ref={main} tabIndex={-1} className="rnr-page">{children}</main>
      <nav className="rnr-phonebar" aria-label="Quick">
        {phoneItems(groups).map((i) => {
          const Icon = NAV_ICONS[i.icon]
          return <a key={i.href} href={i.href} aria-current={i.current ? 'page' : undefined} aria-label={i.label}><Icon size={20} /></a>
        })}
        <button type="button" aria-label="Menu" aria-haspopup="dialog" onClick={() => drawer.current?.showModal()}><MenuIcon size={20} /></button>
      </nav>
      <dialog ref={drawer} className="rnr-dialog rnr-drawer" aria-label="Menu">
        <button type="button" className="rnr-icon-btn self-end" aria-label="Close menu" onClick={() => drawer.current?.close()}><XIcon size={20} /></button>
        <OrgSwitcher />
        <nav aria-label="Main">{links(true)}</nav>
        {foot(false)}
      </dialog>
    </div>
  )
}
