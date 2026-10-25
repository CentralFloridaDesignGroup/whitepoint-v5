import type { QboConnectionStatus } from '@whitepoint/types';
import { requestJson } from "../../../api/client";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeBool(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function normalizeStatus(value: unknown): QboConnectionStatus {
  const row = asRecord(value);
  return {
    connected: normalizeBool(row.connected),
    realmId: normalizeString(row.realmId ?? row.realm_id),
    environment: normalizeString(row.environment),
    lastCustomerSyncDate: normalizeString(
      row.lastCustomerSyncDate ?? row.last_customer_sync_date,
    ),
    lastItemSyncDate: normalizeString(
      row.lastItemSyncDate ?? row.last_item_sync_date,
    ),
    lastAccountSyncDate: normalizeString(
      row.lastAccountSyncDate ?? row.last_account_sync_date,
    ),
    tokenExpiresDate: normalizeString(
      row.tokenExpiresDate ?? row.token_expires_date,
    ),
    defaultServiceItemId: normalizeString(
      row.defaultServiceItemId ?? row.default_service_item_id,
    ),
    defaultServiceItemName: normalizeString(
      row.defaultServiceItemName ?? row.default_service_item_name,
    ),
    defaultDepositAccountId: normalizeString(
      row.defaultDepositAccountId ?? row.default_deposit_account_id,
    ),
    defaultDepositAccountName: normalizeString(
      row.defaultDepositAccountName ?? row.default_deposit_account_name,
    ),
    stripeFeeExpenseAccountId: normalizeString(
      row.stripeFeeExpenseAccountId ?? row.stripe_fee_expense_account_id,
    ),
    stripeFeeExpenseAccountName: normalizeString(
      row.stripeFeeExpenseAccountName ?? row.stripe_fee_expense_account_name,
    ),
    stripeClearingAccountId: normalizeString(row.stripeClearingAccountId ?? row.stripe_clearing_account_id),
    stripeClearingAccountName: normalizeString(row.stripeClearingAccountName ?? row.stripe_clearing_account_name),
    stripePayoutBankAccountId: normalizeString(row.stripePayoutBankAccountId ?? row.stripe_payout_bank_account_id),
    stripePayoutBankAccountName: normalizeString(row.stripePayoutBankAccountName ?? row.stripe_payout_bank_account_name),
  };
}

export async function fetchQboStatus(): Promise<QboConnectionStatus> {
  const data = await requestJson<{ status?: unknown }>("/qbo/status", {
    method: "GET",
    authMode: "session",
  });
  return normalizeStatus(data.status);
}

export async function startQboConnection(): Promise<string> {
  const data = await requestJson<{ authorizationUrl?: unknown }>(
    "/qbo/connect",
    {
      method: "POST",
      authMode: "session",
    },
  );
  return normalizeString(data.authorizationUrl);
}

export async function disconnectQboConnection(): Promise<void> {
  await requestJson("/qbo/disconnect", {
    method: "POST",
    authMode: "session",
  });
}
