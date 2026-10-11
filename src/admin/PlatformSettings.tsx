import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Field, Icon, btn, input } from '../ui'
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
    return <p className="text-center text-ink-2" role="status">Loading settings...</p>
  }

  if (settings.isError) {
    return <div className="rnr-note" data-tone="down" role="alert"><Icon name="alert" className="size-5" /><div>Failed to load settings</div></div>
  }

  return (
    <section className="rnr-folder rnr-folder--panel max-w-2xl" aria-labelledby="platform-limits-h">
      <span className="rnr-folder-tab" id="platform-limits-h">Self-serve limits</span>
      <div className="rnr-folder-body">
        <form onSubmit={handleSubmit} className="grid gap-6">
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
            <span id="firm-cap-help" className="rnr-hint">Maximum number of firms allowed to self-serve sign up</span>
          </Field>

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
            <span id="trial-days-help" className="rnr-hint">Number of days each new trial firm gets</span>
          </Field>

          {settings.data && (
            <div className="rnr-note" data-tone="info">
              <Icon name="info" className="size-5" />
              <div>
                <p className="font-medium">Self-serve usage</p>
                <p><strong>{settings.data.self_serve_firms}</strong> of <strong>{settings.data.firm_cap}</strong> places used</p>
              </div>
            </div>
          )}

          {error && (
            <div className="rnr-note" data-tone="down" role="alert"><Icon name="alert" className="size-5" /><div>{error}</div></div>
          )}

          {success && (
            <div className="rnr-note" data-tone="ok" role="status"><Icon name="check" className="size-5" /><div>Settings saved.</div></div>
          )}

          <div>
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
    </section>
  )
}
