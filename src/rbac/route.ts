/** Pages the signed-in user may not see fall back to Members. */
export const guardHash = (hash: string, canManageRoles: boolean) =>
  hash === '#/roles' && !canManageRoles ? '#/members' : hash
