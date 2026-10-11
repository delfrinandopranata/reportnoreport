import { useEffect, useRef, useState, type ReactNode } from 'react'
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
import { InboxPage } from './inbox/InboxPage'
import { StartPage } from './inbox/StartPage'
import { TaskPage } from './inbox/TaskPage'
import { RecordsPage } from './records/RecordsPage'
import { RecordPage } from './records/RecordPage'
import { WorkflowsPage } from './workflows/WorkflowsPage'
import { WorkflowEditor } from './workflows/canvas/WorkflowEditor'
import { AccessPage } from './workflows/AccessPage'
import { NotificationBell } from './comms/NotificationBell'
import { SettingsPage } from './comms/SettingsPage'
import { TemplatesPage } from './comms/TemplatesPage'
import { TemplateEditor } from './comms/TemplateEditor'
import { MessagesPage } from './comms/MessagesPage'
import { ReportTemplatePage } from './reports/ReportTemplatePage'
import { DashboardPage } from './reports/DashboardPage'
import { ReportsPage } from './reports/ReportsPage'
import { ReportPage } from './reports/ReportPage'
import { CampaignsPage } from './campaigns/CampaignsPage'
import { CampaignPage } from './campaigns/CampaignPage'
import { Wordmark } from './ui/Wordmark'
import { CampaignIcon, DashboardIcon, FlowIcon, FormIcon, InboxIcon, LogoutIcon, MessageIcon, PeopleIcon, RecordsIcon, ReportIcon, SettingsIcon, ShieldIcon, TemplateIcon } from './ui/icons'
import { Skeleton } from './ui/Skeleton'
import { useAction } from './ui/useAction'
import { blocksNavigation, guarded } from './ui/navGuard'

const useHash = () => {
  const [hash, setHash] = useState(location.hash || '#/inbox')
  const current = useRef(hash)
  useEffect(() => {
    const on = () => {
      const next = location.hash || '#/inbox'
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
    case 'inbox': return <InboxPage />
    case 'start': return <StartPage id={route.id} />
    case 'task': return <TaskPage id={route.id} />
    case 'records': return <RecordsPage />
    case 'record': return <RecordPage id={route.id} />
    case 'forms': return <FormsPage />
    case 'workflows': return <WorkflowsPage />
    case 'workflow-edit': return <WorkflowEditor id={route.id} />
    case 'workflow-access': return <AccessPage id={route.id} />
    case 'workflow-report': return <ReportTemplatePage id={route.id} />
    case 'dashboard': return <DashboardPage />
    case 'reports': return <ReportsPage />
    case 'report': return <ReportPage id={route.id} />
    case 'form-edit': return <FormBuilder id={route.id} />
    case 'form-submissions': return <SubmissionsPage id={route.id} />
    case 'form-fill': return <FillPage id={route.id} />
    case 'settings': return <SettingsPage />
    case 'templates': return <TemplatesPage />
    case 'template': return <TemplateEditor id={route.id} />
    case 'messages': return <MessagesPage />
    case 'campaigns': return <CampaignsPage />
    case 'campaign': return <CampaignPage id={route.id} />
    default: return <MembersPage />
  }
}

function Shell() {
  const { orgs, orgId, loading, failed, can } = useOrg()
  const rawHash = useHash()
  const mayReport = can('reports.view') || can('reports.manage')
  const hash = loading ? rawHash : guardHash(rawHash, { roles: can('roles.manage'), forms: can('forms.manage'), workflows: can('workflows.manage'), comms: can('comms.manage'), reports: mayReport, reportsManage: can('reports.manage'), broadcast: can('comms.broadcast') })
  useEffect(() => { if (hash !== rawHash) location.replace(hash) }, [hash, rawHash])
  const out = useAction()
  if (loading) {
    return (
      <div className="rnr-main flex flex-col gap-6">
        <Skeleton rows={[{ w: '160px', h: 40 }]} />
        <Skeleton rows={[{ w: '200px', h: 32 }, { w: '100%', h: 240 }]} />
      </div>
    )
  }
  if (failed) {
    return (
      <main className="min-h-screen grid place-items-center p-4 sm:p-6">
        <div className="rnr-card gap-3 w-full max-w-[400px]">
          <h1 className="page-title">Your organisations did not load</h1>
          <p className="rnr-muted">Check your connection and reload the page.</p>
          <button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => location.reload()}>Reload page</button>
        </div>
      </main>
    )
  }
  if (!orgs.length || hash === '#/new-org') return <CreateOrgPage />
  const route = parseRoute(hash)
  const link = (href: string, label: string, current: boolean, icon: ReactNode) => (
    <a href={href} aria-current={current ? 'page' : undefined} className="rnr-nav-link">{icon}<span>{label}</span></a>
  )
  return (
    <div className="rnr-shell">
      <a href="#main" className="sr-only focus:not-sr-only rnr-btn rnr-btn-secondary">Skip to content</a>
      <aside className="rnr-side" aria-label="Workspace">
        <div className="rnr-side-top">
          <Wordmark href="#/inbox" />
          <OrgSwitcher />
        </div>
        <nav aria-label="Main" className="rnr-nav">
          {link('#/inbox', 'Inbox', route.page === 'inbox' || route.page === 'start' || route.page === 'task', <InboxIcon size={18} />)}
          {link('#/records', 'Records', route.page === 'records' || route.page === 'record', <RecordsIcon size={18} />)}
          {mayReport && link('#/dashboard', 'Dashboard', route.page === 'dashboard', <DashboardIcon size={18} />)}
          {mayReport && link('#/reports', 'Reports', route.page === 'reports' || route.page === 'report', <ReportIcon size={18} />)}
          {link('#/forms', 'Forms', route.page.startsWith('form'), <FormIcon size={18} />)}
          {can('workflows.manage') && link('#/workflows', 'Workflows', route.page.startsWith('workflow'), <FlowIcon size={18} />)}
          {can('comms.manage') && link('#/templates', 'Templates', route.page === 'templates' || route.page === 'template', <TemplateIcon size={18} />)}
          {can('comms.manage') && link('#/messages', 'Messages', route.page === 'messages', <MessageIcon size={18} />)}
          {can('comms.broadcast') && link('#/campaigns', 'Campaigns', route.page === 'campaigns' || route.page === 'campaign', <CampaignIcon size={18} />)}
          {link('#/members', 'Members', route.page === 'members', <PeopleIcon size={18} />)}
          {can('roles.manage') && link('#/roles', 'Roles', route.page === 'roles', <ShieldIcon size={18} />)}
        </nav>
      </aside>
      <div className="rnr-stage">
        <header className="rnr-topbar">
          <NotificationBell />
          {link('#/settings', 'Settings', route.page === 'settings', <SettingsIcon size={18} />)}
          <button className="rnr-btn rnr-btn-ghost" type="button" aria-busy={out.busy}
            onClick={() => guarded(() => out.run(() => supabase.auth.signOut()))}>
            {out.busy ? <span className="rnr-spin" aria-hidden="true" /> : <LogoutIcon size={16} />}{out.busy ? 'Signing out…' : 'Sign out'}
          </button>
        </header>
        <main id="main" className="rnr-main">
          <Page key={`${orgId}${hash}`} route={route} />
        </main>
      </div>
    </div>
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
