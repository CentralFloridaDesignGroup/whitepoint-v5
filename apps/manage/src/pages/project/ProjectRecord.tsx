import { useEffect, useMemo, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import type {
  Project,
  ProjectInput,
  ProjectAddress,
  ProjectContact,
  RecordTask,
} from "@whitepoint/types";
import { requestJson } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { useUnsavedChanges } from "../settings/useUnsavedChanges";
import { SaveBar, Tabs } from "../common/RecordControls";
import { RecordAuditTab, type RecordAuditRow } from "../common/RecordAuditTab";
import {
  ProjectAccountingTab,
  ProjectContactsTab,
  ProjectGeneralTab,
  ProjectInvoicesTab,
  ProjectTasksTab,
  type PayTableChoice,
  type ProjectChoice,
} from "./ProjectRecordTabs";
import { ProjectTimeEntries } from "./ProjectTimeEntries";
import { ProjectPoDocuments } from './ProjectPoDocuments';

const emptyAddress = (): Partial<ProjectAddress> => ({
  line1: "",
  city: "",
  state: "",
  postalCode: "",
  county: "",
  parcelId: "",
  isUnincorporated: false,
  latitude: null,
  longitude: null,
});
const blank = (clientId = ""): ProjectInput => ({
  clientId,
  name: "",
  projectNumber: "",
  stage: "opportunity",
  active: true,
  description: "",
  managerUserId: "",
  contactId: "",
  payTableId: null,
  poNumber: '',
  startDate: null,
  dueDate: null,
  address: emptyAddress(),
  contacts: [],
  tasks: [],
  contractPriceCents: 0,
  budgetCents: 0,
});
function toDraft(
  value: Project,
  copy = false,
): ProjectInput & { revision?: number } {
  return {
    clientId: value.clientId,
    name: value.name,
    projectNumber: copy ? "" : value.projectNumber,
    stage: copy ? "opportunity" : value.stage,
    active: copy ? true : value.active,
    description: value.description,
    managerUserId: value.managerUserId || "",
    contactId: value.contactId,
    payTableId: value.payTableId,
    poNumber: copy ? '' : value.poNumber,
    startDate: value.startDate,
    dueDate: value.dueDate,
    address: { ...value.address },
    contacts: value.contacts
      .filter((x) => x.role !== "projectManager" && x.role !== "clientPoc")
      .map((x) => ({ ...x })),
    tasks: value.tasks.map((x) => ({
      ...x,
      id: copy ? crypto.randomUUID() : x.id,
      taskId: copy ? "" : x.taskId,
    })),
    contractPriceCents: value.accounting.contractPriceCents,
    budgetCents: value.accounting.budgetCents,
    revision: copy ? undefined : value.revision,
  };
}
const tabs = [
  "General",
  "Contacts",
  "Tasks",
  "Time entries",
  "Accounting",
  "Invoices",
  "Audit",
];

export function ProjectRecordPage() {
  const { id } = useParams(),
    [params] = useSearchParams(),
    navigate = useNavigate(),
    auth = useAuth();
  const isNew = !id,
    copyId = params.get("copy"),
    startingClient = params.get("client") || "";
  const [record, setRecord] = useState<Project | null>(null),
    [draft, setDraft] = useState<ProjectInput & { revision?: number }>(() =>
      blank(startingClient),
    ),
    [saved, setSaved] = useState<ProjectInput & { revision?: number }>(() =>
      blank(startingClient),
    );
  const [clients, setClients] = useState<ProjectChoice[]>([]),
    [contacts, setContacts] = useState<ProjectChoice[]>([]),
    [users, setUsers] = useState<ProjectChoice[]>([]),
    [projectManagers, setProjectManagers] = useState<ProjectChoice[]>([]),
    [audit, setAudit] = useState<RecordAuditRow[]>([]),
    [nextNumber, setNextNumber] = useState("");
  const [payTables, setPayTables] = useState<PayTableChoice[]>([]);
  const [tab, setTab] = useState("General"),
    [editing, setEditing] = useState(isNew),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(saved),
    [draft, saved],
  );
  const allowNextNavigation = useUnsavedChanges(dirty);
  useEffect(() => {
    let live = true;
    void Promise.all([
      requestJson<ProjectChoice[]>("/records/lookups/clients", {
        authMode: "session",
      }),
      requestJson<ProjectChoice[]>("/records/lookups/users", {
        authMode: "session",
      }),
      requestJson<ProjectChoice[]>("/records/lookups/project-managers", {
        authMode: "session",
      }),
      requestJson<{ nextProjectNumber: string }>(
        "/records/projects/next-number",
        { authMode: "session" },
      ),
    ])
      .then(([c, u, managers, n]) => {
        if (live) {
          setClients(c);
          setUsers(u);
          setProjectManagers(managers);
          setNextNumber(n.nextProjectNumber);
        }
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!auth.hasPermission("timesheets.rates.view")) return;
    void requestJson<{ tables: PayTableChoice[] }>(
      "/timesheets/configuration",
      { authMode: "session" },
    )
      .then((x) => setPayTables(x.tables))
      .catch((e) => setError(String(e)));
  }, [auth]);
  useEffect(() => {
    let live = true;
    setError("");
    if (!id && !copyId) {
      const next = blank(startingClient);
      setRecord(null);
      setDraft(next);
      setSaved(next);
      setEditing(true);
      return;
    }
    void requestJson<Project>(
      `/records/projects/${encodeURIComponent(id || copyId || "")}`,
      { authMode: "session" },
    )
      .then((value) => {
        if (!live) return;
        const next = toDraft(value, !id);
        setRecord(id ? value : null);
        setDraft(next);
        setSaved(next);
        setEditing(!id);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [id, copyId, startingClient]);
  useEffect(() => {
    if (!draft.clientId) {
      setContacts([]);
      return;
    }
    let live = true;
    void requestJson<ProjectChoice[]>(
      `/records/lookups/clients/${draft.clientId}/contacts`,
      { authMode: "session" },
    )
      .then((value) => {
        if (live) setContacts(value);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [draft.clientId]);
  useEffect(() => {
    if (!id) return;
    let live = true;
    void requestJson<RecordAuditRow[]>(`/records/projects/${id}/audit`, {
      authMode: "session",
    })
      .then((x) => {
        if (live) setAudit(x);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [id]);
  const canEdit = isNew
      ? auth.hasPermission("projects.create")
      : Boolean(record?.capabilities.edit),
    canStatus = isNew ? false : Boolean(record?.capabilities.status),
    canMoney = isNew
      ? auth.hasPermission("projects.manage.financials")
      : Boolean(record?.capabilities.financials),
    basicEditing = editing && canEdit;
  const update = (patch: Partial<ProjectInput>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const taskChange = (index: number, patch: Partial<RecordTask>) =>
    setDraft((current) => ({
      ...current,
      tasks: (current.tasks || []).map((x, i) =>
        i === index ? { ...x, ...patch } : x,
      ),
    }));
  const roleChange = (index: number, patch: Partial<ProjectContact>) =>
    setDraft((current) => ({
      ...current,
      contacts: (current.contacts || []).map((x, i) =>
        i === index ? { ...x, ...patch } : x,
      ),
    }));
  async function save() {
    if ((!canEdit && !canStatus) || busy) return;
    let confirmContractSigned = false;
    if (draft.stage === "active" && record?.stage !== "active") {
      confirmContractSigned = window.confirm(
        "Confirm that the contract is signed and activate this project?",
      );
      if (!confirmContractSigned) return;
    }
    setBusy(true);
    setError("");
    try {
      const stageOnly = !canEdit && canStatus;
      const value = await requestJson<Project>(
        stageOnly
          ? `/records/projects/${id}/stage`
          : id
            ? `/records/projects/${id}`
            : "/records/projects",
        {
          authMode: "session",
          method: stageOnly || id ? "PUT" : "POST",
          body: JSON.stringify(
            stageOnly
              ? {
                  stage: draft.stage,
                  active: draft.active !== false,
                  revision: draft.revision,
                  confirmContractSigned,
                }
              : { ...draft, confirmContractSigned },
          ),
        },
      );
      setRecord(value);
      const next = toDraft(value);
      setDraft(next);
      setSaved(next);
      setEditing(false);
      if (!id) { allowNextNavigation(); navigate(`/project/${value.id}`, { replace: true }); }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function cancel() {
    if (isNew) {
      allowNextNavigation();
      navigate("/project");
      return;
    }
    setDraft(saved);
    setEditing(false);
    setError("");
  }
  async function archive() {
    if (!record || !window.confirm("Archive this project?")) return;
    setBusy(true);
    try {
      await requestJson(`/records/projects/${record.id}/archive`, {
        authMode: "session",
        method: "POST",
      });
      allowNextNavigation();
      navigate("/project");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    if (!record) return;
    setBusy(true);
    try {
      await requestJson(`/records/projects/${record.id}/qbo/retry`, {
        authMode: "session",
        method: "POST",
      });
      setRecord(
        await requestJson<Project>(`/records/projects/${record.id}`, {
          authMode: "session",
        }),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-7xl space-y-5 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/project" className="text-sm text-sky-800 hover:underline">
            Projects
          </Link>
          <h1 className="mt-2 text-3xl font-semibold">
            {isNew ? "New project" : record?.name || "Loading project…"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {record?.projectNumber || nextNumber || "Number assigned on save"} ·{" "}
            {record?.stage || "Opportunity"}{" "}
            {record && `· QBO ${record.qboSyncStatus}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {record && (
            <Link
              to={`/project/new?copy=${record.id}`}
              className="rounded-lg border bg-white px-4 py-2 text-sm"
            >
              Copy
            </Link>
          )}
          {!editing && (canEdit || canStatus) && (
            <button
              className="rounded-lg bg-sky-800 px-4 py-2 text-sm font-medium text-white"
              onClick={() => setEditing(true)}
            >
              Unlock
            </button>
          )}
          {record?.capabilities.archive && !editing && (
            <button
              className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm text-red-700"
              onClick={() => void archive()}
            >
              Archive
            </button>
          )}
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {record?.qboSyncStatus === "failed" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          QuickBooks sync failed: {record.qboSyncError}{" "}
          {auth.hasPermission("company.qbo.resync") && (
            <button
              className="ml-2 font-semibold text-sky-800"
              onClick={() => void retry()}
            >
              Retry
            </button>
          )}
        </p>
      )}
      <Tabs
        names={isNew ? tabs.filter((name) => name !== "Time entries") : tabs}
        active={tab}
        onChange={setTab}
      />
      {tab === "Time entries" && record && (
        <ProjectTimeEntries
          key={record.id}
          projectId={record.id}
          showFinancials={
            auth.hasPermission("projects.view.financials") &&
            auth.hasPermission("timesheets.rates.view")
          }
        />
      )}
      {tab === "General" && (<>
        <ProjectGeneralTab
          draft={draft}
          record={record}
          editing={editing}
          basicEditing={basicEditing}
          canStatus={canStatus}
          canMoney={canMoney}
          canViewRates={auth.hasPermission("timesheets.rates.view")}
          canViewFinancials={auth.hasPermission("projects.view.financials")}
          nextNumber={nextNumber}
          clients={clients}
          contacts={contacts}
          projectManagers={projectManagers}
          payTables={payTables}
          update={update}
        />
        {record&&<ProjectPoDocuments projectId={record.id} documents={record.poDocuments} editable={record.capabilities.edit}/>}
      </>)}
      {tab === "Contacts" && (
        <ProjectContactsTab
          draft={draft}
          basicEditing={basicEditing}
          users={users}
          contacts={contacts}
          update={update}
          roleChange={roleChange}
        />
      )}
      {tab === "Tasks" && (
        <ProjectTasksTab
          draft={draft}
          record={record}
          editing={editing}
          basicEditing={basicEditing}
          canMoney={canMoney}
          canViewFinancials={auth.hasPermission("projects.view.financials")}
          users={users}
          update={update}
          taskChange={taskChange}
        />
      )}
      {tab === "Accounting" && (
        <ProjectAccountingTab
          draft={draft}
          record={record}
          basicEditing={basicEditing}
          canMoney={canMoney}
          canViewRates={auth.hasPermission("timesheets.rates.view")}
          canViewFinancials={auth.hasPermission("projects.view.financials")}
          update={update}
        />
      )}
      {tab === "Invoices" && (
        <ProjectInvoicesTab
          record={record}
          canViewFinancials={auth.hasPermission("projects.view.financials")}
        />
      )}
      {tab === "Audit" && <RecordAuditTab audit={audit} />}
      <SaveBar
        editing={editing}
        busy={busy}
        canSave={canEdit || canStatus}
        onSave={() => void save()}
        onCancel={cancel}
      />
    </main>
  );
}
