import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session as AuthSession } from '@supabase/supabase-js'
import { can as roleCan, type Action } from '../users/rules'
import { localiseBlockReason } from '../trial'
import { rowToFirm, rowToMember, type Firm, type Member } from './mappers'
import { openedFromSetPasswordLink, supabase } from './supabase'
import { toUserMessage } from './errors'
import { btn } from '../ui'
import { AuthPages } from '../auth/AuthPages'
import { rememberReturnTo } from '../auth/route'
import { AdminConsole } from '../admin/AdminConsole'
import { pendingFirmFromMetadata, isEarlyAccessFull, shouldCreateFirm, earlyAccessMessage } from './signup.ts'
import { DEMO, getStore } from '../demo/store'

export type Session = {
  userId: string; profile: Member; firm: Firm
  can(action: Action): boolean; canWrite: boolean; writeBlockReason: string | null
  signOut(): Promise<void>
}

const Ctx = createContext<Session | null>(null)

export function useSession(): Session {
  const s = useContext(Ctx)
  if (!s) throw new Error('useSession must be used inside a signed-in SessionProvider')
  return s
}

/** No sign-in, no Supabase: the demo persona is always the firm owner, with write access, from a demo store kept in localStorage. */
function DemoSessionProvider({ children }: { children: ReactNode }) {
  const store = getStore()
  const session: Session = {
    userId: store.profile.userId, profile: store.profile, firm: store.firm,
    can: (a) => roleCan(store.profile.role, a), canWrite: true, writeBlockReason: null,
    signOut: async () => {},
  }
  return <Ctx.Provider value={session}>{children}</Ctx.Provider>
}

export function SessionProvider({ children }: { children: ReactNode }) {
  return DEMO ? <DemoSessionProvider>{children}</DemoSessionProvider> : <RealSessionProvider>{children}</RealSessionProvider>
}

function RealSessionProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthSession | null | undefined>(undefined)
  const [settingPassword, setSettingPassword] = useState(openedFromSetPasswordLink)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) rememberReturnTo(location.hash)
      setAuth(data.session)
    })
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setSettingPassword(true)
      if (event === 'SIGNED_OUT' && !location.hash.startsWith('#signin')) rememberReturnTo(location.hash)
      setAuth(session)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = auth?.user.id
  const context = useQuery({
    queryKey: ['session', userId],
    enabled: !!userId && !settingPassword,
    queryFn: async () => {
      const accepted = await supabase.rpc('accept_invite')
      if (accepted.error) throw accepted.error
      const touched = await supabase.rpc('touch_last_active')
      if (touched.error) console.error('touch_last_active failed', touched.error)
      const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('user_id', userId!).maybeSingle()
      if (profileError) throw profileError

      if (profile?.is_super_admin) return { profile, firm: null, reason: null, isSuperAdmin: true }

      let currentProfile = profile
      if (shouldCreateFirm(profile, auth?.user.user_metadata)) {
        const pendingFirm = pendingFirmFromMetadata(auth?.user.user_metadata)
        if (pendingFirm) {
          const { error: createError } = await supabase.rpc('create_firm_for_current_user', {
            p_firm_name: pendingFirm.firmName,
            p_currency: pendingFirm.currency,
            p_person_name: pendingFirm.personName,
          })
          if (createError) {
            if (isEarlyAccessFull(createError)) {
              const email = auth?.user.email
              let joinedWaitlist = false
              if (email) {
                const { error: joinError } = await supabase.rpc('join_waitlist', {
                  p_email: email,
                  p_firm_name: pendingFirm.firmName,
                })
                if (joinError) {
                  console.error('join_waitlist failed', joinError)
                } else {
                  joinedWaitlist = true
                }
              }
              throw Object.assign(new Error(createError instanceof Error ? createError.message : String(createError)), createError, { joinedWaitlist })
            }
            throw createError
          }
          const { data: newProfile, error: reloadError } = await supabase.from('profiles').select('*').eq('user_id', userId!).maybeSingle()
          if (reloadError) throw reloadError
          currentProfile = newProfile
          if (!currentProfile) throw new Error('Profile creation failed')
        }
      }

      if (!currentProfile) return { profile: null, firm: null, reason: null, isSuperAdmin: false }

      if (!currentProfile.firm_id) return { profile: currentProfile, firm: null, reason: null, isSuperAdmin: false }
      const { data: firm, error: firmError } = await supabase.from('firms').select('*').eq('id', currentProfile.firm_id).maybeSingle()
      if (firmError) throw firmError
      const { data: reason, error: reasonError } = await supabase.rpc('firm_write_block_reason', { firm: currentProfile.firm_id })
      if (reasonError) throw reasonError
      return { profile: currentProfile, firm, reason: reason as string | null, isSuperAdmin: false }
    },
  })

  if (auth && settingPassword) return <AuthPages forceSetPassword onPasswordSet={() => setSettingPassword(false)} />
  if (auth === undefined || (userId && context.isPending)) return <FullPageMessage text="Loading..." />
  if (!auth) return <AuthPages />
  if (context.isError) {
    const err = context.error
    const isFullError = isEarlyAccessFull(err)
    if (isFullError) {
      const joined = typeof err === 'object' && err !== null && 'joinedWaitlist' in err ? (err as { joinedWaitlist?: boolean }).joinedWaitlist === true : false
      const msg = earlyAccessMessage(joined)
      return <FullPageMessage title="Early access is full" text={msg} action={() => supabase.auth.signOut()} />
    }
    const msg = toUserMessage(err)
    return <FullPageMessage title="Your account did not load" text={msg} action={() => supabase.auth.signOut()} retry={() => context.refetch()} />
  }
  const result = context.data!
  if (result.isSuperAdmin) {
    return <AdminConsole profileId={result.profile!.id} name={result.profile!.name} onSignOut={() => supabase.auth.signOut()} />
  }
  const { profile, firm, reason } = result
  if (!firm) return <FullPageMessage title="No access to this firm" text="Your access is suspended, or your firm is not set up yet. Contact your firm owner." action={() => supabase.auth.signOut()} />

  const member = rowToMember(profile)
  const mappedFirm = rowToFirm(firm)
  const blockReason = localiseBlockReason(reason, mappedFirm.trialEndsAt)
  const session: Session = {
    userId: userId!, profile: member, firm: mappedFirm,
    can: (a) => member.status === 'active' && roleCan(member.role, a),
    canWrite: reason === null, writeBlockReason: blockReason,
    signOut: async () => { await supabase.auth.signOut() },
  }
  return <Ctx.Provider value={session}>{children}</Ctx.Provider>
}

function FullPageMessage({ text, title, action, retry }: { text: string; title?: string; action?: () => void; retry?: () => void }) {
  if (!title) return (
    <div className="grid min-h-dvh place-items-center p-6" role="status" aria-live="polite">
      <div className="grid justify-items-center gap-3 text-ink-2">
        <span className="rnr-spin size-6" aria-hidden />
        {text}
      </div>
    </div>
  )
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="rnr-paper w-full max-w-sm p-6 pt-8" role="alert">
        <div className="rnr-empty border-0 p-0">
          <h1 className="rnr-heading">{title}</h1>
          <p>{text}</p>
          <div className="grid w-full gap-2">
            {retry && <button type="button" onClick={retry} className={btn.primary}>Try again</button>}
            {action && <button type="button" onClick={action} className={retry ? btn.ghost : btn.primary}>Sign out</button>}
          </div>
        </div>
      </div>
    </main>
  )
}
