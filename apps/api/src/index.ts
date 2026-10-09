import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createAuthApi } from './routes/authApi'
import { createIdentityApi } from './routes/identityApi'
import { createFavoritesApi } from './routes/favoritesApi'
import { createPublicApi } from './routes/publicApi'
import { createClientApi } from './routes/clientApi'
import { createContactApi } from './routes/contactApi'
import { createProjectApi } from './routes/projectApi'
import { createRecordLookupsApi } from './routes/recordLookupsApi'
import { createQboApi } from './routes/qboApi'
import { createSearchApi } from './routes/searchApi'
import { createSettingsApi } from './routes/settingsApi'
import { createTimesheetsApi } from './routes/timesheetsApi'
import { createInvoicesApi } from './routes/invoicesApi'
import { createStripeInvoiceWebhook } from './webhooks/stripeInvoiceWebhook'
import { generateMonthlyInvoices } from './services/monthlyInvoices'
import { sendTimesheetReminders } from './services/timesheetReminders'
import { readSession, requireSession } from './auth/session'
import { serverError, type HonoEnv } from './types/apiTypes'

const app = new Hono<HonoEnv>()
const origins = (value?: string) => (value || 'http://localhost:5100,http://localhost:5200,http://localhost:5300,http://localhost:5400,https://whitepointsurvey.com,https://www.whitepointsurvey.com,https://docs.whitepointsurvey.com,https://app.whitepointsurvey.com,https://payment.whitepointsurvey.com').split(',').map(x => x.trim())
app.use('/*', cors({ origin: (origin, c) => origins(c.env.AUTH_ORIGINS).includes(origin) ? origin : '', credentials: true, allowMethods: ['GET','POST','PUT','DELETE','OPTIONS'], allowHeaders: ['Content-Type','X-CSRF-Token'] }))

const publicPaths = new Set(['/health/status','/public/contact','/public/job-applications','/identity/setup/status','/identity/setup','/identity/login','/identity/session','/identity/password/reset','/identity/password/set','/identity/passkey/login/options','/identity/passkey/login/verify','/qbo/callback'])
const csrfExempt = new Set(['/public/contact','/public/job-applications','/identity/setup','/identity/login','/identity/password/reset','/identity/password/set','/identity/passkey/login/options','/identity/passkey/login/verify','/qbo/callback'])
function permission(method: string, path: string): string | null {
  if (path === '/identity/me') return null
  if (path === '/identity/me/favorites') return null
  if (path === '/identity/permissions' || path === '/identity/roles') return 'company.roles.view'
  if (path === '/identity/roles/bulk') return 'company.roles.manage'
  if (path === '/identity/users/bulk') return 'users.manage'
  if (path.startsWith('/identity/users')) return method === 'GET' ? 'users.view' : path.endsWith('/invite') ? 'users.invite' : path.endsWith('/recover') || path.endsWith('/archive') || method === 'PUT' ? 'users.manage' : 'users.create'
  if (path.startsWith('/identity/')) return null
  if (path.startsWith('/qbo/')) return method === 'GET' ? 'company.qbo.view' : 'company.qbo.manage'
  if (path.startsWith('/settings/')) return method === 'GET' ? 'company.view' : 'company.manage'
  if (path === '/settings') return method === 'GET' ? 'company.view' : 'company.manage'
  if (path === '/search' || path === '/search/') return null
  if (path === '/timesheets' || path.startsWith('/timesheets/')) return null
  if (path === '/invoices' || path.startsWith('/invoices/')) return null
  if (path === '/records/lookups/users') return 'projects.view'
  if (path === '/records/lookups/clients' || path.startsWith('/records/lookups/clients/')) return 'projects.view'
  if (path.startsWith('/records/clients/')) return path.includes('/qbo/retry') ? 'company.qbo.resync' : method === 'GET' ? 'clients.view' : 'clients.manage.basic'
  if (path === '/records/clients') return method === 'GET' ? 'clients.view' : 'clients.create'
  if (path.startsWith('/records/projects/')) return path.includes('/qbo/retry') ? 'company.qbo.resync' : method === 'GET' ? 'projects.view' : path.endsWith('/archive') ? 'projects.manage' : null
  if (path === '/records/projects') return method === 'GET' ? 'projects.view' : 'projects.create'
  return '__deny__'
}
app.use('/*', async (c, next) => {
  const path = c.req.path, method = c.req.method
  if (method === 'OPTIONS') return next()
  if (path === '/webhooks/stripe' && method === 'POST') return next()
  const origin = c.req.header('Origin') || ''
  if (origin && !origins(c.env.AUTH_ORIGINS).includes(origin)) return c.json({ error: 'Origin not allowed.' }, 403)
  if (!['GET','HEAD'].includes(method)) {
    if (!origin || !origins(c.env.AUTH_ORIGINS).includes(origin)) return c.json({ error: 'Origin required.' }, 403)
    if (!csrfExempt.has(path) && !path.startsWith('/invoices/public/')) {
      const session = await readSession(c.env.DB, c.req.raw)
      if (!session || c.req.header('X-CSRF-Token') !== session.csrfToken) return c.json({ error: 'CSRF check failed.' }, 403)
    }
  }
  if (publicPaths.has(path) || path.startsWith('/invoices/public/')) return next()
  const required = permission(method, path)
  if (required === '__deny__') return c.json({ error: 'Not found.' }, 404)
  if (path.startsWith('/identity/') && ['/identity/logout','/identity/mfa','/identity/totp/start','/identity/totp/confirm','/identity/passkey/register/options','/identity/passkey/register/verify'].includes(path)) return next()
  return requireSession(required || undefined)(c, next)
})
app.get('/health/status', c => c.json({ status: 'ok' }))
app.route('/public', createPublicApi())
app.route('/identity', createAuthApi())
app.route('/identity', createIdentityApi())
app.route('/identity', createFavoritesApi())
app.route('/records', createRecordLookupsApi())
app.route('/records', createContactApi())
app.route('/records', createClientApi())
app.route('/records', createProjectApi())
app.route('/qbo', createQboApi())
app.route('/settings', createSettingsApi())
app.route('/search', createSearchApi())
app.route('/timesheets', createTimesheetsApi())
app.route('/invoices', createInvoicesApi())
app.route('/webhooks', createStripeInvoiceWebhook())
app.notFound(() => new Response('Not Found', { status: 404 }))
app.onError(error => { console.error('Unhandled API error:', error); return serverError() })

export default { async fetch(request: Request, env: HonoEnv['Bindings'], executionContext: ExecutionContext): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname === '/v5' || url.pathname.startsWith('/v5/')) url.pathname = url.pathname.slice(3) || '/'
  return app.fetch(new Request(url, request), env, executionContext)
}, async scheduled(controller: ScheduledController, env: HonoEnv['Bindings']): Promise<void> {
  await sendTimesheetReminders(env,controller.scheduledTime)
  await generateMonthlyInvoices(env,controller.scheduledTime)
} }
