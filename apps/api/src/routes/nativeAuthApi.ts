import { Hono } from 'hono'
import type { HonoEnv } from '../types/apiTypes'
import { readSession, randomToken, sha256 } from '../auth/session'
import { ACCESS_MS, CODE_MS, GRANT_MS, INACTIVE_MS, NATIVE_CLIENT_ID, issueAccess, pkceChallenge, validChallenge, validLabel, validRedirect, validState } from '../auth/nativeAuth'
import { allowRequest } from '../services/rateLimit'

const bodyOf = async (request: Request): Promise<Record<string, unknown>> => request.json().catch(() => ({})) as Promise<Record<string, unknown>>
const tokenResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Pragma: 'no-cache' } })
const invalidGrant = () => tokenResponse({ error: 'invalid_grant' }, 400)
const validToken = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{40,}$/.test(value)

export function createNativeAuthApi() {
  const api = new Hono<HonoEnv>()

  api.post('/native/authorize', async c => {
    const session = await readSession(c.env.DB, c.req.raw)
    if (!session || session.pendingMfa) return c.json({ error: 'Sign in required.' }, 401)
    const body = await bodyOf(c.req.raw)
    if (body.client_id !== NATIVE_CLIENT_ID || !validRedirect(body.redirect_uri) || !validChallenge(body.code_challenge)
      || body.code_challenge_method !== 'S256' || !validState(body.state) || !validLabel(body.installation_label))
      return c.json({ error: 'Invalid desktop authorization request.' }, 400)
    const limit = await allowRequest(c.env.DB, `native-authorize:${session.userId}`, 12, 15 * 60_000)
    if (!limit.allowed) return c.json({ error: 'Too many attempts.' }, 429, { 'Retry-After': String(limit.retryAfterSeconds) })
    const code = randomToken(), now = Date.now()
    await c.env.DB.prepare(`INSERT INTO native_auth_codes(code_hash,user_id,client_id,redirect_uri,code_challenge,installation_label,expires_at)
      VALUES(?,?,?,?,?,?,?)`).bind(await sha256(code), session.userId, NATIVE_CLIENT_ID, body.redirect_uri, body.code_challenge, body.installation_label.trim(), now + CODE_MS).run()
    const redirect = new URL(body.redirect_uri)
    redirect.searchParams.set('code', code)
    redirect.searchParams.set('state', body.state)
    return c.json({ redirect_uri: redirect.toString() })
  })

  api.post('/native/token', async c => {
    const body = await bodyOf(c.req.raw), now = Date.now()
    if (body.client_id !== NATIVE_CLIENT_ID) return tokenResponse({ error: 'invalid_client' }, 400)
    const ip = c.req.header('CF-Connecting-IP') || 'local'
    const limit = await allowRequest(c.env.DB, `native-token:${ip}`, 60, 15 * 60_000)
    if (!limit.allowed) return tokenResponse({ error: 'slow_down' }, 429)
    if (body.grant_type === 'authorization_code') {
      if (!validToken(body.code) || !validRedirect(body.redirect_uri) || typeof body.code_verifier !== 'string'
        || !/^[A-Za-z0-9._~-]{43,128}$/.test(body.code_verifier)) return invalidGrant()
      const hash = await sha256(body.code)
      const row = await c.env.DB.prepare(`SELECT user_id,redirect_uri,code_challenge,installation_label FROM native_auth_codes
        WHERE code_hash=? AND client_id=? AND used_at IS NULL AND expires_at>?`)
        .bind(hash, NATIVE_CLIENT_ID, now).first<{ user_id: string; redirect_uri: string; code_challenge: string; installation_label: string }>()
      if (!row || row.redirect_uri !== body.redirect_uri || row.code_challenge !== await pkceChallenge(body.code_verifier)) return invalidGrant()
      const user = await c.env.DB.prepare(`SELECT u.id FROM users u JOIN user_credentials cr ON cr.user_id=u.id JOIN user_roles ur ON ur.user_id=u.id
        JOIN roles r ON r.id=ur.role_id WHERE u.id=? AND u.active=1 AND u.archived_at IS NULL AND u.user_type='internal'
        AND cr.totp_enabled=1 AND r.archived_at IS NULL`).bind(row.user_id).first<{ id: string }>()
      if (!user) return invalidGrant()
      const consumed = await c.env.DB.prepare('UPDATE native_auth_codes SET used_at=? WHERE code_hash=? AND used_at IS NULL AND expires_at>?')
        .bind(now, hash, now).run()
      if (Number(consumed.meta.changes) !== 1) return invalidGrant()
      const grantId = crypto.randomUUID(), refresh = randomToken()
      await c.env.DB.prepare(`INSERT INTO native_grants(id,user_id,client_id,installation_label,refresh_hash,created_at,last_used_at,inactive_expires_at,expires_at)
        VALUES(?,?,?,?,?,?,?,?,?)`).bind(grantId, user.id, NATIVE_CLIENT_ID, row.installation_label, await sha256(refresh), now, now, now + INACTIVE_MS, now + GRANT_MS).run()
      return tokenResponse({ ...await issueAccess(c.env.DB, grantId, now), refresh_token: refresh, grant_id: grantId })
    }
    if (body.grant_type === 'refresh_token') {
      if (!validToken(body.refresh_token)) return invalidGrant()
      const hash = await sha256(body.refresh_token)
      const grant = await c.env.DB.prepare(`SELECT g.id,g.user_id,g.expires_at FROM native_grants g
        JOIN users u ON u.id=g.user_id JOIN user_credentials cr ON cr.user_id=u.id
        JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
        WHERE g.refresh_hash=? AND g.client_id=? AND g.revoked_at IS NULL AND g.expires_at>?
        AND g.inactive_expires_at>? AND u.active=1 AND u.archived_at IS NULL AND u.user_type='internal'
        AND cr.totp_enabled=1 AND r.archived_at IS NULL`).bind(hash, NATIVE_CLIENT_ID, now, now).first<{ id: string; user_id: string; expires_at: number }>()
      if (!grant) {
        const used = await c.env.DB.prepare('SELECT grant_id FROM native_refresh_history WHERE token_hash=?').bind(hash).first<{ grant_id: string }>()
        if (used) await c.env.DB.prepare('UPDATE native_grants SET revoked_at=? WHERE id=? AND revoked_at IS NULL').bind(now, used.grant_id).run()
        return invalidGrant()
      }
      const refresh = randomToken(), nextHash = await sha256(refresh)
      try {
        const results = await c.env.DB.batch([
          c.env.DB.prepare(`UPDATE native_grants SET refresh_hash=?,last_used_at=?,inactive_expires_at=?
            WHERE id=? AND refresh_hash=? AND revoked_at IS NULL AND expires_at>? AND inactive_expires_at>?`)
            .bind(nextHash, now, Math.min(now + INACTIVE_MS, grant.expires_at), grant.id, hash, now, now),
          c.env.DB.prepare('INSERT INTO native_refresh_history(token_hash,grant_id,rotated_at) VALUES(?,?,?)').bind(hash, grant.id, now),
        ])
        if (Number(results[0]?.meta.changes) !== 1) {
          await c.env.DB.prepare('UPDATE native_grants SET revoked_at=? WHERE id=? AND revoked_at IS NULL').bind(now, grant.id).run()
          return invalidGrant()
        }
      } catch {
        await c.env.DB.prepare('UPDATE native_grants SET revoked_at=? WHERE id=? AND revoked_at IS NULL').bind(now, grant.id).run()
        return invalidGrant()
      }
      return tokenResponse({ ...await issueAccess(c.env.DB, grant.id, now), refresh_token: refresh, grant_id: grant.id })
    }
    return tokenResponse({ error: 'unsupported_grant_type' }, 400)
  })

  api.post('/native/revoke', async c => {
    const ip = c.req.header('CF-Connecting-IP') || 'local'
    const limit = await allowRequest(c.env.DB, `native-revoke:${ip}`, 60, 15 * 60_000)
    if (!limit.allowed) return tokenResponse({ error: 'slow_down' }, 429)
    const body = await bodyOf(c.req.raw)
    if (body.client_id === NATIVE_CLIENT_ID && validToken(body.refresh_token)) {
      const hash = await sha256(body.refresh_token)
      await c.env.DB.prepare(`UPDATE native_grants SET revoked_at=? WHERE client_id=? AND revoked_at IS NULL
        AND (refresh_hash=? OR id IN (SELECT grant_id FROM native_refresh_history WHERE token_hash=?))`)
        .bind(Date.now(), NATIVE_CLIENT_ID, hash, hash).run()
    }
    return tokenResponse({ revoked: true })
  })

  api.get('/native/me', async c => {
    const auth = c.get('auth')
    const user = await c.env.DB.prepare(`SELECT u.id,u.email,u.display_name,r.name AS role_name FROM users_named u
      JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=?`)
      .bind(auth.internalUserId).first<{ id: string; email: string; display_name: string; role_name: string }>()
    return c.json({ user: { id: user?.id, email: user?.email, displayName: user?.display_name, roleName: user?.role_name }, permissions: auth.permissions || [] })
  })

  api.get('/native/grants', async c => {
    const rows = await c.env.DB.prepare(`SELECT id,installation_label,created_at,last_used_at,inactive_expires_at,expires_at
      FROM native_grants WHERE user_id=? AND revoked_at IS NULL AND expires_at>? AND inactive_expires_at>? ORDER BY created_at DESC`)
      .bind(c.get('auth').internalUserId, Date.now(), Date.now()).all()
    return c.json({ grants: rows.results })
  })

  api.post('/native/grants/:id/revoke', async c => {
    const result = await c.env.DB.prepare('UPDATE native_grants SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL')
      .bind(Date.now(), c.req.param('id'), c.get('auth').internalUserId).run()
    return c.json({ revoked: Number(result.meta.changes) === 1 })
  })
  return api
}
