import type { Context } from "hono";
import type { AuthContext } from "@whitepoint/types";

export type ApiEnv = {
  DB: D1Database;
  BRAND_ASSETS: R2Bucket;
  RECORD_DOCUMENTS: R2Bucket;
  AUTH_ORIGINS?: string;
  AUTH_BOOTSTRAP_TOKEN?: string;
  TOTP_ENCRYPTION_KEY?: string;
  BREVO_API_KEY?: string;
  BREVO_SENDER_EMAIL?: string;
  STAFF_APP_URL?: string;
  WEBAUTHN_RP_ID?: string;
  QBO_CLIENT_ID?: string;
  QBO_CLIENT_SECRET?: string;
  QBO_REDIRECT_URI?: string;
  QBO_ENVIRONMENT?: string;
  QBO_MINOR_VERSION?: string;
  PAYMENT_APP_URL?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
};
export type ApiVariables = {
  auth: AuthContext;
  permissions: {
    hasPermission(permission: string): boolean;
    hasPermissions(permissions: string[]): boolean;
  };
};
export type HonoEnv = { Bindings: ApiEnv; Variables: ApiVariables };
export type ApiContext = Context<HonoEnv>;

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers
        ? Object.fromEntries(new Headers(init.headers).entries())
        : {}),
    },
  });
}
export function badRequest(message: string): Response {
  return jsonResponse({ error: message }, { status: 400 });
}
export function serverError(
  message = "The request could not be completed.",
): Response {
  return jsonResponse({ error: message }, { status: 500 });
}
export function noContent(): Response {
  return new Response(null, { status: 204, headers: { 'Content-Type': 'application/json' } });
}
