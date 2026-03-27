import { CheckCircle, Clock, Loader, XCircle } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";

interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

interface QueueHealthCardsProps {
  counts: QueueCounts | null;
}

const cards = [
  { key: "waiting" as const, label: "Oczekujace", icon: Clock, colorClass: "text-yellow-600" },
  { key: "active" as const, label: "Aktywne", icon: Loader, colorClass: "text-blue-600" },
  { key: "completed" as const, label: "Zakonczone", icon: CheckCircle, colorClass: "text-green-600" },
  { key: "failed" as const, label: "Nieudane", icon: XCircle, colorClass: "text-red-600" },
] as const;

export function QueueHealthCards({ counts }: QueueHealthCardsProps) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.key} className="border-[#e5e2dc] bg-white rounded-lg">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <card.icon className={`size-4 ${card.colorClass}`} />
              <span className="text-sm text-[#6b6560]">{card.label}</span>
            </div>
            {counts ? (
              <span className={`text-[28px] font-semibold tabular-nums ${card.colorClass}`}>{counts[card.key]}</span>
            ) : (
              <Skeleton className="h-9 w-16" />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
