import { createClient } from 'npm:@supabase/supabase-js@2'
import { advance } from './handler.ts'
import { pgStore } from './pgStore.ts'
import { readAppUrl } from '../_shared/comms/render.ts'
import { fileExists } from '../_shared/storage.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const MAX_BODY = 1_000_000
const url = Deno.env.get('SUPABASE_URL')!
const store = pgStore(Deno.env.get('SUPABASE_DB_URL')!) // one small pool per worker
const appUrl = readAppUrl(Deno.env.get('APP_URL')) // throws at boot: links in messages must be right before anything is queued
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  const text = await req.text()
  if (text.length > MAX_BODY) return json(413, { error: 'These answers are too large to send.' })
  let body: unknown = null
  try { body = JSON.parse(text) } catch { /* body stays null; advance answers 400 */ }
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  try {
    const res = await advance(body, {
      userId: async () => (await asCaller.auth.getUser()).data.user?.id ?? null,
      store,
      fileExists: (path) => fileExists(admin, path),
      now: () => new Date(),
      appUrl,
    })
    return json(res.status, res.body)
  } catch (e) {
    console.error('advance failed', e)
    return json(500, { error: 'This step did not save. Try again.' })
  }
})
