import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { Field } from '../_shared/forms/index.ts'
import type { ReportRecord } from '../_shared/reports/index.ts'
import type { ReportSource, SavedRow } from './handler.ts'

const RECORD_COLS = 'id, title, status, label, current_node_id, started_by, created_at, updated_at, data'
const PAGE = 1000 // PostgREST's max rows per request
const NIL = '00000000-0000-0000-0000-000000000000'

function must<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error // index.ts logs it and answers a plain 500; nothing from it reaches people
  return data as T
}

/** Built from the caller's Authorization header only: there is no service-role client in run-report. */
export function callerSource(c: SupabaseClient): ReportSource {
  return {
    permissions: async (orgId) => new Set(must<string[]>(await c.rpc('my_permissions', { p_org: orgId }))),
    savedReport: async (id, orgId) => must<SavedRow | null>(await c.from('saved_reports')
      .select('name, workflow_id, columns, filters, group_by, aggregate').eq('id', id).eq('org_id', orgId).maybeSingle()),
    workflow: async (id, orgId) => must<{ name: string; graph: unknown } | null>(await c.from('workflows')
      .select('name, graph').eq('id', id).eq('org_id', orgId).maybeSingle()),
    forms: async (orgId, ids) => (ids.length
      ? new Map(must<{ id: string; schema: Field[] }[]>(await c.from('forms').select('id, schema').eq('org_id', orgId).in('id', ids)).map((f) => [f.id, f.schema]))
      : new Map()),
    names: async (orgId) => new Map(must<{ user_id: string | null; email: string; full_name: string | null }[]>(
      await c.from('members').select('user_id, email, full_name').eq('org_id', orgId))
      .filter((m) => m.user_id).map((m) => [m.user_id as string, m.full_name?.trim() || m.email])),
    // Keyset by id: a record inserted while we read can neither repeat a row nor push one out of the pages.
    async *records(orgId, workflowId) {
      let last = NIL
      for (;;) {
        const rows = must<ReportRecord[]>(await c.from('records').select(RECORD_COLS)
          .eq('org_id', orgId).eq('workflow_id', workflowId).gt('id', last).order('id').limit(PAGE))
        yield rows
        if (rows.length < PAGE) return
        last = rows[rows.length - 1].id
      }
    },
  }
}
