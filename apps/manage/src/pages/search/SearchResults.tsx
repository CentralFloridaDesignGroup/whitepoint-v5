import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BriefcaseBusiness, Search, Users } from 'lucide-react'
import { requestJson } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import type { SearchResults } from '@whitepoint/types'

export function SearchResults() {
  const [params] = useSearchParams()
  const query = (params.get('q') || '').trim()
  const auth = useAuth()
  const [clients, setClients] = useState<Array<{id:string;client_number:string;name:string;email:string;phone:string}>>([])
  const [projects, setProjects] = useState<Array<{id:string;name:string;project_number:string;client_name:string;stage:string}>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    if (!query || query.length > 200) { setClients([]); setProjects([]); return }
    setLoading(true); setError('')
    if (!auth.hasPermission('clients.view') && !auth.hasPermission('projects.view')) { setClients([]); setProjects([]); setLoading(false); return }
    void requestJson<SearchResults>(`/search?q=${encodeURIComponent(query)}`, {authMode:'session'})
      .then((result) => { if (live) { setClients(result.clients); setProjects(result.projects.map((project) => ({ ...project, client_name: project.client_name || '' }))) } })
      .catch((caught) => { if (live) setError(caught instanceof Error ? caught.message : String(caught)) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [auth.hasPermission, query])

  return (
    <main className="mx-auto w-full max-w-5xl pb-10">
      <div className="border-b border-slate-200 pb-5 "><p className="text-sm text-sky-800 ">NorthStar search</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Results for “{query || '…'}”</h1><p className="mt-2 text-sm text-slate-600 ">Matches from the client and project records you can access.</p></div>
      {loading && <p className="py-8 text-sm text-slate-500">Searching records…</p>}
      {error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900   ">{error}</p>}
      {!loading && !error && query && clients.length + projects.length === 0 && <div className="py-12 text-center"><Search className="mx-auto h-6 w-6 text-slate-400" /><p className="mt-3 font-medium">No matching records</p><p className="mt-1 text-sm text-slate-500">Try a project number, client name, or contact detail.</p></div>}
      {projects.length > 0 && <section className="mt-6"><h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><BriefcaseBusiness className="h-4 w-4 text-sky-800 " />Projects <span className="text-xs font-normal text-slate-500">{projects.length}</span></h2><div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white   ">{projects.map((project) => <Link key={project.id} to={`/project/${project.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50 "><span><span className="font-medium">{project.project_number} · {project.name}</span><span className="mt-0.5 block text-xs text-slate-500">{project.client_name}</span></span><span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs capitalize text-sky-900  ">{project.stage}</span></Link>)}</div></section>}
      {clients.length > 0 && <section className="mt-6"><h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-sky-800 " />Clients <span className="text-xs font-normal text-slate-500">{clients.length}</span></h2><div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white   ">{clients.map((client) => <Link key={client.id} to={`/client/${client.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50 "><span><span className="font-medium">{client.client_number} · {client.name}</span><span className="mt-0.5 block text-xs text-slate-500">{client.email || client.phone || 'Client record'}</span></span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600  ">Client</span></Link>)}</div></section>}
    </main>
  )
}
