type Guard = (nextHash: string) => boolean
let guard: Guard | null = null

/** A page with unsaved work installs a guard; it returns true to block a hash navigation and ask first. */
export const setNavGuard = (g: Guard | null) => { guard = g }
export const blocksNavigation = (nextHash: string) => guard?.(nextHash) ?? false
