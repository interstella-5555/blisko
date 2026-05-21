import { NEARBY_DEFAULT_RADIUS_METERS } from "@repo/shared";
import ms from "ms";
import { trpc } from "@/lib/trpc";

/**
 * Remote-tunable app config. Fetched once at boot and cached for an hour;
 * React Query refetches on app focus so backend value changes propagate
 * without an App Store deploy.
 *
 * Fallback to the same shared constants that backend validators use as their
 * default — so the very first cold render (before the first network response)
 * lines up with whatever the server would have answered.
 */
const DEFAULTS = {
  nearby: {
    defaultRadiusMeters: NEARBY_DEFAULT_RADIUS_METERS,
  },
} as const;

export function useAppConfig() {
  const { data } = trpc.app.getConfig.useQuery(undefined, {
    staleTime: ms("1 hour"),
  });

  return data ?? DEFAULTS;
}
