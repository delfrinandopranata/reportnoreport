import type { Client, Txn } from '../ledger'
import { validateUsers, type User } from '../users/rules'
import { readSettings, type Settings } from './store'

type Widget = { id: string; type: string; span: number }
export type Backup = {
  app: 'platform-internal'
  version: 1
  exportedAt: string
  main: { businessName: string; clients: Client[]; txns: Txn[]; widgets: Widget[] }
  users: { users: User[]; currentUserId: string }
  settings: Settings
}

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const list = (v: unknown): v is Record<string, unknown>[] => Array.isArray(v) && v.every(obj)
const str = (v: unknown) => typeof v === 'string'

export const makeBackup = (b: Omit<Backup, 'app' | 'version' | 'exportedAt'>): Backup => ({ app: 'platform-internal', version: 1, exportedAt: new Date().toISOString(), ...b })

export function parseBackup(text: string): { ok: true; backup: Backup } | { ok: false; error: string } {
  const bad = (error: string) => ({ ok: false as const, error })
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return bad('That file isn’t valid JSON. Choose a backup exported from this page.')
  }
  if (!obj(raw) || raw.app !== 'platform-internal') return bad('That file isn’t a Platform backup.')
  if (raw.version !== 1) return bad('This backup was made by a newer version and can’t be restored here.')
  const { main, users, settings: rawSettings } = raw
  if (!obj(main) || !str(main.businessName) || !list(main.clients) || !list(main.txns) || !list(main.widgets)) return bad('The business data in this backup is incomplete.')
  if (!main.clients.every((c) => str(c.id) && str(c.name) && str(c.createdAt))) return bad('A client in this backup is missing its id, name or created date.')
  const clientIds = new Set(main.clients.map((c) => c.id))
  if (!main.txns.every((t) => str(t.id) && clientIds.has(t.clientId) && (t.kind === 'in' || t.kind === 'out') && Number.isInteger(t.amount) && str(t.date) && str(t.note))) {
    return bad('A transaction in this backup is invalid or points to a client that isn’t included.')
  }
  if (!main.widgets.every((w) => str(w.id) && str(w.type) && [1, 2, 4].includes(w.span as number))) return bad('The dashboard layout in this backup is invalid.')
  if (!obj(users) || !validateUsers(users.users) || !str(users.currentUserId)) return bad('The team in this backup is invalid. It needs exactly one active owner and unique emails.')
  const settings = readSettings(rawSettings)
  if (!settings) return bad('The settings in this backup are invalid.')
  return { ok: true, backup: { ...(raw as Backup), main: main as Backup['main'], users: users as Backup['users'], settings } }
}
