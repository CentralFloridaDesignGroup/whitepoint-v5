import { getCsrfToken } from './session'
import type { AuthMode } from '@whitepoint/types'

type ApiRequestOptions = Omit<RequestInit, 'headers'> & {
  authMode: AuthMode
  headers?: Record<string, string>
}

export function resolveApiBaseUrl(configured: string | undefined, hostname: string): string {
  return (configured?.trim() || (hostname === 'localhost' || hostname === '127.0.0.1'
    ? 'http://localhost:8787/v5'
    : 'https://api.whitepointsurvey.com/v5')).replace(/\/$/, '')
}

export function createApiClient({ baseUrl }: { baseUrl: string }) {
  const getUrl = (pathOrUrl: string, mode: AuthMode) => {
    const url = /^https?:\/\//i.test(pathOrUrl) ? new URL(pathOrUrl) : new URL(baseUrl + pathOrUrl)
    if (mode !== 'public' && url.origin !== new URL(baseUrl).origin) throw new Error('Authenticated requests must use the White Point API.')
    return url.toString()
  }
  const request = async (pathOrUrl: string, options: ApiRequestOptions): Promise<Response> => {
    const { authMode, headers, ...init } = options
    return fetch(getUrl(pathOrUrl, authMode), {
      ...init,
      credentials: authMode === 'public' ? 'omit' : 'include',
      headers: {
        ...(authMode !== 'public' && !['GET', 'HEAD'].includes(String(init.method || 'GET').toUpperCase()) ? { 'X-CSRF-Token': getCsrfToken() } : {}),
        ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
    })
  }
  const ensureOk = async (response: Response) => {
    if (!response.ok) {
      const body = await response.text()
      let message = body
      try { message = (JSON.parse(body) as { error?: string }).error || body } catch { /* Plain text response. */ }
      throw new Error(message || `Request failed with status ${response.status}`)
    }
  }
  return {
    async requestJson<T>(pathOrUrl: string, options: ApiRequestOptions): Promise<T> {
      const response = await request(pathOrUrl, options)
      await ensureOk(response)
      if (response.status === 204) return undefined as T
      return response.json() as Promise<T>
    },
    async requestBlob(pathOrUrl: string, options: ApiRequestOptions): Promise<Blob> {
      const response = await request(pathOrUrl, options)
      await ensureOk(response)
      return response.blob()
    },
  }
}
