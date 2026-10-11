import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../data/supabase'
import { can as canHold, type Permission } from './permissions'

const KEY = 'rnr.orgId'
type Org = { id: string; name: string }
type Ctx = {
  orgs: Org[]
  orgId: string | null
  setOrgId(id: string): void
  permissions: ReadonlySet<string>
  can(p: Permission): boolean
  loading: boolean
  failed: boolean
}
const OrgContext = createContext<Ctx | null>(null)

const readStored = () => { try { return localStorage.getItem(KEY) } catch { return null } }

export function OrgProvider({ children }: { children: ReactNode }) {
  const [orgId, setOrgIdState] = useState<string | null>(readStored)
  const orgsQ = useQuery({
    queryKey: ['orgs'],
    queryFn: async () => {
      await supabase.rpc('accept_invites')
      const { data, error } = await supabase.from('orgs').select('id, name').order('name')
      if (error) throw error
      return data
    },
  })
  const orgs = orgsQ.data ?? []
  const activeId = orgs.some((o) => o.id === orgId) ? orgId : orgs[0]?.id ?? null

  const permsQ = useQuery({
    queryKey: ['permissions', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_permissions', { p_org: activeId! })
      if (error) throw error
      return new Set<string>(data)
    },
  })
  useEffect(() => { if (activeId) try { localStorage.setItem(KEY, activeId) } catch { /* private mode */ } }, [activeId])

  const permissions = permsQ.data ?? new Set<string>()
  return (
    <OrgContext.Provider value={{
      orgs, orgId: activeId, setOrgId: setOrgIdState, permissions,
      can: (p) => canHold(permissions, p), loading: orgsQ.isLoading || permsQ.isLoading,
      failed: orgsQ.isError || permsQ.isError,
    }}>{children}</OrgContext.Provider>
  )
}

export function useOrg() {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg must be used inside <OrgProvider>')
  return ctx
}
