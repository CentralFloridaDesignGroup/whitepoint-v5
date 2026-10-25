import { Hono } from "hono";
import { issueAccessLink, sendAccessEmail } from "../auth/mail";
import { validateReportingManagers } from '../services/reportingHierarchy'
import { userDetail } from './userDetail'
import { revokeUserSessions } from "../auth/session";
import { activeRoleAccess, canAssignRole, canManageUser, isSuperAdministrator } from '../security/permissionCeiling'
import type { HonoEnv } from "../types/apiTypes";

const clean = (value: unknown, max = 200) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const staffName = (first: unknown, middle: unknown, last: unknown, suffixValue: unknown) => {
  const firstName=clean(first),middleName=clean(middle),lastName=clean(last),suffix=clean(suffixValue);
  return {firstName,middleName,lastName,suffix,displayName:[firstName,middleName,lastName,suffix].filter(Boolean).join(' ')};
};
type User = { id: string; email: string; display_name: string; active: number };
async function lastAdmin(db: D1Database, userId: string) {
  const target = await db
    .prepare("SELECT role_id FROM user_roles WHERE user_id=?")
    .bind(userId)
    .first<{ role_id: string }>();
  if (target?.role_id !== "super-administrator") return false;
  const others = await db
    .prepare(
      `SELECT count(*) AS count FROM users_named u JOIN user_roles ur ON ur.user_id=u.id
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
  api.post("/users/bulk", async (c) => {
    const body = await c.req
      .json<{
        users?: Array<{
          id: string;
          email: string;
          firstName: string;
          middleName?: string;
          lastName: string;
          suffix?: string;
          roleId: string;
          active: boolean;
          archived?: boolean;
          isNew?: boolean;
          managerUserId?: string | null;
          billingPositionId?: string | null;
          payBasis?: 'hourly' | 'salary' | null;
          payAmountCents?: number | null;
          weeklyHours?: number | null;
        }>;
      }>()
      .catch(() => null);
    if (!body || !Array.isArray(body.users) || body.users.length > 100)
      return c.json({ error: "Invalid user changes." }, 400);
    const roleAccess = await activeRoleAccess(c.env.DB);
    const roleIds = new Set(roleAccess.keys());
    const actorPermissions = c.get('auth').permissions || [];
    const ids = new Set<string>(),
      emails = new Set<string>();
    const positionIds = new Set((await c.env.DB.prepare('SELECT id FROM billing_positions WHERE active=1').all<{id:string}>()).results.map(row=>row.id));
    const managerRows = (await c.env.DB.prepare("SELECT id,manager_user_id FROM users_named WHERE user_type='internal' AND archived_at IS NULL AND active=1").all<{id:string;manager_user_id:string|null}>()).results;
    const managers = new Map(managerRows.map(row=>[row.id,row.manager_user_id]));
    const eligible = await c.env.DB.prepare(
      `SELECT u.id,ur.role_id FROM users_named u JOIN user_roles ur ON ur.user_id=u.id WHERE u.active=1 AND u.archived_at IS NULL AND (EXISTS(SELECT 1 FROM user_credentials cr WHERE cr.user_id=u.id AND cr.password_hash IS NOT NULL) OR EXISTS(SELECT 1 FROM user_passkeys p WHERE p.user_id=u.id))`,
    ).all<{ id: string; role_id: string }>();
    const eligibleIds = new Set(eligible.results.map((row) => row.id));
    const finalAdmins = new Set(
      eligible.results
        .filter((row) => row.role_id === "super-administrator")
        .map((row) => row.id),
    );
    for (const user of body.users) {
      const email = clean(user.email, 320).toLowerCase();
      const name=staffName(user.firstName,user.middleName,user.lastName,user.suffix);
      if (
        ids.has(user.id) ||
        emails.has(email) ||
        !validEmail(email) ||
        !name.firstName ||
        !name.lastName ||
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
      if (!canAssignRole(actorPermissions, roleAccess.get(user.roleId)))
        return c.json({ error: 'You cannot assign a role above your permission ceiling.' }, 403);
      if (!user.isNew && !await canManageUser(c.env.DB, actorPermissions, user.id))
        return c.json({ error: 'You cannot change a user above your permission ceiling.' }, 403);
      if (user.managerUserId === user.id || user.billingPositionId && !positionIds.has(user.billingPositionId) || user.payBasis && !['hourly','salary'].includes(user.payBasis) || user.payAmountCents != null && (!Number.isSafeInteger(user.payAmountCents) || user.payAmountCents < 0) || user.weeklyHours != null && (!Number.isSafeInteger(user.weeklyHours) || user.weeklyHours < -1)) return c.json({error:'Invalid manager, billing position, pay rate, or weekly hours.'},400);
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
          "SELECT id FROM users_named WHERE id=? AND archived_at IS NULL",
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
    if(body.users.some(user=>user.managerUserId!==undefined||user.billingPositionId!==undefined||user.payBasis!==undefined||user.payAmountCents!==undefined||user.weeklyHours!==undefined)&&!c.get('permissions').hasPermission('timesheets.rates.manage')) return c.json({error:'Pay and reporting setup requires rate management permission.'},403);
    if (!finalAdmins.size)
      return c.json(
        { error: "The last administrator cannot lose access." },
        409,
      );
    try {
      const statements = [];
      for (const user of body.users) {
        const email = clean(user.email, 320).toLowerCase(),
          {firstName,middleName,lastName,suffix,displayName:name} = staffName(user.firstName,user.middleName,user.lastName,user.suffix);
        if (user.isNew) {
          statements.push(
            c.env.DB.prepare(
              "INSERT INTO users(id,email,first_name,middle_name,last_name,suffix,user_type,active,manager_user_id,billing_position_id,pay_basis,pay_amount_cents,weekly_hours) VALUES(?,?,?,?,?,?,'internal',?,?,?,?,?,?)",
            ).bind(user.id,email,firstName,middleName,lastName,suffix,Number(user.active),null,user.billingPositionId||null,user.payBasis||null,user.payAmountCents??null,user.weeklyHours??null),
          );
          statements.push(
            c.env.DB.prepare(
              "INSERT INTO user_roles(user_id,role_id,updated_by) VALUES(?,?,?)",
            ).bind(user.id, user.roleId, c.get("auth").internalUserId),
          );
        } else {
          statements.push(
            c.env.DB.prepare(
              "UPDATE users SET email=?,first_name=?,middle_name=?,last_name=?,suffix=?,active=?,archived_at=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE archived_at END,billing_position_id=CASE WHEN ?=1 THEN ? ELSE billing_position_id END,pay_basis=CASE WHEN ?=1 THEN ? ELSE pay_basis END,pay_amount_cents=CASE WHEN ?=1 THEN ? ELSE pay_amount_cents END,weekly_hours=CASE WHEN ?=1 THEN ? ELSE weekly_hours END,updated_at=CURRENT_TIMESTAMP WHERE id=?",
            ).bind(
              email,
              firstName,
              middleName,
              lastName,
              suffix,
              Number(user.active && !user.archived),
              Number(Boolean(user.archived)),
              Number(user.billingPositionId!==undefined),user.billingPositionId??null,Number(user.payBasis!==undefined),user.payBasis??null,Number(user.payAmountCents!==undefined),user.payAmountCents??null,Number(user.weeklyHours!==undefined),user.weeklyHours??null,
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
              firstName,
              middleName,
              lastName,
              suffix,
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
            staffName(user.firstName,user.middleName,user.lastName,user.suffix).displayName,
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
      `SELECT u.id,u.email,u.display_name,u.first_name,u.middle_name,u.last_name,u.suffix,u.user_type,u.active,u.archived_at,u.created_at,u.updated_at,u.manager_user_id,u.billing_position_id,u.pay_basis,u.pay_amount_cents,r.id AS role_id,r.name AS role_name FROM users_named u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE u.user_type='internal' ORDER BY u.display_name COLLATE NOCASE`,
    ).all();
    return c.json({ items: c.get('permissions').hasPermission('timesheets.rates.view') ? rows.results : rows.results.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['pay_basis','pay_amount_cents','billing_position_id'].includes(key)))) });
  });
  api.get("/users/role-options", async (c) => {
    const rows = await c.env.DB.prepare(
      "SELECT id,name,permissions FROM roles WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE",
    ).all<{ id: string; name: string; permissions: string }>();
    const actorPermissions = c.get('auth').permissions || [];
    return c.json({ items: rows.results.filter(row => isSuperAdministrator(actorPermissions) || canAssignRole(actorPermissions, { id: row.id, permissions: JSON.parse(row.permissions) })).map(({ id, name }) => ({ id, name })) });
  });
  api.get("/users/:id", userDetail);
  api.post("/users/:id/archive", async (c) => {
    const id = c.req.param("id");
    if (!await canManageUser(c.env.DB, c.get('auth').permissions || [], id))
      return c.json({ error: 'You cannot archive a user above your permission ceiling.' }, 403);
    if (id === c.get("auth").internalUserId)
      return c.json({ error: "You cannot archive yourself." }, 400);
    if (await lastAdmin(c.env.DB, id))
      return c.json(
        { error: "The last administrator cannot be archived." },
        409,
      );
    if(await c.env.DB.prepare("SELECT id FROM users_named WHERE manager_user_id=? AND active=1 AND archived_at IS NULL LIMIT 1").bind(id).first())return c.json({error:'Reassign active direct reports before archiving this manager.'},409);
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
        if (!await canManageUser(c.env.DB, c.get('auth').permissions || [], c.req.param('id')))
          return c.json({ error: 'You cannot change access for a user above your permission ceiling.' }, 403);
        const user = await c.env.DB.prepare(
          "SELECT id,email,display_name,active FROM users_named WHERE id=? AND active=1 AND archived_at IS NULL",
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
              "UPDATE user_credentials SET totp_secret=NULL,totp_enabled=0,totp_pending_secret=NULL,totp_pending_expires_at=NULL WHERE user_id=?",
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
