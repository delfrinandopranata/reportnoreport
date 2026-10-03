import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { changeRole, inviteUser, reactivateUser, removeUser, suspendUser, transferOwnership, validateUsers, type Result, type Role, type User } from './rules'

export { can } from './rules'
export type { Role, User } from './rules'

type State = { users: User[]; currentUserId: string }
type Actions = {
  /** Every action returns an error message, or null on success. */
  invite: (input: { name: string; email: string; role: Role }) => string | null
  setRole: (id: string, role: Role) => string | null
  suspend: (id: string) => string | null
  reactivate: (id: string) => string | null
  remove: (id: string) => string | null
  transferOwnership: (id: string) => string | null
  /** "Viewing as": previews another member's role on this device. */
  viewAs: (id: string) => void
  /** Used by backup restore; callers validate first. */
  replaceAll: (users: User[], currentUserId: string) => void
}

const OWNER_ID = crypto.randomUUID()
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

const seed = (): State => ({
  currentUserId: OWNER_ID,
  users: [
    { id: OWNER_ID, name: 'Lim Boon Hock', email: 'boonhock@yourbusiness.com.my', role: 'owner', status: 'active', createdAt: ago(400), lastActiveAt: ago(0) },
    { id: crypto.randomUUID(), name: 'Nur Aisyah binti Rahman', email: 'aisyah@yourbusiness.com.my', role: 'admin', status: 'active', createdAt: ago(200), lastActiveAt: ago(1) },
    { id: crypto.randomUUID(), name: 'Rajesh Kumar a/l Subramaniam', email: 'rajesh@yourbusiness.com.my', role: 'accountant', status: 'active', createdAt: ago(120), lastActiveAt: ago(3) },
    { id: crypto.randomUUID(), name: 'Chong Mei Ling', email: 'meiling@yourbusiness.com.my', role: 'viewer', status: 'invited', createdAt: ago(2), invitedAt: ago(2) },
  ],
})

export const useUsers = create<State & Actions>()(
  persist(
    (set, get) => {
      const apply = (run: (s: State) => Result) => {
        const result = run(get())
        if (!result.ok) return result.error
        set({ users: result.users })
        return null
      }
      return {
        ...seed(),
        invite: (input) => apply((s) => inviteUser(s.users, s.currentUserId, input, new Date().toISOString(), crypto.randomUUID())),
        setRole: (id, role) => apply((s) => changeRole(s.users, s.currentUserId, id, role)),
        suspend: (id) => apply((s) => suspendUser(s.users, s.currentUserId, id)),
        reactivate: (id) => apply((s) => reactivateUser(s.users, s.currentUserId, id)),
        remove: (id) => apply((s) => removeUser(s.users, s.currentUserId, id)),
        transferOwnership: (id) => apply((s) => transferOwnership(s.users, s.currentUserId, id)),
        viewAs: (id) =>
          set((s) =>
            s.users.some((u) => u.id === id && u.status !== 'suspended')
              ? { currentUserId: id, users: s.users.map((u) => (u.id === id && u.status === 'active' ? { ...u, lastActiveAt: new Date().toISOString() } : u)) }
              : s,
          ),
        replaceAll: (users, currentUserId) => set({ users, currentUserId: users.some((u) => u.id === currentUserId) ? currentUserId : users.find((u) => u.role === 'owner')!.id }),
      }
    },
    {
      name: 'platform-internal-users',
      version: 1,
      partialize: ({ users, currentUserId }): State => ({ users, currentUserId }),
      // Never boot into a broken team (hand-edited or corrupt storage): fall back to the seed.
      merge: (stored, current) => {
        const s = stored as Partial<State> | undefined
        return s && validateUsers(s.users) && s.users.some((u) => u.id === s.currentUserId && u.status !== 'suspended')
          ? { ...current, users: s.users, currentUserId: s.currentUserId! }
          : current
      },
    },
  ),
)

/** The member currently being previewed; always resolves because the store never boots without an owner. */
export function useCurrentUser(): User {
  return useUsers((s) => s.users.find((u) => u.id === s.currentUserId) ?? s.users.find((u) => u.role === 'owner')!)
}
