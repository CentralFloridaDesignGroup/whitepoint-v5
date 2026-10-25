import { Hono } from 'hono'
import { PERMISSION_CATALOG, PERMISSION_KEYS } from '@whitepoint/types/constants'
import type { HonoEnv } from '../types/apiTypes'
import { isSuperAdministrator, isWithinPermissionCeiling, parsePermissions } from '../security/permissionCeiling'

const clean = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max)

export function createRolesApi() {
  const api = new Hono<HonoEnv>()
  api.get("/permissions", (c) => {
    const actorPermissions = c.get('auth').permissions || []
    return c.json({ items: isSuperAdministrator(actorPermissions) ? PERMISSION_CATALOG : PERMISSION_CATALOG.map(group => ({ ...group, permissions: group.permissions.filter(permission => actorPermissions.includes(permission.key)) })).filter(group => group.permissions.length) })
  });
  api.get("/roles", async (c) => {
    const rows = await c.env.DB.prepare(
      "SELECT id,name,permissions,built_in FROM roles WHERE archived_at IS NULL ORDER BY built_in DESC,name COLLATE NOCASE",
    ).all<Record<string, unknown>>();
    const actorPermissions = c.get('auth').permissions || []
    return c.json({
      items: rows.results.map((row) => ({
        id: row.id,
        name: row.name,
        permissions: JSON.parse(String(row.permissions)),
        builtIn: row.built_in === 1,
      })).filter(role => isSuperAdministrator(actorPermissions) || isWithinPermissionCeiling(role.permissions, actorPermissions)),
    });
  });
  api.post("/roles/bulk", async (c) => {
    const body = await c.req
      .json<{
        roles?: Array<{
          id: string;
          name: string;
          permissions: string[];
          isNew?: boolean;
        }>;
        removed?: Array<{ id: string; replacementRoleId: string }>;
      }>()
      .catch(() => null);
    if (!body || !Array.isArray(body.roles) || !Array.isArray(body.removed))
      return c.json({ error: "Invalid role changes." }, 400);
    const existing = await c.env.DB.prepare(
      "SELECT id,built_in,permissions FROM roles WHERE archived_at IS NULL",
    ).all<{ id: string; built_in: number; permissions: string }>();
    const byId = new Map(existing.results.map((role) => [role.id, role]));
    const actorPermissions = c.get('auth').permissions || [];
    const actorIsSuper = isSuperAdministrator(actorPermissions);
    const catalog = new Set<string>(PERMISSION_KEYS);
    const removed = new Set(body.removed.map((role) => role.id));
    const IDs = new Set(body.roles.map((role) => role.id));
    if (
      body.roles.length > 100 ||
      body.removed.length > 100 ||
      IDs.size !== body.roles.length ||
      removed.size !== body.removed.length
    )
      return c.json({ error: "Duplicate or excessive role changes." }, 400);
    const names = new Set<string>();
    for (const role of body.roles) {
      const name = clean(role.name, 100),
        key = name.toLowerCase();
      if (!actorIsSuper && role.id === 'super-administrator' && (name !== 'super-administrator' || role.permissions.length !== 1 || role.permissions[0] !== '*'))
        return c.json({ error: 'You cannot change the super-administrator role.' }, 403);
      if (
        !name ||
        names.has(key) ||
        !Array.isArray(role.permissions) ||
        role.permissions.some(
          (permission) =>
            !catalog.has(permission) &&
            !(role.id === "super-administrator" && permission === "*"),
        ) ||
        new Set(role.permissions).size !== role.permissions.length
      )
        return c.json(
          { error: "Role names and permissions must be unique and valid." },
          400,
        );
      names.add(key);
      if (
        (role.id === "super-administrator" &&
          (name !== "super-administrator" ||
            role.permissions.length !== 1 ||
            role.permissions[0] !== "*")) ||
        (role.id === "employee" && name !== "employee")
      )
        return c.json({ error: "Built-in role names cannot be changed." }, 400);
      if (
        role.isNew &&
        (byId.has(role.id) ||
          !/^[a-f0-9-]{36}$/.test(role.id) ||
          !c.get("permissions").hasPermission("company.roles.create"))
      )
        return c.json({ error: "Role creation is not allowed." }, 403);
      if (!role.isNew && !byId.has(role.id))
        return c.json({ error: "Role not found." }, 404);
      const currentPermissions = parsePermissions(byId.get(role.id)?.permissions);
      if (!actorIsSuper && role.id !== 'super-administrator' &&
        ((!role.isNew && !isWithinPermissionCeiling(currentPermissions, actorPermissions)) || !isWithinPermissionCeiling(role.permissions, actorPermissions)))
        return c.json({ error: 'You cannot change a role above your permission ceiling.' }, 403);
    }
    const finalPermissions = new Map(existing.results.map(role => [role.id, parsePermissions(role.permissions)]));
    for (const role of body.roles) finalPermissions.set(role.id, role.permissions);
    for (const role of body.removed) {
      if (
        !byId.has(role.id) ||
        byId.get(role.id)?.built_in ||
        !c.get("permissions").hasPermission("company.roles.delete")
      )
        return c.json({ error: "Role removal is not allowed." }, 403);
      if (
        role.id === role.replacementRoleId ||
        removed.has(role.replacementRoleId) ||
        (!byId.has(role.replacementRoleId) && !IDs.has(role.replacementRoleId))
      )
        return c.json({ error: "Choose an active replacement role." }, 400);
      if (!actorIsSuper && (!isWithinPermissionCeiling(parsePermissions(byId.get(role.id)?.permissions), actorPermissions) || !isWithinPermissionCeiling(finalPermissions.get(role.replacementRoleId) || [], actorPermissions)))
        return c.json({ error: 'You cannot remove or replace a role above your permission ceiling.' }, 403);
    }
    try {
      const statements = body.roles.map((role) =>
        role.isNew
          ? c.env.DB.prepare(
              "INSERT INTO roles(id,name,permissions,built_in) VALUES(?,?,?,0)",
            ).bind(
              role.id,
              clean(role.name, 100),
              JSON.stringify(role.permissions),
            )
          : c.env.DB.prepare(
              "UPDATE roles SET name=?,permissions=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND archived_at IS NULL AND id<>'super-administrator'",
            ).bind(
              clean(role.name, 100),
              JSON.stringify(role.permissions),
              role.id,
            ),
      );
      for (const role of body.roles.filter(
        (row) => row.id !== "super-administrator",
      ))
        statements.push(
          c.env.DB.prepare(
            "INSERT INTO audit_log(id,actor_id,record_type,record_id,action,after_json) VALUES(?,?,?,?,?,?)",
          ).bind(
            crypto.randomUUID(),
            c.get("auth").internalUserId,
            "role",
            role.id,
            role.isNew ? "created" : "updated",
            JSON.stringify({ name: role.name, permissions: role.permissions }),
          ),
        );
      for (const role of body.removed) {
        statements.push(
          c.env.DB.prepare(
            "UPDATE user_roles SET role_id=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE role_id=?",
          ).bind(role.replacementRoleId, c.get("auth").internalUserId, role.id),
        );
        statements.push(
          c.env.DB.prepare(
            "UPDATE roles SET archived_at=CURRENT_TIMESTAMP WHERE id=? AND built_in=0",
          ).bind(role.id),
        );
        statements.push(
          c.env.DB.prepare(
            "INSERT INTO audit_log(id,actor_id,record_type,record_id,action,after_json) VALUES(?,?,?,?,?,?)",
          ).bind(
            crypto.randomUUID(),
            c.get("auth").internalUserId,
            "role",
            role.id,
            "archived",
            JSON.stringify({ replacementRoleId: role.replacementRoleId }),
          ),
        );
      }
      if (statements.length) await c.env.DB.batch(statements);
      return c.json({ saved: true });
    } catch {
      return c.json(
        {
          error:
            "Could not save roles. Check for a duplicate name or concurrent change.",
        },
        409,
      );
    }
  });
  return api
}
