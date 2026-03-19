# `style` — Code quality (whole repo)

- `style/no-biome-ignore` — Don't add `biome-ignore` comments or disable rules in `biome.json` to make errors go away. Fix the actual code. Only acceptable when code is intentionally correct and the rule is a false positive.

- `style/run-check` — Before finishing any task, run `pnpm check:fix` and verify 0 errors. Auto-fixes formatting and import ordering. Biome also runs automatically on commit via husky + lint-staged pre-commit hook.
