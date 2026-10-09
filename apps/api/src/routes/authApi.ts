import { Hono } from 'hono'
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import type { HonoEnv } from '../types/apiTypes'
import { decryptTotp, encryptTotp, hashPassword, issueRecoveryCodes, newTotpSecret, validPassword, verifyPassword, verifyTotp } from '../auth/credentials'
import { issueAccessLink, sendAccessEmail } from '../auth/mail'
import { clearSessionCookie, cookie, issueSession, readSession, revokeUserSessions, setSessionCookie, sha256 } from '../auth/session'
import { allowRequest } from '../services/rateLimit.ts'

const emailOf = (value: unknown) => String(value ?? '').trim().toLowerCase().slice(0, 320)
const bodyOf = async (request: Request): Promise<Record<string, unknown>> => request.json().catch(() => ({})) as Promise<Record<string, unknown>>
const rpId = (origin: string, configured?: string) => configured || (new URL(origin).hostname === 'localhost' ? 'localhost' : 'whitepointsurvey.com')
const response = (data: unknown, status = 200, cookieValue?: string) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...(cookieValue ? { 'Set-Cookie': cookieValue } : {}) } })
type Account = { id: string; email: string; display_name: string; password_hash: string | null; totp_enabled: number }
async function account(db: D1Database, email: string) {
  return db.prepare(`SELECT u.id,u.email,u.display_name,cr.password_hash,cr.totp_enabled FROM users u LEFT JOIN user_credentials cr ON cr.user_id=u.id WHERE u.email=? AND u.active=1 AND u.archived_at IS NULL AND u.user_type='internal'`).bind(email).first<Account>()
}
const limit = allowRequest
function clientAddress(request: Request) { return request.headers.get('CF-Connecting-IP') || 'local' }
async function storeChallenge(db: D1Database, userId: string | null, purpose: 'register' | 'login', challenge: string, origin: string) {
  await db.prepare('INSERT INTO user_webauthn_challenges(token_hash,user_id,purpose,origin,expires_at) VALUES(?,?,?,?,?)').bind(await sha256(challenge), userId, purpose, origin, Date.now() + 5 * 60_000).run()
}
async function consumeChallenge(db: D1Database, userId: string | null, purpose: 'register' | 'login', challenge: string, origin: string) {
  const result = await db.prepare('UPDATE user_webauthn_challenges SET used_at=? WHERE token_hash=? AND user_id IS ? AND purpose=? AND origin=? AND used_at IS NULL AND expires_at>?').bind(Date.now(), await sha256(challenge), userId, purpose, origin, Date.now()).run()
  return Number(result.meta.changes) === 1
}
async function completePending(db: D1Database, request: Request) {
  const value = cookie(request)
  if (!value) return false
  const result = await db.prepare('UPDATE user_sessions SET pending_mfa=0 WHERE token_hash=? AND pending_mfa=1 AND revoked_at IS NULL AND expires_at>? AND EXISTS (SELECT 1 FROM user_credentials c WHERE c.user_id=user_sessions.user_id AND c.totp_enabled=1)').bind(await sha256(value), Date.now()).run()
  return Number(result.meta.changes) === 1
}
async function canEnroll(db: D1Database, userId: string, pending: boolean) {
  if (!pending) return true
  const row = await db.prepare('SELECT totp_enabled FROM user_credentials WHERE user_id=?').bind(userId).first<{totp_enabled:number}>()
  return !row?.totp_enabled
}
export function createAuthApi() {
  const api = new Hono<HonoEnv>()
  api.get('/setup/status', async c => {
    const row = await c.env.DB.prepare('SELECT initialized FROM setup_state WHERE id=1').first<{initialized:number}>()
    return c.json({ setupRequired: row?.initialized === 0 })
  })
  api.post('/setup', async c => {
    const body = await bodyOf(c.req.raw)
    if (!await limit(c.env.DB, `setup:${clientAddress(c.req.raw)}`, 10, 60 * 60_000)) return c.json({ error: 'Too many attempts.' }, 429)
    const setup = await c.env.DB.prepare('SELECT initialized FROM setup_state WHERE id=1').first<{initialized:number}>()
    if (!setup || setup.initialized !== 0) return c.json({ error: 'Setup is complete.' }, 409)
    if (!c.env.AUTH_BOOTSTRAP_TOKEN || String(body.bootstrapToken || '') !== c.env.AUTH_BOOTSTRAP_TOKEN) return c.json({ error: 'Invalid setup token.' }, 403)
    const password = String(body.password || '')
    if (!validPassword(password)) return c.json({ error: 'Use a password of 15 to 1024 characters.' }, 400)
    const hashed = await hashPassword(password)
    const results = await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO user_credentials(user_id,password_hash) SELECT ?,? WHERE EXISTS(SELECT 1 FROM setup_state WHERE id=1 AND initialized=0)').bind('1', hashed),
      c.env.DB.prepare('UPDATE setup_state SET initialized=1,initialized_by=? WHERE id=1 AND initialized=0').bind('1'),
    ])
    if (Number(results[1]?.meta.changes) !== 1) return c.json({ error: 'Setup is complete.' }, 409)
    const session = await issueSession(c.env.DB, '1', true)
    return response({ next: 'enroll', csrfToken: session.csrf }, 201, setSessionCookie(session.token, c.req.raw))
  })
  api.post('/login', async c => {
    const body = await bodyOf(c.req.raw), email = emailOf(body.email), password = String(body.password || '')
    if (!await limit(c.env.DB, `login-ip:${clientAddress(c.req.raw)}`, 30, 15 * 60_000) || !await limit(c.env.DB, `login-email:${email}`, 10, 15 * 60_000)) return c.json({ error: 'Too many attempts. Try again later.' }, 429)
    const user = await account(c.env.DB, email)
    if (!user?.password_hash || !await verifyPassword(password, user.password_hash)) return c.json({ error: 'Invalid email or password.' }, 401)
    const session = await issueSession(c.env.DB, user.id, true)
    return response({ next: user.totp_enabled ? 'mfa' : 'enroll', csrfToken: session.csrf }, 200, setSessionCookie(session.token, c.req.raw))
  })
  api.get('/session', async c => {
    const session = await readSession(c.env.DB, c.req.raw)
    return session ? c.json({ authenticated: !session.pendingMfa, pendingMfa: session.pendingMfa, enrollmentRequired: session.pendingMfa && await canEnroll(c.env.DB, session.userId, true), user: { id: session.userId, email: session.email, displayName: session.displayName, roleName: session.roleName, permissions: session.pendingMfa ? [] : session.permissions }, csrfToken: session.csrfToken }) : c.json({ authenticated: false })
  })
  api.post('/logout', async c => {
    const token = cookie(c.req.raw)
    if (token) await c.env.DB.prepare('UPDATE user_sessions SET revoked_at=? WHERE token_hash=?').bind(Date.now(), await sha256(token)).run()
    return response({ signedOut: true }, 200, clearSessionCookie(c.req.raw))
  })
  api.post('/mfa', async c => {
    const session = await readSession(c.env.DB, c.req.raw)
    if (!session?.pendingMfa) return c.json({ error: 'No pending sign-in.' }, 401)
    if (!await limit(c.env.DB, `mfa:${session.userId}`, 10, 15 * 60_000)) return c.json({ error: 'Too many attempts.' }, 429)
    const body = await bodyOf(c.req.raw), code = String(body.code || '')
    const credential = await c.env.DB.prepare('SELECT totp_secret,totp_enabled FROM user_credentials WHERE user_id=?').bind(session.userId).first<{totp_secret:string|null;totp_enabled:number}>()
    let valid = false
    if (credential?.totp_enabled && credential.totp_secret && c.env.TOTP_ENCRYPTION_KEY && /^\d{6}$/.test(code)) valid = await verifyTotp(await decryptTotp(credential.totp_secret, c.env.TOTP_ENCRYPTION_KEY), code)
    if (!valid && code) {
      const result = await c.env.DB.prepare('UPDATE user_recovery_codes SET used_at=? WHERE user_id=? AND code_hash=? AND used_at IS NULL').bind(Date.now(), session.userId, await sha256(code)).run()
      valid = Number(result.meta.changes) === 1
    }
    if (!valid || !await completePending(c.env.DB, c.req.raw)) return c.json({ error: 'Invalid verification code.' }, 401)
    return c.json({ authenticated: true })
  })
  api.post('/totp/start', async c => {
    const session = await readSession(c.env.DB, c.req.raw)
    if (!session || !c.env.TOTP_ENCRYPTION_KEY) return c.json({ error: 'Sign in or TOTP configuration required.' }, 401)
    if (!await canEnroll(c.env.DB, session.userId, session.pendingMfa)) return c.json({ error: 'Complete verification before changing factors.' }, 403)
    const secret = newTotpSecret()
    await c.env.DB.prepare('INSERT INTO user_credentials(user_id,totp_secret,totp_enabled) VALUES(?,?,0) ON CONFLICT(user_id) DO UPDATE SET totp_secret=excluded.totp_secret,totp_enabled=0').bind(session.userId, await encryptTotp(secret, c.env.TOTP_ENCRYPTION_KEY)).run()
    return c.json({ secret, uri: `otpauth://totp/${encodeURIComponent(`White Point:${session.email}`)}?secret=${secret}&issuer=White%20Point&digits=6&period=30` })
  })
  api.post('/totp/confirm', async c => {
    const session = await readSession(c.env.DB, c.req.raw)
    if (!session || !c.env.TOTP_ENCRYPTION_KEY) return c.json({ error: 'Sign in required.' }, 401)
    if (!await canEnroll(c.env.DB, session.userId, session.pendingMfa)) return c.json({ error: 'Complete verification before changing factors.' }, 403)
    const body = await bodyOf(c.req.raw), row = await c.env.DB.prepare('SELECT totp_secret FROM user_credentials WHERE user_id=? AND totp_enabled=0').bind(session.userId).first<{totp_secret:string}>()
    if (!row?.totp_secret || !await verifyTotp(await decryptTotp(row.totp_secret, c.env.TOTP_ENCRYPTION_KEY), String(body.code || ''))) return c.json({ error: 'Invalid verification code.' }, 400)
    const recoveryCodes = await issueRecoveryCodes(c.env.DB, session.userId)
    await c.env.DB.prepare('UPDATE user_credentials SET totp_enabled=1 WHERE user_id=?').bind(session.userId).run()
    if (session.pendingMfa) await completePending(c.env.DB, c.req.raw)
    return c.json({ authenticated: true, recoveryCodes })
  })
  api.post('/password/reset', async c => {
    const body = await bodyOf(c.req.raw), email = emailOf(body.email)
    if (!await limit(c.env.DB, `reset-ip:${clientAddress(c.req.raw)}`, 10, 60 * 60_000) || !await limit(c.env.DB, `reset-email:${email}`, 3, 60 * 60_000)) return c.json({ sent: true })
    const user = await account(c.env.DB, email)
    if (user) { try { await sendAccessEmail(c.env, user.email, user.display_name, await issueAccessLink(c.env.DB, user.id, 'reset')) } catch { console.error('Password reset email delivery failed') } }
    return c.json({ sent: true })
  })
  api.post('/password/set', async c => {
    const body = await bodyOf(c.req.raw), token = String(body.token || ''), password = String(body.password || '')
    if (!validPassword(password) || !token) return c.json({ error: 'Valid link and password of 15 to 1024 characters required.' }, 400)
    const row = await c.env.DB.prepare("SELECT t.user_id,t.purpose FROM user_auth_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.purpose IN ('invite','reset') AND t.used_at IS NULL AND t.expires_at>? AND u.active=1 AND u.archived_at IS NULL").bind(await sha256(token), Date.now()).first<{user_id:string;purpose:string}>()
    if (!row) return c.json({ error: 'Link is invalid or expired.' }, 400)
    const passwordHash = await hashPassword(password)
    const result = await c.env.DB.prepare('UPDATE user_auth_tokens SET used_at=? WHERE token_hash=? AND used_at IS NULL').bind(Date.now(), await sha256(token)).run()
    if (Number(result.meta.changes) !== 1) return c.json({ error: 'Link was already used.' }, 409)
    await c.env.DB.prepare('INSERT INTO user_credentials(user_id,password_hash) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash').bind(row.user_id, passwordHash).run()
    await revokeUserSessions(c.env.DB, row.user_id)
    const hasMfa = await c.env.DB.prepare('SELECT totp_enabled FROM user_credentials WHERE user_id=?').bind(row.user_id).first<{totp_enabled:number}>()
    const session = await issueSession(c.env.DB, row.user_id, true)
    return response({ next: hasMfa?.totp_enabled ? 'mfa' : 'enroll', csrfToken: session.csrf }, 200, setSessionCookie(session.token, c.req.raw))
  })
  api.post('/passkey/register/options', async c => {
    const session = await readSession(c.env.DB, c.req.raw)
    if (!session || session.pendingMfa) return c.json({ error: 'Complete authenticator setup before adding a passkey.' }, 403)
    const origin = c.req.header('Origin') || ''
    const options = await generateRegistrationOptions({ rpName: 'White Point Survey', rpID: rpId(origin, c.env.WEBAUTHN_RP_ID), userName: session.email, userDisplayName: session.displayName, userID: new Uint8Array(new TextEncoder().encode(session.userId)), authenticatorSelection: { userVerification: 'required', residentKey: 'required' } })
    await storeChallenge(c.env.DB, session.userId, 'register', options.challenge, origin)
    return c.json(options)
  })
  api.post('/passkey/register/verify', async c => {
    const session = await readSession(c.env.DB, c.req.raw)
    if (!session || session.pendingMfa) return c.json({ error: 'Complete authenticator setup before adding a passkey.' }, 403)
    const body = await bodyOf(c.req.raw), challenge = String(body.challenge || ''), origin = c.req.header('Origin') || ''
    if (!await consumeChallenge(c.env.DB, session.userId, 'register', challenge, origin)) return c.json({ error: 'Challenge expired.' }, 400)
    try {
      const result = await verifyRegistrationResponse({ response: body.response as RegistrationResponseJSON, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpId(origin, c.env.WEBAUTHN_RP_ID), requireUserVerification: true })
      if (!result.verified) return c.json({ error: 'Passkey verification failed.' }, 400)
      const key = result.registrationInfo.credential
      await c.env.DB.prepare('INSERT INTO user_passkeys(id,user_id,public_key,counter,transports) VALUES(?,?,?,?,?)').bind(key.id, session.userId, btoa(String.fromCharCode(...key.publicKey)), key.counter, JSON.stringify(key.transports || [])).run()
      return c.json({ authenticated: true })
    } catch { return c.json({ error: 'Passkey verification failed.' }, 400) }
  })
  api.post('/passkey/login/options', async c => {
    const body = await bodyOf(c.req.raw), email = emailOf(body.email)
    if (!await limit(c.env.DB, `passkey-ip:${clientAddress(c.req.raw)}`, 30, 15 * 60_000)) return c.json({ error: 'Too many attempts.' }, 429)
    const user = email ? await account(c.env.DB, email) : null
    if (email && (!user || !await limit(c.env.DB, `passkey:${user.id}`, 15, 15 * 60_000))) return c.json({ error: 'Passkey unavailable.' }, 401)
    const keys = user ? await c.env.DB.prepare('SELECT id,transports FROM user_passkeys WHERE user_id=?').bind(user.id).all<{id:string;transports:string}>() : null
    if (user && !keys?.results.length) return c.json({ error: 'Passkey unavailable.' }, 401)
    const origin = c.req.header('Origin') || ''
    const options = await generateAuthenticationOptions({ rpID: rpId(origin, c.env.WEBAUTHN_RP_ID), userVerification: 'required', ...(keys ? { allowCredentials: keys.results.map(key => ({ id: key.id, transports: JSON.parse(key.transports) })) } : {}) })
    await storeChallenge(c.env.DB, user?.id || null, 'login', options.challenge, origin)
    return c.json(options)
  })
  api.post('/passkey/login/verify', async c => {
    const body = await bodyOf(c.req.raw), challenge = String(body.challenge || ''), origin = c.req.header('Origin') || '', email = emailOf(body.email)
    const assertion = body.response as AuthenticationResponseJSON
    const key = await c.env.DB.prepare(`SELECT p.id,p.user_id,p.public_key,p.counter,p.transports,u.email,cr.totp_enabled
      FROM user_passkeys p JOIN users u ON u.id=p.user_id JOIN user_credentials cr ON cr.user_id=u.id
      WHERE p.id=? AND u.active=1 AND u.archived_at IS NULL AND u.user_type='internal'`).bind(assertion?.id).first<{id:string;user_id:string;public_key:string;counter:number;transports:string;email:string;totp_enabled:number}>()
    if (!key) return c.json({ error: 'Unknown passkey.' }, 401)
    if (email && email !== key.email.toLowerCase()) return c.json({ error: 'Unknown passkey.' }, 401)
    if (!await consumeChallenge(c.env.DB, email ? key.user_id : null, 'login', challenge, origin)) return c.json({ error: 'Challenge expired.' }, 400)
    try {
      const result = await verifyAuthenticationResponse({ response: assertion, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpId(origin, c.env.WEBAUTHN_RP_ID), requireUserVerification: true, credential: { id: key.id, publicKey: Uint8Array.from(atob(key.public_key), char => char.charCodeAt(0)), counter: key.counter, transports: JSON.parse(key.transports) } })
      if (!result.verified) return c.json({ error: 'Passkey verification failed.' }, 401)
      const update = await c.env.DB.prepare('UPDATE user_passkeys SET counter=?,last_used_at=CURRENT_TIMESTAMP WHERE id=? AND counter=?').bind(result.authenticationInfo.newCounter, key.id, key.counter).run()
      if (Number(update.meta.changes) !== 1) return c.json({ error: 'Passkey counter changed.' }, 409)
      const session = await issueSession(c.env.DB, key.user_id, !key.totp_enabled)
      return response({ authenticated: Boolean(key.totp_enabled), next: key.totp_enabled ? undefined : 'enroll', csrfToken: session.csrf }, 200, setSessionCookie(session.token, c.req.raw))
    } catch { return c.json({ error: 'Passkey verification failed.' }, 401) }
  })
  return api
}
