import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './data/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { OrgProvider } from './rbac/OrgProvider'
import { useOrg } from './rbac/useOrg'
import { guardHash, parseRoute, type Route } from './rbac/route'
import { AuthPage } from './auth/AuthPage'
import { SetPassword } from './auth/SetPassword'
import { isSetPasswordFlow } from './auth/password'
import { CreateOrgPage } from './orgs/CreateOrgPage'
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
import { Shell as AppShell } from './ui/Shell'
import { Skeleton } from './ui/Skeleton'
import { blocksNavigation } from './ui/navGuard'
import { syncFromSession, useFollowSystem } from './ui/useAppearance'

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

function Signed({ email }: { email: string }) {
  const { orgs, orgId, loading, failed, can } = useOrg()
  const rawHash = useHash()
  const mayReport = can('reports.view') || can('reports.manage')
  const hash = loading ? rawHash : guardHash(rawHash, { roles: can('roles.manage'), forms: can('forms.manage'), workflows: can('workflows.manage'), comms: can('comms.manage'), reports: mayReport, reportsManage: can('reports.manage'), broadcast: can('comms.broadcast') })
  useEffect(() => { if (hash !== rawHash) location.replace(hash) }, [hash, rawHash])
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
          <h1 className="rnr-page-title">Your organisations did not load</h1>
          <p className="rnr-muted">Check your connection and reload the page.</p>
          <button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => location.reload()}>Reload page</button>
        </div>
      </main>
    )
  }
  if (!orgs.length || hash === '#/new-org') return <CreateOrgPage />
  const route = parseRoute(hash)
  return (
    <AppShell page={route.page} email={email}
      perms={{ reports: mayReport, workflows: can('workflows.manage'), comms: can('comms.manage'), broadcast: can('comms.broadcast'), roles: can('roles.manage') }}>
      <Page key={`${orgId}${hash}`} route={route} />
    </AppShell>
  )
}

export default function App() {
  useFollowSystem()
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [settingPassword, setSettingPassword] = useState(() => isSetPasswordFlow(location.search))
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
      if (s && lastUser.current !== id) {
        // The cached session can be an hour old; ask once per sign-in so another device's choice shows after a reload.
        syncFromSession(s.user.user_metadata)
        void supabase.auth.getUser().then(({ data: { user } }) => { if (user && user.id === id) syncFromSession(user.user_metadata) })
      }
      lastUser.current = id ?? ''
      setSession(s)
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => apply(s))
    return () => data.subscription.unsubscribe()
  }, [qc])
  if (session === undefined) return null
  if (settingPassword) {
    // The reset email signed this person in; saving the password (or giving up on an expired link) carries on to the app or sign in.
    return <SetPassword hasSession={!!session} onDone={() => { history.replaceState(null, '', `${location.pathname}#/inbox`); setSettingPassword(false) }} />
  }
  if (!session) return <AuthPage />
  return <OrgProvider key={session.user.id} userId={session.user.id}><Signed email={session.user.email ?? ''} /></OrgProvider>
}
