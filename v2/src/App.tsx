import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './data/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { OrgProvider } from './rbac/OrgProvider'
import { useOrg } from './rbac/useOrg'
import { guardHash, parseRoute, type Route } from './rbac/route'
import { AuthPage } from './auth/AuthPage'
import { CreateOrgPage } from './orgs/CreateOrgPage'
import { OrgSwitcher } from './orgs/OrgSwitcher'
import { MembersPage } from './members/MembersPage'
import { RolesPage } from './roles/RolesPage'
import { FormsPage } from './forms/FormsPage'
import { FillPage } from './forms/fill/FillPage'
import { FormBuilder } from './forms/builder/FormBuilder'
import { SubmissionsPage } from './forms/submissions/SubmissionsPage'
import { Wordmark } from './ui/Wordmark'
import { Skeleton } from './ui/Skeleton'
import { useAction } from './ui/useAction'
import { blocksNavigation } from './ui/navGuard'

const useHash = () => {
  const [hash, setHash] = useState(location.hash || '#/members')
  const current = useRef(hash)
  useEffect(() => {
    const on = () => {
      const next = location.hash || '#/members'
      if (blocksNavigation(next)) { history.replaceState(null, '', current.current); return } // the page asks first
      current.current = next
      setHash(next)
    }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return hash
}

function Page({ route }: { route: Route }) {
  switch (route.page) {
    case 'roles': return <RolesPage />
    case 'forms': return <FormsPage />
    case 'form-edit': return <FormBuilder id={route.id} />
    case 'form-submissions': return <SubmissionsPage id={route.id} />
    case 'form-fill': return <FillPage id={route.id} />
    default: return <MembersPage />
  }
}

function Shell() {
  const { orgs, orgId, loading, failed, can } = useOrg()
  const rawHash = useHash()
  const hash = loading ? rawHash : guardHash(rawHash, { roles: can('roles.manage'), forms: can('forms.manage') })
  useEffect(() => { if (hash !== rawHash) location.replace(hash) }, [hash, rawHash])
  const out = useAction()
  if (loading) {
    return (
      <div className="p-6 mx-auto max-w-5xl flex flex-col gap-6">
        <Skeleton rows={[{ w: '160px', h: 40 }]} />
        <Skeleton rows={[{ w: '200px', h: 32 }, { w: '100%', h: 240 }]} />
      </div>
    )
  }
  if (failed) {
    return (
      <main className="min-h-screen grid place-items-center p-4 sm:p-6">
        <div className="rnr-card gap-3 w-full max-w-[400px]">
          <h1 className="page-title">We could not load your organisations</h1>
          <p className="rnr-muted">Check your connection and reload the page.</p>
          <button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => location.reload()}>Reload page</button>
        </div>
      </main>
    )
  }
  if (!orgs.length || hash === '#/new-org') return <CreateOrgPage />
  const route = parseRoute(hash)
  const link = (href: string, label: string, current: boolean) => (
    <a href={href} aria-current={current ? 'page' : undefined}
      className={`rnr-btn ${current ? 'rnr-btn-secondary' : 'rnr-btn-ghost'}`}>{label}</a>
  )
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only rnr-btn rnr-btn-secondary">Skip to content</a>
      <header className="bg-surface-100 border-b border-line-200">
        <div className="mx-auto max-w-5xl flex flex-wrap items-center gap-4 px-6 py-3">
          <Wordmark href="#/members" />
          <div className="w-full order-last sm:order-none sm:w-auto"><OrgSwitcher /></div>
          <nav aria-label="Main" className="flex gap-1 order-last sm:order-none">
            {link('#/members', 'Members', route.page === 'members')}
            {link('#/forms', 'Forms', route.page.startsWith('form'))}
            {can('roles.manage') && link('#/roles', 'Roles', route.page === 'roles')}
          </nav>
          <button className="rnr-btn rnr-btn-ghost ml-auto" type="button" aria-busy={out.busy}
            onClick={() => out.run(() => supabase.auth.signOut())}>
            {out.busy && <span className="rnr-spin" aria-hidden="true" />}{out.busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl p-6">
        <Page key={`${orgId}${hash}`} route={route} />
      </main>
    </>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const qc = useQueryClient()
  const lastUser = useRef<string | undefined>(undefined)
  useEffect(() => {
    // A different (or no) user must never see the previous user's cached data.
    const apply = (s: Session | null) => {
      const id = s?.user.id
      if (lastUser.current !== undefined && lastUser.current !== id) {
        qc.clear()
        try { localStorage.removeItem('rnr.orgId') } catch { /* private mode */ }
      }
      lastUser.current = id ?? ''
      setSession(s)
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => apply(s))
    return () => data.subscription.unsubscribe()
  }, [qc])
  if (session === undefined) return null
  if (!session) return <AuthPage />
  return <OrgProvider key={session.user.id} userId={session.user.id}><Shell /></OrgProvider>
}
