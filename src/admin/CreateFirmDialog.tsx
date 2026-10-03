import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog, Field, btn, input } from '../ui'
import { callAdmin, type AdminCreateFirmResponse } from './api'

const CURRENCIES = ['MYR', 'SGD', 'USD']

export function CreateFirmDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [formData, setFormData] = useState({
    name: '',
    currency: 'MYR',
    ownerName: '',
    ownerEmail: '',
    start: 'trial' as 'trial' | 'complimentary',
  })
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: async () => {
      setError(null)
      try {
        await callAdmin('create_firm', {
          name: formData.name,
          currency: formData.currency,
          owner_name: formData.ownerName,
          owner_email: formData.ownerEmail,
          start: formData.start,
        }) as unknown as AdminCreateFirmResponse
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create firm'
        setError(msg)
        throw err
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'firms'] })
      setFormData({ name: '', currency: 'MYR', ownerName: '', ownerEmail: '', start: 'trial' })
      onClose()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim() || !formData.ownerName.trim() || !formData.ownerEmail.trim()) {
      setError('Please fill in all fields')
      return
    }
    create.mutate()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Create firm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Firm name *">
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Acme Corp Sdn Bhd"
            className={input}
            data-autofocus
            required
          />
        </Field>

        <Field label="Currency *">
          <select
            value={formData.currency}
            onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
            className={input}
            required
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Owner name *">
          <input
            type="text"
            value={formData.ownerName}
            onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
            placeholder="e.g., Alice Wong"
            className={input}
            required
          />
        </Field>

        <Field label="Owner email *">
          <input
            type="email"
            value={formData.ownerEmail}
            onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
            placeholder="alice@example.com"
            className={input}
            required
          />
        </Field>

        <Field label="Start as">
          <select
            value={formData.start}
            onChange={(e) => setFormData({ ...formData, start: e.target.value as 'trial' | 'complimentary' })}
            className={input}
          >
            <option value="trial">Trial (14 days)</option>
            <option value="complimentary">Complimentary</option>
          </select>
        </Field>

        <div className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          The owner gets an email to set their password. The link is valid for 24 hours.
        </div>

        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-200">{error}</div>}

        <div className="flex gap-3 pt-4">
          <button type="button" onClick={onClose} className={btn.ghost}>
            Cancel
          </button>
          <button type="submit" className={btn.primary} disabled={create.isPending}>
            {create.isPending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
