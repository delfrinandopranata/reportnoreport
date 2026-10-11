import '@xyflow/react/dist/style.css'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow, type Connection, type Edge as FlowEdge, type NodeChange } from '@xyflow/react'
import { useTemplates } from '../../comms/api'
import { useForms } from '../../forms/api'
import { useMemberEmails } from '../../members/useMemberEmails'
import { useOrg } from '../../rbac/useOrg'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { CheckIcon, PencilIcon } from '../../ui/icons'
import { setNavGuard, type Next } from '../../ui/navGuard'
import { useAction } from '../../ui/useAction'
import { useFocusAfterRender } from '../../ui/useFocusAfterRender'
import { useMedia } from '../../ui/useMedia'
import { NODE_TYPES, OUTCOME_LABELS, outcomesOf, TYPE_LABELS, checkGraph, nodeName, type NodeType, type Outcome } from '../logic'
import { saveWorkflow, useOpenCounts, useRoles, type LoadedWorkflow } from '../api'
import { WorkflowStatusMark } from '../StatusMark'
import { WorkflowGate } from '../WorkflowGate'
import { DRAG_TYPE, addNode, clearSpot, connect, nextSpot, issuesByNode, moveNode, readableViewport, removeNode, toFlow, type CardNode } from './canvasOps'
import { CARD_TYPES, EDGE_DEFAULTS } from './flowDefaults'
import { Palette } from './Palette'
import { SidePanel } from './SidePanel'
import { StepList } from './StepList'
import { StepSheet } from './StepSheet'

const VIEW_KEY = 'rnr.wfView'
type View = 'map' | 'list'
const MOVE_HELP = 'Press Enter or Space to select this step. With it selected, press the arrow keys to move it.'
// xyflow 12.12 reads the `keyboardDisabled` text when keyboard moves are enabled (its keys are swapped), so both carry the help.
const ARIA = {
  'node.a11yDescription.ariaLiveMessage': ({ direction }: { direction: string }) => `Moved ${direction}.`,
  'node.a11yDescription.default': MOVE_HELP,
  'node.a11yDescription.keyboardDisabled': MOVE_HELP,
}
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function readView(fallback: View): View {
  try { const v = localStorage.getItem(VIEW_KEY); return v === 'map' || v === 'list' ? v : fallback } catch { return fallback }
}

function Editor({ wf, onReload, reloaded }: { wf: LoadedWorkflow; onReload(): void; reloaded: boolean }) {
  const { orgId, can } = useOrg()
  const qc = useQueryClient()
  const flow = useReactFlow()
  const board = useRef<HTMLDivElement>(null)
  const focusLater = useFocusAfterRender()
  const save = useAction()
  const isMd = useMedia('(min-width: 768px)')
  const isLg = useMedia('(min-width: 1024px)')
  const [graph, setGraph] = useState(wf.graph)
  const [name, setName] = useState(wf.name)
  const [saved, setSaved] = useState({ graph: wf.graph, name: wf.name, version: wf.updated_at, status: wf.status })
  const [sel, setSel] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(reloaded ? { text: 'Workflow reloaded.', error: false } : null)
  const [nameError, setNameError] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [which, setWhich] = useState<'draft' | 'publish'>('draft')
  const [leaveTo, setLeaveTo] = useState<Next | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [view, setView] = useState<View>(() => readView(isMd ? 'map' : 'list'))
  const [sheet, setSheet] = useState(false)
  const [palette, setPalette] = useState(false)
  const [announce, setAnnounce] = useState('')

  const forms = useForms(orgId)
  const roles = useRoles(orgId)
  const members = useMemberEmails(orgId)
  const counts = useOpenCounts(wf.id)
  const templates = useTemplates(orgId)
  const refs = useMemo(() => (forms.data && roles.data && members.data && templates.data
    ? {
        forms: new Set(forms.data.map((f) => f.id)), roles: new Set(roles.data.map((r) => r.id)),
        users: new Set(members.data.keys()), templates: new Set(templates.data.map((t) => t.id)),
      }
    : null), [forms.data, roles.data, members.data, templates.data])
  const issues = useMemo(() => (refs ? checkGraph(graph, refs) : []), [graph, refs])
  const pinned = useMemo(() => issuesByNode(graph, issues), [graph, issues])
  const readOnly = !isMd
  const mapView = useMemo(() => toFlow(graph, { issues: pinned, open: counts.data, selected: sel, readOnly }), [graph, pinned, counts.data, sel, readOnly])
  const selected = graph.nodes.find((n) => n.id === sel)
  const dirty = graph !== saved.graph || name.trim() !== saved.name
  const canPublish = can('workflows.publish')
  const isDraft = saved.status === 'draft'
  const say = (t: string) => setAnnounce(t)

  useEffect(() => {
    if (reloaded) document.getElementById('wf-edit-h')?.focus()
  }, [reloaded])
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    addEventListener('beforeunload', warn)
    setNavGuard((next) => { if (next === `#/workflows/${wf.id}/edit`) return false; setLeaveTo(() => next); return true })
    return () => { removeEventListener('beforeunload', warn); setNavGuard(null) }
  }, [dirty, wf.id])

  // Open at a readable zoom from positions alone; a timer, not rAF or measurement, so it also runs in a hidden tab.
  const opened = useRef(false)
  useEffect(() => {
    if (view !== 'map') { opened.current = false; return }
    if (opened.current || !graph.nodes.length) return
    const id = window.setTimeout(() => {
      const pane = board.current
      if (!pane) return
      opened.current = true
      const outs = (n: (typeof graph.nodes)[number]) => outcomesOf(n).length
      flow.setViewport(readableViewport({ nodes: graph.nodes.map((n) => ({ x: n.position.x, y: n.position.y, outs: outs(n) })) }, { w: pane.clientWidth, h: pane.clientHeight }), { duration: 0 })
    }, 30)
    return () => clearTimeout(id)
  }, [view, graph, flow])

  const chooseView = (v: View) => {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* private mode */ }
  }
  const openStep = (id: string) => { setSel(id); if (!isLg) setSheet(true) }

  const onNodesChange = (changes: NodeChange<CardNode>[]) => {
    for (const c of changes) {
      if (c.type === 'position' && c.position) { const at = c.position; setGraph((g) => moveNode(g, c.id, at)) }
      if (c.type === 'select') { if (c.selected) openStep(c.id); else setSel((s) => (s === c.id ? null : s)) }
    }
  }
  const onConnect = (c: Connection) => {
    if (!c.sourceHandle) return
    setGraph((g) => connect(g, c.source, c.sourceHandle as Outcome, c.target))
    const from = graph.nodes.find((n) => n.id === c.source)
    const to = graph.nodes.find((n) => n.id === c.target)
    say(`${OUTCOME_LABELS[c.sourceHandle as Outcome]} of ${nodeName(from)} now goes to ${nodeName(to)}.`)
  }
  const onEdgeClick = (_: unknown, e: FlowEdge) => {
    openStep(e.source)
    focusLater(() => document.querySelector<HTMLElement>(`#out-${e.sourceHandle} legend`))
  }

  const add = (type: NodeType, screen?: { x: number; y: number }) => {
    const start = graph.nodes.find((n) => n.type === 'start')
    if (type === 'start' && start) {
      openStep(start.id)
      say('A workflow has one Start step. Selected it.')
      return
    }
    let at = { x: 0, y: 0 }
    if (view === 'map') {
      const r = board.current!.getBoundingClientRect()
      const p = flow.screenToFlowPosition(screen ?? { x: r.left + r.width / 2 - 104, y: r.top + r.height / 2 - 40 })
      at = screen ? p : clearSpot(graph, p) // a drop lands where the pointer is; a click or Enter must not land on a card
    } else at = nextSpot(graph)
    const { graph: g, id } = addNode(graph, type, at)
    setGraph(g)
    setSel(id)
    say(`${TYPE_LABELS[type]} step added. ${g.nodes.length} steps in total.`)
    if (isLg) focusLater('sp-h')
    else setSheet(true)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    const t = e.dataTransfer.getData(DRAG_TYPE)
    if ((NODE_TYPES as readonly string[]).includes(t)) add(t as NodeType, { x: e.clientX, y: e.clientY })
  }
  const show = (id: string, text?: string) => {
    setSel(id)
    say(text ?? `Showing ${nodeName(graph.nodes.find((n) => n.id === id))}.`)
    if (view === 'map') {
      flow.fitView({ nodes: [{ id }], maxZoom: 1, duration: 0 })
      focusLater(() => board.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`))
    } else {
      focusLater(() => { const el = document.getElementById(`step-row-${id}`); el?.scrollIntoView({ block: 'center' }); return el })
    }
  }
  const pickFromList = (id: string) => {
    const n = pinned.get(id)?.length ?? 0
    say(`Showing ${nodeName(graph.nodes.find((x) => x.id === id))}.${n ? ` ${plural(n, 'issue', 'issues')}.` : ''}`)
    openStep(id)
  }

  const submit = (publish: boolean) => save.run(async () => {
    setMessage(null); setConflict(false); setNameError(false); setWhich(publish ? 'publish' : 'draft')
    if (!name.trim()) { setNameError(true); focusLater('wf-name'); return false }
    if (publish && issues.length) {
      setMessage({ text: `Fix the ${issues.length === 1 ? 'issue' : `${issues.length} issues`} listed below before publishing.`, error: true })
      focusLater('wf-issues')
      return false
    }
    const sent = { graph, name: name.trim() }
    const res = await saveWorkflow({ workflowId: wf.id, name: sent.name, graph, updatedAt: saved.version, publish })
    if (!res.ok) {
      setMessage({ text: res.error, error: true })
      setConflict(!!res.conflict)
      if (res.nodeId) show(res.nodeId)
      return false
    }
    setSaved({ ...sent, version: res.updatedAt, status: res.status })
    qc.setQueryData(['workflow', wf.id], { ...wf, name: sent.name, graph, status: res.status, updated_at: res.updatedAt })
    await Promise.all([qc.invalidateQueries({ queryKey: ['workflows', orgId] }), qc.invalidateQueries({ queryKey: ['startable', orgId] })])
    setMessage({
      text: publish ? 'Workflow published. People with access can start it from their Inbox.'
        : isDraft ? `Draft saved.${issues.length ? ` ${plural(issues.length, 'issue', 'issues')} still to fix before publishing.` : ''}` : 'Changes saved.',
      error: false,
    })
  }, true)

  const busyLabel = (p: boolean) => (p ? 'Publishing…' : 'Saving…')
  const button = (publish: boolean, primary: boolean, idle: string) => {
    const mine = save.busy && which === (publish ? 'publish' : 'draft')
    return (
      <button className={`rnr-btn ${primary ? 'rnr-btn-primary' : 'rnr-btn-secondary'}`} type="button" aria-busy={mine} onClick={() => submit(publish)}>
        {mine && <span className="rnr-spin" aria-hidden="true" />}{save.saved && !save.busy && primary && <CheckIcon />}
        {mine ? busyLabel(publish) : save.saved && primary ? 'Saved' : idle}
      </button>
    )
  }
  const heading = issues.length
    ? `${plural(issues.length, 'issue', 'issues')} to fix before publishing`
    : isDraft ? 'Ready to publish' : 'No issues'
  const panel = selected && (
    <SidePanel graph={graph} node={selected} open={counts.data?.get(selected.id) ?? 0} forms={forms.data ?? []}
      roles={roles.data ?? []} members={members.data ?? new Map()} messages={{ templates: templates.data ?? [], canManageTemplates: can('comms.manage') }} onChange={setGraph} onDelete={() => setDeleting(selected.id)} onSay={say} inSheet={!isLg} />
  )
  const deletingNode = graph.nodes.find((n) => n.id === deleting)

  return (
    <section className="flex flex-col gap-4" aria-labelledby="wf-edit-h">
      <h1 id="wf-edit-h" tabIndex={-1} className="page-title">Edit workflow</h1>
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>

      <div className="rnr-card gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="rnr-field flex-1 min-w-[240px]" data-invalid={nameError ? true : undefined}>
            <label className="rnr-label" htmlFor="wf-name">Workflow name</label>
            <input id="wf-name" className="rnr-input" required maxLength={120} value={name} aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? 'wf-name-err' : undefined} onChange={(e) => { setName(e.target.value); setNameError(false) }} />
            {nameError && <p id="wf-name-err" className="rnr-error">Enter a name for this workflow.</p>}
          </div>
          <WorkflowStatusMark status={saved.status} />
          {dirty && <span className="rnr-status"><PencilIcon size={14} />Unsaved changes</span>}
          <a className="rnr-btn rnr-btn-ghost" href={`#/workflows/${wf.id}/access`}>Access</a>
          {isDraft ? <>{button(false, !canPublish, 'Save draft')}{canPublish && button(true, true, 'Publish workflow')}</> : button(false, true, 'Save changes')}
        </div>
        {message?.error && <p className="rnr-error" role="alert">{message.text}</p>}
        <p className="rnr-status" role="status">{message && !message.error && <><CheckIcon size={14} />{message.text}</>}</p>
        {conflict && (
          <div className="flex flex-col gap-1 items-start">
            <button className="rnr-btn rnr-btn-secondary" type="button" onClick={onReload}>Reload workflow</button>
            <p className="rnr-caption">Reloading discards your unsaved changes.</p>
          </div>
        )}
        {!isDraft && dirty && <p className="rnr-caption">This workflow is published. Saved changes apply to records already in progress.</p>}
        {isDraft && !canPublish && <p className="rnr-caption">You can save drafts. Someone with the Publish workflows permission can publish this one.</p>}
      </div>

      <section id="wf-issues" className="rnr-card gap-2" tabIndex={0} role="region" aria-labelledby="iss-h" style={{ maxHeight: '11rem', overflowY: 'auto' }}>
        <h2 id="iss-h" className="dialog-title">{heading}</h2>
        {issues.length > 0 && (
          <ul className="flex flex-col gap-2">
            {issues.map((i, n) => {
              const at = i.nodeId ?? graph.edges.find((e) => e.id === i.edgeId)?.from
              const step = graph.nodes.find((x) => x.id === at)
              return (
                <li key={n} className="flex items-start gap-2">
                  <span className="flex-1">{i.message}</span>
                  {step && <button className="rnr-btn rnr-btn-ghost" type="button" aria-label={`Show ${nodeName(step)}`} onClick={() => show(step.id, `Showing ${nodeName(step)}: ${i.message}`)}>Show</button>}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <Palette onAdd={add} sheetOpen={palette} setSheetOpen={setPalette} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-label="Workflow board" className="rnr-card gap-3 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rnr-seg" role="group" aria-label="View">
              <button id="wf-view-map" type="button" aria-pressed={view === 'map'} onClick={() => chooseView('map')}>Map</button>
              <button id="wf-view-list" type="button" aria-pressed={view === 'list'} onClick={() => chooseView('list')}>List</button>
            </div>
            {view === 'map' && (
              <button type="button" className="sr-only focus:not-sr-only rnr-btn rnr-btn-ghost"
                onClick={() => focusLater(isLg && selected ? 'sp-h' : 'wf-issues')}>Skip the map</button>
            )}
          </div>
          {view === 'map' ? (
            <div ref={board} className="rnr-canvas wf-board" style={{ height: 'clamp(480px, 70dvh, 720px)' }}
              onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
              <ReactFlow nodes={mapView.nodes} edges={mapView.edges} nodeTypes={CARD_TYPES} onNodesChange={onNodesChange} onConnect={onConnect}
                onEdgeClick={onEdgeClick} onPaneClick={() => setSel(null)} snapToGrid snapGrid={[16, 16]} deleteKeyCode={null}
                selectionKeyCode={null} multiSelectionKeyCode={null} edgesFocusable={false} selectNodesOnDrag={false}
                nodesDraggable={isMd} nodesConnectable={isMd} proOptions={{ hideAttribution: false }} defaultEdgeOptions={EDGE_DEFAULTS}
                ariaLabelConfig={ARIA} minZoom={0.3}>
                <Background gap={16} size={1} color="var(--chart-grid)" />
                <Controls showInteractive={false} />
              </ReactFlow>
            </div>
          ) : (
            <StepList graph={graph} selected={sel} issues={pinned} open={counts.data} onSelect={pickFromList} />
          )}
          {view === 'map' && !isMd && <p className="rnr-caption">Switch to List to add, connect or move steps on a phone.</p>}
        </section>

        {isLg && (
          <div className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto min-w-0"
            {...(selected ? { tabIndex: 0, role: 'region', 'aria-labelledby': 'sp-h' } : {})}>
            {selected ? panel : <div className="rnr-card"><p className="rnr-muted">Select a step to set it up, or add one from Add a step.</p></div>}
          </div>
        )}
      </div>

      {!isLg && (
        <StepSheet open={sheet && !!selected} title={selected ? `${TYPE_LABELS[selected.type]} step` : 'Step'} onClose={() => setSheet(false)}>
          {panel}
        </StepSheet>
      )}

      <ConfirmDialog open={!!deleting} title={`Delete ${nodeName(deletingNode)}?`}
        body="Its connections are removed too. Save the workflow to apply the change."
        confirmLabel="Delete step" busyLabel="Deleting…" busy={false} error={null}
        onConfirm={() => {
          const left = graph.nodes.length - 1
          setGraph(removeNode(graph, deleting!)); setSel(null); setDeleting(null); setSheet(false)
          say(`${nodeName(deletingNode)} deleted. ${plural(left, 'step', 'steps')} left.`)
          focusLater(view === 'map' ? 'wf-view-map' : 'wf-view-list')
        }}
        onClose={() => setDeleting(null)} />
      <ConfirmDialog open={!!leaveTo} title="Leave without saving?" body={`Your changes to ${name.trim() || 'this workflow'} will be lost.`}
        confirmLabel="Leave without saving" busyLabel="Leaving…" busy={false} error={null}
        onConfirm={() => { const to = leaveTo; setNavGuard(null); setLeaveTo(null); if (typeof to === 'function') to(); else if (to) location.hash = to }}
        onClose={() => setLeaveTo(null)} />
    </section>
  )
}

export function WorkflowEditor({ id }: { id: string }) {
  const qc = useQueryClient()
  const [round, setRound] = useState(0)
  const reload = async () => {
    setNavGuard(null)
    await Promise.all([qc.refetchQueries({ queryKey: ['workflow', id] }), qc.invalidateQueries({ queryKey: ['open-counts', id] })])
    setRound((r) => r + 1)
  }
  return (
    <WorkflowGate id={id}>
      {(wf) => <ReactFlowProvider><Editor key={round} wf={wf} onReload={reload} reloaded={round > 0} /></ReactFlowProvider>}
    </WorkflowGate>
  )
}
