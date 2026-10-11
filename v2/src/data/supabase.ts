import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { readEnv } from './readEnv.ts'

const { url, anonKey } = readEnv(import.meta.env)
export const supabase = createClient<Database>(url, anonKey)
