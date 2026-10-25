import { Hono } from 'hono'
import type { HonoEnv } from '../types/apiTypes'
import { dashboardData } from '../services/dashboardData'

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
  return api
}
