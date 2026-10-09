import { sha256 } from '../auth/session.ts'

export async function allowRequest(db: D1Database, key: string, max: number, windowMs: number): Promise<boolean> {
  const now = Date.now()
  const hash = await sha256(key)
  const row = await db.prepare(`INSERT INTO request_limits(key,attempts,expires_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<? THEN 1 ELSE attempts+1 END,
    expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`)
    .bind(hash, now + windowMs, now, now).first<{ attempts: number }>()
  return Number(row?.attempts || 999) <= max
}
