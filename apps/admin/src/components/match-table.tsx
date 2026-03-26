import { Activity } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { ScoreBadge } from "./score-badge";
import { StatusBadge } from "./status-badge";

interface MatchAnalysis {
  id: string;
  fromUserId: string;
  toUserId: string;
  aiMatchScore: number;
  shortSnippet: string | null;
  longDescription: string | null;
  fromProfileHash: string;
  toProfileHash: string;
  triggeredBy: string | null;
  jobId: string | null;
  enqueuedAt: string | null;
  processedAt: string | null;
  processDurationMs: number | null;
  waitDurationMs: number | null;
  attemptsMade: number | null;
  createdAt: string;
  updatedAt: string;
  fromName: string | null;
  toName: string | null;
}

interface MatchTableProps {
  analyses: MatchAnalysis[] | null;
  page: number;
  totalPages: number;
  selectedId: string | null;
  onSelect: (analysis: MatchAnalysis) => void;
  onPageChange: (page: number) => void;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "teraz";
  if (diffMin < 60) return `${diffMin} min temu`;
  if (diffHrs < 24) return `${diffHrs} godz. temu`;
  if (diffDays < 7) return `${diffDays} dn. temu`;
  return date.toLocaleDateString("pl-PL");
}

export function MatchTable({ analyses, page, totalPages, selectedId, onSelect, onPageChange }: MatchTableProps) {
  if (analyses === null) {
    return (
      <div className="rounded-xl border border-[#e5e2dc] bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[#6b6560]">Para</TableHead>
              <TableHead className="w-[80px] text-[#6b6560]">Wynik</TableHead>
              <TableHead className="w-[100px] text-[#6b6560]">Status</TableHead>
              <TableHead className="w-[140px] text-[#6b6560]">Czas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {["s1", "s2", "s3", "s4", "s5"].map((key) => (
              <TableRow key={key}>
                <TableCell>
                  <Skeleton className="h-4 w-48" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-12" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (analyses.length === 0) {
    return (
      <div className="rounded-xl border border-[#e5e2dc] bg-white p-12 text-center">
        <Activity className="mx-auto size-8 text-[#8b8680]" />
        <h3 className="mt-3 text-sm font-semibold text-[#1a1a1a]">Brak analiz</h3>
        <p className="mt-1 text-sm text-[#6b6560]">
          Nie znaleziono zadnych analiz matchow. Analizy pojawia sie tutaj, gdy uzytkownik wyslij fale lub zaktualizuje
          profil.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#e5e2dc] bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[#6b6560]">Para</TableHead>
            <TableHead className="w-[80px] text-[#6b6560]">Wynik</TableHead>
            <TableHead className="w-[100px] text-[#6b6560]">Status</TableHead>
            <TableHead className="w-[140px] text-[#6b6560]">Czas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {analyses.map((analysis) => (
            <TableRow
              key={analysis.id}
              role="button"
              tabIndex={0}
              className={`cursor-pointer transition-colors duration-150 ${
                selectedId === analysis.id ? "bg-blue-50" : "hover:bg-gray-50"
              }`}
              onClick={() => onSelect(analysis)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(analysis);
                }
              }}
            >
              <TableCell className="text-sm text-[#1a1a1a]">
                {analysis.fromName ?? "Nieznany"} &rarr; {analysis.toName ?? "Nieznany"}
              </TableCell>
              <TableCell>
                <ScoreBadge score={analysis.aiMatchScore} />
              </TableCell>
              <TableCell>
                <StatusBadge status="completed" />
              </TableCell>
              <TableCell className="text-sm text-[#6b6560] tabular-nums">
                {formatRelativeTime(analysis.updatedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-4 border-t border-[#e5e2dc] px-4 py-3">
          <span className="text-sm text-[#6b6560]">
            Strona {page} z {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className={page <= 1 ? "opacity-50 cursor-not-allowed" : ""}
            >
              Poprzednia
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className={page >= totalPages ? "opacity-50 cursor-not-allowed" : ""}
            >
              Nastepna
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export type { MatchAnalysis };
