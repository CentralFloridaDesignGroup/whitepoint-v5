import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BriefcaseBusiness, CalendarClock, CircleDollarSign, Clock3, Plus, TrendingUp, Users } from "lucide-react";
import type { DashboardResponse } from "@whitepoint/types";
import { requestJson } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { currentMonday } from "../timesheets/model";

type Icon = typeof Plus;
const dollars = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
const compactDollars = (cents: number) => { const amount = cents / 100; return amount >= 1_000_000 ? `$${(amount / 1_000_000).toFixed(2)}m` : amount >= 1_000 ? `$${(amount / 1_000).toFixed(2)}k` : `$${Math.round(amount)}`; };
const monthName = (month: string) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

function Heading({ id, title, icon: Icon, to }: { id: string; title: string; icon: Icon; to: string }) {
  return <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><Icon className="h-5 w-5 text-sky-700" aria-hidden="true" /><h2 id={id} className="text-xl font-semibold text-slate-900">{title}</h2></div><Link to={to} className="text-sm font-medium text-sky-700 hover:underline">View all</Link></div>;
}

function Action({ to, label, icon: Icon }: { to: string; label: string; icon: Icon }) {
  return <Link to={to} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 shadow-sm hover:border-sky-400 hover:text-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"><Icon className="h-4 w-4" aria-hidden="true" />{label}</Link>;
}

function Metric({ value, label, icon: Icon, tone }: { value: number; label: string; icon: Icon; tone: string }) {
  return <div className="flex flex-col justify-between gap-4"><span className={`w-fit rounded-xl p-2 ${tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></span><div><strong className="block text-4xl font-semibold tabular-nums text-slate-950">{value}</strong><span className="text-xs font-medium text-slate-600 sm:text-sm">{label}</span></div></div>;
}

function OpportunityPie({ values }: { values: NonNullable<DashboardResponse["projects"]>["opportunities"] }) {
  const stages = [
    { key: "opportunity", label: "Opportunity", color: "#0369a1", dot: "bg-sky-700" },
    { key: "proposal", label: "Proposal", color: "#0891b2", dot: "bg-cyan-600" },
    { key: "shortlisted", label: "Shortlisted", color: "#6366f1", dot: "bg-indigo-500" },
    { key: "negotiating", label: "Negotiating", color: "#d97706", dot: "bg-amber-600" },
  ] as const;
  const total = stages.reduce((sum, stage) => sum + values[stage.key], 0);
  let start = 0;
  const slices = stages.filter(stage => values[stage.key] > 0).map(stage => {
    const end = start + values[stage.key] / total * 100;
    const slice = `${stage.color} ${start}% ${end}%`;
    start = end;
    return slice;
  });
  const description = stages.map(stage => `${stage.label}: ${values[stage.key]}`).join(", ");
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <h3 className="mb-4 text-sm font-medium text-slate-700">Open opportunities</h3>
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
      <div role="img" aria-label={total ? description : "No open opportunities"} title={description} className="h-32 w-32 shrink-0 rounded-full sm:h-36 sm:w-36" style={{ background: total ? `conic-gradient(${slices.join(", ")})` : "#e2e8f0" }} />
      <div className="grid w-full grid-cols-2 gap-x-4 gap-y-4">
        {stages.map(stage => <div key={stage.key} className="min-w-0"><span className="flex items-center gap-1.5 text-xs text-slate-600"><i className={`h-2.5 w-2.5 shrink-0 rounded-full ${stage.dot}`} aria-hidden="true" />{stage.label}</span><strong className="ml-4 block text-xl font-semibold tabular-nums text-slate-900">{values[stage.key]}</strong></div>)}
      </div>
    </div>
  </div>;
}

function Projects({ value }: { value: NonNullable<DashboardResponse["projects"]> }) {
  return <section aria-labelledby="projects-title">
    <Heading id="projects-title" title="Projects" icon={BriefcaseBusiness} to="/project" />
    <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:gap-4 sm:p-6">
        <Metric value={value.active} label="Active" icon={BriefcaseBusiness} tone="bg-sky-100 text-sky-800" />
        <Metric value={value.dueSoon} label="Due in 7 days" icon={CalendarClock} tone="bg-amber-100 text-amber-800" />
        <Metric value={value.overdue} label="Overdue" icon={Clock3} tone="bg-rose-100 text-rose-800" />
      </div>
      <OpportunityPie values={value.opportunities} />
    </div>
  </section>;
}

function MonthChart({ months }: { months: NonNullable<DashboardResponse["financials"]>["months"] }) {
  const [selected, setSelected] = useState(months.length - 1);
  const max = Math.max(1, ...months.flatMap(month => [month.sentCents, month.incomeCents]));
  const active = months[selected] || months.at(-1)!;
  if (months.every(month => month.sentCents === 0 && month.incomeCents === 0)) return <div className="flex min-h-72 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6"><div><h3 className="font-medium text-slate-800">Invoiced and received</h3><p className="text-sm text-slate-500">Last 12 months</p></div><p className="text-sm text-slate-500">No invoices sent or payments received in this period.</p></div>;
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"><div className="flex flex-wrap items-baseline justify-between gap-3"><div><h3 className="font-medium text-slate-800">Invoiced and received</h3><p className="text-sm text-slate-500">Last 12 months</p></div><div className="flex gap-4 text-xs text-slate-600"><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-sky-700" />Sent</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-600" />Received</span></div></div><div className="mt-5 grid min-w-0 grid-cols-3 gap-2 sm:hidden">{months.map((month, index) => <button key={month.month} type="button" onFocus={() => setSelected(index)} onClick={() => setSelected(index)} aria-pressed={selected === index} aria-label={`${monthName(month.month)} ${month.month.slice(0, 4)}: sent ${dollars(month.sentCents)}, received ${dollars(month.incomeCents)}`} className={`min-w-0 rounded-lg border p-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${selected === index ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-white"}`}><span className="block text-xs font-semibold text-slate-800">{monthName(month.month)} <span className="text-[10px] font-normal text-slate-500">{month.month.slice(2, 4)}</span></span><span className="mt-2 flex items-center gap-1 text-[11px] text-slate-800"><i className="h-2 w-2 shrink-0 rounded-sm bg-sky-700" aria-hidden="true" /><span className="sr-only">Sent </span><strong className="truncate tabular-nums">{compactDollars(month.sentCents)}</strong></span><span className="mt-1 flex items-center gap-1 text-[11px] text-slate-800"><i className="h-2 w-2 shrink-0 rounded-sm bg-emerald-600" aria-hidden="true" /><span className="sr-only">Received </span><strong className="truncate tabular-nums">{compactDollars(month.incomeCents)}</strong></span></button>)}</div><div className="mt-6 hidden min-w-0 sm:block"><div className="flex h-44 w-full min-w-0 items-end gap-0.5 border-b border-slate-200 pb-1 sm:gap-2">{months.map((month, index) => <button key={month.month} type="button" onMouseEnter={() => setSelected(index)} onFocus={() => setSelected(index)} onClick={() => setSelected(index)} className={`flex h-full min-w-0 flex-1 flex-col items-stretch justify-end rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${index === selected ? "bg-sky-50" : ""}`} aria-label={`${monthName(month.month)} ${month.month.slice(0, 4)}: sent ${dollars(month.sentCents)}, received ${dollars(month.incomeCents)}`}><span className="flex h-[138px] items-end justify-center gap-1"><span className="w-1.5 rounded-t-sm bg-sky-700 sm:w-3" style={{ height: `${month.sentCents ? Math.max(3, month.sentCents / max * 100) : 0}%` }} /><span className="w-1.5 rounded-t-sm bg-emerald-600 sm:w-3" style={{ height: `${month.incomeCents ? Math.max(3, month.incomeCents / max * 100) : 0}%` }} /></span><span className="mt-2 text-center text-[9px] text-slate-500 sm:text-[11px]">{monthName(month.month)}</span></button>)}</div></div><p className="mt-4 text-sm text-slate-700" aria-live="polite"><strong>{monthName(active.month)} {active.month.slice(0, 4)}</strong><span className="mx-2 text-slate-300">|</span>Sent {dollars(active.sentCents)}<span className="mx-2 text-slate-300">|</span>Received {dollars(active.incomeCents)}</p></div>;
}

function InvoiceValue({ value }: { value: NonNullable<DashboardResponse["financials"]>["invoiceValue"] }) {
  const parts = [
    { label: "Paid", amount: value.paidCents, color: "bg-emerald-600" },
    { label: "Outstanding", amount: value.outstandingCents, color: "bg-amber-500" },
    { label: "Late", amount: value.lateCents, color: "bg-rose-600" },
    { label: "Draft", amount: value.draftCents, color: "bg-slate-400" },
  ];
  const total = parts.reduce((sum, part) => sum + part.amount, 0);
  if (!total) return <div className="flex min-h-72 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6"><h3 className="font-medium text-slate-800">Invoice value</h3><p className="text-sm text-slate-500">No current invoices yet.</p></div>;
  return <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <div><h3 className="font-medium text-slate-800">Invoice value</h3><p className="text-sm text-slate-500">All current invoices</p></div>
    <div className="my-6"><strong className="text-4xl font-semibold tracking-tight text-slate-950">{dollars(total)}</strong>
      <div className="mt-4 flex h-5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={parts.map(part => `${part.label} ${dollars(part.amount)}`).join(", ")}>{parts.map(part => <span key={part.label} className={part.color} style={{ width: `${part.amount / total * 100}%` }} />)}</div>
    </div>
    <div className="space-y-2">{parts.map(part => <div key={part.label} className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2 text-slate-600"><i className={`h-2.5 w-2.5 rounded-sm ${part.color}`} aria-hidden="true" />{part.label}{part.label === "Late" && <span className="text-xs text-rose-700">({value.lateCount} {value.lateCount === 1 ? "invoice" : "invoices"})</span>}</span><strong className="tabular-nums text-slate-800">{dollars(part.amount)}</strong></div>)}</div>
  </div>;
}

function Financials({ value }: { value: NonNullable<DashboardResponse["financials"]> }) {
  return <section aria-labelledby="financials-title" className="min-w-0"><Heading id="financials-title" title="Financials" icon={CircleDollarSign} to="/invoices" /><div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(270px,0.8fr)]"><MonthChart months={value.months} /><InvoiceValue value={value.invoiceValue} /></div></section>;
}

function Staff({ value, showMultiplier }: { value: DashboardResponse["staff"]; showMultiplier: boolean }) {
  const utilization = value.utilization;
  return <section aria-labelledby="staff-title"><Heading id="staff-title" title="Staff and Time" icon={Users} to="/timesheets" /><div className="grid gap-4 md:grid-cols-3">{utilization && <div className="flex min-h-48 items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6"><div><h3 className="font-medium text-slate-700">Utilization</h3><strong className="mt-4 block text-5xl font-semibold tracking-tight text-slate-950">{utilization.targetHours ? `${utilization.percent}%` : "—"}</strong><p className="mt-2 text-sm text-slate-500">{utilization.targetHours ? `${utilization.billableHours.toFixed(1)} of ${utilization.targetHours.toFixed(0)} target hours` : "No active staff target"}</p>{utilization.missingTargetCount > 0 && <p className="mt-1 text-xs font-medium text-amber-700">{utilization.missingTargetCount} staff {utilization.missingTargetCount === 1 ? "target needs" : "targets need"} setup</p>}<p className="mt-1 text-xs text-slate-400" title={`${utilization.from} through ${utilization.through}`}>Approved billable time · last 4 complete weeks</p></div><div role="img" aria-label={`${utilization.percent}% utilization`} className="h-24 w-24 shrink-0 rounded-full p-3" style={{ background: `conic-gradient(#0284c7 ${Math.max(0, Math.min(100, utilization.percent))}%, #e2e8f0 0)` }}><div className="h-full w-full rounded-full bg-white" /></div></div>}{showMultiplier && <div className="flex min-h-48 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6"><div className="flex items-center gap-2 text-slate-600"><TrendingUp className="h-5 w-5 text-sky-700" /><h3 className="font-medium">Income multiplier</h3></div><div><strong className="text-5xl font-semibold tracking-tight text-slate-950">{value.incomeMultiplier === null ? "—" : `${value.incomeMultiplier.toFixed(2)}×`}</strong><p className="mt-2 text-sm text-slate-500" title="Invoice value sent this month divided by approved labor cost this month">{value.incomeMultiplier === null ? "Unavailable until approved labor cost exists" : "Invoice value ÷ labor cost · month to date"}</p></div></div>}<div className="flex min-h-48 flex-col justify-between rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6"><div className="flex items-center gap-2 text-slate-600"><CalendarClock className="h-5 w-5" /><h3 className="font-medium">Time off requests</h3></div><p className="text-2xl font-medium text-slate-400">Coming soon</p></div></div></section>;
}

export function BusinessDashboard() {
  const auth = useAuth();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (!auth.isAuthenticated) return; let live = true; requestJson<DashboardResponse>("/dashboard", { authMode: "session" }).then(value => { if (live) setData(value); }).catch(reason => { if (live) setError(reason instanceof Error ? reason.message : String(reason)); }); return () => { live = false; }; }, [auth.isAuthenticated]);
  if (!auth.isLoaded || !data && !error) return <main className="mx-auto max-w-7xl p-6" aria-busy="true"><div className="h-7 w-48 animate-pulse rounded bg-slate-200" /><div className="mt-8 grid gap-4 md:grid-cols-3">{[0, 1, 2].map(item => <div key={item} className="h-44 animate-pulse rounded-2xl bg-slate-100" />)}</div><span className="sr-only">Loading business dashboard</span></main>;
  if (error) return <main className="mx-auto max-w-7xl p-6"><h1 className="text-2xl font-semibold">Business dashboard</h1><p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">Dashboard data could not be loaded. {error}</p><button className="mt-4 rounded-lg bg-sky-700 px-4 py-2 text-white" onClick={() => location.reload()}>Try again</button></main>;
  if (!data) return null;
  return <main className="mx-auto w-full max-w-7xl space-y-9 pb-10"><header className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-sm text-slate-500">Business health · As of {new Date(`${data.asOf}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Dashboard</h1></div><nav aria-label="Quick actions" className="flex flex-wrap gap-2">{auth.hasPermission("clients.create") && <Action to="/client/new" label="New client" icon={Users} />}{auth.hasPermission("projects.create") && <Action to="/project/new" label="New project" icon={BriefcaseBusiness} />}<Action to={`/timesheets/${currentMonday()}?new=1`} label="New timesheet entry" icon={Plus} /></nav></header>{data.projects && <Projects value={data.projects} />}{data.financials && <Financials value={data.financials} />}<Staff value={data.staff} showMultiplier={auth.hasPermission("invoices.view") && auth.hasPermission("timesheets.rates.view")} /></main>;
}
