export const MIN_PASSWORD = 8

/** The first problem with a new password and its confirmation, or null. */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD) return `Enter at least ${MIN_PASSWORD} characters.`
  if (password !== confirm) return 'The two passwords do not match.'
  return null
}

/** The reset email links to /app/?flow=set-password. */
export const isSetPasswordFlow = (search: string) => new URLSearchParams(search).get('flow') === 'set-password'
