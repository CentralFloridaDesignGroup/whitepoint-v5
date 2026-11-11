import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  PhaseTemplate,
  Subdivision,
  SubdivisionBatch,
  SubdivisionBatchRow,
  SubdivisionListItem,
} from "@whitepoint/types";
import { requestJson } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import {
  Button,
  Checkbox,
  Dropdown,
  SearchableDropdown,
  Textarea,
  Textbox,
  Toggle,
} from "@whitepoint/ui";
import { STATE_OPTIONS, getCountyOptions } from "@whitepoint/types/constants";

type Candidate = {
  id: string;
  project_number: string;
  name: string;
  client_name: string;
};
type ParcelInput = {
  parcelType: string;
  block: string;
  label: string;
  platReference: string;
  streetAddress: string;
  parcelId: string;
};
type Preview = {
  rows: SubdivisionBatchRow[];
  tasks: PhaseTemplate["tasks"];
  templateRevision: number;
  parent: {
    projectNumber: string;
    clientName: string;
    stage: string;
    revision: number;
    managerName: string | null;
    contactName: string | null;
    payTableName: string | null;
    description: string;
    address: Record<string, unknown>;
  };
};
const blank = () => ({
  name: "",
  locality: "",
  unincorporated: false,
  county: "",
  state: "FL",
  platReference: "",
});

const parcelCollator = new Intl.Collator("en-US", {
  sensitivity: "base",
  numeric: true,
});
const parcelTypeOrder: Record<
  Subdivision["parcels"][number]["parcelType"],
  number
> = {
  lot: 0,
  tract: 1,
  parcel: 2,
  pad: 3,
};
const compareParcels = (
  a: Subdivision["parcels"][number],
  b: Subdivision["parcels"][number],
) =>
  parcelTypeOrder[a.parcelType] - parcelTypeOrder[b.parcelType] ||
  parcelCollator.compare(a.block, b.block) ||
  Number(!/^\d+$/.test(a.label.trim())) -
    Number(!/^\d+$/.test(b.label.trim())) ||
  parcelCollator.compare(a.label, b.label);

/** Passed as either:
 * `Unincorporated Areas (City) - County 'County' - State` or
 * `City - County 'County' - State`
 */
const parseLocation = (location: string) => {
  const parts = location.split(/\s+-\s+/);
  if (parts.length !== 3)
    return { locality: location, unincorporated: false, county: "", state: "" };
  const [localityPart, countyPart, state] = parts;
  const unincorporated = localityPart.startsWith("Unincorporated Areas");
  const locality = unincorporated
    ? localityPart.replace("Unincorporated Areas (", "").replace(")", "")
    : localityPart;
  const county = countyPart.replace("County '", "").replace("'", "");
  return { locality, unincorporated, county, state };
};

const splitRow = (line: string): ParcelInput => {
  const cells = line.split("\t");
  const [
    parcelType = "",
    block = "",
    label = "",
    platReference = "",
    streetAddress = "",
    parcelId = "",
  ] =
    cells.length === 1
      ? ["lot", "", cells[0]]
      : cells.length === 2
        ? ["lot", cells[0], cells[1]]
        : cells;
  return {
    parcelType: parcelType.trim().toLowerCase() || "lot",
    block: block.trim(),
    label: label.trim(),
    platReference: platReference.trim(),
    streetAddress: streetAddress.trim(),
    parcelId: parcelId.trim(),
  };
};

export function SubdivisionPage() {
  const { id } = useParams(),
    navigate = useNavigate(),
    auth = useAuth();
  const canManage = auth.hasPermission("subdivisions.manage");
  const canAssign =
    canManage &&
    auth.hasPermission("projects.view") &&
    auth.hasPermission("projects.create") &&
    auth.hasPermission("projects.manage.financials");
  const [items, setItems] = useState<SubdivisionListItem[]>([]),
    [record, setRecord] = useState<Subdivision | null>(null),
    [form, setForm] = useState(blank()),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState(""),
    [rangeStart, setRangeStart] = useState(""),
    [rangeEnd, setRangeEnd] = useState(""),
    [rangeBlock, setRangeBlock] = useState(""),
    [rangeType, setRangeType] = useState("lot");
  const [candidates, setCandidates] = useState<Candidate[]>([]),
    [candidateQuery, setCandidateQuery] = useState(""),
    [candidateId, setCandidateId] = useState("");
  const [templates, setTemplates] = useState<PhaseTemplate[]>([]),
    [templateId, setTemplateId] = useState(""),
    [parentId, setParentId] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [filter, setFilter] = useState(""),
    [transfer, setTransfer] = useState(false),
    [append, setAppend] = useState(false),
    [contract, setContract] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null),
    [batch, setBatch] = useState<SubdivisionBatch | null>(null),
    [phasePrices, setPhasePrices] = useState<Record<string, number>>({});
  const [pendingBatchId, setPendingBatchId] = useState("");
  const [editParcelId, setEditParcelId] = useState(""),
    [editParcel, setEditParcel] = useState<ParcelInput | null>(null);
  const [locationString, setLocationString] = useState("");

  useEffect(() => setPhasePrices({}), [templateId]);

  const rows = useMemo(
    () =>
      record?.parcels.filter((p) =>
        `${p.block} ${p.label} ${p.parcelId} ${p.assignment?.clientName || ""}`
          .toLowerCase()
          .includes(filter.toLowerCase()),
      ).sort(compareParcels) || [],
    [record, filter],
  );
  const selectedParcels =
    record?.parcels.filter((p) => selected.includes(p.id)) || [];
  const payload = {
    parentProjectId: parentId,
    parcelIds: selected,
    templateId,
    transfer,
    confirmContractSigned: contract,
    phasePrices,
  };
  async function load() {
    if (id && id !== "new") {
      const value = await requestJson<Subdivision>(
        `/records/subdivisions/${id}`,
        { authMode: "session" },
      );
      setRecord(value);
      setForm({
        name: value.name,
        ...parseLocation(value.location),
        platReference: value.platReference,
      });
      if (canAssign) {
        const batches = await requestJson<SubdivisionBatch[]>(
          `/records/subdivisions/${id}/batches`,
          { authMode: "session" },
        );
        setBatch(
          batches.find((b) => b.rows.some((r) => r.status !== "created")) ||
            null,
        );
                          }
    } else if (!id)
      setItems(
        await requestJson<SubdivisionListItem[]>("/records/subdivisions", {
          authMode: "session",
        }),
      );
  }

  useEffect(() => {
    if (form.unincorporated) {
      setLocationString(`Unincorporated Areas (${form.locality.trim()}) - ${form.county.trim()} County - ${form.state.trim().toUpperCase()}`);
    } else {
      setLocationString(`${form.locality.trim()} - ${form.county.trim()} County - ${form.state.trim().toUpperCase()}`);
    }
  }, [form.unincorporated, form.locality, form.county, form.state]);

  useEffect(() => {
    setError("");
    setNotice("");
    setPreview(null);
    setSelected([]);
    setRecord(null);
    if (id === "new") setForm(blank());
    void load().catch((e) => setError(String(e)));
  }, [id]);
  useEffect(() => {
    if (!id || !canManage) return;
    void requestJson<PhaseTemplate[]>("/settings/subdivision-templates", {
      authMode: "session",
    })
      .then(setTemplates)
      .catch((e) => setError(String(e)));
  }, [id, canManage]);
  useEffect(() => {
    if (!record || !canManage || !auth.hasPermission("projects.view")) return;
    const timer = setTimeout(() => {
      void requestJson<Candidate[]>(
        `/records/subdivisions/${record.id}/parent-candidates?q=${encodeURIComponent(candidateQuery)}`,
        { authMode: "session" },
      )
        .then(setCandidates)
        .catch((e) => setError(String(e)));
    }, 250);
    return () => clearTimeout(timer);
  }, [record?.id, candidateQuery, canManage]);
  async function action(task: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
      setNotice(message);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveSubdivision() {
    await action(
      async () => {
        const location = `${form.unincorporated ? "Unincorporated" : form.locality.trim()} - ${form.county.trim()} - ${form.state.trim().toUpperCase()}`;
        const value = await requestJson<Subdivision>(
          record
            ? `/records/subdivisions/${record.id}`
            : "/records/subdivisions",
          {
            authMode: "session",
            method: record ? "PUT" : "POST",
            body: JSON.stringify({
              name: form.name,
              location,
              platReference: form.platReference,
              ...(record ? { revision: record.revision } : {}),
            }),
          },
        );
        if (!record) navigate(`/subdivision/${value.id}`);
      },
      record ? "Subdivision saved." : "Subdivision created.",
    );
  }
  async function addParcels() {
    if (!record) return;
    const pasted = paste
      .split(/\r?\n/)
      .filter((x) => x.trim())
      .map(splitRow)
      .filter((x) => x.label);
    const start = Number(rangeStart),
      end = Number(rangeEnd);
    const hasRange = Boolean(rangeStart || rangeEnd);
    if (
      hasRange &&
      (!rangeStart ||
        !rangeEnd ||
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        end < start ||
        end - start >= 500)
    ) {
      setError("Enter a numeric range of at most 500 parcels.");
      return;
    }
    const ranged = hasRange
      ? Array.from({ length: end - start + 1 }, (_, i) => ({
          parcelType: rangeType,
          block: rangeBlock.trim(),
          label: String(start + i),
          platReference: "",
          streetAddress: "",
          parcelId: "",
        }))
      : [];
    const rows = [...pasted, ...ranged];
    if (!rows.length) {
      setError("Paste parcel rows or enter a valid numeric range.");
      return;
    }
    await action(async () => {
      await requestJson(`/records/subdivisions/${record.id}/parcels`, {
        authMode: "session",
        method: "POST",
        body: JSON.stringify({ rows, revision: record.revision }),
      });
      setPaste("");
      setRangeStart("");
      setRangeEnd("");
    }, `${rows.length} parcels added.`);
  }
  async function linkParent() {
    if (!record || !candidateId) return;
    await action(async () => {
      await requestJson(`/records/subdivisions/${record.id}/parents`, {
        authMode: "session",
        method: "POST",
        body: JSON.stringify({ projectId: candidateId }),
      });
      setCandidateId("");
    }, "Builder parent linked.");
  }
  function chooseParcel(parcelId: string) {
    setEditParcelId(parcelId);
    const value = record?.parcels.find((p) => p.id === parcelId);
    setEditParcel(
      value
        ? {
            parcelType: value.parcelType,
            block: value.block,
            label: value.label,
            platReference: value.platReference,
            streetAddress: value.streetAddress,
            parcelId: value.parcelId,
          }
        : null,
    );
  }
  async function saveParcel() {
    if (!record || !editParcel) return;
    await action(async () => {
      await requestJson(
        `/records/subdivisions/${record.id}/parcels/${editParcelId}`,
        {
          authMode: "session",
          method: "PUT",
          body: JSON.stringify({ ...editParcel, revision: record.revision }),
        },
      );
      chooseParcel("");
    }, "Parcel updated.");
  }
  async function review() {
    if (!record) return;
    setBusy(true);
    setError("");
    try {
      setPreview(
        await requestJson<Preview>(
          `/records/subdivisions/${record.id}/${append ? 'templates' : 'assignments'}/preview`,
          {
            authMode: "session",
            method: "POST",
            body: JSON.stringify(payload),
          },
        ),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function runBatch(current: SubdivisionBatch) {
    let value = current;
    for (let n = 0; n < Math.ceil(current.rows.length / 4); n++) {
      if (!value.rows.some((r) => r.status === "pending")) break;
      value = await requestJson<SubdivisionBatch>(
        `/records/subdivisions/batches/${value.id}/run`,
        { authMode: "session", method: "POST" },
      );
      setBatch(value);
    }
    return value;
  }
  async function commit() {
    if (!record || !preview) return;
    setBusy(true);
    setError("");
    const batchId = pendingBatchId || crypto.randomUUID();
    setPendingBatchId(batchId);
    try {
      const created = await requestJson<SubdivisionBatch>(
        `/records/subdivisions/${record.id}/${append ? 'templates' : 'assignments'}/batches`,
        {
          authMode: "session",
          method: "POST",
          body: JSON.stringify({
            ...payload,
            batchId,
            parentRevision: preview.parent.revision,
            templateRevision: preview.templateRevision,
          }),
        },
      );
      setBatch(created);
      const result = await runBatch(created);
      setPreview(null);
      setSelected([]);
      setPendingBatchId("");
      setNotice(
        `${result.rows.filter((r) => r.status === "created").length} ${append ? 'lot projects updated' : 'lot projects created'}. ${result.rows.filter((r) => r.status === "failed").length} rows need review.`,
      );
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function retryBatch() {
    if (!batch) return;
    setBusy(true);
    setError("");
    try {
      let result = batch.rows.some((r) => r.status === "pending")
        ? await runBatch(batch)
        : batch;
      const passes = Math.ceil(
        result.rows.filter((r) => r.status === "failed").length / 4,
      );
      for (let index = 0; index < passes; index++) {
        result = await requestJson<SubdivisionBatch>(
          `/records/subdivisions/batches/${batch.id}/run`,
          { authMode: "session", method: "POST" },
        );
        setBatch(result);
      }
      setBatch(result);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const toggle = (parcelId: string) => {
    setSelected((current) =>
      current.includes(parcelId)
        ? current.filter((x) => x !== parcelId)
        : [...current, parcelId],
    );
    setPreview(null);
  };
  return (
    <main className="mx-auto max-w-7xl space-y-5 pb-10">
      <header>
        <Link to="/subdivision" className="text-sm text-sky-800">
          Subdivisions
        </Link>
        <h1 className="mt-1 text-3xl font-semibold">
          {record?.name || (id === "new" ? "New subdivision" : "Subdivisions")}
        </h1>
        <p className="text-sm text-slate-600">
          Each recorded plat phase has its own shared parcel inventory.
        </p>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          {notice}
        </p>
      )}
      {!id && (
        <>
          <div className="flex justify-end">
            {canManage && (
              <Link
                className="rounded-lg bg-sky-800 px-4 py-2 text-sm font-medium text-white"
                to="/subdivision/new"
              >
                New subdivision
              </Link>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((item) => (
              <Link
                key={item.id}
                to={`/subdivision/${item.id}`}
                className="rounded-xl border bg-white p-4 hover:border-sky-500"
              >
                <strong>{item.name}</strong>
                <p className="text-sm text-slate-600">
                  {item.location} · {item.platReference}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {item.parcelCount} parcels · {item.assignedCount} assigned
                </p>
              </Link>
            ))}
          </div>
        </>
      )}
      {/* Plat Information Section. Visible on both new subdivisions and existing subdivisions when the user can manage them */}
      {(id === "new" || record) && canManage && (
        <section className="rounded-lg bg-white p-5 shadow-md">
          <h2 className="mb-3 font-semibold">Plat Information</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <Textbox
              label="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
                        />
            <Textbox
              label="Recorded plat reference"
              value={form.platReference}
              onChange={(e) =>
                setForm({ ...form, platReference: e.target.value })
              }
              placeholder="PB 88/12 or INS 1234567890"
            />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Textbox
                label="City or town"
                value={form.locality}
                disabled={form.unincorporated}
                onChange={(e) => setForm({ ...form, locality: e.target.value })}
                placeholder="City name"
              />
              <Toggle
                label="Unincorporated area"
                checked={form.unincorporated}
                onChange={(e) =>
                  setForm({ ...form, unincorporated: e })
                }
              />
            </div>

            <SearchableDropdown
              label="State"
              placeholder="Select"
              value={form.state}
              options={STATE_OPTIONS}
              onChange={(value) =>
                setForm({ ...form, state: value, county: "" })
              }
            />
            <SearchableDropdown
              disabled={!form.state}
              label="County"
              placeholder="Select"
              value={form.county}
              options={getCountyOptions(form.state)}
              onChange={(value) => setForm({ ...form, county: value })}
            />
          </div>

          <p className="mt-2 text-xs text-slate-600">Location: {locationString}</p>
          <div className="flex justify-end">
            <Button
              disabled={
                busy ||
                !form.name.trim() ||
                (!form.unincorporated && !form.locality.trim()) ||
                !form.county.trim() ||
                !form.state.trim()
              }
              onClick={() => void saveSubdivision()}
            >
              Save subdivision
            </Button>
          </div>
        </section>
      )}
      {record && (
        <>
        <div className="flex flex-col lg:flex-row gap-4">
        {/* Parcel Inventory Section. Visible only when the user can manage the subdivision */}
          {canManage && (
            <section className="rounded-xl border bg-white p-5">
              <h2 className="font-semibold">Add parcel inventory</h2>
              <p className="mb-3 text-sm text-slate-600">
                Paste tab separated rows: type, block, label, plat reference,
                address, parcel ID. Block and trailing fields may be blank.
              </p>
              <Textarea
                aria-label="Parcel rows"
                className="h-28 font-mono"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder={"lot\tA\t1\ntract\t\tC"}
              />
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Dropdown
                  label="Type"
                  value={rangeType}
                  options={["lot", "tract", "parcel", "pad"].map((value) => ({
                    value,
                    label: value,
                  }))}
                  onChange={setRangeType}
                />
                <Textbox
                  label="Block"
                  value={rangeBlock}
                  onChange={(e) => setRangeBlock(e.target.value)}
                />
                <Textbox
                  label="From"
                  className="w-24"
                  type="number"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                />
                <Textbox
                  label="Through"
                  className="w-24"
                  type="number"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                />
                <Button
                  disabled={busy}
                  onClick={() => void addParcels()}
                >
                  Add parcels
                </Button>
              </div>
            </section>
          )}
          {/* Builder Parent Projects Section. Visible only when the user can manage the subdivision and has the appropriate permission */}
          {canManage && auth.hasPermission("projects.view") && (
            <section className="rounded-xl border bg-white p-5">
              <h2 className="font-semibold">Builder parent projects</h2>
              <p className="mb-3 text-sm text-slate-600">
                A parent can carry its own tasks, time, and invoices. Create one
                or link an existing project for this plat phase.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  className="rounded border px-3 py-2 text-sm text-sky-800"
                  to={`/project/new?subdivision=${record.id}`}
                >
                  Create parent project
                </Link>
                <SearchableDropdown
                  label="Existing project"
                  placeholder="Search project or client"
                  value={candidateId}
                  options={candidates.map((project) => ({
                    value: project.id,
                    label: `${project.project_number} · ${project.name} · ${project.client_name}`,
                  }))}
                  onChange={setCandidateId}
                  onSearch={(query) => {
                    setCandidateQuery(query);
                    setCandidateId("");
                  }}
                />
                <Button
                  disabled={busy || !candidateId}
                  onClick={() => void linkParent()}
                >
                  Link parent
                </Button>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {record.parents.map((p) => (
                  <li key={p.projectId}>
                    <Link
                      className="text-sky-800 underline"
                      to={`/project/${p.projectId}`}
                    >
                      {p.projectNumber} · {p.projectName}
                    </Link>{" "}
                    · {p.clientName} · QBO {p.qboSyncStatus}
                  </li>
                ))}
              </ul>
            </section>
          )}
          </div>
          <section className="rounded-xl border bg-white p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">
                Parcels ({record.parcels.length})
              </h2>
              <Textbox
                aria-label="Filter parcels"
                className="max-w-xs"
                placeholder="Filter block, label, builder"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="sticky top-0 bg-slate-100">
                  <tr>
                    <th className="p-2">
                      {canAssign && (
                        <Checkbox
                          aria-label="Select visible parcels"
                          checked={
                            rows.some((r) => append ? Boolean(r.assignment?.active && (!parentId || r.assignment.parentProjectId === parentId)) : !r.assignment || transfer) &&
                            rows.filter((r) => append ? Boolean(r.assignment?.active && (!parentId || r.assignment.parentProjectId === parentId)) : !r.assignment || transfer).every((r) => selected.includes(r.id))
                          }
                          onChange={(e) => {
                            const ids = rows
                              .filter((r) => append ? Boolean(r.assignment?.active && (!parentId || r.assignment.parentProjectId === parentId)) : !r.assignment || transfer)
                              .map((r) => r.id);
                            setSelected(
                              e.target.checked
                                ? Array.from(new Set([...selected, ...ids]))
                                : selected.filter((x) => !ids.includes(x)),
                            );
                            setPreview(null);
                          }}
                        />
                      )}
                    </th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Block</th>
                    <th className="p-2">Label</th>
                    <th className="p-2">Plat / parcel</th>
                    <th className="p-2">Builder and project</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="p-2">
                        {canAssign && (
                          <Checkbox
                            aria-label={`Select ${p.block} ${p.label}`}
                            checked={selected.includes(p.id)}
                            disabled={append ? !p.assignment?.active || Boolean(parentId && p.assignment.parentProjectId !== parentId) : Boolean(p.assignment) && !transfer}
                            onChange={() => toggle(p.id)}
                          />
                        )}
                      </td>
                      <td className="p-2 capitalize">{p.parcelType}</td>
                      <td className="p-2">{p.block}</td>
                      <td className="p-2 font-medium">{p.label}</td>
                      <td className="p-2">
                        {p.platReference || record.platReference}
                        <span className="block text-xs text-slate-500">
                          {p.parcelId || p.streetAddress}
                        </span>
                      </td>
                      <td className="p-2">
                        {p.assignment?.projectId ? (
                          <Link
                            className="text-sky-800 underline"
                            to={`/project/${p.assignment.projectId}`}
                          >
                            {p.assignment.clientName} ·{" "}
                            {p.assignment.projectNumber}
                          </Link>
                        ) : (
                          p.assignment?.clientName || "Unassigned"
                        )}
                      </td>
                      <td className="p-2">
                        {p.assignment?.projectId ? (
                          <>
                            {p.assignment.unfinishedTasks} open phases ·{" "}
                            {p.assignment.unpaidInvoices} open invoices
                            <span className="block text-xs">
                              QBO {p.assignment.qboSyncStatus}
                            </span>
                            {p.appliedTemplates.length > 0 && (
                              <span className="block text-xs text-slate-600">
                                Templates: {p.appliedTemplates.map((application) => application.name).join(", ")}
                              </span>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {canAssign && (
            <section className="rounded-xl border bg-white p-5">
              <h2 className="font-semibold">
                {append ? "Add template to" : "Assign"} selected parcels ({selected.length})
              </h2>
              <p className="mb-3 text-sm text-slate-600">
                {append
                  ? "Add this template as new tasks on the selected builder's existing lot projects. Repeat whenever another phase is needed."
                  : "Review project numbers and copied phase prices before creating child projects. One builder and price set apply to this batch."}
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <SearchableDropdown
                  label="Builder parent"
                  placeholder="Select parent"
                  value={parentId}
                  options={record.parents.map((parent) => ({
                    value: parent.projectId,
                    label: `${parent.projectNumber} · ${parent.clientName}`,
                  }))}
                  onChange={(value) => {
                    setParentId(value);
                    if (append) setSelected([]);
                    setPreview(null);
                  }}
                />
                <Dropdown
                  label="Phase template"
                  placeholder="Select template"
                  value={templateId}
                  options={templates.map((template) => ({
                    value: template.id,
                    label: template.name,
                  }))}
                  onChange={(value) => {
                    setTemplateId(value);
                    setPreview(null);
                  }}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-5 text-sm">
                <Checkbox
                  label="Add template to existing lot projects"
                  checked={append}
                  onChange={(e) => {
                    setAppend(e.target.checked);
                    setTransfer(false);
                    setSelected([]);
                    setPreview(null);
                  }}
                />
                <Checkbox
                  label="Transfer assigned lots with review"
                  checked={transfer}
                  onChange={(e) => {
                    setTransfer(e.target.checked);
                    setAppend(false);
                    setSelected([]);
                    setPreview(null);
                  }}
                />
                <Checkbox
                  label="Confirm signed contract for active projects"
                  checked={contract}
                  onChange={(e) => {
                    setContract(e.target.checked);
                    setPreview(null);
                  }}
                />
              </div>
              {transfer && selectedParcels.some((p) => p.assignment) && (
                <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900">
                  Old lot projects will close to new time entries. Their work,
                  invoices, and payment collection remain.
                </p>
              )}
              <Button
                className="mt-3"
                disabled={busy || !selected.length || !parentId || !templateId}
                onClick={() => void review()}
              >
                Review batch
              </Button>
              {preview && (
                <div className="mt-5 rounded border p-4">
                  <h3 className="font-semibold">
                    Review: {preview.parent.clientName} ·{" "}
                    {preview.parent.projectNumber}
                  </h3>
                  <p className="text-sm">
                    Stage: {preview.parent.stage}. These prices apply to every
                    selected lot:
                  </p>
                  <ul className="my-2 grid gap-2 text-sm sm:grid-cols-2">
                    {preview.tasks.map((t) => (
                      <li key={t.taskId} className="flex items-center gap-2">
                        <span>
                          {t.taskId} · {t.taskName} · {t.billType}
                        </span>
                        <Textbox
                          label="Price ($)"
                          className="w-28"
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={(t.contractAmountCents / 100).toFixed(2)}
                          onChange={(e) =>
                            setPhasePrices((current) => ({
                              ...current,
                              [t.taskId]: Math.round(
                                Number(e.target.value) * 100,
                              ),
                            }))
                          }
                        />
                      </li>
                    ))}
                  </ul>
                  <div className="max-h-48 overflow-auto text-sm">
                    {preview.rows.map((r) => (
                      <p key={r.parcelId}>
                        {r.projectNumber}
                        {r.previousProjectId
                          ? " · transfers existing assignment"
                          : ""}
                        {append && r.taskIds?.length ? ` · task IDs ${r.taskIds.join(', ')}` : ''}
                      </p>
                    ))}
                  </div>
                  {!append && selectedParcels
                    .filter((p) => p.assignment)
                    .map((p) => (
                      <p key={p.id} className="mt-1 text-sm text-amber-900">
                        Current {p.block} {p.label}: {p.assignment?.clientName},{" "}
                        {p.assignment?.unfinishedTasks} unfinished phases,{" "}
                        {p.assignment?.unpaidInvoices} open invoices
                      </p>
                    ))}
                  <Button
                    className="mt-3"
                    disabled={busy}
                    onClick={() => void commit()}
                  >
                    {append ? 'Add template to' : 'Create'} {preview.rows.length} lot projects
                  </Button>
                </div>
              )}
              {batch && (
                <div className="mt-5 rounded border p-4">
                  <h3 className="font-semibold">Batch result</h3>
                  <p className="text-sm">
                    {batch.rows.filter((r) => r.status === "created").length}{" "}
                    created ·{" "}
                    {batch.rows.filter((r) => r.status === "failed").length}{" "}
                    failed ·{" "}
                    {batch.rows.filter((r) => r.status === "pending").length}{" "}
                    pending
                  </p>
                  {batch.rows
                    .filter((r) => r.error)
                    .map((r) => (
                      <p key={r.parcelId} className="text-sm text-red-700">
                        {r.projectNumber}: {r.error}
                      </p>
                    ))}
                  {batch.rows.some((r) => r.status !== "created") && (
                    <Button
                      className="mt-3"
                      disabled={busy}
                      onClick={() => void retryBatch()}
                    >
                      Retry pending rows
                    </Button>
                  )}
                </div>
              )}
            </section>
          )}
          {canManage && (
            <section className="rounded-xl border bg-white p-5">
              <h2 className="mb-3 font-semibold">Edit a parcel</h2>
              <SearchableDropdown
                label="Parcel"
                className="max-w-sm"
                placeholder="Select parcel"
                value={editParcelId}
                options={record.parcels.map((parcel) => ({
                  value: parcel.id,
                  label: `${parcel.block ? `${parcel.block} · ` : ""}${parcel.label} · ${parcel.parcelType}`,
                }))}
                onChange={chooseParcel}
              />
              {editParcel && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(
                    [
                      ["parcelType", "Parcel type"],
                      ["block", "Block"],
                      ["label", "Label"],
                      ["platReference", "Plat reference"],
                      ["streetAddress", "Street address"],
                      ["parcelId", "Parcel ID"],
                    ] as const
                  ).map(([key, label]) => (
                    <Textbox
                      key={key}
                      label={label}
                      value={editParcel[key]}
                      onChange={(e) =>
                        setEditParcel((current) =>
                          current ? { ...current, [key]: e.target.value } : current,
                        )
                      }
                    />
                  ))}
                  <Button disabled={busy} onClick={() => void saveParcel()}>
                    Save parcel
                  </Button>
                </div>
              )}
            </section>
          )}
          {preview && (
            <section className="rounded-xl border bg-white p-4 text-sm">
              <h2 className="font-semibold">Inherited project details</h2>
              <p>
                Manager: {preview.parent.managerName || "Unassigned"} · Contact:{" "}
                {preview.parent.contactName || "Unassigned"} · Pay table:{" "}
                {preview.parent.payTableName || "None"}
              </p>
              <p>Scope: {preview.parent.description}</p>
              <p>
                Address: {String(preview.parent.address.line1 || "")}{" "}
                {String(preview.parent.address.city || "")}{" "}
                {String(preview.parent.address.state || "")}
              </p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
