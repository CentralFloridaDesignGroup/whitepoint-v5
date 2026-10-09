import type { AuthMode } from '@whitepoint/types'

type JsonRequester = <T>(path: string, options: { method: string; authMode: AuthMode; body?: string }) => Promise<T>

function normalizeFavoritePaths(value: unknown): string[] {
  const items = Array.isArray(value) ? value : []
  const unique = new Set<string>()
  for (const item of items) {
    const path = String(item ?? '').trim()
    if (!path.startsWith('/')) continue
    unique.add(path)
    if (unique.size >= 500) break
  }
  return Array.from(unique)
}

export function createFavoritesApi(requestJson: JsonRequester) {
  let disabled = false
  const requestFavorites = async (method: 'GET' | 'PUT', body?: string) => {
    if (disabled) throw new Error('Favorites API disabled for this session.')
    try {
      return await requestJson<{ favorites?: unknown }>('/identity/me/favorites', {
        method,
        authMode: 'session',
        ...(body === undefined ? {} : { body }),
      })
    } catch (error) {
      const message = String(error ?? '')
      if (message.includes('401') || message.includes('403') || message.toLowerCase().includes('unauthorized')) disabled = true
      throw error
    }
  }
  return {
    async fetchUserFavoritePaths(): Promise<string[]> {
      const data = await requestFavorites('GET')
      return normalizeFavoritePaths(data.favorites)
    },
    async saveUserFavoritePaths(favorites: string[]): Promise<string[]> {
      const data = await requestFavorites('PUT', JSON.stringify({ favorites }))
      return normalizeFavoritePaths(data.favorites)
    },
  }
}
