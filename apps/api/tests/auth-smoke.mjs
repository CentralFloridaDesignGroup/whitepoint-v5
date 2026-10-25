import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

const base = process.env.AUTH_TEST_API || 'http://localhost:8787/v5'
const origin = 'http://localhost:5300'
const docsOrigin = 'http://localhost:5200'
const password = process.env.AUTH_TEST_PASSWORD
const bootstrapToken = process.env.AUTH_TEST_BOOTSTRAP
assert.ok(password && bootstrapToken, 'Set AUTH_TEST_PASSWORD and AUTH_TEST_BOOTSTRAP for the local-only smoke test.')
let cookie = '', csrf = ''
async function request(path, method = 'GET', body, from = origin, includeCookie = true, includeCsrf = true) {
  const response = await fetch(base + path, { method, headers: { Origin: from, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(includeCookie && cookie ? { Cookie: cookie } : {}), ...(includeCsrf && csrf && method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const data = await response.json().catch(() => ({}))
  const setCookie = response.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  if (data.csrfToken) csrf = data.csrfToken
  return { status: response.status, data }
}
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let value = 0, bits = 0; const bytes = []
  for (const char of secret) { value = (value << 5) | alphabet.indexOf(char); bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8 } }
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest()
  const offset = digest.at(-1) & 15
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
assert.equal((await request('/health/status')).status, 200)
assert.equal((await request('/records/clients')).status, 401)
assert.equal((await request('/identity/setup', 'POST', { bootstrapToken: 'wrong', password })).status, 403)
const start = performance.now()
const setup = await request('/identity/setup', 'POST', { bootstrapToken, password })
assert.equal(setup.status, 201, JSON.stringify(setup.data))
console.log(`Password hashing on local workerd: ${Math.round(performance.now() - start)} ms wall time`)
assert.equal((await request('/records/clients')).status, 401)
assert.equal((await request('/identity/passkey/register/options', 'POST', {})).status, 403)
assert.equal((await request('/identity/totp/start', 'POST', {}, 'https://evil.example')).status, 403)
assert.equal((await request('/identity/totp/start', 'POST', {}, origin, true, false)).status, 403)
const enroll = await request('/identity/totp/start', 'POST', {})
assert.equal(enroll.status, 200, JSON.stringify(enroll.data))
const confirm = await request('/identity/totp/confirm', 'POST', { code: totp(enroll.data.secret) })
assert.equal(confirm.status, 200, JSON.stringify(confirm.data))
assert.equal(confirm.data.recoveryCodes.length, 10)
assert.equal((await request('/identity/passkey/register/options', 'POST', { currentPassword: password })).status, 200)
assert.equal((await request('/identity/session', 'GET', undefined, origin)).data.authenticated, true)
assert.equal((await request('/identity/session', 'GET', undefined, docsOrigin)).data.authenticated, true)
assert.equal((await request('/records/clients')).status, 200)
const discoverablePasskey = await request('/identity/passkey/login/options', 'POST', {})
assert.equal(discoverablePasskey.status, 200, JSON.stringify(discoverablePasskey.data))
assert.ok(discoverablePasskey.data.challenge)
assert.equal((await request('/identity/passkey/login/options', 'POST', { email: 'unknown@example.invalid' })).status, 401)
const passkey = await request('/identity/passkey/register/options', 'POST', { currentPassword: password })
assert.equal(passkey.status, 200)
assert.equal((await request('/identity/passkey/register/verify', 'POST', { challenge: passkey.data.challenge, response: {} })).status, 400)
assert.equal((await request('/identity/passkey/register/verify', 'POST', { challenge: passkey.data.challenge, response: {} })).status, 400)
const userId = crypto.randomUUID()
const newUser = { id: userId, email: 'local-test@example.invalid', firstName: 'Local', lastName: 'Test', roleId: 'employee', active: false, isNew: true }
assert.equal((await request('/identity/users/bulk', 'POST', { users: [newUser] })).status, 200)
assert.equal((await request('/identity/users/bulk', 'POST', { users: [{ id: '1', email: 'nwhite@whitepointsurvey.com', firstName: 'Nathan', lastName: 'White', roleId: 'employee', active: true }] })).status, 409)
assert.equal((await request('/identity/users/bulk', 'POST', { users: [{ ...newUser, active: true, isNew: false }] })).status, 200)
if (process.env.AUTH_TEST_SKIP_MAIL !== '1') assert.equal((await request(`/identity/users/${userId}/invite`, 'POST', {})).status, 502)
assert.equal((await request(`/identity/users/${userId}/archive`, 'POST', {})).status, 200)
assert.equal((await request('/identity/logout', 'POST', {})).status, 200)
assert.equal((await request('/records/clients')).status, 401)
const loginStart = performance.now()
const login = await request('/identity/login', 'POST', { email: 'nwhite@whitepointsurvey.com', password })
assert.equal(login.status, 200, JSON.stringify(login.data))
console.log(`Password verification on local workerd: ${Math.round(performance.now() - loginStart)} ms wall time`)
assert.equal(login.data.next, 'mfa')
assert.equal((await request('/records/clients')).status, 401)
assert.equal((await request('/identity/mfa', 'POST', { code: totp(enroll.data.secret) })).status, 200)
assert.equal((await request('/records/clients')).status, 200)
console.log('Local auth smoke passed')
