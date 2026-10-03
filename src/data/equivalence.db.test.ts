import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { test } from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { statement, totalsByClient, type Txn } from '../ledger.ts'

const env = Object.fromEntries(execSync('supabase status -o env').toString().trim().split('\n').map((l) => l.split('=').map((s) => s.replace(/"/g, '')) as [string, string]))
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY)
const anon = createClient(env.API_URL, env.ANON_KEY)
const FIRM = '0000000a-0000-0000-0000-000000000001'
const BANK = '0000000a-0000-0000-0000-0000000000ba'

test('SQL balances and running ledger match the browser maths', async () => {
  // Fixture: a fresh client with an awkward mix of same-day and cross-month entries.
  const { data: client } = await service.from('clients').insert({ firm_id: FIRM, name: `Equivalence ${Date.now()}` }).select('id').single()
  const fixture: [Txn['kind'], number, string][] = [['in', 10000, '2026-07-01'], ['out', 2500, '2026-07-01'], ['in', 999, '2026-08-15'], ['out', 12000, '2026-09-01'], ['in', 1, '2026-09-30']]
  for (const [kind, amount, date] of fixture) {
    await service.from('transactions').insert({ firm_id: FIRM, client_id: client!.id, bank_account_id: BANK, kind: kind === 'in' ? 'receipt' : 'payment', amount_minor: amount, date })
  }
  const { data: rows } = await service.from('transactions').select('*').eq('client_id', client!.id).order('created_at')
  const txns: Txn[] = rows!.map((r) => ({ id: r.id, clientId: r.client_id, bankAccountId: r.bank_account_id, kind: r.kind === 'receipt' ? 'in' : 'out', amount: r.amount_minor, date: r.date, note: r.description, createdAt: r.created_at, updatedAt: r.updated_at }))

  await anon.auth.signInWithPassword({ email: 'owner@alpha.test', password: 'password123' })
  for (const [from, to] of [['2026-08-01', '2026-08-31'], ['2026-07-01', '2026-09-30'], ['2026-09-15', '2026-12-31']]) {
    const browser = statement(txns, from, to)
    const { data: bal } = await anon.rpc('client_balances', { p_from: from, p_to: to, p_client: client!.id })
    const { data: lines } = await anon.rpc('ledger_lines', { p_from: from, p_to: to, p_client: client!.id })
    assert.deepEqual(
      { opening: bal![0].opening, receipts: bal![0].receipts, payments: bal![0].payments, closing: bal![0].closing },
      { opening: browser.opening, receipts: browser.receipts, payments: browser.payments, closing: browser.closing }, `${from}..${to} totals`)
    assert.deepEqual(lines!.map((l: { balance: number }) => l.balance), browser.lines.map((l) => l.balance), `${from}..${to} running balance`)
  }
  assert.equal(totalsByClient(txns).get(client!.id)?.net, (await anon.rpc('client_balances', { p_from: '1900-01-01', p_to: '2999-12-31', p_client: client!.id })).data![0].closing)

  await service.from('clients').delete().eq('id', client!.id)
})
