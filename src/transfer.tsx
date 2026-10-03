import { useState, type ChangeEvent } from 'react'
import { fillClient, formatMoney, planImport, readImport, toCsv, today, type Client, type Txn } from './ledger'
import { useStore } from './store'
import { btn, Dialog, Icon } from './ui'

/** BOM so Excel opens UTF-8 (e.g. client names with accents) correctly. */
export function downloadCsv(fileName: string, rows: string[][]) {
  const url = URL.createObjectURL(new Blob([`﻿${toCsv(rows)}`], { type: 'text/csv;charset=utf-8' }))
  Object.assign(document.createElement('a'), { href: url, download: fileName }).click()
  URL.revokeObjectURL(url)
}

const TEMPLATE = [
  ['Date', 'Client', 'Description', 'Receipts', 'Payments'],
  [today(), 'Example Client Sdn Bhd', 'Retainer received', '1500.00', ''],
  [today(), 'Example Client Sdn Bhd', 'Filing fees', '', '120.00'],
]

type Plan = ReturnType<typeof planImport> & { errors: string[]; fileName: string }

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const clients = useStore((s) => s.clients)
  const txns = useStore((s) => s.txns)
  const importLedger = useStore((s) => s.importLedger)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [done, setDone] = useState('')

  const close = () => {
    setPlan(null)
    setDone('')
    onClose()
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setDone('')
    const { rows, errors } = readImport(await file.text())
    setPlan({ ...planImport(rows, clients, txns), errors, fileName: file.name })
  }

  const confirm = () => {
    if (!plan) return
    const created: Client[] = plan.newClients.map((name) => fillClient({ id: crypto.randomUUID(), name }))
    const ids = new Map([...clients, ...created].map((c) => [c.name.trim().toLowerCase(), c.id]))
    const added: Txn[] = plan.rows.map((r) => ({
      id: crypto.randomUUID(),
      clientId: ids.get(r.clientName.trim().toLowerCase())!,
      kind: r.kind,
      amount: r.amount,
      date: r.date,
      note: r.note,
    }))
    importLedger(created, added)
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
    setDone(`Imported ${plural(added.length, 'transaction')}${created.length ? ` and added ${plural(created.length, 'new client')}` : ''}. You can undo this.`)
    setPlan(null)
  }

  const receipts = plan?.rows.filter((r) => r.kind === 'in').reduce((sum, r) => sum + r.amount, 0) ?? 0
  const payments = plan?.rows.filter((r) => r.kind === 'out').reduce((sum, r) => sum + r.amount, 0) ?? 0

  return (
    <Dialog open={open} onClose={close} title="Import transactions">
      <div className="grid gap-4 text-sm">
        <p className="text-zinc-600 dark:text-zinc-400">
          Upload a CSV with columns <b>Date</b>, <b>Client</b>, <b>Description</b> and <b>Receipts</b> / <b>Payments</b> (or <b>Type</b> + <b>Amount</b>). Dates as YYYY-MM-DD or DD/MM/YYYY. A file exported from this page imports as-is.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${btn.primary} cursor-pointer`}>
            <Icon name="upload" /> Choose CSV file
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="sr-only" />
          </label>
          <button type="button" className={btn.ghost} onClick={() => downloadCsv('transactions-template.csv', TEMPLATE)}>
            <Icon name="download" /> Download template
          </button>
        </div>

        {done && <p className="rounded-lg bg-emerald-50 p-3 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" role="status">{done}</p>}

        {plan && (
          <div className="grid gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="font-medium">{plan.fileName}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
              <dt className="text-zinc-500">Transactions to import</dt>
              <dd className="text-right font-medium">{plan.rows.length}</dd>
              <dt className="text-zinc-500">Total receipts</dt>
              <dd className="text-right">{formatMoney(receipts)}</dd>
              <dt className="text-zinc-500">Total payments</dt>
              <dd className="text-right">{formatMoney(payments)}</dd>
              {plan.duplicates > 0 && (
                <>
                  <dt className="text-zinc-500">Already on the ledger (skipped)</dt>
                  <dd className="text-right">{plan.duplicates}</dd>
                </>
              )}
            </dl>
            {plan.newClients.length > 0 && (
              <p>
                <span className="font-medium">{plan.newClients.length} new client{plan.newClients.length > 1 ? 's' : ''} will be added:</span>{' '}
                <span className="text-zinc-600 dark:text-zinc-400">{plan.newClients.join(', ')}</span>
              </p>
            )}
            {plan.errors.length > 0 && (
              <div className="rounded-lg bg-red-50 p-3 text-red-800 dark:bg-red-950 dark:text-red-200" role="alert">
                <p className="font-medium">{plan.errors.length} row{plan.errors.length > 1 ? 's' : ''} can’t be imported and will be skipped:</p>
                <ul className="mt-1 list-disc pl-5">
                  {plan.errors.slice(0, 5).map((e) => <li key={e}>{e}</li>)}
                  {plan.errors.length > 5 && <li>…and {plan.errors.length - 5} more.</li>}
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className={btn.ghost} onClick={() => setPlan(null)}>Cancel</button>
              <button type="button" className={btn.primary} onClick={confirm} disabled={!plan.rows.length}>
                Import {plan.rows.length} transaction{plan.rows.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
