export const FALLBACK = 'Something went wrong. Try again, and contact support if it keeps happening.'

type Err = { message?: string; code?: string } | null | undefined

const SENTENCES: [RegExp, string][] = [
  [/on table "form_submissions"/, 'This form has submissions, so it cannot be deleted. Keep it, or rename it so people know it is no longer used.'],
  [/on table "records"/, 'This workflow has records, so it cannot be deleted. Keep it, or rename it so people know it is no longer used.'],
  [/already claimed or completed/, 'Someone else claimed this task first, or it is already done. Check your inbox for what is left.'],
  [/row-level security/, 'You do not have permission to do that.'],
  [/at least one Owner/, 'An organisation needs at least one Owner. Make someone else an Owner first.'],
  [/cannot grant permissions you do not hold|cannot assign a role with permissions/, 'You cannot give a permission you do not hold. Untick it and save again.'],
  [/Only an Owner can assign/, 'Only an Owner can assign the Owner role.'],
  [/Only an Owner can remove/, 'Only an Owner can remove an Owner.'],
  [/Invalid roles/, 'Those roles are not valid for this organisation. Reload the page and try again.'],
  [/Owner role cannot be (changed|deleted)/, 'The Owner role cannot be changed or deleted.'],
  [/Only failed messages can be retried/, 'Only failed messages can be retried. The list now shows the latest status.'],
  [/A template cannot change its type/, 'A template cannot change its type. Create a new template instead.'],
  [/no report template yet/, 'This workflow has no PDF template yet. Ask a reports manager to set one up.'],
  [/dashboard changed/, 'The dashboard changed. Reload to see the latest layout.'],
  [/Only a draft campaign can be scheduled/, 'This campaign is no longer a draft. The page now shows its latest state.'],
  [/Choose a message template before sending/, 'Choose a message template before sending.'],
  [/Choose who receives this campaign/, 'Choose who receives this campaign before sending.'],
  [/Choose a time in the future/, 'Choose a time in the future.'],
  [/Choose a time within the next year/, 'Choose a time within the next year.'],
  [/started sending and cannot be changed/, 'This campaign has started sending and cannot be changed. The page now shows its latest state.'],
  [/link a workflow whose records you can all see/, 'You can only link a workflow whose records you can all see. Choose another, or ask an admin for access.'],
  [/Not allowed|permission to invite/, 'You do not have permission to do that.'],
  [/Invalid login credentials/, 'That email or password is incorrect. Check them and try again.'],
  [/different from the old password/i, 'Choose a password you have not used before.'],
  [/Auth session missing|session.*expired/i, 'This link has expired. Ask for a new one.'],
  [/already registered/i, 'That email already has an account. Sign in instead.'],
]

/** Maps known server messages to user-facing sentences; never shows raw codes. */
export function friendlyError(err: Err, context?: { duplicate?: string }): string {
  if (!err) return FALLBACK
  if (err.code === '23505' && context?.duplicate) return context.duplicate
  return SENTENCES.find(([re]) => re.test(err.message ?? ''))?.[1] ?? FALLBACK
}
