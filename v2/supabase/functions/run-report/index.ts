import { createClient } from 'npm:@supabase/supabase-js@2'
import { runReportRequest } from './handler.ts'
import { callerSource } from './source.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'content-disposition',
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const MAX_BODY = 100_000
const url = Deno.env.get('SUPABASE_URL')!
const anon = Deno.env.get('SUPABASE_ANON_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  const text = await req.text()
  if (text.length > MAX_BODY) return json(413, { error: 'This report is too large to send.' })
  let body: unknown = null
  try { body = JSON.parse(text) } catch { /* body stays null; the handler answers 400 */ }
  const asCaller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } })
  try {
    const res = await runReportRequest(body, {
      userId: async () => (await asCaller.auth.getUser()).data.user?.id ?? null,
      source: callerSource(asCaller),
      now: () => new Date(),
    })
    if ('csv' in res) {
      return new Response(res.csv, { status: 200, headers: { ...CORS, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${res.filename}"` } })
    }
    return json(res.status, res.body)
  } catch (e) {
    console.error('run-report failed', e)
    return json(500, { error: 'We could not run this report. Try again.' })
  }
})
