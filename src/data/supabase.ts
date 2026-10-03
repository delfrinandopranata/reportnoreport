import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { isSetPasswordFlow } from '../auth/route.ts'

type Env = Partial<Record<'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY', string>>

const REFUSAL = 'Refusing to start: a service-role/secret key was put in VITE_SUPABASE_ANON_KEY'

/** Validates browser env at startup so a misconfigured deploy fails loudly, not with silent 401s. */
export function readEnv(env: Env): { url: string; anonKey: string } {
  const missing = (['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const).filter((k) => !env[k])
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`)
  const anonKey = env.VITE_SUPABASE_ANON_KEY!
  if (anonKey.startsWith('sb_secret_')) throw new Error(REFUSAL)
  const payload = anonKey.split('.')[1]
  if (payload) {
    let claims: { role?: string }
    try {
      claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    } catch {
      throw new Error('VITE_SUPABASE_ANON_KEY is not a valid Supabase key')
    }
    if (claims?.role === 'service_role') throw new Error(REFUSAL)
  }
  return { url: env.VITE_SUPABASE_URL!, anonKey }
}

/** Captured before supabase-js strips the invite/recovery tokens from the URL. */
export const openedFromSetPasswordLink = typeof location !== 'undefined' && isSetPasswordFlow(location.search, location.hash)

const viteEnv = (import.meta as { env?: Env }).env
export const supabase = viteEnv ? (() => {
  const { url, anonKey } = readEnv(viteEnv)
  return createClient<Database>(url, anonKey)
})() : (null as unknown as ReturnType<typeof createClient<Database>>)
