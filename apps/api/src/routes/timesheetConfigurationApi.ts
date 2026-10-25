import { Hono } from 'hono'
import type { HonoEnv } from '../types/apiTypes'
import { guard, clearGuard, date, todayEastern } from './timesheetSupport.ts'

const has = (c: { get: (key: 'permissions') => { hasPermission: (key: string) => boolean } }, key: string) => c.get('permissions').hasPermission(key)
const id = () => crypto.randomUUID()

export function createTimesheetConfigurationApi() {
  const api = new Hono<HonoEnv>()
  api.get('/configuration',async c=>{
    if(!has(c,'timesheets.rates.view')&&!has(c,'timesheets.rates.manage'))return c.json({error:'Forbidden'},403)
    const [positions,tables,rates,settings]=await Promise.all([
      c.env.DB.prepare('SELECT * FROM billing_positions ORDER BY local_id IS NULL, local_id COLLATE NOCASE, name COLLATE NOCASE').all(),
      c.env.DB.prepare('SELECT * FROM pay_tables ORDER BY name COLLATE NOCASE').all(),
      c.env.DB.prepare('SELECT * FROM pay_table_rates').all(),
      c.env.DB.prepare('SELECT revision FROM timesheet_settings WHERE id=1').first<{revision:number}>()
    ])
    return c.json({positions:positions.results,tables:tables.results,rates:rates.results,revision:settings?.revision||1})
  })
  api.put('/configuration',async c=>{
    if(!has(c,'timesheets.rates.manage'))return c.json({error:'Forbidden'},403)
    const body=await c.req.json<{revision:number;positions:Array<{id:string;localId:string|null;name:string;active:boolean}>;tables:Array<{id:string;name:string;active:boolean;expiresOn:string|null;isDefault:boolean;undefinedRateCents:number;rates:Array<{positionId:string;rateCents:number}>}>}>().catch(()=>null)
    if(!body||!Number.isInteger(body.revision)||!Array.isArray(body.positions)||!Array.isArray(body.tables)||body.positions.length>200||body.tables.length>100)return c.json({error:'Invalid rate table changes.'},400)
    const positions=new Set<string>(),localIds=new Set<string>(),tables=new Set<string>()
    for(const p of body.positions){
      const localId=p.localId?.trim()||null
      if(!p.id||!p.name?.trim()||p.name.length>200||typeof p.active!=='boolean'||positions.has(p.id)||p.localId!==null&&typeof p.localId!=='string'||localId&&localId.length>40||localId&&localIds.has(localId.toLowerCase()))return c.json({error:'Billing position names and local IDs must be valid and unique.'},400)
      positions.add(p.id)
      if(localId)localIds.add(localId.toLowerCase())
    }
    if(body.tables.filter(t=>t.isDefault).length!==(body.tables.some(t=>t.active)?1:0)||body.tables.some(t=>t.isDefault&&(!t.active||t.expiresOn&&t.expiresOn<todayEastern())))return c.json({error:'Choose one active, unexpired default table.'},400)
    for(const t of body.tables){if(!t.id||!t.name?.trim()||t.name.length>200||typeof t.active!=='boolean'||typeof t.isDefault!=='boolean'||t.expiresOn!==null&&(!date(t.expiresOn))||!Number.isInteger(t.undefinedRateCents)||t.undefinedRateCents<0||!Array.isArray(t.rates)||tables.has(t.id))return c.json({error:'Invalid pay tables.'},400);tables.add(t.id);if(t.rates.some(r=>!positions.has(r.positionId)||!Number.isInteger(r.rateCents)||r.rateCents<0)||new Set(t.rates.map(r=>r.positionId)).size!==t.rates.length)return c.json({error:'Invalid position rates.'},400)}
    const statements:D1PreparedStatement[]=[]
    const token=id()
    statements.push(c.env.DB.prepare('UPDATE timesheet_settings SET revision=revision+1 WHERE id=1 AND revision=?').bind(body.revision),guard(c.env.DB,token))
    // Clear the partial unique default index before assigning the new default.
    statements.push(c.env.DB.prepare('UPDATE pay_tables SET is_default=0 WHERE is_default=1'))
    for(const p of body.positions)statements.push(c.env.DB.prepare('INSERT INTO billing_positions(id,local_id,name,active) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET local_id=excluded.local_id,name=excluded.name,active=excluded.active').bind(p.id,p.localId?.trim()||null,p.name.trim(),Number(p.active)))
    for(const t of body.tables){
      statements.push(c.env.DB.prepare('INSERT INTO pay_tables(id,name,active,expires_on,is_default,undefined_rate_cents) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,active=excluded.active,expires_on=excluded.expires_on,is_default=excluded.is_default,undefined_rate_cents=excluded.undefined_rate_cents,updated_at=CURRENT_TIMESTAMP').bind(t.id,t.name.trim(),Number(t.active),t.expiresOn,Number(t.isDefault),t.undefinedRateCents))
      statements.push(c.env.DB.prepare('DELETE FROM pay_table_rates WHERE pay_table_id=?').bind(t.id))
      for(const r of t.rates)statements.push(c.env.DB.prepare('INSERT INTO pay_table_rates(pay_table_id,position_id,rate_cents) VALUES(?,?,?)').bind(t.id,r.positionId,r.rateCents))
    }
    statements.push(clearGuard(c.env.DB,token))
    try{await c.env.DB.batch(statements)}catch{return c.json({error:'Billing rates changed or could not be saved. Refresh and retry.'},409)}
    return c.json({saved:true})
  })
  return api
}
