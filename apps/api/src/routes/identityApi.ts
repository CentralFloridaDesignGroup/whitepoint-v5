import { Hono } from "hono";
import { PERMISSION_CATALOG, PERMISSION_KEYS } from "@whitepoint/types/constants";
import { issueAccessLink, sendAccessEmail } from "../auth/mail";
import { validateReportingManagers } from '../services/reportingHierarchy'
import { userDetail } from './userDetail'
import { revokeUserSessions } from "../auth/session";
import type { HonoEnv } from "../types/apiTypes";

const clean = (value: unknown, max = 200) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
type User = { id: string; email: string; display_name: string; active: number };
const bodyOf = async (request: Request): Promise<Record<string, unknown>> =>
  request.json().catch(() => ({})) as Promise<Record<string, unknown>>;
async function lastAdmin(db: D1Database, userId: string) {
  const target = await db
    .prepare("SELECT role_id FROM user_roles WHERE user_id=?")
    .bind(userId)
    .first<{ role_id: string }>();
  if (target?.role_id !== "super-administrator") return false;
  const others = await db
    .prepare(
      `SELECT count(*) AS count FROM users u JOIN user_roles ur ON ur.user_id=u.id
    WHERE u.id<>? AND u.active=1 AND u.archived_at IS NULL AND ur.role_id='super-administrator'
    AND (EXISTS(SELECT 1 FROM user_credentials cr WHERE cr.user_id=u.id AND cr.password_hash IS NOT NULL)
      OR EXISTS(SELECT 1 FROM user_passkeys p WHERE p.user_id=u.id))`,
    )
    .bind(userId)
    .first<{ count: number }>();
  return Number(others?.count || 0) === 0;
}

export function createIdentityApi() {
  const api = new Hono<HonoEnv>();
  api.get("/me", async (c) => {
    const row = await c.env.DB.prepare(
      `SELECT u.id,u.email,u.display_name,u.user_type,u.active,r.id AS role_id,r.name AS role_name,r.permissions FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=?`,
    )
      .bind(c.get("auth").internalUserId)
      .first<Record<string, unknown>>();
    return row
      ? c.json({
          id: row.id,
          email: row.email,
          displayName: row.display_name,
          userType: row.user_type,
          active: row.active === 1,
          role: { id: row.role_id, name: row.role_name },
          permissions: JSON.parse(String(row.permissions)),
        })
      : c.json({ error: "User not found." }, 404);
  });
  api.get("/permissions", (c) => c.json({ items: PERMISSION_CATALOG }));
  api.get("/roles", async (c) => {
    const rows = await c.env.DB.prepare(
      "SELECT id,name,permissions,built_in FROM roles WHERE archived_at IS NULL ORDER BY built_in DESC,name COLLATE NOCASE",
    ).all<Record<string, unknown>>();
    return c.json({
      items: rows.results.map((row) => ({
        id: row.id,
        name: row.name,
        permissions: JSON.parse(String(row.permissions)),
        builtIn: row.built_in === 1,
      })),
    });
  });
  api.get("/users/role-options", async (c) => {
    const rows = await c.env.DB.prepare(
      "SELECT id,name FROM roles WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE",
    ).all<{ id: string; name: string }>();
    return c.json({ items: rows.results });
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
      "SELECT id,built_in FROM roles WHERE archived_at IS NULL",
    ).all<{ id: string; built_in: number }>();
    const byId = new Map(existing.results.map((role) => [role.id, role]));
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
    }
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
  api.post("/users/bulk", async (c) => {
    const body = await c.req
      .json<{
        users?: Array<{
          id: string;
          email: string;
          displayName: string;
          roleId: string;
          active: boolean;
          archived?: boolean;
          isNew?: boolean;
          managerUserId?: string | null;
          billingPositionId?: string | null;
          payBasis?: 'hourly' | 'salary' | null;
          payAmountCents?: number | null;
        }>;
      }>()
      .catch(() => null);
    if (!body || !Array.isArray(body.users) || body.users.length > 100)
      return c.json({ error: "Invalid user changes." }, 400);
    const roles = await c.env.DB.prepare(
      "SELECT id FROM roles WHERE archived_at IS NULL",
    ).all<{ id: string }>();
    const roleIds = new Set(roles.results.map((role) => role.id));
    const ids = new Set<string>(),
      emails = new Set<string>();
    const positionIds = new Set((await c.env.DB.prepare('SELECT id FROM billing_positions WHERE active=1').all<{id:string}>()).results.map(row=>row.id));
    const managerRows = (await c.env.DB.prepare("SELECT id,manager_user_id FROM users WHERE user_type='internal' AND archived_at IS NULL AND active=1").all<{id:string;manager_user_id:string|null}>()).results;
    const managers = new Map(managerRows.map(row=>[row.id,row.manager_user_id]));
    const eligible = await c.env.DB.prepare(
      `SELECT u.id,ur.role_id FROM users u JOIN user_roles ur ON ur.user_id=u.id WHERE u.active=1 AND u.archived_at IS NULL AND (EXISTS(SELECT 1 FROM user_credentials cr WHERE cr.user_id=u.id AND cr.password_hash IS NOT NULL) OR EXISTS(SELECT 1 FROM user_passkeys p WHERE p.user_id=u.id))`,
    ).all<{ id: string; role_id: string }>();
    const eligibleIds = new Set(eligible.results.map((row) => row.id));
    const finalAdmins = new Set(
      eligible.results
        .filter((row) => row.role_id === "super-administrator")
        .map((row) => row.id),
    );
    for (const user of body.users) {
      const email = clean(user.email, 320).toLowerCase();
      if (
        ids.has(user.id) ||
        emails.has(email) ||
        !validEmail(email) ||
        !clean(user.displayName) ||
        !roleIds.has(user.roleId) ||
        typeof user.active !== "boolean" ||
        (user.archived !== undefined && typeof user.archived !== "boolean") ||
        (user.archived && user.isNew)
      )
        return c.json(
          { error: "User details, email, and role must be valid and unique." },
          400,
        );
      ids.add(user.id);
      emails.add(email);
      if (user.managerUserId === user.id || user.billingPositionId && !positionIds.has(user.billingPositionId) || user.payBasis && !['hourly','salary'].includes(user.payBasis) || user.payAmountCents != null && (!Number.isSafeInteger(user.payAmountCents) || user.payAmountCents < 0)) return c.json({error:'Invalid manager, billing position, or pay rate.'},400);
      if(user.active&&!user.archived)managers.set(user.id,user.managerUserId===undefined?managers.get(user.id)||null:user.managerUserId||null);
      else managers.delete(user.id);
      if (
        user.active &&
        !user.archived &&
        user.roleId === "super-administrator" &&
        eligibleIds.has(user.id)
      )
        finalAdmins.add(user.id);
      else finalAdmins.delete(user.id);
      if (
        user.isNew &&
        (!c.get("permissions").hasPermission("users.create") ||
          !/^[a-f0-9-]{36}$/.test(user.id))
      )
        return c.json({ error: "User creation is not allowed." }, 403);
      if (!user.isNew) {
        const current = await c.env.DB.prepare(
          "SELECT id FROM users WHERE id=? AND archived_at IS NULL",
        )
          .bind(user.id)
          .first();
        if (!current) return c.json({ error: "User not found." }, 404);
        if (
          user.id === c.get("auth").internalUserId &&
          (!user.active || user.archived)
        )
          return c.json(
            { error: "You cannot disable or archive yourself." },
            400,
          );
      }
    }
    const hierarchyError=validateReportingManagers(managers)
    if(hierarchyError)return c.json({error:hierarchyError},400)
    if(body.users.some(user=>user.managerUserId!==undefined||user.billingPositionId!==undefined||user.payBasis!==undefined||user.payAmountCents!==undefined)&&!c.get('permissions').hasPermission('timesheets.rates.manage')) return c.json({error:'Pay and reporting setup requires rate management permission.'},403);
    if (!finalAdmins.size)
      return c.json(
        { error: "The last administrator cannot lose access." },
        409,
      );
    try {
      const statements = [];
      for (const user of body.users) {
        const email = clean(user.email, 320).toLowerCase(),
          name = clean(user.displayName);
        if (user.isNew) {
          statements.push(
            c.env.DB.prepare(
              "INSERT INTO users(id,email,display_name,user_type,active,manager_user_id,billing_position_id,pay_basis,pay_amount_cents) VALUES(?,?,?,'internal',?,?,?,?,?)",
            ).bind(user.id, email, name, Number(user.active), null,user.billingPositionId||null,user.payBasis||null,user.payAmountCents??null),
          );
          statements.push(
            c.env.DB.prepare(
              "INSERT INTO user_roles(user_id,role_id,updated_by) VALUES(?,?,?)",
            ).bind(user.id, user.roleId, c.get("auth").internalUserId),
          );
        } else {
          statements.push(
            c.env.DB.prepare(
              "UPDATE users SET email=?,display_name=?,active=?,archived_at=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE archived_at END,billing_position_id=CASE WHEN ?=1 THEN ? ELSE billing_position_id END,pay_basis=CASE WHEN ?=1 THEN ? ELSE pay_basis END,pay_amount_cents=CASE WHEN ?=1 THEN ? ELSE pay_amount_cents END,updated_at=CURRENT_TIMESTAMP WHERE id=?",
            ).bind(
              email,
              name,
              Number(user.active && !user.archived),
              Number(Boolean(user.archived)),
              Number(user.billingPositionId!==undefined),user.billingPositionId??null,Number(user.payBasis!==undefined),user.payBasis??null,Number(user.payAmountCents!==undefined),user.payAmountCents??null,
              user.id,
            ),
          );
          statements.push(
            c.env.DB.prepare(
              "UPDATE user_roles SET role_id=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?",
            ).bind(user.roleId, c.get("auth").internalUserId, user.id),
          );
        }
        statements.push(
          c.env.DB.prepare(
            "INSERT INTO user_audit(id,user_id,actor_id,action,after_json) VALUES(?,?,?,?,?)",
          ).bind(
            crypto.randomUUID(),
            user.id,
            c.get("auth").internalUserId,
            user.isNew ? "created" : user.archived ? "archived" : "updated",
            JSON.stringify({
              email,
              displayName: name,
              roleId: user.roleId,
              active: user.active && !user.archived,
            }),
          ),
        );
      }
      for(const user of body.users)if(user.managerUserId!==undefined)statements.push(c.env.DB.prepare('UPDATE users SET manager_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(user.managerUserId||null,user.id));
      if (statements.length) await c.env.DB.batch(statements);
    } catch {
      return c.json(
        {
          error:
            "Could not save users. Check for an email conflict or concurrent change.",
        },
        409,
      );
    }
    const deliveries: Array<{ id: string; sent: boolean }> = [];
    for (const user of body.users) {
      if ((!user.active || user.archived) && !user.isNew)
        await revokeUserSessions(c.env.DB, user.id);
      if (user.isNew && user.active) {
        try {
          await sendAccessEmail(
            c.env,
            user.email,
            user.displayName,
            await issueAccessLink(c.env.DB, user.id, "invite"),
          );
          deliveries.push({ id: user.id, sent: true });
        } catch {
          deliveries.push({ id: user.id, sent: false });
        }
      }
    }
    return c.json({ saved: true, deliveries });
  });
  api.get("/users", async (c) => {
    const rows = await c.env.DB.prepare(
      `SELECT u.id,u.email,u.display_name,u.user_type,u.active,u.archived_at,u.created_at,u.updated_at,u.manager_user_id,u.billing_position_id,u.pay_basis,u.pay_amount_cents,r.id AS role_id,r.name AS role_name FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE u.user_type='internal' ORDER BY u.display_name COLLATE NOCASE`,
    ).all();
    return c.json({ items: c.get('permissions').hasPermission('timesheets.rates.view') ? rows.results : rows.results.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['pay_basis','pay_amount_cents','billing_position_id'].includes(key)))) });
  });
  api.get("/users/:id", userDetail);
  api.post("/users", async (c) => {
    const body = await bodyOf(c.req.raw);
    const email = clean(body.email, 320).toLowerCase(),
      displayName = clean(body.displayName),
      roleId = clean(body.roleId, 128);
    if (!validEmail(email) || !displayName || !roleId)
      return c.json({ error: "Email, name, and role are required." }, 400);
    if (
      !(await c.env.DB.prepare(
        "SELECT id FROM roles WHERE id=? AND archived_at IS NULL",
      )
        .bind(roleId)
        .first())
    )
      return c.json({ error: "Select an active role." }, 400);
    const id = crypto.randomUUID();
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(
          "INSERT INTO users(id,email,display_name,user_type,active) VALUES(?,?,?,'internal',?)",
        ).bind(id, email, displayName, body.active === false ? 0 : 1),
        c.env.DB.prepare(
          "INSERT INTO user_roles(user_id,role_id,updated_by) VALUES(?,?,?)",
        ).bind(id, roleId, c.get("auth").internalUserId),
      ]);
    } catch {
      return c.json({ error: "A user with that email already exists." }, 409);
    }
    await audit(c.env.DB, id, c.get("auth").internalUserId!, "created", {
      email,
      displayName,
      roleId,
    });
    if (body.active === false) return c.json({ id, delivery: "not_sent" }, 201);
    try {
      await sendAccessEmail(
        c.env,
        email,
        displayName,
        await issueAccessLink(c.env.DB, id, "invite"),
      );
      return c.json({ id, delivery: "sent" }, 201);
    } catch {
      return c.json(
        {
          id,
          delivery: "failed",
          error: "User created; invitation delivery failed.",
        },
        201,
      );
    }
  });
  api.put("/users/:id", async (c) => {
    const id = c.req.param("id"),
      body = await bodyOf(c.req.raw);
    const current = await c.env.DB.prepare(
      "SELECT id,email,display_name,active FROM users WHERE id=? AND archived_at IS NULL",
    )
      .bind(id)
      .first<User>();
    if (!current) return c.json({ error: "User not found." }, 404);
    const email =
      body.email === undefined
        ? current.email
        : clean(body.email, 320).toLowerCase();
    const displayName =
      body.displayName === undefined
        ? current.display_name
        : clean(body.displayName);
    const active =
      body.active === undefined
        ? current.active
        : body.active === true
          ? 1
          : body.active === false
            ? 0
            : -1;
    const roleId = body.roleId === undefined ? null : clean(body.roleId, 128);
    if (!validEmail(email) || !displayName || active < 0)
      return c.json({ error: "Invalid user details." }, 400);
    if (id === c.get("auth").internalUserId && active === 0)
      return c.json({ error: "You cannot disable yourself." }, 400);
    if(active===0 && await c.env.DB.prepare("SELECT id FROM users WHERE manager_user_id=? AND active=1 AND archived_at IS NULL LIMIT 1").bind(id).first())return c.json({error:'Reassign active direct reports before disabling this manager.'},409);
    if (
      (active === 0 || (roleId && roleId !== "super-administrator")) &&
      (await lastAdmin(c.env.DB, id))
    )
      return c.json(
        { error: "The last administrator cannot lose access." },
        409,
      );
    if (
      roleId &&
      !(await c.env.DB.prepare(
        "SELECT id FROM roles WHERE id=? AND archived_at IS NULL",
      )
        .bind(roleId)
        .first())
    )
      return c.json({ error: "Select an active role." }, 400);
    await c.env.DB.prepare(
      "UPDATE users SET email=?,display_name=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    )
      .bind(email, displayName, active, id)
      .run();
    if (roleId)
      await c.env.DB.prepare(
        "UPDATE user_roles SET role_id=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?",
      )
        .bind(roleId, c.get("auth").internalUserId, id)
        .run();
    if (active === 0) await revokeUserSessions(c.env.DB, id);
    await audit(c.env.DB, id, c.get("auth").internalUserId!, "updated", {
      email,
      displayName,
      active,
      roleId,
    });
    return c.json({
      id,
      email,
      display_name: displayName,
      active,
      role_id: roleId,
    });
  });
  api.post("/users/:id/archive", async (c) => {
    const id = c.req.param("id");
    if (id === c.get("auth").internalUserId)
      return c.json({ error: "You cannot archive yourself." }, 400);
    if (await lastAdmin(c.env.DB, id))
      return c.json(
        { error: "The last administrator cannot be archived." },
        409,
      );
    if(await c.env.DB.prepare("SELECT id FROM users WHERE manager_user_id=? AND active=1 AND archived_at IS NULL LIMIT 1").bind(id).first())return c.json({error:'Reassign active direct reports before archiving this manager.'},409);
    const result = await c.env.DB.prepare(
      "UPDATE users SET active=0,archived_at=CURRENT_TIMESTAMP,archived_by=? WHERE id=? AND archived_at IS NULL",
    )
      .bind(c.get("auth").internalUserId, id)
      .run();
    if (!result.meta.changes) return c.json({ error: "User not found." }, 404);
    await revokeUserSessions(c.env.DB, id);
    await audit(c.env.DB, id, c.get("auth").internalUserId!, "archived", {});
    return c.json({ id, archived: true });
  });
  for (const purpose of ["invite", "reset"] as const)
    api.post(
      `/users/:id/${purpose === "invite" ? "invite" : "recover"}`,
      async (c) => {
        const user = await c.env.DB.prepare(
          "SELECT id,email,display_name,active FROM users WHERE id=? AND active=1 AND archived_at IS NULL",
        )
          .bind(c.req.param("id"))
          .first<User>();
        if (!user) return c.json({ error: "Active user not found." }, 404);
        try {
          await sendAccessEmail(
            c.env,
            user.email,
            user.display_name,
            await issueAccessLink(c.env.DB, user.id, purpose),
          );
          if (purpose === "reset") {
            await revokeUserSessions(c.env.DB, user.id);
            await c.env.DB.prepare("DELETE FROM user_passkeys WHERE user_id=?")
              .bind(user.id)
              .run();
            await c.env.DB.prepare(
              "DELETE FROM user_recovery_codes WHERE user_id=?",
            )
              .bind(user.id)
              .run();
            await c.env.DB.prepare(
              "UPDATE user_credentials SET totp_secret=NULL,totp_enabled=0 WHERE user_id=?",
            )
              .bind(user.id)
              .run();
          }
          return c.json({ delivered: true });
        } catch {
          return c.json({ error: "Email delivery failed." }, 502);
        }
      },
    );
  return api;
}
async function audit(
  db: D1Database,
  userId: string,
  actorId: string,
  action: string,
  after: unknown,
) {
  await db
    .prepare(
      "INSERT INTO user_audit(id,user_id,actor_id,action,after_json) VALUES(?,?,?,?,?)",
    )
    .bind(crypto.randomUUID(), userId, actorId, action, JSON.stringify(after))
    .run();
}
