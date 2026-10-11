import type { Edge as FlowEdge, Node as FlowNode } from '@xyflow/react'
import { OUTCOME_LABELS, TYPE_LABELS, nodeName, outcomesOf, type Action, type Graph, type Issue, type NodeType, type Outcome, type WfNode } from '../logic.ts'

export const DRAG_TYPE = 'application/x-rnr-step'
export const GRID = 16
/** Card width (208) plus room for the Yes/No labels and arrowheads between cards. */
export const STEP_GAP = 320
export const READABLE_ZOOM = 0.55
export const snap = (p: { x: number; y: number }) => ({ x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID })

export function newId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  let i = 1
  while (used.has(`${prefix}${i}`)) i++
  return `${prefix}${i}`
}

type At = { x: number; y: number }
const DEFAULTS: Record<NodeType, (id: string, position: At) => WfNode> = {
  start: (id, position) => ({ id, type: 'start', formId: '', position }),
  form: (id, position) => ({ id, type: 'form', formId: '', assignee: { role: '' }, mode: 'fill', position }),
  condition: (id, position) => ({ id, type: 'condition', rule: { field: '', operator: 'is', value: '' }, position }),
  time: (id, position) => ({ id, type: 'time', after: { amount: 1, unit: 'days' }, position }),
  end: (id, position) => ({ id, type: 'end', status: 'done', position }),
}

/** Where a step goes when there is no pointer (List view): right of the rightmost step. */
export const nextSpot = (g: Graph): At => (g.nodes.length ? snap({ x: Math.max(...g.nodes.map((n) => n.position.x)) + STEP_GAP, y: 0 }) : { x: 0, y: 0 })

/** The step's own name, or "Form 2" / "Condition 1" counted by type in node order. */
export function stepLabel(g: Graph, n: WfNode): string {
  const own = n.label?.trim()
  if (own) return own
  return `${TYPE_LABELS[n.type]} ${g.nodes.filter((x) => x.type === n.type).indexOf(n) + 1}`
}

/** A card already within one grid step is a stack the eye cannot see: nudge by 32px until the spot is free. */
function freeSpot(g: Graph, at: At): At {
  const p = snap(at)
  while (g.nodes.some((n) => Math.abs(n.position.x - p.x) < GRID && Math.abs(n.position.y - p.y) < GRID)) { p.x += 2 * GRID; p.y += 2 * GRID }
  return p
}

export function addNode(g: Graph, type: NodeType, at: At): { graph: Graph; id: string } {
  const id = newId(type === 'condition' ? 'if' : type, g.nodes.map((n) => n.id))
  return { graph: { ...g, nodes: [...g.nodes, DEFAULTS[type](id, freeSpot(g, at))] }, id }
}
export const setNode = (g: Graph, node: WfNode): Graph => ({ ...g, nodes: g.nodes.map((n) => (n.id === node.id ? node : n)) })
export const moveNode = (g: Graph, id: string, at: At): Graph => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, position: snap(at) } : n)) })
/** Drops the step and every connection into or out of it. */
export const removeNode = (g: Graph, id: string): Graph =>
  ({ nodes: g.nodes.filter((n) => n.id !== id), edges: g.edges.filter((e) => e.from !== id && e.to !== id) })

/** One connection per outcome: connecting again replaces it (keeping its actions); `to === ''` disconnects. */
export function connect(g: Graph, from: string, outcome: Outcome, to: string): Graph {
  const old = g.edges.find((e) => e.from === from && e.outcome === outcome)
  const rest = g.edges.filter((e) => e !== old)
  if (!to) return { ...g, edges: rest }
  const id = old?.id ?? newId('e', g.edges.map((e) => e.id))
  return { ...g, edges: [...rest, { id, from, outcome, to, actions: old?.actions ?? [] }] }
}
export const setActions = (g: Graph, edgeId: string, actions: Action[]): Graph =>
  ({ ...g, edges: g.edges.map((e) => (e.id === edgeId ? { ...e, actions } : e)) })

/** Issues pinned to cards: a connection's issue shows on the step it leaves. */
export function issuesByNode(g: Graph, issues: Issue[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const i of issues) {
    const id = i.nodeId ?? g.edges.find((e) => e.id === i.edgeId)?.from
    if (id) out.set(id, [...(out.get(id) ?? []), i.message])
  }
  return out
}

/** The List view's order: depth-first from Start in outcome order, then whatever Start cannot reach. */
export function stepOrder(g: Graph): { reached: WfNode[]; loose: WfNode[] } {
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const seen = new Set<string>()
  const reached: WfNode[] = []
  const visit = (n: WfNode | undefined) => {
    if (!n || seen.has(n.id)) return
    seen.add(n.id)
    reached.push(n)
    for (const o of outcomesOf(n)) visit(byId.get(g.edges.find((e) => e.from === n.id && e.outcome === o)?.to ?? ''))
  }
  visit(g.nodes.find((n) => n.type === 'start'))
  return { reached, loose: g.nodes.filter((n) => !seen.has(n.id)) }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export type CardData = { node: WfNode; issues: string[]; open: number; current: boolean; readOnly: boolean }
export type CardNode = FlowNode<CardData, 'card'>
type FlowOpts = { issues?: Map<string, string[]>; open?: Map<string, number>; selected?: string | null; current?: string | null; readOnly?: boolean }

export function toFlow(g: Graph, opts: FlowOpts = {}): { nodes: CardNode[]; edges: FlowEdge[] } {
  return {
    nodes: g.nodes.map((n) => {
      const issues = opts.issues?.get(n.id) ?? []
      const open = opts.open?.get(n.id) ?? 0
      const parts = [`${TYPE_LABELS[n.type]} step: ${nodeName(n)}`]
      if (issues.length) parts.push(plural(issues.length, 'issue', 'issues'))
      if (open) parts.push(`${plural(open, 'open record', 'open records')} on this step`)
      return {
        id: n.id,
        type: 'card' as const,
        position: n.position,
        selected: n.id === opts.selected,
        ariaLabel: parts.length > 1 ? `${parts.join('. ')}.` : parts[0],
        data: { node: n, issues, open, current: n.id === opts.current, readOnly: !!opts.readOnly },
      }
    }),
    edges: g.edges.map((e) => ({
      id: e.id,
      source: e.from,
      sourceHandle: e.outcome,
      target: e.to,
      label: e.actions.length ? `${OUTCOME_LABELS[e.outcome]} · ${plural(e.actions.length, 'action', 'actions')}` : OUTCOME_LABELS[e.outcome],
    })),
  }
}

const CARD_W = 208
/**
 * The viewport the Map opens with, from positions alone (ReactFlow cannot fit before it has measured the cards, and
 * its own fit may go below the pane minimum). Never below READABLE_ZOOM: a wider graph opens at its left edge, where Start is.
 */
export function readableViewport(g: { nodes: { x: number; y: number; outs: number }[] }, pane: { w: number; h: number }) {
  const MARGIN = 24
  const minX = Math.min(...g.nodes.map((n) => n.x))
  const minY = Math.min(...g.nodes.map((n) => n.y))
  const width = Math.max(...g.nodes.map((n) => n.x + CARD_W)) - minX
  const height = Math.max(...g.nodes.map((n) => n.y + 72 + n.outs * 28)) - minY
  const zoom = Math.min(1, Math.max(READABLE_ZOOM, Math.min((pane.w - 2 * MARGIN) / width, (pane.h - 2 * MARGIN) / height)))
  const fits = width * zoom <= pane.w - 2 * MARGIN
  return { zoom, x: fits ? (pane.w - width * zoom) / 2 - minX * zoom : MARGIN - minX * zoom, y: height * zoom <= pane.h - 2 * MARGIN ? (pane.h - height * zoom) / 2 - minY * zoom : MARGIN - minY * zoom }
}
