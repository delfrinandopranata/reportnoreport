import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { filterTourStepsByRole, TOUR_STEP_IDS } from './steps.ts'

test('filterTourStepsByRole: owner sees all steps', () => {
  const steps = filterTourStepsByRole('owner')
  assert.equal(steps.length, 10, 'owner should see 10 steps')
})

test('filterTourStepsByRole: admin sees all steps', () => {
  const steps = filterTourStepsByRole('admin')
  assert.equal(steps.length, 10, 'admin should see 10 steps')
})

test('filterTourStepsByRole: accountant sees 8 steps', () => {
  const steps = filterTourStepsByRole('accountant')
  assert.equal(steps.length, 8, 'accountant should see 8 steps')
  assert(steps.some(s => s.id === TOUR_STEP_IDS.DASHBOARD), 'accountant should see dashboard')
  assert(steps.some(s => s.id === TOUR_STEP_IDS.ADD_CLIENT), 'accountant should see add client')
  assert(steps.some(s => s.id === TOUR_STEP_IDS.TRANSACTION), 'accountant should see transaction')
  assert(!steps.some(s => s.id === TOUR_STEP_IDS.USERS), 'accountant should not see users')
  assert(!steps.some(s => s.id === TOUR_STEP_IDS.SETTINGS), 'accountant should not see settings')
})

test('filterTourStepsByRole: viewer sees 5 steps', () => {
  const steps = filterTourStepsByRole('viewer')
  assert.equal(steps.length, 5, 'viewer should see 5 steps')
  assert(steps.some(s => s.id === TOUR_STEP_IDS.DASHBOARD), 'viewer should see dashboard')
  assert(steps.some(s => s.id === TOUR_STEP_IDS.CLIENTS), 'viewer should see clients')
  assert(steps.some(s => s.id === TOUR_STEP_IDS.CLIENT_PROFILE), 'viewer should see client profile')
  assert(steps.some(s => s.id === TOUR_STEP_IDS.STATEMENT), 'viewer should see statement')
  assert(steps.some(s => s.id === TOUR_STEP_IDS.HELP), 'viewer should see help')
  assert(!steps.some(s => s.id === TOUR_STEP_IDS.ADD_CLIENT), 'viewer should not see add client')
  assert(!steps.some(s => s.id === TOUR_STEP_IDS.TRANSACTION), 'viewer should not see transaction')
  assert(!steps.some(s => s.id === TOUR_STEP_IDS.USERS), 'viewer should not see users')
  assert(!steps.some(s => s.id === TOUR_STEP_IDS.SETTINGS), 'viewer should not see settings')
})

test('filterTourStepsByRole: step ordering is stable', () => {
  const ownerSteps = filterTourStepsByRole('owner')
  const ownerIds = ownerSteps.map(s => s.id)
  assert.deepEqual(ownerIds, [
    TOUR_STEP_IDS.DASHBOARD,
    TOUR_STEP_IDS.CLIENTS,
    TOUR_STEP_IDS.ADD_CLIENT,
    TOUR_STEP_IDS.CLIENT_PROFILE,
    TOUR_STEP_IDS.TRANSACTION,
    TOUR_STEP_IDS.STATEMENT,
    TOUR_STEP_IDS.IMPORT,
    TOUR_STEP_IDS.USERS,
    TOUR_STEP_IDS.SETTINGS,
    TOUR_STEP_IDS.HELP,
  ])
})
