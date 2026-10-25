import { useState } from "react";
import type { Entry, Lookups } from "./model";
import { shift } from "./model";
import { X } from "lucide-react";
import {
  Button,
  SearchableDropdown,
  Textarea,
  Textbox,
} from "@whitepoint/ui/input";

export type EntryDraft = {
  id: string;
  entryDate: string;
  projectId: string;
  taskId: string;
  hours: string;
  note: string;
};

export function TimeEntryDialog({
  start,
  initial,
  lookups,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  start: string;
  initial: EntryDraft;
  lookups: Lookups;
  busy: boolean;
  onClose: () => void;
  onSave: (draft: EntryDraft) => void;
  onDelete?: (id: string) => void;
}) {
  const [entry, setEntry] = useState(initial);
  const tasks = lookups.tasks.filter(
    (task) => task.project_id === entry.projectId,
  );
  const projects = lookups.projects;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-800/60 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-title"
        className="max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-t-md bg-white px-5 py-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:max-h-[70vh] sm:rounded-md sm:pb-5"
      >
        <div className="flex items-center justify-between gap-3 mt-2">
          <h2 id="entry-title" className="text-xl font-semibold">
            {entry.id ? "Edit time entry" : "Add time entry"}
          </h2>
          <button
            type="button"
            aria-label="Close"
            className="rounded text-xl"
            onClick={onClose}
          >
            <X className="h-6 w-6 p-0 m-0 rounded-md hover:bg-neutral-200 hover:text-red-500 cursor-pointer" />
          </button>
        </div>
        <form
          className="mt-4 grid gap-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(entry);
          }}
        >
          <Textbox
            label="Date"
            type="date"
            required
            min={start}
            max={shift(start, 6)}
            value={entry.entryDate}
            onChange={(event) =>
              setEntry({ ...entry, entryDate: event.target.value })
            }
          />
          <Textbox
            label="Decimal hours"
            type="number"
            inputMode="decimal"
            required
            min="0.01"
            max="23.99"
            step="0.01"
            value={entry.hours}
            onChange={(event) =>
              setEntry({ ...entry, hours: event.target.value })
            }
          />
          <SearchableDropdown
            label="Project"
            required
            placeholder="Select project"
            options={projects.map((project) => ({
              value: project.id,
              label: `${project.project_number} ${project.name}`,
            }))}
            value={entry.projectId}
            onChange={(value) =>
              setEntry({
                ...entry,
                projectId: value,
                taskId: "",
              })
            }
          />
          <SearchableDropdown
            label="Task"
            required={!!entry.projectId && tasks.length > 0}
            placeholder={entry.projectId ? (tasks.length > 0 ? "Select task" : "No tasks available") : "Select project first"}
            disabled={!entry.projectId || tasks.length === 0} // Disable if no project selected or no tasks available
            options={tasks.map((task) => ({
              value: task.id,
              label: task.task_name,
            }))}
            value={entry.taskId}
            onChange={(value) =>
              setEntry({
                ...entry,
                taskId: value,
              })
            }
          />
          <div className="md:col-span-2">
            <Textarea
              label="Work completed"
              required
              value={entry.note}
              onChange={(event) =>
                setEntry({ ...entry, note: event.target.value })
              }
            />
          </div>
          <div className="md:col-span-2 flex flex-row gap-2 justify-between">
            {entry.id && onDelete ? (
              <Button
                type="button"
                variant="danger"
                size="small"
                disabled={busy}
                onClick={() => onDelete(entry.id)}
              >
                Delete record
              </Button>
            ): <span className="flex-1 invisible">You shouldn't see this</span>}
            <div className="gap-2 flex flex-row">
              <Button
                type="button"
                variant="secondary"
                size="small"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="small"
                disabled={busy}
              >
                Save entry
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function draftFromEntry(entry: Entry): EntryDraft {
  return {
    id: entry.id,
    entryDate: entry.entryDate,
    projectId: entry.projectId,
    taskId: entry.taskId || "",
    hours: String(entry.hours),
    note: entry.note,
  };
}
