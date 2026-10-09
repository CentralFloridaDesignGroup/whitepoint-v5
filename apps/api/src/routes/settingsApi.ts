import { Hono } from 'hono';
import type { AppSettings } from '@whitepoint/types';
import { businessDate, formatNumber, validateNumberTemplate } from '../services/numbering';
import { companyLogoResponse } from '../services/companyBranding';
import type { HonoEnv } from '../types/apiTypes';

type Row = Record<string, string | number | null>;
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const logoUrl = (kind: string, revision: number) => `/settings/logo/${kind}?v=${revision}`;
function settings(row: Row): AppSettings {
  return {
    companyName: String(row.company_name), companyShortName: String(row.company_short_name),
    invoiceNumberTemplate: String(row.invoice_number_template), defaultInvoiceNote: String(row.default_invoice_note),
    projectNumberTemplate: String(row.project_number_template), invoiceResetYearly: row.invoice_reset_yearly === 1,
    projectResetYearly: row.project_reset_yearly === 1,
    clientNumberTemplate: String(row.client_number_template), clientResetYearly: row.client_reset_yearly === 1,
    rectangularLogoUrl: row.rectangular_logo_key ? logoUrl('rectangular', Number(row.revision)) : null,
    squareLogoUrl: row.square_logo_key ? logoUrl('square', Number(row.revision)) : null,
    revision: Number(row.revision),
  };
}
const load = (db: D1Database) => db.prepare('SELECT * FROM app_settings WHERE id=1').first<Row>();
const validLogoKey = (value: unknown, kind: string) => typeof value === 'string' && new RegExp(`^brand/staged/${kind}/[a-f0-9-]{36}$`).test(value);

export function createSettingsApi() {
  const api = new Hono<HonoEnv>();
  api.get('/', async c => {
    const row = await load(c.env.DB);
    if (!row) return c.json({ error: 'Settings are not initialized.' }, 503);
    const value = settings(row);
    const sequence = await c.env.DB.prepare('SELECT last_value FROM number_sequences WHERE kind=? AND period=?').bind('project', value.projectResetYearly ? businessDate().year : 'all').first<{ last_value: number }>();
    const clientSequence = await c.env.DB.prepare('SELECT last_value FROM client_number_sequences WHERE period=?').bind(value.clientResetYearly ? businessDate().year : 'all').first<{ last_value: number }>();
    return c.json({ settings: value, nextProjectNumber: formatNumber(value.projectNumberTemplate, (sequence?.last_value ?? 0) + 1), nextClientNumber: formatNumber(value.clientNumberTemplate, (clientSequence?.last_value ?? 0) + 1) });
  });
  api.get('/logo/:kind', async c => {
    const kind = c.req.param('kind');
    if (kind !== 'rectangular' && kind !== 'square') return c.notFound();
    return await companyLogoResponse(c.env, kind) || c.notFound();
  });
  api.post('/logo/:kind', async c => {
    const kind = c.req.param('kind');
    if (kind !== 'rectangular' && kind !== 'square') return c.notFound();
    const file = await c.req.blob();
    if (file.size < 1 || file.size > 5 * 1024 * 1024) return c.json({ error: 'Choose a logo smaller than 5 MB.' }, 400);
    if (!['image/png', 'image/webp'].includes(file.type)) return c.json({ error: 'Use PNG or WebP.' }, 400);
    const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const png = signature.length >= 8 && [137,80,78,71,13,10,26,10].every((byte, index) => signature[index] === byte);
    const webp = signature.length >= 12 && String.fromCharCode(...signature.slice(0, 4)) === 'RIFF' && String.fromCharCode(...signature.slice(8, 12)) === 'WEBP';
    if ((file.type === 'image/png' && !png) || (file.type === 'image/webp' && !webp)) return c.json({ error: 'The selected file is not a valid PNG or WebP image.' }, 400);
    const key = `brand/staged/${kind}/${crypto.randomUUID()}`;
    await c.env.BRAND_ASSETS.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    return c.json({ key });
  });
  api.put('/', async c => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => null);
    if (!body) return c.json({ error: 'Expected settings JSON.' }, 400);
    const current = await load(c.env.DB);
    if (!current) return c.json({ error: 'Settings are not initialized.' }, 503);
    const revision = Number(body.revision);
    if (revision !== Number(current.revision)) return c.json({ error: 'Settings changed elsewhere. Reload before saving.' }, 409);
    const companyName = text(body.companyName, 200), companyShortName = text(body.companyShortName, 80);
    const invoiceNumberTemplate = text(body.invoiceNumberTemplate, 80), projectNumberTemplate = text(body.projectNumberTemplate, 80), clientNumberTemplate = text(body.clientNumberTemplate, 80);
    if (!companyName || !companyShortName || typeof body.invoiceResetYearly !== 'boolean' || typeof body.projectResetYearly !== 'boolean' || typeof body.clientResetYearly !== 'boolean') return c.json({ error: 'Company names and reset settings are required.' }, 400);
    const problem = validateNumberTemplate(invoiceNumberTemplate, body.invoiceResetYearly) || validateNumberTemplate(projectNumberTemplate, body.projectResetYearly) || validateNumberTemplate(clientNumberTemplate, body.clientResetYearly);
    if (problem) return c.json({ error: problem }, 400);
    const rectangular = body.rectangularLogoKey === undefined ? current.rectangular_logo_key : body.rectangularLogoKey;
    const square = body.squareLogoKey === undefined ? current.square_logo_key : body.squareLogoKey;
    for (const [kind, key] of [['rectangular', rectangular], ['square', square]] as const) {
      if (key && key !== current[`${kind}_logo_key`] && (!validLogoKey(key, kind) || !(await c.env.BRAND_ASSETS.head(String(key))))) return c.json({ error: `Invalid ${kind} logo.` }, 400);
    }
    const result = await c.env.DB.prepare(`UPDATE app_settings SET company_name=?,company_short_name=?,invoice_number_template=?,default_invoice_note=?,project_number_template=?,client_number_template=?,invoice_reset_yearly=?,project_reset_yearly=?,client_reset_yearly=?,rectangular_logo_key=?,square_logo_key=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=?`)
      .bind(companyName, companyShortName, invoiceNumberTemplate, text(body.defaultInvoiceNote, 4000), projectNumberTemplate, clientNumberTemplate, Number(body.invoiceResetYearly), Number(body.projectResetYearly), Number(body.clientResetYearly), rectangular, square, revision).run();
    if (!result.meta.changes) return c.json({ error: 'Settings changed elsewhere. Reload before saving.' }, 409);
    return c.json({ settings: settings((await load(c.env.DB))!) });
  });
  return api;
}
