import { createClient } from 'npm:@supabase/supabase-js@2'
import { fileExists } from '../_shared/storage.ts'
import { submitForm } from './handler.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const MAX_BODY = 1_000_000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  const text = await req.text()
  if (text.length > MAX_BODY) return json(413, { error: 'These answers are too large to send.' })
  let body: unknown = null
  try { body = JSON.parse(text) } catch { /* body stays null; submitForm answers 400 */ }

  const url = Deno.env.get('SUPABASE_URL')!
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  try {
    const res = await submitForm(body, {
      userId: async () => (await asCaller.auth.getUser()).data.user?.id ?? null,
      loadForm: async (id) => {
        const { data, error } = await asCaller.from('forms').select('id, org_id, schema').eq('id', id).maybeSingle()
        if (error) throw error
        return data
      },
      insert: async (row) => {
        const { data, error } = await admin.from('form_submissions').insert(row).select('id').single()
        if (error) throw error
        return data.id
      },
      fileExists: (path) => fileExists(admin, path),
      now: () => new Date(),
    })
    return json(res.status, res.body)
  } catch (e) {
    console.error('submit-form failed', e)
    return json(500, { error: 'We could not save your answers. Try again.' })
  }
})
