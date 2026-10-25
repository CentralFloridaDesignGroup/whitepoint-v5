import { Hono } from 'hono';
import type { HonoEnv } from '../types/apiTypes';
import { projectManagerOptions } from './recordSupport';

export function createRecordLookupsApi() {
  const api = new Hono<HonoEnv>();
  api.get('/lookups/users', async c => c.json((await c.env.DB.prepare("SELECT id,display_name FROM users_named WHERE user_type='internal' AND active=1 AND archived_at IS NULL ORDER BY display_name COLLATE NOCASE").all()).results || []));
  api.get('/lookups/project-managers', async c => c.json(await projectManagerOptions(c.env.DB)));
  api.get('/lookups/clients', async c => c.json((await c.env.DB.prepare("SELECT id,client_number,name FROM clients WHERE archived_at IS NULL AND status='active' ORDER BY name COLLATE NOCASE").all()).results || []));
  return api;
}
