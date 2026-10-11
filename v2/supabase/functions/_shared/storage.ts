import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

/** Service-level lookup: does this object exist in the form-files bucket? */
export async function fileExists(client: SupabaseClient, path: string): Promise<boolean> {
  const i = path.lastIndexOf('/')
  const { data, error } = await client.storage.from('form-files').list(path.slice(0, i), { search: path.slice(i + 1), limit: 10 })
  if (error) throw error
  return data.some((o) => o.name === path.slice(i + 1))
}
