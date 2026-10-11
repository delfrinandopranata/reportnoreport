import { useEffect, useId, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { FALLBACK, friendlyError } from '../ui/errors'
import { BellIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { When } from '../ui/Time'
import { useAction } from '../ui/useAction'
import { useFocusAfterRender } from '../ui/useFocusAfterRender'
import { useNotice } from '../ui/useNotice'
import { announcement, newArrivals } from './arrivals'
import { NOTIFICATION_LIMIT, type Notification, markAllRead, markRead, useNotificationFeed, useNotifications, useUnreadCount } from './api'

const MARK_FAILED = 'We could not mark your notifications as read. Try again.'

export function NotificationBell() {
  const { orgId, orgs, userId } = useOrg()
  useNotificationFeed(orgId, userId)
  const unread = useUnreadCount(orgId, userId)
  const list = useNotifications(orgId, userId)
  const qc = useQueryClient()
  const markAll = useAction()
  const focusLater = useFocusAfterRender()
  // Open state is tied to the person and organisation, so switching either closes the panel without an effect.
  const scope = `${userId}:${orgId}`
  const [openFor, setOpenFor] = useState<string | null>(null)
  const open = openFor === scope
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenFor((cur) => ((typeof v === 'function' ? v(cur === scope) : v) ? scope : null))
  const [error, setError] = useState<string | null>(null)
  const [said, say] = useNotice()
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const seen = useRef<{ key: string; ids: Set<string> | null }>({ key: '', ids: null })
  const panelId = useId()
  const n = unread.data ?? 0
  const orgName = orgs.find((o) => o.id === orgId)?.name ?? 'this organisation'

  useEffect(() => {
    // A different organisation or person starts a fresh, silent seen set.
    if (seen.current.key !== scope) seen.current = { key: scope, ids: null }
    if (!list.data) return
    const r = newArrivals(seen.current.ids, list.data)
    seen.current.ids = r.seen
    const text = announcement(r.arrived)
    if (text) say(text)
  }, [list.data, scope, say])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpenFor(null) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpenFor(null); button.current?.focus() } }
    addEventListener('pointerdown', onDown)
    addEventListener('keydown', onKey)
    return () => { removeEventListener('pointerdown', onDown); removeEventListener('keydown', onKey) }
  }, [open])

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['notifications', userId, orgId] }),
    qc.invalidateQueries({ queryKey: ['notifications-unread', userId, orgId] }),
  ])
  const readOne = async (id: string) => {
    const list = ['notifications', userId, orgId]
    const count = ['notifications-unread', userId, orgId]
    qc.setQueryData<Notification[]>(list, (l) => l?.map((x) => (x.id === id && !x.read_at ? { ...x, read_at: new Date().toISOString() } : x)))
    qc.setQueryData<number>(count, (n) => Math.max(0, (n ?? 1) - 1))
    const { error: e } = await markRead(id)
    if (e) { const m = friendlyError(e); say(m === FALLBACK ? MARK_FAILED : m) } // quiet: the panel has already closed
    void refresh() // on failure this rolls the optimistic read back
  }
  const readAll = () => markAll.run(async () => {
    if (!orgId) return
    const { error: e } = await markAllRead(orgId, userId)
    if (e) { const m = friendlyError(e); setError(m === FALLBACK ? MARK_FAILED : m); return }
    setError(null)
    await refresh()
    focusLater('bell-h') // the focused button unmounts once the count is 0
    say('All notifications marked as read.')
  })

  return (
    <div ref={box} className="sm:relative" onBlur={(e) => { if (open && e.relatedTarget && !box.current?.contains(e.relatedTarget as Node)) setOpen(false) }}>
      <button ref={button} type="button" className="rnr-icon-btn rnr-bell" aria-expanded={open} aria-controls={open ? panelId : undefined}
        aria-label={n ? `Notifications, ${n} unread` : 'Notifications'} onClick={() => { setError(null); setOpen((o) => !o) }}>
        <BellIcon size={20} />
        {n > 0 && <span className="rnr-chip rnr-num" aria-hidden="true">{n > 99 ? '99+' : n}</span>}
      </button>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{said}</p>
      {open && (
        <section id={panelId} aria-labelledby="bell-h" className="rnr-menu rnr-notices">
          <div className="rnr-notices-head">
            <h2 id="bell-h" tabIndex={-1} className="label">Notifications</h2>
            {n > 0 && (
              <button type="button" className="rnr-btn rnr-btn-ghost" aria-busy={markAll.busy} onClick={() => void readAll()}>
                {markAll.busy && <span className="rnr-spin" aria-hidden="true" />}{markAll.busy ? 'Marking…' : 'Mark all as read'}
              </button>
            )}
          </div>
          <p className="rnr-caption rnr-notices-sub">Showing notifications for {orgName}.</p>
          {error && <p className="rnr-error px-3" role="alert">{error}</p>}
          {list.isPending && <div className="px-3"><Skeleton rows={[{ w: '100%', h: 48 }, { w: '100%', h: 48 }, { w: '100%', h: 48 }]} /></div>}
          {list.isError && (
            <div className="flex flex-col items-start gap-2 px-3">
              <p className="rnr-error" role="alert">We could not load your notifications. Check your connection and try again.</p>
              <button type="button" className="rnr-btn rnr-btn-ghost" onClick={() => void list.refetch()}>Try again</button>
            </div>
          )}
          {list.data?.length === 0 && <p className="rnr-muted px-3 py-3">No notifications yet. New tasks and messages for {orgName} appear here.</p>}
          {!!list.data?.length && (
            <ul className="rnr-notices-list">
              {list.data.map((x) => (
                <li key={x.id}>
                  <a href={x.link} className="rnr-menu-item rnr-notice" data-unread={x.read_at ? undefined : 'true'}
                    onClick={() => { void readOne(x.id); setOpen(false) }}>
                    <span className="rnr-notice-dot" aria-hidden="true" />
                    <span className="rnr-notice-title">{!x.read_at && <span className="sr-only">Unread: </span>}{x.title}</span>
                    {x.body && <span className="rnr-caption rnr-notice-body">{x.body}</span>}
                    <span className="rnr-caption"><When iso={x.created_at} /></span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {list.data?.length === NOTIFICATION_LIMIT && <p className="rnr-caption rnr-notices-foot">Showing your {NOTIFICATION_LIMIT} newest.</p>}
        </section>
      )}
    </div>
  )
}
