import { guard as dbGuard } from '../services/writeGuard'
import type { Context } from 'hono';
import { syncQboClient, syncQboProject } from '../services/qboSync';
import type { HonoEnv } from '../types/apiTypes';

export type C = Context<HonoEnv>;
export type Row = Record<string, unknown>;
export const uid = () => crypto.randomUUID();
export const str = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export const json = <T>(value: unknown, fallback: T): T => { try { return typeof value === 'string' ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
export const bool = (value: unknown) => value === true || value === 1;
export const actor = (c: C) => c.get('auth').internalUserId;
export const permitted = (c: C, key: string) => c.get('permissions').hasPermission(key);
export const deny = (c: C) => c.json({ error: 'Permission denied.' }, 403);
export const bad = (c: C, error: string) => c.json({ error }, 400);
export const conflict = (c: C) => c.json({ error: 'This record changed since it was opened. Reload before saving.' }, 409);
export const emailOk = (value: string) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const money = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
export function taskLetters(index:number){let n=index,result='';do{result=String.fromCharCode(65+(n-1)%26)+result;n=Math.floor((n-1)/26);}while(n>0);return result;}

const projectManagerPermission = `EXISTS (
  SELECT 1 FROM json_each(r.permissions) permission
  WHERE permission.value IN ('*','projects.assign.pm')
)`;

export async function projectManagerOptions(db: D1Database) {
  const rows = await db.prepare(`SELECT u.id,u.display_name
    FROM users_named u
    JOIN user_roles ur ON ur.user_id=u.id
    JOIN roles r ON r.id=ur.role_id
    WHERE u.user_type='internal' AND u.active=1 AND u.archived_at IS NULL
      AND r.archived_at IS NULL AND ${projectManagerPermission}
    ORDER BY u.display_name COLLATE NOCASE`).all();
  return rows.results || [];
}

export async function isEligibleProjectManager(db: D1Database, userId: string) {
  return Boolean(await db.prepare(`SELECT 1
    FROM users u
    JOIN user_roles ur ON ur.user_id=u.id
    JOIN roles r ON r.id=ur.role_id
    WHERE u.id=? AND u.user_type='internal' AND u.active=1 AND u.archived_at IS NULL
      AND r.archived_at IS NULL AND ${projectManagerPermission}
    LIMIT 1`).bind(userId).first());
}

export async function audit(c: C, type: 'client' | 'project', recordId: string) {
  const rows = await c.env.DB.prepare('SELECT id,actor_id,action,before_json,after_json,created_at FROM audit_log WHERE record_type=? AND record_id=? ORDER BY created_at DESC LIMIT 100').bind(type, recordId).all<Row>();
  return rows.results || [];
}

export async function qboSave(c: C, kind: 'clients' | 'projects', row: Row, parentId = '') {
  let value: { id: string; syncToken: string } | null = null, error: string | null = null;
  if (c.env.QBO_CLIENT_ID && c.env.QBO_CLIENT_SECRET && c.env.QBO_REDIRECT_URI) {
    try {
      const transferred=kind==='projects'&&row.active===0&&!row.archived_at&&await c.env.DB.prepare('SELECT 1 FROM subdivision_assignments WHERE project_id=? AND ended_at IS NOT NULL').bind(row.id).first();
      value = kind === 'clients' ? await syncQboClient(c.env.DB,c.env,row) : await syncQboProject(c.env.DB,c.env,transferred?{...row,active:1}:row,parentId);
    }
    catch (caught) { error = String(caught instanceof Error ? caught.message : caught).slice(0,1000); }
  }
  const status = value ? 'synced' : error ? 'failed' : 'not_configured';
  await c.env.DB.prepare(`UPDATE ${kind} SET qbo_customer_id=COALESCE(?,qbo_customer_id),qbo_sync_token=COALESCE(?,qbo_sync_token),qbo_sync_status=?,qbo_sync_error=? WHERE id=?`).bind(value?.id ?? null,value?.syncToken ?? null,status,error,row.id).run();
  return { status, error };
}

export async function qboProjectParent(db:D1Database, row:Row) {
  const child=await db.prepare('SELECT parent_project_id FROM subdivision_assignments WHERE project_id=?').bind(row.id).first<{parent_project_id:string}>();
  if(child){const parent=await db.prepare('SELECT qbo_customer_id FROM projects WHERE id=?').bind(child.parent_project_id).first<{qbo_customer_id:string|null}>();return parent?.qbo_customer_id||'';}
  const client=await db.prepare('SELECT qbo_customer_id FROM clients WHERE id=?').bind(row.client_id).first<{qbo_customer_id:string|null}>();
  return client?.qbo_customer_id||'';
}

export function guard(c: C, id: string) { return dbGuard(c.env.DB, id); }
export const auditInsert = (c: C, type: string, id: string, action: string, before: unknown, after: unknown) => c.env.DB.prepare('INSERT INTO audit_log(id,actor_id,record_type,record_id,action,before_json,after_json) VALUES(?,?,?,?,?,?,?)').bind(uid(),actor(c),type,id,action,before ? JSON.stringify(before) : null,JSON.stringify(after));
