import { useState, type ChangeEvent, type DragEvent } from 'react'
import type { Attachment } from '../data/mappers'
import { useAttachments, useAttachmentUrl, useDeleteAttachment, useUploadAttachment } from '../data/queries'
import { useGate } from '../clients/shared'
import { btn, Dialog, Icon } from '../ui'
import { compressImage } from './compress'

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
const ACCEPTED_LABEL = 'PNG, JPG, WebP or PDF'

/** Drop target around a real file input: the "Choose" button stays the keyboard stop, a drop is a convenience. */
export function DropZone({ accept, hint, busy, busyLabel, chooseLabel, inputLabel, onFile, autoFocus }: { accept: string; hint: string; busy?: boolean; busyLabel: string; chooseLabel: string; inputLabel: string; onFile: (file: File) => void; autoFocus?: boolean }) {
  const [over, setOver] = useState(false)
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    const file = e.dataTransfer.files[0]
    if (file && !busy) onFile(file)
  }
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onFile(file)
  }
  return (
    <div
      className="rnr-dropzone"
      data-over={over || undefined}
      aria-busy={busy || undefined}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <Icon name="upload" />
      <p><span className="rnr-drop-hint">{over ? 'Release to upload' : 'Drag a file here or'}</span></p>
      <label className="rnr-btn rnr-btn-secondary cursor-pointer">
        {busy ? busyLabel : chooseLabel}
        <input type="file" accept={accept} aria-label={inputLabel} onChange={onChange} disabled={busy} className="rnr-sr-only" data-autofocus={autoFocus || undefined} />
      </label>
      <p className="rnr-muted text-xs">{hint}</p>
    </div>
  )
}

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
    <tr>
      <td className="max-w-0 truncate">
        {url ? (
          <a href={url} download={attachment.originalName} className="rnr-link font-medium">
            {attachment.originalName}
          </a>
        ) : (
          <span className="rnr-muted">{attachment.originalName}</span>
        )}
      </td>
      <td className="num whitespace-nowrap">{formatSize(attachment.sizeBytes)}</td>
      <td className="w-px">
        {canDelete && (
          <button type="button" className="rnr-icon-btn" onClick={() => setConfirmDelete(true)} disabled={remove.isPending} aria-label={`Delete ${attachment.originalName}`}>
            <Icon name="trash" />
          </button>
        )}
        <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete attachment">
          <div className="grid gap-4">
            <p>Delete {attachment.originalName}? This can't be undone.</p>
            {remove.error && <p className="rnr-error" role="alert"><Icon name="alert" />{remove.error.message}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={btn.ghost} onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button type="button" className={btn.danger} disabled={remove.isPending} onClick={onConfirm}>
                {remove.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </Dialog>
      </td>
    </tr>
  )
}

/** Attachments for one transaction or one client — pass exactly one of the two ids. */
export function Attachments({ transactionId, clientId }: { transactionId?: string; clientId?: string }) {
  const { data: attachments = [], isPending } = useAttachments({ transactionId, clientId })
  const upload = useUploadAttachment()
  const gate = useGate('clients.edit', 'add attachments')
  const [error, setError] = useState('')

  const onFile = async (file: File) => {
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
    <div className="grid gap-3">
      {isPending ? (
        <p className="rnr-muted" role="status">Loading attachments…</p>
      ) : attachments.length === 0 ? (
        <p className="rnr-muted">No attachments yet.</p>
      ) : (
        <div className="rnr-card rnr-table-card">
          <table className="rnr-table">
            <caption className="rnr-sr-only">Attachments</caption>
            <thead><tr><th scope="col">File</th><th scope="col" className="num">Size</th><th scope="col"><span className="rnr-sr-only">Actions</span></th></tr></thead>
            <tbody>{attachments.map((a) => <AttachmentRow key={a.id} attachment={a} canDelete={gate.ok} />)}</tbody>
          </table>
        </div>
      )}
      {gate.ok ? (
        <DropZone accept={ACCEPTED_TYPES.join(',')} hint={`${ACCEPTED_LABEL}, up to ${formatSize(MAX_BYTES)}`} busy={upload.isPending} busyLabel="Uploading…" chooseLabel="Add attachment" inputLabel="Choose a file to attach" onFile={onFile} />
      ) : (
        gate.title && <p className="rnr-muted text-xs">{gate.title}</p>
      )}
      <p className="rnr-sr-only" role="status">{upload.isPending ? 'Uploading…' : ''}</p>
      {error && <p className="rnr-error" role="alert"><Icon name="alert" />{error}</p>}
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
        className="rnr-icon-btn print:hidden"
        aria-label={`Attachments (${attachments.length})`}
        title="Attachments"
      >
        <Icon name="file" />
        {attachments.length > 0 && <span className="rnr-mono text-[10px]">{attachments.length}</span>}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Attachments">
        <Attachments transactionId={transactionId} />
      </Dialog>
    </>
  )
}
