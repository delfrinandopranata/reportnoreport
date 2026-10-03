import type { Role, Action } from '../users/rules.ts'
import { can } from '../users/rules.ts'

export interface TourStep {
  id: string
  title: string
  description: string
  position: 'top' | 'bottom' | 'left' | 'right'
}

export interface TourStepDefinition extends TourStep {
  requiredAction?: Action
}

export const TOUR_STEP_IDS = {
  DASHBOARD: 'dashboard',
  CLIENTS: 'clients',
  ADD_CLIENT: 'add-client',
  CLIENT_PROFILE: 'client-profile',
  TRANSACTION: 'record-transaction',
  STATEMENT: 'statement',
  IMPORT: 'import-export',
  USERS: 'users-and-invites',
  SETTINGS: 'settings-and-billing',
  HELP: 'help-menu',
} as const

const STEPS_ALL: TourStepDefinition[] = [
  { id: TOUR_STEP_IDS.DASHBOARD, title: 'Welcome to ReportNoReport', description: 'This is your dashboard. Here you see a quick overview of your firm.', position: 'bottom' },
  { id: TOUR_STEP_IDS.CLIENTS, title: 'Manage Clients', description: 'View all your clients and their balances here.', position: 'bottom' },
  { id: TOUR_STEP_IDS.ADD_CLIENT, title: 'Add a Client', description: 'Click here to add a new client to your firm.', position: 'bottom', requiredAction: 'clients.edit' },
  { id: TOUR_STEP_IDS.CLIENT_PROFILE, title: 'Client Profile', description: 'View client details and their transaction history.', position: 'bottom' },
  { id: TOUR_STEP_IDS.TRANSACTION, title: 'Record a Transaction', description: 'Post receipts and payments for your clients.', position: 'bottom', requiredAction: 'transactions.post' },
  { id: TOUR_STEP_IDS.STATEMENT, title: 'Statement of Account', description: 'Generate and export statements for your clients.', position: 'bottom' },
  { id: TOUR_STEP_IDS.IMPORT, title: 'Import and Export', description: 'Bulk import transactions from a CSV file.', position: 'bottom', requiredAction: 'transactions.post' },
  { id: TOUR_STEP_IDS.USERS, title: 'Team and Roles', description: 'Invite team members and manage their permissions.', position: 'bottom', requiredAction: 'users.manage' },
  { id: TOUR_STEP_IDS.SETTINGS, title: 'Settings and Billing', description: 'Configure your firm details, bank accounts, and billing.', position: 'bottom', requiredAction: 'settings.manage' },
  { id: TOUR_STEP_IDS.HELP, title: 'Help and Replay', description: 'Need a reminder? Replay the tour or get help from here.', position: 'bottom' },
]

export function filterTourStepsByRole(role: Role): TourStep[] {
  return STEPS_ALL.filter(step => {
    if (!step.requiredAction) {
      return true
    }
    try {
      return can(role, step.requiredAction)
    } catch {
      // Unknown role: only show read-only steps (safe minimal set)
      return false
    }
  }).map(({ requiredAction: _requiredAction, ...step }) => step)
}
