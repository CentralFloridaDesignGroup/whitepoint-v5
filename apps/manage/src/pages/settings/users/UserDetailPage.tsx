import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Button, Dropdown, SearchableDropdown, Textbox, Toggle } from "@whitepoint/ui/input";
import { requestJson } from "../../../api/client";
import { useAuth } from "../../../auth/AuthContext";
import { Card } from "../../common/RecordControls";
import { CurrencyField } from "../../common/CurrencyField";
import { TabNavigation } from "../../common/TabNavigation";
import { SettingsFrame } from "../SettingsFrame";
import { useUnsavedChanges } from "../useUnsavedChanges";

type UserDetail = {
  id: string;
  email: string;
  displayName: string;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  userType: string;
  active: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  role: { id: string; name: string | null } | null;
  manager: { id: string; name: string | null } | null;
  compensation?: {
    billingPosition: { id: string; name: string | null } | null;
    payBasis: "hourly" | "salary" | null;
    payAmountCents: number | null;
    weeklyHours: number | null;
  };
};
type Draft = {
  id: string;
  email: string;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  roleId: string;
  active: boolean;
  managerUserId: string | null;
  billingPositionId: string | null;
  payBasis: "hourly" | "salary" | null;
  payAmountCents: number | null;
  weeklyHours: number | null;
};
type Role = { id: string; name: string };
type UserOption = {
  id: string;
  display_name: string;
  active: number;
  archived_at: string | null;
};
type Position = {
  id: string;
  local_id: string | null;
  name: string;
  active: number;
};

const blank = (): Draft => ({
  id: crypto.randomUUID(),
  email: "",
  firstName: "",
  middleName: "",
  lastName: "",
  suffix: "",
  roleId: "",
  active: true,
  managerUserId: null,
  billingPositionId: null,
  payBasis: null,
  payAmountCents: null,
  weeklyHours: null,
});
const fromDetail = (user: UserDetail): Draft => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  middleName: user.middleName,
  lastName: user.lastName,
  suffix: user.suffix,
  roleId: user.role?.id || "",
  active: user.active,
  managerUserId: user.manager?.id || null,
  billingPositionId: user.compensation?.billingPosition?.id || null,
  payBasis: user.compensation?.payBasis || null,
  payAmountCents: user.compensation?.payAmountCents ?? null,
  weeklyHours: user.compensation?.weeklyHours ?? null,
});
const currency = (cents: number | null) =>
  cents == null
    ? "Not set"
    : (cents / 100).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      });
const dateTime = (value: string) =>
  new Date(`${value.replace(" ", "T")}Z`).toLocaleString();

export function UserDetailPage({ creating = false }: { creating?: boolean }) {
  const { id = "" } = useParams();
  const isNew = creating;
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const canManage = auth.hasPermission("users.manage");
  const canManageRates = auth.hasPermission("timesheets.rates.manage");
  const canViewRates = auth.hasPermission("timesheets.rates.view");
  const [user, setUser] = useState<UserDetail | null>(null);
  const [saved, setSaved] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [tab, setTab] = useState("basic");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const dirty = Boolean(
    draft && JSON.stringify(draft) !== JSON.stringify(saved),
  );
  useUnsavedChanges(dirty);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    setNotice(
      (location.state as { userNotice?: string } | null)?.userNotice || "",
    );
    setTab("basic");
    setUser(null);
    setDraft(null);
    setSaved(null);
    const detail = isNew
      ? Promise.resolve(null)
      : requestJson<UserDetail>(`/identity/users/${encodeURIComponent(id)}`, {
          authMode: "session",
        });
    const roleOptions = canManage
      ? requestJson<{ items: Role[] }>("/identity/users/role-options", {
          authMode: "session",
        })
      : Promise.resolve({ items: [] });
    const userOptions = canViewRates
      ? requestJson<{ items: UserOption[] }>("/identity/users", {
          authMode: "session",
        })
      : Promise.resolve({ items: [] });
    const positionOptions = canViewRates
      ? requestJson<{ positions: Position[] }>("/timesheets/configuration", {
          authMode: "session",
        })
      : Promise.resolve({ positions: [] });
    void Promise.all([detail, roleOptions, userOptions, positionOptions])
      .then(([value, roleData, userData, positionData]) => {
        if (!current) return;
        const next = value ? fromDetail(value) : blank();
        setUser(value);
        setDraft(next);
        setSaved(next);
        setRoles(roleData.items);
        setUsers(userData.items);
        setPositions(positionData.positions);
      })
      .catch((caught) => {
        if (current) setError(String(caught));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [id, isNew, canManage, canViewRates, location.state]);

  const editable = canManage && !user?.archivedAt;
  const rateEditable = editable && canManageRates && canViewRates;
  const showAccountActions = Boolean(
    user &&
    !user.archivedAt &&
    ((user.active && auth.hasPermission("users.invite")) ||
      (canManage && user.id !== auth.internalUserId)),
  );
  const roleOptions =
    roles.some((role) => role.id === draft?.roleId) || !user?.role
      ? roles
      : [...roles, { id: user.role.id, name: user.role.name || user.role.id }];
  const invalid =
    !draft ||
    !draft.firstName.trim() ||
    !draft.lastName.trim() ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email) ||
    (draft.weeklyHours !== null &&
      (!Number.isSafeInteger(draft.weeklyHours) || draft.weeklyHours < -1)) ||
    !draft.roleId;
  function update(patch: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }
  async function save() {
    if (!draft || invalid || !editable) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        id: draft.id,
        email: draft.email,
        firstName: draft.firstName,
        middleName: draft.middleName,
        lastName: draft.lastName,
        suffix: draft.suffix,
        roleId: draft.roleId,
        active: draft.active,
        ...(isNew ? { isNew: true } : {}),
        ...(rateEditable
          ? {
              managerUserId: draft.managerUserId,
              billingPositionId: draft.billingPositionId,
              payBasis: draft.payBasis,
              payAmountCents: draft.payAmountCents,
              weeklyHours: draft.weeklyHours,
            }
          : {}),
      };
      const result = await requestJson<{
        deliveries: Array<{ sent: boolean }>;
      }>("/identity/users/bulk", {
        authMode: "session",
        method: "POST",
        body: JSON.stringify({ users: [payload] }),
      });
      if (isNew) {
        flushSync(() => setSaved({ ...draft }));
        navigate(`/settings/users/${draft.id}`, {
          replace: true,
          state: {
            userNotice: result.deliveries.some((delivery) => !delivery.sent)
              ? "User created. Invitation email failed; use Invite to retry."
              : "User created.",
          },
        });
        return;
      }
      setSaved({ ...draft });
      setNotice("User saved.");
      try {
        const value = await requestJson<UserDetail>(
          `/identity/users/${encodeURIComponent(draft.id)}`,
          { authMode: "session" },
        );
        setUser(value);
        const next = fromDetail(value);
        setDraft(next);
        setSaved(next);
      } catch {
        setNotice(
          "User saved. Refresh the page to see updated account details.",
        );
      }
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }
  async function action(type: "invite" | "recover" | "archive") {
    if (
      !user ||
      (dirty && !window.confirm("Discard unsaved changes before this action?"))
    )
      return;
    if (type === "archive" && !window.confirm(`Archive ${user.displayName}?`))
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await requestJson(
        `/identity/users/${encodeURIComponent(user.id)}/${type}`,
        { authMode: "session", method: "POST" },
      );
      const value = await requestJson<UserDetail>(
        `/identity/users/${encodeURIComponent(user.id)}`,
        { authMode: "session" },
      );
      setUser(value);
      const next = fromDetail(value);
      setDraft(next);
      setSaved(next);
      setNotice(
        type === "archive"
          ? "User archived."
          : `${type === "invite" ? "Invitation" : "Recovery"} email sent.`,
      );
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsFrame>
      <main className="mx-auto max-w-5xl space-y-5 pb-8">
        <div>
          <Link className="text-sm text-sky-800" to="/settings/users">
            ← Users
          </Link>
          <h1 className="mt-2 text-3xl font-semibold">
            {isNew ? "Add user" : user?.displayName || "User details"}
          </h1>
          {user && (
            <p className="mt-1 text-sm text-slate-600">
              {user.email} ·{" "}
              {user.archivedAt
                ? "Archived"
                : user.active
                  ? "Active"
                  : "Inactive"}
            </p>
          )}
        </div>
        {error && (
          <p
            role="alert"
            className="rounded bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="rounded bg-emerald-50 p-3 text-sm text-emerald-800"
          >
            {notice}
          </p>
        )}
        {loading && <p className="text-sm text-slate-600">Loading user…</p>}
        {draft && (
          <>
            <TabNavigation
              ariaLabel="User details"
              tabs={[
                { value: "basic", label: "Basic information" },
                ...(canViewRates
                  ? [{ value: "compensation", label: "Reporting and pay" }]
                  : []),
                ...(showAccountActions
                  ? [{ value: "account", label: "Account actions" }]
                  : []),
              ]}
              activeValue={tab}
              onChange={setTab}
            />
            {tab === "basic" && (
              <Card title="Basic information">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Textbox
                    label="First name"
                    value={draft.firstName}
                    readOnly={!editable}
                    onChange={(event) =>
                      update({ firstName: event.target.value })
                    }
                  />
                  <Textbox
                    label="Middle name"
                    value={draft.middleName}
                    readOnly={!editable}
                    onChange={(event) =>
                      update({ middleName: event.target.value })
                    }
                  />
                  <Textbox
                    label="Last name"
                    value={draft.lastName}
                    readOnly={!editable}
                    onChange={(event) =>
                      update({ lastName: event.target.value })
                    }
                  />
                  <Textbox
                    label="Suffix"
                    value={draft.suffix}
                    readOnly={!editable}
                    onChange={(event) => update({ suffix: event.target.value })}
                  />
                  <Textbox
                    label="Email"
                    type="email"
                    value={draft.email}
                    readOnly={!editable}
                    onChange={(event) => update({ email: event.target.value })}
                  />
                  <Dropdown
                    label="Role"
                    options={roleOptions.map((role) => ({
                      value: role.id,
                      label: role.name,
                    }))}
                    value={draft.roleId}
                    disabled={!editable}
                    onChange={(value) => update({ roleId: value })}
                  />
                  <div className="space-y-3">
                    <p className="text-sm text-slate-500">
                      Account type: {user?.userType || "internal"}
                    </p>
                    <Toggle
                      label="Active"
                      checked={draft.active}
                      disabled={!editable || draft.id === auth.internalUserId}
                      onChange={(value) => update({ active: value })}
                    />
                  </div>
                  {user && (
                    <>
                      <p className="text-sm text-slate-600">
                        Created: {dateTime(user.createdAt)}
                      </p>
                      <p className="text-sm text-slate-600">
                        Last updated: {dateTime(user.updatedAt)}
                      </p>
                    </>
                  )}
                </div>
              </Card>
            )}
            {tab === "compensation" && canViewRates && (
              <Card title="Reporting and pay">
                <div className="grid gap-5 sm:grid-cols-2">
                  <SearchableDropdown
                    label="Manager"
                    options={users
                      .filter(
                        (option) =>
                          option.id !== draft.id &&
                          ((option.active === 1 && !option.archived_at) ||
                            option.id === draft.managerUserId),
                      )
                      .map((option) => ({
                        value: option.id,
                        label: option.display_name,
                      }))}
                    value={draft.managerUserId || ""}
                    disabled={!rateEditable}
                    onChange={(value) =>
                      update({ managerUserId: value || null })
                    }
                  />
                  <SearchableDropdown
                    label="Billing position"
                    options={positions
                      .filter(
                        (position) =>
                          position.active === 1 ||
                          position.id === draft.billingPositionId,
                      )
                      .map((position) => ({
                        value: position.id,
                        label: position.local_id ? `${position.local_id}: ${position.name}` : position.name,
                      }))}
                    value={draft.billingPositionId || ""}
                    disabled={!rateEditable}
                    onChange={(value) =>
                      update({ billingPositionId: value || null })
                    }
                  />
                  <Dropdown
                    label="Pay basis"
                    options={[
                      { value: "", label: "Not set" },
                      { value: "hourly", label: "Hourly" },
                      { value: "salary", label: "Annual salary" },
                    ]}
                    value={draft.payBasis || ""}
                    disabled={!rateEditable}
                    onChange={(value) =>
                      update({ payBasis: (value as Draft["payBasis"]) || null })
                    }
                  />
                  <CurrencyField
                    label={
                      draft.payBasis === "salary"
                        ? "Annual pay ($)"
                        : "Hourly pay ($/hour)"
                    }
                    valueCents={draft.payAmountCents}
                    nullable
                    disabled={!rateEditable}
                    onCentsChange={(value) => update({ payAmountCents: value })}
                  />
                  <div>
                    <Textbox
                      label="Weekly utilization target (hours)"
                      type="number"
                      min={-1}
                      step={1}
                      value={draft.weeklyHours ?? ""}
                      readOnly={!rateEditable}
                      onChange={(event) =>
                        update({
                          weeklyHours:
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                        })
                      }
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Blank: 40 hours · 0: target missing · -1: no minimum
                    </p>
                  </div>
                  {draft.payBasis === "salary" &&
                    draft.payAmountCents != null && (
                      <p className="text-sm text-slate-600">
                        Hourly cost equivalent:{" "}
                        {currency(Math.round(draft.payAmountCents / 2080))} per
                        hour.
                      </p>
                    )}
                </div>
                <p className="mt-5 text-sm text-slate-600">
                  Annual salary is divided by 2,080 hours for timesheet cost.
                </p>
              </Card>
            )}
            {tab === "account" && user && (
              <Card title="Account actions">
                <div className="flex flex-wrap gap-3">
                  {auth.hasPermission("users.invite") &&
                    !user.archivedAt &&
                    user.active && (
                      <Button
                        onClick={() => void action("invite")}
                        disabled={busy || dirty}
                      >
                        Invite
                      </Button>
                    )}
                  {canManage &&
                    !user.archivedAt &&
                    user.active &&
                    user.id !== auth.internalUserId && (
                      <Button
                        onClick={() => void action("recover")}
                        disabled={busy || dirty}
                      >
                        Recover account
                      </Button>
                    )}
                  {canManage &&
                    !user.archivedAt &&
                    user.id !== auth.internalUserId && (
                      <Button
                        variant="danger"
                        onClick={() => void action("archive")}
                        disabled={busy || dirty}
                      >
                        Archive user
                      </Button>
                    )}
                </div>
              </Card>
            )}
            {editable && (
              <div className="flex justify-end gap-3 border-t bg-white py-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setDraft(saved ? { ...saved } : null);
                    setError("");
                  }}
                  disabled={!dirty || busy}
                >
                  Discard changes
                </Button>
                <Button
                  onClick={() => void save()}
                  disabled={!dirty || invalid || busy}
                >
                  {busy ? "Saving…" : "Save user"}
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </SettingsFrame>
  );
}
