import { Badge } from "~/components/ui/badge";

interface ScoreBadgeProps {
  score: number;
}

export function ScoreBadge({ score }: ScoreBadgeProps) {
  const rounded = Math.round(score);
  let colorClass: string;
  let ariaLabel: string;

  if (rounded >= 70) {
    colorClass = "bg-green-100 text-green-700 hover:bg-green-100";
    ariaLabel = `Wynik: ${rounded} procent, wysoki`;
  } else if (rounded >= 40) {
    colorClass = "bg-yellow-100 text-yellow-700 hover:bg-yellow-100";
    ariaLabel = `Wynik: ${rounded} procent, sredni`;
  } else {
    colorClass = "bg-red-100 text-red-700 hover:bg-red-100";
    ariaLabel = `Wynik: ${rounded} procent, niski`;
  }

  return (
    <Badge variant="secondary" className={`${colorClass} tabular-nums font-medium`} aria-label={ariaLabel}>
      {rounded}%
    </Badge>
  );
}
