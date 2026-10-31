import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { InvoiceListItem, InvoicePoolEntry } from "@whitepoint/types";
import { requestJson } from "../../api/client";
import { formatUsdCents as money } from "@whitepoint/utils/currency";
import { useAuth } from "../../auth/AuthContext";

type ProjectOption = {
  id: string;
  project_number: string;
  name: string;
  client_name: string;
};
type OverviewFilter = "all" | "outstanding" | "overdue" | "drafts";
export function InvoicesPage() {
  const canManagePayments = useAuth().hasPermission("invoices.manage");
  const [items, setItems] = useState<InvoiceListItem[]>([]),
    [projects, setProjects] = useState<ProjectOption[]>([]),
    [query, setQuery] = useState(""),
    [projectId, setProjectId] = useState(""),
    [pool, setPool] = useState<InvoicePoolEntry[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [poolLoading, setPoolLoading] = useState(false),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const navigate = useNavigate(),
    [params] = useSearchParams();
  const [overviewFilter, setOverviewFilter] = useState<OverviewFilter>("all");
  const filteredItems = useMemo(() => {
    const search = query.trim().toLowerCase();
    return items.filter((item) =>
      `${item.clientName} ${item.projectName} ${item.projectNumber} ${item.invoiceNumber} ${item.status}`
        .toLowerCase()
        .includes(search),
    );
  }, [items, query]);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const summary = useMemo(() => {
    return filteredItems.reduce(
      (totals, item) => {
        if (item.status === "sent") {
          totals.outstandingCents += item.balanceCents;
          if (item.balanceCents > 0 && item.dueDate < today) {
            totals.overdueCents += item.balanceCents;
          }
        }
        if (item.status === "draft") totals.drafts += 1;
        return totals;
      },
      { outstandingCents: 0, overdueCents: 0, drafts: 0 },
    );
  }, [filteredItems, today]);
  const visibleItems = useMemo(
    () =>
      filteredItems.filter((item) => {
        if (overviewFilter === "drafts") return item.status === "draft";
        if (overviewFilter === "overdue") {
          return item.status === "sent" && item.balanceCents > 0 && item.dueDate < today;
        }
        if (overviewFilter === "outstanding") return item.status === "sent" && item.balanceCents > 0;
        return true;
      }),
    [filteredItems, overviewFilter, today],
  );
  useEffect(() => {
    void Promise.all([
      requestJson<{ items: InvoiceListItem[] }>("/invoices", {
        authMode: "session",
      }),
      requestJson<{ items: ProjectOption[] }>("/invoices/projects", {
        authMode: "session",
      }),
    ])
      .then(([a, b]) => {
        setItems(a.items);
        setProjects(b.items);
        const preset = params.get("projectId");
        if (preset && b.items.some((p) => p.id === preset)) {
          setProjectId(preset);
          setCreating(true);
        }
      })
      .catch((e) => setError(String(e)));
  }, [params]);
  useEffect(() => {
    if (!projectId) {
      setPool([]);
      setSelected([]);
      setPoolLoading(false);
      return;
    }
    let active = true;
    setPoolLoading(true);
    void requestJson<{ items: InvoicePoolEntry[] }>(
      `/invoices/pool?projectId=${encodeURIComponent(projectId)}`,
      { authMode: "session" },
    )
      .then((r) => {
        if (active) {
          setPool(r.items);
          setSelected(r.items.map((entry) => entry.entryId));
          setPoolLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(String(e));
          setPoolLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [projectId]);
  const groups = useMemo(() => {
    const clients = new Map<
      string,
      {
        name: string;
        balanceCents: number;
        projects: Map<string, { name: string; invoices: InvoiceListItem[]; balanceCents: number }>;
      }
    >();
    for (const item of visibleItems) {
      let client = clients.get(item.clientId);
      if (!client) {
        client = { name: item.clientName, balanceCents: 0, projects: new Map() };
        clients.set(item.clientId, client);
      }
      let project = client.projects.get(item.projectId);
      if (!project) {
        project = {
          name: `${item.projectNumber} · ${item.projectName}`,
          invoices: [],
          balanceCents: 0,
        };
        client.projects.set(item.projectId, project);
      }
      project.invoices.push(item);
      if (item.status === "sent") {
        project.balanceCents += item.balanceCents;
        client.balanceCents += item.balanceCents;
      }
    }
    return [...clients.entries()];
  }, [visibleItems]);
  async function create() {
    if (!projectId || poolLoading) return;
    setBusy(true);
    setError("");
    try {
      const result = await requestJson<{ invoice: { id: string } }>(
        "/invoices",
        {
          authMode: "session",
          method: "POST",
          body: JSON.stringify({ projectId, entryIds: selected }),
        },
      );
      navigate(`/invoices/${result.invoice.id}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-6xl space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-sky-800">FINANCE</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Invoices</h1>
          <p className="mt-1 text-sm text-slate-600">
            Review invoices by client and project.
          </p>
          {canManagePayments && (
            <Link
              className="mt-2 inline-flex text-sm font-medium text-sky-800 hover:text-sky-950"
              to="/invoices/payments"
            >
              Payment reconciliation and client holds
            </Link>
          )}
        </div>
        {projects.length > 0 && (
          <button
            className="rounded-xl bg-sky-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-700 focus:ring-offset-2"
            onClick={() => setCreating((v) => !v)}
          >
            Create manual invoice
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}
      <section aria-label="Invoice summary" className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          aria-pressed={overviewFilter === "outstanding"}
          onClick={() => setOverviewFilter(overviewFilter === "outstanding" ? "all" : "outstanding")}
          className={`rounded-2xl border p-5 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-sky-700 focus:ring-offset-2 ${overviewFilter === "outstanding" ? "border-sky-900 bg-sky-900 text-white" : "border-slate-200 bg-white text-slate-950 hover:border-sky-300 hover:bg-sky-50/50"}`}
        >
          <span className={`block text-sm font-medium ${overviewFilter === "outstanding" ? "text-sky-100" : "text-slate-600"}`}>Outstanding balance</span>
          <span className="mt-2 block text-2xl font-semibold tracking-tight tabular-nums">{money(summary.outstandingCents)}</span>
          <span className={`mt-1 block text-xs ${overviewFilter === "outstanding" ? "text-sky-100" : "text-slate-500"}`}>Unpaid sent invoices matching search</span>
        </button>
        <button
          type="button"
          aria-pressed={overviewFilter === "overdue"}
          onClick={() => setOverviewFilter(overviewFilter === "overdue" ? "all" : "overdue")}
          className={`rounded-2xl border p-5 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2 ${overviewFilter === "overdue" ? "border-amber-700 bg-amber-700 text-white" : "border-amber-200 bg-amber-50/70 text-amber-950 hover:border-amber-400 hover:bg-amber-50"}`}
        >
          <span className={`block text-sm font-medium ${overviewFilter === "overdue" ? "text-amber-100" : "text-amber-900"}`}>Overdue balance</span>
          <span className="mt-2 block text-2xl font-semibold tracking-tight tabular-nums">{money(summary.overdueCents)}</span>
          <span className={`mt-1 block text-xs ${overviewFilter === "overdue" ? "text-amber-100" : "text-amber-800"}`}>Sent invoices past their due date</span>
        </button>
        <button
          type="button"
          aria-pressed={overviewFilter === "drafts"}
          onClick={() => setOverviewFilter(overviewFilter === "drafts" ? "all" : "drafts")}
          className={`rounded-2xl border p-5 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${overviewFilter === "drafts" ? "border-indigo-800 bg-indigo-800 text-white" : "border-slate-200 bg-white text-slate-950 hover:border-indigo-200 hover:bg-indigo-50/50"}`}
        >
          <span className={`block text-sm font-medium ${overviewFilter === "drafts" ? "text-indigo-100" : "text-slate-600"}`}>Draft invoices</span>
          <span className="mt-2 block text-2xl font-semibold tracking-tight tabular-nums">{summary.drafts}</span>
          <span className={`mt-1 block text-xs ${overviewFilter === "drafts" ? "text-indigo-100" : "text-slate-500"}`}>Awaiting review or issue</span>
        </button>
      </section>
      {creating && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">New manual invoice</h2>
          <label className="block text-sm">
            Project
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 focus:border-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-100"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setPool([]);
                setSelected([]);
                setPoolLoading(Boolean(e.target.value));
              }}
            >
              <option value="">Select a project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.client_name} · {p.project_number} · {p.name}
                </option>
              ))}
            </select>
          </label>
          {projectId && (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    Approved entries to include
                  </p>
                  <p className="text-xs text-slate-600">
                    Available entries are selected automatically. Fixed fee
                    hours are included for review; set their invoice amount on
                    the draft.
                  </p>
                </div>
                {!!pool.length && (
                  <div className="flex gap-3 text-sm">
                    <button
                      className="text-sky-800 underline"
                      onClick={() =>
                        setSelected(pool.map((entry) => entry.entryId))
                      }
                    >
                      Select all
                    </button>
                    <button
                      className="text-sky-800 underline"
                      onClick={() => setSelected([])}
                    >
                      Start blank
                    </button>
                  </div>
                )}
              </div>
              <div className="max-h-64 overflow-auto rounded border">
                {pool.map((entry) => (
                  <label
                    key={entry.entryId}
                    className="flex gap-3 border-b p-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(entry.entryId)}
                      onChange={(e) =>
                        setSelected((old) =>
                          e.target.checked
                            ? [...old, entry.entryId]
                            : old.filter((x) => x !== entry.entryId),
                        )
                      }
                    />
                    <span>
                      {entry.entryDate} · {entry.taskName} ·{" "}
                      {entry.hours.toFixed(2)} h · {money(entry.chargeCents)} ·{" "}
                      {entry.billingType}
                      <span className="block text-slate-500">{entry.note}</span>
                    </span>
                  </label>
                ))}
                {!pool.length && (
                  <p className="p-3 text-sm text-slate-500">
                    {poolLoading
                      ? "Loading approved time…"
                      : "No approved entries available. You can start a blank invoice."}
                  </p>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-600">
                {selected.length} {selected.length === 1 ? "entry" : "entries"}{" "}
                selected
              </p>
            </div>
          )}
          <button
            disabled={!projectId || busy || poolLoading}
            onClick={() => void create()}
            className="rounded bg-sky-800 px-4 py-2 text-white disabled:opacity-50"
          >
            {busy
              ? "Creating…"
              : selected.length
                ? "Create draft with time"
                : "Create blank draft"}
          </button>
        </section>
      )}
      <label className="block text-sm">
        Search invoices
        <input
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 shadow-sm placeholder:text-slate-400 focus:border-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-100"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Client, project, invoice number, or status"
        />
      </label>
      {overviewFilter !== "all" && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-slate-600">
            Showing {overviewFilter === "outstanding" ? "outstanding" : overviewFilter === "overdue" ? "overdue" : "draft"} invoices
          </p>
          <button
            type="button"
            className="font-medium text-sky-800 hover:text-sky-950"
            onClick={() => setOverviewFilter("all")}
          >
            Show all invoices
          </button>
        </div>
      )}
      {groups.map(([clientId, client]) => (
        <details key={clientId} open className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 bg-slate-50/80 px-5 py-4 font-semibold text-slate-900">
            <span>{client.name}</span>
            <span className="text-sm font-semibold tabular-nums text-slate-700">{money(client.balanceCents)}</span>
          </summary>
          <div className="space-y-3 p-4 sm:p-5">
            {[...client.projects.entries()].map(([id, project]) => (
              <details key={id} open className="overflow-hidden rounded-xl border border-slate-200">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 font-medium text-slate-800">
                  <span>{project.name}</span>
                  <span className="text-sm font-semibold tabular-nums text-slate-700">{money(project.balanceCents)}</span>
                </summary>
                <div className="divide-y">
                  {project.invoices.map((invoice) => (
                    <Link
                      key={invoice.id}
                      to={`/invoices/${invoice.id}`}
                      className="grid gap-1 border-slate-100 p-3 text-sm transition hover:bg-sky-50/70 focus:bg-sky-50 focus:outline-none sm:grid-cols-[minmax(0,1fr)_6rem_7rem_8rem]"
                    >
                      <span className="font-medium text-sky-800">
                        {invoice.invoiceNumber}
                      </span>
                      <span className="capitalize">{invoice.status}</span>
                      <span>{invoice.issueDate}</span>
                      <span className="text-right font-semibold tabular-nums text-slate-900">
                        {money(invoice.balanceCents)}
                      </span>
                    </Link>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </details>
      ))}
      {!groups.length && (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">
          {overviewFilter === "all" ? "No invoices match." : "No invoices match this filter and search."}
        </p>
      )}
    </main>
  );
}
