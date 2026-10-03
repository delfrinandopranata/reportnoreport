import { useState, type ChangeEvent } from 'react'
import type { Attachment } from '../data/mappers'
import { useAttachments, useAttachmentUrl, useDeleteAttachment, useUploadAttachment } from '../data/queries'
import { useGate } from '../clients/shared'
import { btn, Dialog, Icon } from '../ui'
import { compressImage } from './compress'

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
const ACCEPTED_LABEL = 'PNG, JPG, WebP or PDF'

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

function AttachmentRow({ attachment, canDelete }: { attachment: Attachment; canDelete: boolean }) {
  const url = useAttachmentUrl(attachment.storagePath)
  const remove = useDeleteAttachment()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const onConfirm = async () => {
    try {
      await remove.mutateAsync(attachment)
      setConfirmDelete(false)
    } catch {
      // shown below via remove.error
    }
  }

  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      {url ? (
        <a
          href={url}
          download={attachment.originalName}
          className="min-w-0 flex-1 truncate font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900 dark:text-white dark:decoration-zinc-600"
        >
          {attachment.originalName}
        </a>
      ) : (
        <span className="min-w-0 flex-1 truncate text-zinc-500">{attachment.originalName}</span>
      )}
      <span className="shrink-0 tabular-nums text-zinc-500">{formatSize(attachment.sizeBytes)}</span>
      {canDelete && (
        <button type="button" className={btn.danger} onClick={() => setConfirmDelete(true)} disabled={remove.isPending} aria-label={`Delete ${attachment.originalName}`}>
          <Icon name="trash" className="size-3.5" />
        </button>
      )}
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete attachment">
        <div className="grid gap-4 text-sm">
          <p>Delete {attachment.originalName}? This can't be undone.</p>
          {remove.error && <p className="text-red-600 dark:text-red-400" role="alert">{remove.error.message}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={btn.ghost} onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg bg-red-700 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-red-800 disabled:opacity-40 dark:bg-red-600 dark:hover:bg-red-500"
              disabled={remove.isPending}
              onClick={onConfirm}
            >
              {remove.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </Dialog>
    </li>
  )
}

/** Attachments for one transaction or one client — pass exactly one of the two ids. */
export function Attachments({ transactionId, clientId }: { transactionId?: string; clientId?: string }) {
  const { data: attachments = [], isPending } = useAttachments({ transactionId, clientId })
  const upload = useUploadAttachment()
  const gate = useGate('clients.edit', 'add attachments')
  const [error, setError] = useState('')

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ACCEPTED_TYPES.includes(file.type)) return setError(`Choose a ${ACCEPTED_LABEL} file.`)
    if (file.size > MAX_BYTES) return setError(`That file is ${formatSize(file.size)}. The limit is ${formatSize(MAX_BYTES)}.`)
    setError('')
    try {
      const toUpload = await compressImage(file)
      await upload.mutateAsync({ file: toUpload, transactionId, clientId })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="grid gap-2">
      {isPending ? (
        <p className="text-sm text-zinc-500">Loading attachments…</p>
      ) : attachments.length === 0 ? (
        <p className="text-sm text-zinc-500">No attachments yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {attachments.map((a) => <AttachmentRow key={a.id} attachment={a} canDelete={gate.ok} />)}
        </ul>
      )}
      {gate.ok ? (
        <label className={`${btn.ghost} w-fit cursor-pointer border border-zinc-200 dark:border-zinc-800`}>
          <Icon name="upload" /> {upload.isPending ? 'Uploading…' : 'Add attachment'}
          <input type="file" accept={ACCEPTED_TYPES.join(',')} onChange={onFile} disabled={upload.isPending} className="sr-only" />
        </label>
      ) : (
        gate.title && <p className="text-xs text-zinc-500">{gate.title}</p>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
    </div>
  )
}

/** Icon button for a transaction row: opens a dialog listing that transaction's attachments. */
export function AttachmentsButton({ transactionId }: { transactionId: string }) {
  const [open, setOpen] = useState(false)
  const { data: attachments = [] } = useAttachments({ transactionId })
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-1 flex shrink-0 items-center gap-0.5 rounded p-1 text-zinc-400 transition hover:text-zinc-900 focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 print:hidden dark:hover:text-white"
        aria-label={`Attachments (${attachments.length})`}
        title="Attachments"
      >
        <Icon name="file" className="size-3.5" />
        {attachments.length > 0 && <span className="text-[10px] tabular-nums">{attachments.length}</span>}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Attachments">
        <Attachments transactionId={transactionId} />
      </Dialog>
    </>
  )
}
