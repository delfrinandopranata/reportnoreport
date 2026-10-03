import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Field, btn, input } from '../ui'
import { callAdmin, type AdminGetSettingsResponse } from './api'

export function PlatformSettings() {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [formData, setFormData] = useState<{ firm_cap?: number; trial_days?: number }>({})

  const settings = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => {
      const data = (await callAdmin('get_settings', {})) as AdminGetSettingsResponse
      setFormData({ firm_cap: data.firm_cap, trial_days: data.trial_days })
      return data
    },
  })

  const update = useMutation({
    mutationFn: async (data: { firm_cap?: number; trial_days?: number }) => {
      setError(null)
      setSuccess(false)
      try {
        await callAdmin('set_settings', data)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save settings'
        setError(msg)
        throw err
      }
    },
    onSuccess: () => {
      setSuccess(true)
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] })
      setTimeout(() => setSuccess(false), 3000)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (typeof formData.firm_cap === 'number' || typeof formData.trial_days === 'number') {
      update.mutate(formData)
    }
  }

  if (settings.isPending) {
    return <div className="text-center text-sm text-zinc-600 dark:text-zinc-400">Loading settings...</div>
  }

  if (settings.isError) {
    return <div className="text-center text-sm text-red-600 dark:text-red-400">Failed to load settings</div>
  }

  return (
    <div className="max-w-md space-y-4">
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Maximum self-serve firms">
            <input
              type="number"
              min="0"
              max="1000"
              value={formData.firm_cap ?? ''}
              onChange={(e) => setFormData({ ...formData, firm_cap: e.target.value ? parseInt(e.target.value) : undefined })}
              className={input}
            />
          </Field>

          <Field label="Default trial days">
            <input
              type="number"
              min="1"
              max="365"
              value={formData.trial_days ?? ''}
              onChange={(e) => setFormData({ ...formData, trial_days: e.target.value ? parseInt(e.target.value) : undefined })}
              className={input}
            />
          </Field>

          {settings.data && (
            <div className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              <strong>{settings.data.self_serve_firms}</strong> of <strong>{settings.data.firm_cap}</strong> self-serve places used.
            </div>
          )}

          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-200">{error}</div>}

          {success && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-600 dark:bg-green-950 dark:text-green-200">Settings saved.</div>}

          <div className="flex gap-3 pt-4">
            <button type="submit" className={btn.primary} disabled={update.isPending}>
              {update.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
