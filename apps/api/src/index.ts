import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createAuthApi } from './routes/authApi'
import { createIdentityApi } from './routes/identityApi'
import { createRolesApi } from './routes/rolesApi'
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
import { createDashboardApi } from './routes/dashboardApi'
import { createStripeInvoiceWebhook } from './webhooks/stripeInvoiceWebhook'
import { generateMonthlyInvoices } from './services/monthlyInvoices'
import { sendTimesheetReminders } from './services/timesheetReminders'
import { readSession, requireSession } from './auth/session'
import { findRoutePolicy } from './security/routePolicies'
import { serverError, type HonoEnv } from './types/apiTypes'

export const app = new Hono<HonoEnv>()
const origins = (value?: string) => (value || 'http://localhost:5100,http://localhost:5200,http://localhost:5300,http://localhost:5400,https://whitepointsurvey.com,https://www.whitepointsurvey.com,https://docs.whitepointsurvey.com,https://app.whitepointsurvey.com,https://payment.whitepointsurvey.com').split(',').map(x => x.trim())
app.use('/*', cors({ origin: (origin, c) => origins(c.env.AUTH_ORIGINS).includes(origin) ? origin : '', credentials: true, allowMethods: ['GET','POST','PUT','DELETE','OPTIONS'], allowHeaders: ['Content-Type','X-CSRF-Token'] }))
app.use('/*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('X-Frame-Options', 'DENY')
  if (c.req.path !== '/health/status') c.header('Cache-Control', 'no-store')
})
app.use('/*', async (c, next) => {
  const path = c.req.path, method = c.req.method
  if (method === 'OPTIONS') return next()
  const policy = findRoutePolicy(method, path)
  if (!policy) return c.json({ error: 'Not found.' }, 404)
  if (policy.access === 'signed-webhook') return next()
  const origin = c.req.header('Origin') || ''
  if (origin && !origins(c.env.AUTH_ORIGINS).includes(origin)) return c.json({ error: 'Origin not allowed.' }, 403)
  if (!['GET','HEAD'].includes(method)) {
    if (!origin || !origins(c.env.AUTH_ORIGINS).includes(origin)) return c.json({ error: 'Origin required.' }, 403)
    if (!policy.csrfExempt) {
      const session = await readSession(c.env.DB, c.req.raw)
      if (!session || c.req.header('X-CSRF-Token') !== session.csrfToken) return c.json({ error: 'CSRF check failed.' }, 403)
    }
  }
  if (policy.access === 'public' || policy.access === 'pending-session') return next()
  return requireSession(policy.access === 'permission' ? policy.permission : undefined)(c, next)
})
app.get('/health/status', c => c.json({ status: 'ok' }))
app.route('/public', createPublicApi())
app.route('/identity', createAuthApi())
app.route('/identity', createIdentityApi())
app.route('/identity', createRolesApi())
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
app.route('/dashboard', createDashboardApi())
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
