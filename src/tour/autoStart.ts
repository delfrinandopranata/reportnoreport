export interface TourState {
  status: 'not_started' | 'in_progress' | 'done' | 'skipped'
  step: number
}

export function shouldAutoStart(pref: TourState, hasRoleAndFirm: boolean): boolean {
  return pref.status === 'not_started' && hasRoleAndFirm
}
