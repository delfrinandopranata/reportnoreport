import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react'
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
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={`group/th relative px-4 py-3 font-medium ${right ? 'text-right' : ''}`}
    >
      {column.sortKey && onSort ? (
        <button
          type="button"
          onClick={() => onSort(column.sortKey!)}
          className={`group inline-flex max-w-full items-center gap-1 transition hover:text-zinc-900 dark:hover:text-white ${right ? 'flex-row-reverse' : ''} ${active ? 'text-zinc-900 dark:text-white' : ''}`}
        >
          <span className="truncate">{column.label}</span>
          <Icon name={active && sort.dir === 'asc' ? 'up' : 'down'} className={`size-3 shrink-0 transition ${active ? '' : 'opacity-0 group-hover:opacity-50'}`} />
        </button>
      ) : (
        <span className="block truncate">{column.label}</span>
      )}
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${column.label} column`}
        aria-valuenow={width}
        tabIndex={0}
        title="Drag to resize · double-click to reset"
        onPointerDown={startResize}
        onDoubleClick={() => onResize(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') onResize(width - 16)
          if (e.key === 'ArrowRight') onResize(width + 16)
        }}
        className="absolute top-2 right-0 bottom-2 w-1.5 cursor-col-resize touch-none rounded-full outline-none group-hover/th:bg-zinc-200 hover:!bg-zinc-400 focus-visible:bg-zinc-500 print:hidden dark:group-hover/th:bg-zinc-700"
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
      className={`flex items-center gap-3 rounded-lg border bg-white px-2 py-2 dark:bg-zinc-900 ${isDragging ? 'relative z-10 border-zinc-300 shadow-lg' : 'border-transparent'}`}
    >
      <button ref={setActivatorNodeRef} {...attributes} {...listeners} className="cursor-grab touch-none rounded p-1 text-zinc-400 hover:text-zinc-700" aria-label={`Reorder ${label}`}>
        <Icon name="grip" className="size-4 [stroke-width:3]" />
      </button>
      <label className="flex flex-1 items-center gap-2 text-sm">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} className="size-4 accent-zinc-900" />
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
      <p className="mb-3 text-sm text-zinc-500">Show, hide and drag columns to reorder. Drag a column’s edge in the table to resize it.</p>
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
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <div className="flex rounded-lg bg-zinc-100 p-0.5 text-sm dark:bg-zinc-800" role="group" aria-label="Row density">
          {([false, true] as const).map((dense) => (
            <button
              key={String(dense)}
              type="button"
              aria-pressed={table.layout.dense === dense}
              onClick={() => table.setDense(dense)}
              className={`rounded-md px-3 py-1 font-medium transition ${table.layout.dense === dense ? 'bg-white shadow-sm dark:bg-zinc-950' : 'text-zinc-500'}`}
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
