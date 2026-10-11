import { createClient } from 'npm:@supabase/supabase-js@2'
import { saveWorkflow } from './handler.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const MAX_BODY = 1_000_000
const OPEN_STEP = /A step with open records cannot be deleted: (\S+)/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  const text = await req.text()
  if (text.length > MAX_BODY) return json(413, { error: 'This workflow is too large to save.' })
  let body: unknown = null
  try { body = JSON.parse(text) } catch { /* body stays null; saveWorkflow answers 400 */ }

  const url = Deno.env.get('SUPABASE_URL')!
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const ids = async (q: PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>, col: string) => {
    const { data, error } = await q
    if (error) throw error
    return new Set((data ?? []).map((r) => r[col] as string))
  }
  try {
    const res = await saveWorkflow(body, {
      userId: async () => (await asCaller.auth.getUser()).data.user?.id ?? null,
      loadWorkflow: async (id) => {
        const { data, error } = await asCaller.from('workflows').select('id, org_id, status').eq('id', id).maybeSingle()
        if (error) throw error
        return data
      },
      can: async (orgId, perm) => {
        const { data, error } = await asCaller.rpc('has_permission', { p_org: orgId, p_perm: perm })
        if (error) throw error
        return data === true
      },
      refs: async (orgId) => ({
        forms: await ids(admin.from('forms').select('id').eq('org_id', orgId), 'id'),
        templates: await ids(admin.from('message_templates').select('id').eq('org_id', orgId), 'id'),
        roles: await ids(admin.from('roles').select('id').eq('org_id', orgId), 'id'),
        users: await ids(admin.from('members').select('user_id').eq('org_id', orgId).eq('status', 'active'), 'user_id'),
      }),
      save: async (row) => {
        const { data, error } = await admin.from('workflows')
          .update({ name: row.name, graph: row.graph, status: row.status, updated_by: row.updated_by })
          .eq('id', row.id).eq('updated_at', row.expected).select('updated_at, status')
        if (error) {
          const m = OPEN_STEP.exec(error.message)
          if (m) return { ok: false, openOn: m[1] }
          throw error
        }
        return data.length ? { ok: true, updatedAt: data[0].updated_at, status: data[0].status } : { ok: false, conflict: true }
      },
    })
    return json(res.status, res.body)
  } catch (e) {
    console.error('save-workflow failed', e)
    return json(500, { error: 'We could not save this workflow. Try again.' })
  }
})
