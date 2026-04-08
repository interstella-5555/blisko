import { createFileRoute } from "@tanstack/react-router";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  LoaderIcon,
  SearchIcon,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { DashboardHeader } from "~/components/dashboard-header";
import { Badge } from "~/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { trpc } from "~/lib/trpc";

export const Route = createFileRoute("/dashboard/groups")({
  component: GroupsPage,
});

const PAGE_SIZE = 25;

function GroupsPage() {
  const [search, setSearch] = useState("");
  const [discoverableFilter, setDiscoverableFilter] = useState<"all" | "yes" | "no">("all");
  const [page, setPage] = useState(0);

  const stats = trpc.groups.stats.useQuery();
  const groups = trpc.groups.list.useQuery({
    search: search || undefined,
    discoverable: discoverableFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const totalPages = groups.data ? Math.ceil(groups.data.total / PAGE_SIZE) : 0;

  const resetPage = () => setPage(0);

  return (
    <>
      <DashboardHeader title="Grupy" />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Wszystkie grupy" value={stats.data?.total} />
          <StatCard label="Odkrywalne" value={stats.data?.discoverable} />
          <StatCard label="Średnio członków" value={stats.data?.avgMembers} />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Szukaj po nazwie grupy..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
              className="w-full rounded-md border border-input bg-background px-9 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <select
            value={discoverableFilter}
            onChange={(e) => {
              setDiscoverableFilter(e.target.value as "all" | "yes" | "no");
              resetPage();
            }}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">Wszystkie</option>
            <option value="yes">Odkrywalne</option>
            <option value="no">Nieodkrywalne</option>
          </select>
          <span className="ml-auto text-sm text-muted-foreground">
            {groups.data ? `${groups.data.total} wyników` : ""}
          </span>
        </div>

        {/* Table */}
        <div className="rounded-lg border">
          {groups.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : groups.error ? (
            <div className="flex items-center justify-center py-12 text-destructive text-sm">
              Błąd: {groups.error.message}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Nazwa grupy</TableHead>
                  <TableHead className="w-[250px]">Opis</TableHead>
                  <TableHead>Twórca</TableHead>
                  <TableHead className="text-right">Członków</TableHead>
                  <TableHead>Odkrywalna</TableHead>
                  <TableHead>Kod zaproszenia</TableHead>
                  <TableHead>Data utworzenia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.data?.groups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell>
                      <span className="font-medium text-sm">{group.name ?? "—"}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[250px] truncate">
                      {group.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">{group.creatorDisplayName ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{group.memberCount}</TableCell>
                    <TableCell>
                      <Badge variant={group.isDiscoverable ? "default" : "secondary"}>
                        {group.isDiscoverable ? "Tak" : "Nie"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground">{group.inviteCode ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {group.createdAt ? new Date(group.createdAt).toLocaleDateString("pl-PL") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination */}
        {groups.data && totalPages > 1 && (
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

function StatCard({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value !== undefined ? value : "—"}</p>
    </div>
  );
}

function PaginationButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex size-8 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
    >
      {children}
    </button>
  );
}
