import { createFileRoute } from "@tanstack/react-router";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  LoaderIcon,
  MapPinIcon,
} from "lucide-react";
import { useState } from "react";
import { DashboardHeader } from "~/components/dashboard-header";
import { PaginationButton } from "~/components/pagination-button";
import { ScoreBadge } from "~/components/score-badge";
import { TierBadge } from "~/components/tier-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { UserCell } from "~/components/user-cell";
import { trpc } from "~/lib/trpc";

export const Route = createFileRoute("/dashboard/users/$userId")({
  component: UserAnalysesPage,
});

type TierFilter = "all" | "t2" | "t3";
type SortOption = "newest" | "highest";

const TIER_FILTER_LABELS: Record<TierFilter, string> = {
  all: "Wszystkie tiery",
  t2: "T2 — quick score",
  t3: "T3 — full analysis",
};

const SORT_LABELS: Record<SortOption, string> = {
  newest: "Najnowsze",
  highest: "Najwyższy score",
};

const RADIUS_OPTIONS: { value: number; label: string }[] = [
  { value: 1000, label: "1 km" },
  { value: 2000, label: "2 km" },
  { value: 5000, label: "5 km" },
  { value: 10000, label: "10 km" },
  { value: 25000, label: "25 km" },
  { value: 50000, label: "50 km" },
];

const PAGE_SIZE = 25;

function UserAnalysesPage() {
  const { userId } = Route.useParams();
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [sort, setSort] = useState<SortOption>("newest");
  const [page, setPage] = useState(0);
  const [radiusMeters, setRadiusMeters] = useState(2000);

  const analyses = trpc.userAnalyses.listAnalyses.useQuery({
    userId,
    tierFilter,
    sort,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const nearby = trpc.userAnalyses.listNearby.useQuery({
    userId,
    radiusMeters,
  });

  const totalPages = analyses.data ? Math.ceil(analyses.data.total / PAGE_SIZE) : 0;
  const resetPage = () => setPage(0);

  const headerTitle = nearby.data?.target.displayName ?? "Użytkownik";

  return (
    <>
      <DashboardHeader title={headerTitle} parent={{ label: "Użytkownicy", href: "/dashboard/users" }} />
      <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
        {/* Target user info */}
        {nearby.data?.target && (
          <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
            <MapPinIcon className="size-4 text-muted-foreground" />
            <span className="font-medium text-sm">{nearby.data.target.displayName}</span>
            <span className="text-muted-foreground text-sm tabular-nums">
              {nearby.data.target.latitude.toFixed(4)}, {nearby.data.target.longitude.toFixed(4)}
            </span>
          </div>
        )}

        {/* Section 1: Analyses */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-lg">Analizy AI (T2/T3)</h2>
            <span className="ml-auto text-muted-foreground text-sm">
              {analyses.data ? `${analyses.data.total} wyników` : ""}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={tierFilter}
              onChange={(e) => {
                setTierFilter(e.target.value as TierFilter);
                resetPage();
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {Object.entries(TIER_FILTER_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as SortOption);
                resetPage();
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-lg border">
            {analyses.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : analyses.error ? (
              <div className="flex items-center justify-center py-12 text-destructive text-sm">
                Błąd: {analyses.error.message}
              </div>
            ) : analyses.data?.analyses.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                Brak analiz dla tego użytkownika
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Tier</TableHead>
                    <TableHead className="w-[280px]">Do użytkownika</TableHead>
                    <TableHead className="w-[100px]">Score</TableHead>
                    <TableHead>Krótki opis</TableHead>
                    <TableHead className="w-[130px]">Data analizy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analyses.data?.analyses.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <TierBadge tier={a.tier} />
                      </TableCell>
                      <TableCell>
                        <UserCell displayName={a.toDisplayName} avatarUrl={a.toAvatarUrl} email={a.toEmail} />
                      </TableCell>
                      <TableCell>
                        <ScoreBadge score={a.aiMatchScore} />
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-muted-foreground text-sm">
                        {a.shortSnippet ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(a.createdAt).toLocaleDateString("pl-PL")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {analyses.data && totalPages > 1 && (
            <div className="flex items-center justify-end gap-6 text-sm">
              <span className="text-muted-foreground">
                Strona {page + 1} z {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <PaginationButton onClick={() => setPage(0)} disabled={page === 0}>
                  <ChevronsLeftIcon className="size-4" />
                </PaginationButton>
                <PaginationButton onClick={() => setPage(page - 1)} disabled={page === 0}>
                  <ChevronLeftIcon className="size-4" />
                </PaginationButton>
                <PaginationButton onClick={() => setPage(page + 1)} disabled={page >= totalPages - 1}>
                  <ChevronRightIcon className="size-4" />
                </PaginationButton>
                <PaginationButton onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}>
                  <ChevronsRightIcon className="size-4" />
                </PaginationButton>
              </div>
            </div>
          )}
        </section>

        {/* Section 2: Nearby */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-lg">W pobliżu</h2>
            <span className="ml-auto text-muted-foreground text-sm">
              {nearby.data ? `${nearby.data.nearby.length} osób w promieniu` : ""}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <label htmlFor="radius-select" className="text-muted-foreground text-sm">
              Promień:
            </label>
            <select
              id="radius-select"
              value={radiusMeters}
              onChange={(e) => setRadiusMeters(Number(e.target.value))}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {RADIUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-lg border">
            {nearby.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : nearby.error ? (
              <div className="flex items-center justify-center py-12 text-destructive text-sm">
                Błąd: {nearby.error.message}
              </div>
            ) : nearby.data?.nearby.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                Brak użytkowników w promieniu {radiusMeters / 1000} km
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Tier</TableHead>
                    <TableHead className="w-[280px]">Użytkownik</TableHead>
                    <TableHead className="w-[100px]">Odległość</TableHead>
                    <TableHead className="w-[100px]">Score</TableHead>
                    <TableHead className="w-[180px]">Wspólne zaint.</TableHead>
                    <TableHead>Krótki opis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nearby.data?.nearby.map((n) => (
                    <TableRow key={n.userId}>
                      <TableCell>
                        <TierBadge tier={n.tier} />
                      </TableCell>
                      <TableCell>
                        <UserCell
                          displayName={n.displayName}
                          avatarUrl={n.avatarUrl}
                          email={n.email}
                          muted={n.isDeleted || n.visibilityMode === "ninja"}
                        />
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">{formatDistance(n.distance)}</TableCell>
                      <TableCell>
                        <ScoreBadge score={n.matchScore} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {n.commonInterests.length > 0 ? (
                          <>
                            <span className="tabular-nums">{n.commonInterests.length}</span>
                            {" — "}
                            <span className="truncate">{n.commonInterests.slice(0, 2).join(", ")}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate text-muted-foreground text-sm">
                        {n.shortSnippet ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {nearby.data && nearby.data.nearby.length === nearby.data.cappedAt && (
            <p className="text-muted-foreground text-xs">
              Wyniki ograniczone do {nearby.data.cappedAt} najbliższych. Zmniejsz promień żeby zobaczyć mniej wyników.
            </p>
          )}
        </section>
      </div>
    </>
  );
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
