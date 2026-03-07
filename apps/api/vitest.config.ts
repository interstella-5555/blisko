import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    server: {
      deps: {
        inline: ["@repo/shared", "zod"],
      },
    },
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
