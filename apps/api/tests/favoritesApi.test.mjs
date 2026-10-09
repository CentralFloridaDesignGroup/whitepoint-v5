import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'
import { createFavoritesApi } from '../src/routes/favoritesApi.ts'

let saved = null
const db = { prepare(sql) { return { bind(...values) { return {
  first: async () => { assert.match(sql, /SELECT paths_json/); return saved === null ? null : { paths_json: saved } },
  run: async () => { assert.match(sql, /INSERT INTO user_favorites/); assert.equal(values[0], 'user-1'); saved = values[1] },
} } } } }
const app = new Hono()
app.use('*', async (c, next) => { c.set('auth', { internalUserId: 'user-1' }); await next() })
app.route('/', createFavoritesApi())

test('favorites round trip is scoped to the authenticated user', async () => {
  let response = await app.fetch(new Request('http://localhost/me/favorites'), { DB: db })
  assert.deepEqual(await response.json(), { favorites: [] })
  response = await app.fetch(new Request('http://localhost/me/favorites', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ favorites: ['/checklists/alta-survey', '/checklists/alta-survey'] }),
  }), { DB: db })
  assert.deepEqual(await response.json(), { favorites: ['/checklists/alta-survey'] })
  response = await app.fetch(new Request('http://localhost/me/favorites'), { DB: db })
  assert.deepEqual(await response.json(), { favorites: ['/checklists/alta-survey'] })
})
