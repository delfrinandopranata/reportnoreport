import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import {
  accountNo,
  earliestDate,
  formatMoney,
  groupBy,
  periodPresets,
  plainAmount,
  statement,
  today,
  totals,
  CLIENT_STATUSES,
  formatPhone,
  STATUS_LABEL,
  type Client,
  type ClientStatus,
  type Kind,
  type Period,
  type Statement,
  type StatementLine,
} from './ledger'
import { AddClient } from './clients/AddClient'
import { StatusBadge, TagList } from './clients/fields'
import { card, money, monthLabel, neg, Segmented, select, shortDate, useCan, useUserNames } from './clients/shared'
import { useSettings } from './settings/store'
import { useStore } from './store'
import { ColumnHeader, ColumnsDialog, useTableLayout, type Column } from './table'
import { downloadCsv, ImportDialog } from './transfer'
import { Avatar, btn, Icon, input, KindBadge, nextSort, PeriodPicker, useLocalState, type Sort } from './ui'
import { Empty } from './widgets'

type View = 'transactions' | 'balances'
type GroupMode = 'none' | 'client' | 'month'
type TxnSort = 'date' | 'client' | 'amount'
type BalanceSort = 'name' | 'opening' | 'in' | 'out' | 'closing' | 'count' | 'last'
type TypeFilter = 'all' | Kind
type BalanceRow = { client: Client; soa: Statement; last: string }

const PAGE = 200
export const ClientsPage = () => <LedgerView />

/** Clients list (balances + transactions) or, with `fixedClientId`, one client's transactions. */
export function LedgerView({ fixedClientId }: { fixedClientId?: string }) {
  const clients = useStore((s) => s.clients)
  const txns = useStore((s) => s.txns)
  const businessName = useStore((s) => s.businessName)
  const removeTxn = useStore((s) => s.removeTxn)
  const canEditClients = useCan('clients.edit')
  const canPost = useCan('transactions.post')
  const canDeleteTxn = useCan('transactions.delete')
  const assigneeName = useUserNames()
  const names = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients])
  const nameOf = (id: string) => names.get(id) ?? 'Unknown client'
  const firstDate = earliestDate(txns, clients.reduce((min, c) => (c.createdAt < min ? c.createdAt : min), today()))

  const [view, setView] = useLocalState<View>('clients.view', 'balances')
  const fyStartMonth = useSettings((s) => s.fyStartMonth)
  const [period, setPeriod] = useState<Period>(() => periodPresets(firstDate, fyStartMonth)[3].period)
  const [query, setQuery] = useState('')
  const [clientFilter, setClientId] = useState('all')
  // Default to every client: inactive and archived clients can still hold client money.
  const [status, setStatus] = useState<ClientStatus | 'all'>('all')
  const [debitOnly, setDebitOnly] = useState(false)
  const [type, setType] = useLocalState<TypeFilter>('clients.type', 'all')
  const [storedMode, setMode] = useLocalState<GroupMode>('clients.group', 'none')
  const [storedSort, setTxnSort] = useLocalState<Sort<TxnSort>>('clients.txnSort', { key: 'date', dir: 'desc' })
  const [balanceSort, setBalanceSort] = useLocalState<Sort<BalanceSort>>('clients.balanceSort', { key: 'name', dir: 'asc' })
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState(PAGE)
  const [printing, setPrinting] = useState(false)
  const [dialog, setDialog] = useState<'add' | 'import' | 'columns' | null>(null)

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

  // Per-client statements drive balances, the debit filter and client-group closings.
  const perClient = useMemo(() => {
    const byClient = groupBy(txns, (t) => t.clientId)
    return new Map(clients.map((c) => [c.id, statement(byClient.get(c.id) ?? [], period.from, period.to)]))
  }, [clients, txns, period])
  const inScope = (id: string) =>
    (clientId === 'all' || id === clientId) && (!!fixedClientId || status === 'all' || statuses.get(id) === status) && (!debitOnly || (perClient.get(id)?.closing ?? 0) < 0)

  // Accounting scope = client filters + period. Search and type only narrow what's listed.
  const scoped = useMemo(() => txns.filter((t) => inScope(t.clientId)), [txns, clientId, debitOnly, perClient, status, statuses]) // eslint-disable-line react-hooks/exhaustive-deps
  const summary = useMemo(() => statement(scoped, period.from, period.to), [scoped, period])

  /* ---------- Transactions view ---------- */

  // A running balance only means something over the full, chronological ledger.
  const showBalance = txnSort.key === 'date' && type === 'all' && !q
  const balances = useMemo(() => {
    const scopes = mode === 'client' ? [...groupBy(scoped, (t) => t.clientId).values()] : [scoped]
    return new Map(scopes.flatMap((list) => statement(list, period.from, period.to).lines.map((l) => [l.id, l.balance] as const)))
  }, [scoped, period, mode])

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
      showBalance ? balances.get(list.reduce((last, l) => ((chrono.get(l.id) ?? 0) > (chrono.get(last.id) ?? 0) ? l : last)).id) : undefined
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
          {fixedClientId && canDeleteTxn && (
            <button
              type="button"
              onClick={() => removeTxn(t.id)}
              className="ml-auto shrink-0 rounded p-1 text-zinc-400 transition hover:text-red-600 focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 print:hidden"
              aria-label={`Delete ledger entry ${t.note || (t.kind === 'in' ? 'Receipt' : 'Payment')}, ${shortDate(t.date)}`}
            >
              <Icon name="trash" className="size-3.5" />
            </button>
          )}
        </span>
      ),
      text: (t) => t.note,
    },
    { id: 'type', label: 'Type', width: 100, hidden: true, cell: (t) => (t.kind === 'in' ? 'Receipt' : 'Payment'), text: (t) => (t.kind === 'in' ? 'Receipt' : 'Payment') },
    { id: 'receipts', label: 'Receipts', width: 140, align: 'right', sortKey: 'amount', cell: (t) => (t.kind === 'in' ? <span className="text-in">{formatMoney(t.amount)}</span> : ''), text: (t) => (t.kind === 'in' ? plainAmount(t.amount) : '') },
    { id: 'payments', label: 'Payments', width: 140, align: 'right', sortKey: 'amount', cell: (t) => (t.kind === 'out' ? formatMoney(t.amount) : ''), text: (t) => (t.kind === 'out' ? plainAmount(t.amount) : '') },
    { id: 'balance', label: 'Balance', width: 150, align: 'right', cell: (t) => <span className="font-medium">{money(balances.get(t.id) ?? 0)}</span>, text: (t) => plainAmount(balances.get(t.id) ?? 0) },
  ]

  /* ---------- Balances view ---------- */

  const balanceRows = useMemo((): BalanceRow[] => {
    const last = new Map<string, string>()
    for (const t of txns) if (t.date <= period.to && (last.get(t.clientId) ?? '') < t.date) last.set(t.clientId, t.date)
    const dir = balanceSort.dir === 'asc' ? 1 : -1
    return clients
      .filter((c) => inScope(c.id) && (!q || `${c.name} ${c.contact} ${c.email} ${c.registrationNo}`.toLowerCase().includes(q)))
      .map((c) => ({ client: c, soa: perClient.get(c.id)!, last: last.get(c.id) ?? '' }))
      .sort((a, b) => {
        const by = {
          name: a.client.name.localeCompare(b.client.name),
          opening: a.soa.opening - b.soa.opening,
          in: a.soa.receipts - b.soa.receipts,
          out: a.soa.payments - b.soa.payments,
          closing: a.soa.closing - b.soa.closing,
          count: a.soa.lines.length - b.soa.lines.length,
          last: a.last.localeCompare(b.last),
        }[balanceSort.key]
        return by * dir || a.client.name.localeCompare(b.client.name)
      })
  }, [clients, txns, perClient, q, balanceSort, period, clientId, debitOnly, status]) // eslint-disable-line react-hooks/exhaustive-deps

  const balanceColumns: Column<BalanceRow, BalanceSort>[] = [
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
    { id: 'industry', label: 'Industry', width: 170, hidden: true, cell: (r) => r.client.industry || '—', text: (r) => r.client.industry },
    { id: 'opening', label: 'Opening balance', width: 150, align: 'right', sortKey: 'opening', cell: (r) => money(r.soa.opening), text: (r) => plainAmount(r.soa.opening) },
    { id: 'receipts', label: 'Receipts', width: 140, align: 'right', sortKey: 'in', cell: (r) => <span className="text-in">{formatMoney(r.soa.receipts)}</span>, text: (r) => plainAmount(r.soa.receipts) },
    { id: 'payments', label: 'Payments', width: 140, align: 'right', sortKey: 'out', cell: (r) => formatMoney(r.soa.payments), text: (r) => plainAmount(r.soa.payments) },
    { id: 'closing', label: 'Closing balance', width: 150, align: 'right', sortKey: 'closing', cell: (r) => <span className="font-semibold">{money(r.soa.closing)}</span>, text: (r) => plainAmount(r.soa.closing) },
    { id: 'count', label: 'Transactions', width: 120, align: 'right', sortKey: 'count', hidden: true, cell: (r) => r.soa.lines.length, text: (r) => String(r.soa.lines.length) },
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

  const filtersActive = !!q || clientFilter !== 'all' || status !== 'all' || debitOnly || (isTxns && type !== 'all')
  const clearFilters = () => {
    setQuery('')
    setClientId('all')
    setStatus('all')
    setDebitOnly(false)
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

  const exportCsv = () => {
    const stamp = `${period.from}_${period.to}`
    const who = fixedClientId ? `_${nameOf(fixedClientId).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` : ''
    if (isTxns) downloadCsv(`client-ledger${who}_${stamp}.csv`, [txnVisible.map((c) => c.label), ...txnRows.map((r) => txnVisible.map((c) => c.text(r)))])
    else downloadCsv(`client-balances_${stamp}.csv`, [balanceVisible.map((c) => c.label), ...balanceRows.map((r) => balanceVisible.map((c) => c.text(r)))])
  }

  const filterNote = [
    clientFilter !== 'all' && nameOf(clientFilter),
    status !== 'all' && `${STATUS_LABEL[status].toLowerCase()} clients`,
    debitOnly && 'debit balances only',
    isTxns && type !== 'all' && (type === 'in' ? 'receipts only' : 'payments only'),
    q && `search “${query.trim()}”`,
    isTxns && mode !== 'none' && `grouped by ${mode}`,
  ].filter(Boolean)

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
      receipts: <span className="text-in">{formatMoney(g.receipts)}</span>,
      payments: formatMoney(g.payments),
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
    receipts: <span className="text-in">{formatMoney(totals(txnRows).in)}</span>,
    payments: formatMoney(totals(txnRows).out),
    balance: money(summary.closing),
  }
  const balanceTotals = balanceRows.reduce(
    (acc, r) => ({ opening: acc.opening + r.soa.opening, receipts: acc.receipts + r.soa.receipts, payments: acc.payments + r.soa.payments, closing: acc.closing + r.soa.closing, count: acc.count + r.soa.lines.length }),
    { opening: 0, receipts: 0, payments: 0, closing: 0, count: 0 },
  )
  const balanceFooter: Record<string, ReactNode> = {
    opening: money(balanceTotals.opening),
    receipts: <span className="text-in">{formatMoney(balanceTotals.receipts)}</span>,
    payments: formatMoney(balanceTotals.payments),
    closing: money(balanceTotals.closing),
    count: balanceTotals.count,
  }

  const rowsCount = isTxns ? txnRows.length : balanceRows.length

  return (
    <div className="print-landscape grid grid-cols-1 gap-4">
      {/* Print-only heading: what this sheet is, for whom, and which filters produced it. */}
      <header className="hidden border-b-2 border-zinc-900 pb-3 print:block">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-lg font-semibold">{businessName}</p>
            <h1 className="text-xl font-semibold">{isTxns ? 'Client ledger' : 'Client balances'}{fixedClientId && ` — ${nameOf(fixedClientId)}`}</h1>
          </div>
          <div className="text-right text-sm text-zinc-600">
            <p>Period {shortDate(period.from)} – {shortDate(period.to)}</p>
            <p>Printed {shortDate(today())} · Currency MYR (RM)</p>
          </div>
        </div>
        {filterNote.length > 0 && <p className="mt-1 text-sm text-zinc-600">Filtered: {filterNote.join(' · ')}</p>}
      </header>

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4 print:grid-cols-4">
        {(
          [
            ['Opening balance', summary.opening, `as at ${shortDate(period.from)}`],
            ['Total receipts', summary.receipts, `${summary.lines.filter((l) => l.kind === 'in').length} receipts`],
            ['Total payments', summary.payments, `${summary.lines.filter((l) => l.kind === 'out').length} payments`],
            ['Closing balance', summary.closing, `as at ${shortDate(period.to)}`],
          ] as const
        ).map(([label, value, sub]) => (
          <div key={label} className={`${card} p-5 print:p-3`}>
            <dt className="text-sm text-zinc-500">{label}</dt>
            <dd className={`mt-2 text-lg font-semibold tracking-tight tabular-nums sm:text-2xl print:mt-1 print:text-base ${neg(value)}`}>{formatMoney(value)}</dd>
            <dd className="mt-1 text-sm text-zinc-500">{sub}</dd>
          </div>
        ))}
      </dl>

      <div className={`${card} grid gap-3 p-4 print:hidden`}>
        <div className="flex flex-wrap items-center gap-2">
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
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {!fixedClientId && canPost && (
              <button type="button" className={btn.ghost} onClick={() => setDialog('import')}>
                <Icon name="upload" /> Import
              </button>
            )}
            <button type="button" className={btn.ghost} onClick={exportCsv} disabled={!rowsCount}>
              <Icon name="download" /> Export
            </button>
            <button type="button" className={btn.ghost} onClick={() => print()} disabled={!rowsCount}>
              <Icon name="printer" /> Print
            </button>
            {!fixedClientId && canEditClients && (
              <button type="button" className={btn.primary} onClick={() => setDialog('add')}>
                <Icon name="plus" /> Add client
              </button>
            )}
          </div>
        </div>
        <PeriodPicker
          period={period}
          onChange={(p) => {
            setPeriod(p)
            resetPaging()
          }}
          firstDate={firstDate}
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                resetPaging()
              }}
              placeholder={isTxns ? 'Search description or client' : 'Search name, contact or email'}
              aria-label="Search"
              className={`${input} py-1.5 pl-9`}
            />
          </div>
          {!fixedClientId && (
            <>
              <select value={clientFilter} onChange={(e) => setClientId(e.target.value)} aria-label="Client" className={select}>
                <option value="all">All clients</option>
                {[...clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select value={status} onChange={(e) => setStatus(e.target.value as ClientStatus | 'all')} aria-label="Status" className={select}>
                {CLIENT_STATUSES.map((st) => (
                  <option key={st} value={st}>{STATUS_LABEL[st]}</option>
                ))}
                <option value="all">All statuses</option>
              </select>
            </>
          )}
          {!fixedClientId && <button
            type="button"
            aria-pressed={debitOnly}
            onClick={() => setDebitOnly(!debitOnly)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${debitOnly ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300' : 'border-zinc-200 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300'}`}
          >
            Debit balances only
          </button>}
          {isTxns && (
            <>
              <Segmented<TypeFilter> label="Transaction type" value={type} onChange={setType} options={[['all', 'All'], ['in', 'Receipts'], ['out', 'Payments']]} />
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
        </div>
      </div>

      <div className={`${card} overflow-hidden print:overflow-visible print:rounded-none print:border-0`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-100 px-5 py-3 text-sm dark:border-zinc-800 print:hidden">
          <span className="font-medium">{isTxns ? `${txnRows.length} transactions` : `${balanceRows.length} clients`}</span>
          <span className="text-zinc-500">{shortDate(period.from)} – {shortDate(period.to)}</span>
          {isTxns && !showBalance && <span className="text-xs text-zinc-400">Running balance shows when sorted by date with no search or type filter.</span>}
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

        {rowsCount ? (
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
            <Empty text={filtersActive ? 'Nothing matches these filters.' : isTxns ? 'No transactions in this period.' : 'No clients yet. Add a client or import transactions.'} />
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
    </div>
  )
}
