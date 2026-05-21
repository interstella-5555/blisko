import { NEARBY_DEFAULT_RADIUS_METERS } from "@repo/shared";
import { publicProcedure, router } from "@/trpc/trpc";

// Static config returned to every booting client. No DB hit, no IO — Railway's
// edge DDoS protection covers abuse. Mobile React Query caches the result for 1h
// so each device fires this exactly once per app launch in practice.
export const appConfigRouter = router({
  getConfig: publicProcedure.query(() => {
    return {
      nearby: {
        defaultRadiusMeters: NEARBY_DEFAULT_RADIUS_METERS,
      },
    };
  }),
});
