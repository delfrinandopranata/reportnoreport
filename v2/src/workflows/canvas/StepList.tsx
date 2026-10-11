import { OUTCOME_LABELS, TYPE_LABELS, nodeById, outcomesOf, type Graph, type WfNode } from '../logic'
import { stepLabel, stepOrder } from './canvasOps'
import { RightIcon } from '../../ui/icons'

type Props = {
  graph: Graph; selected: string | null; issues: Map<string, string[]>; open: Map<string, number> | undefined
  onSelect(id: string): void
}

function Row({ graph, node, selected, issues, open, onSelect }: { graph: Graph; node: WfNode; selected: boolean; issues: string[]; open: number; onSelect(id: string): void }) {
  return (
    <li className="rnr-block" data-selected={selected ? 'true' : 'false'}>
      <button type="button" id={`step-row-${node.id}`} className="rnr-pick rnr-focus" aria-pressed={selected} onClick={() => onSelect(node.id)}>
        <span className="rnr-caption block">{TYPE_LABELS[node.type]}</span>
        <span className="label block">{stepLabel(graph, node)}</span>
        {outcomesOf(node).map((o) => {
          const to = graph.edges.find((e) => e.from === node.id && e.outcome === o)?.to
          return (
            <span key={o} className="rnr-caption flex items-center gap-1"><RightIcon size={14} />{OUTCOME_LABELS[o]}: {to ? stepLabel(graph, nodeById(graph, to)!) : 'Not connected'}</span>
          )
        })}
        {node.type === 'end' && <span className="rnr-caption block">Closes as {node.status}</span>}
        {issues.length > 0 && <span className="rnr-error block">{issues.length === 1 ? '1 issue' : `${issues.length} issues`}</span>}
        {open > 0 && <span className="rnr-caption block">{open} open {open === 1 ? 'record' : 'records'} on this step</span>}
      </button>
    </li>
  )
}

/** The accessible and phone alternative to the map: the same steps and connections as a list, edited through the panel. */
export function StepList({ graph, selected, issues, open, onSelect }: Props) {
  const { reached, loose } = stepOrder(graph)
  if (!graph.nodes.length) return <div className="rnr-drop">No steps yet. Add a Start step to begin.</div>
  const rows = (nodes: WfNode[], label: string) => (
    <ol aria-label={label} className="flex flex-col gap-2">
      {nodes.map((n) => <Row key={n.id} graph={graph} node={n} selected={n.id === selected} issues={issues.get(n.id) ?? []} open={open?.get(n.id) ?? 0} onSelect={onSelect} />)}
    </ol>
  )
  return (
    <div className="flex flex-col gap-4">
      {reached.length > 0 && rows(reached, 'Steps')}
      {loose.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="label">Not connected to Start</h3>
          {rows(loose, 'Steps not connected to Start')}
        </div>
      )}
    </div>
  )
}
