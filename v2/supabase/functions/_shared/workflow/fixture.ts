import type { Graph, Refs } from './graph.ts'

export const WF = '0000000a-0000-0000-0000-00000000c001'
export const F_LEAVE = '0000000a-0000-0000-0000-0000000000f1'
export const F_APPROVAL = '0000000a-0000-0000-0000-0000000000f3'
export const ROLE_ADMIN = '0000000a-0000-0000-0000-00000000a001'
export const ADMIN = '00000000-0000-0000-0000-0000000000a2'
export const MEMBER = '00000000-0000-0000-0000-0000000000a3'

const at = (x: number, y: number) => ({ x, y })

export const LEAVE: Graph = {
  nodes: [
    { id: 'start', type: 'start', formId: F_LEAVE, position: at(0, 0) },
    { id: 'approve', type: 'form', label: 'Manager approval', formId: F_APPROVAL, assignee: { role: ROLE_ADMIN }, mode: 'approve', due: { amount: 2, unit: 'days' }, position: at(240, 0) },
    { id: 'long', type: 'condition', label: 'More than 2 days?', rule: { field: 'days', operator: 'gt', value: 2 }, position: at(480, 0) },
    { id: 'wait', type: 'time', label: 'Wait a day', after: { amount: 1, unit: 'days' }, position: at(720, 0) },
    { id: 'done', type: 'end', label: 'Approved', status: 'done', position: at(960, 0) },
    { id: 'rejected', type: 'end', label: 'Rejected', status: 'rejected', position: at(480, 160) },
  ],
  edges: [
    { id: 'e1', from: 'start', outcome: 'submitted', to: 'approve', actions: [] },
    { id: 'e2', from: 'approve', outcome: 'approved', to: 'long', actions: [{ type: 'send_message' }] },
    { id: 'e3', from: 'approve', outcome: 'rejected', to: 'rejected', actions: [{ type: 'set_status', label: 'Rejected by manager' }] },
    { id: 'e4', from: 'long', outcome: 'yes', to: 'wait', actions: [] },
    { id: 'e5', from: 'long', outcome: 'no', to: 'done', actions: [] },
    { id: 'e6', from: 'wait', outcome: 'next', to: 'done', actions: [{ type: 'generate_pdf' }] },
  ],
}

export const REFS: Refs = { forms: new Set([F_LEAVE, F_APPROVAL]), roles: new Set([ROLE_ADMIN]), users: new Set([ADMIN, MEMBER]) }

/** A deep copy to change in one test without touching the others. */
export const leave = (): Graph => structuredClone(LEAVE)
