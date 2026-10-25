import { Button } from '@whitepoint/ui/input';
import { hours, type Entry } from './model';

export function EntryCell({
  entry,
  editable,
  onClick,
}: {
  entry: Entry;
  editable: boolean;
  onClick: () => void;
}) {
  const label = `${hours(entry.hours)} hours${entry.taskName ? ` · ${entry.taskName}` : ""}${entry.note ? ` · ${entry.note}` : ""}`;
  return editable ? (
    <button
      type="button"
      title={label}
      aria-label={`Edit ${label}`}
      className="w-full min-w-0 rounded px-1 py-0.5 hover:bg-sky-100 cursor-pointer"
      onClick={onClick}
    >
      <div className="flex min-w-0 flex-row items-center gap-2">
        <span className="shrink-0 font-semibold text-xs">
          {hours(entry.hours)}
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-xs">
          {entry.taskName ?? "Project Time"}
        </span>
      </div>
    </button>
  ) : (
    <span title={label} className="block w-full min-w-0 px-1 py-0.5">
      <div className="flex min-w-0 flex-row items-center gap-2">
        <span className="shrink-0 font-semibold text-xs">
          {hours(entry.hours)}
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-xs">
          {entry.taskName ?? "Project Time"}
        </span>
      </div>
    </span>
  );
}

export function MobileEntry({
  entry,
  editable,
  onEdit,
}: {
  entry: Entry;
  editable: boolean;
  onEdit: () => void;
}) {
  const content = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-semibold text-slate-900">
            {entry.projectNumber}
          </span>
          <span className="block text-sm text-slate-600">
            {entry.projectName}
          </span>
        </span>
        <strong className="shrink-0 tabular-nums text-sky-900">
          {hours(entry.hours)} h
        </strong>
      </span>
      {entry.taskName && (
        <span className="mt-2 block text-sm font-medium text-slate-700">
          {entry.taskName}
        </span>
      )}
      <span className="mt-1 block whitespace-pre-wrap text-sm text-slate-700">
        {entry.note}
      </span>
    </>
  );
  return editable ? (
    <button
      type="button"
      className="w-full rounded-xl border bg-white p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
      aria-label={`Edit ${entry.projectNumber}, ${hours(entry.hours)} hours`}
      onClick={onEdit}
    >
      {content}
    </button>
  ) : (
    <div className="rounded-xl border bg-white p-4">{content}</div>
  );
}

export function AddEntryButton({
  description,
  onClick,
}: {
  description: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={description}
      title={description}
      size="small"
      variant="secondary"
      onClick={onClick}
    >
      +
    </Button>
  );
}
