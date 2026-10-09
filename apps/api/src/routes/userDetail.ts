import type { Context } from 'hono';
import type { HonoEnv } from '../types/apiTypes';

type DetailRow = {
  id: string; email: string; display_name: string; user_type: string;
  active: number; archived_at: string | null; created_at: string; updated_at: string;
  role_id: string | null; role_name: string | null;
  manager_user_id: string | null; manager_name: string | null;
  billing_position_id: string | null; billing_position_name: string | null;
  pay_basis: 'hourly' | 'salary' | null; pay_amount_cents: number | null;
};

export async function userDetail(c: Context<HonoEnv>) {
  if (!c.get('permissions').hasPermission('users.view')) return c.json({ error: 'Permission denied.' }, 403);
  const row = await c.env.DB.prepare(`SELECT u.id,u.email,u.display_name,u.user_type,u.active,u.archived_at,u.created_at,u.updated_at,
    r.id AS role_id,r.name AS role_name,u.manager_user_id,m.display_name AS manager_name,
    u.billing_position_id,bp.name AS billing_position_name,u.pay_basis,u.pay_amount_cents
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id=u.id
    LEFT JOIN roles r ON r.id=ur.role_id
    LEFT JOIN users m ON m.id=u.manager_user_id
    LEFT JOIN billing_positions bp ON bp.id=u.billing_position_id
    WHERE u.id=?`).bind(c.req.param('id')).first<DetailRow>();
  if (!row) return c.json({ error: 'User not found.' }, 404);
  const basic = {
    id: row.id, email: row.email, displayName: row.display_name, userType: row.user_type,
    active: row.active === 1, archivedAt: row.archived_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
    role: row.role_id ? { id: row.role_id, name: row.role_name } : null,
    manager: row.manager_user_id ? { id: row.manager_user_id, name: row.manager_name } : null,
  };
  if (!c.get('permissions').hasPermission('timesheets.rates.view')) return c.json(basic);
  return c.json({ ...basic, compensation: {
    billingPosition: row.billing_position_id ? { id: row.billing_position_id, name: row.billing_position_name } : null,
    payBasis: row.pay_basis, payAmountCents: row.pay_amount_cents,
  } });
}
