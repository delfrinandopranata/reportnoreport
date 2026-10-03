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
import { useState } from 'react'
import { usePreference } from './data/queries'
import { btn, Icon } from './ui'
import { WIDGETS } from './widgets'

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

function Card({ widget, editing, state = 'idle', drag, layout }: { widget: Widget; editing: boolean; state?: 'idle' | 'placeholder' | 'overlay'; drag?: Drag; layout: Layout }) {
  const { removeWidget, resizeWidget } = layout
  const { title, Component } = WIDGETS[widget.type]
  const look = {
    overlay: 'h-full rotate-1 border-zinc-300 shadow-2xl dark:border-zinc-700',
    placeholder: 'border-dashed border-zinc-300 opacity-40 dark:border-zinc-700',
    idle: editing ? 'border-zinc-300 shadow-sm ring-4 ring-zinc-900/[0.03] dark:border-zinc-700' : 'border-zinc-200/80 shadow-xs dark:border-zinc-800',
  }[state]

  return (
    <div className={`flex h-full min-w-0 flex-col rounded-2xl border bg-white p-5 transition-shadow dark:bg-zinc-900 ${look}`}>
      <header className="mb-4 flex min-h-7 items-center gap-1">
        {editing && (
          <button
            ref={drag?.setActivatorNodeRef}
            {...drag?.attributes}
            {...drag?.listeners}
            className="-ml-2 cursor-grab touch-none rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 active:cursor-grabbing dark:hover:bg-zinc-800"
            aria-label={`Drag ${title}`}
          >
            <Icon name="grip" className="size-4 [stroke-width:3]" />
          </button>
        )}
        <h2 className="truncate text-sm font-medium text-zinc-500 dark:text-zinc-400">{title}</h2>
        {editing && (
          <div className="ml-auto flex items-center">
            <button
              type="button"
              className={`${btn.ghost} gap-1.5 p-1.5 text-xs`}
              onClick={() => resizeWidget(widget.id)}
              title={`Width: ${SPAN_LABEL[widget.span]} — select to change`}
              aria-label={`Change width of ${title}, currently ${SPAN_LABEL[widget.span]}`}
            >
              <Icon name="resize" className="size-3.5" />
              <span className={widget.span === 1 ? 'hidden' : 'hidden sm:inline'} aria-hidden>{SPAN_LABEL[widget.span]}</span>
            </button>
            <button type="button" className={`${btn.ghost} p-1.5 hover:text-red-600`} onClick={() => removeWidget(widget.id)} aria-label={`Remove ${title}`}>
              <Icon name="x" className="size-3.5" />
            </button>
          </div>
        )}
      </header>
      <div className={editing ? 'pointer-events-none select-none' : ''}>
        <Component />
      </div>
    </div>
  )
}

function SortableCard({ widget, editing, layout }: { widget: Widget; editing: boolean; layout: Layout }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
    disabled: !editing,
  })
  return (
    <section ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={SPAN[widget.span]}>
      <Card widget={widget} editing={editing} layout={layout} state={isDragging ? 'placeholder' : 'idle'} drag={{ attributes, listeners, setActivatorNodeRef }} />
    </section>
  )
}

function Library({ addWidget }: { addWidget: Layout['addWidget'] }) {
  return (
    <div className="mb-6 rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-4 dark:border-zinc-700 dark:bg-zinc-900/40">
      <h2 className="text-sm font-medium">Add widgets</h2>
      <p className="mt-0.5 mb-3 text-sm text-zinc-500">
        Select a widget to add it. Drag the handle on a card to reorder it, or focus the handle and use Space and the arrow keys. Changes save automatically; select Done when finished.
      </p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {(Object.keys(WIDGETS) as WidgetType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => addWidget(type, WIDGETS[type].span)}
            className="group flex items-start gap-2 rounded-xl border border-zinc-200 bg-white p-3 text-left transition hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
          >
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-500 group-hover:bg-zinc-900 group-hover:text-white dark:bg-zinc-800 dark:group-hover:bg-white dark:group-hover:text-zinc-900">
              <Icon name="plus" className="size-3" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{WIDGETS[type].title}</span>
              <span className="block truncate text-xs text-zinc-500">{WIDGETS[type].blurb}</span>
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
      {widgets.length === 0 && (
        <div className="grid place-items-center rounded-2xl border border-dashed border-zinc-300 py-16 text-center dark:border-zinc-700">
          <p className="font-medium">No widgets on this dashboard</p>
          <p className="mt-1 max-w-sm px-4 text-sm text-zinc-500">{editing ? 'Select a widget above to add it.' : 'Select “Edit layout” at the top of the page to add widgets.'}</p>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {widgets.map((w) => (
              <SortableCard key={w.id} widget={w} editing={editing} layout={layout} />
            ))}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
          {active && <Card widget={active} editing state="overlay" layout={layout} />}
        </DragOverlay>
      </DndContext>
    </>
  )
}
