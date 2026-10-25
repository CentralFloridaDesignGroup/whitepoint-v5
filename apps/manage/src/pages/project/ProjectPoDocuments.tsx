import { useState } from 'react'
import type { Project } from '@whitepoint/types'
import { requestJson } from '../../api/client'

export function ProjectPoDocuments({projectId,documents,editable}:{projectId:string;documents:Project['poDocuments'];editable:boolean}){
  const [items,setItems]=useState(documents),[busy,setBusy]=useState(false),[error,setError]=useState('')
  async function upload(file:File){setBusy(true);setError('');try{const form=new FormData();form.append('file',file);const item=await requestJson<{id:string;name:string}>(`/records/projects/${projectId}/po-documents`,{authMode:'session',method:'POST',body:form});setItems(old=>[...old,{...item,sizeBytes:file.size,createdAt:new Date().toISOString()}])}catch(cause){setError(String(cause))}finally{setBusy(false)}}
  async function remove(id:string){setBusy(true);setError('');try{await requestJson(`/records/projects/${projectId}/po-documents/${id}`,{authMode:'session',method:'DELETE'});setItems(old=>old.filter(item=>item.id!==id))}catch(cause){setError(String(cause))}finally{setBusy(false)}}
  return <section className="rounded-xl border bg-white p-5"><h2 className="mb-2 text-lg font-semibold">Purchase order documents</h2><p className="mb-3 text-sm text-slate-600">Active PDFs are automatically included with project invoices.</p>{error&&<p role="alert" className="text-red-700">{error}</p>}<ul className="space-y-2">{items.map(item=><li key={item.id} className="flex justify-between gap-3 border-b py-2 text-sm"><span>{item.name}</span>{editable&&<button disabled={busy} className="text-red-700 underline" onClick={()=>void remove(item.id)}>Remove</button>}</li>)}</ul>{editable&&<label className="mt-4 block text-sm">Add PO PDF<input className="mt-1 block" type="file" accept="application/pdf,.pdf" disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file);event.target.value=''}}/></label>}</section>
}
