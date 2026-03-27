import { Badge } from "~/components/ui/badge";

interface StatusBadgeProps {
  status: "completed" | "failed";
}

export function StatusBadge({ status }: StatusBadgeProps) {
  if (status === "failed") {
    return (
      <Badge variant="destructive" className="text-xs">
        Nieudane
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">
      Ukonczone
    </Badge>
  );
}
