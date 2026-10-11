const KEY = 'rnr.focus'

/** Set before navigating, read by the page that opens: its heading takes focus (the pressed control is gone). */
export function markFocus(target: string) {
  try { sessionStorage.setItem(KEY, target) } catch { /* storage blocked: focus stays where the browser put it, which is still on the new page */ }
}
export function takeFocus(target: string): boolean {
  try {
    if (sessionStorage.getItem(KEY) !== target) return false
    sessionStorage.removeItem(KEY)
    return true
  } catch { return false }
}
