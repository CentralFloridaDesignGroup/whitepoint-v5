import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { registerHooks } from 'node:module'

registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context) }
  catch (error) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      for (const extension of ['.js', '.ts']) try { return nextResolve(`${specifier}${extension}`, context) } catch { /* continue */ }
    }
    throw error
  }
}, load(url, context, nextLoad) {
  if (url.endsWith('.json') && !url.includes('/node_modules/')) return { format: 'module', shortCircuit: true, source: `export default ${readFileSync(new URL(url), 'utf8')}` }
  return nextLoad(url, context)
} })

const worker = (await import('../src/index.ts')).default
const origin = 'http://localhost:5300'
const clientId = 'northstar-desktop'
const redirect = 'http://127.0.0.1:45678/northstar/callback'
const verifier = randomBytes(32).toString('base64url')
const challenge = createHash('sha256').update(verifier).digest('base64url')
const state = randomBytes(32).toString('base64url')

function database() {
  const sqlite = new DatabaseSync(':memory:')
  for (const name of ['0001_company_initialization.sql', '0002_roles_permissions.sql', '0003_user_init_auth_seed.sql', '0011_native_staff_auth.sql'])
    sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }),
  })
  return { sqlite, prepare: sql => statement(sql), batch: async statements => {
    sqlite.exec('BEGIN')
    try { const result = []; for (const item of statements) result.push(await item.run()); sqlite.exec('COMMIT'); return result }
    catch (error) { sqlite.exec('ROLLBACK'); throw error }
  } }
}

test('native auth binds browser consent, PKCE, rotating grant and live permissions', async () => {
  const db = database()
  db.sqlite.prepare('INSERT INTO user_credentials(user_id,totp_enabled) VALUES(?,1)').run('1')
  const cookie = randomBytes(32).toString('base64url')
  const csrf = randomBytes(32).toString('base64url')
  db.sqlite.prepare('INSERT INTO user_sessions(token_hash,user_id,csrf_token,pending_mfa,created_at,expires_at) VALUES(?,?,?,0,?,?)')
    .run(createHash('sha256').update(cookie).digest('hex'), '1', csrf, Date.now(), Date.now() + 60_000)
  const env = { DB: db, AUTH_ORIGINS: origin }
  const request = async (path, { method = 'GET', body, browser = false, bearer, from = browser ? origin : undefined, csrfHeader = browser } = {}) => {
    const response = await worker.fetch(new Request(`http://localhost:8787/v5${path}`, { method, headers: {
      ...(from ? { Origin: from } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(browser ? { Cookie: `wps_session=${cookie}` } : {}), ...(csrfHeader ? { 'X-CSRF-Token': csrf } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, {})
    return { status: response.status, data: await response.json() }
  }
  const authorization = (changes = {}) => ({ client_id: clientId, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state, installation_label: 'Workstation', ...changes })
  assert.equal((await request('/identity/native/authorize', { method: 'POST', body: authorization() })).status, 403)
  assert.equal((await request('/identity/native/authorize', { method: 'POST', body: authorization(), browser: true, csrfHeader: false })).status, 403)
  assert.equal((await request('/identity/native/authorize', { method: 'POST', body: authorization({ redirect_uri: 'https://evil.example/callback' }), browser: true })).status, 400)
  db.sqlite.prepare('UPDATE user_sessions SET pending_mfa=1').run()
  assert.equal((await request('/identity/native/authorize', { method: 'POST', body: authorization(), browser: true })).status, 401)
  db.sqlite.prepare('UPDATE user_sessions SET pending_mfa=0').run()
  assert.equal((await request('/identity/native/me', { browser: true })).status, 401)
  const approved = await request('/identity/native/authorize', { method: 'POST', body: authorization(), browser: true })
  assert.equal(approved.status, 200)
  const code = new URL(approved.data.redirect_uri).searchParams.get('code')
  const exchange = (changes = {}) => request('/identity/native/token', { method: 'POST', body: { client_id: clientId, grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier, ...changes } })
  assert.equal((await exchange({ code_verifier: randomBytes(32).toString('base64url') })).status, 400)
  assert.equal((await exchange({ redirect_uri: 'http://127.0.0.1:45679/northstar/callback' })).status, 400)
  const issued = await exchange()
  assert.equal(issued.status, 200)
  assert.equal((await exchange()).status, 400)
  const expiringApproval = await request('/identity/native/authorize', { method: 'POST', body: authorization(), browser: true })
  const expiringCode = new URL(expiringApproval.data.redirect_uri).searchParams.get('code')
  db.sqlite.prepare('UPDATE native_auth_codes SET expires_at=? WHERE code_hash=?')
    .run(Date.now() - 1, createHash('sha256').update(expiringCode).digest('hex'))
  assert.equal((await exchange({ code: expiringCode })).status, 400)
  assert.equal((await request('/identity/native/me', { bearer: issued.data.access_token })).data.permissions.includes('*'), true)
  db.sqlite.prepare('UPDATE user_roles SET role_id=? WHERE user_id=?').run('employee', '1')
  assert.deepEqual((await request('/identity/native/me', { bearer: issued.data.access_token })).data.permissions, ['dashboard.view'])
  const refresh = token => request('/identity/native/token', { method: 'POST', body: { client_id: clientId, grant_type: 'refresh_token', refresh_token: token } })
  const rotated = await refresh(issued.data.refresh_token)
  assert.equal(rotated.status, 200)
  assert.notEqual(rotated.data.refresh_token, issued.data.refresh_token)
  assert.equal((await refresh(issued.data.refresh_token)).status, 400)
  assert.equal((await request('/identity/native/me', { bearer: rotated.data.access_token })).status, 401)
  const secondApproval = await request('/identity/native/authorize', { method: 'POST', body: authorization(), browser: true })
  const secondCode = new URL(secondApproval.data.redirect_uri).searchParams.get('code')
  const second = await exchange({ code: secondCode })
  assert.equal(second.status, 200)
  const thirdApproval = await request('/identity/native/authorize', { method: 'POST', body: authorization({ installation_label: 'Second workstation' }), browser: true })
  const third = await exchange({ code: new URL(thirdApproval.data.redirect_uri).searchParams.get('code') })
  assert.equal(third.status, 200)
  assert.equal((await request('/identity/native/grants', { browser: true })).data.grants.length, 2)
  assert.equal((await request(`/identity/native/grants/${second.data.grant_id}/revoke`, { method: 'POST', browser: true })).status, 200)
  assert.equal((await request('/identity/native/me', { bearer: second.data.access_token })).status, 401)
  assert.equal((await request('/identity/native/me', { bearer: third.data.access_token })).status, 200)
  assert.equal((await request('/identity/native/revoke', { method: 'POST', body: { client_id: clientId, refresh_token: third.data.refresh_token } })).status, 200)
  assert.equal((await request('/identity/native/me', { bearer: third.data.access_token })).status, 401)
})
