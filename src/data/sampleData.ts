import type { Role } from '../users/rules.ts'
import { can } from '../users/rules.ts'

/**
 * Determines which sample data controls are visible for a given role and state.
 * Returns an object indicating whether to show import and remove actions.
 */
export function sampleControls(role: Role, hasSampleData: boolean): {
  canImport: boolean
  canRemove: boolean
  canViewBanner: boolean
} {
  const canManageSettings = can(role, 'settings.manage')
  return {
    canImport: canManageSettings && !hasSampleData,
    canRemove: canManageSettings && hasSampleData,
    canViewBanner: hasSampleData,
  }
}
