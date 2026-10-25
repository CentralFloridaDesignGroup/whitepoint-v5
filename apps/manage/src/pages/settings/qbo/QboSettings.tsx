import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Dropdown } from "@whitepoint/ui/input";
import { LoadingSpinner } from "@whitepoint/ui/layout";
import type { QboConnectionStatus } from "@whitepoint/types";
import { requestJson } from "../../../api/client";
import { disconnectQboConnection, fetchQboStatus, startQboConnection } from "./api";
import { SettingsFrame } from "../SettingsFrame";
import { useUnsavedChanges } from "../useUnsavedChanges";
import { useAuth } from "../../../auth/AuthContext";
import { showNotification } from "@whitepoint/ui/layout";
import { QboTransactionFlow } from "./QboTransactionFlow";

type Choices = {
  items: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; name: string; accountType: string }>;
};

type Selection = {
  defaultServiceItemId: string;
  defaultDepositAccountId: string;
  stripeFeeExpenseAccountId: string;
  stripeClearingAccountId: string;
  stripePayoutBankAccountId: string;
};

function selection(status: QboConnectionStatus): Selection {
  return {
    defaultServiceItemId: status.defaultServiceItemId,
    defaultDepositAccountId: status.defaultDepositAccountId,
    stripeFeeExpenseAccountId: status.stripeFeeExpenseAccountId,
    stripeClearingAccountId: status.stripeClearingAccountId,
    stripePayoutBankAccountId: status.stripePayoutBankAccountId,
  };
}

function withSavedChoice(
  options: Array<{ value: string; label: string }>,
  id: string,
  name: string,
) {
  if (!id || options.some((option) => option.value === id)) return options;
  return [{ value: id, label: name || `Saved selection (${id})` }, ...options];
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
      "connecting" | "disconnecting" | "editing" | "saving" | null
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

  async function disconnect() {
    if (!canManage || !status?.connected || busy) return;
    if (!window.confirm("Disconnect QuickBooks? Invoice and payment syncing will stop until you reconnect.")) return;
    setBusy(true);
    setBusyStatus("disconnecting");
    try {
      await disconnectQboConnection();
      const value = await fetchQboStatus();
      setStatus(value);
      setSaved(selection(value));
      setDraft(selection(value));
      setChoices(null);
      setEditing(false);
      showNotification({
        title: "QBO Disconnected",
        body: "QuickBooks has been disconnected.",
        style: "success",
      });
    } catch (e) {
      showNotification({
        title: "QBO Disconnect Error",
        body: String(e),
        style: "danger",
        duration: 0,
      });
    } finally {
      setBusy(false);
      setBusyStatus(null);
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
    if (!draft || !canManage) return false;
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
      return true;
    } catch (e) {
      showNotification({
        title: "QBO Connection Error",
        body: `Error Message: ${String(e)}.`,
        style: "danger",
        duration: 0,
      });
      return false;
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
      ["Bank", "Accounts receivable (A/R)", "Other Current Asset"].includes(account.accountType),
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
    <SettingsFrame>
      {busyStatus === "connecting" && (
        <LoadingSpinner size="medium" title="Connecting to QuickBooks Online" />
      )}
      {busyStatus === "disconnecting" && (
        <LoadingSpinner size="medium" title="Disconnecting QuickBooks Online" />
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
            <div className="flex flex-wrap gap-2">
              {!status.connected && canManage && (
                <Button
                  onClick={() => void connect()}
                  disabled={busy}
                  size="small"
                >
                  Connect QuickBooks
                </Button>
              )}
              {status.connected && canManage && (
                <Button
                  variant={editing ? "primary" : "secondary"}
                  onClick={() => {
                    if (editing) {
                      if (dirty) {
                        void save().then((didSave) => {
                          if (didSave) setEditing(false);
                        });
                      } else {
                        setEditing(false);
                      }
                    } else {
                      void edit();
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
              {status.connected && canManage && (
                <Button
                  variant="danger"
                  onClick={() => void disconnect()}
                  disabled={busy}
                  size="small"
                >
                  Disconnect QuickBooks
                </Button>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <Dropdown
                label="Invoice Service Item"
                description="Select the default service item for invoices."
                options={withSavedChoice(
                  (choices?.items || []).map((item) => ({
                    value: item.id,
                    label: item.name,
                  })),
                  status.defaultServiceItemId,
                  status.defaultServiceItemName,
                )}
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
                description="Select the default deposit account for direct payments (checks or cash)."
                options={withSavedChoice(
                  deposit.map((account) => ({
                    value: account.id,
                    label: account.name,
                  })),
                  status.defaultDepositAccountId,
                  status.defaultDepositAccountName,
                )}
                disabled={!canManage || !editing}
                value={
                  draft
                    ? draft.defaultDepositAccountId
                    : saved?.defaultDepositAccountId
                }
                onChange={(value) => change("defaultDepositAccountId", value)}
              />
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <Dropdown
                label="Stripe Clearing Account"
                description="Select the clearing account for Stripe transactions (gross amount before fees). Links to invoices as payment."
                options={withSavedChoice(
                  deposit.map((account) => ({
                    value: account.id,
                    label: account.name,
                  })),
                  status.stripeClearingAccountId,
                  status.stripeClearingAccountName,
                )}
                disabled={!canManage || !editing}
                value={
                  draft
                    ? draft.stripeClearingAccountId
                    : saved?.stripeClearingAccountId
                }
                onChange={(value) => change("stripeClearingAccountId", value)}
              />
              <Dropdown
                label="Stripe Payout Bank Account"
                description="Select the bank account for Stripe payouts (net amount after fees). Will match with bank deposits once provided."
                options={withSavedChoice(
                  (choices?.accounts || [])
                    .filter((account) => account.accountType === "Bank")
                    .map((account) => ({
                      value: account.id,
                      label: account.name,
                    })),
                  status.stripePayoutBankAccountId,
                  status.stripePayoutBankAccountName,
                )}
                disabled={!canManage || !editing}
                value={
                  draft
                    ? draft.stripePayoutBankAccountId
                    : saved?.stripePayoutBankAccountId
                }
                onChange={(value) => change("stripePayoutBankAccountId", value)}
              />
              <Dropdown
                label="Stripe Fee Expense Account"
                description="Select the expense account for Stripe fees (transaction fees charged by Stripe). These act as cost of doing business."
                options={withSavedChoice(
                  fee.map((account) => ({
                    value: account.id,
                    label: account.name,
                  })),
                  status.stripeFeeExpenseAccountId,
                  status.stripeFeeExpenseAccountName,
                )}
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
          <QboTransactionFlow />
        </>
      )}
    </SettingsFrame>
  );
}
