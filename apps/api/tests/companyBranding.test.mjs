import { test } from 'node:test'
import assert from 'node:assert/strict'
import { companyBranding, companyLogoResponse } from '../src/services/companyBranding.ts'

function environment(row) {
  const keys = []
  const DB = { prepare: () => ({ first: async () => row }) }
  const BRAND_ASSETS = { get: async key => {
    keys.push(key)
    return { body: new Response('logo bytes').body, httpMetadata: { contentType: 'image/webp' } }
  } }
  return { DB, BRAND_ASSETS, keys }
}

test('invoice branding prefers the uploaded rectangular logo and company name', async () => {
  const env = environment({ company_name: 'Configured Survey Company', rectangular_logo_key: 'wide', square_logo_key: 'square', revision: 8 })
  assert.deepEqual(await companyBranding(env.DB), { companyName: 'Configured Survey Company', logoKind: 'rectangular', revision: 8 })
  const response = await companyLogoResponse(env)
  assert.deepEqual(env.keys, ['wide'])
  assert.equal(response.headers.get('Content-Type'), 'image/webp')
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff')
})

test('invoice branding uses square upload when no rectangular logo exists', async () => {
  const env = environment({ company_name: 'Configured Survey Company', rectangular_logo_key: null, square_logo_key: 'square', revision: 9 })
  assert.equal((await companyBranding(env.DB)).logoKind, 'square')
  await companyLogoResponse(env)
  assert.deepEqual(env.keys, ['square'])
  assert.equal(await companyLogoResponse(env, 'rectangular'), null)
})

test('invoice branding falls back to text when no logo is configured', async () => {
  const env = environment({ company_name: 'Configured Survey Company', rectangular_logo_key: null, square_logo_key: null, revision: 1 })
  assert.equal((await companyBranding(env.DB)).logoKind, null)
  assert.equal(await companyLogoResponse(env), null)
  assert.deepEqual(env.keys, [])
})
