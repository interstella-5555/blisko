import { createFileRoute } from "@tanstack/react-router";
import { format, isToday } from "date-fns";
import { pl } from "date-fns/locale";
import { CircleIcon, LoaderIcon, PauseIcon, PlayIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { DashboardHeader } from "~/components/dashboard-header";
import { Badge } from "~/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { trpc } from "~/lib/trpc";

export const Route = createFileRoute("/dashboard/push-log")({
  component: PushLogPage,
});

type PushStatus = "sent" | "suppressed" | "failed";

const TABS: { key: PushStatus | "all"; label: string }[] = [
  { key: "all", label: "Wszystkie" },
  { key: "sent", label: "Wysłane" },
  { key: "suppressed", label: "Pominięte" },
  { key: "failed", label: "Błędy" },
];

const STATUS_COLORS: Record<string, string> = {
  sent: "bg-green-500",
  suppressed: "bg-yellow-500",
  failed: "bg-red-500",
};

const STATUS_LABELS: Record<string, string> = {
  sent: "Wysłany",
  suppressed: "Pominięty",
  failed: "Błąd",
};

const SUPPRESSION_LABELS: Record<string, string> = {
  ws_active: "WebSocket aktywny",
  dnd: "Nie przeszkadzać",
  no_tokens: "Brak tokenów",
  invalid_tokens: "Nieprawidłowe tokeny",
};

function PushLogPage() {
  const [isLive, setIsLive] = useState(true);
  const [statusFilter, setStatusFilter] = useState<PushStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const stats = trpc.pushLog.stats.useQuery(undefined, {
    refetchInterval: isLive ? 5000 : false,
  });

  const feed = trpc.pushLog.feed.useQuery(
    {
      status: statusFilter === "all" ? undefined : statusFilter,
      search: search || undefined,
      limit: 100,
    },
    {
      refetchInterval: isLive ? 5000 : false,
    },
  );

  const rows = feed.data?.rows ?? [];
  const nameMap = feed.data?.nameMap ?? {};

  const stateCounts: Record<string, number> = {
    all: stats.data?.total ?? 0,
    sent: stats.data?.sent ?? 0,
    suppressed: stats.data?.suppressed ?? 0,
    failed: stats.data?.failed ?? 0,
  };

  return (
    <>
      <DashboardHeader title="Push Log" />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {/* Tabs + controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  statusFilter === tab.key
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {tab.label}
                {stateCounts[tab.key] > 0 && (
                  <Badge
                    variant={statusFilter === tab.key ? "secondary" : "outline"}
                    className="ml-0.5 px-1.5 py-0 text-xs tabular-nums"
                  >
                    {stateCounts[tab.key]}
                  </Badge>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Szukaj..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm w-48 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {stats.data?.lastHour !== undefined && (
              <span className="text-xs text-muted-foreground tabular-nums">{stats.data.lastHour}/h</span>
            )}

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
                  <TableHead>Status</TableHead>
                  <TableHead>Odbiorca</TableHead>
                  <TableHead>Tytuł</TableHead>
                  <TableHead>Treść</TableHead>
                  <TableHead>Tokeny</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const isExpanded = expandedId === row.id;
                  return (
                    <>
                      <TableRow
                        key={row.id}
                        className={`cursor-pointer transition-colors ${
                          row.status === "failed"
                            ? "hover:bg-red-50"
                            : row.status === "suppressed"
                              ? "hover:bg-yellow-50"
                              : "hover:bg-muted/50"
                        }`}
                        onClick={() => setExpandedId(isExpanded ? null : row.id)}
                      >
                        <TableCell className="text-sm tabular-nums text-muted-foreground">
                          {formatTime(row.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className={`size-2 rounded-full ${STATUS_COLORS[row.status] ?? "bg-gray-300"}`} />
                            <span className="text-sm">{STATUS_LABELS[row.status] ?? row.status}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{nameMap[row.userId] || truncId(row.userId)}</TableCell>
                        <TableCell className="text-sm font-medium max-w-[200px] truncate">{row.title}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                          {row.body}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums text-muted-foreground">
                          {row.tokenCount > 0 ? row.tokenCount : "—"}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${row.id}-detail`}>
                          <TableCell colSpan={6} className="bg-muted/30 p-4">
                            <div className="space-y-2 text-sm">
                              <div>
                                <span className="font-medium text-muted-foreground">User ID:</span>{" "}
                                <span className="font-mono text-xs">{row.userId}</span>
                              </div>
                              {row.suppressionReason && (
                                <div>
                                  <span className="font-medium text-yellow-600">Powód pominięcia:</span>{" "}
                                  {SUPPRESSION_LABELS[row.suppressionReason] ?? row.suppressionReason}
                                </div>
                              )}
                              {row.collapseId && (
                                <div>
                                  <span className="font-medium text-muted-foreground">Collapse ID:</span>{" "}
                                  <span className="font-mono text-xs">{row.collapseId}</span>
                                </div>
                              )}
                              {row.data != null && (
                                <div>
                                  <span className="font-medium text-muted-foreground">Data:</span>
                                  <pre className="mt-1 text-xs font-mono bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                                    {JSON.stringify(row.data, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
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

function formatTime(timestamp: string | Date): string {
  const d = new Date(timestamp);
  if (isToday(d)) return format(d, "HH:mm:ss");
  return format(d, "d MMM HH:mm:ss", { locale: pl });
}

function truncId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}
