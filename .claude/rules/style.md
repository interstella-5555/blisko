# `style` — Code quality (whole repo)

- `style/no-biome-ignore` — Don't add `biome-ignore` comments or disable rules in `biome.json` to make errors go away. Fix the actual code. Only acceptable when code is intentionally correct and the rule is a false positive.

- `style/english-code` — All code must be in English — variable names, function names, CSS class names, style keys, comments. Never mix Polish into code identifiers (e.g. `naTerazBadge` is wrong, use `statusMatchBadge`). Polish is only acceptable in user-facing strings (UI labels, error messages, placeholder text).

- `style/run-check` — Before finishing any task, run `pnpm check:fix` and verify 0 errors. Auto-fixes formatting and import ordering. Biome also runs automatically on commit via husky + lint-staged pre-commit hook.
