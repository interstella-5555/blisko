// Import from `@repo/db/schema` (not `@repo/db`) — the root entry pulls in
// `postgres`/`createDb` which uses `perf_hooks` (Node-only) and Vite can't
// bundle that into the client build. Schema barrel is pure schema + types.
import { USER_TYPES, type UserType } from "@repo/db/schema";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  BotIcon,
  BrainIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  CircleCheckIcon,
  EyeIcon,
  LoaderIcon,
  MoreHorizontalIcon,
  NetworkIcon,
  PauseCircleIcon,
  RotateCcwIcon,
  SearchIcon,
  ShieldAlertIcon,
  TrashIcon,
  UnplugIcon,
  WandSparklesIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DashboardHeader } from "~/components/dashboard-header";
import { PaginationButton } from "~/components/pagination-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { trpc } from "~/lib/trpc";

export const Route = createFileRoute("/dashboard/users")({
  component: UsersPage,
});

type UserStatus = "active" | "onboarding" | "deleted" | "suspended";
type UserTypeFilter = UserType | "all";

const TYPE_LABELS: Record<UserType, string> = {
  regular: "Real",
  demo: "Demo",
  test: "Test",
  review: "Review",
};

const TYPE_BADGE_VARIANT: Record<UserType, "default" | "secondary" | "destructive" | "outline"> = {
  regular: "default",
  demo: "secondary",
  test: "outline",
  review: "outline",
};

const STATUS_COLORS: Record<UserStatus, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  onboarding: "secondary",
  deleted: "destructive",
  // Amber-ish via outline; distinguishable from the destructive red of deleted
  // while keeping the shared Badge component (no new variant needed).
  suspended: "outline",
};

const STATUS_LABELS: Record<UserStatus, string> = {
  active: "Aktywny",
  onboarding: "Onboarding",
  deleted: "Usunięty",
  suspended: "Zawieszony",
};

const VISIBILITY_LABELS: Record<string, string> = {
  ninja: "Ninja",
  semi_open: "Semi-open",
  full_nomad: "Full nomad",
};

const PAGE_SIZE = 25;

function UsersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<UserTypeFilter>("regular");
  const [page, setPage] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const stats = trpc.users.stats.useQuery();
  const users = trpc.users.list.useQuery({
    search: search || undefined,
    status: statusFilter,
    type: typeFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const selectedUser = trpc.users.getById.useQuery({ id: selectedUserId! }, { enabled: !!selectedUserId });

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [suspendDialog, setSuspendDialog] = useState<{ id: string; name: string } | null>(null);
  const [suspendReason, setSuspendReason] = useState("");

  const utils = trpc.useUtils();

  const softDeleteMutation = trpc.users.softDelete.useMutation({
    onSuccess: () => {
      toast.success("Konto użytkownika zostało usunięte");
      utils.users.list.invalidate();
      utils.users.stats.invalidate();
      if (selectedUserId) utils.users.getById.invalidate({ id: selectedUserId });
      setDeleteConfirm(null);
    },
    onError: (err) => toast.error(`Błąd: ${err.message}`),
  });

  const restoreMutation = trpc.users.restore.useMutation({
    onSuccess: () => {
      toast.success("Konto użytkownika zostało przywrócone");
      utils.users.list.invalidate();
      utils.users.stats.invalidate();
      if (selectedUserId) utils.users.getById.invalidate({ id: selectedUserId });
    },
    onError: (err) => toast.error(`Błąd: ${err.message}`),
  });

  const reanalyzeMutation = trpc.users.reanalyze.useMutation({
    onSuccess: () => toast.success("Analiza AI została zlecona"),
    onError: (err) => toast.error(`Błąd: ${err.message}`),
  });

  const regenerateProfileMutation = trpc.users.regenerateProfile.useMutation({
    onSuccess: () => toast.success("Profil został zregenerowany"),
    onError: (err) => toast.error(`Błąd: ${err.message}`),
  });

  const forceDisconnectMutation = trpc.users.forceDisconnect.useMutation({
    onSuccess: () => toast.success("Użytkownik został rozłączony"),
    onError: (err) => toast.error(`Błąd: ${err.message}`),
  });

  const updateTypeMutation = trpc.users.updateType.useMutation({
    onSuccess: () => {
      toast.success("Typ użytkownika zaktualizowany");
      utils.users.list.invalidate();
      utils.users.stats.invalidate();
      if (selectedUserId) utils.users.getById.invalidate({ id: selectedUserId });
    },
    onError: (err) => toast.error(`Błąd: ${err.message}`),
  });

  const suspendMutation = trpc.users.suspend.useMutation({
    onSuccess: () => {
      toast.success("Konto zostało zawieszone");
      utils.users.list.invalidate();
      if (selectedUserId) utils.users.getById.invalidate({ id: selectedUserId });
      setSuspendDialog(null);
      setSuspendReason("");
    },
    onError: (err) => toast.error(`Błąd: ${err.message}`),
  });

  const unsuspendMutation = trpc.users.unsuspend.useMutation({
    onSuccess: () => {
      toast.success("Konto zostało odwieszone");
      utils.users.list.invalidate();
      if (selectedUserId) utils.users.getById.invalidate({ id: selectedUserId });
    },
    onError: (err) => toast.error(`Błąd: ${err.message}`),
  });

  const totalPages = users.data ? Math.ceil(users.data.total / PAGE_SIZE) : 0;
  const resetPage = () => setPage(0);

  return (
    <>
      <DashboardHeader title="Użytkownicy" />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {USER_TYPES.map((t) => (
            <StatCard key={t} label={TYPE_LABELS[t]} value={stats.data?.[t]} />
          ))}
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
              setStatusFilter(e.target.value as UserStatus | "all");
              resetPage();
            }}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">Wszystkie statusy</option>
            <option value="active">Aktywni</option>
            <option value="onboarding">Onboarding</option>
            <option value="suspended">Zawieszeni</option>
            <option value="deleted">Usunięci</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as UserTypeFilter);
              resetPage();
            }}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {USER_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
            <option value="all">Wszystkie typy</option>
          </select>
          <span className="ml-auto text-sm text-muted-foreground">
            {users.data ? `${users.data.total} wyników` : ""}
          </span>
        </div>

        {/* Table */}
        <div className="rounded-lg border">
          {users.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : users.error ? (
            <div className="flex items-center justify-center py-12 text-destructive text-sm">
              Błąd: {users.error.message}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[280px]">Użytkownik</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Widoczność</TableHead>
                  <TableHead className="text-right">Waves</TableHead>
                  <TableHead className="text-right">Wiadomości</TableHead>
                  <TableHead className="text-right">Grupy</TableHead>
                  <TableHead>Rejestracja</TableHead>
                  <TableHead>Ostatnia lokalizacja</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data?.users.map((user) => (
                  <TableRow
                    key={user.id}
                    className={user.status === "deleted" || user.status === "suspended" ? "opacity-50" : ""}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                          {user.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium text-sm">{user.displayName}</span>
                            {user.type !== "regular" && (
                              <Badge variant={TYPE_BADGE_VARIANT[user.type]} className="gap-1 text-[10px] px-1.5 py-0">
                                {user.type === "demo" && <BotIcon className="size-3" />}
                                {TYPE_LABELS[user.type]}
                              </Badge>
                            )}
                            {!user.isComplete && <ShieldAlertIcon className="size-3.5 text-amber-500" />}
                          </div>
                          <span className="text-xs text-muted-foreground truncate block">{user.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_COLORS[user.status]}>{STATUS_LABELS[user.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{VISIBILITY_LABELS[user.visibilityMode ?? "semi_open"]}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="text-sm">{user.wavesSent}</span>
                      <span className="text-muted-foreground text-xs"> / {user.wavesReceived}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{user.messageCount}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{user.groupCount}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString("pl-PL") : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.lastLocationUpdate ? new Date(user.lastLocationUpdate).toLocaleDateString("pl-PL") : "—"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <button
                              type="button"
                              className="flex size-8 items-center justify-center rounded-md hover:bg-muted"
                            />
                          }
                        >
                          <MoreHorizontalIcon className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onSelect={() => setSelectedUserId(user.id)}>
                            <EyeIcon className="text-muted-foreground" />
                            Podgląd profilu
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              navigate({
                                to: "/dashboard/users/$userId",
                                params: { userId: user.id },
                              })
                            }
                          >
                            <NetworkIcon className="text-muted-foreground" />
                            Analizy i nearby
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => reanalyzeMutation.mutate({ userId: user.id })}
                            disabled={reanalyzeMutation.isPending}
                          >
                            <BrainIcon className="text-muted-foreground" />
                            Re-analiza AI
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => regenerateProfileMutation.mutate({ userId: user.id })}
                            disabled={regenerateProfileMutation.isPending}
                          >
                            <WandSparklesIcon className="text-muted-foreground" />
                            Regeneruj profil
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => forceDisconnectMutation.mutate({ userId: user.id })}
                            disabled={forceDisconnectMutation.isPending}
                          >
                            <UnplugIcon className="text-muted-foreground" />
                            Rozłącz
                          </DropdownMenuItem>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <BotIcon className="text-muted-foreground" />
                              Zmień typ: {TYPE_LABELS[user.type]}
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              {USER_TYPES.map((t) => (
                                <DropdownMenuItem
                                  key={t}
                                  disabled={updateTypeMutation.isPending || user.type === t}
                                  onSelect={() => updateTypeMutation.mutate({ userId: user.id, type: t })}
                                >
                                  {TYPE_LABELS[t]}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                          <DropdownMenuSeparator />
                          {user.status === "suspended" ? (
                            <DropdownMenuItem
                              onSelect={() => unsuspendMutation.mutate({ userId: user.id })}
                              disabled={unsuspendMutation.isPending}
                            >
                              <CircleCheckIcon className="text-muted-foreground" />
                              Odwieś konto
                            </DropdownMenuItem>
                          ) : user.status !== "deleted" ? (
                            <DropdownMenuItem
                              onSelect={() => setSuspendDialog({ id: user.id, name: user.displayName })}
                            >
                              <PauseCircleIcon className="text-muted-foreground" />
                              Zawieś konto
                            </DropdownMenuItem>
                          ) : null}
                          {user.status === "deleted" ? (
                            <DropdownMenuItem
                              onSelect={() => restoreMutation.mutate({ userId: user.id })}
                              disabled={restoreMutation.isPending}
                            >
                              <RotateCcwIcon className="text-muted-foreground" />
                              Przywróć konto
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onSelect={() => setDeleteConfirm({ id: user.id, name: user.displayName })}
                              className="text-destructive"
                            >
                              <TrashIcon />
                              Usuń konto
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Profile Detail Panel */}
        {selectedUserId && (
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="font-medium text-sm">Podgląd profilu</h3>
              <button
                type="button"
                onClick={() => setSelectedUserId(null)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                Zamknij ✕
              </button>
            </div>
            {selectedUser.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <LoaderIcon className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : selectedUser.data ? (
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 p-4 text-sm">
                <Field label="ID" value={selectedUser.data.id} />
                <Field label="Email" value={selectedUser.data.email} />
                <Field label="Nazwa" value={selectedUser.data.displayName} />
                <Field label="Widoczność" value={VISIBILITY_LABELS[selectedUser.data.visibilityMode ?? "semi_open"]} />
                <Field label="Bio" value={selectedUser.data.bio || "—"} />
                <Field label="Szukam" value={selectedUser.data.lookingFor || "—"} />
                <Field label="Superpower" value={selectedUser.data.superpower || "—"} />
                <Field label="Zainteresowania" value={selectedUser.data.interests?.join(", ") || "—"} />
                <Field label="DND" value={selectedUser.data.doNotDisturb ? "Tak" : "Nie"} />
                <Field label="Profil kompletny" value={selectedUser.data.isComplete ? "Tak" : "Nie"} />
                <Field label="Status" value={selectedUser.data.currentStatus || "—"} />
                <Field
                  label="Lokalizacja"
                  value={
                    selectedUser.data.latitude
                      ? `${selectedUser.data.latitude.toFixed(4)}, ${selectedUser.data.longitude?.toFixed(4)}`
                      : "—"
                  }
                />
                <Field
                  label="Data rejestracji"
                  value={
                    selectedUser.data.createdAt ? new Date(selectedUser.data.createdAt).toLocaleString("pl-PL") : "—"
                  }
                />
                <Field
                  label="Usunięto"
                  value={
                    selectedUser.data.deletedAt ? new Date(selectedUser.data.deletedAt).toLocaleString("pl-PL") : "—"
                  }
                />
                <Field
                  label="Zanonimizowano"
                  value={
                    selectedUser.data.anonymizedAt
                      ? new Date(selectedUser.data.anonymizedAt).toLocaleString("pl-PL")
                      : "—"
                  }
                />
                <Field
                  label="Zawieszono"
                  value={
                    selectedUser.data.suspendedAt
                      ? new Date(selectedUser.data.suspendedAt).toLocaleString("pl-PL")
                      : "—"
                  }
                />
                <Field label="Powód zawieszenia" value={selectedUser.data.suspendReason || "—"} />
                <Field
                  label="Data urodzenia"
                  value={
                    selectedUser.data.dateOfBirth
                      ? new Date(selectedUser.data.dateOfBirth).toLocaleDateString("pl-PL")
                      : "—"
                  }
                />
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">Nie znaleziono użytkownika</div>
            )}
          </div>
        )}

        {/* Pagination */}
        {users.data && totalPages > 1 && (
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

      <AlertDialog
        open={!!suspendDialog}
        onOpenChange={(open) => {
          if (!open) {
            setSuspendDialog(null);
            setSuspendReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zawiesić konto?</AlertDialogTitle>
            <AlertDialogDescription>
              Konto użytkownika {suspendDialog?.name} zostanie zawieszone — logowanie zablokowane, sesje i push-tokeny
              skasowane, pending pingi odrzucone. Powód nie jest pokazywany użytkownikowi, tylko zapisany do audytu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <textarea
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            rows={4}
            placeholder="Powód zawieszenia (widoczny tylko dla administracji)"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                suspendDialog && suspendMutation.mutate({ userId: suspendDialog.id, reason: suspendReason.trim() })
              }
              disabled={suspendMutation.isPending || suspendReason.trim().length < 3}
            >
              {suspendMutation.isPending ? "Zawieszam..." : "Zawieś konto"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć konto?</AlertDialogTitle>
            <AlertDialogDescription>
              Konto użytkownika {deleteConfirm?.name} zostanie oznaczone jako usunięte. Użytkownik ma 14 dni na
              przywrócenie konta, po czym dane zostaną zanonimizowane.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && softDeleteMutation.mutate({ userId: deleteConfirm.id })}
              disabled={softDeleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {softDeleteMutation.isPending ? "Usuwanie..." : "Usuń konto"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span> <span className="break-all">{value}</span>
    </div>
  );
}
