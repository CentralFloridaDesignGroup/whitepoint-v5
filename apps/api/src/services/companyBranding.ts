import type { ApiEnv } from '../types/apiTypes'

type BrandRow = { company_name: string; rectangular_logo_key: string | null; square_logo_key: string | null; revision: number }
type LogoRow = Pick<BrandRow, 'rectangular_logo_key' | 'square_logo_key'>
type LogoKind = 'rectangular' | 'square'

export async function companyBranding(db: D1Database) {
  const row = await db.prepare('SELECT company_name,rectangular_logo_key,square_logo_key,revision FROM app_settings WHERE id=1').first<BrandRow>()
  const logoKind: LogoKind | null = row?.rectangular_logo_key ? 'rectangular' : row?.square_logo_key ? 'square' : null
  return { companyName: row?.company_name || 'White Point Surveying & Mapping LLC', logoKind, revision: row?.revision || 0 }
}

export async function companyLogoResponse(env: ApiEnv, requestedKind?: LogoKind): Promise<Response | null> {
  const row = await env.DB.prepare('SELECT rectangular_logo_key,square_logo_key FROM app_settings WHERE id=1').first<LogoRow>()
  const key = requestedKind === 'rectangular' ? row?.rectangular_logo_key : requestedKind === 'square' ? row?.square_logo_key : row?.rectangular_logo_key || row?.square_logo_key
  if (!key) return null
  const object = await env.BRAND_ASSETS.get(key)
  if (!object) return null
  return new Response(object.body, { headers: {
    'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  } })
}
