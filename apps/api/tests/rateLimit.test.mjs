import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'

registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context) }
  catch (error) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) for (const extension of ['.js', '.ts']) try { return nextResolve(`${specifier}${extension}`, context) } catch { /* continue */ }
    throw error
  }
}, load(url, context, nextLoad) {
  if (url.endsWith('.json') && !url.includes('/node_modules/')) return { format: 'module', shortCircuit: true, source: `export default ${readFileSync(new URL(url), 'utf8')}` }
  return nextLoad(url, context)
} })
const { allowRequest } = await import('../src/services/rateLimit.ts')
const { createAuthApi } = await import('../src/routes/authApi.ts')

function database() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('CREATE TABLE request_limits(key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL); CREATE INDEX idx_request_limits_expiry ON request_limits(expires_at); CREATE TABLE setup_state(id INTEGER PRIMARY KEY, initialized INTEGER NOT NULL); INSERT INTO setup_state VALUES(1,0)')
  const statement = (sql, args = []) => ({ bind: (...values) => statement(sql, values), first: async () => sqlite.prepare(sql).get(...args) ?? null, run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }) })
  return { prepare: sql => statement(sql), sqlite }
}

test('strict limiter enforces boundaries, independent hashed keys, retry time, expiry and cleanup', async () => {
  const db = database(), now = 1_000_000
  assert.deepEqual(await allowRequest(db, 'email:user@example.test', 2, 10_000, now), { allowed: true, retryAfterSeconds: 0 })
  assert.equal((await allowRequest(db, 'email:user@example.test', 2, 10_000, now + 1)).allowed, true)
  assert.deepEqual(await allowRequest(db, 'email:user@example.test', 2, 10_000, now + 2), { allowed: false, retryAfterSeconds: 10 })
  assert.equal((await allowRequest(db, 'ip:192.0.2.1', 2, 10_000, now + 2)).allowed, true)
  const stored = db.sqlite.prepare('SELECT key FROM request_limits ORDER BY key').all()
  assert.equal(stored.length, 2)
  assert.equal(stored.some(row => row.key.includes('user@example.test') || row.key.includes('192.0.2.1')), false)
  assert.equal((await allowRequest(db, 'email:user@example.test', 2, 10_000, now + 10_003)).allowed, true)
  assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM request_limits').get().count, 1)
  db.sqlite.close()
})

test('authentication throttling returns a generic 429 with Retry-After', async () => {
  const db = database(), api = createAuthApi()
  let response
  for (let attempt = 0; attempt < 11; attempt++) response = await api.fetch(new Request('http://local/setup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.5' }, body: JSON.stringify({ bootstrapToken: 'wrong', password: 'NotUsedPassword123!' }) }), { DB: db, AUTH_BOOTSTRAP_TOKEN: 'correct' })
  assert.equal(response.status, 429)
  assert.match(response.headers.get('Retry-After'), /^\d+$/)
  assert.deepEqual(await response.json(), { error: 'Too many attempts. Try again later.' })
  db.sqlite.close()
})
