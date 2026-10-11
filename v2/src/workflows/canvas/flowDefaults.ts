import { MarkerType } from '@xyflow/react'
import { NodeCard } from './NodeCard'

export const CARD_TYPES = { card: NodeCard }
/** Arrowheads live here, not in `toFlow`, so the edge objects it returns stay plain. */
export const EDGE_DEFAULTS = { markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: 'currentColor' } }
