import type { ApiEnv } from '../types/apiTypes'
import { randomToken, sha256 } from './session'
import { sendEmail } from '../services/brevo.ts'

export async function issueAccessLink(db: D1Database, userId: string, purpose: 'invite' | 'reset') {
  const token = randomToken()
  await db.prepare("UPDATE user_auth_tokens SET used_at=? WHERE user_id=? AND purpose IN ('invite','reset') AND used_at IS NULL").bind(Date.now(), userId).run()
  await db.prepare('INSERT INTO user_auth_tokens(token_hash,user_id,purpose,expires_at) VALUES(?,?,?,?)').bind(await sha256(token), userId, purpose, Date.now() + 30 * 60_000).run()
  return token
}
export async function sendAccessEmail(env: ApiEnv, email: string, name: string, token: string) {
  const url = new URL('/login', env.STAFF_APP_URL || 'https://app.whitepointsurvey.com')
  url.searchParams.set('token', token)
  await sendEmail(env, { to: [{ email, name }], subject: 'White Point account access', text: `Open this link to set your password. It expires in 30 minutes: ${url.toString()}` })
}
