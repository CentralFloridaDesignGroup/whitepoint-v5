import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Client, ClientInput, ClientAddress, Contact, ClientDocument } from '@whitepoint/types';
import { requestBlob, requestJson } from '../../api/client';
import { downloadBlob } from '@whitepoint/utils/browser-files';
import { useAuth } from '../../auth/AuthContext';
import { useUnsavedChanges } from '../settings/useUnsavedChanges';
import { SaveBar, Tabs, type ListRecord } from '../common/RecordControls';
import { RecordAuditTab, type RecordAuditRow } from '../common/RecordAuditTab';
import { ClientAddressesTab, ClientContactsTab, ClientDocumentsTab, ClientGeneralTab, ClientProjectsTab, type ClientProject } from './ClientRecordTabs';

const blankContact=():Partial<Contact>=>({id:crypto.randomUUID(),prefix:'',firstName:'',middleName:'',lastName:'',suffix:'',email:'',phone:'',role:'',clientAddressId:null,isPoc:true,isBillingPoc:false,isExecutivePoc:false,metadata:{title:'',department:'',reportsTo:'',notes:''}});
const blankAddress=():Partial<ClientAddress>=>({id:crypto.randomUUID(),label:'Primary',isPrimaryMailingAddress:true,line1:'',line2:'',city:'',state:'',postalCode:''});
const blank=():ClientInput=>({name:'',email:'',phone:'',status:'active',parentClientId:null,metadata:{industry:'',size:'',public:false,notes:''},addresses:[blankAddress()],contacts:[blankContact()],documents:[]});
function toDraft(value:Client,copy=false):ClientInput {
  const addressIds=new Map(value.addresses.map(address=>[address.id,copy?crypto.randomUUID():address.id]));
  return {
    name:value.name,email:value.email,phone:value.phone,status:copy?'active':value.status,
    parentClientId:value.parentClientId,metadata:{...value.metadata},
    addresses:value.addresses.map(address=>({...address,id:addressIds.get(address.id)!})),
    contacts:value.contacts.map(contact=>({...contact,id:copy?crypto.randomUUID():contact.id,clientAddressId:contact.clientAddressId?addressIds.get(contact.clientAddressId)||null:null})),
    documents:copy?[]:value.documents.map(document=>({id:document.id,name:document.name,description:document.description,expiresAt:document.expiresAt})),
    revision:copy?undefined:value.revision,
  };
}
const tabs=['General','Addresses','Contacts','Projects','Documents','Audit'];

export function ClientRecordPage(){
  const {id}=useParams(),[params]=useSearchParams(),navigate=useNavigate(),auth=useAuth();
  const isNew=!id,copyId=params.get('copy');
  const [record,setRecord]=useState<Client|null>(null),[draft,setDraft]=useState<ClientInput>(blank),[saved,setSaved]=useState<ClientInput>(blank);
  const [files,setFiles]=useState<Record<string,File>>({}),[tab,setTab]=useState('General'),[editing,setEditing]=useState(isNew),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [clients,setClients]=useState<ListRecord[]>([]),[projects,setProjects]=useState<ClientProject[]>([]),[audit,setAudit]=useState<RecordAuditRow[]>([]);
  const dirty=useMemo(()=>(JSON.stringify(draft)!==JSON.stringify(saved)||Object.keys(files).length>0),[draft,saved,files]);
  const allowNextNavigation = useUnsavedChanges(dirty);
  useEffect(()=>{let live=true;void requestJson<ListRecord[]>('/records/clients',{authMode:'session'}).then(x=>{if(live)setClients(x)}).catch(e=>{if(live)setError(String(e))});return()=>{live=false};},[]);
  useEffect(()=>{let live=true;setError('');setFiles({});
    if(!id&&!copyId){const empty=blank();setRecord(null);setDraft(empty);setSaved(empty);setEditing(true);return;}
    void requestJson<Client>(`/records/clients/${encodeURIComponent(id||copyId||'')}`,{authMode:'session'}).then(value=>{if(!live)return;const next=toDraft(value,!id);setRecord(id?value:null);setDraft(next);setSaved(next);setEditing(!id);}).catch(e=>{if(live)setError(String(e))});
    return()=>{live=false};
  },[id,copyId]);
  useEffect(()=>{if(!id)return;let live=true;void requestJson<typeof projects>(`/records/clients/${id}/projects`,{authMode:'session'}).then(p=>{if(live)setProjects(p)}).catch(()=>undefined);void requestJson<RecordAuditRow[]>(`/records/clients/${id}/audit`,{authMode:'session'}).then(a=>{if(live)setAudit(a)}).catch(()=>undefined);return()=>{live=false};},[id]);
  const canEdit=isNew?auth.hasPermission('clients.create'):Boolean(record?.capabilities.edit);
  const update=(patch:Partial<ClientInput>)=>setDraft(current=>({...current,...patch}));
  const addressChange=(index:number,patch:Partial<ClientAddress>)=>setDraft(current=>({...current,addresses:current.addresses.map((a,i)=>i===index?{...a,...patch}:patch.isPrimaryMailingAddress?{...a,isPrimaryMailingAddress:false}:a)}));
  const contactChange=(index:number,patch:Partial<Contact>)=>setDraft(current=>({...current,contacts:current.contacts.map((a,i)=>i===index?{...a,...patch}:a)}));
  async function save(){if(!canEdit||busy)return;setBusy(true);setError('');try{const form=new FormData();form.append('record',JSON.stringify(draft));for(const [docId,file] of Object.entries(files))if(draft.documents?.some(d=>d.id===docId))form.append(`file:${docId}`,file);const value=await requestJson<Client>(id?`/records/clients/${id}`:'/records/clients',{authMode:'session',method:id?'PUT':'POST',body:form});setRecord(value);const next=toDraft(value);setDraft(next);setSaved(next);setFiles({});setEditing(false);if(!id){allowNextNavigation();navigate(`/client/${value.id}`,{replace:true});}}catch(e){setError(String(e))}finally{setBusy(false)}}
  function cancel(){if(isNew){allowNextNavigation();navigate('/client');return;}setDraft(saved);setFiles({});setEditing(false);setError('');}
  async function archive(){if(!record||!window.confirm('Archive this client?'))return;setBusy(true);setError('');try{await requestJson(`/records/clients/${record.id}/archive`,{authMode:'session',method:'POST'});allowNextNavigation();navigate('/client');}catch(e){setError(String(e))}finally{setBusy(false)}}
  async function retry(){if(!record)return;setBusy(true);try{await requestJson(`/records/clients/${record.id}/qbo/retry`,{authMode:'session',method:'POST'});setRecord(await requestJson<Client>(`/records/clients/${record.id}`,{authMode:'session'}));}catch(e){setError(String(e))}finally{setBusy(false)}}
  async function download(doc:ClientDocument){if(!record)return;try{downloadBlob(await requestBlob(`/records/clients/${record.id}/documents/${doc.id}`,{authMode:'session'}),doc.name)}catch(e){setError(String(e))}}
  const onDocumentFileChange=(event:ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];if(!file)return;if(file.size>10*1024*1024){setError('Files must be 10 MB or less.');return;}const docId=crypto.randomUUID();setFiles(current=>({...current,[docId]:file}));update({documents:[...(draft.documents||[]),{id:docId,name:file.name,description:'',expiresAt:null}]});};
  return <main className="mx-auto max-w-7xl space-y-5 pb-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><Link to="/client" className="text-sm text-sky-800 hover:underline">Clients</Link><h1 className="mt-2 text-3xl font-semibold">{isNew?'New client':record?.name||'Loading client…'}</h1><p className="mt-1 text-sm text-slate-600">{record?.clientNumber||'Number assigned on save'} · {record?.status||'New'} {record&&`· QBO ${record.qboSyncStatus}`}</p></div><div className="flex flex-wrap gap-2">{record&&<Link to={`/client/new?copy=${record.id}`} className="rounded-lg border bg-white px-4 py-2 text-sm">Copy</Link>}{!editing&&canEdit&&<button className="rounded-lg bg-sky-800 px-4 py-2 text-sm font-medium text-white" onClick={()=>setEditing(true)}>Unlock</button>}{record?.capabilities.archive&&!editing&&<button className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm text-red-700" onClick={()=>void archive()}>Archive</button>}</div></div>
    {error&&<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {record?.qboSyncStatus==='failed'&&<p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">QuickBooks sync failed: {record.qboSyncError} {auth.hasPermission('company.qbo.resync')&&<button className="ml-2 font-semibold text-sky-800" onClick={()=>void retry()}>Retry</button>}</p>}
    <Tabs names={tabs} active={tab} onChange={setTab}/>
    {tab==='General'&&<ClientGeneralTab draft={draft} editing={editing} clients={clients} id={id} update={update}/>}
    {tab==='Addresses'&&<ClientAddressesTab draft={draft} editing={editing} update={update} addressChange={addressChange} onAddAddress={()=>update({addresses:[...draft.addresses,{...blankAddress(),isPrimaryMailingAddress:false,label:''}]})}/>}
    {tab==='Contacts'&&<ClientContactsTab draft={draft} editing={editing} update={update} contactChange={contactChange} onAddContact={()=>update({contacts:[...draft.contacts,{...blankContact(),isPoc:false}]})}/>}
    {tab==='Projects'&&<ClientProjectsTab id={id} projects={projects}/>}
    {tab==='Documents'&&<ClientDocumentsTab draft={draft} record={record} editing={editing} update={update} download={download} onDocumentFileChange={onDocumentFileChange}/>}
    {tab==='Audit'&&<RecordAuditTab audit={audit}/>}
    <SaveBar editing={editing} busy={busy} canSave={canEdit} onSave={()=>void save()} onCancel={cancel}/>
  </main>;
}
