import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { Client, ClientInput, Kind, StatementLine, Txn } from '../ledger'
import type { Database, Json } from './database.types'
import type { Role } from '../users/rules'
import { isWriteBlock, toUserMessage } from './errors'
import {
  clientToRow, firmToRow, rowToBank, rowToClient, rowToContract, rowToLine, rowToMember,
  type BalanceRow, type BankAccount, type Contract, type Firm, type LedgerRow, type Member,
} from './mappers'
import { classifyEmptyUpdate, ConflictError } from './conflict.ts'
import { useSession } from './session'
import { fetchAll } from './paging'
import { supabase } from './supabase'

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
    const rows = await fetchAll((from, to) => supabase.from('clients').select('*').order('name').order('id').range(from, to)).catch(fail)
    return rows.map(rowToClient)
  } })
}

export function useClient(id: string) {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.client(id), queryFn: async () => {
    const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle()
    return error ? fail(error) : data ? rowToClient(data) : null
  } })
}

export function useBalances(p: { from: string; to: string; bankAccountId?: string; clientId?: string }) {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.balances(p), placeholderData: keepPreviousData, queryFn: async () =>
    (await fetchAll((from, to) => supabase.rpc('client_balances', { p_from: p.from, p_to: p.to, p_bank_account: p.bankAccountId, p_client: p.clientId }).range(from, to)).catch(fail)) as BalanceRow[],
  })
}

export function useLedger(p: { from: string; to: string; clientId?: string; bankAccountId?: string; perClient?: boolean }, enabled = true) {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.ledger(p), enabled, placeholderData: keepPreviousData, queryFn: async () => {
    const rows = await fetchAll((from, to) => supabase.rpc('ledger_lines', { p_from: p.from, p_to: p.to, p_client: p.clientId, p_bank_account: p.bankAccountId, p_per_client: p.perClient ?? false }).range(from, to)).catch(fail)
    return (rows as LedgerRow[]).map(rowToLine)
  } })
}

export function useRecentTxns(limit: number) {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.recent(limit), queryFn: async () => {
    const { data, error } = await supabase.from('transactions').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }).limit(limit)
    return error ? fail(error) : data.map((r): Txn => ({ id: r.id, clientId: r.client_id, bankAccountId: r.bank_account_id, kind: r.kind === 'receipt' ? 'in' : 'out', amount: r.amount_minor, date: r.date, note: r.description, createdAt: r.created_at, updatedAt: r.updated_at }))
  } })
}

/** Earliest transaction date (YYYY-MM-DD), or null with no transactions. Imported history can predate the client record. */
export function useFirstTxnDate(clientId?: string) {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.firstTxn(clientId), queryFn: async () => {
    let q = supabase.from('transactions').select('date').order('date').limit(1)
    if (clientId) q = q.eq('client_id', clientId)
    const { data, error } = await q
    return error ? fail(error) : (data[0]?.date ?? null)
  } })
}

export function useBankAccounts() {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.banks, queryFn: async () => {
    const { data, error } = await supabase.from('bank_accounts').select('*').order('is_default', { ascending: false }).order('name')
    return error ? fail(error) : data.map(rowToBank)
  } })
}

export function useMembers() {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.members, queryFn: async () => {
    const rows = await fetchAll((from, to) => supabase.from('profiles').select('*').order('name').order('id').range(from, to)).catch(fail)
    return rows.map(rowToMember)
  } })
}

export function useContracts() {
  const keys = useKeys(); const fail = useFail()
  return useQuery({ queryKey: keys.contracts, queryFn: async () => {
    const rows = await fetchAll((from, to) => supabase.from('contracts').select('*').order('end_date').order('id').range(from, to)).catch(fail)
    return rows.map(rowToContract)
  } })
}

export function useCreateContract() {
  const qc = useQueryClient(); const keys = useKeys(); const fail = useFail()
  return useMutation({ mutationFn: async (input: { clientId: string; title: string; startDate: string; endDate: string }) => {
    const { error } = await supabase.from('contracts').insert({ client_id: input.clientId, title: input.title, start_date: input.startDate, end_date: input.endDate })
    if (error) await fail(error)
  }, onSuccess: () => qc.invalidateQueries({ queryKey: keys.contracts }) })
}

export function useApproveContract() {
  const qc = useQueryClient(); const keys = useKeys(); const fail = useFail()
  return useMutation({ mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
    const { error } = await supabase.rpc('approve_contract', { p_contract: id, p_approve: approve })
    if (error) await fail(error)
  }, onSuccess: () => qc.invalidateQueries({ queryKey: keys.contracts }) })
}

export type { Contract }

/** Returns [value, save, loaded]: `loaded` is false until the stored value (or its absence) is known. */
export function usePreference<T>(key: string, fallback: T): [T, (value: T) => void, boolean] {
  const { profile } = useSession()
  const [value, setValue] = useState<T>(fallback)
  const [loaded, setLoaded] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    supabase.from('user_preferences').select('value').eq('profile_id', profile.id).eq('key', key).maybeSingle()
      .then(({ data }) => {
        if (data) setValue(data.value as T)
        setLoaded(true)
      })
  }, [profile.id, key])
  const save = (next: T) => {
    setValue(next)
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

export function useCreateClient() {
  const invalidate = useInvalidateFirm(); const fail = useFail()
  return useMutation({ mutationFn: async (input: ClientInput) => {
    const { data, error } = await supabase.from('clients').insert({ ...clientToRow(input as Partial<Client>), name: input.name }).select('*').single()
    return error ? fail(error) : rowToClient(data)
  }, onSuccess: invalidate })
}

export function useUpdateClient() {
  const invalidate = useInvalidateFirm(); const fail = useFail()
  return useMutation({ mutationFn: async ({ id, patch, loadedUpdatedAt }: { id: string; patch: Partial<Client>; loadedUpdatedAt: string }) => {
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
    const { data, error } = await supabase.from('clients').delete().eq('id', id).select('id')
    if (error) return fail(error)
    if (!data.length) throw new Error("You don't have permission to do that.")
  }, onSuccess: invalidate })
}

export function usePostTxn() {
  const invalidate = useInvalidateFirm(); const fail = useFail()
  return useMutation({ mutationFn: async (t: { clientId: string; bankAccountId: string; kind: Kind; amount: number; date: string; note: string }) => {
    const { error } = await supabase.from('transactions').insert({ client_id: t.clientId, bank_account_id: t.bankAccountId, kind: t.kind === 'in' ? 'receipt' : 'payment', amount_minor: t.amount, date: t.date, description: t.note })
    if (error) await fail(error)
  }, onSuccess: invalidate })
}

export function useUpdateTxn() {
  const invalidate = useInvalidateFirm(); const fail = useFail()
  return useMutation({ mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<Txn, 'kind' | 'amount' | 'date' | 'note' | 'bankAccountId'>> }) => {
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
    const { data, error } = await supabase.from('transactions').delete().eq('id', id).select('id')
    if (error) return fail(error)
    if (!data.length) throw new Error("You don't have permission to do that.")
  }, onSuccess: invalidate })
}

export function useImport() {
  const invalidate = useInvalidateFirm(); const fail = useFail()
  return useMutation({ mutationFn: async ({ rows, dryRun }: { rows: ImportPayloadRow[]; dryRun: boolean }) => {
    const { data, error } = await supabase.rpc('import_transactions', { p_rows: rows, p_dry_run: dryRun })
    return error ? fail(error) : (data as { transactions: number; clients: number; duplicates: number })
  }, onSuccess: (_d, v) => { if (!v.dryRun) invalidate() } })
}

export function useSampleDataExists() {
  const keys = useKeys(); const fail = useFail()
  const { data: exists = false } = useQuery({
    queryKey: keys.sampleDataExists,
    queryFn: async () => {
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
    const { data, error } = await supabase.from('firms').update(firmToRow(patch)).eq('id', firm.id).select('id')
    if (error) return fail(error)
    if (!data.length) await fail({ code: '42501' })
  }, onSuccess: () => qc.invalidateQueries({ queryKey: ['session'] }) })
}

export function useUploadLogo() {
  const { firm } = useSession(); const update = useUpdateFirm(); const fail = useFail()
  return useMutation({ mutationFn: async (file: File) => {
    const ext = file.type === 'image/svg+xml' ? 'svg' : file.type === 'image/png' ? 'png' : 'jpg'
    const path = `${firm.id}/logo-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('logos').upload(path, file, { contentType: file.type })
    if (error) return fail(error)
    await update.mutateAsync({ logoPath: path })
    return path
  } })
}

export function useLogoUrl(path: string | null): string | null {
  const { data } = useQuery({ queryKey: ['logo', path], enabled: !!path, staleTime: 50 * 60 * 1000, queryFn: async () => {
    const { data } = await supabase.storage.from('logos').createSignedUrl(path!, 3600)
    return data?.signedUrl ?? null
  } })
  return data ?? null
}

export function useSaveBank() {
  const qc = useQueryClient(); const keys = useKeys(); const fail = useFail()
  return useMutation({ mutationFn: async (b: Partial<BankAccount> & { id?: string }) => {
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

export function useTeam() {
  const qc = useQueryClient(); const keys = useKeys(); const fail = useFail()
  const call = async (p: PromiseLike<{ error: unknown }>) => { const { error } = await p; if (error) await fail(error) }
  const done = { onSuccess: () => qc.invalidateQueries({ queryKey: keys.members }) }
  return {
    invite: useMutation({ mutationFn: (v: { name: string; email: string; role: Exclude<Role, 'owner'> }) => callTeam({ action: 'invite', ...v }), ...done }),
    resend: useMutation({ mutationFn: (profileId: string) => callTeam({ action: 'resend', profileId }), ...done }),
    remove: useMutation({ mutationFn: (profileId: string) => callTeam({ action: 'remove', profileId }), ...done }),
    changeRole: useMutation({ mutationFn: (v: { profileId: string; role: Role }) => call(supabase.rpc('change_member_role', { p_profile: v.profileId, p_role: v.role })), ...done }),
    suspend: useMutation({ mutationFn: (profileId: string) => call(supabase.rpc('suspend_member', { p_profile: profileId })), ...done }),
    reactivate: useMutation({ mutationFn: (profileId: string) => call(supabase.rpc('reactivate_member', { p_profile: profileId })), ...done }),
    transferOwnership: useMutation({ mutationFn: (profileId: string) => call(supabase.rpc('transfer_ownership', { p_profile: profileId })), onSuccess: () => qc.invalidateQueries() }),
  }
}

export type { Member, StatementLine }

export function useCheckoutSession() {
  const { profile } = useSession()

  return useMutation({
    mutationFn: async () => {
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
      const { data, error } = await supabase
        .from('firms')
        .select('billing_status, trial_ends_at, paid_at')
        .eq('id', firm.id)
        .single()
      if (error) throw error
      return data as { billing_status: string; trial_ends_at: string | null; paid_at: string | null }
    },
    enabled: !!firm?.id,
    refetchInterval: 2000,
  })
}
