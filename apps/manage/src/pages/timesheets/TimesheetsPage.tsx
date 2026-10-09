import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { requestJson } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { currentMonday, hours, selectedMonday, shift, type WeekSummary } from './model'

export function TimesheetsPage(){
  const auth=useAuth(),navigate=useNavigate(),[weeks,setWeeks]=useState<WeekSummary[]>([]),[date,setDate]=useState(currentMonday()),[error,setError]=useState('')
  useEffect(()=>{void requestJson<{items:WeekSummary[]}>('/timesheets/weeks',{authMode:'session'}).then(r=>setWeeks(r.items)).catch(e=>setError(String(e)))},[])
  const current=currentMonday(),previous=shift(current,-7)
  const rows=[...weeks]
  for(const start of [current,previous])if(!rows.some(w=>w.week_start===start))rows.push({id:start,user_id:auth.internalUserId||'',week_start:start,status:'draft',revision:0,entry_count:0,total_hours:0})
  rows.sort((a,b)=>b.week_start.localeCompare(a.week_start))
  return <main className="mx-auto max-w-6xl space-y-5 pb-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-semibold">Timesheets</h1><p className="mt-1 text-sm text-slate-600">Select a week to enter or review your time.</p></div><div className="flex gap-2">{(auth.hasPermission('timesheets.approve')||auth.hasPermission('timesheets.view'))&&<Link className="rounded border px-3 py-2 text-sm" to="/timesheets/review">Review staff weeks</Link>}{auth.hasPermission('timesheets.rates.view')&&<Link className="rounded border px-3 py-2 text-sm" to="/timesheets/invoice-pool">Invoice pool</Link>}</div></div>
    {error&&<p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4"><label className="text-sm">Open another week<input className="mt-1 block rounded border p-2" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><button className="rounded bg-sky-800 px-4 py-2 text-sm text-white" onClick={()=>navigate(`/timesheets/${selectedMonday(date)}`)}>Open week</button></div>
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">Week</th><th className="p-3">Status</th><th className="p-3 text-right">Entries</th><th className="p-3 text-right">Hours</th><th className="p-3"> </th></tr></thead><tbody>{rows.map(w=><tr key={w.week_start} className="border-t hover:bg-sky-50"><td className="p-3"><Link className="font-medium text-sky-800" to={`/timesheets/${w.week_start}`}>{w.week_start} to {shift(w.week_start,6)}</Link></td><td className="p-3 capitalize">{w.status}</td><td className="p-3 text-right">{w.entry_count}</td><td className="p-3 text-right tabular-nums">{hours(w.total_hours)}</td><td className="p-3"><Link className="text-sky-800" to={`/timesheets/${w.week_start}`}>Open</Link></td></tr>)}</tbody></table></div>
  </main>
}
