import { Hono } from 'hono';
import type { HonoEnv } from '../types/apiTypes';

export function createContactApi() {
  const api = new Hono<HonoEnv>();
  api.get('/lookups/clients/:id/contacts', async c => c.json(
    (await c.env.DB.prepare('SELECT id,name,email,is_poc,is_billing_poc FROM contacts WHERE client_id=? AND archived_at IS NULL ORDER BY name COLLATE NOCASE').bind(c.req.param('id')).all()).results || [],
  ));
  return api;
}
