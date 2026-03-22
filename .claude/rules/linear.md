# `linear` — Linear integration conventions

Team: **Blisko**, key: **BLI**

- `linear/ticket-required` — Every PR needs a Linear ticket. Before creating a PR, search for an existing ticket (by branch name, conversation context, or related issues). If none exists, create one based on the conversation and code changes. Always self-assign tickets when picking them up.

- `linear/raw-markdown` — Pass raw markdown with real newlines to `save_issue` description. NOT escaped strings with `\\n`.

- `linear/no-blockquote-numbers` — Don't start lines with `>` followed by text (e.g. `>5 członków`). Linear treats it as blockquote. Use words: "Więcej niż 5".

- `linear/checkbox-syntax` — Checkboxes: `- [ ]` not `\[ \]`.

- `linear/verify-render` — Always check response from `save_issue` to verify markdown rendered correctly.

- `linear/no-attachment-upload` — Don't attach images via `create_attachment` (unreliable for images). Reference HTML mockup file paths in ticket descriptions. Use `create_attachment` only for linking PRs to tickets.

- `linear/self-contained-subtasks` — Every sub-issue must be **fully self-contained**: own acceptance criteria, all implementation info (code snippets, file paths, props, styles) in the description. Never reference parent's criteria or external files from ticket descriptions. Each sub-ticket stands alone — someone reading only it should have everything needed to implement.

- `linear/mention-people` — Always @mention people by name in Linear — never write plain text names, always use `https://linear.app/blisko/profiles/{displayName}` which renders as a clickable mention. Use `list_users` to look up the correct `displayName` if unsure.
