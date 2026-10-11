import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useId, useState } from 'react'
import { usePreference, useSampleDataExists, useLoadSampleData } from './data/queries'
import { btn, Icon } from './ui'
import { WIDGETS } from './widgets'
import { sampleControls } from './data/sampleData'
import { useSession } from './data/session'
import { Checklist } from './checklist'
import { useChecklist } from './checklist/useChecklist'

export type WidgetType = 'net' | 'in' | 'out' | 'clients' | 'cashflow' | 'balances' | 'recent' | 'quick-add'
export type Span = 1 | 2 | 4
export type Widget = { id: string; type: WidgetType; span: Span }

const NEXT_SPAN: Record<Span, Span> = { 1: 2, 2: 4, 4: 1 }

export const DEFAULT_WIDGETS: Widget[] = [
  { type: 'net', span: 1 },
  { type: 'in', span: 1 },
  { type: 'out', span: 1 },
  { type: 'clients', span: 1 },
  { type: 'cashflow', span: 2 },
  { type: 'balances', span: 2 },
  { type: 'recent', span: 2 },
  { type: 'quick-add', span: 2 },
].map((w, i) => ({ ...w, id: `default-${i}` }) as Widget)

type Layout = {
  widgets: Widget[]
  addWidget: (type: WidgetType, span: Span) => void
  removeWidget: (id: string) => void
  moveWidget: (activeId: string, overId: string) => void
  resizeWidget: (id: string) => void
}

function useLayout(): Layout {
  const [widgets, setWidgets] = usePreference<Widget[]>('dashboard', DEFAULT_WIDGETS)
  return {
    widgets,
    addWidget: (type, span) => setWidgets([...widgets, { id: crypto.randomUUID(), type, span }]),
    removeWidget: (id) => setWidgets(widgets.filter((w) => w.id !== id)),
    moveWidget: (activeId, overId) => {
      const from = widgets.findIndex((w) => w.id === activeId)
      const to = widgets.findIndex((w) => w.id === overId)
      if (from >= 0 && to >= 0) setWidgets(arrayMove(widgets, from, to))
    },
    resizeWidget: (id) => setWidgets(widgets.map((w) => (w.id === id ? { ...w, span: NEXT_SPAN[w.span] } : w))),
  }
}

const SPAN: Record<Span, string> = { 1: '', 2: 'sm:col-span-2', 4: 'sm:col-span-2 lg:col-span-4' }
const SPAN_LABEL: Record<Span, string> = { 1: 'Small', 2: 'Medium', 4: 'Full width' }

type Drag = Pick<ReturnType<typeof useSortable>, 'attributes' | 'listeners' | 'setActivatorNodeRef'>

function Card({ widget, editing, state = 'idle', drag, layout, sampleDataExists }: { widget: Widget; editing: boolean; state?: 'idle' | 'placeholder' | 'overlay'; drag?: Drag; layout: Layout; sampleDataExists: boolean }) {
  const { removeWidget, resizeWidget } = layout
  const { title, kpi, Component } = WIDGETS[widget.type]
  const headingId = useId()
  const showSampleLabel = sampleDataExists && ['net', 'in', 'out', 'clients'].includes(widget.type)
  const dataState = state === 'idle' ? (editing ? 'editing' : undefined) : state
  const handle = editing && (
    <button ref={drag?.setActivatorNodeRef} {...drag?.attributes} {...drag?.listeners} className="rnr-handle" aria-label={`Drag ${title}`}>
      <Icon name="grip" className="size-4" />
    </button>
  )
  const controls = editing && (
    <div className="ml-auto flex items-center">
      <button
        type="button"
        className={`${btn.ghost} rnr-btn-sm`}
        onClick={() => resizeWidget(widget.id)}
        title={`Width: ${SPAN_LABEL[widget.span]} — select to change`}
        aria-label={`Change width of ${title}, currently ${SPAN_LABEL[widget.span]}`}
      >
        <Icon name="resize" className="size-3.5" />
        <span className={widget.span === 1 ? 'hidden' : 'hidden sm:inline'} aria-hidden>{SPAN_LABEL[widget.span]}</span>
      </button>
      <button type="button" className={`${btn.ghost} rnr-btn-sm`} onClick={() => removeWidget(widget.id)} aria-label={`Remove ${title}`}>
        <Icon name="x" className="size-3.5" />
      </button>
    </div>
  )
  const sample = showSampleLabel && <span className="rnr-chip shrink-0" data-tone="info">Includes sample data</span>
  const body = (
    <div className={editing ? 'pointer-events-none select-none' : ''}>
      <Component />
    </div>
  )

  if (kpi) {
    return (
      <div className="rnr-kpi-widget" data-state={dataState}>
        <section className="rnr-folder rnr-kpi-tile" aria-labelledby={headingId}>
          <span className="rnr-folder-tab" id={headingId}>{title}</span>
          <div className="rnr-folder-body">
            <div className="rnr-perf" aria-hidden="true" />
            {editing && <div className="rnr-widget-bar">{handle}{controls}</div>}
            {sample}
            {body}
          </div>
        </section>
      </div>
    )
  }
  return (
    <div className="rnr-card h-full" data-state={dataState}>
      <header className="rnr-card-head">
        {handle}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="rnr-card-title">{title}</h2>
          {sample}
        </div>
        {controls}
      </header>
      {body}
    </div>
  )
}

function SortableCard({ widget, editing, layout, sampleDataExists }: { widget: Widget; editing: boolean; layout: Layout; sampleDataExists: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
    disabled: !editing,
  })
  return (
    // dnd-kit positions the sorted card with an inline transform; nothing else here is styled inline.
    <section ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={SPAN[widget.span]}>
      <Card widget={widget} editing={editing} layout={layout} sampleDataExists={sampleDataExists} state={isDragging ? 'placeholder' : 'idle'} drag={{ attributes, listeners, setActivatorNodeRef }} />
    </section>
  )
}

function Library({ addWidget }: { addWidget: Layout['addWidget'] }) {
  return (
    <div className="rnr-card mb-6">
      <div className="rnr-card-head"><h2 className="rnr-card-title">Add widgets</h2></div>
      <p className="rnr-muted -mt-2 mb-3">
        Select a widget to add it. Drag the handle on a card to reorder it, or focus the handle and use Space and the arrow keys. Changes save automatically; select Done when finished.
      </p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {(Object.keys(WIDGETS) as WidgetType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => addWidget(type, WIDGETS[type].span)}
            className="rnr-btn rnr-btn-secondary h-auto justify-start py-2 text-left"
          >
            <Icon name="plus" className="size-3.5" />
            <span className="min-w-0">
              <span className="block truncate">{WIDGETS[type].title}</span>
              <span className="rnr-caption block truncate">{WIDGETS[type].blurb}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function Dashboard({ editing }: { editing: boolean }) {
  const layout = useLayout()
  const { widgets, moveWidget } = layout
  const [activeId, setActiveId] = useState<string | null>(null)
  const { profile } = useSession()
  const sampleDataExists = useSampleDataExists()
  const loadSample = useLoadSampleData()
  const { canImport } = sampleControls(profile.role, sampleDataExists)
  const loadSampleErrorMsg = loadSample.error instanceof Error ? loadSample.error.message : (loadSample.error ? String(loadSample.error) : '')
  const checklist = useChecklist()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const active = widgets.find((w) => w.id === activeId)
  const titleOf = (id: string | number) => WIDGETS[widgets.find((w) => w.id === id)?.type ?? 'net'].title
  const announcements = {
    onDragStart: ({ active }: { active: { id: string | number } }) => `Picked up ${titleOf(active.id)}.`,
    onDragOver: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
      over ? `${titleOf(active.id)} is over ${titleOf(over.id)}.` : undefined,
    onDragEnd: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
      over ? `${titleOf(active.id)} dropped at ${titleOf(over.id)}.` : `${titleOf(active.id)} dropped.`,
    onDragCancel: ({ active }: { active: { id: string | number } }) => `Moving ${titleOf(active.id)} cancelled.`,
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null)
    if (over && active.id !== over.id) moveWidget(String(active.id), String(over.id))
  }

  return (
    <>
      {editing && <Library addWidget={layout.addWidget} />}
      {checklist.open && (
        <div className="mb-6">
          <Checklist
            items={checklist.items}
            onSkip={checklist.onSkip}
            onRestore={checklist.onRestore}
            onDismiss={checklist.onDismiss}
          />
        </div>
      )}
      {widgets.length === 0 && (
        <div className="rnr-empty mb-6">
          <p className="font-medium">No widgets on this dashboard</p>
          <p className="rnr-muted max-w-sm">{editing ? 'Select a widget above to add it.' : 'Select "Edit layout" at the top of the page to add widgets.'}</p>
          {canImport && (
            <button
              className={btn.primary}
              onClick={() => loadSample.mutate()}
              disabled={loadSample.isPending}
            >
              {loadSample.isPending ? 'Loading...' : 'Import sample data'}
            </button>
          )}
          {!!loadSample.error && <div role="alert" className="text-down">{loadSampleErrorMsg}</div>}
        </div>
      )}
      <DndContext
        sensors={sensors}
        accessibility={{ announcements }}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveId(String(active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div className="rnr-grid">
            {widgets.map((w) => (
              <SortableCard key={w.id} widget={w} editing={editing} layout={layout} sampleDataExists={sampleDataExists} />
            ))}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
          {active && (
            <div className="rnr-drag-overlay flex">
              <Card widget={active} editing state="overlay" layout={layout} sampleDataExists={sampleDataExists} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </>
  )
}
