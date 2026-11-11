import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import { Hono } from 'hono';
registerHooks({resolve(specifier,context,nextResolve){try{return nextResolve(specifier,context);}catch(error){if(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)){for(const extension of ['.js','.ts'])try{return nextResolve(`${specifier}${extension}`,context);}catch{}}throw error;}},load(url,context,nextLoad){if(url.endsWith('.json')&&!url.includes('/node_modules/'))return {format:'module',shortCircuit:true,source:`export default ${readFileSync(new URL(url),'utf8')}`};return nextLoad(url,context);}});
const { createSubdivisionApi, createSubdivisionTemplateApi } = await import('../src/routes/subdivisionApi.ts');
const { createSearchApi } = await import('../src/routes/searchApi.ts');
const { qboProjectParent, qboSave } = await import('../src/routes/recordSupport.ts');

function fixture(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  for(const name of ['0001_company_initialization.sql','0002_roles_permissions.sql','0003_user_init_auth_seed.sql','0004_client_init.sql','0005_project_init.sql','0006_timesheet_init.sql','0007_invoice_init.sql','0009_invoice_void_and_pm_copy.sql','0010_unmatched_stripe_payouts.sql'])sqlite.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
  const db={prepare(sql){const execute=(values)=>({first:async()=>sqlite.prepare(sql).get(...values)||null,all:async()=>({results:sqlite.prepare(sql).all(...values)}),run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}})});return {...execute([]),bind(...values){return execute(values)}}},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const item of statements)result.push(await item.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  sqlite.exec("INSERT INTO clients(id,name,qbo_customer_id) VALUES('a','Builder A','qbo-a'),('b','Builder B','qbo-b'); INSERT INTO contacts(id,client_id,name,is_poc) VALUES('ca','a','A Contact',1),('cb','b','B Contact',1); INSERT INTO projects(id,project_number,client_id,name,description,manager_user_id,contact_id,stage,active,qbo_customer_id) VALUES('pa','26-1234','a','Phase 1 A','Subdivision scope','1','ca','active',1,'qbo-pa'),('pb','26-5678','b','Phase 1 B','Subdivision scope','1','cb','active',1,'qbo-pb');");
  let allowed=new Set(['*']);const app=new Hono();app.use('*',async(c,next)=>{c.set('auth',{internalUserId:'1'});c.set('permissions',{hasPermission:key=>allowed.has('*')||allowed.has(key)});await next();});app.route('/records',createSubdivisionApi());app.route('/settings',createSubdivisionTemplateApi());app.route('/search',createSearchApi());
  async function request(path,method='GET',body){const response=await app.request(path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined},{DB:db});return {status:response.status,body:await response.json()};}
  return {sqlite,db,request,setPermissions:keys=>allowed=new Set(keys)};
}
const phase={name:'Homebuilder package',tasks:[{taskId:'A',taskName:'Plot plan',shortDescription:'Initial plan',billType:'fixed-fee',contractAmountCents:25000,isUnderContract:true},{taskId:'B',taskName:'Foundation',shortDescription:'',billType:'time-and-materials',contractAmountCents:0,isUnderContract:false}]};

test('later templates add tasks to the same lot without duplicate projects or charges',async()=>{
  const f=fixture();try{
    const subdivision=(await f.request('/records/subdivisions','POST',{name:'Oak Grove Phase 1'})).body;
    const parcel=(await f.request(`/records/subdivisions/${subdivision.id}/parcels`,'POST',{revision:1,rows:[{parcelType:'lot',label:'1'}]})).body.parcels[0];
    await f.request(`/records/subdivisions/${subdivision.id}/parents`,'POST',{projectId:'pa'});
    const plot=(await f.request('/settings/subdivision-templates','POST',phase)).body;
    const stake=(await f.request('/settings/subdivision-templates','POST',{name:'Building stake',tasks:[{...phase.tasks[0],taskName:'Building stake',contractAmountCents:18000}]})).body;
    const assigned=(await f.request(`/records/subdivisions/${subdivision.id}/assignments/batches`,'POST',{batchId:'13131313-1313-4131-8131-131313131313',parentProjectId:'pa',parcelIds:[parcel.id],templateId:plot.id,confirmContractSigned:true})).body;
    const projectId=(await f.request(`/records/subdivisions/batches/${assigned.id}/run`,'POST')).body.rows[0].projectId;
    const input={batchId:'14141414-1414-4141-8141-141414141414',parentProjectId:'pa',parcelIds:[parcel.id],templateId:stake.id,confirmContractSigned:true};
    const preview=await f.request(`/records/subdivisions/${subdivision.id}/templates/preview`,'POST',input);
    assert.equal(preview.status,200);assert.deepEqual(preview.body.rows[0].taskIds,['C']);
    const saved=await f.request(`/records/subdivisions/${subdivision.id}/templates/batches`,'POST',{...input,parentRevision:preview.body.parent.revision,templateRevision:preview.body.templateRevision});
    assert.equal(saved.status,201);assert.equal(saved.body.operation,'append');
    const run=await f.request(`/records/subdivisions/batches/${input.batchId}/run`,'POST');assert.equal(run.body.rows[0].status,'created');
    await f.request(`/records/subdivisions/batches/${input.batchId}/run`,'POST');
    assert.equal((await f.request(`/records/subdivisions/${subdivision.id}/templates/batches`,'POST',input)).body.id,input.batchId);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM projects WHERE id=?').get(projectId).n,1);
    assert.deepEqual(f.sqlite.prepare('SELECT task_id FROM project_tasks WHERE project_id=? ORDER BY sequence').all(projectId).map(row=>row.task_id),['A','B','C']);
    assert.equal(f.sqlite.prepare('SELECT contract_price_cents FROM projects WHERE id=?').get(projectId).contract_price_cents,43000);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM subdivision_template_applications WHERE project_id=?').get(projectId).n,2);
    const detail=(await f.request(`/records/subdivisions/${subdivision.id}`)).body;
    assert.deepEqual(detail.parcels[0].appliedTemplates.map(item=>item.name),['Homebuilder package','Building stake']);
    const third={...input,batchId:'15151515-1515-4151-8151-151515151515'};
    assert.deepEqual((await f.request(`/records/subdivisions/${subdivision.id}/templates/preview`,'POST',third)).body.rows[0].taskIds,['D']);
    await f.request(`/records/subdivisions/${subdivision.id}/templates/batches`,'POST',third);
    await f.request(`/records/subdivisions/batches/${third.batchId}/run`,'POST');
    assert.deepEqual(f.sqlite.prepare('SELECT task_id FROM project_tasks WHERE project_id=? ORDER BY sequence').all(projectId).map(row=>row.task_id),['A','B','C','D']);
    assert.equal(f.sqlite.prepare('SELECT contract_price_cents FROM projects WHERE id=?').get(projectId).contract_price_cents,61000);
  }finally{f.sqlite.close();}
});

test('a later template batch stops if the lot project changes after review',async()=>{
  const f=fixture();try{
    const subdivision=(await f.request('/records/subdivisions','POST',{name:'Oak Grove Phase 6'})).body;
    const parcel=(await f.request(`/records/subdivisions/${subdivision.id}/parcels`,'POST',{revision:1,rows:[{parcelType:'lot',label:'6'}]})).body.parcels[0];
    await f.request(`/records/subdivisions/${subdivision.id}/parents`,'POST',{projectId:'pa'});
    const template=(await f.request('/settings/subdivision-templates','POST',phase)).body;
    const first=(await f.request(`/records/subdivisions/${subdivision.id}/assignments/batches`,'POST',{batchId:'16161616-1616-4161-8161-161616161616',parentProjectId:'pa',parcelIds:[parcel.id],templateId:template.id,confirmContractSigned:true})).body;
    const projectId=(await f.request(`/records/subdivisions/batches/${first.id}/run`,'POST')).body.rows[0].projectId;
    const input={batchId:'17171717-1717-4171-8171-171717171717',parentProjectId:'pa',parcelIds:[parcel.id],templateId:template.id,confirmContractSigned:true};
    await f.request(`/records/subdivisions/${subdivision.id}/templates/batches`,'POST',input);
    f.sqlite.prepare('UPDATE projects SET revision=revision+1 WHERE id=?').run(projectId);
    const run=await f.request(`/records/subdivisions/batches/${input.batchId}/run`,'POST');
    assert.equal(run.body.rows[0].status,'failed');assert.match(run.body.rows[0].error,/project changed/i);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM project_tasks WHERE project_id=?').get(projectId).n,2);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM subdivision_template_applications WHERE project_id=?').get(projectId).n,1);
  }finally{f.sqlite.close();}
});

test('shared inventory, block aware project numbers, template snapshots, and duplicate safe batch',async()=>{
  const f=fixture();try{
    const subdivision=(await f.request('/records/subdivisions','POST',{name:'Oak Grove Phase 1',location:'Orange County',platReference:'PB 1 PG 2'})).body;
    const parcels=(await f.request(`/records/subdivisions/${subdivision.id}/parcels`,'POST',{revision:1,rows:[{parcelType:'lot',block:'A',label:'1'},{parcelType:'lot',block:'B',label:'1'},{parcelType:'tract',block:'',label:'C'}]})).body.parcels;
    assert.equal(parcels.length,3);
    assert.equal((await f.request(`/records/subdivisions/${subdivision.id}/parcels`,'POST',{revision:2,rows:[{parcelType:'lot',block:'A',label:'1'}]})).status,409);
    assert.equal((await f.request(`/records/subdivisions/${subdivision.id}/parcels`,'POST',{revision:2,rows:[{parcelType:'lot',block:'a',label:'1'}]})).status,409);
    assert.equal((await f.request(`/records/subdivisions/${subdivision.id}/parents`,'POST',{projectId:'pa'})).status,201);
    assert.equal((await f.request(`/records/subdivisions/${subdivision.id}/parents`,'POST',{projectId:'pb'})).status,201);
    const template=(await f.request('/settings/subdivision-templates','POST',phase)).body;
    const selected=parcels.filter(p=>p.label==='1').map(p=>p.id),batchId='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const payload={batchId,parentProjectId:'pa',parcelIds:selected,templateId:template.id,confirmContractSigned:true,phasePrices:{A:30000}};
    const preview=await f.request(`/records/subdivisions/${subdivision.id}/assignments/preview`,'POST',payload);
    assert.deepEqual(preview.body.rows.map(r=>r.projectNumber),['26-1234.A.1','26-1234.B.1']);
    assert.equal((await f.request(`/records/subdivisions/${subdivision.id}/assignments/batches`,'POST',payload)).status,201);
    const run=await f.request(`/records/subdivisions/batches/${batchId}/run`,'POST');assert.equal(run.body.rows.filter(r=>r.status==='created').length,2);
    const afterAssign=(await f.request(`/records/subdivisions/${subdivision.id}`)).body;
    assert.equal((await f.request(`/records/subdivisions/${subdivision.id}/parcels/${selected[0]}`,'PUT',{parcelType:'lot',block:'C',label:'1',platReference:'',streetAddress:'',parcelId:'',revision:afterAssign.revision})).status,400);
    assert.equal((await f.request(`/records/subdivisions/${subdivision.id}/assignments/batches`,'POST',payload)).body.rows.length,2);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM projects WHERE project_number LIKE '26-1234.%'").get().n,2);
    const task=f.sqlite.prepare("SELECT contract_amount_cents FROM project_tasks WHERE project_id=? AND task_id='A'").get(run.body.rows[0].projectId);assert.equal(task.contract_amount_cents,30000);
    await f.request(`/settings/subdivision-templates/${template.id}`,'PUT',{...phase,revision:1,tasks:[{...phase.tasks[0],contractAmountCents:99900}]});
    assert.equal(f.sqlite.prepare("SELECT contract_amount_cents FROM project_tasks WHERE project_id=? AND task_id='A'").get(run.body.rows[0].projectId).contract_amount_cents,30000);
    assert.equal(await qboProjectParent(f.db,{id:run.body.rows[0].projectId,client_id:'a'}),'qbo-pa');
  }finally{f.sqlite.close();}
});

test('transfer preserves old project and invoices while blocking new time and assigning the new builder',async()=>{
  const f=fixture();try{
    const subdivision=(await f.request('/records/subdivisions','POST',{name:'Oak Grove Phase 1'})).body;
    const parcel=(await f.request(`/records/subdivisions/${subdivision.id}/parcels`,'POST',{revision:1,rows:[{parcelType:'lot',label:'1'}]})).body.parcels[0];
    await f.request(`/records/subdivisions/${subdivision.id}/parents`,'POST',{projectId:'pa'});await f.request(`/records/subdivisions/${subdivision.id}/parents`,'POST',{projectId:'pb'});
    const template=(await f.request('/settings/subdivision-templates','POST',phase)).body;
    const first=(await f.request(`/records/subdivisions/${subdivision.id}/assignments/batches`,'POST',{batchId:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',parentProjectId:'pa',parcelIds:[parcel.id],templateId:template.id,confirmContractSigned:true})).body;
    const old=(await f.request(`/records/subdivisions/batches/${first.id}/run`,'POST')).body.rows[0].projectId;
    f.sqlite.prepare("INSERT INTO invoices(id,project_id,client_id,invoice_number,source,status,issue_date,due_date,billing_name,project_reference,public_token) VALUES('old-invoice',?, 'a','INV-1','manual','sent','2026-11-01','2026-12-01','Builder A','Old lot','token')").run(old);
    assert.equal((await f.request(`/records/subdivisions/${subdivision.id}/assignments/preview`,'POST',{parentProjectId:'pb',parcelIds:[parcel.id],templateId:template.id,confirmContractSigned:true})).status,400);
    const next=(await f.request(`/records/subdivisions/${subdivision.id}/assignments/batches`,'POST',{batchId:'cccccccc-cccc-4ccc-cccc-cccccccccccc',parentProjectId:'pb',parcelIds:[parcel.id],templateId:template.id,confirmContractSigned:true,transfer:true})).body;
    const current=(await f.request(`/records/subdivisions/batches/${next.id}/run`,'POST')).body.rows[0].projectId;
    assert.equal(f.sqlite.prepare('SELECT active FROM projects WHERE id=?').get(old).active,0);
    assert.equal(f.sqlite.prepare('SELECT project_id FROM invoices WHERE id=?').get('old-invoice').project_id,old);
    assert.equal(f.sqlite.prepare('SELECT project_number FROM projects WHERE id=?').get(current).project_number,'26-5678.1');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM subdivision_assignments WHERE parcel_id=? AND ended_at IS NULL').get(parcel.id).n,1);
    f.sqlite.exec("INSERT INTO qbo_connection(id,realm_id,environment,access_token,refresh_token,token_expires_at,connected_at,updated_at) VALUES(1,'sandbox-realm','sandbox','access','refresh','2099-01-01T00:00:00Z',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
    let payload;const originalFetch=globalThis.fetch;
    try{globalThis.fetch=async(_url,init)=>{payload=JSON.parse(init.body);return new Response(JSON.stringify({Customer:{Id:'qbo-old',SyncToken:'1'}}),{status:200,headers:{'Content-Type':'application/json'}});};
      await qboSave({env:{DB:f.db,QBO_CLIENT_ID:'test',QBO_CLIENT_SECRET:'test',QBO_REDIRECT_URI:'http://localhost/callback',QBO_ENVIRONMENT:'sandbox'}},'projects',f.sqlite.prepare('SELECT * FROM projects WHERE id=?').get(old),'qbo-pa');
      assert.equal(payload.Active,true);
    }finally{globalThis.fetch=originalFetch;}
  }finally{f.sqlite.close();}
});

test('subdivision search and detail obey independent view permission',async()=>{
  const f=fixture();try{
    const subdivision=(await f.request('/records/subdivisions','POST',{name:'Pine Place',location:'Seminole'})).body;
    await f.request(`/records/subdivisions/${subdivision.id}/parcels`,'POST',{revision:1,rows:[{parcelType:'lot',label:'7'}]});
    f.setPermissions(['subdivisions.view']);const search=(await f.request('/search?q=7')).body;
    assert.equal(search.subdivisions.length,1);assert.deepEqual(search.projects,[]);assert.deepEqual(search.clients,[]);
    const detail=(await f.request(`/records/subdivisions/${subdivision.id}`)).body;assert.equal(detail.parents.length,0);
  }finally{f.sqlite.close();}
});

test('a large batch advances past a failed row and resumes without duplicate projects',async()=>{
  const f=fixture();try{
    const subdivision=(await f.request('/records/subdivisions','POST',{name:'Oak Grove Phase 2'})).body;
    const rows=Array.from({length:25},(_,index)=>({parcelType:'lot',label:String(index+1)}));
    const parcels=(await f.request(`/records/subdivisions/${subdivision.id}/parcels`,'POST',{revision:1,rows})).body.parcels;
    await f.request(`/records/subdivisions/${subdivision.id}/parents`,'POST',{projectId:'pa'});
    const template=(await f.request('/settings/subdivision-templates','POST',phase)).body;
    const batchId='dddddddd-dddd-4ddd-dddd-dddddddddddd';
    const payload={batchId,parentProjectId:'pa',parcelIds:parcels.map(p=>p.id),templateId:template.id,confirmContractSigned:true};
    assert.equal((await f.request(`/records/subdivisions/${subdivision.id}/assignments/batches`,'POST',payload)).status,201);
    f.sqlite.prepare('UPDATE subdivision_parcels SET label=? WHERE id=?').run('changed',parcels[0].id);
    for(let index=0;index<8;index++)await f.request(`/records/subdivisions/batches/${batchId}/run`,'POST');
    const result=(await f.request(`/records/subdivisions/batches/${batchId}`)).body;
    assert.equal(result.rows.filter(r=>r.status==='created').length,24);
    assert.equal(result.rows.filter(r=>r.status==='failed').length,1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM projects WHERE project_number LIKE '26-1234.%'").get().n,24);
    const repeated=(await f.request(`/records/subdivisions/batches/${batchId}/run`,'POST')).body;
    assert.equal(repeated.rows.filter(r=>r.status==='created').length,24);
  }finally{f.sqlite.close();}
});

test('preview handles hundreds of parcel rows with grouped D1 lookups',async()=>{
  const f=fixture();try{
    const subdivision=(await f.request('/records/subdivisions','POST',{name:'Oak Grove Phase 3'})).body;
    const rows=Array.from({length:180},(_,index)=>({parcelType:'lot',block:index<90?'A':'B',label:String(index%90+1)}));
    const parcels=(await f.request(`/records/subdivisions/${subdivision.id}/parcels`,'POST',{revision:1,rows})).body.parcels;
    await f.request(`/records/subdivisions/${subdivision.id}/parents`,'POST',{projectId:'pa'});
    const template=(await f.request('/settings/subdivision-templates','POST',phase)).body;
    const result=await f.request(`/records/subdivisions/${subdivision.id}/assignments/preview`,'POST',{parentProjectId:'pa',parcelIds:parcels.map(p=>p.id),templateId:template.id,confirmContractSigned:true});
    assert.equal(result.status,200);assert.equal(result.body.rows.length,180);
    assert.equal(new Set(result.body.rows.map(r=>r.projectNumber)).size,180);
  }finally{f.sqlite.close();}
});

test('a reviewed batch stops if its builder parent changes before processing',async()=>{
  const f=fixture();try{
    const subdivision=(await f.request('/records/subdivisions','POST',{name:'Oak Grove Phase 4'})).body;
    const parcel=(await f.request(`/records/subdivisions/${subdivision.id}/parcels`,'POST',{revision:1,rows:[{parcelType:'lot',label:'4'}]})).body.parcels[0];
    await f.request(`/records/subdivisions/${subdivision.id}/parents`,'POST',{projectId:'pa'});
    const template=(await f.request('/settings/subdivision-templates','POST',phase)).body;
    const input={parentProjectId:'pa',parcelIds:[parcel.id],templateId:template.id,confirmContractSigned:true};
    const preview=(await f.request(`/records/subdivisions/${subdivision.id}/assignments/preview`,'POST',input)).body;
    f.sqlite.exec("UPDATE projects SET revision=revision+1,name='Revised parent' WHERE id='pa'");
    assert.equal((await f.request(`/records/subdivisions/${subdivision.id}/assignments/batches`,'POST',{...input,batchId:'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee',parentRevision:preview.parent.revision,templateRevision:preview.templateRevision})).status,400);
    const created=(await f.request(`/records/subdivisions/${subdivision.id}/assignments/batches`,'POST',{...input,batchId:'ffffffff-ffff-4fff-ffff-ffffffffffff'})).body;
    f.sqlite.exec("UPDATE projects SET revision=revision+1 WHERE id='pa'");
    const result=(await f.request(`/records/subdivisions/batches/${created.id}/run`,'POST')).body;
    assert.equal(result.rows[0].status,'failed');assert.match(result.rows[0].error,/parent changed/i);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM subdivision_assignments').get().n,0);
  }finally{f.sqlite.close();}
});

test('retry cycles through failed rows instead of repeating the first four',async()=>{
  const f=fixture();try{
    const subdivision=(await f.request('/records/subdivisions','POST',{name:'Oak Grove Phase 5'})).body;
    const parcels=(await f.request(`/records/subdivisions/${subdivision.id}/parcels`,'POST',{revision:1,rows:Array.from({length:12},(_,index)=>({parcelType:'lot',label:String(index+1)}))})).body.parcels;
    await f.request(`/records/subdivisions/${subdivision.id}/parents`,'POST',{projectId:'pa'});
    const template=(await f.request('/settings/subdivision-templates','POST',phase)).body;
    const batchId='12121212-1212-4121-8121-121212121212';
    await f.request(`/records/subdivisions/${subdivision.id}/assignments/batches`,'POST',{batchId,parentProjectId:'pa',parcelIds:parcels.map(p=>p.id),templateId:template.id,confirmContractSigned:true});
    for(const [index,parcel] of parcels.entries())f.sqlite.prepare('UPDATE subdivision_parcels SET label=? WHERE id=?').run(`changed-${index}`,parcel.id);
    for(let index=0;index<3;index++)await f.request(`/records/subdivisions/batches/${batchId}/run`,'POST');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM subdivision_batch_rows WHERE batch_id=? AND attempt_count=1").get(batchId).n,12);
  }finally{f.sqlite.close();}
});
