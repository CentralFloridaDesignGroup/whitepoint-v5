import { Hono } from 'hono'
import type { HonoEnv } from '../types/apiTypes'
import type { DashboardDetailMetric } from '@whitepoint/types'
import { dashboardData } from '../services/dashboardData'
import { dashboardDetails } from '../services/dashboardDetails.ts'

const detailMetrics: DashboardDetailMetric[] = [
  'project-active','project-due-soon','project-overdue','project-opportunity','project-proposal','project-shortlisted','project-negotiating',
  'invoice-paid','invoice-all','invoice-outstanding','invoice-late','invoice-draft','month','utilization','missing-targets','income-multiplier',
]

export function createDashboardApi() {
  const api = new Hono<HonoEnv>()
  api.get('/', async c => {
    const has = (key: string) => c.get('permissions').hasPermission(key)
    return c.json(await dashboardData(c.env.DB, {
      projects: has('projects.view'),
      financials: has('invoices.view'),
      utilization: has('timesheets.view'),
      multiplier: has('invoices.view') && has('timesheets.rates.view'),
    }))
  })
  api.get('/details', async c => {
    const metric = c.req.query('metric')
    if (!metric || !detailMetrics.includes(metric as DashboardDetailMetric)) return c.json({ error: 'Unsupported dashboard metric.' }, 400)
    const has = (key: string) => c.get('permissions').hasPermission(key)
    try {
      const result = await dashboardDetails(c.env.DB, metric as DashboardDetailMetric, {
        projects:has('projects.view'),
        invoices:has('invoices.view'),
        utilization:has('timesheets.view'),
        multiplier:has('invoices.view') && has('timesheets.rates.view'),
      }, c.req.query('month'))
      return c.json(result)
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') return c.json({ error: 'Forbidden' }, 403)
      if (error instanceof Error && error.message === 'INVALID_MONTH') return c.json({ error: 'Choose a month in the dashboard period.' }, 400)
      throw error
    }
  })
  return api
}
