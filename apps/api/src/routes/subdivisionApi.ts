import { Hono } from 'hono';
import type { PhaseTemplate, Subdivision, SubdivisionBatch, SubdivisionBatchRow, SubdivisionListItem, SubdivisionParcel, SubdivisionParent } from '@whitepoint/types';
import type { HonoEnv } from '../types/apiTypes';
import { actor, bad, conflict, deny, guard, json, permitted, qboSave, str, taskLetters, uid, type C, type Row } from './recordSupport';

const parcelTypes = ['lot','tract','parcel','pad'];
const billTypes = ['fixed-fee','time-and-materials','time-and-materials-nte','direct-expense','non-billable'];
type TaskDefault = PhaseTemplate['tasks'][number];
const writeProject = (c:C) => permitted(c,'projects.view') && permitted(c,'projects.create') && permitted(c,'projects.manage.financials');
const readProject = (c:C) => permitted(c,'projects.view');
const suffix = (parent:string, block:string, label:string) => `${parent}.${block ? `${block}.` : ''}${label}`;
const validSegment = (value:string) => /^[\p{L}\p{N}_-]{1,40}$/u.test(value);
const chunks=<T>(values:T[],size=80)=>Array.from({length:Math.ceil(values.length/size)},(_,index)=>values.slice(index*size,(index+1)*size));
const safeTasks = (value:unknown): TaskDefault[] | null => {
  if (!Array.isArray(value) || value.length > 30) return null;
  const rows:TaskDefault[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const row = item as Record<string,unknown>;
    const taskId = str(row.taskId,20).toUpperCase(), taskName = str(row.taskName,200), billType = str(row.billType,40);
    const amount = row.contractAmountCents;
    if (!/^[A-Z]{1,20}$/.test(taskId) || !taskName || !billTypes.includes(billType) || !Number.isSafeInteger(amount) || Number(amount)<0) return null;
    rows.push({taskId,taskName,shortDescription:str(row.shortDescription,500),billType:billType as TaskDefault['billType'],contractAmountCents:Number(amount),isUnderContract:row.isUnderContract===true});
  }
  return new Set(rows.map(x=>x.taskId)).size===rows.length ? rows : null;
};
const parentRow = (c:C, subdivisionId:string, projectId:string) => c.env.DB.prepare(`SELECT p.*,sp.subdivision_id,c.name AS client_name,u.display_name AS manager_name,ct.name AS contact_name,pt.name AS pay_table_name FROM subdivision_parents sp JOIN projects p ON p.id=sp.project_id JOIN clients c ON c.id=p.client_id LEFT JOIN users_named u ON u.id=p.manager_user_id LEFT JOIN contacts ct ON ct.id=p.contact_id LEFT JOIN pay_tables pt ON pt.id=p.pay_table_id WHERE sp.subdivision_id=? AND p.id=? AND p.archived_at IS NULL`).bind(subdivisionId,projectId).first<Row>();

async function detail(c:C, id:string):Promise<Subdivision|null> {
  const record=await c.env.DB.prepare('SELECT * FROM subdivisions WHERE id=? AND archived_at IS NULL').bind(id).first<Row>();
  if(!record)return null;
  const [parcels,parents]=await Promise.all([
    c.env.DB.prepare(`SELECT sp.*,a.project_id,a.parent_project_id,p.project_number,p.stage,p.active,p.qbo_sync_status,cl.name AS client_name,
      (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id=p.id AND t.archived_at IS NULL AND t.is_completed=0) AS unfinished_tasks,
      (SELECT COUNT(*) FROM invoices i WHERE i.project_id=p.id AND i.status IN ('sent','draft')) AS unpaid_invoices,
      (SELECT COALESCE(json_group_array(json_object('name',x.template_name,'appliedAt',x.created_at)),'[]') FROM subdivision_template_applications x WHERE x.project_id=p.id) AS applied_templates
      FROM subdivision_parcels sp LEFT JOIN subdivision_assignments a ON a.parcel_id=sp.id AND a.ended_at IS NULL
      LEFT JOIN projects p ON p.id=a.project_id LEFT JOIN clients cl ON cl.id=p.client_id WHERE sp.subdivision_id=? ORDER BY sp.block COLLATE NOCASE,sp.label COLLATE NOCASE`).bind(id).all<Row>(),
    c.env.DB.prepare(`SELECT p.id,p.project_number,p.name,p.client_id,p.stage,p.active,p.manager_user_id,p.contact_id,p.qbo_sync_status,cl.name AS client_name FROM subdivision_parents sp JOIN projects p ON p.id=sp.project_id JOIN clients cl ON cl.id=sp.client_id WHERE sp.subdivision_id=? AND p.archived_at IS NULL ORDER BY cl.name COLLATE NOCASE`).bind(id).all<Row>()
  ]);
  const projectAccess=readProject(c);
  return {id,name:String(record.name),location:String(record.location),platReference:String(record.plat_reference),revision:Number(record.revision),
    parcels:parcels.results.map(r=>({id:String(r.id),subdivisionId:id,parcelType:r.parcel_type as SubdivisionParcel['parcelType'],block:String(r.block),label:String(r.label),platReference:String(r.plat_reference),streetAddress:String(r.street_address),parcelId:String(r.parcel_id),assignment:r.project_id?{projectId:projectAccess?String(r.project_id):'',parentProjectId:projectAccess?String(r.parent_project_id):'',projectNumber:projectAccess?String(r.project_number):'',clientName:projectAccess?String(r.client_name):'Assigned',stage:projectAccess?r.stage as NonNullable<SubdivisionParcel['assignment']>['stage']:'opportunity',active:projectAccess?Boolean(r.active):false,unfinishedTasks:projectAccess?Number(r.unfinished_tasks):0,unpaidInvoices:projectAccess?Number(r.unpaid_invoices):0,qboSyncStatus:projectAccess?String(r.qbo_sync_status):''}:null,appliedTemplates:projectAccess?json(r.applied_templates,[]):[]})),
    parents:projectAccess?parents.results.map(r=>({projectId:String(r.id),projectNumber:String(r.project_number),projectName:String(r.name),clientId:String(r.client_id),clientName:String(r.client_name),stage:r.stage as SubdivisionParent['stage'],active:Boolean(r.active),managerUserId:r.manager_user_id?String(r.manager_user_id):null,contactId:r.contact_id?String(r.contact_id):null,qboSyncStatus:String(r.qbo_sync_status)})):[]};
}

async function preview(c:C, subdivisionId:string, body:{parentProjectId?:string;parcelIds?:string[];templateId?:string;transfer?:boolean;confirmContractSigned?:boolean;phasePrices?:Record<string,number>;parentRevision?:number;templateRevision?:number}) {
  const parent=await parentRow(c,subdivisionId,str(body.parentProjectId,64));
  if(!parent)return {error:'Choose a linked builder parent project.'};
  if(body.parentRevision!==undefined&&body.parentRevision!==parent.revision)return {error:'Builder parent changed after review. Review the batch again.'};
  if(!Array.isArray(body.parcelIds)||!body.parcelIds.length||body.parcelIds.length>500||body.parcelIds.some(id=>typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id))||new Set(body.parcelIds).size!==body.parcelIds.length)return {error:'Select 1 to 500 distinct parcels.'};
  const template=await c.env.DB.prepare('SELECT * FROM subdivision_phase_templates WHERE id=? AND archived_at IS NULL').bind(str(body.templateId,64)).first<Row>();
  if(!template)return {error:'Choose an active company phase template.'};
  if(body.templateRevision!==undefined&&body.templateRevision!==template.revision)return {error:'Phase template changed after review. Review the batch again.'};
  const defaults=safeTasks(json(template.tasks_json,[]));
  const overrides=body.phasePrices||{};
  if(!defaults||typeof overrides!=='object'||Array.isArray(overrides)||Object.keys(overrides).some(key=>!defaults.some(t=>t.taskId===key)||!Number.isSafeInteger(overrides[key])||Number(overrides[key])<0))return {error:'Phase prices are invalid.'};
  const tasks=defaults.map(task=>({...task,contractAmountCents:overrides[task.taskId]??task.contractAmountCents}));
  if(parent.stage==='active' && body.confirmContractSigned!==true)return {error:'Confirm the signed contract before creating active lot projects.'};
  const parcels:Row[]=[];
  for(const ids of chunks(body.parcelIds)){const result=await c.env.DB.prepare(`SELECT * FROM subdivision_parcels WHERE subdivision_id=? AND id IN (${ids.map(()=>'?').join(',')})`).bind(subdivisionId,...ids).all<Row>();parcels.push(...result.results);}
  const parcelById=new Map(parcels.map(parcel=>[String(parcel.id),parcel]));
  const active:Row[]=[];
  for(const ids of chunks(body.parcelIds)){const result=await c.env.DB.prepare(`SELECT a.parcel_id,a.project_id,p.client_id FROM subdivision_assignments a JOIN projects p ON p.id=a.project_id WHERE a.ended_at IS NULL AND a.parcel_id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all<Row>();active.push(...result.results);}
  const activeByParcel=new Map(active.map(row=>[String(row.parcel_id),row]));
  const numbers=parcels.map(parcel=>suffix(String(parent.project_number),String(parcel.block),String(parcel.label)));
  const used:{project_number:string}[]=[];
  for(const values of chunks(numbers)){const result=await c.env.DB.prepare(`SELECT project_number FROM projects WHERE project_number IN (${values.map(()=>'?').join(',')})`).bind(...values).all<{project_number:string}>();used.push(...result.results);}
  const usedNumbers=new Set(used.map(row=>row.project_number));
  const rows:SubdivisionBatchRow[]=[];
  for(const id of body.parcelIds){
    const parcel=parcelById.get(id);
    if(!parcel)return {error:`Parcel ${id} is not in this subdivision.`};
    const current=activeByParcel.get(id);
    if(current && !body.transfer)return {error:`${parcel.label} already has an active builder. Use the transfer review.`};
    if(current && current.client_id===parent.client_id)return {error:`${parcel.label} is already assigned to this builder.`};
    const projectNumber=suffix(String(parent.project_number),String(parcel.block),String(parcel.label));
    if(projectNumber.length>40)return {error:`${projectNumber} exceeds the project number limit.`};
    if(usedNumbers.has(projectNumber))return {error:`Project number ${projectNumber} already exists.`};
    rows.push({parcelId:id,projectNumber,previousProjectId:current?String(current.project_id):null,status:'pending',projectId:null,error:null});
  }
  return {parent,template,tasks,rows};
}

async function previewAppend(c:C, subdivisionId:string, body:{parentProjectId?:string;parcelIds?:string[];templateId?:string;confirmContractSigned?:boolean;phasePrices?:Record<string,number>;parentRevision?:number;templateRevision?:number}) {
  const parent=await parentRow(c,subdivisionId,str(body.parentProjectId,64));
  if(!parent)return {error:'Choose a linked builder parent project.'};
  if(body.parentRevision!==undefined&&body.parentRevision!==parent.revision)return {error:'Builder parent changed after review. Review the batch again.'};
  if(!Array.isArray(body.parcelIds)||!body.parcelIds.length||body.parcelIds.length>500||body.parcelIds.some(id=>typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id))||new Set(body.parcelIds).size!==body.parcelIds.length)return {error:'Select 1 to 500 distinct parcels.'};
  const template=await c.env.DB.prepare('SELECT * FROM subdivision_phase_templates WHERE id=? AND archived_at IS NULL').bind(str(body.templateId,64)).first<Row>();
  if(!template)return {error:'Choose an active company phase template.'};
  if(body.templateRevision!==undefined&&body.templateRevision!==template.revision)return {error:'Phase template changed after review. Review the batch again.'};
  const defaults=safeTasks(json(template.tasks_json,[])),overrides=body.phasePrices||{};
  if(!defaults||!defaults.length||typeof overrides!=='object'||Array.isArray(overrides)||Object.keys(overrides).some(key=>!defaults.some(t=>t.taskId===key)||!Number.isSafeInteger(overrides[key])||Number(overrides[key])<0))return {error:'Phase prices are invalid.'};
  const tasks=defaults.map(task=>({...task,contractAmountCents:overrides[task.taskId]??task.contractAmountCents}));
  const addedPrice=tasks.reduce((sum,task)=>sum+task.contractAmountCents,0);
  if(!Number.isSafeInteger(addedPrice))return {error:'The combined phase prices are too large.'};
  const assignments:Row[]=[];
  for(const ids of chunks(body.parcelIds)){
    const result=await c.env.DB.prepare(`SELECT sp.id AS parcel_id,a.project_id,p.project_number,p.revision,p.contract_price_cents,p.stage,p.active,p.archived_at FROM subdivision_parcels sp JOIN subdivision_assignments a ON a.parcel_id=sp.id AND a.ended_at IS NULL JOIN projects p ON p.id=a.project_id WHERE sp.subdivision_id=? AND a.parent_project_id=? AND sp.id IN (${ids.map(()=>'?').join(',')})`).bind(subdivisionId,parent.id,...ids).all<Row>();
    assignments.push(...result.results);
  }
  const byParcel=new Map(assignments.map(row=>[String(row.parcel_id),row]));
  const projectIds=assignments.map(row=>String(row.project_id)),taskRows:Row[]=[];
  for(const ids of chunks(projectIds)){const result=await c.env.DB.prepare(`SELECT project_id,task_id FROM project_tasks WHERE project_id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all<Row>();taskRows.push(...result.results);}
  const usedByProject=new Map(projectIds.map(id=>[id,new Set<string>()]));
  for(const task of taskRows)usedByProject.get(String(task.project_id))?.add(String(task.task_id));
  const rows:SubdivisionBatchRow[]=[];
  for(const parcelId of body.parcelIds){
    const row=byParcel.get(parcelId);
    if(!row||!row.active||row.archived_at)return {error:`Parcel ${parcelId} needs an active lot project for the selected builder.`};
    if(row.stage==='active'&&body.confirmContractSigned!==true)return {error:'Confirm the signed contract before adding phases to active lot projects.'};
    if(!Number.isSafeInteger(Number(row.contract_price_cents)+addedPrice))return {error:`${row.project_number} would exceed the project price limit.`};
    const used=usedByProject.get(String(row.project_id))||new Set<string>();
    const taskIds=tasks.map(task=>{if(!used.has(task.taskId)){used.add(task.taskId);return task.taskId;}let index=1;while(used.has(taskLetters(index)))index++;const id=taskLetters(index);used.add(id);return id;});
    rows.push({parcelId,projectNumber:String(row.project_number),previousProjectId:null,status:'pending',projectId:String(row.project_id),error:null,taskIds,targetRevision:Number(row.revision)});
  }
  return {parent,template,tasks,rows};
}

async function batch(c:C, id:string):Promise<SubdivisionBatch|null>{
  const row=await c.env.DB.prepare('SELECT operation FROM subdivision_batches WHERE id=?').bind(id).first<{operation:'assign'|'append'}>();if(!row)return null;
  const rows=await c.env.DB.prepare('SELECT * FROM subdivision_batch_rows WHERE batch_id=? ORDER BY rowid').bind(id).all<Row>();
  return {id,operation:row.operation,rows:rows.results.map(r=>({parcelId:String(r.parcel_id),projectNumber:String(r.project_number),previousProjectId:r.previous_project_id?String(r.previous_project_id):null,status:r.status as SubdivisionBatchRow['status'],projectId:r.project_id?String(r.project_id):null,error:r.error?String(r.error):null,...(r.task_ids_json?{taskIds:json<string[]>(r.task_ids_json,[])}:{}),...(r.target_revision?{targetRevision:Number(r.target_revision)}:{})}))};
}

export function createSubdivisionApi(){
  const api=new Hono<HonoEnv>();
  api.get('/subdivisions',async c=>{
    const rows=await c.env.DB.prepare(`SELECT s.id,s.name,s.location,s.plat_reference,COUNT(sp.id) AS parcel_count,COUNT(a.id) AS assigned_count FROM subdivisions s LEFT JOIN subdivision_parcels sp ON sp.subdivision_id=s.id LEFT JOIN subdivision_assignments a ON a.parcel_id=sp.id AND a.ended_at IS NULL WHERE s.archived_at IS NULL GROUP BY s.id ORDER BY s.name COLLATE NOCASE`).all<Row>();
    return c.json(rows.results.map(r=>({id:String(r.id),name:String(r.name),location:String(r.location),platReference:String(r.plat_reference),parcelCount:Number(r.parcel_count),assignedCount:Number(r.assigned_count)} satisfies SubdivisionListItem)));
  });
  api.post('/subdivisions',async c=>{
    const body=await c.req.json<Record<string,unknown>>().catch(()=>null);if(!body)return bad(c,'Expected subdivision JSON.');
    const name=str(body.name,200),location=str(body.location,300),plat=str(body.platReference,200);if(!name)return bad(c,'Subdivision name is required.');
    const id=uid();await c.env.DB.prepare('INSERT INTO subdivisions(id,name,location,plat_reference) VALUES(?,?,?,?)').bind(id,name,location,plat).run();return c.json(await detail(c,id),201);
  });
  api.get('/subdivisions/:id',async c=>{const value=await detail(c,c.req.param('id'));return value?c.json(value):c.notFound()});
  api.put('/subdivisions/:id',async c=>{
    const body=await c.req.json<Record<string,unknown>>().catch(()=>null);if(!body)return bad(c,'Expected subdivision JSON.');
    const name=str(body.name,200);if(!name)return bad(c,'Subdivision name is required.');
    const result=await c.env.DB.prepare('UPDATE subdivisions SET name=?,location=?,plat_reference=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND archived_at IS NULL').bind(name,str(body.location,300),str(body.platReference,200),c.req.param('id'),body.revision).run();
    return result.meta.changes?c.json(await detail(c,c.req.param('id'))):conflict(c);
  });
  api.post('/subdivisions/:id/parcels',async c=>{
    const id=c.req.param('id'),body=await c.req.json<{rows?:Array<Record<string,unknown>>;revision?:number}>().catch(()=>null);
    if(!body||!Array.isArray(body.rows)||!body.rows.length||body.rows.length>500)return bad(c,'Provide 1 to 500 parcel rows.');
    const subdivision=await c.env.DB.prepare('SELECT revision FROM subdivisions WHERE id=? AND archived_at IS NULL').bind(id).first<{revision:number}>();if(!subdivision)return c.notFound();if(subdivision.revision!==body.revision)return conflict(c);
    const rows=body.rows.map(raw=>({type:str(raw.parcelType,20),block:str(raw.block,40),label:str(raw.label,40),plat:str(raw.platReference,200),street:str(raw.streetAddress,200),parcelId:str(raw.parcelId,100)}));
    if(rows.some(r=>!parcelTypes.includes(r.type)||!validSegment(r.label)||(r.block&&!validSegment(r.block))))return bad(c,'Each parcel needs a type and a literal label; block and label may contain letters, numbers, underscore, or hyphen.');
    const keys=rows.map(r=>`${r.block.toLowerCase()}\0${r.label.toLowerCase()}`);if(new Set(keys).size!==keys.length)return bad(c,'The batch contains duplicate block and parcel labels.');
    const existing=(await c.env.DB.prepare('SELECT block,label FROM subdivision_parcels WHERE subdivision_id=?').bind(id).all<{block:string;label:string}>()).results;
    const existingKeys=new Set(existing.map(r=>`${r.block.toLowerCase()}\0${r.label.toLowerCase()}`));
    for(const row of rows)if(existingKeys.has(`${row.block.toLowerCase()}\0${row.label.toLowerCase()}`))return c.json({error:`${row.block} ${row.label} already exists.`},409);
    const token=uid();try{await c.env.DB.batch([c.env.DB.prepare('UPDATE subdivisions SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?').bind(id,body.revision),guard(c,token),...rows.map(r=>c.env.DB.prepare('INSERT INTO subdivision_parcels(id,subdivision_id,parcel_type,block,label,plat_reference,street_address,parcel_id) VALUES(?,?,?,?,?,?,?,?)').bind(uid(),id,r.type,r.block,r.label,r.plat,r.street,r.parcelId)),c.env.DB.prepare('DELETE FROM record_write_guards WHERE id=?').bind(token)]);}catch{return conflict(c);}
    return c.json(await detail(c,id));
  });
  api.put('/subdivisions/:id/parcels/:parcelId',async c=>{
    const id=c.req.param('id'),parcelId=c.req.param('parcelId'),body=await c.req.json<Record<string,unknown>>().catch(()=>null);
    if(!body)return bad(c,'Expected parcel JSON.');
    const existing=await c.env.DB.prepare('SELECT * FROM subdivision_parcels WHERE id=? AND subdivision_id=?').bind(parcelId,id).first<Row>();if(!existing)return c.notFound();
    const type=str(body.parcelType,20),block=str(body.block,40),label=str(body.label,40);
    if(!parcelTypes.includes(type)||!validSegment(label)||(block&&!validSegment(block)))return bad(c,'Parcel type, block, or label is invalid.');
    if((block!==existing.block||label!==existing.label)&&await c.env.DB.prepare('SELECT 1 FROM subdivision_assignments WHERE parcel_id=?').bind(parcelId).first())return bad(c,'An assigned parcel cannot change its block or label because its project number must stay stable.');
    const token=uid();try{await c.env.DB.batch([c.env.DB.prepare('UPDATE subdivisions SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?').bind(id,body.revision),guard(c,token),c.env.DB.prepare('UPDATE subdivision_parcels SET parcel_type=?,block=?,label=?,plat_reference=?,street_address=?,parcel_id=? WHERE id=? AND subdivision_id=?').bind(type,block,label,str(body.platReference,200),str(body.streetAddress,200),str(body.parcelId,100),parcelId,id),c.env.DB.prepare('DELETE FROM record_write_guards WHERE id=?').bind(token)]);}catch{return conflict(c);}
    return c.json(await detail(c,id));
  });
  api.post('/subdivisions/:id/parents',async c=>{
    const id=c.req.param('id'),body=await c.req.json<{projectId?:string}>().catch(()=>null),projectId=str(body?.projectId,64);
    const project=await c.env.DB.prepare('SELECT * FROM projects WHERE id=? AND archived_at IS NULL').bind(projectId).first<Row>();if(!project)return bad(c,'Choose an existing project.');
    if(!permitted(c,'projects.manage')&&!(permitted(c,'projects.create')&&project.created_by===actor(c)))return deny(c);
    if(await c.env.DB.prepare('SELECT id FROM subdivision_assignments WHERE project_id=?').bind(projectId).first())return bad(c,'A lot project cannot be a builder parent.');
    try{await c.env.DB.prepare('INSERT INTO subdivision_parents(subdivision_id,project_id,client_id) VALUES(?,?,?)').bind(id,projectId,project.client_id).run();}catch{return c.json({error:'This project or client is already linked to a subdivision phase.'},409);}
    return c.json(await detail(c,id),201);
  });
  api.get('/subdivisions/:id/parent-candidates',async c=>{
    const q=str(c.req.query('q'),40),like=`%${q.replace(/[\\%_]/g,'\\$&')}%`;
    const rows=await c.env.DB.prepare(`SELECT p.id,p.project_number,p.name,c.name AS client_name FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM subdivision_parents sp WHERE sp.project_id=p.id) AND NOT EXISTS(SELECT 1 FROM subdivision_assignments sa WHERE sa.project_id=p.id) AND (p.project_number LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\') ORDER BY p.project_number DESC LIMIT 50`).bind(like,like,like).all();
    return c.json(rows.results);
  });
  api.post('/subdivisions/:id/assignments/preview',async c=>{
    if(!writeProject(c))return deny(c);
    const body=await c.req.json<Record<string,unknown>>().catch(()=>null);if(!body)return bad(c,'Expected assignment JSON.');
    const result=await preview(c,c.req.param('id'),body);if('error' in result)return bad(c,String(result.error));return c.json({rows:result.rows,tasks:result.tasks,templateRevision:Number(result.template.revision),parent:{projectNumber:result.parent.project_number,clientName:result.parent.client_name,stage:result.parent.stage,revision:Number(result.parent.revision),managerName:result.parent.manager_name,contactName:result.parent.contact_name,payTableName:result.parent.pay_table_name,description:result.parent.description,address:json(result.parent.address_json,{})}});
  });
  api.post('/subdivisions/:id/assignments/batches',async c=>{
    if(!writeProject(c))return deny(c);
    const body=await c.req.json<Record<string,unknown>>().catch(()=>null);if(!body)return bad(c,'Expected assignment JSON.');
    const batchId=str(body.batchId,64);if(!/^[a-f0-9-]{36}$/i.test(batchId))return bad(c,'A stable batch ID is required.');
    const existing=await batch(c,batchId);if(existing)return c.json(existing);
    const result=await preview(c,c.req.param('id'),body);if('error' in result)return bad(c,String(result.error));
    try{await c.env.DB.batch([c.env.DB.prepare('INSERT INTO subdivision_batches(id,subdivision_id,parent_project_id,parent_revision,template_snapshot_json,template_id,template_revision,template_name,confirmed_contract,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(batchId,c.req.param('id'),result.parent.id,result.parent.revision,JSON.stringify(result.tasks),result.template.id,result.template.revision,result.template.name,Number(body.confirmContractSigned===true),actor(c)),...result.rows.map(r=>c.env.DB.prepare('INSERT INTO subdivision_batch_rows(batch_id,parcel_id,previous_project_id,project_number) VALUES(?,?,?,?)').bind(batchId,r.parcelId,r.previousProjectId,r.projectNumber))]);}catch{const retry=await batch(c,batchId);if(retry)return c.json(retry);return conflict(c);}
    return c.json(await batch(c,batchId),201);
  });
  api.post('/subdivisions/:id/templates/preview',async c=>{
    if(!writeProject(c))return deny(c);
    const body=await c.req.json<Record<string,unknown>>().catch(()=>null);if(!body)return bad(c,'Expected template JSON.');
    const result=await previewAppend(c,c.req.param('id'),body);if('error' in result)return bad(c,String(result.error));
    return c.json({rows:result.rows,tasks:result.tasks,templateRevision:Number(result.template.revision),parent:{projectNumber:result.parent.project_number,clientName:result.parent.client_name,stage:result.parent.stage,revision:Number(result.parent.revision),managerName:result.parent.manager_name,contactName:result.parent.contact_name,payTableName:result.parent.pay_table_name,description:result.parent.description,address:json(result.parent.address_json,{})}});
  });
  api.post('/subdivisions/:id/templates/batches',async c=>{
    if(!writeProject(c))return deny(c);
    const body=await c.req.json<Record<string,unknown>>().catch(()=>null);if(!body)return bad(c,'Expected template JSON.');
    const batchId=str(body.batchId,64);if(!/^[a-f0-9-]{36}$/i.test(batchId))return bad(c,'A stable batch ID is required.');
    const existing=await batch(c,batchId);if(existing)return existing.operation==='append'?c.json(existing):conflict(c);
    const result=await previewAppend(c,c.req.param('id'),body);if('error' in result)return bad(c,String(result.error));
    try{await c.env.DB.batch([c.env.DB.prepare("INSERT INTO subdivision_batches(id,subdivision_id,parent_project_id,parent_revision,template_snapshot_json,operation,template_id,template_revision,template_name,confirmed_contract,created_by) VALUES(?,?,?,?,?,'append',?,?,?,?,?)").bind(batchId,c.req.param('id'),result.parent.id,result.parent.revision,JSON.stringify(result.tasks),result.template.id,result.template.revision,result.template.name,Number(body.confirmContractSigned===true),actor(c)),...result.rows.map(r=>c.env.DB.prepare('INSERT INTO subdivision_batch_rows(batch_id,parcel_id,project_number,target_project_id,target_revision,task_ids_json) VALUES(?,?,?,?,?,?)').bind(batchId,r.parcelId,r.projectNumber,r.projectId,r.targetRevision,JSON.stringify(r.taskIds)))]);}catch{const retry=await batch(c,batchId);if(retry?.operation==='append')return c.json(retry);return conflict(c);}
    return c.json(await batch(c,batchId),201);
  });
  api.get('/subdivisions/:id/batches',async c=>{
    if(!readProject(c))return deny(c);
    const rows=await c.env.DB.prepare(`SELECT b.id,b.operation FROM subdivision_batches b WHERE b.subdivision_id=? AND (EXISTS(SELECT 1 FROM subdivision_batch_rows r WHERE r.batch_id=b.id AND r.status<>'created') OR b.id IN (SELECT id FROM subdivision_batches WHERE subdivision_id=? ORDER BY created_at DESC,id DESC LIMIT 10)) ORDER BY b.created_at DESC,b.id DESC LIMIT 100`).bind(c.req.param('id'),c.req.param('id')).all<{id:string;operation:'assign'|'append'}>();
    const ids=rows.results.map(row=>row.id),grouped=new Map(rows.results.map(row=>[row.id,{id:row.id,operation:row.operation,rows:[] as SubdivisionBatchRow[]}]));
    for(const part of chunks(ids)){const result=await c.env.DB.prepare(`SELECT * FROM subdivision_batch_rows WHERE batch_id IN (${part.map(()=>'?').join(',')}) ORDER BY rowid`).bind(...part).all<Row>();for(const row of result.results)grouped.get(String(row.batch_id))?.rows.push({parcelId:String(row.parcel_id),projectNumber:String(row.project_number),previousProjectId:row.previous_project_id?String(row.previous_project_id):null,status:row.status as SubdivisionBatchRow['status'],projectId:row.project_id?String(row.project_id):null,error:row.error?String(row.error):null,...(row.task_ids_json?{taskIds:json<string[]>(row.task_ids_json,[])}:{})});}
    return c.json([...grouped.values()]);
  });
  api.get('/subdivisions/batches/:batchId',async c=>{if(!readProject(c))return deny(c);const value=await batch(c,c.req.param('batchId'));return value?c.json(value):c.notFound()});
  api.post('/subdivisions/batches/:batchId/run',async c=>{
    if(!writeProject(c))return deny(c);
    const id=c.req.param('batchId'),header=await c.env.DB.prepare('SELECT * FROM subdivision_batches WHERE id=?').bind(id).first<Row>();if(!header)return c.notFound();
    const items=await c.env.DB.prepare("SELECT * FROM subdivision_batch_rows WHERE batch_id=? AND status IN ('pending','failed') ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END,attempt_count,rowid LIMIT 4").bind(id).all<Row>();
    for(const item of items.results){
      const parcelId=String(item.parcel_id),projectId=uid();
      try{
        const parent=await parentRow(c,String(header.subdivision_id),String(header.parent_project_id));if(!parent)throw new Error('Builder parent project is unavailable.');
        if(parent.revision!==header.parent_revision)throw new Error('Builder parent changed. Review a new batch for remaining lots.');
        if(header.operation==='append'){
          const targetId=String(item.target_project_id||'');
          const activeLot=await c.env.DB.prepare('SELECT a.project_id,p.project_number,p.revision,p.active,p.archived_at,p.contract_price_cents,p.stage FROM subdivision_assignments a JOIN projects p ON p.id=a.project_id WHERE a.parcel_id=? AND a.parent_project_id=? AND a.ended_at IS NULL').bind(parcelId,parent.id).first<Row>();
          if(!activeLot||String(activeLot.project_id)!==targetId||!activeLot.active||activeLot.archived_at)throw new Error('Lot assignment changed. Review a new batch.');
          if(activeLot.revision!==item.target_revision||activeLot.project_number!==item.project_number)throw new Error('Lot project changed. Review a new batch.');
          if(activeLot.stage==='active'&&!header.confirmed_contract)throw new Error('Signed contract confirmation is required.');
          const tasks=safeTasks(json(header.template_snapshot_json,[])),taskIds=json<string[]>(item.task_ids_json,[]);
          if(!tasks||tasks.length!==taskIds.length||new Set(taskIds).size!==taskIds.length||taskIds.some(id=>!/^[A-Z]{1,20}$/.test(id)))throw new Error('Batch template snapshot is invalid.');
          const existing=await c.env.DB.prepare('SELECT task_id,MAX(sequence) AS max_sequence FROM project_tasks WHERE project_id=? GROUP BY task_id').bind(targetId).all<{task_id:string;max_sequence:number}>();
          if(taskIds.some(id=>existing.results.some(task=>task.task_id===id)))throw new Error('Task letters changed. Review a new batch.');
          const amount=tasks.reduce((sum,task)=>sum+task.contractAmountCents,0);
          if(!Number.isSafeInteger(Number(activeLot.contract_price_cents)+amount))throw new Error('Project price would exceed the limit.');
          const sequence=Math.max(0,...existing.results.map(task=>Number(task.max_sequence)));
          const token=uid(),snapshot=tasks.map((task,index)=>({...task,taskId:taskIds[index]}));
          await c.env.DB.batch([
            c.env.DB.prepare('UPDATE projects SET contract_price_cents=contract_price_cents+?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?').bind(amount,actor(c),targetId,item.target_revision),guard(c,token),
            ...snapshot.map((task,index)=>c.env.DB.prepare('INSERT INTO project_tasks(id,project_id,task_id,sequence,task_name,short_description,is_under_contract,contract_amount_cents,bill_type) VALUES(?,?,?,?,?,?,?,?,?)').bind(uid(),targetId,task.taskId,sequence+index+1,task.taskName,task.shortDescription,Number(task.isUnderContract),task.contractAmountCents,task.billType)),
            c.env.DB.prepare('INSERT INTO subdivision_template_applications(id,batch_id,parcel_id,project_id,template_id,template_revision,template_name,tasks_json) VALUES(?,?,?,?,?,?,?,?)').bind(uid(),id,parcelId,targetId,header.template_id,header.template_revision,header.template_name,JSON.stringify(snapshot)),
            c.env.DB.prepare("UPDATE subdivision_batch_rows SET status='created',project_id=?,error=NULL WHERE batch_id=? AND parcel_id=? AND status IN ('pending','failed')").bind(targetId,id,parcelId),c.env.DB.prepare('DELETE FROM record_write_guards WHERE id=?').bind(token)
          ]);
          continue;
        }
        const parcel=await c.env.DB.prepare('SELECT * FROM subdivision_parcels WHERE id=? AND subdivision_id=?').bind(parcelId,header.subdivision_id).first<Row>();if(!parcel)throw new Error('Parcel is unavailable.');
        const expected=suffix(String(parent.project_number),String(parcel.block),String(parcel.label));if(expected!==item.project_number)throw new Error('Parent number or parcel label changed. Review a new batch.');
        const active=await c.env.DB.prepare('SELECT project_id FROM subdivision_assignments WHERE parcel_id=? AND ended_at IS NULL').bind(parcelId).first<{project_id:string}>();
        if(String(active?.project_id||'')!==String(item.previous_project_id||''))throw new Error('Builder assignment changed. Review a new batch.');
        if(await c.env.DB.prepare('SELECT id FROM projects WHERE project_number=?').bind(item.project_number).first())throw new Error('Project number already exists.');
        const tasks=safeTasks(json(header.template_snapshot_json,[]));if(!tasks)throw new Error('Batch phase snapshot is invalid.');
        if(parent.stage==='active' && !header.confirmed_contract)throw new Error('Signed contract confirmation is required.');
        const projectName=str(`${parent.name} - ${parcel.block?`Block ${parcel.block}, `:''}${parcel.parcel_type} ${parcel.label}`,200);
        const address=json<Record<string,unknown>>(parent.address_json,{});if(parcel.street_address)address.line1=String(parcel.street_address);if(parcel.parcel_id)address.parcelId=String(parcel.parcel_id);
        const contractPrice=tasks.reduce((n,t)=>n+t.contractAmountCents,0);if(!Number.isSafeInteger(contractPrice))throw new Error('The combined phase prices are too large.');
        const statements:D1PreparedStatement[]=[];
        if(active)statements.push(c.env.DB.prepare('UPDATE subdivision_assignments SET ended_at=CURRENT_TIMESTAMP WHERE parcel_id=? AND ended_at IS NULL AND project_id=?').bind(parcelId,active.project_id),c.env.DB.prepare('UPDATE projects SET active=0,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(active.project_id));
        statements.push(c.env.DB.prepare(`INSERT INTO projects(id,project_number,client_id,name,description,manager_user_id,contact_id,start_date,due_date,stage,active,address_json,contract_price_cents,budget_cents,pay_table_id,po_number,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(projectId,item.project_number,parent.client_id,projectName,parent.description,parent.manager_user_id,parent.contact_id,parent.start_date,parent.due_date,parent.stage,parent.active,JSON.stringify(address),contractPrice,0,parent.pay_table_id,parent.po_number,actor(c),actor(c)));
        for(const [index,task] of tasks.entries())statements.push(c.env.DB.prepare('INSERT INTO project_tasks(id,project_id,task_id,sequence,task_name,short_description,is_under_contract,contract_amount_cents,bill_type) VALUES(?,?,?,?,?,?,?,?,?)').bind(uid(),projectId,task.taskId,index+1,task.taskName,task.shortDescription,Number(task.isUnderContract),task.contractAmountCents,task.billType));
        statements.push(c.env.DB.prepare('INSERT INTO subdivision_assignments(id,parcel_id,parent_project_id,project_id) VALUES(?,?,?,?)').bind(uid(),parcelId,parent.id,projectId));
        if(header.template_id)statements.push(c.env.DB.prepare('INSERT INTO subdivision_template_applications(id,batch_id,parcel_id,project_id,template_id,template_revision,template_name,tasks_json) VALUES(?,?,?,?,?,?,?,?)').bind(uid(),id,parcelId,projectId,header.template_id,header.template_revision,header.template_name,JSON.stringify(tasks)));
        statements.push(c.env.DB.prepare("UPDATE subdivision_batch_rows SET status='created',project_id=?,error=NULL WHERE batch_id=? AND parcel_id=? AND status IN ('pending','failed')").bind(projectId,id,parcelId));
        await c.env.DB.batch(statements);
        const row=await c.env.DB.prepare('SELECT * FROM projects WHERE id=?').bind(projectId).first<Row>();
        await qboSave(c,'projects',row!,String(parent.qbo_customer_id||''));
      }catch(error){await c.env.DB.prepare("UPDATE subdivision_batch_rows SET status='failed',attempt_count=attempt_count+1,error=? WHERE batch_id=? AND parcel_id=? AND status<>'created'").bind(String(error instanceof Error?error.message:error).slice(0,500),id,parcelId).run();}
    }
    return c.json(await batch(c,id));
  });
  return api;
}

export function createSubdivisionTemplateApi(){
  const api=new Hono<HonoEnv>();
  api.get('/subdivision-templates',async c=>{
    const rows=await c.env.DB.prepare('SELECT * FROM subdivision_phase_templates WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE').all<Row>();
    return c.json(rows.results.map(r=>({id:String(r.id),name:String(r.name),revision:Number(r.revision),tasks:json(r.tasks_json,[])} satisfies PhaseTemplate)));
  });
  api.post('/subdivision-templates',async c=>{
    const body=await c.req.json<Record<string,unknown>>().catch(()=>null),name=str(body?.name,100),tasks=safeTasks(body?.tasks);
    if(!name||!tasks||!tasks.length)return bad(c,'Name and at least one valid phase are required.');
    const id=uid();try{await c.env.DB.prepare('INSERT INTO subdivision_phase_templates(id,name,tasks_json) VALUES(?,?,?)').bind(id,name,JSON.stringify(tasks)).run();}catch{return c.json({error:'A phase template with this name already exists.'},409);}
    return c.json({id,name,revision:1,tasks} satisfies PhaseTemplate,201);
  });
  api.put('/subdivision-templates/:id',async c=>{
    const body=await c.req.json<Record<string,unknown>>().catch(()=>null),name=str(body?.name,100),tasks=safeTasks(body?.tasks);
    if(!name||!tasks||!tasks.length)return bad(c,'Name and at least one valid phase are required.');
    const result=await c.env.DB.prepare('UPDATE subdivision_phase_templates SET name=?,tasks_json=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND archived_at IS NULL').bind(name,JSON.stringify(tasks),c.req.param('id'),body?.revision).run();
    if(!result.meta.changes)return conflict(c);return c.json({id:c.req.param('id'),name,revision:Number(body?.revision)+1,tasks} satisfies PhaseTemplate);
  });
  return api;
}
