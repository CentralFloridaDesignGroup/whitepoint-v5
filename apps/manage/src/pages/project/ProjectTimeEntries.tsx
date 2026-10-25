import { useEffect, useState } from 'react';
import { requestJson } from '../../api/client';
import { formatUsdCents } from '@whitepoint/utils/currency';
import { Card } from '../common/RecordControls';

type TimeEntry = {
  id: string;
  entryDate: string;
  weekStart: string;
  weekStatus: 'draft' | 'submitted' | 'approved';
  employeeName: string;
  taskName: string | null;
  hours: number;
  note: string;
  costCents?: number | null;
  chargeCents?: number | null;
};
type EntryPage = { items: TimeEntry[]; entryCount: number; totalHours: number; hasMore: boolean; nextPage: number };
const money = (cents: number | null | undefined) => cents == null ? '—' : formatUsdCents(cents);

export function ProjectTimeEntries({ projectId, showFinancials }: { projectId: string; showFinancials: boolean }) {
  const [items, setItems] = useState<TimeEntry[]>([]);
  const [entryCount, setEntryCount] = useState(0), [totalHours, setTotalHours] = useState(0);
  const [nextPage, setNextPage] = useState(0), [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');

  async function load(page: number) {
    setLoading(true); setError('');
    try {
      const result = await requestJson<EntryPage>(`/records/projects/${encodeURIComponent(projectId)}/time-entries?page=${page}`, { authMode: 'session' });
      setItems(current => page === 0 ? result.items : [...current, ...result.items]);
      setEntryCount(result.entryCount); setTotalHours(result.totalHours);
      setHasMore(result.hasMore); setNextPage(result.nextPage);
    } catch (caught) { setError(String(caught)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(0); }, [projectId]);

  return <Card title="Project time entries">
    <p className="mb-4 text-sm text-slate-600">All recorded time for this project, including draft, submitted, and approved weeks.</p>
    {error && <p role="alert" className="mb-3 rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[750px] text-left text-sm">
      <thead className="bg-slate-50"><tr><th className="p-3">Date</th><th className="p-3">Employee</th><th className="p-3">Task</th><th className="p-3 text-right">Hours</th><th className="p-3">Week status</th><th className="p-3">Work note</th>{showFinancials && <><th className="p-3 text-right">Actual cost</th><th className="p-3 text-right">Charged value</th></>}</tr></thead>
      <tbody>{items.map(entry => <tr key={entry.id} className="border-t align-top"><td className="p-3 whitespace-nowrap">{entry.entryDate}</td><td className="p-3">{entry.employeeName}</td><td className="p-3">{entry.taskName || '—'}</td><td className="p-3 text-right tabular-nums">{Number(entry.hours).toFixed(2)}</td><td className="p-3 capitalize">{entry.weekStatus}</td><td className="p-3 whitespace-pre-wrap">{entry.note}</td>{showFinancials && <><td className="p-3 text-right tabular-nums">{money(entry.costCents)}</td><td className="p-3 text-right tabular-nums">{money(entry.chargeCents)}</td></>}</tr>)}</tbody>
      <tfoot><tr className="border-t-2 bg-slate-50 font-semibold"><th className="p-3" colSpan={3}>All entries: {entryCount}</th><td className="p-3 text-right tabular-nums">{totalHours.toFixed(2)}</td><td className="p-3" colSpan={showFinancials ? 4 : 2}>Total hours across all weeks</td></tr></tfoot>
    </table></div>
    {loading && items.length === 0 && <p className="mt-3 text-sm text-slate-600">Loading time entries…</p>}
    {!loading && entryCount === 0 && !error && <p className="mt-3 text-sm text-slate-600">No time entries have been recorded for this project.</p>}
    {hasMore && <button className="mt-4 rounded border px-3 py-2 text-sm text-sky-800 disabled:opacity-50" disabled={loading} onClick={() => void load(nextPage)}>{loading ? 'Loading…' : 'Load more entries'}</button>}
  </Card>;
}
