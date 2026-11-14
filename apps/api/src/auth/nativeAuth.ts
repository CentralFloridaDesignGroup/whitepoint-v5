import type { MiddlewareHandler } from 'hono'
import type { HonoEnv } from '../types/apiTypes'
import { randomToken, sha256 } from './session'

export const NATIVE_CLIENT_ID = 'northstar-desktop'
export const ACCESS_MS = 10 * 60_000
export const INACTIVE_MS = 30 * 24 * 60 * 60_000
export const GRANT_MS = 90 * 24 * 60 * 60_000
export const CODE_MS = 5 * 60_000

export function validRedirect(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 200) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === '[::1]')
      && Number(url.port) > 0 && url.pathname === '/northstar/callback'
      && !url.username && !url.password && !url.search && !url.hash
  } catch { return false }
}

export const validChallenge = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
export const validState = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(value)
export const validLabel = (value: unknown): value is string => typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 80 && !/[\u0000-\u001f\u007f]/.test(value)

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  return btoa(String.fromCharCode(...digest)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export async function issueAccess(db: D1Database, grantId: string, now = Date.now()) {
  const accessToken = randomToken()
  await db.prepare('INSERT INTO native_access_tokens(token_hash,grant_id,expires_at) VALUES(?,?,?)')
    .bind(await sha256(accessToken), grantId, now + ACCESS_MS).run()
  return { access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_MS / 1000 }
}

export async function revokeNativeGrants(db: D1Database, userId: string) {
  await db.prepare('UPDATE native_grants SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').bind(Date.now(), userId).run()
}

export type NativeIdentity = { userId: string; grantId: string; permissions: string[]; roleName: string; email: string; displayName: string }

export async function readNativeIdentity(db: D1Database, request: Request): Promise<NativeIdentity | null> {
  const header = request.headers.get('Authorization') || ''
  const match = /^Bearer ([A-Za-z0-9_-]{40,})$/.exec(header)
  if (!match) return null
  const now = Date.now()
  const row = await db.prepare(`SELECT g.id AS grant_id,g.user_id,u.email,u.display_name,r.name AS role_name,r.permissions
    FROM native_access_tokens a JOIN native_grants g ON g.id=a.grant_id
    JOIN users_named u ON u.id=g.user_id JOIN user_credentials cr ON cr.user_id=u.id
    JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
    WHERE a.token_hash=? AND a.expires_at>? AND g.revoked_at IS NULL AND g.expires_at>?
      AND g.inactive_expires_at>? AND u.active=1 AND u.archived_at IS NULL
      AND u.user_type='internal' AND cr.totp_enabled=1 AND r.archived_at IS NULL`)
    .bind(await sha256(match[1]!), now, now, now).first<Record<string, unknown>>()
  if (!row) return null
  let permissions: string[] = []
  try { const value = JSON.parse(String(row.permissions)); if (Array.isArray(value)) permissions = value.filter((x): x is string => typeof x === 'string') } catch { /* deny */ }
  return { userId: String(row.user_id), grantId: String(row.grant_id), email: String(row.email), displayName: String(row.display_name), roleName: String(row.role_name), permissions }
}

export const requireNative = (permission?: string): MiddlewareHandler<HonoEnv> => async (c, next) => {
  const identity = await readNativeIdentity(c.env.DB, c.req.raw)
  if (!identity) return c.json({ error: 'Sign in required.' }, 401)
  const has = (key: string) => identity.permissions.includes('*') || identity.permissions.includes(key)
  if (permission && !has(permission)) return c.json({ error: 'Permission denied.' }, 403)
  c.set('auth', { mode: 'native', subject: identity.userId, internalUserId: identity.userId, permissions: identity.permissions })
  c.set('permissions', { hasPermission: has, hasPermissions: (keys: string[]) => keys.every(has) })
  await next()
}
