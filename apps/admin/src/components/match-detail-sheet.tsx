import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import type { MatchAnalysis } from "./match-table";
import { ScoreBadge } from "./score-badge";

interface MatchDetailSheetProps {
  analysis: MatchAnalysis | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

export function MatchDetailSheet({ analysis, open, onOpenChange }: MatchDetailSheetProps) {
  if (!analysis) return null;

  const hasTelemetry = analysis.jobId || analysis.enqueuedAt || analysis.processDurationMs != null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-lg">
            {analysis.fromName ?? "Nieznany"} & {analysis.toName ?? "Nieznany"}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 py-4">
          {/* Score */}
          <div>
            <ScoreBadge score={analysis.aiMatchScore} />
          </div>

          <Separator />

          {/* Summary */}
          {analysis.shortSnippet && (
            <div>
              <h4 className="text-sm text-[#6b6560] mb-2">Podsumowanie</h4>
              <p className="text-sm text-[#1a1a1a]">{analysis.shortSnippet}</p>
            </div>
          )}

          {/* Full Analysis */}
          {analysis.longDescription && (
            <div>
              <h4 className="text-sm text-[#6b6560] mb-2">Pelna analiza</h4>
              <p className="text-sm text-[#1a1a1a] whitespace-pre-wrap">{analysis.longDescription}</p>
            </div>
          )}

          <Separator />

          {/* Profile Hashes */}
          <div>
            <h4 className="text-sm text-[#6b6560] mb-2">Hashe profili</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-[#8b8680]">From</span>
                <p className="text-sm font-mono text-[#1a1a1a]">{analysis.fromProfileHash}</p>
              </div>
              <div>
                <span className="text-xs text-[#8b8680]">To</span>
                <p className="text-sm font-mono text-[#1a1a1a]">{analysis.toProfileHash}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Timestamps */}
          <div>
            <h4 className="text-sm text-[#6b6560] mb-2">Czas</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#6b6560]">Utworzono</span>
                <span className="text-[#1a1a1a] tabular-nums">{formatTimestamp(analysis.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6b6560]">Zaktualizowano</span>
                <span className="text-[#1a1a1a] tabular-nums">{formatTimestamp(analysis.updatedAt)}</span>
              </div>
            </div>
          </div>

          {/* BullMQ Lifecycle Telemetry (per D-11) */}
          {hasTelemetry && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm text-[#6b6560] mb-2">Telemetria BullMQ</h4>
                <div className="space-y-2 text-sm">
                  {analysis.jobId && (
                    <div className="flex justify-between">
                      <span className="text-[#6b6560]">Job ID</span>
                      <span className="text-[#1a1a1a] font-mono text-xs">{analysis.jobId}</span>
                    </div>
                  )}
                  {analysis.enqueuedAt && (
                    <div className="flex justify-between">
                      <span className="text-[#6b6560]">Zakolejkowano</span>
                      <span className="text-[#1a1a1a] tabular-nums">{formatTimestamp(analysis.enqueuedAt)}</span>
                    </div>
                  )}
                  {analysis.waitDurationMs != null && (
                    <div className="flex justify-between">
                      <span className="text-[#6b6560]">Oczekiwanie</span>
                      <span className="text-[#1a1a1a] tabular-nums">{formatDuration(analysis.waitDurationMs)}</span>
                    </div>
                  )}
                  {analysis.processedAt && (
                    <div className="flex justify-between">
                      <span className="text-[#6b6560]">Rozpoczeto przetwarzanie</span>
                      <span className="text-[#1a1a1a] tabular-nums">{formatTimestamp(analysis.processedAt)}</span>
                    </div>
                  )}
                  {analysis.processDurationMs != null && (
                    <div className="flex justify-between">
                      <span className="text-[#6b6560]">Czas przetwarzania</span>
                      <span className="text-[#1a1a1a] tabular-nums">{formatDuration(analysis.processDurationMs)}</span>
                    </div>
                  )}
                  {analysis.attemptsMade != null && (
                    <div className="flex justify-between">
                      <span className="text-[#6b6560]">Proby</span>
                      <span className="text-[#1a1a1a] tabular-nums">{analysis.attemptsMade}</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Trigger Source */}
          {analysis.triggeredBy && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm text-[#6b6560] mb-2">Zrodlo</h4>
                <Badge variant="outline" className="text-xs">
                  {analysis.triggeredBy}
                </Badge>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
