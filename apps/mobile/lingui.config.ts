import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

export default defineConfig({
  sourceLocale: "pl",
  locales: ["pl", "uk"],
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}/messages",
      include: ["<rootDir>/app", "<rootDir>/src"],
    },
  ],
  format: formatter({ lineNumbers: false }),
});
