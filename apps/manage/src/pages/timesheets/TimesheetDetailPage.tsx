import { shortDate } from "./model";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { requestJson } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import {
  TimeEntryDialog,
  draftFromEntry,
  type EntryDraft,
} from "./TimeEntryDialog";
import {
  defaultEntryDate,
  hours,
  shift,
  type Lookups,
  type Week,
} from "./model";
import { TimesheetStatusBadge } from "./TimesheetsPage";
import { AddEntryButton, EntryCell, MobileEntry } from "./TimesheetEntryViews";
import { ArrowDown, ArrowLeft, ArrowUp } from "lucide-react";
import { Button, Textbox } from "@whitepoint/ui/input";

const projectSortModes = [
  "normal",
  "name-asc",
  "name-desc",
  "number-asc",
  "number-desc",
] as const;
type ProjectSort = (typeof projectSortModes)[number];
const projectSortLabels: Record<ProjectSort, string> = {
  normal: "Normal order",
  "name-asc": "Name ascending",
  "name-desc": "Name descending",
  "number-asc": "Number ascending",
  "number-desc": "Number descending",
};

export function TimesheetDetailPage() {
  const auth = useAuth(),
    { start = "" } = useParams(),
    [params, setParams] = useSearchParams(),
    subject = params.get("userId") || auth.internalUserId || "";
  const [week, setWeek] = useState<Week | null>(null),
    [lookups, setLookups] = useState<Lookups>({ projects: [], tasks: [] }),
    [draft, setDraft] = useState<EntryDraft | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [projectFilterText, setProjectFilterText] = useState("");
  const [selectedDay, setSelectedDay] = useState(() => defaultEntryDate(start));
  const [projectSort, setProjectSort] = useState<ProjectSort>("normal");
  const own = subject === auth.internalUserId,
    editable = Boolean(
      week?.canEdit && ["draft", "rejected"].includes(week.status),
    ),
    canReview = week?.canReview,
    back =
      params.get("from") === "all" && auth.hasPermission("timesheets.view")
        ? `/timesheets/review?week=${start}`
        : `/timesheets?week=${start}`;
  useEffect(() => {
    if (!subject) return;
    let active = true;
    setWeek(null);
    setDraft(null);
    setError("");
    void Promise.all([
      requestJson<Week>(
        `/timesheets/weeks/${start}?userId=${encodeURIComponent(subject)}`,
        { authMode: "session" },
      ),
      requestJson<Lookups>("/timesheets/lookups", { authMode: "session" }),
    ])
      .then(([w, l]) => {
        if (active) {
          setWeek(w);
          setLookups(l);
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [start, subject]);
  useEffect(() => setSelectedDay(defaultEntryDate(start)), [start]);
  useEffect(() => {
    setProjectFilterText("");
    setProjectSort("normal");
  }, [start, subject]);
  async function run(
    path: string,
    method: "PUT" | "POST" | "DELETE",
    body?: unknown,
  ) {
    setBusy(true);
    setError("");
    try {
      const result = await requestJson<Week>(path, {
        authMode: "session",
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      setWeek(result);
      setDraft(null);
      const savedDay = (body as { entryDate?: unknown } | undefined)?.entryDate;
      if (method === "PUT" && typeof savedDay === "string")
        setSelectedDay(savedDay);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function add(projectId = "", entryDate = defaultEntryDate(start)) {
    setDraft({ id: "", entryDate, projectId, taskId: "", hours: "", note: "" });
  }

  useEffect(() => {
    if (!week || !editable || params.get("new") !== "1") return;
    add();
    setParams(previous => {
      const next = new URLSearchParams(previous);
      next.delete("new");
      return next;
    }, { replace: true });
  }, [week, editable, params, setParams]);

  const days = Array.from({ length: 7 }, (_, i) => shift(start, i)),
    entries = week?.entries || [];
  const allProjects = Array.from(
    new Map(
      entries.map((e) => [
        e.projectId,
        { id: e.projectId, number: e.projectNumber, name: e.projectName },
      ]),
    ).values(),
  );
  const search = projectFilterText.trim().toLocaleLowerCase();
  const compareProjects = (
    a: (typeof allProjects)[number],
    b: (typeof allProjects)[number],
  ) => {
    if (projectSort === "normal") return 0;
    const field = projectSort.startsWith("name") ? "name" : "number";
    const direction = projectSort.endsWith("desc") ? -1 : 1;
    return (
      direction *
        a[field].localeCompare(b[field], undefined, { numeric: true }) ||
      a.number.localeCompare(b.number, undefined, { numeric: true }) ||
      a.id.localeCompare(b.id)
    );
  };
  const projects = allProjects
    .filter(
      (project) =>
        !search ||
        project.number.toLocaleLowerCase().includes(search) ||
        project.name.toLocaleLowerCase().includes(search),
    )
    .sort(compareProjects);
  const visibleProjectIds = new Set(projects.map((project) => project.id));
  const visibleEntries = entries.filter((entry) =>
    visibleProjectIds.has(entry.projectId),
  );
  const projectOrder = new Map(
    projects.map((project, index) => [project.id, index]),
  );
  const dayTotals = days.map((day) =>
    visibleEntries
      .filter((e) => e.entryDate === day)
      .reduce((sum, e) => sum + Number(e.hours), 0),
  );
  const dayCounts = days.map(
    (day) => visibleEntries.filter((e) => e.entryDate === day).length,
  );
  const total = dayTotals.reduce((sum, value) => sum + value, 0);
  const selectedEntries = visibleEntries
    .filter((entry) => entry.entryDate === selectedDay)
    .sort(
      (a, b) =>
        (projectOrder.get(a.projectId) ?? 0) -
        (projectOrder.get(b.projectId) ?? 0),
    );
  const selectedHours = selectedEntries.reduce(
    (sum, entry) => sum + Number(entry.hours),
    0,
  );
  const showRates =
    auth.hasPermission("timesheets.rates.view") &&
    visibleEntries.some((e) => e.costCents != null || e.chargeCents != null);
  const financialTotal = (
    day: string | undefined,
    field: "costCents" | "chargeCents",
  ) =>
    visibleEntries
      .filter((e) => !day || e.entryDate === day)
      .reduce((sum, e) => sum + (e[field] || 0), 0);
  return (
    <main className="mx-auto max-w-7xl space-y-5 pb-8">
      <section>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-row gap-2 items-center">
              <Link to={back}>
                <ArrowLeft
                  className="cursor-pointer hover:text-sky-600"
                  size={20}
                />
              </Link>
              <h1 className="text-2xl font-semibold sm:text-3xl">
                {own ? "My timesheet" : week?.userName || "Staff timesheet"}
              </h1>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              {shortDate(start).toUpperCase()} -{" "}
              {shortDate(shift(start, 6)).toUpperCase()}{" "}
              {week && <TimesheetStatusBadge status={week.status} />}
            </p>
          </div>
        </div>
      </section>
      {week?.status === "rejected" && week.rejectionReason && (
        <p className="rounded border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-900">
          <strong>Reason for rejection:</strong>
          <br />
          {week.rejectionReason}
        </p>
      )}
      {week && (
        <>
          <Textbox
            label="Filter project"
            labelPosition="side"
            type="search"
            value={projectFilterText}
            onChange={(event) => setProjectFilterText(event.target.value)}
            placeholder="Search for a project"
          />
          <section className="space-y-4 lg:hidden" aria-label="Daily timesheet">
            <div className="rounded-md bg-white p-3">
              <p className="mb-3 text-sm text-slate-600 text-center">
                {search ? "Shown total" : "Week total"}{" "}
                <strong className="text-slate-900">{hours(total)} hours</strong>
              </p>
              <div
                className="grid grid-cols-7 gap-2"
                role="group"
                aria-label="Select day"
              >
                {days.map((day, index) => (
                  <button
                    key={day}
                    type="button"
                    aria-label={new Date(`${day}T00:00:00Z`).toLocaleDateString(
                      "en-US",
                      {
                        timeZone: "UTC",
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      },
                    )}
                    aria-pressed={selectedDay === day}
                    className={`min-h-12 rounded-md px-0.5 py-1 text-center text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 ${selectedDay === day ? "bg-sky-800 text-white" : "bg-slate-100 text-slate-700"}`}
                    onClick={() => setSelectedDay(day)}
                  >
                    <span className="block">
                      {new Date(`${day}T00:00:00Z`).toLocaleDateString(
                        "en-US",
                        { timeZone: "UTC", weekday: "short" },
                      )}
                    </span>
                    <span className="block text-sm">{day.slice(-2)}</span>
                    <span className="block text-xs font-light">
                      {dayTotals[index]} hr
                    </span>
                    {dayCounts[index] > 0 && (
                      <span className="sr-only">
                        , {dayCounts[index]} entries
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">
                {new Date(`${selectedDay}T00:00:00Z`).toLocaleDateString(
                  "en-US",
                  {
                    timeZone: "UTC",
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  },
                )}
              </h2>
              <span className="text-sm tabular-nums text-slate-600">
                {hours(selectedHours)} hours
              </span>
            </div>
            <div className="space-y-2">
              {selectedEntries.map((entry) => (
                <MobileEntry
                  key={entry.id}
                  entry={entry}
                  editable={editable}
                  onEdit={() => setDraft(draftFromEntry(entry))}
                />
              ))}
              {!selectedEntries.length && (
                <p className="p-4 text-slate-600 text-center">
                  {search
                    ? "No matching time recorded for this day."
                    : "No time recorded for this day."}
                </p>
              )}
            </div>
            {showRates && (
              <p className="text-sm text-slate-600">
                Actual cost $
                {(financialTotal(selectedDay, "costCents") / 100).toFixed(2)} ·
                Charged value $
                {(financialTotal(selectedDay, "chargeCents") / 100).toFixed(2)}
              </p>
            )}
            {editable && (
              <div className="flex flex-col w-full">
                <Button
                  variant="primary"
                  size="large"
                  onClick={() => add("", selectedDay)}
                >
                  Add time
                </Button>
              </div>
            )}
          </section>
          <div className="hidden overflow-x-auto rounded-md border bg-white lg:block">
            <table className="w-full min-w-[850px] table-fixed border-collapse text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left">
                    <div className="flex flex-row items-center justify-between gap-1">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded px-1 py-1 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-sky-700"
                        aria-label={`Sort projects: ${projectSortLabels[projectSort]}. Next: ${projectSortLabels[projectSortModes[(projectSortModes.indexOf(projectSort) + 1) % projectSortModes.length]]}`}
                        title={`Sort projects: ${projectSortLabels[projectSort]}`}
                        onClick={() =>
                          setProjectSort(
                            projectSortModes[
                              (projectSortModes.indexOf(projectSort) + 1) %
                                projectSortModes.length
                            ],
                          )
                        }
                      >
                        Project
                        <span
                          aria-hidden="true"
                          className="inline-flex items-center gap-0.5 text-sky-800"
                        >
                          {projectSort.startsWith("name") ? (
                            <span className="font-normal">A</span>
                          ) : projectSort.startsWith("number") ? (
                            <span className="font-normal">1</span>
                          ) : null}
                          {projectSort ===
                          "normal" ? null : projectSort.endsWith("asc") ? (
                            <ArrowUp size={10} />
                          ) : (
                            <ArrowDown size={10} />
                          )}
                        </span>
                      </button>
                      {editable && (
                        <AddEntryButton
                          description="Add project to timesheet"
                          onClick={() => add()}
                        />
                      )}
                    </div>
                  </th>
                  {days.map((day) => (
                    <th key={day} className="border-l px-4 py-2 text-center">
                      <div className="flex flex-row items-center justify-between gap-2">
                        <div className="flex flex-col items-start gap-1">
                          <span className="block">
                            {new Date(`${day}T00:00:00Z`)
                              .toLocaleDateString("en-US", {
                                timeZone: "UTC",
                                weekday: "short",
                              })
                              .toUpperCase()}
                          </span>
                          <span className="font-normal text-slate-600">
                            {shortDate(day).toUpperCase()}
                          </span>
                        </div>
                        {editable && (
                          <AddEntryButton
                            description={`Add time for ${day}`}
                            onClick={() => add("", day)}
                          />
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="border-l px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id} className="border-t align-center">
                    <th
                      scope="row"
                      className="break-words p-3 text-center font-medium text-md"
                    >
                      <span className="block">{project.number}</span>
                      <span className="font-normal text-slate-600">
                        {project.name}
                      </span>
                    </th>
                    {days.map((day, dayIndex) => (
                      <td
                        key={day}
                        className={`border-l px-4 py-2 text-center ${dayIndex > 4 ? "bg-gray-100" : ""}`}
                      >
                        <div className="flex w-full min-w-0 flex-col items-center gap-1">
                          {entries
                            .filter(
                              (e) =>
                                e.projectId === project.id &&
                                e.entryDate === day,
                            )
                            .map((e) => (
                              <div
                                key={e.id}
                                className={`w-full min-w-0 ${editable ? "mb-1" : ""}`}
                              >
                                <EntryCell
                                  entry={e}
                                  editable={Boolean(editable)}
                                  onClick={() => setDraft(draftFromEntry(e))}
                                />
                              </div>
                            ))}
                        </div>
                        {editable && (
                          <AddEntryButton
                            description={`Add time for ${day}`}
                            onClick={() => add(project.id, day)}
                          />
                        )}
                      </td>
                    ))}
                    <td className="border-l p-3 text-right font-semibold tabular-nums">
                      {hours(
                        entries
                          .filter((e) => e.projectId === project.id)
                          .reduce((sum, e) => sum + Number(e.hours), 0),
                      )}{" "}
                      hrs
                    </td>
                  </tr>
                ))}
                {!projects.length && (
                  <tr className="border-t">
                    <td
                      colSpan={9}
                      className="p-4 text-center text-sm text-slate-600"
                    >
                      {search
                        ? "No projects match your search."
                        : "No time entries yet."}
                    </td>
                  </tr>
                )}
                {/* Blank project row as an alternative to adding via header */}
                {editable && (
                  <tr className="border-t">
                    <td className="p-3 text-center">
                      <AddEntryButton
                        description="Add time for a new project"
                        onClick={() => add(undefined, undefined)}
                      />
                    </td>
                    {days.map((day, dayIndex) => (
                      <td
                        key={day}
                        className={`border-l p-3 text-center ${dayIndex > 4 ? "bg-gray-100" : ""}`}
                      />
                    ))}
                    <td className="border-l p-3 text-center" />
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-slate-50 font-semibold">
                  <th className="p-3 text-left">Daily total</th>
                  {dayTotals.map((value, index) => (
                    <td
                      key={days[index]}
                      className="border-l p-3 text-center tabular-nums"
                    >
                      {hours(value)}
                    </td>
                  ))}
                  <td className="border-l p-3 text-right tabular-nums">
                    {hours(total)}
                  </td>
                </tr>
                <tr className="border-t bg-slate-50 text-slate-600">
                  <th className="p-3 text-left">Entries</th>
                  {dayCounts.map((value, index) => (
                    <td
                      key={days[index]}
                      className="border-l p-3 text-center tabular-nums"
                    >
                      {value}
                    </td>
                  ))}
                  <td className="border-l p-3 text-right tabular-nums">
                    {visibleEntries.length}
                  </td>
                </tr>
                {showRates && (
                  <>
                    <tr className="border-t bg-slate-50">
                      <th className="p-3 text-left">Actual cost</th>
                      {days.map((day) => (
                        <td
                          key={day}
                          className="border-l p-3 text-center tabular-nums"
                        >
                          ${(financialTotal(day, "costCents") / 100).toFixed(2)}
                        </td>
                      ))}
                      <td className="border-l p-3 text-right font-semibold tabular-nums">
                        $
                        {(financialTotal(undefined, "costCents") / 100).toFixed(
                          2,
                        )}
                      </td>
                    </tr>
                    <tr className="border-t bg-slate-50">
                      <th className="p-3 text-left">Charged value</th>
                      {days.map((day) => (
                        <td
                          key={day}
                          className="border-l p-3 text-center tabular-nums"
                        >
                          $
                          {(financialTotal(day, "chargeCents") / 100).toFixed(
                            2,
                          )}
                        </td>
                      ))}
                      <td className="border-l p-3 text-right font-semibold tabular-nums">
                        $
                        {(
                          financialTotal(undefined, "chargeCents") / 100
                        ).toFixed(2)}
                      </td>
                    </tr>
                  </>
                )}
              </tfoot>
            </table>
          </div>
          <div className="flex flex-col lg:flex-row gap-2 justify-between">
            {week.canSubmit && ["draft", "rejected"].includes(week.status) && (
              <Button
                variant="primary"
                size="medium"
                disabled={busy}
                onClick={() =>
                  void run(
                    `/timesheets/weeks/${start}/submit?userId=${encodeURIComponent(subject)}`,
                    "POST",
                  )
                }
              >
                Submit for approval
              </Button>
            )}
            {canReview && week.status === "submitted" && (
              <>
                <Button
                  variant="success"
                  size="medium"
                  onClick={() =>
                    void run(
                      `/timesheets/weeks/${start}/approve?userId=${encodeURIComponent(subject)}`,
                      "POST",
                    )
                  }
                >
                  Approve
                </Button>
              </>
            )}
            {canReview && week.status === "submitted" && (
              <>
                <Button
                  variant="danger"
                  size="medium"
                  onClick={() => {
                    const reason = window.prompt("Reason for rejection");
                    if (reason?.trim())
                      void run(
                        `/timesheets/weeks/${start}/reject?userId=${encodeURIComponent(subject)}`,
                        "POST",
                        { reason },
                      );
                  }}
                >
                  Reject
                </Button>
              </>
            )}
            {canReview && week.status === "approved" && (
              <Button
                variant="secondary"
                size="medium"
                onClick={() =>
                  void run(
                    `/timesheets/weeks/${start}/reopen?userId=${encodeURIComponent(subject)}`,
                    "POST",
                  )
                }
              >
                Reopen for correction
              </Button>
            )}
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}
          {draft && editable && (
            <TimeEntryDialog
              key={`${draft.id}-${draft.projectId}-${draft.entryDate}`}
              start={start}
              initial={draft}
              lookups={lookups}
              busy={busy}
              onClose={() => setDraft(null)}
              onSave={(value) =>
                void run(
                  `/timesheets/weeks/${start}/entries/${value.id || crypto.randomUUID()}?userId=${encodeURIComponent(subject)}`,
                  "PUT",
                  {
                    projectId: value.projectId,
                    taskId: value.taskId || null,
                    entryDate: value.entryDate,
                    hours: Number(value.hours),
                    note: value.note,
                    revision: week.revision,
                  },
                )
              }
              onDelete={(id) =>
                void run(
                  `/timesheets/weeks/${start}/entries/${id}?userId=${encodeURIComponent(subject)}`,
                  "DELETE",
                )
              }
            />
          )}
        </>
      )}
    </main>
  );
}

