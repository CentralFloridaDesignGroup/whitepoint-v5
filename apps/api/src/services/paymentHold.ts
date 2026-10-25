export async function clientOnHold(db:D1Database,clientId:string):Promise<boolean>{
  return Boolean(await db.prepare('SELECT 1 FROM client_payment_holds WHERE client_id=? AND released_at IS NULL').bind(clientId).first())
}
export async function projectOnHold(db:D1Database,projectId:string):Promise<boolean>{
  return Boolean(await db.prepare('SELECT 1 FROM projects p JOIN client_payment_holds h ON h.client_id=p.client_id AND h.released_at IS NULL WHERE p.id=?').bind(projectId).first())
}
export async function placeClientHold(db:D1Database,invoiceId:string,sourceId:string,reason:string){
  await db.prepare("INSERT INTO client_payment_holds(client_id,reason,source_id,released_at,released_by) SELECT client_id,?,?,NULL,NULL FROM invoices WHERE id=? ON CONFLICT(client_id) DO UPDATE SET reason=excluded.reason,source_id=excluded.source_id,released_at=NULL,released_by=NULL").bind(reason,sourceId,invoiceId).run()
}
