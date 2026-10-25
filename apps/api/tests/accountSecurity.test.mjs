import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHmac, randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { registerHooks } from 'node:module'

registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context) }
  catch (error) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      for (const extension of ['.js', '.ts']) {
        try { return nextResolve(`${specifier}${extension}`, context) } catch { /* try the other source form */ }
      }
    }
    throw error
  }
}, load(url, context, nextLoad) {
  if (url.endsWith('.json') && !url.includes('/node_modules/')) return { format: 'module', shortCircuit: true, source: `export default ${readFileSync(new URL(url), 'utf8')}` }
  return nextLoad(url, context)
} })
const worker = (await import('../src/index.ts')).default

const origin = 'http://localhost:5300'
const oldPassword = 'CurrentPassword!2030'
const newPassword = 'ReplacementPassword!2031'
const secretKey = randomBytes(32).toString('base64')

function database() {
  const sqlite = new DatabaseSync(':memory:')
  for (const migration of ['0001_company_initialization.sql', '0002_roles_permissions.sql', '0003_user_init_auth_seed.sql']) {
    sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
  }
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }),
  })
  return {
    prepare: sql => statement(sql),
    batch: async statements => {
      sqlite.exec('BEGIN')
      try {
        const results = []
        for (const item of statements) results.push(await item.run())
        sqlite.exec('COMMIT')
        return results
      } catch (error) { sqlite.exec('ROLLBACK'); throw error }
    },
    sqlite,
  }
}

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let value = 0, bits = 0; const bytes = []
  for (const char of secret) {
    value = (value << 5) | alphabet.indexOf(char); bits += 5
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest()
  const offset = digest.at(-1) & 15
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

test('account security routes enforce ownership, password, CSRF and staged authenticator replacement', async () => {
  const db = database()
  const env = { DB: db, AUTH_BOOTSTRAP_TOKEN: 'test-only-bootstrap', TOTP_ENCRYPTION_KEY: secretKey, WEBAUTHN_RP_ID: 'localhost' }
  let cookie = '', csrf = ''
  async function request(path, method = 'GET', body, { credentials = true, csrfHeader = true, useOrigin = true } = {}) {
    const response = await worker.fetch(new Request(`http://localhost:8787/v5${path}`, {
      method,
      headers: {
        ...(useOrigin ? { Origin: origin } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(credentials && cookie ? { Cookie: cookie } : {}),
        ...(csrfHeader && csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }), env, {})
    const result = await response.json()
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0]
    if (result.csrfToken) csrf = result.csrfToken
    return { status: response.status, result }
  }
  assert.equal((await request('/identity/me/security', 'GET', undefined, { credentials: false })).status, 401)
  assert.equal((await request('/identity/setup', 'POST', { bootstrapToken: env.AUTH_BOOTSTRAP_TOKEN, password: oldPassword })).status, 201)
  const initial = await request('/identity/totp/start', 'POST', {})
  assert.equal(initial.status, 200)
  const initialConfirm = await request('/identity/totp/confirm', 'POST', { code: totp(initial.result.secret) })
  assert.equal(initialConfirm.status, 200)
  const roleOptions = await request('/identity/users/role-options')
  assert.equal(roleOptions.status, 200)
  assert.ok(roleOptions.result.items.some(role => role.id === 'employee'))
  assert.equal((await request('/identity/me/security')).result.authenticatorEnabled, true)
  assert.equal((await request('/identity/me/password', 'POST', { currentPassword: oldPassword, newPassword }, { csrfHeader: false })).status, 403)
  assert.equal((await request('/identity/me/password', 'POST', { currentPassword: oldPassword, newPassword }, { useOrigin: false })).status, 403)
  assert.equal((await request('/identity/totp/start', 'POST', { currentPassword: 'wrong' })).status, 403)
  const replacement = await request('/identity/totp/start', 'POST', { currentPassword: oldPassword })
  assert.equal(replacement.status, 200)
  assert.equal((await request('/identity/me/security')).result.authenticatorEnabled, true)
  assert.equal((await request('/identity/totp/confirm', 'POST', { code: '000000' })).status, 400)
  assert.equal((await request('/identity/me/security')).result.authenticatorEnabled, true)
  assert.equal((await request('/identity/passkey/register/options', 'POST', { currentPassword: 'wrong' })).status, 403)
  const passkeyOptions = await request('/identity/passkey/register/options', 'POST', { currentPassword: oldPassword })
  assert.equal(passkeyOptions.status, 200)
  assert.equal((await request('/identity/passkey/register/verify', 'POST', { challenge: passkeyOptions.result.challenge, response: {} })).status, 400)
  const firstCookie = cookie, firstCsrf = csrf
  const otherSession = await request('/identity/login', 'POST', { email: 'nwhite@whitepointsurvey.com', password: oldPassword })
  assert.equal(otherSession.status, 200)
  const otherCookie = cookie, otherCsrf = csrf
  assert.equal((await request('/identity/mfa', 'POST', { code: totp(initial.result.secret) })).status, 200)
  cookie = otherCookie; csrf = otherCsrf
  const replacementConfirm = await request('/identity/totp/confirm', 'POST', { code: totp(replacement.result.secret) })
  assert.equal(replacementConfirm.status, 200)
  assert.equal(replacementConfirm.result.recoveryCodes.length, 10)
  assert.equal((await request('/identity/me/password', 'POST', { currentPassword: 'wrong', newPassword })).status, 403)
  assert.equal((await request('/identity/me/password', 'POST', { currentPassword: oldPassword, newPassword })).status, 200)
  assert.equal((await request('/identity/me/security')).status, 200)
  cookie = firstCookie; csrf = firstCsrf
  assert.equal((await request('/identity/me/security')).status, 401)
  cookie = otherCookie; csrf = otherCsrf
  const status = await request('/identity/me/security')
  assert.equal(status.result.passwordSet, true)
  db.sqlite.prepare('INSERT INTO user_passkeys(id,user_id,public_key,counter,transports,name) VALUES(?,?,?,?,?,?)').run('test-passkey', '1', 'AA==', 0, '[]', 'Test key')
  assert.equal((await request('/identity/me/security')).result.passkeys[0].name, 'Test key')
  assert.equal((await request('/identity/me/passkeys/test-passkey', 'DELETE', { currentPassword: oldPassword })).status, 403)
  assert.equal((await request('/identity/me/passkeys/test-passkey', 'DELETE', { currentPassword: newPassword })).status, 200)
  assert.equal((await request('/identity/me/security')).result.passkeys.length, 0)
  assert.equal((await request('/identity/login', 'POST', { email: 'nwhite@whitepointsurvey.com', password: oldPassword })).status, 401)
  assert.equal((await request('/identity/login', 'POST', { email: 'nwhite@whitepointsurvey.com', password: newPassword })).status, 200)
  assert.equal((await request('/identity/mfa', 'POST', { code: totp(initial.result.secret) })).status, 401)
  assert.equal((await request('/identity/mfa', 'POST', { code: initialConfirm.result.recoveryCodes[0] })).status, 401)
  assert.equal((await request('/identity/mfa', 'POST', { code: totp(replacement.result.secret) })).status, 200)
  db.sqlite.prepare("UPDATE roles SET permissions='[]' WHERE id='super-administrator'").run()
  assert.equal((await request('/identity/users')).status, 403)
  db.sqlite.prepare("UPDATE roles SET permissions='[\"*\"]' WHERE id='super-administrator'").run()
  db.sqlite.prepare("UPDATE users SET active=0 WHERE id='1'").run()
  assert.equal((await request('/identity/me/security')).status, 401)
  assert.equal((await request('/identity/login', 'POST', { email: 'unknown@example.test', password: 'WrongPasswordValue' })).status, 401)
  db.sqlite.close()
})
