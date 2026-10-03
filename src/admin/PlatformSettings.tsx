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
    <div className="max-w-2xl space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Field label="Maximum self-serve firms">
              <input
                type="number"
                min="0"
                max="1000"
                value={formData.firm_cap ?? ''}
                onChange={(e) => setFormData({ ...formData, firm_cap: e.target.value ? parseInt(e.target.value) : undefined })}
                className={input}
                aria-describedby="firm-cap-help"
              />
              <p id="firm-cap-help" className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                Maximum number of firms allowed to self-serve sign up
              </p>
            </Field>
          </div>

          <div>
            <Field label="Default trial days">
              <input
                type="number"
                min="1"
                max="365"
                value={formData.trial_days ?? ''}
                onChange={(e) => setFormData({ ...formData, trial_days: e.target.value ? parseInt(e.target.value) : undefined })}
                className={input}
                aria-describedby="trial-days-help"
              />
              <p id="trial-days-help" className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                Number of days each new trial firm gets
              </p>
            </Field>
          </div>

          {settings.data && (
            <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900 dark:bg-blue-950 dark:text-blue-100">
              <div className="font-medium">Self-serve usage</div>
              <div className="mt-1">
                <strong>{settings.data.self_serve_firms}</strong> of <strong>{settings.data.firm_cap}</strong> places used
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-200" role="alert">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-600 dark:border-green-900 dark:bg-green-950 dark:text-green-200" role="status">
              Settings saved.
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="submit"
              className={btn.primary}
              disabled={update.isPending}
              aria-busy={update.isPending}
            >
              {update.isPending ? 'Saving…' : success ? 'Saved' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
