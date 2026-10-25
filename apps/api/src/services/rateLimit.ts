import { sha256 } from '../auth/session.ts'

export type RateLimitDecision = { allowed: boolean; retryAfterSeconds: number }

export async function allowRequest(db: D1Database, key: string, max: number, windowMs: number, now = Date.now()): Promise<RateLimitDecision> {
  const hash = await sha256(key)
  await db.prepare('DELETE FROM request_limits WHERE expires_at<=?').bind(now).run()
  const row = await db.prepare(`INSERT INTO request_limits(key,attempts,expires_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<? THEN 1 ELSE attempts+1 END,
    expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING attempts,expires_at`)
    .bind(hash, now + windowMs, now, now).first<{ attempts: number; expires_at: number }>()
  const allowed = Number(row?.attempts || max + 1) <= max
  return { allowed, retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((Number(row?.expires_at || now + windowMs) - now) / 1000)) }
}
