import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const STATES = ['Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu', 'Kuala Lumpur', 'Labuan', 'Putrajaya']
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const LOGO_MAX_BYTES = 200 * 1024
export const DEFAULT_NOTE = 'Please review this statement and notify us of any discrepancies within {days} days of the statement date.'

export type DateFormat = 'text' | 'numeric'
export type Settings = {
  tradingName: string
  ssmNo: string
  sstNo: string
  phone: string
  email: string
  website: string
  address1: string
  address2: string
  postcode: string
  city: string
  state: string
  country: string
  /** Small data URL; capped at LOGO_MAX_BYTES before it is stored. */
  logo: string
  statementNote: string
  discrepancyDays: number
  showRegNo: boolean
  bankName: string
  bankAccountName: string
  bankAccountNo: string
  dateFormat: DateFormat
  /** 1-12 */
  fyStartMonth: number
}

export const DEFAULT_SETTINGS: Settings = {
  tradingName: '', ssmNo: '', sstNo: '', phone: '', email: '', website: '',
  address1: '', address2: '', postcode: '', city: '', state: '', country: 'Malaysia', logo: '',
  statementNote: DEFAULT_NOTE, discrepancyDays: 14, showRegNo: true,
  bankName: '', bankAccountName: '', bankAccountNo: '',
  dateFormat: 'text', fyStartMonth: 1,
}

type Actions = { update: (patch: Partial<Settings>) => void; replaceAll: (settings: Settings) => void }

export const useSettings = create<Settings & Actions>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      replaceAll: (settings) => set({ ...settings }),
    }),
    {
      name: 'platform-internal-settings',
      version: 1,
      partialize: (s): Settings => Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, s[k as keyof Settings]])) as Settings,
    },
  ),
)

/** Keeps only known keys of the right type, so a backup from an older version still restores. */
export function readSettings(value: unknown): Settings | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
    if (raw[key] !== undefined && typeof raw[key] === typeof fallback) out[key] = raw[key]
  }
  const s = out as Settings
  if (s.dateFormat !== 'text' && s.dateFormat !== 'numeric') return null
  if (!Number.isInteger(s.fyStartMonth) || s.fyStartMonth < 1 || s.fyStartMonth > 12) return null
  if (!Number.isInteger(s.discrepancyDays) || s.discrepancyDays < 1) return null
  if (s.logo && (!s.logo.startsWith('data:image/') || s.logo.length > LOGO_MAX_BYTES * 1.4)) return null
  return s
}

/** ISO date (YYYY-MM-DD) in the chosen format. Reads the store directly so plain helpers can call it. */
export function formatDate(date: string, long = false): string {
  const d = new Date(`${date}T00:00`)
  if (useSettings.getState().dateFormat === 'numeric') {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  }
  return d.toLocaleDateString('en-MY', long ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' })
}
