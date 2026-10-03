import { useState, useEffect } from 'react'
import { btn, Icon } from '../ui'
import { FirmsTable } from './FirmsTable'
import { CreateFirmDialog } from './CreateFirmDialog'
import { SupportView } from './SupportView'
import { PlatformSettings } from './PlatformSettings'
import { Waitlist } from './Waitlist'

type View = 'firms' | 'settings' | 'waitlist' | 'support'
type Route = { view: View; firmId: string | null; firmName?: string; currency?: string }

const readRoute = (): Route => {
  const hash = location.hash.slice(1)
  if (hash.startsWith('admin/support/')) {
    const parts = hash.split('/')
    const firmId = parts[2]
    return { view: 'support', firmId }
  }
  if (hash === 'admin/settings') return { view: 'settings', firmId: null }
  if (hash === 'admin/waitlist') return { view: 'waitlist', firmId: null }
  return { view: 'firms', firmId: null }
}

const setRoute = (route: Route) => {
  if (route.view === 'support' && route.firmId) {
    location.hash = `#admin/support/${route.firmId}`
  } else if (route.view === 'settings') {
    location.hash = '#admin/settings'
  } else if (route.view === 'waitlist') {
    location.hash = '#admin/waitlist'
  } else {
    location.hash = '#admin'
  }
}

export function AdminConsole({ name, onSignOut }: { name: string; onSignOut: () => void }) {
  const [route, setRouteState] = useState(readRoute)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [firmForSupport, setFirmForSupport] = useState<{ id: string; name: string; currency: string } | null>(null)

  useEffect(() => {
    const onHash = () => {
      const newRoute = readRoute()
      setRouteState(newRoute)
    }
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  const navigate = (view: View, firmId: string | null = null, firmName?: string, currency?: string) => {
    setRoute({ view, firmId, firmName, currency })
  }

  const showSupport = (firmId: string, firmName: string, currency: string) => {
    setFirmForSupport({ id: firmId, name: firmName, currency })
    navigate('support', firmId, firmName, currency)
  }

  return (
    <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
                <Icon name="wallet" className="size-6" />
              </span>
              <div>
                <h1 className="text-lg font-semibold">Platform admin</h1>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Signed in as {name}</p>
              </div>
            </div>
            <button onClick={onSignOut} className={btn.ghost}>
              <Icon name="logout" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex gap-8">
            {[
              { label: 'Firms', view: 'firms' as const },
              { label: 'Settings', view: 'settings' as const },
              { label: 'Waitlist', view: 'waitlist' as const },
            ].map((item) => (
              <button
                key={item.view}
                onClick={() => navigate(item.view)}
                className={`px-0 py-3 text-sm font-medium transition border-b-2 ${
                  route.view === item.view
                    ? 'border-zinc-900 text-zinc-900 dark:border-white dark:text-white'
                    : 'border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-6 py-8">
        {route.view === 'firms' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Firms</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Manage all firms on the platform</p>
              </div>
              <button onClick={() => setShowCreateDialog(true)} className={`${btn.primary} gap-2`}>
                <Icon name="plus" className="size-4" />
                Create firm
              </button>
            </div>
            <FirmsTable onSupportView={showSupport} />
          </div>
        )}

        {route.view === 'settings' && (
          <div>
            <h2 className="mb-6 text-2xl font-bold">Platform settings</h2>
            <PlatformSettings />
          </div>
        )}

        {route.view === 'waitlist' && (
          <div>
            <h2 className="mb-6 text-2xl font-bold">Waitlist</h2>
            <Waitlist />
          </div>
        )}

        {route.view === 'support' && firmForSupport && (
          <div className="space-y-4">
            <button
              onClick={() => navigate('firms')}
              className={`${btn.ghost} gap-1 mb-2`}
            >
              <Icon name="back" className="size-4" />
              Back to firms
            </button>
            <h2 className="text-2xl font-bold">{firmForSupport.name}</h2>
            <SupportView
              firmId={firmForSupport.id}
              firmName={firmForSupport.name}
              currency={firmForSupport.currency}
            />
          </div>
        )}
      </main>

      <CreateFirmDialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} />
    </div>
  )
}
