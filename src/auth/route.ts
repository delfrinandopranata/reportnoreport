const KEY = 'returnTo'
const AUTH_ROUTES = ['#signin', '#forgot', '#set-password']

export function rememberReturnTo(hash: string, storage: Pick<Storage, 'setItem'> = sessionStorage) {
  try { storage.setItem(KEY, hash) } catch { /* storage blocked: we just land on the dashboard */ }
}

export function takeReturnTo(storage: Pick<Storage, 'getItem' | 'removeItem'> = sessionStorage): string {
  try {
    const hash = storage.getItem(KEY)
    storage.removeItem(KEY)
    return hash && !AUTH_ROUTES.some((r) => hash.startsWith(r)) ? hash : '#dashboard'
  } catch {
    return '#dashboard'
  }
}
