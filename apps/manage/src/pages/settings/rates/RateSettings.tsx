import { useEffect, useState } from "react";
import { requestJson } from "../../../api/client";
import { useAuth } from "../../../auth/AuthContext";
import { CurrencyField } from "../../common/CurrencyField";
import { SettingsFrame } from "../SettingsFrame";
import { useUnsavedChanges } from "../useUnsavedChanges";
import { showNotification } from "@whitepoint/ui/layout";
import { Button, Textbox, Toggle } from "@whitepoint/ui/input";

type Position = { id: string; localId: string; name: string; active: boolean };
type Rate = { positionId: string; rateCents: number };
type Table = {
  id: string;
  name: string;
  active: boolean;
  expiresOn: string | null;
  isDefault: boolean;
  undefinedRateCents: number;
  rates: Rate[];
};
type Data = { revision: number; positions: Position[]; tables: Table[] };
export function RateSettings() {
  const auth = useAuth(),
    [value, setValue] = useState<Data>({
      revision: 1,
      positions: [],
      tables: [],
    }),
    [saved, setSaved] = useState(
      JSON.stringify({ revision: 1, positions: [], tables: [] }),
    ),
    [busy, setBusy] = useState(false),
    [positionSearch, setPositionSearch] = useState("");
  const editable = auth.hasPermission("timesheets.rates.manage"),
    dirty = JSON.stringify(value) !== saved;
  useUnsavedChanges(dirty);
  async function load() {
    const data = await requestJson<{
      revision: number;
      positions: Array<{
        id: string;
        local_id: string | null;
        name: string;
        active: number;
      }>;
      tables: Array<{
        id: string;
        name: string;
        active: number;
        expires_on: string | null;
        is_default: number;
        undefined_rate_cents: number;
      }>;
      rates: Array<{
        pay_table_id: string;
        position_id: string;
        rate_cents: number;
      }>;
    }>("/timesheets/configuration", { authMode: "session" });
    const next = {
      revision: data.revision,
      positions: data.positions.map((p) => ({
        id: p.id,
        localId: p.local_id || "",
        name: p.name,
        active: p.active === 1,
      })),
      tables: data.tables.map((t) => ({
        id: t.id,
        name: t.name,
        active: t.active === 1,
        expiresOn: t.expires_on,
        isDefault: t.is_default === 1,
        undefinedRateCents: t.undefined_rate_cents,
        rates: data.rates
          .filter((r) => r.pay_table_id === t.id)
          .map((r) => ({ positionId: r.position_id, rateCents: r.rate_cents })),
      })),
    };
    setValue(next);
    setSaved(JSON.stringify(next));
  }
  useEffect(() => {
    void load().catch((e) =>
      showNotification({
        title: "Error loading rates",
        body: String(e),
        style: "danger",
      }),
    );
  }, []);
  function position(id: string, patch: Partial<Position>) {
    setValue((v) => ({
      ...v,
      positions: v.positions.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }
  function table(id: string, patch: Partial<Table>) {
    setValue((v) => ({
      ...v,
      tables: v.tables.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }
  const sortedPositions = [...value.positions].sort((a, b) =>
    a.localId && b.localId
      ? a.localId.localeCompare(b.localId, undefined, { sensitivity: "base" })
      : a.localId
        ? -1
        : b.localId
          ? 1
          : a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  const visiblePositions = sortedPositions.filter((p) =>
    `${p.localId} ${p.name}`
      .toLowerCase()
      .includes(positionSearch.trim().toLowerCase()),
  );
  async function save() {
    setBusy(true);
    try {
      await requestJson("/timesheets/configuration", {
        authMode: "session",
        method: "PUT",
        body: JSON.stringify(value),
      });
      await load();
      showNotification({
        title: "Success",
        body: "Billing rates saved.",
        style: "success",
      });
    } catch (e) {
      showNotification({
        title: "Error saving rates",
        body: String(e),
        style: "danger",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <SettingsFrame>
      <div className="space-y-5">
        <section className="border-b-6 border-b-slate-200 pb-5">
          <div className="flex justify-between">
            <h2 className="text-lg font-semibold">Billing positions</h2>
            
          </div>
          <div className="mt-4 flex flex-col md:flex-row gap-2">
            <div className="flex-1">
              <Textbox
                type="search"
                value={positionSearch}
                onChange={(e) => setPositionSearch(e.target.value)}
                placeholder="Search by ID or name"
              />
            </div>
            <Button size="small" variant={positionSearch ? "primary" : "secondary"} onClick={() => setPositionSearch("")}>Clear</Button>
            {editable && (
              <Button size="small" variant="primary" onClick={() => {
                setPositionSearch("");
                setValue((v) => ({
                  ...v,
                  positions: [
                    ...v.positions,
                    {
                      id: crypto.randomUUID(),
                      localId: "",
                      name: "",
                      active: true,
                    },
                  ],
                }));
              }}>
                Add position
              </Button>
            )}
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {visiblePositions.map((p) => (
              <BillRateItem
                key={p.id}
                id={p.id}
                position={p}
                editable={editable}
                positionChange={(changes) => position(p.id, changes)}
              />
            ))}
            {visiblePositions.length === 0 && (
              <p className="text-center bg-white rounded-lg shadow-sm md:col-span-2 xl:col-span-3 py-2">
                No positions match this filter. Please adjust your search criteria.
              </p>
            )}
          </div>
        </section>
        <section className="rounded-xl border bg-white p-5">
          <div className="flex justify-between">
            <h2 className="text-lg font-semibold">Pay tables</h2>
            {editable && (
              <button
                className="rounded border px-3 py-2 text-sm"
                onClick={() =>
                  setValue((v) => ({
                    ...v,
                    tables: [
                      ...v.tables,
                      {
                        id: crypto.randomUUID(),
                        name: "",
                        active: true,
                        expiresOn: null,
                        isDefault: v.tables.length === 0,
                        undefinedRateCents: 0,
                        rates: [],
                      },
                    ],
                  }))
                }
              >
                Add table
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            One active default preselects on new projects. Expired tables cannot
            receive new entries.
          </p>
          <div className="mt-4 space-y-4">
            {value.tables.map((t) => (
              <article key={t.id} className="rounded-lg border p-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="text-sm">
                    Name
                    <input
                      className="mt-1 w-full rounded border p-2"
                      value={t.name}
                      disabled={!editable}
                      onChange={(e) => table(t.id, { name: e.target.value })}
                    />
                  </label>
                  <label className="text-sm">
                    Expires on
                    <input
                      className="mt-1 w-full rounded border p-2"
                      type="date"
                      value={t.expiresOn || ""}
                      disabled={!editable}
                      onChange={(e) =>
                        table(t.id, { expiresOn: e.target.value || null })
                      }
                    />
                  </label>
                  <CurrencyField
                    label="Undefined rate ($/hour)"
                    valueCents={t.undefinedRateCents}
                    disabled={!editable}
                    onCentsChange={(cents) =>
                      table(t.id, { undefinedRateCents: cents ?? 0 })
                    }
                  />
                </div>
                <div className="mt-3 flex gap-4 text-sm">
                  <label>
                    <input
                      type="checkbox"
                      checked={t.active}
                      disabled={!editable}
                      onChange={(e) =>
                        table(t.id, { active: e.target.checked })
                      }
                    />{" "}
                    Active
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={t.isDefault}
                      disabled={!editable}
                      onChange={(e) =>
                        setValue((v) => ({
                          ...v,
                          tables: v.tables.map((x) => ({
                            ...x,
                            isDefault: x.id === t.id ? e.target.checked : false,
                          })),
                        }))
                      }
                    />{" "}
                    Default for new projects
                  </label>
                </div>
                <h3 className="mt-4 font-medium">Position rates ($/hour)</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {sortedPositions
                    .filter((p) => p.active)
                    .map((p) => (
                      <CurrencyField
                        key={p.id}
                        label={`${p.localId ? `${p.localId} · ` : ""}${p.name || "Unnamed position"}`}
                        valueCents={
                          t.rates.find((r) => r.positionId === p.id)
                            ?.rateCents ?? null
                        }
                        nullable
                        placeholder="Use undefined rate"
                        disabled={!editable}
                        onCentsChange={(cents) =>
                          table(t.id, {
                            rates: [
                              ...t.rates.filter((r) => r.positionId !== p.id),
                              ...(cents === null
                                ? []
                                : [{ positionId: p.id, rateCents: cents }]),
                            ],
                          })
                        }
                      />
                    ))}
                </div>
              </article>
            ))}
          </div>
        </section>
        {editable && dirty && (
          <div className="flex justify-end">
            <button
              className="rounded bg-sky-800 px-4 py-2 text-sm text-white"
              disabled={busy}
              onClick={() => void save()}
            >
              Save billing rates
            </button>
          </div>
        )}
      </div>
    </SettingsFrame>
  );
}

function BillRateItem({
  id,
  position,
  editable,
  positionChange,
}: {
  id: string;
  position: Position;
  editable: boolean;
  positionChange: (changes: Partial<Position>) => void;
}) {
  return (
    <div key={id} className="flex flex-col bg-white rounded-lg shadow-sm p-2 gap-2">
      <div className="flex flex-col md:flex-row gap-2 items-center">
        <Textbox
          label="ID"
          labelPosition="side"
          value={position.localId}
          disabled={!editable}
          onChange={(e) => positionChange({ localId: e.target.value })}
        />
        <Toggle
          label="Active"
          labelPosition="side"
          checked={position.active}
          disabled={!editable}
          onChange={(e) => positionChange({ active: e })}
        />
      </div>
      <Textbox
        label="Name"
        labelPosition="side"
        value={position.name}
        disabled={!editable}
        onChange={(e) => positionChange({ name: e.target.value })}
      />

      {/* <label className="text-sm">
        Local ID
        <input
          className="mt-1 w-full rounded border p-2"
          maxLength={40}
          value={position.localId}
          disabled={!editable}
          onChange={(e) => positionChange({ localId: e.target.value })}
        />
      </label>
      <label className="text-sm">
        Position name
        <input
          className="mt-1 w-full rounded border p-2"
          value={position.name}
          disabled={!editable}
          onChange={(e) => positionChange({ name: e.target.value })}
        />
      </label>
      <label className="self-end pb-2 text-sm">
        <input
          type="checkbox"
          checked={position.active}
          disabled={!editable}
          onChange={(e) => positionChange({ active: e.target.checked })}
        />{" "}
        Active
      </label> */}
    </div>
  );
}
