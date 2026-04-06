# `git` — Git workflow, commits, PRs, and branch conventions

## Branches

- `git/branch-naming` — Branch name must contain the Linear ticket ID (e.g. `kwypchlo/bli-42-add-groups`). This is how Linear's GitHub integration auto-links PRs and triggers status automations. Use Linear's `gitBranchName` field. If already on a branch without the ID, rename it before creating the PR.

- `git/branch-from-main` — Always create branches from latest `origin/main`. The `enforce-branch-from-default` hook enforces this automatically — it rewrites `git checkout -b` / `git worktree add` to fetch and branch from `origin/main`.

- `git/worktree-setup` — After creating a worktree, run `bun install` (worktrees share git history but not `node_modules`). Copy `.env` files from the main repo — worktrees don't share untracked files.

## Commit Messages

- `git/commit-conventional` — Use conventional commit prefix: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`. No scope in parentheses (e.g. `feat:` not `feat(api):`).

- `git/commit-format` — First line: conventional prefix + what changed and why. Ticket ID at end in parentheses: `feat: add group discovery nearby (BLI-42)`. Body is optional — if the first line says it all, don't add one. Body follows same rules as PR description (prose or list, no headings, no filler).

- `git/commit-context` — Write each commit in context of prior commits on the branch and the Linear ticket. Don't repeat what's already established.

## Pull Requests

PR titles and descriptions are read by humans who skim quickly — write for how people actually read. Prioritize clarity and scannability over completeness. Describe functionality, not implementation.

- `git/pr-needs-ticket` — Every PR needs a Linear ticket. Before creating a PR, search for an existing ticket. If none exists, create one first.

- `git/pr-gh-cli` — All `gh` commands must be single-line (no backslash line continuation). Always self-assign PRs (`gh pr create --assignee @me`). After creating a PR, link it to the Linear ticket as an attachment via `create_attachment`.

- `git/pr-title` — Use conventional commit prefix (`feat:`, `fix:`, `refactor:`, `chore:`). Describe WHAT changed AND WHY — someone reading the PR list should understand the purpose without clicking. No ticket IDs in the title. Generate the title from actual code changes, commit diffs, ticket context, and repo context — not just commit messages.

- `git/pr-description` — Linear ticket link at the very top. Body is **prose, max 3-4 lines** — describes the functional change and why, not what code changed. If prose isn't enough, use a **list** (max 5 items, each fits in one line on GitHub UI). Prose + list combo is fine. Incidental changes go at the end, prefixed with `Extra:`. **No headings** `#`/`##`/`###` — use `####` at most. **No test plan**, no "next steps", no filler sections.

- `git/pr-update-fresh-read` — When updating an existing PR description: run `gh pr view --json body` **in the same prompt response** as the edit — never rely on a read from earlier in the session. The user may have added screenshots, links, or other content between prompts.

## Pre-PR Quality Pipeline

- `git/pre-pr-simplify` — Before creating a PR, run the `/simplify` skill on the changed code to clean up quality, reuse, and efficiency issues.

- `git/pre-pr-architecture-update` — After `/simplify`, run `/architecture-update` to sync architecture docs with code changes. This ensures docs are current before review.

- `git/pre-pr-code-review` — After `/architecture-update`, run `/code-review:code-review` on the PR branch. One of the review subagents MUST analyze the **impact of changes on the rest of the application** — side effects, broken assumptions, things we might not have predicted. Don't comment on the PR — fix issues immediately, then re-run `/code-review:code-review`. Maximum 3 iterations. If issues remain after 3 rounds, stop and present the remaining findings to the user.

- `git/pre-pr-architecture-review` — Alongside `/code-review:code-review`, run `/architecture-review` to verify changes align with documented architecture. Fix any CRITICAL/HIGH findings before creating the PR.

## Protected Branches

- `git/no-commit-main` — Never commit or push directly to `main`. The `protect-branches` hook blocks this automatically. Always work on a feature branch and merge via PR.
