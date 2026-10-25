import { useEffect, useMemo, useState } from 'react';
import { Button, Textarea, Textbox, Toggle } from '@whitepoint/ui/input';
import type { AppSettings } from '@whitepoint/types';
import { requestBlob, requestJson } from '../../../api/client';
import { SettingsFrame } from '../SettingsFrame';
import { useUnsavedChanges } from '../useUnsavedChanges';
import { useAuth } from '../../../auth/AuthContext';

type Draft = Pick<AppSettings, 'companyName' | 'companyShortName' | 'invoiceNumberTemplate' | 'defaultInvoiceNote' | 'projectNumberTemplate' | 'clientNumberTemplate' | 'invoiceResetYearly' | 'projectResetYearly' | 'clientResetYearly' | 'revision'>;
const fields = ['companyName', 'companyShortName', 'invoiceNumberTemplate', 'defaultInvoiceNote', 'projectNumberTemplate', 'clientNumberTemplate', 'invoiceResetYearly', 'projectResetYearly', 'clientResetYearly'] as const;
function preview(template: string) {
  const date = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const year = date.find(part => part.type === 'year')?.value.slice(-2) || '00', month = date.find(part => part.type === 'month')?.value || '01';
  return template.replace(/\{YY\}/g, year).replace(/\{MM\}/g, month).replace(/\{(#{1,10})\}/, (_, hashes: string) => '1'.padStart(hashes.length, '0'));
}
export function ApplicationSettings() {
  const canManage = useAuth().hasPermission('company.manage');
  const [saved, setSaved] = useState<AppSettings | null>(null), [draft, setDraft] = useState<Draft | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({}), [files, setFiles] = useState<Record<string, File>>({});
  const [nextProject, setNextProject] = useState(''), [nextClient, setNextClient] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [logoImages, setLogoImages] = useState<Record<string, string>>({});
  const [filePreviews, setFilePreviews] = useState<Record<string, string>>({});
  const dirty = Boolean(saved && draft && (fields.some(field => draft[field] !== saved[field]) || Object.keys(files).length));
  useUnsavedChanges(dirty);
  useEffect(() => { void requestJson<{ settings: AppSettings; nextProjectNumber: string; nextClientNumber: string }>('/settings', { authMode: 'session', method: 'GET' }).then(data => { setSaved(data.settings); setDraft(data.settings); setNextProject(data.nextProjectNumber); setNextClient(data.nextClientNumber); }).catch(e => setError(String(e))); }, []);
  useEffect(() => {
    if (!saved) return;
    let active = true;
    const urls: string[] = [];
    void Promise.all((['rectangular', 'square'] as const).map(async kind => {
      const url = kind === 'rectangular' ? saved.rectangularLogoUrl : saved.squareLogoUrl;
      if (!url) return;
      const blob = await requestBlob(url, { authMode: 'session', method: 'GET' });
      const local = URL.createObjectURL(blob); urls.push(local);
      if (active) setLogoImages(current => ({ ...current, [kind]: local }));
    })).catch(() => undefined);
    return () => { active = false; urls.forEach(URL.revokeObjectURL); };
  }, [saved]);
  useEffect(() => {
    const entries = Object.entries(files).map(([kind, file]) => [kind, URL.createObjectURL(file)] as const);
    setFilePreviews(Object.fromEntries(entries));
    return () => entries.forEach(([, url]) => URL.revokeObjectURL(url));
  }, [files]);
  const validation = useMemo(() => {
    if (!draft) return '';
    for (const [template, reset] of [[draft.invoiceNumberTemplate, draft.invoiceResetYearly], [draft.projectNumberTemplate, draft.projectResetYearly], [draft.clientNumberTemplate, draft.clientResetYearly]] as const) {
      const tokens = [...template.matchAll(/\{([^{}]*)\}/g)];
      if (tokens.filter(token => /^#{1,10}$/.test(token[1])).length !== 1 || tokens.some(token => !['YY', 'MM'].includes(token[1]) && !/^#{1,10}$/.test(token[1])) || /[{}]/.test(template.replace(/\{[^{}]*\}/g, ''))) return 'Each template needs one {#} through {##########} token; {YY} and {MM} are optional.';
      if (reset && !template.includes('{YY}')) return 'A yearly reset requires {YY}.';
    }
    return '';
  }, [draft]);
  function change<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(current => current ? { ...current, [key]: value } : current); }
  async function save() {
    if (!draft || !saved || validation || !canManage) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const uploaded = { ...keys };
      for (const kind of ['rectangular', 'square'] as const) {
        const file = files[kind]; if (!file || uploaded[kind]) continue;
        const result = await requestJson<{ key: string }>(`/settings/logo/${kind}`, { authMode: 'session', method: 'POST', body: file, headers: { 'Content-Type': file.type } });
        uploaded[kind] = result.key;
        setKeys(current => ({ ...current, [kind]: result.key }));
      }
      setKeys(uploaded);
      const result = await requestJson<{ settings: AppSettings }>('/settings', { authMode: 'session', method: 'PUT', body: JSON.stringify({ ...draft, rectangularLogoKey: uploaded.rectangular, squareLogoKey: uploaded.square }) });
      setSaved(result.settings); setDraft(result.settings); setFiles({}); setKeys({}); setNotice('Application settings saved.');
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  return <SettingsFrame>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}{notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!draft ? <p>Loading settings…</p> : <fieldset disabled={!canManage} className="space-y-6">
      <section className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2"><h2 className="sm:col-span-2 text-lg font-semibold">Company</h2>
        <Textbox label="Company name" value={draft.companyName} onChange={e => change('companyName', e.target.value)} required />
        <Textbox label="Company short name" value={draft.companyShortName} onChange={e => change('companyShortName', e.target.value)} required />
      </section>
      <section className="space-y-4 rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">Number templates</h2>
        <Textbox label="Invoice number template" value={draft.invoiceNumberTemplate} onChange={e => change('invoiceNumberTemplate', e.target.value)} description={`Preview: ${preview(draft.invoiceNumberTemplate)}. Used for new invoices.`} />
        <Toggle label="Reset invoice sequence each new year" checked={draft.invoiceResetYearly} onChange={value => change('invoiceResetYearly', value)} />
        <Textbox label="Project number template" value={draft.projectNumberTemplate} onChange={e => change('projectNumberTemplate', e.target.value)} description={`Preview: ${preview(draft.projectNumberTemplate)}. Current next number: ${nextProject}`} />
        <Toggle label="Reset project sequence each new year" checked={draft.projectResetYearly} onChange={value => change('projectResetYearly', value)} />
        <Textbox label="Client number template" value={draft.clientNumberTemplate} onChange={e => change('clientNumberTemplate', e.target.value)} description={`Preview: ${preview(draft.clientNumberTemplate)}. Current next number: ${nextClient}`} />
        <Toggle label="Reset client sequence each new year" checked={draft.clientResetYearly} onChange={value => change('clientResetYearly', value)} />
        {validation && <p role="alert" className="text-sm text-red-700">{validation}</p>}
      </section>
      <section className="rounded-xl border bg-white p-5"><h2 className="mb-4 text-lg font-semibold">Invoice defaults</h2><Textarea label="Default invoice note" value={draft.defaultInvoiceNote} onChange={e => change('defaultInvoiceNote', e.target.value)} rows={5} /></section>
      <section className="grid gap-5 rounded-xl border bg-white p-5 sm:grid-cols-2"><h2 className="sm:col-span-2 text-lg font-semibold">Logos</h2>{(['rectangular', 'square'] as const).map(kind => <div key={kind} className="space-y-3"><p className="font-medium capitalize">{kind} logo</p>{filePreviews[kind] || logoImages[kind] ? <img className="max-h-32 max-w-full object-contain" src={filePreviews[kind] || logoImages[kind]} alt={`${kind} logo preview`} /> : <p className="text-sm text-slate-500">No logo stored.</p>}<Textbox type="file" label={`Choose ${kind} logo`} accept="image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; if (file) { setFiles(current => ({ ...current, [kind]: file })); setKeys(current => { const next = { ...current }; delete next[kind]; return next; }); } }} description="PNG or WebP, up to 5 MB" /></div>)}</section>
      {dirty && canManage && <div className="flex justify-end"><Button onClick={() => void save()} disabled={busy || Boolean(validation)}>Save settings</Button></div>}
    </fieldset>}
  </SettingsFrame>;
}
