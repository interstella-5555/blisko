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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { UserCell } from "~/components/user-cell";
import { trpc } from "~/lib/trpc";

export const Route = createFileRoute("/dashboard/conversations")({
  component: ConversationsPage,
});

const PAGE_SIZE = 25;

function ConversationsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const stats = trpc.conversations.stats.useQuery();
  const conversations = trpc.conversations.list.useQuery({
    search: search || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const totalPages = conversations.data ? Math.ceil(conversations.data.total / PAGE_SIZE) : 0;

  const resetPage = () => setPage(0);

  return (
    <>
      <DashboardHeader title="Konwersacje" />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Wszystkie DM" value={stats.data?.total} />
          <StatCard label="Aktywne (7 dni)" value={stats.data?.active} />
          <StatCard label="Wiadomości" value={stats.data?.totalMessages} />
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
          <span className="ml-auto text-sm text-muted-foreground">
            {conversations.data ? `${conversations.data.total} wyników` : ""}
          </span>
        </div>

        {/* Table */}
        <div className="rounded-lg border">
          {conversations.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.error ? (
            <div className="flex items-center justify-center py-12 text-destructive text-sm">
              Błąd: {conversations.error.message}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[220px]">Uczestnik 1</TableHead>
                  <TableHead className="w-[220px]">Uczestnik 2</TableHead>
                  <TableHead>Wiadomości</TableHead>
                  <TableHead>Ostatnia wiadomość</TableHead>
                  <TableHead>Data utworzenia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversations.data?.conversations.map((conv) => (
                  <TableRow key={conv.id}>
                    <TableCell>
                      <UserCell displayName={conv.p1DisplayName} avatarUrl={conv.p1AvatarUrl} email={conv.p1Email} />
                    </TableCell>
                    <TableCell>
                      <UserCell displayName={conv.p2DisplayName} avatarUrl={conv.p2AvatarUrl} email={conv.p2Email} />
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{conv.messageCount}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleDateString("pl-PL") : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {conv.createdAt ? new Date(conv.createdAt).toLocaleDateString("pl-PL") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination */}
        {conversations.data && totalPages > 1 && (
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
