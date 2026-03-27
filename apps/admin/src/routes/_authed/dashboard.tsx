import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { MatchDetailSheet } from "~/components/match-detail-sheet";
import type { MatchAnalysis } from "~/components/match-table";
import { MatchTable } from "~/components/match-table";
import { QueueHealthCards } from "~/components/queue-health-cards";

const QUEUE_POLL_INTERVAL = 15_000; // 15 seconds per UI-SPEC

export const Route = createFileRoute("/_authed/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const [analyses, setAnalyses] = useState<MatchAnalysis[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [queueCounts, setQueueCounts] = useState<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  } | null>(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState<MatchAnalysis | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const fetchMatches = useCallback(async (p: number) => {
    try {
      const res = await fetch(`/api/matches?page=${p}`);
      if (res.ok) {
        const data = await res.json();
        setAnalyses(data.analyses);
        setTotalPages(data.totalPages);
      }
    } catch (err) {
      console.error("[dashboard] fetch matches error:", err);
    }
  }, []);

  const fetchQueueHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/queue-health");
      if (res.ok) {
        const data = await res.json();
        setQueueCounts(data);
      }
    } catch (err) {
      console.error("[dashboard] fetch queue health error:", err);
    }
  }, []);

  useEffect(() => {
    fetchMatches(page);
  }, [fetchMatches, page]);

  useEffect(() => {
    fetchQueueHealth();
    const interval = setInterval(fetchQueueHealth, QUEUE_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchQueueHealth]);

  function handleSelectAnalysis(analysis: MatchAnalysis) {
    setSelectedAnalysis(analysis);
    setSheetOpen(true);
  }

  function handleSheetOpenChange(open: boolean) {
    setSheetOpen(open);
    if (!open) setSelectedAnalysis(null);
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-[#1a1a1a] mb-6">Analiza matchow</h1>

      <div className="space-y-6">
        <QueueHealthCards counts={queueCounts} />
        <MatchTable
          analyses={analyses}
          page={page}
          totalPages={totalPages}
          selectedId={selectedAnalysis?.id ?? null}
          onSelect={handleSelectAnalysis}
          onPageChange={setPage}
        />
      </div>

      <MatchDetailSheet analysis={selectedAnalysis} open={sheetOpen} onOpenChange={handleSheetOpenChange} />
    </div>
  );
}
