import { Hono } from 'hono';
import type { Project, ProjectContact, ProjectInput, ProjectStage, RecordTask } from '@whitepoint/types';
import { businessDate, formatNumber, nextNumber } from '../services/numbering';
import { projectTimeEntries } from './projectTimeEntries';
import { validatePoPdf } from '@whitepoint/utils/invoice-pdf';
import type { HonoEnv } from '../types/apiTypes';
import { actor, audit, auditInsert, bad, bool, conflict, deny, guard, isEligibleProjectManager, json, money, permitted, qboSave, str, uid, type C, type Row } from './recordSupport';

const stageValues: ProjectStage[] = ['opportunity','proposal','shortlisted','negotiating','withdrawn','active','completed','holdExternal','holdInternal','cancelled'];
const taskBillTypes = ['fixed-fee','time-and-materials','time-and-materials-nte','direct-expense','non-billable'];
const contactRoles = ['busDevManager','clientBillingPoc','clientStakeholder','externalStakeholder'];

async function projectDetail(c: C, id: string): Promise<Project | null> {
  const row = await c.env.DB.prepare('SELECT p.*,c.name AS client_name FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.id=?').bind(id).first<Row>();
  if (!row) return null;
  const [roles, tasks, invoices, timeCosts, poDocuments] = await Promise.all([
    c.env.DB.prepare('SELECT role,user_id,contact_id FROM project_contacts WHERE project_id=?').bind(id).all<Row>(),
    c.env.DB.prepare('SELECT * FROM project_tasks WHERE project_id=? AND archived_at IS NULL ORDER BY sequence').bind(id).all<Row>(),
    c.env.DB.prepare(`SELECT i.id,i.invoice_number,i.due_date,i.status,COALESCE((SELECT SUM(amount_cents) FROM invoice_lines WHERE invoice_id=i.id),0) AS amount_cents,COALESCE((SELECT SUM(MAX(0,amount_cents-refunded_cents-disputed_cents)) FROM invoice_payments WHERE invoice_id=i.id AND status='succeeded'),0) AS paid_cents FROM invoices i WHERE i.project_id=? ORDER BY i.due_date DESC`).bind(id).all<Row>(),
    c.env.DB.prepare("SELECT COALESCE(SUM(e.cost_cents),0) AS total,COALESCE(SUM(e.charge_cents),0) AS charged FROM user_timesheet_entries e JOIN user_timesheets w ON w.id=e.timesheet_id WHERE e.project_id=? AND w.status='approved'").bind(id).first<{total:number;charged:number}>(),
    c.env.DB.prepare('SELECT id,name,size_bytes,created_at FROM project_po_documents WHERE project_id=? AND archived_at IS NULL ORDER BY created_at,id').bind(id).all<Row>(),
  ]);
  const pm = String(row.manager_user_id || '');
  const edit = !row.archived_at && (permitted(c,'projects.manage') || actor(c) === pm);
  const status = !row.archived_at && (permitted(c,'projects.manage.status') || actor(c) === pm);
  const financials = permitted(c,'projects.view.financials');
  const contacts: ProjectContact[] = [
    { role:'projectManager', userId:pm || null, contactId:null },
    { role:'clientPoc', userId:null, contactId:String(row.contact_id || '') || null },
    ...(roles.results || []).map(r => ({ role:r.role as ProjectContact['role'], userId:r.user_id ? String(r.user_id) : null, contactId:r.contact_id ? String(r.contact_id) : null })),
  ];
  const recordTasks: RecordTask[] = (tasks.results || []).map(r => ({ id:String(r.id), taskId:String(r.task_id), sequence:Number(r.sequence), taskName:String(r.task_name), shortDescription:String(r.short_description), longDescription:json(r.long_description_json, []), taskManagerId:r.task_manager_id ? String(r.task_manager_id) : null, dueDate:r.due_date ? String(r.due_date) : null, status:r.status as RecordTask['status'], isUnderContract:bool(r.is_under_contract), isCompleted:bool(r.is_completed), contractAmountCents:financials ? Number(r.contract_amount_cents) : 0, billType:r.bill_type as RecordTask['billType'], billNotes:financials ? String(r.bill_notes) : '' }));
  const invoicesValue = financials ? (invoices.results || []).map(r => ({ id:String(r.id), invoiceNumber:String(r.invoice_number), amountCents:Number(r.amount_cents), paidCents:Number(r.paid_cents), dueDate:r.due_date ? String(r.due_date) : null, status:r.status==='draft'?'draft':r.status==='paid'?'paid':r.status==='void'?'void':String(r.due_date)<new Date().toISOString().slice(0,10)?'overdue':'unpaid' as Project['accounting']['invoices'][number]['status'] })) : [];
  const budget = financials ? Number(row.budget_cents) : 0, actual = financials ? Number(timeCosts?.total||0) : 0;
  return { id, projectNumber:String(row.project_number), clientId:String(row.client_id), clientName:String(row.client_name), name:String(row.name), description:String(row.description), managerUserId:pm || null, startDate:row.start_date ? String(row.start_date) : null, dueDate:row.due_date ? String(row.due_date) : null, qboCustomerId:row.qbo_customer_id ? String(row.qbo_customer_id) : null, qboSyncStatus:row.qbo_sync_status as Project['qboSyncStatus'], qboSyncError:row.qbo_sync_error ? String(row.qbo_sync_error) : null, revision:Number(row.revision), createdAt:String(row.created_at), updatedAt:String(row.updated_at), stage:row.stage as ProjectStage, active:bool(row.active), contactId:String(row.contact_id || ''), address:json(row.address_json,{line1:'',city:'',state:'',postalCode:'',county:'',parcelId:'',isUnincorporated:false,latitude:null,longitude:null}), contacts, payTableId:row.pay_table_id ? String(row.pay_table_id) : null, poNumber:String(row.po_number||''),poDocuments:(poDocuments.results||[]).map(x=>({id:String(x.id),name:String(x.name),sizeBytes:Number(x.size_bytes),createdAt:String(x.created_at)})), tasks:recordTasks, accounting:{contractPriceCents:financials ? Number(row.contract_price_cents) : 0,budgetCents:budget,actualCostCents:actual,timeChargeCents:financials ? Number(timeCosts?.charged||0) : 0,remainingBudgetCents:budget-actual,invoices:invoicesValue}, archivedAt:row.archived_at ? String(row.archived_at) : null, capabilities:{edit,status,financials:permitted(c,'projects.manage.financials'),archive:permitted(c,'projects.manage')} };
}

function taskLetters(index:number){let n=index,result='';do{result=String.fromCharCode(65+(n-1)%26)+result;n=Math.floor((n-1)/26);}while(n>0);return result;}
async function projectSave(c:C, existingId?:string){
  const body=await c.req.json<ProjectInput & {revision?:number}>().catch(()=>null);
  if(!body)return bad(c,'Expected project JSON.');
  const old=existingId?await c.env.DB.prepare('SELECT * FROM projects WHERE id=? AND archived_at IS NULL').bind(existingId).first<Row>():null;
  if(existingId&&!old)return c.json({error:'Project not found.'},404);
  const isPm=old&&String(old.manager_user_id)===actor(c);
  const mayEdit=permitted(c,'projects.manage')||isPm;
  const mayStatus=permitted(c,'projects.manage.status')||isPm;
  const mayMoney=permitted(c,'projects.manage.financials');
  if(old&&!mayEdit)return deny(c);
  if(old&&Number(body.revision)!==Number(old.revision))return conflict(c);
  const name=str(body.name,200),description=str(body.description,4000),clientId=str(body.clientId,64),managerId=str(body.managerUserId,64),contactId=str(body.contactId,64);
  if(!name||!description||!clientId||!managerId||!contactId)return bad(c,'Name, scope, client, project manager, and point of contact are required.');
  const stage:ProjectStage=old?(body.stage||old.stage as ProjectStage):'opportunity';
  if(!stageValues.includes(stage))return bad(c,'Project stage is invalid.');
  if(old&&stage!==old.stage&&!mayStatus)return deny(c);
  if(old&&body.active!==undefined&&bool(body.active)!==bool(old.active)&&!mayStatus)return deny(c);
  if(stage==='active'&&old?.stage!=='active'&&body.confirmContractSigned!==true)return bad(c,'Confirm that the contract has been signed before activation.');
  const client=await c.env.DB.prepare("SELECT id,qbo_customer_id FROM clients WHERE id=? AND archived_at IS NULL AND status='active'").bind(clientId).first<Row>();
  if(!client)return bad(c,'Select an active client.');
  if(!await isEligibleProjectManager(c.env.DB,managerId))return bad(c,'Select an active user with project manager assignment permission.');
  const poc=await c.env.DB.prepare('SELECT id FROM contacts WHERE id=? AND client_id=? AND is_poc=1 AND archived_at IS NULL').bind(contactId,clientId).first();
  if(!poc)return bad(c,'Select a point of contact belonging to the client.');
  const address={line1:str(body.address?.line1,200),city:str(body.address?.city,100),state:str(body.address?.state,100),postalCode:str(body.address?.postalCode,30),county:str(body.address?.county,100),parcelId:str(body.address?.parcelId,100),isUnincorporated:bool(body.address?.isUnincorporated),latitude:body.address?.latitude??null,longitude:body.address?.longitude??null};
  if(address.latitude!==null&&(!Number.isFinite(address.latitude)||address.latitude < -90||address.latitude > 90))return bad(c,'Latitude is invalid.');
  if(address.longitude!==null&&(!Number.isFinite(address.longitude)||address.longitude < -180||address.longitude > 180))return bad(c,'Longitude is invalid.');
  const roles=(body.contacts||[]).filter(role=>contactRoles.includes(role.role));
  if(roles.length!==(body.contacts||[]).filter(role=>role.role!=='projectManager'&&role.role!=='clientPoc').length)return bad(c,'Project contact role is invalid.');
  for(const role of roles){
    if(role.role==='busDevManager'){
      if(!role.userId||role.contactId||!(await c.env.DB.prepare("SELECT id FROM users WHERE id=? AND active=1 AND user_type='internal' AND archived_at IS NULL").bind(role.userId).first()))return bad(c,'Business development manager is invalid.');
    }else if(!role.contactId||role.userId||!(await c.env.DB.prepare('SELECT id FROM contacts WHERE id=? AND client_id=? AND archived_at IS NULL').bind(role.contactId,clientId).first()))return bad(c,'Project contact must belong to the client.');
  }
  const taskInputs=body.tasks||[];
  if(!Array.isArray(taskInputs))return bad(c,'Tasks are invalid.');
  const oldTasks=old?(await c.env.DB.prepare('SELECT * FROM project_tasks WHERE project_id=? AND archived_at IS NULL').bind(existingId).all<Row>()).results:[];
  const oldTaskIds=new Set(oldTasks.map(x=>String(x.id)));
  const tasks=taskInputs.map((raw,index)=>({id:str(raw.id,64)||uid(),taskId:str(raw.taskId,20).toUpperCase()||taskLetters(index+1),sequence:index+1,taskName:str(raw.taskName,200),shortDescription:str(raw.shortDescription,500),longDescription:Array.isArray(raw.longDescription)?raw.longDescription.map(x=>({type:'text' as const,content:str(x.content,4000)})):[],taskManagerId:str(raw.taskManagerId,64)||null,dueDate:str(raw.dueDate,10)||null,status:raw.status==='inactive'?'inactive' as const:'active' as const,isUnderContract:bool(raw.isUnderContract),isCompleted:bool(raw.isCompleted),contractAmountCents:money(raw.contractAmountCents),billType:str(raw.billType,40)||'fixed-fee',billNotes:str(raw.billNotes,1000)}));
  if(tasks.some(x=>!x.taskName||!/^[A-Z]{1,20}$/.test(x.taskId)||x.contractAmountCents===null||!taskBillTypes.includes(x.billType))||new Set(tasks.map(x=>x.taskId)).size!==tasks.length||new Set(tasks.map(x=>x.id)).size!==tasks.length)return bad(c,'Complete each task with a unique letter ID.');
  for(const task of tasks){if(task.taskManagerId&&!(await c.env.DB.prepare("SELECT id FROM users WHERE id=? AND active=1 AND user_type='internal' AND archived_at IS NULL").bind(task.taskManagerId).first()))return bad(c,'Task manager is invalid.');const previous=oldTasks.find(x=>x.id===task.id);if(previous&&previous.task_id!==task.taskId)return bad(c,'An existing task letter cannot be changed.');if(old&&!oldTaskIds.has(task.id)){const used=await c.env.DB.prepare('SELECT id FROM project_tasks WHERE id=?').bind(task.id).first();if(used)return bad(c,'Task ID is invalid.');}}
  if(!mayMoney)for(const task of tasks){const previous=oldTasks.find(x=>x.id===task.id);task.contractAmountCents=Number(previous?.contract_amount_cents||0);task.billNotes=String(previous?.bill_notes||'');}
  const contractPrice=mayMoney?money(body.contractPriceCents??0):Number(old?.contract_price_cents||0),budget=mayMoney?money(body.budgetCents??0):Number(old?.budget_cents||0);
  let payTableId=old?.pay_table_id ? String(old.pay_table_id) : null;
  if(mayMoney && body.payTableId!==undefined)payTableId=body.payTableId || null;
  const businessToday=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(!old && !payTableId){const defaultTable=await c.env.DB.prepare('SELECT id FROM pay_tables WHERE is_default=1 AND active=1 AND (expires_on IS NULL OR expires_on>=?)').bind(businessToday).first<{id:string}>();payTableId=defaultTable?.id||null;}
  if(payTableId && !(await c.env.DB.prepare('SELECT id FROM pay_tables WHERE id=? AND active=1 AND (expires_on IS NULL OR expires_on>=?)').bind(payTableId,businessToday).first()))return bad(c,'Select an active, unexpired pay table.');
  if(contractPrice===null||budget===null)return bad(c,'Financial amounts must be nonnegative whole cents.');
  const numberOverride=str(body.projectNumber,40),moved=Boolean(old&&String(old.client_id)!==clientId);
  const settings=await c.env.DB.prepare('SELECT * FROM app_settings WHERE id=1').first<Row>();
  if(!settings)return c.json({error:'Project numbering is not configured.'},503);
  const projectId=existingId||uid();
  for(let attempt=0;attempt<(old||numberOverride?1:100);attempt++){
    const projectNumber=old?numberOverride||String(old.project_number):numberOverride||await nextNumber(c.env.DB,'project',{invoiceNumberTemplate:'',projectNumberTemplate:String(settings.project_number_template),clientNumberTemplate:'',invoiceResetYearly:false,projectResetYearly:bool(settings.project_reset_yearly),clientResetYearly:false});
    if(projectNumber!==old?.project_number){const taken=await c.env.DB.prepare('SELECT id FROM projects WHERE project_number=?').bind(projectNumber).first();if(taken){if(old||numberOverride)return c.json({error:'Project number is already in use.'},409);continue;}}
    const active=body.active===undefined?!['withdrawn','completed','cancelled'].includes(stage):bool(body.active);
    const statements:D1PreparedStatement[]=[];
    const guardId=uid();
    if(old){statements.push(c.env.DB.prepare('UPDATE projects SET project_number=?,client_id=?,name=?,stage=?,active=?,description=?,manager_user_id=?,contact_id=?,start_date=?,due_date=?,address_json=?,contract_price_cents=?,budget_cents=?,po_number=?,qbo_customer_id=?,qbo_sync_token=?,qbo_sync_status=?,qbo_sync_error=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND archived_at IS NULL').bind(projectNumber,clientId,name,stage,Number(active),description,managerId,contactId,str(body.startDate,10)||null,str(body.dueDate,10)||null,JSON.stringify(address),contractPrice,budget,str(body.poNumber,100),moved?null:old.qbo_customer_id,moved?null:old.qbo_sync_token,moved?'pending':old.qbo_sync_status,moved?null:old.qbo_sync_error,actor(c),projectId,body.revision));statements.push(guard(c,guardId));}
    else statements.push(c.env.DB.prepare('INSERT INTO projects(id,project_number,client_id,name,stage,active,description,manager_user_id,contact_id,start_date,due_date,address_json,contract_price_cents,budget_cents,po_number,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(projectId,projectNumber,clientId,name,stage,Number(active),description,managerId,contactId,str(body.startDate,10)||null,str(body.dueDate,10)||null,JSON.stringify(address),contractPrice,budget,str(body.poNumber,100),actor(c),actor(c)));
    statements.push(c.env.DB.prepare('UPDATE projects SET pay_table_id=? WHERE id=?').bind(payTableId,projectId));
    if(moved&&old?.qbo_customer_id)statements.push(c.env.DB.prepare('INSERT INTO project_qbo_history(id,project_id,client_id,qbo_customer_id,qbo_sync_token,moved_by) VALUES(?,?,?,?,?,?)').bind(uid(),projectId,old.client_id,old.qbo_customer_id,old.qbo_sync_token,actor(c)));
    if(old)statements.push(c.env.DB.prepare('DELETE FROM project_contacts WHERE project_id=?').bind(projectId));
    for(const role of roles)statements.push(c.env.DB.prepare('INSERT INTO project_contacts(project_id,role,user_id,contact_id) VALUES(?,?,?,?)').bind(projectId,role.role,role.userId,role.contactId));
    for(const task of oldTasks.filter(x=>!tasks.some(t=>t.id===x.id)))statements.push(c.env.DB.prepare('UPDATE project_tasks SET archived_at=CURRENT_TIMESTAMP,status=\'inactive\' WHERE id=? AND project_id=?').bind(task.id,projectId));
    for(const task of tasks)statements.push(c.env.DB.prepare('INSERT INTO project_tasks(id,project_id,task_id,sequence,task_name,short_description,long_description_json,task_manager_id,due_date,status,is_under_contract,is_completed,contract_amount_cents,bill_type,bill_notes,archived_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET task_id=excluded.task_id,sequence=excluded.sequence,task_name=excluded.task_name,short_description=excluded.short_description,long_description_json=excluded.long_description_json,task_manager_id=excluded.task_manager_id,due_date=excluded.due_date,status=excluded.status,is_under_contract=excluded.is_under_contract,is_completed=excluded.is_completed,contract_amount_cents=excluded.contract_amount_cents,bill_type=excluded.bill_type,bill_notes=excluded.bill_notes,archived_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE project_id=excluded.project_id').bind(task.id,projectId,task.taskId,task.sequence,task.taskName,task.shortDescription,JSON.stringify(task.longDescription),task.taskManagerId,task.dueDate,task.status,Number(task.isUnderContract),Number(task.isCompleted),task.contractAmountCents,task.billType,task.billNotes));
    statements.push(auditInsert(c,'project',projectId,old?'updated':'created',old,{projectNumber,name,stage,clientId,managerId,contactId,tasks:tasks.length}));
    if(old)statements.push(c.env.DB.prepare('DELETE FROM record_write_guards WHERE id=?').bind(guardId));
    try{await c.env.DB.batch(statements);}catch(error){if(old)return conflict(c);if(attempt===99||numberOverride)throw error;const taken=await c.env.DB.prepare('SELECT id FROM projects WHERE project_number=?').bind(projectNumber).first();if(!taken)throw error;continue;}
    const row=await c.env.DB.prepare('SELECT * FROM projects WHERE id=?').bind(projectId).first<Row>();
    await qboSave(c,'projects',row!,String(client.qbo_customer_id||''));
    return c.json(await projectDetail(c,projectId),old?200:201);
  }
  return c.json({error:'Could not allocate a unique project number.'},409);
}

export function createProjectApi() {
  const api = new Hono<HonoEnv>();
  api.post('/projects', c => projectSave(c));
  api.put('/projects/:id', c => projectSave(c,c.req.param('id')));
  api.get('/projects/next-number', async c => { const row=await c.env.DB.prepare('SELECT project_number_template,project_reset_yearly FROM app_settings WHERE id=1').first<Row>(); if(!row)return c.json({error:'Project numbering is not configured.'},503); const seq=await c.env.DB.prepare('SELECT last_value FROM number_sequences WHERE kind=? AND period=?').bind('project',bool(row.project_reset_yearly)?businessDate().year:'all').first<{last_value:number}>(); return c.json({nextProjectNumber:formatNumber(String(row.project_number_template),(seq?.last_value||0)+1)}); });
  api.get('/projects/:id/time-entries', projectTimeEntries);
  api.get('/projects/:id', async c => { const value=await projectDetail(c,c.req.param('id')); return value ? c.json(value) : c.json({error:'Project not found.'},404); });
  api.post('/projects/:id/po-documents', async c => {
    const projectId=c.req.param('id');
    const project=await c.env.DB.prepare('SELECT manager_user_id FROM projects WHERE id=? AND archived_at IS NULL').bind(projectId).first<{manager_user_id:string|null}>();
    if(!project)return c.json({error:'Project not found.'},404);
    if(!permitted(c,'projects.manage')&&project.manager_user_id!==actor(c))return deny(c);
    const form=await c.req.formData();const file=form.get('file');
    if(!(file instanceof File)||file.type!=='application/pdf'||file.size<1||file.size>15_000_000)return bad(c,'Choose a PDF under 15 MB.');
    const bytes=new Uint8Array(await file.arrayBuffer());
    const header=bytes.subarray(0,5);
    if(new TextDecoder().decode(header)!=='%PDF-')return bad(c,'The file is not a PDF.');
    try{await validatePoPdf(bytes)}catch{return bad(c,'The PO PDF could not be read.');}
    const id=uid(),key=`projects/${projectId}/po/${id}`;
    await c.env.RECORD_DOCUMENTS.put(key,bytes,{httpMetadata:{contentType:'application/pdf'}});
    try{await c.env.DB.batch([c.env.DB.prepare('INSERT INTO project_po_documents(id,project_id,name,size_bytes,r2_key) VALUES(?,?,?,?,?)').bind(id,projectId,str(file.name,255),file.size,key),auditInsert(c,'project',projectId,'po-document-added',null,{documentId:id,name:str(file.name,255)})])}
    catch(error){await c.env.RECORD_DOCUMENTS.delete(key);throw error}
    return c.json({id,name:file.name},201);
  });
  api.delete('/projects/:id/po-documents/:documentId', async c => {
    const projectId=c.req.param('id');const project=await c.env.DB.prepare('SELECT manager_user_id FROM projects WHERE id=? AND archived_at IS NULL').bind(projectId).first<{manager_user_id:string|null}>();
    if(!project)return c.json({error:'Project not found.'},404);
    if(!permitted(c,'projects.manage')&&project.manager_user_id!==actor(c))return deny(c);
    const document=await c.env.DB.prepare('SELECT id,name FROM project_po_documents WHERE id=? AND project_id=? AND archived_at IS NULL').bind(c.req.param('documentId'),projectId).first<{id:string;name:string}>();
    if(!document)return c.notFound();
    await c.env.DB.batch([c.env.DB.prepare('UPDATE project_po_documents SET archived_at=CURRENT_TIMESTAMP WHERE id=? AND project_id=?').bind(document.id,projectId),auditInsert(c,'project',projectId,'po-document-archived',document,null)]);
    return c.json({deleted:true});
  });
  api.put('/projects/:id/stage', async c => {
    const id=c.req.param('id'),body=await c.req.json<{stage:ProjectStage;revision:number;active:boolean;confirmContractSigned?:boolean}>().catch(()=>null);
    if(!body||!stageValues.includes(body.stage)||!Number.isInteger(body.revision)||typeof body.active!=='boolean')return bad(c,'Stage, active state, and revision are required.');
    const old=await c.env.DB.prepare('SELECT * FROM projects WHERE id=? AND archived_at IS NULL').bind(id).first<Row>();
    if(!old)return c.notFound();
    if(!permitted(c,'projects.manage.status')&&String(old.manager_user_id)!==actor(c))return deny(c);
    if(Number(old.revision)!==body.revision)return conflict(c);
    if(body.stage==='active'&&old.stage!=='active'&&body.confirmContractSigned!==true)return bad(c,'Confirm the signed contract.');
    const guardId=uid();
    try{await c.env.DB.batch([c.env.DB.prepare('UPDATE projects SET stage=?,active=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND archived_at IS NULL').bind(body.stage,Number(body.active),actor(c),id,body.revision),guard(c,guardId),auditInsert(c,'project',id,'stage-changed',old,{stage:body.stage,active:body.active}),c.env.DB.prepare('DELETE FROM record_write_guards WHERE id=?').bind(guardId)]);}catch{return conflict(c);}
    const row=await c.env.DB.prepare('SELECT * FROM projects WHERE id=?').bind(id).first<Row>();const client=await c.env.DB.prepare('SELECT qbo_customer_id FROM clients WHERE id=?').bind(row!.client_id).first<Row>();await qboSave(c,'projects',row!,String(client?.qbo_customer_id||''));return c.json(await projectDetail(c,id));
  });
  api.get('/projects/:id/audit', async c => {const rows=await audit(c,'project',c.req.param('id'));return c.json(permitted(c,'projects.view.financials')?rows:rows.map(({id,actor_id,action,created_at})=>({id,actor_id,action,created_at})));});
  api.post('/projects/:id/archive', async c => {
    if(!permitted(c,'projects.manage'))return deny(c);
    const id=c.req.param('id'),row=await c.env.DB.prepare('SELECT * FROM projects WHERE id=? AND archived_at IS NULL').bind(id).first<Row>();
    if(!row)return c.notFound();
    await c.env.DB.batch([c.env.DB.prepare('UPDATE projects SET archived_at=CURRENT_TIMESTAMP,active=0,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND archived_at IS NULL').bind(actor(c),id),auditInsert(c,'project',id,'archived',row,{archived:true})]);
    const archived=await c.env.DB.prepare('SELECT * FROM projects WHERE id=?').bind(id).first<Row>();
    const parent=await c.env.DB.prepare('SELECT qbo_customer_id FROM clients WHERE id=?').bind(row.client_id).first<Row>();
    await qboSave(c,'projects',archived!,String(parent?.qbo_customer_id||''));
    return c.json(await projectDetail(c,id));
  });
  api.post('/projects/:id/qbo/retry', async c => {
    if(!permitted(c,'company.qbo.resync'))return deny(c);
    const row=await c.env.DB.prepare('SELECT * FROM projects WHERE id=? AND archived_at IS NULL').bind(c.req.param('id')).first<Row>();
    if(!row)return c.notFound();
    const parent=await c.env.DB.prepare('SELECT qbo_customer_id FROM clients WHERE id=?').bind(row.client_id).first<Row>();
    return c.json(await qboSave(c,'projects',row,String(parent?.qbo_customer_id||'')));
  });
  return api;
}
