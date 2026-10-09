import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Dropdown } from "@whitepoint/ui/input";
import { LoadingSpinner } from "@whitepoint/ui/layout";
import type { QboConnectionStatus } from "@whitepoint/types";
import { requestJson } from "../../../api/client";
import { fetchQboStatus, startQboConnection } from "./api";
import { SettingsFrame } from "../SettingsFrame";
import { useUnsavedChanges } from "../useUnsavedChanges";
import { useAuth } from "../../../auth/AuthContext";
import { showNotification } from "@whitepoint/ui/layout";

type Choices = {
  items: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; name: string; accountType: string }>;
};

type Selection = {
  defaultServiceItemId: string;
  defaultDepositAccountId: string;
  stripeFeeExpenseAccountId: string;
};

function selection(status: QboConnectionStatus): Selection {
  return {
    defaultServiceItemId: status.defaultServiceItemId,
    defaultDepositAccountId: status.defaultDepositAccountId,
    stripeFeeExpenseAccountId: status.stripeFeeExpenseAccountId,
  };
}
export function QboSettings() {
  const canManage = useAuth().hasPermission("company.qbo.manage");
  const navigate = useNavigate(),
    [params] = useSearchParams();
  const [status, setStatus] = useState<QboConnectionStatus | null>(null),
    [saved, setSaved] = useState<Selection | null>(null),
    [draft, setDraft] = useState<Selection | null>(null);
  const [choices, setChoices] = useState<Choices | null>(null),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [busyStatus, setBusyStatus] = useState<
      "connecting" | "editing" | "saving" | null
    >(null);
  const dirty = Boolean(
    draft &&
    saved &&
    Object.keys(saved).some(
      (key) => draft[key as keyof Selection] !== saved[key as keyof Selection],
    ),
  );
  useUnsavedChanges(dirty);

  useEffect(() => {
    const result = params.get("qbo");
    if (result) {
      if (result === "connected")
        showNotification({
          title: "QBO Connected",
          body: "QuickBooks has been successfully connected.",
        });
      else
        showNotification({
          title: "QBO Connection Error",
          body: `Error Message: ${result.replaceAll("-", " ")}.`,
          style: "danger",
          duration: 0,
        });
      navigate("/settings/qbo", { replace: true });
    }
    void fetchQboStatus()
      .then((value) => {
        setStatus(value);
        setSaved(selection(value));
        setDraft(selection(value));
      })
      .catch((e) => {
        showNotification({
          title: "QBO Connection Error",
          body: `Error Message: ${String(e)}.`,
          style: "danger",
          duration: 0,
        });
      });
  }, []);

  async function connect() {
    setBusy(true);
    try {
      window.location.href = await startQboConnection();
    } catch (e) {
      showNotification({
        title: "QBO Connection Error",
        body: `Error Message: ${String(e)}.`,
        style: "danger",
        duration: 0,
      });
      setBusy(false);
    }
  }

  async function edit() {
    setBusy(true);
    setBusyStatus("editing");
    try {
      setChoices(
        await requestJson<Choices>("/qbo/choices", {
          authMode: "session",
          method: "GET",
        }),
      );
      setEditing(true);
    } catch (e) {
      showNotification({
        title: "QBO Connection Error",
        body: `Error Message: ${String(e)}.`,
        style: "danger",
        duration: 0,
      });
    } finally {
      setBusy(false);
      setBusyStatus(null);
    }
  }

  async function save() {
    if (!draft || !canManage) return;
    setBusy(true);
    setBusyStatus("saving");
    try {
      await requestJson("/qbo/settings", {
        authMode: "session",
        method: "PUT",
        body: JSON.stringify(draft),
      });
      const value = await fetchQboStatus();
      setStatus(value);
      setSaved(selection(value));
      setDraft(selection(value));
      showNotification({
        title: "QBO Settings Saved",
        body: "QuickBooks settings have been successfully saved.",
        style: "success",
      });
    } catch (e) {
      showNotification({
        title: "QBO Connection Error",
        body: `Error Message: ${String(e)}.`,
        style: "danger",
        duration: 0,
      });
    } finally {
      setBusy(false);
      setBusyStatus(null);
    }
  }

  function change(key: keyof Selection, value: string) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  const deposit =
    choices?.accounts.filter((account) =>
      ["Bank", "Other Current Asset"].includes(account.accountType),
    ) || [];

  const fee =
    choices?.accounts.filter((account) =>
      [
        "Expense",
        "Other Expense",
        "Cost of Goods Sold",
        "Finance Costs",
      ].includes(account.accountType),
    ) || [];

  return (
    <SettingsFrame title="QBO settings">
      {busyStatus === "connecting" && (
        <LoadingSpinner size="medium" title="Connecting to QuickBooks Online" />
      )}
      {busyStatus === "editing" && (
        <LoadingSpinner size="medium" title="Loading QBO Selections" />
      )}
      {busyStatus === "saving" && (
        <LoadingSpinner size="medium" title="Saving Selections" />
      )}
      {!status ? (
        <LoadingSpinner size="medium" title="Loading QBO Integration Status" />
      ) : (
        <>
          <section className="space-y-4 flex flex-col md:flex-row justify-between items-center">
            <div className="flex flex-col md:flex-row gap-4 items-center">
              <h2 className="text-xl font-semibold">QBO Integration</h2>
              {status.connected ? (
                <span
                  className="bg-green-600 text-sm text-white px-2 py-1 rounded"
                  title={`QBO Integration Status: Connected\nCompany ${status.realmId} \nEnvironment: ${status.environment}`}
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `QBO Integration Status: Connected\nCompany ${status.realmId} \nEnvironment: ${status.environment.charAt(0).toUpperCase() + status.environment.slice(1)}`,
                    );
                    showNotification({
                      title: "Copied to Clipboard",
                      body: "QBO Integration status has been copied to the clipboard.",
                      style: "success",
                    });
                  }}
                >
                  Connected
                </span>
              ) : (
                <span className="bg-red-600 text-sm text-white px-2 py-1 rounded">
                  Disconnected
                </span>
              )}
            </div>
            <div className="flex-0 gap-4 min-w-[125px]">
              {!status.connected && canManage && (
                <Button onClick={() => void connect()} disabled={busy} size="small">
                  Connect QuickBooks
                </Button>
              )}
              {status.connected && canManage && (
                <Button
                  variant={editing ? "primary" : "secondary"}
                  onClick={() => {
                    if (editing) {
                      if (dirty) {
                        save();
                      }
                      setEditing(false);
                    } else {
                      edit();
                      setEditing(true);
                    }
                  }}
                  disabled={busy}
                  size="small"
                >
                  {editing
                    ? dirty
                      ? "Save Changes"
                      : "Cancel Editing"
                    : "Edit Selections"}
                </Button>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <Dropdown
                label="Invoice Service Item"
                options={(choices?.items || []).map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
                disabled={!canManage || !editing}
                value={
                  draft
                    ? draft.defaultServiceItemId
                    : saved?.defaultServiceItemId
                }
                onChange={(value) => change("defaultServiceItemId", value)}
              />
              <Dropdown
                label="Payment Deposit Account"
                options={deposit.map((account) => ({
                  value: account.id,
                  label: account.name,
                }))}
                disabled={!canManage || !editing}
                value={
                  draft
                    ? draft.defaultDepositAccountId
                    : saved?.defaultDepositAccountId
                }
                onChange={(value) => change("defaultDepositAccountId", value)}
              />
              <Dropdown
                label="Stripe Fee Expense Account"
                options={fee.map((account) => ({
                  value: account.id,
                  label: account.name,
                }))}
                disabled={!canManage || !editing}
                value={
                  draft
                    ? draft.stripeFeeExpenseAccountId
                    : saved?.stripeFeeExpenseAccountId
                }
                onChange={(value) => change("stripeFeeExpenseAccountId", value)}
              />
            </div>
          </section>
        </>
      )}
    </SettingsFrame>
  );
}
