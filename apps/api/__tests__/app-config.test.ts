import { NEARBY_DEFAULT_RADIUS_METERS } from "@repo/shared";
import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("app.getConfig tRPC procedure", () => {
  it("returns shared NEARBY_DEFAULT_RADIUS_METERS for nearby.defaultRadiusMeters", async () => {
    const res = await app.request("/trpc/app.getConfig");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { result: { data: { nearby: { defaultRadiusMeters: number } } } };
    expect(body.result.data).toEqual({
      nearby: {
        defaultRadiusMeters: NEARBY_DEFAULT_RADIUS_METERS,
      },
    });
  });

  it("works without authentication (publicProcedure)", async () => {
    // Hit with no Authorization header — must return 200 not UNAUTHORIZED.
    const res = await app.request("/trpc/app.getConfig", {
      headers: {},
    });
    expect(res.status).toBe(200);
  });
});
