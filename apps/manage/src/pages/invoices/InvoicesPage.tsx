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
        projects: Map<string, { name: string; invoices: InvoiceListItem[] }>;
      }
    >();
    for (const item of items.filter((i) =>
      `${i.clientName} ${i.projectName} ${i.projectNumber} ${i.invoiceNumber} ${i.status}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )) {
      let client = clients.get(item.clientId);
      if (!client) {
        client = { name: item.clientName, projects: new Map() };
        clients.set(item.clientId, client);
      }
      let project = client.projects.get(item.projectId);
      if (!project) {
        project = {
          name: `${item.projectNumber} · ${item.projectName}`,
          invoices: [],
        };
        client.projects.set(item.projectId, project);
      }
      project.invoices.push(item);
    }
    return [...clients.entries()];
  }, [items, query]);
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
    <main className="mx-auto max-w-6xl space-y-5 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Invoices</h1>
          <p className="text-sm text-slate-600">
            Review invoices by client and project.
          </p>
          {canManagePayments && (
            <Link
              className="text-sm text-sky-800 underline"
              to="/invoices/payments"
            >
              Payment reconciliation and client holds
            </Link>
          )}
        </div>
        {projects.length > 0 && (
          <button
            className="rounded-lg bg-sky-800 px-4 py-2 text-white"
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
      {creating && (
        <section className="space-y-4 rounded-xl border bg-white p-5">
          <h2 className="text-lg font-semibold">New manual invoice</h2>
          <label className="block text-sm">
            Project
            <select
              className="mt-1 w-full rounded border p-2"
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
          className="mt-1 w-full rounded-lg border bg-white p-3"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Client, project, invoice number, or status"
        />
      </label>
      {groups.map(([clientId, client]) => (
        <details key={clientId} open className="rounded-xl border bg-white">
          <summary className="cursor-pointer p-4 font-semibold">
            {client.name}
          </summary>
          <div className="space-y-3 px-4 pb-4">
            {[...client.projects.entries()].map(([id, project]) => (
              <details key={id} open className="rounded-lg border">
                <summary className="cursor-pointer bg-slate-50 p-3 font-medium">
                  {project.name}
                </summary>
                <div className="divide-y">
                  {project.invoices.map((invoice) => (
                    <Link
                      key={invoice.id}
                      to={`/invoices/${invoice.id}`}
                      className="grid gap-1 p-3 text-sm hover:bg-sky-50 sm:grid-cols-[1fr_6rem_7rem_7rem]"
                    >
                      <span className="font-medium text-sky-800">
                        {invoice.invoiceNumber}
                      </span>
                      <span className="capitalize">{invoice.status}</span>
                      <span>{invoice.issueDate}</span>
                      <span className="text-right font-medium">
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
        <p className="rounded-xl border bg-white p-5 text-slate-600">
          No invoices match.
        </p>
      )}
    </main>
  );
}
