import { Hono } from 'hono';
import type { Client, ClientInput, Contact } from '@whitepoint/types';
import { nextNumber } from '../services/numbering';
import type { HonoEnv } from '../types/apiTypes';
import { actor, audit, auditInsert, bad, bool, conflict, deny, emailOk, guard, json, permitted, qboSave, str, uid, type C, type Row } from './recordSupport';

async function clientDetail(c: C, id: string): Promise<Client | null> {
  const row = await c.env.DB.prepare('SELECT * FROM clients WHERE id=?').bind(id).first<Row>();
  if (!row) return null;
  const [a, ct, d] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM client_addresses WHERE client_id=? AND archived_at IS NULL ORDER BY is_primary_mailing_address DESC,created_at').bind(id).all<Row>(),
    c.env.DB.prepare('SELECT * FROM contacts WHERE client_id=? AND archived_at IS NULL ORDER BY name COLLATE NOCASE').bind(id).all<Row>(),
    c.env.DB.prepare('SELECT * FROM client_documents WHERE client_id=? AND archived_at IS NULL ORDER BY created_at DESC').bind(id).all<Row>(),
  ]);
  const addresses = (a.results || []).map(r => ({ id: String(r.id), label: String(r.label), isPrimaryMailingAddress: bool(r.is_primary_mailing_address), line1: String(r.line1), line2: String(r.line2), city: String(r.city), state: String(r.state), postalCode: String(r.postal_code) }));
  const contacts: Contact[] = (ct.results || []).map(r => ({ id: String(r.id), clientId: id, name: String(r.name), email: String(r.email), phone: String(r.phone), role: String(r.role), invoiceRecipient: bool(r.invoice_recipient), createdAt: String(r.created_at), updatedAt: String(r.updated_at), prefix: String(r.prefix), firstName: String(r.first_name), middleName: String(r.middle_name), lastName: String(r.last_name), suffix: String(r.suffix), clientAddressId: r.client_address_id ? String(r.client_address_id) : null, isPoc: bool(r.is_poc), isBillingPoc: bool(r.is_billing_poc), isExecutivePoc: bool(r.is_executive_poc), metadata: json(r.metadata_json, { title:'', department:'', reportsTo:'', notes:'' }) }));
  const edit = !row.archived_at && permitted(c, 'clients.manage.basic');
  return { id, clientNumber: String(row.client_number || ''), name: String(row.name), status: row.status as Client['status'], email: String(row.email), phone: String(row.phone), billingAddress: json(row.billing_address_json, { line1:'',line2:'',city:'',state:'',postalCode:'' }), qboCustomerId: row.qbo_customer_id ? String(row.qbo_customer_id) : null, qboSyncStatus: row.qbo_sync_status as Client['qboSyncStatus'], qboSyncError: row.qbo_sync_error ? String(row.qbo_sync_error) : null, createdAt: String(row.created_at), updatedAt: String(row.updated_at), addresses, contacts, documents: (d.results || []).map(r => ({ id:String(r.id), name:String(r.name), sizeBytes:Number(r.size_bytes), mimeType:String(r.mime_type), description:String(r.description), expiresAt:r.expires_at ? String(r.expires_at) : null, createdAt:String(r.created_at) })), metadata: json(row.metadata_json, { industry:'',size:'',public:false,notes:'' }), parentClientId: row.parent_client_id ? String(row.parent_client_id) : null, revision: Number(row.revision), archivedAt: row.archived_at ? String(row.archived_at) : null, capabilities: { edit, status: edit, financials:false, archive: edit } };
}

const fileTypes: Record<string,string> = { pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
async function safeFile(file: File) {
  const extension=file.name.split('.').pop()?.toLowerCase() || '';
  const expected=fileTypes[extension];
  if (!expected || file.type !== expected || file.size<1 || file.size>10*1024*1024) return false;
  const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const signature=(values:number[])=>values.every((value,index)=>bytes[index]===value);
  if(extension==='pdf')return signature([37,80,68,70]);
  if(extension==='png')return signature([137,80,78,71]);
  if(extension==='jpg'||extension==='jpeg')return signature([255,216,255]);
  if(extension==='webp')return signature([82,73,70,70])&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if(['docx','xlsx','pptx'].includes(extension))return signature([80,75]);
  return signature([208,207,17,224]);
}

async function clientSave(c:C, existingId?:string) {
  const form=await c.req.formData().catch(()=>null);
  if(!form)return bad(c,'Expected client form data.');
  const body=json<ClientInput>(form.get('record'),{} as ClientInput);
  if(!body || !Array.isArray(body.addresses) || !Array.isArray(body.contacts))return bad(c,'Addresses and contacts are required.');
  const old=existingId ? await c.env.DB.prepare('SELECT * FROM clients WHERE id=? AND archived_at IS NULL').bind(existingId).first<Row>() : null;
  if(existingId&&!old)return c.json({error:'Client not found.'},404);
  if(old&&!permitted(c,'clients.manage.basic'))return deny(c);
  if(old&&Number(body.revision)!==Number(old.revision))return conflict(c);
  const name=str(body.name,200),email=str(body.email,320).toLowerCase(),phone=str(body.phone,80);
  if(!name||!emailOk(email))return bad(c,'Enter a client name and a valid email.');
  const status=body.status||'active';
  if(!['active','inactive'].includes(status))return bad(c,'Client status is invalid.');
  if(!body.addresses.length||body.addresses.filter(a=>a.isPrimaryMailingAddress).length!==1)return bad(c,'A client needs one primary mailing address.');
  if(!body.contacts.some(x=>x.isPoc))return bad(c,'A client needs a point of contact.');
  const addresses=body.addresses.map(a=>({id:str(a.id,64)||uid(),label:str(a.label,100),isPrimaryMailingAddress:bool(a.isPrimaryMailingAddress),line1:str(a.line1,200),line2:str(a.line2,200),city:str(a.city,100),state:str(a.state,100),postalCode:str(a.postalCode,30)}));
  if(addresses.some(a=>!a.line1||!a.city||!a.state||!a.postalCode)||new Set(addresses.map(a=>a.id)).size!==addresses.length)return bad(c,'Complete each address.');
  const existingAddresses=old ? (await c.env.DB.prepare('SELECT id FROM client_addresses WHERE client_id=?').bind(existingId).all<{id:string}>()).results.map(x=>x.id) : [];
  for(const a of addresses){if(!existingAddresses.includes(a.id)&&await c.env.DB.prepare('SELECT id FROM client_addresses WHERE id=?').bind(a.id).first())return bad(c,'Address ID is invalid.');}
  const contacts=body.contacts.map(x=>({id:str(x.id,64)||uid(),prefix:str(x.prefix,30),firstName:str(x.firstName,100),middleName:str(x.middleName,100),lastName:str(x.lastName,100),suffix:str(x.suffix,30),email:str(x.email,320).toLowerCase(),phone:str(x.phone,80),role:str(x.role,100),clientAddressId:str(x.clientAddressId,64)||null,isPoc:bool(x.isPoc),isBillingPoc:bool(x.isBillingPoc),isExecutivePoc:bool(x.isExecutivePoc),metadata:{title:str(x.metadata?.title,100),department:str(x.metadata?.department,100),reportsTo:str(x.metadata?.reportsTo,100),notes:str(x.metadata?.notes,4000)}}));
  if(contacts.some(x=>!(x.firstName||x.lastName)||!emailOk(x.email)||x.clientAddressId&&!addresses.some(a=>a.id===x.clientAddressId))||new Set(contacts.map(x=>x.id)).size!==contacts.length)return bad(c,'Give each contact a name and a valid email if provided.');
  const existingContacts=old ? (await c.env.DB.prepare('SELECT id FROM contacts WHERE client_id=?').bind(existingId).all<{id:string}>()).results.map(x=>x.id) : [];
  for(const x of contacts){if(!existingContacts.includes(x.id)&&await c.env.DB.prepare('SELECT id FROM contacts WHERE id=?').bind(x.id).first())return bad(c,'Contact ID is invalid.');}
  const removedContacts=existingContacts.filter(id=>!contacts.some(x=>x.id===id));
  if(removedContacts.length){const placeholders=removedContacts.map(()=>'?').join(',');const refs=await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM projects WHERE archived_at IS NULL AND contact_id IN (${placeholders})`).bind(...removedContacts).first<{n:number}>();const roleRefs=await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM project_contacts pc JOIN projects p ON p.id=pc.project_id WHERE p.archived_at IS NULL AND pc.contact_id IN (${placeholders})`).bind(...removedContacts).first<{n:number}>();if(refs?.n||roleRefs?.n)return bad(c,'A project uses a contact being removed.');}
  const parentId=str(body.parentClientId,64)||null;
  if(parentId===existingId)return bad(c,'A client cannot be its own parent.');
  if(parentId){const parent=await c.env.DB.prepare('SELECT id FROM clients WHERE id=? AND archived_at IS NULL').bind(parentId).first<Row>();if(!parent)return bad(c,'Choose a valid parent client.');if(existingId){const cycle=await c.env.DB.prepare('WITH RECURSIVE chain(id,parent_client_id) AS (SELECT id,parent_client_id FROM clients WHERE id=? UNION SELECT c.id,c.parent_client_id FROM clients c JOIN chain p ON c.id=p.parent_client_id) SELECT 1 FROM chain WHERE id=? LIMIT 1').bind(parentId,existingId).first();if(cycle)return bad(c,'A client cannot be its own ancestor.');}}
  const metadata={industry:str(body.metadata?.industry,100),size:str(body.metadata?.size,100),public:bool(body.metadata?.public),notes:str(body.metadata?.notes,4000)};
  const docs=Array.isArray(body.documents)?body.documents:[];
  const existingDocs=old ? (await c.env.DB.prepare('SELECT * FROM client_documents WHERE client_id=?').bind(existingId).all<Row>()).results : [];
  const storedIds=new Set(existingDocs.map(x=>String(x.id)));
  const uploads:Array<{id:string;key:string;file:File}>=[];
  for(const d of docs){
    const docId=str(d.id,64);
    if(!docId||!str(d.name,255))return bad(c,'Document name is required.');
    const file=form.get(`file:${docId}`);
    if(file instanceof File){if(storedIds.has(docId)||!(await safeFile(file)))return bad(c,'Use a PDF, image, or Office file up to 10 MB.');uploads.push({id:docId,key:`clients/${existingId||'new'}/${uid()}`,file});}
    else if(!storedIds.has(docId))return bad(c,'A new document needs a file.');
  }
  if(uploads.length>5||uploads.reduce((sum,x)=>sum+x.file.size,0)>50*1024*1024)return bad(c,'Save no more than five files or 50 MB at once.');
  const clientId=existingId||uid(),primary=addresses.find(a=>a.isPrimaryMailingAddress)!;
  const settings=await c.env.DB.prepare('SELECT * FROM app_settings WHERE id=1').first<Row>();
  if(!settings)return c.json({error:'Numbering is not configured.'},503);
  const preparedUploads:string[]=[];
  let committed=false;
  try{
    for(const upload of uploads){upload.key=`clients/${clientId}/${uid()}`;await c.env.RECORD_DOCUMENTS.put(upload.key,upload.file.stream(),{httpMetadata:{contentType:upload.file.type}});preparedUploads.push(upload.key);}
    let saved=false;
    for(let attempt=0;attempt<(old?1:100);attempt++){
      const number=old?String(old.client_number):await nextNumber(c.env.DB,'client',{invoiceNumberTemplate:'',projectNumberTemplate:'',clientNumberTemplate:String(settings.client_number_template),invoiceResetYearly:false,projectResetYearly:false,clientResetYearly:bool(settings.client_reset_yearly)});
      const statements:D1PreparedStatement[]=[];
      const guardId=uid();
      if(old){statements.push(c.env.DB.prepare('UPDATE clients SET name=?,status=?,email=?,phone=?,billing_address_json=?,parent_client_id=?,metadata_json=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND archived_at IS NULL').bind(name,status,email,phone,JSON.stringify(primary),parentId,JSON.stringify(metadata),actor(c),clientId,body.revision));statements.push(guard(c,guardId));statements.push(c.env.DB.prepare('UPDATE client_addresses SET is_primary_mailing_address=0 WHERE client_id=? AND archived_at IS NULL').bind(clientId));}
      else statements.push(c.env.DB.prepare('INSERT INTO clients(id,client_number,name,status,email,phone,billing_address_json,parent_client_id,metadata_json,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(clientId,number,name,status,email,phone,JSON.stringify(primary),parentId,JSON.stringify(metadata),actor(c),actor(c)));
      for(const a of addresses)statements.push(c.env.DB.prepare('INSERT INTO client_addresses(id,client_id,label,is_primary_mailing_address,line1,line2,city,state,postal_code,archived_at) VALUES(?,?,?,?,?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET label=excluded.label,is_primary_mailing_address=excluded.is_primary_mailing_address,line1=excluded.line1,line2=excluded.line2,city=excluded.city,state=excluded.state,postal_code=excluded.postal_code,archived_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE client_id=excluded.client_id').bind(a.id,clientId,a.label,Number(a.isPrimaryMailingAddress),a.line1,a.line2,a.city,a.state,a.postalCode));
      if(old){const removed=existingAddresses.filter(id=>!addresses.some(a=>a.id===id));for(const id of removed)statements.push(c.env.DB.prepare('UPDATE client_addresses SET archived_at=CURRENT_TIMESTAMP WHERE id=? AND client_id=?').bind(id,clientId));}
      for(const x of contacts){const full=`${x.firstName} ${x.lastName}`;statements.push(c.env.DB.prepare('INSERT INTO contacts(id,client_id,name,email,phone,role,invoice_recipient,prefix,first_name,middle_name,last_name,suffix,client_address_id,is_poc,is_billing_poc,is_executive_poc,metadata_json,archived_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,phone=excluded.phone,role=excluded.role,invoice_recipient=excluded.invoice_recipient,prefix=excluded.prefix,first_name=excluded.first_name,middle_name=excluded.middle_name,last_name=excluded.last_name,suffix=excluded.suffix,client_address_id=excluded.client_address_id,is_poc=excluded.is_poc,is_billing_poc=excluded.is_billing_poc,is_executive_poc=excluded.is_executive_poc,metadata_json=excluded.metadata_json,archived_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE client_id=excluded.client_id').bind(x.id,clientId,full,x.email,x.phone,x.role,Number(x.isBillingPoc),x.prefix,x.firstName,x.middleName,x.lastName,x.suffix,x.clientAddressId,Number(x.isPoc),Number(x.isBillingPoc),Number(x.isExecutivePoc),JSON.stringify(x.metadata)));}
      for(const id of removedContacts)statements.push(c.env.DB.prepare('UPDATE contacts SET archived_at=CURRENT_TIMESTAMP WHERE id=? AND client_id=?').bind(id,clientId));
      for(const d of docs){const upload=uploads.find(x=>x.id===d.id);if(upload)statements.push(c.env.DB.prepare('INSERT INTO client_documents(id,client_id,name,size_bytes,mime_type,r2_key,description,expires_at) VALUES(?,?,?,?,?,?,?,?)').bind(d.id,clientId,str(d.name,255),upload.file.size,upload.file.type,upload.key,str(d.description,1000),str(d.expiresAt,10)||null));else statements.push(c.env.DB.prepare('UPDATE client_documents SET name=?,description=?,expires_at=?,archived_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND client_id=?').bind(str(d.name,255),str(d.description,1000),str(d.expiresAt,10)||null,d.id,clientId));}
      for(const d of existingDocs.filter(x=>!docs.some(v=>v.id===x.id)))statements.push(c.env.DB.prepare('UPDATE client_documents SET archived_at=CURRENT_TIMESTAMP WHERE id=? AND client_id=?').bind(d.id,clientId));
      statements.push(auditInsert(c,'client',clientId,old?'updated':'created',old,{name,number,contacts:contacts.length,addresses:addresses.length}));
      if(old)statements.push(c.env.DB.prepare('DELETE FROM record_write_guards WHERE id=?').bind(guardId));
      try{await c.env.DB.batch(statements);saved=true;committed=true;break;}catch(error){if(old){await Promise.all(preparedUploads.map(key=>c.env.RECORD_DOCUMENTS.delete(key)));return conflict(c);}if(attempt===99)throw error;const taken=await c.env.DB.prepare('SELECT id FROM clients WHERE client_number=?').bind(number).first();if(!taken)throw error;}
    }
    if(!saved){await Promise.all(preparedUploads.map(key=>c.env.RECORD_DOCUMENTS.delete(key)));return c.json({error:'Could not allocate a unique client number.'},409);}
    const row=await c.env.DB.prepare('SELECT * FROM clients WHERE id=?').bind(clientId).first<Row>();
    try { await qboSave(c,'clients',row!); } catch (error) { console.error('Client QBO status update failed:', error); }
    return c.json(await clientDetail(c,clientId),old?200:201);
  }catch(error){if(!committed)await Promise.all(preparedUploads.map(key=>c.env.RECORD_DOCUMENTS.delete(key)));throw error;}
}

export function createClientApi() {
  const api = new Hono<HonoEnv>();
  api.get('/clients', async c => c.json((await c.env.DB.prepare("SELECT c.id,c.client_number,c.name,c.status,c.email,c.phone,c.qbo_sync_status,c.qbo_sync_error,COALESCE((SELECT GROUP_CONCAT(ct.name,' ') FROM contacts ct WHERE ct.client_id=c.id AND ct.archived_at IS NULL),'') AS contact_names FROM clients c WHERE c.archived_at IS NULL ORDER BY c.name COLLATE NOCASE").all()).results || []));
  api.post('/clients', c => clientSave(c));
  api.put('/clients/:id', c => clientSave(c,c.req.param('id')));
  api.get('/clients/:id', async c => { const value=await clientDetail(c,c.req.param('id')); return value ? c.json(value) : c.json({error:'Client not found.'},404); });
  api.get('/clients/:id/projects', async c => permitted(c,'projects.view') ? c.json((await c.env.DB.prepare('SELECT id,project_number,name,stage FROM projects WHERE client_id=? AND archived_at IS NULL ORDER BY project_number DESC').bind(c.req.param('id')).all()).results || []) : deny(c));
  api.get('/clients/:id/audit', async c => c.json(await audit(c,'client',c.req.param('id'))));
  api.get('/clients/:id/documents/:documentId', async c => {
    const row=await c.env.DB.prepare('SELECT r2_key,name,mime_type FROM client_documents WHERE id=? AND client_id=? AND archived_at IS NULL').bind(c.req.param('documentId'),c.req.param('id')).first<Row>();
    if (!row) return c.notFound();
    const object=await c.env.RECORD_DOCUMENTS.get(String(row.r2_key));
    if (!object) return c.notFound();
    return new Response(object.body,{headers:{'Content-Type':String(row.mime_type),'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(String(row.name))}`,'Cache-Control':'private, no-store'}});
  });
  api.post('/clients/:id/archive', async c => {
    if(!permitted(c,'clients.manage.basic'))return deny(c);
    const id=c.req.param('id'),row=await c.env.DB.prepare('SELECT * FROM clients WHERE id=? AND archived_at IS NULL').bind(id).first<Row>();
    if(!row)return c.json({error:'Client not found.'},404);
    const related=await c.env.DB.prepare('SELECT COUNT(*) AS count FROM projects WHERE client_id=? AND archived_at IS NULL').bind(id).first<{count:number}>();
    if(related?.count)return c.json({error:'Reassign or archive this client’s projects first.'},409);
    await c.env.DB.batch([c.env.DB.prepare('UPDATE clients SET archived_at=CURRENT_TIMESTAMP,status=\'inactive\',revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND archived_at IS NULL').bind(actor(c),id),auditInsert(c,'client',id,'archived',row,{archived:true})]);
    const archived=await c.env.DB.prepare('SELECT * FROM clients WHERE id=?').bind(id).first<Row>();
    await qboSave(c,'clients',archived!);
    return c.json(await clientDetail(c,id));
  });
  api.post('/clients/:id/qbo/retry', async c => {
    if(!permitted(c,'company.qbo.resync'))return deny(c);
    const row=await c.env.DB.prepare('SELECT * FROM clients WHERE id=? AND archived_at IS NULL').bind(c.req.param('id')).first<Row>();
    if(!row)return c.notFound();
    return c.json(await qboSave(c,'clients',row));
  });
  return api;
}
