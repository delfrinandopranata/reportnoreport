export type StepType = 'FORM' | 'APPROVAL' | 'BRANCH' | 'TIMER' | 'EMAIL' | 'CAMPAIGN' | 'PDF' | 'DASHBOARD' | 'RECORD'
export type Step = { id: string; type: StepType; title: string; lane: number; col: number; note: string; timer?: { n: number; unit: 'day' | 'month' } }
export type Edge = [from: string, to: string, label?: string]
export type Programme = {
  key: string; name: string; blurb: string; lanes: string[]; steps: Step[]; edges: Edge[]
  /** Visiting sequence, loops included; every consecutive pair is an edge. */
  order: string[]
}

export const ICON: Record<StepType, string> = {
  FORM: 'i-note-pencil', APPROVAL: 'i-stamp', BRANCH: 'i-git-branch', TIMER: 'i-clock', EMAIL: 'i-envelope-simple',
  CAMPAIGN: 'i-megaphone', PDF: 'i-file-pdf', DASHBOARD: 'i-chart-line-up', RECORD: 'i-database',
}

export const PROGRAMMES: Programme[] = [
  {
    key: 'mentorship', name: 'Mentorship programme',
    blurb: 'A six-month cohort that pairs each student with a mentor, checks in monthly and ends with a certificate.',
    lanes: ['Student', 'Coordinator', 'Mentor', 'System'],
    steps: [
      { id: 'app', type: 'FORM', title: 'Application form', lane: 0, col: 0, note: 'Aisha Rahman applies for the September 2026 cohort.' },
      { id: 'screen', type: 'BRANCH', title: 'Screening', lane: 1, col: 1, note: 'Ms Tan screens the application: a good fit moves on, otherwise the student is waitlisted.' },
      { id: 'wait', type: 'EMAIL', title: 'Waitlist email', lane: 3, col: 2, note: 'Waitlisted students are told the next intake date by email.' },
      { id: 'match', type: 'APPROVAL', title: 'Mentor matching', lane: 2, col: 2, note: 'Dr Okafor approves the match with Aisha.' },
      { id: 'kick', type: 'EMAIL', title: 'Kickoff email', lane: 3, col: 3, note: 'Student and mentor both receive the kickoff details for Monday 7 September.' },
      { id: 'timer', type: 'TIMER', title: 'Next check-in', lane: 3, col: 4, timer: { n: 30, unit: 'day' }, note: 'A 30-day timer starts before each monthly check-in.' },
      { id: 'check', type: 'FORM', title: 'Monthly check-in', lane: 0, col: 5, note: 'Aisha reports progress. The timer and form repeat six times.' },
      { id: 'survey', type: 'CAMPAIGN', title: 'Mid-point survey', lane: 1, col: 6, note: 'The whole cohort receives the mid-point survey in one campaign.' },
      { id: 'done', type: 'APPROVAL', title: 'Completion approval', lane: 2, col: 7, note: 'Dr Okafor signs off completion in March 2027.' },
      { id: 'cert', type: 'PDF', title: 'Certificate', lane: 3, col: 8, note: 'A certificate PDF is generated for the student.' },
      { id: 'dash', type: 'DASHBOARD', title: 'Cohort dashboard', lane: 1, col: 9, note: 'Ms Tan sees completion and survey results for the whole cohort.' },
    ],
    edges: [['app', 'screen'], ['screen', 'match', 'good fit'], ['screen', 'wait', 'waitlist'], ['match', 'kick'], ['kick', 'timer'], ['timer', 'check'],
      ['check', 'timer', '×6'], ['check', 'survey'], ['survey', 'done'], ['done', 'cert'], ['cert', 'dash']],
    order: ['app', 'screen', 'match', 'kick', 'timer', 'check', 'timer', 'check', 'survey', 'done', 'cert', 'dash'],
  },
  {
    key: 'internship', name: 'International internship',
    blurb: 'Places students with partner employers abroad, from adviser sign-off to a final report and outcomes dashboard.',
    lanes: ['Student', 'Academic adviser', 'Partner employer', 'Coordinator', 'System'],
    steps: [
      { id: 'app', type: 'FORM', title: 'Application', lane: 0, col: 0, note: 'Daniel Lim applies for a summer 2027 placement in Singapore.' },
      { id: 'adv', type: 'APPROVAL', title: 'Adviser approval', lane: 1, col: 1, note: 'Prof. Hughes confirms the placement fits Daniel’s degree.' },
      { id: 'match', type: 'FORM', title: 'Placement matching', lane: 3, col: 2, note: 'Ms Patel proposes an employer from the partner list.' },
      { id: 'emp', type: 'BRANCH', title: 'Employer decision', lane: 2, col: 3, note: 'The employer accepts, or declines and the request returns to matching.' },
      { id: 'visa', type: 'FORM', title: 'Visa and insurance', lane: 0, col: 4, note: 'Daniel completes the visa and insurance checklist.' },
      { id: 'brief', type: 'EMAIL', title: 'Briefing email', lane: 4, col: 5, note: 'The pre-departure briefing is emailed on Monday 8 June 2027.' },
      { id: 'timer', type: 'TIMER', title: 'Weekly logbook', lane: 4, col: 6, timer: { n: 7, unit: 'day' }, note: 'A 7-day timer opens each weekly logbook entry, every week of the placement.' },
      { id: 'late', type: 'EMAIL', title: 'Late reminder', lane: 4, col: 7, note: 'If a logbook is late, Daniel gets a reminder email.' },
      { id: 'log', type: 'FORM', title: 'Logbook entry', lane: 0, col: 7, note: 'Daniel records the week’s work and hours.' },
      { id: 'eval', type: 'FORM', title: 'Employer evaluation', lane: 2, col: 8, note: 'The employer rates Daniel at the end of the placement.' },
      { id: 'rep', type: 'PDF', title: 'Final report', lane: 4, col: 9, note: 'The final report is compiled as a PDF.' },
      { id: 'dash', type: 'DASHBOARD', title: 'Outcomes dashboard', lane: 3, col: 10, note: 'Ms Patel reviews placements and ratings across the year.' },
    ],
    edges: [['app', 'adv'], ['adv', 'match'], ['match', 'emp'], ['emp', 'match', 'declines'], ['emp', 'visa', 'accepts'], ['visa', 'brief'], ['brief', 'timer'],
      ['timer', 'late', 'if late'], ['late', 'log'], ['log', 'eval'], ['eval', 'rep'], ['rep', 'dash']],
    order: ['app', 'adv', 'match', 'emp', 'match', 'emp', 'visa', 'brief', 'timer', 'late', 'log', 'eval', 'rep', 'dash'],
  },
  {
    key: 'training', name: 'Staff training and certification',
    blurb: 'Nominates staff, confirms places, assesses them, and reminds everyone before a certificate expires.',
    lanes: ['HR', 'Manager', 'Employee', 'System'],
    steps: [
      { id: 'nom', type: 'FORM', title: 'HR nomination', lane: 0, col: 0, note: 'HR nominates Priya Nair for first-aid certification.' },
      { id: 'appr', type: 'APPROVAL', title: 'Manager approval', lane: 1, col: 1, note: 'Her manager, Tom Fraser, approves the place.' },
      { id: 'conf', type: 'EMAIL', title: 'Enrolment email', lane: 3, col: 2, note: 'Priya is emailed her course date: Thursday 15 October 2026.' },
      { id: 'att', type: 'FORM', title: 'Attendance and test', lane: 2, col: 3, note: 'Attendance and the assessment are recorded in one form.' },
      { id: 'res', type: 'BRANCH', title: 'Pass or fail', lane: 3, col: 4, note: 'A pass moves on. A fail sends Priya back to retake once.' },
      { id: 'cert', type: 'PDF', title: 'Certificate', lane: 3, col: 5, note: 'The certificate is issued as a PDF.' },
      { id: 'rec', type: 'RECORD', title: 'Record updated', lane: 0, col: 6, note: 'Priya’s training record is updated automatically.' },
      { id: 'exp', type: 'TIMER', title: 'Expiry reminder', lane: 3, col: 7, timer: { n: 11, unit: 'month' }, note: 'An 11-month timer warns Priya and Tom before the certificate expires.' },
      { id: 'dash', type: 'DASHBOARD', title: 'Compliance dashboard', lane: 0, col: 8, note: 'HR sees who is certified, due or overdue.' },
    ],
    edges: [['nom', 'appr'], ['appr', 'conf'], ['conf', 'att'], ['att', 'res'], ['res', 'att', 'fail: retake'], ['res', 'cert', 'pass'], ['cert', 'rec'], ['rec', 'exp'], ['exp', 'dash']],
    order: ['nom', 'appr', 'conf', 'att', 'res', 'att', 'res', 'cert', 'rec', 'exp', 'dash'],
  },
]

const PLURAL: Partial<Record<StepType, [string, string]>> = {
  APPROVAL: ['approval', 'approvals'], EMAIL: ['automatic email', 'automatic emails'], CAMPAIGN: ['campaign', 'campaigns'],
  PDF: ['PDF', 'PDFs'], DASHBOARD: ['dashboard', 'dashboards'], FORM: ['form', 'forms'], TIMER: ['timer', 'timers'],
}

/** "11 steps · 3 people · 2 approvals ..." counted from the programme itself so the caption cannot drift from the diagram. */
export function stats(p: Programme): string[] {
  const n = (c: number, [one, many]: [string, string]) => `${c} ${c === 1 ? one : many}`
  const people = p.lanes.filter((l) => l !== 'System').length
  const out = [n(p.steps.length, ['step', 'steps']), n(people, ['person', 'people'])]
  for (const type of Object.keys(PLURAL) as StepType[]) {
    const c = p.steps.filter((s) => s.type === type).length
    if (c) out.push(n(c, PLURAL[type] as [string, string]))
  }
  return out
}

export const edgeKey = (a: string, b: string) => `${a}>${b}`
