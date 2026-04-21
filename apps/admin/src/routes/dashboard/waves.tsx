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
import { UserCell } from "~/components/user-cell";
import { trpc } from "~/lib/trpc";

export const Route = createFileRoute("/dashboard/waves")({
  component: WavesPage,
});

type WaveStatus = "pending" | "accepted" | "declined";

const STATUS_COLORS: Record<WaveStatus, "default" | "secondary" | "destructive"> = {
  pending: "secondary",
  accepted: "default",
  declined: "destructive",
};

const STATUS_LABELS: Record<WaveStatus, string> = {
  pending: "Oczekujący",
  accepted: "Zaakceptowany",
  declined: "Odrzucony",
};

const PAGE_SIZE = 25;

function WavesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<WaveStatus | "all">("all");
  const [page, setPage] = useState(0);

  const stats = trpc.waves.stats.useQuery();
  const waves = trpc.waves.list.useQuery({
    search: search || undefined,
    status: statusFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const totalPages = waves.data ? Math.ceil(waves.data.total / PAGE_SIZE) : 0;

  const resetPage = () => setPage(0);

  return (
    <>
      <DashboardHeader title="Pingi" />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {/* Stats */}
        <div className="grid grid-cols-5 gap-4">
          <StatCard label="Wszystkie" value={stats.data?.total} />
          <StatCard label="Oczekujące" value={stats.data?.pending} />
          <StatCard label="Zaakceptowane" value={stats.data?.accepted} />
          <StatCard label="Odrzucone" value={stats.data?.declined} />
          <StatCard
            label="Akceptowalność"
            value={stats.data?.acceptRate !== undefined ? `${stats.data.acceptRate}%` : undefined}
          />
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
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as WaveStatus | "all");
              resetPage();
            }}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">Wszystkie statusy</option>
            <option value="pending">Oczekujące</option>
            <option value="accepted">Zaakceptowane</option>
            <option value="declined">Odrzucone</option>
          </select>
          <span className="ml-auto text-sm text-muted-foreground">
            {waves.data ? `${waves.data.total} wyników` : ""}
          </span>
        </div>

        {/* Table */}
        <div className="rounded-lg border">
          {waves.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : waves.error ? (
            <div className="flex items-center justify-center py-12 text-destructive text-sm">
              Błąd: {waves.error.message}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[220px]">Od</TableHead>
                  <TableHead className="w-[220px]">Do</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Status snapshot (nadawca)</TableHead>
                  <TableHead>Data wysłania</TableHead>
                  <TableHead>Data odpowiedzi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waves.data?.waves.map((wave) => (
                  <TableRow key={wave.id}>
                    <TableCell>
                      <UserCell
                        displayName={wave.fromDisplayName}
                        avatarUrl={wave.fromAvatarUrl}
                        email={wave.fromEmail}
                      />
                    </TableCell>
                    <TableCell>
                      <UserCell displayName={wave.toDisplayName} avatarUrl={wave.toAvatarUrl} email={wave.toEmail} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_COLORS[wave.status as WaveStatus]}>
                        {STATUS_LABELS[wave.status as WaveStatus] ?? wave.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {wave.senderStatusSnapshot ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {wave.createdAt ? new Date(wave.createdAt).toLocaleDateString("pl-PL") : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {wave.respondedAt ? new Date(wave.respondedAt).toLocaleDateString("pl-PL") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination */}
        {waves.data && totalPages > 1 && (
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
