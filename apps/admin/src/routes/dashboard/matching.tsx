import { createFileRoute } from "@tanstack/react-router";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  LoaderIcon,
  SearchIcon,
} from "lucide-react";
import { useState } from "react";
import { DashboardHeader } from "~/components/dashboard-header";
import { PaginationButton } from "~/components/pagination-button";
import { ScoreBadge } from "~/components/score-badge";
import { TierBadge } from "~/components/tier-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { UserCell } from "~/components/user-cell";
import { trpc } from "~/lib/trpc";

export const Route = createFileRoute("/dashboard/matching")({
  component: MatchingPage,
});

type TierFilter = "all" | "t1" | "t2" | "t3";
type SortOption = "newest" | "highest";

const TIER_FILTER_LABELS: Record<TierFilter, string> = {
  all: "Wszystkie tiery",
  t1: "T1 — cosine",
  t2: "T2 — quick score",
  t3: "T3 — full analysis",
};

const SORT_LABELS: Record<SortOption, string> = {
  newest: "Najnowsze",
  highest: "Najwyższy score",
};

const PAGE_SIZE = 25;

function MatchingPage() {
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [sort, setSort] = useState<SortOption>("newest");
  const [page, setPage] = useState(0);

  const stats = trpc.matching.stats.useQuery();
  const analyses = trpc.matching.list.useQuery({
    search: search || undefined,
    tierFilter,
    sort,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const totalPages = analyses.data ? Math.ceil(analyses.data.total / PAGE_SIZE) : 0;

  const resetPage = () => setPage(0);

  return (
    <>
      <DashboardHeader title="AI Matching" />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Wszystkie analizy" value={stats.data?.total} />
          <StatCard
            label="Średni score"
            value={stats.data?.avgScore !== undefined ? `${stats.data.avgScore}` : undefined}
          />
          <StatCard label="Wysoki match (≥75)" value={stats.data?.highMatches} />
          <StatCard label="Niski match (<25)" value={stats.data?.lowMatches} />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Szukaj po nazwie lub emailu..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
              className="w-full rounded-md border border-input bg-background px-9 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
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
          <span className="ml-auto text-sm text-muted-foreground">
            {analyses.data ? `${analyses.data.total} wyników` : ""}
          </span>
        </div>

        {/* Table */}
        <div className="rounded-lg border">
          {analyses.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : analyses.error ? (
            <div className="flex items-center justify-center py-12 text-destructive text-sm">
              Błąd: {analyses.error.message}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[220px]">Użytkownik 1</TableHead>
                  <TableHead className="w-[220px]">Użytkownik 2</TableHead>
                  <TableHead className="w-[80px]">Tier</TableHead>
                  <TableHead className="w-[100px]">Score</TableHead>
                  <TableHead>Krótki opis</TableHead>
                  <TableHead className="w-[130px]">Data analizy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analyses.data?.analyses.map((analysis) => (
                  <TableRow key={analysis.id}>
                    <TableCell>
                      <UserCell
                        displayName={analysis.fromDisplayName}
                        avatarUrl={analysis.fromAvatarUrl}
                        email={analysis.fromEmail}
                      />
                    </TableCell>
                    <TableCell>
                      <UserCell
                        displayName={analysis.toDisplayName}
                        avatarUrl={analysis.toAvatarUrl}
                        email={analysis.toEmail}
                      />
                    </TableCell>
                    <TableCell>
                      <TierBadge tier={analysis.tier} />
                    </TableCell>
                    <TableCell>
                      <ScoreBadge score={analysis.aiMatchScore} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                      {analysis.shortSnippet ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {analysis.createdAt ? new Date(analysis.createdAt).toLocaleDateString("pl-PL") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination */}
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
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value?: number | string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value !== undefined ? value : "—"}</p>
    </div>
  );
}
