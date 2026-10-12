import { useMemo } from 'react'
import { Background, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { nodeById, nodeName, type Graph } from '../logic'
import { toFlow } from './canvasOps'
import { CARD_TYPES, EDGE_DEFAULTS } from './flowDefaults'

/** Read-only map. The page states the current step in text as well, so the picture is never the only source. */
export function MiniCanvas({ graph, current }: { graph: Graph; current: string | null }) {
  const view = useMemo(() => toFlow(graph, { current, readOnly: true }), [graph, current])
  return (
    <div className="rnr-canvas rnr-flow rnr-flow--readonly h-[clamp(240px,40dvh,360px)]" role="img"
      aria-label={`Workflow map. Current step: ${nodeName(current ? nodeById(graph, current) : undefined)}.`}>
      {/* inert: React Flow renders focusable parts, and an image role must hold none */}
      <div inert className="h-full">
      <ReactFlowProvider>
        <ReactFlow nodes={view.nodes} edges={view.edges} nodeTypes={CARD_TYPES} defaultEdgeOptions={EDGE_DEFAULTS}
          nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false} elementsSelectable={false}
          zoomOnScroll={false} preventScrolling={false} minZoom={0.3} fitView fitViewOptions={{ duration: 0 }}>
          <Background gap={16} size={1} />
        </ReactFlow>
      </ReactFlowProvider>
      </div>
    </div>
  )
}
