import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import {
  accountNo,
  groupBy,
  periodPresets,
  plainAmount,
  today,
  totals,
  CLIENT_STATUSES,
  formatPhone,
  STATUS_LABEL,
  type Client,
  type ClientStatus,
  type Kind,
  type Period,
  type StatementLine,
} from './ledger'
import { AddClient } from './clients/AddClient'
import { StatusBadge, TagList } from './clients/fields'
import { card, LoadError, monthLabel, Segmented, select, shortDate, Skeleton, useGate, useMoneyCell, useUserNames } from './clients/shared'
import { sumBalances, toStatement } from './data/mappers'
import { useMoney } from './data/money'
import { useBalances, useBankAccounts, useClients, useDeleteTxn, useFirstTxnDate, useLedger, fetchAttachmentsForExport } from './data/queries'
import { useSession } from './data/session'
import { ColumnHeader, ColumnsDialog, useTableLayout, type Column } from './table'
import { ConsolidatedStatement, StatementLayout } from './Statement'
import { buildSections, countClients, preparedFrom } from './clients/consolidatedStatement'
import { AttachmentsButton } from './attachments/Attachments'
import { downloadCsv, downloadZip, ImportDialog } from './transfer'
import { Avatar, btn, Dialog, Icon, input, KindBadge, Menu, menuItemClass, nextSort, PeriodPicker, useLocalState, type Sort } from './ui'
import { Empty } from './widgets'
import type { Txn } from './ledger'

type View = 'transactions' | 'balances'
type GroupMode = 'none' | 'client' | 'month'
type TxnSort = 'date' | 'client' | 'amount'
type BalanceSort = 'name' | 'opening' | 'in' | 'out' | 'closing' | 'count' | 'last'
type TypeFilter = 'all' | Kind
type ClientBalance = { client: Client; soa: ReturnType<typeof toStatement>; count: number; last: string }

const PAGE = 200
export const ClientsPage = () => <LedgerView />

/** Clients list (balances + transactions) or, with `fixedClientId`, one client's transactions. */
export function LedgerView({ fixedClientId }: { fixedClientId?: string }) {
  const session = useSession()
  const { fyStartMonth } = session.firm
  const { data: clients = [], isPending: clientsPending, error: clientsError } = useClients()
  const { data: banks = [] } = useBankAccounts()
  const removeTxn = useDeleteTxn()
  const fmt = useMoney().format
  const { currency } = useMoney()
  const money = useMoneyCell()
  const editClients = useGate('clients.edit', 'edit clients')
  const post = useGate('transactions.post', 'record transactions')
  const deleteTxn = useGate('transactions.delete', 'delete transactions')
  const assigneeName = useUserNames()
  const names = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients])
  const nameOf = (id: string) => names.get(id) ?? 'Unknown client'
  const firstTxn = useFirstTxnDate(fixedClientId).data
  const firstDate = clients.reduce((min, c) => (c.createdAt < min ? c.createdAt : min), firstTxn && firstTxn < today() ? firstTxn : today())

  const [view, setView] = useLocalState<View>('clients.view', 'balances')
  const [period, setPeriod] = useState<Period>(() => periodPresets(firstDate, fyStartMonth)[3].period)
  const [query, setQuery] = useState('')
  const [clientFilter, setClientId] = useState('all')
  const [bankAccountId, setBankAccountId] = useState<string>()
  // Default to every client: inactive and archived clients can still hold client money.
  const [status, setStatus] = useState<ClientStatus | 'all'>('all')
  const [type, setType] = useLocalState<TypeFilter>('clients.type', 'all')
  const [storedMode, setMode] = useLocalState<GroupMode>('clients.group', 'none')
  const [storedSort, setTxnSort] = useLocalState<Sort<TxnSort>>('clients.txnSort', { key: 'date', dir: 'desc' })
  const [balanceSort, setBalanceSort] = useLocalState<Sort<BalanceSort>>('clients.balanceSort', { key: 'name', dir: 'asc' })
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState(PAGE)
  const [printing, setPrinting] = useState(false)
  const [dialog, setDialog] = useState<'add' | 'import' | 'columns' | null>(null)
  const [confirmDeleteTxn, setConfirmDeleteTxn] = useState<Txn | null>(null)
  const [soaOpen, setSoaOpen] = useState(false)
  const [includeAttachments, setIncludeAttachments] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  // Print every matching row, not just the first page.
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true))
    const after = () => setPrinting(false)
    addEventListener('beforeprint', before)
    addEventListener('afterprint', after)
    return () => {
      removeEventListener('beforeprint', before)
      removeEventListener('afterprint', after)
    }
  }, [])

  // One client has no Client column to group or sort by.
  const clientId = fixedClientId ?? clientFilter
  const mode: GroupMode = fixedClientId && storedMode === 'client' ? 'none' : storedMode
  const txnSort = useMemo<Sort<TxnSort>>(() => (fixedClientId && storedSort.key === 'client' ? { key: 'date', dir: 'desc' } : storedSort), [fixedClientId, storedSort])
  const q = query.trim().toLowerCase()
  const isTxns = !!fixedClientId || view === 'transactions'
  const statuses = useMemo(() => new Map(clients.map((c) => [c.id, c.status])), [clients])

  const { data: balanceData, error: balancesError, isPending: balancesPending } = useBalances({ from: period.from, to: period.to, bankAccountId })
  const { data: lines = [], error: ledgerError, isLoading: ledgerLoading } = useLedger({
    from: period.from, to: period.to, clientId: fixedClientId ?? (clientFilter === 'all' ? undefined : clientFilter), bankAccountId, perClient: mode === 'client',
  }, isTxns)
  const balanceRows_ = balanceData ?? []
  const perClient = useMemo(() => new Map(balanceRows_.map((r) => [r.client_id, r])), [balanceData]) // eslint-disable-line react-hooks/exhaustive-deps
  const inScope = (id: string) =>
    (clientId === 'all' || id === clientId) && (!!fixedClientId || status === 'all' || statuses.get(id) === status)

  // Accounting scope = client filters + period. Search and type only narrow what's listed.
  const scoped = useMemo(() => lines.filter((t) => inScope(t.clientId)), [lines, clientId, perClient, status, statuses]) // eslint-disable-line react-hooks/exhaustive-deps
  const summary = useMemo(() => ({ ...sumBalances(balanceRows_.filter((r) => inScope(r.client_id))), lines: scoped }), [balanceData, scoped, clientId, status, statuses]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Transactions view ---------- */

  // The server's running balance spans the whole ledger scope, so it only matches the listed rows
  // when nothing narrows them: no search, type or status filter (unless one client is picked).
  const wholeScope = clientId !== 'all' || status === 'all'
  const showBalance = txnSort.key === 'date' && type === 'all' && !q && wholeScope
  const balances = useMemo(() => new Map(lines.map((l) => [l.id, l.balance])), [lines])

  const txnRows = useMemo(() => {
    const listed = summary.lines.filter((t) => (type === 'all' || t.kind === type) && (!q || `${t.note} ${names.get(t.clientId) ?? ''}`.toLowerCase().includes(q)))
    const dir = txnSort.dir === 'asc' ? 1 : -1
    // Date order reuses posting order so same-day entries match the running balance.
    if (txnSort.key === 'date') return dir === 1 ? listed : [...listed].reverse()
    const primary = (a: StatementLine, b: StatementLine) =>
      txnSort.key === 'client' ? (names.get(a.clientId) ?? '').localeCompare(names.get(b.clientId) ?? '') : a.amount - b.amount
    return [...listed].sort((a, b) => primary(a, b) * dir || b.date.localeCompare(a.date))
  }, [summary, type, q, txnSort, names])

  const groups = useMemo(() => {
    const chrono = new Map(summary.lines.map((l, i) => [l.id, i]))
    const closingOf = (list: StatementLine[]) =>
      showBalance && list.length ? balances.get(list.reduce((last, l) => ((chrono.get(l.id) ?? 0) > (chrono.get(last.id) ?? 0) ? l : last)).id) : undefined
    const build = (key: string, label: string, rows: StatementLine[]) => {
      const sum = totals(rows)
      return { key, label, rows, receipts: sum.in, payments: sum.out, closing: closingOf(rows) }
    }
    if (mode === 'none') return [build('all', '', txnRows)]
    const keyOf = mode === 'client' ? (t: StatementLine) => t.clientId : (t: StatementLine) => t.date.slice(0, 7)
    const list = [...groupBy(txnRows, keyOf)].map(([key, rows]) => build(key, mode === 'client' ? nameOf(key) : monthLabel(key), rows))
    if (mode === 'client') return list.sort((a, b) => a.label.localeCompare(b.label) * (txnSort.key === 'client' && txnSort.dir === 'desc' ? -1 : 1))
    return list.sort((a, b) => a.key.localeCompare(b.key) * (txnSort.key === 'date' && txnSort.dir === 'asc' ? 1 : -1))
  }, [txnRows, mode, txnSort, showBalance, balances, summary]) // eslint-disable-line react-hooks/exhaustive-deps

  const txnColumns: Column<StatementLine, TxnSort>[] = [
    { id: 'date', label: 'Date', width: 136, sortKey: 'date', cell: (t) => <span className="text-zinc-500 tabular-nums">{shortDate(t.date)}</span>, text: (t) => t.date },
    {
      id: 'client',
      label: 'Client',
      width: 190,
      sortKey: 'client',
      cell: (t) => <a href={`#clients/${t.clientId}`} className="font-medium hover:underline">{nameOf(t.clientId)}</a>,
      text: (t) => nameOf(t.clientId),
    },
    { id: 'account', label: 'Account no.', width: 120, hidden: true, cell: (t) => <span className="text-zinc-500 tabular-nums">{accountNo(t.clientId)}</span>, text: (t) => accountNo(t.clientId) },
    {
      id: 'description',
      label: 'Description',
      width: 240,
      flex: true,
      cell: (t) => (
        <span className="flex items-center gap-2.5">
          <KindBadge kind={t.kind} />
          <span className="truncate">{t.note || (t.kind === 'in' ? 'Receipt' : 'Payment')}</span>
          {fixedClientId && (
            <span className="ml-auto flex shrink-0 items-center">
              <AttachmentsButton transactionId={t.id} />
              <button
                type="button"
                disabled={!deleteTxn.ok}
                title={deleteTxn.title}
                onClick={() => setConfirmDeleteTxn(t)}
                className="shrink-0 rounded p-1 text-zinc-400 transition hover:text-red-600 disabled:opacity-40 focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 print:hidden"
                aria-label={`Delete ledger entry ${t.note || (t.kind === 'in' ? 'Receipt' : 'Payment')}, ${shortDate(t.date)}`}
              >
                <Icon name="trash" className="size-3.5" />
              </button>
            </span>
          )}
        </span>
      ),
      text: (t) => t.note,
    },
    { id: 'type', label: 'Type', width: 100, hidden: true, cell: (t) => (t.kind === 'in' ? 'Receipt' : 'Payment'), text: (t) => (t.kind === 'in' ? 'Receipt' : 'Payment') },
    { id: 'receipts', label: 'In', width: 140, align: 'right', sortKey: 'amount', cell: (t) => (t.kind === 'in' ? <span className="text-in">{fmt(t.amount)}</span> : ''), text: (t) => (t.kind === 'in' ? plainAmount(t.amount) : '') },
    { id: 'payments', label: 'Out', width: 140, align: 'right', sortKey: 'amount', cell: (t) => (t.kind === 'out' ? fmt(t.amount) : ''), text: (t) => (t.kind === 'out' ? plainAmount(t.amount) : '') },
    { id: 'balance', label: 'Balance', width: 150, align: 'right', cell: (t) => <span className="font-medium">{money(balances.get(t.id) ?? 0)}</span>, text: (t) => plainAmount(balances.get(t.id) ?? 0) },
  ]

  /* ---------- Balances view ---------- */

  const balanceRows = useMemo((): ClientBalance[] => {
    const dir = balanceSort.dir === 'asc' ? 1 : -1
    return clients
      .filter((c) => inScope(c.id) && (!q || `${c.name} ${c.contact} ${c.email} ${c.registrationNo} ${c.clientCode}`.toLowerCase().includes(q)))
      .map((c) => ({ client: c, soa: toStatement(perClient.get(c.id), []), count: perClient.get(c.id)?.txn_count ?? 0, last: perClient.get(c.id)?.last_txn_date ?? '' }))
      .sort((a, b) => {
        const by = {
          name: a.client.name.localeCompare(b.client.name),
          opening: a.soa.opening - b.soa.opening,
          in: a.soa.receipts - b.soa.receipts,
          out: a.soa.payments - b.soa.payments,
          closing: a.soa.closing - b.soa.closing,
          count: a.count - b.count,
          last: a.last.localeCompare(b.last),
        }[balanceSort.key]
        return by * dir || a.client.name.localeCompare(b.client.name)
      })
  }, [clients, perClient, q, balanceSort, period, clientId, status]) // eslint-disable-line react-hooks/exhaustive-deps

  const balanceColumns: Column<ClientBalance, BalanceSort>[] = [
    {
      id: 'client',
      label: 'Client',
      width: 240,
      flex: true,
      sortKey: 'name',
      cell: (r) => (
        <a href={`#clients/${r.client.id}`} className="flex items-center gap-3">
          <Avatar name={r.client.name} />
          <span className="min-w-0">
            <span className="block truncate font-medium">{r.client.name}</span>
            <span className="block truncate text-xs text-zinc-500">{r.client.contact || r.client.email || '—'}</span>
          </span>
        </a>
      ),
      text: (r) => r.client.name,
    },
    { id: 'account', label: 'Account no.', width: 120, hidden: true, cell: (r) => <span className="text-zinc-500 tabular-nums">{accountNo(r.client.id)}</span>, text: (r) => accountNo(r.client.id) },
    { id: 'contact', label: 'Primary contact', width: 160, hidden: true, cell: (r) => r.client.contact || '—', text: (r) => r.client.contact },
    { id: 'email', label: 'Email', width: 220, hidden: true, cell: (r) => r.client.email || '—', text: (r) => r.client.email },
    { id: 'status', label: 'Status', width: 110, hidden: true, cell: (r) => <StatusBadge status={r.client.status} />, text: (r) => STATUS_LABEL[r.client.status] },
    { id: 'tags', label: 'Tags', width: 200, hidden: true, cell: (r) => <TagList tags={r.client.tags} />, text: (r) => r.client.tags.join('; ') },
    { id: 'assignee', label: 'Assigned member', width: 180, hidden: true, cell: (r) => assigneeName(r.client.assignedUserId) || '—', text: (r) => assigneeName(r.client.assignedUserId) },
    { id: 'phone', label: 'Phone', width: 150, hidden: true, cell: (r) => <span className="tabular-nums">{formatPhone(r.client.phone) || '—'}</span>, text: (r) => formatPhone(r.client.phone) },
    { id: 'registration', label: 'Registration no.', width: 190, hidden: true, cell: (r) => r.client.registrationNo || '—', text: (r) => r.client.registrationNo },
    { id: 'clientCode', label: 'Client ID', width: 150, hidden: true, cell: (r) => r.client.clientCode || '—', text: (r) => r.client.clientCode },
    { id: 'industry', label: 'Industry', width: 170, hidden: true, cell: (r) => r.client.industry || '—', text: (r) => r.client.industry },
    { id: 'opening', label: 'Opening balance', width: 150, align: 'right', sortKey: 'opening', cell: (r) => money(r.soa.opening), text: (r) => plainAmount(r.soa.opening) },
    { id: 'receipts', label: 'In', width: 140, align: 'right', sortKey: 'in', cell: (r) => <span className="text-in">{fmt(r.soa.receipts)}</span>, text: (r) => plainAmount(r.soa.receipts) },
    { id: 'payments', label: 'Out', width: 140, align: 'right', sortKey: 'out', cell: (r) => fmt(r.soa.payments), text: (r) => plainAmount(r.soa.payments) },
    { id: 'closing', label: 'Closing balance', width: 150, align: 'right', sortKey: 'closing', cell: (r) => <span className="font-semibold">{money(r.soa.closing)}</span>, text: (r) => plainAmount(r.soa.closing) },
    { id: 'count', label: 'Transactions', width: 120, align: 'right', sortKey: 'count', hidden: true, cell: (r) => r.count, text: (r) => String(r.count) },
    { id: 'last', label: 'Last transaction', width: 140, align: 'right', sortKey: 'last', cell: (r) => <span className="text-zinc-500">{r.last ? shortDate(r.last) : '—'}</span>, text: (r) => r.last },
  ]

  const txnTable = useTableLayout(fixedClientId ? 'client-transactions' : 'transactions', txnColumns)
  const balanceTable = useTableLayout('balances', balanceColumns)
  const txnVisible = txnTable.visible.filter((c) => (c.id !== 'client' || (mode !== 'client' && !fixedClientId)) && (c.id !== 'balance' || showBalance))
  const balanceVisible = balanceTable.visible
  const table = isTxns ? txnTable : balanceTable
  const dense = table.layout.dense
  const pad = dense ? 'px-4 py-1.5' : 'px-4 py-2.5'
  const rowLimit = printing ? Infinity : limit

  /* ---------- Actions ---------- */

  const filtersActive = !!q || clientFilter !== 'all' || status !== 'all' || (isTxns && type !== 'all')
  const clearFilters = () => {
    setQuery('')
    setClientId('all')
    setStatus('all')
    setType('all')
  }
  const resetPaging = () => setLimit(PAGE)
  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const allCollapsed = mode !== 'none' && groups.every((g) => collapsed.has(g.key))

  const exportCsv = async () => {
    const stamp = `${period.from}_${period.to}`
    const who = fixedClientId ? `_${nameOf(fixedClientId).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` : ''
    const baseName = isTxns ? `client-ledger${who}_${stamp}` : `client-balances_${stamp}`
    const rows = isTxns
      ? [txnVisible.map((c) => c.label), ...txnRows.map((r) => txnVisible.map((c) => c.text(r)))]
      : [balanceVisible.map((c) => c.label), ...balanceRows.map((r) => balanceVisible.map((c) => c.text(r)))]
    if (!includeAttachments) return downloadCsv(`${baseName}.csv`, rows)
    setExporting(true)
    setExportError('')
    try {
      const attachments = isTxns
        ? await fetchAttachmentsForExport('transaction_id', txnRows.map((r) => r.id))
        : await fetchAttachmentsForExport('client_id', balanceRows.map((r) => r.client.id))
      await downloadZip(`${baseName}.zip`, `${baseName}.csv`, rows, attachments)
    } catch (err) {
      setExportError((err as Error).message)
    } finally {
      setExporting(false)
    }
  }

  const filterNote = [
    clientFilter !== 'all' && nameOf(clientFilter),
    status !== 'all' && `${STATUS_LABEL[status].toLowerCase()} clients`,
    isTxns && type !== 'all' && (type === 'in' ? 'receipts only' : 'payments only'),
    q && `search “${query.trim()}”`,
    isTxns && mode !== 'none' && `grouped by ${mode}`,
  ].filter(Boolean) as string[]

  /* ---------- Render helpers ---------- */

  const colgroup = <R, K extends string>(cols: Column<R, K>[], widthOf: (c: Column<R, K>) => number) => (
    <colgroup>
      {cols.map((c) => <col key={c.id} style={{ width: c.flex ? undefined : widthOf(c) }} />)}
    </colgroup>
  )
  const minWidth = (isTxns ? txnVisible.map(txnTable.widthOf) : balanceVisible.map(balanceTable.widthOf)).reduce((a, b) => a + b, 0)
  const cellClass = (align?: 'right') => `${pad} truncate ${align === 'right' ? 'text-right tabular-nums' : ''}`

  // Page through rows across groups; collapsed groups use none of the page.
  const paged = groups.reduce<{ left: number; list: (typeof groups[number] & { open: boolean; shown: StatementLine[] })[] }>(
    (acc, g) => {
      const open = mode === 'none' || !collapsed.has(g.key)
      const shown = open ? g.rows.slice(0, Math.max(0, acc.left)) : []
      return { left: acc.left - shown.length, list: [...acc.list, { ...g, open, shown }] }
    },
    { left: rowLimit, list: [] },
  ).list
  const shownBalances = balanceRows.slice(0, rowLimit)
  const truncated = isTxns ? paged.some((g) => g.open && g.shown.length < g.rows.length) : shownBalances.length < balanceRows.length

  const txnBody = paged.map((g) => {
    const { open, shown: visible } = g
    const subtotal: Record<string, ReactNode> = {
      receipts: <span className="text-in">{fmt(g.receipts)}</span>,
      payments: fmt(g.payments),
      balance: g.closing === undefined ? '' : money(g.closing),
    }
    return (
      <tbody key={g.key} className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {mode !== 'none' && (
          <tr className="bg-zinc-50 font-medium dark:bg-zinc-800/40 print:break-after-avoid">
            {txnVisible.map((c, i) => (
              <td key={c.id} className={i === 0 ? `${pad} overflow-visible whitespace-nowrap` : cellClass(c.align)}>
                {i === 0 ? (
                  <button type="button" onClick={() => toggleGroup(g.key)} aria-expanded={open} className="relative z-[1] flex items-center gap-2 text-left">
                    <Icon name={open ? 'down' : 'right'} className="size-3.5 text-zinc-400 print:hidden" />
                    {mode === 'client' && <Avatar name={g.label} size="size-6 text-[10px]" />}
                    <span>{g.label}</span>
                    <span className="font-normal text-zinc-500">· {g.rows.length}</span>
                  </button>
                ) : (
                  subtotal[c.id] ?? ''
                )}
              </td>
            ))}
          </tr>
        )}
        {visible.map((t) => (
          <tr key={t.id} className="group transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50 print:break-inside-avoid">
            {txnVisible.map((c) => <td key={c.id} className={cellClass(c.align)}>{c.cell(t)}</td>)}
          </tr>
        ))}
      </tbody>
    )
  })

  const txnFooter: Record<string, ReactNode> = {
    receipts: <span className="text-in">{fmt(totals(txnRows).in)}</span>,
    payments: fmt(totals(txnRows).out),
    balance: money(summary.closing),
  }
  const balanceTotals = balanceRows.reduce(
    (acc, r) => ({ opening: acc.opening + r.soa.opening, receipts: acc.receipts + r.soa.receipts, payments: acc.payments + r.soa.payments, closing: acc.closing + r.soa.closing, count: acc.count + r.count }),
    { opening: 0, receipts: 0, payments: 0, closing: 0, count: 0 },
  )
  const balanceFooter: Record<string, ReactNode> = {
    opening: money(balanceTotals.opening),
    receipts: <span className="text-in">{fmt(balanceTotals.receipts)}</span>,
    payments: fmt(balanceTotals.payments),
    closing: money(balanceTotals.closing),
    count: balanceTotals.count,
  }

  const loadError = clientsError ?? balancesError ?? ledgerError
  const rowsCount = isTxns ? txnRows.length : balanceRows.length
  const loading = balancesPending || (isTxns && ledgerLoading)
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  const gateHint = fixedClientId ? undefined : (!editClients.ok ? editClients.title : undefined) ?? (!post.ok ? post.title : undefined)

  if (clientsPending) return <LedgerSkeleton />
  if (loadError) return <LoadError error={loadError} what={fixedClientId ? 'this ledger' : 'your clients'} />

  if (soaOpen && !fixedClientId) {
    return (
      <StatementLayout
        back={{ href: '#clients', label: 'Back to clients', onClick: () => setSoaOpen(false) }}
        title="Statement of account"
        firstDate={firstDate}
        fileName={(p) => `Statement of account – ${session.firm.tradingName || session.firm.name} – ${p.from} to ${p.to}`}
        period={period}
        setPeriod={setPeriod}
        ready={true}
      >
        {isTxns ? (
          <ConsolidatedStatement
            period={period}
            summary={summary}
            columns={txnVisible}
            sections={buildSections(groups, mode, fmt)}
            total={txnFooter}
            preparedFrom={preparedFrom(filterNote, mode)}
            clientCount={countClients(txnRows.map((r) => r.clientId))}
            rowKey={(r) => r.id}
          />
        ) : (
          <ConsolidatedStatement
            period={period}
            summary={summary}
            columns={balanceVisible}
            sections={[{ key: 'all', rows: balanceRows }]}
            total={balanceFooter}
            preparedFrom={preparedFrom(filterNote, 'none')}
            clientCount={balanceRows.length}
            rowKey={(r) => r.client.id}
          />
        )}
      </StatementLayout>
    )
  }

  return (
    <div className="print-landscape grid grid-cols-1 gap-4">
      {/* Print-only heading: what this sheet is, for whom, and which filters produced it. */}
      <header className="hidden border-b-2 border-zinc-900 pb-3 print:block">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-lg font-semibold">{session.firm.tradingName || session.firm.name}</p>
            <h1 className="text-xl font-semibold">{isTxns ? 'Client ledger' : 'Client balances'}{fixedClientId && ` — ${nameOf(fixedClientId)}`}</h1>
          </div>
          <div className="text-right text-sm text-zinc-600">
            <p>Period {shortDate(period.from)} – {shortDate(period.to)}</p>
            <p>Printed {shortDate(today())} · Currency {currency}</p>
          </div>
        </div>
        {filterNote.length > 0 && <p className="mt-1 text-sm text-zinc-600">Filtered: {filterNote.join(' · ')}</p>}
      </header>

      <div className={`${card} flex flex-wrap items-center gap-2 p-4 print:hidden`}>
        {!fixedClientId && <Segmented<View>
          label="View"
          value={view}
          onChange={(v) => {
            setView(v)
            resetPaging()
          }}
          options={[
            ['balances', 'Balances'],
            ['transactions', 'Transactions'],
          ]}
        />}
        <div className="relative w-full sm:w-48">
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              resetPaging()
            }}
            placeholder={fixedClientId ? 'Search description' : isTxns ? 'Search description or client' : 'Search name, contact or email'}
            aria-label="Search"
            className={`${input} py-1.5 pl-9`}
          />
        </div>
        <PeriodPicker
          period={period}
          onChange={(p) => {
            setPeriod(p)
            resetPaging()
          }}
          firstDate={firstDate}
        />
        {!fixedClientId && (
          <>
            <select value={clientFilter} onChange={(e) => setClientId(e.target.value)} aria-label="Client" className={`${select} sm:w-36`}>
              <option value="all">All clients</option>
              {[...clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select value={bankAccountId ?? 'all'} onChange={(e) => setBankAccountId(e.target.value === 'all' ? undefined : e.target.value)} aria-label="Bank account" className={`${select} sm:w-36`}>
              <option value="all">All bank accounts</option>
              {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as ClientStatus | 'all')} aria-label="Status" className={`${select} sm:w-36`}>
              {CLIENT_STATUSES.map((st) => (
                <option key={st} value={st}>{STATUS_LABEL[st]}</option>
              ))}
              <option value="all">All statuses</option>
            </select>
          </>
        )}

        <div className="flex basis-full flex-wrap items-center gap-2">
          {isTxns && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm whitespace-nowrap text-zinc-500">Type</span>
                <Segmented<TypeFilter> label="Transaction type" value={type} onChange={setType} options={[['all', 'All'], ['in', 'In'], ['out', 'Out']]} />
              </div>
              <label className="flex items-center gap-2 text-sm whitespace-nowrap text-zinc-500">
                Group by
                <select
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value as GroupMode)
                    setCollapsed(new Set())
                  }}
                  className={select}
                >
                  <option value="none">None</option>
                  {!fixedClientId && <option value="client">Client</option>}
                  <option value="month">Month</option>
                </select>
              </label>
            </>
          )}
          {filtersActive && (
            <button type="button" className={btn.ghost} onClick={clearFilters}>
              <Icon name="x" /> Clear filters
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Menu
              trigger={<Icon name="more" />}
              triggerLabel="More actions"
              menuLabel="More actions"
              triggerClassName={`${btn.ghost} px-2`}
            >
              {(close) => (
                <>
                  {!fixedClientId && (
                    <button role="menuitem" type="button" className={menuItemClass} disabled={!post.ok} title={post.title} aria-describedby={gateHint ? 'ledger-gate' : undefined} onClick={() => { close(); setDialog('import') }}>
                      <Icon name="upload" /> Import
                    </button>
                  )}
                  <button role="menuitem" type="button" className={menuItemClass} onClick={() => { close(); exportCsv() }} disabled={!rowsCount || exporting} title={rowsCount ? 'Export' : 'Nothing to export'}>
                    <Icon name="download" /> {exporting ? 'Exporting…' : 'Export'}
                  </button>
                  <label role="menuitemcheckbox" aria-checked={includeAttachments} className={`${menuItemClass} cursor-pointer`}>
                    <input type="checkbox" checked={includeAttachments} onChange={(e) => setIncludeAttachments(e.target.checked)} className="accent-zinc-900" />
                    Include attachments
                  </label>
                  <button role="menuitem" type="button" className={menuItemClass} onClick={() => { close(); print() }} disabled={!rowsCount} title={rowsCount ? 'Print' : 'Nothing to print'}>
                    <Icon name="printer" /> Print
                  </button>
                </>
              )}
            </Menu>
            {!fixedClientId && (
              <button type="button" className={btn.ghost} onClick={() => setSoaOpen(true)} disabled={!rowsCount} title={rowsCount ? 'Statement of account' : 'Nothing to export'}>
                <Icon name="file" /> <span className="max-sm:sr-only">Statement of account</span>
              </button>
            )}
            {!fixedClientId && (
              <button type="button" className={btn.primary} disabled={!editClients.ok} title={editClients.title} aria-describedby={gateHint ? 'ledger-gate' : undefined} onClick={() => setDialog('add')}>
                <Icon name="plus" /> Add client
              </button>
            )}
          </div>
        </div>
        {gateHint && <p id="ledger-gate" className="basis-full text-xs text-zinc-500">{gateHint}</p>}
        {exportError && <p className="basis-full text-sm text-red-600 dark:text-red-400" role="alert">{exportError}</p>}
      </div>

      <div className={`${card} overflow-hidden print:overflow-visible print:rounded-none print:border-0`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-100 px-5 py-3 text-sm dark:border-zinc-800 print:hidden">
          <span className="font-medium">{isTxns ? plural(txnRows.length, 'transaction') : plural(balanceRows.length, 'client')}</span>
          <span className="text-zinc-500">{shortDate(period.from)} – {shortDate(period.to)}</span>
          {removeTxn.error && <span className="text-red-600 dark:text-red-400" role="alert">{removeTxn.error.message}</span>}
          {isTxns && !showBalance && <span className="basis-full text-xs text-zinc-500">Running balance shows when sorted by date with no search, type or status filter, unless one client is selected.</span>}
          <div className="ml-auto flex items-center gap-1">
            {isTxns && mode !== 'none' && groups.length > 0 && (
              <button type="button" className={`${btn.ghost} py-1`} onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.key)))}>
                {allCollapsed ? 'Expand all' : 'Collapse all'}
              </button>
            )}
            <button type="button" className={`${btn.ghost} py-1`} onClick={() => setDialog('columns')}>
              <Icon name="columns" /> Columns
            </button>
          </div>
        </div>

        {loading ? (
          <div role="status" aria-label="Loading ledger" className="grid gap-3 p-5">
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
            <span className="sr-only">Loading…</span>
          </div>
        ) : rowsCount ? (
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full table-fixed text-sm print:text-xs" style={{ minWidth: printing ? undefined : minWidth }}>
              {isTxns ? colgroup(txnVisible, txnTable.widthOf) : colgroup(balanceVisible, balanceTable.widthOf)}
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800 print:border-zinc-400">
                  {isTxns
                    ? txnVisible.map((c) => (
                        <ColumnHeader key={c.id} column={c} width={txnTable.widthOf(c)} onResize={(w) => txnTable.setWidth(c.id, w)} sort={txnSort} onSort={(k) => {
                            setTxnSort(nextSort(txnSort, k, k === 'client' ? 'asc' : 'desc'))
                            resetPaging()
                          }} />
                      ))
                    : balanceVisible.map((c) => (
                        <ColumnHeader key={c.id} column={c} width={balanceTable.widthOf(c)} onResize={(w) => balanceTable.setWidth(c.id, w)} sort={balanceSort} onSort={(k) => {
                            setBalanceSort(nextSort(balanceSort, k, k === 'name' ? 'asc' : 'desc'))
                            resetPaging()
                          }} />
                      ))}
                </tr>
              </thead>
              {isTxns ? (
                txnBody
              ) : (
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {shownBalances.map((r) => (
                    <tr key={r.client.id} className="cursor-pointer transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50 print:break-inside-avoid" onClick={() => (location.hash = `clients/${r.client.id}`)}>
                      {balanceVisible.map((c) => <td key={c.id} className={cellClass(c.align)}>{c.cell(r)}</td>)}
                    </tr>
                  ))}
                </tbody>
              )}
              <tfoot>
                <tr className="border-t-2 border-zinc-200 font-semibold dark:border-zinc-700 print:border-zinc-900">
                  {(isTxns ? txnVisible : balanceVisible).map((c, i) => (
                    <td key={c.id} className={i === 0 ? `${pad} overflow-visible whitespace-nowrap` : cellClass(c.align)}>
                      {i === 0 ? `Total${filtersActive ? ' (filtered)' : ''}` : ((isTxns ? txnFooter : balanceFooter)[c.id] ?? '')}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
            {truncated && (
              <div className="border-t border-zinc-100 p-3 text-center dark:border-zinc-800 print:hidden">
                <button type="button" className={btn.ghost} onClick={() => setLimit(limit + PAGE)}>
                  Showing first {limit} · Show {PAGE} more
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="p-6">
            <Empty
              text={
                filtersActive
                  ? 'Nothing matches these filters. Widen the search or clear the filters to see more.'
                  : !fixedClientId && clients.length === 0
                    ? 'No clients yet. Add your first client, or import a CSV of existing transactions.'
                    : isTxns
                      ? 'No transactions in this period. Choose a different period above, or record one.'
                      : 'No client balances to show for this period.'
              }
              action={
                filtersActive ? (
                  <button type="button" className={btn.primary} onClick={clearFilters}><Icon name="x" /> Clear filters</button>
                ) : !fixedClientId && clients.length === 0 ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <button type="button" className={btn.primary} disabled={!editClients.ok} onClick={() => setDialog('add')} data-tour="add-client"><Icon name="plus" /> Add client</button>
                    <button type="button" className={btn.ghost} disabled={!post.ok} onClick={() => setDialog('import')} data-tour="import-export"><Icon name="upload" /> Import CSV</button>
                  </div>
                ) : undefined
              }
            />
          </div>
        )}
      </div>

      {!fixedClientId && <AddClient open={dialog === 'add'} onClose={() => setDialog(null)} />}
      {!fixedClientId && <ImportDialog open={dialog === 'import'} onClose={() => setDialog(null)} />}
      {isTxns ? (
        <ColumnsDialog open={dialog === 'columns'} onClose={() => setDialog(null)} table={txnTable} />
      ) : (
        <ColumnsDialog open={dialog === 'columns'} onClose={() => setDialog(null)} table={balanceTable} />
      )}

      <Dialog open={!!confirmDeleteTxn} onClose={() => setConfirmDeleteTxn(null)} title="Delete ledger entry">
        {confirmDeleteTxn && (
          <div className="grid gap-4 text-sm">
            <p>
              Delete {confirmDeleteTxn.note || (confirmDeleteTxn.kind === 'in' ? 'Receipt' : 'Payment')} of {money(confirmDeleteTxn.amount)} on {shortDate(confirmDeleteTxn.date)}? This can't be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className={btn.ghost} onClick={() => setConfirmDeleteTxn(null)}>Cancel</button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg bg-red-700 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-red-800 disabled:opacity-40 dark:bg-red-600 dark:hover:bg-red-500"
                disabled={removeTxn.isPending}
                onClick={() => removeTxn.mutate(confirmDeleteTxn.id, { onSuccess: () => setConfirmDeleteTxn(null) })}
              >
                {removeTxn.isPending ? 'Deleting…' : 'Delete entry'}
              </button>
            </div>
            {removeTxn.error && <p className="text-red-600 dark:text-red-400" role="alert">{removeTxn.error.message}</p>}
          </div>
        )}
      </Dialog>
    </div>
  )
}

/** Same shape as the loaded page (KPI row, toolbar, table) so nothing jumps when data lands. */
function LedgerSkeleton() {
  return (
    <div role="status" aria-label="Loading clients" className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${card} grid gap-2 p-5`}><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-32" /><Skeleton className="h-4 w-20" /></div>
        ))}
      </div>
      <div className={`${card} grid gap-3 p-4`}><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div>
      <div className={`${card} grid gap-3 p-5`}>{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      <span className="sr-only">Loading…</span>
    </div>
  )
}
