import { useId, useState } from 'react'
import { Icon, ring } from '../ui'
import { summarise, type ChecklistItem } from './summary'

export interface ChecklistProps {
  items: ChecklistItem[]
  onSkip: (itemId: string) => void
  onRestore: (itemId: string) => void
  onDismiss: () => void
}

export function Checklist({ items, onSkip, onRestore, onDismiss }: ChecklistProps) {
  const [showSkipped, setShowSkipped] = useState(false)
  const summary = summarise(items)
  const progressId = useId()
  const skippedId = useId()

  if (items.length === 0) return null

  return (
    <div
      className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      role="region"
      aria-labelledby="checklist-title"
    >
      <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800 sm:gap-4 sm:px-6">
        <h2 id="checklist-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Get started
        </h2>
        <button
          onClick={onDismiss}
          className={`${ring} shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300`}
          aria-label="Dismiss checklist"
        >
          <Icon name="x" className="size-4" />
        </button>
      </div>

      <div className="px-4 py-3 sm:px-6">
        <div
          id={progressId}
          className="mb-4 text-sm text-zinc-600 dark:text-zinc-400"
          aria-live="polite"
          aria-atomic="true"
        >
          {summary.doneCount} of {summary.totalCount} done
        </div>

        <ol className="space-y-2 mb-4">
          {summary.todoItems.map((item) => (
            <li
              key={item.id}
              className="group flex items-start gap-3 rounded-lg p-3 transition hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              <div className="mt-1 size-5 shrink-0 rounded border border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-900" />
              <div className="flex-1 min-w-0">
                <a
                  href={item.href}
                  className={`${ring} block truncate text-sm font-medium text-zinc-900 hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-300`}
                >
                  {item.title}
                </a>
                <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {item.description}
                </p>
              </div>
              <button
                onClick={() => onSkip(item.id)}
                className={`${ring} ml-2 shrink-0 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200`}
                aria-label={`Skip "${item.title}"`}
              >
                Skip
              </button>
            </li>
          ))}
        </ol>

        {summary.doneItems.length > 0 && (
          <div className="mb-4 space-y-2">
            {summary.doneItems.map((item) => (
              <div
                key={item.id}
                className="group flex items-start gap-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900/40"
              >
                <div className="mt-1 flex size-5 shrink-0 items-center justify-center rounded border border-green-300 bg-green-50 text-green-600 dark:border-green-700 dark:bg-green-950 dark:text-green-400">
                  <Icon name="check" className="size-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <a
                    href={item.href}
                    className={`${ring} block text-sm font-medium text-zinc-500 line-through dark:text-zinc-400`}
                  >
                    {item.title}
                  </a>
                  <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">Done</p>
                </div>
                <button
                  onClick={() => onRestore(item.id)}
                  className={`${ring} ml-2 shrink-0 rounded-md px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-white hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300`}
                  aria-label={`Restore "${item.title}"`}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}

        {summary.skippedItems.length > 0 && (
          <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <button
              onClick={() => setShowSkipped(!showSkipped)}
              className={`${ring} flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800`}
              aria-expanded={showSkipped}
              aria-controls={skippedId}
            >
              <Icon name={showSkipped ? 'up' : 'down'} className="size-3 shrink-0" />
              <span>
                Skipped ({summary.skippedItems.length}) ·{' '}
                {showSkipped ? 'Hide' : 'Show'}
              </span>
            </button>

            {showSkipped && (
              <ul id={skippedId} className="mt-2 space-y-2">
                {summary.skippedItems.map((item) => (
                  <li
                    key={item.id}
                    className="group flex items-start gap-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900/40"
                  >
                    <div className="mt-1 size-5 shrink-0 rounded border border-zinc-300 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800" />
                    <div className="flex-1 min-w-0">
                      <a
                        href={item.href}
                        className={`${ring} block text-sm font-medium text-zinc-500 dark:text-zinc-400`}
                      >
                        {item.title}
                      </a>
                      <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                        {item.description}
                      </p>
                    </div>
                    <button
                      onClick={() => onRestore(item.id)}
                      className={`${ring} ml-2 shrink-0 rounded-md px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-white hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300`}
                      aria-label={`Restore "${item.title}"`}
                    >
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
