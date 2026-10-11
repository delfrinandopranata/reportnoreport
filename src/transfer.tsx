import { useState } from 'react'
import { readImport, toCsv, today, type ImportRow } from './ledger'
import { useMoney } from './data/money'
import { useSession } from './data/session'
import { useImport, type Attachment, type ImportPayloadRow } from './data/queries'
import { DropZone } from './attachments/Attachments'
import { btn, Dialog, Icon } from './ui'
import { createZip } from './zip'

/** BOM so Excel opens UTF-8 (e.g. client names with accents) correctly. */
export function downloadCsv(fileName: string, rows: string[][]) {
  const url = URL.createObjectURL(new Blob([`﻿${toCsv(rows)}`], { type: 'text/csv;charset=utf-8' }))
  Object.assign(document.createElement('a'), { href: url, download: fileName }).click()
  URL.revokeObjectURL(url)
}

/** CSV plus every attachment's file, bundled as one ZIP. Duplicate file names (two attachments
 * both called "receipt.pdf") are disambiguated with a numeric suffix so neither is overwritten. */
export async function downloadZip(zipFileName: string, csvFileName: string, csvRows: string[][], attachments: { attachment: Attachment; data: Blob }[]) {
  const files = [{ name: csvFileName, data: new TextEncoder().encode(`﻿${toCsv(csvRows)}`) }]
  const seen = new Map<string, number>()
  for (const { attachment, data } of attachments) {
    const count = (seen.get(attachment.originalName) ?? 0) + 1
    seen.set(attachment.originalName, count)
    const name = count === 1 ? attachment.originalName : attachment.originalName.replace(/(\.[^.]*)?$/, (ext) => `-${count}${ext}`)
    files.push({ name: `attachments/${name}`, data: new Uint8Array(await data.arrayBuffer()) })
  }
  const url = URL.createObjectURL(createZip(files))
  Object.assign(document.createElement('a'), { href: url, download: zipFileName }).click()
  URL.revokeObjectURL(url)
}

const TEMPLATE = [
  ['Date', 'Client', 'Description', 'Receipts', 'Payments'],
  [today(), 'Example Client Sdn Bhd', 'Retainer received', '1500.00', ''],
  [today(), 'Example Client Sdn Bhd', 'Filing fees', '', '120.00'],
]

type Preview = { transactions: number; clients: number; duplicates: number }
type Plan = { rows: ImportRow[]; errors: string[]; fileName: string; preview: Preview | null; serverError: string }

const toPayload = (rows: ImportRow[]): ImportPayloadRow[] =>
  rows.map((r) => ({ line: r.line, client_name: r.clientName, bank_account: r.bankAccount || null, kind: r.kind === 'in' ? 'receipt' : 'payment', amount_minor: r.amount, date: r.date, description: r.note }))

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const money = useMoney()
  const { firm } = useSession()
  const importRows = useImport()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [done, setDone] = useState('')

  const close = () => {
    setPlan(null)
    setDone('')
    onClose()
  }

  const onFile = async (file: File) => {
    setDone('')
    const { rows, errors } = readImport(await file.text(), firm.currency)
    const base = { rows, errors, fileName: file.name }
    if (!rows.length) return setPlan({ ...base, preview: null, serverError: '' })
    try {
      setPlan({ ...base, preview: await importRows.mutateAsync({ rows: toPayload(rows), dryRun: true }), serverError: '' })
    } catch (err) {
      setPlan({ ...base, preview: null, serverError: (err as Error).message })
    }
  }

  const confirm = async () => {
    if (!plan) return
    try {
      const r = await importRows.mutateAsync({ rows: toPayload(plan.rows), dryRun: false })
      const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
      setDone(`Imported ${plural(r.transactions, 'transaction')}${r.clients ? ` and added ${plural(r.clients, 'new client')}` : ''}.`)
      setPlan(null)
    } catch (err) {
      setPlan({ ...plan, serverError: (err as Error).message })
    }
  }

  const receipts = plan?.rows.filter((r) => r.kind === 'in').reduce((sum, r) => sum + r.amount, 0) ?? 0
  const payments = plan?.rows.filter((r) => r.kind === 'out').reduce((sum, r) => sum + r.amount, 0) ?? 0

  return (
    <Dialog open={open} onClose={close} title="Import transactions">
      <div className="grid gap-4">
        <p className="rnr-muted">
          Upload a CSV with columns <b>Date</b>, <b>Client</b>, <b>Description</b>, optional <b>Bank account</b> and <b>Receipts</b> / <b>Payments</b> (or <b>Type</b> + <b>Amount</b>). Dates as YYYY-MM-DD or DD/MM/YYYY. A file exported from this page imports as-is.
        </p>
        <DropZone accept=".csv,text/csv" hint="CSV, in the columns above" busy={importRows.isPending && !plan} busyLabel="Checking file…" chooseLabel="Choose CSV file" inputLabel="Choose a CSV file to import" onFile={onFile} autoFocus />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn.ghost} onClick={() => downloadCsv('transactions-template.csv', TEMPLATE)}>
            <Icon name="download" /> Download template
          </button>
        </div>

        {importRows.isPending && !plan && <p className="rnr-muted" role="status">Checking file…</p>}
        {done && <p className="rnr-note" data-tone="ok" role="status"><Icon name="check" /><span>{done}</span></p>}

        {plan && (
          <div className="rnr-card grid gap-3">
            <p className="font-medium">{plan.fileName}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
              <dt className="rnr-muted">Transactions to import</dt>
              <dd className="rnr-mono text-right font-medium">{plan.preview?.transactions ?? 0}</dd>
              <dt className="rnr-muted">Total receipts</dt>
              <dd className="rnr-mono text-right">{money.format(receipts)}</dd>
              <dt className="rnr-muted">Total payments</dt>
              <dd className="rnr-mono text-right">{money.format(payments)}</dd>
              {(plan.preview?.duplicates ?? 0) > 0 && (
                <>
                  <dt className="rnr-muted">Already on the ledger (skipped)</dt>
                  <dd className="rnr-mono text-right">{plan.preview?.duplicates}</dd>
                </>
              )}
            </dl>
            {(plan.preview?.clients ?? 0) > 0 && (
              <p className="font-medium">{plan.preview?.clients} new client{plan.preview?.clients === 1 ? '' : 's'} will be added.</p>
            )}
            {plan.serverError && <p className="rnr-note" data-tone="down" role="alert"><Icon name="alert" /><span>{plan.serverError}</span></p>}
            {plan.errors.length > 0 && (
              <div className="rnr-note" data-tone="down" role="alert">
                <Icon name="alert" />
                <div>
                <p className="font-medium">{plan.errors.length} row{plan.errors.length > 1 ? 's' : ''} can’t be imported and will be skipped:</p>
                <ul className="mt-1 list-disc pl-5">
                  {plan.errors.slice(0, 5).map((e) => <li key={e}>{e}</li>)}
                  {plan.errors.length > 5 && <li>…and {plan.errors.length - 5} more.</li>}
                </ul>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className={btn.ghost} onClick={() => setPlan(null)} disabled={importRows.isPending}>Cancel</button>
              <button type="button" className={btn.primary} onClick={confirm} disabled={!plan.preview?.transactions || importRows.isPending}>
                {importRows.isPending ? 'Importing…' : `Import ${plan.preview?.transactions ?? 0} transaction${plan.preview?.transactions === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
