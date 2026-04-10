import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format, isToday } from "date-fns";
import { pl } from "date-fns/locale";
import { CircleIcon, LoaderIcon, PauseIcon, PlayIcon } from "lucide-react";
import { Fragment, useState } from "react";
import { z } from "zod";
import { DashboardHeader } from "~/components/dashboard-header";
import { Badge } from "~/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { trpc } from "~/lib/trpc";

const aiCostsSearchSchema = z.object({
  window: z.enum(["24h", "7d"]).optional(),
  jobName: z.string().optional(),
  status: z.enum(["success", "failed"]).optional(),
  userId: z.string().optional(),
  expanded: z.string().optional(),
});

type AiCostsSearch = z.infer<typeof aiCostsSearchSchema>;

export const Route = createFileRoute("/dashboard/ai-costs")({
  component: AiCostsPage,
  validateSearch: aiCostsSearchSchema,
});

const WINDOW_TABS: { key: "24h" | "7d"; label: string }[] = [
  { key: "24h", label: "Ostatnie 24h" },
  { key: "7d", label: "Ostatnie 7 dni" },
];

const STATUS_TABS: { key: "success" | "failed" | "all"; label: string }[] = [
  { key: "all", label: "Wszystkie" },
  { key: "success", label: "Sukces" },
  { key: "failed", label: "Błędy" },
];

function formatUsd(amount: number): string {
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  if (amount >= 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(6)}`;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("pl-PL").format(n);
}

function formatTime(timestamp: string | Date): string {
  const d = new Date(timestamp);
  if (isToday(d)) return format(d, "HH:mm:ss");
  return format(d, "d MMM HH:mm:ss", { locale: pl });
}

function truncId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function AiCostsPage() {
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();

  const window = search.window ?? "24h";
  const statusFilter = search.status ?? "all";
  const jobNameFilter = search.jobName;
  const userFilter = search.userId;

  const [isLive, setIsLive] = useState(true);

  const updateSearch = (patch: Partial<AiCostsSearch>) => {
    navigate({
      search: (prev) => {
        const next = { ...prev, ...patch };
        for (const key of Object.keys(next) as (keyof AiCostsSearch)[]) {
          if (next[key] === undefined) delete next[key];
        }
        return next;
      },
      replace: true,
    });
  };

  const refetchInterval = isLive ? 30_000 : false;

  const summary24h = trpc.aiCosts.summary.useQuery({ window: "24h" }, { refetchInterval });
  const summary7d = trpc.aiCosts.summary.useQuery({ window: "7d" }, { refetchInterval });
  const byJobName = trpc.aiCosts.byJobName.useQuery({ window }, { refetchInterval });
  const byModel = trpc.aiCosts.byModel.useQuery({ window }, { refetchInterval });
  const byDay = trpc.aiCosts.byDay.useQuery({ window: "7d" }, { refetchInterval });
  const topUsers = trpc.aiCosts.topUsers.useQuery({ window, limit: 20 }, { refetchInterval });
  const feed = trpc.aiCosts.feed.useQuery(
    {
      window,
      jobName: jobNameFilter,
      userId: userFilter,
      status: statusFilter === "all" ? undefined : statusFilter,
      limit: 100,
    },
    { refetchInterval },
  );

  const maxDayCost = byDay.data?.reduce((max, d) => Math.max(max, d.totalCostUsd), 0) ?? 0;

  return (
    <>
      <DashboardHeader title="Koszty AI" />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {/* KPI cards */}
        <div className="grid auto-rows-min gap-4 md:grid-cols-4">
          <Kpi label="Koszt 24h" value={summary24h.data ? formatUsd(summary24h.data.totalCostUsd) : "—"} />
          <Kpi label="Koszt 7 dni" value={summary7d.data ? formatUsd(summary7d.data.totalCostUsd) : "—"} />
          <Kpi
            label="Wywołań 24h"
            value={summary24h.data ? formatNumber(summary24h.data.totalCalls) : "—"}
            sub={summary24h.data ? `${formatNumber(summary24h.data.totalTokens)} tokenów` : undefined}
          />
          <Kpi
            label="Średni koszt / wywołanie"
            value={summary24h.data ? formatUsd(summary24h.data.avgCostUsd) : "—"}
            sub={summary24h.data?.topJobName ? `top: ${summary24h.data.topJobName}` : undefined}
          />
        </div>

        {/* Filter toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {WINDOW_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => updateSearch({ window: tab.key })}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  window === tab.key
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {jobNameFilter && (
              <button
                type="button"
                onClick={() => updateSearch({ jobName: undefined })}
                className="rounded-md border border-input bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                × job: {jobNameFilter}
              </button>
            )}
            {userFilter && (
              <button
                type="button"
                onClick={() => updateSearch({ userId: undefined })}
                className="rounded-md border border-input bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                × user: {truncId(userFilter)}
              </button>
            )}
            <div className="flex items-center gap-1">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => updateSearch({ status: tab.key === "all" ? undefined : tab.key })}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    statusFilter === tab.key
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

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

        {/* Breakdowns grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* By job name */}
          <div className="rounded-lg border">
            <div className="border-b px-4 py-2 text-sm font-medium">Po typie joba</div>
            {byJobName.isLoading ? (
              <Loading />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead className="text-right">Wywołań</TableHead>
                    <TableHead className="text-right">Tokeny</TableHead>
                    <TableHead className="text-right">Śr. czas</TableHead>
                    <TableHead className="text-right">Koszt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byJobName.data?.map((row) => (
                    <TableRow
                      key={row.jobName}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => updateSearch({ jobName: row.jobName })}
                    >
                      <TableCell className="font-medium text-sm">{row.jobName}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{formatNumber(row.count)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                        {formatNumber(row.totalTokens)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                        {row.avgDurationMs}ms
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-medium">
                        {formatUsd(row.totalCostUsd)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {byJobName.data?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                        Brak danych
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>

          {/* By model */}
          <div className="rounded-lg border">
            <div className="border-b px-4 py-2 text-sm font-medium">Po modelu</div>
            {byModel.isLoading ? (
              <Loading />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Wywołań</TableHead>
                    <TableHead className="text-right">Tokeny</TableHead>
                    <TableHead className="text-right">Koszt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byModel.data?.map((row) => (
                    <TableRow key={row.model}>
                      <TableCell className="font-mono text-xs">{row.model}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{formatNumber(row.count)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                        {formatNumber(row.totalTokens)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-medium">
                        {formatUsd(row.totalCostUsd)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {byModel.data?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                        Brak danych
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        {/* Daily chart + top users grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Daily chart as bar table */}
          <div className="rounded-lg border">
            <div className="border-b px-4 py-2 text-sm font-medium">Koszt dzienny (7 dni)</div>
            {byDay.isLoading ? (
              <Loading />
            ) : (
              <div className="p-4 space-y-2">
                {byDay.data?.map((row) => {
                  const pct = maxDayCost > 0 ? (row.totalCostUsd / maxDayCost) * 100 : 0;
                  return (
                    <div key={row.day} className="flex items-center gap-3 text-sm">
                      <div className="w-20 tabular-nums text-muted-foreground">{row.day}</div>
                      <div className="flex-1 relative h-6 bg-muted/30 rounded">
                        <div
                          className="absolute inset-y-0 left-0 bg-foreground/70 rounded"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="w-24 text-right tabular-nums font-medium">{formatUsd(row.totalCostUsd)}</div>
                      <div className="w-16 text-right tabular-nums text-xs text-muted-foreground">
                        {formatNumber(row.calls)}
                      </div>
                    </div>
                  );
                })}
                {byDay.data?.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-6">Brak danych</div>
                )}
              </div>
            )}
          </div>

          {/* Top users */}
          <div className="rounded-lg border">
            <div className="border-b px-4 py-2 text-sm font-medium">Top 20 userów</div>
            {topUsers.isLoading ? (
              <Loading />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead className="text-right">Wywołań</TableHead>
                    <TableHead className="text-right">Koszt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topUsers.data?.map((row) => (
                    <TableRow
                      key={row.userId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => updateSearch({ userId: row.userId })}
                    >
                      <TableCell className="text-sm">{row.displayName || truncId(row.userId)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{formatNumber(row.calls)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-medium">
                        {formatUsd(row.totalCostUsd)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {topUsers.data?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">
                        Brak danych
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        {/* Feed */}
        <div className="rounded-lg border">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <div className="text-sm font-medium">Ostatnie wywołania</div>
            <Badge variant="outline" className="tabular-nums">
              {feed.data?.rows.length ?? 0}
            </Badge>
          </div>
          {feed.isLoading ? (
            <Loading />
          ) : feed.error ? (
            <div className="flex items-center justify-center py-12 text-destructive text-sm">
              Błąd: {feed.error.message}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Czas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead className="text-right">Tokeny</TableHead>
                  <TableHead className="text-right">Czas</TableHead>
                  <TableHead className="text-right">Koszt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feed.data?.rows.map((row) => {
                  const isExpanded = search.expanded === String(row.id);
                  const userName = row.userId ? feed.data?.nameMap[row.userId] || truncId(row.userId) : "—";
                  return (
                    <Fragment key={row.id}>
                      <TableRow
                        className={`cursor-pointer ${row.status === "failed" ? "hover:bg-red-50" : "hover:bg-muted/50"}`}
                        onClick={() =>
                          updateSearch({
                            expanded: isExpanded ? undefined : String(row.id),
                          })
                        }
                      >
                        <TableCell className="text-sm tabular-nums text-muted-foreground">
                          {formatTime(row.timestamp)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className={`size-2 rounded-full ${
                                row.status === "success" ? "bg-green-500" : "bg-red-500"
                              }`}
                            />
                            <span className="text-sm">{row.status === "success" ? "ok" : "błąd"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-medium">{row.jobName}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{row.model}</TableCell>
                        <TableCell className="text-sm">{userName}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                          {formatNumber(row.totalTokens)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                          {row.durationMs}ms
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-medium">
                          {formatUsd(Number(row.estimatedCostUsd))}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={8} className="bg-muted/30 p-4">
                            <div className="space-y-2 text-sm">
                              <div>
                                <span className="font-medium text-muted-foreground">User ID:</span>{" "}
                                <span className="font-mono text-xs">{row.userId ?? "—"}</span>
                              </div>
                              {row.targetUserId && (
                                <div>
                                  <span className="font-medium text-muted-foreground">Target User ID:</span>{" "}
                                  <span className="font-mono text-xs">{row.targetUserId}</span>
                                </div>
                              )}
                              <div>
                                <span className="font-medium text-muted-foreground">Prompt / Completion:</span>{" "}
                                <span className="tabular-nums">
                                  {formatNumber(row.promptTokens)} / {formatNumber(row.completionTokens)}
                                </span>
                              </div>
                              {row.errorMessage && (
                                <div>
                                  <span className="font-medium text-red-600">Błąd:</span>{" "}
                                  <span className="text-xs">{row.errorMessage}</span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
                {feed.data?.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                      Brak wpisów
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

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-12">
      <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}
