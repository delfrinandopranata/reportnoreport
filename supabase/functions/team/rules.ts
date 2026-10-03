export type Role = 'owner' | 'admin' | 'accountant' | 'viewer'
export type Member = { id: string; firmId: string; role: Role; status: 'active' | 'invited' | 'suspended' }
export type TeamAction = 'invite' | 'resend' | 'remove'

/** Returns an error message, or null when allowed. Mirrors assert_manager() in SQL. */
export function decide(actor: Member, target: Member | null, action: TeamAction): string | null {
  if (actor.status !== 'active' || (actor.role !== 'owner' && actor.role !== 'admin')) return "Your role can't manage users."
  if (action === 'invite') return null
  if (!target || target.firmId !== actor.firmId) return 'That person is not in your firm.'
  if (target.id === actor.id) return "You can't remove yourself."
  if (target.role === 'owner') return 'Only the owner can change the owner.'
  return null
}

/** Invite links need APP_URL; only a local stack may fall back to the dev server. */
export function resolveAppUrl(appUrl: string | undefined, supabaseUrl: string): string | null {
  if (appUrl) return appUrl
  return /^https?:\/\/(localhost|127\.0\.0\.1|kong)(:|\/|$)/.test(supabaseUrl) ? 'http://localhost:5199' : null
}
