import { createContext, useContext } from 'react'
import type { Permission } from './permissions'

export type Org = { id: string; name: string }
export type Ctx = {
  orgs: Org[]
  orgId: string | null
  userId: string
  setOrgId(id: string): void
  permissions: ReadonlySet<string>
  can(p: Permission): boolean
  loading: boolean
  failed: boolean
}
export const OrgContext = createContext<Ctx | null>(null)

export function useOrg() {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg must be used inside <OrgProvider>')
  return ctx
}
