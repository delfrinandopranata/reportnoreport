/** What a blocked navigation does once the person confirms: go to a hash, or run an action (sign out, switch org). */
export type Next = string | (() => void)
type Guard = (next: Next) => boolean
let guard: Guard | null = null

/** A page with unsaved work installs a guard; it returns true to block the navigation and ask first. */
export const setNavGuard = (g: Guard | null) => { guard = g }
export const blocksNavigation = (next: Next) => guard?.(next) ?? false
/** Runs the action now, or after the page's "Leave without saving?" confirmation. */
export const guarded = (action: () => void) => { if (!blocksNavigation(action)) action() }
