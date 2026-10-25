import { Card } from './RecordControls';

export type RecordAuditRow = {
  id: string;
  actor_id: string;
  action: string;
  created_at: string;
};

export function RecordAuditTab({ audit }: { audit: RecordAuditRow[] }) {
  return (
    <Card title="Record history">
      {audit.length ? (
        <div className="divide-y">
          {audit.map(row => (
            <p key={row.id} className="py-2 text-sm">
              <span className="font-medium capitalize">{row.action}</span> · {new Date(row.created_at).toLocaleString()} · User {row.actor_id}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No saved activity yet.</p>
      )}
    </Card>
  );
}
