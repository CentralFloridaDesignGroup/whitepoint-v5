import { useEffect, useState } from "react";
import type { PermissionGroup } from "@whitepoint/types/constants";
import { Button, Checkbox, Dropdown, Textbox } from "@whitepoint/ui/input";
import { requestJson } from "../../../api/client";
import { useAuth } from "../../../auth/AuthContext";
import { SettingsFrame } from "../SettingsFrame";
import { useUnsavedChanges } from "../useUnsavedChanges";
import { ShieldAlert } from "lucide-react";

type Role = {
  id: string;
  name: string;
  permissions: string[];
  builtIn: boolean;
  isNew?: boolean;
};
type Removal = { id: string; replacementRoleId: string };
const clone = (roles: Role[]) =>
  roles.map((role) => ({ ...role, permissions: [...role.permissions] }));
export function RoleSettings() {
  const auth = useAuth();
  const [saved, setSaved] = useState<Role[]>([]),
    [roles, setRoles] = useState<Role[]>([]),
    [catalog, setCatalog] = useState<PermissionGroup[]>([]);
  const [selectedId, setSelectedId] = useState(""),
    [removed, setRemoved] = useState<Removal[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const dirty =
    JSON.stringify(roles) !== JSON.stringify(saved) || removed.length > 0;
  useUnsavedChanges(dirty);
  async function load() {
    const [roleData, permissionData] = await Promise.all([
      requestJson<{ items: Role[] }>("/identity/roles", {
        authMode: "session",
        method: "GET",
      }),
      requestJson<{ items: PermissionGroup[] }>("/identity/permissions", {
        authMode: "session",
        method: "GET",
      }),
    ]);
    setSaved(clone(roleData.items));
    setRoles(clone(roleData.items));
    setCatalog(permissionData.items);
    setSelectedId((current) =>
      roleData.items.some((role) => role.id === current)
        ? current
        : roleData.items[0]?.id || "",
    );
    setRemoved([]);
  }
  useEffect(() => {
    void load().catch((e) => setError(String(e)));
  }, []);
  const selected = roles.find((role) => role.id === selectedId);
  const canEdit =
    selected &&
    selected.id !== "super-administrator" &&
    auth.hasPermission("company.roles.manage");
  function update(id: string, patch: Partial<Role>) {
    setRoles((current) =>
      current.map((role) => (role.id === id ? { ...role, ...patch } : role)),
    );
  }
  function add() {
    const role: Role = {
      id: crypto.randomUUID(),
      name: "New role",
      permissions: [],
      builtIn: false,
      isNew: true,
    };
    setRoles((current) => [...current, role]);
    setSelectedId(role.id);
  }
  function remove() {
    if (!selected || selected.builtIn) return;
    if (selected.isNew) {
      setRoles((current) => current.filter((role) => role.id !== selected.id));
      setSelectedId(roles.find((role) => role.id !== selected.id)?.id || "");
      return;
    }
    const replacementRoleId = "";
    setRemoved((current) => [
      ...current,
      { id: selected.id, replacementRoleId },
    ]);
    setRoles((current) => current.filter((role) => role.id !== selected.id));
    setSelectedId(replacementRoleId);
  }
  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await requestJson("/identity/roles/bulk", {
        authMode: "session",
        method: "POST",
        body: JSON.stringify({
          roles: roles.filter(
            (role) =>
              role.isNew ||
              JSON.stringify(role) !==
                JSON.stringify(saved.find((row) => row.id === role.id)),
          ),
          removed,
        }),
      });
      await load();
      setNotice(
        "Roles saved. Updated permissions take effect on the next request.",
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const duplicateNames =
    new Set(roles.map((role) => role.name.trim().toLowerCase())).size !==
    roles.length;
  return (
    <SettingsFrame>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
        <section className="space-y-3 rounded-md bg-white p-4 flex flex-col">
          <h2 className="font-semibold">Roles</h2>
          {roles.map((role) => (
            <Button
              key={role.id}
              variant="secondary"
              className={
                role.id === selectedId ? "border-sky-700 bg-sky-50" : ""
              }
              onClick={() => setSelectedId(role.id)}
            >
              {role.name}
              {role.builtIn ? <ShieldAlert className="inline-block h-4 w-4 text-neutral-500" /> : ""}
            </Button>
          ))}
          {auth.hasPermission("company.roles.create") &&
            auth.hasPermission("company.roles.manage") && (
              <Button onClick={add}>Create role</Button>
            )}
        </section>
        <section className="space-y-5 rounded-xl border bg-white p-5">
          {selected ? (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-56 flex-1">
                  <Textbox
                    label="Role name"
                    value={selected.name}
                    disabled={!canEdit || selected.builtIn}
                    onChange={(e) =>
                      update(selected.id, { name: e.target.value })
                    }
                  />
                </div>
                {!selected.builtIn &&
                  auth.hasPermission("company.roles.delete") &&
                  auth.hasPermission("company.roles.manage") && (
                    <Button variant="danger" onClick={remove}>
                      Remove role
                    </Button>
                  )}
              </div>
              <p className="text-sm text-slate-600">
                {selected.id === "super-administrator"
                  ? <span className="font-semibold px-4 py-2 bg-blue-100 rounded-md">The super-administrator role is fixed and has all permissions.</span>
                  : "Choose the permissions this role grants."}
              </p>
              <div className="grid gap-5 md:grid-cols-2">
                {catalog.map((group) => (
                  <fieldset
                    key={group.key}
                    className="space-y-3 rounded-lg border p-3"
                  >
                    <legend className="px-1 text-sm font-semibold">
                      {group.displayName}
                    </legend>
                    <p className="text-xs text-slate-600">
                      {group.description}
                    </p>
                    {group.permissions.map((permission) => (
                      <div key={permission.key} className="space-y-1">
                        <Checkbox
                          label={permission.displayName}
                          checked={
                            selected.permissions.includes(permission.key) ||
                            selected.permissions.includes("*")
                          }
                          disabled={!canEdit}
                          onChange={(e) =>
                            update(selected.id, {
                              permissions: e.target.checked
                                ? [...selected.permissions, permission.key]
                                : selected.permissions.filter(
                                    (item) => item !== permission.key,
                                  ),
                            })
                          }
                        />
                        <p className="pl-6 text-xs text-slate-600">
                          {permission.description}
                        </p>
                      </div>
                    ))}
                  </fieldset>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">Select a role.</p>
          )}
        </section>
      </div>
      {removed.length > 0 && (
        <section className="space-y-3 rounded-xl border bg-amber-50 p-5">
          <h2 className="font-semibold">
            Replacement roles for assigned users
          </h2>
          {removed.map((item) => (
            <div key={item.id} className="grid gap-3 sm:grid-cols-2">
              <p className="text-sm">
                Remove {saved.find((role) => role.id === item.id)?.name}
              </p>
              <Dropdown
                label="Move assigned users to"
                options={roles
                  .filter((role) => role.id !== item.id)
                  .map((role) => ({ value: role.id, label: role.name }))}
                value={item.replacementRoleId}
                onChange={(value) =>
                  setRemoved((current) =>
                    current.map((row) =>
                      row.id === item.id
                        ? { ...row, replacementRoleId: value }
                        : row,
                    ),
                  )
                }
              />
            </div>
          ))}
        </section>
      )}
      {dirty && (
        <div className="flex justify-end">
          <Button
            onClick={() => void save()}
            disabled={
              busy ||
              duplicateNames ||
              roles.some((role) => !role.name.trim()) ||
              removed.some((row) => !row.replacementRoleId)
            }
          >
            Save roles
          </Button>
        </div>
      )}
    </SettingsFrame>
  );
}
