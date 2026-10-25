import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

const { app } = await import('../src/index.ts')
const { ROUTE_POLICIES, routePolicyKey, normalizeRoutePath } = await import('../src/security/routePolicies.ts')
const { PERMISSION_KEYS } = await import('@whitepoint/types/constants')

test('every registered route has exactly one consumer-owned policy and every policy maps to a route', () => {
  const policies = ROUTE_POLICIES.map(routePolicyKey)
  assert.equal(new Set(policies).size, policies.length, 'route policies must be unique')
  for (const policy of ROUTE_POLICIES) {
    assert.ok(policy.consumers.length, `${routePolicyKey(policy)} has no consumer`)
    assert.equal(policy.access === 'permission', Boolean(policy.permission), `${routePolicyKey(policy)} permission mismatch`)
    if (policy.permission) assert.ok(PERMISSION_KEYS.includes(policy.permission), `${routePolicyKey(policy)} uses an unknown permission`)
  }
  const routes = app.routes
    .filter(route => ['GET', 'POST', 'PUT', 'DELETE'].includes(route.method))
    .map(route => `${route.method} ${normalizeRoutePath(route.path)}`)
  assert.deepEqual([...new Set(routes)].sort(), [...new Set(policies)].sort())
})

test('entrypoint rejects unknown, encoded, wrong-method, origin and missing-session requests', async () => {
  const worker = (await import('../src/index.ts')).default
  const db = { prepare: () => ({ bind() { return this }, first: async () => null, run: async () => ({ meta: { changes: 0 } }) }) }
  const env = { DB: db, AUTH_ORIGINS: 'http://localhost:5300', STRIPE_WEBHOOK_SECRET: 'test-secret' }
  const request = (path, init) => worker.fetch(new Request(`http://localhost:8787/v5${path}`, init), env, {})
  assert.equal((await request('/unknown')).status, 404)
  assert.equal((await request('/identity/users%2Fbulk')).status, 404)
  assert.equal((await request('/health/status', { method: 'POST', headers: { Origin: 'http://localhost:5300' } })).status, 404)
  assert.equal((await request('/identity/users', { headers: { Origin: 'https://attacker.invalid' } })).status, 403)
  const protectedResponse = await request('/identity/users')
  assert.equal(protectedResponse.status, 401)
  assert.equal(protectedResponse.headers.get('Cache-Control'), 'no-store')
  assert.equal(protectedResponse.headers.get('X-Content-Type-Options'), 'nosniff')
  assert.equal((await request('/identity/users/bulk', { method: 'POST', headers: { Origin: 'http://localhost:5300' } })).status, 403)
  assert.equal((await request('/identity/login', { method: 'POST' })).status, 403)
  assert.equal((await request('/webhooks/stripe', { method: 'POST', body: '{}' })).status, 400)
})
