export type RouteMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'
export type RouteConsumer = 'manage' | 'docs' | 'payment' | 'main' | 'monitoring' | 'qbo' | 'stripe'
export type RouteAccess = 'public' | 'pending-session' | 'session' | 'permission' | 'signed-webhook'

export type RoutePolicy = {
  method: RouteMethod
  path: string
  consumers: RouteConsumer[]
  access: RouteAccess
  permission?: string
  csrfExempt?: boolean
  handlerOwnership?: boolean
}

const p = (method: RouteMethod, path: string, consumers: RouteConsumer[], access: RouteAccess, permission?: string, options: Pick<RoutePolicy, 'csrfExempt' | 'handlerOwnership'> = {}): RoutePolicy =>
  ({ method, path, consumers, access, ...(permission ? { permission } : {}), ...options })
const publicPost = (path: string, consumers: RouteConsumer[]) => p('POST', path, consumers, 'public', undefined, { csrfExempt: true })
const session = (method: RouteMethod, path: string, consumers: RouteConsumer[], handlerOwnership = false) => p(method, path, consumers, 'session', undefined, { handlerOwnership })
const permission = (method: RouteMethod, path: string, consumers: RouteConsumer[], required: string, handlerOwnership = false) => p(method, path, consumers, 'permission', required, { handlerOwnership })

export const ROUTE_POLICIES: readonly RoutePolicy[] = [
  p('GET', '/health/status', ['monitoring'], 'public'),
  publicPost('/public/contact', ['main']), publicPost('/public/job-applications', ['main']),
  p('GET', '/identity/setup/status', ['manage', 'docs'], 'public'), publicPost('/identity/setup', ['manage']), publicPost('/identity/login', ['manage', 'docs']),
  p('GET', '/identity/session', ['manage', 'docs'], 'public'), p('POST', '/identity/logout', ['manage', 'docs'], 'pending-session'),
  p('POST', '/identity/mfa', ['manage', 'docs'], 'pending-session'), p('POST', '/identity/totp/start', ['manage', 'docs'], 'pending-session'), p('POST', '/identity/totp/confirm', ['manage', 'docs'], 'pending-session'),
  publicPost('/identity/password/reset', ['manage', 'docs']), publicPost('/identity/password/set', ['manage', 'docs']),
  session('GET', '/identity/me/security', ['manage']), session('POST', '/identity/me/password', ['manage']),
  p('POST', '/identity/passkey/register/options', ['manage'], 'pending-session'), p('POST', '/identity/passkey/register/verify', ['manage'], 'pending-session'),
  session('DELETE', '/identity/me/passkeys/:id', ['manage'], true), publicPost('/identity/passkey/login/options', ['manage', 'docs']), publicPost('/identity/passkey/login/verify', ['manage', 'docs']),
  session('GET', '/identity/me/favorites', ['docs']), session('PUT', '/identity/me/favorites', ['docs']),
  permission('POST', '/identity/users/bulk', ['manage'], 'users.manage'), permission('GET', '/identity/users', ['manage'], 'users.view'),
  permission('GET', '/identity/users/role-options', ['manage'], 'users.view'), permission('GET', '/identity/users/:id', ['manage'], 'users.view'),
  permission('POST', '/identity/users/:id/archive', ['manage'], 'users.manage'), permission('POST', '/identity/users/:id/invite', ['manage'], 'users.invite'), permission('POST', '/identity/users/:id/recover', ['manage'], 'users.manage'),
  permission('GET', '/identity/permissions', ['manage'], 'company.roles.view'), permission('GET', '/identity/roles', ['manage'], 'company.roles.view'), permission('POST', '/identity/roles/bulk', ['manage'], 'company.roles.manage'),
  permission('GET', '/records/lookups/users', ['manage'], 'projects.view'), permission('GET', '/records/lookups/project-managers', ['manage'], 'projects.view'),
  permission('GET', '/records/lookups/clients', ['manage'], 'projects.view'), permission('GET', '/records/lookups/clients/:id/contacts', ['manage'], 'projects.view'),
  permission('GET', '/records/clients', ['manage'], 'clients.view'), permission('POST', '/records/clients', ['manage'], 'clients.create'),
  permission('PUT', '/records/clients/:id', ['manage'], 'clients.manage.basic'), permission('GET', '/records/clients/:id', ['manage'], 'clients.view'),
  permission('GET', '/records/clients/:id/projects', ['manage'], 'clients.view', true), permission('GET', '/records/clients/:id/audit', ['manage'], 'clients.view'),
  permission('GET', '/records/clients/:id/documents/:documentId', ['manage'], 'clients.view', true), permission('POST', '/records/clients/:id/archive', ['manage'], 'clients.manage.basic'), permission('POST', '/records/clients/:id/qbo/retry', ['manage'], 'company.qbo.resync'),
  permission('POST', '/records/projects', ['manage'], 'projects.create'), session('PUT', '/records/projects/:id', ['manage'], true), permission('GET', '/records/projects/next-number', ['manage'], 'projects.view'),
  session('GET', '/records/projects/:id/time-entries', ['manage'], true), session('GET', '/records/projects/:id', ['manage'], true), session('POST', '/records/projects/:id/po-documents', ['manage'], true),
  session('DELETE', '/records/projects/:id/po-documents/:documentId', ['manage'], true), session('PUT', '/records/projects/:id/stage', ['manage'], true), session('GET', '/records/projects/:id/audit', ['manage'], true),
  permission('POST', '/records/projects/:id/archive', ['manage'], 'projects.manage'), permission('POST', '/records/projects/:id/qbo/retry', ['manage'], 'company.qbo.resync'),
  permission('POST', '/qbo/connect', ['manage'], 'company.qbo.manage'), permission('POST', '/qbo/disconnect', ['manage'], 'company.qbo.manage'), p('GET', '/qbo/callback', ['qbo'], 'public'),
  permission('GET', '/qbo/status', ['manage'], 'company.qbo.view'), permission('GET', '/qbo/choices', ['manage'], 'company.qbo.view'), permission('PUT', '/qbo/settings', ['manage'], 'company.qbo.manage'),
  permission('GET', '/settings', ['manage'], 'company.view'), permission('GET', '/settings/logo/:kind', ['manage'], 'company.view'), permission('POST', '/settings/logo/:kind', ['manage'], 'company.manage'), permission('PUT', '/settings', ['manage'], 'company.manage'),
  session('GET', '/search', ['manage'], true), session('GET', '/dashboard', ['manage'], true), session('GET', '/dashboard/details', ['manage'], true),
  permission('GET', '/timesheets/configuration', ['manage'], 'timesheets.rates.view'), permission('PUT', '/timesheets/configuration', ['manage'], 'timesheets.rates.manage'),
  session('GET', '/timesheets/lookups', ['manage'], true), session('GET', '/timesheets/roster', ['manage'], true), session('GET', '/timesheets/weeks/:start', ['manage'], true),
  session('PUT', '/timesheets/weeks/:start/entries/:entryId', ['manage'], true), session('DELETE', '/timesheets/weeks/:start/entries/:entryId', ['manage'], true),
  session('POST', '/timesheets/weeks/:start/submit', ['manage'], true), session('POST', '/timesheets/weeks/:start/:action', ['manage'], true), permission('GET', '/timesheets/invoice-pool', ['manage'], 'timesheets.rates.view'),
  permission('GET', '/invoices/payments/notices', ['manage'], 'invoices.manage'), permission('POST', '/invoices/payments/notices/retry', ['manage'], 'invoices.manage'),
  permission('GET', '/invoices/payments/payouts', ['manage'], 'invoices.manage'), permission('GET', '/invoices/payments/payouts/:id', ['manage'], 'invoices.manage'), permission('POST', '/invoices/payments/payouts/:id/retry', ['manage'], 'invoices.manage'),
  permission('GET', '/invoices/payments/holds', ['manage'], 'invoices.manage'), permission('POST', '/invoices/payments/holds/:clientId/release', ['manage'], 'invoices.manage', true), permission('POST', '/invoices/payments/:paymentId/qbo/correct', ['manage'], 'invoices.manage'),
  session('GET', '/invoices', ['manage'], true), session('GET', '/invoices/projects', ['manage'], true), session('GET', '/invoices/pool', ['manage'], true),
  p('GET', '/invoices/public/:token', ['payment'], 'public'), p('GET', '/invoices/public/:token/packet', ['payment'], 'public'), p('GET', '/invoices/public/:token/po-documents/:documentId', ['payment'], 'public'), p('GET', '/invoices/public/:token/logo', ['payment'], 'public'), publicPost('/invoices/public/:token/checkout', ['payment']),
  session('POST', '/invoices', ['manage'], true), session('GET', '/invoices/:id/logo', ['manage'], true), session('GET', '/invoices/:id/packet', ['manage'], true),
  session('GET', '/invoices/:id/po-documents/:documentId', ['manage'], true), session('GET', '/invoices/:id', ['manage'], true), session('GET', '/invoices/:id/analysis', ['manage'], true),
  session('POST', '/invoices/:id/entries', ['manage'], true), session('PUT', '/invoices/:id', ['manage'], true), session('POST', '/invoices/:id/mark-sent', ['manage'], true),
  session('POST', '/invoices/:id/send', ['manage'], true), session('POST', '/invoices/:id/resend', ['manage'], true), permission('POST', '/invoices/:id/void', ['manage'], 'invoices.manage', true), session('DELETE', '/invoices/:id', ['manage'], true), permission('POST', '/invoices/:id/payments', ['manage'], 'invoices.manage'), session('POST', '/invoices/:id/qbo/retry', ['manage'], true),
  p('POST', '/webhooks/stripe', ['stripe'], 'signed-webhook', undefined, { csrfExempt: true }),
] as const

export const normalizeRoutePath = (path: string) => path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
export const routePolicyKey = (policy: Pick<RoutePolicy, 'method' | 'path'>) => `${policy.method} ${normalizeRoutePath(policy.path)}`
const routePattern = (path: string) => new RegExp(`^${normalizeRoutePath(path).split('/').map(part => part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/')}/?$`)
const compiled = ROUTE_POLICIES.map(policy => ({ policy, pattern: routePattern(policy.path) }))

export function findRoutePolicy(method: string, path: string): RoutePolicy | null {
  const normalizedMethod = method === 'HEAD' ? 'GET' : method
  return compiled.find(entry => entry.policy.method === normalizedMethod && entry.pattern.test(path))?.policy || null
}
