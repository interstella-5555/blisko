import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format, formatDistanceStrict, formatDistanceToNowStrict, isToday } from "date-fns";
import { pl } from "date-fns/locale";
import { CircleIcon, ClockIcon, LoaderIcon, PauseIcon, PlayIcon, WrenchIcon } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { DashboardHeader } from "~/components/dashboard-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { trpc } from "~/lib/trpc";

const JOB_STATES = ["active", "waiting", "delayed", "scheduled", "completed", "failed"] as const;
type JobState = (typeof JOB_STATES)[number];

const JOB_SOURCES = ["ai", "ops", "maintenance"] as const;
type JobSource = (typeof JOB_SOURCES)[number];

const queueSearchSchema = z.object({
  source: z.enum(JOB_SOURCES).optional(),
  state: z.enum(JOB_STATES).optional(),
  type: z.string().optional(),
  expanded: z.string().optional(),
});

type QueueSearch = z.infer<typeof queueSearchSchema>;

export const Route = createFileRoute("/dashboard/queue")({
  component: QueuePage,
  validateSearch: queueSearchSchema,
});

const JOB_TYPES = [
  "analyze-pair",
  "quick-score",
  "analyze-user-pairs",
  "generate-profile-ai",
  "generate-profiling-question",
  "generate-profile-from-qa",
  "status-matching",
  "proximity-status-matching",
  "hard-delete-user",
  "export-user-data",
  "admin-soft-delete-user",
  "admin-restore-user",
  "admin-force-disconnect",
  "flush-push-log",
  "prune-push-log",
  "flush-ai-calls",
  "prune-ai-calls",
  "consistency-sweep",
] as const;

const SOURCE_TABS: { key: JobSource | "all"; label: string }[] = [
  { key: "all", label: "Wszystkie" },
  { key: "ai", label: "AI" },
  { key: "ops", label: "Ops" },
  { key: "maintenance", label: "Maintenance" },
];

const DEFAULT_STATE: JobState = "active";
const STATE_TABS: { key: JobState; label: string }[] = [
  { key: "active", label: "Aktywne" },
  { key: "waiting", label: "Oczekujące" },
  { key: "delayed", label: "Opóźnione" },
  { key: "scheduled", label: "Harmonogram" },
  { key: "completed", label: "Ukończone" },
  { key: "failed", label: "Błędy" },
];

const STATE_COLORS: Record<string, string> = {
  active: "bg-blue-500",
  waiting: "bg-gray-300",
  delayed: "bg-yellow-500",
  scheduled: "bg-indigo-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
};

function QueuePage() {
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const sourceFilter: JobSource | "all" = search.source ?? "all";
  const stateFilter: JobState = search.state ?? DEFAULT_STATE;
  const typeFilter = search.type ?? "";
  const expandedId = search.expanded ?? null;

  const [isLive, setIsLive] = useState(true);

  const updateSearch = (patch: Partial<QueueSearch>) =>
    navigate({
      search: (prev) => {
        const next = { ...prev, ...patch };
        // Strip defaults/empties so URL stays clean
        for (const key of Object.keys(next) as (keyof QueueSearch)[]) {
          const value = next[key];
          if (value === undefined || value === "" || value === "all") delete next[key];
          else if (key === "state" && value === DEFAULT_STATE) delete next[key];
        }
        return next;
      },
    });

  const sweep = trpc.queue.runConsistencySweep.useMutation();
  const utils = trpc.useUtils();

  const stats = trpc.queue.stats.useQuery(undefined, {
    refetchInterval: isLive ? 1000 : false,
  });

  const feed = trpc.queue.feed.useQuery(
    {
      source: sourceFilter === "all" ? undefined : sourceFilter,
      type: typeFilter || undefined,
      state: stateFilter,
      limit: 100,
    },
    {
      refetchInterval: isLive ? 1000 : false,
    },
  );

  // Fired when a scheduler's countdown hits zero — force-refresh regardless of
  // refetchInterval so the user always sees the new `next` without delay.
  const onScheduledZero = useCallback(() => {
    utils.queue.feed.invalidate();
    utils.queue.stats.invalidate();
  }, [utils]);

  const jobs = feed.data?.jobs ?? [];
  const nameMap = feed.data?.nameMap ?? {};

  const activeCounts = stats.data?.[sourceFilter === "all" ? "total" : sourceFilter] ?? {
    active: 0,
    waiting: 0,
    delayed: 0,
    scheduled: 0,
    completed: 0,
    failed: 0,
  };

  const stateCounts: Record<JobState, number> = {
    active: activeCounts.active,
    waiting: activeCounts.waiting,
    delayed: activeCounts.delayed,
    scheduled: activeCounts.scheduled,
    completed: activeCounts.completed,
    failed: activeCounts.failed,
  };

  const sourceCounts: Record<JobSource | "all", number> = {
    all: sumCounts(stats.data?.total),
    ai: sumCounts(stats.data?.ai),
    ops: sumCounts(stats.data?.ops),
    maintenance: sumCounts(stats.data?.maintenance),
  };

  return (
    <>
      <DashboardHeader title="Kolejki" />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {/* Source filter (queue) */}
        <div className="flex items-center gap-1 border-b pb-3">
          {SOURCE_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => updateSearch({ source: tab.key === "all" ? undefined : tab.key, expanded: undefined })}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                sourceFilter === tab.key
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {tab.label}
              {sourceCounts[tab.key] > 0 && (
                <Badge
                  variant={sourceFilter === tab.key ? "secondary" : "outline"}
                  className="ml-0.5 px-1.5 py-0 text-xs tabular-nums"
                >
                  {sourceCounts[tab.key]}
                </Badge>
              )}
            </button>
          ))}
        </div>

        {/* State tabs + controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {STATE_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => updateSearch({ state: tab.key, expanded: undefined })}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  stateFilter === tab.key
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {tab.label}
                {stateCounts[tab.key] > 0 && (
                  <Badge
                    variant={stateFilter === tab.key ? "secondary" : "outline"}
                    className="ml-0.5 px-1.5 py-0 text-xs tabular-nums"
                  >
                    {stateCounts[tab.key]}
                  </Badge>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => updateSearch({ type: e.target.value || undefined, expanded: undefined })}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value="">Wszystkie typy</option>
              {JOB_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setIsLive(!isLive)}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                isLive
                  ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                  : "border-input bg-background text-muted-foreground hover:bg-accent"
              }`}
            >
              {isLive ? (
                <>
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-500 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-green-500" />
                  </span>
                  Live
                  <PauseIcon className="size-3" />
                </>
              ) : (
                <>
                  <CircleIcon className="size-2 fill-gray-400 text-gray-400" />
                  Paused
                  <PlayIcon className="size-3" />
                </>
              )}
            </button>

            <Button variant="outline" size="sm" onClick={() => sweep.mutate()} disabled={sweep.isPending}>
              <WrenchIcon className="size-3.5" />
              {sweep.isPending ? "Skanowanie..." : "Consistency Sweep"}
            </Button>
          </div>
        </div>

        {/* Sweep result */}
        {sweep.data && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm">
            <span className="font-medium text-green-800">Sweep zakończony:</span>{" "}
            <span className="text-green-700">
              {sweep.data.zombieProfiles.found} zombie profili (naprawiono {sweep.data.zombieProfiles.enqueued}),{" "}
              {sweep.data.stuckSessions.found} zablokowanych sesji (naprawiono {sweep.data.stuckSessions.enqueued}),{" "}
              {sweep.data.abandonedSessions.found} porzuconych sesji (wyczyszczono{" "}
              {sweep.data.abandonedSessions.cleaned})
            </span>
          </div>
        )}
        {sweep.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Sweep error: {sweep.error.message}
          </div>
        )}

        {/* Table */}
        <div className="rounded-lg border">
          {feed.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : feed.error ? (
            <div className="flex items-center justify-center py-12 text-destructive text-sm">
              Błąd: {feed.error.message}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Czas</TableHead>
                  <TableHead>Stan</TableHead>
                  <TableHead>Kolejka</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Dane</TableHead>
                  <TableHead>Czas trwania</TableHead>
                  <TableHead>Próby</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const rowKey = `${job.source}:${job.id}`;
                  const isExpanded = expandedId === rowKey;
                  const isScheduled = job.state === "scheduled";
                  return (
                    <Fragment key={rowKey}>
                      <TableRow
                        className={`cursor-pointer transition-colors ${
                          job.state === "failed" ? "hover:bg-red-50" : "hover:bg-muted/50"
                        }`}
                        onClick={() => updateSearch({ expanded: isExpanded ? undefined : rowKey })}
                      >
                        <TableCell className="text-sm tabular-nums text-muted-foreground">
                          {isScheduled && job.scheduler?.next ? (
                            <ScheduledCountdown next={job.scheduler.next} onReachZero={onScheduledZero} />
                          ) : (
                            formatTime(job.createdAt)
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {isScheduled ? (
                              <ClockIcon className="size-3.5 text-indigo-500" />
                            ) : (
                              <span className={`size-2 rounded-full ${STATE_COLORS[job.state] ?? "bg-gray-300"}`} />
                            )}
                            <span className="text-sm">{formatState(job.state)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {job.source}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{job.type}</TableCell>
                        <TableCell className="text-sm max-w-[300px]">
                          <div className="truncate">
                            {isScheduled
                              ? formatScheduleInterval(job.scheduler)
                              : summarizeJobData(job.type, job.data, nameMap)}
                          </div>
                          {!isExpanded && job.state === "failed" && job.failedReason && (
                            <div className="text-xs text-red-600 truncate mt-0.5">
                              {job.failedReason.split("\n")[0]?.slice(0, 120)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums text-muted-foreground">
                          {job.duration !== null ? formatDuration(job.duration) : "—"}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums text-muted-foreground">
                          {job.attemptsMade > 1 ? job.attemptsMade : "—"}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-muted/30 p-4">
                            <div className="space-y-2 text-sm">
                              <div>
                                <span className="font-medium text-muted-foreground">ID:</span>{" "}
                                <span className="font-mono text-xs">{job.id}</span>
                              </div>
                              {isScheduled && job.scheduler && (
                                <div className="text-xs text-muted-foreground">
                                  Harmonogram: {formatScheduleInterval(job.scheduler)}
                                  {job.scheduler.next && (
                                    <> | Następne: {new Date(job.scheduler.next).toLocaleString("pl-PL")}</>
                                  )}
                                </div>
                              )}
                              <div>
                                <span className="font-medium text-muted-foreground">Dane:</span>
                                <pre className="mt-1 text-xs font-mono bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                                  {JSON.stringify(job.data, null, 2)}
                                </pre>
                              </div>
                              {job.failedReason && (
                                <div>
                                  <span className="font-medium text-red-600">Błąd:</span>
                                  <pre className="mt-1 text-xs font-mono bg-red-50 text-red-700 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                                    {job.failedReason}
                                  </pre>
                                </div>
                              )}
                              {job.processedOn && (
                                <div className="text-xs text-muted-foreground">
                                  Start: {new Date(job.processedOn).toLocaleString("pl-PL")}
                                  {job.finishedOn && <> | Koniec: {new Date(job.finishedOn).toLocaleString("pl-PL")}</>}
                                  {job.duration !== null && <> | Czas: {formatDuration(job.duration)}</>}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
                {jobs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                      Brak zadań w kolejce
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </>
  );
}

function sumCounts(
  counts:
    | { active: number; waiting: number; delayed: number; scheduled: number; completed: number; failed: number }
    | undefined,
): number {
  if (!counts) return 0;
  return counts.active + counts.waiting + counts.delayed + counts.scheduled + counts.completed + counts.failed;
}

function formatState(state: string): string {
  const labels: Record<string, string> = {
    active: "Aktywny",
    waiting: "Oczekuje",
    delayed: "Opóźniony",
    scheduled: "Harmonogram",
    completed: "Ukończony",
    failed: "Błąd",
  };
  return labels[state] ?? state;
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  if (isToday(d)) return format(d, "HH:mm:ss");
  return format(d, "d MMM HH:mm:ss", { locale: pl });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function ScheduledCountdown({ next, onReachZero }: { next: number; onReachZero: () => void }) {
  const [, forceTick] = useState(0);
  const firedRef = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const reached = next - Date.now() <= 0;

  useEffect(() => {
    if (reached && firedRef.current !== next) {
      firedRef.current = next;
      onReachZero();
    }
  }, [reached, next, onReachZero]);

  if (reached) return <LoaderIcon className="size-3.5 animate-spin text-muted-foreground" />;
  return <>{formatDistanceToNowStrict(new Date(next), { locale: pl, addSuffix: true })}</>;
}

function formatScheduleInterval(
  scheduler: { pattern: string | null; every: number | null } | null | undefined,
): string {
  if (!scheduler) return "—";
  if (scheduler.every != null) return `co ${formatDistanceStrict(scheduler.every, 0, { locale: pl })}`;
  if (scheduler.pattern) return `cron: ${scheduler.pattern}`;
  return "—";
}

function truncId(id: unknown): string {
  if (typeof id !== "string") return String(id ?? "");
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function resolveName(id: unknown, nameMap: Record<string, string>): string {
  if (typeof id !== "string") return String(id ?? "");
  return nameMap[id] || truncId(id);
}

function summarizeJobData(type: string, data: Record<string, unknown>, nameMap: Record<string, string>): string {
  switch (type) {
    case "analyze-pair": {
      const a = (data.nameA as string) || resolveName(data.userAId, nameMap);
      const b = (data.nameB as string) || resolveName(data.userBId, nameMap);
      return `${a} ↔ ${b}`;
    }
    case "quick-score":
      return `${resolveName(data.userAId, nameMap)} → ${resolveName(data.userBId, nameMap)}`;
    case "analyze-user-pairs":
      return `${resolveName(data.userId, nameMap)} r=${data.radiusMeters}m`;
    case "generate-profiling-question":
    case "generate-profile-from-qa":
      return `${(data.displayName as string) || resolveName(data.userId, nameMap)}`;
    default:
      return data.userId ? resolveName(data.userId, nameMap) : JSON.stringify(data).slice(0, 60);
  }
}
