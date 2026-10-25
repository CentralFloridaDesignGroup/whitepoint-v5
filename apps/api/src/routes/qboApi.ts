import { Hono } from "hono";
import {
  startQboConnection,
  completeQboConnection,
  fetchQboChoices,
  revokeQboConnection,
} from "../services/qboSync";
import { jsonResponse, type ApiContext, type HonoEnv } from "../types/apiTypes";

type QboCallbackResult = "connected" | "authorization-failed" | "state-expired" | "connection-failed";

function returnToManage(c: ApiContext, result: QboCallbackResult): Response {
  const url = new URL(c.env.STAFF_APP_URL || "http://localhost:5300");
  url.pathname = "/settings/qbo";
  url.search = "";
  url.hash = "";
  url.searchParams.set("qbo", result);
  return new Response(null, {
    status: 303,
    headers: {
      Location: url.toString(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export function createQboApi() {
  const api = new Hono<HonoEnv>();
  api.post("/connect", async (c) => {
    const state = crypto.randomUUID();
    await c.env.DB.prepare(
      "DELETE FROM qbo_oauth_states WHERE created_at < datetime('now','-10 minutes')",
    ).run();
    await c.env.DB.prepare(
      "INSERT INTO qbo_oauth_states(state,created_at) VALUES(?,CURRENT_TIMESTAMP)",
    )
      .bind(state)
      .run();
    try {
      return jsonResponse({
        authorizationUrl: await startQboConnection(c.env, state),
      });
    } catch (error) {
      return jsonResponse(
        { error: String(error instanceof Error ? error.message : error) },
        { status: 503 },
      );
    }
  });
  api.post("/disconnect", async (c) => {
    try {
      await revokeQboConnection(c.env.DB, c.env);
      return jsonResponse({ disconnected: true });
    } catch (error) {
      return jsonResponse(
        { error: error instanceof Error ? error.message : "QuickBooks disconnect failed." },
        { status: 502 },
      );
    }
  });
  api.get("/callback", async (c) => {
    const state = c.req.query("state") || "",
      code = c.req.query("code") || "",
      realmId = c.req.query("realmId") || "";
    if (!state || !code || !realmId)
      return returnToManage(c, "authorization-failed");
    const saved = await c.env.DB.prepare(
      "DELETE FROM qbo_oauth_states WHERE state=? AND created_at >= datetime('now','-10 minutes') RETURNING state",
    )
      .bind(state)
      .first();
    if (!saved) await c.env.DB.prepare("DELETE FROM qbo_oauth_states WHERE state=?").bind(state).run();
    if (!saved) return returnToManage(c, "state-expired");
    try {
      await completeQboConnection(c.env.DB, c.env, code, realmId);
      return returnToManage(c, "connected");
    } catch (error) {
      console.error("QuickBooks connection failed", error);
      return returnToManage(c, "connection-failed");
    }
  });
  api.get("/status", async (c) => {
    const connection = await c.env.DB.prepare(
      "SELECT realm_id,environment,token_expires_at,default_service_item_id,default_service_item_name,default_deposit_account_id,default_deposit_account_name,stripe_fee_expense_account_id,stripe_fee_expense_account_name,stripe_clearing_account_id,stripe_clearing_account_name,stripe_payout_bank_account_id,stripe_payout_bank_account_name FROM qbo_connection WHERE id=1",
    ).first<{
      realm_id: string;
      environment: string;
      token_expires_at: string;
      default_service_item_id: string | null;
      default_service_item_name: string | null;
      default_deposit_account_id: string | null;
      default_deposit_account_name: string | null;
      stripe_fee_expense_account_id: string | null;
      stripe_fee_expense_account_name: string | null;
      stripe_clearing_account_id: string | null;
      stripe_clearing_account_name: string | null;
      stripe_payout_bank_account_id: string | null;
      stripe_payout_bank_account_name: string | null;
    }>();
    return jsonResponse({
      status: {
        connected: Boolean(connection),
        realmId: connection?.realm_id || "",
        environment: connection?.environment || "",
        tokenExpiresDate: connection?.token_expires_at || "",
        lastCustomerSyncDate: "",
        lastItemSyncDate: "",
        lastAccountSyncDate: "",
        defaultServiceItemId: connection?.default_service_item_id || "",
        defaultServiceItemName: connection?.default_service_item_name || "",
        defaultDepositAccountId: connection?.default_deposit_account_id || "",
        defaultDepositAccountName: connection?.default_deposit_account_name || "",
        stripeFeeExpenseAccountId: connection?.stripe_fee_expense_account_id || "",
        stripeFeeExpenseAccountName: connection?.stripe_fee_expense_account_name || "",
        stripeClearingAccountId: connection?.stripe_clearing_account_id || "",
        stripeClearingAccountName: connection?.stripe_clearing_account_name || "",
        stripePayoutBankAccountId: connection?.stripe_payout_bank_account_id || "",
        stripePayoutBankAccountName: connection?.stripe_payout_bank_account_name || "",
      },
    });
  });
  api.get('/choices', async c => {
    try { return c.json(await fetchQboChoices(c.env.DB, c.env)); }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : 'QuickBooks lookup failed.' }, 502); }
  });
  api.put('/settings', async c => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => null);
    if (!body) return c.json({ error: 'Expected settings JSON.' }, 400);
    const ids = ['defaultServiceItemId', 'defaultDepositAccountId', 'stripeFeeExpenseAccountId','stripeClearingAccountId','stripePayoutBankAccountId'] as const;
    if (ids.some(key => typeof body[key] !== 'string' || !body[key])) return c.json({ error: 'Choose all five QuickBooks fields.' }, 400);
    try {
      const choices = await fetchQboChoices(c.env.DB, c.env);
      const item = choices.items.find(value => value.id === body.defaultServiceItemId);
      const deposit = choices.accounts.find(value => value.id === body.defaultDepositAccountId && ['Bank', 'Other Current Asset'].includes(value.accountType));
      const fee = choices.accounts.find(value => value.id === body.stripeFeeExpenseAccountId && ['Expense', 'Other Expense', 'Cost of Goods Sold', 'Finance Costs'].includes(value.accountType));
      const clearing=choices.accounts.find(value=>value.id===body.stripeClearingAccountId&&['Bank','Other Current Asset'].includes(value.accountType));
      const bank=choices.accounts.find(value=>value.id===body.stripePayoutBankAccountId&&value.accountType==='Bank');
      if (!item || !deposit || !fee || !clearing || !bank || clearing.id===bank.id) return c.json({ error: 'One or more selections are invalid. Use separate Stripe clearing and bank accounts.' }, 400);
      await c.env.DB.prepare(`UPDATE qbo_connection SET default_service_item_id=?,default_service_item_name=?,default_deposit_account_id=?,default_deposit_account_name=?,stripe_fee_expense_account_id=?,stripe_fee_expense_account_name=?,stripe_clearing_account_id=?,stripe_clearing_account_name=?,stripe_payout_bank_account_id=?,stripe_payout_bank_account_name=?,updated_at=CURRENT_TIMESTAMP WHERE id=1`)
        .bind(item.id, item.name, deposit.id, deposit.name, fee.id, fee.name,clearing.id,clearing.name,bank.id,bank.name).run();
      return c.json({ saved: true });
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : 'QuickBooks save failed.' }, 502); }
  });
  return api;
}
