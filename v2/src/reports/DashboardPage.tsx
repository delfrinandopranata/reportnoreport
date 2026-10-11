import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent, type UniqueIdentifier,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useOrg } from '../rbac/useOrg'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { friendlyError } from '../ui/errors'
import { GripIcon, MoreIcon, PlusIcon, XIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { useAction } from '../ui/useAction'
import { useFocusAfterRender } from '../ui/useFocusAfterRender'
import { useLeaveGuard } from '../ui/useLeaveGuard'
import { useMenu } from '../ui/useMenu'
import { addWidget, readDashboard, removeWidget, saveLayout, useReports, useWidgets, type WidgetKind, type WidgetRow } from './api'
import { WidgetBody } from './Widget'

type Span = 1 | 2 | 4
type Draft = { rows: WidgetRow[]; version: number }
const SPAN: Record<Span, string> = { 1: '', 2: 'sm:col-span-2', 4: 'sm:col-span-2 lg:col-span-4' }
const SPAN_WORDS: Record<Span, string> = { 1: 'Small', 2: 'Medium', 4: 'Full width' }
const KIND_WORDS: Record<WidgetKind, string> = { number: 'Number', table: 'Table', bar: 'Bar chart', line: 'Line chart' }
const KIND_SPAN: Record<WidgetKind, Span> = { number: 1, bar: 2, line: 2, table: 4 }

export function DashboardPage() {
  const { orgId, orgs, can } = useOrg()
  const manage = can('reports.manage')
  const widgets = useWidgets(orgId)
  const reports = useReports(orgId)
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null) // non-null while editing
  const [adding, setAdding] = useState(false)
  const [doomed, setDoomed] = useState<WidgetRow | null>(null)
  const [dragging, setDragging] = useState<UniqueIdentifier | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [note, setNote] = useState('')
  const saving = useAction()
  const removal = useAction()
  const focusLater = useFocusAfterRender()
  const grid = useRef<HTMLOListElement>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const orgName = orgs.find((o) => o.id === orgId)?.name ?? 'your organisation'
  const stored = widgets.data?.rows ?? []
  const shown = draft?.rows ?? stored
  const count = shown.length
  const dirty = !!draft && draft.rows.map((w) => `${w.id}:${w.span}`).join() !== stored.map((w) => `${w.id}:${w.span}`).join()
  const guard = useLeaveGuard(dirty, '#/dashboard')
  const title = (id: UniqueIdentifier) => shown.find((w) => w.id === id)?.title ?? 'Widget'
  const pos = (id: UniqueIdentifier) => shown.findIndex((w) => w.id === id) + 1
  const refocus = (id: string, ctl: string) => focusLater(() => grid.current?.querySelector<HTMLElement>(`[data-id="${id}"] [data-ctl="${ctl}"]`))
  const setRows = (rows: WidgetRow[]) => setDraft((d) => d && { ...d, rows })

  const edit = (then?: () => void) => {
    if (!widgets.data) return
    setDraft({ rows: widgets.data.rows, version: widgets.data.version })
    setError(null); setStale(false)
    if (then) then()
    else { setNote('Editing layout. Drag a widget by its handle, or use its options menu.'); focusLater('dash-h') } // the pressed button unmounts
  }
  const leave = (text?: string) => { setDraft(null); setError(null); setStale(false); if (text) setNote(text); focusLater('dash-h') }

  /** Adding or removing a widget bumps the stored version by one. Take it only when that is all that happened, so another tab's change still refuses the save. */
  const adoptVersion = async () => {
    const fresh = await readDashboard(orgId!)
    setDraft((d) => d && (fresh.version === d.version + 1 ? { ...d, version: fresh.version } : d))
    await qc.invalidateQueries({ queryKey: ['widgets', orgId] })
  }
  const step = (w: WidgetRow, d: -1 | 1) => {
    const i = shown.findIndex((x) => x.id === w.id)
    if (i + d < 0 || i + d >= count) { setNote(`${w.title} is already ${d < 0 ? 'first' : 'last'}.`); return }
    setRows(arrayMove(shown, i, i + d))
    setNote(`Moved ${w.title} to position ${i + d + 1} of ${count}.`)
  }
  const resize = (w: WidgetRow, span: Span) => {
    setRows(shown.map((x) => (x.id === w.id ? { ...x, span } : x)))
    setNote(`${w.title} is now ${SPAN_WORDS[span]}.`)
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null)
    refocus(String(active.id), 'handle')
    if (!over || active.id === over.id) return
    setRows(arrayMove(shown, pos(active.id) - 1, pos(over.id) - 1))
  }
  const save = () => saving.run(async () => {
    if (!draft) return
    setError(null)
    const { error: e } = await saveLayout(orgId!, draft.rows.map((w) => ({ id: w.id, span: w.span })), draft.version)
    if (e) { setStale(/dashboard changed/.test(e.message)); setError(friendlyError(e)); return false }
    await qc.invalidateQueries({ queryKey: ['widgets', orgId] })
    leave('Layout saved.')
  }, true)
  const reload = async () => { await widgets.refetch(); leave() }
  const remove = () => removal.run(async () => {
    if (!doomed) return
    const { data, error: e } = await removeWidget(doomed.id)
    if (e || !data.length) { setError(e ? friendlyError(e) : 'This widget was already removed. Reload to see the latest dashboard.'); setStale(!e); setDoomed(null); return }
    setDraft((d) => d && { ...d, rows: d.rows.filter((w) => w.id !== doomed.id) })
    setDoomed(null)
    setNote(`${doomed.title} removed.`)
    await adoptVersion()
    focusLater('dash-h') // the card that held Remove is gone
  })

  return (
    <section className="flex flex-col gap-4" aria-labelledby="dash-h">
      <div className="flex flex-wrap items-center gap-2">
        <h1 id="dash-h" className="page-title" tabIndex={-1}>Dashboard</h1>
        {manage && !draft && count > 0 && <button type="button" className="rnr-btn rnr-btn-secondary ml-auto" onClick={() => edit()}>Edit layout</button>}
        {draft && (
          <div className="ml-auto flex flex-wrap gap-2">
            <button id="dash-add" type="button" className="rnr-btn rnr-btn-secondary" onClick={() => setAdding(true)}><PlusIcon />Add widget</button>
            <button type="button" className="rnr-btn rnr-btn-ghost" onClick={() => leave()}>Cancel</button>
            <button type="button" className="rnr-btn rnr-btn-primary" aria-busy={saving.busy} onClick={() => void save()}>
              {saving.busy && <span className="rnr-spin" aria-hidden="true" />}{saving.busy ? 'Saving…' : 'Save layout'}
            </button>
          </div>
        )}
      </div>
      <p className="rnr-muted">{draft ? `Layout changes apply to everyone in ${orgName}.` : `This dashboard is shared by everyone in ${orgName}. Each person sees numbers for the records they can see.`}</p>
      <p className="sr-only" role="status" aria-live="polite">{note}</p>
      {error && (
        <div className="flex flex-col items-start gap-2" role="alert">
          <p className="rnr-error">{error}</p>
          {stale && <button type="button" className="rnr-btn rnr-btn-secondary" onClick={() => void reload()}>Reload dashboard</button>}
        </div>
      )}
      {widgets.isPending && <Skeleton rows={[{ w: '100%', h: 160 }]} />}
      {widgets.isError && (
        <div className="rnr-card gap-3">
          <p role="alert">The dashboard did not load. Check your connection and try again.</p>
          <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => void widgets.refetch()}>Try again</button></div>
        </div>
      )}
      {widgets.data && count === 0 && manage && (
        <div className="rnr-card gap-3">
          <div className="rnr-card" data-state="placeholder" aria-hidden="true">
            <header className="rnr-card-head"><h3 className="rnr-card-title">Leave days by type</h3></header>
            <p className="rnr-kpi">12</p>
            <p className="rnr-caption">Records</p>
          </div>
          <h2 className="dialog-title">Build your dashboard</h2>
          <p className="rnr-muted">{reports.data?.length === 0 ? 'Create a report first, then add it here.' : `Show a saved report as a number, a table or a chart. Everyone in ${orgName} sees the same layout.`}</p>
          <div>
            {reports.data?.length === 0
              ? <a className="rnr-btn rnr-btn-secondary" href="#/reports">Go to reports</a>
              : <button type="button" className="rnr-btn rnr-btn-primary" onClick={() => edit(() => setAdding(true))}><PlusIcon />Add widget</button>}
          </div>
        </div>
      )}
      {widgets.data && count === 0 && !manage && (
        <div className="rnr-card gap-3">
          <h2 className="dialog-title">Nothing on the dashboard yet</h2>
          <p className="rnr-muted">Ask a reports manager to add widgets.</p>
        </div>
      )}
      {count > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={({ active }: DragStartEvent) => setDragging(active.id)} onDragEnd={onDragEnd}
          onDragCancel={() => setDragging(null)}
          accessibility={{
            screenReaderInstructions: { draggable: 'Press Space to pick up this widget. Use the arrow keys to move it. Press Space to drop it, or Escape to cancel.' },
            announcements: {
              onDragStart: ({ active }) => `Picked up ${title(active.id)}. Position ${pos(active.id)} of ${count}.`,
              onDragOver: ({ active, over }) => (over ? `${title(active.id)} is over position ${pos(over.id)} of ${count}.` : undefined),
              onDragEnd: ({ active, over }) => (over && over.id !== active.id ? `Moved ${title(active.id)} to position ${pos(over.id)} of ${count}.` : `${title(active.id)} dropped in position ${pos(active.id)} of ${count}.`),
              onDragCancel: ({ active }) => `Moving ${title(active.id)} was cancelled.`,
            },
          }}>
          <SortableContext items={shown.map((w) => w.id)} strategy={rectSortingStrategy}>
            <ol ref={grid} className="rnr-grid grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4" aria-label="Dashboard widgets">
              {shown.map((w, i) => (draft
                ? (
                  <EditCard key={w.id} w={w} first={i === 0} last={i === count - 1}
                    onStep={(d) => { step(w, d); refocus(w.id, 'options') }}
                    onSpan={(s) => { resize(w, s); refocus(w.id, 'options') }}
                    onRemove={() => setDoomed(w)} />
                )
                : (
                  <li key={w.id} className={`rnr-card ${SPAN[w.span]}`}>
                    <header className="rnr-card-head">
                      <h2 className="rnr-card-title">{w.title}</h2>
                      <a className="rnr-btn rnr-btn-ghost ml-auto shrink-0 whitespace-nowrap" href={`#/reports/${w.report_id}`} aria-label={`Open report: ${w.title}`}>Open report</a>
                    </header>
                    <WidgetBody w={w} />
                  </li>
                )))}
            </ol>
          </SortableContext>
          <DragOverlay>
            {dragging !== null && shown.find((w) => w.id === dragging) && (
              <div className="rnr-drag-overlay">
                <div className="rnr-card" data-state="overlay">
                  <header className="rnr-card-head">
                    <span className="rnr-handle" aria-hidden="true"><GripIcon /></span>
                    <h2 className="rnr-card-title">{title(dragging)}</h2>
                  </header>
                  <div inert><WidgetBody w={shown.find((w) => w.id === dragging)!} /></div>
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
      {adding && (
        <AddWidgetDialog position={count + 1} onClose={() => { setAdding(false); focusLater('dash-add') }}
          onAdded={async (row) => {
            setAdding(false)
            setDraft((d) => d && { ...d, rows: [...d.rows, row] }) // the unsaved reorders stay
            setNote(`${row.title} added.`)
            await adoptVersion()
            focusLater('dash-add')
          }} />
      )}
      <ConfirmDialog open={!!doomed} title={`Remove ${doomed?.title ?? ''}?`}
        body="The widget leaves the dashboard for everyone straight away, even if you cancel your layout changes. The report is kept."
        confirmLabel="Remove widget" busyLabel="Removing…" busy={removal.busy} error={null} onClose={() => setDoomed(null)} onConfirm={() => void remove()} />
      <ConfirmDialog open={!!guard.leaveTo} title="Leave without saving?" body="Your layout changes will be lost."
        confirmLabel="Leave" busyLabel="Leaving…" busy={false} error={null} onClose={guard.stay} onConfirm={guard.leave} />
    </section>
  )
}

function EditCard({ w, first, last, onStep, onSpan, onRemove }: {
  w: WidgetRow; first: boolean; last: boolean; onStep(d: -1 | 1): void; onSpan(s: Span): void; onRemove(): void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: w.id })
  const { open, box, button, close, toggle, onMenuKey, onButtonKey, slot } = useMenu()
  const act = (fn: () => void) => () => { close(false); fn() }
  return (
    // dnd-kit positions the sorted card with an inline transform; nothing else here is styled inline.
    <li ref={setNodeRef} data-id={w.id} className={`rnr-card ${SPAN[w.span]}`} data-state={isDragging ? 'placeholder' : 'editing'}
      style={{ transform: CSS.Transform.toString(transform), transition }}>
      <header className="rnr-card-head">
        <button ref={setActivatorNodeRef} type="button" className="rnr-handle" data-ctl="handle" aria-label={`Drag ${w.title}`} {...attributes} {...listeners}><GripIcon /></button>
        <h2 className="rnr-card-title">{w.title}</h2>
        <div ref={box} className="rnr-menu-anchor ml-auto">
          <button ref={button} type="button" className="rnr-icon-btn" data-ctl="options" aria-haspopup="menu" aria-expanded={open} aria-label={`Options for ${w.title}`}
            onClick={toggle} onKeyDown={onButtonKey}><MoreIcon size={14} /></button>
          {open && (
            <div role="menu" aria-label={`Options for ${w.title}`} className="rnr-menu rnr-widget-menu" onKeyDown={onMenuKey}>
              <button type="button" role="menuitem" {...slot(0)} className="rnr-menu-item" aria-disabled={first || undefined} onClick={act(() => onStep(-1))}>Move up</button>
              <button type="button" role="menuitem" {...slot(1)} className="rnr-menu-item" aria-disabled={last || undefined} onClick={act(() => onStep(1))}>Move down</button>
              <div className="rnr-menu-sep" role="separator" />
              <div role="group" aria-label="Width">
                {([1, 2, 4] as const).map((s, i) => (
                  <button key={s} type="button" role="menuitemradio" aria-checked={w.span === s} {...slot(2 + i)} className="rnr-menu-item" onClick={act(() => onSpan(s))}>{SPAN_WORDS[s]}</button>
                ))}
              </div>
              <div className="rnr-menu-sep" role="separator" />
              <button type="button" role="menuitem" {...slot(5)} className="rnr-menu-item is-danger" onClick={() => { close(); onRemove() }}>Remove widget</button>
            </div>
          )}
        </div>
      </header>
      <div inert><WidgetBody w={w} /></div>
    </li>
  )
}

function AddWidgetDialog({ position, onClose, onAdded }: { position: number; onClose(): void; onAdded(row: WidgetRow): Promise<void> }) {
  const { orgId } = useOrg()
  const reports = useReports(orgId)
  const ref = useRef<HTMLDialogElement>(null)
  const uid = useId()
  const [reportId, setReportId] = useState('')
  const [kind, setKind] = useState<WidgetKind>('number')
  const [title, setTitle] = useState('')
  const [span, setSpan] = useState<Span>(KIND_SPAN.number)
  const [spanTouched, setSpanTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bad, setBad] = useState<'report' | null>(null)
  const act = useAction()
  useEffect(() => { ref.current?.showModal(); ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus() }, [])
  const picked = reports.data?.find((r) => r.id === reportId)
  const pickKind = (k: WidgetKind) => { setKind(k); if (!spanTouched) setSpan(KIND_SPAN[k]) }
  const fail = (msg: string) => { setError(msg); setBad('report'); document.getElementById(`${uid}-r`)?.focus() }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void act.run(async () => {
      setError(null); setBad(null)
      if (!picked) return fail('Choose a report to show.')
      if ((kind === 'bar' || kind === 'line') && !picked.group_by) return fail('Charts need a grouped report. Choose a grouped report, or show this one as a number or a table.')
      const name = (title.trim() || picked.name).slice(0, 80)
      const { data, error: e2 } = await addWidget({ org_id: orgId!, report_id: picked.id, kind, title: name, span, position })
      if (e2) { setError(friendlyError(e2)); return }
      await onAdded({ id: data.id, report_id: picked.id, kind, title: name, span, position })
    })
  }
  return (
    <dialog ref={ref} className="rnr-dialog" aria-labelledby={`${uid}-t`} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }}>
      <div className="rnr-dialog-head">
        <h2 id={`${uid}-t`}>Add widget</h2>
        <button className="rnr-icon-btn" type="button" aria-label="Close dialog" onClick={onClose}><XIcon /></button>
      </div>
      <form className="rnr-dialog-body" onSubmit={submit} noValidate>
        <div className="rnr-field" data-invalid={bad === 'report' || undefined}>
          <label className="rnr-label" htmlFor={`${uid}-r`}>Report</label>
          <select id={`${uid}-r`} data-autofocus className="rnr-input" value={reportId} aria-invalid={bad === 'report' || undefined} aria-describedby={bad ? `${uid}-e` : undefined} onChange={(e) => setReportId(e.target.value)}>
            <option value="">Choose a report</option>
            {reports.data?.map((r) => <option key={r.id} value={r.id}>{r.name}{r.group_by ? ' (grouped)' : ''}</option>)}
          </select>
        </div>
        <fieldset className="rnr-field">
          <legend className="rnr-label">Show as</legend>
          <div className="rnr-seg self-start" role="group" aria-label="Show as">
            {(Object.keys(KIND_WORDS) as WidgetKind[]).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => pickKind(k)}>{KIND_WORDS[k]}</button>)}
          </div>
          <p className="rnr-caption">Charts need a grouped report and fit best at Medium width or wider.</p>
        </fieldset>
        <div className="rnr-field">
          <label className="rnr-label" htmlFor={`${uid}-n`}>Title</label>
          <input id={`${uid}-n`} className="rnr-input" value={title} maxLength={80} aria-describedby={`${uid}-nh`} onChange={(e) => setTitle(e.target.value)} />
          <p id={`${uid}-nh`} className="rnr-hint">Leave empty to use the report name.</p>
        </div>
        <div className="rnr-field">
          <label className="rnr-label" htmlFor={`${uid}-s`}>Width</label>
          <select id={`${uid}-s`} className="rnr-input" value={span} onChange={(e) => { setSpan(Number(e.target.value) as Span); setSpanTouched(true) }}>
            {([1, 2, 4] as const).map((s) => <option key={s} value={s}>{SPAN_WORDS[s]}</option>)}
          </select>
        </div>
        {error && <p id={`${uid}-e`} className="rnr-error" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="rnr-btn rnr-btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="rnr-btn rnr-btn-primary" type="submit" aria-busy={act.busy}>
            {act.busy && <span className="rnr-spin" aria-hidden="true" />}{act.busy ? 'Adding…' : 'Add widget'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
