export type StepType = 'FORM' | 'APPROVAL' | 'BRANCH' | 'PARALLEL' | 'JOIN' | 'TIMER' | 'EMAIL' | 'CAMPAIGN' | 'PDF' | 'DASHBOARD' | 'RECORD'
/** `options` are rows inside a BRANCH (one is taken) or PARALLEL (all run at once) card; each has its own line out. */
export type Step = { id: string; type: StepType; title: string; lane: number; col: number; note: string; options?: string[]; timer?: { n: number; unit: 'day' | 'month' } }
export type Edge = [from: string, to: string, label?: string]
export type Programme = {
  key: string; name: string; blurb: string; lanes: string[]; steps: Step[]; edges: Edge[]
  /** What is lit at each moment. Several ids in one beat run at the same time; each card in a beat is either still running
   *  from the beat before or is reached by an edge from it. */
  beats: string[][]
}

export const ICON: Record<StepType, string> = {
  FORM: 'i-note-pencil', APPROVAL: 'i-stamp', BRANCH: 'i-git-branch', PARALLEL: 'i-split', JOIN: 'i-merge', TIMER: 'i-clock',
  EMAIL: 'i-envelope-simple', CAMPAIGN: 'i-megaphone', PDF: 'i-file-pdf', DASHBOARD: 'i-chart-line-up', RECORD: 'i-database',
}

export const PROGRAMMES: Programme[] = [
  {
    key: 'internship', name: 'International internship',
    blurb: 'Screens applicants, places them with partner employers abroad, runs visa, housing and insurance side by side, then tracks the placement to a final report.',
    lanes: ['Student', 'Academic adviser', 'Partner employer', 'Coordinator', 'System'],
    steps: [
      { id: 'app', type: 'FORM', title: 'Application', lane: 0, col: 0, note: 'Daniel Lim applies for a summer 2027 placement in Singapore.' },
      { id: 'elig', type: 'BRANCH', title: 'Eligibility', lane: 3, col: 1, options: ['eligible', 'interview', 'not eligible'], note: 'Ms Patel checks grades and credits: eligible, interview first, or not eligible this year.' },
      { id: 'adv', type: 'APPROVAL', title: 'Adviser approval', lane: 1, col: 2, note: 'Prof. Hughes confirms the placement fits Daniel’s degree.' },
      { id: 'intv', type: 'FORM', title: 'Interview notes', lane: 3, col: 2, note: 'Borderline applicants are interviewed and the notes go to the adviser.' },
      { id: 'regret', type: 'EMAIL', title: 'Regret email', lane: 4, col: 2, note: 'Applicants who are not eligible are told why, and when to apply again.' },
      { id: 'match', type: 'FORM', title: 'Placement match', lane: 3, col: 3, note: 'Ms Patel proposes an employer from the partner list.' },
      { id: 'emp', type: 'BRANCH', title: 'Employer decision', lane: 2, col: 4, options: ['accepts', 'declines'], note: 'The employer accepts, or declines and the request goes back to matching.' },
      { id: 'prep', type: 'PARALLEL', title: 'Pre-departure', lane: 3, col: 5, options: ['visa', 'housing', 'insurance'], note: 'Visa, housing and insurance start at the same time instead of one after another.' },
      { id: 'visa', type: 'FORM', title: 'Visa application', lane: 0, col: 6, note: 'Daniel uploads his passport and offer letter for the work pass.' },
      { id: 'house', type: 'FORM', title: 'Housing offer', lane: 2, col: 6, note: 'The employer confirms housing near the office.' },
      { id: 'ins', type: 'RECORD', title: 'Insurance cover', lane: 4, col: 6, note: 'Travel and medical cover is recorded against Daniel’s file.' },
      { id: 'join', type: 'JOIN', title: 'All ready', lane: 3, col: 7, note: 'The workflow waits until all three are done.' },
      { id: 'brief', type: 'EMAIL', title: 'Briefing email', lane: 4, col: 8, note: 'The pre-departure briefing is emailed on Monday 8 June 2027.' },
      { id: 'timer', type: 'TIMER', title: 'Weekly logbook', lane: 4, col: 9, timer: { n: 7, unit: 'day' }, note: 'A 7-day timer opens each weekly logbook entry for the ten weeks.' },
      { id: 'log', type: 'FORM', title: 'Logbook entry', lane: 0, col: 10, note: 'Daniel records the week’s work and hours.' },
      { id: 'eval', type: 'FORM', title: 'Employer evaluation', lane: 2, col: 11, note: 'The employer rates Daniel at the end of the placement.' },
      { id: 'rep', type: 'PDF', title: 'Final report', lane: 4, col: 11, note: 'At the same time, the logbook is compiled into a final report PDF.' },
      { id: 'dash', type: 'DASHBOARD', title: 'Outcomes dashboard', lane: 3, col: 12, note: 'Ms Patel reviews placements, ratings and hours across the year.' },
    ],
    edges: [['app', 'elig'], ['elig', 'adv', 'eligible'], ['elig', 'intv', 'interview'], ['elig', 'regret', 'not eligible'], ['intv', 'adv'], ['adv', 'match'],
      ['match', 'emp'], ['emp', 'prep', 'accepts'], ['emp', 'match', 'declines'], ['prep', 'visa', 'visa'], ['prep', 'house', 'housing'], ['prep', 'ins', 'insurance'],
      ['visa', 'join'], ['house', 'join'], ['ins', 'join'], ['join', 'brief'], ['brief', 'timer'], ['timer', 'log'], ['log', 'timer', '×10'],
      ['log', 'eval'], ['log', 'rep'], ['eval', 'dash'], ['rep', 'dash']],
    beats: [['app'], ['elig'], ['intv'], ['adv'], ['match'], ['emp'], ['match'], ['emp'], ['prep'], ['visa', 'house', 'ins'], ['join'], ['brief'],
      ['timer'], ['log'], ['timer'], ['log'], ['eval', 'rep'], ['dash']],
  },
  {
    key: 'mentorship', name: 'Mentorship programme',
    blurb: 'A six-month cohort: screening with an interview route, a kick-off that runs three ways at once, monthly check-ins that branch on progress, and a certificate.',
    lanes: ['Student', 'Coordinator', 'Mentor', 'System'],
    steps: [
      { id: 'app', type: 'FORM', title: 'Application form', lane: 0, col: 0, note: 'Aisha Rahman applies for the September 2026 cohort.' },
      { id: 'screen', type: 'BRANCH', title: 'Screening', lane: 1, col: 1, options: ['good fit', 'interview', 'waitlist'], note: 'Ms Tan screens the application: a good fit, an interview first, or the waitlist.' },
      { id: 'intv', type: 'FORM', title: 'Interview', lane: 1, col: 2, note: 'A short interview is recorded before matching.' },
      { id: 'match', type: 'APPROVAL', title: 'Mentor matching', lane: 2, col: 2, note: 'Dr Okafor approves the match with Aisha.' },
      { id: 'wait', type: 'EMAIL', title: 'Waitlist email', lane: 3, col: 2, note: 'Waitlisted students are told the next intake date by email.' },
      { id: 'kick', type: 'PARALLEL', title: 'Kick-off', lane: 1, col: 3, options: ['goals', 'agreement', 'calendar'], note: 'Three things start at once: goals, the mentor agreement and the calendar.' },
      { id: 'goals', type: 'FORM', title: 'Goal setting', lane: 0, col: 4, note: 'Aisha sets three goals for the six months.' },
      { id: 'agree', type: 'FORM', title: 'Mentor agreement', lane: 2, col: 4, note: 'Dr Okafor signs the mentoring agreement.' },
      { id: 'cal', type: 'EMAIL', title: 'Calendar invites', lane: 3, col: 4, note: 'Monthly meetings land in both calendars.' },
      { id: 'timer', type: 'TIMER', title: 'Next check-in', lane: 3, col: 5, timer: { n: 30, unit: 'day' }, note: 'A 30-day timer starts before each monthly check-in.' },
      { id: 'check', type: 'FORM', title: 'Monthly check-in', lane: 0, col: 6, note: 'Aisha reports progress against her goals.' },
      { id: 'prog', type: 'BRANCH', title: 'Progress', lane: 1, col: 7, options: ['on track', 'at risk', 'finished'], note: 'On track waits for the next month, at risk books a support meeting, finished moves to completion.' },
      { id: 'support', type: 'FORM', title: 'Support meeting', lane: 2, col: 8, note: 'Dr Okafor meets Aisha and agrees a plan.' },
      { id: 'survey', type: 'CAMPAIGN', title: 'Exit survey', lane: 3, col: 8, note: 'The whole cohort receives the exit survey in one campaign.' },
      { id: 'done', type: 'APPROVAL', title: 'Completion approval', lane: 2, col: 9, note: 'Dr Okafor signs off completion in March 2027.' },
      { id: 'rec', type: 'RECORD', title: 'Transcript updated', lane: 0, col: 10, note: 'The programme is added to Aisha’s record.' },
      { id: 'cert', type: 'PDF', title: 'Certificate', lane: 3, col: 10, note: 'At the same time, a certificate PDF is generated.' },
      { id: 'dash', type: 'DASHBOARD', title: 'Cohort dashboard', lane: 1, col: 11, note: 'Ms Tan sees completion, risk and survey results for the whole cohort.' },
    ],
    edges: [['app', 'screen'], ['screen', 'match', 'good fit'], ['screen', 'intv', 'interview'], ['screen', 'wait', 'waitlist'], ['intv', 'match'], ['match', 'kick'],
      ['kick', 'goals', 'goals'], ['kick', 'agree', 'agreement'], ['kick', 'cal', 'calendar'], ['goals', 'timer'], ['agree', 'timer'], ['cal', 'timer'],
      ['timer', 'check'], ['check', 'prog'], ['prog', 'timer', 'on track'], ['prog', 'support', 'at risk'], ['prog', 'survey', 'finished'], ['support', 'timer'],
      ['survey', 'done'], ['done', 'rec'], ['done', 'cert'], ['rec', 'dash'], ['cert', 'dash']],
    beats: [['app'], ['screen'], ['intv'], ['match'], ['kick'], ['goals', 'agree', 'cal'], ['timer'], ['check'], ['prog'], ['timer'], ['check'], ['prog'],
      ['support'], ['timer'], ['check'], ['prog'], ['survey'], ['done'], ['rec', 'cert'], ['dash']],
  },
  {
    key: 'training', name: 'Staff training and certification',
    blurb: 'Nominates staff, lets the manager approve, defer or decline, enrols three ways at once, allows a resit, and reminds everyone before a certificate expires.',
    lanes: ['HR', 'Manager', 'Employee', 'System'],
    steps: [
      { id: 'nom', type: 'FORM', title: 'HR nomination', lane: 0, col: 0, note: 'HR nominates Priya Nair for first-aid certification.' },
      { id: 'appr', type: 'BRANCH', title: 'Manager decision', lane: 1, col: 1, options: ['approve', 'defer', 'decline'], note: 'Tom Fraser approves, defers to a later intake, or declines.' },
      { id: 'enrol', type: 'PARALLEL', title: 'Enrol', lane: 0, col: 2, options: ['seat', 'pre-reading', 'cover'], note: 'The seat, the pre-reading and shift cover are arranged at the same time.' },
      { id: 'decline', type: 'EMAIL', title: 'Decline notice', lane: 2, col: 2, note: 'Priya is told the reason and HR is copied.' },
      { id: 'defer', type: 'TIMER', title: 'Ask again', lane: 3, col: 2, timer: { n: 3, unit: 'month' }, note: 'A deferral asks the manager again in three months.' },
      { id: 'cover', type: 'FORM', title: 'Shift cover', lane: 1, col: 3, note: 'Tom arranges cover for the course day.' },
      { id: 'read', type: 'EMAIL', title: 'Pre-reading', lane: 2, col: 3, note: 'Priya is emailed the pre-reading and her course date, Thursday 15 October 2026.' },
      { id: 'seat', type: 'RECORD', title: 'Seat booked', lane: 3, col: 3, note: 'Her seat is booked with the training provider.' },
      { id: 'att', type: 'FORM', title: 'Attendance and test', lane: 2, col: 4, note: 'Attendance and the assessment are recorded in one form.' },
      { id: 'res', type: 'BRANCH', title: 'Result', lane: 0, col: 5, options: ['pass', 'resit', 'fail'], note: 'A pass moves on, a resit sends Priya back once, a fail tells her manager.' },
      { id: 'notify', type: 'EMAIL', title: 'Manager told', lane: 1, col: 6, note: 'Tom is told about the fail and the next intake.' },
      { id: 'cert', type: 'PDF', title: 'Certificate', lane: 3, col: 6, note: 'The certificate is issued as a PDF.' },
      { id: 'rec', type: 'RECORD', title: 'Record updated', lane: 0, col: 7, note: 'Priya’s training record is updated automatically.' },
      { id: 'exp', type: 'TIMER', title: 'Expiry reminder', lane: 3, col: 7, timer: { n: 11, unit: 'month' }, note: 'At the same time, an 11-month timer starts to warn before the certificate expires.' },
      { id: 'dash', type: 'DASHBOARD', title: 'Compliance dashboard', lane: 1, col: 8, note: 'HR sees who is certified, due or overdue.' },
    ],
    edges: [['nom', 'appr'], ['appr', 'enrol', 'approve'], ['appr', 'defer', 'defer'], ['appr', 'decline', 'decline'], ['defer', 'appr', '3 months'],
      ['enrol', 'seat', 'seat'], ['enrol', 'read', 'pre-reading'], ['enrol', 'cover', 'cover'], ['seat', 'att'], ['read', 'att'], ['cover', 'att'],
      ['att', 'res'], ['res', 'att', 'resit'], ['res', 'cert', 'pass'], ['res', 'notify', 'fail'], ['cert', 'rec'], ['cert', 'exp'],
      ['rec', 'dash'], ['exp', 'dash'], ['notify', 'dash']],
    beats: [['nom'], ['appr'], ['defer'], ['appr'], ['enrol'], ['seat', 'read', 'cover'], ['att'], ['res'], ['att'], ['res'], ['cert'], ['rec', 'exp'], ['dash']],
  },
]

const PLURAL: Partial<Record<StepType, [string, string]>> = {
  APPROVAL: ['approval', 'approvals'], EMAIL: ['automatic email', 'automatic emails'], CAMPAIGN: ['campaign', 'campaigns'],
  PDF: ['PDF', 'PDFs'], DASHBOARD: ['dashboard', 'dashboards'], FORM: ['form', 'forms'], TIMER: ['timer', 'timers'],
  BRANCH: ['decision', 'decisions'], PARALLEL: ['parallel split', 'parallel splits'],
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
