import { useQuery } from '@tanstack/react-query'
import { supabase } from '../data/supabase'
import type { TemplateKind } from './logic'

export type TemplateRow = {
  id: string; org_id: string; kind: TemplateKind; name: string; channel: 'email' | 'in_app'
  subject: string; body: string; is_system: boolean; updated_at: string
}
const TEMPLATE_COLS = 'id, org_id, kind, name, channel, subject, body, is_system, updated_at'

export const useTemplates = (orgId: string | null) => useQuery({
  queryKey: ['templates', orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data, error } = await supabase.from('message_templates').select(TEMPLATE_COLS).eq('org_id', orgId!)
      .order('is_system', { ascending: false }).order('name')
    if (error) throw error
    return data as TemplateRow[]
  },
})
