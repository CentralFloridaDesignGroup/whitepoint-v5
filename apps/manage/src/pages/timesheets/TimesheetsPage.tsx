import { shortDate } from "./model";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock3,
  XCircle,
} from "lucide-react";
import { requestJson } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import {
  currentMonday,
  selectedMonday,
  shift,
  type RosterUser,
  type TimesheetStatus,
} from "./model";
import { Button, Textbox } from "@whitepoint/ui/input";
import { LoadingSpinner } from "@whitepoint/ui/layout";

const statusStyle = {
  draft: {
    label: "Draft",
    icon: CircleDashed,
    color: "text-slate-700 bg-slate-100",
  },
  submitted: {
    label: "Submitted",
    icon: Clock3,
    color: "text-amber-800 bg-amber-50",
  },
  approved: {
    label: "Accepted",
    icon: CheckCircle2,
    color: "text-emerald-800 bg-emerald-50",
  },
  rejected: {
    label: "Rejected",
    icon: XCircle,
    color: "text-rose-800 bg-rose-50",
  },
} satisfies Record<
  TimesheetStatus,
  { label: string; icon: typeof CircleDashed; color: string }
>;

export function TimesheetStatusBadge({ status }: { status: TimesheetStatus }) {
  const style = statusStyle[status],
    Icon = style.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.color}`}
    >
      <Icon size={14} aria-hidden="true" />
      <span className="hidden md:inline">{style.label}</span>
    </span>
  );
}

const collator = new Intl.Collator("en-US", {
  sensitivity: "base",
  numeric: true,
});
const byName = (a: RosterUser, b: RosterUser) =>
  collator.compare(a.lastName, b.lastName) ||
  collator.compare(a.firstName, b.firstName) ||
  collator.compare(a.displayName, b.displayName);

export function TimesheetsPage({ scope = "team" }: { scope?: "team" | "all" }) {
  const auth = useAuth(),
    navigate = useNavigate(),
    [params, setParams] = useSearchParams(),
    rawWeek = params.get("week") || currentMonday(),
    parsed = /^\d{4}-\d{2}-\d{2}$/.test(rawWeek)
      ? new Date(`${rawWeek}T00:00:00Z`)
      : null,
    week =
      parsed &&
      !Number.isNaN(parsed.valueOf()) &&
      parsed.toISOString().slice(0, 10) === rawWeek
        ? selectedMonday(rawWeek)
        : currentMonday();
  const [people, setPeople] = useState<RosterUser[]>([]),
    [expanded, setExpanded] = useState<Set<string>>(
      () => new Set(auth.internalUserId ? [auth.internalUserId] : []),
    ),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    if (auth.internalUserId)
      setExpanded((previous) =>
        previous.size ? previous : new Set([auth.internalUserId!]),
      );
  }, [auth.internalUserId]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setPeople([]);
    void requestJson<{ items: RosterUser[] }>(
      `/timesheets/roster?weekStart=${week}&scope=${scope}`,
      { authMode: "session" },
    )
      .then((result) => {
        if (active) setPeople(result.items);
      })
      .catch((caught) => {
        if (active) setError(String(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [week, scope]);
  const children = useMemo(() => {
    const map = new Map<string, RosterUser[]>();
    for (const person of people) {
      const key = person.managerUserId || "";
      map.set(key, [...(map.get(key) || []), person]);
    }
    for (const group of map.values()) group.sort(byName);
    return map;
  }, [people]);
  const own = people.find((person) => person.userId === auth.internalUserId);
  const rows: { person: RosterUser; level: number }[] = [];
  if (scope === "all") {
    for (const person of [...people].sort(byName))
      rows.push({ person, level: 0 });
  } else if (own) {
    const visit = (person: RosterUser, level: number) => {
      rows.push({ person, level });
      if (expanded.has(person.userId))
        for (const child of children.get(person.userId) || [])
          visit(child, level + 1);
    };
    visit(own, 0);
  }
  function setWeek(value: string) {
    setParams({ week: selectedMonday(value) });
  }
  function toggle(id: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function detailPath(person: RosterUser) {
    const query = new URLSearchParams();
    if (person.userId !== auth.internalUserId)
      query.set("userId", person.userId);
    if (scope === "all") query.set("from", "all");
    return `/timesheets/${week}${query.size ? `?${query}` : ""}`;
  }
  return (
    <main className="mx-auto max-w-6xl space-y-5 pb-8">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="grow text-center md:text-start">
          <h1 className="text-3xl font-semibold">
            {scope === "all" ? "All staff timesheets" : "Team Timesheets"}
          </h1>
        </div>
        <div className="flex flex-1 gap-2 justify-center md:justify-end">
          {scope === "team" && auth.hasPermission("timesheets.view") && (
            <Button
              type="button"
              variant="secondary"
              size="small"
              onClick={() => navigate(`/timesheets/review?week=${week}`)}
            >
              All staff
            </Button>
          )}
          {scope === "all" && (
            <Button
              type="button"
              variant="secondary"
              size="small"
              onClick={() => navigate(`/timesheets?week=${week}`)}
            >
              My team
            </Button>
          )}
          {auth.hasPermission("timesheets.rates.view") && (
            <Button
              type="button"
              variant="secondary"
              size="small"
              onClick={() => navigate("/timesheets/invoice-pool")}
            >
              Invoice pool
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-col md:flex-row gap-3 items-center md:justify-between">
        {/* Week navigation */}
        <div className="flex items-center gap-3">
          <Button
            type="button"
            aria-label="Previous week"
            variant="secondary"
            size="small"
            onClick={() => setWeek(shift(week, -7))}
          >
            <ChevronLeft className="" size={14} />
          </Button>
          <div className="min-w-0 text-center">
            <div className="text-sm font-semibold">
              <span className="sm:hidden">
                {shortDate(week)} - {shortDate(shift(week, 6))}
              </span>
              <span className="hidden sm:inline">
                {shortDate(week).toUpperCase()} -{" "}
                {shortDate(shift(week, 6)).toUpperCase()}
              </span>
            </div>
          </div>
          <Button
            type="button"
            aria-label="Next week"
            variant="secondary"
            size="small"
            onClick={() => setWeek(shift(week, 7))}
          >
            <ChevronRight className="" size={14} />
          </Button>
        </div>
        {/* Jump to week */}
        <div className="flex items-center gap-3">
          <Textbox
            label="Jump to week"
            labelPosition="side"
            type="date"
            value={week}
            onChange={(event) =>
              event.target.value && setWeek(event.target.value)
            }
          />
        </div>
      </div>
      <div className="overflow-hidden border rounded-md border-neutral-600">
        <ul className="divide-y">
          <li className="flex flex-row justify-between items-center px-4 py-2 bg-neutral-200 font-semibold">
            <div className="flex-[5]">Name</div>
            <div className="text-end">Status</div>
          </li>
          {rows.map(({ person, level }) => {
            const reports = children.get(person.userId) || [],
              hasReports = scope === "team" && reports.length > 0;
            return (
              <li key={person.userId} className="flex flex-row justify-between items-center px-4 py-2" style={level > 0 ? { paddingLeft: `${18 + level * 12}px` } : {}}>
                {hasReports && level > 0 && (
                  <button
                      type="button"
                      className="text-slate-600 hover:bg-slate-100 mr-2"
                      aria-label={`${expanded.has(person.userId) ? "Collapse" : "Expand"} ${person.displayName}'s reports`}
                      aria-expanded={expanded.has(person.userId)}
                      onClick={() => toggle(person.userId)}
                    >
                      {expanded.has(person.userId) ? (
                        <ChevronDown className="mx-auto" size={18} />
                      ) : (
                        <ChevronRight className="mx-auto" size={18} />
                      )}
                    </button>
                )}
                <div className="flex-1">
                  <Link
                    className="min-w-0 flex-1 py-2 font-medium text-sky-800 hover:underline"
                    to={detailPath(person)}
                  >
                    {person.displayName}
                  </Link>
                </div>
                <div className="align-end">
                  <TimesheetStatusBadge status={person.status} />
                </div>
              </li>

            );
          })}
        </ul>
        {loading && (
          <LoadingSpinner title="Loading timesheets…" />
        )}
        {!loading && !rows.length && !error && (
          <p className="p-4 text-sm text-slate-600">No staff found.</p>
        )}
      </div>
    </main>
  );
}
