import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session as AuthSession } from '@supabase/supabase-js'
import { can as roleCan, type Action } from '../users/rules'
import { rowToFirm, rowToMember, type Firm, type Member } from './mappers'
import { openedFromSetPasswordLink, supabase } from './supabase'
import { btn } from '../ui'
import { AuthPages } from '../auth/AuthPages'
import { rememberReturnTo } from '../auth/route'
import { AdminConsole } from '../admin/AdminConsole'
import { pendingFirmFromMetadata, isEarlyAccessFull } from './signup.ts'

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

export function SessionProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthSession | null | undefined>(undefined)
  const [settingPassword, setSettingPassword] = useState(openedFromSetPasswordLink)
  const [creatingFirm, setCreatingFirm] = useState(false)
  const [firmCreationError, setFirmCreationError] = useState<{ isEarlyAccessFull: boolean; message: string } | null>(null)

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
    enabled: !!userId && !settingPassword && !creatingFirm && !firmCreationError,
    queryFn: async () => {
      const accepted = await supabase.rpc('accept_invite')
      if (accepted.error) throw accepted.error
      const touched = await supabase.rpc('touch_last_active')
      if (touched.error) console.error('touch_last_active failed', touched.error)
      const { data: profile, error } = await supabase.from('profiles').select('*').eq('user_id', userId!).single()
      if (error) throw error

      if (profile.is_super_admin) {
        return { profile, firm: null, reason: null, isSuperAdmin: true }
      }

      if (!profile.firm_id) {
        const pendingFirm = pendingFirmFromMetadata(auth?.user.user_metadata)
        if (pendingFirm) {
          setCreatingFirm(true)
          const { error: createError } = await supabase.rpc('create_firm_for_current_user', {
            p_firm_name: pendingFirm.firmName,
            p_currency: pendingFirm.currency,
            p_person_name: pendingFirm.personName,
          })
          setCreatingFirm(false)
          if (createError) {
            const isFullError = isEarlyAccessFull(createError)
            setFirmCreationError({
              isEarlyAccessFull: isFullError,
              message: isFullError ? 'Early access is full. You are on the waitlist -- we will email you when a place opens.' : (createError as any).message || 'Something went wrong. Try again.',
            })
            throw createError
          }
          return { refetch: true }
        }
      }

      if (!profile.firm_id) return { profile, firm: null, reason: null }
      const { data: firm, error: firmError } = await supabase.from('firms').select('*').eq('id', profile.firm_id).maybeSingle()
      if (firmError) throw firmError
      const { data: reason, error: reasonError } = await supabase.rpc('firm_write_block_reason', { firm: profile.firm_id })
      if (reasonError) throw reasonError
      return { profile, firm, reason: reason as string | null }
    },
  })

  if (auth && settingPassword) return <AuthPages forceSetPassword onPasswordSet={() => setSettingPassword(false)} />
  if (auth === undefined || (userId && context.isPending)) return <FullPageMessage text="Loading..." />
  if (!auth) return <AuthPages />
  if (firmCreationError) {
    return <FullPageMessage title={firmCreationError.isEarlyAccessFull ? 'Early access is full' : 'Something went wrong'} text={firmCreationError.message} action={() => supabase.auth.signOut()} />
  }
  if (context.isError) return <FullPageMessage title="We could not load your account" text="Check your connection and try again. If it keeps failing, sign out and back in." action={() => supabase.auth.signOut()} retry={() => context.refetch()} />
  const result = context.data!
  if (result.refetch) return <FullPageMessage text="Setting up your firm..." />
  if (result.isSuperAdmin) {
    return <AdminConsole name={result.profile.name} onSignOut={() => supabase.auth.signOut()} />
  }
  const { profile, firm, reason } = result
  if (!firm) return <FullPageMessage title="No access to this firm" text="Your access is suspended, or your firm is not set up yet. Contact your firm owner." action={() => supabase.auth.signOut()} />

  const member = rowToMember(profile)
  const session: Session = {
    userId: userId!, profile: member, firm: rowToFirm(firm),
    can: (a) => member.status === 'active' && roleCan(member.role, a),
    canWrite: reason === null, writeBlockReason: reason,
    signOut: async () => { await supabase.auth.signOut() },
  }
  return <Ctx.Provider value={session}>{children}</Ctx.Provider>
}

function FullPageMessage({ text, title, action, retry }: { text: string; title?: string; action?: () => void; retry?: () => void }) {
  const ring = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:focus-visible:outline-white'
  if (!title) return (
    <div className="grid min-h-dvh place-items-center bg-zinc-50 p-6 dark:bg-zinc-950" role="status" aria-live="polite">
      <div className="grid justify-items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
        <span className="size-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-white" aria-hidden />
        {text}
      </div>
    </div>
  )
  return (
    <main className="grid min-h-dvh place-items-center bg-zinc-50 p-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200/80 bg-white p-6 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900" role="alert">
        <h1 className="mb-1 text-lg font-semibold">{title}</h1>
        <p className="mb-5 text-sm text-zinc-600 dark:text-zinc-400">{text}</p>
        <div className="grid gap-2">
          {retry && <button type="button" onClick={retry} className={`${btn.primary} ${ring}`}>Try again</button>}
          {action && <button type="button" onClick={action} className={`${retry ? btn.ghost : btn.primary} ${ring}`}>Sign out</button>}
        </div>
      </div>
    </main>
  )
}
