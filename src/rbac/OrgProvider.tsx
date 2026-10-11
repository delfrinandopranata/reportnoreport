import { useEffect, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../data/supabase'
import { can as canHold } from './permissions'
import { OrgContext } from './useOrg'

const KEY = 'rnr.orgId'
const readStored = () => { try { return localStorage.getItem(KEY) } catch { return null } }

export function OrgProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [orgId, setOrgIdState] = useState<string | null>(readStored)
  const orgsQ = useQuery({
    queryKey: ['orgs', userId],
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
    queryKey: ['permissions', userId, activeId],
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
      orgs, orgId: activeId, userId, setOrgId: setOrgIdState, permissions,
      can: (p) => canHold(permissions, p), loading: orgsQ.isLoading || permsQ.isLoading,
      failed: orgsQ.isError || permsQ.isError,
    }}>{children}</OrgContext.Provider>
  )
}
