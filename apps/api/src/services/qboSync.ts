import type { ApiEnv } from "../types/apiTypes";

type QboCustomer = {
  Id?: string;
  SyncToken?: string;
  Fault?: { Error?: Array<{ Message?: string; Detail?: string }> };
};
const clean = (value: unknown) => String(value ?? "").trim();

async function config(env: ApiEnv) {
  if (!env.QBO_CLIENT_ID || !env.QBO_CLIENT_SECRET || !env.QBO_REDIRECT_URI)
    throw new Error("QuickBooks is not configured.");
}
export function qboEnvironment(env: ApiEnv): "sandbox" | "production" {
  return clean(env.QBO_ENVIRONMENT).toLowerCase() === "sandbox"
    ? "sandbox"
    : "production";
}

export function qboApiBase(env: ApiEnv, realmId: string): string {
  const host = qboEnvironment(env) === 'sandbox'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';
  return `${host}/v3/company/${encodeURIComponent(realmId)}`;
}

export async function startQboConnection(
  env: ApiEnv,
  state: string,
): Promise<string> {
  await config(env);
  const url = new URL("https://appcenter.intuit.com/connect/oauth2");
  url.searchParams.set("client_id", env.QBO_CLIENT_ID!);
  url.searchParams.set("redirect_uri", env.QBO_REDIRECT_URI!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "com.intuit.quickbooks.accounting");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function revokeQboConnection(db: D1Database, env: ApiEnv) {
  const connection = await db.prepare("SELECT refresh_token FROM qbo_connection WHERE id=1")
    .first<{ refresh_token: string }>();
  if (!connection) return;
  if (!env.QBO_CLIENT_ID || !env.QBO_CLIENT_SECRET)
    throw new Error("QuickBooks is not configured.");
  const response = await fetch("https://developer.api.intuit.com/v2/oauth2/tokens/revoke", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${env.QBO_CLIENT_ID}:${env.QBO_CLIENT_SECRET}`)}`,
    },
    body: JSON.stringify({ token: connection.refresh_token }),
  });
  if (!response.ok)
    throw new Error(`QuickBooks token revocation failed (${response.status}).`);
  const deleted = await db.prepare("DELETE FROM qbo_connection WHERE id=1 AND refresh_token=?")
    .bind(connection.refresh_token).run();
  if (deleted.meta.changes !== 1)
    throw new Error("QuickBooks connection changed during disconnect. Refresh and try again.");
}

async function tokenRequest(env: ApiEnv, body: URLSearchParams) {
  await config(env);
  const response = await fetch(
    "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${env.QBO_CLIENT_ID}:${env.QBO_CLIENT_SECRET}`)}`,
      },
      body,
    },
  );
  const value = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    x_refresh_token_expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !value.access_token || !value.refresh_token)
    throw new Error(
      value.error_description ||
        `QuickBooks token request failed (${response.status}).`,
    );
  return value;
}

export async function completeQboConnection(
  db: D1Database,
  env: ApiEnv,
  code: string,
  realmId: string,
) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.QBO_REDIRECT_URI!,
  });
  const token = await tokenRequest(env, body);
  const now = Date.now(),
    updated = new Date(now).toISOString();
  await db
    .prepare(
      `INSERT INTO qbo_connection(id,realm_id,environment,access_token,refresh_token,token_expires_at,refresh_expires_at,connected_at,updated_at)
    VALUES(1,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET realm_id=excluded.realm_id,environment=excluded.environment,access_token=excluded.access_token,refresh_token=excluded.refresh_token,token_expires_at=excluded.token_expires_at,refresh_expires_at=excluded.refresh_expires_at,updated_at=excluded.updated_at`,
    )
    .bind(
      realmId,
      qboEnvironment(env),
      token.access_token,
      token.refresh_token,
      new Date(
        now + Math.max(60, (token.expires_in || 3600) - 60) * 1000,
      ).toISOString(),
      token.x_refresh_token_expires_in
        ? new Date(now + token.x_refresh_token_expires_in * 1000).toISOString()
        : null,
      updated,
      updated,
    )
    .run();
}

export async function accessToken(
  db: D1Database,
  env: ApiEnv,
): Promise<{ realmId: string; token: string }> {
  const row = await db
    .prepare("SELECT * FROM qbo_connection WHERE id=1")
    .first<Record<string, unknown>>();
  if (!row) throw new Error("QuickBooks is not connected.");
  if (new Date(String(row.token_expires_at)).getTime() > Date.now() + 60000)
    return { realmId: String(row.realm_id), token: String(row.access_token) };
  const token = await tokenRequest(
    env,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: String(row.refresh_token),
    }),
  );
  const now = Date.now();
  await db
    .prepare(
      "UPDATE qbo_connection SET access_token=?,refresh_token=?,token_expires_at=?,refresh_expires_at=?,updated_at=? WHERE id=1",
    )
    .bind(
      token.access_token,
      token.refresh_token,
      new Date(
        now + Math.max(60, (token.expires_in || 3600) - 60) * 1000,
      ).toISOString(),
      token.x_refresh_token_expires_in
        ? new Date(now + token.x_refresh_token_expires_in * 1000).toISOString()
        : row.refresh_expires_at,
      new Date(now).toISOString(),
    )
    .run();
  return { realmId: String(row.realm_id), token: token.access_token! };
}

export async function fetchQboChoices(db: D1Database, env: ApiEnv) {
  const { realmId, token } = await accessToken(db, env);
  const base = qboApiBase(env, realmId);
  async function query(entity: 'Item' | 'Account') {
    const collected: Record<string, unknown>[] = [];
    for (let start = 1; start <= 10001; start += 1000) {
      const sql = `SELECT * FROM ${entity} WHERE Active = true STARTPOSITION ${start} MAXRESULTS 1000`;
      const url = `${base}/query?query=${encodeURIComponent(sql)}&minorversion=${encodeURIComponent(clean(env.QBO_MINOR_VERSION) || '75')}`;
      const response = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
      const body = await response.json().catch(() => ({})) as { QueryResponse?: Record<string, unknown>; Fault?: { Error?: Array<{ Detail?: string; Message?: string }> } };
      if (!response.ok) throw new Error(body.Fault?.Error?.[0]?.Detail || body.Fault?.Error?.[0]?.Message || `QuickBooks lookup failed (${response.status}).`);
      const page = body.QueryResponse?.[entity] as Record<string, unknown>[] | undefined;
      collected.push(...(page || []));
      if (!page || page.length < 1000) break;
    }
    return collected;
  }
  const [items, accounts] = await Promise.all([query('Item'), query('Account')]);
  return {
    items: items.filter(row => row.Type === 'Service').map(row => ({ id: String(row.Id), name: String(row.FullyQualifiedName || row.Name || '') })),
    accounts: accounts.map(row => ({ id: String(row.Id), name: String(row.FullyQualifiedName || row.Name || ''), accountType: String(row.AccountType || '') })),
  };
}

async function qboRequest(
  db: D1Database,
  env: ApiEnv,
  customer: Record<string, unknown>,
): Promise<{ id: string; syncToken: string }> {
  const { realmId, token } = await accessToken(db, env);
  const base =
    qboEnvironment(env) === "sandbox"
      ? "https://sandbox-quickbooks.api.intuit.com"
      : "https://quickbooks.api.intuit.com";
  const url = `${base}/v3/company/${encodeURIComponent(realmId)}/customer?minorversion=${encodeURIComponent(clean(env.QBO_MINOR_VERSION) || "75")}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(customer),
  });
  const value = (await response.json().catch(() => ({}))) as {
    Customer?: QboCustomer;
    Fault?: QboCustomer["Fault"];
  };
  const result = value.Customer;
  if (!response.ok || !result?.Id)
    throw new Error(
      value.Fault?.Error?.[0]?.Detail ||
        value.Fault?.Error?.[0]?.Message ||
        `QuickBooks request failed (${response.status}).`,
    );
  return { id: result.Id, syncToken: result.SyncToken || "" };
}

function address(value: unknown) {
  const a =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    Line1: clean(a.line1),
    Line2: clean(a.line2) || undefined,
    City: clean(a.city),
    CountrySubDivisionCode: clean(a.state),
    PostalCode: clean(a.postalCode),
  };
}
function contactFields(row: Record<string, unknown>) {
  return {
    ...(clean(row.email)
      ? { PrimaryEmailAddr: { Address: clean(row.email) } }
      : {}),
    ...(clean(row.phone)
      ? { PrimaryPhone: { FreeFormNumber: clean(row.phone) } }
      : {}),
  };
}

export async function syncQboClient(
  db: D1Database,
  env: ApiEnv,
  row: Record<string, unknown>,
) {
  const id = clean(row.qbo_customer_id);
  return qboRequest(db, env, {
    ...(id
      ? { Id: id, SyncToken: clean(row.qbo_sync_token), sparse: true }
      : {}),
    DisplayName: clean(row.name),
    CompanyName: clean(row.name),
    Active: !row.archived_at && clean(row.status) !== "inactive",
    BillAddr: address(
      row.billing_address_json
        ? JSON.parse(String(row.billing_address_json))
        : {},
    ),
    ...contactFields(row),
  });
}
export async function syncQboProject(
  db: D1Database,
  env: ApiEnv,
  row: Record<string, unknown>,
  parentId: string,
) {
  if (!parentId)
    throw new Error(
      "Sync the parent client to QuickBooks before syncing this project.",
    );
  const id = clean(row.qbo_customer_id);
  const client = await db.prepare('SELECT billing_address_json FROM clients WHERE id=?').bind(clean(row.client_id)).first<{billing_address_json:string|null}>();
  return qboRequest(db, env, {
    ...(id
      ? { Id: id, SyncToken: clean(row.qbo_sync_token), sparse: true }
      : {}),
    DisplayName: `${clean(row.project_number)} - ${clean(row.name)}`,
    CompanyName: clean(row.name),
    Active: !row.archived_at && Number(row.active ?? 1) === 1,
    ParentRef: { value: parentId },
    Job: true,
    BillAddr: address(client?.billing_address_json ? JSON.parse(client.billing_address_json) : {}),
    ShipAddr: {},
  });
}
