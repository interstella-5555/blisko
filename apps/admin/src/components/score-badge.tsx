export function ScoreBadge({ score }: { score: number }) {
  const rounded = Math.round(score);
  const colorClass = rounded >= 75 ? "bg-green-500" : rounded >= 50 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <span className={`size-2 rounded-full ${colorClass}`} />
      <span className="font-medium text-sm tabular-nums">{rounded}</span>
    </div>
  );
}
