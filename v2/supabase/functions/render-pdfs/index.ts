import { createClient } from 'npm:@supabase/supabase-js@2'
import { renderPdfs } from './handler.ts'
import { loadFonts, renderPdf } from './render.ts'
import { pgStore } from '../advance/pgStore.ts'

const fonts = await loadFonts() // throws at boot when the fonts were not shipped (config.toml static_files)
const store = pgStore(Deno.env.get('SUPABASE_DB_URL')!)
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Signatures live in form-files; buildPdfModel has already checked each path is inside the record's org. */
async function loadImage(path: string): Promise<Uint8Array | null> {
  const { data, error } = await admin.storage.from('form-files').download(path)
  if (error) {
    if ((error as { statusCode?: string }).statusCode === '404' || /not found/i.test(error.message)) return null
    throw error // a storage outage is retried, not reported as a missing signature
  }
  return new Uint8Array(await data.arrayBuffer())
}

async function upload(path: string, bytes: Uint8Array): Promise<void> {
  const { error } = await admin.storage.from('record-pdfs').upload(path, bytes, { contentType: 'application/pdf', upsert: true })
  if (error) throw error
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  const secret = Deno.env.get('CRON_SECRET') ?? ''
  try {
    const authorised = secret.length >= 16 && req.headers.get('Authorization') === `Bearer ${secret}`
    const res = await renderPdfs({ authorised, store, now: () => new Date(), render: (src, now) => renderPdf(src, now, fonts, loadImage), upload })
    return json(res.status, res.body)
  } catch (e) {
    console.error('render-pdfs failed', e)
    return json(500, { error: 'Rendering failed.' })
  }
})
