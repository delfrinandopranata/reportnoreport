import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { fillClient, statement, type Client, type ClientInput, type Kind, type StatementLine, type Txn } from '../ledger'
import type { Database, Json } from './database.types'
import type { Role } from '../users/rules'
import { resolveTheme, type ThemePreference } from '../theme'
import { isWriteBlock, toUserMessage } from './errors'
import {
  clientToRow, firmToRow, rowToAttachment, rowToBank, rowToClient, rowToContract, rowToLine, rowToMember,
  type Attachment, type BalanceRow, type BankAccount, type Contract, type Firm, type LedgerRow, type Member,
} from './mappers'
import { classifyEmptyUpdate, ConflictError } from './conflict.ts'
import { useSession } from './session'
import { fetchAll } from './paging'
import { supabase } from './supabase'
import { DEMO, getStore, saveStore, uid } from '../demo/store'

export { ConflictError, conflictMessage } from './conflict.ts'

type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']

export type ImportPayloadRow = { line: number; client_name: string; bank_account: string | null; kind: 'receipt' | 'payment'; amount_minor: number; date: string; description: string }

/**
 * Throws a person-readable Error so components can show error.message directly.
 * On a write denial the cached session may be stale (trial ended, role changed), so it is
 * refreshed and the CURRENT block reason is fetched for the message. Always `await` or `return` it.
 */
function useFail() {
  const { writeBlockReason, firm, userId } = useSession()
  const qc = useQueryClient()
  return async (error: unknown): Promise<never> => {
    let reason = writeBlockReason
    if (isWriteBlock(error)) {
      void qc.invalidateQueries({ queryKey: ['session', userId] })
      if ((error as { code?: string }).code === '42501') {
        const fresh = await supabase.rpc('firm_write_block_reason', { firm: firm.id })
        if (!fresh.error) reason = fresh.data as string | null
      }
    }
    throw new Error(toUserMessage(error, { writeBlockReason: reason }))
  }
}

function useKeys() {
  const { firm } = useSession()
  return {
    all: ['firm', firm.id] as const,
    clients: ['firm', firm.id, 'clients'] as const,
    client: (id: string) => ['firm', firm.id, 'client', id] as const,
    balances: (p: object) => ['firm', firm.id, 'balances', p] as const,
    ledger: (p: object) => ['firm', firm.id, 'ledger', p] as const,
    recent: (n: number) => ['firm', firm.id, 'recent', n] as const,
    banks: ['firm', firm.id, 'banks'] as const,
    members: ['firm', firm.id, 'members'] as const,
    contracts: ['firm', firm.id, 'contracts'] as const,
    attachments: (p: { transactionId?: string; clientId?: string }) => ['firm', firm.id, 'attachments', p] as const,
    firstTxn: (clientId?: string) => ['firm', firm.id, 'firstTxn', clientId ?? 'all'] as const,
    sampleDataExists: ['firm', firm.id, 'sample-data-exists'] as const,
  }
}

/** Any money or client change can move balances anywhere, so refresh the whole firm. */
function useInvalidateFirm() {
  const qc = useQueryClient()
  const keys = useKeys()
  return () => qc.invalidateQueries({ queryKey: keys.all })
}

export function useClients() {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.clients, queryFn: async () => {
    if (DEMO) return [...getStore().clients].sort((a, b) => a.name.localeCompare(b.name))
    const rows = await fetchAll((from, to) => supabase.from('clients').select('*').order('name').order('id').range(from, to)).catch(fail)
    return rows.map(rowToClient)
  } })
}

export function useClient(id: string) {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.client(id), queryFn: async () => {
    if (DEMO) return getStore().clients.find((c) => c.id === id) ?? null
    const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle()
    return error ? fail(error) : data ? rowToClient(data) : null
  } })
}

/** Demo equivalent of the `client_balances` SQL function, using the same `statement()` maths as the equivalence test. */
function demoBalances(p: { from: string; to: string; bankAccountId?: string; clientId?: string }): BalanceRow[] {
  const store = getStore()
  const clients = p.clientId ? store.clients.filter((c) => c.id === p.clientId) : store.clients
  return clients.map((c) => {
    const txns = store.transactions.filter((t) => t.clientId === c.id && (!p.bankAccountId || t.bankAccountId === p.bankAccountId))
    const st = statement(txns, p.from, p.to)
    const lastTxnDate = txns.reduce<string | null>((max, t) => (!max || t.date > max ? t.date : max), null)
    return { client_id: c.id, opening: st.opening, receipts: st.receipts, payments: st.payments, closing: st.closing, txn_count: st.lines.length, last_txn_date: lastTxnDate }
  })
}

export function useBalances(p: { from: string; to: string; bankAccountId?: string; clientId?: string }) {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.balances(p), placeholderData: keepPreviousData, queryFn: async () => {
    if (DEMO) return demoBalances(p)
    return (await fetchAll((from, to) => supabase.rpc('client_balances', { p_from: p.from, p_to: p.to, p_bank_account: p.bankAccountId, p_client: p.clientId }).range(from, to)).catch(fail)) as BalanceRow[]
  } })
}

/** Demo equivalent of the `ledger_lines` SQL function. `perClient` runs the running balance per client, like the SQL version. */
function demoLedger(p: { from: string; to: string; clientId?: string; bankAccountId?: string; perClient?: boolean }): StatementLine[] {
  const store = getStore()
  const matchesBank = (t: Txn) => !p.bankAccountId || t.bankAccountId === p.bankAccountId
  if (p.clientId) return statement(store.transactions.filter((t) => t.clientId === p.clientId && matchesBank(t)), p.from, p.to).lines
  if (p.perClient) return store.clients.flatMap((c) => statement(store.transactions.filter((t) => t.clientId === c.id && matchesBank(t)), p.from, p.to).lines)
  return statement(store.transactions.filter(matchesBank), p.from, p.to).lines
}

export function useLedger(p: { from: string; to: string; clientId?: string; bankAccountId?: string; perClient?: boolean }, enabled = true) {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.ledger(p), enabled, placeholderData: keepPreviousData, queryFn: async () => {
    if (DEMO) return demoLedger(p)
    const rows = await fetchAll((from, to) => supabase.rpc('ledger_lines', { p_from: p.from, p_to: p.to, p_client: p.clientId, p_bank_account: p.bankAccountId, p_per_client: p.perClient ?? false }).range(from, to)).catch(fail)
    return (rows as LedgerRow[]).map(rowToLine)
  } })
}

export function useRecentTxns(limit: number) {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.recent(limit), queryFn: async () => {
    if (DEMO) return [...getStore().transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, limit)
    const { data, error } = await supabase.from('transactions').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }).limit(limit)
    return error ? fail(error) : data.map((r): Txn => ({ id: r.id, clientId: r.client_id, bankAccountId: r.bank_account_id, kind: r.kind === 'receipt' ? 'in' : 'out', amount: r.amount_minor, date: r.date, note: r.description, createdAt: r.created_at, updatedAt: r.updated_at }))
  } })
}

/** Earliest transaction date (YYYY-MM-DD), or null with no transactions. Imported history can predate the client record. */
export function useFirstTxnDate(clientId?: string) {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.firstTxn(clientId), queryFn: async () => {
    if (DEMO) {
      const txns = getStore().transactions.filter((t) => !clientId || t.clientId === clientId)
      return txns.reduce<string | null>((min, t) => (!min || t.date < min ? t.date : min), null)
    }
    let q = supabase.from('transactions').select('date').order('date').limit(1)
    if (clientId) q = q.eq('client_id', clientId)
    const { data, error } = await q
    return error ? fail(error) : (data[0]?.date ?? null)
  } })
}

export function useBankAccounts() {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.banks, queryFn: async () => {
    if (DEMO) return [...getStore().bankAccounts].sort((a, b) => (Number(b.isDefault) - Number(a.isDefault)) || a.name.localeCompare(b.name))
    const { data, error } = await supabase.from('bank_accounts').select('*').order('is_default', { ascending: false }).order('name')
    return error ? fail(error) : data.map(rowToBank)
  } })
}

export function useMembers() {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.members, queryFn: async () => {
    if (DEMO) return [...getStore().members].sort((a, b) => a.name.localeCompare(b.name))
    const rows = await fetchAll((from, to) => supabase.from('profiles').select('*').order('name').order('id').range(from, to)).catch(fail)
    return rows.map(rowToMember)
  } })
}

export function useContracts() {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.contracts, queryFn: async () => {
    if (DEMO) return [...getStore().contracts].sort((a, b) => a.endDate.localeCompare(b.endDate))
    const rows = await fetchAll((from, to) => supabase.from('contracts').select('*').order('end_date').order('id').range(from, to)).catch(fail)
    return rows.map(rowToContract)
  } })
}

export function useCreateContract() {
  const qc = useQueryClient(); const keys = useKeys(); const fail = useFail()
  return useMutation({ mutationFn: async (input: { clientId: string; title: string; startDate: string; endDate: string }) => {
    if (DEMO) {
      const store = getStore()
      const now = new Date().toISOString()
      saveStore({ ...store, contracts: [...store.contracts, { id: uid(), clientId: input.clientId, title: input.title, startDate: input.startDate, endDate: input.endDate, status: 'pending_review', reviewedBy: null, createdAt: now }] })
      return
    }
    const { error } = await supabase.from('contracts').insert({ client_id: input.clientId, title: input.title, start_date: input.startDate, end_date: input.endDate })
    if (error) await fail(error)
  }, onSuccess: () => qc.invalidateQueries({ queryKey: keys.contracts }) })
}

export function useApproveContract() {
  const qc = useQueryClient(); const keys = useKeys(); const fail = useFail(); const { profile } = useSession()
  return useMutation({ mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
    if (DEMO) {
      const store = getStore()
      saveStore({ ...store, contracts: store.contracts.map((c) => c.id === id ? { ...c, status: approve ? 'approved' : 'rejected', reviewedBy: profile.id } : c) })
      return
    }
    const { error } = await supabase.rpc('approve_contract', { p_contract: id, p_approve: approve })
    if (error) await fail(error)
  }, onSuccess: () => qc.invalidateQueries({ queryKey: keys.contracts }) })
}

export type { Contract }

export function useAttachments(p: { transactionId?: string; clientId?: string }) {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.attachments(p), queryFn: async () => {
    let q = supabase.from('attachments').select('*').order('created_at')
    q = p.transactionId ? q.eq('transaction_id', p.transactionId) : q.eq('client_id', p.clientId!)
    const { data, error } = await q
    return error ? fail(error) : data.map(rowToAttachment)
  } })
}

export function useUploadAttachment() {
  const { firm } = useSession(); const qc = useQueryClient(); const keys = useKeys(); const fail = useFail()
  return useMutation({ mutationFn: async ({ file, transactionId, clientId }: { file: File; transactionId?: string; clientId?: string }) => {
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
    const path = `${firm.id}/${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type })
    if (uploadError) return fail(uploadError)
    const { error } = await supabase.from('attachments').insert({
      transaction_id: transactionId ?? null, client_id: clientId ?? null,
      storage_path: path, original_name: file.name, mime_type: file.type, size_bytes: file.size,
    })
    if (error) await fail(error)
  }, onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: keys.attachments({ transactionId: v.transactionId, clientId: v.clientId }) }) })
}

export function useDeleteAttachment() {
  const qc = useQueryClient(); const keys = useKeys(); const fail = useFail()
  return useMutation({ mutationFn: async (a: Attachment) => {
    const { data, error } = await supabase.from('attachments').delete().eq('id', a.id).select('id')
    if (error) return fail(error)
    if (!data.length) throw new Error("You don't have permission to do that.")
    await supabase.storage.from('attachments').remove([a.storagePath])
  }, onSuccess: (_d, a) => qc.invalidateQueries({ queryKey: keys.attachments({ transactionId: a.transactionId ?? undefined, clientId: a.clientId ?? undefined }) }) })
}

export function useAttachmentUrl(path: string | null): string | null {
  const { data } = useQuery({ queryKey: ['attachment-url', path], enabled: !!path, staleTime: 50 * 60 * 1000, queryFn: async () => {
    const { data } = await supabase.storage.from('attachments').createSignedUrl(path!, 3600)
    return data?.signedUrl ?? null
  } })
  return data ?? null
}

/** For bundled exports: every attachment on the given transactions/clients, with its file bytes. Not a hook — called from an export click handler. */
export async function fetchAttachmentsForExport(column: 'transaction_id' | 'client_id', ids: string[]): Promise<{ attachment: Attachment; data: Blob }[]> {
  if (!ids.length) return []
  const rows = await fetchAll((from, to) => supabase.from('attachments').select('*').in(column, ids).range(from, to))
  return Promise.all(rows.map(rowToAttachment).map(async (attachment) => {
    const { data, error } = await supabase.storage.from('attachments').download(attachment.storagePath)
    if (error) throw error
    return { attachment, data }
  }))
}

export type { Attachment }

/** Returns [value, save, loaded]: `loaded` is false until the stored value (or its absence) is known. */
export function usePreference<T>(key: string, fallback: T): [T, (value: T) => void, boolean] {
  const { profile } = useSession()
  const [value, setValue] = useState<T>(fallback)
  const [loaded, setLoaded] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    if (DEMO) {
      const stored = getStore().preferences[key]
      if (stored !== undefined) setValue(stored as T)
      setLoaded(true)
      return
    }
    supabase.from('user_preferences').select('value').eq('profile_id', profile.id).eq('key', key).maybeSingle()
      .then(({ data }) => {
        if (data) setValue(data.value as T)
        setLoaded(true)
      })
  }, [profile.id, key])
  const save = (next: T) => {
    setValue(next)
    if (DEMO) {
      const store = getStore()
      saveStore({ ...store, preferences: { ...store.preferences, [key]: next } })
      return
    }
    clearTimeout(timer.current)
    // Debounced: dragging a column edge fires many updates; persist the last one.
    timer.current = setTimeout(() => {
      supabase.from('user_preferences').upsert({ profile_id: profile.id, key, value: next as NonNullable<Json> }).then(({ error }) => {
        if (error) console.error('Preference not saved', key, error)
      })
    }, 400)
  }
  return [value, save, loaded]
}

/** Resolved light/dark theme, backed by the `theme` preference, applied as a `dark` class on <html>. */
export function useTheme(): [ThemePreference, (value: ThemePreference) => void] {
  const [pref, setPref] = usePreference<ThemePreference>('theme', 'system')
  const [prefersDarkOS, setPrefersDarkOS] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mql = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setPrefersDarkOS(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  const theme = resolveTheme(pref, prefersDarkOS)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try { localStorage.setItem('theme-bootstrap', theme) } catch { /* private browsing */ }
  }, [theme])
  return [pref, setPref]
}

export function useCreateClient() {
  const invalidate = useInvalidateFirm(); const fail = useFail()
  return useMutation({ mutationFn: async (input: ClientInput) => {
    if (DEMO) {
      const store = getStore()
      const client = fillClient({ ...input, id: uid() })
      saveStore({ ...store, clients: [...store.clients, client] })
      return client
    }
    const { data, error } = await supabase.from('clients').insert({ ...clientToRow(input as Partial<Client>), name: input.name }).select('*').single()
    return error ? fail(error) : rowToClient(data)
  }, onSuccess: invalidate })
}

export function useUpdateClient() {
  const invalidate = useInvalidateFirm(); const fail = useFail()
  return useMutation({ mutationFn: async ({ id, patch, loadedUpdatedAt }: { id: string; patch: Partial<Client>; loadedUpdatedAt: string }) => {
    if (DEMO) {
      const store = getStore()
      const current = store.clients.find((c) => c.id === id)
      if (!current) throw new Error('This client no longer exists.')
      if (current.updatedAt !== loadedUpdatedAt) throw new ConflictError('someone else', current.updatedAt)
      const updated: Client = { ...current, ...patch, updatedAt: new Date().toISOString() }
      saveStore({ ...store, clients: store.clients.map((c) => c.id === id ? updated : c) })
      return updated
    }
    const { data, error } = await supabase.from('clients').update(clientToRow(patch)).eq('id', id).eq('updated_at', loadedUpdatedAt).select('*')
    if (error) return fail(error)
    if (data.length === 0) {
      const { data: current } = await supabase.from('clients').select('updated_at, updated_by').eq('id', id).maybeSingle()
      const why = classifyEmptyUpdate(current, loadedUpdatedAt)
      if (!current || why === 'gone') throw new Error('This client no longer exists.')
      if (why === 'blocked') return fail({ code: '42501' })
      const { data: who } = current.updated_by
        ? await supabase.from('profiles').select('name').eq('user_id', current.updated_by).maybeSingle()
        : { data: null }
      throw new ConflictError(who?.name ?? 'someone else', current.updated_at)
    }
    return rowToClient(data[0])
  }, onSettled: invalidate })
}

export function useDeleteClient() {
  const invalidate = useInvalidateFirm(); const fail = useFail()
  return useMutation({ mutationFn: async (id: string) => {
    if (DEMO) {
      const store = getStore()
      // Mirrors the real behaviour (docs/architecture.md § Change log): deleting a client also removes its transactions.
      saveStore({ ...store, clients: store.clients.filter((c) => c.id !== id), transactions: store.transactions.filter((t) => t.clientId !== id) })
      return
    }
    const { data, error } = await supabase.from('clients').delete().eq('id', id).select('id')
    if (error) return fail(error)
    if (!data.length) throw new Error("You don't have permission to do that.")
  }, onSuccess: invalidate })
}

export function usePostTxn() {
  const invalidate = useInvalidateFirm(); const fail = useFail()
  return useMutation({ mutationFn: async (t: { clientId: string; bankAccountId: string; kind: Kind; amount: number; date: string; note: string }) => {
    if (DEMO) {
      const store = getStore()
      const now = new Date().toISOString()
      const txn: Txn = { id: uid(), clientId: t.clientId, bankAccountId: t.bankAccountId, kind: t.kind, amount: t.amount, date: t.date, note: t.note, createdAt: now, updatedAt: now }
      saveStore({ ...store, transactions: [...store.transactions, txn] })
      return
    }
    const { error } = await supabase.from('transactions').insert({ client_id: t.clientId, bank_account_id: t.bankAccountId, kind: t.kind === 'in' ? 'receipt' : 'payment', amount_minor: t.amount, date: t.date, description: t.note })
    if (error) await fail(error)
  }, onSuccess: invalidate })
}

export function useUpdateTxn() {
  const invalidate = useInvalidateFirm(); const fail = useFail()
  return useMutation({ mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<Txn, 'kind' | 'amount' | 'date' | 'note' | 'bankAccountId'>> }) => {
    if (DEMO) {
      const store = getStore()
      saveStore({ ...store, transactions: store.transactions.map((t) => t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t) })
      return
    }
    const row: TablesUpdate<'transactions'> = {}
    if (patch.kind) row.kind = patch.kind === 'in' ? 'receipt' : 'payment'
    if (patch.amount !== undefined) row.amount_minor = patch.amount
    if (patch.date) row.date = patch.date
    if (patch.note !== undefined) row.description = patch.note
    if (patch.bankAccountId) row.bank_account_id = patch.bankAccountId
    const { data, error } = await supabase.from('transactions').update(row).eq('id', id).select('id')
    if (error) return fail(error)
    if (!data.length) await fail({ code: '42501' })
  }, onSuccess: invalidate })
}

export function useDeleteTxn() {
  const invalidate = useInvalidateFirm(); const fail = useFail()
  return useMutation({ mutationFn: async (id: string) => {
    if (DEMO) {
      const store = getStore()
      saveStore({ ...store, transactions: store.transactions.filter((t) => t.id !== id) })
      return
    }
    const { data, error } = await supabase.from('transactions').delete().eq('id', id).select('id')
    if (error) return fail(error)
    if (!data.length) throw new Error("You don't have permission to do that.")
  }, onSuccess: invalidate })
}

export function useImport() {
  const invalidate = useInvalidateFirm(); const fail = useFail()
  return useMutation({ mutationFn: async ({ rows, dryRun }: { rows: ImportPayloadRow[]; dryRun: boolean }) => {
    if (DEMO) throw new Error('Import is disabled in this demo.')
    const { data, error } = await supabase.rpc('import_transactions', { p_rows: rows, p_dry_run: dryRun })
    return error ? fail(error) : (data as { transactions: number; clients: number; duplicates: number })
  }, onSuccess: (_d, v) => { if (!v.dryRun) invalidate() } })
}

/**
 * The demo already is sample data end to end, so the "load/remove sample data" onboarding feature
 * (which loads extra SQL-seeded rows into a real firm) has nothing to do in demo mode: this always
 * reports no sample data, which keeps its banner and buttons hidden rather than reimplementing it.
 */
export function useSampleDataExists() {
  const keys = useKeys(); const fail = useFail()
  const { data: exists = false } = useQuery({
    queryKey: keys.sampleDataExists,
    queryFn: async () => {
      if (DEMO) return false
      const { data, error } = await supabase
        .from('clients')
        .select('id')
        .eq('is_sample', true)
        .limit(1)
      if (error) return fail(error)
      return (data?.length ?? 0) > 0
    },
  })
  return exists
}

export function useClientsCount(isSample: boolean) {
  const { firm } = useSession()
  const keys = useKeys()
  const { data = 0 } = useQuery({
    queryKey: [...keys.all, 'clients-count', isSample],
    queryFn: async () => {
      if (DEMO) return isSample ? 0 : getStore().clients.length
      const { count, error } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('firm_id', firm.id)
        .eq('is_sample', isSample)
      if (error) throw error
      return count ?? 0
    },
  })
  return data
}

export function useTransactionsCount(isSample: boolean) {
  const { firm } = useSession()
  const keys = useKeys()
  const { data = 0 } = useQuery({
    queryKey: [...keys.all, 'transactions-count', isSample],
    queryFn: async () => {
      if (DEMO) return isSample ? 0 : getStore().transactions.length
      const { count, error } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('firm_id', firm.id)
        .eq('is_sample', isSample)
      if (error) throw error
      return count ?? 0
    },
  })
  return data
}

export function useMembersCount() {
  const { firm } = useSession()
  const keys = useKeys()
  const { data = 0 } = useQuery({
    queryKey: [...keys.all, 'members-count'],
    queryFn: async () => {
      if (DEMO) return getStore().members.filter((m) => m.status === 'active' || m.status === 'invited').length
      const { count, error } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('firm_id', firm.id)
        .in('status', ['active', 'invited'])
      if (error) throw error
      return count ?? 0
    },
  })
  return data
}

export function useLoadSampleData() {
  const { firm } = useSession()
  const qc = useQueryClient()
  const fail = useFail()

  return useMutation({
    mutationFn: async () => {
      if (DEMO) return
      const { error } = await supabase.rpc('load_sample_data')
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['firm', firm.id, 'clients'] })
      qc.invalidateQueries({ queryKey: ['firm', firm.id, 'balances'] })
      qc.invalidateQueries({ queryKey: ['firm', firm.id, 'sample-data-exists'] })
    },
    onError: fail,
  })
}

export function useRemoveSampleData() {
  const { firm } = useSession()
  const qc = useQueryClient()
  const fail = useFail()

  return useMutation({
    mutationFn: async () => {
      if (DEMO) return
      const { error } = await supabase.rpc('remove_sample_data')
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['firm', firm.id, 'clients'] })
      qc.invalidateQueries({ queryKey: ['firm', firm.id, 'balances'] })
      qc.invalidateQueries({ queryKey: ['firm', firm.id, 'sample-data-exists'] })
    },
    onError: fail,
  })
}

export function useUpdateFirm() {
  const qc = useQueryClient(); const { firm } = useSession(); const fail = useFail()
  return useMutation({ mutationFn: async (patch: Partial<Firm>) => {
    if (DEMO) {
      const store = getStore()
      saveStore({ ...store, firm: { ...store.firm, ...patch } })
      return
    }
    const { data, error } = await supabase.from('firms').update(firmToRow(patch)).eq('id', firm.id).select('id')
    if (error) return fail(error)
    if (!data.length) await fail({ code: '42501' })
  }, onSuccess: () => qc.invalidateQueries({ queryKey: ['session'] }) })
}

/** In demo mode there's no storage bucket, so the logo is kept as a data URL directly in the firm row. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function useUploadLogo() {
  const { firm } = useSession(); const update = useUpdateFirm(); const fail = useFail()
  return useMutation({ mutationFn: async (file: File) => {
    if (DEMO) {
      const dataUrl = await readAsDataUrl(file)
      await update.mutateAsync({ logoPath: dataUrl })
      return dataUrl
    }
    const ext = file.type === 'image/svg+xml' ? 'svg' : file.type === 'image/png' ? 'png' : 'jpg'
    const path = `${firm.id}/logo-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('logos').upload(path, file, { contentType: file.type })
    if (error) return fail(error)
    await update.mutateAsync({ logoPath: path })
    return path
  } })
}

export function useLogoUrl(path: string | null): string | null {
  const { data } = useQuery({ queryKey: ['logo', path], enabled: !!path && !DEMO, staleTime: 50 * 60 * 1000, queryFn: async () => {
    const { data } = await supabase.storage.from('logos').createSignedUrl(path!, 3600)
    return data?.signedUrl ?? null
  } })
  // Demo logos are stored as data: URLs already, so they ARE the display URL.
  return DEMO ? path : (data ?? null)
}

export function useSaveBank() {
  const qc = useQueryClient(); const keys = useKeys(); const fail = useFail()
  return useMutation({ mutationFn: async (b: Partial<BankAccount> & { id?: string }) => {
    if (DEMO) {
      const store = getStore()
      let accounts = store.bankAccounts
      if (b.isDefault) accounts = accounts.map((a) => a.id === b.id ? a : { ...a, isDefault: false })
      accounts = b.id
        ? accounts.map((a) => a.id === b.id ? { ...a, ...b, id: a.id } : a)
        : [...accounts, { id: uid(), name: b.name!, bankName: b.bankName ?? '', accountName: b.accountName ?? '', accountNo: b.accountNo ?? '', isDefault: !!b.isDefault, isActive: b.isActive ?? true }]
      saveStore({ ...store, bankAccounts: accounts })
      return
    }
    const row = { name: b.name, bank_name: b.bankName, account_name: b.accountName, account_no: b.accountNo, is_active: b.isActive }
    if (b.isDefault) {
      // Clear the old default first so the one-default index never sees two.
      const clear = supabase.from('bank_accounts').update({ is_default: false }).eq('is_default', true)
      const { error } = await (b.id ? clear.neq('id', b.id) : clear)
      if (error) return fail(error)
    }
    if (b.id) {
      const { data, error } = await supabase.from('bank_accounts').update({ ...row, ...(b.isDefault !== undefined && { is_default: b.isDefault }) }).eq('id', b.id).select('id')
      if (error) return fail(error)
      if (!data.length) await fail({ code: '42501' })
      return
    }
    const { error } = await supabase.from('bank_accounts').insert({ ...row, name: b.name!, is_default: !!b.isDefault })
    if (error) await fail(error)
  }, onSuccess: () => qc.invalidateQueries({ queryKey: keys.banks }) })
}

async function callTeam(body: object): Promise<void> {
  const { data, error } = await supabase.functions.invoke('team', { body })
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(detail?.error ?? "Couldn't reach the server. Try again.")
  }
  return data
}

/** Team management hits the `team` Edge Function and ownership/role RPCs — all disabled in demo mode (read-only Users page). */
async function demoDisabled(): Promise<never> {
  throw new Error('User management is disabled in this demo.')
}

export function useTeam() {
  const qc = useQueryClient(); const keys = useKeys(); const fail = useFail()
  const call = async (p: PromiseLike<{ error: unknown }>) => { const { error } = await p; if (error) await fail(error) }
  const done = { onSuccess: () => qc.invalidateQueries({ queryKey: keys.members }) }
  return {
    invite: useMutation({ mutationFn: (v: { name: string; email: string; role: Exclude<Role, 'owner'> }) => DEMO ? demoDisabled() : callTeam({ action: 'invite', ...v }), ...done }),
    resend: useMutation({ mutationFn: (profileId: string) => DEMO ? demoDisabled() : callTeam({ action: 'resend', profileId }), ...done }),
    remove: useMutation({ mutationFn: (profileId: string) => DEMO ? demoDisabled() : callTeam({ action: 'remove', profileId }), ...done }),
    changeRole: useMutation({ mutationFn: (v: { profileId: string; role: Role }) => DEMO ? demoDisabled() : call(supabase.rpc('change_member_role', { p_profile: v.profileId, p_role: v.role })), ...done }),
    suspend: useMutation({ mutationFn: (profileId: string) => DEMO ? demoDisabled() : call(supabase.rpc('suspend_member', { p_profile: profileId })), ...done }),
    reactivate: useMutation({ mutationFn: (profileId: string) => DEMO ? demoDisabled() : call(supabase.rpc('reactivate_member', { p_profile: profileId })), ...done }),
    transferOwnership: useMutation({ mutationFn: (profileId: string) => DEMO ? demoDisabled() : call(supabase.rpc('transfer_ownership', { p_profile: profileId })), onSuccess: () => qc.invalidateQueries() }),
  }
}

export type { Member, StatementLine }

export function useCheckoutSession() {
  const { profile } = useSession()

  return useMutation({
    mutationFn: async () => {
      if (DEMO) throw new Error('Billing is disabled in this demo.')
      if (!profile?.id) throw new Error('Not signed in')
      const session = await supabase.auth.getSession()
      const jwt = session.data.session?.access_token
      if (!jwt) throw new Error('No session token')

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/billing-checkout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Checkout failed')
      }

      const data = await res.json() as { url: string }
      return data.url
    },
    onSuccess: (url) => {
      window.location.assign(url)
    },
  })
}

export function useFirmBilling() {
  const { firm } = useSession()

  return useQuery({
    queryKey: ['firm', firm?.id, 'billing'],
    queryFn: async () => {
      if (DEMO) return { billing_status: firm.billingStatus, trial_ends_at: firm.trialEndsAt, paid_at: firm.paidAt }
      const { data, error } = await supabase
        .from('firms')
        .select('billing_status, trial_ends_at, paid_at')
        .eq('id', firm.id)
        .single()
      if (error) throw error
      return data as { billing_status: string; trial_ends_at: string | null; paid_at: string | null }
    },
    enabled: !!firm?.id,
    refetchInterval: DEMO ? false : 2000,
  })
}
