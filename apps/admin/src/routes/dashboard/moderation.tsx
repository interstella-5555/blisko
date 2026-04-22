import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format, formatDistanceToNowStrict } from "date-fns";
import { pl } from "date-fns/locale";
import { CheckIcon, TrashIcon } from "lucide-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { DashboardHeader } from "~/components/dashboard-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { UserCell } from "~/components/user-cell";
import { resolveAvatarUri } from "~/lib/avatar";
import { trpc } from "~/lib/trpc";

const TABS = ["review", "history", "csam"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  review: "Do przeglądu",
  history: "Historia",
  csam: "CSAM",
};

// Severe categories get a destructive badge; the rest a softer look. Keep the
// list narrow — the red is meant to draw the eye to things with real legal or
// safety weight.
const SEVERE_CATEGORIES = new Set(["sexual/minors", "violence/graphic", "self-harm/intent", "self-harm/instructions"]);

const searchSchema = z.object({
  tab: z.enum(TABS).optional(),
  page: z.number().min(0).optional(),
});

const PAGE_SIZE = 25;

export const Route = createFileRoute("/dashboard/moderation")({
  component: ModerationPage,
  validateSearch: searchSchema,
});

function ModerationPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const tab: Tab = search.tab ?? "review";
  const page = search.page ?? 0;

  const stats = trpc.moderation.stats.useQuery();
  const list = trpc.moderation.list.useQuery({ group: tab, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
  const utils = trpc.useUtils();

  const reviewOk = trpc.moderation.reviewOk.useMutation({
    onSuccess: () => {
      toast.success("Oznaczono jako OK");
      utils.moderation.list.invalidate();
      utils.moderation.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const enqueueRemove = trpc.moderation.enqueueRemove.useMutation({
    onSuccess: () => {
      toast.success("Usunięto z S3 i z profilu");
      utils.moderation.list.invalidate();
      utils.moderation.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const totalPages = list.data ? Math.ceil(list.data.total / PAGE_SIZE) : 0;

  const setTab = (next: Tab) => navigate({ search: { tab: next === "review" ? undefined : next } });

  return (
    <>
      <DashboardHeader title="Moderacja" />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="flex items-center gap-2 border-b">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 font-medium text-sm transition-colors ${
                tab === t
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {TAB_LABELS[t]}
              <Badge variant={tab === t ? "secondary" : "outline"} className="ml-1">
                {countFor(t, stats.data)}
              </Badge>
            </button>
          ))}
        </div>

        {list.isLoading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Ładowanie...</div>
        ) : list.data && list.data.rows.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            {tab === "review"
              ? "Kolejka pusta — nic do przeglądu"
              : tab === "csam"
                ? "Brak zablokowanych CSAM"
                : "Brak historii"}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {tab !== "csam" && <TableHead className="w-20">Obraz</TableHead>}
                <TableHead>Użytkownik</TableHead>
                <TableHead>Kategorie</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>{tab === "review" ? "Kiedy" : tab === "history" ? "Decyzja" : "Zablokowano"}</TableHead>
                {tab === "review" && <TableHead className="text-right">Akcje</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.rows.map((row) => (
                <TableRow key={row.id}>
                  {tab !== "csam" && (
                    <TableCell>
                      <Thumbnail source={row.uploadKey} />
                    </TableCell>
                  )}
                  <TableCell>
                    <UserCell
                      displayName={row.displayName}
                      avatarUrl={row.avatarUrl}
                      email={row.email ?? "(anonimizowany)"}
                      muted={row.userId == null}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {row.flaggedCategories.map((cat: string) => (
                        <Badge
                          key={cat}
                          variant={SEVERE_CATEGORIES.has(cat) ? "destructive" : "secondary"}
                          className="text-[10px]"
                        >
                          {cat}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ScoreTooltip scores={row.categoryScores} />
                  </TableCell>
                  <TableCell>
                    {tab === "history" ? (
                      <HistoryCell row={row} />
                    ) : (
                      <span
                        className="text-muted-foreground text-xs"
                        title={format(new Date(row.createdAt), "yyyy-MM-dd HH:mm:ss")}
                      >
                        {formatDistanceToNowStrict(new Date(row.createdAt), { addSuffix: true, locale: pl })}
                      </span>
                    )}
                  </TableCell>
                  {tab === "review" && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={reviewOk.isPending}
                          onClick={() => reviewOk.mutate({ id: row.id })}
                        >
                          <CheckIcon className="size-3" />
                          OK
                        </Button>
                        <RemoveButton
                          onConfirm={(notes) => enqueueRemove.mutate({ id: row.id, notes })}
                          disabled={enqueueRemove.isPending}
                        />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">
              Strona {page + 1} z {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => navigate({ search: { ...search, page: page - 1 } })}
              >
                Poprzednia
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => navigate({ search: { ...search, page: page + 1 } })}
              >
                Następna
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function countFor(
  tab: Tab,
  stats: { pending: number; reviewedOk: number; reviewedRemoved: number; csam: number } | undefined,
) {
  if (!stats) return 0;
  if (tab === "review") return stats.pending;
  if (tab === "csam") return stats.csam;
  return stats.reviewedOk + stats.reviewedRemoved;
}

function Thumbnail({ source }: { source: string | null }) {
  const uri = resolveAvatarUri(source, 48);
  if (!uri) return <div className="size-12 rounded bg-muted" />;
  return <img src={uri} alt="" className="size-12 rounded object-cover" />;
}

function ScoreTooltip({ scores }: { scores: Record<string, number> }) {
  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
  const top = sorted[0];
  if (!top) return <span className="text-muted-foreground text-xs">—</span>;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="cursor-help font-mono text-xs underline decoration-dotted">
            {top[0]} {top[1].toFixed(2)}
          </span>
        }
      />
      <TooltipContent>
        <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 font-mono text-[11px]">
          {sorted.map(([cat, score]) => (
            <Fragment key={cat}>
              <span>{cat}</span>
              <span className="text-right">{score.toFixed(3)}</span>
            </Fragment>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function HistoryCell({
  row,
}: {
  row: {
    status: string;
    reviewedAt: string | Date | null;
    reviewedBy: string | null;
    reviewNotes: string | null;
  };
}) {
  const removed = row.status === "reviewed_removed";
  return (
    <div className="flex flex-col gap-0.5">
      <Badge variant={removed ? "destructive" : "secondary"} className="w-fit">
        {removed ? "Usunięte" : "OK"}
      </Badge>
      {row.reviewedBy && (
        <span className="text-muted-foreground text-[11px]">
          {row.reviewedBy} · {row.reviewedAt ? format(new Date(row.reviewedAt), "yyyy-MM-dd HH:mm") : ""}
        </span>
      )}
      {row.reviewNotes && <span className="text-[11px] italic">{row.reviewNotes}</span>}
    </div>
  );
}

function RemoveButton({ onConfirm, disabled }: { onConfirm: (notes?: string) => void; disabled: boolean }) {
  const [notes, setNotes] = useState("");
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button variant="destructive" size="sm" disabled={disabled}>
            <TrashIcon className="size-3" />
            Usuń
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Usunąć zdjęcie?</AlertDialogTitle>
          <AlertDialogDescription>
            Plik zostanie usunięty z S3, a avatar użytkownika wyzerowany jeśli wciąż z niego korzysta. Operacja jest
            nieodwracalna.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <textarea
          className="w-full rounded border p-2 text-sm"
          placeholder="Notatka (opcjonalnie)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={2}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Anuluj</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => onConfirm(notes.trim() || undefined)}>
            Usuń
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
