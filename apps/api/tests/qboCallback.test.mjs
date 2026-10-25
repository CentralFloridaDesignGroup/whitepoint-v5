import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context) }
  catch (error) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) for (const extension of ['.js', '.ts']) try { return nextResolve(`${specifier}${extension}`, context) } catch { /* continue */ }
    throw error
  }
} })
const { createQboApi } = await import('../src/routes/qboApi.ts')

function stateDatabase(initial = []) {
  const states = new Set(initial)
  return { prepare: sql => ({ bind(value) { return { first: async () => {
    if (!sql.startsWith('DELETE FROM qbo_oauth_states') || !states.has(value)) return null
    states.delete(value); return { state: value }
  }, run: async () => { if (sql.startsWith('DELETE FROM qbo_oauth_states')) states.delete(value); return { meta: { changes: 1 } } } } }, run: async () => ({ meta: { changes: 0 } }) }) }
}

test('QBO callback state is expired safely and consumed exactly once', async () => {
  const api = createQboApi(), env = { DB: stateDatabase(['single-use']), STAFF_APP_URL: 'http://localhost:5300' }
  const callback = state => api.fetch(new Request(`http://local/callback?state=${state}&code=code&realmId=realm`), env)
  const originalError = console.error
  console.error = () => undefined
  try {
    const first = await callback('single-use')
    assert.equal(first.status, 303)
    assert.equal(new URL(first.headers.get('location')).searchParams.get('qbo'), 'connection-failed')
    const replay = await callback('single-use')
    assert.equal(new URL(replay.headers.get('location')).searchParams.get('qbo'), 'state-expired')
    const expired = await callback('expired')
    assert.equal(new URL(expired.headers.get('location')).searchParams.get('qbo'), 'state-expired')
  } finally { console.error = originalError }
})
