import { Handle, Position, type NodeProps } from '@xyflow/react'
import { OUTCOME_LABELS, TYPE_LABELS, nodeName, outcomesOf } from '../logic'
import type { CardNode } from './canvasOps'

/** One labelled source handle per outcome on the right, the input on the left (Start has none). Handles are decorative: connecting by keyboard happens in the panel. */
export function NodeCard({ data, selected }: NodeProps<CardNode>) {
  const { node, issues, open, current, readOnly } = data
  const outs = outcomesOf(node)
  return (
    <div className="rnr-node rnr-folder rnr-folder--node" data-selected={selected ? 'true' : undefined} data-current={current ? 'true' : undefined}
      data-issue={issues.length ? 'true' : undefined} data-readonly={readOnly ? 'true' : undefined}>
      <span className="rnr-folder-tab">{TYPE_LABELS[node.type]}{current ? ' · Current step' : ''}</span>
      <div className="rnr-folder-body grid gap-1">
        {node.type !== 'start' && <Handle type="target" position={Position.Left} isConnectable={!readOnly} aria-hidden="true" />}
        <span className="font-medium">{nodeName(node)}</span>
        {node.type === 'end' && <span className="rnr-caption">Closes as {node.status}</span>}
        {open > 0 && <span className="rnr-caption">{open} open {open === 1 ? 'record' : 'records'} on this step</span>}
        {issues.length > 0 && <span className="rnr-error">{issues.length === 1 ? '1 issue' : `${issues.length} issues`}</span>}
        {outs.length > 0 && (
          <ul className="rnr-node-outs">
            {outs.map((o) => (
              <li key={o} className="rnr-node-out">
                <span className="rnr-caption">{OUTCOME_LABELS[o]}</span>
                <Handle id={o} type="source" position={Position.Right} isConnectable={!readOnly} aria-hidden="true" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
