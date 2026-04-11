export type Tier = "t1" | "t2" | "t3";

const TIER_STYLES: Record<Tier, string> = {
  t1: "bg-muted text-muted-foreground ring-border",
  t2: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  t3: "bg-emerald-500 text-white ring-emerald-600",
};

export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 font-medium text-xs ring-1 ring-inset tabular-nums ${TIER_STYLES[tier]}`}
    >
      {tier.toUpperCase()}
    </span>
  );
}
