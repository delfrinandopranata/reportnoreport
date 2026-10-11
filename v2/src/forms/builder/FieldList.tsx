import { useRef } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type UniqueIdentifier } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Field } from '../logic'
import { DownIcon, GripIcon, UpIcon } from '../../ui/icons'
import { TYPE_LABELS } from './builderOps'

type Ctl = 'handle' | 'up' | 'down'
type ListProps = {
  label: string; fields: Field[]; selected: string | null; issues: ReadonlySet<string>
  onSelect(key: string): void; onMove(from: number, to: number): void; onNote(text: string): void
}

const nameOf = (f: Field) => f.label || TYPE_LABELS[f.type]
const calm = () => document.documentElement.dataset.motion === 'flat' || matchMedia('(prefers-reduced-motion: reduce)').matches

function meta(f: Field, hasIssue: boolean) {
  const parts = [TYPE_LABELS[f.type]]
  if (f.type === 'group' && f.repeat) parts.push(`${f.repeat.min}–${f.repeat.max} rows`)
  if (f.required) parts.push('Required')
  if (f.show_if) parts.push('Conditional')
  if (hasIssue) parts.push('Needs fixing')
  return parts.join(' · ')
}

export function FieldList({ label, fields, selected, issues, onSelect, onMove, onNote }: ListProps) {
  const list = useRef<HTMLOListElement>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const total = fields.length
  const find = (id: UniqueIdentifier) => fields.find((f) => f.key === id)
  const name = (id: UniqueIdentifier) => { const f = find(id); return f ? nameOf(f) : 'Field' }
  const pos = (id: UniqueIdentifier) => fields.findIndex((f) => f.key === id) + 1

  // React re-parents the moved row, so put focus back on the control that was used.
  const refocus = (key: string, ctl: Ctl) => requestAnimationFrame(() =>
    list.current?.querySelector<HTMLElement>(`[data-key="${key}"] [data-ctl="${ctl}"]`)?.focus())
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    onMove(fields.findIndex((f) => f.key === active.id), fields.findIndex((f) => f.key === over.id))
    refocus(String(active.id), 'handle')
  }
  const step = (i: number, d: -1 | 1, ctl: Ctl) => {
    const f = fields[i]
    if (i + d < 0 || i + d >= total) return onNote(`${nameOf(f)} is already ${d < 0 ? 'first' : 'last'}.`)
    onMove(i, i + d)
    onNote(`${nameOf(f)} moved to position ${i + d + 1} of ${total}.`)
    refocus(f.key, ctl)
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: { draggable: 'Press Space to pick up this field. Use the up and down arrow keys to move it. Press Space to drop it, or Escape to cancel.' },
        announcements: {
          onDragStart: ({ active }) => `Picked up ${name(active.id)}. Position ${pos(active.id)} of ${total}.`,
          onDragOver: ({ active, over }) => (over ? `${name(active.id)} is over position ${pos(over.id)} of ${total}.` : undefined),
          onDragEnd: ({ active, over }) => (over && over.id !== active.id
            ? `${name(active.id)} moved to position ${pos(over.id)} of ${total}.`
            : `${name(active.id)} dropped in position ${pos(active.id)} of ${total}.`),
          onDragCancel: ({ active }) => `Moving ${name(active.id)} was cancelled.`,
        },
      }}>
      <SortableContext items={fields.map((f) => f.key)} strategy={verticalListSortingStrategy}>
        <ol ref={list} aria-label={label} className="flex flex-col gap-2">
          {fields.map((f, i) => (
            <Row key={f.key} field={f} index={i} count={total} selected={selected === f.key} hasIssue={issues.has(f.key)} onSelect={onSelect} onStep={step} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  )
}

type RowProps = { field: Field; index: number; count: number; selected: boolean; hasIssue: boolean; onSelect(key: string): void; onStep(i: number, d: -1 | 1, ctl: Ctl): void }

function Row({ field: f, index, count, selected, hasIssue, onSelect, onStep }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: f.key, transition: calm() ? null : undefined })
  const name = nameOf(f)
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="rnr-block"
      data-key={f.key} data-selected={selected} data-dragging={isDragging || undefined}>
      <button ref={setActivatorNodeRef} type="button" className="rnr-handle" data-ctl="handle" aria-label={`Drag ${name}`} {...attributes} {...listeners}><GripIcon /></button>
      <button type="button" className="rnr-pick rnr-focus" aria-pressed={selected} onClick={() => onSelect(f.key)}>
        <span className="label block">{name}</span>
        <span className="rnr-caption block">{meta(f, hasIssue)}</span>
      </button>
      <button type="button" className="rnr-icon-btn" data-ctl="up" aria-label={`Move ${name} up`} aria-disabled={index === 0 || undefined} onClick={() => onStep(index, -1, 'up')}><UpIcon size={14} /></button>
      <button type="button" className="rnr-icon-btn" data-ctl="down" aria-label={`Move ${name} down`} aria-disabled={index === count - 1 || undefined} onClick={() => onStep(index, 1, 'down')}><DownIcon size={14} /></button>
    </li>
  )
}
