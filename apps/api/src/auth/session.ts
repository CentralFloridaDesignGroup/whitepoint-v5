import type { MiddlewareHandler } from 'hono'
import type { HonoEnv } from '../types/apiTypes'

const COOKIE = '__Host-wps_session'
const cookieName = (request: Request) => new URL(request.url).hostname === 'localhost' ? 'wps_session' : COOKIE
const SESSION_MS = 12 * 60 * 60 * 1000

export const randomToken = (bytes = 32) => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes)))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
export async function sha256(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('')
}
export function cookie(request: Request): string | null {
  const name = cookieName(request)
  return request.headers.get('Cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`))?.slice(name.length + 1) || null
}
export function setSessionCookie(token: string, request: Request): string {
  const secure = new URL(request.url).hostname !== 'localhost' ? '; Secure' : ''
  return `${cookieName(request)}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`
}
export function clearSessionCookie(request: Request): string {
  return `${cookieName(request)}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${new URL(request.url).hostname !== 'localhost' ? '; Secure' : ''}`
}
export async function issueSession(db: D1Database, userId: string, pendingMfa = false) {
  const token = randomToken(), csrf = randomToken()
  const now = Date.now()
  await db.prepare('INSERT INTO user_sessions(token_hash,user_id,csrf_token,pending_mfa,created_at,expires_at) VALUES(?,?,?,?,?,?)')
    .bind(await sha256(token), userId, csrf, pendingMfa ? 1 : 0, now, now + SESSION_MS).run()
  return { token, csrf }
}
export type Session = { userId: string; csrfToken: string; pendingMfa: boolean; permissions: string[]; roleName: string; email: string; displayName: string }
export async function readSession(db: D1Database, request: Request): Promise<Session | null> {
  const token = cookie(request)
  if (!token) return null
  const row = await db.prepare(`SELECT s.user_id,s.csrf_token,s.pending_mfa,c.totp_enabled,u.email,u.display_name,r.name AS role_name,r.permissions
    FROM user_sessions s JOIN users u ON u.id=s.user_id JOIN user_credentials c ON c.user_id=u.id JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.active=1 AND u.archived_at IS NULL AND r.archived_at IS NULL`)
    .bind(await sha256(token), Date.now()).first<Record<string, unknown>>()
  if (!row) return null
  let permissions: string[] = []
  try { const value = JSON.parse(String(row.permissions)); if (Array.isArray(value)) permissions = value.filter((x): x is string => typeof x === 'string') } catch { /* deny */ }
  return { userId: String(row.user_id), csrfToken: String(row.csrf_token), pendingMfa: Number(row.pending_mfa) === 1 || Number(row.totp_enabled) !== 1, permissions, roleName: String(row.role_name), email: String(row.email), displayName: String(row.display_name) }
}
export function hasPermission(session: Session, key: string) { return session.permissions.includes('*') || session.permissions.includes(key) }
export const requireSession = (permission?: string): MiddlewareHandler<HonoEnv> => async (c, next) => {
  const session = await readSession(c.env.DB, c.req.raw)
  if (!session || session.pendingMfa) return c.json({ error: 'Sign in required.' }, 401)
  if (permission && !hasPermission(session, permission)) return c.json({ error: 'Permission denied.' }, 403)
  c.set('auth', { mode: 'session', subject: session.userId, internalUserId: session.userId, permissions: session.permissions })
  c.set('permissions', { hasPermission: (key: string) => hasPermission(session, key), hasPermissions: (keys: string[]) => keys.every(key => hasPermission(session, key)) })
  await next()
}
export async function revokeUserSessions(db: D1Database, userId: string) {
  await db.prepare('UPDATE user_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').bind(Date.now(), userId).run()
}
