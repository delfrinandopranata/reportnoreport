import { CheckIcon } from '../../ui/icons'

/** Named form steps. Shown only when there is more than one visible page. Spec: design/components/Steps. */
export function Steps({ labels, current }: { labels: string[]; current: number }) {
  return (
    <ol className="rnr-steps" aria-label="Steps" tabIndex={0}>
      {labels.map((label, i) => (
        <li key={i} className="rnr-step" aria-current={i === current ? 'step' : undefined} data-done={i < current ? true : undefined}>
          <span className="rnr-step-n" aria-hidden="true">{i < current ? <CheckIcon /> : i + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  )
}
