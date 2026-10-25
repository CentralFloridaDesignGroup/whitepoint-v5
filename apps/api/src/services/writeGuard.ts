/** Fail a D1 batch when the immediately preceding revision-checked write changed no row. */
export const guard = (db: D1Database, token: string) =>
  db.prepare('INSERT INTO record_write_guards(id,valid) VALUES(?,CASE WHEN changes()=1 THEN 1 ELSE 0 END)').bind(token)

export const unguard = (db: D1Database, token: string) =>
  db.prepare('DELETE FROM record_write_guards WHERE id=?').bind(token)
