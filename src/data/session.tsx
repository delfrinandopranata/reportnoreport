import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session as AuthSession } from '@supabase/supabase-js'
import { can as roleCan, type Action } from '../users/rules'
import { rowToFirm, rowToMember, type Firm, type Member } from './mappers'
import { supabase } from './supabase'
import { AuthPages } from '../auth/AuthPages'
import { rememberReturnTo } from '../auth/route'

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) rememberReturnTo(location.hash) // fresh visit while signed out: come back here after sign-in
      setAuth(data.session)
    })
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' && !location.hash.startsWith('#signin')) rememberReturnTo(location.hash)
      setAuth(session)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = auth?.user.id
  const context = useQuery({
    queryKey: ['session', userId],
    enabled: !!userId,
    queryFn: async () => {
      await supabase.rpc('accept_invite')
      await supabase.rpc('touch_last_active')
      const { data: profile, error } = await supabase.from('profiles').select('*').eq('user_id', userId!).single()
      if (error) throw error
      if (!profile.firm_id) return { profile, firm: null, reason: null }
      const { data: firm } = await supabase.from('firms').select('*').eq('id', profile.firm_id).maybeSingle()
      const { data: reason } = await supabase.rpc('firm_write_block_reason', { firm: profile.firm_id })
      return { profile, firm, reason: reason as string | null }
    },
  })

  if (auth === undefined || (userId && context.isPending)) return <FullPageMessage text="Loading…" />
  if (!auth) return <AuthPages />
  if (context.isError) return <FullPageMessage text="We couldn't load your account. Refresh to try again." />
  const { profile, firm, reason } = context.data!
  if (!firm) return <FullPageMessage text="Your access is suspended, or your firm isn't set up yet. Contact your firm's owner." action={() => supabase.auth.signOut()} />

  const member = rowToMember(profile)
  const session: Session = {
    userId: userId!, profile: member, firm: rowToFirm(firm),
    can: (a) => member.status === 'active' && roleCan(member.role, a),
    canWrite: reason === null, writeBlockReason: reason,
    signOut: async () => { await supabase.auth.signOut() },
  }
  return <Ctx.Provider value={session}>{children}</Ctx.Provider>
}

function FullPageMessage({ text, action }: { text: string; action?: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="grid gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">{text}</p>
        {action && <button type="button" onClick={action} className="text-sm font-medium underline">Sign out</button>}
      </div>
    </div>
  )
}
