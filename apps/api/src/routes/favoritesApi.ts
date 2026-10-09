import { Hono } from 'hono'
import type { HonoEnv } from '../types/apiTypes.ts'

function paths(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 500 || value.some(item => typeof item !== 'string' || !item.startsWith('/') || item.length > 200)) return null
  return [...new Set(value)]
}

export function createFavoritesApi() {
  const api = new Hono<HonoEnv>()
  api.get('/me/favorites', async c => {
    const row = await c.env.DB.prepare('SELECT paths_json FROM user_favorites WHERE user_id=?').bind(c.get('auth').internalUserId).first<{ paths_json: string }>()
    return c.json({ favorites: row ? JSON.parse(row.paths_json) as string[] : [] })
  })
  api.put('/me/favorites', async c => {
    const body = await c.req.json<{ favorites?: unknown }>().catch(() => null)
    const favorites = paths(body?.favorites)
    if (!favorites) return c.json({ error: 'Favorites must be up to 500 local paths.' }, 400)
    await c.env.DB.prepare(`INSERT INTO user_favorites(user_id,paths_json) VALUES(?,?)
      ON CONFLICT(user_id) DO UPDATE SET paths_json=excluded.paths_json,updated_at=CURRENT_TIMESTAMP`)
      .bind(c.get('auth').internalUserId, JSON.stringify(favorites)).run()
    return c.json({ favorites })
  })
  return api
}
