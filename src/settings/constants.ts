export const STATES = ['Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu', 'Kuala Lumpur', 'Labuan', 'Putrajaya']
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const LOGO_MAX_BYTES = 200 * 1024
export const DEFAULT_NOTE = 'Please review this statement and notify us of any discrepancies within {days} days of the statement date.'

/** ISO date (YYYY-MM-DD) in the given format. */
export function formatDate(date: string, format: 'text' | 'numeric', long = false): string {
  const d = new Date(`${date}T00:00`)
  if (format === 'numeric') {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  }
  return d.toLocaleDateString('en-MY', long ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' })
}
