import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

type Env = Partial<Record<'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY', string>>

/** Validates browser env at startup so a misconfigured deploy fails loudly, not with silent 401s. */
export function readEnv(env: Env): { url: string; anonKey: string } {
  const missing = (['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const).filter((k) => !env[k])
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`)
  const anonKey = env.VITE_SUPABASE_ANON_KEY!
  const payload = anonKey.split('.')[1]
  if (payload) {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string }
    if (claims.role === 'service_role') throw new Error('Refusing to start: a service-role key was put in VITE_SUPABASE_ANON_KEY')
  }
  return { url: env.VITE_SUPABASE_URL!, anonKey }
}

const viteEnv = (import.meta as { env?: Env }).env
export const supabase = viteEnv ? (() => {
  const { url, anonKey } = readEnv(viteEnv)
  return createClient<Database>(url, anonKey)
})() : (null as unknown as ReturnType<typeof createClient<Database>>)
