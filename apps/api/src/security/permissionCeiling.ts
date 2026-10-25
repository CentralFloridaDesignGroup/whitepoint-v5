export type RoleAccess = { id: string; permissions: string[] }

export function parsePermissions(value: unknown): string[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export const isSuperAdministrator = (permissions: readonly string[]) => permissions.includes('*')
export const isWithinPermissionCeiling = (permissions: readonly string[], actorPermissions: readonly string[]) =>
  !permissions.includes('*') && permissions.every(permission => actorPermissions.includes(permission))

export async function activeRoleAccess(db: D1Database): Promise<Map<string, RoleAccess>> {
  const rows = await db.prepare('SELECT id,permissions FROM roles WHERE archived_at IS NULL').all<{ id: string; permissions: string }>()
  return new Map(rows.results.map(row => [row.id, { id: row.id, permissions: parsePermissions(row.permissions) }]))
}

export function canAssignRole(actorPermissions: readonly string[], role: RoleAccess | undefined): boolean {
  if (!role) return false
  return isSuperAdministrator(actorPermissions) || isWithinPermissionCeiling(role.permissions, actorPermissions)
}

export async function canManageUser(db: D1Database, actorPermissions: readonly string[], userId: string): Promise<boolean> {
  if (isSuperAdministrator(actorPermissions)) return true
  const row = await db.prepare(`SELECT r.permissions FROM user_roles ur JOIN roles r ON r.id=ur.role_id
    JOIN users u ON u.id=ur.user_id WHERE ur.user_id=? AND u.archived_at IS NULL AND r.archived_at IS NULL`)
    .bind(userId).first<{ permissions: string }>()
  return Boolean(row && isWithinPermissionCeiling(parsePermissions(row.permissions), actorPermissions))
}
