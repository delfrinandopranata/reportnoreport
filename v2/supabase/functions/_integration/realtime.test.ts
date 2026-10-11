import { assertEquals } from 'jsr:@std/assert@1'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import postgres from 'npm:postgres@3.4.5'

const env = (k: string) => (Deno.permissions.querySync({ name: 'env', variable: k }).state === 'granted' ? Deno.env.get(k) : undefined)
const url = env('RNR_TEST_SUPABASE_URL')
const anon = env('RNR_TEST_ANON_KEY')
const db = env('RNR_TEST_DB_URL')
const ALPHA = '0000000a-0000-0000-0000-000000000001'
const MEMBER = '00000000-0000-0000-0000-0000000000a3'
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function signIn(email: string): Promise<SupabaseClient> {
  const c = createClient(url!, anon!, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'password123' })
  if (error) throw error
  c.realtime.setAuth(data.session.access_token)
  return c
}

/** Subscribes with no filter at all: only RLS decides what arrives. */
function listen(c: SupabaseClient, into: string[]) {
  return new Promise<void>((resolve, reject) => {
    c.channel(`rt-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (p) => into.push((p.new as { title: string }).title))
      .subscribe((s) => { if (s === 'SUBSCRIBED') resolve(); else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') reject(new Error(s)) })
  })
}

Deno.test({
  name: 'realtime: a user receives only their own notifications',
  ignore: !(url && anon && db),
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const member = await signIn('member@alpha.test')
    const admin = await signIn('admin@alpha.test')
    const sql = postgres(db!, { max: 1 })
    const got = { member: [] as string[], admin: [] as string[] }
    const title = `rt-${crypto.randomUUID()}`
    try {
      await Promise.all([listen(member, got.member), listen(admin, got.admin)])
      await sql`insert into notifications (user_id, org_id, kind, title, link) values (${MEMBER}, ${ALPHA}, 'custom', ${title}, '#/inbox')`
      for (let i = 0; i < 50 && !got.member.includes(title); i++) await wait(100)
      await wait(1000) // give a leak time to arrive
      assertEquals(got.member.includes(title), true)
      assertEquals(got.admin.includes(title), false)
    } finally {
      await sql`delete from notifications where title = ${title}`
      await sql.end()
      await member.removeAllChannels()
      await admin.removeAllChannels()
    }
  },
})
