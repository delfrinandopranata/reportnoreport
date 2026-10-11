import { useQuery } from '@tanstack/react-query'
import { supabase } from '../data/supabase'

/** user id → email for the org. One key, one select shape, shared by every page that names people (QA-2). */
export const useMemberEmails = (orgId: string | null) => useQuery({
  queryKey: ['member-emails', orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data, error } = await supabase.from('members').select('user_id, email').eq('org_id', orgId!)
    if (error) throw error
    return new Map(data.filter((m) => m.user_id).map((m) => [m.user_id as string, m.email]))
  },
})
