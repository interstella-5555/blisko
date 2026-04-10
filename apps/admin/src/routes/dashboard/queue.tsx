import { createFileRoute } from "@tanstack/react-router";
import { format, isToday } from "date-fns";
import { pl } from "date-fns/locale";
import { CircleIcon, LoaderIcon, PauseIcon, PlayIcon } from "lucide-react";
import { useState } from "react";
import { DashboardHeader } from "~/components/dashboard-header";
import { Badge } from "~/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { trpc } from "~/lib/trpc";

export const Route = createFileRoute("/dashboard/queue")({
  component: QueuePage,
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
] as const;

type JobState = "active" | "waiting" | "delayed" | "completed" | "failed";

const TABS: { key: JobState | "all"; label: string }[] = [
  { key: "all", label: "Wszystkie" },
  { key: "active", label: "Aktywne" },
  { key: "waiting", label: "Oczekujące" },
  { key: "delayed", label: "Opóźnione" },
  { key: "completed", label: "Ukończone" },
  { key: "failed", label: "Błędy" },
];

const STATE_COLORS: Record<string, string> = {
  active: "bg-blue-500",
  waiting: "bg-gray-300",
  delayed: "bg-yellow-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
};

function QueuePage() {
  const [isLive, setIsLive] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [stateFilter, setStateFilter] = useState<JobState | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const stats = trpc.queue.stats.useQuery(undefined, {
    refetchInterval: isLive ? 1000 : false,
  });

  const feed = trpc.queue.feed.useQuery(
    {
      type: typeFilter || undefined,
      state: stateFilter === "all" ? undefined : stateFilter,
      limit: 100,
    },
    {
      refetchInterval: isLive ? 1000 : false,
    },
  );

  const jobs = feed.data?.jobs ?? [];
  const nameMap = feed.data?.nameMap ?? {};

  const stateCounts: Record<string, number> = {
    all:
      (stats.data?.active ?? 0) +
      (stats.data?.waiting ?? 0) +
      (stats.data?.delayed ?? 0) +
      (stats.data?.completed ?? 0) +
      (stats.data?.failed ?? 0),
    active: stats.data?.active ?? 0,
    waiting: stats.data?.waiting ?? 0,
    delayed: stats.data?.delayed ?? 0,
    completed: stats.data?.completed ?? 0,
    failed: stats.data?.failed ?? 0,
  };

  return (
    <>
      <DashboardHeader title="Kolejka zadań" />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {/* Tabs + controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStateFilter(tab.key)}
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
              onChange={(e) => setTypeFilter(e.target.value)}
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
          </div>
        </div>

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
                  const isExpanded = expandedId === job.id;
                  return (
                    <>
                      <TableRow
                        key={job.id}
                        className={`cursor-pointer transition-colors ${
                          job.state === "failed" ? "hover:bg-red-50" : "hover:bg-muted/50"
                        }`}
                        onClick={() => setExpandedId(isExpanded ? null : job.id)}
                      >
                        <TableCell className="text-sm tabular-nums text-muted-foreground">
                          {formatTime(job.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className={`size-2 rounded-full ${STATE_COLORS[job.state] ?? "bg-gray-300"}`} />
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
                          <div className="truncate">{summarizeJobData(job.type, job.data, nameMap)}</div>
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
                        <TableRow key={`${job.id}-detail`}>
                          <TableCell colSpan={7} className="bg-muted/30 p-4">
                            <div className="space-y-2 text-sm">
                              <div>
                                <span className="font-medium text-muted-foreground">ID:</span>{" "}
                                <span className="font-mono text-xs">{job.id}</span>
                              </div>
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
                    </>
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

function formatState(state: string): string {
  const labels: Record<string, string> = {
    active: "Aktywny",
    waiting: "Oczekuje",
    delayed: "Opóźniony",
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
