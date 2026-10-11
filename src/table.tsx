import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react'
import { seriesOf } from './columnSeries'
import { btn, Dialog, Icon, useLocalState, type Sort } from './ui'

export type Column<R, K extends string = string> = {
  id: string
  label: string
  /** Default width in px; users can drag it wider or narrower. */
  width: number
  align?: 'right'
  /** Takes any spare table width; its width setting acts as a minimum. */
  flex?: boolean
  /** Off until the user turns it on in "Columns". */
  hidden?: boolean
  sortKey?: K
  cell: (row: R) => ReactNode
  /** Plain-text value used for CSV export. */
  text: (row: R) => string
  tone?: (row: R) => string
}

type Layout = { order: string[]; hidden: string[]; widths: Record<string, number>; dense: boolean }

const MIN_WIDTH = 64

/** Column order, visibility, widths and density, remembered per viewer. */
export function useTableLayout<R, K extends string>(key: string, defs: Column<R, K>[]) {
  const defaults: Layout = { order: defs.map((d) => d.id), hidden: defs.filter((d) => d.hidden).map((d) => d.id), widths: {}, dense: false }
  const [layout, setLayout] = useLocalState<Layout>(`table.${key}`, defaults)
  const byId = new Map(defs.map((d) => [d.id, d]))
  // Columns added later are appended; columns that no longer exist are dropped.
  const order = [...layout.order.filter((id) => byId.has(id)), ...defs.map((d) => d.id).filter((id) => !layout.order.includes(id))]
  const all = order.map((id) => byId.get(id)!)
  return {
    all,
    visible: all.filter((c) => !layout.hidden.includes(c.id)),
    layout,
    widthOf: (c: Column<R, K>) => layout.widths[c.id] ?? c.width,
    setWidth: (id: string, width: number | null) =>
      setLayout((l) => {
        const widths = { ...l.widths }
        if (width === null) delete widths[id]
        else widths[id] = Math.max(MIN_WIDTH, Math.round(width))
        return { ...l, widths }
      }),
    toggle: (id: string) => setLayout((l) => ({ ...l, hidden: l.hidden.includes(id) ? l.hidden.filter((h) => h !== id) : [...l.hidden, id] })),
    move: (from: string, to: string) => setLayout((l) => ({ ...l, order: arrayMove(order, order.indexOf(from), order.indexOf(to)) })),
    setDense: (dense: boolean) => setLayout((l) => ({ ...l, dense })),
    reset: () => setLayout(defaults),
  }
}

export type TableLayout<R, K extends string> = ReturnType<typeof useTableLayout<R, K>>

export function ColumnHeader<R, K extends string>({
  column,
  width,
  onResize,
  sort,
  onSort,
}: {
  column: Column<R, K>
  width: number
  onResize: (width: number | null) => void
  sort?: Sort<K>
  onSort?: (key: K) => void
}) {
  const active = !!sort && sort.key === column.sortKey
  const right = column.align === 'right'
  const flow = seriesOf(column.id)
  const label = flow ? (
    <>
      <Icon name={flow.series} className="size-3.5" />
      {flow.word}
    </>
  ) : column.label
  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const move = (ev: PointerEvent) => onResize(width + ev.clientX - startX)
    const up = () => {
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', up)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'col-resize'
    addEventListener('pointermove', move)
    addEventListener('pointerup', up)
  }
  return (
    <th
      data-resizable
      data-series={flow?.series}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={right ? 'num' : undefined}
    >
      {column.sortKey && onSort ? (
        <button type="button" onClick={() => onSort(column.sortKey!)} className={`rnr-th-sort max-w-full ${right ? 'flex-row-reverse' : ''}`}>
          <span className={`${flow ? 'inline-flex items-center ' : ''}truncate`}>{label}</span>
          <Icon name={active && sort.dir === 'asc' ? 'up' : 'down'} className="size-3.5" />
        </button>
      ) : (
        <span className={`${flow ? 'flex items-center ' : 'block '}truncate`}>{label}</span>
      )}
      <button
        type="button"
        aria-label={`Resize ${column.label} column`}
        title="Drag to resize · double-click to reset"
        onPointerDown={startResize}
        onDoubleClick={() => onResize(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') onResize(width - 16)
          if (e.key === 'ArrowRight') onResize(width + 16)
        }}
        className="rnr-ledger-resize print:hidden"
      />
    </th>
  )
}

function ColumnItem({ id, label, checked, disabled, onToggle }: { id: string; label: string; checked: boolean; disabled: boolean; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-(--r-ctl) bg-surface px-2 py-1 ${isDragging ? 'relative z-10 shadow-(--sh-menu)' : ''}`}
    >
      <button ref={setActivatorNodeRef} {...attributes} {...listeners} className="rnr-icon-btn cursor-grab touch-none" aria-label={`Reorder ${label}`}>
        <Icon name="grip" className="size-5" />
      </button>
      <label className="rnr-check flex-1">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} />
        {label}
      </label>
    </li>
  )
}

export function ColumnsDialog<R, K extends string>({ open, onClose, table }: { open: boolean; onClose: () => void; table: TableLayout<R, K> }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) table.move(String(active.id), String(over.id))
  }
  return (
    <Dialog open={open} onClose={onClose} title="Customise table">
      <p className="rnr-muted mb-3">Show, hide and drag columns to reorder. Drag a column’s edge in the table to resize it.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={table.all.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <ul className="grid gap-0.5">
            {table.all.map((c) => {
              const checked = !table.layout.hidden.includes(c.id)
              return <ColumnItem key={c.id} id={c.id} label={c.label} checked={checked} disabled={checked && table.visible.length === 1} onToggle={() => table.toggle(c.id)} />
            })}
          </ul>
        </SortableContext>
      </DndContext>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-soft pt-4">
        <div className="rnr-seg" role="group" aria-label="Row density">
          {([false, true] as const).map((dense) => (
            <button
              key={String(dense)}
              type="button"
              aria-pressed={table.layout.dense === dense}
              onClick={() => table.setDense(dense)}
            >
              {dense ? 'Compact' : 'Comfortable'}
            </button>
          ))}
        </div>
        <button type="button" className={btn.ghost} onClick={table.reset}>
          Reset to default
        </button>
      </div>
    </Dialog>
  )
}
